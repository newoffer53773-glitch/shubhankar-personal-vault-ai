ALTER TABLE public.vault_notes ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'note';
CREATE INDEX IF NOT EXISTS vault_notes_user_kind_idx ON public.vault_notes (user_id, kind);