// Stop hook - GERBANG UNTUK SATU HAL YANG LANGKA DAN MAHAL:
// rahasia atau data pegawai yang ter-STAGE untuk commit di repo PUBLIK.
//
// Kenapa gerbangnya di situ dan bukan di "working tree kotor": tree kotor itu
// keadaan NORMAL di proyek ini (user menahan commit sampai dia sendiri menilai
// fiturnya aman), jadi gerbang di situ akan menyala di hampir tiap giliran dan
// berubah jadi kebisingan - lalu dimatikan orang, lalu suatu hari melewatkan
// yang benar-benar penting. Yang ter-stage justru hampir selalu kosong, karena
// user melakukan `git add` sendiri persis sebelum commit.
//
// Taruhannya: repo ini PUBLIK dan pemiliknya akun orang lain, `.env` memuat
// kredensial `sa` SIAP + client secret Naco, dan database memuat 9.944 baris
// rekening bank pegawai.
//
// DUA PENJAGA, keduanya perlu:
//   1. `stop_hook_active` - cuma melindungi SATU siklus stop.
//   2. berkas penanda ber-kunci `session_id` - tanpa ini, hook menyala ulang
//      tiap giliran selama kondisinya masih benar, mengulang pertanyaan yang
//      sudah dijawab. Penanda ditulis SEBELUM blok dipancarkan.

import { execSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const bacaStdin = async () => {
  const potongan = [];
  for await (const p of process.stdin) potongan.push(p);
  return potongan.join("");
};

const jalankan = (perintah) => {
  try {
    return execSync(perintah, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
};

const diam = () => process.exit(0);

let masukan = {};
try {
  masukan = JSON.parse((await bacaStdin()) || "{}");
} catch {
  diam();
}

if (masukan.stop_hook_active) diam();

const sesi = String(masukan.session_id || "tanpa-sesi").replace(/[^A-Za-z0-9_-]/g, "");
const penanda = join(tmpdir(), `gajihub-stop-${sesi}.marker`);
if (existsSync(penanda)) diam();

// --- Berkas ter-stage yang tidak boleh masuk repo publik
const terStage = jalankan("git diff --cached --name-only")
  .split("\n")
  .map((b) => b.trim())
  .filter(Boolean);

if (!terStage.length) diam();

const berbahaya = terStage.filter((berkas) => {
  const b = berkas.toLowerCase();
  if (b.split("/").pop().startsWith(".env")) return true;
  if (b.endsWith(".dump")) return true;
  if (b.endsWith(".sql") && !b.startsWith("prisma/migrations/")) return true;
  if (/\.(xlsx|xlsm|xls|pdf)$/.test(b) && !b.startsWith("docs/")) return true;
  if (b.startsWith(".vercel/")) return true;
  return false;
});

// --- Isi ter-stage yang berbentuk kredensial
const isi = jalankan("git diff --cached --unified=0");
const polaRahasia = [
  [/postgres(ql)?:\/\/[^\s:]+:[^\s@]+@/i, "connection string berisi password"],
  [/NACO_CLIENT_SECRET\s*=\s*["']?\S+/i, "NACO_CLIENT_SECRET"],
  [/(SIAP|EPRESENSI)_PASSWORD\s*=\s*["']?\S+/i, "password database sumber"],
  [/SESSION_SECRET\s*=\s*["']?\S{8,}/i, "SESSION_SECRET"],
];
const rahasia = polaRahasia.filter(([pola]) => pola.test(isi)).map(([, nama]) => nama);

if (!berbahaya.length && !rahasia.length) diam();

// Penanda DULU, baru blok - supaya kegagalan setelah ini tidak membuat hook
// mengulang blok yang sama di giliran berikutnya.
try {
  writeFileSync(penanda, new Date().toISOString());
} catch {
  /* kalau penanda gagal ditulis, `stop_hook_active` masih menahan satu siklus */
}

const bagian = [];
if (berbahaya.length) bagian.push(`BERKAS: ${berbahaya.join(", ")}`);
if (rahasia.length) bagian.push(`ISI BERBENTUK RAHASIA: ${rahasia.join(", ")}`);

process.stdout.write(
  JSON.stringify({
    decision: "block",
    reason:
      `BERHENTI - ada yang ter-stage untuk commit dan repo ini PUBLIK.\n\n` +
      bagian.join("\n") +
      `\n\nPeriksa dengan \`git diff --cached --name-only\` dan ` +
      `\`git diff --cached\`.\n\n` +
      `Yang harus dilakukan:\n` +
      `1. JANGAN commit atau push. Git di proyek ini dipegang USER - ` +
      `sampaikan temuan ini ke user, jangan membereskannya sendiri.\n` +
      `2. Sekali ter-push, riwayat repo publik ini menyimpannya walau ` +
      `commit berikutnya menghapusnya - dan `+
      `push menerbitkan SELURUH branch, bukan cuma commit terakhir.\n` +
      `3. Kalau memang rahasia sungguhan yang sudah pernah ter-push, ` +
      `kredensialnya harus DIROTASI, bukan cuma dihapus dari berkas.\n` +
      `4. Kalau ini alarm palsu (mis. berkas contoh tanpa nilai asli), ` +
      `katakan itu ke user beserta alasannya, lalu lanjutkan.`,
  })
);
