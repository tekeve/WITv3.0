Bot Plugin System

This directory contains all plugins for the bot. The modular system allows you to add or remove functionality without editing the core bot files.

How to Enable/Disable a Plugin

Open the plugins.json file in this directory.

This file contains a list of all available plugins.

To enable a plugin, find its entry and set "enabled": true.

To disable a plugin, find its entry and set "enabled": false.

Restart the bot for the changes to take effect.

How to Create a New Plugin

Create a new folder inside this plugins/ directory (e.g., my-new-plugin).

Inside your new folder, create an index.js file. This is the main entry point for your plugin.

Add a new entry for your plugin in the plugins.json file:

{
  "name": "My New Plugin",
  "directory": "my-new-plugin",
  "description": "What my plugin does.",
  "enabled": true
}


Write your plugin's code in my-new-plugin/index.js.

Plugin Structure (index.js)

Your plugin's index.js file must export an initialize function. This function receives a services object from the main bot.

// plugins/my-new-plugin/index.js

/**
 * Initializes the plugin.
 * @param {object} services - Core services injected from the main bot.
 */
function initialize(services) {
    // You can now access all core services
    const { client, database, logger } = services;

    logger.info('Initializing My New Plugin...');

    // Example: Registering a Discord event listener
    client.on('messageCreate', (message) => {
        if (message.author.bot) return;
        if (message.content === '!my-command') {
            message.reply('My new plugin works!');
        }
    });

    // Example: Registering a slash command (if you have a command handler)
    const myCommand = {
        name: 'my-command',
        description: 'My new slash command',
        execute: async (interaction) => {
            // You can use the database service here
            const userData = await database.getUser(interaction.user.id);
            await interaction.reply(`Hello from my plugin! Your data: ${JSON.stringify(userData)}`);
        }
    };

    // Assuming your client object has a "commands" Map
    if (services.client.commands) {
         services.client.commands.set(myCommand.name, myCommand);
    }
}

module.exports = {
    initialize
};


Available Core Services

The services object passed to your initialize function contains all the core tools you can use.

services.client: The main Discord.js Client object. You can use this to register event listeners (client.on(...)), access guilds, channels, etc.

services.database: The bot's database connection/interface. Use this to get or set data.

database.getUser(userId)

database.setUser(userId, data)

(add more functions as you create them)

services.logger: The bot's central logger. Please use this instead of console.log so all logs are standardized.

logger.info(message)

logger.warn(message)

logger.error(message)

By using these shared services, your plugin can interact with the bot and other plugins seamlessly.