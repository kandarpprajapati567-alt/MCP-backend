-- Raise bounded Agent planning capacity without enabling unbounded execution.
-- Existing definitions keep their current values; new definitions retain conservative defaults.
alter table public.agent_definitions
  drop constraint if exists agent_definitions_max_steps_check,
  drop constraint if exists agent_definitions_max_tool_calls_check;

alter table public.agent_definitions
  add constraint agent_definitions_max_steps_check
    check (max_steps between 1 and 16),
  add constraint agent_definitions_max_tool_calls_check
    check (max_tool_calls between 0 and 8);
