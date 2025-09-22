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
            const status = error.response?.status;
            // Check for common temporary ESI errors (rate limiting, downtime) and retry
            if (status && [420, 502, 503, 504].includes(status) && i < retries - 1) {
                const waitTime = delay * Math.pow(2, i);
                if (status === 420) {
                    logger.warn(`ESI rate limit hit (420). Retrying in ${waitTime / 1000}s...`);
                } else {
                    logger.info(`ESI service unavailable (Status ${status}). Retrying in ${waitTime / 1000}s...`);
                }
                await new Promise(res => setTimeout(res, waitTime));
            } else {
                let errorMessage = error.message;
                if (error.response) {
                    const status = error.response.status;
                    const headers = JSON.stringify(error.response.headers, null, 2);
                    const data = JSON.stringify(error.response.data, null, 2);
                    errorMessage = `Status ${status}\nHeaders: ${headers}\nData: ${data}`;
                }
                logger.error(`ESI request failed after all retries: ${errorMessage}`);
                throw error; // Re-throw the error after all retries have failed
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
