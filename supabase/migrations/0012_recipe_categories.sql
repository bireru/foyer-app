-- Catégories de recettes modifiables (au lieu du tableau de tags figé dans le code)
-- Partagées entre les deux, comme le reste du volet Nourriture.

create table recipe_categories (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (household_id, name)
);

alter table recipe_categories enable row level security;
create policy "household rw" on recipe_categories for all
  using (household_id = current_household_id())
  with check (household_id = current_household_id());

create table recipe_category_links (
  id uuid primary key default uuid_generate_v4(),
  recipe_id uuid not null references recipes(id) on delete cascade,
  category_id uuid not null references recipe_categories(id) on delete cascade,
  unique (recipe_id, category_id)
);

alter table recipe_category_links enable row level security;
create policy "recipe_category_links rw" on recipe_category_links for all
  using (recipe_id in (select id from recipes where household_id = current_household_id()))
  with check (recipe_id in (select id from recipes where household_id = current_household_id()));

-- Reprend les tags existants (colonne recipes.tags) dans la nouvelle structure, sans rien perdre
insert into recipe_categories (household_id, name)
select distinct r.household_id, t.tag
from recipes r
cross join lateral unnest(r.tags) as t(tag)
on conflict (household_id, name) do nothing;

insert into recipe_category_links (recipe_id, category_id)
select r.id, c.id
from recipes r
cross join lateral unnest(r.tags) as t(tag)
join recipe_categories c on c.household_id = r.household_id and c.name = t.tag
on conflict (recipe_id, category_id) do nothing;

-- Si un foyer n'a encore aucune recette (donc aucun tag existant), on amorce avec les catégories de départ
insert into recipe_categories (household_id, name)
select h.id, v.name
from households h
cross join (values ('léger'), ('riche en protéines'), ('batch cooking'), ('rapide'), ('végé')) as v(name)
where not exists (select 1 from recipe_categories rc where rc.household_id = h.id)
on conflict (household_id, name) do nothing;

alter table recipes drop column tags;
