-- Add unique constraint on users.email for Cloudflare Access auth
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
