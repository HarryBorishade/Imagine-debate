const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const port = process.env.PORT || "3000";

function readEnvLocalValue(name) {
  const envPath = path.join(process.cwd(), ".env.local");

  if (!fs.existsSync(envPath)) return "";

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) continue;

    const [key, ...valueParts] = trimmed.split("=");

    if (key === name) {
      return valueParts.join("=").replace(/^["']|["']$/g, "");
    }
  }

  return "";
}

const appUrl = process.env.NEXT_PUBLIC_APP_URL || readEnvLocalValue("NEXT_PUBLIC_APP_URL");
const preferredLanHost = appUrl ? new URL(appUrl).hostname : "";

function getLanHost() {
  if (preferredLanHost && preferredLanHost !== "localhost") {
    return preferredLanHost;
  }

  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family === "IPv4" && !address.internal) {
        return address.address;
      }
    }
  }

  return "";
}

const lanHost = getLanHost();

console.log("");
console.log("Imagine Debate frontend");
console.log(`Local:   http://localhost:${port}`);
if (lanHost) {
  console.log(`Network: http://${lanHost}:${port}`);
}
console.log("");

const nextBin = require.resolve("next/dist/bin/next");
const child = spawn(
  process.execPath,
  [nextBin, "dev", "--hostname", "0.0.0.0"],
  {
    stdio: "inherit",
    env: process.env,
  }
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code || 0);
});
