ALTER TABLE guestbook_entries ADD COLUMN password_salt TEXT;
ALTER TABLE guestbook_entries ADD COLUMN password_hash TEXT;
ALTER TABLE guestbook_entries ADD COLUMN likes INTEGER NOT NULL DEFAULT 0 CHECK (likes >= 0);