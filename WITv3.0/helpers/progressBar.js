/**
 * Generates a text-based progress bar string.
 *
 * @param {number} value - The current value of the progress.
 * @param {number} maxValue - The maximum value of the progress.
 * @param {number} [size=20] - The width of the progress bar in characters.
 * @returns {string} The formatted progress bar string.
 */
function createProgressBar(value, maxValue, size = 20) {
    // Ensure value is not greater than maxValue
    const percentage = Math.max(0, Math.min(1, value / maxValue));
    const filledBlocks = Math.round(size * percentage);
    const emptyBlocks = size - filledBlocks;

    const filledChar = '█';
    const emptyChar = '░';

    const bar = filledChar.repeat(filledBlocks) + emptyChar.repeat(emptyBlocks);
    const percentageText = `${Math.round(percentage * 100)}%`;

    return `[${bar}] ${percentageText}`;
}

module.exports = {
    createProgressBar,
};
