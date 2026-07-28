const { execSync } = require("child_process");
const arch = process.arch;

if (arch === "arm64") {
  execSync(
    "npm install node-pty@npm:node-pty-android-arm64 --no-save --no-package-lock",
    {
      stdio: "inherit"
    }
  );
} else {
  execSync(
    "npm install node-pty --no-save --no-package-lock",
    {
      stdio: "inherit"
    }
  );
}
