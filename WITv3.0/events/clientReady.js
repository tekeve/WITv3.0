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

		// Initial call to update incursions, which will then schedule the next call itself.
		client.updateIncursions();

		// Initialize and start GitHub watcher with a standard interval
		await githubWatcher.initializeLastSha();
		setInterval(() => githubWatcher.checkGithubForUpdates(client), 5 * 60 * 1000); // Check every 5 minutes
	},
};
