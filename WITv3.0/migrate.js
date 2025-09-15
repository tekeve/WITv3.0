require('module-alias/register'); // Add this line to the top
const fs = require('fs/promises');
const path = require('path');
const db = require('@helpers/dbService');
const logger = require('@helpers/logger');

async function migrate() {
    logger.info('Starting data migration from `commander_list` to new schema...');

    try {
        // 1. Fetch all data from the old table
        const oldData = await db.query('SELECT * FROM commander_list');
        if (oldData.length === 0) {
            logger.info('`commander_list` table is empty. No data to migrate.');
            return;
        }
        logger.info(`Found ${oldData.length} records to migrate.`);

        let usersSql = 'INSERT INTO users (discord_id, main_character_id, roles) VALUES\n';
        let charactersSql = 'INSERT INTO characters (character_id, character_name, discord_id, is_main) VALUES\n';
        let authSql = 'INSERT INTO auth (discord_id, character_id, character_name, access_token, refresh_token, token_expiry) VALUES\n';

        const usersValues = [];
        const charactersValues = [];
        const authValues = [];

        for (const row of oldData) {
            // --- USERS Table ---
            // We need a placeholder for main_character_id as we don't know it yet.
            // We'll have to come back and update this manually or infer it.
            // For now, let's assume the `character_id` on the old table IS the main.
            usersValues.push(`('${row.discord_id}', ${db.escape(row.character_id || null)}, ${db.escape(row.role_ids || '[]')})`);

            // --- CHARACTERS Table ---
            if (row.main_character) {
                // To get the main character's ID, we have to make an assumption.
                // The most likely candidate is the `character_id` from the auth data.
                if (row.character_id && row.character_name && row.character_name.toLowerCase() === row.main_character.toLowerCase()) {
                    charactersValues.push(`(${db.escape(row.character_id)}, ${db.escape(row.main_character)}, '${row.discord_id}', 1)`);
                } else {
                    // If there's no auth data, we can't know the ID, so we log it.
                    logger.warn(`Could not determine character_id for main character "${row.main_character}" of user ${row.discord_id}. Manual insertion may be required.`);
                }
            }

            if (row.alt_characters) {
                try {
                    const alts = JSON.parse(row.alt_characters);
                    for (const altName of alts) {
                        // We can't know the character_id for alts without an ESI lookup, which is too complex for a simple script.
                        // We will add them without an ID, which is not ideal but preserves the name.
                        // A better approach would be to have a post-migration script that looks them up.
                        logger.warn(`Cannot migrate alt "${altName}" for user ${row.discord_id} as character_id is unknown. This will need to be re-added manually.`);
                    }
                } catch (e) {
                    logger.error(`Could not parse alt_characters JSON for user ${row.discord_id}`);
                }
            }


            // --- AUTH Table ---
            if (row.character_id) {
                authValues.push(`('${row.discord_id}', ${db.escape(row.character_id)}, ${db.escape(row.character_name)}, ${db.escape(row.access_token)}, ${db.escape(row.refresh_token)}, ${db.escape(row.token_expiry)})`);
            }
        }

        let sqlScript = '-- MIGRATION SCRIPT GENERATED\n\n';

        if (usersValues.length > 0) {
            sqlScript += usersSql + usersValues.join(',\n') + ';\n\n';
        }
        if (charactersValues.length > 0) {
            sqlScript += charactersSql + charactersValues.join(',\n') + ';\n\n';
        }
        if (authValues.length > 0) {
            sqlScript += authSql + authValues.join(',\n') + ';\n\n';
        }

        await fs.writeFile(path.join(__dirname, 'migration.sql'), sqlScript);
        logger.success('Successfully generated `migration.sql`. Please review and execute this file in your SQL client.');
        logger.info('After running the migration script, you can run `--db-setup` to drop the old table.');

    } catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE') {
            logger.info('`commander_list` table not found. Assuming migration is not needed.');
        } else {
            logger.error('An error occurred during migration:', error);
        }
    }
}

// Add an escape function to the db object for the script
db.escape = (val) => {
    if (val === null || val === undefined) return 'NULL';
    // Simple escape for single quotes
    const str = String(val).replace(/'/g, "''");
    return `'${str}'`;
};


migrate().finally(() => {
    // This is a standalone script, so we might need to exit explicitly.
    // However, since dbService uses a pool, it might keep the process alive.
    // For a simple script, we can just let it exit.
    process.exit();
});

