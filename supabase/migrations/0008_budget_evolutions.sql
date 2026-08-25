-- ============================================================
-- Évolutions du Budget privé : catégories personnalisables, salaire mensuel, épargne
-- Tout reste privé (owner-only), comme budget_transactions.
-- ============================================================

create table budget_categories (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table budget_categories enable row level security;
create policy "owner only" on budget_categories for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- On relie désormais les transactions à une catégorie (au lieu d'un texte libre).
-- Si une catégorie est supprimée, les transactions passent en "Sans catégorie" plutôt que d'être perdues.
alter table budget_transactions add column category_id uuid references budget_categories(id) on delete set null;

-- ---------- Salaire mensuel ----------

create table monthly_income (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references profiles(id) on delete cascade,
  month date not null, -- toujours le 1er du mois concerné
  amount numeric(9,2) not null,
  received_day int not null default 1 check (received_day between 1 and 31),
  unique (profile_id, month)
);

alter table monthly_income enable row level security;
create policy "owner only" on monthly_income for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ---------- Épargne simplifiée (façon Finary) ----------

create table savings_accounts (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  account_type text, -- ex: Livret A, Assurance vie, Actions, Crypto...
  created_at timestamptz not null default now()
);

alter table savings_accounts enable row level security;
create policy "owner only" on savings_accounts for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create table savings_snapshots (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid not null references savings_accounts(id) on delete cascade,
  recorded_at date not null default current_date,
  value numeric(11,2) not null
);

alter table savings_snapshots enable row level security;
create policy "owner via account" on savings_snapshots for all
  using (account_id in (select id from savings_accounts where profile_id = auth.uid()))
  with check (account_id in (select id from savings_accounts where profile_id = auth.uid()));
