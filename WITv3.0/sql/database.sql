-- --------------------------------------------------------
-- Host:                         localhost
-- Server version:               11.8.3-MariaDB - mariadb.org binary distribution
-- Server OS:                    Win64
-- HeidiSQL Version:             12.11.0.7065
-- --------------------------------------------------------
-- This script handles both initial setup and database migrations.
-- It is safe to run on new or existing databases.
-- --------------------------------------------------------

-- Dumping database structure for wit-db
CREATE DATABASE IF NOT EXISTS `wit-db` /*!40100 DEFAULT CHARACTER SET utf8mb4 */;
USE `wit-db`;

-- Create tables in dependency order
CREATE TABLE IF NOT EXISTS `action_log_settings` (
  `id` int(11) NOT NULL DEFAULT 1,
  `log_message_delete` tinyint(1) DEFAULT 0,
  `log_message_edit` tinyint(1) DEFAULT 0,
  `log_member_join` tinyint(1) DEFAULT 0,
  `log_member_leave` tinyint(1) DEFAULT 0,
  `log_member_role_update` tinyint(1) DEFAULT 0,
  `log_voice_join` tinyint(1) DEFAULT 0,
  `log_voice_leave` tinyint(1) DEFAULT 0,
  `log_voice_move` tinyint(1) DEFAULT 0,
  `log_image_delete` tinyint(1) DEFAULT 0,
  `log_nickname_change` tinyint(1) DEFAULT 0,
  `log_member_ban` tinyint(1) DEFAULT 0,
  `log_member_unban` tinyint(1) DEFAULT 0,
  `log_member_timeout` tinyint(1) DEFAULT 0,
  `log_role_create` tinyint(1) DEFAULT 0,
  `log_role_delete` tinyint(1) DEFAULT 0,
  `log_role_update` tinyint(1) DEFAULT 0,
  `log_channel_create` tinyint(1) DEFAULT 0,
  `log_channel_delete` tinyint(1) DEFAULT 0,
  `log_channel_update` tinyint(1) DEFAULT 0,
  `log_invite_create` tinyint(1) DEFAULT 0,
  `log_invite_delete` tinyint(1) DEFAULT 0,
  `ignored_channels` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `ignored_roles` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

CREATE TABLE IF NOT EXISTS `bot_status` (
  `id` int(11) NOT NULL DEFAULT 1,
  `activity` varchar(50) DEFAULT NULL,
  `statusText` varchar(255) DEFAULT NULL,
  `url` varchar(255) DEFAULT NULL,
  `expiryTimestamp` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `commander_training` (
  `pilot_id` int(11) NOT NULL AUTO_INCREMENT,
  `pilot_name` varchar(255) NOT NULL,
  `discord_id` varchar(50) DEFAULT NULL,
  `status` enum('resident','line_commander','training_fc','inactive') NOT NULL DEFAULT 'resident',
  `start_date` datetime DEFAULT NULL,
  `last_active` datetime DEFAULT NULL,
  `resident_orientation_by` varchar(255) DEFAULT NULL,
  `signoff_scouting` text CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `signoff_trusted_logi` tinyint(1) NOT NULL DEFAULT 0,
  `signoff_bastion` tinyint(1) NOT NULL DEFAULT 0,
  `signoff_new_pilot_orientation` text CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `exam_multiple_choice` tinyint(1) NOT NULL DEFAULT 0,
  `exam_ct` tinyint(1) NOT NULL DEFAULT 0,
  `comments` text CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  PRIMARY KEY (`pilot_id`),
  UNIQUE KEY `discord_id` (`discord_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `config` (
  `key_name` varchar(255) NOT NULL,
  `value` longtext DEFAULT NULL,
  PRIMARY KEY (`key_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `google_docs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `alias` varchar(50) NOT NULL,
  `doc_id` varchar(50) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `google_sheets` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `alias` varchar(50) NOT NULL,
  `sheet_id` varchar(50) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `incursion_state` (
  `id` int(11) NOT NULL DEFAULT 1,
  `lastIncursionState` varchar(50) DEFAULT NULL,
  `incursionMessageId` varchar(50) DEFAULT NULL,
  `lastHqSystemId` int(11) DEFAULT NULL,
  `spawnTimestamp` bigint(20) DEFAULT NULL,
  `mobilizingTimestamp` bigint(20) DEFAULT NULL,
  `withdrawingTimestamp` bigint(20) DEFAULT NULL,
  `endedTimestamp` bigint(20) DEFAULT NULL,
  `lastIncursionStats` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`lastIncursionStats`)),
  `route_data` text DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `incursion_systems` (
  `Constellation_id` int(11) NOT NULL,
  `Constellation` varchar(255) DEFAULT NULL,
  `vanguard_systems` varchar(255) DEFAULT NULL,
  `assault_systems` varchar(255) DEFAULT NULL,
  `headquarters_system` varchar(50) DEFAULT NULL,
  `dockup` varchar(255) DEFAULT NULL,
  `dock_up_system_id` varchar(50) DEFAULT NULL,
  `is_island` varchar(50) DEFAULT NULL,
  `region_faction` varchar(50) DEFAULT NULL,
  `region` varchar(255) DEFAULT NULL,
  `region_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`Constellation_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `isk_logs` (
  `log_id` int(11) NOT NULL AUTO_INCREMENT,
  `discord_id` varchar(50) NOT NULL,
  `commander_name` varchar(255) NOT NULL,
  `fleet_timestamp` datetime NOT NULL,
  `duration_minutes` int(11) NOT NULL,
  `total_isk` bigint(20) NOT NULL,
  `isk_per_hour` bigint(20) NOT NULL,
  `pilot_count` decimal(5,2) NOT NULL,
  `sites_run` int(11) NOT NULL,
  `journal_data` text DEFAULT NULL,
  PRIMARY KEY (`log_id`),
  KEY `discord_id_idx` (`discord_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `logi_signoffs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `pilot_name` varchar(255) NOT NULL,
  `pilot_id` int(11) DEFAULT NULL,
  `signoffs` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`signoffs`)),
  `history` longtext DEFAULT NULL,
  `status` varchar(50) DEFAULT 'in_progress',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `pilot_name` (`pilot_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `mail_queue` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `sender_discord_id` varchar(50) NOT NULL,
  `mailing_list_id` int(11) NOT NULL,
  `subject` varchar(255) NOT NULL,
  `body` text NOT NULL,
  `failed_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `quizzes` (
  `quiz_id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `pass_mark_percentage` int(3) NOT NULL DEFAULT 80,
  `category` enum('resident','training_fc') NOT NULL DEFAULT 'resident',
  PRIMARY KEY (`quiz_id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `quiz_questions` (
  `question_id` int(11) NOT NULL AUTO_INCREMENT,
  `quiz_id` int(11) NOT NULL,
  `question_text` text NOT NULL,
  `question_type` varchar(20) NOT NULL DEFAULT 'single',
  `order_index` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`question_id`),
  KEY `quiz_id` (`quiz_id`),
  CONSTRAINT `fk_quiz_questions_quiz` FOREIGN KEY (`quiz_id`) REFERENCES `quizzes` (`quiz_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `quiz_answers` (
  `answer_id` int(11) NOT NULL AUTO_INCREMENT,
  `question_id` int(11) NOT NULL,
  `answer_text` text NOT NULL,
  `is_correct` tinyint(1) NOT NULL DEFAULT 0,
  `order_index` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`answer_id`),
  KEY `question_id` (`question_id`),
  CONSTRAINT `fk_quiz_answers_question` FOREIGN KEY (`question_id`) REFERENCES `quiz_questions` (`question_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `quiz_attempts` (
  `attempt_id` int(11) NOT NULL AUTO_INCREMENT,
  `discord_id` varchar(50) NOT NULL,
  `quiz_id` int(11) NOT NULL,
  `score` int(3) NOT NULL,
  `passed` tinyint(1) NOT NULL,
  `timestamp` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`attempt_id`),
  KEY `discord_id` (`discord_id`),
  KEY `quiz_id` (`quiz_id`),
  CONSTRAINT `fk_quiz_attempts_quiz` FOREIGN KEY (`quiz_id`) REFERENCES `quizzes` (`quiz_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `quiz_completions` (
  `completion_id` int(11) NOT NULL AUTO_INCREMENT,
  `discord_id` varchar(50) NOT NULL,
  `quiz_id` int(11) NOT NULL,
  `completed_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`completion_id`),
  UNIQUE KEY `user_quiz` (`discord_id`,`quiz_id`),
  KEY `quiz_id` (`quiz_id`),
  CONSTRAINT `fk_completion_quiz` FOREIGN KEY (`quiz_id`) REFERENCES `quizzes` (`quiz_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `reaction_roles` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `guild_id` varchar(50) NOT NULL,
  `channel_id` varchar(50) NOT NULL,
  `message_id` varchar(50) NOT NULL,
  `role_id` varchar(50) NOT NULL,
  `emoji` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `message_emoji_role` (`message_id`,`emoji`(100),`role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `reminders` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `discord_id` varchar(50) NOT NULL,
  `channel_id` varchar(50) NOT NULL,
  `remind_at` bigint(20) NOT NULL,
  `reminder_text` text NOT NULL,
  `is_private` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `discord_id` (`discord_id`),
  KEY `remind_at` (`remind_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `resident_applications` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `character_name` varchar(255) NOT NULL,
  `alts` text DEFAULT NULL,
  `forum_identity` varchar(255) NOT NULL,
  `discord_identity` varchar(255) NOT NULL,
  `wtm_time` varchar(255) NOT NULL,
  `logistics_ships` text NOT NULL,
  `battleship_ships` text NOT NULL,
  `t2_guns` varchar(255) NOT NULL,
  `command_time_estimate` varchar(255) NOT NULL,
  `why_commander` text NOT NULL,
  `why_wtm` text NOT NULL,
  `discord_id` varchar(50) NOT NULL,
  `submitted_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `role_hierarchy` (
  `roleName` varchar(50) NOT NULL,
  `hierarchy_level` int(11) NOT NULL DEFAULT 0,
  `promote` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`promote`)),
  `demote` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`demote`)),
  `history` longtext DEFAULT NULL,
  PRIMARY KEY (`roleName`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `saved_embeds` (
  `embed_name` varchar(100) NOT NULL,
  `guild_id` varchar(50) NOT NULL,
  `embed_data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`embed_data`)),
  `content` text DEFAULT NULL,
  `created_by_id` varchar(50) DEFAULT NULL,
  `created_by_tag` varchar(100) DEFAULT NULL,
  `last_edited_by_id` varchar(50) DEFAULT NULL,
  `last_edited_by_tag` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `last_edited_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `last_sent_channel_id` varchar(50) DEFAULT NULL,
  `last_sent_message_id` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`embed_name`,`guild_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `srp_history` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `pilot_name` varchar(255) NOT NULL,
  `kill_report_link` varchar(255) DEFAULT NULL,
  `fc_name` varchar(255) NOT NULL,
  `fc_status` varchar(255) NOT NULL,
  `backseat_details` varchar(255) DEFAULT NULL,
  `ship_type` varchar(255) NOT NULL,
  `srpable` varchar(255) NOT NULL,
  `srp_paid` varchar(255) NOT NULL,
  `loss_description` text NOT NULL,
  `loot_status` text NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `training_fc_tracker` (
  `pilot_id` int(11) NOT NULL,
  `t1_tagging` varchar(255) DEFAULT NULL,
  `t1_voicing` varchar(255) DEFAULT NULL,
  `t1_waitlist` varchar(255) DEFAULT NULL,
  `t2_situational_awareness` varchar(255) DEFAULT NULL,
  `t2_evacuations` varchar(255) DEFAULT NULL,
  `practice_fleet_speed` varchar(255) DEFAULT NULL,
  `practice_system_awareness` varchar(255) DEFAULT NULL,
  `competency_final` varchar(255) DEFAULT NULL,
  `last_reported_active` date DEFAULT NULL,
  `comments` text CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `special_notes` text DEFAULT NULL,
  PRIMARY KEY (`pilot_id`),
  CONSTRAINT `fk_tfc_pilot` FOREIGN KEY (`pilot_id`) REFERENCES `commander_training` (`pilot_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `trusted_pilots` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `pilot_name` varchar(255) NOT NULL,
  `pilot_id` int(11) DEFAULT NULL,
  `final_signoff_by` varchar(255) DEFAULT NULL COMMENT 'Commander who gave the final signoff',
  `added_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `signoffs` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Full JSON array of signoff objects at the time of passing' CHECK (json_valid(`signoffs`)),
  `demerits` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'JSON array of demerit objects' CHECK (json_valid(`demerits`)),
  `history` longtext DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `pilot_name` (`pilot_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `users` (
  `character_id` int(11) NOT NULL,
  `discord_id` varchar(50) NOT NULL,
  `character_name` varchar(255) NOT NULL,
  `roles` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `access_token` text DEFAULT NULL,
  `refresh_token` text DEFAULT NULL,
  `token_expiry` bigint(20) DEFAULT NULL,
  `is_main` tinyint(1) NOT NULL DEFAULT 0,
  `is_mailing_char` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`character_id`),
  KEY `discord_id` (`discord_id`),
  CONSTRAINT `roles` CHECK (json_valid(`roles`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- --------------------------------------------------------
-- MIGRATION SCRIPT
-- This section will add/remove columns to bring an old schema up to date.
-- --------------------------------------------------------

DELIMITER $$
CREATE PROCEDURE DropColumnIfExists(IN dbName VARCHAR(255), IN tableName VARCHAR(255), IN colName VARCHAR(255))
BEGIN
    IF EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = dbName
        AND TABLE_NAME = tableName
        AND COLUMN_NAME = colName
    ) THEN
        SET @sql = CONCAT('ALTER TABLE `', tableName, '` DROP COLUMN `', colName, '`;');
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$
DELIMITER ;

-- Remove deprecated quiz columns from commander_training as this is now handled by the quiz_completions table
CALL DropColumnIfExists('wit-db', 'commander_training', 'quiz_scouting');
CALL DropColumnIfExists('wit-db', 'commander_training', 'quiz_fitting');
CALL DropColumnIfExists('wit-db', 'commander_training', 'quiz_fleet_roles');
CALL DropColumnIfExists('wit-db', 'commander_training', 'quiz_site_mechanics');

-- Clean up the stored procedure
DROP PROCEDURE IF EXISTS DropColumnIfExists;

