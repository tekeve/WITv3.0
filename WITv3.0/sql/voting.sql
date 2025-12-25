-- --------------------------------------------------------
-- New tables for the anonymous STV voting system
-- --------------------------------------------------------

-- Stores the main configuration for each vote
CREATE TABLE IF NOT EXISTS `votes` (
  `vote_id` INT AUTO_INCREMENT PRIMARY KEY,
  `guild_id` VARCHAR(25) NOT NULL,
  `channel_id` VARCHAR(25) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `type` ENUM('leadership', 'officer', 'other') NOT NULL,
  `candidates` JSON NOT NULL,
  `end_time` DATETIME NOT NULL,
  `is_active` BOOLEAN DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Stores unique, single-use tokens for voting
-- This table links a user (hashed) to a token, but NOT to a ballot
CREATE TABLE IF NOT EXISTS `vote_tokens` (
  `token_id` INT AUTO_INCREMENT PRIMARY KEY,
  `token` VARCHAR(64) NOT NULL UNIQUE,
  `vote_id` INT NOT NULL,
  `discord_user_hash` VARCHAR(64) NOT NULL,
  `used` BOOLEAN DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`vote_id`) REFERENCES `votes`(`vote_id`) ON DELETE CASCADE
);

-- Stores the anonymous ballots.
-- There is NO link from this table back to a user.
CREATE TABLE IF NOT EXISTS `ballots` (
  `ballot_id` INT AUTO_INCREMENT PRIMARY KEY,
  `vote_id` INT NOT NULL,
  `ranked_choices` JSON NOT NULL,
  FOREIGN KEY (`vote_id`) REFERENCES `votes`(`vote_id`) ON DELETE CASCADE
);

-- Stores a hash of users who have successfully cast a vote
-- This is the final check to prevent any re-voting
CREATE TABLE IF NOT EXISTS `voted_users` (
  `hash_id` INT AUTO_INCREMENT PRIMARY KEY,
  `vote_id` INT NOT NULL,
  `user_hash` VARCHAR(64) NOT NULL,
  FOREIGN KEY (`vote_id`) REFERENCES `votes`(`vote_id`) ON DELETE CASCADE,
  UNIQUE KEY `vote_user_unique` (`vote_id`, `user_hash`)
);