const logger = require('@helpers/logger');
const { checkGithubForUpdates } = require('@helpers/githubWatcher');
const configManager = require('@helpers/configManager');
const crypto = require('crypto');

/**
 * Verifies the signature of the incoming webhook payload.
 * @param {object} req - The Express request object.
 * @returns {boolean} - True if the signature is valid, false otherwise.
 */
function verifySignature(req) {
    const config = configManager.get();
    const secret = config.githubWebhookSecret ? config.githubWebhookSecret[0] : null;

    if (!secret) {
        logger.warn('GitHub webhook secret is not configured. Skipping signature verification.');
        return true; // If no secret is configured, we can't verify.
    }

    const signature = req.headers['x-hub-signature-256'];
    if (!signature) {
        return false;
    }

    const hmac = crypto.createHmac('sha256', secret);
    const digest = 'sha256=' + hmac.update(JSON.stringify(req.body)).digest('hex');

    try {
        return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
    } catch (error) {
        logger.error('Error during signature comparison:', error);
        return false;
    }
}


/**
 * Creates the webhook handler middleware for Express.
 * @param {Client} client The Discord client instance.
 * @returns An async function that handles the request and response.
 */
exports.handleWebhook = (client) => (req, res) => {
    if (!verifySignature(req)) {
        logger.warn('Received an invalid GitHub webhook signature.');
        return res.status(401).send('Invalid signature');
    }

    const event = req.headers['x-github-event'];

    // We only care about 'push' events
    if (event === 'push') {
        logger.info('Received a push event from GitHub webhook. Acknowledging immediately.');

        // --- FIX: Acknowledge GitHub immediately ---
        // Send a 'No Content' response right away to prevent a timeout.
        res.status(204).send();

        // --- Process the update in the background ---
        // Call the update function without 'await'.
        // This lets the response be sent while the heavy lifting happens afterward.
        checkGithubForUpdates(client).catch(err => {
            logger.error('Error processing GitHub webhook payload in the background:', err);
        });

    } else {
        // If it's not a push event, just acknowledge it and do nothing.
        res.status(204).send();
    }
};

