# Tests that are failing


# What to do next

- Focus on making the tests that were written pass
- Start with implementing the features for the agent commands
- End with implementing features for the propmts
- The AgentForm needs to make sure the user makes agents with the below credentials
  - `name` required, max 48 characters, lowercase
  - `description` required min 35 characters max 1024
  - `tools` required a comma separated string of lower case characters
  - `model` required, min 2, lowercase
- The `PromptForm` needs to make sure that the fields are filled out 
  - `name` lowercase max 48 characters min 3 
  - `description` min 35 characters max 1024 
  - `argument-hint` optional, Must have [] or <> delimiters many can be written spaced 
    - `<>` is required hint
    - `[]` is optional
- The user will be introduced to the editor in the overlay to make the template
- The prompt footer should indicate this! Along with what's required .vs optional
  - The `*` with stand for required 
- The tests need to be re written to make sure that the form functions are called! 
- The individual form functions need to be called to ensure every thing above is accounted for! 
- The components will all need to be changed to account for the new required functionality
- The `*` will be at the left side no matter which component! For the input it will be at the label!
- The form component should indicate this stuff no matter what! The user can't override this message, just append under.
