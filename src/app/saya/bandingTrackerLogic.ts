import { JENIS_BANDING, isReferensiData, labelReferensiBanding } from "../../business-logic/bandingData";

export interface BandingItem {
  id: string;
  pegawaiId: string;
  periodeBulan: number;
  periodeTahun: number;
  referensiTipe: string;
  referensiId: string;
  bagianData: string | null;
  usulanPerbaikan: string | null;
  alasan: string;
  status: string; // "DIAJUKAN" | "MENUNGGU_APPROVAL_FINAL" | "DISETUJUI" | "DITOLAK"
  batasWaktuVerifikasi?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  buktiDukung?: {
    id: string;
    jenisDokumen: string;
    namaFile: string;
    fileUrl: string;
    ukuranBita?: number | null;
  }[];
}

export interface ApprovalLogItem {
  id: string;
  referensiTipe: string;
  referensiId: string;
  approverNip: string;
  approverNama: string;
  approverJabatan: string;
  jenjang: number;
  keputusan: string;
  catatan?: string | null;
  timestampAksi: Date | string;
}

export type StepState = "completed" | "active" | "pending" | "rejected";

export interface TrackerStep {
  key: "PENGAJUAN" | "KASUBAG" | "OSDMA" | "SELESAI";
  nomor: number;
  label: string;
  sublabel: string;
  state: StepState;
  keterangan?: string;
}

export interface TrackerCheckpoint {
  id: string;
  tanggal: Date;
  judul: string;
  uraian: string;
  catatan?: string | null;
  isLatest: boolean;
  isDanger?: boolean;
}

/**
 * Peta singkatan 3 karakter untuk setiap kategori/jenis yang disanggah.
 */
export const KODE_SINGKATAN_BANDING: Record<string, string> = {
  PRESENSI: "PRS",
  UANG_MAKAN: "UMK",
  UANG_LEMBUR: "LBR",
  TUKIN: "TUK",
  DATA_PEGAWAI: "PEG",
  PREDIKAT_KINERJA: "KIN",
};

/**
 * Format nomor tiket sanggahan:
 * [3 huruf singkatan apa yang dibanding]-[tanggal DDMMYYYY]-[3 digit nomor urut]
 * Contoh: PRS-05092026-001, UMK-12052026-001, TUK-15052026-002
 */
export function formatNomorTiket(b: {
  id?: string;
  referensiTipe?: string;
  createdAt?: Date | string | null;
  periodeBulan?: number;
  periodeTahun?: number;
  nomorUrut?: number;
}): string {
  // 1. 3 huruf singkatan apa yang dibanding (PRS, UMK, LBR, TUK, PEG, KIN, atau fallback BND)
  const tipe = (b.referensiTipe ?? "").toUpperCase();
  const singkatan = KODE_SINGKATAN_BANDING[tipe] ?? (tipe.slice(0, 3) || "BND");

  // 2. Tanggal pengajuan (format DDMMYYYY)
  let tanggalStr = "";
  if (b.createdAt) {
    const d = typeof b.createdAt === "string" ? new Date(b.createdAt) : b.createdAt;
    if (!isNaN(d.getTime())) {
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = d.getFullYear();
      tanggalStr = `${dd}${mm}${yyyy}`;
    }
  }

  if (!tanggalStr) {
    const tahun = b.periodeTahun ?? new Date().getFullYear();
    const bulan = String(b.periodeBulan ?? new Date().getMonth() + 1).padStart(2, "0");
    tanggalStr = `01${bulan}${tahun}`;
  }

  // 3. Nomor urut banding 3 digit (001, 002, dst)
  let urutStr = "001";
  if (b.nomorUrut !== undefined) {
    urutStr = String(b.nomorUrut).padStart(3, "0");
  } else if (b.id) {
    let hash = 0;
    for (let i = 0; i < b.id.length; i++) {
      hash = (hash * 31 + b.id.charCodeAt(i)) % 999;
    }
    urutStr = String(Math.abs(hash) + 1).padStart(3, "0");
  }

  return `${singkatan}-${tanggalStr}-${urutStr}`;
}

/**
 * Format tanggal & jam untuk timeline tracking (mis. "Hari ini 09:30", "5 Okt 14:20").
 */
export function formatWaktuTracker(input: Date | string): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (isNaN(d.getTime())) return "-";

  const now = new Date();
  const isSameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  const jam = String(d.getHours()).padStart(2, "0");
  const menit = String(d.getMinutes()).padStart(2, "0");
  const jamMenit = `${jam}:${menit}`;

  if (isSameDay) {
    return `Hari ini ${jamMenit}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();

  if (isYesterday) {
    return `Kemarin ${jamMenit}`;
  }

  const tglBulan = new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
  }).format(d);

  return `${tglBulan} ${jamMenit}`;
}

/**
 * Hitung status 4 tahapan stepper mendatar (landscape).
 */
export function hitungTahapanStepper(
  banding: BandingItem,
  logs: ApprovalLogItem[]
): TrackerStep[] {
  const logKasubag = logs.find((l) => l.jenjang === 1);
  const logOsdma = logs.find((l) => l.jenjang === 2);

  // 1. Pengajuan (selalu selesai jika baris banding ada)
  const step1: TrackerStep = {
    key: "PENGAJUAN",
    nomor: 1,
    label: "Diajukan",
    sublabel: "Pegawai Pengaju",
    state: "completed",
    keterangan: "Banding tercatat di sistem",
  };

  // 2. Verifikasi Kasubag TU Unit
  let step2State: StepState = "pending";
  let step2Ket = "Menunggu pemeriksaan berkas";
  if (logKasubag) {
    if (logKasubag.keputusan === "SETUJU") {
      step2State = "completed";
      step2Ket = "Terverifikasi oleh Kasubag TU";
    } else {
      step2State = "rejected";
      step2Ket = "Ditolak oleh Kasubag TU";
    }
  } else {
    if (banding.status === "DIAJUKAN") {
      step2State = "active";
      step2Ket = "Sedang ditelaah di unit";
    } else if (banding.status === "MENUNGGU_APPROVAL_FINAL" || banding.status === "DISETUJUI") {
      step2State = "completed";
      step2Ket = "Terverifikasi oleh Kasubag TU";
    } else if (banding.status === "DITOLAK") {
      step2State = "rejected";
      step2Ket = "Ditolak";
    }
  }

  const step2: TrackerStep = {
    key: "KASUBAG",
    nomor: 2,
    label: "Verifikasi Unit",
    sublabel: "Kasubag TU",
    state: step2State,
    keterangan: step2Ket,
  };

  // 3. Persetujuan Akhir Biro OSDMA
  let step3State: StepState = "pending";
  let step3Ket = "Menunggu persetujuan pusat";
  if (step2State === "rejected") {
    step3State = "pending";
    step3Ket = "Proses dihentikan";
  } else if (logOsdma) {
    if (logOsdma.keputusan === "SETUJU") {
      step3State = "completed";
      step3Ket = "Disetujui oleh Biro OSDMA";
    } else {
      step3State = "rejected";
      step3Ket = "Ditolak oleh Biro OSDMA";
    }
  } else {
    if (banding.status === "MENUNGGU_APPROVAL_FINAL") {
      step3State = "active";
      step3Ket = "Sedang ditelaah oleh OSDMA";
    } else if (banding.status === "DISETUJUI") {
      step3State = "completed";
      step3Ket = "Disetujui oleh Biro OSDMA";
    } else if (banding.status === "DITOLAK") {
      step3State = "rejected";
      step3Ket = "Ditolak";
    }
  }

  const step3: TrackerStep = {
    key: "OSDMA",
    nomor: 3,
    label: "Persetujuan Akhir",
    sublabel: "Biro OSDMA",
    state: step3State,
    keterangan: step3Ket,
  };

  // 4. Selesai & Pemutakhiran Data Sumber
  let step4State: StepState = "pending";
  let step4Ket = "Sinkronisasi data";
  if (banding.status === "DISETUJUI") {
    step4State = "completed";
    step4Ket = "Sinkronisasi selesai";
  } else if (step2State === "rejected" || step3State === "rejected" || banding.status === "DITOLAK") {
    step4State = "pending";
    step4Ket = "Tidak disetujui";
  }

  const step4: TrackerStep = {
    key: "SELESAI",
    nomor: 4,
    label: "Selesai",
    sublabel: "Data telah diperbarui",
    state: step4State,
    keterangan: step4Ket,
  };

  return [step1, step2, step3, step4];
}

/**
 * Bangun daftar checkpoint timeline riwayat pelacakan (terbaru di atas, seperti SPX tracking).
 */
export function bangunTimelineCheckpoints(
  banding: BandingItem,
  logs: ApprovalLogItem[]
): TrackerCheckpoint[] {
  const points: TrackerCheckpoint[] = [];
  const logKasubag = logs.find((l) => l.jenjang === 1);
  const logOsdma = logs.find((l) => l.jenjang === 2);
  const labelTipe = labelReferensiBanding(banding.referensiTipe);
  const sumber = isReferensiData(banding.referensiTipe)
    ? JENIS_BANDING[banding.referensiTipe].sistemSumber
    : "Gajihub";

  const tglBuat = typeof banding.createdAt === "string" ? new Date(banding.createdAt) : banding.createdAt;
  const tglUbah = typeof banding.updatedAt === "string" ? new Date(banding.updatedAt) : banding.updatedAt;

  // 1. Pengajuan (paling awal dalam kronologi)
  points.push({
    id: "diajukan",
    tanggal: tglBuat,
    judul: "Pengajuan Banding Diterima",
    uraian: `Banding ${labelTipe} periode ${banding.periodeBulan}/${banding.periodeTahun} berhasil dicatat di Gajihub.`,
    isLatest: false,
  });

  // 2. Kasubag TU
  if (logKasubag) {
    const tglKasubag = typeof logKasubag.timestampAksi === "string" ? new Date(logKasubag.timestampAksi) : logKasubag.timestampAksi;
    const isSetuju = logKasubag.keputusan === "SETUJU";
    points.push({
      id: "log-kasubag",
      tanggal: tglKasubag,
      judul: isSetuju ? "Verifikasi Unit Disetujui (Kasubag TU)" : "Banding Ditolak di Tingkat Unit",
      uraian: isSetuju
        ? `Diverifikasi dan disetujui oleh ${logKasubag.approverNama} (${logKasubag.approverJabatan}). Berkas diteruskan ke Biro OSDMA.`
        : `Ditolak pada tahap verifikasi unit oleh ${logKasubag.approverNama} (${logKasubag.approverJabatan}).`,
      catatan: logKasubag.catatan,
      isLatest: false,
      isDanger: !isSetuju,
    });
  } else if (banding.status === "DIAJUKAN") {
    points.push({
      id: "antre-kasubag",
      tanggal: tglBuat,
      judul: "Menunggu Penelaahan Kasubag TU",
      uraian: "Menunggu verifikasi oleh Kasubag TU unit kerja.",
      isLatest: false,
    });
  }

  // 3. OSDMA
  if (logOsdma) {
    const tglOsdma = typeof logOsdma.timestampAksi === "string" ? new Date(logOsdma.timestampAksi) : logOsdma.timestampAksi;
    const isSetuju = logOsdma.keputusan === "SETUJU";
    points.push({
      id: "log-osdma",
      tanggal: tglOsdma,
      judul: isSetuju ? "Persetujuan Akhir Disetujui (Biro OSDMA)" : "Persetujuan Akhir Ditolak (Biro OSDMA)",
      uraian: isSetuju
        ? `Disetujui oleh ${logOsdma.approverNama} (${logOsdma.approverJabatan}). Validasi perubahan data disahkan.`
        : `Ditolak pada persetujuan akhir oleh ${logOsdma.approverNama} (${logOsdma.approverJabatan}).`,
      catatan: logOsdma.catatan,
      isLatest: false,
      isDanger: !isSetuju,
    });
  } else if (banding.status === "MENUNGGU_APPROVAL_FINAL") {
    points.push({
      id: "antre-osdma",
      tanggal: logKasubag ? (typeof logKasubag.timestampAksi === "string" ? new Date(logKasubag.timestampAksi) : logKasubag.timestampAksi) : tglUbah,
      judul: "Menunggu Persetujuan Akhir Biro OSDMA",
      uraian: "Telah disetujui Kasubag TU. Berkas sedang dalam penelaahan akhir oleh Biro OSDMA Pusat.",
      isLatest: false,
    });
  }

  // 4. Selesai
  if (banding.status === "DISETUJUI") {
    points.push({
      id: "selesai-mutakhir",
      tanggal: logOsdma ? (typeof logOsdma.timestampAksi === "string" ? new Date(logOsdma.timestampAksi) : logOsdma.timestampAksi) : tglUbah,
      judul: "Selesai & Data Telah Diperbarui",
      uraian: `Seluruh tahapan banding telah selesai disetujui. Pemutakhiran data pada sistem ${sumber} akan terefleksi pada siklus sinkronisasi berikutnya.`,
      isLatest: false,
    });
  }

  // Urutkan dari TERBARU ke TERLAMA (seperti tracking log Shopee / SPX)
  points.sort((a, b) => b.tanggal.getTime() - a.tanggal.getTime());

  // Tandai checkpoint teratas sebagai `isLatest: true`
  if (points.length > 0) {
    points[0].isLatest = true;
  }

  return points;
}
