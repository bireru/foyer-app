-- Ajoute l'objectif de poids, propre à chaque profil
alter table profiles add column weight_goal_kg numeric(5,2);
