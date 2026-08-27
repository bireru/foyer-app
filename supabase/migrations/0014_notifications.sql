-- ============================================================
-- Notifications push
-- ============================================================

create table push_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;
create policy "owner only" on push_subscriptions for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- Évite d'envoyer deux fois le même rappel pour la même période
-- (ex: "poids-2026-08-31" ou "budget-depassement-<categorie>-2026-08")
create table notification_log (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references profiles(id) on delete cascade,
  reminder_key text not null,
  sent_at timestamptz not null default now(),
  unique (profile_id, reminder_key)
);

alter table notification_log enable row level security;
create policy "owner only" on notification_log for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- Limite mensuelle par catégorie de dépense, pour l'alerte de dépassement de budget
alter table budget_categories add column monthly_limit_eur numeric(9,2);
