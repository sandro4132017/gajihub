"use server";

// ============================================================================
// KIRIM REKAP UNIT KE PPABP - dan satu-satunya jalan membukanya lagi.
//
// MENGGANTIKAN approval berjenjang per kalkulasi (keputusan user 2026-09-02).
// Lihat src/business-logic/pengirimanUnit.ts untuk alasan lengkapnya.
//
// Dua aksi, dua role, dan sengaja TIDAK simetris:
//   - kirimRekapUnitAction       : Kasubag TU, unitnya sendiri.
//   - kembalikanRekapUnitAction  : PPABP, lintas unit, alasan WAJIB.
// ============================================================================

import { revalidatePath } from "next/cache";
import { prisma } from "../../../lib/prisma";
import { ambilUserSesi } from "../../../auth/getSessionAccount";
import { canKirimRekapUnit, canKembalikanRekapUnit } from "../../../auth/permissions";
import {
  cekBolehKirim,
  statusUnit,
  TABEL_KALKULASI,
  type JenisTabelKalkulasi,
} from "../../../business-logic/pengirimanUnit";

export interface KirimFormState {
  error?: string;
  success?: string;
}

/** Panjang minimal alasan pengembalian - lihat catatan di aksi kembalikan. */
const MINIMAL_ALASAN = 10;

function bacaPeriode(formData: FormData): { bulan: number; tahun: number } | null {
  const bulan = Number(formData.get("bulan"));
  const tahun = Number(formData.get("tahun"));
  if (!Number.isInteger(bulan) || bulan < 1 || bulan > 12) return null;
  if (!Number.isInteger(tahun) || tahun < 2000 || tahun > 2100) return null;
  return { bulan, tahun };
}

export async function kirimRekapUnitAction(
  _prev: KirimFormState,
  formData: FormData
): Promise<KirimFormState> {
  const user = await ambilUserSesi();
  if (!user) return { error: "Sesi tidak ditemukan. Silakan login ulang." };

  const periode = bacaPeriode(formData);
  if (!periode) return { error: "Periode tidak sah." };

  // Satuan kerja diambil dari SESI, bukan dari form. Kalau dibaca dari
  // formData, siapa pun bisa mengirimkan rekap atas nama unit lain lewat
  // DevTools - dan kiriman itu langsung terkunci.
  const satuanKerja = user.satuanKerja;
  if (!satuanKerja) {
    return { error: "Akun ini tidak terikat ke satuan kerja mana pun, jadi tidak bisa mengirim rekap." };
  }
  if (!canKirimRekapUnit(user, satuanKerja)) {
    return { error: "Role kamu tidak berwenang mengirim rekap unit." };
  }

  const kunciPeriode = {
    satuanKerja,
    periodeBulan: periode.bulan,
    periodeTahun: periode.tahun,
  };

  const periodeAktif = { periodeBulan: periode.bulan, periodeTahun: periode.tahun };

  // Pegawai yang dikecualikan periode ini dikeluarkan dari SEMUA hitungan di
  // bawah - pembagi, cacah kalkulasi, dan cacah yang basi. Kalau cuma
  // sebagiannya yang menghormati pengecualian, angkanya tidak akan pernah
  // bertemu dan tombol Kirim tertahan selamanya tanpa sebab yang terlihat.
  const pegawaiIkut = {
    satuanKerja,
    statusPegawai: "AKTIF",
    pengecualian: { none: periodeAktif },
  };
  const pegawaiUnit = { pegawai: pegawaiIkut };

  const [totalPegawai, jumlahKalkulasi, jumlahTanpaPredikat, barisLama] = await Promise.all([
    prisma.pegawai.count({ where: pegawaiIkut }),
    prisma.tukinCalculation.count({ where: { ...periodeAktif, ...pegawaiUnit } }),
    // Kalkulasi yang predikat kinerjanya sudah TIDAK ADA lagi.
    //
    // Dicek di server, bukan cuma mengandalkan hitungan di halaman: halaman
    // menghitungnya dari data yang sudah dimuat, dan antara halaman dirender
    // dan tombol ditekan, orang lain bisa menghapus predikat. Yang paling
    // sering: satu petugas menghapus entri manual sementara Kasubag TU sudah
    // membuka halamannya.
    prisma.tukinCalculation.count({
      where: {
        ...periodeAktif,
        ...pegawaiUnit,
        pegawai: {
          ...pegawaiIkut,
          predikatKinerja: { none: periodeAktif },
        },
      },
    }),
    prisma.pengirimanUnit.findUnique({
      where: { satuanKerja_periodeBulan_periodeTahun: kunciPeriode },
    }),
  ]);

  const status = statusUnit(barisLama);
  // Centang "sudah saya periksa" per TABEL, dibaca dari database - bukan dari
  // form. Yang dikirim browser bisa dikarang; yang menahan pengiriman harus
  // keadaan yang benar-benar tersimpan.
  const verifikasi = await prisma.verifikasiTabelUnit.findMany({
    where: kunciPeriode,
    select: { jenisTabel: true },
  });

  const cek = cekBolehKirim(
    {
      totalPegawai,
      jumlahKalkulasi,
      jumlahBasi: jumlahTanpaPredikat,
      tabelDiverifikasi: verifikasi.map((v) => v.jenisTabel as JenisTabelKalkulasi),
    },
    status
  );
  if (!cek.boleh) return { error: cek.alasan ?? "Belum bisa dikirim." };

  // PERNYATAAN "sudah saya periksa" DICEK DI SERVER JUGA.
  //
  // Tombol yang dinonaktifkan di browser bukan penjagaan - permintaan yang
  // sama bisa dikirim ulang dari DevTools atau dari tab yang sudah lama
  // terbuka. Yang membuat pernyataan ini berarti bukan kotak centangnya,
  // melainkan kenyataan bahwa tanpa itu server menolak - dan bahwa siapa yang
  // menyatakan ikut tercatat di AuditTrail di bawah.
  if (String(formData.get("pernyataan") ?? "") !== "ya") {
    return { error: "Centang dulu pernyataan bahwa rekap unit ini sudah diperiksa." };
  }

  const catatan = String(formData.get("catatan") ?? "").trim();

  // upsert, bukan create: unit yang kirimannya pernah DIKEMBALIKAN sudah
  // punya baris, dan kiriman ulangnya harus menempati baris yang sama -
  // @@unique([satuanKerja, periodeBulan, periodeTahun]) menjamin itu.
  await prisma.pengirimanUnit.upsert({
    where: { satuanKerja_periodeBulan_periodeTahun: kunciPeriode },
    create: {
      ...kunciPeriode,
      status: "TERKIRIM",
      jumlahPegawai: totalPegawai,
      jumlahKalkulasi,
      catatanPengirim: catatan === "" ? null : catatan,
      dikirimOlehId: user.id,
    },
    update: {
      status: "TERKIRIM",
      jumlahPegawai: totalPegawai,
      jumlahKalkulasi,
      catatanPengirim: catatan === "" ? null : catatan,
      dikirimOlehId: user.id,
      dikirimPada: new Date(),
      // Jejak pengembalian sebelumnya dibersihkan supaya tampilan tidak
      // menunjukkan "dikembalikan karena X" pada kiriman yang sudah
      // memperbaiki X. Riwayatnya tetap ada di AuditTrail.
      alasanKembali: null,
      dikembalikanOlehId: null,
      dikembalikanPada: null,
    },
  });

  await prisma.auditTrail.create({
    data: {
      entitas: "PengirimanUnit",
      entitasId: `${satuanKerja}|${periode.bulan}|${periode.tahun}`,
      aksi: "KIRIM",
      aktor: user.nip,
      satuanKerja,
      dataSesudah: {
        status: "TERKIRIM",
        jumlahPegawai: totalPegawai,
        jumlahKalkulasi,
        catatanPengirim: catatan === "" ? null : catatan,
        // Bunyi pernyataan yang disetujui ikut disimpan, bukan cuma "true".
        // Kalau redaksinya berubah suatu saat, baris audit lama tetap
        // menunjukkan apa yang SEBENARNYA disetujui waktu itu.
        pernyataan: `Sudah memeriksa presensi, predikat kinerja, dan hasil kalkulasi ${jumlahKalkulasi} pegawai; menyatakan datanya benar untuk dikirim ke PPABP.`,
      },
    },
  });

  revalidatePath("/kasubag");
  revalidatePath("/kasubag/kalkulasi");
  revalidatePath("/ppabp/adk");
  return {
    success: `Rekap ${periode.bulan}/${periode.tahun} terkirim ke PPABP dan sekarang terkunci. Kalau ada yang perlu diperbaiki, minta PPABP mengembalikannya.`,
  };
}

export async function kembalikanRekapUnitAction(
  _prev: KirimFormState,
  formData: FormData
): Promise<KirimFormState> {
  const user = await ambilUserSesi();
  if (!user) return { error: "Sesi tidak ditemukan. Silakan login ulang." };

  const periode = bacaPeriode(formData);
  if (!periode) return { error: "Periode tidak sah." };

  const satuanKerja = String(formData.get("satuanKerja") ?? "").trim();
  if (satuanKerja === "") return { error: "Satuan kerja tidak disebut." };

  if (!canKembalikanRekapUnit(user, satuanKerja)) {
    return { error: "Hanya PPABP yang bisa mengembalikan rekap ke unit." };
  }

  // ALASAN WAJIB, DAN TIDAK BOLEH SEKADAR "salah".
  //
  // Unit tidak punya cara lain mengetahui apa yang harus diperbaiki: mereka
  // melihat kiriman yang tadinya terkunci tiba-tiba terbuka lagi. Alasan
  // kosong mengubah pengembalian jadi teka-teki, dan teka-teki itu dijawab
  // dengan menelepon PPABP - persis pekerjaan yang sistem ini seharusnya
  // hilangkan.
  const alasan = String(formData.get("alasan") ?? "").trim();
  if (alasan.length < MINIMAL_ALASAN) {
    return {
      error: `Sebutkan apa yang harus diperbaiki (minimal ${MINIMAL_ALASAN} karakter). Unit tidak bisa menebaknya sendiri.`,
    };
  }

  const kunciPeriode = {
    satuanKerja,
    periodeBulan: periode.bulan,
    periodeTahun: periode.tahun,
  };

  const baris = await prisma.pengirimanUnit.findUnique({
    where: { satuanKerja_periodeBulan_periodeTahun: kunciPeriode },
  });
  if (!baris) return { error: "Unit ini belum mengirim rekap untuk periode tersebut." };
  if (baris.status !== "TERKIRIM") {
    return { error: "Rekap ini sudah dalam keadaan dikembalikan." };
  }

  await prisma.pengirimanUnit.update({
    where: { satuanKerja_periodeBulan_periodeTahun: kunciPeriode },
    data: {
      status: "DIKEMBALIKAN",
      alasanKembali: alasan,
      dikembalikanOlehId: user.id,
      dikembalikanPada: new Date(),
    },
  });

  await prisma.auditTrail.create({
    data: {
      entitas: "PengirimanUnit",
      entitasId: `${satuanKerja}|${periode.bulan}|${periode.tahun}`,
      aksi: "KEMBALIKAN",
      aktor: user.nip,
      satuanKerja,
      dataSebelum: { status: "TERKIRIM" },
      dataSesudah: { status: "DIKEMBALIKAN", alasanKembali: alasan },
    },
  });

  revalidatePath("/kasubag");
  revalidatePath("/kasubag/kalkulasi");
  revalidatePath("/ppabp/adk");
  return { success: `Rekap ${satuanKerja} periode ${periode.bulan}/${periode.tahun} dikembalikan ke unit.` };
}

// ---------------------------------------------------------------------------
// VERIFIKASI TABEL - "tabel ini sudah saya periksa".
//
// Dipisah dari kirimRekapUnitAction karena memang dua keputusan yang berbeda
// dan berjarak waktu: memeriksa tabel terjadi berkali-kali sambil bekerja,
// mengirim terjadi sekali di akhir. Menyatukannya jadi satu tombol
// mengembalikan keadaan yang mau dihindari - pernyataan sesaat yang tidak
// meninggalkan jejak siapa memeriksa apa.
// ---------------------------------------------------------------------------

export async function setVerifikasiTabelAction(
  _prev: KirimFormState,
  formData: FormData
): Promise<KirimFormState> {
  const user = await ambilUserSesi();
  if (!user) return { error: "Sesi tidak ditemukan. Silakan login ulang." };

  const periode = bacaPeriode(formData);
  if (!periode) return { error: "Periode tidak sah." };

  // Satuan kerja dari SESI, bukan form - alasan yang sama dengan
  // kirimRekapUnitAction di atas.
  const satuanKerja = user.satuanKerja;
  if (!satuanKerja) {
    return { error: "Akun ini tidak terikat ke satuan kerja mana pun." };
  }
  if (!canKirimRekapUnit(user, satuanKerja)) {
    return { error: "Role kamu tidak berwenang memverifikasi tabel unit." };
  }

  const jenisTabel = String(formData.get("jenisTabel") ?? "") as JenisTabelKalkulasi;
  if (!TABEL_KALKULASI.includes(jenisTabel)) {
    return { error: "Jenis tabel tidak dikenali." };
  }
  const centang = String(formData.get("centang") ?? "") === "ya";

  const kunciPeriode = {
    satuanKerja,
    periodeBulan: periode.bulan,
    periodeTahun: periode.tahun,
  };

  // SUDAH TERKIRIM = TERKUNCI, verifikasinya ikut beku. Mencabut centang atas
  // periode yang sudah dikirim tidak menarik kembali kirimannya - yang terjadi
  // cuma catatan pemeriksaan jadi bertentangan dengan apa yang sudah disetor.
  const baris = await prisma.pengirimanUnit.findUnique({
    where: { satuanKerja_periodeBulan_periodeTahun: kunciPeriode },
    select: { status: true, dikirimPada: true, alasanKembali: true },
  });
  if (statusUnit(baris).terkunci) {
    return { error: "Periode ini sudah dikirim dan terkunci - centang pemeriksaan tidak bisa diubah lagi." };
  }

  const sebelum = await prisma.verifikasiTabelUnit.findUnique({
    where: {
      satuanKerja_periodeBulan_periodeTahun_jenisTabel: { ...kunciPeriode, jenisTabel },
    },
    select: { diverifikasiPada: true },
  });

  await prisma.$transaction([
    centang
      ? prisma.verifikasiTabelUnit.upsert({
          where: {
            satuanKerja_periodeBulan_periodeTahun_jenisTabel: { ...kunciPeriode, jenisTabel },
          },
          create: { ...kunciPeriode, jenisTabel, diverifikasiOlehId: user.id },
          update: { diverifikasiOlehId: user.id, diverifikasiPada: new Date() },
        })
      : prisma.verifikasiTabelUnit.deleteMany({
          where: { ...kunciPeriode, jenisTabel },
        }),
    prisma.auditTrail.create({
      data: {
        entitas: "verifikasi_tabel_unit",
        entitasId: `${satuanKerja}-${periode.bulan}-${periode.tahun}-${jenisTabel}`,
        aksi: centang ? "CREATE" : "DELETE",
        aktor: user.nip,
        satuanKerja,
        dataSebelum: sebelum ? { diverifikasiPada: sebelum.diverifikasiPada.toISOString() } : undefined,
        dataSesudah: {
          jenisTabel,
          periode: `${periode.bulan}/${periode.tahun}`,
          // MENCABUT centang ikut dicatat, bukan cuma memasangnya. Kalau suatu
          // saat ditanya "kenapa periode ini sempat tertahan", jawabannya ada
          // di sini.
          tindakan: centang ? "dicentang sudah diperiksa" : "centang dicabut",
        },
      },
    }),
  ]);

  revalidatePath("/kasubag/kalkulasi");
  return { success: centang ? "Ditandai sudah diperiksa." : "Centang dicabut." };
}
