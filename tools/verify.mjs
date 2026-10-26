#!/usr/bin/env node
// Patokan "selesai" untuk AI agent: semua langkah harus lulus.
// Pakai: node tools/verify.mjs          (typecheck + test + cek data sensitif)
//        node tools/verify.mjs --build  (ditambah next build, lebih lama)

import { spawnSync } from "node:child_process";

const withBuild = process.argv.includes("--build");

const steps = [
  { name: "typecheck", cmd: "npm", args: ["run", "typecheck"] },
  { name: "test", cmd: "npm", args: ["test"] },
  { name: "check-sensitive", cmd: "node", args: ["tools/check-sensitive.mjs"] },
];
if (withBuild) steps.push({ name: "build", cmd: "npm", args: ["run", "build"] });

const results = [];
for (const step of steps) {
  console.log(`\n▶ ${step.name}`);
  const r = spawnSync(step.cmd, step.args, { stdio: "inherit", shell: process.platform === "win32" });
  results.push({ name: step.name, ok: r.status === 0 });
}

console.log("\n=== VERIFY ===");
for (const r of results) console.log(`${r.ok ? "✔" : "✘"} ${r.name}`);
const allOk = results.every((r) => r.ok);
console.log(allOk ? "\nVERIFY LULUS" : "\nVERIFY GAGAL — belum boleh dianggap selesai");
process.exit(allOk ? 0 : 1);
