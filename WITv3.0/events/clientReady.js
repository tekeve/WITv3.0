const { Events } = require('discord.js');
const logger = require('@helpers/logger');
const { startServer } = require('../web/server.js');

module.exports = {
	name: Events.ClientReady,
	once: true,
	execute(client) {
		logger.success(`Ready! Logged in as ${client.user.tag}`);
		// Start the ESI & SRP web server
		startServer(client);
		// Initial call to update incursions
		client.updateIncursions();
		// Set interval for subsequent updates
		setInterval(() => client.updateIncursions(), 1 * 60 * 1000);
	},
};
