-- Permet de relier une entrée du journal alimentaire à une recette existante
alter table food_log add column recipe_id uuid references recipes(id) on delete set null;
