import Lecture from "../models/Lecture.js";
import Quiz from "../models/Quiz.js";
import QuizAttempt from "../models/QuizAttempt.js";

const normalizeAnswer = (answer) => String(answer ?? "").trim().toLowerCase().replace(/\s+/g, " ");

const findOwnedLecture = (lectureId, userId) =>
  Lecture.findOne({ _id: lectureId, user: userId });

// Multiple choice: the chosen option must match the correct option.
// Short answer: the student's text must contain at least half of the keywords
// (so a correct answer in different words is not marked wrong).
export const isCorrect = (question, givenAnswer) => {
  const given = normalizeAnswer(givenAnswer);
  if (!given) return false;

  if (question.type === "short") {
    const keywords = (question.keywords || []).map(normalizeAnswer).filter(Boolean);
    if (keywords.length) {
      const matched = keywords.filter((k) => given.includes(k)).length;
      return matched >= Math.max(1, Math.ceil(keywords.length / 2));
    }
    const expected = normalizeAnswer(question.answer);
    return given === expected || (expected.length > 3 && given.includes(expected));
  }

  return given === normalizeAnswer(question.answer);
};

// GET /api/lectures/:lectureId/quiz
export const getQuiz = async (req, res, next) => {
  try {
    const lecture = await findOwnedLecture(req.params.lectureId, req.userId);
    if (!lecture) {
      return res.status(404).json({ success: false, message: "Lecture not found" });
    }

    const quiz = await Quiz.findOne({ lecture: lecture._id, user: req.userId }).lean();
    if (!quiz) {
      return res.status(404).json({ success: false, message: "Quiz not found" });
    }

    // Never send correct answers, keywords or explanations to the client before grading.
    const questions = quiz.questions.map(({ answer, keywords, explanation, ...question }) => question);

    res.json({ success: true, quiz: { ...quiz, questions } });
  } catch (error) {
    next(error);
  }
};

// POST /api/lectures/:lectureId/quiz-attempts
export const submitQuizAttempt = async (req, res, next) => {
  try {
    const { answers } = req.body;

    if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
      return res.status(400).json({
        success: false,
        message: "Answers must be an object keyed by question ID",
      });
    }

    const lecture = await findOwnedLecture(req.params.lectureId, req.userId);
    if (!lecture) {
      return res.status(404).json({ success: false, message: "Lecture not found" });
    }

    const quiz = await Quiz.findOne({ lecture: lecture._id, user: req.userId });
    if (!quiz) {
      return res.status(404).json({ success: false, message: "Quiz not found" });
    }

    const results = quiz.questions.map((question) => {
      const givenAnswer = String(answers[question._id.toString()] ?? "").trim().slice(0, 1000);
      return {
        questionId: question._id.toString(),
        prompt: question.prompt,
        givenAnswer,
        expectedAnswer: question.answer,
        correct: isCorrect(question, givenAnswer),
        explanation: question.explanation,
      };
    });

    // store only answers that belong to this quiz
    const validIds = new Set(results.map((r) => r.questionId));
    const cleanAnswers = Object.fromEntries(
      Object.entries(answers)
        .filter(([id]) => validIds.has(id))
        .map(([id, value]) => [id, String(value ?? "").slice(0, 1000)])
    );

    const score = results.filter((result) => result.correct).length;
    const attempt = await QuizAttempt.create({
      quiz: quiz._id,
      lecture: lecture._id,
      user: req.userId,
      answers: cleanAnswers,
      score,
      total: quiz.questions.length,
      results,
    });

    res.status(201).json({ success: true, attempt });
  } catch (error) {
    next(error);
  }
};

// GET /api/lectures/:lectureId/quiz-attempts/latest
export const getLatestQuizAttempt = async (req, res, next) => {
  try {
    const lecture = await findOwnedLecture(req.params.lectureId, req.userId);
    if (!lecture) {
      return res.status(404).json({ success: false, message: "Lecture not found" });
    }

    const attempt = await QuizAttempt.findOne({
      lecture: lecture._id,
      user: req.userId,
    }).sort({ createdAt: -1 });

    res.json({ success: true, attempt });
  } catch (error) {
    next(error);
  }
};

