-- Automatic weekly plans: on by default, made at generate-at (11pm) local time on
-- auto_plan_day. Null means the night before plan_start_day, which is what every
-- existing user had.
alter table user_preferences
    add column auto_plan_enabled boolean not null default true,
    add column auto_plan_day varchar(10)
        check (auto_plan_day in ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'));
