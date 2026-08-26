-- Relie un article de courses à la dépense privée qu'il a générée quand il est coché comme acheté.
-- Permet de retirer la dépense proprement si la case est décochée par erreur.
alter table shopping_items add column linked_transaction_id uuid references budget_transactions(id) on delete set null;
