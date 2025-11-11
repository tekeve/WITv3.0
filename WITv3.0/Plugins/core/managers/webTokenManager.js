/**
 * Manages the creation and validation of single-use web tokens.
 * These tokens are used to authorize users for limited-time web pages.
 */
class WebTokenManager {
    constructor(db, logger) {
        this.db = db;
        this.logger = logger;
        // You could also use an in-memory Map for simplicity if persistence isn't needed
        // this.tokenStore = new Map();
    }

    /**
     * Creates an Express middleware to validate a token.
     * @param {string} expectedScope - The scope this route expects (e.g., 'srp').
     * @param {boolean} consumeToken - If true, the token will be marked as 'is_used' upon validation.
     * @returns {function} Express middleware function.
     */
    validateTokenMiddleware(expectedScope, consumeToken = false) {
        return async (req, res, next) => {
            // Check both query (for GET) and body (for POST)
            const token = req.query.token || req.body.token;

            if (!token) {
                this.logger.warn(`Token missing for scope ${expectedScope}`);
                return res.status(401).render('error', { message: 'Access Denied: No token provided.', error: { status: 401 } });
            }

            try {
                const [rows] = await this.db.query(
                    'SELECT * FROM web_tokens WHERE token = ? AND is_used = false AND expires_at > NOW()',
                    [token]
                );

                if (rows.length === 0) {
                    this.logger.warn(`Invalid, expired, or used token: ${token}`);
                    return res.status(403).render('error', { message: 'Access Denied: Token is invalid, expired, or has already been used.', error: { status: 403 } });
                }

                const tokenData = rows[0];

                if (tokenData.scope !== expectedScope) {
                    this.logger.warn(`Token scope mismatch for ${token}. Expected ${expectedScope}, got ${tokenData.scope}`);
                    return res.status(403).render('error', { message: 'Access Denied: Token is not valid for this page.', error: { status: 403 } });
                }

                // --- SUCCESS ---
                if (consumeToken) {
                    // Token is valid. Mark it as used.
                    await this.db.query('UPDATE web_tokens SET is_used = true WHERE token = ?', [token]);
                    this.logger.info(`Token consumed for user ${tokenData.user_id}, scope ${tokenData.scope}`);
                } else {
                    this.logger.info(`Token validated (but not consumed) for user ${tokenData.user_id}, scope ${tokenData.scope}`);
                }

                // Store user info in the request object for the *next* handler
                req.tokenData = tokenData;

                // Proceed to the actual route handler
                next();

            } catch (error) {
                this.logger.error('Error during token validation:', { error: error.message });
                return res.status(500).render('error', { message: 'Internal Server Error', error: {} });
            }
        };
    }
}

module.exports = WebTokenManager;