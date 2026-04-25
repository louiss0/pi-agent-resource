import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const shownDevelopmentNotices = new Set<string>();

function getDevelopmentNotice(extensionName: string) {
	return `${extensionName} is running in development mode. Nothing is being saved.`;
}

export function isDevelopmentExtensionRuntime() {
	return process.env.PI_RESOURCE_DEV === "1";
}

export function notifyWhenUsingDevelopmentExtension(
	extensionName: string,
	ctx: {
		ui: {
			notify(
				message: string,
				level?: "info" | "error" | "warning" | "success",
			): void;
		};
	},
) {
	if (!isDevelopmentExtensionRuntime() || shownDevelopmentNotices.has(extensionName)) {
		return;
	}

	shownDevelopmentNotices.add(extensionName);
	ctx.ui.notify(getDevelopmentNotice(extensionName), "warning");
}

export function registerDevelopmentExtensionNotice(
	pi: ExtensionAPI,
	extensionName: string,
) {
	pi.on("session_start", async (_event, ctx) => {
		notifyWhenUsingDevelopmentExtension(extensionName, ctx);
	});
}

export function resetDevelopmentExtensionNotice() {
	shownDevelopmentNotices.clear();
}
