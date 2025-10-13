const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const logger = require('@helpers/logger');

// Configuration for your database connection
const dbConfig = {
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    multipleStatements: true, // Keep this for the initial script part
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// Create a connection pool
const pool = mysql.createPool(dbConfig);

/**
 * Checks if the database connection is valid.
 * @returns {Promise<boolean>}
 */
async function ensureDatabaseExistsAndConnected() {
    try {
        await pool.query('SELECT 1');
        logger.success('Database connection successful!');
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Executes a SQL query.
 * @param {string} sql The SQL query string.
 * @param {Array} [args] The arguments for the query.
 * @returns {Promise<any>}
 */
async function query(sql, args) {
    try {
        const [rows] = await pool.execute(sql, args);
        return rows;
    } catch (error) {
        logger.error(`Database query failed: ${error.message}`);
        throw error;
    }
}

/**
 * Runs specific migration tasks programmatically after the main setup.
 */
async function runMigrations() {
    logger.info('Checking for necessary database migrations...');
    const dbName = dbConfig.database;
    const columnsToDrop = ['quiz_scouting', 'quiz_fitting', 'quiz_fleet_roles', 'quiz_site_mechanics'];

    try {
        const sql = `
            SELECT column_name 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE table_schema = ? 
              AND table_name = 'commander_training' 
              AND column_name IN (?)
        `;
        const [existingColumns] = await pool.query(sql, [dbName, [columnsToDrop]]);

        const foundColumns = existingColumns.map(c => c.column_name);

        if (foundColumns.length === 0) {
            logger.info('No migrations needed for commander_training table.');
            return;
        }

        logger.info(`Found legacy columns to remove: ${foundColumns.join(', ')}. Applying migration...`);

        const dropPromises = foundColumns.map(colName => {
            const dropSql = `ALTER TABLE \`commander_training\` DROP COLUMN \`${colName}\``;
            return pool.query(dropSql);
        });

        await Promise.all(dropPromises);
        logger.success(`Successfully removed ${foundColumns.length} legacy columns from the commander_training table.`);

    } catch (error) {
        logger.error('An error occurred during database migration:', error);
        // We throw the error so the setup process fails, which is safer than a partial migration.
        throw error;
    }
}

/**
 * Runs the initial database setup from the .sql file and then applies migrations.
 */
async function runSetup() {
    logger.info('Starting database setup...');
    try {
        const sqlFilePath = path.join(process.cwd(), './sql/database.sql');
        const sqlScript = fs.readFileSync(sqlFilePath, 'utf8');

        // Step 1: Execute the table creation script.
        // The script now contains only CREATE statements, which is safe for multipleStatements.
        await pool.query(sqlScript);
        logger.success('Database tables created/verified successfully!');

        // Step 2: Run programmatic migrations.
        await runMigrations();

        logger.success('Database setup and migration process completed successfully!');
    } catch (error) {
        logger.error('Failed to run database setup script:', error);
        throw error;
    }
}

module.exports = {
    query,
    runSetup,
    ensureDatabaseExistsAndConnected,
    pool
};

