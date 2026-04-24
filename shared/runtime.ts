let hasShownDevelopmentNotice = false;

export function isDevelopmentExtensionRuntime() {
  return process.env.PI_RESOURCE_DEV === "1";
}

export function notifyWhenUsingDevelopmentExtension(ctx: {
  ui: { notify(message: string, level?: "info" | "error" | "warning" | "success"): void };
}) {
  if (!isDevelopmentExtensionRuntime() || hasShownDevelopmentNotice) {
    return;
  }

  hasShownDevelopmentNotice = true;
  ctx.ui.notify("pi-agent-resource is running from development sources", "info");
}

export function resetDevelopmentExtensionNotice() {
  hasShownDevelopmentNotice = false;
}
