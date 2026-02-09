const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.handler = async function(event, context) {
  // 1. Security Check: Ensure the key exists in the environment
  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) {
    console.error("Server Error: GEMINI_API_KEY is missing.");
    return { statusCode: 500, body: JSON.stringify({ error: "Server Configuration Error" }) };
  }

  // 2. Parse the incoming data from the frontend
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const startedAt = Date.now();
    const data = JSON.parse(event.body);
    const { quizTitle, questions, studentAnswers } = data;
    const safeQuestions = Array.isArray(questions) ? questions.slice(0, 20) : [];
    const truncate = (value, max = 1200) => {
      const text = String(value || "");
      return text.length > max ? `${text.slice(0, max)}...` : text;
    };

    // 3. Reconstruct the Prompt (Moved from App.jsx)
    const prompt = `
      You are a math teacher grading a quiz.
      Quiz Title: ${truncate(quizTitle, 200)}

      Questions & Student Answers:
      ${safeQuestions.map(q => `
        [ID: "${q.id}"]
        Question: ${truncate(q.text, 1200)}
        Student Answer: ${truncate(studentAnswers[q.id] || "No answer provided", 1200)}
      `).join('\n----------------\n')}

      INSTRUCTIONS:
      1. Check if the math is correct. Implicit multiplication and LaTeX variations are allowed.
      2. If answer is blank/empty, it is incorrect.
      3. Return ONLY valid JSON. The keys MUST match the Question IDs exactly.
      
      Structure:
      {
        "evaluations": {
          "QUESTION_ID": { "isCorrect": boolean, "feedback": "Brief feedback string" }
        }
      }
    `;

    // 4. Call Google Gemini
    const genAI = new GoogleGenerativeAI(API_KEY);
    const configuredModel = process.env.GEMINI_MODEL || "gemini-2.0-flash-lite";
    const modelCandidates = [...new Set([
      configuredModel,
      "gemini-2.0-flash",
    ])];
    const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 7000);
    const withTimeout = async (promise, timeoutMs, label) => {
      let timeoutHandle;
      try {
        return await Promise.race([
          promise,
          new Promise((_, reject) => {
            timeoutHandle = setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms (${label})`)), timeoutMs);
          }),
        ]);
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      }
    };

    let text = "";
    let usedModel = "";
    let lastError = null;

    for (const modelName of modelCandidates) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1200,
            responseMimeType: "application/json",
          },
        });
        const result = await withTimeout(model.generateContent(prompt), GEMINI_TIMEOUT_MS, `model ${modelName}`);
        const response = await result.response;
        text = response.text();
        usedModel = modelName;
        break;
      } catch (modelError) {
        lastError = modelError;
        const message = String(modelError?.message || "");
        const status = modelError?.status || modelError?.code || "";
        const isNotFound = status === 404 || message.includes("404") || message.toLowerCase().includes("not found");
        console.error(`Gemini model failed: ${modelName}`, modelError);
        if (!isNotFound) {
          throw modelError;
        }
      }
    }

    if (!text) {
      throw new Error(`All model candidates failed. Last error: ${lastError?.message || "Unknown Gemini error"}`);
    }

    // 5. Clean up JSON (using your helper logic)
    const cleanJson = (text) => {
      let clean = text.replace(/```json|```/g, '');
      const firstOpen = clean.indexOf('{');
      const lastClose = clean.lastIndexOf('}');
      if (firstOpen !== -1 && lastClose !== -1) {
          return JSON.parse(clean.substring(firstOpen, lastClose + 1));
      }
      return null;
    };

    const parsedData = cleanJson(text);
    if (!parsedData || !parsedData.evaluations) {
      throw new Error(`Gemini returned non-JSON or unexpected JSON shape (model: ${usedModel}).`);
    }

    // 6. Return ONLY the grade to the frontend
    console.log(`AI grading success with ${usedModel} in ${Date.now() - startedAt}ms`);
    return {
      statusCode: 200,
      body: JSON.stringify(parsedData),
    };

  } catch (error) {
    console.error("AI Grading Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || "Unknown AI grading error" }),
    };
  }
};
