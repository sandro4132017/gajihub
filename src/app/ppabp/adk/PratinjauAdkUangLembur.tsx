import { GridAdkHarian } from "./GridAdkHarian";
import type { DataUangLemburHarian } from "./dataUangLemburHarian";

// ============================================================================
// PRATINJAU ISI ADK UANG LEMBUR - satu blok, dipakai di DUA halaman (/uang-lembur
// dan /ppabp/adk).
//
// Kembaran langsung dari PratinjauAdkUangMakan.tsx, bedanya sel tiap tanggal
// menampilkan JUMLAH JAM LEMBUR pada hari tersebut (bukan angka 1), serta
// dua kolom ringkasan di ujung kanan: HK (Jam Hari Kerja) dan HL (Jam Hari Libur).
// ============================================================================

export function PratinjauAdkUangLembur({
  data,
  periodeBulan,
  periodeTahun,
  terbuka = false,
  satuanKerja = null,
}: {
  data: DataUangLemburHarian;
  periodeBulan: number;
  periodeTahun: number;
  terbuka?: boolean;
  satuanKerja?: string | null;
}) {
  if (data.pegawai.length === 0) {
    return (
      <div className="card mt-4 p-4">
        <p className="text-sm font-bold text-ink">
          Belum ada isi ADK Uang Lembur untuk periode {periodeBulan}/{periodeTahun}
        </p>
        <p className="mt-1 text-sm text-muted">
          ADK hanya memuat unit yang rekapnya sudah <strong>dikirim &amp; dikunci</strong> Kasubag TU.{" "}
          {satuanKerja ? (
            <>
              <strong>{satuanKerja}</strong> belum mengirim rekap periode ini (atau belum ada pegawai dengan lembur
              pada unit ini), jadi belum ada barisnya di berkas.
            </>
          ) : (
            <>Belum ada satu unit pun yang mengirim rekap lembur periode ini.</>
          )}
        </p>
      </div>
    );
  }

  return (
    <details className="card mt-4 p-4" open={terbuka}>
      <summary className="cursor-pointer text-sm font-bold text-ink">
        Pratinjau ADK Uang Lembur &middot; {data.totalBaris.toLocaleString("id-ID")} baris &middot;{" "}
        {data.totalJam.toLocaleString("id-ID")} jam &middot; {data.pegawai.length} pegawai
      </summary>
      <p className="mt-1 text-xs text-muted">
        Ini isi berkas yang akan diunduh, disusun oleh fungsi yang sama - bukan hitungan terpisah. Angka pada tiap
        kolom tanggal = <strong>jumlah jam lembur</strong> di hari tersebut (<strong>HK</strong> = total jam hari kerja,{" "}
        <strong>HL</strong> = total jam hari libur).
      </p>

      {data.tanpaHari > 0 && (
        <p className="mt-2 rounded-lg bg-gold-tint px-2.5 py-1.5 text-xs font-medium text-gold-deep">
          {data.tanpaHari} pegawai ikut terkirim tapi <strong>nol jam lembur</strong> di periode ini - barisnya kosong
          di berkas.
        </p>
      )}

      {data.selisih.length > 0 && (
        <div className="mt-2 rounded-lg border border-amber-300 bg-gold-tint p-2.5 text-xs text-ink-2 dark:border-amber-800">
          <p className="font-semibold">
            {data.selisih.length} pegawai: jumlah jam di berkas BEDA dari total jam hasil kalkulasi
          </p>
          <p className="mt-0.5">
            Yang dibayar Web Gaji adalah jam harian di berkas ini, bukan angka rekap bulanan. Biasanya artinya
            presensi berubah setelah uang lembur terakhir dihitung - hitung ulang dulu kalau begitu.
          </p>
          <ul className="mt-1 space-y-0.5">
            {data.selisih.slice(0, 8).map((s) => (
              <li key={s.nip}>
                {s.nama}: berkas <strong>{s.diBerkas}</strong> jam, tersimpan <strong>{s.tersimpan}</strong> jam
              </li>
            ))}
            {data.selisih.length > 8 && <li>...dan {data.selisih.length - 8} lainnya.</li>}
          </ul>
        </div>
      )}

      {data.tanpaKalkulasi.length > 0 && (
        <div className="mt-2 rounded-lg border border-amber-300 bg-gold-tint p-2.5 text-xs text-ink-2 dark:border-amber-800">
          <p className="font-semibold">
            {data.tanpaKalkulasi.length} pegawai punya jam lembur tercatat tapi belum ada di rekap kalkulasi bulanan
          </p>
          <ul className="mt-1 space-y-0.5">
            {data.tanpaKalkulasi.slice(0, 8).map((t) => (
              <li key={t.nip}>
                {t.nama}: <strong>{t.jam}</strong> jam belum terhitung
              </li>
            ))}
            {data.tanpaKalkulasi.length > 8 && <li>...dan {data.tanpaKalkulasi.length - 8} lainnya.</li>}
          </ul>
        </div>
      )}

      <GridAdkHarian
        pegawai={data.pegawai}
        periodeBulan={periodeBulan}
        periodeTahun={periodeTahun}
        denganJam={true}
      />
    </details>
  );
}

