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

    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}


/**
 * Creates the webhook handler middleware for Express.
 * @param {Client} client The Discord client instance.
 * @returns An async function that handles the request and response.
 */
exports.handleWebhook = (client) => async (req, res) => {
    if (!verifySignature(req)) {
        logger.warn('Received an invalid GitHub webhook signature.');
        return res.status(401).send('Invalid signature');
    }

    const event = req.headers['x-github-event'];

    // We only care about 'push' events
    if (event === 'push') {
        logger.info('Received a push event from GitHub webhook.');
        // Trigger the check for updates
        await checkGithubForUpdates(client);
    }

    res.status(204).send(); // Send a 'No Content' response to GitHub
};
