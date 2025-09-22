const axios = require('axios');
const logger = require('@helpers/logger');
const path = require('path');

const esiCache = new Map(); // In-memory cache for ESI responses

const esi = axios.create({
    baseURL: 'https://esi.evetech.net/latest',
    headers: {
        'User-Agent': 'WITv3.0 Discord Bot / Contact: teknick on Discord'
    }
});

/**
 * Logs ESI rate limit information from response headers.
 * @param {object} headers - The response headers from an Axios/ESI call.
 * @param {string} endpoint - The endpoint that was called, for context.
 * @param {string} [caller] - The path of the file that initiated the ESI call.
 */
function logRateLimit(headers, endpoint, caller) {
    if (headers) {
        const limitRemain = headers['x-esi-error-limit-remain'];
        const limitReset = headers['x-esi-error-limit-reset'];
        const expires = headers['expires'];

        if (limitRemain !== undefined && limitReset !== undefined) {
            const limitRemainNum = parseInt(limitRemain, 10);
            let logFunc = logger.info;

            if (limitRemainNum < 25) {
                logFunc = logger.error;
            } else if (limitRemainNum < 50) {
                logFunc = logger.warn;
            }

            logFunc(`ESI Rate Limit: ${limitRemain}/100 remaining. Resets in ${limitReset}s.`);
        }

        if (expires) {
            const expiryDate = new Date(expires);
            const now = new Date();
            const secondsUntilExpiry = Math.round((expiryDate - now) / 1000);
            if (secondsUntilExpiry > 0) {
                let expiryString;
                const callerName = caller ? ` from ${path.basename(caller)}` : '';
                if (secondsUntilExpiry >= 3600) {
                    const hours = Math.floor(secondsUntilExpiry / 3600);
                    const minutes = Math.floor((secondsUntilExpiry % 3600) / 60);
                    const seconds = secondsUntilExpiry % 60;
                    expiryString = `${hours}h ${minutes}m ${seconds}s (${secondsUntilExpiry}s total)`;
                } else if (secondsUntilExpiry >= 60) {
                    const minutes = Math.floor(secondsUntilExpiry / 60);
                    const seconds = secondsUntilExpiry % 60;
                    expiryString = `${minutes}m ${seconds}s (${secondsUntilExpiry}s total)`;
                } else {
                    expiryString = `${secondsUntilExpiry}s`;
                }
                logger.info(`ESI Cache for ${endpoint}${callerName} expires in ${expiryString}.`);
            }
        }
    }
}

async function requestWithRetries(requestFunc, endpoint, caller, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await requestFunc();
            logRateLimit(response.headers, endpoint, caller); // Log rate limit on successful requests
            return response; // Return the full response object
        } catch (error) {
            logRateLimit(error.response?.headers, endpoint, caller); // Also log rate limit on errored requests

            const status = error.response?.status;
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
                logger.error(`ESI request to ${endpoint} failed after all retries: ${errorMessage}`);
                throw error;
            }
        }
    }
}

module.exports = {
    /**
     * Performs a GET request to the ESI API, utilizing an in-memory cache.
     * @param {object} options - The request options.
     * @param {string} options.endpoint - The ESI endpoint to call.
     * @param {object} [options.params] - The URL parameters for the request.
     * @param {object} [options.headers] - The request headers.
     * @param {string} [options.caller] - The file path of the calling module.
     * @returns {Promise<any>} The data from the ESI response.
     */
    get: async ({ endpoint, params, headers, caller }) => {
        // Create a unique key for the request based on endpoint and params
        const cacheKey = `${endpoint}?${JSON.stringify(params || {})}`;
        const cachedItem = esiCache.get(cacheKey);
        const callerName = caller ? path.basename(caller) : 'Unknown';

        // Check if a valid, non-expired item is in the cache
        if (cachedItem && cachedItem.expires > Date.now()) {
            logger.info(`ESI Cache HIT for ${endpoint} from ${callerName}.`);
            return cachedItem.data; // Return cached data
        }

        // If not in cache or expired, make the request
        logger.info(`ESI Cache MISS for ${endpoint} from ${callerName}. Fetching from ESI.`);
        const response = await requestWithRetries(() => esi.get(endpoint, { params, headers }), endpoint, caller);

        // After a successful request, update the cache if an expires header is present
        if (response && response.headers && response.headers.expires) {
            const expiryDate = new Date(response.headers.expires);
            esiCache.set(cacheKey, {
                data: response.data,
                expires: expiryDate.getTime()
            });
        }

        return response.data;
    },

    /**
     * Performs a POST request to the ESI API. POST requests are not cached.
     * @param {object} options - The request options.
     * @param {string} options.endpoint - The ESI endpoint to call.
     * @param {object} [options.data] - The body of the request.
     * @param {object} [options.headers] - The request headers.
     * @param {string} [options.caller] - The file path of the calling module.
     * @returns {Promise<any>} The data from the ESI response.
     */
    post: async ({ endpoint, data, headers, caller }) => {
        const response = await requestWithRetries(() => esi.post(endpoint, data, { headers }), endpoint, caller);
        return response.data;
    },
};

