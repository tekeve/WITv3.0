const express = require('express');
const router = express.Router();
const walletController = require('@webControllers/walletController');

/**
 * Factory function to create the Corporation Wallet Monitor router.
 * @param {import('discord.js').Client} client The Discord client instance.
 * @returns The configured Express router.
 */
module.exports = (client) => {
    // Route to display the main monitor page
    // Middleware for token validation is applied inside the controller function
    router.get('/wallet/:token', walletController.showMonitor(client));

    // API route to fetch transactions data with filters
    // Use GET for simple queries, POST if filters become complex
    router.get('/wallet/api/transactions/:token', walletController.getTransactionsData(client));
    router.post('/wallet/api/transactions/:token', walletController.getTransactionsData(client)); // Also allow POST

    // API route to fetch aggregated data for charts/summaries
    router.get('/wallet/api/aggregated/:token', walletController.getAggregatedWalletData(client));
    router.post('/wallet/api/aggregated/:token', walletController.getAggregatedWalletData(client)); // Also allow POST

    // API route to update a transaction's category
    router.post('/wallet/api/update-category/:token', walletController.updateCategory(client));

    return router;
};
