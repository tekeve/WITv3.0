/**
 * Calculates the winner(s) of a Single Transferable Vote (STV) election.
 * This implementation uses the Droop quota and fractional surplus transfer.
 *
 * @param {string[]} candidates - An array of all candidate names.
 * @param {string[][]} ballots - An array of ballots, where each ballot is an array of candidate names in preference order.
 * @param {number} numWinners - The number of seats to fill (e.g., 1 for leadership, 2 for officer).
 * @returns {{winners: string[], log: string[]}} - An object containing an array of winner names and a log of the entire counting process.
 */
function calculateSTV(candidates, ballots, numWinners) {
    const log = [];
    const numBallots = ballots.length;

    // Calculate Droop Quota: floor( (total_votes / (seats + 1)) + 1 )
    const quota = Math.floor(numBallots / (numWinners + 1)) + 1;

    let winners = new Set();
    let eliminated = new Set();

    // Create a mutable copy of ballots, where each ballot is an object
    // { id: index, weight: 1.0, preferences: ['A', 'B', 'C'], currentTopPref: null }
    let weightedBallots = ballots.map((b, index) => ({
        id: index,
        weight: 1.0,
        preferences: b,
        currentTopPref: null // Will store the candidate this ballot is voting for *this round*
    }));

    log.push(`Election Started.`);
    log.push(`Total Ballots: ${numBallots}`);
    log.push(`Seats to Fill: ${numWinners}`);
    log.push(`Droop Quota: ${quota}`);
    log.push(`Candidates: ${candidates.join(', ')}`);

    let round = 1;

    while (winners.size < numWinners) {
        log.push(`\n\n--- Round ${round} ---`);

        // 1. Calculate votes for all non-eliminated, non-winner candidates
        const votes = new Map(candidates.map(c => [c, 0.0]));

        for (const ballot of weightedBallots) {
            // Skip ballots that have no weight
            if (ballot.weight <= 0) {
                ballot.currentTopPref = 'exhausted'; // Mark as exhausted
                continue;
            }

            let preferenceFound = false;
            for (const candidate of ballot.preferences) {
                // If this candidate is still in the running (not won, not eliminated)
                if (!winners.has(candidate) && !eliminated.has(candidate)) {
                    votes.set(candidate, votes.get(candidate) + ballot.weight);
                    preferenceFound = true;

                    // --- FIX: "Stamp" the ballot with its current #1 choice ---
                    ballot.currentTopPref = candidate;
                    // --- End of FIX ---

                    break; // Count only the highest-ranked active candidate
                }
            }
            if (!preferenceFound) {
                // Ballot is "exhausted" (all its preferences are won or eliminated)
                ballot.weight = 0; // Set weight to 0
                ballot.currentTopPref = 'exhausted'; // Mark as exhausted
            }
        }

        // Log the current vote counts
        log.push(`Current Vote Counts:`);
        let sortedVotes = [...votes.entries()]
            .filter(([c, v]) => !eliminated.has(c) && !winners.has(c))
            .sort((a, b) => b[1] - a[1]);

        for (const [candidate, count] of sortedVotes) {
            log.push(`  - ${candidate}: ${count.toFixed(2)} votes`);
        }

        // 2. Check for winners
        let newWinnersThisRound = new Set();
        for (const [candidate, count] of sortedVotes) {
            if (count >= quota) {
                log.push(`\nCandidate ${candidate} has reached the quota (${count.toFixed(2)}) and is elected!`);
                winners.add(candidate);
                newWinnersThisRound.add(candidate);
            }
        }

        // If we found all the winners we need, we can stop
        if (winners.size === numWinners) {
            break;
        }

        // 3. Handle Surplus Transfers (if any new winners)
        // This is the "Wright Method"
        if (newWinnersThisRound.size > 0) {
            // We transfer surplus from the highest-vote winner first
            // Sort new winners by their vote count, descending
            const sortedNewWinners = [...newWinnersThisRound].sort((a, b) => votes.get(b) - votes.get(a));

            for (const winner of sortedNewWinners) {
                const surplus = votes.get(winner) - quota;
                const totalVotesForWinner = votes.get(winner);

                if (surplus <= 0) continue; // No surplus to transfer

                // This is the "Surplus Ratio"
                const transferWeight = surplus / totalVotesForWinner;
                log.push(`\nTransferring surplus from ${winner}:`);
                log.push(`  - Surplus: ${surplus.toFixed(2)}`);
                log.push(`  - Total Votes: ${totalVotesForWinner.toFixed(2)}`);
                log.push(`  - Surplus Ratio (Wright): ${transferWeight.toFixed(4)}`);

                // Find all ballots whose *current* top-preference is the winner
                // and re-weight them. Their next preference will be counted
                // in the next round with this new, reduced weight.
                for (const ballot of weightedBallots) {

                    // --- FIX: Read the "stamp" instead of recalculating ---
                    // if (firstActivePref === winner) {
                    if (ballot.currentTopPref === winner) {
                        // --- End of FIX ---

                        // Re-weight the *entire ballot* by the surplus ratio
                        ballot.weight *= transferWeight;
                    }
                }
            }
            // After transferring, we must re-run the count from scratch
            // So we loop back to the start of the 'while'
            round++;
            continue;
        }

        // 4. If no new winners, check for elimination

        // Who is still in the running?
        const activeCandidates = candidates.filter(c => !winners.has(c) && !eliminated.has(c));

        // Check for edge case: If remaining candidates <= remaining seats,
        // they are all elected by default.
        const remainingSeats = numWinners - winners.size;
        if (activeCandidates.length <= remainingSeats) {
            log.push(`\nOnly ${activeCandidates.length} candidates remaining for ${remainingSeats} seats.`);
            for (const candidate of activeCandidates) {
                log.push(`${candidate} is elected by default.`);
                winners.add(candidate);
            }
            break; // Election is over
        }

        // Find the candidate(s) with the minimum number of votes
        let minVotes = Infinity;
        for (const [candidate, count] of sortedVotes) {
            if (count < minVotes) {
                minVotes = count;
            }
        }

        // Get all candidates tied for last place
        const lastPlaceCandidates = sortedVotes
            .filter(([candidate, count]) => count === minVotes)
            .map(([candidate, count]) => candidate);

        if (lastPlaceCandidates.length === 0) {
            // This should be impossible, but as a safeguard...
            log.push(`\nERROR: Could not determine candidate to eliminate. Aborting.`);
            break;
        }

        // --- FIX: Eliminate all tied candidates simultaneously ---
        log.push(`\nTie for last place with ${minVotes.toFixed(2)} votes.`);
        log.push(`Eliminating all tied candidates: ${lastPlaceCandidates.join(', ')}`);

        for (const candidateToEliminate of lastPlaceCandidates) {
            eliminated.add(candidateToEliminate);
        }

        // When a candidate is eliminated, their ballots are *not* re-weighted.
        // The *next* time we count (in the next round), the ballots will
        // simply skip over the eliminated name and go to the next preference.

        round++;
    } // End of while loop

    log.push(`\n\n--- Election Concluded ---`);
    const finalWinners = Array.from(winners);
    log.push(`The quota was ${quota}.`);
    log.push(`The elected winner(s) are: ${finalWinners.join(', ')}`);

    return {
        winners: finalWinners,
        log: log
    };
}

module.exports = {
    calculateSTV
};