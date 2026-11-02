-- A side the user picked (Side tab) stays when the main is swapped or regenerated;
-- one the planner picked follows the main.
alter table plan_selections
    add column side_chosen boolean not null default false;
