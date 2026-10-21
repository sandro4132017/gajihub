// ============================================================================
// MENANYAKAN KE BSrE: berkas PDF ini tanda tangannya sah atau tidak.
//
// KENAPA ADA DI SINI, bukan di QR. Petunjuk teknis Esign Client v2.2.1 butir 7
// menyebut `linkQR` sebagai "link yang akan dituju" - alamat MILIK INSTANSI,
// dan contoh resminya `https://domain.go.id/path-to-pdf`. BSrE tidak punya
// halaman tujuan untuk QR; verifikasi di sisi mereka bentuknya API
// (`/api/sign/verify`). Jadi satu-satunya cara membuat pemindaian QR berujung
// pada jawaban BSrE adalah: QR menunjuk ke halaman kita, dan HALAMAN ITU yang
// bertanya ke BSrE. Itulah yang dikerjakan berkas ini.
//
// HALAMAN VERIFY TERBUKA TANPA LOGIN, dan itu memang maksudnya - siapa pun
// yang memegang dokumen harus bisa memeriksanya. Konsekuensinya setiap
// pemindaian berpotensi memanggil BSrE, jadi hasilnya DISIMPAN SEMENTARA di
// memori: satu dokumen paling banyak sekali panggil per TTL, dan pemindaian
// yang datang berbarengan menumpang satu panggilan yang sama. Tanpa itu,
// menyebar satu tautan ke grup WhatsApp sudah cukup untuk membanjiri Esign
// Client dengan kredensial kita.
//
// Cache-nya SENGAJA di memori, bukan kolom database: tidak ada migrasi, dan
// hasil yang basi ikut hilang sendiri saat proses restart.
// ============================================================================

import fs from "fs/promises";
import path from "path";
import { verifyPdf } from "./esignClient";

/** Berapa lama satu jawaban BSrE dianggap masih berlaku. */
export const TTL_PERIKSA_MENIT = 15;

export type VonisBsre =
  | "VALID"
  | "TIDAK_DISAHKAN"
  | "TANPA_TANDA_TANGAN"
  | "TIDAK_BISA_DIPERIKSA";

export interface HasilPeriksaBsre {
  vonis: VonisBsre;
  /** Kata asli dari BSrE / sebab kegagalan. Ditampilkan apa adanya. */
  keterangan: string | null;
  diperiksaPada: Date;
}

/** `/uploads/tte/<id>/berkas.pdf?v=abc` -> path di disk. */
export function jalurDisk(fileSignedPath: string): string {
  const tanpaQuery = fileSignedPath.split("?")[0];
  const relatif = decodeURIComponent(tanpaQuery).replace(/^\/+/, "");
  return path.join(process.cwd(), "public", relatif);
}

interface Ketergantungan {
  bacaBerkas?: (jalur: string) => Promise<Buffer>;
  verifikasi?: typeof verifyPdf;
  sekarang?: () => number;
}

interface Entri {
  hasil: HasilPeriksaBsre;
  kedaluwarsaPada: number;
}

const cache = new Map<string, Entri>();
const sedangBerjalan = new Map<string, Promise<HasilPeriksaBsre>>();

/** Hanya untuk test. */
export function kosongkanCachePeriksaBsre(): void {
  cache.clear();
  sedangBerjalan.clear();
}

async function jalankan(
  fileSignedPath: string,
  dep: Required<Ketergantungan>
): Promise<HasilPeriksaBsre> {
  const diperiksaPada = new Date(dep.sekarang());
  const jalur = jalurDisk(fileSignedPath);

  let buf: Buffer;
  try {
    buf = await dep.bacaBerkas(jalur);
  } catch {
    // Berkasnya hilang dari disk. Dilaporkan, bukan disembunyikan: dokumen
    // yang tercatat tertandatangani tapi berkasnya tidak ada berarti
    // lampirannya tidak bisa dibuktikan sama sekali.
    return {
      vonis: "TIDAK_BISA_DIPERIKSA",
      keterangan: "Berkas tertandatangani tidak ditemukan di server.",
      diperiksaPada,
    };
  }

  let jawaban: Awaited<ReturnType<typeof verifyPdf>>;
  try {
    jawaban = await dep.verifikasi(buf, path.basename(jalur));
  } catch (err) {
    return {
      vonis: "TIDAK_BISA_DIPERIKSA",
      keterangan: err instanceof Error ? err.message : String(err),
      diperiksaPada,
    };
  }

  // `success` HANYA berarti panggilan API-nya berhasil. Vonis tanda tangannya
  // ada di `summary` - membaca `success` sebagai "sah" membuat dokumen tanpa
  // tanda tangan ikut terbaca sah.
  if (!jawaban.success) {
    return {
      vonis: "TIDAK_BISA_DIPERIKSA",
      keterangan: jawaban.error ?? "Layanan BSrE tidak memberi keterangan.",
      diperiksaPada,
    };
  }

  const ringkas = (jawaban.summary ?? "").toUpperCase();
  if (ringkas === "VALID") {
    return { vonis: "VALID", keterangan: jawaban.notes ?? null, diperiksaPada };
  }
  if (ringkas === "NO_SIGNATURE") {
    return {
      vonis: "TANPA_TANDA_TANGAN",
      keterangan: jawaban.notes ?? null,
      diperiksaPada,
    };
  }
  return {
    vonis: "TIDAK_DISAHKAN",
    keterangan: jawaban.notes ?? ringkas ?? null,
    diperiksaPada,
  };
}

/**
 * Jawaban BSrE untuk satu dokumen, lewat cache.
 *
 * TIDAK PERNAH MELEMPAR - halaman verify dibuka orang luar dari hasil memindai
 * QR, dan layanan BSrE yang sedang mati tidak boleh membuat halamannya gagal
 * terbuka. Kegagalan jadi vonis TIDAK_BISA_DIPERIKSA, bukan error.
 */
export async function periksaKeBsre(
  dokumenId: string,
  fileSignedPath: string,
  ketergantungan: Ketergantungan = {}
): Promise<HasilPeriksaBsre> {
  const dep: Required<Ketergantungan> = {
    bacaBerkas: ketergantungan.bacaBerkas ?? ((j) => fs.readFile(j)),
    verifikasi: ketergantungan.verifikasi ?? verifyPdf,
    sekarang: ketergantungan.sekarang ?? (() => Date.now()),
  };

  const tersimpan = cache.get(dokumenId);
  if (tersimpan && tersimpan.kedaluwarsaPada > dep.sekarang()) {
    return tersimpan.hasil;
  }

  // Pemindaian yang datang berbarengan menumpang satu panggilan yang sama.
  const berjalan = sedangBerjalan.get(dokumenId);
  if (berjalan) return berjalan;

  const janji = jalankan(fileSignedPath, dep)
    .then((hasil) => {
      cache.set(dokumenId, {
        hasil,
        // Jawaban yang gagal disimpan JUGA - kalau tidak, BSrE yang sedang mati
        // justru dipanggil ulang tiap pemindaian.
        kedaluwarsaPada: dep.sekarang() + TTL_PERIKSA_MENIT * 60_000,
      });
      return hasil;
    })
    .finally(() => {
      sedangBerjalan.delete(dokumenId);
    });

  sedangBerjalan.set(dokumenId, janji);
  return janji;
}
