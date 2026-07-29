import fs from "node:fs";
import path from "node:path";
import { verifyReleaseTrust } from "./release-trust-lib.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
const electronPackage = JSON.parse(fs.readFileSync(path.join(projectRoot, "node_modules", "electron", "package.json"), "utf8"));

const result = await verifyReleaseTrust({
  distDirectory: path.join(projectRoot, "dist"),
  packageJson,
  electronVersion: electronPackage.version,
});

console.log(JSON.stringify(result, null, 2));
