import {
  isDevelopmentExtensionRuntime,
  notifyWhenUsingDevelopmentExtension,
  registerDevelopmentExtensionNotice,
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
      "pi-agent-resource is running in development mode. Nothing is being saved.",
      "warning",
    );
  });
+
  it("registers a session_start notice so users are warned during activation", async () => {
    vi.stubEnv("PI_RESOURCE_DEV", "1");
    const on = vi.fn();
    const notify = vi.fn();

    registerDevelopmentExtensionNotice({ on } as never);

    expect(on).toHaveBeenCalledTimes(1);
    expect(on).toHaveBeenCalledWith("session_start", expect.any(Function));

    const handler = on.mock.calls[0]?.[1] as (event: unknown, ctx: unknown) => Promise<void>;
    await handler({}, { ui: { notify } });

    expect(notify).toHaveBeenCalledWith(
      "pi-agent-resource is running in development mode. Nothing is being saved.",
      "warning",
    );
  });

  it("stays quiet when development mode is disabled", () => {
    vi.stubEnv("PI_RESOURCE_DEV", "0");
    const notify = vi.fn();

    notifyWhenUsingDevelopmentExtension({ ui: { notify } });

    expect(notify).not.toHaveBeenCalled();
  });
});