import { LABEL_TABEL_KALKULASI } from "../../business-logic/pengirimanUnit";
import type { JenisTabelKalkulasi } from "../../business-logic/pengirimanUnit";
import { NAMA_BULAN } from "../format/bulan";

/**
 * Menerjemahkan satu baris AuditTrail menjadi kalimat yang bisa dibaca
 * Kasubag TU / PPABP di panel Kabar. MURNI - tanpa prisma, tanpa I/O.
 *
 * Isi `dataSebelum`/`dataSesudah` jejak audit memuat data pegawai (NIP, nama,
 * nominal, rekening, jam presensi). Panel Kabar dibaca banyak role, jadi
 * kalimat HANYA boleh dirangkai dari kunci DAFTAR PUTIH (`KUNCI_AMAN`); kunci
 * lain, termasuk yang baru ditambahkan pemanggil audit di masa depan, jatuh
 * dengan sendirinya.
 */

export type JenisAktivitas =
  | "kirim"
  | "kembalikan"
  | "hapus"
  | "ubah"
  | "unggah"
  | "ekspor"
  | "sistem";

export interface PeriodeAktivitas {
  bulan: number;
  tahun: number;
}

export type NilaiAman = string | number | boolean;
export type DataAman = Record<string, NilaiAman>;

export interface HasilJelaskanAudit {
  teks: string;
  jenis: JenisAktivitas;
  /** Pembeda objek untuk penggabungan baris bersebelahan (tidak ditampilkan). */
  kunciGabung: string;
  periode?: PeriodeAktivitas;
  /** Hanya terisi untuk verifikasi_tabel_unit - dipakai menghitung "N tabel". */
  jenisTabel?: string;
  /** true = pasangan entitas/aksi ini belum punya kalimat khusus. */
  cadangan?: true;
}

/**
 * Kunci yang boleh dibaca dari JSON audit. TIDAK PERNAH masuk: nip, nama,
 * nipTanpaPredikat, honorarium, rekening*, nomorSk, kelasJabatan, jam presensi,
 * hasil kalkulasi. `sumber` ikut dibaca tetapi tidak ditampilkan.
 */
const KUNCI_AMAN: readonly string[] = [
  "periode",
  "jenisTabel",
  "tindakan",
  "jumlahPegawai",
  "jumlahBarisTersimpan",
  "tersimpan",
  "pegawaiBaru",
  "statusDiperbarui",
  "dihitung",
  "tanpaPredikat",
  "jenis",
  "jenisPembayaran",
  "alasanLabel",
  "alasanKembali",
  "keputusanAkhir",
  "mode",
  "role",
  "jenisDokumen",
  "tahun",
  "keterangan",
  "sumber",
];

const BATAS_TEKS = 140;

/**
 * Deret >= 9 digit (NIP 18, NIK 16, nomor rekening) diganti "…", lalu teks
 * dipotong. Alasan pengembalian dan keterangan adalah teks bebas yang ditulis
 * orang; bisa saja berisi NIP yang diketik di dalamnya.
 */
export function samarkanAngkaPanjang(teks: string, maks: number = BATAS_TEKS): string {
  const samar = teks
    .replace(/\d{9,}/g, "…")
    // Deret berpemisah (NIP berspasi, rekening bertitik) yang total digitnya
    // >= 9. Satu jenis pemisah per deret, sehingga tanggal "2026-11-05 14.05"
    // atau "Oktober 2026" tidak ikut tersamarkan.
    .replace(/\d(?: ?\d){8,}/g, "…")
    .replace(/\d(?:\.?\d){8,}/g, "…")
    .replace(/\d(?:-?\d){8,}/g, "…")
    .replace(/\s+/g, " ")
    .trim();
  if (samar.length <= maks) return samar;
  return `${samar.slice(0, Math.max(0, maks - 1)).trimEnd()}…`;
}

/** Ambil kunci daftar putih bertipe skalar dari satu atau beberapa objek JSON. */
export function ambilDataAman(...sumber: unknown[]): DataAman {
  const hasil: DataAman = {};
  for (const s of sumber) {
    if (!s || typeof s !== "object" || Array.isArray(s)) continue;
    const objek = s as Record<string, unknown>;
    for (const kunci of KUNCI_AMAN) {
      if (kunci in hasil) continue;
      const nilai = objek[kunci];
      if (typeof nilai === "string") hasil[kunci] = samarkanAngkaPanjang(nilai);
      else if (typeof nilai === "number" && Number.isFinite(nilai)) hasil[kunci] = nilai;
      else if (typeof nilai === "boolean") hasil[kunci] = nilai;
    }
  }
  return hasil;
}

export function labelPeriode(p: PeriodeAktivitas | undefined): string {
  if (!p) return "";
  const nama = NAMA_BULAN[p.bulan - 1];
  return nama ? `${nama} ${p.tahun}` : "";
}

function periodeValid(bulan: number, tahun: number): PeriodeAktivitas | undefined {
  if (bulan >= 1 && bulan <= 12 && tahun >= 2000 && tahun <= 2100) return { bulan, tahun };
  return undefined;
}

/** "9/2026" -> {9, 2026}. */
function periodeDariGarisMiring(teks: unknown): PeriodeAktivitas | undefined {
  if (typeof teks !== "string") return undefined;
  const m = /^(\d{1,2})\/(\d{4})$/.exec(teks.trim());
  return m ? periodeValid(Number(m[1]), Number(m[2])) : undefined;
}

/** "...-9-2026" (bulan tanpa nol depan) -> {9, 2026}. */
function periodeDariUjung(entitasId: string): PeriodeAktivitas | undefined {
  const m = /-(\d{1,2})-(\d{4})$/.exec(entitasId);
  return m ? periodeValid(Number(m[1]), Number(m[2])) : undefined;
}

/** Dua segmen terakhir "x|9|2026". */
function periodeDariPipa(entitasId: string): PeriodeAktivitas | undefined {
  const bagian = entitasId.split("|");
  if (bagian.length < 3) return undefined;
  return periodeValid(Number(bagian[bagian.length - 2]), Number(bagian[bagian.length - 1]));
}

/** 10 karakter terakhir = tanggal ISO; bagian depannya (NIP) dibuang. */
function tanggalDariUjung(entitasId: string): { iso: string; periode: PeriodeAktivitas } | undefined {
  const iso = entitasId.slice(-10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return undefined;
  const periode = periodeValid(Number(m[2]), Number(m[1]));
  return periode ? { iso, periode } : undefined;
}

function labelTanggal(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return "";
  const nama = NAMA_BULAN[Number(m[2]) - 1];
  return nama ? `${Number(m[3])} ${nama} ${m[1]}` : "";
}

function periodeUmum(entitasId: string, data: DataAman): PeriodeAktivitas | undefined {
  return periodeDariUjung(entitasId) ?? periodeDariGarisMiring(data.periode) ?? periodeDariGarisMiring(entitasId);
}

const LABEL_KEPUTUSAN: Record<string, string> = {
  HOLD_PEMBAYARAN: "tahan pembayaran",
  KOREKSI_SIKLUS_BERIKUTNYA: "koreksi di siklus berikutnya",
};

const VERBA_AKSI: Record<string, string> = {
  CREATE: "Menambah",
  UPDATE: "Mengubah",
  DELETE: "Menghapus",
  SYNC: "Menyinkronkan",
  IMPORT: "Mengimpor",
  EXPORT: "Mengunduh",
  KIRIM: "Mengirim",
  KEMBALIKAN: "Mengembalikan",
};

function jenisDariAksi(aksi: string): JenisAktivitas {
  switch (aksi) {
    case "KIRIM":
      return "kirim";
    case "KEMBALIKAN":
      return "kembalikan";
    case "DELETE":
      return "hapus";
    case "SYNC":
      return "sistem";
    case "IMPORT":
      return "unggah";
    case "EXPORT":
      return "ekspor";
    default:
      return "ubah";
  }
}

/** "PengirimanUnit" / "hari_libur" -> "pengiriman unit" / "hari libur". */
export function rapikanNamaEntitas(entitas: string): string {
  return entitas
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .trim()
    .toLowerCase();
}

function dengan(teks: string, ...sambungan: (string | undefined | false)[]): string {
  const tambahan = sambungan.filter((s): s is string => typeof s === "string" && s !== "");
  return tambahan.length ? `${teks} ${tambahan.join(" ")}` : teks;
}

function teksString(v: NilaiAman | undefined): string | undefined {
  return typeof v === "string" && v !== "" ? v : undefined;
}

export function jelaskanAudit(p: {
  entitas: string;
  aksi: string;
  entitasId: string;
  dataAman: DataAman;
}): HasilJelaskanAudit {
  const { entitas, aksi, entitasId, dataAman: d } = p;
  const dasar = (teks: string, jenis: JenisAktivitas, periode?: PeriodeAktivitas, kunciObjek?: string): HasilJelaskanAudit => ({
    teks,
    jenis,
    periode,
    kunciGabung: `${entitas}:${aksi}:${kunciObjek ?? (periode ? `${periode.bulan}/${periode.tahun}` : entitasId)}`,
  });

  switch (entitas) {
    case "PengirimanUnit": {
      const periode = periodeDariPipa(entitasId);
      const lp = labelPeriode(periode);
      if (aksi === "KIRIM") return dasar(dengan("Mengirim rekap", lp, "ke PPABP"), "kirim", periode);
      if (aksi === "KEMBALIKAN") {
        const alasan = teksString(d.alasanKembali);
        const kalimat = dengan("Mengembalikan rekap", lp);
        return dasar(alasan ? `${kalimat} - alasan: ${alasan}` : kalimat, "kembalikan", periode);
      }
      break;
    }

    case "verifikasi_tabel_unit": {
      const m = /-(\d{1,2})-(\d{4})-([A-Z_]+)$/.exec(entitasId);
      const periode = m ? periodeValid(Number(m[1]), Number(m[2])) : periodeDariGarisMiring(d.periode);
      const jenisTabel = m?.[3] ?? teksString(d.jenisTabel);
      const label = jenisTabel ? LABEL_TABEL_KALKULASI[jenisTabel as JenisTabelKalkulasi] ?? "tabel rekap" : "tabel rekap";
      const lp = labelPeriode(periode);
      const teks =
        aksi === "DELETE"
          ? dengan("Mencabut centang", label, lp)
          : dengan("Mencentang", label, lp, "sudah diperiksa");
      // Satu kunci untuk CREATE dan DELETE: bolak-balik mencentang dalam satu
      // sesi adalah satu kegiatan "memeriksa tabel rekap".
      return { teks, jenis: "ubah", periode, jenisTabel, kunciGabung: `${entitas}:${periode ? `${periode.bulan}/${periode.tahun}` : entitasId}` };
    }

    case "tukin_calculation": {
      if (aksi === "SYNC") return dasar("Menyinkronkan hasil kalkulasi Tukin", "sistem", undefined, "sistem");
      if (aksi === "CREATE") {
        const periode = periodeUmum(entitasId, d);
        const tanpa = typeof d.tanpaPredikat === "number" && d.tanpaPredikat > 0 ? `(${d.tanpaPredikat} pegawai tanpa predikat kinerja)` : undefined;
        return dasar(dengan("Menjalankan kalkulasi Tukin massal", labelPeriode(periode), tanpa), "ubah", periode);
      }
      return dasar("Memperbarui kalkulasi Tukin", "ubah");
    }

    case "uang_makan":
    case "uang_lembur": {
      const nama = entitas === "uang_makan" ? "uang makan" : "uang lembur";
      if (aksi === "SYNC") return dasar(`Menyinkronkan hasil ${nama}`, "sistem", undefined, "sistem");
      return dasar(`Memperbarui ${nama}`, "ubah");
    }

    case "pegawai":
      if (aksi === "DELETE") return dasar("Menghapus data pegawai", "hapus");
      return dasar("Memperbarui data pegawai", "ubah");

    case "app_user": {
      if (aksi === "CREATE") return dasar("Membuat akun baru", "ubah");
      const role = teksString(d.role);
      return dasar(dengan("Mengubah role akun", role ? `menjadi ${role}` : undefined), "ubah");
    }

    case "sk_grade":
      return aksi === "DELETE" ? dasar("Menghapus SK grading", "hapus") : dasar("Menambah SK grading", "ubah");

    case "sinkronisasi_pegawai": {
      const baru = typeof d.pegawaiBaru === "number" ? `(${d.pegawaiBaru} pegawai baru)` : undefined;
      return dasar(dengan("Menyinkronkan data pegawai dari SIAP", baru), "sistem", undefined, "sistem");
    }

    case "pengecualian_pegawai": {
      const periode = periodeDariPipa(entitasId);
      const lp = labelPeriode(periode);
      if (aksi === "DELETE") return dasar(dengan("Membatalkan pengecualian seorang pegawai", lp), "hapus", periode);
      const alasan = teksString(d.alasanLabel);
      return dasar(dengan("Mengecualikan seorang pegawai dari perhitungan", lp, alasan ? `- ${alasan}` : undefined), "ubah", periode);
    }

    case "rekening_pegawai": {
      const jp = teksString(d.jenisPembayaran);
      return dasar(dengan("Mengunggah data rekening", jp ? `(${jp})` : undefined), "unggah", undefined, "unggah");
    }

    case "reconciliation_status": {
      const keputusan = teksString(d.keputusanAkhir);
      const label = keputusan ? LABEL_KEPUTUSAN[keputusan] ?? undefined : undefined;
      return dasar(dengan("Memutuskan hasil rekonsiliasi", label ? `- ${label}` : undefined), "ubah", undefined, "putuskan");
    }

    case "mode_jaringan": {
      const mode = teksString(d.mode);
      return dasar(dengan("Mengubah mode jaringan", mode ? `menjadi ${mode}` : undefined), "sistem");
    }

    case "identitas_web_gaji":
      return dasar("Mengimpor basis data gaji", "unggah", undefined, "unggah");

    case "dokumen_tte": {
      const periode = periodeDariGarisMiring(d.periode);
      const jenisDok = teksString(d.jenisDokumen);
      return dasar(dengan("Membersihkan draf", jenisDok ?? "dokumen TTE", labelPeriode(periode)), "hapus", periode);
    }

    case "predikat_kinerja": {
      if (aksi === "DELETE" && entitasId.startsWith("hapus-periode-")) {
        const periode = periodeDariUjung(entitasId);
        return dasar(dengan("Menghapus predikat kinerja satu unit", labelPeriode(periode)), "hapus", periode);
      }
      if (aksi === "CREATE") {
        const periodeUnggah = periodeDariGarisMiring(entitasId);
        if (periodeUnggah) {
          return dasar(dengan("Mengunggah predikat kinerja", labelPeriode(periodeUnggah)), "unggah", periodeUnggah);
        }
        return dasar("Menambah predikat kinerja", "ubah");
      }
      if (aksi === "DELETE") return dasar("Menghapus predikat kinerja", "hapus");
      return dasar("Mengubah predikat kinerja", "ubah");
    }

    case "koreksi_presensi_harian": {
      const tgl = tanggalDariUjung(entitasId);
      const periode = tgl?.periode;
      const lp = labelPeriode(periode);
      if (aksi === "DELETE") return dasar(dengan("Mencabut koreksi jam presensi", lp), "hapus", periode);
      if (aksi === "UPDATE") return dasar(dengan("Mengubah koreksi jam presensi", lp), "ubah", periode);
      return dasar(dengan("Mengoreksi jam presensi", lp), "ubah", periode);
    }

    case "kendala_epresensi": {
      const tgl = labelTanggal(entitasId.slice(-10));
      if (aksi === "DELETE") return dasar(dengan("Mencabut penanda kendala e-Presensi", tgl ? `(${tgl})` : undefined), "hapus");
      return dasar(dengan("Menandai tanggal kendala e-Presensi", tgl ? `(${tgl})` : undefined), "ubah");
    }

    case "hari_libur_nasional": {
      const ket = teksString(d.keterangan);
      const sambung = ket ? `- ${ket}` : undefined;
      if (aksi === "DELETE") return dasar(dengan("Menghapus hari libur nasional", sambung), "hapus");
      if (aksi === "UPDATE") return dasar(dengan("Mengubah hari libur nasional", sambung), "ubah");
      return dasar(dengan("Menetapkan hari libur nasional", sambung), "ubah");
    }

    case "gaji_induk":
      return aksi === "UPDATE"
        ? dasar("Memperbarui gaji induk", "ubah")
        : dasar("Mengunggah gaji induk", "unggah", undefined, "unggah");

    case "export_adk": {
      if (aksi !== "EXPORT") break;
      const periode = periodeDariUjung(entitasId);
      const jenisAdk = teksString(d.jenis) ?? entitasId.replace(/-\d{1,2}-\d{4}$/, "").replace(/-/g, " ");
      return dasar(dengan("Mengunduh berkas ADK", jenisAdk, labelPeriode(periode)), "ekspor", periode);
    }
  }

  // Pasangan yang belum dikenal tetap menghasilkan kalimat manusiawi.
  const verba = VERBA_AKSI[aksi] ?? "Mengubah";
  const periode = periodeUmum(entitasId, d);
  const hasil = dasar(
    dengan(`${verba} ${rapikanNamaEntitas(entitas)}`, labelPeriode(periode)),
    jenisDariAksi(aksi),
    periode,
    periode ? undefined : "umum"
  );
  return { ...hasil, cadangan: true };
}
