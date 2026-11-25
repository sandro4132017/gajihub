import { RiLock2Line } from "react-icons/ri";
import { KirimRekapForm } from "../kirim/KirimRekapForm";
import { KepalaTahap } from "./KepalaTahap";
import { CHIP_PENGIRIMAN, type ButirChecklist } from "../../../business-logic/tahapKalkulasiUnit";
import type { KeadaanPengiriman } from "../../../business-logic/pengirimanUnit";

/**
 * TAHAP 4 - Pengiriman & penguncian periode.
 *
 * Kartu kanan di sebelah Tahap 3. Chip status (Terbuka / Dikembalikan /
 * Terkunci) di kepala; isinya checklist + pernyataan + tombol Kirim
 * (KirimRekapForm).
 *
 * KirimRekapForm SENGAJA TIDAK DIBUNGKUS `{!terkunci && ...}`. Aksi kirim
 * memanggil revalidatePath, jadi begitu berhasil halaman ini langsung
 * dirender ulang dalam keadaan terkunci - dan komponen yang ikut dilepas di
 * situ membawa serta popup "berhasil dikirim"-nya sebelum sempat terbaca.
 * Keadaannya dikirim sebagai prop; komponennya sendiri yang menyembunyikan
 * formnya.
 */
export function TahapPengiriman({
  keadaan,
  terkunci,
  alasanKembali,
  periodeBulan,
  periodeTahun,
  satuanKerja,
  jumlahKalkulasi,
  checklist,
  daftarNominalNol,
  alasanTertahan,
}: {
  keadaan: KeadaanPengiriman;
  terkunci: boolean;
  alasanKembali: string | null;
  periodeBulan: number;
  periodeTahun: number;
  satuanKerja: string;
  jumlahKalkulasi: number;
  checklist: readonly ButirChecklist[];
  daftarNominalNol: readonly string[];
  alasanTertahan: string | null;
}) {
  const chip = CHIP_PENGIRIMAN[keadaan];
  return (
    <>
      <section id="tahap-4" className="card scroll-mt-4 p-4 sm:p-5" aria-labelledby="judul-tahap-4">
        {/* Tautan lama dari dashboard & chip "Revisi dari PPABP" memakai #kirim. */}
        <span id="kirim" aria-hidden className="block h-0 -translate-y-4 scroll-mt-4" />
        <div id="judul-tahap-4">
          <KepalaTahap nomor={4} judul="Pengiriman & Penguncian Periode">
            {/* Saat terkunci, kotak hijau di bawah sudah menyatakannya. */}
            {!terkunci && <span className={chip.kelas}>{chip.label}</span>}
          </KepalaTahap>
        </div>
        <div className="mt-4">
          {/* Terkunci: KirimRekapForm cuma mengembalikan popup hasilnya (tanpa
              isi yang terlihat), jadi kartu ini akan kosong tanpa penggantinya. */}
          {terkunci && (
            <div className="rounded-xl border border-green/30 bg-green-tint/70 px-4 py-3">
              <p className="flex items-center gap-1.5 text-sm font-bold text-green">
                <RiLock2Line aria-hidden className="size-4" />
                Periode Ini Terkunci
              </p>
              <p className="mt-1 text-xs leading-relaxed text-green">
                Rekap sudah dikirim ke PPABP. Hanya PPABP yang dapat mengembalikan rekap ini ke unit kerja jika
                diperlukan perbaikan.
              </p>
            </div>
          )}
          <KirimRekapForm
            terkunci={terkunci}
            alasanKembali={alasanKembali}
            periodeBulan={periodeBulan}
            periodeTahun={periodeTahun}
            satuanKerja={satuanKerja}
            jumlahKalkulasi={jumlahKalkulasi}
            checklist={checklist}
            daftarNominalNol={daftarNominalNol}
            alasanTertahan={alasanTertahan}
          />
        </div>
      </section>
    </>
  );
}
