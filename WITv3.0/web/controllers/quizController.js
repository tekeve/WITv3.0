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
        const userAnswers = req.body.answers; // Expects an object like { questionId: answerId or [answerIds], ... }

        try {
            // Get the Socket.IO instance from the app
            const io = req.app.get('io');

            const [quiz] = await db.query('SELECT * FROM quizzes WHERE quiz_id = ?', [quizId]);
            if (!quiz) {
                return res.status(404).json({ success: false, message: 'Quiz not found.' });
            }

            // --- FIX: Select question_type for grading logic ---
            const questions = await db.query('SELECT question_id, question_type FROM quiz_questions WHERE quiz_id = ?', [quizId]);
            const questionIds = questions.map(q => q.question_id);

            if (questionIds.length === 0) {
                // If passed, update the commander training tracker
                if (quiz.update_field) {
                    const [pilot] = await db.query('SELECT pilot_id FROM commander_training WHERE discord_id = ?', [user.id]);
                    if (pilot) {
                        await trainingManager.updatePilotProgress(pilot.pilot_id, quiz.update_field, true);
                        // If the update was successful and io is available, emit the update event
                        if (io) {
                            io.emit('training-update');
                        }
                    }
                }
                return res.json({ success: true, message: 'This quiz has no questions. Marked as complete.', score: 100, passed: true, totalQuestions: 0, correctCount: 0, passMark: quiz.pass_mark_percentage, quizName: quiz.name });
            }

            // --- START: Reworked Grading Logic ---
            const correctAnswersFromDb = await db.query(`SELECT question_id, answer_id FROM quiz_answers WHERE question_id IN (${questionIds.join(',')}) AND is_correct = 1`);

            // Group correct answers by question ID for efficient lookup
            const correctAnswersMap = new Map();
            correctAnswersFromDb.forEach(ans => {
                if (!correctAnswersMap.has(ans.question_id)) {
                    correctAnswersMap.set(ans.question_id, []);
                }
                // Store answer_id as a string for consistent comparison
                correctAnswersMap.get(ans.question_id).push(ans.answer_id.toString());
            });

            let correctCount = 0;

            // Iterate through each question of the quiz to grade it
            questions.forEach(question => {
                const questionId = question.question_id;
                const questionType = question.question_type;
                const userSubmission = userAnswers[questionId]; // This is either a string or an array of strings
                const correctDbAnswers = correctAnswersMap.get(questionId) || [];

                if (questionType === 'multiple') {
                    // Ensure user submission is an array and sort both arrays for comparison
                    const submittedAnswers = Array.isArray(userSubmission) ? userSubmission.sort() : [];
                    const correctAnswersSorted = correctDbAnswers.sort();

                    // The answer is correct only if the submitted array is identical to the correct answer array
                    if (submittedAnswers.length === correctAnswersSorted.length && JSON.stringify(submittedAnswers) === JSON.stringify(correctAnswersSorted)) {
                        correctCount++;
                    }
                } else { // 'single' choice question
                    // For a single choice question, correctDbAnswers will be an array with one element, e.g., ['123']
                    // The userSubmission will be a single string, e.g., '123'
                    if (correctDbAnswers.length === 1 && userSubmission === correctDbAnswers[0]) {
                        correctCount++;
                    }
                }
            });
            // --- END: Reworked Grading Logic ---

            const totalQuestions = questions.length;
            const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 100;
            const passed = score >= quiz.pass_mark_percentage;

            // Save the attempt to the database
            await db.query(
                'INSERT INTO quiz_attempts (discord_id, quiz_id, score, passed, timestamp) VALUES (?, ?, ?, ?, NOW())',
                [user.id, quizId, score, passed]
            );

            // Find the pilot record to update their status
            const [pilot] = await db.query('SELECT pilot_id FROM commander_training WHERE discord_id = ?', [user.id]);

            if (pilot) {
                let updated = false;
                if (passed && quiz.update_field) {
                    // This function also updates last_active
                    const result = await trainingManager.updatePilotProgress(pilot.pilot_id, quiz.update_field, true);
                    if (result.success) {
                        updated = true;
                    }
                } else {
                    // If not passed, or no update field, just update last_active
                    const result = await trainingManager.updateLastActive(pilot.pilot_id);
                    if (result.success) {
                        updated = true;
                    }
                }

                if (updated && io) {
                    io.emit('training-update');
                }
            } else {
                logger.warn(`Could not find commander_training record for Discord ID ${user.id} to update quiz status.`);
            }

            // Do not invalidate the token, allow user to take more quizzes.
            // The token will expire naturally based on the timeout set in the command file.
            // client.activeQuizTokens.delete(req.params.token);

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

