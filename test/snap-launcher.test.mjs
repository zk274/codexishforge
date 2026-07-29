import assert from "node:assert/strict";
import test from "node:test";
import { classicSnapLauncher } from "../scripts/snap-launcher.mjs";

test("classic Snap launcher directly starts the packaged app with bounded arguments", () => {
  const launcher = classicSnapLauncher("codex-linux-community");
  assert.equal(
    launcher,
    "#!/bin/sh\nexec \"$SNAP/codex-linux-community\" --no-sandbox \"$@\"\n",
  );
  assert.doesNotMatch(launcher, /desktop-init|desktop-common|desktop-gnome/);
});

test("classic Snap launcher rejects shell syntax in executable names", () => {
  assert.throws(() => classicSnapLauncher("codex; touch /tmp/unsafe"), /invalid/);
});
