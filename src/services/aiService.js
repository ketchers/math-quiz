export const gradeSubmission = async (quiz, answers) => {
  try {
    const response = await fetch('/.netlify/functions/gradeQuiz', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        quizTitle: quiz.title,
        questions: quiz.questions,
        studentAnswers: answers
      }),
    });

    if (!response.ok) {
      throw new Error(`Server Error: ${response.status}`);
    }

    const data = await response.json();
    return data; // Returns the JSON grade object directly

  } catch (error) {
    console.error("Grading Service Error:", error);
    alert("Grading failed. Please try again or contact the instructor.");
    return null;
  }
};