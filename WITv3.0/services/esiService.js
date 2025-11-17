const axios = require('axios');
const btoa = require('btoa'); // For Basic Auth: 'Basic ' + btoa(client_id:client_secret)

// Helper for exponential backoff
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Manages all ESI (EVE Online API) requests, including authentication and token refreshing.
 * This is a foundational service used by other managers.
 */
class EsiService {

    /**
     * @param {mysql.Pool} db - The database pool.
     * @param {function} loggerFunc - The getLogger factory function.
     * @param {object} config - The process.env config object.
     */
    constructor(db, loggerFunc, config) {
        this.db = db;
        this.logger = loggerFunc('EsiService'); // Create its own logger
        this.config = config;

        // ESI Configuration
        this.esiBaseUrl = 'https.esi.evetech.net/latest';
        this.tokenUrl = 'https://login.eveonline.com/v2/oauth/token';
        this.clientId = this.config.EVE_CLIENT_ID;
        this.clientSecret = this.config.EVE_CLIENT_SECRET;

        if (!this.clientId || !this.clientSecret) {
            this.logger.error('EVE_CLIENT_ID or EVE_CLIENT_SECRET is not set in .env. ESI service will fail.');
        }

        // Create an axios instance for ESI requests
        this.api = axios.create({
            baseURL: this.esiBaseUrl,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': `WITv3.0 (${this.config.BOT_OWNER_CONTACT || 'unknown'})`
            }
        });
    }

    /**
     * The new generic request method for all ESI calls.
     * Handles authentication, rate limiting, and exponential backoff.
     * @param {string} endpoint - The ESI endpoint (e.g., '/incursions/', '/characters/12345/').
     * @param {string} [accessToken] - An optional ESI access token for secured endpoints.
     * @param {object} [options] - Optional axios request options (e.g., { method: 'POST', data: {...} }).
     * @returns {Promise<any>} The data from the ESI response.
     * @throws {Error} If the request fails after all retries.
     */
    async request(endpoint, accessToken = null, options = {}) {
        const maxRetries = 5;
        let attempt = 0;
        const baseDelay = 500; // 500ms

        while (attempt < maxRetries) {
            try {
                const config = { ...options }; // Copy options (like method, data)
                config.headers = { ...(options.headers || {}) }; // Copy headers

                if (accessToken) {
                    config.headers['Authorization'] = `Bearer ${accessToken}`;
                }

                // The actual request
                const response = await this.api.request({
                    url: endpoint,
                    ...config
                });

                // Success! Return the data.
                return response.data;

            } catch (error) {
                attempt++;
                let shouldRetry = false;
                let errorType = 'Unknown Error';

                // Check if it's an ESI error or a different network error
                if (error.response) {
                    const status = error.response.status;
                    const esiError = error.response.data ? error.response.data.error : 'Unknown ESI Error';

                    // ESI Rate Limit (420) or Server Errors (5xx) are retryable
                    if (status === 420 || status >= 500) {
                        shouldRetry = true;
                        errorType = `ESI Error ${status} (${esiError})`;
                    }
                    // Non-retryable errors (e.g., 400, 401, 403, 404)
                    else {
                        this.logger.warn(`[ESI] Request failed (Not Retryable): ${status} ${esiError}`, { endpoint });
                        throw error; // Don't retry, just fail
                    }
                }
                // Network error (no response)
                else {
                    shouldRetry = true; // Retry network errors
                    errorType = `Network Error (${error.message})`;
                }

                // Handle retry logic
                if (shouldRetry) {
                    if (attempt >= maxRetries) {
                        this.logger.error(`[ESI] Request failed after ${maxRetries} attempts: ${errorType}`, { endpoint });
                        throw error; // Give up
                    }

                    // Exponential backoff with jitter
                    const delay = (baseDelay * Math.pow(2, attempt - 1)) + (Math.random() * 100);
                    this.logger.warn(`[ESI] Request failed (Attempt ${attempt}): ${errorType}. Retrying in ${delay.toFixed(0)}ms...`, { endpoint });
                    await sleep(delay);
                }
            }
        }
    }


    /**
     * Verifies an ESI SSO authorization code to get access/refresh tokens.
     * This is a specific auth flow and does not use the generic 'request' method.
     * @param {string} authCode - The authorization code from the ESI callback.
     * @returns {Promise<object|null>} An object with { access_token, refresh_token, expires_at, character_info } or null.
     */
    async verifySsoCode(authCode) {
        this.logger.info('[ESI] Verifying SSO auth code...');
        const authHeader = 'Basic ' + btoa(`${this.clientId}:${this.clientSecret}`);

        try {
            // --- 1. Exchange code for tokens ---
            const tokenResponse = await axios.post(this.tokenUrl,
                new URLSearchParams({
                    'grant_type': 'authorization_code',
                    'code': authCode
                }),
                {
                    headers: {
                        'Authorization': authHeader,
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Host': 'login.eveonline.com'
                    }
                }
            );

            const tokenData = tokenResponse.data;
            const accessToken = tokenData.access_token;
            const refreshToken = tokenData.refresh_token;
            const expires_at = Date.now() + (tokenData.expires_in * 1000);

            // --- 2. Verify token and get Character ID ---
            const verifyResponse = await axios.get('https://login.eveonline.com/oauth/verify', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });

            const charInfo = verifyResponse.data;
            this.logger.success(`[ESI] Verified SSO code for ${charInfo.CharacterName} (ID: ${charInfo.CharacterID})`);

            return {
                access_token: accessToken,
                refresh_token: refreshToken,
                expires_at: expires_at,
                character_id: charInfo.CharacterID,
                character_name: charInfo.CharacterName,
            };

        } catch (error) {
            this.logger.error('[ESI] Failed to verify SSO code:', {
                error: error.response ? error.response.data : (error.stack || error.message)
            });
            return null;
        }
    }

    /**
     * Refreshes an expired ESI access token using a refresh token.
     * This is a specific auth flow and does not use the generic 'request' method.
     * @param {string} refreshToken - The ESI refresh token.
     * @returns {Promise<object|null>} An object with { access_token, refresh_token, expires_at } or null.
     */
    async refreshAccessToken(refreshToken) {
        this.logger.info('[ESI] Refreshing ESI access token...');
        const authHeader = 'Basic ' + btoa(`${this.clientId}:${this.clientSecret}`);

        try {
            const response = await axios.post(this.tokenUrl,
                new URLSearchParams({
                    'grant_type': 'refresh_token',
                    'refresh_token': refreshToken
                }),
                {
                    headers: {
                        'Authorization': authHeader,
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Host': 'login.eveonline.com'
                    }
                }
            );

            const tokenData = response.data;
            const expires_at = Date.now() + (tokenData.expires_in * 1000); // Convert 'expires_in' (seconds) to a timestamp

            this.logger.success('[ESI] Successfully refreshed access token.');
            return {
                access_token: tokenData.access_token,
                refresh_token: tokenData.refresh_token, // ESI may return a new refresh token
                expires_at: expires_at,
            };
        } catch (error) {
            this.logger.error('[ESI] Failed to refresh access token:', {
                error: error.response ? error.response.data : (error.stack || error.message)
            });
            // Handle 'invalid_token' or other specific errors that mean the refresh token is dead
            if (error.response && error.response.data && error.response.data.error === 'invalid_token') {
                this.logger.error(`[ESI] Refresh token is invalid. User must re-authenticate.`);
            }
            return null;
        }
    }

}

module.exports = EsiService;