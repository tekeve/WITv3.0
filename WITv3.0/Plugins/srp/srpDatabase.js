/**
 * Manages all database interactions for the SRP plugin.
 * This class provides getters and setters for the `srp_history` table.
 */
class SrpDatabase {
    /**
     * @param {any} db - The database connection pool.
     * @param {winston.Logger} logger - The logger instance.
     */
    constructor(db, logger) {
        this.db = db;
        this.logger = logger;
    }

    /**
     * Creates a new SRP request in the database.
     * @param {object} data - The SRP request data, conforming to the srp_history schema.
     * @returns {Promise<boolean>} True on success, false on failure.
     */
    async createRequest(data) {
        try {
            // Define all columns
            const columns = [
                'discord_id',
                'pilot_name',
                'kill_report_link',
                'fc_name',
                'fc_status',
                'backseat_details',
                'ship_type',
                'srpable',
                'srp_paid',
                'loss_description',
                'loot_status'
            ];

            // Create arrays of placeholders (?) and values
            const placeholders = [];
            const values = [];

            for (const col of columns) {
                if (data[col] !== undefined) {
                    placeholders.push('`' + col + '`');
                    values.push(data[col]);
                }
            }

            if (values.length === 0) {
                this.logger.warn('[SRP-DB] No data provided to createRequest.');
                return false;
            }

            const query = `INSERT INTO srp_history (${placeholders.join(', ')}) VALUES (${values.map(() => '?').join(', ')})`;

            await this.db.query(query, values);
            this.logger.info(`[SRP-DB] Created new SRP request submitted by ${data.discord_id}`); // <-- Changed
            return true;
        } catch (error) {
            this.logger.error('[SRP-DB] Failed to create SRP request:', { error: error.stack || error });
            return false;
        }
    }

    /**
     * Gets all SRP requests, or all with a specific status.
     * @param {string} [status] - Optional status to filter by (e.g., 'Pending').
     * @returns {Promise<Array>} An array of SRP request objects.
     */
    async getRequests(status = null) {
        try {
            // Use 'fc_status' as the status field, based on your schema
            let query = 'SELECT * FROM srp_history';
            const params = [];
            if (status) {
                query += ' WHERE fc_status = ?';
                params.push(status);
            }
            query += ' ORDER BY created_at DESC';

            const [rows] = await this.db.query(query, params);
            return rows;
        } catch (error) {
            this.logger.error(`[SRP-DB] Failed to get requests (status: ${status}):`, { error: error.stack || error });
            return [];
        }
    }

    /**
     * Updates the FC status of an SRP request.
     * @param {number} requestId - The database ID of the SRP request.
     * @param {string} newStatus - The new status (e.g., 'Approved', 'Rejected').
     * @param {string} [reviewerId] - Optional Discord ID of the person who reviewed it.
     * @returns {Promise<boolean>} True on success, false on failure.
     */
    async updateFcStatus(requestId, newStatus, reviewerId = null) {
        try {
            await this.db.query(
                'UPDATE srp_history SET fc_status = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?',
                [newStatus, reviewerId, requestId]
            );
            this.logger.info(`[SRP-DB] Updated SRP request ${requestId} to status ${newStatus}`);
            return true;
        } catch (error) {
            this.logger.error(`[SRP-DB] Failed to update status for request ${requestId}:`, { error: error.stack || error });
            return false;
        }
    }

    /**
     * Updates the payment status of an SRP request.
     * @param {number} requestId - The database ID of the SRP request.
     * @param {string} paidStatus - The new payment status (e.g., 'Yes', 'No').
     * @param {string} [paidById] - Optional Discord ID of the person who paid it.
     * @returns {Promise<boolean>} True on success, false on failure.
     */
    async updatePaidStatus(requestId, paidStatus, paidById = null) {
        try {
            // Assuming you add a 'paid_by' column for tracking
            await this.db.query(
                'UPDATE srp_history SET srp_paid = ? WHERE id = ?', // Add paid_by = ? if you have that column
                [paidStatus, requestId]
            );
            this.logger.info(`[SRP-DB] Updated SRP request ${requestId} payment status to ${paidStatus}`);
            return true;
        } catch (error) {
            this.logger.error(`[SRP-DB] Failed to update payment status for request ${requestId}:`, { error: error.stack || error });
            return false;
        }
    }
}

module.exports = SrpDatabase;