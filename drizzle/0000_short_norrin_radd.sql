CREATE TABLE `study_progress` (
	`user_id` text NOT NULL,
	`item_id` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `item_id`)
);
