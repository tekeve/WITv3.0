const logger = require('@helpers/logger');
const { parseLog } = require('@helpers/combatLogParser');
const db = require('@helpers/database');
const { v4: uuidv4 } = require('uuid');

/**
 * Renders the Combat Log Analysis form if the token is valid.
 * @param {import('discord.js').Client} client - The Discord client instance.
 */
exports.showLogAnalysisForm = (client) => (req, res) => {
    const { token } = req.params;
    const tokenData = client.activeLogAnalysisTokens?.get(token);

    if (!tokenData || Date.now() > tokenData.expires) {
        if (tokenData) client.activeLogAnalysisTokens.delete(token);
        return res.status(403).render('error', { title: 'Link Invalid', message: 'This log analysis link is invalid or has expired.' });
    }

    res.render('logAnalysisForm', { token });
};

/**
 * Handles the submission of raw log data for parsing and analysis.
 * @param {import('discord.js').Client} client - The Discord client instance.
 */
exports.handleLogSubmission = (client) => async (req, res) => {
    const { token } = req.params;
    const tokenData = client.activeLogAnalysisTokens?.get(token);

    if (!tokenData || Date.now() > tokenData.expires) {
        return res.status(403).json({ success: false, message: 'Session expired. Please generate a new link in Discord.' });
    }

    const { rawLog } = req.body;
    if (!rawLog) {
        return res.status(400).json({ success: false, message: 'No log data provided.' });
    }

    try {
        const parsedLogs = parseLog(rawLog);
        if (parsedLogs.length === 0) {
            return res.json({ success: true, message: 'No combat entries found to analyze.', analysis: null });
        }

        const sessionId = uuidv4();
        const uploaderId = tokenData.user.id;

        // Save to database
        const insertPromises = parsedLogs.map(log => {
            const sql = 'INSERT INTO combat_logs (session_id, uploader_discord_id, log_timestamp, log_type, attacker, target, weapon, damage, damage_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
            // Ensure all values are defined or null to prevent database errors
            const values = [
                sessionId,
                uploaderId,
                log.timestamp,
                log.type,
                log.attacker || log.source || null,
                log.target || null,
                log.weapon || null,
                log.damage || log.amount || null,
                log.damageType || null
            ];
            return db.query(sql, values);
        });
        await Promise.all(insertPromises);
        logger.info(`Saved ${parsedLogs.length} log entries to DB with session ID ${sessionId}`);

        // --- Perform Analysis ---
        const analysis = {
            sessionId: sessionId,
            totalEntries: parsedLogs.length,
            startTime: parsedLogs[0].timestamp,
            endTime: parsedLogs[parsedLogs.length - 1].timestamp,
            durationSeconds: (parsedLogs[parsedLogs.length - 1].timestamp - parsedLogs[0].timestamp) / 1000,
            damageDealt: {
                total: 0,
                byTarget: {},
                byWeapon: {},
                timeline: []
            },
            damageReceived: {
                total: 0,
                byAttacker: {},
                byWeapon: {},
                timeline: []
            },
            repairDealt: {
                total: 0,
                byTarget: {},
                timeline: []
            },
            repairReceived: {
                total: 0,
                bySource: {},
                timeline: []
            },
            allParticipants: new Set(),
            enemies: new Set(),
        };

        parsedLogs.forEach(log => {
            // This check prevents the 'Invalid time value' error.
            if (log.timestamp && !isNaN(log.timestamp.getTime())) {
                if (log.type === 'damage_dealt') {
                    analysis.damageDealt.total += log.damage;
                    analysis.damageDealt.byTarget[log.target] = (analysis.damageDealt.byTarget[log.target] || 0) + log.damage;
                    analysis.damageDealt.byWeapon[log.weapon] = (analysis.damageDealt.byWeapon[log.weapon] || 0) + log.damage;
                    analysis.damageDealt.timeline.push({ x: log.timestamp.toISOString(), y: log.damage });
                    analysis.allParticipants.add(log.target);
                    analysis.enemies.add(log.target);
                } else if (log.type === 'damage_received') {
                    analysis.damageReceived.total += log.damage;
                    analysis.damageReceived.byAttacker[log.attacker] = (analysis.damageReceived.byAttacker[log.attacker] || 0) + log.damage;
                    analysis.damageReceived.byWeapon[log.weapon] = (analysis.damageReceived.byWeapon[log.weapon] || 0) + log.damage;
                    analysis.damageReceived.timeline.push({ x: log.timestamp.toISOString(), y: log.damage });
                    analysis.allParticipants.add(log.attacker);
                    analysis.enemies.add(log.attacker);
                } else if (log.type === 'remote_repair_dealt') {
                    analysis.repairDealt.total += log.amount;
                    analysis.repairDealt.byTarget[log.target] = (analysis.repairDealt.byTarget[log.target] || 0) + log.amount;
                    analysis.repairDealt.timeline.push({ x: log.timestamp.toISOString(), y: log.amount });
                    analysis.allParticipants.add(log.target);
                } else if (log.type === 'remote_repair_received') {
                    analysis.repairReceived.total += log.amount;
                    analysis.repairReceived.bySource[log.source] = (analysis.repairReceived.bySource[log.source] || 0) + log.amount;
                    analysis.repairReceived.timeline.push({ x: log.timestamp.toISOString(), y: log.amount });
                    analysis.allParticipants.add(log.source);
                }
            }
        });

        // Convert sets to arrays for JSON serialization
        analysis.allParticipants = Array.from(analysis.allParticipants);
        analysis.enemies = Array.from(analysis.enemies);

        res.json({ success: true, analysis });

    } catch (error) {
        logger.error('Error handling log submission:', error);
        res.status(500).json({ success: false, message: 'An internal server error occurred while analyzing the log.' });
    }
};

