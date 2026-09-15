CREATE TABLE public.vault_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.vault_users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled note',
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX vault_notes_user_idx ON public.vault_notes(user_id, updated_at DESC);
GRANT ALL ON public.vault_notes TO service_role;
ALTER TABLE public.vault_notes ENABLE ROW LEVEL SECURITY;