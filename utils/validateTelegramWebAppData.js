const crypto = require('crypto');

/**
 * Функція для валідації даних Telegram WebApp
 * @param {string} initData - Рядок ініціалізації з Telegram WebApp
 * @param {string} botToken - Токен Telegram бота
 * @returns {boolean} - Результат валідації
 */
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

module.exports = validateTelegramWebAppData;
