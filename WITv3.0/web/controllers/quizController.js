const logger = require('@helpers/logger');
const db = require('@helpers/database');
const trainingManager = require('@helpers/trainingManager');

/**
 * Middleware to validate the token for all quiz routes.
 */
const validateToken = (client) => (req, res, next) => {
    const { token } = req.params;
    const tokenData = client.activeQuizTokens?.get(token);

    if (!tokenData || Date.now() > tokenData.expires) {
        if (client.activeQuizTokens?.has(token)) {
            client.activeQuizTokens.delete(token);
        }
        if (req.path.includes('/api/')) {
            return res.status(403).json({ success: false, message: 'Session expired. Please generate a new link in Discord.' });
        }
        return res.status(403).render('error', { title: 'Link Invalid', message: 'This quiz link is invalid or has expired.' });
    }

    req.tokenData = tokenData;
    next();
};

/**
 * Renders the main quiz page. This page will dynamically show the quiz selection or a specific quiz.
 */
exports.showQuizForm = (client) => [
    validateToken(client),
    async (req, res) => {
        const { user } = req.tokenData;
        try {
            // Get all quizzes
            const allQuizzes = await db.query('SELECT quiz_id, name, category FROM quizzes');

            // Get the user's completed quizzes
            const completedQuizzesResult = await db.query('SELECT quiz_id FROM quiz_completions WHERE discord_id = ?', [user.id]);
            const completedQuizIds = new Set(completedQuizzesResult.map(q => q.quiz_id));

            // Filter out quizzes the user has already passed
            const availableQuizzes = allQuizzes.filter(quiz => !completedQuizIds.has(quiz.quiz_id));

            res.render('quizForm', {
                token: req.params.token,
                userTag: user.tag,
                quizzes: availableQuizzes,
            });
        } catch (error) {
            logger.error(`Error loading quiz form for ${user.tag}:`, error);
            res.status(500).render('error', { title: 'Server Error', message: 'Could not load quiz data.' });
        }
    }
];

/**
 * Fetches the questions and answers for a specific quiz.
 */
exports.getQuizData = (client) => [
    validateToken(client),
    async (req, res) => {
        const { quizId } = req.params;
        try {
            const [quiz] = await db.query('SELECT quiz_id, name, pass_mark_percentage FROM quizzes WHERE quiz_id = ?', [quizId]);
            if (!quiz) {
                return res.status(404).json({ success: false, message: 'Quiz not found.' });
            }

            const questions = await db.query('SELECT question_id, question_text, question_type FROM quiz_questions WHERE quiz_id = ?', [quizId]);
            const questionIds = questions.map(q => q.question_id);

            if (questionIds.length === 0) {
                return res.json({ success: true, quiz, questions: [] });
            }

            const placeholders = questionIds.map(() => '?').join(',');
            const answers = await db.query(`SELECT answer_id, question_id, answer_text, order_index FROM quiz_answers WHERE question_id IN (${placeholders}) ORDER BY order_index ASC`, questionIds);

            questions.forEach(q => {
                q.answers = answers.filter(a => a.question_id === q.question_id);
                for (let i = q.answers.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [q.answers[i], q.answers[j]] = [q.answers[j], q.answers[i]];
                }
            });

            res.json({ success: true, quiz, questions });

        } catch (error) {
            logger.error(`Error fetching quiz data for quizId ${quizId}:`, error);
            res.status(500).json({ success: false, message: 'Failed to fetch quiz data.' });
        }
    }
];

/**
 * Handles the submission of a quiz, grades it, and updates records.
 */
exports.handleQuizSubmission = (client) => [
    validateToken(client),
    async (req, res) => {
        const { user } = req.tokenData;
        const { quizId } = req.params;
        const userAnswers = req.body.answers;

        try {
            const io = req.app.get('io');

            const [quiz] = await db.query('SELECT * FROM quizzes WHERE quiz_id = ?', [quizId]);
            if (!quiz) {
                return res.status(404).json({ success: false, message: 'Quiz not found.' });
            }

            const questions = await db.query('SELECT question_id, question_type FROM quiz_questions WHERE quiz_id = ?', [quizId]);
            const questionIds = questions.map(q => q.question_id);

            if (questionIds.length === 0) {
                return res.json({ success: true, message: 'This quiz has no questions. Marked as complete.', score: 100, passed: true, totalQuestions: 0, correctCount: 0, passMark: quiz.pass_mark_percentage, quizName: quiz.name });
            }

            const placeholders = questionIds.map(() => '?').join(',');
            const correctAnswersFromDb = await db.query(`SELECT question_id, answer_id FROM quiz_answers WHERE question_id IN (${placeholders}) AND is_correct = 1`, questionIds);

            const correctAnswersMap = new Map();
            correctAnswersFromDb.forEach(ans => {
                if (!correctAnswersMap.has(ans.question_id)) {
                    correctAnswersMap.set(ans.question_id, []);
                }
                correctAnswersMap.get(ans.question_id).push(ans.answer_id.toString());
            });

            let correctCount = 0;
            questions.forEach(question => {
                const questionId = question.question_id;
                const questionType = question.question_type;
                const userSubmission = userAnswers[questionId];
                const correctDbAnswers = correctAnswersMap.get(questionId) || [];

                if (questionType === 'multiple') {
                    const submittedAnswers = Array.isArray(userSubmission) ? userSubmission.sort() : [];
                    const correctAnswersSorted = correctDbAnswers.sort();
                    if (submittedAnswers.length === correctAnswersSorted.length && JSON.stringify(submittedAnswers) === JSON.stringify(correctAnswersSorted)) {
                        correctCount++;
                    }
                } else {
                    if (correctDbAnswers.length === 1 && userSubmission === correctDbAnswers[0]) {
                        correctCount++;
                    }
                }
            });

            const totalQuestions = questions.length;
            const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 100;
            const passed = score >= quiz.pass_mark_percentage;

            await db.query(
                'INSERT INTO quiz_attempts (discord_id, quiz_id, score, passed, timestamp) VALUES (?, ?, ?, ?, NOW())',
                [user.id, quizId, score, passed]
            );

            if (passed) {
                await db.query(
                    'INSERT INTO quiz_completions (discord_id, quiz_id, completed_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE completed_at = NOW()',
                    [user.id, quizId]
                );
            }

            const [pilot] = await db.query('SELECT pilot_id FROM commander_training WHERE discord_id = ?', [user.id]);
            if (pilot) {
                const result = await trainingManager.updateLastActive(pilot.pilot_id);
                if (result && result.success && io) {
                    io.emit('training-update');
                }
            }

            res.json({
                success: true,
                score,
                passed,
                totalQuestions,
                correctCount,
                passMark: quiz.pass_mark_percentage,
                quizName: quiz.name
            });

        } catch (error) {
            logger.error(`Error handling quiz submission for quizId ${quizId} by ${user.tag}:`, error);
            res.status(500).json({ success: false, message: 'An internal error occurred while grading your quiz.' });
        }
    }
];

