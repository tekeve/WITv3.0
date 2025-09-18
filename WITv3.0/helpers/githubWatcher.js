const { EmbedBuilder } = require('discord.js');
const axios = require('axios');
const logger = require('@helpers/logger');
const configManager = require('@helpers/configManager');
const db = require('@helpers/database');

// In-memory cache for the last known commit SHA to prevent spamming on restarts.
// A more persistent solution (like a database) would be better for production.
let lastKnownSha = null;

/**
 * Initializes the last known SHA from the database on startup.
 */
async function initializeLastSha() {
    try {
        const rows = await db.query("SELECT value FROM config WHERE key_name = 'lastCommitSha'");
        if (rows.length > 0 && rows[0].value) {
            lastKnownSha = JSON.parse(rows[0].value)[0];
            logger.info(`Initialized last known commit SHA from DB: ${lastKnownSha}`);
        }
    } catch (error) {
        logger.error('Failed to initialize last commit SHA from database:', error);
    }
}

/**
 * Saves the latest commit SHA to the database.
 * @param {string} sha The commit SHA to save.
 */
async function saveLastSha(sha) {
    try {
        const valueToStore = JSON.stringify([sha]);
        const sql = "INSERT INTO config (key_name, value) VALUES ('lastCommitSha', ?) ON DUPLICATE KEY UPDATE value = ?";
        await db.query(sql, [valueToStore, valueToStore]);
        lastKnownSha = sha;
    } catch (error) {
        logger.error(`Failed to save last commit SHA to database: ${sha}`, error);
    }
}

/**
 * Checks the specified GitHub repository for new commits and posts them to Discord.
 * @param {import('discord.js').Client} client The Discord client instance.
 */
async function checkGithubForUpdates(client) {
    const config = configManager.get();
    const repoUrl = config.githubRepoUrl ? config.githubRepoUrl[0] : null;
    const branch = config.githubBranch ? config.githubBranch[0] : 'master';
    const channelId = config.githubChannelId ? config.githubChannelId[0] : null;
    const githubToken = process.env.GITHUB_PERSONAL_ACCESS_TOKEN; // Get the token from environment variables

    if (!repoUrl || !channelId) {
        logger.warn('GitHub watcher is missing repository URL or channel ID in config.');
        return;
    }

    // Extract owner and repo name from the URL
    const urlParts = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!urlParts) {
        logger.error(`Invalid GitHub repository URL format: ${repoUrl}`);
        return;
    }
    const owner = urlParts[1];
    const repo = urlParts[2].replace('.git', '');

    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/commits/${branch}`;

    // --- MODIFICATION START ---
    // Configure headers for the API request. Include the auth token if it exists.
    const headers = {
        'Accept': 'application/vnd.github.v3+json',
    };
    if (githubToken) {
        headers['Authorization'] = `token ${githubToken}`;
    }
    // --- MODIFICATION END ---

    try {
        // --- MODIFICATION ---
        // Pass the headers with the axios request
        const response = await axios.get(apiUrl, { headers });
        const latestCommit = response.data;

        if (!latestCommit || !latestCommit.sha) {
            logger.warn('Could not fetch latest commit from GitHub.');
            return;
        }

        // If we have a last known SHA and it's different from the latest one
        if (lastKnownSha && lastKnownSha !== latestCommit.sha) {
            logger.info(`New commit found: ${latestCommit.sha}`);

            const channel = await client.channels.fetch(channelId);
            if (channel) {
                const commit = latestCommit.commit;
                const author = commit.author;
                const embed = new EmbedBuilder()
                    .setColor(0x24292e)
                    .setTitle(`New Commit on ${repo}/${branch}`)
                    .setURL(latestCommit.html_url)
                    .setAuthor({
                        name: author.name,
                        iconURL: latestCommit.author ? latestCommit.author.avatar_url : null,
                        url: latestCommit.author ? latestCommit.author.html_url : null
                    })
                    .setDescription(`\`\`\`${commit.message}\`\`\``)
                    .addFields({ name: 'Commit SHA', value: `\`${latestCommit.sha.substring(0, 7)}\``, inline: true })
                    .setTimestamp(new Date(author.date));

                await channel.send({ embeds: [embed] });
            }
        }

        // Update the last known SHA
        if (lastKnownSha !== latestCommit.sha) {
            await saveLastSha(latestCommit.sha);
        }

    } catch (error) {
        if (error.response) {
            logger.error(`Error fetching from GitHub API: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        } else {
            logger.error(`Error connecting to GitHub API: ${error.message}`);
        }
    }
}

module.exports = {
    checkGithubForUpdates,
    initializeLastSha,
};

