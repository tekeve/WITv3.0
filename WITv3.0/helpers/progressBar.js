/**
 * Generates a text-based progress bar string.
 *
 * @param {number} value - The current value of the progress, used to determine the bar's fullness.
 * @param {number} maxValue - The maximum value of the progress.
 * @param {number} [size=30] - The width of the progress bar in characters.
 * @param {boolean} [invertText=false] - If true, the text percentage will show the inverse of the bar's fullness (100% - bar%).
 * @returns {string} The formatted progress bar string.
 */
function createProgressBar(value, maxValue, size = 30, invertText = false) {
    // The percentage for the visual bar is always based on the raw value.
    const barPercentage = Math.max(0, Math.min(1, value / maxValue));

    // The percentage for the text display can be inverted from the bar's percentage.
    const textPercentage = invertText ? 1 - barPercentage : barPercentage;

    const filledBlocks = Math.round(size * barPercentage);
    const emptyBlocks = size - filledBlocks;

    const filledChar = '█';
    const emptyChar = '░';

    const bar = filledChar.repeat(filledBlocks) + emptyChar.repeat(emptyBlocks);

    // The text reflects the calculated text percentage.
    const percentageText = `${Math.round(textPercentage * 100)}%`;

    return `[${bar}] ${percentageText}`;
}

module.exports = {
    createProgressBar,
};

