const { EmbedBuilder } = require('discord.js');
const axios = require('axios');
const logger = require('@helpers/logger');
const configManager = require('@helpers/configManager');
const db = require('@helpers/database');

// Cache will now be an object storing { branchName: sha }
let lastKnownShas = {};

/**
 * Initializes the last known SHAs from the database on startup.
 * This version is more robust against malformed data.
 */
async function initializeLastSha() {
    try {
        const rows = await db.query("SELECT value FROM config WHERE key_name = 'lastCommitSha'");
        if (rows.length > 0 && rows[0].value) {
            let parsedValue;
            try {
                parsedValue = JSON.parse(rows[0].value);
            } catch (e) {
                logger.error('Failed to parse lastCommitSha JSON from DB. Value was:', rows[0].value);
                lastKnownShas = {};
                return;
            }

            // Ensure the parsed value is a non-null object
            if (typeof parsedValue === 'object' && parsedValue !== null && !Array.isArray(parsedValue)) {
                lastKnownShas = parsedValue;
                logger.info(`Initialized last known commit SHAs from DB:`, lastKnownShas);
            } else {
                logger.warn(`lastCommitSha in DB is not a valid object. Resetting. Value was:`, parsedValue);
                lastKnownShas = {};
            }
        } else {
            lastKnownShas = {}; // Initialize as an empty object if not found in DB
        }
    } catch (error) {
        logger.error('Failed to initialize last commit SHAs from database:', error);
        lastKnownShas = {}; // Reset on error to be safe
    }
}


/**
 * Saves the latest commit SHAs object to the database.
 * @param {object} shas - The object mapping branch names to their latest commit SHA.
 */
async function saveLastShas(shas) {
    try {
        const valueToStore = JSON.stringify(shas);
        const sql = "INSERT INTO config (key_name, value) VALUES ('lastCommitSha', ?) ON DUPLICATE KEY UPDATE value = ?";
        await db.query(sql, [valueToStore, valueToStore]);
        lastKnownShas = shas; // Update the in-memory cache
    } catch (error) {
        logger.error(`Failed to save last commit SHAs to database:`, error);
    }
}

/**
 * Checks the specified GitHub repository branches for new commits and posts them to Discord.
 * @param {import('discord.js').Client} client The Discord client instance.
 */
async function checkGithubForUpdates(client) {
    const config = configManager.get();
    const repoUrl = config.githubRepoUrl ? config.githubRepoUrl[0] : null;
    let branches = config.githubBranch || []; // Expecting an array
    const channelId = config.githubChannelId ? config.githubChannelId[0] : null;
    const githubToken = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;

    // Defensively ensure 'branches' is an array.
    if (!Array.isArray(branches)) {
        logger.warn(`'githubBranch' config is not an array. It is: ${JSON.stringify(branches)}. Treating as a single-item array.`);
        branches = [String(branches)];
    }

    if (!repoUrl || !channelId || branches.length === 0) {
        logger.warn('GitHub watcher is missing repository URL, channel ID, or branches in config.');
        return;
    }

    const urlParts = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!urlParts) {
        logger.error(`Invalid GitHub repository URL format: ${repoUrl}`);
        return;
    }
    const owner = urlParts[1];
    const repo = urlParts[2].replace('.git', '');

    const headers = { 'Accept': 'application/vnd.github.v3+json' };
    if (githubToken) {
        headers['Authorization'] = `token ${githubToken}`;
    }

    let hasChanges = false;

    for (const branch of branches) {
        try {
            const apiUrl = `https://api.github.com/repos/${owner}/${repo}/commits/${branch}`;
            const response = await axios.get(apiUrl, { headers });
            const latestCommit = response.data;

            if (!latestCommit || !latestCommit.sha) {
                logger.warn(`Could not fetch latest commit from GitHub for branch: ${branch}.`);
                continue; // Skip to the next branch
            }

            const lastShaForBranch = lastKnownShas[branch];

            // If we have a SHA for this branch and it's different from the latest one, post a notification.
            if (lastShaForBranch && lastShaForBranch !== latestCommit.sha) {
                logger.info(`New commit found on branch '${branch}': ${latestCommit.sha}`);

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

            // Update the last known SHA for this branch if it's new or has changed.
            if (lastKnownShas[branch] !== latestCommit.sha) {
                lastKnownShas[branch] = latestCommit.sha;
                hasChanges = true;
            }

        } catch (error) {
            if (error.response) {
                logger.error(`Error fetching from GitHub API for branch '${branch}': ${error.response.status} - ${JSON.stringify(error.response.data)}`);
            } else {
                logger.error(`Error connecting to GitHub API for branch '${branch}': ${error.message}`);
            }
        }
    }

    // Save the updated SHAs to the database if any changes were detected
    if (hasChanges) {
        await saveLastShas(lastKnownShas);
    }
}

module.exports = {
    checkGithubForUpdates,
    initializeLastSha,
};

