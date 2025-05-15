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
  // Allow public access to view complaints
  if (req.method === 'GET' && req.path === '/api/complaints') {
    return next();
  }

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
app.get('/api/complaints', async (req, res) => {
  try {
    let query = {};
    // If user is authenticated and not admin, only show their complaints
    if (req.user && !isAdmin(req.user.id)) {
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

// MongoDB connection
mongoose.set('strictQuery', false);

async function connectToDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000
    });
    console.log('Connected to MongoDB successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    // Don't exit the process, allow for retry
    return false;
  }
  return true;
}

// Retry connection if it fails
async function startServer() {
  let isConnected = false;
  while (!isConnected) {
    isConnected = await connectToDatabase();
    if (!isConnected) {
      console.log('Retrying connection in 5 seconds...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  const PORT = process.env.PORT || 3001;
  const HOST = '0.0.0.0';

  server.listen(PORT, HOST, () => {
    console.log(`Server running on ${HOST}:${PORT}`);
  });
}

startServer();

module.exports = { updateClients: () => io.emit('update') };