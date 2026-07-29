export const LINUX_DESKTOP_NAME = "community.codexlinux.desktop";

export function resolveLinuxDesktopName({
  platform = process.platform,
  snapInstanceName = process.env.SNAP_INSTANCE_NAME,
} = {}) {
  if (platform !== "linux") return null;
  if (typeof snapInstanceName !== "string" || !snapInstanceName) return LINUX_DESKTOP_NAME;
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(snapInstanceName)) return LINUX_DESKTOP_NAME;
  return `${snapInstanceName}_${LINUX_DESKTOP_NAME}`;
}
