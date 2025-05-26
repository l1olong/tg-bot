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
    
    // Перевіряємо наявність символів "+" та пробілів
    console.log('initData contains "+" symbols:', initData.includes('+'));
    console.log('initData contains spaces:', initData.includes(' '));
    
    // Створюємо два варіанти initData - оригінальний та з заміною пробілів на "+"
    const originalInitData = initData;
    const fixedInitData = initData.replace(/ /g, '+');
    
    console.log('Original initData length:', originalInitData.length);
    console.log('Fixed initData length:', fixedInitData.length);
    
    // Спробуємо обидва варіанти
    const originalResult = validateSingleInitData(originalInitData, botToken);
    const fixedResult = validateSingleInitData(fixedInitData, botToken);
    
    console.log('Original validation result:', originalResult);
    console.log('Fixed validation result:', fixedResult);
    
    // Повертаємо true, якщо хоча б один варіант успішний
    return originalResult || fixedResult;
  } catch (error) {
    console.error('Error validating Telegram data:', error);
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
