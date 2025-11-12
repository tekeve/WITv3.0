const { Events } = require('discord.js');
const logger = require('@helpers/logger');
const statusManager = require('@helpers/statusManager');
const githubWatcher = require('@helpers/githubWatcher');
const reminderManager = require('@helpers/reminderManager');
const scheduler = require('@helpers/scheduler');
const trainingSyncManager = require('@helpers/trainingSyncManager');
const { initializeLastTransactionIds } = require('@helpers/walletMonitor'); // Import the init function

module.exports = {
	name: Events.ClientReady,
	once: true,
	async execute(client) { // Make sure this is async
		logger.success(`Ready! Logged in as ${client.user.tag}`);

		// --- Initialize Wallet Cache First ---
		try {
			logger.info('[ClientReady] Initializing wallet transaction ID cache...');
			await initializeLastTransactionIds(); // Await the cache initialization
			logger.success('[ClientReady] Wallet transaction ID cache initialized successfully.');
		} catch (error) {
			logger.error('[ClientReady] CRITICAL: Failed to initialize wallet transaction ID cache during startup!', error);
			// Decide if the bot should proceed without the cache or exit.
			// For now, we'll log the error and continue, but sync might fetch excessive data initially.
		}
		// --- End Wallet Cache Init ---

		// Load status from DB
		await statusManager.loadStatus(client);

		// Load and schedule reminders from DB
		await reminderManager.loadReminders(client);

		// Initial call to update incursions, which will then schedule the next call itself.
		client.updateIncursions();

		// Initialize scheduled tasks (now doesn't include wallet init)
		// Ensure scheduler.initialize is awaited if it does other async setup
		await scheduler.start(client); // Await scheduler initialization

		// Initialize the new training data sync manager.
		if (client.io) {
			trainingSyncManager.initialize(client);
		} else {
			logger.warn('[TrainingSync] Could not initialize because the web server\'s `io` instance was not found on the client.');
		}


		// Initialize and start GitHub watcher with a standard interval
		await githubWatcher.initializeLastSha();
		setInterval(() => githubWatcher.checkGithubForUpdates(client), 2 * 60 * 1000); // Check every 2 minutes
	},
};

