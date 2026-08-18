import { susunGridAdkHarian, akhirPekan, type PegawaiAdkHarian } from "../../../business-logic/adkHarian";

/**
 * Pratinjau "ini yang akan diekspor" - grid NIP x tanggal, bentuk yang SAMA
 * dengan sheet "depan" di berkas .xlsx.
 *
 * MEMANGGIL `susunGridAdkHarian()`, penyusun yang sama dipakai berkasnya -
 * bukan menyusun ulang di sini. Kalau disusun dua kali, pratinjau dan berkas
 * bisa berbeda, dan bedanya baru ketahuan setelah berkas terkirim.
 *
 * KENAPA PERLU: bentuk panjang (satu baris per pegawai per hari, 2.000+ baris)
 * tidak bisa diperiksa manusia. Operator mengenali unitnya dari grid - berapa
 * hari, tanggal berapa, siapa yang kosong. Tanpa ini, satu-satunya cara
 * memeriksa isi berkas adalah mengunduh lalu membuka Excel.
 *
 * READ-ONLY, dan itu disengaja. Grid di berkas .xlsm operator berbentuk isian
 * manual; menirunya sebagai form di sini justru mengembalikan pekerjaan yang
 * dihapus Gajihub - datanya sudah ada per hari di database.
 */
export function GridAdkHarian({
  pegawai,
  periodeBulan,
  periodeTahun,
  denganJam = false,
  maksBaris = 25,
}: {
  pegawai: PegawaiAdkHarian[];
  periodeBulan: number;
  periodeTahun: number;
  denganJam?: boolean;
  maksBaris?: number;
}) {
  const grid = susunGridAdkHarian(pegawai, periodeBulan, periodeTahun, { denganJam });
  // 5 baris pertama = blok kepala (Jenis/Tahun/Bulan/Batas/header kolom).
  const header = grid[4] ?? [];
  const isi = grid.slice(5);
  const ditampilkan = isi.slice(0, maksBaris);

  // Kolom tanggal dimulai setelah No | NIP | Nama.
  const kolomTanggal = header.slice(3).map((h, i) => ({ label: String(h), idx: i + 3 }));

  const isoUntuk = (label: string) => {
    const n = Number(label);
    if (!Number.isFinite(n)) return null;
    return `${periodeTahun}-${String(periodeBulan).padStart(2, "0")}-${String(n).padStart(2, "0")}`;
  };

  return (
    <div className="mt-3">
      {/* Kontainer scroll sendiri - 31 kolom tidak boleh membuat SELURUH
          halaman menggeser ke samping. */}
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="min-w-max text-[11px]">
          <thead>
            <tr className="bg-surface-2">
              <th className="sticky left-0 z-10 border-r border-line bg-surface-2 px-2 py-1.5 text-left font-semibold text-ink">
                Nama
              </th>
              {kolomTanggal.map((k) => {
                const iso = isoUntuk(k.label);
                const libur = iso ? akhirPekan(iso) : false;
                return (
                  <th
                    key={`${k.label}-${k.idx}`}
                    className={`border-l border-line/60 px-1.5 py-1.5 text-center font-semibold ${
                      libur ? "text-red" : "text-muted"
                    }`}
                    title={iso ?? k.label}
                  >
                    {k.label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {ditampilkan.map((baris, i) => (
              <tr key={String(baris[1] ?? i)} className="border-t border-line/60">
                <td className="sticky left-0 z-10 border-r border-line bg-surface px-2 py-1 text-ink">
                  <span className="block max-w-[15rem] truncate" title={`${baris[2]} - NIP ${baris[1]}`}>
                    {String(baris[2] ?? "")}
                  </span>
                </td>
                {kolomTanggal.map((k) => {
                  const nilai = baris[k.idx];
                  const iso = isoUntuk(k.label);
                  const libur = iso ? akhirPekan(iso) : false;
                  const kosong = nilai === "" || nilai === undefined || nilai === null;
                  return (
                    <td
                      key={`${k.label}-${k.idx}`}
                      className={`border-l border-line/60 px-1.5 py-1 text-center font-mono ${
                        kosong ? "text-line" : "font-bold text-ink"
                      } ${libur ? "bg-surface-2" : ""}`}
                    >
                      {kosong ? "" : String(nilai)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-1.5 text-xs text-muted">
        {isi.length > maksBaris ? (
          <>
            Menampilkan {maksBaris} dari {isi.length} pegawai - unduh berkasnya untuk melihat semua. Kolom paling kanan
            adalah ringkasan, sama seperti di template.
          </>
        ) : (
          <>
            {isi.length} pegawai. Kolom paling kanan adalah ringkasan, sama seperti di template. Kolom bertanda merah =
            Sabtu/Minggu.
          </>
        )}
      </p>
    </div>
  );
}
