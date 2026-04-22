import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const children = [
  startProcess("server", ["run", "dev:server"]),
  startProcess("vite", ["run", "dev", "--", "--port", "5175"]),
];

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    for (const child of children) {
      child.kill(signal);
    }

    process.exit(0);
  });
}

function startProcess(label, args) {
  const child = spawn(npmCommand, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["inherit", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(prefixLines(label, chunk));
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(prefixLines(label, chunk));
  });
  child.on("exit", (code, signal) => {
    const detail = signal ? `signal ${signal}` : `code ${code}`;
    process.stdout.write(`[${label}] exited with ${detail}\n`);
  });

  return child;
}

function prefixLines(label, chunk) {
  return chunk
    .toString()
    .split(/\r?\n/)
    .map((line, index, lines) => (index === lines.length - 1 && line === "" ? "" : `[${label}] ${line}`))
    .join("\n");
}
