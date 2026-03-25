import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

export function getVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    // In dist/bin/, package.json is two levels up: dist/bin/../../package.json
    const packageJsonPath = join(__dirname, "../../package.json");
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}
