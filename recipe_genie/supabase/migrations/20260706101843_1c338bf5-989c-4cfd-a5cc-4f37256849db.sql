ALTER TABLE public.shopping_list_shares ADD COLUMN share_token UUID;

UPDATE public.shopping_list_shares SET share_token = gen_random_uuid() WHERE share_token IS NULL;

ALTER TABLE public.shopping_list_shares ALTER COLUMN share_token SET NOT NULL;
ALTER TABLE public.shopping_list_shares ADD CONSTRAINT shopping_list_shares_share_token_unique UNIQUE (share_token);
ALTER TABLE public.shopping_list_shares ALTER COLUMN share_token SET DEFAULT gen_random_uuid();

CREATE INDEX shopping_list_shares_token_idx ON public.shopping_list_shares(share_token);