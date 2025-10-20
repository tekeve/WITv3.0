const logger = require('@helpers/logger');

/**
 * Parses raw EVE Online combat log text into a structured format.
 * This version is specifically tailored to handle logs with HTML-like tags and various combat messages.
 * @param {string} rawLogText - The raw text content from the combat log file.
 * @returns {Array<object>} An array of structured log entry objects.
 */
function parseLog(rawLogText) {
    const lines = rawLogText.split(/\r?\n/).filter(line => line.trim() !== '');
    const parsedEntries = [];

    // This regex is the first pass to identify a combat log line and extract its core components.
    const lineRegex = /\[\s*(\d{4}\.\d{2}\.\d{2}\s\d{2}:\d{2}:\d{2})\s*\]\s*\((combat)\)\s*(.*)/i;

    // Regex patterns to parse the content of a combat line AFTER stripping HTML-like tags.
    const damageRegex = {
        dealt_ship: /^([\d,]+) to (.+?) - (.+?) -/,
        dealt_pet_hits: /^Your (.+?) hits (.+?) - .* for ([\d,]+)/,
        dealt_pet_inflicts: /^Your (.+?) inflicts ([\d,]+) (.+?) damage to (.+)/,
        received_ship: /^([\d,]+) from (.+?) - (.+)/,
        repair_dealt: /^([\d,]+) remote armor repaired to (.+?) by you - (.+)/,
        repair_received: /^([\d,]+) remote armor repaired by (.+?) - (.+)/
    };

    for (const line of lines) {
        const originalContentMatch = line.match(lineRegex);
        if (!originalContentMatch) continue;

        const [, timestampStr, , rawContent] = originalContentMatch;

        // --- TIMESTAMP FIX ---
        // Convert YYYY.MM.DD HH:MM:SS to a guaranteed valid ISO 8601 format (YYYY-MM-DDTHH:MM:SSZ)
        const [datePart, timePart] = timestampStr.split(' ');
        const isoDatePart = datePart.replace(/\./g, '-');
        const isoTimestamp = `${isoDatePart}T${timePart}Z`;
        const timestamp = new Date(isoTimestamp);

        // Skip any line that still results in an invalid date.
        if (isNaN(timestamp.getTime())) {
            logger.warn(`Skipping log line with invalid timestamp: ${line}`);
            continue;
        }

        const strippedContent = rawContent.replace(/<[^>]*>/g, '').trim();

        let parsedEntry = null;
        let match;

        // --- Damage Dealt ---
        match = strippedContent.match(damageRegex.dealt_ship);
        if (match) {
            parsedEntry = {
                type: 'damage_dealt',
                attacker: 'You',
                target: match[2].trim(),
                weapon: match[3].trim(),
                damage: parseFloat(match[1].replace(/,/g, '')),
                damageType: 'Unknown',
            };
        } else {
            match = strippedContent.match(damageRegex.dealt_pet_hits);
            if (match) {
                parsedEntry = {
                    type: 'damage_dealt',
                    attacker: 'You (Pet)',
                    weapon: match[1].trim(),
                    target: match[2].trim(),
                    damage: parseFloat(match[3].replace(/,/g, '')),
                    damageType: 'Mixed',
                };
            } else {
                match = strippedContent.match(damageRegex.dealt_pet_inflicts);
                if (match) {
                    parsedEntry = {
                        type: 'damage_dealt',
                        attacker: 'You (Pet)',
                        weapon: match[1].trim(),
                        target: match[4].trim(),
                        damage: parseFloat(match[2].replace(/,/g, '')),
                        damageType: match[3].trim(),
                    };
                }
            }
        }

        // --- Damage Received ---
        if (!parsedEntry) {
            match = strippedContent.match(damageRegex.received_ship);
            if (match) {
                parsedEntry = {
                    type: 'damage_received',
                    attacker: match[2].trim(),
                    weapon: match[3].trim(),
                    target: 'You',
                    damage: parseFloat(match[1].replace(/,/g, '')),
                    damageType: 'Unknown',
                };
            }
        }

        // --- Repairs ---
        if (!parsedEntry) {
            match = strippedContent.match(damageRegex.repair_dealt);
            if (match) {
                parsedEntry = {
                    type: 'remote_repair_dealt',
                    source: 'You',
                    target: match[2].trim(),
                    amount: parseFloat(match[1].replace(/,/g, '')),
                    weapon: match[3].trim(),
                };
            }
        }
        if (!parsedEntry) {
            match = strippedContent.match(damageRegex.repair_received);
            if (match) {
                parsedEntry = {
                    type: 'remote_repair_received',
                    source: match[2].trim(),
                    target: 'You',
                    amount: parseFloat(match[1].replace(/,/g, '')),
                    weapon: match[3].trim(),
                };
            }
        }

        if (parsedEntry) {
            parsedEntry.timestamp = timestamp;
            const value = parsedEntry.damage ?? parsedEntry.amount;
            if (!isNaN(value)) {
                parsedEntries.push(parsedEntry);
            }
        }
    }

    logger.info(`Parsed ${parsedEntries.length} combat log entries from the provided text.`);
    parsedEntries.sort((a, b) => a.timestamp - b.timestamp);
    return parsedEntries;
}

module.exports = {
    parseLog,
};

