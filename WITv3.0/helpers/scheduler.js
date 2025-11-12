const db = require('./database');
const logger = require('./logger');

// --- Import ALL job handlers ---
const { remindUser } = require('./reminderManager');
const { tallyVote } = require('./voteManager');
const walletMonitor = require('./walletMonitor');
const trainingSyncManager = require('./trainingSyncManager');
const statusManager = require('./statusManager');
const incursionManager = require('./incursionManager');
const githubWatcher = require('./githubWatcher');

/**
 * Manages all scheduled jobs for the bot.
 * This class is exported as a singleton instance.
 */
class Scheduler {
    constructor() {
        /** @type {import('discord.js').Client | null} */
        this.client = null;
        this.timer = null;
    }

    /**
     * Starts the scheduler loop.
     * This should be called once from your main app/clientReady.
     * @param {import('discord.js').Client} client - The Discord client instance.
     */
    start(client) {
        this.client = client;
        logger.info('Scheduler started.');
        this._checkScheduledJobs(); // Initial check
        // Use arrow function to maintain 'this' context
        this.timer = setInterval(() => this._checkScheduledJobs(), 60000); // Check every 60 seconds
    }

    /**
     * Schedules a new job in the database.
     * @param {string | number} job_id - A unique ID for the job (e.g., vote_id).
     * @param {Date} due_time - The datetime when the job should run.
     * @param {string} task_type - The type of task to run (e.g., 'reminder', 'tallyVote').
     * @param {string | null} user_id - The user ID associated with the job (if any).
     * @param {string | null} message - A message associated with the job (if any).
     */
    async scheduleJob(job_id, due_time, task_type, user_id = null, message = null) {
        try {
            await db.query(
                'INSERT INTO scheduler (job_id, user_id, due_time, task_type, message) VALUES (?, ?, ?, ?, ?)',
                [job_id, user_id, due_time, task_type, message]
            );
            logger.info(`Scheduled new job: Type=${task_type}, ID=${job_id}, Due=${due_time.toISOString()}`);
        } catch (error) {
            logger.error('Failed to schedule job:', error);
        }
    }

    /**
     * Internal method to check for and process due jobs.
     * @private
     */
    async _checkScheduledJobs() {
        if (!this.client) {
            logger.warn('Scheduler check skipped: Client instance not ready.');
            return;
        }

        const now = new Date();
        logger.info('Scheduler checking for jobs...');
        let queryResult; // Changed from 'let jobs'
        try {
            // Get the full query result, don't destructure yet
            queryResult = await db.query('SELECT * FROM scheduler WHERE due_time <= ?', [now]);
        } catch (error) {
            logger.error('Scheduler failed to query jobs:', error);
            return;
        }

        // Check if the result is an array.
        // We assume db.query returns the 'rows' array directly.
        if (!Array.isArray(queryResult)) {
            logger.warn(`Scheduler query returned unexpected data. Expected an array of jobs.`, { result: queryResult });
            return; // Don't proceed
        }

        const jobs = queryResult; // The result *is* the jobs array.

        // Check if 'jobs' is an array. If not, log a warning.
        if (jobs.length > 0) {
            logger.info(`Scheduler found ${jobs.length} due job(s).`);
        } else {
            logger.info('Scheduler found 0 due jobs.');
        }

        // Process jobs one by one
        for (const job of jobs) {
            await this._processJob(job);
        }
    }


    /**
     * Internal method to route a single job to its handler.
     * Manages individual job success/failure.
     * @param {object} job - The job object from the database.
     * @private
     */
    async _processJob(job) {
        try {
            // Route job to the correct handler based on its type
            switch (job.task_type) {
                case 'reminder':
                    await this._handleReminder(job);
                    break;
                case 'tallyVote':
                    await this._handleTallyVote(job);
                    break;
                case 'walletMonitor':
                    await this._handleWalletMonitor(job);
                    break;
                case 'trainingSync':
                    await this._handleTrainingSync(job);
                    break;
                case 'statusUpdate':
                    await this._handleStatusUpdate(job);
                    break;
                case 'incursionCheck':
                    await this._handleIncursionCheck(job);
                    break;
                case 'githubCheck':
                    await this._handleGithubCheck(job);
                    break;
                default:
                    logger.warn(`Unknown job type: ${job.task_type}. Deleting job ${job.id}.`);
            }

            // Delete job *after* successful processing
            await db.query('DELETE FROM scheduler WHERE id = ?', [job.id]);

        } catch (jobError) {
            logger.error(`Error processing job ${job.id} (Type: ${job.task_type}):`, jobError);
            // If a job fails, delete it to prevent a crash loop
            try {
                await db.query('DELETE FROM scheduler WHERE id = ?', [job.id]);
                logger.error(`Failed job ${job.id} has been deleted to prevent a loop.`);
            } catch (deleteError) {
                logger.error(`CRITICAL: Failed to delete erroring job ${job.id}. This may cause a loop.`, deleteError);
            }
        }
    }

    // --- Job Handlers ---
    // These private methods neatly contain the logic for each job type.

    async _handleReminder(job) {
        logger.info(`Processing reminder job ${job.id} for user ${job.user_id}`);
        await remindUser(job.user_id, job.message, this.client);
    }

    async _handleTallyVote(job) {
        const voteId = job.job_id;
        logger.info(`Processing 'tallyVote' job ${job.id} for vote ${voteId}`);
        await tallyVote(voteId, this.client);
    }

    async _handleWalletMonitor(job) {
        logger.info(`Processing 'walletMonitor' job ${job.id}`);
        if (typeof walletMonitor.checkWallets === 'function') {
            await walletMonitor.checkWallets(this.client);
        } else {
            logger.warn(`Task 'walletMonitor' has no 'checkWallets' function.`);
        }
    }

    async _handleTrainingSync(job) {
        logger.info(`Processing 'trainingSync' job ${job.id}`);
        if (typeof trainingSyncManager.sync === 'function') {
            await trainingSyncManager.sync(this.client);
        } else {
            logger.warn(`Task 'trainingSync' has no 'sync' function.`);
        }
    }

    async _handleStatusUpdate(job) {
        logger.info(`Processing 'statusUpdate' job ${job.id}`);
        if (typeof statusManager.updateStatus === 'function') {
            await statusManager.updateStatus(this.client);
        } else {
            logger.warn(`Task 'statusUpdate' has no 'updateStatus' function.`);
        }
    }

    async _handleIncursionCheck(job) {
        logger.info(`Processing 'incursionCheck' job ${job.id}`);
        if (typeof incursionManager.checkIncursions === 'function') {
            await incursionManager.checkIncursions(this.client);
        } else {
            logger.warn(`Task 'incursionCheck' has no 'checkIncursions' function.`);
        }
    }

    async _handleGithubCheck(job) {
        logger.info(`Processing 'githubCheck' job ${job.id}`);
        if (typeof githubWatcher.checkCommits === 'function') {
            await githubWatcher.checkCommits(this.client);
        } else {
            logger.warn(`Task 'githubCheck' has no 'checkCommits' function.`);
        }
    }
}

// Create and export a *single instance* of the Scheduler.
// Every file that 'requires' this module will get this exact same object.
const schedulerInstance = new Scheduler();
module.exports = schedulerInstance;