const axios = require('axios');
const logger = require('@helpers/logger');
const path = require('path');

const esiCache = new Map(); // In-memory cache for ESI responses

const esi = axios.create({
    baseURL: 'https://esi.evetech.net/latest',
    headers: {
        'User-Agent': 'WITv3.0/v1.1 (discord: teknick / discord: bladeravinger, eve: Bella Cadelanne)'
    }
});

async function requestWithRetries(requestFunc, endpoint, caller, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await requestFunc();
            const headers = response.headers;

            // Log Rate Limit info on success
            if (headers && headers['x-esi-error-limit-remain']) {
                const limitRemain = parseInt(headers['x-esi-error-limit-remain'], 10);
                const limitReset = headers['x-esi-error-limit-reset'];
                let logFunc = logger.info;

                if (limitRemain < 25) logFunc = logger.error;
                else if (limitRemain < 50) logFunc = logger.warn;

                logFunc(`ESI Rate Limit: ${limitRemain}/100 remaining. Resets in ${limitReset}s.`);
            }

            // Log Cache Expiry on success
            if (headers && headers['expires']) {
                const expiryDate = new Date(headers['expires']);
                const secondsUntilExpiry = Math.round((expiryDate - new Date()) / 1000);
                if (secondsUntilExpiry > 0) {
                    const callerName = caller ? ` from ${path.basename(caller)}` : '';
                    logger.info(`ESI Cache for ${endpoint}${callerName} expires in ${secondsUntilExpiry}s.`);
                }
            }

            return response;

        } catch (error) {

            // Handle network errors or code bugs first
            if (!error.response || !error.response.headers) {
                logger.error(`Request to ${endpoint} failed with no response: ${error.message}`);
                throw error; // No point retrying if the server is unreachable
            }

            // If we have a response, log its rate limit info
            const errorHeaders = error.response.headers;
            if (errorHeaders && errorHeaders['x-esi-error-limit-remain']) {
                const limitRemain = parseInt(errorHeaders['x-esi-error-limit-remain'], 10);
                logger.warn(`ESI Rate Limit on error: ${limitRemain}/100 remaining.`);
            }

            // Handle Retry
            const status = error.response.status;
            const hasRetriesLeft = i < retries - 1;

            if (hasRetriesLeft) {
                const waitTime = delay * Math.pow(2, i);
                let shouldRetry = false;

                switch (status) {
                    case 420: // Rate Limited
                        logger.warn(`ESI rate limit hit (420). Retrying in ${waitTime / 1000}s...`);
                        shouldRetry = true;
                        break;
                    case 502: // Bad Gateway
                    case 503: // Service Unavailable
                    case 504: // Gateway Timeout
                        logger.info(`ESI service unavailable (Status ${status}). Retrying in ${waitTime / 1000}s...`);
                        shouldRetry = true;
                        break;
                }

                if (shouldRetry) {
                    await new Promise(res => setTimeout(res, waitTime));
                    continue; // Go to the next iteration of the for loop
                }
            }

            // If no retries are left, or the error was not retryable, throw
            const errorData = JSON.stringify(error.response.data);
            logger.error(`ESI request to ${endpoint} failed after all retries with status ${status}. Data: ${errorData}`);
            throw error;
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
     * @returns {Promise<{data: any, expires: number|null}>} The data and expiry timestamp from the ESI response.
     */
    get: async ({ endpoint, params, headers, caller }) => {
        // Create a unique key for the request based on endpoint and params
        const cacheKey = `${endpoint}?${JSON.stringify(params || {})}`;
        const cachedItem = esiCache.get(cacheKey);
        const callerName = caller ? path.basename(caller) : 'Unknown';

        // Check if a valid, non-expired item is in the cache
        if (cachedItem && cachedItem.expires > Date.now()) {
            logger.info(`ESI Cache HIT for ${endpoint} from ${callerName}.`);
            return { data: cachedItem.data, expires: cachedItem.expires }; // Return cached data
        }

        // If not in cache or expired, make the request
        logger.info(`ESI Cache MISS for ${endpoint} from ${callerName}. Making a real ESI call...`);
        const response = await requestWithRetries(() => esi.get(endpoint, { params, headers }), endpoint, caller);

        // After a successful request, update the cache if an expires header is present
        let expiryTimestamp = null;
        if (response && response.headers && response.headers.expires) {
            const expiryDate = new Date(response.headers.expires);
            expiryTimestamp = expiryDate.getTime();
            esiCache.set(cacheKey, {
                data: response.data,
                expires: expiryTimestamp
            });
        }

        return { data: response.data, expires: expiryTimestamp };
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
        const callerName = caller ? path.basename(caller) : 'Unknown';
        logger.info(`Making a real ESI POST call to ${endpoint} from ${callerName}...`);
        const response = await requestWithRetries(() => esi.post(endpoint, data, { headers }), endpoint, caller);
        return response.data;
    },
};

