const crypto = require('crypto');

/**
 * Функція для валідації даних Telegram WebApp
 * @param {string} initData - Рядок ініціалізації з Telegram WebApp
 * @param {string} botToken - Токен Telegram бота
 * @returns {boolean} - Результат валідації
 */
function validateTelegramWebAppData(initData, botToken) {
  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');

    // Видаляємо hash з параметрів
    urlParams.delete('hash');

    // Сортуємо параметри за ключем
    const sortedParams = [...urlParams.entries()].sort(([a], [b]) => a.localeCompare(b));

    // Формуємо dataCheckString без hash
    const dataCheckString = sortedParams.map(([key, value]) => `${key}=${value}`).join('\n');

    // Обчислюємо HMAC
    const secretKey = crypto.createHash('sha256').update(botToken).digest();
    const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    const isValid = hmac === hash;

    console.log('✅ Sorted dataCheckString:\n', dataCheckString);
    console.log('✅ Generated HMAC:', hmac);
    console.log('✅ Received hash:', hash);
    console.log('✅ Validation result:', isValid);

    return isValid;
  } catch (err) {
    console.error('❌ Error validating Telegram WebApp data:', err);
    return false;
  }
}

/**
 * Допоміжна функція для валідації одного варіанту initData
 * @param {string} initData - Рядок ініціалізації з Telegram WebApp
 * @param {string} botToken - Токен Telegram бота
 * @returns {boolean} - Результат валідації
 */
function validateSingleInitData(initData, botToken) {
    try {
      const urlParams = new URLSearchParams(initData);
      const hash = urlParams.get('hash');
  
      if (!hash) {
        console.error('No hash found in initData');
        return false;
      }
  
      urlParams.delete('hash');
  
      // Отримуємо всі пари ключ-значення
      const sortedParams = Array.from(urlParams.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n'); // не додаємо signature сюди!
  
      console.log('Data string for validation:', sortedParams);
  
      const secretKey = crypto.createHash('sha256')
        .update(botToken)
        .digest();
  
      const hmac = crypto.createHmac('sha256', secretKey)
        .update(sortedParams)
        .digest('hex');
  
      console.log('Generated HMAC:', hmac);
      console.log('Received hash:', hash);
  
      return hmac === hash;
    } catch (error) {
      console.error('Error in validateSingleInitData:', error);
      return false;
    }
  }  
  
module.exports = validateTelegramWebAppData;