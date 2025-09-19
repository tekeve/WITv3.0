const { Events } = require('discord.js');
const logger = require('@helpers/logger');
const statusManager = require('@helpers/statusManager');
const githubWatcher = require('@helpers/githubWatcher');
const reminderManager = require('@helpers/reminderManager'); // Import the new manager

module.exports = {
	name: Events.ClientReady,
	once: true,
	async execute(client) {
		logger.success(`Ready! Logged in as ${client.user.tag}`);

		// Load status from DB
		await statusManager.loadStatus(client);

		// Load and schedule reminders from DB
		await reminderManager.loadReminders(client);

		// Initial call to update incursions
		client.updateIncursions();
		// Set interval for subsequent updates
		setInterval(() => client.updateIncursions(), 1 * 60 * 1000); // Check every 1 minute

		// Initialize and start GitHub watcher
		await githubWatcher.initializeLastSha();
		setInterval(() => githubWatcher.checkGithubForUpdates(client), 5 * 60 * 1000); // Check every 5 minutes
	},
};
