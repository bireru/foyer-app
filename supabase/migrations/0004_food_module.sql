-- ============================================================
-- Volet Nourriture — structure complète
-- ============================================================

-- Objectifs nutritionnels quotidiens, propres à chaque profil (même principe que weight_goal_kg)
alter table profiles add column calorie_goal_kcal int;
alter table profiles add column protein_goal_g int;

-- ---------- Recettes ----------

create table recipes (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  calories_kcal int,
  protein_g int,
  tags text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now()
);

create table recipe_ingredients (
  id uuid primary key default uuid_generate_v4(),
  recipe_id uuid not null references recipes(id) on delete cascade,
  name text not null,
  quantity text
);

-- ---------- Plan de repas (partagé, pas par personne) ----------

create table meal_plan_entries (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  plan_date date not null,
  meal_slot text not null check (meal_slot in ('petit-dejeuner', 'dejeuner', 'diner', 'collation')),
  recipe_id uuid references recipes(id) on delete set null,
  custom_label text
);

-- ---------- Journal alimentaire simple ----------

create table food_log (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  logged_at timestamptz not null default now(),
  description text not null,
  calories_kcal int,
  protein_g int
);

-- ============================================================
-- RLS
-- ============================================================

alter table recipes enable row level security;
alter table recipe_ingredients enable row level security;
alter table meal_plan_entries enable row level security;
alter table food_log enable row level security;

create policy "household rw" on recipes for all
  using (household_id = current_household_id())
  with check (household_id = current_household_id());

create policy "household rw" on meal_plan_entries for all
  using (household_id = current_household_id())
  with check (household_id = current_household_id());

create policy "household rw" on food_log for all
  using (household_id = current_household_id())
  with check (household_id = current_household_id());

create policy "recipe_ingredients rw" on recipe_ingredients for all
  using (recipe_id in (select id from recipes where household_id = current_household_id()))
  with check (recipe_id in (select id from recipes where household_id = current_household_id()));
