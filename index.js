require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const webAppUrl = process.env.WEBAPP_URL || 'https://tg-bot-aabw.onrender.com';
    
    bot.sendMessage(
        chatId,
        'Вітаємо! Використовуйте веб-інтерфейс для роботи з системою:',
        {
            reply_markup: {
                keyboard: [
                    [{ 
                        text: '🌐 Відкрити веб-портал',
                        web_app: { url: webAppUrl }
                    }]
                ],
                resize_keyboard: true
            }
        }
    );
});

console.log('Bot started in minimal mode (web app only)');

require('./models/server');