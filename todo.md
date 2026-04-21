# Tests that are failing

- None. `jpd run test` passes with 29 passing tests.

# What bugs are present

- No known failing bugs at handoff.
- `extensions/skill-creator.ts` still owns form-specific navigation, validation, and submission wiring instead of using the generic `Form` from `shared/components.ts`.

# What to do next

- Refactor `extensions/skill-creator.ts` to use `Form` from `shared/components.ts` for focus movement and input delegation.
- Keep `SkillForm` focused on skill-specific behavior only: validation, error mapping, and submit payload construction.
- Add or update tests to cover the `SkillForm` integration with the shared `Form` component.
- After the refactor, run `jpd run test` and verify the full suite still passes.
