const mysql = require('mysql2/promise');
const { getLogger } = require('@services/logger');

const logger = getLogger('Database');

let pool;

/**
 * Creates and tests the database connection pool.
 * This is called once by app.js at startup.
 * @returns {Promise<mysql.Pool>} The database connection pool.
 * @throws {Error} If connection fails.
 */
async function initializeDatabase() {
    if (pool) {
        logger.warn('Database already initialized.');
        return pool;
    }

    try {
        logger.info('Creating database connection pool...');
        pool = mysql.createPool({
            host: process.env.MYSQL_HOST,
            user: process.env.MYSQL_USER,
            password: process.env.MYSQL_PASSWORD,
            database: process.env.MYSQL_DATABASE,
            port: process.env.DB_PORT || 3306,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
        });

        // --- Test the connection ---
        logger.info('Testing database connection...');
        const connection = await pool.getConnection();
        await connection.ping();
        connection.release();

        logger.info('Database connection successful.');
        return pool;

    } catch (error) {
        logger.error('Failed to create or test database pool:', { error: error.message });
        throw new Error(`Database connection failed: ${error.message}`); // Re-throw to stop app startup
    }
}

/**
 * (Optional) A simple getter in case other core services need the pool
 * before it's passed to plugins.
 * @returns {mysql.Pool} The database pool.
 */
function getPool() {
    if (!pool) {
        throw new Error('Database has not been initialized. Call initializeDatabase() first.');
    }
    return pool;
}

module.exports = {
    initializeDatabase,
    getPool,
};