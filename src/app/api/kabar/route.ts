import { getSessionAccount } from "../../../auth/getSessionAccount";
import { ambilIsiPanelKabar } from "../../kabarData";

/**
 * Isi panel Notifikasi & Aktivitas.
 *
 * Route Handler, bukan data yang ikut di-render tiap halaman: panel ini
 * dibuka sesekali, jadi 4 query-nya cuma jalan waktu benar-benar dibutuhkan.
 *
 * Otorisasi dicek DI SINI juga - `ambilIsiPanelKabar` menolak PEGAWAI & akun
 * nonaktif, dan cakupan satuan kerjanya ditentukan dari sesi, BUKAN dari
 * parameter apa pun yang dikirim klien.
 *
 * `?satker=` cuma PENYARING TAMPILAN, dan sengaja diteruskan apa adanya:
 * `ambilIsiPanelKabar` mengabaikannya untuk akun yang cakupannya sudah dipaksa
 * (KASUBAG_TU), jadi parameter ini tidak bisa dipakai melebarkan jangkauan.
 */
export async function GET(req: Request) {
  const akun = await getSessionAccount();
  if (!akun) return new Response("Belum login.", { status: 401 });

  const satker = new URL(req.url).searchParams.get("satker");

  const isi = await ambilIsiPanelKabar(
    {
      nip: akun.nip,
      role: akun.role,
      satuanKerja: akun.satuanKerja,
      aktif: true,
    },
    satker
  );
  if (!isi.boleh) return new Response("Tidak ada kabar.", { status: 403 });

  return Response.json(isi, { headers: { "cache-control": "no-store" } });
}
