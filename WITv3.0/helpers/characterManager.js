const fs = require('fs');
const path = require('path');
const logger = require('@helpers/logger');

const dataPath = path.join(__dirname, '..', 'commanderlist.json');

// Helper function to read the JSON data file
function readData() {
    try {
        const jsonData = fs.readFileSync(dataPath, 'utf8');
        return JSON.parse(jsonData);
    } catch (error) {
        logger.error('Error reading commanderlist.json:', error);
        return {}; // Return empty object on error
    }
}

// Helper function to write to the JSON data file
function writeData(data) {
    try {
        const jsonString = JSON.stringify(data, null, 2);
        fs.writeFileSync(dataPath, jsonString);
    } catch (error) {
        logger.error('Error writing to commanderlist.json:', error);
    }
}

// Export all the functions that our commands will use
module.exports = {
    // Adds a main character for a user
    addMain: (discordId, mainChar, roles) => {
        const data = readData();
        data[discordId] = {
            mainChar: mainChar,
            alts: [],
            roles: roles
        };
        writeData(data);
        return true;
    },

    // Adds an alt character for a user
    addAlt: (discordId, altChar) => {
        const data = readData();
        if (!data[discordId] || !data[discordId].mainChar) {
            return { success: false, message: 'You must register a main character first.' };
        }
        if (data[discordId].alts.includes(altChar)) {
            return { success: false, message: 'That alt is already registered.' };
        }
        data[discordId].alts.push(altChar);
        writeData(data);
        return { success: true };
    },

    // Deletes a character (main or alt) for a user
    deleteChar: (discordId, charName) => {
        const data = readData();
        if (!data[discordId]) {
            return { success: false, message: 'No characters found for this user.' };
        }
        // If the character to delete is the main, delete the entire entry
        if (data[discordId].mainChar.toLowerCase() === charName.toLowerCase()) {
            delete data[discordId];
            writeData(data);
            return { success: true, message: `Main character ${charName} and all associated alts have been deleted.` };
        }
        // Otherwise, try to remove it from the alts list
        const initialAltCount = data[discordId].alts.length;
        data[discordId].alts = data[discordId].alts.filter(alt => alt.toLowerCase() !== charName.toLowerCase());

        if (data[discordId].alts.length === initialAltCount) {
            return { success: false, message: `Could not find an alt named ${charName}.` };
        }

        writeData(data);
        return { success: true, message: `Alt character ${charName} has been deleted.` };
    },

    // Gets all characters for a user
    getChars: (discordId) => {
        const data = readData();
        return data[discordId] || null;
    },

    // Finds all users who have a specific role
    findUsersInRole: (roleName) => {
        const data = readData();
        const usersInRole = [];
        for (const discordId in data) {
            if (data[discordId].roles && data[discordId].roles.some(role => role.toLowerCase() === roleName.toLowerCase())) {
                usersInRole.push({ mainChar: data[discordId].mainChar, discordId: discordId });
            }
        }
        return usersInRole;
    }
};