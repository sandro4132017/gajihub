import { getSessionAccount } from "../../../auth/getSessionAccount";
import { ambilHalamanAktivitas, ambilIsiPanelKabar, bacaKursor, hitungNotifikasiKabar } from "../../kabarData";

/**
 * Isi panel Notifikasi & Aktivitas.
 *
 * Route Handler, bukan data yang ikut di-render tiap halaman: panel ini
 * dibuka sesekali, jadi query-nya cuma jalan waktu benar-benar dibutuhkan.
 *
 * Tiga bentuk, semuanya GET:
 *   (tanpa parameter)   isi lengkap panel
 *   ?ringkas=1          { jumlah } notifikasi saja, untuk lencana tombol
 *   ?sebelum=<iso>_<id> halaman aktivitas berikutnya { aktivitas, kursorBerikut }
 *
 * Otorisasi dicek DI SINI juga - fungsi data menolak PEGAWAI & akun
 * nonaktif, dan cakupan satuan kerjanya ditentukan dari sesi, BUKAN dari
 * parameter apa pun yang dikirim klien.
 *
 * `?satker=` cuma PENYARING TAMPILAN, dan sengaja diteruskan apa adanya:
 * fungsi data mengabaikannya untuk akun yang cakupannya sudah dipaksa
 * (KASUBAG_TU), jadi parameter ini tidak bisa dipakai melebarkan jangkauan.
 */
export async function GET(req: Request) {
  const akun = await getSessionAccount();
  if (!akun) return new Response("Belum login.", { status: 401 });

  const parameter = new URL(req.url).searchParams;
  const satker = parameter.get("satker");
  const tanpaCache = { "cache-control": "no-store" };
  const user = {
    nip: akun.nip,
    role: akun.role,
    satuanKerja: akun.satuanKerja,
    aktif: true,
  };

  if (parameter.get("ringkas") === "1") {
    const jumlah = await hitungNotifikasiKabar(user);
    if (jumlah === null) return new Response("Tidak ada kabar.", { status: 403 });
    return Response.json({ jumlah }, { headers: tanpaCache });
  }

  const sebelum = parameter.get("sebelum");
  if (sebelum !== null) {
    const kursor = bacaKursor(sebelum);
    if (!kursor) return new Response("Kursor tidak valid.", { status: 400 });
    const halaman = await ambilHalamanAktivitas(user, satker, kursor);
    if (!halaman) return new Response("Tidak ada kabar.", { status: 403 });
    return Response.json(halaman, { headers: tanpaCache });
  }

  const isi = await ambilIsiPanelKabar(user, satker);
  if (!isi.boleh) return new Response("Tidak ada kabar.", { status: 403 });

  return Response.json(isi, { headers: tanpaCache });
}
