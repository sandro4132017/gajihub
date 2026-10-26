//usr/bin/env node
// Cari pola data pegawai sensitif yang tidak boleh ada di kode:
// NIP (18 digit), NIK (16 digit), console.log yang mencetak field sensitif,
// dan kredensial yang di-hardcode.
// Pakai: node tools/check-sensitive.mjs [folder...]   (default: src prisma tests)
// Baris boleh dikecualikan dengan komentar: // sensitive-ok

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const roots = process.argv.slice(2).length ? process.argv.slice(2) : ["src", "prisma", "tests"];
const exts = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".sql", ".prisma"]);
const skipDirs = new Set(["node_modules", ".next", "generated", "migrations", "dist", "coverage"]);

const rules = [
  { name: "NIP (18 digit)", re: /(?<!\d)(19|20)\d{6}(19|20)\d{4}[12]\d{3}(?!\d)/ },
  { name: "NIK (16 digit)", re: /(?<![\d.])\d{16}(?![\d.])/ },
  {
    name: "Log field sensitif",
    re: /console\.(log|info|warn|error|debug)\([^)]*\b(nip|nik|gaji|salary|rekening|norek|no_rek|password)\b/i,
  },
  {
    name: "Kredensial hardcode",
    re: /(password|passwd|pwd|secret|token)\s*[:=]\s*["'`][^"'`\s]{6,}["'`]/i,
  },
  { name: "Connection string berkredensial", re: /(postgres(ql)?|sqlserver|mssql):\/\/[^:\s"'`]+:[^@\s"'`]+@/i },
];

const findings = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (skipDirs.has(entry) || entry.startsWith(".env")) continue;
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (exts.has(extname(entry))) scan(p);
  }
}

function scan(file) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (line.includes("sensitive-ok")) return;
    for (const rule of rules) {
      if (rule.re.test(line)) findings.push({ file, line: i + 1, rule: rule.name });
    }
  });
}

for (const r of roots) if (existsSync(r)) walk(r);

if (findings.length) {
  console.error(`check-sensitive: ${findings.length} temuan`);
  for (const f of findings) console.error(`  ${f.file}:${f.line}  ${f.rule}`);
  console.error("Hapus data asli / pindahkan ke env. Jika false positive, tambahkan komentar // sensitive-ok");
  process.exit(1);
}
console.log("check-sensitive: bersih");
