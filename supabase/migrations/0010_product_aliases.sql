-- Table d'apprentissage local pour la reconnaissance d'articles de reçus (sans IA).
-- Le foyer associe un texte brut de ticket (souvent abrégé) à un nom clair.
-- Plus vous scannez, plus la reconnaissance s'améliore sur vos achats récurrents.

create table product_aliases (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  raw_text text not null,        -- texte tel que lu sur le ticket (normalisé)
  canonical_name text not null,  -- nom clair qu'on veut afficher dans les listes
  match_count int not null default 1,
  updated_at timestamptz not null default now(),
  unique (household_id, raw_text)
);

alter table product_aliases enable row level security;
create policy "household rw" on product_aliases for all
  using (household_id = current_household_id())
  with check (household_id = current_household_id());
