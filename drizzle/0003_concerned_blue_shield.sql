CREATE TABLE `opening_hours` (
	`day_of_week` integer PRIMARY KEY NOT NULL,
	`open_time` text,
	`close_time` text,
	`closed` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `bookings` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `deleted_by_email` text;--> statement-breakpoint
ALTER TABLE `service_settings` ADD `category` text DEFAULT 'Styling' NOT NULL;--> statement-breakpoint
ALTER TABLE `service_settings` ADD `description` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `service_settings` ADD `image` text;--> statement-breakpoint
ALTER TABLE `service_settings` ADD `sort_order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `service_settings` ADD `created_at` text;--> statement-breakpoint
INSERT OR IGNORE INTO `service_settings` (`id`,`name`,`duration_minutes`,`buffer_minutes`,`price_label`,`category`,`description`,`image`,`sort_order`,`active`,`created_at`,`updated_at`) VALUES
('ugradnja-ekstenzija','Ugradnja ekstenzija',180,0,'Cijena na upit','Ekstenzije','Individualan odabir metode, nijanse i količine za prirodan volumen i dužinu.','/images/extensions-application.jpeg',10,1,'2026-08-25T00:00:00.000Z','2026-08-25T00:00:00.000Z'),
('balayage-color','Balayage color',180,0,'Cijena na upit','Boja','Mekani, prirodni prijelazi i personalizirana dimenzija boje.','/images/balayage-result.jpg',20,1,'2026-08-25T00:00:00.000Z','2026-08-25T00:00:00.000Z'),
('bojanje-kose','Bojanje kose',90,30,'Cijena na upit','Boja','Profesionalno bojanje s fokusom na ton, sjaj i zdrav izgled kose.','/images/hair-treatment.jpg',30,1,'2026-08-25T00:00:00.000Z','2026-08-25T00:00:00.000Z'),
('korekcija-ekstenzija','Hair Extensions korekcija',180,60,'Cijena na upit','Ekstenzije','Precizna korekcija i ponovno postavljanje za uredan, siguran rezultat.','/images/micro-bond-detail.jpeg',40,1,'2026-08-25T00:00:00.000Z','2026-08-25T00:00:00.000Z'),
('najam-kose','Najam kose',15,0,'Cijena na upit','Ekstenzije','Savjetovanje i odabir kose za volumen, dužinu ili posebnu prigodu.','/images/hair-colour-range.jpg',50,1,'2026-08-25T00:00:00.000Z','2026-08-25T00:00:00.000Z'),
('wedding-hair','Wedding hair',60,30,'Cijena na upit','Styling','Profinjen bridal styling usklađen s licem, haljinom i atmosferom vjenčanja.','/images/bridal-looks.webp',60,1,'2026-08-25T00:00:00.000Z','2026-08-25T00:00:00.000Z'),
('konzultacija','Konzultacija',15,0,'Bez naknade','Njega','Kratak stručni razgovor i personalizirani plan prije veće promjene.','/images/salon-story-premium.webp',70,1,'2026-08-25T00:00:00.000Z','2026-08-25T00:00:00.000Z'),
('pramenovi-iz-korijena','Pramenovi iz korijena',180,0,'Cijena na upit','Boja','Precizno osvježenje izrasta uz skladan prijelaz u postojeću boju.','/images/hair-treatment.jpg',80,1,'2026-08-25T00:00:00.000Z','2026-08-25T00:00:00.000Z'),
('povrsinski-pramenovi','Površinski pramenovi',120,0,'Cijena na upit','Boja','Diskretna svjetlina i dimenzija na vidljivim dijelovima kose.','/images/hair-colour-range.jpg',90,1,'2026-08-25T00:00:00.000Z','2026-08-25T00:00:00.000Z'),
('skidanje-ekstenzija','Skidanje ekstenzija',60,0,'Cijena na upit','Ekstenzije','Pažljivo i stručno uklanjanje uz očuvanje prirodne kose.',NULL,100,1,'2026-08-25T00:00:00.000Z','2026-08-25T00:00:00.000Z'),
('marinela-ritual','The Marinela Ritual',60,0,'Personalizirana cijena','Njega','Potpisni tretman njege oblikovan prema trenutačnim potrebama vaše kose.',NULL,110,1,'2026-08-25T00:00:00.000Z','2026-08-25T00:00:00.000Z');--> statement-breakpoint
INSERT OR IGNORE INTO `employee_services` (`employee_id`,`service_id`,`active`) VALUES
('marinela','ugradnja-ekstenzija',1),('mia','ugradnja-ekstenzija',1),
('marinela','balayage-color',1),('mia','balayage-color',1),
('marinela','bojanje-kose',1),('mia','bojanje-kose',1),
('marinela','korekcija-ekstenzija',1),('mia','korekcija-ekstenzija',1),
('marinela','najam-kose',1),('mia','najam-kose',1),
('marinela','wedding-hair',1),('mia','wedding-hair',1),
('marinela','konzultacija',1),('mia','konzultacija',1),
('marinela','pramenovi-iz-korijena',1),('mia','pramenovi-iz-korijena',1),
('marinela','povrsinski-pramenovi',1),('mia','povrsinski-pramenovi',1),
('marinela','skidanje-ekstenzija',1),('mia','skidanje-ekstenzija',1),
('marinela','marinela-ritual',1),('mia','marinela-ritual',1);--> statement-breakpoint
INSERT OR IGNORE INTO `opening_hours` (`day_of_week`,`open_time`,`close_time`,`closed`,`updated_at`) VALUES
(1,'14:00','21:00',0,'2026-08-25T00:00:00.000Z'),
(2,'07:00','14:00',0,'2026-08-25T00:00:00.000Z'),
(3,'07:00','14:00',0,'2026-08-25T00:00:00.000Z'),
(4,'07:00','14:00',0,'2026-08-25T00:00:00.000Z'),
(5,'07:00','14:00',0,'2026-08-25T00:00:00.000Z'),
(6,NULL,NULL,1,'2026-08-25T00:00:00.000Z'),
(0,NULL,NULL,1,'2026-08-25T00:00:00.000Z');
