CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`ownerId` text NOT NULL,
	`publicToken` text NOT NULL,
	`paymentReference` text NOT NULL,
	`customerName` text NOT NULL,
	`customerEmail` text NOT NULL,
	`description` text NOT NULL,
	`amountStroops` integer NOT NULL,
	`dueDate` text NOT NULL,
	`destinationAccount` text NOT NULL,
	`network` text DEFAULT 'TESTNET' NOT NULL,
	`asset` text DEFAULT 'XLM' NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`createdAt` integer NOT NULL,
	`paidAt` integer,
	FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "invoices_amount_check" CHECK(typeof("invoices"."amountStroops") = 'integer' AND "invoices"."amountStroops" > 0 AND "invoices"."amountStroops" <= 9007199254740991),
	CONSTRAINT "invoices_network_check" CHECK("invoices"."network" = 'TESTNET'),
	CONSTRAINT "invoices_asset_check" CHECK("invoices"."asset" = 'XLM'),
	CONSTRAINT "invoices_status_check" CHECK("invoices"."status" IN ('OPEN', 'PAID')),
	CONSTRAINT "invoices_paid_at_check" CHECK(("invoices"."status" = 'OPEN' AND "invoices"."paidAt" IS NULL) OR ("invoices"."status" = 'PAID' AND "invoices"."paidAt" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_publicToken_unique` ON `invoices` (`publicToken`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_paymentReference_unique` ON `invoices` (`paymentReference`);--> statement-breakpoint
CREATE INDEX `invoices_owner_created_idx` ON `invoices` (`ownerId`,`createdAt`);--> statement-breakpoint
ALTER TABLE `users` ADD `receivingAccount` text;