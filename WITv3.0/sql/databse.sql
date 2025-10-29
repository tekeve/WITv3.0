-- --------------------------------------------------------
-- Host:                         localhost
-- Server version:               11.8.3-MariaDB - mariadb.org binary distribution
-- Server OS:                    Win64
-- HeidiSQL Version:             12.12.0.7122
-- --------------------------------------------------------

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET NAMES utf8 */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;


-- Dumping database structure for wit-db
CREATE DATABASE IF NOT EXISTS `wit-db` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci */;
USE `wit-db`;

-- Dumping structure for table wit-db.corp_wallet_transactions
CREATE TABLE IF NOT EXISTS `corp_wallet_transactions` (
  `transaction_id` bigint(20) unsigned NOT NULL,
  `corporation_id` int(10) unsigned NOT NULL,
  `division` tinyint(3) unsigned NOT NULL,
  `date` datetime NOT NULL,
  `ref_type` varchar(255) NOT NULL,
  `first_party_id` int(10) unsigned DEFAULT NULL,
  `first_party_name` varchar(255) DEFAULT NULL,
  `second_party_id` int(10) unsigned DEFAULT NULL,
  `second_party_name` varchar(255) DEFAULT NULL,
  `amount` decimal(20,2) NOT NULL,
  `balance` decimal(20,2) NOT NULL,
  `reason` varchar(1024) DEFAULT NULL,
  `tax_receiver_id` int(10) unsigned DEFAULT NULL,
  `tax_amount` decimal(20,2) DEFAULT NULL,
  `context_id` bigint(20) DEFAULT NULL,
  `context_type` varchar(255) DEFAULT NULL,
  `description` varchar(255) NOT NULL,
  `custom_category` enum('srp_in','srp_out','giveaway','internal_transfer','manual_change','manual_out','tax','other') DEFAULT NULL COMMENT 'Custom category assigned automatically or manually',
  `last_updated` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`transaction_id`),
  KEY `idx_corp_division_date` (`corporation_id`,`division`,`date`),
  KEY `idx_date` (`date`),
  KEY `idx_ref_type` (`ref_type`),
  KEY `idx_custom_category` (`custom_category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Data exporting was unselected.

/*!40103 SET TIME_ZONE=IFNULL(@OLD_TIME_ZONE, 'system') */;
/*!40101 SET SQL_MODE=IFNULL(@OLD_SQL_MODE, '') */;
/*!40014 SET FOREIGN_KEY_CHECKS=IFNULL(@OLD_FOREIGN_KEY_CHECKS, 1) */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40111 SET SQL_NOTES=IFNULL(@OLD_SQL_NOTES, 1) */;
