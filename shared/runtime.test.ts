import {
  isDevelopmentExtensionRuntime,
  notifyWhenUsingDevelopmentExtension,
  resetDevelopmentExtensionNotice,
} from "./runtime";

describe("shared/runtime", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    resetDevelopmentExtensionNotice();
  });

  it("detects development mode from a runtime env flag", () => {
    vi.stubEnv("PI_RESOURCE_DEV", "1");

    expect(isDevelopmentExtensionRuntime()).toBe(true);
  });

  it("notifies once when the extension is running from development sources", () => {
    vi.stubEnv("PI_RESOURCE_DEV", "1");
    const notify = vi.fn();
    const ctx = { ui: { notify } };

    notifyWhenUsingDevelopmentExtension(ctx);
    notifyWhenUsingDevelopmentExtension(ctx);

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      "pi-agent-resource is running from development sources",
      "info",
    );
  });

  it("stays quiet when development mode is disabled", () => {
    vi.stubEnv("PI_RESOURCE_DEV", "0");
    const notify = vi.fn();

    notifyWhenUsingDevelopmentExtension({ ui: { notify } });

    expect(notify).not.toHaveBeenCalled();
  });
});