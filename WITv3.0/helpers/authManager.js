const fs = require('fs');
const path = require('path');
const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

const tokensPath = path.join(__dirname, '..', 'authtokens.json');
const ESI_CLIENT_ID = process.env.ESI_CLIENT_ID;
const ESI_SECRET_KEY = process.env.ESI_SECRET_KEY;

// Helper to read the tokens file
function readTokens() {
    if (!fs.existsSync(tokensPath)) {
        return {};
    }
    try {
        const data = fs.readFileSync(tokensPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading authtokens.json:', error);
        return {};
    }
}

// Helper to write to the tokens file
function writeTokens(data) {
    try {
        fs.writeFileSync(tokensPath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error writing to authtokens.json:', error);
    }
}

// The main function to get a valid access token, refreshing if necessary
async function getAccessToken(discordId) {
    const tokens = readTokens();
    const userData = tokens[discordId];

    if (!userData) {
        return null; // User not authenticated
    }

    // Check if the token is expired (or close to it)
    const tokenExpires = new Date(userData.token_expiry).getTime();
    const isExpired = Date.now() >= tokenExpires - (60 * 1000); // 60-second buffer

    if (!isExpired) {
        return userData.access_token;
    }

    // Token is expired, let's refresh it
    console.log(`Access token for ${userData.character_name} expired. Refreshing...`);
    try {
        const base64Auth = Buffer.from(`${ESI_CLIENT_ID}:${ESI_SECRET_KEY}`).toString('base64');
        const response = await axios.post(
            'https://login.eveonline.com/v2/oauth/token',
            new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: userData.refresh_token,
            }),
            {
                headers: {
                    'Authorization': `Basic ${base64Auth}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Host': 'login.eveonline.com',
                },
            }
        );

        const newAccessToken = response.data.access_token;
        const newRefreshToken = response.data.refresh_token;
        const expiresIn = response.data.expires_in;

        // Update the user's data with the new tokens and expiry time
        tokens[discordId].access_token = newAccessToken;
        tokens[discordId].refresh_token = newRefreshToken; // The refresh token might be rotated
        tokens[discordId].token_expiry = new Date(Date.now() + expiresIn * 1000).toISOString();

        writeTokens(tokens);
        return newAccessToken;

    } catch (error) {
        console.error('Error refreshing token:', error.response ? error.response.data : error.message);
        return null; // Return null on error
    }
}

module.exports = {
    // Public function to save user authentication data
    saveUserAuth: (discordId, authData) => {
        const tokens = readTokens();
        tokens[discordId] = authData;
        writeTokens(tokens);
    },

    getUserAuthData: (discordId) => {
        const tokens = readTokens();
        return tokens[discordId] || null;
    },

    // Removes a user's authentication data
    removeUser: (discordId) => {
        const tokens = readTokens();
        if (tokens[discordId]) {
            delete tokens[discordId];
            writeTokens(tokens);
            return true; // Indicate success
        }
        return false; // Indicate user not found
    },

    // Export the getAccessToken function
    getAccessToken: getAccessToken
};
