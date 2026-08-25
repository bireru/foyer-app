-- ============================================================
-- FOYER — schéma initial
-- Mode "partagé" : chaque foyer (household) a 2+ membres (profiles)
-- qui voient toutes les données du foyer, via RLS sur household_id.
-- ============================================================

create extension if not exists "uuid-ossp";

-- ---------- Foyer & membres ----------

create table households (
  id uuid primary key default uuid_generate_v4(),
  name text not null default 'Notre foyer',
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  display_name text not null,
  color_tag text not null default 'billel' check (color_tag in ('billel', 'cerine')),
  created_at timestamptz not null default now()
);

-- Fonction utilitaire : household_id de l'utilisateur connecté
create or replace function current_household_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from profiles where id = auth.uid()
$$;

-- ---------- VOLET SPORT & BIEN-ÊTRE ----------

create table weight_logs (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  measured_at timestamptz not null default now(),
  weight_kg numeric(5,2) not null,
  note text
);

create table vital_signs (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  measured_at timestamptz not null default now(),
  systolic int,
  diastolic int,
  heart_rate int,
  sleep_hours numeric(3,1),
  back_pain_level int check (back_pain_level between 0 and 10),
  note text
);

create table exercise_programs (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  goal text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table program_exercises (
  id uuid primary key default uuid_generate_v4(),
  program_id uuid not null references exercise_programs(id) on delete cascade,
  order_index int not null default 0,
  name text not null,
  target_sets int not null default 3,
  target_reps int not null default 10,
  target_weight_kg numeric(5,2),
  rest_seconds int not null default 90,
  notes text
);

create table workout_sessions (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  program_id uuid references exercise_programs(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  notes text
);

create table workout_sets (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references workout_sessions(id) on delete cascade,
  program_exercise_id uuid references program_exercises(id) on delete set null,
  set_number int not null,
  reps_done int,
  weight_kg numeric(5,2),
  duration_seconds int,
  completed_at timestamptz
);

-- ---------- VOLET NUTRITION (base — à enrichir ensuite) ----------

create table nutrition_plans (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade, -- null = plan commun
  name text not null,
  created_at timestamptz not null default now()
);

create table shopping_lists (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null default 'Courses',
  created_at timestamptz not null default now()
);

create table shopping_items (
  id uuid primary key default uuid_generate_v4(),
  list_id uuid not null references shopping_lists(id) on delete cascade,
  name text not null,
  quantity text,
  estimated_cost numeric(7,2),
  actual_cost numeric(7,2),
  purchased boolean not null default false
);

-- ---------- AUTRES VOLETS DU FOYER (stubs — architecture prête, contenu à venir) ----------

create table budget_transactions (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  profile_id uuid references profiles(id) on delete set null,
  label text not null,
  amount numeric(9,2) not null,
  category text,
  occurred_at timestamptz not null default now()
);

create table outings (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  title text not null,
  planned_at timestamptz,
  budget numeric(9,2),
  notes text
);

create table events (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  title text not null,
  event_date date not null,
  is_recurring_yearly boolean not null default false,
  notes text
);

create table trips (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  destination text not null,
  start_date date,
  end_date date,
  budget numeric(9,2),
  notes text
);

create table chores (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  title text not null,
  assigned_to uuid references profiles(id) on delete set null,
  due_date date,
  done boolean not null default false
);

create table admin_documents (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  title text not null,
  category text,
  due_date date,
  file_url text,
  notes text
);

create table home_inventory_items (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  purchased_at date,
  warranty_until date,
  notes text
);

create table vehicles (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  plate text,
  notes text
);

create table vehicle_maintenance (
  id uuid primary key default uuid_generate_v4(),
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  label text not null,
  done_at date,
  cost numeric(9,2),
  next_due_at date
);

create table memories (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  title text not null,
  memory_date date,
  photo_url text,
  notes text
);

-- ============================================================
-- RLS — un membre du foyer voit/modifie toutes les données du foyer
-- ============================================================

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'weight_logs','vital_signs','exercise_programs','program_exercises',
      'workout_sessions','workout_sets','nutrition_plans','shopping_lists',
      'shopping_items','budget_transactions','outings','events','trips',
      'chores','admin_documents','home_inventory_items','vehicles',
      'vehicle_maintenance','memories'
    ])
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

alter table households enable row level security;
alter table profiles enable row level security;

-- households : visible par ses membres
create policy "household visible by members" on households
  for select using (id = current_household_id());

-- profiles : visible par les membres du même foyer
create policy "profiles visible by household" on profiles
  for select using (household_id = current_household_id());
create policy "profile self update" on profiles
  for update using (id = auth.uid());

-- Tables avec household_id direct : select/insert/update/delete pour les membres du foyer
do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'weight_logs','vital_signs','exercise_programs',
      'workout_sessions','nutrition_plans','shopping_lists',
      'budget_transactions','outings','events','trips',
      'chores','admin_documents','home_inventory_items','vehicles','memories'
    ])
  loop
    execute format('create policy "household rw" on %I for all using (household_id = current_household_id()) with check (household_id = current_household_id())', t);
  end loop;
end $$;

-- Tables liées indirectement (via une table parente) : jointure sur le parent
create policy "program_exercises rw" on program_exercises for all
  using (program_id in (select id from exercise_programs where household_id = current_household_id()))
  with check (program_id in (select id from exercise_programs where household_id = current_household_id()));

create policy "workout_sets rw" on workout_sets for all
  using (session_id in (select id from workout_sessions where household_id = current_household_id()))
  with check (session_id in (select id from workout_sessions where household_id = current_household_id()));

create policy "shopping_items rw" on shopping_items for all
  using (list_id in (select id from shopping_lists where household_id = current_household_id()))
  with check (list_id in (select id from shopping_lists where household_id = current_household_id()));

create policy "vehicle_maintenance rw" on vehicle_maintenance for all
  using (vehicle_id in (select id from vehicles where household_id = current_household_id()))
  with check (vehicle_id in (select id from vehicles where household_id = current_household_id()));
