const mongoose = require('mongoose');
const Complaint = require('../models/complaint');
const messages = require('./messages');
const crypto = require('crypto');
const ADMIN_ID = process.env.ADMIN_ID;

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

// Функція для валідації даних Telegram WebApp
/*function validateTelegramWebAppData(initData, botToken) {
  // Розділяємо initData на параметри та хеш
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  params.delete('hash');
  
  // Сортуємо параметри в алфавітному порядку
  const paramsSorted = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  
  // Створюємо HMAC-SHA256 хеш з використанням botToken
  const secretKey = crypto.createHash('sha256')
    .update(botToken)
    .digest();
  
  const calculatedHash = crypto.createHmac('sha256', secretKey)
    .update(paramsSorted)
    .digest('hex');
  
  // Порівнюємо обчислений хеш з отриманим
  return calculatedHash === hash;
}*/

// Функція для перевірки, чи є користувач адміністратором
function isAdmin(userId) {
  return userId && (userId.toString() === ADMIN_ID || userId === ADMIN_ID);
}

module.exports = {
  getMainKeyboard,
  /*validateTelegramWebAppData,
  isAdmin*/
};