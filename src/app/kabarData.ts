import { prisma } from "../lib/prisma";
import type { AuthUser } from "../auth/permissions";
import { NAMA_BULAN } from "../lib/format/bulan";
import { ambilDataAman, jelaskanAudit, samarkanAngkaPanjang } from "../lib/kabar/kalimatAudit";
import type { JenisAktivitas } from "../lib/kabar/kalimatAudit";
import {
  gabungBerurutan,
  potongBatasHalaman,
  rekapMenungguProses,
} from "../lib/kabar/gabungAktivitas";
import type { BarisAktivitasMentah, EksporAdk, KursorAktivitas } from "../lib/kabar/gabungAktivitas";
import { hrefAktivitas } from "../lib/kabar/tautanKabar";

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
 *
 * DATA PEGAWAI: teks aktivitas dirangkai dari kunci daftar putih saja (lihat
 * `kalimatAudit.ts`), dan nama pegawai tidak pernah ikut ke respons. Nama
 * yang tampil hanya aktor (pelaku), dengan fallback "Pengguna lain" - bukan NIP.
 */
export interface BarisAktivitas {
  id: string;
  teks: string;
  jenis: JenisAktivitas;
  /** Cacah kejadian yang digabung; 1 = kejadian tunggal. */
  jumlah: number;
  waktu: Date;
  aktor: string;
  satuanKerja: string | null;
  /** null = tidak ada tujuan yang boleh dibuka pemakai ini. */
  href: string | null;
}

export interface BarisNotifikasi {
  id: string;
  teks: string;
  keterangan: string;
  href: string | null;
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
  /** `<iso>_<uuid>` untuk `?sebelum=`; null = tidak ada halaman berikutnya. */
  kursorBerikut: string | null;
}

const KOSONG: IsiPanelKabar = {
  boleh: false,
  satkerScope: null,
  satkerPilih: null,
  daftarSatker: [],
  notifikasi: [],
  aktivitas: [],
  kursorBerikut: null,
};

const UKURAN_BATCH = 60;
const TARGET_GRUP = 15;
const PUTARAN_MAKS = 3;
const NOTIF_REKAP_MAKS = 5;

/** ApprovalLog.referensiTipe -> nama domainnya. */
const LABEL_DOMAIN: Record<string, string> = {
  TUKIN: "Tukin",
  UANG_MAKAN: "Uang Makan",
  UANG_LEMBUR: "Uang Lembur",
  BANDING: "Banding",
};

/** Tahap approval Banding menurut jenjangnya; jenjang lain disebut nomornya. */
const TAHAP_BANDING: Record<number, string> = {
  1: "tahap Kasubag TU",
  2: "tahap OSDMA",
};

function akhiranTahap(referensiTipe: string, jenjang: number): string {
  if (referensiTipe === "BANDING") return TAHAP_BANDING[jenjang] ?? `tahap ke-${jenjang}`;
  return `tahap ke-${jenjang}`;
}

export function tulisKursor(k: KursorAktivitas): string {
  return `${k.waktu.toISOString()}_${k.id}`;
}

/** `<iso>_<uuid>` -> kursor; null bila rusak. */
export function bacaKursor(teks: string): KursorAktivitas | null {
  const i = teks.indexOf("_");
  if (i <= 0) return null;
  const waktu = new Date(teks.slice(0, i));
  const id = teks.slice(i + 1);
  if (Number.isNaN(waktu.getTime()) || id.length === 0 || id.length > 64) return null;
  if (!/^[0-9a-zA-Z-]+$/.test(id)) return null;
  return { waktu, id };
}

interface Cakupan {
  satkerScope: string | null;
  satkerPilih: string | null;
  satkerEfektif: string | null;
}

/** null = pemakai tidak berhak panel ini sama sekali. */
function tentukanCakupan(user: AuthUser, satkerDiminta?: string | null): Cakupan | null {
  if (user.role === "PEGAWAI" || !user.aktif) return null;

  const satkerScope = user.role === "KASUBAG_TU" ? user.satuanKerja : null;
  // Kasubag TU tanpa unit: lolos guard role tapi tidak cocok dengan satuan
  // kerja manapun. Daripada menampilkan panel kosong tanpa penjelasan (bug
  // lama yang sudah pernah menggigit), panelnya tidak ditawarkan sama sekali.
  if (user.role === "KASUBAG_TU" && !satkerScope) return null;

  // Penyaring pilihan pemakai HANYA berlaku buat yang cakupannya belum dipaksa.
  // Kalau `satkerScope` sudah terisi, apa pun yang dikirim klien diabaikan -
  // penyaring ini cuma boleh MENYEMPITKAN, tidak pernah melebarkan.
  const satkerPilih = satkerScope ? null : satkerDiminta?.trim() || null;
  return { satkerScope, satkerPilih, satkerEfektif: satkerScope ?? satkerPilih };
}

// ---------------------------------------------------------------------------
// Notifikasi
// ---------------------------------------------------------------------------

function labelPeriodeKabar(bulan: number, tahun: number): string {
  return `${NAMA_BULAN[bulan - 1] ?? bulan} ${tahun}`;
}

/**
 * Hal yang menunggu TINDAKAN pemakai ini. Isinya per role:
 *   KASUBAG_TU  -> rekap unit yang dikembalikan PPABP, banding baru di unit.
 *   PPABP/ADMIN -> rekap terkirim yang belum diproses, rekonsiliasi tertahan.
 *   OSDMA       -> banding menunggu keputusan final.
 *   PIMPINAN    -> tidak ada.
 */
export async function ambilNotifikasi(
  user: AuthUser,
  satkerEfektif: string | null
): Promise<BarisNotifikasi[]> {
  const hasil: BarisNotifikasi[] = [];
  const filterPegawai = satkerEfektif ? { pegawai: { satuanKerja: satkerEfektif } } : {};

  if (user.role === "KASUBAG_TU") {
    if (!satkerEfektif) return hasil;
    const [dikembalikan, bandingBaru] = await Promise.all([
      prisma.pengirimanUnit.findMany({
        where: { satuanKerja: satkerEfektif, status: "DIKEMBALIKAN" },
        orderBy: { dikembalikanPada: "desc" },
        take: 3,
        select: { periodeBulan: true, periodeTahun: true, alasanKembali: true },
      }),
      prisma.banding.count({ where: { status: "DIAJUKAN", ...filterPegawai } }),
    ]);
    for (const d of dikembalikan) {
      hasil.push({
        id: `kembali-${d.periodeTahun}-${d.periodeBulan}`,
        teks: `Rekap ${labelPeriodeKabar(d.periodeBulan, d.periodeTahun)} dikembalikan PPABP`,
        keterangan: d.alasanKembali
          ? samarkanAngkaPanjang(d.alasanKembali)
          : "Perbaiki datanya lalu kirim ulang.",
        href: `/kasubag/kalkulasi?bulan=${d.periodeBulan}&tahun=${d.periodeTahun}`,
        nada: "danger",
      });
    }
    if (bandingBaru > 0) {
      hasil.push({
        id: "banding",
        teks: `${bandingBaru} banding menunggu verifikasi`,
        keterangan: "Diajukan pegawai, belum diperiksa Kasubag TU.",
        href: "/kasubag/banding",
        nada: "wait",
      });
    }
    return hasil;
  }

  if (user.role === "PPABP" || user.role === "ADMIN") {
    const [terkirim, rekonPerluTangani] = await Promise.all([
      prisma.pengirimanUnit.findMany({
        where: { status: "TERKIRIM", ...(satkerEfektif ? { satuanKerja: satkerEfektif } : {}) },
        orderBy: { dikirimPada: "desc" },
        take: 500,
        select: { satuanKerja: true, periodeBulan: true, periodeTahun: true, dikirimPada: true },
      }),
      // Rekonsiliasi tidak punya relasi Prisma ke Pegawai (pegawaiId cuma
      // string), jadi TIDAK bisa difilter per satker di query. Saat daftar
      // disaring ke satu unit angka ini dilewati - lebih baik tidak tampil
      // daripada menampilkan angka lintas unit di tampilan yang ber-scope.
      satkerEfektif
        ? Promise.resolve(0)
        : prisma.reconciliationStatus.count({ where: { status: { in: ["SELISIH", "SANGGAH"] } } }),
    ]);

    if (terkirim.length > 0) {
      const terlama = terkirim.reduce(
        (min, k) => (k.dikirimPada < min ? k.dikirimPada : min),
        terkirim[0].dikirimPada
      );
      const auditEkspor = await prisma.auditTrail.findMany({
        where: { entitas: "export_adk", aksi: "EXPORT", timestamp: { gte: terlama } },
        select: { entitasId: true, timestamp: true, dataSesudah: true },
      });
      const ekspor: EksporAdk[] = auditEkspor.map((a) => {
        return { entitasId: a.entitasId, satuanKerja: ambilDataAmanSatker(a.dataSesudah), timestamp: a.timestamp };
      });
      const menunggu = rekapMenungguProses(
        terkirim.map((k) => ({
          satuanKerja: k.satuanKerja,
          bulan: k.periodeBulan,
          tahun: k.periodeTahun,
          dikirimPada: k.dikirimPada,
        })),
        ekspor
      );
      for (const m of menunggu.slice(0, NOTIF_REKAP_MAKS)) {
        hasil.push({
          id: `menunggu-${m.tahun}-${m.bulan}`,
          teks: `${m.jumlahUnit} unit menunggu diproses - ${labelPeriodeKabar(m.bulan, m.tahun)}`,
          keterangan: "Rekap sudah dikirim, ADK-nya belum diunduh.",
          href: `/ppabp/adk?bulan=${m.bulan}&tahun=${m.tahun}`,
          nada: "wait",
        });
      }
    }
    if (rekonPerluTangani > 0) {
      hasil.push({
        id: "rekonsiliasi",
        teks: `${rekonPerluTangani} rekonsiliasi perlu ditangani`,
        keterangan: "Ada selisih atau banding yang menahan pembayaran.",
        href: "/ppabp/banding",
        nada: "danger",
      });
    }
    return hasil;
  }

  if (user.role === "OSDMA") {
    const menunggu = await prisma.banding.count({
      where: { status: "MENUNGGU_APPROVAL_FINAL", ...filterPegawai },
    });
    if (menunggu > 0) {
      hasil.push({
        id: "banding-final",
        teks: `${menunggu} banding menunggu keputusan final`,
        keterangan: "Sudah diperiksa Kasubag TU, menunggu keputusan OSDMA.",
        href: "/osdma/banding",
        nada: "wait",
      });
    }
  }
  return hasil;
}

/**
 * `satuanKerja` dari JSON audit export_adk ("semua unit terkirim" atau nama
 * unit). Hanya dipakai di server untuk menghitung status; tidak dikirim ke klien.
 */
function ambilDataAmanSatker(dataSesudah: unknown): string | null {
  if (!dataSesudah || typeof dataSesudah !== "object" || Array.isArray(dataSesudah)) return null;
  const v = (dataSesudah as Record<string, unknown>).satuanKerja;
  return typeof v === "string" ? v : null;
}

/** Jumlah notifikasi untuk badge - tanpa penyaring pilihan pemakai. */
export async function hitungNotifikasiKabar(user: AuthUser): Promise<number | null> {
  const cakupan = tentukanCakupan(user, null);
  if (!cakupan) return null;
  return (await ambilNotifikasi(user, cakupan.satkerEfektif)).length;
}

// ---------------------------------------------------------------------------
// Aktivitas
// ---------------------------------------------------------------------------

function bandingKursor(k: KursorAktivitas | null, kolomWaktu: "timestamp" | "timestampAksi") {
  if (!k) return {};
  return {
    OR: [{ [kolomWaktu]: { lt: k.waktu } }, { [kolomWaktu]: k.waktu, id: { lt: k.id } }],
  };
}

/** a lebih baru dari b (urutan timestamp desc, id desc)? */
function lebihBaru(a: KursorAktivitas, b: KursorAktivitas): boolean {
  const selisih = a.waktu.getTime() - b.waktu.getTime();
  return selisih !== 0 ? selisih > 0 : a.id > b.id;
}

/**
 * Pasangan entitas/aksi yang kalimatnya TIDAK memakai isi JSON, atau yang
 * JSON-nya besar (daftar baris, hasil kalkulasi). Isinya tidak diambil sama
 * sekali dari database.
 */
function perluJson(entitas: string, aksi: string, entitasId: string): boolean {
  if ((entitas === "tukin_calculation" || entitas === "uang_makan" || entitas === "uang_lembur") && aksi === "SYNC") {
    return false;
  }
  if (entitas === "predikat_kinerja" && entitasId.startsWith("hapus-periode-")) return false;
  if (entitas === "pegawai" || entitas === "koreksi_presensi_harian") return false;
  return true;
}

interface AuditRingan {
  id: string;
  entitas: string;
  entitasId: string;
  aksi: string;
  aktor: string;
  satuanKerja: string | null;
  timestamp: Date;
}

async function barisAudit(
  user: AuthUser,
  satkerEfektif: string | null,
  kursor: KursorAktivitas | null
): Promise<{ baris: BarisAktivitasMentah[]; penuh: boolean; tertua: KursorAktivitas | null }> {
  const ringan: AuditRingan[] = await prisma.auditTrail.findMany({
    where: {
      AND: [satkerEfektif ? { satuanKerja: satkerEfektif } : {}, bandingKursor(kursor, "timestamp")],
    },
    orderBy: [{ timestamp: "desc" }, { id: "desc" }],
    take: UKURAN_BATCH,
    select: {
      id: true,
      entitas: true,
      entitasId: true,
      aksi: true,
      aktor: true,
      satuanKerja: true,
      timestamp: true,
    },
  });

  const idPerluJson = ringan.filter((r) => perluJson(r.entitas, r.aksi, r.entitasId)).map((r) => r.id);
  const jsonRows = idPerluJson.length
    ? await prisma.auditTrail.findMany({
        where: { id: { in: idPerluJson } },
        select: { id: true, dataSesudah: true, dataSebelum: true },
      })
    : [];
  const petaJson = new Map(jsonRows.map((j) => [j.id, j]));

  const aktorNama = await petakanAktor(ringan.map((r) => r.aktor));

  const baris: BarisAktivitasMentah[] = ringan.map((r) => {
    const j = petaJson.get(r.id);
    const dataAman = ambilDataAman(j?.dataSesudah, j?.dataSebelum);
    const j2 = jelaskanAudit({ entitas: r.entitas, aksi: r.aksi, entitasId: r.entitasId, dataAman });
    return {
      id: r.id,
      entitas: r.entitas,
      teks: j2.teks,
      jenis: j2.jenis,
      kunciGabung: j2.kunciGabung,
      aktor: aktorNama(r.aktor),
      satuanKerja: r.satuanKerja,
      waktu: r.timestamp,
      href: hrefAktivitas(user, r.entitas, j2.periode, r.satuanKerja, r.aksi),
      periode: j2.periode,
      jenisTabel: j2.jenisTabel,
    };
  });
  const tertua = ringan.length ? { waktu: ringan[ringan.length - 1].timestamp, id: ringan[ringan.length - 1].id } : null;
  return { baris, penuh: ringan.length >= UKURAN_BATCH, tertua };
}

/** Nama aktor: pegawai -> akun -> "Pengguna lain". NIP tidak pernah dikembalikan. */
async function petakanAktor(daftar: string[]): Promise<(aktor: string) => string> {
  const nip = [...new Set(daftar.filter((a) => a !== "SYSTEM"))];
  const nama = new Map<string, string>();
  if (nip.length) {
    const pegawai = await prisma.pegawai.findMany({ where: { nip: { in: nip } }, select: { nip: true, nama: true } });
    for (const p of pegawai) nama.set(p.nip, p.nama);
    const sisa = nip.filter((n) => !nama.has(n));
    if (sisa.length) {
      const akun = await prisma.user.findMany({ where: { nip: { in: sisa } }, select: { nip: true, nama: true } });
      for (const a of akun) nama.set(a.nip, a.nama);
    }
  }
  return (aktor) => (aktor === "SYSTEM" ? "Sistem" : nama.get(aktor) ?? "Pengguna lain");
}

async function barisApproval(
  satkerEfektif: string | null,
  kursor: KursorAktivitas | null
): Promise<{ baris: BarisAktivitasMentah[]; penuh: boolean; tertua: KursorAktivitas | null }> {
  // Approval TIDAK ada di AuditTrail - jejaknya di ApprovalLog, tabel
  // tersendiri. Kalau tidak digabung di sini, keputusan approval (salah satu
  // aktivitas terpenting) tidak akan pernah muncul di panel.
  const rows = await prisma.approvalLog.findMany({
    where: bandingKursor(kursor, "timestampAksi"),
    orderBy: [{ timestampAksi: "desc" }, { id: "desc" }],
    take: UKURAN_BATCH,
    select: {
      id: true,
      referensiTipe: true,
      referensiId: true,
      approverNama: true,
      jenjang: true,
      keputusan: true,
      timestampAksi: true,
    },
  });

  // Cakupan unitnya diambil dari satuan kerja PEGAWAI yang di-approve, bukan
  // dari approver-nya - PPABP menyetujui baris Biro Umum itu aktivitas Biro
  // Umum. `referensiId` menunjuk ke baris yang di-approve.
  const idPer = (tipe: string) => rows.filter((a) => a.referensiTipe === tipe).map((a) => a.referensiId);
  const idTukin = idPer("TUKIN");
  const idUm = idPer("UANG_MAKAN");
  const idUl = idPer("UANG_LEMBUR");
  const idBanding = idPer("BANDING");
  const pilih = { id: true, pegawai: { select: { satuanKerja: true } } } as const;
  const [barisTukin, barisUm, barisUl, barisBanding] = await Promise.all([
    idTukin.length ? prisma.tukinCalculation.findMany({ where: { id: { in: idTukin } }, select: pilih }) : [],
    idUm.length ? prisma.uangMakan.findMany({ where: { id: { in: idUm } }, select: pilih }) : [],
    idUl.length ? prisma.uangLembur.findMany({ where: { id: { in: idUl } }, select: pilih }) : [],
    idBanding.length ? prisma.banding.findMany({ where: { id: { in: idBanding } }, select: pilih }) : [],
  ]);
  const petaUnit = new Map<string, string | null>();
  for (const b of [...barisTukin, ...barisUm, ...barisUl, ...barisBanding]) {
    petaUnit.set(b.id, b.pegawai.satuanKerja);
  }

  const baris: BarisAktivitasMentah[] = [];
  for (const a of rows) {
    const unit = petaUnit.get(a.referensiId) ?? null;
    // Unit yang tidak bisa dipastikan DIBUANG buat tampilan ber-scope unit -
    // lebih baik hilang daripada salah unit.
    if (satkerEfektif && unit !== satkerEfektif) continue;
    const kata = a.keputusan === "SETUJU" ? "Menyetujui" : a.keputusan === "TOLAK" ? "Menolak" : "Meminta revisi";
    baris.push({
      id: a.id,
      entitas: "approval_log",
      teks: `${kata} ${LABEL_DOMAIN[a.referensiTipe] ?? "data"} - ${akhiranTahap(a.referensiTipe, a.jenjang)}`,
      jenis: a.keputusan === "SETUJU" ? "kirim" : a.keputusan === "TOLAK" ? "hapus" : "kembalikan",
      kunciGabung: `approval_log:${a.id}`,
      aktor: a.approverNama,
      satuanKerja: unit,
      waktu: a.timestampAksi,
      href: null,
    });
  }
  const tertua = rows.length ? { waktu: rows[rows.length - 1].timestampAksi, id: rows[rows.length - 1].id } : null;
  return { baris, penuh: rows.length >= UKURAN_BATCH, tertua };
}

/**
 * Satu putaran: ambil satu batch tiap sumber, gabungkan, potong di batas yang
 * pasti lengkap. Sumber yang batch-nya penuh mungkin masih punya baris yang
 * lebih tua dari batch itu; baris sumber lain yang LEBIH TUA dari batas itu
 * tidak boleh dimunculkan dulu, kalau tidak urutan antarhalaman bolong.
 */
async function satuPutaran(
  user: AuthUser,
  satkerEfektif: string | null,
  kursor: KursorAktivitas | null
) {
  const [audit, approval] = await Promise.all([
    barisAudit(user, satkerEfektif, kursor),
    barisApproval(satkerEfektif, kursor),
  ]);

  let batas: KursorAktivitas | null = null;
  for (const s of [audit, approval]) {
    if (s.penuh && s.tertua && (!batas || lebihBaru(s.tertua, batas))) batas = s.tertua;
  }
  const semua = [...audit.baris, ...approval.baris]
    .filter((b) => !batas || !lebihBaru(batas, { waktu: b.waktu, id: b.id }))
    .sort((a, b) => b.waktu.getTime() - a.waktu.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));

  const penuh = audit.penuh || approval.penuh;
  const dipotong = potongBatasHalaman(gabungBerurutan(semua), penuh);
  // Batch penuh tetapi tidak ada baris yang lolos (mis. 60 approval milik unit
  // lain dibuang filter unit): masih ada baris lebih tua yang belum dibaca,
  // jadi kursor tetap maju ke batas yang sudah dilewati.
  if (penuh && dipotong.grup.length === 0 && !dipotong.kursorBerikut && batas) {
    return { grup: [], kursorBerikut: batas };
  }
  return dipotong;
}

export async function ambilHalamanAktivitas(
  user: AuthUser,
  satkerDiminta: string | null | undefined,
  kursor: KursorAktivitas | null
): Promise<{ aktivitas: BarisAktivitas[]; kursorBerikut: string | null } | null> {
  const cakupan = tentukanCakupan(user, satkerDiminta);
  if (!cakupan) return null;

  const grup: BarisAktivitas[] = [];
  let kur = kursor;
  for (let putaran = 0; putaran < PUTARAN_MAKS; putaran += 1) {
    const hasil = await satuPutaran(user, cakupan.satkerEfektif, kur);
    for (const g of hasil.grup) {
      grup.push({
        id: g.id,
        teks: g.teks,
        jenis: g.jenis,
        jumlah: g.jumlah,
        waktu: g.waktu,
        aktor: g.aktor,
        satuanKerja: g.satuanKerja,
        href: g.href,
      });
    }
    kur = hasil.kursorBerikut;
    if (!kur || grup.length >= TARGET_GRUP) break;
  }
  return { aktivitas: grup, kursorBerikut: kur ? tulisKursor(kur) : null };
}

export async function ambilIsiPanelKabar(
  user: AuthUser,
  satkerDiminta?: string | null
): Promise<IsiPanelKabar> {
  const cakupan = tentukanCakupan(user, satkerDiminta);
  if (!cakupan) return KOSONG;
  const { satkerScope, satkerPilih, satkerEfektif } = cakupan;

  const [notifikasi, halaman, satkerRows] = await Promise.all([
    ambilNotifikasi(user, satkerEfektif),
    ambilHalamanAktivitas(user, satkerDiminta, null),
    // Isi dropdown penyaring. `groupBy` = GROUP BY sungguhan di database;
    // `findMany({ distinct })` akan menarik ~5.000 baris dulu lalu menyaringnya
    // di aplikasi. Cuma dijalankan buat pemakai lintas satker - yang cakupannya
    // sudah dipaksa tidak punya pilihan buat ditawarkan.
    satkerScope
      ? Promise.resolve([])
      : prisma.pegawai.groupBy({ by: ["satuanKerja"], orderBy: { satuanKerja: "asc" } }),
  ]);

  return {
    boleh: true,
    satkerScope,
    satkerPilih,
    daftarSatker: satkerRows
      .map((r) => r.satuanKerja)
      .filter((s): s is string => typeof s === "string" && s.length > 0),
    notifikasi,
    aktivitas: halaman?.aktivitas ?? [],
    kursorBerikut: halaman?.kursorBerikut ?? null,
  };
}
