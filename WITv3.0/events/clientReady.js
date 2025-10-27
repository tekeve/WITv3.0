const { Events } = require('discord.js');
const logger = require('@helpers/logger');
const statusManager = require('@helpers/statusManager');
const githubWatcher = require('@helpers/githubWatcher');
const reminderManager = require('@helpers/reminderManager');
const scheduler = require('@helpers/scheduler');
const trainingSyncManager = require('@helpers/trainingSyncManager'); // Import the training sync manager

module.exports = {
	name: Events.ClientReady,
	once: true,
	// Make this handler async
	async execute(client) {
		logger.success(`Ready! Logged in as ${client.user.tag}`);

		// Load status from DB
		await statusManager.loadStatus(client);

		// Load and schedule reminders from DB
		await reminderManager.loadReminders(client);

		// Initial call to update incursions, which will then schedule the next call itself.
		client.updateIncursions();

		// Await the scheduler initialization to ensure wallet cache loads first
		await scheduler.initialize(client);

		// Initialize the new training data sync manager.
		// This needs the `io` instance from the webserver, which we attached to the client.
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

