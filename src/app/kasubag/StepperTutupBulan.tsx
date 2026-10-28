import Link from "next/link";
import { RiCheckLine, RiLockLine } from "react-icons/ri";
import {
  AWALAN_CATATAN_UANG_MAKAN,
  type KodeLangkah,
  type LangkahPeriode,
  type StatusLangkah,
} from "../../business-logic/langkahTutupBulan";
import { IKON_LANGKAH, tautanLangkah } from "./tautanLangkah";

// ============================================================================
// STEPPER TUTUP BULAN - lima langkah berurutan menurut ketergantungannya
// (aturan di src/business-logic/langkahTutupBulan.ts).
//
// Halaman ini hanya MENUNJUK arah. Presensi punya sinkronisasi + dua jalur
// unggah, kalkulasi punya tabel 25+ kolom dan tombol yang mengunci
// pengiriman: menarik halaman kerja itu ke dashboard hanya menghasilkan salinan
// yang cepat berbeda dari aslinya.
//
// STATUS SELALU TEKS. Ikon dan warna cuma pendamping; pembaca layar dan orang
// yang tidak membedakan hijau dari abu-abu tetap membaca "Selesai" atau
// "Terkunci: ...".
// ============================================================================

const SATUAN_ANGKA: Record<KodeLangkah, string> = {
  PRESENSI: "pegawai",
  PREDIKAT: "pegawai",
  HITUNG: "pegawai",
  PERIKSA: "tabel",
  KIRIM: "",
};

function teksStatus(l: LangkahPeriode): string {
  const peta: Record<StatusLangkah, string> = {
    SELESAI: "Selesai",
    AKTIF: "Langkah berikutnya",
    BISA_DIKERJAKAN: "Bisa dikerjakan",
    TERKUNCI: `Terkunci: ${l.alasan ?? "belum memenuhi syarat"}`,
    TIDAK_BERLAKU: "Tidak berlaku",
  };
  return peta[l.status];
}

function KotakIkon({ langkah }: { langkah: LangkahPeriode }) {
  const Ikon =
    langkah.status === "SELESAI"
      ? RiCheckLine
      : langkah.status === "TERKUNCI"
        ? RiLockLine
        : IKON_LANGKAH[langkah.kode];
  const kelas =
    langkah.status === "SELESAI"
      ? "bg-green-tint text-green"
      : langkah.status === "AKTIF"
        ? "bg-navy text-white"
        : langkah.status === "BISA_DIKERJAKAN"
          ? "bg-teal-tint text-navy"
          : "bg-line-2 text-muted";
  return (
    <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${kelas}`}>
      <Ikon aria-hidden="true" className="size-5" />
    </div>
  );
}

export function StepperTutupBulan({
  langkah,
  periodeLabel,
  qPeriode,
  bolehExportRekap,
}: {
  langkah: LangkahPeriode[];
  /** Mis. "Juli 2026". */
  periodeLabel: string;
  qPeriode: string;
  bolehExportRekap: boolean;
}) {
  return (
    <section
      className="gj-masuk rounded-2xl border border-line bg-surface p-5 shadow-xs"
      style={{ animationDelay: "120ms" }}
    >
      <div className="flex items-center justify-between border-b border-line-2 pb-3">
        <h2 className="text-sm font-bold text-ink">Langkah tutup bulan</h2>
        <span className="text-xs font-semibold text-muted">{periodeLabel}</span>
      </div>

      {/* MENDATAR di layar lebar (permintaan user 2026-10-27: bentuk tegak
          "terlalu panjang ke bawah"). Di bawah lg lima kolom tidak muat, jadi
          langkah bertumpuk dengan garis tegak seperti biasa. */}
      <ol aria-label={`Langkah tutup bulan ${periodeLabel}`} className="mt-5 grid grid-cols-1 lg:grid-cols-5 lg:gap-4">
        {langkah.map((l, i) => {
          const terakhir = i === langkah.length - 1;
          const tampilAngka = l.angka !== null && l.angka.y > 0;
          const persen = l.angka && l.angka.y > 0 ? Math.round((l.angka.x / l.angka.y) * 100) : 0;
          const adaCatatanUangMakan = l.catatan?.some((c) => c.startsWith(AWALAN_CATATAN_UANG_MAKAN)) ?? false;
          const judul = (
            <span className={l.status === "AKTIF" ? "font-bold" : "font-semibold"}>{l.judul}</span>
          );

          return (
            <li
              key={l.kode}
              aria-current={l.status === "AKTIF" ? "step" : undefined}
              // Alasan terkunci pindah ke tooltip: tidak memakan baris, tapi
              // tetap bisa dibaca orang yang bertanya "kenapa digembok?".
              title={l.status === "TERKUNCI" ? teksStatus(l) : undefined}
              className={`flex gap-4 lg:flex-col lg:gap-3 ${
                l.status === "AKTIF" ? "lg:rounded-xl lg:bg-teal-tint/40 lg:p-2 lg:-m-2" : ""
              }`}
            >
              {/* Kotak ikon + garis penghubung ke langkah berikutnya: tegak di
                  HP, mendatar di layar lebar. Garisnya hiasan - urutan sudah
                  dibawa oleh <ol>. */}
              <div className="flex flex-col items-center lg:flex-row">
                <KotakIkon langkah={l} />
                {!terakhir && (
                  <span aria-hidden="true" className="my-1 w-px flex-1 bg-line lg:mx-2 lg:my-0 lg:h-px lg:w-auto" />
                )}
              </div>

              <div className={`min-w-0 flex-1 ${terakhir ? "" : "pb-6 lg:pb-0"}`}>
                <div>
                  <div className="min-w-0">
                    <h3 className="text-sm text-ink">
                      {l.status === "TIDAK_BERLAKU" ? (
                        judul
                      ) : (
                        <Link
                          href={tautanLangkah(l.kode, qPeriode)}
                          className="underline-offset-4 hover:text-biru hover:underline"
                        >
                          {judul}
                        </Link>
                      )}
                    </h3>
                    {/* Status TIDAK tampil sebagai teks (permintaan user
                        2026-10-27) - ikon centang/gembok & latar langkah aktif
                        yang membawanya di layar. Teksnya tetap ada untuk
                        pembaca layar, supaya status tidak cuma ikon & warna. */}
                    <p className="sr-only">{teksStatus(l)}</p>
                    {tampilAngka && l.angka && (
                      <div className="mt-2 flex items-center gap-2.5">
                        <span className="text-xs text-ink-2">
                          <span className="font-mono font-bold text-ink">
                            {l.angka.x}/{l.angka.y}
                          </span>{" "}
                          {SATUAN_ANGKA[l.kode]}
                        </span>
                        <div
                          aria-hidden="true"
                          className="h-1.5 w-24 overflow-hidden rounded-full bg-line lg:w-auto lg:flex-1"
                        >
                          <div className="h-full rounded-full bg-biru" style={{ width: `${persen}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-ink-2">{l.deskripsi}</p>
                </div>

                {l.catatan && l.catatan.length > 0 && (
                  <ul className="mt-3 space-y-1 border-l-2 border-biru bg-surface-2 py-1.5 pl-3 pr-2 text-xs text-ink-2">
                    {l.catatan.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                    {adaCatatanUangMakan && (
                      <li>
                        <Link
                          href={`/uang-makan?${qPeriode}`}
                          className="font-semibold text-biru underline-offset-4 hover:underline"
                        >
                          Periksa uang makan
                        </Link>
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Unduhan tetap ada walau datanya belum lengkap: rekap separuh justru
          yang dipakai menelusuri SIAPA yang belum masuk. */}
      {bolehExportRekap && (
        <div className="mt-6 border-t border-line-2 pt-4">
          <p className="text-xs font-bold text-muted">Unduh rekap unit</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <a
              href={`/tukin/presensi/export?${qPeriode}`}
              className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-biru hover:text-biru"
            >
              Presensi (Excel)
            </a>
            <a
              href={`/kasubag/kalkulasi/export?${qPeriode}`}
              className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-biru hover:text-biru"
            >
              Rekap Tukin (Excel)
            </a>
          </div>
          <p className="mt-2 text-xs text-muted">
            Rekap untuk pemeriksaan dan arsip, termasuk data yang belum disetujui. ADK untuk Web
            Gaji dibuat oleh PPABP.
          </p>
        </div>
      )}
    </section>
  );
}
