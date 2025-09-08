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
        // Read the SQL file from the root directory
        const sqlFilePath = path.join(process.cwd(), './sql/database.sql');
        const sqlScript = fs.readFileSync(sqlFilePath, 'utf8');

        // Split the script into individual statements and filter out empty ones
        const statements = sqlScript.split(';').filter(statement => statement.trim() !== '');

        logger.info(`Found ${statements.length} SQL statements to execute.`);

        // Execute each statement sequentially using the pool
        for (const [index, statement] of statements.entries()) {
            if (statement) { // Ensure it's not an empty string
                logger.info(`Executing statement ${index + 1}/${statements.length}...`);
                await pool.query(statement);
            }
        }
        logger.success('Database tables are ready based on setup.sql!');
    } catch (error) {
        logger.error('Failed to run database setup script:', error);
        // We will let the process exit, but this gives a clear message
        throw error;
    }

    // Get user input for settings table after the tables are created
    const guildId = await prompt('Enter the Discord Guild ID for this bot: ');
    const authRolesInput = await prompt('Enter authentication roles (comma-separated, e.g., role1, role2): ');
    const adminRolesInput = await prompt('Enter admin roles (comma-separated, e.g., role1, role2): ');
    const councilRolesInput = await prompt('Enter incursion roles (comma-separated, e.g., role1, role2): ');

    // Convert comma-separated strings to JSON format
    const formatRoles = (input) => {
        const rolesArray = input.split(',').map(role => role.trim()).filter(role => role.length > 0);
        return JSON.stringify({ roles: rolesArray });
    };

    const authRolesJSON = formatRoles(authRolesInput);
    const adminRolesJSON = formatRoles(adminRolesInput);
    const councilRolesJSON = formatRoles(councilRolesInput);

    // Insert data into the settings table
    const insertSql = `
        INSERT INTO settings (guild_id, auth_roles, admin_roles, council_roles) 
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            auth_roles = VALUES(auth_roles),
            admin_roles = VALUES(admin_roles),
            council_roles = VALUES(council_roles)
    `;
    await query(insertSql, [guildId, authRolesJSON, adminRolesJSON, councilRolesJSON]);
    logger.success('Settings have been saved to the database!');
}

module.exports = {
    query,
    runSetup
};

