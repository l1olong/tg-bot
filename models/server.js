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
    origin: true,
    credentials: true
  }
});

// Basic middleware
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.json());
app.use(cors({
  origin: true,
  credentials: true
}));

// Configure session with MongoDB store
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: 'sessions'
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 7 // 1 week
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

// Authentication middleware
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  req.user = { id: token };
  next();
};

// Check if user is admin
const isAdmin = (userId) => {
  return userId === process.env.ADMIN_ID;
};

// Routes
app.get('/api/user', (req, res) => {
  if (req.session.user) {
    res.json({
      id: req.session.user.id,
      role: isAdmin(req.session.user.id) ? 'admin' : 'user'
    });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

app.post('/api/auth/telegram', (req, res) => {
  const { id, first_name, username, photo_url, auth_date, hash } = req.body;

  // Here you should verify the Telegram auth data
  // For now, we'll just store the user in session
  req.session.user = {
    id: id.toString(),
    username,
    role: isAdmin(id.toString()) ? 'admin' : 'user'
  };

  res.json({ success: true });
});

// Get complaints
app.get('/api/complaints', auth, async (req, res) => {
  try {
    let query = {};

    // If not admin, only show user's own complaints
    if (!isAdmin(req.user.id)) {
      query.userId = req.user.id;
    }

    const complaints = await Complaint.find(query)
      .sort({ createdAt: -1 });

    res.json(complaints);
  } catch (error) {
    console.error('Error fetching complaints:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create complaint
app.post('/api/complaints', auth, async (req, res) => {
  try {
    const complaint = new Complaint({
      userId: req.user.id,
      type: req.body.type,
      message: req.body.message,
      contactInfo: req.body.contactInfo
    });

    await complaint.save();
    io.emit('newComplaint');

    res.json(complaint);
  } catch (error) {
    console.error('Error creating complaint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update complaint (admin only)
app.put('/api/complaints/:id', auth, async (req, res) => {
  try {
    if (!isAdmin(req.user.id)) {
      return res.status(403).json({ error: 'Admin access required' });
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
    io.emit('complaintUpdated');

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
  retryWrites: true,
  w: 'majority',
  maxPoolSize: 10,
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  family: 4
};

// MongoDB connection
mongoose.connection.on('connected', () => console.log('MongoDB connected successfully'));
mongoose.connection.on('error', (err) => console.error('MongoDB connection error:', err));
mongoose.connection.on('disconnected', () => console.log('MongoDB disconnected'));

// Start server
const startServer = async () => {
  try {
    mongoose.set('strictQuery', true);

    await mongoose.connect(process.env.MONGODB_URI, mongooseOptions);

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