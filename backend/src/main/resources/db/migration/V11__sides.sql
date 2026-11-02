-- Main + side combos.
--
-- recipes.side_score: how well a recipe works next to a main, 0 to 100 (SlotClassifier).
-- Slaws, mashes, roasted vegetables and plain grains score high; a recipe is offered as a
-- side at 50 or more. Existing rows start at 0: run POST /api/admin/recipes/rescore once.
alter table recipes
    add column side_score integer not null default 0
        check (side_score between 0 and 100);

-- A selection can carry one side, cooked with the main for the same servings. Its cost is
-- kept apart so the main's cost stays what the main costs.
alter table plan_selections
    add column side_recipe_id uuid,
    add column side_portion_multiplier numeric(6,3) check (side_portion_multiplier > 0),
    add column side_estimated_cost numeric(10,2) check (side_estimated_cost >= 0),
    add constraint fk_plan_selections_side_recipe foreign key (side_recipe_id)
        references recipes (id) on delete set null;

create index idx_plan_selections_side_recipe on plan_selections (side_recipe_id);
