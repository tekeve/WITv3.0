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

            // --- FIX: Select question_type along with other question data ---
            const questions = await db.query('SELECT question_id, question_text, question_type FROM quiz_questions WHERE quiz_id = ?', [quizId]);
            const questionIds = questions.map(q => q.question_id);

            if (questionIds.length === 0) {
                return res.json({ success: true, quiz, questions: [] });
            }

            // FIX: Dynamically create placeholders for the IN clause to avoid argument mismatch.
            const placeholders = questionIds.map(() => '?').join(',');
            const answers = await db.query(`SELECT * FROM quiz_answers WHERE question_id IN (${placeholders})`, questionIds);

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
        const userAnswers = req.body.answers; // Expects an object like { questionId: answerId or [answerIds], ... }

        try {
            // Get the Socket.IO instance from the app
            const io = req.app.get('io');

            const [quiz] = await db.query('SELECT * FROM quizzes WHERE quiz_id = ?', [quizId]);
            if (!quiz) {
                return res.status(404).json({ success: false, message: 'Quiz not found.' });
            }

            const questions = await db.query('SELECT question_id, question_type FROM quiz_questions WHERE quiz_id = ?', [quizId]);
            const questionIds = questions.map(q => q.question_id);

            if (questionIds.length === 0) {
                // Even with no questions, if we pass, update the tracker.
                if (quiz.update_field) {
                    const [pilot] = await db.query('SELECT pilot_id FROM commander_training WHERE discord_id = ?', [user.id]);
                    if (pilot) {
                        const result = await trainingManager.updatePilotProgress(pilot.pilot_id, quiz.update_field, true);
                        if (result.success && io) {
                            io.emit('training-update');
                        }
                    }
                }
                return res.json({ success: true, message: 'This quiz has no questions. Marked as complete.', score: 100, passed: true, totalQuestions: 0, correctCount: 0, passMark: quiz.pass_mark_percentage, quizName: quiz.name });
            }

            // --- START: Reworked Grading Logic ---
            // FIX: Dynamically create placeholders for the IN clause to avoid argument mismatch.
            const placeholders = questionIds.map(() => '?').join(',');
            const correctAnswersFromDb = await db.query(`SELECT question_id, answer_id FROM quiz_answers WHERE question_id IN (${placeholders}) AND is_correct = 1`, questionIds);

            // Group correct answers by question ID for efficient lookup
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
                } else { // 'single'
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

            // Consolidated logic to update training tracker
            const [pilot] = await db.query('SELECT pilot_id FROM commander_training WHERE discord_id = ?', [user.id]);
            if (pilot) {
                let result;
                // If the quiz was passed and has an associated field to update, do a full update.
                if (passed && quiz.update_field) {
                    result = await trainingManager.updatePilotProgress(pilot.pilot_id, quiz.update_field, true);
                } else {
                    // Otherwise (if failed, or passed but no update field), just update the last active time.
                    result = await trainingManager.updateLastActive(pilot.pilot_id);
                }

                // If any update was successful, notify clients.
                if (result && result.success && io) {
                    io.emit('training-update');
                }
            } else {
                logger.warn(`Could not find commander_training record for Discord ID ${user.id} to update quiz status.`);
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

