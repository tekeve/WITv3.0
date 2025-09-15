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
    multipleStatements: true, // Keep this for setup
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// Create a connection pool instead of a single connection
const pool = mysql.createPool(dbConfig);

/**
 * Checks if the database connection is valid by running a simple query.
 * @returns {Promise<boolean>} - True if the connection is successful, false otherwise.
 */
async function ensureDatabaseExistsAndConnected() {
    try {
        await pool.query('SELECT 1 + 1 AS solution');
        logger.success('Database connection successful!');
        return true;
    } catch (error) {
        // We don't need to log the full error here, as a simple failure message is enough.
        // The setup instructions will guide the user.
        return false;
    }
}

// Public function to execute a query from the pool
async function query(sql, args) {
    try {
        const [rows] = await pool.execute(sql, args);
        return rows;
    } catch (error) {
        logger.error(`Database query failed: ${error.message}`);
        throw error; // Re-throw the error to be caught by the caller
    }
}

// New function to handle database setup from an SQL file
async function runSetup() {
    logger.info('Starting database setup...');

    try {
        const sqlFilePath = path.join(process.cwd(), './sql/database.sql');
        const sqlScript = fs.readFileSync(sqlFilePath, 'utf8');
        const statements = sqlScript.split(';').filter(statement => statement.trim() !== '');
        logger.info(`Found ${statements.length} SQL statements to execute.`);

        for (const [index, statement] of statements.entries()) {
            if (statement) {
                logger.info(`Executing statement ${index + 1}/${statements.length}...`);
                await pool.query(statement);
            }
        }
        logger.success('Database tables created/verified successfully!');
    } catch (error) {
        logger.error('Failed to run database setup script:', error);
        throw error;
    }

    // The old migration logic has been removed as it is now obsolete.
    // All configuration should be managed via the /config command.
    logger.info('Database setup is complete. Please use the /config command to manage bot settings.');
}


module.exports = {
    query,
    runSetup,
    ensureDatabaseExistsAndConnected,
};
