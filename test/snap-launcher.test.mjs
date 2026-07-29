import assert from "node:assert/strict";
import test from "node:test";
import { classicSnapLauncher } from "../scripts/snap-launcher.mjs";

test("classic Snap launcher directly starts the packaged app with bounded arguments", () => {
  const launcher = classicSnapLauncher("codex-linux-community");
  assert.equal(
    launcher,
    [
      "#!/bin/sh",
      "export CHROME_DESKTOP=\"${SNAP_INSTANCE_NAME:-codex-linux-community}_community.codexlinux.desktop\"",
      "exec \"$SNAP/codex-linux-community\" --no-sandbox \"$@\"",
      "",
    ].join("\n"),
  );
  assert.doesNotMatch(launcher, /desktop-init|desktop-common|desktop-gnome/);
});

test("classic Snap launcher rejects shell syntax in executable names", () => {
  assert.throws(() => classicSnapLauncher("codex; touch /tmp/unsafe"), /invalid/);
});

test("classic Snap launcher rejects unsafe desktop identities", () => {
  assert.throws(
    () => classicSnapLauncher("codex-linux-community", {
      desktopName: "community.codexlinux.desktop; touch /tmp/unsafe",
    }),
    /invalid/,
  );
});
