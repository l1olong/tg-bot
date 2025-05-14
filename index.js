require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { handleComplaint, handleSuggestion, adminInterface, handleFAQ, deleteComplaint, getMainKeyboard } = require('./controllers/controllers');

// Create the bot instance
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// Handle language selection
let userLanguages = new Map();

// Command handlers
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const lang = userLanguages.get(chatId) || 'ua';
    bot.sendMessage(
        chatId,
        lang === 'ua' ? 'Вітаємо! Оберіть дію:' : 'Welcome! Choose an action:',
        getMainKeyboard(lang)
    );
});

// Message handlers
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const lang = userLanguages.get(chatId) || 'ua';
    const text = msg.text;

    if (!text) return;

    switch (text) {
        case 'Надіслати скаргу':
        case 'Submit a Complaint':
            await handleComplaint(bot, msg, lang);
            break;

        case 'Надіслати пропозицію':
        case 'Submit a Suggestion':
            await handleSuggestion(bot, msg, lang);
            break;

        case 'Адмінка':
        case 'Admin Panel':
            await adminInterface(bot, msg, lang);
            break;

        case 'FAQ':
            await handleFAQ(bot, msg, lang);
            break;

        case 'Видалити звернення':
        case 'Delete a Submission':
            await deleteComplaint(bot, msg, lang);
            break;

        case 'Оберіть мову':
        case 'Choose language':
            bot.sendMessage(chatId, 'Choose your language / Оберіть мову:', {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '🇺🇦 Українська', callback_data: 'lang_ua' },
                            { text: '🇺🇸 English', callback_data: 'lang_en' }
                        ]
                    ]
                }
            });
            break;
    }
});

// Handle language selection callbacks
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data.startsWith('lang_')) {
        const lang = data.split('_')[1];
        userLanguages.set(chatId, lang);
        bot.answerCallbackQuery(query.id);
        bot.sendMessage(
            chatId,
            lang === 'ua' ? 'Мову змінено на українську' : 'Language changed to English',
            getMainKeyboard(lang)
        );
    }
});

// Initialize web server
require('./models/server');