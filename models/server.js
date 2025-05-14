const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');
const Complaint = require('./complaint');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const cors = require('cors');
const crypto = require('crypto');
const tls = require('tls');

// Force TLS 1.2
tls.DEFAULT_MIN_VERSION = 'TLSv1.2';

// Initialize express and create HTTP server
const app = express();
const server = http.createServer(app);

// Configure Socket.IO
const io = socketIo(server, {
  cors: {
    origin: process.env.WEBAPP_URL || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }
});

// Basic middleware
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.json());
app.use(cors({ 
  origin: process.env.WEBAPP_URL || '*', 
  credentials: true 
}));

// Configure session with MongoDB store
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    ttl: 24 * 60 * 60, // Session TTL (1 day)
    crypto: {
      secret: process.env.SESSION_SECRET || 'your-secret-key'
    },
    autoRemove: 'native',
    mongoOptions: {
      serverApi: {
        version: '1',
        strict: true,
        deprecationErrors: true
      }
    }
  }),
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000 // Cookie max age (1 day)
  }
}));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS,POST,PUT,DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Access-Control-Allow-Headers, Origin, Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers');
  next();
});

// Telegram auth check function
function checkTelegramAuthorization(data) {
  const botToken = process.env.TELEGRAM_TOKEN.split(':')[1];
  const secret = crypto.createHash('sha256')
    .update(botToken)
    .digest();

  const checkString = Object.keys(data)
    .filter(key => key !== 'hash')
    .sort()
    .map(key => `${key}=${data[key]}`)
    .join('\n');

  const hash = crypto.createHmac('sha256', secret)
    .update(checkString)
    .digest('hex');

  return hash === data.hash && Math.floor(Date.now() / 1000) - data.auth_date < 86400;
}

// Authentication middleware
const auth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Login route
app.post('/api/login', (req, res) => {
  const userData = req.body;
  
  if (!checkTelegramAuthorization(userData)) {
    return res.status(401).json({ error: 'Invalid authorization' });
  }

  req.session.userId = userData.userId;
  req.session.username = userData.username;
  req.session.firstName = userData.firstName;
  req.session.userRole = userData.userId === process.env.ADMIN_ID ? 'admin' : 'user';
  
  res.json({ 
    role: req.session.userRole,
    userId: req.session.userId,
    username: req.session.username,
    firstName: req.session.firstName
  });
});

// Get current user
app.get('/api/user', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  
  res.json({
    id: req.session.userId,
    username: req.session.username,
    firstName: req.session.firstName,
    role: req.session.userRole
  });
});

// Logout route
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ message: 'Logged out' });
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const isMongoConnected = mongoose.connection.readyState === 1;
    if (!isMongoConnected) {
      throw new Error('MongoDB is not connected');
    }
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      mongoStatus: 'connected'
    });
  } catch (error) {
    console.error('Healthcheck failed:', error);
    res.status(503).json({ status: 'error', message: error.message });
  }
});

// Basic routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Get complaints - filtered by user role
app.get('/api/complaints', auth, async (req, res) => {
  try {
    let complaints;
    if (req.session.userRole === 'admin') {
      complaints = await Complaint.find().sort({ createdAt: -1 });
    } else {
      complaints = await Complaint.find({ 
        userId: req.session.userId 
      }).sort({ createdAt: -1 });
    }
    
    res.json(complaints.map(complaint => ({
      id: complaint._id,
      type: complaint.type,
      message: complaint.message,
      contactInfo: complaint.contactInfo,
      status: complaint.status,
      date: complaint.createdAt,
      adminResponse: complaint.adminResponse
    })));
  } catch (error) {
    console.error('Error getting complaints:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Submit complaint
app.post('/api/complaints', auth, async (req, res) => {
  try {
    const complaint = new Complaint({
      userId: req.session.userId,
      userRole: req.session.userRole,
      type: req.body.type,
      message: req.body.message,
      contactInfo: req.session.username || req.session.firstName || 'Anonymous user',
      status: 'new'
    });
    
    await complaint.save();
    io.emit('newComplaint', complaint);
    res.status(201).json(complaint);
  } catch (error) {
    console.error('Error saving complaint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin response to complaint
app.put('/api/complaints/:id/respond', auth, async (req, res) => {
  try {
    if (req.session.userRole !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found' });
    }
    
    complaint.status = 'answered';
    complaint.adminResponse = {
      text: req.body.response,
      date: new Date()
    };
    
    await complaint.save();
    io.emit('complaintUpdated', complaint);
    res.json(complaint);
  } catch (error) {
    console.error('Error updating complaint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('Client connected');
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Error handlers
app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(500).json({ 
    status: 'error',
    message: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message
  });
});

app.use((req, res) => {
  res.status(404).json({ status: 'error', message: 'Not Found' });
});

// MongoDB connection options
const mongooseOptions = {
  serverApi: {
    version: '1',
    strict: true,
    deprecationErrors: true
  },
  tls: true,
  tlsAllowInvalidCertificates: false,
  tlsAllowInvalidHostnames: false,
  minPoolSize: 5,
  maxPoolSize: 10,
  ssl: true,
  sslValidate: true
};

// MongoDB connection
mongoose.connection.on('connected', () => console.log('MongoDB connected successfully'));
mongoose.connection.on('error', (err) => console.error('MongoDB connection error:', err));
mongoose.connection.on('disconnected', () => console.log('MongoDB disconnected'));

// Start server
const startServer = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      ssl: true
    });
    
    const PORT = process.env.PORT || 3001;
    const HOST = '0.0.0.0';

    server.listen(PORT, HOST, () => {
      console.log(`Server running on ${HOST}:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = { updateClients: () => io.emit('update') };