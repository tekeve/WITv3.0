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
    multipleStatements: true,
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
 * Runs the initial database setup from the .sql file.
 */
async function runSetup() {
    logger.info('Starting database setup...');
    try {
        const sqlFilePath = path.join(process.cwd(), './sql/database.sql');
        const sqlScript = fs.readFileSync(sqlFilePath, 'utf8');
        const statements = sqlScript.split(';').filter(statement => statement.trim() !== '');

        for (const statement of statements) {
            if (statement) {
                await pool.query(statement);
            }
        }
        logger.success('Database tables created/verified successfully!');
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
