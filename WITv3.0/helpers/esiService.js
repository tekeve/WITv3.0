const axios = require('axios');
const logger = require('@helpers/logger');

const esi = axios.create({
    baseURL: 'https://esi.evetech.net/latest',
    headers: {
        // IMPORTANT: It's a good practice to identify your application.
        // Please replace this with your character name and contact method.
        'User-Agent': 'WITv3.0 Discord Bot / Contact: teknick on Discord'
    }
});

async function requestWithRetries(requestFunc, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await requestFunc();
            // --- FIX ---
            // On a successful request, return only the data payload.
            return response.data;
        } catch (error) {
            if (error.response && error.response.status === 420 && i < retries - 1) {
                const waitTime = delay * Math.pow(2, i);
                logger.warn(`ESI rate limit hit (420). Retrying in ${waitTime / 1000}s...`);
                await new Promise(res => setTimeout(res, waitTime));
            } else {
                // Return the whole error object on failure so the caller can inspect it.
                logger.error('ESI request failed after all retries:', error.message);
                return error; // Return the error instead of throwing it, allowing for graceful handling.
            }
        }
    }
}

module.exports = {
    get: (endpoint, params, headers = {}) => requestWithRetries(() => esi.get(endpoint, { params, headers })),
    post: (endpoint, data, headers = {}) => requestWithRetries(() => esi.post(endpoint, data, { headers })),
};

