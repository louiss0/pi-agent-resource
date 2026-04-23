# Tests that are failing

- None. `jpd run test` passes with 35 passing tests.

# What bugs are present

- No known failing bugs at handoff.
- `ConfirmationBox` now supports error text, but there are no direct tests yet for rendering and clearing checkbox error messages inside the shared component suite.

# What to do next

- Add focused tests for `ConfirmationBox` error rendering and clearing behavior.
- After any changes, run `jpd run test` and verify the full suite still passes.
- Remove tests related to generating the handler instead inline the handler inside the pi command 
- Implement logic and tests for what happens when the confirm state is true in the form!
- The user must then pass more fields realated to the skill form!
- **A second form must be created that allows the user to specify the following fields:**
  - `license` must be a proper path 
  - `compatibility` a string with a max of 500 characters
  - `allowed tools` a space separated string of allowed tools! 
- The user must type the above fields well but they call all be empty! 
- When the user submits the form they must be able to see where the file was created
- Then the name and description fields schema must be refactored:
  - The `name` must be a max of 164 characters 
  - The `description` must be a max of 1024 characters
- This extension assumes that all skills will be placed in `~/.pi/agents/skills/` folder! 
- For the edit command feature I'd like for the user's external editor to be opened! The `$VISUAL` or `$EDITOR`variable is used for this!
- For the delete command all that has to be done is that the user sees skill names and picks a skill to delete
  - The `~/.pi/agents/skills/` is search for the names are introduced, user pick's it's removed
  - I think it's best if it's moved to the trash If OS's don't have a consistent way of doing this. Delete them!
