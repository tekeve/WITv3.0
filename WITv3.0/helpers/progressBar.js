// ANSI color codes for discord code blocks
const ansi = {
    reset: '\u001b[0m',
    blue: '\u001b[2;34m',
    red: '\u001b[2;31m',
};

/**
 * Generates a text-based progress bar string, with optional ANSI colors.
 *
 * @param {number} value - The current value of the progress.
 * @param {number} maxValue - The maximum value of the progress.
 * @param {object} [options={}] - Configuration options for the progress bar.
 * @param {number} [options.size=30] - The width of the progress bar in characters.
 * @param {boolean} [options.invertBar=false] - If true, the bar's fullness is inverted (100% - value%).
 * @param {boolean} [options.invertText=false] - If true, the percentage text is inverted (100% - value%).
 * @param {boolean} [options.useAnsi=false] - If true, wraps the bar in ANSI color codes.
 * @param {string} [options.filledColor='blue'] - The ANSI color name for the filled part of the bar.
 * @param {string} [options.emptyColor='red'] - The ANSI color name for the empty part of the bar.
 * @returns {string} The formatted progress bar string.
 */
function createProgressBar(value, maxValue, options = {}) {
    // Set default options
    const {
        size = 30,
        invertBar = false,
        invertText = true,
        useAnsi = true,
        filledColor = 'blue',
        emptyColor = 'red'
    } = options;

    const rawPercentage = Math.max(0, Math.min(1, value / maxValue));

    // The bar's fullness can be inverted from the raw value
    const barPercentage = invertBar ? 1 - rawPercentage : rawPercentage;

    // The text can also be inverted
    const textPercentage = invertText ? 1 - rawPercentage : rawPercentage;

    const filledBlocks = Math.round(size * barPercentage);
    const emptyBlocks = size - filledBlocks;
    const percentageText = `${Math.round(textPercentage * 100)}%`;

    const filledChar = '░';
    const emptyChar = '░';

    let filledStr, emptyStr;

    if (useAnsi) {
        const filledAnsiCode = ansi[filledColor] || '';
        const emptyAnsiCode = ansi[emptyColor] || '';
        filledStr = `${filledAnsiCode}${filledChar.repeat(filledBlocks)}${ansi.reset}`;
        emptyStr = `${emptyAnsiCode}${emptyChar.repeat(emptyBlocks)}${ansi.reset}`;
    } else {
        filledStr = filledChar.repeat(filledBlocks);
        emptyStr = emptyChar.repeat(emptyBlocks);
    }

    const bar = useAnsi
        ? `[${ansi.blue}|${ansi.reset}${filledStr}${emptyStr}${ansi.red}|${ansi.reset}]`
        : `[|${filledStr}${emptyStr}|]`;

    return `${bar} ${percentageText}`;
}

module.exports = {
    createProgressBar,
};


