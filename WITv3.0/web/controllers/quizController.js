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
        // Differentiate between API calls and page loads for error response
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
            const allQuizzes = await db.query('SELECT quiz_id, name, update_field FROM quizzes');

            // Get the user's training record
            const [pilotRecord] = await db.query('SELECT * FROM commander_training WHERE discord_id = ?', [user.id]);

            // Filter out quizzes the user has already passed
            const availableQuizzes = allQuizzes.filter(quiz => {
                // If there's no pilot record or the specific quiz field is not marked as passed (true/1)
                return !pilotRecord || !pilotRecord[quiz.update_field];
            });

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

            const questions = await db.query('SELECT question_id, question_text FROM quiz_questions WHERE quiz_id = ?', [quizId]);
            const questionIds = questions.map(q => q.question_id);

            if (questionIds.length === 0) {
                return res.json({ success: true, quiz, questions: [] });
            }

            const answers = await db.query(`SELECT answer_id, question_id, answer_text FROM quiz_answers WHERE question_id IN (${questionIds.join(',')})`);

            // Attach answers to their respective questions and shuffle them
            questions.forEach(q => {
                q.answers = answers.filter(a => a.question_id === q.question_id);
                // Shuffle answers
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
        const userAnswers = req.body.answers; // Expects an object like { questionId: answerId, ... }

        try {
            const [quiz] = await db.query('SELECT * FROM quizzes WHERE quiz_id = ?', [quizId]);
            if (!quiz) {
                return res.status(404).json({ success: false, message: 'Quiz not found.' });
            }

            const questions = await db.query('SELECT question_id FROM quiz_questions WHERE quiz_id = ?', [quizId]);
            const questionIds = questions.map(q => q.question_id);

            if (questionIds.length === 0) {
                return res.json({ success: true, message: 'This quiz has no questions. Marked as complete.', score: 100, passed: true });
            }

            const correctAnswers = await db.query(`SELECT question_id, answer_id FROM quiz_answers WHERE question_id IN (${questionIds.join(',')}) AND is_correct = 1`);

            let correctCount = 0;
            correctAnswers.forEach(correctAnswer => {
                const userAnswerId = userAnswers[correctAnswer.question_id];
                if (userAnswerId && parseInt(userAnswerId) === correctAnswer.answer_id) {
                    correctCount++;
                }
            });

            const totalQuestions = questions.length;
            const score = Math.round((correctCount / totalQuestions) * 100);
            const passed = score >= quiz.pass_mark_percentage;

            // Save the attempt to the database
            await db.query(
                'INSERT INTO quiz_attempts (discord_id, quiz_id, score, passed, timestamp) VALUES (?, ?, ?, ?, NOW())',
                [user.id, quizId, score, passed]
            );

            // If passed, update the commander training tracker
            if (passed) {
                const updateField = quiz.update_field;
                if (updateField) {
                    await trainingManager.updatePilotProgress(null, updateField, true, 'System (Quiz)');
                    // Manually find the pilot_id to pass to trainingManager for a more direct update
                    const [pilot] = await db.query('SELECT pilot_id FROM commander_training WHERE discord_id = ?', [user.id]);
                    if (pilot) {
                        await trainingManager.updatePilotProgress(pilot.pilot_id, updateField, true, 'System (Quiz)');
                    }
                }
            }

            // Invalidate the token after a successful attempt
            client.activeQuizTokens.delete(req.params.token);

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
