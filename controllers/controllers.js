const mongoose = require('mongoose');
const Complaint = require('../models/complaint');
const messages = require('./messages');
const crypto = require('crypto');
const ADMIN_ID = process.env.ADMIN_ID && userId === process.env.ADMIN_ID2;

// Функція для отримання клавіатури з веб-додатком
function getMainKeyboard(lang) {
  const webAppUrl = process.env.WEBAPP_URL || 'https://tg-bot-aabw.onrender.com';
  return {
    reply_markup: {
      keyboard: [
        [{ 
          text: lang === 'ua' ? '🌐 Відкрити веб-портал' : '🌐 Open Web Portal',
          web_app: { url: webAppUrl }
        }]
      ],
      resize_keyboard: true
    }
  };
}

module.exports = {
  getMainKeyboard,
};