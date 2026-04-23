# Tests that are failing

- None. `jpd run test` passes with 35 passing tests.

# What bugs are present

- No known failing bugs at handoff.
- `ConfirmationBox` now supports error text, but there are no direct tests yet for rendering and clearing checkbox error messages inside the shared component suite.

# What to do next

- Add focused tests for `ConfirmationBox` error rendering and clearing behavior.
- Decide whether the generic `Form` should stay inheritance-based or move toward composition with protected hooks only for field-specific behavior.
- If inheritance stays, document the intended extension points on `Form` (`updateFieldFocus`, `syncFieldError`) so future forms do not override `handleInput`.
- After any changes, run `jpd run test` and verify the full suite still passes.
