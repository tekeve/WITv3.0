const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const logDir = path.join(__dirname, '../logs');
const errorDir = path.join(logDir, 'errors');
const today = new Date().toISOString().slice(0, 10);
const logPath = path.join(logDir, `${today}.log`);
const errorPath = path.join(errorDir, `${today}.log`);

if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
if (!fs.existsSync(errorDir)) fs.mkdirSync(errorDir);

// Determine the logging level based on command-line arguments
const args = process.argv.slice(2);
let isQuiet = false;
let isVerbose = false;
let isAudit = false;

if (args.includes('--quiet') | (args.includes('-q'))) {
    isQuiet = true;
    console.log(chalk.blue('[INFO] logging quiet, only errors will be shown, log|error files will still be updated'));
} else if (args.includes('--verbose') | (args.includes('-v')) | (args.includes('--loud')) | (args.includes('-l'))) {
    isVerbose = true;
    console.log(chalk.blue('[INFO] logging loud, all debugging messages will be shown'));
} else if (args.includes('--audit')) {
    isAudit = true;
    console.log(chalk.blue('[INFO] logging audit, all audit messages will be shown'));
}
else {
    console.log(chalk.blue('[INFO] logging default, only errors and warning will be shown, log|error files will still be updated'));
}

function formatValue(val) {
    if (typeof val === 'object') {
        try {
            return JSON.stringify(val, null, 2);
        } catch {
            return '[Unserializable Object]';
        }
    }
    return String(val);
}

function logToFile(filepath, line) {
    fs.appendFileSync(filepath, `[${new Date().toLocaleTimeString()}] ${line}\n`);
}

function info(...args) {
    const line = `[INFO] ${args.map(formatValue).join(' ')}`;
    logToFile(logPath, line);
    if (isVerbose) {
        console.log(chalk.blue(line));
    }
}

function success(...args) {
    const line = `[SUCCESS] ${args.map(formatValue).join(' ')}`;
    logToFile(logPath, line);
    if (isVerbose) {
        console.log(chalk.green(line));
    }
}

function warn(...args) {
    const line = `[WARN] ${args.map(formatValue).join(' ')}`;
    logToFile(logPath, line);
    if (!isQuiet) {
        console.log(chalk.yellow(line));
    }
}

function error(err, context = '') {
    const header = `[ERROR] ${context ? `[${context}] ` : ''}`;
    const body = err && err.stack ? err.stack : formatValue(err);
    const line = `${header}${body}`;
    console.log(chalk.red(line));
    logToFile(logPath, line);
    logToFile(errorPath, line);
}

function audit(...args) {
    const line = `[AUDIT] ${args.map(formatValue).join(' ')}`;
    logToFile(logPath, line);
    if (isAudit || isVerbose) {
        console.log(chalk.magenta(line));
    }
}

function table(label, data) {
    if (isVerbose) {
        console.log(chalk.cyan(`📊 ${label}`));
        console.table(data);
    }
}

module.exports = {
    info,
    success,
    warn,
    error,
    table,
    audit,
};