// SessionStart hook - NON-BLOCKING. Menyuntikkan pengingat hygiene di awal
// sesi, karena skill cuma termuat kalau model menilainya relevan - dan awal
// sesi justru saat model belum tahu apa yang relevan. Dokumen basi yang dibaca
// di lima menit pertama menyetir seluruh sesi.
//
// Output WAJIB satu baris JSON. Kalau apa pun gagal, hook ini tetap keluar
// dengan JSON kosong: hook yang error lebih buruk daripada hook yang diam.

import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";

const jalankan = (perintah) => {
  try {
    return execSync(perintah, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
};

const catatan = [];

try {
  // --- Worktree: yang terdaftar tapi hilang, dan yang ada tapi tidak terdaftar
  const terdaftar = jalankan("git worktree list --porcelain")
    .split("\n")
    .filter((b) => b.startsWith("worktree "))
    .map((b) => b.slice(9).trim());

  const hilang = terdaftar.filter((p) => p && !existsSync(p));
  if (hilang.length) {
    catatan.push(
      `WORKTREE TERDAFTAR TAPI TIDAK ADA DI DISK: ${hilang.join(", ")}. ` +
        `Jalankan \`git worktree prune\`.`
    );
  }

  // Direktori tetangga yang punya BERKAS .git (penanda worktree) tapi tidak
  // terdaftar = `git worktree remove` yang tidak pernah selesai.
  const akar = terdaftar[0] || process.cwd();
  const induk = dirname(akar);
  const normal = (p) => p.replace(/\\/g, "/").toLowerCase().replace(/\/+$/, "");
  const setTerdaftar = new Set(terdaftar.map(normal));
  if (existsSync(induk)) {
    for (const nama of readdirSync(induk)) {
      const calon = join(induk, nama);
      try {
        if (!statSync(calon).isDirectory()) continue;
        const penanda = join(calon, ".git");
        if (!existsSync(penanda)) continue;
        if (!statSync(penanda).isFile()) continue; // .git direktori = clone biasa
        if (!setTerdaftar.has(normal(calon))) {
          catatan.push(`WORKTREE YATIM (tidak terdaftar): ${calon}`);
        }
      } catch {
        /* direktori tidak terbaca - lewati */
      }
    }
  }

  // --- PROGRESS.md basi?
  const progress = join(akar, "PROGRESS.md");
  if (existsSync(progress)) {
    const isi = readFileSync(progress, "utf8").slice(0, 4000);
    const cocok = isi.match(/Terakhir diperbarui:\s*\*\*(\d{4}-\d{2}-\d{2})\*\*/);
    const commitTerakhir = jalankan("git log -1 --date=short --format=%ad");
    if (cocok && commitTerakhir && cocok[1] < commitTerakhir) {
      catatan.push(
        `PROGRESS.md menyebut "Terakhir diperbarui: ${cocok[1]}" sementara commit ` +
          `terakhir ${commitTerakhir}. Isinya BELUM TENTU berlaku - verifikasi ` +
          `sebelum mengutipnya.`
      );
    }
  }
} catch {
  /* jangan pernah menggagalkan awal sesi */
}

const teks = [
  "PENGINGAT AWAL SESI (Gajihub) - dari SessionStart hook, bukan dari user:",
  "- Baca PROGRESS.md dulu, lalu skill `gajihub-orientasi`.",
  "- Jangan mengutip angka status (jumlah test, path, isi env) tanpa memeriksanya sendiri.",
  "- Git dipegang user: jangan commit/push/PR atas inisiatif sendiri.",
  "- SIAP & e-Presensi READ-ONLY tanpa kecuali.",
  ...catatan.map((c) => `- ${c}`),
].join("\n");

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: teks,
    },
  })
);
