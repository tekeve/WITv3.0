const logger = require('./logger');

/**
 * Calculates the winner(s) of a Single Transferable Vote (STV) election.
 *
 * @param {string[]} candidates - An array of candidate names.
 * @param {string[][]} ballots - An array of ballots, where each ballot is an array of candidate names in order of preference.
 * @param {number} numWinners - The number of seats to fill.
 * @returns {{winners: string[], log: string[]}} - An object containing the list of winners and a detailed round-by-round log.
 */
function calculateSTV(candidates, ballots, numWinners) {
    const log = [];
    const numBallots = ballots.length;

    // Quota = (Total Votes / (Seats + 1)) + 1 (using Droop quota, floored)
    const quota = Math.floor(numBallots / (numWinners + 1)) + 1;

    log.push(`--- Election Started ---`);
    log.push(`Total Ballots: ${numBallots}`);
    log.push(`Seats to Fill: ${numWinners}`);
    log.push(`Quota to Win: ${quota}`);
    log.push(`Candidates: ${candidates.join(', ')}`);
    log.push(`--------------------------`);

    let currentBallots = ballots.map(ballot => ({
        choices: ballot.filter(c => candidates.includes(c)), // Clean ballot of invalid choices
        weight: 1.0,
    }));

    const winners = new Set();
    const eliminated = new Set();
    let round = 1;

    while (winners.size < numWinners) {
        log.push(`\n--- Round ${round} ---`);

        // Count first-preference votes for all non-winner, non-eliminated candidates
        const counts = new Map(candidates.map(c => [c, 0]));
        let validBallotsInRound = 0;

        for (const ballot of currentBallots) {
            let firstChoiceFound = false;
            for (const choice of ballot.choices) {
                if (!winners.has(choice) && !eliminated.has(choice)) {
                    counts.set(choice, counts.get(choice) + ballot.weight);
                    firstChoiceFound = true;
                    validBallotsInRound += ballot.weight;
                    break;
                }
            }
        }

        // Log counts
        const countLog = [];
        counts.forEach((count, candidate) => {
            if (!winners.has(candidate) && !eliminated.has(candidate)) {
                countLog.push(`${candidate}: ${count.toFixed(4)}`);
            }
        });
        log.push(`Current Standings (Total Valid: ${validBallotsInRound.toFixed(4)}):`);
        log.push(countLog.join('\n'));

        // ---------------------------------
        // 1. Check for new winners
        // ---------------------------------
        let newWinnersThisRound = [];
        counts.forEach((count, candidate) => {
            if (count >= quota && !winners.has(candidate)) {
                newWinnersThisRound.push({ name: candidate, count: count });
            }
        });

        // Sort new winners by highest vote (in case multiple elected)
        newWinnersThisRound.sort((a, b) => b.count - a.count);

        if (newWinnersThisRound.length > 0) {
            for (const winner of newWinnersThisRound) {
                if (winners.size < numWinners) {
                    winners.add(winner.name);
                    log.push(`\n[Elected] ${winner.name} is elected with ${winner.count.toFixed(4)} votes.`);

                    // Calculate surplus and transfer weight
                    const surplus = winner.count - quota;
                    const transferWeight = surplus / winner.count;
                    log.push(`Surplus of ${surplus.toFixed(4)} to be transferred at a weight of ${transferWeight.toFixed(4)}.`);

                    // Redistribute surplus votes
                    for (const ballot of currentBallots) {
                        // Find the first valid choice on this ballot
                        let firstChoice = null;
                        for (const choice of ballot.choices) {
                            if (!winners.has(choice) && !eliminated.has(choice)) {
                                firstChoice = choice;
                                break;
                            }
                        }

                        // If this ballot's first choice was the new winner, transfer its weight
                        if (firstChoice === winner.name) {
                            ballot.weight *= transferWeight;
                        }
                    }
                }
            }
            round++;
            continue; // Start a new round to recount with new weights
        }

        // ---------------------------------
        // 2. Check for elimination
        // ---------------------------------
        const remainingCandidates = candidates.filter(c => !winners.has(c) && !eliminated.has(c));

        // If remaining candidates <= number of remaining seats, elect them all
        if (remainingCandidates.length <= (numWinners - winners.size)) {
            log.push(`\nRemaining candidates (${remainingCandidates.length}) equals or is less than remaining seats (${numWinners - winners.size}).`);
            for (const candidate of remainingCandidates) {
                winners.add(candidate);
                log.push(`[Elected] ${candidate} is elected.`);
            }
            break; // Election is over
        }

        // No new winner, so we must eliminate the candidate with the lowest votes
        let lowestCount = Infinity;
        let candidatesToEliminate = [];

        remainingCandidates.forEach(candidate => {
            const count = counts.get(candidate);
            if (count < lowestCount) {
                lowestCount = count;
                candidatesToEliminate = [candidate];
            } else if (count === lowestCount) {
                candidatesToEliminate.push(candidate);
            }
        });

        // Handle tie for last place (basic random tie-break)
        // A better system might check previous round counts
        let candidateToEliminate = candidatesToEliminate[0];
        if (candidatesToEliminate.length > 1) {
            log.push(`Tie for elimination between: ${candidatesToEliminate.join(', ')}. Randomly selecting one.`);
            candidateToEliminate = candidatesToEliminate[Math.floor(Math.random() * candidatesToEliminate.length)];
        }

        eliminated.add(candidateToEliminate);
        log.push(`\n[Eliminated] ${candidateToEliminate} is eliminated with ${lowestCount.toFixed(4)} votes.`);
        log.push(`Their votes will be redistributed in the next round.`);

        // Note: We don't need to change ballot weights on elimination,
        // just move to the next preference in the next round's count.

        round++;

        if (round > (candidates.length * 2)) {
            log.push("\n[Error] Election exceeded maximum rounds. Halting calculation.");
            logger.error("STV calculation hit round limit.", { vote_id: "N/A" });
            break;
        }
    }

    log.push(`\n--- Election Concluded ---`);
    log.push(`Winner(s): ${Array.from(winners).join(', ')}`);
    log.push(`--------------------------`);

    return { winners: Array.from(winners), log };
}

module.exports = { calculateSTV };