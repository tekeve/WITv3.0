-- --------------------------------------------------------
-- Host:                         localhost
-- Server version:               11.8.3-MariaDB - mariadb.org binary distribution
-- Server OS:                    Win64
-- HeidiSQL Version:             12.11.0.7065
-- --------------------------------------------------------

-- Dumping database structure for wit-db
CREATE DATABASE IF NOT EXISTS `wit-db`;
USE `wit-db`;

-- Dumping structure for table wit-db.action_log_settings
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

-- Dumping data for table wit-db.action_log_settings: ~1 rows (approximately)
REPLACE INTO `action_log_settings` (`id`, `log_message_delete`, `log_message_edit`, `log_member_join`, `log_member_leave`, `log_member_role_update`, `log_voice_join`, `log_voice_leave`, `log_voice_move`, `log_image_delete`, `log_nickname_change`, `log_member_ban`, `log_member_unban`, `log_member_timeout`, `log_role_create`, `log_role_delete`, `log_role_update`, `log_channel_create`, `log_channel_delete`, `log_channel_update`, `log_invite_create`, `log_invite_delete`, `ignored_channels`, `ignored_roles`) VALUES
	(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, '["1364223029814759444"]', '["410421579567202305"]');

-- Dumping structure for table wit-db.bot_status
CREATE TABLE IF NOT EXISTS `bot_status` (
  `id` int(11) NOT NULL DEFAULT 1,
  `activity` varchar(50) DEFAULT NULL,
  `statusText` varchar(255) DEFAULT NULL,
  `url` varchar(255) DEFAULT NULL,
  `expiryTimestamp` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Dumping data for table wit-db.bot_status: ~1 rows (approximately)
REPLACE INTO `bot_status` (`id`, `activity`, `statusText`, `url`, `expiryTimestamp`) VALUES
	(1, 'Watching', '... always watching ...', NULL, NULL);

-- Dumping structure for table wit-db.config
CREATE TABLE IF NOT EXISTS `config` (
  `key_name` varchar(255) NOT NULL,
  `value` longtext DEFAULT NULL,
  PRIMARY KEY (`key_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Dumping data for table wit-db.config: ~17 rows (approximately)
REPLACE INTO `config` (`key_name`, `value`) VALUES
	('actionLogChannelId', '["1418465802247475231"]'),
	('adminRoles', '["1412546107975929917"]'),
	('archiveChannelId', '[\r\n  "1411962451439652904"\r\n]'),
	('auditLogChannelId', '[\r\n  "1413370040245555312"\r\n]'),
	('authRoles', '[\r\n  "1412546107975929917",\r\n  "1412546080448712826"\r\n]'),
	('commanderRoles', '[\r\n  "1412545597021622383"\r\n]'),
	('councilRoles', '[\r\n  "1412546107975929917",\r\n  "1412546080448712826"\r\n]'),
	('githubBranch', '["master"]'),
	('githubChannelId', '["1418129590143942718"]'),
	('githubRepoUrl', '["https://github.com/tekeve/WITv3.0"]'),
	('incursionChannelId', '["1364223029814759444"]'),
	('lastCommitSha', '["f8b54a7329dace7550552bea3e3173c94dc88fa8"]'),
	('requestChannelId', '[\r\n  "1411962383978725436"\r\n]'),
	('setupLocked', '[\r\n  "true"\r\n]'),
	('srpChannelId', '["1412210083135225866" ]'),
	('srpMailingListId', '["145241588"]'),
	('tradeHubs', '{\r\n  "Jita": "30000142",\r\n  "Amarr": "30002187",\r\n  "Dodixie": "30002659",\r\n  "Rens": "30002510",\r\n  "Hek": "30002053"\r\n}');

-- Dumping structure for table wit-db.google_docs
CREATE TABLE IF NOT EXISTS `google_docs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `alias` varchar(50) NOT NULL,
  `doc_id` varchar(50) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Dumping structure for table wit-db.google_sheets
CREATE TABLE IF NOT EXISTS `google_sheets` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `alias` varchar(50) NOT NULL,
  `sheet_id` varchar(50) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Dumping structure for table wit-db.incursion_state
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
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Dumping data for table wit-db.incursion_state: ~1 rows (approximately)
REPLACE INTO `incursion_state` (`id`, `lastIncursionState`, `incursionMessageId`, `lastHqSystemId`, `spawnTimestamp`, `mobilizingTimestamp`, `withdrawingTimestamp`, `endedTimestamp`, `lastIncursionStats`) VALUES
	(1, '20000777-mobilizing', '1417578751784390921', 30002252, 1757823480, 1758206040, NULL, NULL, NULL);

-- Dumping structure for table wit-db.incursion_systems
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Dumping data for table wit-db.incursion_systems: ~105 rows (approximately)
REPLACE INTO `incursion_systems` (`Constellation_id`, `Constellation`, `vanguard_systems`, `assault_systems`, `headquarters_system`, `dockup`, `dock_up_system_id`, `is_island`, `region_faction`, `region`, `region_id`) VALUES
	(20000001, 'San Matar', 'Akpivem, Nirbhi, Tanoo, Yuzier', 'Jark, Sasta', 'Lashesih (0.8)', 'Lisudeh IV - Moon 4 - Theology Council Tribunal', '30000005', 'NOTISLAND', '500007', 'Derelik', 10000003),
	(20000004, 'Kalangin', 'Eshtah, Kasrasi, Ordize, Rashy', 'Fovihi, Psasa', 'Kiereend (0.8)', 'Kiereend VII - Moon 3 - DED Assembly Plant', '30000024', 'NOTISLAND', '500007', 'Derelik', 10000003),
	(20000008, 'Mossas', 'Ibaria, Maspah, Zemalu', 'Juddi', 'Khankenirdia (0.6)', 'Khankenirdia V - Moon 17 - Ammatar Consulate Academy', '30000056', 'NOTISLAND', '500007', 'Derelik', 10000003),
	(20000009, 'Mekashtad', 'Iosantin, Janus, Orva, Salashayama, Thiarer, Zet', 'Amphar, Nikh, Usroh', 'Agha (0.7)', 'Agha IX - Moon 6 - Trust Partners Warehouse', '30000061', 'NOTISLAND', '500007', 'Derelik', 10000003),
	(20000011, 'Orshed', 'Jofan, Odlib, Yadi', 'Tidacha', 'Milu (0.8)', 'Tidacha VIII - Moon 13 - Ammatar Consulate Bureau', '30000076', 'NOTISLAND', '500007', 'Derelik', 10000003),
	(20000012, 'Oraron', 'Ejahi, Gelhan, Jarizza', 'Asghatil, Bar', 'Sucha (0.7)', 'Asghatil IX - Moon 3 - DED Assembly Plant', '30000084', 'NOTISLAND', '500007', 'Derelik', 10000003),
	(20000017, 'Ruomo', 'Ahtulaima, Kylmabe, Vaankalen', 'Jatate, Mitsolen', 'Mahtista (0.7)', 'Mitsolen I - Moon 1 - Expert Housing Warehouse', '30000120', 'NOTISLAND', '500001', 'Lonetrek', 10000016),
	(20000019, 'Ihilakken', 'Ansila, Aokannitoh, Hirtamon, Ikuchi', 'Hykkota, Ohmahailen, Outuni', 'Aokannitoh (1.0)', 'Aokannitoh VII - Moon 2 - School of Applied Knowledge', '30021407', 'NOTISLAND', '500001', 'Lonetrek', 10000016),
	(20000021, 'Okomon', '', '', 'Abagawa (0.6)', 'Abagawa VIII - Moon 4 - Peace and Order Unit Logistic Support', '', 'NOTISLAND', '500001', 'Lonetrek', 10000016),
	(20000025, 'Otsabaira', 'Akkilen, Keikaken, Onuse', 'Soshin, Vattuolen', 'Silen (0.5)', 'Silen III - Moon 9 - Lai Dai Corporation Research Center', '30000179', 'NOTISLAND', '500001', 'Lonetrek', 10000016),
	(20000200, 'Haurala', 'Erenta, Ouranienen, Uemisaisen', 'Sotrentaira', 'Raussinen (0.5)', 'Raussinen XI - Moon 2 - Genolution Biotech Research Center', '30001373', 'NOTISLAND', '500001', 'The Citadel', 10000033),
	(20000207, 'Kainokai', 'Autama, Kuoka, Tsukuras', 'Kirras', 'Nani (-1.0)', 'Nani IV - Moon 2 - Aliastra Warehouse', '30001413', 'NOTISLAND', '500001', 'The Citadel', 10000033),
	(20000208, 'Pietanen', 'Atai, Otalieto, Rauntaka', 'Liukikka', 'Aikantoh (0.6)', 'Aikantoh I - Moon 1 - Mercantile Club Academy', '', 'ISLAND', '500001', 'The Citadel', 10000033),
	(20000209, 'Asalola', 'Ibura, Isinokka, Yoma', 'Oipo', 'Haajinen (0.8)', 'Haajinen XI - Moon 9 - Lai Dai Corporation Warehouse', '30001424', 'NOTISLAND', '500001', 'The Citadel', 10000033),
	(20000243, 'Sanair', 'Adahum, Goram, Tendhyes', 'Tividu', 'Anjedin (0.5)', 'Tividu III - Kaalakiota Corporation Factory', '30001644', 'NOTISLAND', '500003', 'The Bleak Lands', 10000035),
	(20000244, 'Somi', 'Imeshasa, Jarzalad, Pimsu', 'Nafomeh', 'Riramia (0.6)', 'Riramia VI - Moon 12 - TransStellar Shipping Storage', '30001650', 'NOTISLAND', '500003', 'The Bleak Lands', 10000035),
	(20000248, 'Mimishia', 'Atoosh, Hoona, Mimen', 'Thashkarai', 'Sacalan (0.6)', 'Thashkarai VII - Moon 1 - Emperor Family Bureau', '30001677', 'NOTISLAND', '500003', 'The Bleak Lands', 10000035),
	(20000250, 'Damadil', 'Hostni, Kibursha, Mimime', 'Asesamy, Onazel', 'Lossa (0.8)', 'Lossa II - Ministry of Assessment Information Center', '30001687', 'NOTISLAND', '500003', 'The Bleak Lands', 10000035),
	(20000251, 'Rifenda', 'Gaknem, Nehkiah, Siyi', 'Iro', 'Abai (0.7)', 'Abai IV - Moon 11 - Joint Harvesting Mineral Reserve', '30001694', 'NOTISLAND', '500003', 'The Bleak Lands', 10000035),
	(20000252, 'Nasorin', 'Arkoz, Jinizu, Taru, Yanuel', 'Nafrivik, Remoriu', 'Phoren (0.6)', 'Nafrivik VIII - Moon 6 - Ministry of War Bureau Offices', '30001702', 'NOTISLAND', '500003', 'The Bleak Lands', 10000035),
	(20000253, 'Tsemshatel', 'Azerakish, Ghishul, Lari, Moutid', 'Asezai, Yeder', 'Ferira (0.6)', 'Ferira VI - Moon 14 - Imperial Shipment Storage', '30001709', 'NOTISLAND', '500003', 'The Bleak Lands', 10000035),
	(20000255, 'Ajah', 'Assiad, Iswa, Rand, Rumida', 'Kerepa, Marthia, Nosodnis', 'Safilbab (1.0)', 'Safilbab VIII - Moon 4 - Royal Amarr Institute School', '30031672', 'NOTISLAND', '500003', 'The Bleak Lands', 10000035),
	(20000256, 'Subhatoub', 'Tew, Zehru, Zith', 'Alra, Ilas', 'Sinid (0.7)', 'Sinid VI - Moon 12 - Expert Distribution Warehouse', '30001729', 'NOTISLAND', '500003', 'The Bleak Lands', 10000035),
	(20000257, 'Peges', 'Hath, Judra, Sharios, Uhodoh', 'Esa, Kari', 'Arakor (0.7)', 'Judra VII - Moon 7 - Amarr Certified News Publisher', '30001738', 'NOTISLAND', '500003', 'The Bleak Lands', 10000035),
	(20000305, 'Ani', '', '', '', '', '', 'NOTISLAND', '500002', 'Metropolis', 10000042),
	(20000323, 'Mobit', 'Bashakru, Shuria, Sukirah', 'Mikhir, Ziona', 'Akhragan (0.8)', 'Akhragan V - Moon 1 - Amarr Civil Service Bureau Offices', '30002197', 'NOTISLAND', '500003', 'Domain', 10000043),
	(20000324, 'Yestadan', 'Armala, Murema, Uchat', 'Ilonarav', 'Gaha (0.7)', 'Gaha VII - Moon 2 - Republic Security Services Logistic Support', '30002204', 'NOTISLAND', '500003', 'Domain', 10000043),
	(20000325, 'Mazake', 'Hiramu, Hutian, Mazitah, Pelkia', 'Joppaya, Raren', 'Noli (0.6)', 'Bika II - Theology Council Law School', '30002252', 'NOTISLAND', '500003', 'Domain', 10000043),
	(20000326, 'Kekah', 'Aghesi, Charra, Patzcha', 'Airshaz', 'Fabin (0.7)', 'Aghesi VI - Moon 10 - Ministry of Assessment Bureau Offices', '30002220', 'NOTISLAND', '500003', 'Domain', 10000043),
	(20000327, 'Sosarir', 'Ardishapur Prime, Gid, Nererut, Nifshed, Vashkah', 'Rasile, Sitanan, Thebeka', 'Dakba (0.7)', 'Dakba I - Ardishapur Family Academy', '30002233', 'NOTISLAND', '500003', 'Domain', 10000043),
	(20000329, 'Mulata', 'Ahala, Arera, Knophtikoo', 'Hai, Seiradih', 'Mamenkhanar (0.7)', 'Mamenkhanar IX - Moon 11 - DED Logistic Support', '30002242', 'NOTISLAND', '500003', 'Domain', 10000043),
	(20000331, 'Kehina', 'Esteban, Luromooh, Sahdil', 'Nadohman', 'Moussou (0.8)', 'Nadohman IV - Moon 3 - Imperial Shipment Storage', '30002258', 'NOTISLAND', '500003', 'Domain', 10000043),
	(20000332, 'Avib', 'Azizora, Hadonoo, Shabura', 'Jarshitsan', 'Ahmak (0.6)', 'Ahmak VII - Imperial Chancellor Archives', '30002266', 'NOTISLAND', '500003', 'Domain', 10000043),
	(20000334, 'Norgoh', 'Bhizheba, Eba, Safizon, Zatsyaki', 'Artoun, Ebtesham', 'Isamm (0.7)', 'Isamm IX - Moon 15 - Imperial Chancellor Bureau Offices', '30002276', 'NOTISLAND', '500003', 'Domain', 10000043),
	(20000369, 'Osta', 'Austraka, Dumkirinur, Sist', 'Edmalbrurdus, Kronsur', 'Todeko (1.0)', 'Todeko VII - Republic University', '30032505', 'NOTISLAND', '500002', 'Molden Heath', 10000028),
	(20000370, 'Odengsolf', 'Avesber, Frarn, Gyng, Illinfrik', 'Ivar, Meirakulf', 'Usteli (1.0)', 'Usteli V - Republic University', '30042505', 'NOTISLAND', '500002', 'Molden Heath', 10000028),
	(20000376, 'Urtfer', 'Appen, Javrendei, Klir', 'Trer', 'Egmur (0.7)', 'Egmur VII - Moon 15 - Republic Parliament Academy', '30002563', 'NOTISLAND', '500002', 'Molden Heath', 10000028),
	(20000377, 'Erada', 'Krilmokenur, Magiko, Onga, Vullat', 'Larkugei, Oremmulf, Osaumuni', 'Hurjafren (0.9)', 'Hurjafren VI - Moon 17 - Republic Parliament Bureau', '30002572', 'NOTISLAND', '500002', 'Molden Heath', 10000028),
	(20000386, 'Disier', 'Balle, Du Annes, Metserel, Erme', 'Grinacanne, Pettinck', 'Adreland (0.9)', 'Adreland VI - Moon 8 - Astral Mining Inc. Refinery', '30002639', 'NOTISLAND', '500004', 'Sinq Laison', 10000032),
	(20000391, 'Jonenor', 'Ansone, Dunraelare, Nausschie, Trosquesere', 'Estene, Stayme', 'Inghenges (0.7)', 'Inghenges V - Moon 2 - Ishukone Corporation Factory', '30002672', 'NOTISLAND', '500004', 'Sinq Laison', 10000032),
	(20000392, 'Algintal', 'Audaerne, Augnais, Fluekele, Jolia', 'Alsottobier, Deltole, Parchanier', 'Colelie (0.5)', 'Bei VII - Moon 3 - Freedom Extension Retail Center', '30002048', 'NOTISLAND', '500004', 'Sinq Laison', 10000032),
	(20000395, 'Wyllequet', 'Atier, Bawilan, Brapelille', 'Adrallezoen', 'Brybier (0.6)', 'Brybier I - Moon 20 - Freedom Extension Warehouse', '30002703', 'NOTISLAND', '500004', 'Sinq Laison', 10000032),
	(20000396, 'Agiesseson', 'Adiere, Oirtlair, Olelon, Stetille', 'Auberulle, Doussivitte', 'Unel (0.9)', 'Unel IX - Chemal Tech Factory', '30002707', 'NOTISLAND', '500004', 'Sinq Laison', 10000032),
	(20000402, 'Nagaslaiken', 'Jeras, Kakki, Oijamon', 'Auviken', 'Ohvosamon (0.7)', 'Ohvosamon VII - Spacelane Patrol Logistic Support', '30002743', 'NOTISLAND', '500001', 'The Forge', 10000002),
	(20000403, 'Arekin', 'Alikara, Kausaaja, Oiniken', 'Aikoro', 'Ahynada (0.8)', 'Ahynada VII - Mercantile Club Bureau', '30002752', 'NOTISLAND', '500001', 'The Forge', 10000002),
	(20000405, 'Caldari Border Zone', 'Hatakani, Iivinen, Tennen', 'Yashunen', 'Kassigainen (0.9)', 'Yashunen III - Genolution Biotech Production', '30002762', 'NOTISLAND', '500001', 'The Forge', 10000002),
	(20000407, 'Outartoh', 'Annaro, Isutaka, Tasabeshi', 'Muvolailen', 'Paara (0.8)', 'Paara I - Spacelane Patrol Logistic Support', '30002775', 'NOTISLAND', '500001', 'The Forge', 10000002),
	(20000409, 'Suon', 'Inaro, Irjunen, Waskisen', 'Sirppala', 'Kaaputenen (0.8)', 'Kaaputenen III - Moon 1 - CBD Sell Division Warehouse', '30002789', 'NOTISLAND', '500001', 'The Forge', 10000002),
	(20000413, 'Santenpaa', 'Aramachi, Komo, Laah, Oichiya', 'Saila, Isenairos', 'Uotila (0.6)', 'Uotila V - Moon 14 - Chief Executive Panel Bureau', '30002814', 'NOTISLAND', '500001', 'The Forge', 10000002),
	(20000434, 'Ryra', 'Choonka, Dihra, Dital', 'Esescama', 'Odin (0.6)', 'Ohide VI - Moon 2 - Kaalakiota Corporation Warehouse', '30002964', 'NOTISLAND', '500003', 'Genesis', 10000067),
	(20000435, 'Kisana', 'Gheth, Lisudeh, Mehatoor', 'Sasoutikh', 'Ohide (0.6)', 'Ohide VI - Moon 2 - Kaalakiota Corporation Warehouse', '30002970', 'NOTISLAND', '500003', 'Genesis', 10000067),
	(20000438, 'Daredan', 'Hati, Riavayed, Uadelah', 'Hakshma, Laddiaha', 'Nakatre (0.6)', 'Nakatre II - Emperor Family Bureau', '30002988', 'NOTISLAND', '500003', 'Genesis', 10000067),
	(20000440, 'Enka', 'Arveyil, Nidebora, Uktiad, Ulerah', 'Faktun, Halenan', 'Mili (0.6)', 'Mili VIII - Moon 12 - Amarr Civil Service Bureau Offices', '', 'ISLAND', '500003', 'Genesis', 10000067),
	(20000441, 'Osnins', 'Amattens, Bereye, Junsoraert, Jurlesel', 'Arnatele, Halle', 'Mormoen (0.7)', 'Mormoen II - Caldari Business Tribunal Accounting', '30003011', 'NOTISLAND', '500004', 'Verge Vendor', 10000001),
	(20000443, 'Ysiette', 'Jaschercis, Marosier, Vaurent', 'Ardallabier, Lirsautton', 'Blameston (1.0)', 'Blameston IV - Moon 12 - Quafe Company Retail Center', '30003026', 'NOTISLAND', '500004', 'Verge Vendor', 10000001),
	(20000444, 'Odilis', 'Frarolle, Gicodel, Mattere', 'Ethernity, Meves', 'Athinard (1.0)', 'Athinard IV - Sisters of EVE Bureau', '30003031', 'NOTISLAND', '500004', 'Verge Vendor', 10000001),
	(20000446, 'Elalan', 'Averon, Carirgnottin, Muer, Odixie, Scuelazyns, Tolle', 'Angymonne, Antollare, Enedore, Laic', 'Avele (0.7)', 'Avele VI - Moon 15 - Caldari Business Tribunal', '30003053', 'NOTISLAND', '500004', 'Verge Vendor', 10000001),
	(20000450, 'Ichida', 'Hakoden, Hatori, Ronne', 'Jarkkolen', 'Junsen (0.8)', 'Junsen V - Moon 20 - CBD Corporation Storage', '30003083', 'NOTISLAND', '500003', 'Kor-Azor', 10000065),
	(20000492, 'Gedur', 'Alf, Arlulf, Brundakur, Illuin', 'Aldilur, Orgron, Nedegulf', 'Stirht (0.9)', 'Stirht VII - Moon 14 - CONCORD Bureau', '30003376', 'NOTISLAND', '500002', 'Heimatar', 10000030),
	(20000493, 'Lorundio', 'Evuldgenzo, Flost, Ongund', 'Eust', 'Todrir (1.0)', 'Eust I - Impetus Development Studio', '30003381', 'NOTISLAND', '500002', 'Heimatar', 10000030),
	(20000494, 'Ankard', 'Altrinur, Eygfe, Reset', 'Fildar, Olbra', 'Jondik (0.9)', 'Jondik VI - Joint Harvesting Mineral Reserve', '30003387', 'NOTISLAND', '500002', 'Heimatar', 10000030),
	(20000495, 'Jonar', 'Bongveber, Freatlidur, Maturat', 'Roleinn, Vorsk', 'Eiluvodi (0.8)', 'Eiluvodi VI - Moon 14 - CBD Corporation Storage', '30003393', 'NOTISLAND', '500002', 'Heimatar', 10000030),
	(20000496, 'Stadakorn', 'Agtver, Datulen, Erego, Meinmungen, Totkubad', 'Evettullur, Hjortur, Tamekamur', 'Egbonbet (0.9)', 'Egbonbet VI - Moon 11 - Republic Parliament Bureau', '30003401', 'NOTISLAND', '500002', 'Heimatar', 10000030),
	(20000498, 'Aptetter', 'Aldrat, Erstur, Urnhard', 'Fredagod', 'Hardbako (0.7)', 'Hardbako III - Moon 1 - Minmatar Mining Corporation Refinery', '30003418', 'NOTISLAND', '500002', 'Heimatar', 10000030),
	(20000500, 'Brazinget', 'Gedugaud, Oppold, Tratokard', 'Geffur', 'Hilfhurmur (0.8)', 'Hilfhurmur VIII - Moon 6 - CONCORD Logistic Support', '30003428', 'NOTISLAND', '500002', 'Heimatar', 10000030),
	(20000501, 'Frar', 'Earled, Ogoten, Tollus', 'Hebisa, Polstodur', 'Ansher (0.9)', 'Polstodur VIII - Moon 6 - Republic Justice Department Tribunal', '30003434', 'NOTISLAND', '500002', 'Heimatar', 10000030),
	(20000503, 'Panorad', 'Hakeri, Irgrus, Nifflung', 'Josekorn', 'Dantbeinn (0.7)', 'Dantbeinn III - Moon 5 - Republic Justice Department Law School', '30003451', 'NOTISLAND', '500002', 'Heimatar', 10000030),
	(20000504, 'Argeir', 'Atonder, Hotrardik, Ridoner', 'Engosi', 'Orduin (0.8)', 'Orduin V - Moon 7 - Republic Parliament Bureau', '30003453', 'NOTISLAND', '500002', 'Metropolis', 10000042),
	(20000510, 'Zemont', 'Ekid, Raravoss, Sharhelund', 'Youl', 'Nakri (0.8)', 'Nakri VI - Moon 1 - Amarr Navy Logistic Support', '30003496', 'NOTISLAND', '500003', 'Kador', 10000054),
	(20000511, 'Yekti', 'Bahromab, Kudi, Madirmilire', 'Fabum', 'Sharji (0.8)', 'Sayartchen V - Moon 2 - Sarum Family Logistic Support', '30003508', 'NOTISLAND', '500003', 'Kador', 10000054),
	(20000512, 'Hoosa', 'Abaim, Somouh, Sorzielang', 'Sayartchen, Teshi', 'Gosalav (0.7)', 'Gosalav VI - Sarum Family Logistic Support', '30003509', 'NOTISLAND', '500003', 'Kador', 10000054),
	(20000513, 'Chardu', 'Etav, Pedel, Saheri', 'Anila, Yeeramoun', 'Ides (0.8)', 'Etav VIII - Moon 14 - Amarr Civil Service Bureau Offices', '30003517', 'NOTISLAND', '500003', 'Kador', 10000054),
	(20000514, 'Maddam', 'Hama, Hanan, Irnal, Sarum Prime', 'Alkabsi, Bagodan, Mahrokht', 'Murzi (0.6)', 'Aghesi VI - Moon 10 - Ministry of Assessment Bureau Offices', '30002220', 'NOTISLAND', '500003', 'Kador', 10000054),
	(20000517, 'Maseend', 'Hamse, Jaswelu, Lashkai, Zhilshinou', 'Maiah, Yuhelia', 'Barira (0.8)', 'Yuhelia V - Moon 1 - Imperial Armaments Factory', '30003545', 'NOTISLAND', '500003', 'Kador', 10000054),
	(20000522, 'Orvanne', 'Niballe, Odinesyn, Postouvin', 'Larryn', 'Weraroix (0.6)', 'Larryn II - FedMart Warehouse', '', 'ISLAND', '500004', 'Placid', 10000048),
	(20000523, 'Goins', 'Arasare, Lazer, Yvelet', 'Vecodie', 'Yvaeroure (0.8)', 'Yvaeroure VI - Moon 1 - Fedmart Retail Center', '', 'ISLAND', '500004', 'Placid', 10000048),
	(20000557, 'Unour', 'Iffrue, Mollin, Ommaerrer', 'Ivorider', 'Osmallanais (0.8)', 'Osmallanais VII - Moon 9 - Material Acquisition Refinery', '', 'ISLAND', '500004', 'Placid', 10000048),
	(20000564, 'Nohshayess', 'Ipref, Jachanu, Khanid Prime, Kihtaled', 'Agil, Gousoviba, Neyi', 'Bukah (0.8)', 'Agil VI - Moon 2 - CONCORD Logistic Support', '30003862', 'NOTISLAND', '500008', 'Khanid', 10000049),
	(20000565, 'Finaka', 'Hishai, Osis, Sehsasez, Yezara', 'Ervekam, Kahah, Mashtarmem', 'Saloti (0.7)', 'Kahah I - Khanid Transport Storage', '30003873', 'NOTISLAND', '500008', 'Khanid', 10000049),
	(20000566, 'Amdimmah', 'Palas, Reteka, Safshela', 'Gidali', 'Molea (0.7)', 'Nakregde I - Amarr Civil Service Bureau Offices', '30005043', 'NOTISLAND', '500008', 'Khanid', 10000049),
	(20000568, 'Sib', 'Ainsan, Badivefi, Talidal', 'Ashi, Tzashrah', 'Sabusi (0.5)', 'Badivefi VIII - Moon 10 - Royal Khanid Navy Logistic Support', '30003888', 'NOTISLAND', '500008', 'Khanid', 10000049),
	(20000570, 'Fekhoya', 'Afnakat, Bashyam, Parses', 'Firbha', 'Col (0.5)', 'Parses VI - Moon 11 - Royal Khanid Navy Assembly Plant', '30003909', 'NOTISLAND', '500008', 'Khanid', 10000049),
	(20000596, 'Megeh', 'Aharalel, Gensela, Zorozih', 'Aphend, Romi', 'Hiroudeh (0.5)', 'Hiroudeh VIII - Moon 2 - Civic Court Tribunal', '30004077', 'NOTISLAND', '500003', 'Kador', 10000054),
	(20000597, 'Kakol', 'Aband, Ghesis, Gonan', 'Gamdis, Joamma', 'Joramok (0.8)', 'Joramok IV - Moon 4 - Ministry of War Archives', '30004088', 'NOTISLAND', '500003', 'Kador', 10000054),
	(20000598, 'Febihkin', 'Kador Prime, Khafis, Nordar', 'Askonak, Murini', 'Uanim (0.6)', 'Uanim VI - Moon 12 - Noble Appliances Factory', '30004091', 'NOTISLAND', '500003', 'Kador', 10000054),
	(20000599, 'Trigentia', 'Inis-Ilix, Sonama, Suner', 'Halibai, Turba', 'Kothe (0.6)', 'Kothe VI - Moon 15 - Theology Council Accounting', '30004103', 'NOTISLAND', '500003', 'Tash-Murkon', 10000052),
	(20000601, 'Parrosa', 'Mandoo, Miah, Peyiri', 'Yarebap', 'Finid (0.5)', 'Finid X - Moon 1 - Amarr Navy Assembly Plant', '30004110', 'NOTISLAND', '500003', 'Tash-Murkon', 10000052),
	(20000603, 'Araz', 'Jakri, Munory, Nidupad, Zimse', 'Aphi, Garisas', 'Chanoun (0.5)', 'Chanoun IX - The Scope Development Studio', '30004122', 'NOTISLAND', '500003', 'Tash-Murkon', 10000052),
	(20000604, 'Ahrnot', 'Hilmar, Jeshideh, Shura', 'Yooh', 'Hostakoh (0.6)', 'Hostakoh VI - Moon 2 - Theology Council Tribunal', '30004130', 'NOTISLAND', '500003', 'Tash-Murkon', 10000052),
	(20000606, 'Naloran', 'Hapala, Salah, Yebouz', 'Syrikos', 'Hikansog (0.8)', 'Hikansog VII - Moon 9 - Royal Amarr Institute School', '30004142', 'NOTISLAND', '500003', 'Tash-Murkon', 10000052),
	(20000607, 'Moghiz', 'Kooreng, Shaggoth, Ustnia', 'Elmed, Minin', 'Jennim (0.8)', 'Safizon II - Moon 1 - Amarr Navy Assembly Plant', '30002279', 'NOTISLAND', '500003', 'Tash-Murkon', 10000052),
	(20000608, 'Qermi', 'Asrios, Ithar, Shemah', 'Zorrabed', 'Telang (0.8)', 'Asrios III - Kaalakiota Corporation Factory', '30004156', 'NOTISLAND', '500003', 'Tash-Murkon', 10000052),
	(20000622, 'Mayonhen', 'Avada, Haimeh, Pahineh', 'Bazadod', 'Chibi (0.5)', 'Chibi VI - Moon 15 - CONCORD Treasury', '', 'ISLAND', '500003', 'Tash-Murkon', 10000052),
	(20000735, 'Eustron', 'Cat, Ommare, Vale', 'Atlangeins, Derririntel', 'Hecarrin (0.8)', 'Hecarrin VI - Moon 3 - Federal Navy Academy', '30024971', 'NOTISLAND', '500004', 'Solitude', 10000046),
	(20000738, 'Nimedaz', 'Danyana, Jinkah, Nibainkier, Polfaly', 'Annad, Nahyeen', 'Andrub (0.7)', 'Andrub VI - Ministry of War Bureau Offices', '30005049', 'NOTISLAND', '500003', 'Devoid', 10000047),
	(20000739, 'Panoumid', 'Imih, Soumi, Zinkon', 'Choga', 'Kulu (0.6)', 'Kulu X - Moon 3 - Caldari Business Tribunal Bureau Offices', '30005050', 'NOTISLAND', '500003', 'Devoid', 10000047),
	(20000761, 'Sanctum', '', '', 'Tarta (0.5)', 'Tarta IX - Moon 14 - DED Assembly Plant', '30005205', 'NOTISLAND', '500003', 'Genesis', 10000067),
	(20000763, 'Ekrin', '', '', '', '', '', 'NOTISLAND', '500003', 'Genesis', 10000067),
	(20000767, 'Reya', 'Gergish, Kobam, Tahli', 'Madomi', 'Hirizan (0.5)', 'Hirizan VII - Moon 3 - Ministry of War Bureau Offices', '30005248', 'NOTISLAND', '500003', 'Genesis', 10000067),
	(20000768, 'Charak', 'Anyed, Chiga, Habu', 'Anzalaisio', 'Asanot (0.5)', 'Asanot VI - Moon 17 - Quafe Company Factory', '30005251', 'NOTISLAND', '500003', 'Genesis', 10000067),
	(20000774, 'Fabas', 'Agal, Doza, Ebasez', 'Bania, Nasreri', 'Girani-Fa (0.6)', 'Aydoteaux V - Moon 1 - Duvolle Laboratories Factory', '30003055', 'NOTISLAND', '500003', 'Genesis', 10000067),
	(20000777, 'Kiartanne', 'Ansalle, Ellmay, Gisleres', 'Amygnon, Jufvitte', 'Scheenins (0.5)', 'Scheenins IV - Chemal Tech Factory', '30005310', 'NOTISLAND', '500004', 'Essence', 10000064),
	(20000779, 'Ancbeu', 'Annelle, Claulenne, Masalle', 'Sortet', 'Scolluzer (0.8)', 'Scolluzer VI - DED Logistic Support', '30005322', 'NOTISLAND', '500004', 'Essence', 10000064),
	(20000784, 'Aokinen', 'Onnamon,Tsuruma, Uuhulanen', 'Astoh, Rohamaa, Samanuhi', 'Uchomida (0.5)', 'Samanuni VI - Caldari Navy Anchorage', '30045322', 'NOTISLAND', '500001', 'The Citadel', 10000033),
	(30000154, 'Onirvura', '', '', '', '', '', 'NOTISLAND', '500001', 'Lonetrek', 10000016);

-- Dumping structure for table wit-db.reminders
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
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Dumping structure for table wit-db.rolehierarchy
CREATE TABLE IF NOT EXISTS `rolehierarchy` (
  `roleName` varchar(50) NOT NULL,
  `promote` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`promote`)),
  `demote` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`demote`)),
  PRIMARY KEY (`roleName`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Dumping data for table wit-db.rolehierarchy: ~8 rows (approximately)
REPLACE INTO `rolehierarchy` (`roleName`, `promote`, `demote`) VALUES
	('certified_trainer', '{"add":["1412546024819392733"],"remove":["1412545985388871730"]}', '{"add":[],"remove":["1412546024819392733"]}'),
	('fleet_commander', '{\r\n  "add": [\r\n    "1412545955106127983"\r\n  ],\r\n  "remove": [\r\n    "1412545912462512168"\r\n  ]\r\n}', '{\r\n  "add": [\r\n    "1412545912462512168"\r\n  ],\r\n  "remove": [\r\n    "1412545955106127983"\r\n  ]\r\n}'),
	('leadership', '{\r\n  "add": [\r\n    "1412546107975929917"\r\n  ],\r\n  "remove": []\r\n}', '{\r\n  "add": [],\r\n  "remove": [\r\n    "1412546107975929917"\r\n  ]\r\n}'),
	('line_commander', '{\r\n  "add": [\r\n    "1412545877163118704"\r\n  ],\r\n  "remove": [\r\n    "1412545820015857724"\r\n  ]\r\n}', '{\r\n  "add": [\r\n    1412545820015857700\r\n  ],\r\n  "remove": [\r\n    1412545877163118600\r\n  ]\r\n}'),
	('officer', '{\r\n  "add": [\r\n    "1412546080448712826"\r\n  ],\r\n  "remove": []\r\n}', '{\r\n  "add": [],\r\n  "remove": [\r\n    "1412546080448712826"\r\n  ]\r\n}'),
	('resident', '{\r\n  "add": [\r\n    "1412545597021622383",\r\n    "1412545820015857724"\r\n  ],\r\n  "remove": []\r\n}', '{\r\n  "add": [],\r\n  "remove": [\r\n    "1412545597021622383",\r\n    "1412545820015857724"\r\n  ]\r\n}'),
	('training_ct', '{\r\n  "add": [\r\n    "1412545985388871730"\r\n  ],\r\n  "remove": []\r\n}', '{\r\n  "add": [],\r\n  "remove": [\r\n    "1412545985388871730"\r\n  ]\r\n}'),
	('training_fc', '{\r\n  "add": [\r\n    "1412545912462512168"\r\n  ],\r\n  "remove": []\r\n}', '{\r\n  "add": [],\r\n  "remove": [\r\n    "1412545912462512168"\r\n  ]\r\n}');

-- Dumping structure for table wit-db.srp_history
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
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Dumping structure for table wit-db.users
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Dumping data for table wit-db.users: ~4 rows (approximately)
REPLACE INTO `users` (`character_id`, `discord_id`, `character_name`, `roles`, `access_token`, `refresh_token`, `token_expiry`, `is_main`, `is_mailing_char`) VALUES
	(93220962, '368778318415265792', 'Bella Cadelanne', '["410301376162299906","1055468376866168853","1412545597021622383","1412545877163118704","1412546107975929917","366076789438808064"]', 'eyJhbGciOiJSUzI1NiIsImtpZCI6IkpXVC1TaWduYXR1cmUtS2V5IiwidHlwIjoiSldUIn0.eyJzY3AiOlsiZXNpLW1haWwucmVhZF9tYWlsLnYxIiwiZXNpLW1haWwuc2VuZF9tYWlsLnYxIl0sImp0aSI6IjI3MTdmNTA4LTg0NzItNDNhNi05NzkwLWYzZWNiOTA3NjRiZiIsImtpZCI6IkpXVC1TaWduYXR1cmUtS2V5Iiwic3ViIjoiQ0hBUkFDVEVSOkVWRTo5MzIyMDk2MiIsImF6cCI6IjhkNTFlNmRjMDk0ZTQ5MWY5M2U4Y2RkMjEyNzQ0YTg1IiwidGVuYW50IjoidHJhbnF1aWxpdHkiLCJ0aWVyIjoibGl2ZSIsInJlZ2lvbiI6IndvcmxkIiwiYXVkIjpbIjhkNTFlNmRjMDk0ZTQ5MWY5M2U4Y2RkMjEyNzQ0YTg1IiwiRVZFIE9ubGluZSJdLCJuYW1lIjoiQmVsbGEgQ2FkZWxhbm5lIiwib3duZXIiOiJTWk5RWTNYWUJRSDVrMFM5R0dmeGZmNkJ3YkE9IiwiZXhwIjoxNzU4MDkzNTc1LCJpYXQiOjE3NTgwOTIzNzUsImlzcyI6Imh0dHBzOi8vbG9naW4uZXZlb25saW5lLmNvbSJ9.GNqOxRygXljDdF2FkOmwX9Xmbnd-Ennzo-UuU2tsEJgQG1On0yIIUChk3AIlTBNqcC_xjD0_4RKPiyVUSVS8lTN4Ua7my99umnvj85YuKa5N6b9sLq_wrJjf5jMIqJJ3zjjnTod8cdJmE8jV5vwPD2u8OhjlCgsRQXxm7pVQ0iZ6qrTTYLNc_cs2PBDluYUe0IZMuOZFg_e4AVRxih2lyHWIjniwxemIL7wQ_gWleRuirQcPmni1FTMsmYGLBqEhkbP96kCpcQGbksIka5PbRH-fZ85NCeUTikADKe5Y_zQWYz3TSTmYC065ElJNoTz3MTK0d0b66_6o5QNV0KIK7Q', 'dWTnyD8RCU+A9VPvFumayQ==', 1758093574902, 1, 1),
	(95000233, '107396590653698048', 'Mirror Saisima', NULL, NULL, NULL, NULL, 0, 0),
	(96566328, '107396590653698048', 'Ezabella', '["410301376162299906","1055468376866168853","1109274919134572624","1109275396727373876","1412545597021622383","1412545877163118704","1412546107975929917","366076789438808064"]', NULL, NULL, NULL, 1, 0),
	(163565361, '266657286355681280', 'Skeltek', '["1055468376866168853","1412545597021622383","1412545877163118704","1412546107975929917","366076789438808064"]', 'eyJhbGciOiJSUzI1NiIsImtpZCI6IkpXVC1TaWduYXR1cmUtS2V5IiwidHlwIjoiSldUIn0.eyJzY3AiOlsiZXNpLW1haWwuc2VuZF9tYWlsLnYxIiwiZXNpLW1haWwucmVhZF9tYWlsLnYxIl0sImp0aSI6IjM1ODY3NmQyLWQ4NzEtNDdiOS1iYjUzLWRiZWNiZDYzNGNhNiIsImtpZCI6IkpXVC1TaWduYXR1cmUtS2V5Iiwic3ViIjoiQ0hBUkFDVEVSOkVWRToxNjM1NjUzNjEiLCJhenAiOiI4ZDUxZTZkYzA5NGU0OTFmOTNlOGNkZDIxMjc0NGE4NSIsInRlbmFudCI6InRyYW5xdWlsaXR5IiwidGllciI6ImxpdmUiLCJyZWdpb24iOiJ3b3JsZCIsImF1ZCI6WyI4ZDUxZTZkYzA5NGU0OTFmOTNlOGNkZDIxMjc0NGE4NSIsIkVWRSBPbmxpbmUiXSwibmFtZSI6IlNrZWx0ZWsiLCJvd25lciI6IlNPN3F3dHpGOUY0eFE5c29kTEk1dVFjd0E3ST0iLCJleHAiOjE3NTgxNzA2ODEsImlhdCI6MTc1ODE2OTQ4MSwiaXNzIjoiaHR0cHM6Ly9sb2dpbi5ldmVvbmxpbmUuY29tIn0.W3DUD8CLjPaQNVXH-k1ddQ7lLRTjMVNWBX0Gtc33yGGUjKjkcjo5J203rzWhpXZsx49ySNoWI4NCL4ddeSmSrx2Bv-35uCpDhBSq65Z76O5YUrBGewDbM9Oxe3AXcPPNrN7sKxdvt7mu7eFyIgERwSF-RI4wRbeRKqxSIUmK3e93RwplPXiRl3dQf3xw2T3-MBb0j1byDXc07O6Y2Vppjh1ALVfIf10DJcjmg9NQrjoCAfaEGP77ABVbXK6IVR_NwFG0XDg-PQniQFszVu1pcA8cLsQpp4gVpQWg0e-X52PrWWnBKWsjS1l89raTJ10ZkHlZWIyZ_cDrThGukNYGWg', '4sVwNTj7ykOtLjBvPcTTtg==', 1758170679890, 1, 1);
