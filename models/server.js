require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');
const bot = require('../index');
const Complaint = require('./complaint');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const cors = require('cors');
const tls = require('tls');
const validateTelegramWebAppData = require('../utils/validateTelegramWebAppData');
const { analyzeSubmissionText } = require('../services/geminiService');
const Admin = require('../models/Admin');
const { isAdmin } = require('../utils/authUtils');

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
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));
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

const adminOnlyAuth = async (req, res, next) => { // Додаємо async
  const userId = req.user?.id;
  // Використовуємо await, оскільки isAdmin тепер асинхронна
  if (userId && await isAdmin(userId)) { 
      return next();
  }
  return res.status(403).json({ error: 'Admin access required' });
};

const mainAdminOnlyAuth = (req, res, next) => {
  const userId = req.user?.id;
  // Сувора перевірка: ID користувача має точно співпадати з ID в .env
  if (userId && userId === process.env.ADMIN_ID && userId === process.env.ADMIN_ID2) {
      return next(); // Користувач - головний адмін, продовжуємо
  }
  // Всім іншим, навіть звичайним адмінам, відмовляємо в доступі
  return res.status(403).json({ error: 'Main administrator access required.' });
};

app.get('/api/admins', auth,adminOnlyAuth, async (req, res) => {
  try {
      const admins = await Admin.find().sort({ addedAt: -1 });
      const mainAdminId = process.env.ADMIN_ID && userId === process.env.ADMIN_ID2;

      // Додаємо прапорець, щоб на фронтенді знати, хто є головним адміном
      const adminsWithFlag = admins.map(admin => ({
          ...admin.toObject(),
          isMainAdmin: admin.telegramId === mainAdminId
      }));
      
      res.json(adminsWithFlag);
  } catch (error) {
      console.error('Error fetching admins:', error);
      res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. Додати нового адміністратора
app.post('/api/admins', auth, adminOnlyAuth, async (req, res) => {
  try {
      const { telegramId } = req.body;
      if (!telegramId || !/^\d+$/.test(telegramId)) {
          return res.status(400).json({ error: 'Valid Telegram ID is required.' });
      }

      // Перевіряємо, чи такий адмін вже існує
      const existingAdmin = await Admin.findOne({ telegramId });
      if (existingAdmin) {
          return res.status(409).json({ error: 'This user is already an admin.' });
      }

      // Створюємо нового адміна (ім'я буде додано пізніше)
      const newAdmin = new Admin({ telegramId });
      await newAdmin.save();

      res.status(201).json(newAdmin);
  } catch (error) {
      console.error('Error adding admin:', error);
      res.status(500).json({ error: 'Internal server error' });
  }
});

// 3. Видалити адміністратора
app.delete('/api/admins/:telegramId', auth, mainAdminOnlyAuth, async (req, res) => {
  try {
      const { telegramId } = req.params;
      const mainAdminId = process.env.ADMIN_ID && userId === process.env.ADMIN_ID2;

      // --- ЗАХИСТ: НЕ ДОЗВОЛЯЄМО ВИДАЛИТИ ГОЛОВНОГО АДМІНА ---
      if (telegramId === mainAdminId) {
          return res.status(403).json({ error: 'Cannot delete the main administrator.' });
      }

      const result = await Admin.deleteOne({ telegramId });

      if (result.deletedCount === 0) {
          return res.status(404).json({ error: 'Admin not found.' });
      }

      res.status(200).json({ success: true, message: 'Admin deleted successfully.' });
  } catch (error) {
      console.error('Error deleting admin:', error);
      res.status(500).json({ error: 'Internal server error' });
  }
});

// Маршрут для автентифікації через Telegram WebApp
app.post('/api/auth', async (req, res) => {
  try {
    const { telegramUser, initData } = req.body;
    
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
      } catch (validationError) {
        console.error('Error validating Telegram data:', validationError);
        isValidData = false;
      }
      
      if (!isValidData && process.env.NODE_ENV === 'production') {
        return res.status(401).json({ error: 'Invalid Telegram data' });
      }
    } else {
      if (process.env.NODE_ENV === 'production') {
        return res.status(400).json({ error: 'Missing Telegram initialization data' });
      }
    }
   
    const userId = telegramUser.id.toString();
    const userIsAdmin = await isAdmin(userId);
    const isMainAdmin = userId === process.env.ADMIN_ID && userId === process.env.ADMIN_ID2;
    
    console.log('User role check:', { userId, isAdmin: userIsAdmin });
    
    // Якщо користувач є адміном, оновлюємо/створюємо його запис
    if (userIsAdmin) {
        await Admin.findOneAndUpdate(
            { telegramId: userId },
            { username: telegramUser.username || telegramUser.first_name },
            { upsert: true }
        );
        console.log(`Admin [${userId}] username updated/verified.`);
    }
    
    // Зберігаємо дані користувача в сесії
    req.session.user = {
      id: userId,
      username: telegramUser.username || telegramUser.first_name,
      photo_url: telegramUser.photo_url,
      role: userIsAdmin ? 'admin' : 'user',
      isMainAdmin: isMainAdmin,
      auth_time: new Date().toISOString()
    };
    
    console.log('User saved to session:', { id: userId, role: userIsAdmin ? 'admin' : 'user' });
    
    res.json({
      success: true,
      user: {
        id: userId,
        username: telegramUser.username || telegramUser.first_name,
        photo_url: telegramUser.photo_url,
        role: userIsAdmin ? 'admin' : 'user',
        isMainAdmin: isMainAdmin
      }
    });

  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed', details: error.message });
  }
});

// Маршрут для автентифікації через Telegram WebApp з initData
app.post('/api/auth/telegram', (req, res) => {
  try {
    const { initData, userData } = req.body;
    
    // Логуємо оригінальне тіло запиту
    console.log('Raw request body:', req.rawBody);
    
    console.log('Received auth request with initData and userData:', { 
      initDataLength: initData ? initData.length : 0,
      userData: userData ? { id: userData.id, username: userData.username } : null,
      rawInitData: initData // Логуємо сирий initData для діагностики
    });
    
    if (!initData) {
      console.error('Missing initData in request');
      return res.status(400).json({ error: 'Missing initData' });
    }
    
    // Валідуємо дані Telegram WebApp
    const isValid = validateTelegramWebAppData(initData, process.env.TELEGRAM_TOKEN);
    console.log('Telegram data validation result:', isValid);
    
    // Перевіряємо, чи правильний токен бота
    console.log('TELEGRAM_TOKEN from env (first 5 chars):', 
      process.env.TELEGRAM_TOKEN ? process.env.TELEGRAM_TOKEN.substring(0, 5) + '...' : 'undefined');
    
    // ТИМЧАСОВО ВИМКНЕНО: Не блокуємо запити з невалідним підписом
    // if (!isValid && process.env.NODE_ENV === 'production') {
    //   console.error('Invalid Telegram data signature');
    //   return res.status(401).json({ error: 'Invalid Telegram data' });
    // }
    
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
    const adminId = process.env.ADMIN_ID && userId === process.env.ADMIN_ID2;
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

app.get('/api/complaints/stats', async (req, res) => {
  try {
      // Використовуємо агрегацію MongoDB для ефективного підрахунку
      const stats = await Complaint.aggregate([
          {
              $group: {
                  _id: '$type', // Групуємо документи за полем 'type'
                  count: { $sum: 1 } // Рахуємо кількість документів у кожній групі
              }
          }
      ]);

      // Перетворюємо результат агрегації в простий об'єкт
      const result = {
          complaints: 0,
          suggestions: 0
      };

      stats.forEach(stat => {
          if (stat._id === 'complaint') {
              result.complaints = stat.count;
          } else if (stat._id === 'suggestion') {
              result.suggestions = stat.count;
          }
      });

      console.log('Public stats fetched successfully:', result);
      res.json(result);

  } catch (error) {
      console.error('Error fetching public stats:', error);
      res.status(500).json({ error: 'Internal server error while fetching stats' });
  }
});

// Get complaints
app.get('/api/complaints', auth, async (req, res) => {
  try {
    let query = {};
    
    const requestUserId = req.query.userId || 
                         (req.headers.authorization ? req.headers.authorization.split(' ')[1] : null) || 
                         (req.user && req.user.id);
    
    console.log('Authorization headers:', {
      authHeader: req.headers.authorization,
      token: req.headers.authorization ? req.headers.authorization.split(' ')[1] : null
    });
    
    const userIsAdmin = await isAdmin(requestUserId);
    console.log('User role check for complaints:', { 
      requestUserId: requestUserId, 
      isAdmin: userIsAdmin,
      queryUserId: req.query.userId,
      userFromSession: req.user ? req.user.id : null,
      sessionExists: !!req.session,
      sessionUser: req.session ? req.session.user : null
    });
    
    if (!requestUserId) {
      console.error('No userId found in request');
      return res.status(400).json({ error: 'User ID is required' });
    }
    
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
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Create complaint
app.post('/api/complaints', auth, async (req, res) => {
  try {
    console.log('Received complaint request:', {
      body: req.body,
      user: req.user,
      sessionUser: req.session ? req.session.user : null
    });

    // Отримуємо userId з різних джерел
    const userId = req.body.userId || (req.user ? req.user.id : null);
    
    if (!userId) {
      console.error('No userId found in request');
      return res.status(401).json({ error: 'User ID is required for submission' });
    }

    // --- ПОЧАТОК ІНТЕГРАЦІЇ GEMINI ---

    // 1. Отримуємо текст повідомлення для аналізу
    const messageToAnalyze = req.body.message;
    const subjectToAnalyze = req.body.subject;

    // Перевіряємо, чи є взагалі текст для аналізу
    if (!messageToAnalyze || messageToAnalyze.trim() === '') {
        return res.status(400).json({ error: 'Поле повідомлення не може бути порожнім.' });
    }

    console.log(`[Moderation] Відправка тексту на аналіз Gemini: "${messageToAnalyze}"`);
    const analysisResult = await analyzeSubmissionText(messageToAnalyze, subjectToAnalyze);
    console.log('[Moderation] Результат аналізу Gemini:', analysisResult);

    // 2. Перевіряємо результат модерації від Gemini
    if (!analysisResult.isAppropriate) {
        // Якщо текст неприйнятний, відхиляємо запит і повідомляємо користувача
        // Ми повертаємо статус 400 (Bad Request), що є логічним у даній ситуації
        return res.status(400).json({
            success: false,
            message: "Ваше звернення не пройшло автоматичну модерацію.",
            reason: analysisResult.reason // Пояснення від AI, наприклад: "Текст містить нецензурну лексику."
        });
    }

    // --- КІНЕЦЬ ІНТЕГРАЦІЇ GEMINI ---

    // 3. Якщо модерація пройдена, продовжуємо виконання існуючої логіки
    // Створюємо нову скаргу
    const complaint = new Complaint({
      userId: userId,
      type: req.body.type,
      subject: req.body.subject, 
      message: req.body.message, // Зберігаємо оригінальний, перевірений текст
      contactInfo: req.body.contactInfo || 'Anonymous',
      createdAt: new Date()
    });

    // Зберігаємо скаргу
    const savedComplaint = await complaint.save();
    console.log('Complaint saved successfully after moderation:', {
      id: savedComplaint._id,
      userId: savedComplaint.userId,
      type: savedComplaint.type
    });
    
    // Повідомляємо всіх клієнтів про нову скаргу через WebSockets
    io.emit('newComplaint');

    // Повертаємо успішну відповідь
    res.status(201).json(savedComplaint); // Повертаємо 201 (Created) і сам об'єкт

  } catch (error) {
    console.error('Error creating complaint:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Update complaint (admin only)
app.put('/api/complaints/:id', auth, async (req, res) => {
  try {
    if (!await isAdmin(req.user.id)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found' });
    }    // Оновлюємо статус та зберігаємо відповідь
    complaint.status = 'answered';
    complaint.adminResponse = {
      text: req.body.response,
      date: new Date()
    };

    await complaint.save();
    io.emit('complaintUpdated');

    // Відправляємо повідомлення в Telegram
    try {
      const messageText = `🔔 Ви отримали відповідь на ваше звернення!\n\n📝 Тема: ${complaint.subject}\n\n🔗 Перейдіть у бот, щоб переглянути деталі.`;
      
      await bot.sendMessage(complaint.userId, messageText, {
        parse_mode: 'HTML',
        disable_web_page_preview: true
      });
    } catch (error) {
      console.error('Error sending Telegram notification:', error);
    }

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