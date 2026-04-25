import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

let hasShownDevelopmentNotice = false;

const developmentNotice =
	"pi-agent-resource is running in development mode. Nothing is being saved.";

export function isDevelopmentExtensionRuntime() {
	return process.env.PI_RESOURCE_DEV === "1";
}

export function notifyWhenUsingDevelopmentExtension(ctx: {
	ui: {
		notify(
			message: string,
			level?: "info" | "error" | "warning" | "success",
		): void;
	};
}) {
	if (!isDevelopmentExtensionRuntime() || hasShownDevelopmentNotice) {
		return;
	}

	hasShownDevelopmentNotice = true;
	ctx.ui.notify(developmentNotice, "warning");
}

export function registerDevelopmentExtensionNotice(pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		notifyWhenUsingDevelopmentExtension(ctx);
	});
}

export function resetDevelopmentExtensionNotice() {
	hasShownDevelopmentNotice = false;
}
