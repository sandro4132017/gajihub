"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../../../../lib/prisma";
import { ambilUserSesi } from "../../../../auth/getSessionAccount";
import { canKoreksiJamPresensi, type AuthUser } from "../../../../auth/permissions";
import { tglTampil } from "../../../../lib/format/tanggalTampil";
import { butuhBukti, validasiAlasanKoreksi } from "../../../../business-logic/koreksiPresensi";
import { periksaBuktiKoreksi, tulisBuktiKoreksi } from "../../../../lib/storage/buktiKoreksi";
import { rekapUnitTerkunciUntukTanggal } from "../../../../lib/koreksiPresensiDb";

/**
 * KOREKSI JAM PRESENSI SATU HARI - Pasal 10 ayat (2) Permenaker 15/2024.
 *
 * Alur nyatanya: e-Presensi error -> pegawai memotret dirinya beserta geotag
 * & jam -> dikirim ke Kasubag TU unitnya -> Kasubag TU mengunggah buktinya
 * dan memperbaiki jamnya di sini.
 *
 * Tidak ada syarat "tanggal harus ditandai kendala e-Presensi". Pengamannya,
 * semuanya ditegakkan di bawah:
 *
 * 1. HANYA Kasubag TU unit pegawai (`canKoreksiJamPresensi`) - tanpa bypass
 *    ADMIN/PPABP. Dicek terhadap satuan kerja PEGAWAI YANG DIKOREKSI, bukan
 *    id dari form.
 * 2. Bukti kehadiran wajib PER SISI: buktiMasuk untuk jam masuk, buktiKeluar
 *    untuk jam pulang (opsional untuk jam lembur), alasan minimal 15 karakter, dan pernyataan tanggung jawab.
 * 3. Ditolak kalau rekap unit pada periode tanggal itu sudah TERKIRIM.
 * 4. AuditTrail memuat jam ASLI e-Presensi, nilai sebelum/sesudah, rujukan
 *    bukti, dan pernyataan - angka ketikan manusia tidak bisa menyamar.
 */

export interface KoreksiJamFormState {
  error?: string;
  sukses?: string;
}

function keAuthUser(u: { nip: string; role: AuthUser["role"]; satuanKerja: string | null; aktif: boolean }): AuthUser {
  return { nip: u.nip, role: u.role, satuanKerja: u.satuanKerja, aktif: u.aktif };
}

function tanggalUtcDariIso(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return null;
  return d;
}

/** "07:15" -> timestamp UTC di tanggal itu. Kosong -> null (tidak dikoreksi). */
function waktuDariJam(tanggal: Date, jam: string): Date | null | undefined {
  const teks = jam.trim();
  if (teks === "") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(teks);
  if (!m) return undefined; // penanda "tidak valid"
  const h = Number(m[1]);
  const mnt = Number(m[2]);
  if (h > 23 || mnt > 59) return undefined;
  return new Date(Date.UTC(tanggal.getUTCFullYear(), tanggal.getUTCMonth(), tanggal.getUTCDate(), h, mnt));
}

const jm = (d: Date | null | undefined) =>
  d ? `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}` : null;

export async function koreksiJamPresensiAction(
  _state: KoreksiJamFormState,
  formData: FormData
): Promise<KoreksiJamFormState> {
  const user = await ambilUserSesi();
  if (!user) return { error: "Sesi login sudah habis - silakan login ulang." };
  const authUser = keAuthUser(user);

  const nip = String(formData.get("nip") ?? "").trim();
  const tanggal = tanggalUtcDariIso(String(formData.get("tanggal") ?? ""));
  if (!tanggal) return { error: "Tanggal tidak valid." };
  const tanggalIso = tanggal.toISOString().slice(0, 10);

  const jamMasuk = waktuDariJam(tanggal, String(formData.get("jamMasuk") ?? ""));
  const jamKeluar = waktuDariJam(tanggal, String(formData.get("jamKeluar") ?? ""));
  if (jamMasuk === undefined || jamKeluar === undefined) {
    return { error: "Format jam harus HH:MM, contoh 07:15 atau 16:00." };
  }
  // JAM LEMBUR. Kosong = tidak dikoreksi; "0" SAH dan berbeda artinya -
  // "sudah diperiksa, memang bukan lembur". Karena itu dibaca lewat
  // pemeriksaan string kosong, bukan lewat `Number(...) || null` yang akan
  // menelan nol jadi null tanpa ada yang menyadarinya.
  // Form halaman presensi TIDAK lagi mengirim jam lembur (keputusan user
  // 2026-11-11: lembur ikut hitungan mesin). Kalau kolomnya tidak dikirim,
  // nilai lembur koreksi yang sudah tersimpan DIPERTAHANKAN, bukan dihapus.
  const kirimLembur = formData.has("jamLembur");
  const jamLemburTeks = String(formData.get("jamLembur") ?? "").trim();
  let jamLembur: number | null = null;
  if (jamLemburTeks !== "") {
    const angka = Number(jamLemburTeks);
    if (!Number.isFinite(angka) || angka < 0 || angka > 24) {
      return { error: "Jam lembur harus angka 0-24, atau dikosongkan kalau tidak dikoreksi." };
    }
    if (!Number.isInteger(angka)) {
      return { error: "Jam lembur diisi jam penuh - sisa menit memang tidak dibayar." };
    }
    jamLembur = angka;
  }

  if (jamMasuk === null && jamKeluar === null && jamLembur === null) {
    return { error: "Isi minimal satu kolom - kalau semuanya kosong tidak ada yang dikoreksi." };
  }
  if (jamMasuk && jamKeluar && jamKeluar <= jamMasuk) {
    return { error: "Jam pulang harus lebih lambat dari jam masuk." };
  }

  const alasan = String(formData.get("alasan") ?? "").trim();
  const galatAlasan = validasiAlasanKoreksi(alasan);
  if (galatAlasan) return { error: galatAlasan };

  if (String(formData.get("pernyataan") ?? "") !== "1") {
    return { error: "Centang pernyataan tanggung jawab dulu - koreksi ini atas nama kamu." };
  }

  const pegawai = await prisma.pegawai.findUnique({ where: { nip } });
  if (!pegawai) return { error: "Pegawai tidak ditemukan." };

  // Dicek terhadap satuan kerja pegawai yang disentuh. Hanya Kasubag TU unit itu.
  if (!canKoreksiJamPresensi(authUser, pegawai.satuanKerja ?? "")) {
    return { error: "Koreksi jam presensi hanya boleh dilakukan Kasubag TU unit pegawai ini." };
  }
  const satuanKerja = pegawai.satuanKerja as string; // non-kosong: dijamin canKoreksiJamPresensi

  // Rekap terkirim = angka unit periode itu sudah dibekukan. Periode dari TANGGAL.
  if (await rekapUnitTerkunciUntukTanggal(satuanKerja, tanggal)) {
    return {
      error: "Rekap unit untuk periode tanggal ini sudah dikirim ke PPABP dan terkunci. Koreksi tidak dapat diubah.",
    };
  }

  // Penanda kendala TIDAK menjadi gerbang; dicatat sebagai keterangan audit
  // kalau kebetulan ada.
  const kendala = await prisma.kendalaEpresensi.findFirst({
    where: { tanggal, OR: [{ satuanKerja: null }, { satuanKerja }] },
  });

  const lama = await prisma.koreksiPresensiHarian.findUnique({
    where: { pegawaiId_tanggal: { pegawaiId: pegawai.id, tanggal } },
  });

  // Dua berkas terpisah: bukti absen MASUK dan bukti absen PULANG. Keduanya
  // diperiksa dulu (tanpa menulis apa pun); satu saja salah -> tidak ada yang ditulis.
  const buktiMasuk = await periksaBuktiKoreksi(formData.get("buktiMasuk"));
  if (buktiMasuk.status === "galat") return { error: `Bukti absen masuk: ${buktiMasuk.error}` };
  const buktiKeluar = await periksaBuktiKoreksi(formData.get("buktiKeluar"));
  if (buktiKeluar.status === "galat") return { error: `Bukti absen pulang: ${buktiKeluar.error}` };

  const wajib = butuhBukti(
    { jamMasuk: jm(jamMasuk), jamKeluar: jm(jamKeluar) },
    lama
      ? {
          jamMasuk: jm(lama.jamMasuk),
          jamKeluar: jm(lama.jamKeluar),
          buktiRef: lama.buktiRef,
          buktiRefKeluar: lama.buktiRefKeluar,
        }
      : null
  );
  if (wajib.masuk && buktiMasuk.status !== "siap") {
    return {
      error:
        "Unggah bukti absen masuk (foto/tangkapan layar JPG, PNG, atau PDF, maksimal 2 MB) - wajib untuk koreksi jam masuk.",
    };
  }
  if (wajib.keluar && buktiKeluar.status !== "siap") {
    return {
      error:
        "Unggah bukti absen pulang (foto/tangkapan layar JPG, PNG, atau PDF, maksimal 2 MB) - wajib untuk koreksi jam pulang.",
    };
  }

  const sebelum = await prisma.presensiHarian.findFirst({
    where: { pegawaiId: pegawai.id, tanggal },
    select: { jamMasuk: true, jamKeluar: true, statusKehadiran: true },
  });

  // Berkas ditulis PALING AKHIR, sesudah semua validasi lolos. Bukti lama
  // tidak dihapus dari disk; rujukannya masuk dataSebelum audit.
  const jamLemburSimpan = kirimLembur ? jamLembur : (lama?.jamLembur ?? null);
  let buktiRef: string | null = lama?.buktiRef ?? null;
  let buktiRefKeluar: string | null = lama?.buktiRefKeluar ?? null;
  // Bukti lembur berasal dari jalur Kalkulasi Unit; di sini hanya dipertahankan.
  const buktiRefLembur: string | null = lama?.buktiRefLembur ?? null;
  const gagalSimpan = {
    error: "Bukti gagal disimpan. Coba unggah ulang; kalau masih gagal, hubungi Admin Gajihub.",
  };
  if (buktiMasuk.status === "siap") {
    const kunci = await tulisBuktiKoreksi({
      buffer: buktiMasuk.buffer,
      ekstensi: buktiMasuk.ekstensi,
      satuanKerja,
      tanggal,
      sisi: "masuk",
    });
    if (!kunci) return gagalSimpan;
    buktiRef = kunci;
  }
  if (buktiKeluar.status === "siap") {
    const kunci = await tulisBuktiKoreksi({
      buffer: buktiKeluar.buffer,
      ekstensi: buktiKeluar.ekstensi,
      satuanKerja,
      tanggal,
      sisi: "keluar",
    });
    if (!kunci) return gagalSimpan;
    buktiRefKeluar = kunci;
  }

  await prisma.$transaction([
    prisma.koreksiPresensiHarian.upsert({
      where: { pegawaiId_tanggal: { pegawaiId: pegawai.id, tanggal } },
      create: {
        pegawaiId: pegawai.id,
        tanggal,
        jamMasuk,
        jamKeluar,
        jamLembur: jamLemburSimpan,
        alasan,
        buktiRef,
        buktiRefKeluar,
        buktiRefLembur,
        dikoreksiOlehId: user.id,
      },
      update: { jamMasuk, jamKeluar, jamLembur: jamLemburSimpan, alasan, buktiRef, buktiRefKeluar, buktiRefLembur, dikoreksiOlehId: user.id, dikoreksiPada: new Date() },
    }),
    prisma.auditTrail.create({
      data: {
        entitas: "koreksi_presensi_harian",
        entitasId: `${nip}-${tanggalIso}`,
        aksi: lama ? "UPDATE" : "CREATE",
        aktor: user.nip,
        satuanKerja: pegawai.satuanKerja,
        dataSebelum: {
          // Jam ASLI dari e-Presensi ikut dicatat - inilah yang membedakan
          // "diperbaiki" dari "dikarang".
          jamMasukEpresensi: jm(sebelum?.jamMasuk),
          jamKeluarEpresensi: jm(sebelum?.jamKeluar),
          status: sebelum?.statusKehadiran ?? null,
          ...(lama
            ? {
                koreksiSebelumnya: {
                  jamMasuk: jm(lama.jamMasuk),
                  jamKeluar: jm(lama.jamKeluar),
                  jamLembur: lama.jamLembur,
                  alasan: lama.alasan,
                  buktiRef: lama.buktiRef,
                  buktiRefKeluar: lama.buktiRefKeluar,
                  buktiRefLembur: lama.buktiRefLembur,
                },
              }
            : {}),
        },
        dataSesudah: {
          jamMasuk: jm(jamMasuk),
          jamKeluar: jm(jamKeluar),
          jamLembur: jamLemburSimpan,
          alasan,
          buktiRef,
          buktiRefKeluar,
          buktiRefLembur,
          pernyataanTanggungJawab: true,
          // Keterangan saja: ada tidaknya penanda kendala tidak menentukan
          // boleh/tidaknya koreksi.
          dasarKendala: kendala ? { tanggal: tanggalIso, alasan: kendala.alasan } : null,
          sumber: "Koreksi jam presensi (Pasal 10 ayat (2))",
        },
      },
    }),
  ]);

  revalidatePath(`/tukin/presensi/${nip}`);
  return {
    sukses:
      `Jam ${tglTampil(tanggalIso)} dikoreksi (masuk ${jm(jamMasuk) ?? "tetap"}, pulang ${jm(jamKeluar) ?? "tetap"}). ` +
      // Cara menerapkannya TIDAK diulang di sini - tombolnya berdiri tepat di
      // bawah pesan ini (AjakanTerapkan di KoreksiJamForm).
      "Angkanya belum berubah sampai koreksi diterapkan.",
  };
}

export async function hapusKoreksiJamAction(
  _state: KoreksiJamFormState,
  formData: FormData
): Promise<KoreksiJamFormState> {
  const user = await ambilUserSesi();
  if (!user) return { error: "Sesi login sudah habis - silakan login ulang." };

  const id = String(formData.get("id") ?? "");
  const baris = await prisma.koreksiPresensiHarian.findUnique({
    where: { id },
    include: { pegawai: { select: { nip: true, satuanKerja: true } } },
  });
  if (!baris) return { error: "Koreksi itu sudah tidak ada." };

  if (!canKoreksiJamPresensi(keAuthUser(user), baris.pegawai.satuanKerja ?? "")) {
    return { error: "Koreksi jam presensi hanya boleh dihapus Kasubag TU unit pegawai ini." };
  }
  // Periode dari TANGGAL koreksi, bukan dari form.
  if (await rekapUnitTerkunciUntukTanggal(baris.pegawai.satuanKerja as string, baris.tanggal)) {
    return {
      error: "Rekap unit untuk periode tanggal ini sudah dikirim ke PPABP dan terkunci. Koreksi tidak dapat dihapus.",
    };
  }

  const presensiAsli = await prisma.presensiHarian.findFirst({
    where: { pegawaiId: baris.pegawaiId, tanggal: baris.tanggal },
    select: { jamMasuk: true, jamKeluar: true },
  });

  await prisma.$transaction([
    prisma.koreksiPresensiHarian.delete({ where: { id } }),
    prisma.auditTrail.create({
      data: {
        entitas: "koreksi_presensi_harian",
        entitasId: `${baris.pegawai.nip}-${baris.tanggal.toISOString().slice(0, 10)}`,
        aksi: "DELETE",
        aktor: user.nip,
        satuanKerja: baris.pegawai.satuanKerja,
        // Barisnya sudah tidak ada - ini satu-satunya jejak yang tersisa.
        // Berkas bukti TIDAK dihapus dari disk; rujukannya dicatat di sini.
        dataSebelum: {
          tanggal: baris.tanggal.toISOString().slice(0, 10),
          jamMasuk: jm(baris.jamMasuk),
          jamKeluar: jm(baris.jamKeluar),
          jamLembur: baris.jamLembur,
          alasan: baris.alasan,
          buktiRef: baris.buktiRef,
          buktiRefKeluar: baris.buktiRefKeluar,
          buktiRefLembur: baris.buktiRefLembur,
          jamMasukEpresensi: jm(presensiAsli?.jamMasuk),
          jamKeluarEpresensi: jm(presensiAsli?.jamKeluar),
        },
      },
    }),
  ]);

  revalidatePath(`/tukin/presensi/${baris.pegawai.nip}`);
  return { sukses: "Koreksi dihapus. Jam asli dari e-Presensi berlaku lagi setelah koreksi diterapkan." };
}
