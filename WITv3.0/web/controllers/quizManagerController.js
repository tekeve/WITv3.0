const logger = require('@helpers/logger');
const db = require('@helpers/database');

/**
 * Renders the quiz manager page.
 */
exports.showManager = (client) => async (req, res) => {
    const { token } = req.params;
    const tokenData = client.activeQuizManagerTokens?.get(token);

    if (!tokenData) {
        return res.status(403).render('error', { title: 'Link Invalid', message: 'This quiz management link is invalid or has expired.' });
    }

    try {
        const { mode, quizId, quizName } = tokenData;
        let quizData = {
            name: quizName,
            pass_mark_percentage: 80,
            update_field: '',
            questions: []
        };

        if (mode === 'edit' && quizId) {
            const [quizInfo] = await db.query('SELECT * FROM quizzes WHERE quiz_id = ?', [quizId]);
            if (quizInfo) {
                quizData = { ...quizData, ...quizInfo };
                const questions = await db.query('SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY question_id ASC', [quizId]);
                const questionIds = questions.map(q => q.question_id);
                if (questionIds.length > 0) {
                    const answers = await db.query(`SELECT * FROM quiz_answers WHERE question_id IN (${questionIds.join(',')}) ORDER BY answer_id ASC`);
                    questions.forEach(q => {
                        q.answers = answers.filter(a => a.question_id === q.question_id);
                    });
                }
                quizData.questions = questions;
            }
        }

        // Fetch commander_training columns to populate the "Update Field" dropdown
        const trainingColumns = await db.query("SHOW COLUMNS FROM commander_training");
        const updateFields = trainingColumns
            .map(c => c.Field)
            .filter(f => f.startsWith('quiz_'));

        res.render('quizManager', {
            token,
            quizData,
            mode,
            updateFields
        });

    } catch (error) {
        logger.error('Error preparing quiz manager page:', error);
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
    client.activeQuizManagerTokens.delete(token);

    const { interaction, mode } = tokenData;
    const { quiz, questions = {}, deleted_questions, deleted_answers } = req.body;

    const connection = await db.pool.getConnection(); // Use a transaction

    try {
        await connection.beginTransaction();

        // 1. Upsert Quiz Info
        let quizId;
        if (mode === 'create') {
            const [result] = await connection.query('INSERT INTO quizzes (name, pass_mark_percentage, update_field) VALUES (?, ?, ?)', [quiz.name, quiz.pass_mark_percentage, quiz.update_field]);
            quizId = result.insertId;
        } else { // 'edit'
            quizId = tokenData.quizId;
            await connection.query('UPDATE quizzes SET name = ?, pass_mark_percentage = ?, update_field = ? WHERE quiz_id = ?', [quiz.name, quiz.pass_mark_percentage, quiz.update_field, quizId]);
        }

        // 2. Handle Deletions
        if (deleted_answers) {
            const idsToDelete = Array.isArray(deleted_answers) ? deleted_answers : [deleted_answers];
            if (idsToDelete.length > 0) {
                await connection.query(`DELETE FROM quiz_answers WHERE answer_id IN (${idsToDelete.map(() => '?').join(',')})`, idsToDelete);
            }
        }
        if (deleted_questions) {
            const idsToDelete = Array.isArray(deleted_questions) ? deleted_questions : [deleted_questions];
            if (idsToDelete.length > 0) {
                await connection.query(`DELETE FROM quiz_questions WHERE question_id IN (${idsToDelete.map(() => '?').join(',')})`, idsToDelete);
            }
        }

        // 3. Upsert Questions and Answers
        for (const qKey in questions) {
            const questionData = questions[qKey];
            const questionType = questionData.type || 'single';
            let questionId;

            if (qKey.startsWith('new_')) { // New Question
                const [qResult] = await connection.query('INSERT INTO quiz_questions (quiz_id, question_text, question_type) VALUES (?, ?, ?)', [quizId, questionData.text, questionType]);
                questionId = qResult.insertId;
            } else { // Existing Question
                questionId = qKey;
                await connection.query('UPDATE quiz_questions SET question_text = ?, question_type = ? WHERE question_id = ?', [questionData.text, questionType, questionId]);
            }

            // Upsert Answers for this question
            if (questionData.answers) {
                for (const aKey in questionData.answers) {
                    const answerData = questionData.answers[aKey];
                    let isCorrect = false;
                    if (questionType === 'multiple') {
                        isCorrect = !!answerData.is_correct; // Comes as '1' from checkbox, or undefined
                    } else { // 'single'
                        isCorrect = (questionData.correct_answer === aKey);
                    }

                    if (aKey.startsWith('new_')) { // New Answer
                        await connection.query('INSERT INTO quiz_answers (question_id, answer_text, is_correct) VALUES (?, ?, ?)', [questionId, answerData.text, isCorrect]);
                    } else { // Existing Answer
                        await connection.query('UPDATE quiz_answers SET answer_text = ?, is_correct = ? WHERE answer_id = ?', [answerData.text, isCorrect, aKey]);
                    }
                }
            }
        }

        await connection.commit();
        const successMsg = `Quiz '${quiz.name}' has been successfully saved.`;
        await interaction.followUp({ content: `✅ ${successMsg}`, ephemeral: true });
        res.render('success', { title: 'Success!', message: successMsg });

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
