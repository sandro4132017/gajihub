"use server";

// ============================================================================
// Server Action tombol sinkronisasi pegawai di /admin/sistem.
//
// Memakai modul yang SAMA dengan jalur CLI (src/jobs/sinkronPegawaiSiap.ts),
// jadi hasil tombol ini dan `npm run sync:pegawai` tidak bisa berbeda. Pola
// yang sama dengan tombol tarik presensi di /tukin/presensi.
//
// DUA AKSI, dan pemisahannya bukan kerapian tampilan:
//
//   periksa  - membaca SIAP & Gajihub, menyusun daftar perubahan. NOL tulisan.
//   terapkan - menulis.
//
// Sinkronisasi ini MEMINDAHKAN ORANG ANTAR UNIT, dan di Gajihub perpindahan
// unit menyeret seluruh riwayat pembayaran orang itu: tidak satu pun dari
// TukinCalculation, UangMakan, UangLembur, RekapPresensiPeriode, dan
// PresensiHarian menyimpan satuan kerja sendiri - semuanya membacanya dari
// `Pegawai.satuanKerja` saat itu juga. Akibatnya periode yang sudah dikirim &
// dikunci unit lama ikut berpindah, dan orangnya bisa hilang dari berkas ADK
// periode itu tanpa tanda apa pun.
//
// Di terminal, perubahan sebesar itu setidaknya menuntut seseorang mengetik
// perintahnya. Tombol menghilangkan gesekan itu - jadi pratinjaunya yang
// menggantikan: tidak ada yang ditulis sebelum daftarnya dilihat.
// ============================================================================

import { revalidatePath } from "next/cache";
import { prisma } from "../../../lib/prisma";
import { ambilUserSesi } from "../../../auth/getSessionAccount";
import { canKonfigurasiAdapter, type AuthUser } from "../../../auth/permissions";
import {
  periksaSinkronPegawai,
  terapkanSinkronPegawai,
  type HasilSinkronPegawai,
  type RencanaSinkronPegawai,
} from "../../../jobs/sinkronPegawaiSiap";

export interface SyncPegawaiFormState {
  error?: string;
  rencana?: RencanaSinkronPegawai;
  hasil?: HasilSinkronPegawai;
}

/** Sesi + kewenangan. ADMIN saja - ini menyentuh seluruh roster kementerian. */
async function gerbang(): Promise<{ user: AuthUser & { id: string }; error?: undefined } | { error: string; user?: undefined }> {
  const user = await ambilUserSesi();
  if (!user) return { error: "Sesi login sudah habis - silakan login ulang." };
  const authUser: AuthUser = { nip: user.nip, role: user.role, satuanKerja: user.satuanKerja, aktif: user.aktif };
  if (!canKonfigurasiAdapter(authUser)) {
    return { error: "Hanya Admin yang boleh menjalankan sinkronisasi pegawai." };
  }
  return { user: { ...authUser, id: user.id } };
}

/**
 * LANGKAH 1 - periksa. Tidak menulis apa pun ke database Gajihub.
 *
 * SIAP tetap dibaca READ-ONLY seperti di seluruh jalur lain.
 */
export async function periksaSyncPegawaiAction(
  _state: SyncPegawaiFormState,
  _formData: FormData
): Promise<SyncPegawaiFormState> {
  const g = await gerbang();
  if (g.error) return { error: g.error };

  try {
    return { rencana: await periksaSinkronPegawai(prisma) };
  } catch (e) {
    // Kegagalan koneksi SIAP dikatakan apa adanya - paling sering VPN belum
    // tersambung atau instance-nya berganti, dan dua-duanya bukan sesuatu
    // yang bisa ditebak dari pesan "terjadi kesalahan".
    return { error: `Gagal membaca SIAP: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * LANGKAH 2 - terapkan. DI SINI database Gajihub ditulis.
 *
 * Rencana TIDAK dioper dari klien; SIAP dibaca ulang di server. Apa pun yang
 * datang dari browser tidak boleh jadi isi yang ditulis ke database
 * kepegawaian, dan 5.000 baris tidak pantas bolak-balik lewat permintaan HTTP.
 * Yang dikembalikan adalah apa yang BENAR-BENAR terjadi, jadi kalau SIAP
 * sempat berubah di antara dua langkah, selisihnya terlihat - bukan tertutupi
 * angka pratinjau yang sudah basi.
 */
export async function terapkanSyncPegawaiAction(
  _state: SyncPegawaiFormState,
  _formData: FormData
): Promise<SyncPegawaiFormState> {
  const g = await gerbang();
  if (!g.user) return { error: g.error };

  try {
    // ID akun dioper supaya tiap baris Daftar Perubahan Data Kepegawaian
    // menyebut siapa yang menjalankannya. Jalur CLI mengirim null di tempat
    // ini - dan "tidak ada yang bertanggung jawab" lebih jujur daripada
    // menisbatkannya ke akun mana pun.
    const hasil = await terapkanSinkronPegawai(prisma, null, g.user.id);

    // Jejak audit WAJIB di sini. Ini satu-satunya aksi di aplikasi yang bisa
    // mengubah satuan kerja ribuan pegawai sekaligus, dan pertanyaan "siapa
    // yang menjalankan ini, kapan, dan apa akibatnya" harus punya jawaban.
    //
    // satuanKerja NULL: menyentuh seluruh kementerian, jadi memang bukan
    // aktivitas satu unit.
    await prisma.auditTrail.create({
      data: {
        entitas: "sinkronisasi_pegawai",
        entitasId: `siap-${new Date().toISOString().slice(0, 10)}`,
        aksi: "SYNC",
        aktor: g.user.nip,
        satuanKerja: null,
        dataSesudah: {
          sumber: hasil.rencana.sumber,
          tersimpan: hasil.tersimpan,
          pegawaiBaru: hasil.rencana.pegawaiBaru.length,
          statusDiperbarui: hasil.statusDiperbarui,
          gantiKelasJabatan: hasil.rencana.gantiKelasJabatan.length,
          gantiJabatan: hasil.rencana.gantiJabatan.length,
          perubahanTercatat: hasil.perubahanTercatat,
          // Daftar pindah unit disimpan LENGKAP di jejak audit, bukan cuma
          // cacahnya: kalau suatu saat ada yang bertanya kenapa seseorang
          // hilang dari ADK unitnya, jawabannya ada di sini.
          //
          // Dipetakan jadi objek biasa - tipe Json Prisma tidak menerima
          // array of interface apa adanya.
          pindahUnit: hasil.rencana.pindahUnit.map((c) => ({
            nip: c.nip,
            nama: c.nama,
            dari: c.dari,
            ke: c.ke,
          })),
        },
      },
    });

    revalidatePath("/admin/sistem");
    return { hasil };
  } catch (e) {
    return { error: `Sinkronisasi gagal: ${e instanceof Error ? e.message : String(e)}` };
  }
}
