"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../../../../lib/prisma";
import { ambilUserSesi } from "../../../../auth/getSessionAccount";
import { canKelolaHariLibur, type AuthUser } from "../../../../auth/permissions";
import { ambilLiburEpresensi } from "../../../../adapters/liburEpresensi";

export interface HariLiburFormState {
  error?: string;
  sukses?: string;
}

function keAuthUser(u: { nip: string; role: AuthUser["role"]; satuanKerja: string | null; aktif: boolean }): AuthUser {
  return { nip: u.nip, role: u.role, satuanKerja: u.satuanKerja, aktif: u.aktif };
}

/** "2026-06-01" -> Date tengah malam UTC (konvensi PresensiHarian.tanggal). */
function tanggalUtcDariIso(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return null;
  return d;
}

/**
 * Peringatan yang SELALU ikut di pesan sukses. Menandai tanggal TIDAK mengubah
 * angka apa pun sampai presensi periode itu ditarik ulang - sama seperti
 * penanda kendala e-Presensi. Kalau tidak disebutkan, orang menandai lalu
 * mengira selesai, dan angkanya tetap yang lama.
 */
const PERINGATAN_TARIK_ULANG =
  "Angkanya BELUM berubah - tarik ulang presensi periode itu, lalu hitung ulang Tukin/uang makan/lembur supaya berlaku.";

export async function tambahHariLiburAction(
  _state: HariLiburFormState,
  formData: FormData
): Promise<HariLiburFormState> {
  const user = await ambilUserSesi();
  if (!user) return { error: "Sesi login sudah habis - silakan login ulang." };
  if (!canKelolaHariLibur(keAuthUser(user))) {
    return { error: "Kamu tidak berwenang mengelola kalender hari libur nasional." };
  }

  // Menerima SATU tanggal (field "tanggal") ATAU banyak sekaligus (field
  // "tanggalBanyak", dipisah baris/koma/spasi). Yang kedua itu yang membuat
  // menetapkan kalender setahun jadi sekali kerja - kalau harus satu per satu,
  // orang tergoda menarik ulang presensi tiap kali menambah satu tanggal.
  const mentah = [
    String(formData.get("tanggal") ?? ""),
    String(formData.get("tanggalBanyak") ?? ""),
  ]
    .join(" ")
    .split(/[\s,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);

  if (mentah.length === 0) return { error: "Isi minimal satu tanggal." };

  const keterangan = String(formData.get("keterangan") ?? "").trim();
  if (keterangan.length < 3) {
    return { error: 'Keterangan wajib diisi, mis. "Hari Raya Idul Fitri" - ini yang muncul di catatan hasil rekap.' };
  }
  const cutiBersama = formData.get("cutiBersama") === "1";

  const sah: { iso: string; tanggal: Date }[] = [];
  const ditolak: string[] = [];
  for (const iso of mentah) {
    const t = tanggalUtcDariIso(iso);
    if (!t) ditolak.push(`${iso} (format harus YYYY-MM-DD)`);
    else if (sah.some((x) => x.iso === iso)) continue; // duplikat dalam satu kiriman
    else sah.push({ iso, tanggal: t });
  }
  if (sah.length === 0) {
    return { error: `Tidak ada tanggal yang sah. ${ditolak.join("; ")}` };
  }

  const sudahAda = await prisma.hariLiburNasional.findMany({
    where: { tanggal: { in: sah.map((x) => x.tanggal) } },
    select: { tanggal: true, keterangan: true },
  });
  const setSudah = new Set(sudahAda.map((x) => x.tanggal.toISOString().slice(0, 10)));
  const baru = sah.filter((x) => !setSudah.has(x.iso));

  if (baru.length === 0) {
    return { error: `Semua tanggal itu sudah ada di kalender (${[...setSudah].join(", ")}).` };
  }

  await prisma.$transaction([
    prisma.hariLiburNasional.createMany({
      data: baru.map((x) => ({ tanggal: x.tanggal, keterangan, cutiBersama, ditetapkanOlehId: user.id })),
    }),
    prisma.auditTrail.create({
      data: {
        entitas: "hari_libur_nasional",
        entitasId: baru.map((x) => x.iso).join(","),
        aksi: "CREATE",
        aktor: user.nip,
        dataSesudah: {
          tanggal: baru.map((x) => x.iso),
          keterangan,
          cutiBersama,
          sumber: "Kalender hari libur nasional",
        },
      },
    }),
  ]);

  revalidatePath("/tukin/presensi/hari-libur");
  const lewat = setSudah.size > 0 ? ` ${setSudah.size} tanggal dilewati karena sudah ada.` : "";
  const salah = ditolak.length > 0 ? ` Ditolak: ${ditolak.join("; ")}.` : "";
  return {
    sukses:
      `${baru.length} tanggal ditetapkan sebagai "${keterangan}"${baru.length <= 6 ? ` (${baru.map((x) => x.iso).join(", ")})` : ""}.` +
      `${lewat}${salah} ${PERINGATAN_TARIK_ULANG}`,
  };
}

/**
 * Tarik kalender libur dari e-Presensi (tabel `libur`) untuk satu tahun.
 *
 * e-Presensi ternyata SUDAH merawat daftarnya (127 baris, 2022-2026) - lihat
 * catatan lengkap di `adapters/liburEpresensi.ts`. Jadi mengetik ulang satu
 * per satu dari SKB 3 Menteri sebenarnya pekerjaan yang tidak perlu.
 *
 * TIDAK MENIMPA tanggal yang sudah ada di kalender Gajihub. Kalau seseorang
 * sudah membetulkan keterangan sebuah tanggal, impor berikutnya tidak boleh
 * mengembalikannya ke tulisan e-Presensi - dan yang dilewati disebutkan
 * jumlahnya, bukan hilang diam-diam.
 */
export async function imporHariLiburAction(
  _state: HariLiburFormState,
  formData: FormData
): Promise<HariLiburFormState> {
  const user = await ambilUserSesi();
  if (!user) return { error: "Sesi login sudah habis - silakan login ulang." };
  if (!canKelolaHariLibur(keAuthUser(user))) {
    return { error: "Kamu tidak berwenang mengelola kalender hari libur nasional." };
  }

  const tahun = Number(formData.get("tahun"));
  if (!Number.isInteger(tahun) || tahun < 2000 || tahun > 2100) {
    return { error: "Tahun tidak valid." };
  }

  let baris;
  try {
    baris = await ambilLiburEpresensi(tahun);
  } catch (e) {
    // Jaringan ke e-Presensi memang bisa tidak terjangkau (beda segmen /
    // lewat VPN). Sebutkan apa adanya - form manual di bawahnya tetap jalan.
    return {
      error:
        `Gagal menghubungi database e-Presensi: ${e instanceof Error ? e.message : String(e)}. ` +
        "Kalender tetap bisa diisi manual lewat form di bawah.",
    };
  }

  if (baris.length === 0) {
    return { error: `e-Presensi tidak punya satu pun tanggal libur untuk tahun ${tahun}.` };
  }

  const sah = baris
    .map((b) => ({ ...b, tanggal: tanggalUtcDariIso(b.iso) }))
    .filter((b): b is typeof b & { tanggal: Date } => b.tanggal !== null);

  const sudahAda = await prisma.hariLiburNasional.findMany({
    where: { tanggal: { in: sah.map((x) => x.tanggal) } },
    select: { tanggal: true },
  });
  const setSudah = new Set(sudahAda.map((x) => x.tanggal.toISOString().slice(0, 10)));
  const baru = sah.filter((x) => !setSudah.has(x.iso));

  if (baru.length === 0) {
    return {
      error: `Semua ${sah.length} tanggal libur ${tahun} dari e-Presensi sudah ada di kalender - tidak ada yang ditambahkan.`,
    };
  }

  await prisma.$transaction([
    prisma.hariLiburNasional.createMany({
      data: baru.map((x) => ({
        tanggal: x.tanggal,
        keterangan: x.nama,
        cutiBersama: x.cutiBersama,
        ditetapkanOlehId: user.id,
      })),
    }),
    prisma.auditTrail.create({
      data: {
        entitas: "hari_libur_nasional",
        entitasId: `impor-epresensi-${tahun}`,
        aksi: "CREATE",
        aktor: user.nip,
        dataSesudah: {
          tahun,
          ditambahkan: baru.map((x) => `${x.iso} ${x.nama}`),
          dilewatiSudahAda: [...setSudah],
          sumber: "Impor kalender libur dari e-Presensi",
        },
      },
    }),
  ]);

  revalidatePath("/tukin/presensi/hari-libur");
  const lewat = setSudah.size > 0 ? ` ${setSudah.size} tanggal dilewati karena sudah ada di kalender.` : "";
  const jumlahCutiBersama = baru.filter((x) => x.cutiBersama).length;
  // Penamaan cuti bersama di e-Presensi tidak konsisten antar tahun - 2026
  // menulisnya dengan nama hari rayanya. Disebutkan supaya penanda yang kosong
  // tidak dikira kekeliruan sistem.
  const catatanCutiBersama =
    jumlahCutiBersama === 0
      ? ` Tidak ada yang ber-nama "Cuti Bersama" di data ${tahun} - kalau ada tanggal yang sebenarnya cuti bersama, tandai lewat tombol Ubah (perlakuan pembayarannya sama, ini cuma pelaporan).`
      : ` ${jumlahCutiBersama} di antaranya cuti bersama.`;

  return {
    sukses:
      `${baru.length} tanggal libur ${tahun} ditarik dari e-Presensi.${lewat}${catatanCutiBersama} ` +
      PERINGATAN_TARIK_ULANG,
  };
}

/**
 * Ubah keterangan / jenis / tanggal satu baris kalender.
 *
 * Sebelum ini satu-satunya cara membetulkan salah ketik adalah hapus lalu
 * tambah lagi - dua aksi, dua baris AuditTrail, dan tanggalnya sempat hilang
 * dari kalender di antaranya.
 */
export async function ubahHariLiburAction(
  _state: HariLiburFormState,
  formData: FormData
): Promise<HariLiburFormState> {
  const user = await ambilUserSesi();
  if (!user) return { error: "Sesi login sudah habis - silakan login ulang." };
  if (!canKelolaHariLibur(keAuthUser(user))) {
    return { error: "Kamu tidak berwenang mengelola kalender hari libur nasional." };
  }

  const id = String(formData.get("id") ?? "");
  const lama = await prisma.hariLiburNasional.findUnique({ where: { id } });
  if (!lama) return { error: "Baris hari libur itu sudah tidak ada." };

  const isoBaru = String(formData.get("tanggal") ?? "");
  const tanggal = tanggalUtcDariIso(isoBaru);
  if (!tanggal) return { error: "Tanggal tidak valid." };

  const keterangan = String(formData.get("keterangan") ?? "").trim();
  if (keterangan.length < 3) return { error: "Keterangan wajib diisi minimal 3 karakter." };
  const cutiBersama = formData.get("cutiBersama") === "1";

  const isoLama = lama.tanggal.toISOString().slice(0, 10);
  if (isoBaru !== isoLama) {
    const bentrok = await prisma.hariLiburNasional.findUnique({ where: { tanggal } });
    if (bentrok) return { error: `Tanggal ${isoBaru} sudah ada di kalender: "${bentrok.keterangan}".` };
  }

  if (isoBaru === isoLama && keterangan === lama.keterangan && cutiBersama === lama.cutiBersama) {
    return { error: "Tidak ada yang berubah." };
  }

  await prisma.$transaction([
    prisma.hariLiburNasional.update({ where: { id }, data: { tanggal, keterangan, cutiBersama } }),
    prisma.auditTrail.create({
      data: {
        entitas: "hari_libur_nasional",
        entitasId: isoBaru,
        aksi: "UPDATE",
        aktor: user.nip,
        dataSebelum: { tanggal: isoLama, keterangan: lama.keterangan, cutiBersama: lama.cutiBersama },
        dataSesudah: { tanggal: isoBaru, keterangan, cutiBersama, sumber: "Kalender hari libur nasional" },
      },
    }),
  ]);

  revalidatePath("/tukin/presensi/hari-libur");
  // Tanggalnya sendiri berubah = DUA periode ikut terpengaruh, bukan satu.
  const periode =
    isoBaru.slice(0, 7) === isoLama.slice(0, 7) ? isoBaru.slice(0, 7) : `${isoLama.slice(0, 7)} dan ${isoBaru.slice(0, 7)}`;
  return { sukses: `Diubah jadi ${isoBaru} "${keterangan}". Periode terdampak: ${periode}. ${PERINGATAN_TARIK_ULANG}` };
}

export async function hapusHariLiburAction(
  _state: HariLiburFormState,
  formData: FormData
): Promise<HariLiburFormState> {
  const user = await ambilUserSesi();
  if (!user) return { error: "Sesi login sudah habis - silakan login ulang." };
  if (!canKelolaHariLibur(keAuthUser(user))) {
    return { error: "Kamu tidak berwenang mengelola kalender hari libur nasional." };
  }

  const id = String(formData.get("id") ?? "");
  const baris = await prisma.hariLiburNasional.findUnique({ where: { id } });
  if (!baris) return { error: "Baris hari libur itu sudah tidak ada." };

  await prisma.hariLiburNasional.delete({ where: { id } });

  await prisma.auditTrail.create({
    data: {
      entitas: "hari_libur_nasional",
      entitasId: baris.tanggal.toISOString().slice(0, 10),
      aksi: "DELETE",
      aktor: user.nip,
      dataSebelum: {
        tanggal: baris.tanggal.toISOString().slice(0, 10),
        keterangan: baris.keterangan,
        cutiBersama: baris.cutiBersama,
        sumber: "Kalender hari libur nasional",
      },
    },
  });

  revalidatePath("/tukin/presensi/hari-libur");
  return {
    sukses:
      `${baris.tanggal.toISOString().slice(0, 10)} dicabut dari kalender - tanggal itu kembali dihitung sebagai hari kerja biasa. ` +
      PERINGATAN_TARIK_ULANG,
  };
}
