// ============================================================================
// REKAP PRESENSI BULANAN -> PresensiHarian (bobot 30% Tukin)
//
// Modul ini PURE (tidak ada I/O - lihat "Konvensi kode" di CLAUDE.md).
//
// PENTING - ini BUKAN parser file export e-Presensi. Contoh tarikan
// e-Presensi yang ada ("contoh tarikan data ketidakhadiran presensi.xlsx")
// di-key oleh NAMA PEGAWAI, bukan NIP, dan penulisan namanya tidak konsisten
// antar baris (mis. "Ayla Raffany, S.I.Kom" vs "Ayla Raffany S.I.Kom").
// Memetakan nama itu ke NIP butuh proses rekonsiliasi tersendiri, jadi
// menebak-nebak di sini justru berbahaya: salah orang = salah potong tukin.
//
// Yang dipakai di sini adalah FORMAT TEMPLATE GAJIHUB sendiri, di-key NIP,
// satu baris per pegawai per periode berisi REKAP bulanan (bukan per hari).
// Begitu adapter e-Presensi tersambung, tombol sinkronisasi mengambil alih
// dan template ini jadi jalur cadangan (Pasal 23 Permenaker 15/2024 memang
// mengakui penghitungan manual selama sistem informasi belum jalan).
//
// Kolom template (urutan bebas, header dicocokkan namanya):
//   NIP | Hari Alpha | Tidak Presensi | Menit Terlambat | Menit Pulang Cepat |
//   Menit Meninggalkan Kantor | Tidak Ikut Upacara | Hari Kerja | Hari Hadir |
//   Hari WFO | Hari WFH/WFA | Hari Diklat | Hari Dinas Luar |
//   Jam Lembur | Hari Makan Lembur |
//   Jam Lembur Hari Libur | Hari Makan Lembur Hari Libur
//
// Enam kolom pertama memetakan langsung ke tabel potongan Pasal 13 (lihat
// hitungPotonganKehadiranPersen di tukin.ts). Kolom WFO/WFH/Diklat/Dinas
// Luar dipakai uang makan, dan dua kolom lembur dipakai uang lembur - lihat
// uangMakan.ts & uangLembur.ts.
// ============================================================================

export interface BarisRekapPresensi {
  nip: string;
  jumlahHariAlpha: number;
  jumlahTidakPresensi: number;
  totalMenitTerlambat: number;
  totalMenitPulangCepat: number;
  totalMenitMeninggalkanKantor: number;
  jumlahTidakIkutUpacara: number;
  jumlahHariKerja: number;
  jumlahHariHadir: number;
  // --- Uang makan (SBM 2026 item 22.1) ---
  // Dipecah per status karena tidak semua kehadiran berhak: WFO & WFH/WFA
  // berhak, Diklat & Dinas Keluar TIDAK. Kolom diklat/dinas luar tetap
  // diminta walau tidak dibayar, supaya selisih "hadir vs dibayar" bisa
  // dijelaskan, bukan hilang begitu saja.
  jumlahHariWfo: number;
  jumlahHariWfhWfa: number;
  jumlahHariDiklat: number;
  jumlahHariDinasLuar: number;
  // --- Uang lembur (SBM 2026 item 23.1 & 23.2) ---
  // Dua angka karena dua komponennya beda satuan: uang lembur per JAM, uang
  // makan lembur per HARI (syarat lembur >= 2 jam pada hari itu).
  totalJamLembur: number;
  totalJamLemburHariLibur: number;
  jumlahHariMakanLembur: number;
  jumlahHariMakanLemburHariLibur: number;
}

export interface BarisPresensiDilewati {
  nomorBaris: number;
  nip: string | null;
  alasan: string;
}

export interface HasilParseRekapPresensi {
  error?: string;
  baris: BarisRekapPresensi[];
  dilewati: BarisPresensiDilewati[];
}

/** Nama kolom yang dikenali per field. Dicocokkan case-insensitive & sebagian. */
const PETA_KOLOM: { field: keyof Omit<BarisRekapPresensi, "nip">; kandidat: string[] }[] = [
  { field: "jumlahHariAlpha", kandidat: ["hari alpha", "alpha", "tidak hadir"] },
  { field: "jumlahTidakPresensi", kandidat: ["tidak presensi", "tanpa presensi"] },
  { field: "totalMenitTerlambat", kandidat: ["menit terlambat", "terlambat"] },
  { field: "totalMenitPulangCepat", kandidat: ["menit pulang cepat", "pulang cepat", "pulang awal"] },
  { field: "totalMenitMeninggalkanKantor", kandidat: ["meninggalkan kantor", "keluar kantor"] },
  { field: "jumlahTidakIkutUpacara", kandidat: ["upacara"] },
  { field: "jumlahHariKerja", kandidat: ["hari kerja"] },
  { field: "jumlahHariWfo", kandidat: ["hari wfo", "wfo"] },
  { field: "jumlahHariWfhWfa", kandidat: ["wfh", "wfa"] },
  { field: "jumlahHariDiklat", kandidat: ["diklat"] },
  { field: "jumlahHariDinasLuar", kandidat: ["dinas luar", "dinas keluar"] },
  // Kandidat "hari libur" dicek DULUAN supaya tidak diserobot kolom hari
  // kerja yang namanya lebih pendek ("jam lembur" cocok juga ke "jam lembur
  // hari libur").
  { field: "totalJamLemburHariLibur", kandidat: ["jam lembur hari libur", "lembur hari libur", "lembur libur"] },
  { field: "jumlahHariMakanLemburHariLibur", kandidat: ["makan lembur hari libur", "makan lembur libur"] },
  { field: "totalJamLembur", kandidat: ["jam lembur hari kerja", "jam lembur"] },
  { field: "jumlahHariMakanLembur", kandidat: ["hari makan lembur hari kerja", "hari makan lembur", "makan lembur"] },
  // Ditaruh PALING BAWAH dengan sengaja: kandidat "hadir" cocok juga ke
  // "Hari Hadir", jadi kalau dicek duluan dia bisa menyerobot kolom lain.
  { field: "jumlahHariHadir", kandidat: ["hari hadir"] },
];

function teks(nilai: unknown): string | null {
  if (nilai === null || nilai === undefined) return null;
  const s = String(nilai).replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}

function angka(nilai: unknown): number | null {
  if (nilai === null || nilai === undefined || nilai === "") return 0;
  if (typeof nilai === "number") return Number.isFinite(nilai) ? nilai : null;
  const n = Number(String(nilai).replace(/\./g, "").replace(/,/g, ".").trim());
  return Number.isFinite(n) ? n : null;
}

/** Cari indeks kolom berdasarkan kandidat nama header. -1 kalau tidak ada. */
function cariKolom(header: (string | null)[], kandidat: string[]): number {
  for (const kata of kandidat) {
    const idx = header.findIndex((h) => h?.toLowerCase().includes(kata));
    if (idx >= 0) return idx;
  }
  return -1;
}

export function parseRekapPresensi(matriks: unknown[][]): HasilParseRekapPresensi {
  const idxHeader = matriks.findIndex((baris) =>
    baris.some((sel) => teks(sel)?.toLowerCase() === "nip")
  );
  if (idxHeader < 0) {
    return { baris: [], dilewati: [], error: 'Kolom "NIP" tidak ditemukan - pakai template rekap presensi Gajihub.' };
  }

  const header = matriks[idxHeader].map((s) => teks(s));
  const kolNip = header.findIndex((h) => h?.toLowerCase() === "nip");
  const kolom = PETA_KOLOM.map((k) => ({ ...k, idx: cariKolom(header, k.kandidat) }));

  const tidakKetemu = kolom.filter((k) => k.idx < 0);
  if (tidakKetemu.length === kolom.length) {
    return {
      baris: [],
      dilewati: [],
      error: "Tidak ada satupun kolom rekap yang dikenali - pastikan header file memakai nama kolom template.",
    };
  }

  const baris: BarisRekapPresensi[] = [];
  const dilewati: BarisPresensiDilewati[] = [];

  for (let i = idxHeader + 1; i < matriks.length; i++) {
    const row = matriks[i];
    const nomorBaris = i + 1;
    if (!row.some((sel) => teks(sel) !== null)) continue; // baris kosong

    const nip = teks(row[kolNip]);
    if (!nip) {
      dilewati.push({ nomorBaris, nip: null, alasan: "kolom NIP kosong" });
      continue;
    }

    const nilai: Record<string, number> = {};
    let gagal: string | null = null;
    for (const k of kolom) {
      // Kolom yang tidak ada di file dianggap 0 - supaya satker yang belum
      // mencatat, misalnya, menit meninggalkan kantor tetap bisa upload.
      if (k.idx < 0) {
        nilai[k.field] = 0;
        continue;
      }
      const n = angka(row[k.idx]);
      if (n === null) {
        gagal = `kolom "${header[k.idx]}" bukan angka ("${teks(row[k.idx])}")`;
        break;
      }
      if (n < 0) {
        gagal = `kolom "${header[k.idx]}" bernilai negatif (${n})`;
        break;
      }
      nilai[k.field] = n;
    }
    if (gagal) {
      dilewati.push({ nomorBaris, nip, alasan: gagal });
      continue;
    }

    baris.push({
      nip,
      jumlahHariWfo: nilai.jumlahHariWfo,
      jumlahHariWfhWfa: nilai.jumlahHariWfhWfa,
      jumlahHariDiklat: nilai.jumlahHariDiklat,
      jumlahHariDinasLuar: nilai.jumlahHariDinasLuar,
      totalJamLembur: nilai.totalJamLembur,
      totalJamLemburHariLibur: nilai.totalJamLemburHariLibur,
      jumlahHariMakanLembur: nilai.jumlahHariMakanLembur,
      jumlahHariMakanLemburHariLibur: nilai.jumlahHariMakanLemburHariLibur,
      jumlahHariAlpha: nilai.jumlahHariAlpha,
      jumlahTidakPresensi: nilai.jumlahTidakPresensi,
      totalMenitTerlambat: nilai.totalMenitTerlambat,
      totalMenitPulangCepat: nilai.totalMenitPulangCepat,
      totalMenitMeninggalkanKantor: nilai.totalMenitMeninggalkanKantor,
      jumlahTidakIkutUpacara: nilai.jumlahTidakIkutUpacara,
      jumlahHariKerja: nilai.jumlahHariKerja,
      jumlahHariHadir: nilai.jumlahHariHadir,
    });
  }

  return { baris, dilewati };
}
