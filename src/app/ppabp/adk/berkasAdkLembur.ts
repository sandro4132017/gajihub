import { readFile } from "fs/promises";
import path from "path";
import ExcelJS from "exceljs";
import {
  SLOT_TANGGAL_GRID,
  hariDalamBulan,
  akhirPekan,
  susunBarisAdkHarian,
  type PegawaiAdkHarian,
} from "../../../business-logic/adkHarian";

/**
 * Berkas .xlsx ADK Uang Lembur - DIISI KE CETAKAN ASLINYA, tidak dibangun
 * ulang.
 *
 * KENAPA BEGINI, bukan menyusun workbook dari nol seperti `responseAdk.ts`.
 * Pustaka `xlsx` (SheetJS edisi komunitas) MEMBUANG gaya sel saat menulis -
 * diuji langsung: sel yang diberi fill kuning + bold + center kembali sebagai
 * `patternType: "none"` setelah tulis-baca. Jadi warna latar hitam di baris
 * judul, latar oranye di sel petunjuk, perataan tengah, dan warna font di
 * template operator MUSTAHIL ditiru lewat jalur itu.
 *
 * Dengan mengisi cetakannya, tidak ada satu pun gaya yang perlu ditiru -
 * semuanya memang sudah ada di berkasnya dan tidak pernah disentuh.
 *
 * YANG LEBIH PENTING: TEMPLATE ITU PENUH FORMULA, dan formulanya JANGAN
 * ditimpa nilai. Diukur dari berkas aslinya:
 *
 *   C1  = IF(B1="Makan", ..., IF(B1="Lembur", ...))        teks petunjuk
 *   C2  = "Uang_"&B1&"_"&VLOOKUP(B3,ref!...)&"_"&TEXT(B2,"@")   judul berkas
 *   B4  = TEXT(EOMONTH(DATE(B2,B3,1),0),"D")               kolom "Batas"
 *   A6  = IF(B6="","",ROW()-5)                             nomor urut
 *   AI6 = E6+F6+G6+...                                     jam hari KERJA
 *   AJ6 = D6+I6+J6+...                                     jam hari LIBUR
 *
 * Jadi "Batas" tidak pernah diisi siapa pun - ia menghitung sendiri dari
 * Tahun & Bulan. Yang ditulis modul ini cuma B1/B2/B3, nomor tanggal di baris
 * judul, dan barisan pegawainya.
 *
 * SATU-SATUNYA FORMULA YANG DITULIS ULANG: AI & AJ. Di template, daftar
 * kolomnya DIPATOK untuk bulan template itu (Juni 2026) - kolom mana yang
 * akhir pekan berubah tiap bulan, jadi memakainya apa adanya akan
 * menggolongkan jam Juli memakai kalender Juni. Daftarnya disusun ulang dari
 * bulan yang diminta.
 *
 * CETAKANNYA SUDAH DIBERSIHKAN dan ikut ter-commit
 * (`template/adk-lembur.xlsx`): 770 sel data dikosongkan, sheet "pegawai" &
 * "hasil" dibuang isinya, nol nilai berdigit >= 10. Repo ini publik - berkas
 * asli dari operator TIDAK boleh masuk ke dalamnya.
 */

/** Baris pertama data di sheet "depan" (5 baris kepala di atasnya). */
const BARIS_DATA_PERTAMA = 6;
/** Kolom tanggal pertama (D). Tanggal ke-n ada di kolom KOLOM_TANGGAL_1 + n - 1. */
const KOLOM_TANGGAL_1 = 4;
/** Kolom ringkasan: jam hari kerja (AI) & jam hari libur (AJ). */
const KOLOM_JAM_KERJA = KOLOM_TANGGAL_1 + SLOT_TANGGAL_GRID; // 35 = AI
const KOLOM_JAM_LIBUR = KOLOM_JAM_KERJA + 1; // 36 = AJ

const BERKAS_CETAKAN = path.join(
  process.cwd(),
  "src",
  "app",
  "ppabp",
  "adk",
  "template",
  "adk-lembur.xlsx"
);

/** Nomor kolom (1-based) jadi huruf Excel - dipakai menyusun formula AI & AJ. */
function hurufKolom(nomor: number): string {
  let sisa = nomor;
  let huruf = "";
  while (sisa > 0) {
    const mod = (sisa - 1) % 26;
    huruf = String.fromCharCode(65 + mod) + huruf;
    sisa = Math.floor((sisa - mod) / 26);
  }
  return huruf;
}

export async function berkasAdkLemburXlsx(
  pegawai: PegawaiAdkHarian[],
  periodeBulan: number,
  periodeTahun: number
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  // Dibaca ke ArrayBuffer dulu: tipe Buffer Node terbaru tidak cocok langsung
  // dengan tanda tangan `load()` milik exceljs.
  const cetakan = await readFile(BERKAS_CETAKAN);
  await wb.xlsx.load(new Uint8Array(cetakan).buffer as ArrayBuffer);

  const ws = wb.getWorksheet("depan");
  const wh = wb.getWorksheet("hasil");
  if (!ws || !wh) throw new Error("Cetakan ADK Uang Lembur rusak: sheet 'depan' atau 'hasil' tidak ada.");

  // --- Kepala: HANYA tiga sel. Sisanya formula yang mengikuti sendiri ------
  ws.getCell("B1").value = "Lembur";
  ws.getCell("B2").value = periodeTahun;
  ws.getCell("B3").value = periodeBulan;

  // --- Baris judul tanggal: 1..jumlah hari, slot sisanya dikosongkan ------
  // Februari mengisi 28 kolom dan meninggalkan 3 kolom terakhir kosong -
  // sama seperti berkas Juni asli yang membiarkan slot ke-31 kosong.
  const jumlahHari = hariDalamBulan(periodeBulan, periodeTahun);
  for (let slot = 1; slot <= SLOT_TANGGAL_GRID; slot++) {
    ws.getCell(5, KOLOM_TANGGAL_1 + slot - 1).value = slot <= jumlahHari ? slot : null;
  }

  // --- Formula ringkasan, disusun ulang untuk kalender bulan INI ----------
  const kolomKerja: string[] = [];
  const kolomLibur: string[] = [];
  for (let tgl = 1; tgl <= jumlahHari; tgl++) {
    const iso = `${periodeTahun}-${String(periodeBulan).padStart(2, "0")}-${String(tgl).padStart(2, "0")}`;
    (akhirPekan(iso) ? kolomLibur : kolomKerja).push(hurufKolom(KOLOM_TANGGAL_1 + tgl - 1));
  }

  // --- Baris pegawai ------------------------------------------------------
  // Gaya sel diambil dari baris pertama cetakan untuk baris yang melewati
  // jangkauan bertata-rupa (cetakan bergaya sampai baris 524; export lintas
  // unit bisa lebih panjang). Tanpa ini baris ke-520 dan seterusnya keluar
  // tanpa warna maupun lebar yang sama.
  const barisContoh = ws.getRow(BARIS_DATA_PERTAMA);
  for (let i = 0; i < pegawai.length; i++) {
    const nomorBaris = BARIS_DATA_PERTAMA + i;
    const baris = ws.getRow(nomorBaris);
    if (nomorBaris > 524) {
      baris.height = barisContoh.height;
      for (let c = 1; c <= KOLOM_JAM_LIBUR; c++) {
        baris.getCell(c).style = { ...barisContoh.getCell(c).style };
      }
    }

    const p = pegawai[i];
    // Nomor urut TETAP formula, sama seperti cetakan: ia mengosongkan diri
    // sendiri kalau NIP-nya kosong, jadi baris sisa tidak bernomor.
    baris.getCell(1).value = { formula: `IF(B${nomorBaris}="","",ROW()-5)` };
    const selNip = baris.getCell(2);
    selNip.value = p.nip.trim();
    // NIP 18 digit melebihi presisi angka Excel - sebagai angka, tiga digit
    // terakhirnya berubah nol dan barisnya tidak akan ketemu di Web Gaji.
    selNip.numFmt = "@";
    baris.getCell(3).value = p.nama;

    const perTanggal = new Map<number, number>();
    for (const h of p.hari) {
      const jam = Math.round(h.jam ?? 0);
      if (jam <= 0) continue;
      const tgl = Number(h.tanggalIso.slice(8, 10));
      perTanggal.set(tgl, (perTanggal.get(tgl) ?? 0) + jam);
    }
    for (let slot = 1; slot <= SLOT_TANGGAL_GRID; slot++) {
      baris.getCell(KOLOM_TANGGAL_1 + slot - 1).value = perTanggal.get(slot) ?? null;
    }

    // SUM(), bukan rangkaian "+": bulan 31 hari menghasilkan formula panjang,
    // dan sel kosong di rangkaian "+" menghasilkan 0 - bukan galat - jadi
    // dua-duanya benar. SUM lebih pendek dan lebih gampang dibaca operator
    // yang membuka berkasnya.
    baris.getCell(KOLOM_JAM_KERJA).value = kolomKerja.length
      ? { formula: `SUM(${kolomKerja.map((k) => `${k}${nomorBaris}`).join(",")})` }
      : 0;
    baris.getCell(KOLOM_JAM_LIBUR).value = kolomLibur.length
      ? { formula: `SUM(${kolomLibur.map((k) => `${k}${nomorBaris}`).join(",")})` }
      : 0;
    baris.commit?.();
  }

  // --- Sheet "hasil" = muatan yang benar-benar disetor --------------------
  // Isinya WAJIB sama persis dengan berkas .txt, jadi barisnya diambil dari
  // penyusun yang SAMA (`susunBarisAdkHarian`), bukan dari grid di atas.
  const barisHasil = susunBarisAdkHarian(pegawai, { denganJam: true });
  for (let i = 0; i < barisHasil.length; i++) {
    const r = wh.getRow(i + 1);
    const selNip = r.getCell(1);
    selNip.value = barisHasil[i].nip;
    selNip.numFmt = "@";
    r.getCell(2).value = barisHasil[i].tanggalIso;
    r.getCell(3).value = barisHasil[i].jam ?? null;
    r.commit?.();
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
