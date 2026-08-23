import assert from "node:assert/strict";
import test from "node:test";
import { classicSnapLauncher } from "../scripts/snap-launcher.mjs";

test("classic Snap launcher directly starts the packaged app with bounded arguments", () => {
  const launcher = classicSnapLauncher("codexishforge");
  assert.equal(
    launcher,
    [
      "#!/bin/sh",
      "export CHROME_DESKTOP=\"${SNAP_INSTANCE_NAME:-codexishforge}_io.github.zk274.codexishforge.desktop\"",
      "export NOTIFY_IGNORE_PORTAL=1",
      "exec \"$SNAP/codexishforge\" --no-sandbox \"$@\"",
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
    () => classicSnapLauncher("codexishforge", {
      desktopName: "io.github.zk274.codexishforge.desktop; touch /tmp/unsafe",
    }),
    /invalid/,
  );
});
