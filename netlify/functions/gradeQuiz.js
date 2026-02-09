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
    const data = JSON.parse(event.body);
    const { quizTitle, questions, studentAnswers } = data;

    // 3. Reconstruct the Prompt (Moved from App.jsx)
    const prompt = `
      You are a math teacher grading a quiz.
      Quiz Title: ${quizTitle}

      Questions & Student Answers:
      ${questions.map(q => `
        [ID: "${q.id}"]
        Question: ${q.text}
        Student Answer: ${studentAnswers[q.id] || "No answer provided"}
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
    const configuredModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const modelCandidates = [...new Set([
      configuredModel,
      "gemini-flash-latest",
      "gemini-2.0-flash",
    ])];

    let text = "";
    let usedModel = "";
    let lastError = null;

    for (const modelName of modelCandidates) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
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
