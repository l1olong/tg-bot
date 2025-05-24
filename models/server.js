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
const { validateTelegramWebAppData, isAdmin } = require('../controllers/controllers');

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
  // Дозволяємо публічний доступ до перегляду скарг
  if (req.method === 'GET' && req.path === '/api/complaints') {
    return next();
  }

  // Перевіряємо авторизацію через заголовок або сесію
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    req.user = { id: token };
    return next();
  } else if (req.session.user) {
    req.user = req.session.user;
    return next();
  }
  
  // Якщо користувач не авторизований, повертаємо помилку
  return res.status(401).json({ error: 'Authentication required' });
};

// Маршрут для автентифікації через Telegram WebApp
app.post('/api/auth', (req, res) => {
  try {
    const { telegramUser, initData } = req.body;
    
    console.log('Received auth request:', { 
      telegramUser: telegramUser ? { 
        id: telegramUser.id, 
        username: telegramUser.username || telegramUser.first_name 
      } : null,
      initDataLength: initData ? initData.length : 0
    });
    
    // Перевіряємо наявність даних користувача
    if (!telegramUser || !telegramUser.id) {
      console.error('Missing or invalid telegramUser in request');
      return res.status(400).json({ error: 'Missing or invalid user data' });
    }
    
    // Валідуємо дані Telegram WebApp, якщо вони є
    let isValidData = true;
    if (initData) {
      try {
        isValidData = validateTelegramWebAppData(initData, process.env.TELEGRAM_TOKEN);
        console.log('Telegram data validation result:', isValidData);
      } catch (validationError) {
        console.error('Error validating Telegram data:', validationError);
        isValidData = false;
      }
      
      // У виробничому середовищі вимагаємо валідні дані
      // У розробці дозволяємо тестування без валідації
      if (!isValidData && process.env.NODE_ENV === 'production') {
        console.error('Invalid Telegram data signature');
        return res.status(401).json({ error: 'Invalid Telegram data' });
      }
    } else {
      console.warn('No initData provided, skipping validation');
      // У виробничому середовищі вимагаємо initData
      if (process.env.NODE_ENV === 'production') {
        console.error('Missing initData in production environment');
        return res.status(400).json({ error: 'Missing Telegram initialization data' });
      }
    }
    
    const userId = telegramUser.id.toString();
    
    // Перевіряємо, чи є користувач адміністратором
    const adminId = process.env.ADMIN_ID;
    const userIsAdmin = isAdmin(userId);
    
    console.log('User role check:', { 
      userId: userId, 
      adminId: adminId,
      isAdmin: userIsAdmin
    });
    
    // Зберігаємо дані користувача в сесії
    req.session.user = {
      id: userId,
      username: telegramUser.username || telegramUser.first_name,
      photo_url: telegramUser.photo_url,
      role: userIsAdmin ? 'admin' : 'user',
      auth_time: new Date().toISOString()
    };
    
    console.log('User saved to session:', {
      id: userId,
      username: telegramUser.username || telegramUser.first_name,
      role: userIsAdmin ? 'admin' : 'user'
    });
    
    res.json({
      success: true,
      user: {
        id: userId,
        username: telegramUser.username || telegramUser.first_name,
        photo_url: telegramUser.photo_url,
        role: userIsAdmin ? 'admin' : 'user'
      }
    });
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed', details: error.message });
  }
});

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
  try {
    const { initData, userData } = req.body;
    
    console.log('Received auth request with initData and userData:', { 
      initDataLength: initData ? initData.length : 0,
      userData: userData ? { id: userData.id, username: userData.username } : null
    });
    
    if (!initData) {
      console.error('Missing initData in request');
      return res.status(400).json({ error: 'Missing initData' });
    }
    
    // Валідуємо дані Telegram WebApp
    /*const isValid = validateTelegramWebAppData(initData, process.env.TELEGRAM_TOKEN);
    console.log('Telegram data validation result:', isValid);
    
    if (!isValid && process.env.NODE_ENV === 'production') {
      console.error('Invalid Telegram data signature');
      return res.status(401).json({ error: 'Invalid Telegram data' });
    }*/
    
    // Парсимо дані користувача з initData
    const params = new URLSearchParams(initData);
    const userDataStr = params.get('user');
    
    if (!userDataStr && !userData) {
      console.error('User data not found in initData and no userData provided');
      return res.status(400).json({ error: 'User data not found' });
    }
    
    // Використовуємо дані з initData або з userData (запасний варіант)
    let user;
    if (userDataStr) {
      user = JSON.parse(userDataStr);
      console.log('Using user data from initData:', { id: user.id, username: user.username });
    } else {
      user = userData;
      console.log('Using fallback user data:', { id: user.id, username: user.username });
    }
    
    const userId = user.id.toString();
    
    // Перевіряємо, чи є користувач адміністратором
    const adminId = process.env.ADMIN_ID;
    const userIsAdmin = isAdmin(userId);
    
    console.log('User role check:', { 
      userId: userId, 
      adminId: adminId,
      isAdmin: userIsAdmin
    });
    
    // Зберігаємо дані користувача в сесії
    req.session.user = {
      id: userId,
      username: user.username || user.first_name,
      photo_url: user.photo_url,
      role: userIsAdmin ? 'admin' : 'user'
    };
    
    console.log('User saved to session:', {
      id: userId,
      username: user.username || user.first_name,
      role: userIsAdmin ? 'admin' : 'user'
    });
    
    res.json({
      success: true,
      user: {
        id: userId,
        username: user.username || user.first_name,
        photo_url: user.photo_url,
        role: userIsAdmin ? 'admin' : 'user'
      }
    });
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed', details: error.message });
  }
});

// Get complaints
app.get('/api/complaints', auth, async (req, res) => {
  try {
    let query = {};
    
    // Отримуємо userId з параметрів запиту або з об'єкта користувача
    const requestUserId = req.query.userId || (req.user && req.user.id);
    
    // Перевіряємо роль користувача
    const userIsAdmin = isAdmin(requestUserId);
    console.log('User role check for complaints:', { 
      requestUserId: requestUserId, 
      isAdmin: userIsAdmin,
      queryUserId: req.query.userId,
      userFromSession: req.user ? req.user.id : null
    });
    
    // Якщо користувач не адмін, показуємо тільки його звернення
    if (!userIsAdmin) {
      query.userId = requestUserId;
      console.log('Filtering complaints for user:', requestUserId);
    } else {
      console.log('Admin user, showing all complaints');
    }

    const complaints = await Complaint.find(query)
      .sort({ createdAt: -1 });
    
    console.log(`Found ${complaints.length} complaints for user`);
    
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

// Функція для валідації даних Telegram WebApp
function validateTelegramWebAppData(initData, botToken) {
  try {
    console.log('Validating Telegram WebApp data...');
    
    if (!initData) {
      console.error('No initData provided for validation');
      return false;
    }
    
    if (!botToken) {
      console.error('No bot token provided for validation');
      return false;
    }
    
    // Розбираємо initData як query string
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    
    if (!hash) {
      console.error('No hash found in initData');
      return false;
    }
    
    // Видаляємо hash з параметрів для перевірки
    urlParams.delete('hash');
    
    // Сортуємо параметри за ключем
    const params = Array.from(urlParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    console.log('Data string for validation:', params);
    
    // Створюємо HMAC-SHA-256 хеш
    const crypto = require('crypto');
    const secretKey = crypto.createHash('sha256')
      .update(botToken)
      .digest();
    
    const hmac = crypto.createHmac('sha256', secretKey)
      .update(params)
      .digest('hex');
    
    console.log('Generated HMAC:', hmac);
    console.log('Received hash:', hash);
    
    // Порівнюємо отриманий хеш з переданим
    const isValid = hmac === hash;
    console.log('Validation result:', isValid);
    
    return isValid;
  } catch (error) {
    console.error('Error validating Telegram data:', error);
    return false;
  }
}