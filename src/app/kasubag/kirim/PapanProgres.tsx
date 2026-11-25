import Link from "next/link";
import type React from "react";
import { KembalikanRekapForm } from "./KembalikanRekapForm";
import type { KeadaanPengiriman, ProgresUnit } from "../../../business-logic/pengirimanUnit";
import { cacahProgres } from "../../../business-logic/pengirimanUnit";
import { irisanDonat } from "./irisanDonat";
import { RiSearchLine } from "react-icons/ri";
import { Paginasi, hitungPaginasi } from "../../../components/tables/Paginasi";
import { PencarianDebounce } from "../../../components/forms/PencarianDebounce";

const LABEL: Record<ProgresUnit["keadaan"], string> = {
  TERKIRIM: "Terkirim",
  DIKEMBALIKAN: "Dikembalikan",
  BELUM_KIRIM: "Belum kirim",
};

const WARNA: Record<ProgresUnit["keadaan"], string> = {
  TERKIRIM: "chip-ok",
  DIKEMBALIKAN: "chip-wait",
  BELUM_KIRIM: "chip-draft",
};

/**
 * Warna irisan donat - senada dengan chip di tabel sebelahnya.
 *
 * Dua penanda untuk keadaan yang sama harus sewarna: kalau grafik memakai
 * palet sendiri, orang membaca "hijau" di grafik dan mencari "hijau" di tabel
 * yang ternyata bukan status yang sama.
 */
const WARNA_DONAT: Record<KeadaanPengiriman, string> = {
  TERKIRIM: "var(--color-green)",
  DIKEMBALIKAN: "var(--color-gold)",
  BELUM_KIRIM: "var(--color-line)",
};

/** Urutan irisan searah jarum jam - yang beres dulu, yang belum di akhir. */
const URUTAN_DONAT: readonly KeadaanPengiriman[] = ["TERKIRIM", "DIKEMBALIKAN", "BELUM_KIRIM"];

const JARI_JARI = 42;
const KELILING = 2 * Math.PI * JARI_JARI;

function tanggalTeks(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(d);
}

/** Saringan status papan (`?status=`); nilai asing jatuh ke "semua". */
export type StatusPapan = "semua" | "terkirim" | "dikembalikan" | "belum";
const KEADAAN_STATUS: Record<Exclude<StatusPapan, "semua">, KeadaanPengiriman> = {
  terkirim: "TERKIRIM",
  dikembalikan: "DIKEMBALIKAN",
  belum: "BELUM_KIRIM",
};
export function bacaStatusPapan(nilai: string | undefined): StatusPapan {
  return nilai === "terkirim" || nilai === "dikembalikan" || nilai === "belum" ? nilai : "semua";
}

/**
 * Papan progres pengiriman rekap seluruh unit pada satu periode.
 *
 * MENJAWAB PERTANYAAN YANG SELAMA INI DIJAWAB LEWAT TELEPON: "unit mana yang
 * belum mengirim?". Daftar unitnya datang dari daftar satuan kerja
 * (`semuaUnit`), bukan disimpulkan dari baris pengiriman yang ada - unit yang
 * belum bekerja sama sekali justru yang paling perlu terlihat. Lihat
 * `rangkumProgres`.
 *
 * Bentuk 2026-11-25 (desain Export ADK): tab status, kotak cari, tabel
 * berhalaman, dan kartu Ringkasan donat di kanan. Semua saringan lewat URL
 * (`status`, `cariUnit`, `halUnit`, `perUnit`) - tetap Server Component.
 * Namanya dibedakan supaya tidak bertabrakan dengan filter halaman.
 *
 * `bolehKembalikan`: PPABP mendapat kolom alasan + tombol "Kembalikan" pada
 * baris Terkirim; pembaca lain hanya melihat.
 */
export function PapanProgres({
  progres,
  periodeBulan,
  periodeTahun,
  bolehKembalikan,
  status = "semua",
  cari = "",
  hal,
  per,
  paramDasar = {},
  basePath = "/ppabp/adk",
}: {
  progres: readonly ProgresUnit[];
  periodeBulan: number;
  periodeTahun: number;
  bolehKembalikan: boolean;
  status?: StatusPapan;
  cari?: string;
  hal?: string;
  per?: string;
  /** Parameter halaman yang ikut terbawa (periode, filter, tab). */
  paramDasar?: Record<string, string>;
  basePath?: string;
}) {
  const cacah = cacahProgres(progres);
  const irisan = irisanDonat(
    URUTAN_DONAT.map((k) => ({ kunci: k, nilai: cacah[k] })),
    KELILING
  );

  // PPABP: TERKIRIM di atas - cuma baris itu yang punya tombol Kembalikan.
  // Pembaca lain: urutan pemantauan (dikembalikan, belum kirim, terkirim).
  const PRIORITAS: Record<ProgresUnit["keadaan"], number> = bolehKembalikan
    ? { TERKIRIM: 0, DIKEMBALIKAN: 1, BELUM_KIRIM: 2 }
    : { DIKEMBALIKAN: 0, BELUM_KIRIM: 1, TERKIRIM: 2 };
  const kataKunci = cari.trim().toLowerCase();
  const tersaring = [...progres]
    .filter((u) => status === "semua" || u.keadaan === KEADAAN_STATUS[status])
    .filter((u) => !kataKunci || u.satuanKerja.toLowerCase().includes(kataKunci))
    .sort((a, b) => {
      const beda = PRIORITAS[a.keadaan] - PRIORITAS[b.keadaan];
      return beda !== 0 ? beda : a.satuanKerja.localeCompare(b.satuanKerja, "id-ID");
    });

  const paginasi = hitungPaginasi(tersaring.length, hal, per);
  const halamanIni = tersaring.slice(paginasi.mulai, paginasi.selesai);

  const hrefStatus = (s: StatusPapan) => {
    const q = new URLSearchParams(paramDasar);
    if (s !== "semua") q.set("status", s);
    if (cari) q.set("cariUnit", cari);
    if (per) q.set("perUnit", per);
    return `${basePath}?${q.toString()}#status-unit`;
  };
  const paramPaginasi = new URLSearchParams(paramDasar);
  if (status !== "semua") paramPaginasi.set("status", status);
  if (cari) paramPaginasi.set("cariUnit", cari);

  const TAB: { kunci: StatusPapan; label: string; jumlah: number }[] = [
    { kunci: "semua", label: "Semua", jumlah: progres.length },
    { kunci: "terkirim", label: "Terkirim", jumlah: cacah.TERKIRIM },
    { kunci: "dikembalikan", label: "Dikembalikan", jumlah: cacah.DIKEMBALIKAN },
    { kunci: "belum", label: "Belum Kirim", jumlah: cacah.BELUM_KIRIM },
  ];

  return (
    <div id="status-unit" className="grid scroll-mt-4 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <section className="card p-5" aria-labelledby="judul-progres-unit">
        <h2 id="judul-progres-unit" className="text-base font-bold text-ink">
          Progres pengiriman unit
        </h2>
        <p className="text-xs text-muted">
          {progres.length} satuan kerja, periode {periodeBulan}/{periodeTahun}
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Saring status pengiriman">
            <ul className="flex flex-wrap gap-2">
              {TAB.map((t) => {
                const aktif = t.kunci === status;
                return (
                  <li key={t.kunci}>
                    <Link
                      href={hrefStatus(t.kunci)}
                      aria-current={aktif ? "page" : undefined}
                      className={`inline-flex items-center rounded-lg px-4 py-2 text-sm no-underline transition ${
                        aktif ? "bg-navy font-bold text-white" : "bg-surface-2 font-medium text-ink-2 hover:bg-line-2"
                      }`}
                    >
                      {t.label} ({t.jumlah})
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <form method="get" action={`${basePath}#status-unit`} role="search" className="relative w-full sm:w-72">
            {Object.entries(paramDasar).map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
            {status !== "semua" && <input type="hidden" name="status" value={status} />}
            <PencarianDebounce
              name="cariUnit"
              defaultValue={cari}
              placeholder="Cari nama satuan kerja..."
              className="field-input w-full pr-9 text-sm"
            />
            <button
              type="submit"
              aria-label="Cari satuan kerja"
              className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center text-muted hover:text-ink"
            >
              <RiSearchLine aria-hidden className="size-4" />
            </button>
          </form>
        </div>

        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted">
          <span>
            {bolehKembalikan
              ? "Menampilkan satuan kerja dengan prioritas terkirim di posisi teratas."
              : "Menampilkan satuan kerja yang perlu ditindaklanjuti di posisi teratas."}
          </span>
          <span className="font-mono">Total {tersaring.length} Unit Kerja</span>
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-line">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className={bolehKembalikan ? "w-[46%]" : "w-[60%]"} />
              <col className={bolehKembalikan ? "w-[14%]" : "w-[18%]"} />
              <col className={bolehKembalikan ? "w-[40%]" : "w-[22%]"} />
            </colgroup>
            <thead>
              <tr className="border-b border-line bg-surface-2/60 text-[11px] font-semibold uppercase tracking-wide text-muted">
                <th className="col-nama px-4 py-3">Satuan Kerja</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Catatan</th>
              </tr>
            </thead>
            <tbody>
              {halamanIni.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-sm text-muted">
                    {progres.length === 0
                      ? "Belum ada satuan kerja yang terdaftar."
                      : "Tidak ada satuan kerja yang cocok dengan saringan ini."}
                  </td>
                </tr>
              )}
              {halamanIni.map((u) => (
                <BarisUnit
                  key={u.satuanKerja}
                  unit={u}
                  periodeBulan={periodeBulan}
                  periodeTahun={periodeTahun}
                  bolehKembalikan={bolehKembalikan}
                />
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3">
          <Paginasi
            basePath={basePath}
            params={paramPaginasi}
            info={paginasi}
            totalBaris={tersaring.length}
            labelBaris="satuan kerja"
            namaParam={{ hal: "halUnit", per: "perUnit" }}
            anchor="status-unit"
            varian="ringan"
          />
        </div>
      </section>

      <DonatProgres irisan={irisan} total={progres.length} terkirim={cacah.TERKIRIM} />
    </div>
  );
}

/**
 * Grafik lingkaran keadaan pengiriman - SVG murni, nol JavaScript.
 *
 * Angka di tengahnya sengaja "x/y", bukan persen: yang menagih unit bekerja
 * dengan jumlah unit, bukan dengan proporsi. "17/84" bisa langsung dipakai di
 * kalimat berikutnya; "20%" harus dihitung balik dulu.
 */
function DonatProgres({
  irisan,
  total,
  terkirim,
}: {
  irisan: ReturnType<typeof irisanDonat>;
  total: number;
  terkirim: number;
}) {
  return (
    <section className="card flex flex-col items-center self-start p-5">
      <h2 className="self-start text-sm font-bold text-ink">Ringkasan</h2>

      <div className="relative mt-3">
        <svg viewBox="0 0 100 100" className="h-36 w-36 -rotate-90" role="img" aria-hidden>
          {/* Cincin latar - yang tergambar kalau semua nilainya nol. Tanpa
              ini, periode kosong menampilkan ruang putih yang terbaca seperti
              gagal memuat. */}
          <circle cx="50" cy="50" r={JARI_JARI} fill="none" stroke="var(--color-line-2)" strokeWidth="14" />
          {irisan.map((i) =>
            i.panjangBusur > 0 ? (
              <circle
                key={i.kunci}
                cx="50"
                cy="50"
                r={JARI_JARI}
                fill="none"
                stroke={WARNA_DONAT[i.kunci as KeadaanPengiriman]}
                strokeWidth="14"
                strokeDashoffset={i.geser}
                // Tergambar SEARAH JARUM JAM, bukan tiga irisan mekar
                // berbarengan: tundaannya sebanding dengan titik mulai tiap
                // irisan, jadi yang di belakang baru bergerak setelah yang di
                // depannya sampai. Keadaan akhirnya ada di kelasnya, jadi
                // tanpa animasi (prefers-reduced-motion) cincinnya tetap utuh.
                className="gj-donat"
                style={
                  {
                    "--busur-donat": `${i.panjangBusur}`,
                    "--keliling-donat": `${KELILING}`,
                    animationDelay: `${120 + Math.round(i.mulaiPecahan * 620)}ms`,
                  } as React.CSSProperties
                }
              />
            ) : null
          )}
        </svg>

        {/* Teks di luar <svg> yang berputar -90deg - kalau ditaruh di dalam,
            angkanya ikut miring. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-xl font-bold leading-none text-ink">
            {terkirim}
            <span className="text-muted">/{total}</span>
          </span>
          <span className="mt-1 text-[10px] uppercase tracking-wide text-muted">unit terkirim</span>
        </div>
      </div>

      <ul className="mt-4 w-full space-y-1.5 border-t border-line-2 pt-3 text-xs">
        {irisan.map((i) => (
          <li key={i.kunci} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5 text-ink-2">
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: WARNA_DONAT[i.kunci as KeadaanPengiriman] }}
              />
              <span className="truncate">{LABEL[i.kunci as KeadaanPengiriman]}</span>
            </span>
            <span className="shrink-0 font-mono font-semibold text-ink">
              {i.nilai} <span className="font-normal text-muted">({i.persen}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Satu baris unit: nama + waktu kirim, chip status, catatan / Kembalikan. */
function BarisUnit({
  unit,
  periodeBulan,
  periodeTahun,
  bolehKembalikan,
}: {
  unit: ProgresUnit;
  periodeBulan: number;
  periodeTahun: number;
  bolehKembalikan: boolean;
}) {
  return (
    <tr className="border-b border-line-2 last:border-0">
      <td className="col-nama px-4 py-4 leading-snug break-words">
        <span className={unit.keadaan === "TERKIRIM" ? "font-semibold text-ink" : "text-ink-2"}>{unit.satuanKerja}</span>
        {unit.dikirimPada && (
          <span className="mt-0.5 block font-mono text-[11px] text-muted">Dikirim: {tanggalTeks(unit.dikirimPada)}</span>
        )}
      </td>
      <td className="px-3 py-4">
        <span className={`chip ${WARNA[unit.keadaan]}`}>{LABEL[unit.keadaan]}</span>
      </td>
      <td className="px-3 py-4 text-left">
        {/* Kembalikan HANYA untuk baris Terkirim. Keadaannya dikirim sebagai
            PROP (bukan memilih merender komponennya atau tidak): aksi
            kembalikan memanggil revalidatePath, dan komponen yang dilepas
            membawa serta popup hasilnya. Baris Dikembalikan menampilkan
            alasan PPABP. */}
        {bolehKembalikan && unit.keadaan !== "DIKEMBALIKAN" ? (
          <KembalikanRekapForm
            satuanKerja={unit.satuanKerja}
            periodeBulan={periodeBulan}
            periodeTahun={periodeTahun}
            bisaDikembalikan={unit.keadaan === "TERKIRIM"}
            sebaris
          />
        ) : unit.alasanKembali ? (
          <span className="text-xs text-ink-2">&ldquo;{unit.alasanKembali}&rdquo;</span>
        ) : (
          <span className="text-xs text-muted">-</span>
        )}
      </td>
    </tr>
  );
}
