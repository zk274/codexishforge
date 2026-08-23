import { APP_NAME } from "../shared/app-identity.mjs";

export const NOTIFICATION_DEDUPE_WINDOW_MS = 60_000;

const preferenceForKind = Object.freeze({
  turn: "notifyTurnComplete",
  request: "notifyApproval",
  terminal: "notifyTerminal",
});

export function notificationContent(kind, details = {}) {
  if (kind === "turn") {
    return {
      title: "Codex finished",
      body: "Your Codex turn is ready to review.",
      urgency: "normal",
    };
  }
  if (kind === "request") {
    const needsInput = details.requestType === "input";
    return {
      title: needsInput ? "Codex needs your input" : "Codex needs your approval",
      body: needsInput ? `Open ${APP_NAME} to answer and continue the turn.` : `Open ${APP_NAME} to review the pending request.`,
      urgency: "normal",
    };
  }
  if (kind === "terminal") {
    if (details.failedToStart) {
      return {
        title: "Background terminal failed",
        body: "A project terminal could not be started.",
        urgency: "normal",
      };
    }
    const exitCode = Number.isInteger(details.exitCode) && Math.abs(details.exitCode) <= 1_000_000 ? details.exitCode : null;
    return {
      title: exitCode === 0 ? "Background terminal finished" : "Background terminal exited",
      body: exitCode === 0 ? "A project terminal exited successfully." : `A project terminal exited${exitCode == null ? "." : ` with code ${exitCode}.`}`,
      urgency: exitCode === 0 ? "low" : "normal",
    };
  }
  throw new RangeError("Unsupported notification kind");
}

export function notificationDedupeKey(kind, id) {
  if (!Object.hasOwn(preferenceForKind, kind)) throw new RangeError("Unsupported notification kind");
  if ((typeof id !== "string" && typeof id !== "number") || String(id).length < 1 || String(id).length > 200) throw new TypeError("Notification id is invalid");
  return `${kind}:${String(id)}`;
}

export function shouldShowNotification({ kind, preferences, supported, focused, duplicate }) {
  const preference = preferenceForKind[kind];
  if (!preference) return { show: false, reason: "unsupported-kind" };
  if (!supported) return { show: false, reason: "unsupported" };
  if (focused) return { show: false, reason: "focused" };
  if (duplicate) return { show: false, reason: "duplicate" };
  if (preferences?.[preference] !== true) return { show: false, reason: "disabled" };
  return { show: true, reason: null };
}
