This is already out of date - updates are planned

Basic Setup

Here's the plan:

    Architecture: We will build a bot with a dynamic command handler. This means you can add new commands simply by creating new files in a specific folder. This directly addresses your need for an "expandable" bot.

    Technology Stack:

        Runtime: Node.js
        Discord API: discord.js v14
        Google APIs: googleapis official Node.js client
        Configuration: dotenv to manage secret keys securely.

    Setup Steps: We'll go through three setup processes:

        Setting up your Node.js project.
        Creating a Discord Bot application to get your credentials.
        Configuring a Google Cloud Platform project to get API access.

    Core Features: We will implement three initial slash commands:

        /ping: A simple utility command to ensure the bot is working.
        /sheet: A command with read and write subcommands for Google Sheets.
        /doc: A command with read and append subcommands for Google Docs.

Step 1: Prerequisites & Setup

A. Node.js Environment

Make sure you have Node.js version 16.9.0 or newer installed. You can download it from the official Node.js website.

B. Discord Bot Setup

    Create an Application: Go to the Discord Developer Portal and click "New Application". Give it a name.
    Create a Bot User: In your new application, go to the "Bot" tab and click "Add Bot".
    Get the Token: Click "Reset Token" and copy the token. This is your bot's password; keep it secret!
    Enable Intents: On the same "Bot" tab, enable the SERVER MEMBERS INTENT and MESSAGE CONTENT INTENT.
    Get the Client ID: Go to the "OAuth2" -> "General" tab and copy the "Client ID".
    Invite the Bot: Use an invite link to add the bot to your server. Replace YOUR_CLIENT_ID with the ID you just copied.
    https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8&scope=bot%20applications.commands

C. Google Cloud Platform Setup

This part is crucial for connecting to Sheets and Docs.

    Create a Project: Go to the Google Cloud Console and create a new project.
    Enable APIs: In your new project, search for and enable the following two APIs:

        Google Sheets API
        Google Docs API

    Create a Service Account:

        Go to "APIs & Services" -> "Credentials".
        Click "Create Credentials" -> "Service Account".
        Give it a name (e.g., "discord-bot-service-account") and click "Create and Continue".
        For the role, select "Project" -> "Editor" for simplicity. Click "Continue" and then "Done".

    Generate a JSON Key:

        Find your newly created service account in the Credentials list and click on it.
        Go to the "Keys" tab.
        Click "Add Key" -> "Create new key".
        Select JSON and click "Create". A .json file will be downloaded.
        Treat this file like a password! We'll use it in our project.

    Share Your Documents:

        Open the .json file and find the client_email (it looks like an email address).
        Open the Google Sheet and Google Doc you want the bot to access.
        Click the "Share" button and paste the client_email into the sharing dialog. Give it Editor access. This allows the bot's service account to read and write to that specific file.

Step 2: Project Structure & Code

Now we're ready to build the bot.

A. Initialize the Project

    Create a new folder for your project (e.g., my-discord-bot).

    Open a terminal in that folder and run the following commands:
    Bash

    # Initializes a Node.js project
    npm init -y

    # Installs required libraries
    npm install discord.js googleapis dotenv

    Create the following folders and files. Your project structure should look like this:

    /WTM WIT
    ├── /commands
    │   ├── /google
    │   │   ├── sheet.js
    │   │   └── doc.js
    │   └── /utility
    │       └── ping.js
    │       └── help.js
    │       └── request.js
    |   ├── /eve
    │       └── addchar.js
    │       └── delchar.js
    │       └── getchar.js
    │       └── incursion.js
    │       └── inrole.js
    ├── /helpers
    │       └── characterManager.js
    ├── config.js
    ├── app.js
    ├── package.json
    ├── .env
    └── credentials.json  <-- Place your downloaded Google JSON key here

B. Configure Environment Variables

Create a file named .env and add your secret credentials to it.

File: .env

    # Replace with your actual Discord bot token and client ID
    DISCORD_TOKEN="YOUR_BOT_TOKEN_HERE"
    CLIENT_ID="YOUR_DISCORD_CLIENT_ID_HERE"
    GUILD_ID="YOUR_DISCORD_SERVER_ID_HERE"

    You can get your Server ID (Guild ID) by right-clicking your server icon in Discord and selecting "Copy Server ID". You may need to enable Developer Mode in Discord settings first (under Advanced).

C. Configure Google Sheet/Doc IDs

Create a config.js file to hold non-secret configuration, like the IDs for your documents.

File: config.js

    // You can get these IDs from the URL of your Google Sheet and Doc
    // Example URL: https://docs.google.com/spreadsheets/d/THIS_IS_THE_ID/edit
    module.exports = {
        googleSheetId: 'YOUR_GOOGLE_SHEET_ID_HERE',
        googleDocId: 'YOUR_GOOGLE_DOC_ID_HERE',
    };
