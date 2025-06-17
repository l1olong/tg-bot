const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

// Ініціалізація залишається без змін
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  throw new Error("GEMINI_API_KEY is not set in environment variables.");
}
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash-latest",
  safetySettings: [ /* ... налаштування безпеки ... */ ],
  generationConfig: {
    responseMimeType: "application/json",
  },
});


/**
 * Аналізує тему та повідомлення звернення на доречність.
 * @param {string} subject - Тема звернення.
 * @param {string} message - Основний текст звернення.
 * @returns {Promise<{isAppropriate: boolean, reason: string}>} - Об'єкт з результатом аналізу.
 */
async function analyzeSubmissionText(subject, message) {
  // Об'єднуємо тему та повідомлення для комплексного аналізу одним запитом.
  const combinedText = `Тема: ${subject}\n\nПовідомлення: ${message}`;

  // Оновлюємо промт, щоб AI чітко розумів, що потрібно перевіряти обидві частини.
  const prompt = `
    Ти — автоматичний модератор контенту для освітнього закладу. Твоє завдання — аналізувати текст звернення, який складається з теми та основного повідомлення.
    Текст може бути написаний українською або англійською мовою.

    Правила аналізу:
    1. Звернення НЕприйнятне, якщо БУДЬ-ЯКА його частина (тема або повідомлення) містить: нецензурну лексику, лайку, образи, погрози, мову ворожнечі або будь-який інший відверто неприйнятний контент.
    2. В усіх інших випадках звернення є прийнятним, навіть якщо воно емоційне або різко критичне. Критика — це нормально.

    Проаналізуй наступний текст:
    ---
    ${combinedText}
    ---

    Поверни свою відповідь ТІЛЬКИ у форматі JSON з такою структурою:
    {
      "isAppropriate": boolean, // true, якщо текст прийнятний, інакше false
      "reason": "string" // Пояснення українською мовою, чому текст неприйнятний. Якщо текст прийнятний, залиш це поле порожнім "".
    }
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const analysis = JSON.parse(response.text());
    
    if (typeof analysis.isAppropriate !== 'boolean') {
        throw new Error("AI response did not contain 'isAppropriate' boolean field.");
    }
    return analysis;

  } catch (error) {
    console.error("Error during Gemini analysis:", error);
    // Політика безпеки: у разі помилки пропускаємо звернення, щоб не блокувати користувача.
    return {
      isAppropriate: true,
      reason: "Помилка автоматичної модерації. Звернення пропущено без перевірки."
    };
  }
}

// Експортуємо оновлену функцію
module.exports = { analyzeSubmissionText };