const logger = require('@helpers/logger');
const db = require('@helpers/database');

/**
 * Renders the quiz management dashboard.
 */
exports.showDashboard = (client) => async (req, res) => {
    const { token } = req.params;
    const tokenData = client.activeQuizManagerTokens?.get(token);

    if (!tokenData) {
        return res.status(403).render('error', { title: 'Link Invalid', message: 'This quiz management link is invalid or has expired.' });
    }

    try {
        const quizzes = await db.query('SELECT quiz_id, name, pass_mark_percentage, category FROM quizzes ORDER BY category, name ASC');
        res.render('quizDashboard', {
            token,
            quizzes
        });
    } catch (error) {
        logger.error('Error fetching quizzes for dashboard:', error);
        res.status(500).render('error', { title: 'Server Error', message: 'Could not load quiz data from the database.' });
    }
};

/**
 * Renders the quiz editor for creating or editing a quiz.
 */
exports.showEditor = (client) => async (req, res) => {
    const { token, quizId } = req.params;
    const tokenData = client.activeQuizManagerTokens?.get(token);

    if (!tokenData) {
        return res.status(403).render('error', { title: 'Link Invalid', message: 'This quiz management link is invalid or has expired.' });
    }

    try {
        const mode = quizId ? 'edit' : 'create';
        let quizData = {
            name: '',
            pass_mark_percentage: 80,
            category: 'resident',
            questions: []
        };

        if (mode === 'edit') {
            const [quizInfo] = await db.query('SELECT * FROM quizzes WHERE quiz_id = ?', [quizId]);
            if (quizInfo) {
                quizData = { ...quizData, ...quizInfo };
                const questions = await db.query('SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY order_index ASC, question_id ASC', [quizId]);
                if (questions.length > 0) {
                    const questionIds = questions.map(q => q.question_id);
                    const placeholders = questionIds.map(() => '?').join(',');
                    const answers = await db.query(`SELECT * FROM quiz_answers WHERE question_id IN (${placeholders}) ORDER BY order_index ASC, answer_id ASC`, questionIds);
                    questions.forEach(q => {
                        q.answers = answers.filter(a => a.question_id === q.question_id);
                    });
                }
                quizData.questions = questions;
            } else {
                return res.status(404).render('error', { title: 'Not Found', message: 'The quiz you are trying to edit does not exist.' });
            }
        }

        res.render('quizEditor', {
            token,
            quizData,
            mode
        });

    } catch (error) {
        logger.error('Error preparing quiz editor page:', error);
        res.status(500).render('error', { title: 'Server Error', message: 'Could not load quiz data from the database.' });
    }
};


/**
 * Handles submission from the quiz manager.
 */
exports.handleManagerSubmission = (client) => async (req, res) => {
    const { token } = req.params;
    const tokenData = client.activeQuizManagerTokens?.get(token);

    if (!tokenData) {
        return res.status(403).render('error', { title: 'Link Expired', message: 'This form has expired. Your changes were not saved.' });
    }

    const { interaction } = tokenData;
    const { quizId, quiz, questions = {}, deleted_questions, deleted_answers } = req.body;

    const connection = await db.pool.getConnection();

    try {
        await connection.beginTransaction();

        let currentQuizId = quizId;
        if (!currentQuizId) { // Create
            const [result] = await connection.query('INSERT INTO quizzes (name, pass_mark_percentage, category) VALUES (?, ?, ?)', [quiz.name, quiz.pass_mark_percentage, quiz.category]);
            currentQuizId = result.insertId;
        } else { // Edit
            await connection.query('UPDATE quizzes SET name = ?, pass_mark_percentage = ?, category = ? WHERE quiz_id = ?', [quiz.name, quiz.pass_mark_percentage, quiz.category, currentQuizId]);
        }

        const getIds = (value) => {
            if (!value) return [];
            return Array.isArray(value) ? value : [value];
        };

        const questionIdsToDelete = getIds(deleted_questions);
        if (questionIdsToDelete.length > 0) {
            const placeholders = questionIdsToDelete.map(() => '?').join(',');
            await connection.query(`DELETE FROM quiz_questions WHERE question_id IN (${placeholders})`, questionIdsToDelete);
        }

        const answerIdsToDelete = getIds(deleted_answers);
        if (answerIdsToDelete.length > 0) {
            const placeholders = answerIdsToDelete.map(() => '?').join(',');
            await connection.query(`DELETE FROM quiz_answers WHERE answer_id IN (${placeholders})`, answerIdsToDelete);
        }

        const deletedQuestionIdsSet = new Set(questionIdsToDelete.map(id => String(id)));

        if (questions) {
            for (const qKey in questions) {
                if (deletedQuestionIdsSet.has(qKey)) continue;

                const questionData = questions[qKey];
                const questionType = questionData.type || 'single';
                const questionOrder = questionData.order_index || 0;
                let questionId;

                if (qKey.startsWith('new_')) {
                    const [qResult] = await connection.query('INSERT INTO quiz_questions (quiz_id, question_text, question_type, order_index) VALUES (?, ?, ?, ?)', [currentQuizId, questionData.text, questionType, questionOrder]);
                    questionId = qResult.insertId;
                } else {
                    questionId = qKey;
                    await connection.query('UPDATE quiz_questions SET question_text = ?, question_type = ?, order_index = ? WHERE question_id = ?', [questionData.text, questionType, questionOrder, questionId]);
                }

                if (questionData.answers) {
                    for (const aKey in questionData.answers) {
                        const answerData = questionData.answers[aKey];
                        const answerOrder = answerData.order_index || 0;
                        let isCorrect = false;
                        if (questionType === 'multiple') {
                            isCorrect = !!answerData.is_correct;
                        } else {
                            isCorrect = (questionData.correct_answer === aKey);
                        }

                        if (aKey.startsWith('new_')) {
                            await connection.query('INSERT INTO quiz_answers (question_id, answer_text, is_correct, order_index) VALUES (?, ?, ?, ?)', [questionId, answerData.text, isCorrect, answerOrder]);
                        } else {
                            await connection.query('UPDATE quiz_answers SET answer_text = ?, is_correct = ?, order_index = ? WHERE answer_id = ?', [answerData.text, isCorrect, answerOrder, aKey]);
                        }
                    }
                }
            }
        }

        await connection.commit();
        const successMsg = `Quiz '${quiz.name}' has been successfully saved.`;
        await interaction.followUp({ content: `✅ ${successMsg}`, ephemeral: true });

        res.redirect(`/quizmanager/${token}`);

    } catch (error) {
        await connection.rollback();
        logger.error('Error saving quiz from manager:', error);
        const errorMsg = `A database error occurred while saving the quiz. No changes were made. Error: ${error.message}`;
        await interaction.followUp({ content: `❌ ${errorMsg}`, ephemeral: true });
        res.status(500).render('error', { title: 'Database Error', message: errorMsg });
    } finally {
        connection.release();
    }
};

/**
 * Handles the deletion of a quiz.
 */
exports.handleDelete = (client) => async (req, res) => {
    const { token, quizId } = req.params;
    const tokenData = client.activeQuizManagerTokens?.get(token);

    if (!tokenData) {
        return res.status(403).render('error', { title: 'Link Expired', message: 'This form has expired. Your changes were not saved.' });
    }

    const { interaction } = tokenData;

    try {
        const [quiz] = await db.query('SELECT name FROM quizzes WHERE quiz_id = ?', [quizId]);
        if (!quiz) {
            return res.status(404).render('error', { title: 'Not Found', message: 'Quiz to delete was not found.' });
        }

        await db.query('DELETE FROM quizzes WHERE quiz_id = ?', [quizId]);

        const successMsg = `Quiz '${quiz.name}' has been successfully deleted.`;
        await interaction.followUp({ content: `✅ ${successMsg}`, ephemeral: true });

        res.redirect(`/quizmanager/${token}`);

    } catch (error) {
        logger.error(`Error deleting quiz ${quizId}:`, error);
        const errorMsg = `A database error occurred while deleting the quiz. Error: ${error.message}`;
        await interaction.followUp({ content: `❌ ${errorMsg}`, ephemeral: true });
        res.status(500).render('error', { title: 'Database Error', message: errorMsg });
    }
};

