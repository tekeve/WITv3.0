-- --------------------------------------------------------
-- Host:                         127.0.0.1
-- Server version:               11.5.2-MariaDB - mariadb.org binary distribution
-- Server OS:                    Win64
-- HeidiSQL Version:             12.6.0.6765
-- --------------------------------------------------------

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET NAMES utf8 */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;


-- Dumping database structure for wtm-wit
DROP DATABASE IF EXISTS `wit-db`;
CREATE DATABASE IF NOT EXISTS `wit-db` /*!40100 DEFAULT CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci */;
USE `wit-db`;

-- Dumping structure for table wtm-wit.commander_list
DROP TABLE IF EXISTS `commander_list`;
CREATE TABLE IF NOT EXISTS `commander_list` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `discord_id` varchar(50) NOT NULL,
  `main_character` varchar(50) NOT NULL,
  `alt_characters` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`alt_characters`)),
  `roles` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`roles`)),
  `character_id` varchar(50) DEFAULT NULL,
  `character_name` varchar(50) DEFAULT NULL,
  `access_token` longtext DEFAULT NULL,
  `refresh_token` varchar(50) DEFAULT NULL,
  `token_expiry` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `discord_id` (`discord_id`),
  UNIQUE KEY `main_character` (`main_character`),
  UNIQUE KEY `character_id` (`character_id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

-- Dumping data for table wtm-wit.commander_list: ~2 rows (approximately)

-- Dumping structure for table wtm-wit.google_docs
DROP TABLE IF EXISTS `google_docs`;
CREATE TABLE IF NOT EXISTS `google_docs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `alias` varchar(50) NOT NULL,
  `doc_id` varchar(50) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

-- Dumping data for table wtm-wit.google_docs: ~1 rows (approximately)

-- Dumping structure for table wtm-wit.google_sheets
DROP TABLE IF EXISTS `google_sheets`;
CREATE TABLE IF NOT EXISTS `google_sheets` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `alias` varchar(50) NOT NULL,
  `sheet_id` varchar(50) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

-- Dumping data for table wtm-wit.google_sheets: ~2 rows (approximately)

-- Dumping structure for table wtm-wit.incursion_systems
DROP TABLE IF EXISTS `incursion_systems`;
CREATE TABLE IF NOT EXISTS `incursion_systems` (
  `Constellation_id` int(11) NOT NULL,
  `Constellation` varchar(255) DEFAULT NULL,
  `vanguard_systems` varchar(255) DEFAULT NULL,
  `assault_systems` varchar(255) DEFAULT NULL,
  `headquarters_system` varchar(50) DEFAULT NULL,
  `dockup` varchar(255) DEFAULT NULL,
  `dock_up_system_id` int(11) unsigned DEFAULT NULL,
  `is_island` varchar(50) DEFAULT NULL,
  `region_faction` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`Constellation_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

-- Dumping data for table wtm-wit.incursion_systems: ~105 rows (approximately)
DELETE FROM `incursion_systems`;
INSERT INTO `incursion_systems` (`Constellation_id`, `Constellation`, `vanguard_systems`, `assault_systems`, `headquarters_system`, `dockup`, `dock_up_system_id`, `is_island`, `region_faction`) VALUES
	(20000001, 'San Matar', 'Akpivem, Nirbhi, Tanoo, Yuzier', 'Jark, Sasta', 'Lashesih (0.8)', 'Lisudeh IV - Moon 4 - Theology Council Tribunal', 30000005, 'NOTISLAND', 'Ammatar Mandate'),
	(20000004, 'Kalangin', 'Eshtah, Kasrasi, Ordize, Rashy', 'Fovihi, Psasa', 'Kiereend (0.8)', 'Kiereend VII - Moon 3 - DED Assembly Plant', 30000024, 'NOTISLAND', 'Ammatar Mandate'),
	(20000008, 'Mossas', 'Ibaria, Maspah, Zemalu', 'Juddi', 'Khankenirdia (0.6)', 'Khankenirdia V - Moon 17 - Ammatar Consulate Academy', 30000056, 'NOTISLAND', 'Ammatar Mandate'),
	(20000009, 'Mekashtad', 'Iosantin, Janus, Orva, Salashayama, Thiarer, Zet', 'Amphar, Nikh, Usroh', 'Agha (0.7)', 'Agha IX - Moon 6 - Trust Partners Warehouse', 30000061, 'NOTISLAND', 'Ammatar Mandate'),
	(20000011, 'Orshed', 'Jofan, Odlib, Yadi', 'Tidacha', 'Milu (0.8)', 'Tidacha VIII - Moon 13 - Ammatar Consulate Bureau', 30000076, 'NOTISLAND', 'Ammatar Mandate'),
	(20000012, 'Oraron', 'Ejahi, Gelhan, Jarizza', 'Asghatil, Bar', 'Sucha (0.7)', 'Asghatil IX - Moon 3 - DED Assembly Plant', 30000084, 'NOTISLAND', 'Ammatar Mandate'),
	(20000017, 'Ruomo', 'Ahtulaima, Kylmabe, Vaankalen', 'Jatate, Mitsolen', 'Mahtista (0.7)', 'Mitsolen I - Moon 1 - Expert Housing Warehouse', 30000120, 'NOTISLAND', 'Caldari State'),
	(20000019, 'Ihilakken', 'Ansila, Aokannitoh, Hirtamon, Ikuchi', 'Hykkota, Ohmahailen, Outuni', 'Aokannitoh (1.0)', 'Aokannitoh VII - Moon 2 - School of Applied Knowledge', 30021407, 'NOTISLAND', 'Caldari State'),
	(20000021, 'Okomon', '', '', 'Abagawa (0.6)', 'Abagawa VIII - Moon 4 - Peace and Order Unit Logistic Support', 0, 'NOTISLAND', ''),
	(20000025, 'Otsabaira', 'Akkilen, Keikaken, Onuse', 'Soshin, Vattuolen', 'Silen (0.5)', 'Silen III - Moon 9 - Lai Dai Corporation Research Center', 30000179, 'NOTISLAND', 'Caldari State'),
	(20000200, 'Haurala', 'Erenta, Ouranienen, Uemisaisen', 'Sotrentaira', 'Raussinen (0.5)', 'Raussinen XI - Moon 2 - Genolution Biotech Research Center', 30001373, 'NOTISLAND', 'Caldari State'),
	(20000207, 'Kainokai', 'Autama, Kuoka, Tsukuras', 'Kirras', 'Nani (-1.0)', 'Nani IV - Moon 2 - Aliastra Warehouse', 30001413, 'NOTISLAND', 'Caldari State'),
	(20000208, 'Pietanen', 'Atai, Otalieto, Rauntaka', 'Liukikka', 'Aikantoh (0.6)', 'Aikantoh I - Moon 1 - Mercantile Club Academy', 0, 'ISLAND', 'Caldari State'),
	(20000209, 'Asalola', 'Ibura, Isinokka, Yoma', 'Oipo', 'Haajinen (0.8)', 'Haajinen XI - Moon 9 - Lai Dai Corporation Warehouse', 30001424, 'NOTISLAND', 'Caldari State'),
	(20000243, 'Sanair', 'Adahum, Goram, Tendhyes', 'Tividu', 'Anjedin (0.5)', 'Tividu III - Kaalakiota Corporation Factory', 30001644, 'NOTISLAND', 'Amarr Empire'),
	(20000244, 'Somi', 'Imeshasa, Jarzalad, Pimsu', 'Nafomeh', 'Riramia (0.6)', 'Riramia VI - Moon 12 - TransStellar Shipping Storage', 30001650, 'NOTISLAND', 'Amarr Empire'),
	(20000248, 'Mimishia', 'Atoosh, Hoona, Mimen', 'Thashkarai', 'Sacalan (0.6)', 'Thashkarai VII - Moon 1 - Emperor Family Bureau', 30001677, 'NOTISLAND', 'Amarr Empire'),
	(20000250, 'Damadil', 'Hostni, Kibursha, Mimime', 'Asesamy, Onazel', 'Lossa (0.8)', 'Lossa II - Ministry of Assessment Information Center', 30001687, 'NOTISLAND', 'Amarr Empire'),
	(20000251, 'Rifenda', 'Gaknem, Nehkiah, Siyi', 'Iro', 'Abai (0.7)', 'Abai IV - Moon 11 - Joint Harvesting Mineral Reserve', 30001694, 'NOTISLAND', 'Amarr Empire'),
	(20000252, 'Nasorin', 'Arkoz, Jinizu, Taru, Yanuel', 'Nafrivik, Remoriu', 'Phoren (0.6)', 'Nafrivik VIII - Moon 6 - Ministry of War Bureau Offices', 30001702, 'NOTISLAND', 'Amarr Empire'),
	(20000253, 'Tsemshatel', 'Azerakish, Ghishul, Lari, Moutid', 'Asezai, Yeder', 'Ferira (0.6)', 'Ferira VI - Moon 14 - Imperial Shipment Storage', 30001709, 'NOTISLAND', 'Amarr Empire'),
	(20000255, 'Ajah', 'Assiad, Iswa, Rand, Rumida', 'Kerepa, Marthia, Nosodnis', 'Safilbab (1.0)', 'Safilbab VIII - Moon 4 - Royal Amarr Institute School', 30031672, 'NOTISLAND', 'Amarr Empire'),
	(20000256, 'Subhatoub', 'Tew, Zehru, Zith', 'Alra, Ilas', 'Sinid (0.7)', 'Sinid VI - Moon 12 - Expert Distribution Warehouse', 30001729, 'NOTISLAND', 'Minmatar Republic'),
	(20000257, 'Peges', 'Hath, Judra, Sharios, Uhodoh', 'Esa, Kari', 'Arakor (0.7)', 'Judra VII - Moon 7 - Amarr Certified News Publisher', 30001738, 'NOTISLAND', 'Amarr Empire'),
	(20000305, 'Ani', '', '', '', '', 0, 'NOTISLAND', 'Minmatar Republic'),
	(20000323, 'Mobit', 'Bashakru, Shuria, Sukirah', 'Mikhir, Ziona', 'Akhragan (0.8)', 'Akhragan V - Moon 1 - Amarr Civil Service Bureau Offices', 30002197, 'NOTISLAND', 'Amarr Empire'),
	(20000324, 'Yestadan', 'Armala, Murema, Uchat', 'Ilonarav', 'Gaha (0.7)', 'Gaha VII - Moon 2 - Republic Security Services Logistic Support', 30002204, 'NOTISLAND', 'Amarr Empire'),
	(20000325, 'Mazake', 'Hiramu, Hutian, Mazitah, Pelkia', 'Joppaya, Raren', 'Noli (0.6)', 'Bika II - Theology Council Law School', 30002252, 'NOTISLAND', 'Amarr Empire'),
	(20000326, 'Kekah', 'Aghesi, Charra, Patzcha', 'Airshaz', 'Fabin (0.7)', 'Aghesi VI - Moon 10 - Ministry of Assessment Bureau Offices', 30002220, 'NOTISLAND', 'Amarr Empire'),
	(20000327, 'Sosarir', 'Ardishapur Prime, Gid, Nererut, Nifshed, Vashkah', 'Rasile, Sitanan, Thebeka', 'Dakba (0.7)', 'Dakba I - Ardishapur Family Academy', 30002233, 'NOTISLAND', 'Amarr Empire'),
	(20000329, 'Mulata', 'Ahala, Arera, Knophtikoo', 'Hai, Seiradih', 'Mamenkhanar (0.7)', 'Mamenkhanar IX - Moon 11 - DED Logistic Support', 30002242, 'NOTISLAND', 'Amarr Empire'),
	(20000331, 'Kehina', 'Esteban, Luromooh, Sahdil', 'Nadohman', 'Moussou (0.8)', 'Nadohman IV - Moon 3 - Imperial Shipment Storage', 30002258, 'NOTISLAND', 'Amarr Empire'),
	(20000332, 'Avib', 'Azizora, Hadonoo, Shabura', 'Jarshitsan', 'Ahmak (0.6)', 'Ahmak VII - Imperial Chancellor Archives', 30002266, 'NOTISLAND', 'Amarr Empire'),
	(20000334, 'Norgoh', 'Bhizheba, Eba, Safizon, Zatsyaki', 'Artoun, Ebtesham', 'Isamm (0.7)', 'Isamm IX - Moon 15 - Imperial Chancellor Bureau Offices', 30002276, 'NOTISLAND', 'Amarr Empire'),
	(20000369, 'Osta', 'Austraka, Dumkirinur, Sist', 'Edmalbrurdus, Kronsur', 'Todeko (1.0)', 'Todeko VII - Republic University', 30032505, 'NOTISLAND', 'Minmatar Republic'),
	(20000370, 'Odengsolf', 'Avesber, Frarn, Gyng, Illinfrik', 'Ivar, Meirakulf', 'Usteli (1.0)', 'Usteli V - Republic University', 30042505, 'NOTISLAND', 'Minmatar Republic'),
	(20000376, 'Urtfer', 'Appen, Javrendei, Klir', 'Trer', 'Egmur (0.7)', 'Egmur VII - Moon 15 - Republic Parliament Academy', 30002563, 'NOTISLAND', 'Minmatar Republic'),
	(20000377, 'Erada', 'Krilmokenur, Magiko, Onga, Vullat', 'Larkugei, Oremmulf, Osaumuni', 'Hurjafren (0.9)', 'Hurjafren VI - Moon 17 - Republic Parliament Bureau', 30002572, 'NOTISLAND', 'Minmatar Republic'),
	(20000386, 'Disier', 'Balle, Du Annes, Metserel, Erme', 'Grinacanne, Pettinck', 'Adreland (0.9)', 'Adreland VI - Moon 8 - Astral Mining Inc. Refinery', 30002639, 'NOTISLAND', 'Caldari State'),
	(20000391, 'Jonenor', 'Ansone, Dunraelare, Nausschie, Trosquesere', 'Estene, Stayme', 'Inghenges (0.7)', 'Inghenges V - Moon 2 - Ishukone Corporation Factory', 30002672, 'NOTISLAND', 'Gallente Federation'),
	(20000392, 'Algintal', 'Audaerne, Augnais, Fluekele, Jolia', 'Alsottobier, Deltole, Parchanier', 'Colelie (0.5)', 'Bei VII - Moon 3 - Freedom Extension Retail Center', 30002048, 'NOTISLAND', 'Gallente Federation'),
	(20000395, 'Wyllequet', 'Atier, Bawilan, Brapelille', 'Adrallezoen', 'Brybier (0.6)', 'Brybier I - Moon 20 - Freedom Extension Warehouse', 30002703, 'NOTISLAND', 'Gallente Federation'),
	(20000396, 'Agiesseson', 'Adiere, Oirtlair, Olelon, Stetille', 'Auberulle, Doussivitte', 'Unel (0.9)', 'Unel IX - Chemal Tech Factory', 30002707, 'NOTISLAND', 'Gallente Federation'),
	(20000402, 'Nagaslaiken', 'Jeras, Kakki, Oijamon', 'Auviken', 'Ohvosamon (0.7)', 'Ohvosamon VII - Spacelane Patrol Logistic Support', 30002743, 'NOTISLAND', 'Caldari State'),
	(20000403, 'Arekin', 'Alikara, Kausaaja, Oiniken', 'Aikoro', 'Ahynada (0.8)', 'Ahynada VII - Mercantile Club Bureau', 30002752, 'NOTISLAND', 'Caldari State'),
	(20000405, 'Caldari Border Zone', 'Hatakani, Iivinen, Tennen', 'Yashunen', 'Kassigainen (0.9)', 'Yashunen III - Genolution Biotech Production', 30002762, 'NOTISLAND', 'Caldari State'),
	(20000407, 'Outartoh', 'Annaro, Isutaka, Tasabeshi', 'Muvolailen', 'Paara (0.8)', 'Paara I - Spacelane Patrol Logistic Support', 30002775, 'NOTISLAND', 'Caldari State'),
	(20000409, 'Suon', 'Inaro, Irjunen, Waskisen', 'Sirppala', 'Kaaputenen (0.8)', 'Kaaputenen III - Moon 1 - CBD Sell Division Warehouse', 30002789, 'NOTISLAND', 'Caldari State'),
	(20000413, 'Santenpaa', 'Aramachi, Komo, Laah, Oichiya', 'Saila, Isenairos', 'Uotila (0.6)', 'Uotila V - Moon 14 - Chief Executive Panel Bureau', 30002814, 'NOTISLAND', 'Caldari State'),
	(20000434, 'Ryra', 'Choonka, Dihra, Dital', 'Esescama', 'Odin (0.6)', 'Ohide VI - Moon 2 - Kaalakiota Corporation Warehouse', 30002964, 'NOTISLAND', 'Amarr Empire'),
	(20000435, 'Kisana', 'Gheth, Lisudeh, Mehatoor', 'Sasoutikh', 'Ohide (0.6)', 'Ohide VI - Moon 2 - Kaalakiota Corporation Warehouse', 30002970, 'NOTISLAND', 'Amarr Empire'),
	(20000438, 'Daredan', 'Hati, Riavayed, Uadelah', 'Hakshma, Laddiaha', 'Nakatre (0.6)', 'Nakatre II - Emperor Family Bureau', 30002988, 'NOTISLAND', 'Amarr Empire'),
	(20000440, 'Enka', 'Arveyil, Nidebora, Uktiad, Ulerah', 'Faktun, Halenan', 'Mili (0.6)', 'Mili VIII - Moon 12 - Amarr Civil Service Bureau Offices', 0, 'ISLAND', 'Amarr Empire'),
	(20000441, 'Osnins', 'Amattens, Bereye, Junsoraert, Jurlesel', 'Arnatele, Halle', 'Mormoen (0.7)', 'Mormoen II - Caldari Business Tribunal Accounting', 30003011, 'NOTISLAND', 'Gallente Federation'),
	(20000443, 'Ysiette', 'Jaschercis, Marosier, Vaurent', 'Ardallabier, Lirsautton', 'Blameston (1.0)', 'Blameston IV - Moon 12 - Quafe Company Retail Center', 30003026, 'NOTISLAND', 'Gallente Federation'),
	(20000444, 'Odilis', 'Frarolle, Gicodel, Mattere', 'Ethernity, Meves', 'Athinard (1.0)', 'Athinard IV - Sisters of EVE Bureau', 30003031, 'NOTISLAND', 'Gallente Federation'),
	(20000446, 'Elalan', 'Averon, Carirgnottin, Muer, Odixie, Scuelazyns, Tolle', 'Angymonne, Antollare, Enedore, Laic', 'Avele (0.7)', 'Avele VI - Moon 15 - Caldari Business Tribunal', 30003053, 'NOTISLAND', 'Gallente Federation'),
	(20000450, 'Ichida', 'Hakoden, Hatori, Ronne', 'Jarkkolen', 'Junsen (0.8)', 'Junsen V - Moon 20 - CBD Corporation Storage', 30003083, 'NOTISLAND', 'Amarr Empire'),
	(20000492, 'Gedur', 'Alf, Arlulf, Brundakur, Illuin', 'Aldilur, Orgron, Nedegulf', 'Stirht (0.9)', 'Stirht VII - Moon 14 - CONCORD Bureau', 30003376, 'NOTISLAND', 'Minmatar Republic'),
	(20000493, 'Lorundio', 'Evuldgenzo, Flost, Ongund', 'Eust', 'Todrir (1.0)', 'Eust I - Impetus Development Studio', 30003381, 'NOTISLAND', 'Minmatar Republic'),
	(20000494, 'Ankard', 'Altrinur, Eygfe, Reset', 'Fildar, Olbra', 'Jondik (0.9)', 'Jondik VI - Joint Harvesting Mineral Reserve', 30003387, 'NOTISLAND', 'Minmatar Republic'),
	(20000495, 'Jonar', 'Bongveber, Freatlidur, Maturat', 'Roleinn, Vorsk', 'Eiluvodi (0.8)', 'Eiluvodi VI - Moon 14 - CBD Corporation Storage', 30003393, 'NOTISLAND', 'Minmatar Republic'),
	(20000496, 'Stadakorn', 'Agtver, Datulen, Erego, Meinmungen, Totkubad', 'Evettullur, Hjortur, Tamekamur', 'Egbonbet (0.9)', 'Egbonbet VI - Moon 11 - Republic Parliament Bureau', 30003401, 'NOTISLAND', 'Amarr Empire'),
	(20000498, 'Aptetter', 'Aldrat, Erstur, Urnhard', 'Fredagod', 'Hardbako (0.7)', 'Hardbako III - Moon 1 - Minmatar Mining Corporation Refinery', 30003418, 'NOTISLAND', 'Minmatar Republic'),
	(20000500, 'Brazinget', 'Gedugaud, Oppold, Tratokard', 'Geffur', 'Hilfhurmur (0.8)', 'Hilfhurmur VIII - Moon 6 - CONCORD Logistic Support', 30003428, 'NOTISLAND', 'Minmatar Republic'),
	(20000501, 'Frar', 'Earled, Ogoten, Tollus', 'Hebisa, Polstodur', 'Ansher (0.9)', 'Polstodur VIII - Moon 6 - Republic Justice Department Tribunal', 30003434, 'NOTISLAND', 'Minmatar Republic'),
	(20000503, 'Panorad', 'Hakeri, Irgrus, Nifflung', 'Josekorn', 'Dantbeinn (0.7)', 'Dantbeinn III - Moon 5 - Republic Justice Department Law School', 30003451, 'NOTISLAND', 'Minmatar Republic'),
	(20000504, 'Argeir', 'Atonder, Hotrardik, Ridoner', 'Engosi', 'Orduin (0.8)', 'Orduin V - Moon 7 - Republic Parliament Bureau', 30003453, 'NOTISLAND', 'Minmatar Republic'),
	(20000510, 'Zemont', 'Ekid, Raravoss, Sharhelund', 'Youl', 'Nakri (0.8)', 'Nakri VI - Moon 1 - Amarr Navy Logistic Support', 30003496, 'NOTISLAND', 'Amarr Empire'),
	(20000511, 'Yekti', 'Bahromab, Kudi, Madirmilire', 'Fabum', 'Sharji (0.8)', 'Sayartchen V - Moon 2 - Sarum Family Logistic Support', 30003508, 'NOTISLAND', 'Amarr Empire'),
	(20000512, 'Hoosa', 'Abaim, Somouh, Sorzielang', 'Sayartchen, Teshi', 'Gosalav (0.7)', 'Gosalav VI - Sarum Family Logistic Support', 30003509, 'NOTISLAND', 'Amarr Empire'),
	(20000513, 'Chardu', 'Etav, Pedel, Saheri', 'Anila, Yeeramoun', 'Ides (0.8)', 'Etav VIII - Moon 14 - Amarr Civil Service Bureau Offices', 30003517, 'NOTISLAND', 'Amarr Empire'),
	(20000514, 'Maddam', 'Hama, Hanan, Irnal, Sarum Prime', 'Alkabsi, Bagodan, Mahrokht', 'Murzi (0.6)', 'Aghesi VI - Moon 10 - Ministry of Assessment Bureau Offices', 30002220, 'NOTISLAND', 'Amarr Empire'),
	(20000517, 'Maseend', 'Hamse, Jaswelu, Lashkai, Zhilshinou', 'Maiah, Yuhelia', 'Barira (0.8)', 'Yuhelia V - Moon 1 - Imperial Armaments Factory', 30003545, 'NOTISLAND', 'Amarr Empire'),
	(20000522, 'Orvanne', 'Niballe, Odinesyn, Postouvin', 'Larryn', 'Weraroix (0.6)', 'Larryn II - FedMart Warehouse', 0, 'ISLAND', 'Gallente Federation'),
	(20000523, 'Goins', 'Arasare, Lazer, Yvelet', 'Vecodie', 'Yvaeroure (0.8)', 'Yvaeroure VI - Moon 1 - Fedmart Retail Center', 0, 'ISLAND', 'Gallente Federation'),
	(20000557, 'Unour', 'Iffrue, Mollin, Ommaerrer', 'Ivorider', 'Osmallanais (0.8)', 'Osmallanais VII - Moon 9 - Material Acquisition Refinery', 0, 'ISLAND', 'Gallente Federation'),
	(20000564, 'Nohshayess', 'Ipref, Jachanu, Khanid Prime, Kihtaled', 'Agil, Gousoviba, Neyi', 'Bukah (0.8)', 'Agil VI - Moon 2 - CONCORD Logistic Support', 30003862, 'NOTISLAND', 'Khanid Kingdom'),
	(20000565, 'Finaka', 'Hishai, Osis, Sehsasez, Yezara', 'Ervekam, Kahah, Mashtarmem', 'Saloti (0.7)', 'Kahah I - Khanid Transport Storage', 30003873, 'NOTISLAND', 'Khanid Kingdom'),
	(20000566, 'Amdimmah', 'Palas, Reteka, Safshela', 'Gidali', 'Molea (0.7)', 'Nakregde I - Amarr Civil Service Bureau Offices', 30005043, 'NOTISLAND', 'Khanid Kingdom'),
	(20000568, 'Sib', 'Ainsan, Badivefi, Talidal', 'Ashi, Tzashrah', 'Sabusi (0.5)', 'Badivefi VIII - Moon 10 - Royal Khanid Navy Logistic Support', 30003888, 'NOTISLAND', 'Khanid Kingdom'),
	(20000570, 'Fekhoya', 'Afnakat, Bashyam, Parses', 'Firbha', 'Col (0.5)', 'Parses VI - Moon 11 - Royal Khanid Navy Assembly Plant', 30003909, 'NOTISLAND', 'Khanid Kingdom'),
	(20000596, 'Megeh', 'Aharalel, Gensela, Zorozih', 'Aphend, Romi', 'Hiroudeh (0.5)', 'Hiroudeh VIII - Moon 2 - Civic Court Tribunal', 30004077, 'NOTISLAND', 'Amarr Empire'),
	(20000597, 'Kakol', 'Aband, Ghesis, Gonan', 'Gamdis, Joamma', 'Joramok (0.8)', 'Joramok IV - Moon 4 - Ministry of War Archives', 30004088, 'NOTISLAND', 'Amarr Empire'),
	(20000598, 'Febihkin', 'Kador Prime, Khafis, Nordar', 'Askonak, Murini', 'Uanim (0.6)', 'Uanim VI - Moon 12 - Noble Appliances Factory', 30004091, 'NOTISLAND', 'Amarr Empire'),
	(20000599, 'Trigentia', 'Inis-Ilix, Sonama, Suner', 'Halibai, Turba', 'Kothe (0.6)', 'Kothe VI - Moon 15 - Theology Council Accounting', 30004103, 'NOTISLAND', 'Amarr Empire'),
	(20000601, 'Parrosa', 'Mandoo, Miah, Peyiri', 'Yarebap', 'Finid (0.5)', 'Finid X - Moon 1 - Amarr Navy Assembly Plant', 30004110, 'NOTISLAND', 'Amarr Empire'),
	(20000603, 'Araz', 'Jakri, Munory, Nidupad, Zimse', 'Aphi, Garisas', 'Chanoun (0.5)', 'Chanoun IX - The Scope Development Studio', 30004122, 'NOTISLAND', 'Amarr Empire'),
	(20000604, 'Ahrnot', 'Hilmar, Jeshideh, Shura', 'Yooh', 'Hostakoh (0.6)', 'Hostakoh VI - Moon 2 - Theology Council Tribunal', 30004130, 'NOTISLAND', 'Amarr Empire'),
	(20000606, 'Naloran', 'Hapala, Salah, Yebouz', 'Syrikos', 'Hikansog (0.8)', 'Hikansog VII - Moon 9 - Royal Amarr Institute School', 30004142, 'NOTISLAND', 'Amarr Empire'),
	(20000607, 'Moghiz', 'Kooreng, Shaggoth, Ustnia', 'Elmed, Minin', 'Jennim (0.8)', 'Safizon II - Moon 1 - Amarr Navy Assembly Plant', 30002279, 'NOTISLAND', 'Amarr Empire'),
	(20000608, 'Qermi', 'Asrios, Ithar, Shemah', 'Zorrabed', 'Telang (0.8)', 'Asrios III - Kaalakiota Corporation Factory', 30004156, 'NOTISLAND', 'Amarr Empire'),
	(20000622, 'Mayonhen', 'Avada, Haimeh, Pahineh', 'Bazadod', 'Chibi (0.5)', 'Chibi VI - Moon 15 - CONCORD Treasury', 0, 'ISLAND', 'Amarr Empire'),
	(20000735, 'Eustron', 'Cat, Ommare, Vale', 'Atlangeins, Derririntel', 'Hecarrin (0.8)', 'Hecarrin VI - Moon 3 - Federal Navy Academy', 30024971, 'NOTISLAND', 'Gallente Federation'),
	(20000738, 'Nimedaz', 'Danyana, Jinkah, Nibainkier, Polfaly', 'Annad, Nahyeen', 'Andrub (0.7)', 'Andrub VI - Ministry of War Bureau Offices', 30005049, 'NOTISLAND', 'Amarr Empire'),
	(20000739, 'Panoumid', 'Imih, Soumi, Zinkon', 'Choga', 'Kulu (0.6)', 'Kulu X - Moon 3 - Caldari Business Tribunal Bureau Offices', 30005050, 'NOTISLAND', 'Amarr Empire'),
	(20000761, 'Sanctum', '', '', 'Tarta (0.5)', 'Tarta IX - Moon 14 - DED Assembly Plant', 30005205, 'NOTISLAND', 'Gallente Federation'),
	(20000763, 'Ekrin', '', '', '', '', 0, 'NOTISLAND', 'Amarr Empire'),
	(20000767, 'Reya', 'Gergish, Kobam, Tahli', 'Madomi', 'Hirizan (0.5)', 'Hirizan VII - Moon 3 - Ministry of War Bureau Offices', 30005248, 'NOTISLAND', 'Amarr Empire'),
	(20000768, 'Charak', 'Anyed, Chiga, Habu', 'Anzalaisio', 'Asanot (0.5)', 'Asanot VI - Moon 17 - Quafe Company Factory', 30005251, 'NOTISLAND', 'Amarr Empire'),
	(20000774, 'Fabas', 'Agal, Doza, Ebasez', 'Bania, Nasreri', 'Girani-Fa (0.6)', 'Aydoteaux V - Moon 1 - Duvolle Laboratories Factory', 30003055, 'NOTISLAND', 'Amarr Empire'),
	(20000777, 'Kiartanne', 'Ansalle, Ellmay, Gisleres', 'Amygnon, Jufvitte', 'Scheenins (0.5)', 'Scheenins IV - Chemal Tech Factory', 30005310, 'NOTISLAND', 'Gallente Federation'),
	(20000779, 'Ancbeu', 'Annelle, Claulenne, Masalle', 'Sortet', 'Scolluzer (0.8)', 'Scolluzer VI - DED Logistic Support', 30005322, 'NOTISLAND', 'Gallente Federation'),
	(20000784, 'Aokinen', 'Onnamon,Tsuruma, Uuhulanen', 'Astoh, Rohamaa, Samanuhi', 'Uchomida (0.5)', 'Samanuni VI - Caldari Navy Anchorage', 30045322, 'NOTISLAND', 'Caldari State'),
	(30000154, 'Onirvura', '', '', '', '', 0, 'NOTISLAND', '');

-- Dumping structure for table wtm-wit.mailing_lists
DROP TABLE IF EXISTS `mailing_lists`;
CREATE TABLE IF NOT EXISTS `mailing_lists` (
  `list_id` int(11) NOT NULL,
  `list_name` varchar(50) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

-- Dumping data for table wtm-wit.mailing_lists: ~1 rows (approximately)

-- Dumping structure for table wtm-wit.settings
DROP TABLE IF EXISTS `settings`;
CREATE TABLE IF NOT EXISTS `settings` (
  `guild_id` bigint(200) NOT NULL,
  `auth_roles` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`auth_roles`)),
  `admin_roles` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`admin_roles`)),
  `incursion_roles` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`incursion_roles`)),
  PRIMARY KEY (`guild_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

-- Dumping data for table wtm-wit.settings: ~1 rows (approximately)

/*!40103 SET TIME_ZONE=IFNULL(@OLD_TIME_ZONE, 'system') */;
/*!40101 SET SQL_MODE=IFNULL(@OLD_SQL_MODE, '') */;
/*!40014 SET FOREIGN_KEY_CHECKS=IFNULL(@OLD_FOREIGN_KEY_CHECKS, 1) */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40111 SET SQL_NOTES=IFNULL(@OLD_SQL_NOTES, 1) */;
