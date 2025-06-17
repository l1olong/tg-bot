const Admin = require('../models/Admin');

/**
 * Асинхронно перевіряє, чи є користувач адміністратором.
 * Перевіряє спочатку головного адміна з .env, а потім - колекцію Admins в базі даних.
 * @param {string} userId - Telegram ID користувача для перевірки.
 * @returns {Promise<boolean>} - Повертає true, якщо користувач є адміном, інакше false.
 */
async function isAdmin(userId) {
    // --- ДОДАНО ЛОГУВАННЯ ДЛЯ ДІАГНОСТИКИ ---
    if (!userId) {
        console.log('[isAdmin Check] Перевірка провалена: userId не надано.');
        return false;
    }

    console.log(`[isAdmin Check] Початок перевірки для userId: '${userId}'`);

    // 1. Перевіряємо, чи це головний адмін з файлу .env
    if (userId === process.env.ADMIN_ID) {
        console.log(`[isAdmin Check] Успіх: Користувач '${userId}' є головним адміністратором з .env.`);
        return true;
    }

    // 2. Якщо ні, шукаємо користувача в колекції Admins у базі даних
    try {
        console.log(`[isAdmin Check] Перевірка бази даних для telegramId: '${userId}'`);
        const adminInDb = await Admin.findOne({ telegramId: userId });
        
        if (adminInDb) {
            console.log(`[isAdmin Check] Успіх: Знайдено адміністратора в базі даних для userId '${userId}'.`);
            return true; // Користувач є адміном
        } else {
            console.log(`[isAdmin Check] Інфо: Не знайдено адміністратора в базі даних для userId '${userId}'. Користувач не є адміном.`);
            return false; // Користувач не є адміном
        }
    } catch (error) {
        console.error('[isAdmin Check] КРИТИЧНА ПОМИЛКА: Не вдалося перевірити статус адміна в базі даних:', error);
        return false; // У разі помилки вважаємо, що не адмін
    }
}

module.exports = { isAdmin };