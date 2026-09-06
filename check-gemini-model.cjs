const { GoogleGenerativeAI } = require('@google/generative-ai');

(async () => {
  const key = process.env.GEMINI_API_KEY;
  const modelNames = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-latest'];

  for (const modelName of modelNames) {
    try {
      const genAI = new GoogleGenerativeAI(key);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent('Say hello in one word');
      const text = await result.response.text();
      console.log('MODEL_OK', modelName, text.trim());
      process.exit(0);
    } catch (err) {
      console.log('MODEL_FAIL', modelName, (err && err.message) || String(err));
    }
  }

  process.exit(1);
})();
