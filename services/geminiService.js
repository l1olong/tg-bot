const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is not set in environment variables.");
}

const API_KEY = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(API_KEY);

const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash-latest",
  safetySettings,
  generationConfig: {
    responseMimeType: "application/json",
  },
});

/**
 * Аналізує текст звернення на доречність та відповідність правилам.
 * @param {string} submissionText - Текст, надісланий користувачем.
 * @returns {Promise<{isAppropriate: boolean, reason: string}>} - Об'єкт з результатом аналізу.
 */
async function analyzeSubmissionText(submissionText) {
  const prompt = `
    Ти — автоматичний модератор контенту для освітнього закладу. Твоє завдання — аналізувати текст звернення (скарги чи пропозиції) від студентів.
    Текст може бути написаний українською або англійською мовою.

    Правила аналізу:
    1. Звернення НЕприйнятне, якщо воно містить: нецензурну лексику, лайку, образи, погрози, мову ворожнечі або будь-який інший відверто неприйнятний контент.
    2. В усіх інших випадках звернення є прийнятним, навіть якщо воно емоційне або різко критичне. Критика — це нормально.

    Проаналізуй наступний текст: "${submissionText}"

    Поверни свою відповідь ТІЛЬКИ у форматі JSON з такою структурою:
    {
      "isAppropriate": boolean, // true, якщо текст прийнятний, інакше false
      "reason": "string" // Пояснення тією мовою яким був наданий текст, чому текст неприйнятний. Якщо текст прийнятний, залиш це поле порожнім "".
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
    // Політика безпеки: якщо AI не спрацював, краще пропустити звернення,
    // ніж помилково заблокувати користувача.
    return {
      isAppropriate: true,
      reason: "Помилка автоматичної модерації. Звернення пропущено без перевірки."
    };
  }
}

module.exports = { analyzeSubmissionText };