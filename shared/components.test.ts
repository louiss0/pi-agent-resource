import { Theme } from "@mariozechner/pi-coding-agent";
import { Key, type TUI } from "@mariozechner/pi-tui";

vi.mock("@mariozechner/pi-tui", async () => {
  const module =
    await vi.importActual<typeof import("@mariozechner/pi-tui")>("@mariozechner/pi-tui");

  return {
    ...module,
    matchesKey: (data: string, key: string) => data === key,
  };
});

import { ConfirmationBox, LabelledInput } from "./components";

describe("shared/components", () => {
  function createTheme() {
    return {
      fg: (_color: string, text: string) => text,
    } as unknown as Theme;
  }

  function createTui() {
    return {
      requestRender: vi.fn(),
    } as unknown as TUI;
  }

  describe("LabelledInput", () => {
    it("renders the label, typed value, and error messages", () => {
      const input = new LabelledInput("name", createTheme());

      input.setLabelTextPrefix("› ");
      input.setFocused(true);
      input.handleInput("t");
      input.handleInput("e");
      input.handleInput("s");
      input.handleInput("t");
      input.setError(["Name is required", "Must be lowercase"]);

      const lines = input.render(45).join("\n");

      expect(lines).toContain("› name");
      expect(lines).toContain("test");
      expect(lines).toContain("Name is required");
      expect(lines).toContain("Must be lowercase");
    });

    it("clears error messages", () => {
      const input = new LabelledInput("description", createTheme());

      input.setError(["Description is required"]);
      input.clearError();

      expect(input.render(45).join("\n")).not.toContain("Description is required");
    });
  });

  describe("ConfirmationBox", () => {
    it("renders unchecked by default", () => {
      const checkbox = new ConfirmationBox(createTui());

      expect(checkbox.render(45).join("\n")).toContain("[ ] Do you want to fill in the next fields?");
    });

    it("renders the focused prefix when focused", () => {
      const checkbox = new ConfirmationBox(createTui());

      checkbox.setFocused(true);

      expect(checkbox.render(45).join("\n")).toContain("> [ ] Do you want to fill in the next fields?");
    });

    it("toggles to confirmed when space is pressed", () => {
      const tui = createTui();
      const checkbox = new ConfirmationBox(tui);

      checkbox.setFocused(true);
      checkbox.handleInput(Key.space);

      const lines = checkbox.render(45).join("\n");

      expect(lines).toContain("> [x] Do you want to fill in the next fields?");
      expect(tui.requestRender).toHaveBeenCalledTimes(1);
    });

    it("toggles back to unchecked when space is pressed twice", () => {
      const tui = createTui();
      const checkbox = new ConfirmationBox(tui);

      checkbox.handleInput(Key.space);
      checkbox.handleInput(Key.space);

      expect(checkbox.render(45).join("\n")).toContain("[ ] Do you want to fill in the next fields?");
      expect(tui.requestRender).toHaveBeenCalledTimes(2);
    });

    it("confirms the box without toggling it back off", () => {
      const tui = createTui();
      const checkbox = new ConfirmationBox(tui);

      checkbox.confirm();
      checkbox.confirm();

      expect(checkbox.render(45).join("\n")).toContain("[x] Do you want to fill in the next fields?");
      expect(tui.requestRender).toHaveBeenCalledTimes(1);
    });
  });
});
