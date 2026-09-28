// ============================================================================
// NIP akun demo - DIBACA DARI BERKAS, tidak lagi ditulis di dalam kode.
//
// KENAPA DIPINDAH (2026-09-28). NIP ke-13 akun demo adalah NIP ASLI pegawai
// Kemnaker, dan dulu tertulis apa adanya di `seedUsers.ts` dan
// `seedSimulasi.ts` - keduanya ikut ter-commit ke repo yang PUBLIK.
//
// Yang membuatnya berat bukan NIP-nya: NIP PNS memang semi-publik, tercantum
// di SK dan pengumuman. Yang berat adalah `seedUsers.ts` sendiri menyebut
// *"Login pakai NIP sebagai username SEKALIGUS password"* - jadi selama jalur
// itu masih hidup, NIP yang terpublikasi setara KREDENSIAL, bukan identitas.
// Aplikasinya memang baru terjangkau lewat jaringan kantor/VPN, tapi
// publikasi subdomain resmi lewat Pusdatik statusnya masih berjalan.
//
// Yang TIDAK berubah: jalur login. Login membaca tabel `User` di database
// (`prisma.user.findUnique({ where: { nip } })`), bukan berkas ini. Seed cuma
// MEMBUAT baris; memindahkan daftarnya tidak menyentuh cara orang masuk.
//
// Perbaikan sesungguhnya tetap mematikan `password = NIP` - lihat TODO di
// `src/auth/session.ts`. Berkas ini menutup kebocorannya, bukan sebabnya.
// ============================================================================

import fs from "node:fs";
import path from "node:path";

const BERKAS = "seed-akun-demo.json";
const CONTOH = "seed-akun-demo.contoh.json";

export type KunciAkunDemo = string;

export interface AkunDemo {
  nip: string;
  nama: string;
}

let peta: Record<string, AkunDemo> | null = null;

function muat(): Record<string, AkunDemo> {
  if (peta) return peta;

  const jalur = path.join(process.cwd(), BERKAS);
  if (!fs.existsSync(jalur)) {
    // Pesannya menyebut CARA MEMPERBAIKINYA, bukan cuma bahwa berkasnya tidak
    // ada. Yang menjalankan seed di mesin baru tidak punya cara menebak bahwa
    // berkas ini sengaja tidak ikut ter-commit.
    throw new Error(
      `${BERKAS} tidak ditemukan di ${process.cwd()}.\n\n` +
        `Berkas ini sengaja TIDAK ikut ter-commit (lihat .gitignore) karena memuat\n` +
        `NIP asli pegawai, dan selama password masih sama dengan NIP, isinya\n` +
        `setara kredensial.\n\n` +
        `Perbaikan: salin ${CONTOH} menjadi ${BERKAS}, lalu isi NIP yang benar.\n` +
        `Minta daftarnya ke pemilik lingkungan - jangan tebak.`
    );
  }

  const isi = JSON.parse(fs.readFileSync(jalur, "utf8")) as Record<string, unknown>;
  const bersih: Record<string, AkunDemo> = {};
  for (const [k, v] of Object.entries(isi)) {
    if (k.startsWith("_")) continue; // baris catatan, bukan data
    if (v && typeof v === "object") {
      const o = v as { nip?: unknown; nama?: unknown };
      if (typeof o.nip === "string") {
        bersih[k] = { nip: o.nip.trim(), nama: typeof o.nama === "string" ? o.nama.trim() : k };
      }
    } else if (typeof v === "string") {
      // Bentuk LAMA (kunci -> NIP saja). Tetap diterima supaya berkas yang
      // sudah telanjur dibuat di mesin lain tidak langsung mematahkan seed.
      bersih[k] = { nip: v.trim(), nama: k };
    }
  }
  peta = bersih;
  return bersih;
}

/**
 * NIP akun demo menurut kunci simboliknya.
 *
 * MELEMPAR kalau kuncinya tidak ada - bukan mengembalikan string kosong.
 * NIP kosong akan lolos sampai ke query Prisma lalu gagal dengan "pegawai
 * tidak ditemukan", dan sebab sesungguhnya (kunci salah ketik) tidak pernah
 * tersebut.
 */
export function nipDemo(kunci: KunciAkunDemo): string {
  return akunDemo(kunci).nip;
}

/**
 * NAMA akun demo - ikut dipindah ke berkas yang sama (2026-09-28).
 *
 * Nama tanpa NIP memang tidak bisa dipakai masuk, tapi ia yang membuat
 * orangnya BISA DIKENALI - dan repo ini publik. Yang dijaga di sini bukan
 * kerahasiaan namanya (nama PNS semi-publik), melainkan pasangannya dengan
 * peran, unit, dan skenario penggajian di seed.
 */
export function namaDemo(kunci: KunciAkunDemo): string {
  return akunDemo(kunci).nama;
}

export function akunDemo(kunci: KunciAkunDemo): AkunDemo {
  const p = muat();
  const akun = p[kunci];
  if (!akun) {
    throw new Error(
      `Kunci akun demo "${kunci}" tidak ada di ${BERKAS}. ` +
        `Kunci yang tersedia: ${Object.keys(p).sort().join(", ")}`
    );
  }
  return akun;
}

/** Seluruh kunci yang terdaftar - dipakai skrip yang mengiterasi semuanya. */
export function kunciAkunDemo(): string[] {
  return Object.keys(muat()).sort();
}
