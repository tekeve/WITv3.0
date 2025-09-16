const axios = require('axios');
const logger = require('@helpers/logger');

const esi = axios.create({
    baseURL: 'https://esi.evetech.net/latest',
    headers: {
        'User-Agent': 'WITv3.0 Discord Bot / Contact: teknick on Discord'
    }
});

async function requestWithRetries(requestFunc, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await requestFunc();
            return response.data;
        } catch (error) {
            if (error.response && error.response.status === 420 && i < retries - 1) {
                const waitTime = delay * Math.pow(2, i);
                logger.warn(`ESI rate limit hit (420). Retrying in ${waitTime / 1000}s...`);
                await new Promise(res => setTimeout(res, waitTime));
            } else {
                const errorMessage = error.response ? `Status ${error.response.status}: ${JSON.stringify(error.response.data)}` : error.message;
                logger.error(`ESI request failed after all retries: ${errorMessage}`);
                throw error;
            }
        }
    }
}

// Reverting to the simpler, more reliable method of letting axios handle params.
// The previous manual URL builder was causing the 404 issue.
module.exports = {
    get: (endpoint, params, headers = {}) => {
        return requestWithRetries(() => esi.get(endpoint, { params, headers }));
    },
    post: (endpoint, data, headers = {}) => {
        return requestWithRetries(() => esi.post(endpoint, data, { headers }));
    },
};

