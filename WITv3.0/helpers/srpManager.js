const esiService = require('@helpers/esiService');
const logger = require('@helpers/logger');

const JITA_REGION_ID = 10000002;
const JITA_STATION_ID = 60003760; // Jita IV - Moon 4 - Caldari Navy Assembly Plant

/**
 * Fetches the minimum sell price for a single item type from the Jita 4-4 market.
 * This optimized version only fetches the first page, as sell orders are typically sorted ascendingly.
 * @param {number} typeId - The EVE Online type ID for the item.
 * @returns {Promise<number>} The minimum sell price, or 0 if not found.
 */
async function getJitaSellPriceForItem(typeId) {
    let minPrice = Infinity;
    try {
        const response = await esiService.get({
            endpoint: `/markets/${JITA_REGION_ID}/orders/`,
            params: { order_type: 'sell', type_id: typeId, page: 1 },
            caller: __filename
        });

        // Filter orders for the specific Jita station
        const jitaOrders = response.data.filter(order => order.location_id === JITA_STATION_ID);

        // Find the minimum price among the filtered orders on the first page
        for (const order of jitaOrders) {
            if (order.price < minPrice) {
                minPrice = order.price;
            }
        }
    } catch (error) {
        // Log errors but don't stop the whole process, just return 0 for this item.
        logger.error(`[SRP Manager] Could not fetch market data for type_id ${typeId}:`, error.message);
        return 0;
    }

    return minPrice === Infinity ? 0 : minPrice;
}


/**
 * Fetches and processes a killmail from a URL.
 * @param {string} killmailUrl - The full ESI killmail link.
 * @returns {Promise<object|null>} Processed killmail data or null on failure.
 */
async function processKillmail(killmailUrl) {
    const match = killmailUrl.match(/killmails\/(\d+)\/([a-f0-9]+)\//);
    if (!match) {
        logger.warn(`[SRP Manager] Invalid killmail URL format: ${killmailUrl}`);
        return null;
    }

    const [, killmailId, killmailHash] = match;

    try {
        const killmailResponse = await esiService.get({
            endpoint: `/killmails/${killmailId}/${killmailHash}/`,
            caller: __filename
        });

        if (!killmailResponse || !killmailResponse.data) {
            throw new Error('No data received from killmail endpoint.');
        }

        const killmail = killmailResponse.data;
        const victim = killmail.victim;
        const items = victim.items || [];
        const shipTypeId = victim.ship_type_id;

        const allItemIds = new Set([shipTypeId, ...items.map(item => item.item_type_id)]);
        const uniqueItemIds = Array.from(allItemIds);

        if (uniqueItemIds.length === 0) {
            return {
                killmailId,
                killmailHash,
                victim: { characterName: 'Unknown', shipTypeName: 'Unknown', shipValue: 0, shipTypeId: null },
                items: { destroyed: [], dropped: [] },
                totalValue: 0
            };
        }

        const namesResponse = await esiService.post({ endpoint: '/universe/names/', data: uniqueItemIds, caller: __filename });
        const namesMap = new Map((namesResponse || []).map(item => [item.id, item.name]));

        // Fetch prices concurrently for all items.
        const pricePromises = uniqueItemIds.map(id => getJitaSellPriceForItem(id).then(price => ({ id, price })));
        const priceResults = await Promise.all(pricePromises);
        const pricesMap = new Map(priceResults.map(p => [p.id, p.price]));

        const shipValue = pricesMap.get(shipTypeId) || 0;
        let totalValue = shipValue;
        const destroyedItems = [];
        const droppedItems = [];

        for (const item of items) {
            const price = pricesMap.get(item.item_type_id) || 0;
            const quantity = item.quantity_destroyed || item.quantity_dropped || 0;
            const itemValue = price * quantity;

            const itemDetails = {
                typeId: item.item_type_id,
                name: namesMap.get(item.item_type_id) || `Unknown Item ID ${item.item_type_id}`,
                quantity: quantity,
                value: itemValue
            };

            if (item.quantity_destroyed) {
                totalValue += itemValue;
                destroyedItems.push(itemDetails);
            } else if (item.quantity_dropped) {
                droppedItems.push(itemDetails);
            }
        }

        let victimName = 'Unknown';
        if (victim.character_id) {
            const victimNameResponse = await esiService.get({ endpoint: `/characters/${victim.character_id}/` });
            victimName = victimNameResponse.data.name;
        }

        return {
            killmailId,
            killmailHash,
            victim: {
                characterName: victimName,
                shipTypeId: shipTypeId,
                shipTypeName: namesMap.get(shipTypeId) || `Unknown Ship ID ${shipTypeId}`,
                shipValue: shipValue
            },
            items: {
                destroyed: destroyedItems.sort((a, b) => b.value - a.value),
                dropped: droppedItems.sort((a, b) => b.value - a.value)
            },
            totalValue
        };

    } catch (error) {
        logger.error(`[SRP Manager] Failed to process killmail ${killmailId}/${killmailHash}:`, error);
        return null;
    }
}

module.exports = {
    processKillmail,
};

