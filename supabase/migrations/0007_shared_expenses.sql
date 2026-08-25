-- ============================================================
-- Onglet "Commun" du Budget — mode Tricount, partagé entre les deux
-- (contrairement à budget_transactions qui reste privée)
-- ============================================================

create table shared_expenses (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  paid_by uuid not null references profiles(id) on delete cascade,
  label text not null,
  amount numeric(9,2) not null,
  occurred_at date not null default current_date,
  notes text
);

alter table shared_expenses enable row level security;

create policy "household rw" on shared_expenses for all
  using (household_id = current_household_id())
  with check (household_id = current_household_id());
