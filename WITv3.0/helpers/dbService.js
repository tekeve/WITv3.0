const mysql = require('mysql2/promise');
const readline = require('readline');
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

// A function to read user input from the command line
function prompt(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise(resolve => {
        rl.question(question, answer => {
            rl.close();
            resolve(answer);
        });
    });
}

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

    // Check if the old config.js file exists for migration
    const oldConfigPath = path.join(__dirname, '../config.js');
    if (fs.existsSync(oldConfigPath)) {
        logger.info('Found old config.js file, migrating settings to database...');
        try {
            const initialConfig = require(oldConfigPath);
            for (const [key, value] of Object.entries(initialConfig)) {
                const valueJson = JSON.stringify(value);
                const insertSql = 'INSERT INTO config (key_name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)';
                await query(insertSql, [key, valueJson]);
            }
            logger.success('Successfully migrated settings from config.js to the database.');
        } catch (error) {
            logger.error('Failed during config.js migration:', error);
        }
    } else {
        logger.info('No old config.js file found, skipping migration. Please configure settings via the /config command.');
    }
}


module.exports = {
    query,
    runSetup,
    ensureDatabaseExistsAndConnected,
};

