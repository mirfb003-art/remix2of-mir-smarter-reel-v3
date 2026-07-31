ALTER TABLE public.published_posts
  ALTER COLUMN run_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'app',
  ADD COLUMN IF NOT EXISTS text_content text,
  ADD COLUMN IF NOT EXISTS buffer_status text,
  ADD COLUMN IF NOT EXISTS due_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

UPDATE public.published_posts SET buffer_post_id = NULL
  WHERE buffer_post_id IS NOT NULL AND btrim(buffer_post_id) = '';

CREATE UNIQUE INDEX IF NOT EXISTS published_posts_user_buffer_post_id_key
  ON public.published_posts (user_id, buffer_post_id)
  WHERE buffer_post_id IS NOT NULL;