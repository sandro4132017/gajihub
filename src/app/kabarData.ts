import { prisma } from "../lib/prisma";
import type { AuthUser } from "../auth/permissions";

/**
 * Isi panel Notifikasi & Aktivitas (panel kanan yang bisa dibuka-tutup).
 *
 * ATURAN CAKUPAN - ini bagian yang paling menentukan, karena salah di sini
 * berarti membocorkan data unit lain:
 *
 *   KASUBAG_TU  -> HANYA satuan kerjanya sendiri. Baris ber-satuanKerja NULL
 *                  (lintas satker: penanda kendala se-kementerian, kalender
 *                  libur, perubahan role akun) TIDAK ikut - itu bukan urusan
 *                  unit, dan menampilkannya membocorkan keputusan tingkat
 *                  kementerian ke tiap unit.
 *   PEGAWAI     -> tidak dapat panel sama sekali. Aktivitas administratif
 *                  bukan konsumsi pegawai; datanya sendiri sudah ada di /saya.
 *   Lainnya     -> lintas satker (PPABP, OSDMA, PIMPINAN, ADMIN memang
 *                  berwenang lintas unit - lihat cekPpabp/permissions.ts).
 *
 * Cakupannya diambil dari `User.satuanKerja`, kolom yang memang milik
 * KASUBAG_TU. JANGAN memakainya untuk role lain - itu pernah jadi bug nyata
 * yang menciutkan jangkauan PPABP (lihat "Bug akun multi-role kehilangan
 * jangkauan PPABP" di CLAUDE.md).
 *
 * PPABP secara organisasi memang berada DI DALAM Biro Keuangan dan BMN
 * (keterangan user), tapi pekerjaannya memproses pembayaran SELURUH satuan
 * kerja - approval jenjang final, export ADK, rekonsiliasi. Jadi unit asalnya
 * BUKAN batas kewenangannya, dan panel ini tidak boleh mengunci mereka ke
 * Biro Keuangan. Yang disediakan penyaring OPSIONAL (`satkerDiminta`) supaya
 * daftarnya bisa dipersempit tanpa mengubah apa yang boleh mereka lihat.
 */
export interface BarisAktivitas {
  id: string;
  teks: string;
  waktu: Date;
  aktor: string;
  satuanKerja: string | null;
}

export interface BarisNotifikasi {
  id: string;
  teks: string;
  keterangan: string;
  href: string;
  nada: "wait" | "danger";
}

export interface IsiPanelKabar {
  boleh: boolean;
  /**
   * Cakupan yang DIPAKSA kewenangan - null = lintas satker. Tidak bisa
   * dilebarkan oleh pemakai, apa pun yang dikirim kliennya.
   */
  satkerScope: string | null;
  /**
   * Penyempitan yang DIPILIH pemakai lintas satker (mis. PPABP menyaring ke
   * satu unit). Cuma tampilan - tidak menambah maupun mengurangi kewenangan.
   */
  satkerPilih: string | null;
  /** Isi dropdown penyaring. Kosong buat pemakai yang cakupannya sudah dipaksa. */
  daftarSatker: string[];
  notifikasi: BarisNotifikasi[];
  aktivitas: BarisAktivitas[];
}

const KOSONG: IsiPanelKabar = {
  boleh: false,
  satkerScope: null,
  satkerPilih: null,
  daftarSatker: [],
  notifikasi: [],
  aktivitas: [],
};

/** Nama entitas AuditTrail -> kalimat yang bisa dibaca manusia. */
const LABEL_AKSI: Record<string, Record<string, string>> = {
  tukin_calculation: { CREATE: "Menjalankan kalkulasi Tukin", UPDATE: "Memperbarui kalkulasi Tukin" },
  predikat_kinerja: {
    CREATE: "Menambah predikat kinerja",
    UPDATE: "Mengubah predikat kinerja",
    DELETE: "Menghapus predikat kinerja",
  },
  koreksi_presensi_harian: {
    CREATE: "Mengoreksi jam presensi",
    UPDATE: "Mengubah koreksi jam presensi",
    DELETE: "Mencabut koreksi jam presensi",
  },
  kendala_epresensi: { CREATE: "Menandai tanggal kendala e-Presensi", DELETE: "Mencabut penanda kendala" },
  hari_libur_nasional: {
    CREATE: "Menetapkan hari libur nasional",
    UPDATE: "Mengubah hari libur nasional",
    DELETE: "Menghapus hari libur nasional",
  },
  pegawai: { UPDATE: "Memperbarui data pegawai" },
  app_user: { UPDATE: "Mengubah akun/role" },
  uang_makan: { UPDATE: "Memperbarui uang makan" },
  uang_lembur: { UPDATE: "Memperbarui uang lembur" },
  gaji_induk: { CREATE: "Mengunggah gaji induk", UPDATE: "Memperbarui gaji induk" },
  export_adk: { EXPORT: "Mengunduh berkas ADK" },
};

/** ApprovalLog.referensiTipe -> nama domainnya. */
const LABEL_DOMAIN: Record<string, string> = {
  TUKIN: "Tukin",
  UANG_MAKAN: "Uang Makan",
  UANG_LEMBUR: "Uang Lembur",
  BANDING: "Banding",
};

function kalimat(entitas: string, aksi: string): string {
  return LABEL_AKSI[entitas]?.[aksi] ?? `${aksi} pada ${entitas.replace(/_/g, " ")}`;
}

export async function ambilIsiPanelKabar(
  user: AuthUser,
  satkerDiminta?: string | null
): Promise<IsiPanelKabar> {
  if (user.role === "PEGAWAI" || !user.aktif) return KOSONG;

  const satkerScope = user.role === "KASUBAG_TU" ? user.satuanKerja : null;
  // Kasubag TU tanpa unit: lolos guard role tapi tidak cocok dengan satuan
  // kerja manapun. Daripada menampilkan panel kosong tanpa penjelasan (bug
  // lama yang sudah pernah menggigit), panelnya tidak ditawarkan sama sekali.
  if (user.role === "KASUBAG_TU" && !satkerScope) return KOSONG;

  // Penyaring pilihan pemakai HANYA berlaku buat yang cakupannya belum dipaksa.
  // Kalau `satkerScope` sudah terisi, apa pun yang dikirim klien diabaikan -
  // penyaring ini cuma boleh MENYEMPITKAN, tidak pernah melebarkan.
  const satkerPilih = satkerScope ? null : satkerDiminta?.trim() || null;
  const satkerEfektif = satkerScope ?? satkerPilih;

  const filterSatker = satkerEfektif ? { satuanKerja: satkerEfektif } : {};
  const filterPegawai = satkerEfektif ? { pegawai: { satuanKerja: satkerEfektif } } : {};

  const [auditRows, approvalRows, tukinDraft, bandingPending, rekonPerluTangani, satkerRows] = await Promise.all([
    prisma.auditTrail.findMany({
      where: filterSatker,
      orderBy: { timestamp: "desc" },
      take: 12,
    }),
    // Approval TIDAK ada di AuditTrail - jejaknya di ApprovalLog, tabel
    // tersendiri. Kalau tidak digabung di sini, keputusan approval (salah satu
    // aktivitas terpenting) tidak akan pernah muncul di panel.
    //
    // Cakupan unitnya diambil dari satuan kerja PEGAWAI yang di-approve, bukan
    // dari approver-nya - PPABP menyetujui baris Biro Umum itu aktivitas Biro
    // Umum. `referensiId` menunjuk ke baris kalkulasi, jadi unitnya di-resolve
    // setelah query (lihat di bawah).
    prisma.approvalLog.findMany({ orderBy: { timestampAksi: "desc" }, take: 40 }),
    // "Belum diajukan": sudah dihitung tapi masih DRAFT - baris ini tidak akan
    // masuk export ADK sampai disetujui.
    prisma.tukinCalculation.count({ where: { status: "DRAFT", ...filterPegawai } }),
    prisma.banding.count({ where: { status: "DIAJUKAN", ...filterPegawai } }),
    // Rekonsiliasi tidak punya relasi Prisma ke Pegawai (pegawaiId cuma
    // string), jadi TIDAK bisa difilter per satker di query. Untuk Kasubag TU
    // angka ini dilewati saja - lebih baik tidak ditampilkan daripada
    // menampilkan angka lintas unit di panel yang seharusnya ber-scope.
    satkerEfektif
      ? Promise.resolve(0)
      : prisma.reconciliationStatus.count({ where: { status: { in: ["SELISIH", "SANGGAH"] } } }),
    // Isi dropdown penyaring. `groupBy` = GROUP BY sungguhan di database;
    // `findMany({ distinct })` akan menarik ~5.000 baris dulu lalu menyaringnya
    // di aplikasi. Cuma dijalankan buat pemakai lintas satker - yang cakupannya
    // sudah dipaksa tidak punya pilihan buat ditawarkan.
    satkerScope
      ? Promise.resolve([])
      : prisma.pegawai.groupBy({ by: ["satuanKerja"], orderBy: { satuanKerja: "asc" } }),
  ]);

  const notifikasi: BarisNotifikasi[] = [];
  if (tukinDraft > 0) {
    notifikasi.push({
      id: "tukin-draft",
      teks: `${tukinDraft} kalkulasi Tukin belum disetujui`,
      keterangan: "Baris DRAFT tidak akan masuk export ADK sampai disetujui.",
      href: "/tukin",
      nada: "wait",
    });
  }
  if (bandingPending > 0) {
    notifikasi.push({
      id: "banding",
      teks: `${bandingPending} banding menunggu verifikasi`,
      keterangan: "Diajukan pegawai, belum diverifikasi jenjang 1.",
      href: "/kasubag/banding",
      nada: "wait",
    });
  }
  if (rekonPerluTangani > 0) {
    notifikasi.push({
      id: "rekonsiliasi",
      teks: `${rekonPerluTangani} rekonsiliasi perlu ditangani`,
      keterangan: "Ada selisih atau sanggahan yang menahan pembayaran.",
      href: "/ppabp/rekonsiliasi",
      nada: "danger",
    });
  }

  // --- Resolve satuan kerja tiap baris approval ---
  const idTukin = approvalRows.filter((a) => a.referensiTipe === "TUKIN").map((a) => a.referensiId);
  const idUm = approvalRows.filter((a) => a.referensiTipe === "UANG_MAKAN").map((a) => a.referensiId);
  const idUl = approvalRows.filter((a) => a.referensiTipe === "UANG_LEMBUR").map((a) => a.referensiId);
  const [barisTukin, barisUm, barisUl] = await Promise.all([
    idTukin.length
      ? prisma.tukinCalculation.findMany({ where: { id: { in: idTukin } }, select: { id: true, pegawai: { select: { satuanKerja: true, nama: true } } } })
      : Promise.resolve([]),
    idUm.length
      ? prisma.uangMakan.findMany({ where: { id: { in: idUm } }, select: { id: true, pegawai: { select: { satuanKerja: true, nama: true } } } })
      : Promise.resolve([]),
    idUl.length
      ? prisma.uangLembur.findMany({ where: { id: { in: idUl } }, select: { id: true, pegawai: { select: { satuanKerja: true, nama: true } } } })
      : Promise.resolve([]),
  ]);
  const petaRef = new Map<string, { satuanKerja: string | null; nama: string }>();
  for (const b of [...barisTukin, ...barisUm, ...barisUl]) {
    petaRef.set(b.id, { satuanKerja: b.pegawai.satuanKerja, nama: b.pegawai.nama });
  }

  const aktivitasApproval: BarisAktivitas[] = approvalRows
    .map((a) => {
      const ref = petaRef.get(a.referensiId);
      // Baris yang unitnya tidak bisa dipastikan (mis. Banding, yang
      // referensiId-nya menunjuk kalkulasi lain) DIBUANG buat yang ber-scope
      // unit - lebih baik hilang daripada salah unit.
      return {
        id: `apr-${a.id}`,
        teks: `${a.keputusan === "SETUJU" ? "Menyetujui" : a.keputusan === "TOLAK" ? "Menolak" : "Meminta revisi"} ${LABEL_DOMAIN[a.referensiTipe] ?? a.referensiTipe} jenjang ${a.jenjang}${ref ? ` - ${ref.nama}` : ""}`,
        waktu: a.timestampAksi,
        aktor: a.approverNama,
        satuanKerja: ref?.satuanKerja ?? null,
      };
    })
    .filter((a) => (satkerEfektif ? a.satuanKerja === satkerEfektif : true));

  // Nama aktor: satu query untuk semua NIP yang muncul, bukan per baris.
  const nipAktor = [...new Set(auditRows.map((a) => a.aktor))];
  const pegawaiAktor = await prisma.pegawai.findMany({
    where: { nip: { in: nipAktor } },
    select: { nip: true, nama: true },
  });
  const namaAktor = new Map(pegawaiAktor.map((p) => [p.nip, p.nama]));

  const aktivitasAudit: BarisAktivitas[] = auditRows.map((a) => ({
    id: a.id,
    teks: kalimat(a.entitas, a.aksi),
    waktu: a.timestamp,
    aktor: namaAktor.get(a.aktor) ?? (a.aktor === "SYSTEM" ? "Sistem" : a.aktor),
    satuanKerja: a.satuanKerja,
  }));

  return {
    boleh: true,
    satkerScope,
    satkerPilih,
    daftarSatker: satkerRows
      .map((r) => r.satuanKerja)
      .filter((s): s is string => typeof s === "string" && s.length > 0),
    notifikasi,
    // Dua sumber digabung lalu diurutkan ulang - kalau tidak, approval selalu
    // tampil di bawah seluruh baris audit walau kejadiannya paling baru.
    aktivitas: [...aktivitasAudit, ...aktivitasApproval]
      .sort((a, b) => b.waktu.getTime() - a.waktu.getTime())
      .slice(0, 15),
  };
}
