const logger = require('@helpers/logger');

/**
 * Parses raw EVE Online combat log text into a structured format.
 * This version is specifically tailored to handle logs with HTML-like tags and various combat messages.
 * @param {string} rawLogText - The raw text content from the combat log file.
 * @returns {Array<object>} An array of structured log entry objects.
 */
function parseLog(rawLogText) {
    if (!rawLogText) return [];
    const lines = rawLogText.split(/\r?\n/).filter(line => line.trim() !== '');
    const parsedEntries = [];

    const lineRegex = /\[\s*(\d{4}\.\d{2}\.\d{2}\s\d{2}:\d{2}:\d{2})\s*\]\s*\((combat)\)\s*(.*)/i;

    const hitQualities = ['wrecks', 'smashes', 'penetrates', 'hits', 'grazes', 'glances off'];
    const qualityPattern = `(${hitQualities.join('|')})`; // A capturing group for the quality

    const damageRegex = {
        // Pattern 1: Matches "damage to/from target - WEAPON - QUALITY"
        dealt_ship_weapon_and_quality: new RegExp(`^([\\d,]+) to (.+?) - (.+?) - ${qualityPattern}$`, 'i'),
        received_ship_weapon_and_quality: new RegExp(`^([\\d,]+) from (.+?) - (.+?) - ${qualityPattern}$`, 'i'),

        // Pattern 2: Matches "damage to/from target - QUALITY" (no weapon)
        dealt_ship_quality_only: new RegExp(`^([\\d,]+) to (.+?) - ${qualityPattern}$`, 'i'),
        received_ship_quality_only: new RegExp(`^([\\d,]+) from (.+?) - ${qualityPattern}$`, 'i'),

        // Pattern 3 (Fallback): Matches "damage to/from target - ANYTHING_ELSE" (assumed to be a weapon)
        dealt_ship_weapon_only: new RegExp(`^([\\d,]+) to (.+?) - (.+)`, 'i'),
        received_ship_weapon_only: new RegExp(`^([\\d,]+) from (.+?) - (.+)`, 'i'),

        dealt_pet_hits: /^Your (.+?) hits (.+?) - .* for ([\d,]+)/,
        dealt_pet_inflicts: /^Your (.+?) inflicts ([\d,]+) (.+?) damage to (.+)/,

        repair_dealt_armor: /^([\d,]+) remote armor repaired to (.+?)(?: by you)? - (.+)/,
        repair_received_armor: /^([\d,]+) remote armor repaired by (.+?) - (.+)/,
        repair_dealt_shield: /^([\d,]+) remote shield boosted to (.+?)(?: by you)? - (.+)/,
        repair_received_shield: /^([\d,]+) remote shield boosted by (.+?) - (.+)/
    };

    for (const line of lines) {
        const originalContentMatch = line.match(lineRegex);
        if (!originalContentMatch) continue;

        const [, timestampStr, , rawContent] = originalContentMatch;
        const [datePart, timePart] = timestampStr.split(' ');
        const isoDatePart = datePart.replace(/\./g, '-');
        const isoTimestamp = `${isoDatePart}T${timePart}Z`;
        const timestamp = new Date(isoTimestamp);

        if (isNaN(timestamp.getTime())) {
            logger.warn(`Skipping log line with invalid timestamp: ${line}`);
            continue;
        }

        const strippedContent = rawContent.replace(/<[^>]*>/g, '').trim();
        let parsedEntry = null;
        let match;

        // --- Damage Dealt Logic ---
        match = strippedContent.match(damageRegex.dealt_ship_weapon_and_quality);
        if (match) {
            parsedEntry = { type: 'damage_dealt', attacker: 'You', target: match[2].trim(), weapon: match[3].trim(), quality: match[4].trim(), damage: parseFloat(match[1].replace(/,/g, '')) };
        } else {
            match = strippedContent.match(damageRegex.dealt_ship_quality_only);
            if (match) {
                parsedEntry = { type: 'damage_dealt', attacker: 'You', target: match[2].trim(), weapon: 'Unknown', quality: match[3].trim(), damage: parseFloat(match[1].replace(/,/g, '')) };
            } else {
                match = strippedContent.match(damageRegex.dealt_ship_weapon_only);
                if (match) {
                    // Final check to ensure we're not accidentally capturing a known quality as a weapon
                    const potentialWeapon = match[3].trim();
                    if (!hitQualities.includes(potentialWeapon.toLowerCase())) {
                        parsedEntry = { type: 'damage_dealt', attacker: 'You', target: match[2].trim(), weapon: potentialWeapon, quality: 'Unknown', damage: parseFloat(match[1].replace(/,/g, '')) };
                    }
                }
            }
        }

        // Pet damage is handled separately
        if (!parsedEntry) {
            match = strippedContent.match(damageRegex.dealt_pet_hits);
            if (match) parsedEntry = { type: 'damage_dealt', attacker: 'You (Pet)', weapon: match[1].trim(), quality: 'Hits', target: match[2].trim(), damage: parseFloat(match[3].replace(/,/g, '')) };
            else {
                match = strippedContent.match(damageRegex.dealt_pet_inflicts);
                if (match) parsedEntry = { type: 'damage_dealt', attacker: 'You (Pet)', weapon: match[1].trim(), quality: 'Hits', target: match[4].trim(), damage: parseFloat(match[2].replace(/,/g, '')), damageType: match[3].trim() };
            }
        }

        // --- Damage Received Logic ---
        if (!parsedEntry) {
            match = strippedContent.match(damageRegex.received_ship_weapon_and_quality);
            if (match) {
                parsedEntry = { type: 'damage_received', attacker: match[2].trim(), target: 'You', weapon: match[3].trim(), quality: match[4].trim(), damage: parseFloat(match[1].replace(/,/g, '')) };
            } else {
                match = strippedContent.match(damageRegex.received_ship_quality_only);
                if (match) {
                    parsedEntry = { type: 'damage_received', attacker: match[2].trim(), target: 'You', weapon: 'Unknown', quality: match[3].trim(), damage: parseFloat(match[1].replace(/,/g, '')) };
                } else {
                    match = strippedContent.match(damageRegex.received_ship_weapon_only);
                    if (match) {
                        const potentialWeapon = match[3].trim();
                        if (!hitQualities.includes(potentialWeapon.toLowerCase())) {
                            parsedEntry = { type: 'damage_received', attacker: match[2].trim(), target: 'You', weapon: potentialWeapon, quality: 'Unknown', damage: parseFloat(match[1].replace(/,/g, '')) };
                        }
                    }
                }
            }
        }

        // --- Repairs Logic ---
        if (!parsedEntry) {
            match = strippedContent.match(damageRegex.repair_dealt_armor) || strippedContent.match(damageRegex.repair_dealt_shield);
            if (match) parsedEntry = { type: 'remote_repair_dealt', source: 'You', target: match[2].trim(), amount: parseFloat(match[1].replace(/,/g, '')), weapon: match[3].trim() };
        }
        if (!parsedEntry) {
            match = strippedContent.match(damageRegex.repair_received_armor) || strippedContent.match(damageRegex.repair_received_shield);
            if (match) parsedEntry = { type: 'remote_repair_received', source: match[2].trim(), target: 'You', amount: parseFloat(match[1].replace(/,/g, '')), weapon: match[3].trim() };
        }

        if (parsedEntry) {
            parsedEntry.timestamp = timestamp;
            const value = parsedEntry.damage ?? parsedEntry.amount;
            if (!isNaN(value)) {
                parsedEntries.push(parsedEntry);
            }
        }
    }

    parsedEntries.sort((a, b) => a.timestamp - b.timestamp);
    return parsedEntries;
}

module.exports = {
    parseLog,
};

