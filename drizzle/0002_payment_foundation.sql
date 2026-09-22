CREATE TABLE `payment_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`invoiceId` text NOT NULL,
	`sourceAccount` text NOT NULL,
	`transactionHash` text NOT NULL,
	`unsignedXdr` text NOT NULL,
	`signedXdr` text,
	`status` text DEFAULT 'PREPARED' NOT NULL,
	`expiresAt` integer NOT NULL,
	`submittedAt` integer,
	`lastCheckedAt` integer,
	`errorCode` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`invoiceId`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "payment_attempts_status_check" CHECK("payment_attempts"."status" IN ('PREPARED', 'SUBMITTED', 'UNKNOWN', 'FAILED', 'EXPIRED', 'VERIFIED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_attempts_transactionHash_unique` ON `payment_attempts` (`transactionHash`);--> statement-breakpoint
CREATE INDEX `payment_attempts_invoice_idx` ON `payment_attempts` (`invoiceId`);--> statement-breakpoint
CREATE UNIQUE INDEX `payment_attempts_one_active` ON `payment_attempts` (`invoiceId`) WHERE "payment_attempts"."status" IN ('PREPARED', 'SUBMITTED', 'UNKNOWN');--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`invoiceId` text NOT NULL,
	`attemptId` text NOT NULL,
	`transactionHash` text NOT NULL,
	`network` text NOT NULL,
	`sourceAccount` text NOT NULL,
	`destinationAccount` text NOT NULL,
	`amountStroops` integer NOT NULL,
	`asset` text NOT NULL,
	`paymentReference` text NOT NULL,
	`ledger` integer NOT NULL,
	`ledgerClosedAt` integer NOT NULL,
	`verifiedAt` integer NOT NULL,
	FOREIGN KEY (`invoiceId`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`attemptId`) REFERENCES `payment_attempts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "payments_network_asset_check" CHECK("payments"."network" = 'TESTNET' AND "payments"."asset" = 'XLM'),
	CONSTRAINT "payments_amount_check" CHECK(typeof("payments"."amountStroops") = 'integer' AND "payments"."amountStroops" > 0 AND "payments"."amountStroops" <= 9007199254740991),
	CONSTRAINT "payments_ledger_check" CHECK("payments"."ledger" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_invoiceId_unique` ON `payments` (`invoiceId`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_attemptId_unique` ON `payments` (`attemptId`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_transactionHash_unique` ON `payments` (`transactionHash`);