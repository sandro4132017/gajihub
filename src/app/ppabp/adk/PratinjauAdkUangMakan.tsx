import { GridAdkHarian } from "./GridAdkHarian";
import type { DataUangMakanHarian } from "./dataUangMakanHarian";

// ============================================================================
// PRATINJAU ISI ADK UANG MAKAN - satu blok, dipakai di DUA halaman.
//
// RUMAHNYA /uang-makan, bukan /ppabp/adk. Yang memeriksa isinya orang yang
// mengurus uang makan, dan dia bekerja di menu Uang Makan; memaksanya membuka
// halaman Export ADK cuma untuk melihat data yang jadi tanggung jawabnya
// adalah perjalanan yang tidak perlu. Di Export ADK blok ini tetap ada tapi
// TERTUTUP - di sana orang datang untuk mengunduh, bukan memeriksa.
//
// Isinya sama persis di kedua tempat karena keduanya memanggil
// `dataUangMakanHarian()` - penyusun baris yang sama dengan yang membuat
// berkasnya. Dua pratinjau yang menyusun barisnya sendiri-sendiri cepat atau
// lambat akan bercerita beda, dan bedanya baru ketahuan setelah berkas yang
// salah terkirim ke Web Gaji.
// ============================================================================

export function PratinjauAdkUangMakan({
  data,
  periodeBulan,
  periodeTahun,
  terbuka = false,
  /**
   * Unit yang sedang dilihat, kalau halamannya memang discope ke satu unit.
   * Dipakai untuk menerangkan pratinjau yang kosong - "unitmu belum mengirim"
   * beda sekali artinya dari "belum ada yang mengirim".
   */
  satuanKerja = null,
}: {
  data: DataUangMakanHarian;
  periodeBulan: number;
  periodeTahun: number;
  terbuka?: boolean;
  satuanKerja?: string | null;
}) {
  // Pratinjau kosong TIDAK disembunyikan. Kosong adalah informasi - dan justru
  // keadaan yang paling perlu dijelaskan, karena dari layar saja tidak
  // kelihatan bedanya dengan halaman yang belum selesai memuat.
  if (data.pegawai.length === 0) {
    return (
      <div className="card mt-4 p-4">
        <p className="text-sm font-bold text-ink">
          Belum ada isi ADK Uang Makan untuk periode {periodeBulan}/{periodeTahun}
        </p>
        <p className="mt-1 text-sm text-muted">
          ADK hanya memuat unit yang rekapnya sudah <strong>dikirim &amp; dikunci</strong> Kasubag TU.{" "}
          {satuanKerja ? (
            <>
              <strong>{satuanKerja}</strong> belum mengirim rekap periode ini, jadi belum ada barisnya di berkas.
            </>
          ) : (
            <>Belum ada satu unit pun yang mengirim rekap periode ini.</>
          )}
        </p>
      </div>
    );
  }

  return (
    <details className="card mt-4 p-4" open={terbuka}>
      <summary className="cursor-pointer text-sm font-bold text-ink">
        Pratinjau isi ADK Uang Makan - {data.totalBaris.toLocaleString("id-ID")} baris, {data.pegawai.length}{" "}
        pegawai
      </summary>
      <p className="mt-1 text-xs text-muted">
        Ini isi berkas yang akan diunduh, disusun oleh fungsi yang sama - bukan hitungan terpisah. Angka{" "}
        <strong>1</strong> = hari berhak uang makan (WFO/WFH/WFA di hari kerja).
      </p>

      {data.tanpaHari > 0 && (
        <p className="mt-2 rounded-lg bg-gold-tint px-2.5 py-1.5 text-xs font-medium text-gold-deep">
          {data.tanpaHari} pegawai ikut terkirim tapi <strong>nol hari</strong> di periode ini - barisnya kosong di
          berkas. Cek presensinya sebelum dikirim.
        </p>
      )}

      {data.selisih.length > 0 && (
        <div className="mt-2 rounded-lg border border-amber-300 bg-gold-tint p-2.5 text-xs text-ink-2 dark:border-amber-800">
          <p className="font-semibold">
            {data.selisih.length} pegawai: jumlah tanggal di berkas BEDA dari hari hasil kalkulasi
          </p>
          <p className="mt-0.5">
            Yang dibayar Web Gaji adalah jumlah tanggal di berkas ini, bukan angka hasil kalkulasi. Biasanya artinya
            presensinya berubah setelah uang makan terakhir dihitung - hitung ulang dulu kalau begitu.
          </p>
          <ul className="mt-1 space-y-0.5">
            {data.selisih.slice(0, 8).map((s) => (
              <li key={s.nip}>
                {s.nama}: berkas <strong>{s.diBerkas}</strong> hari, disetujui <strong>{s.disetujui}</strong> hari
              </li>
            ))}
            {data.selisih.length > 8 && <li>...dan {data.selisih.length - 8} lainnya.</li>}
          </ul>
        </div>
      )}

      <GridAdkHarian
        pegawai={data.pegawai}
        periodeBulan={periodeBulan}
        periodeTahun={periodeTahun}
        denganJam={false}
      />
    </details>
  );
}
