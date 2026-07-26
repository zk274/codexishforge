import { spawn } from "node:child_process";
import path from "node:path";

const builder = path.resolve("node_modules", ".bin", "electron-builder");
function build(target) {
  return new Promise((resolve, reject) => {
    const child = spawn(builder, ["--linux", target], { stdio: "inherit", env: process.env });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${target} build failed (${signal || code || "unknown"})`));
    });
  });
}

for (const target of ["AppImage", "deb", "snap"]) {
  await build(target);
}
