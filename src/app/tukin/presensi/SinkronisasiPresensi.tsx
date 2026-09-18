"use client";

import { useActionState, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { tarikPresensiEpresensiAction, type SinkronPresensiFormState } from "./actionsSync";
import { NAMA_BULAN } from "../../bulan";
import { PilihPeriode } from "./PilihPeriode";

const INITIAL_STATE: SinkronPresensiFormState = {};

/** Berapa alasan yang disebut sebelum sisanya cukup dihitung. */
const BATAS_ALASAN = 8;

export function SinkronisasiPresensi({
  defaultBulan,
  defaultTahun,
  tahunOpsi,
  koreksiMenunggu,
  paramDipertahankan,
}: {
  defaultBulan: number;
  defaultTahun: number;
  /**
   * Berapa koreksi jam di periode ini yang BELUM ikut terhitung.
   *
   * Dipakai mengubah arti tombolnya. Tindakannya memang sama persis -
   * menarik ulang dari e-Presensi - tapi bagi yang menekannya itu dua
   * pekerjaan berbeda: mengambil data, atau memberlakukan koreksi yang
   * sudah dia ketik. Tombol bernama sama untuk keduanya membuat langkah
   * kedua terasa seperti mengulang langkah pertama, lalu dilewati.
   */
  koreksiMenunggu: number;
  /** Tahun yang boleh dipilih di dropdown periode. */
  tahunOpsi: number[];
  /**
   * Parameter lain yang harus ikut terbawa waktu periode diganti TANPA
   * JavaScript - pencarian, satuan kerja, dan penanda `dari=tukin`.
   * Tanpa ini, mengganti bulan di jalur no-JS menyapu pekerjaan orang:
   * pencariannya hilang dan tombol Kembali lenyap di tengah jalan.
   */
  paramDipertahankan: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(tarikPresensiEpresensiAction, INITIAL_STATE);

  // ==========================================================================
  // FILTER DI BAWAH IKUT PINDAH KE PERIODE YANG BARU DITARIK.
  //
  // Tanpa ini, menarik Juli sementara halaman sedang menampilkan Agustus
  // menghasilkan pemandangan yang menyesatkan: tarikan berhasil, tapi tabel
  // di bawah tetap Agustus dan terlihat kosong - dan yang membacanya
  // menyimpulkan pegawainya gagal diproses.
  //
  // Tautan "Lihat rekap periode ini" sudah ada sejak dulu, tapi harus diklik,
  // dan keraguan itu muncul SEBELUM orang sempat membacanya.
  //
  // Parameter lain (pencarian, satker, halaman) sengaja dipertahankan: yang
  // berubah cuma periodenya, dan menyapu filter lain memaksa orang menyetel
  // ulang pekerjaannya.
  // ==========================================================================
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Penanda supaya perpindahan terjadi SEKALI per hasil tarikan. Tanpa ini,
  // router.replace memicu render ulang yang menjalankan efeknya lagi.
  const sudahPindah = useRef<string | null>(null);

  const ringkasan = state.ringkasan;
  // Dijumlah dari alasannya sendiri, BUKAN dari (total sumber - tersimpan):
  // yang kedua ikut menghitung baris yang gugur sebelum sampai ke tahap ini,
  // jadi angkanya tidak akan cocok dengan daftar di bawahnya.
  const jumlahDilewati = (ringkasan?.dilewati ?? []).reduce((a, d) => a + d.jumlah, 0);
  useEffect(() => {
    if (!ringkasan) return;
    const kunci = `${ringkasan.periodeBulan}-${ringkasan.periodeTahun}`;
    if (sudahPindah.current === kunci) return;

    const bulanSekarang = searchParams.get("bulan");
    const tahunSekarang = searchParams.get("tahun");
    const sudahSama =
      bulanSekarang === String(ringkasan.periodeBulan) && tahunSekarang === String(ringkasan.periodeTahun);
    sudahPindah.current = kunci;
    if (sudahSama) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set("bulan", String(ringkasan.periodeBulan));
    params.set("tahun", String(ringkasan.periodeTahun));
    // Halaman dikembalikan ke awal - hasil tarikan baru tidak ada urusannya
    // dengan halaman ke-4 daftar sebelumnya.
    params.delete("hal");
    router.replace(`${pathname}?${params.toString()}`);
  }, [ringkasan, pathname, router, searchParams]);

  return (
    <div className="card mt-6 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold tracking-tight text-navy">Sinkronisasi e-Presensi</h2>
          <p className="mt-1 text-sm text-muted">
            Menarik data kehadiran langsung dari e-Presensi secara otomatis.
          </p>
        </div>
        <span className="chip chip-ok rounded-full px-3.5 py-1.5 text-[13px]">Tersambung</span>
      </div>

      {/* DUA FORM BERDAMPINGAN, bukan satu - dan itu keharusan, bukan gaya.
          Mengganti periode cuma BERPINDAH HALAMAN (GET); menarik data
          MENULIS ke database (Server Action). Menyatukannya berarti melihat
          bulan lain otomatis ikut menimpa rekapnya. Form tidak boleh
          bersarang di HTML, jadi keduanya bersebelahan dalam satu baris. */}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <form method="get" className="flex flex-wrap items-end gap-2">
          {Object.entries(paramDipertahankan).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <PilihPeriode bulan={defaultBulan} tahun={defaultTahun} tahunOpsi={tahunOpsi} />
          {/* Ditulis sebagai HTML mentah, BUKAN JSX: isi <noscript>
              diperlakukan sebagai teks selama JavaScript hidup, dan React
              melaporkannya sebagai hydration mismatch. Pola yang sama sudah
              dipakai fallback <select> di SearchableSelect. */}
          <noscript
            dangerouslySetInnerHTML={{
              __html: '<button type="submit" class="btn btn-secondary">Lihat</button>',
            }}
          />
        </form>

        <form action={formAction}>
          {/* Periodenya diambil dari yang SEDANG DILIHAT, bukan dari kendali
              terpisah. Itu yang membuat "Tarik Data Presensi" tidak pernah
              menyentuh bulan selain yang tertulis di sebelahnya. */}
          <input type="hidden" name="bulan" value={defaultBulan} />
          <input type="hidden" name="tahun" value={defaultTahun} />
          <button type="submit" disabled={pending} className="btn btn-primary px-4 py-2.5">
            {pending
              ? "Menarik data..."
              : koreksiMenunggu > 0
                ? "Terapkan Koreksi Presensi"
                : "Tarik Data Presensi"}
          </button>
        </form>
      </div>

      {koreksiMenunggu > 0 && (
        <p className="mt-3 rounded-lg border border-gold bg-gold-tint px-3 py-2 text-sm leading-relaxed text-ink-2">
          <strong className="font-bold text-ink">
            {koreksiMenunggu.toLocaleString("id-ID")} koreksi jam menunggu diterapkan.
          </strong>{" "}
          Jamnya sudah tersimpan, tapi angka potongannya belum berubah sampai tombol di atas ditekan.
        </p>
      )}

      {/* SATU baris, bukan dua paragraf (permintaan user 2026-09-14).
          Kalimat keduanya tetap ada karena menyebut hal yang menentukan:
          angka potongan LAHIR DI SINI, bukan disalin dari e-Presensi. */}
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Penarikan data hanya memperbarui rekap pada bulan yang dipilih. Potongan dihitung ulang oleh Gajihub
        sesuai <strong>Permenaker 15/2024</strong>.
      </p>

      {pending && (
        <p className="mt-2 text-xs text-muted">
          Menarik & menganalisis seluruh baris presensi periode ini - untuk satu bulan penuh biasanya butuh
          beberapa puluh detik. Jangan tutup halaman ini.
        </p>
      )}

      {state.error && <p className="mt-3 text-sm text-red">{state.error}</p>}

      {state.ringkasan && (
        <div className="mt-3 rounded-lg border border-line bg-surface-2 p-3">
          <p className="text-sm font-semibold text-ink">
            {NAMA_BULAN[state.ringkasan.periodeBulan - 1]} {state.ringkasan.periodeTahun}:{" "}
            {state.ringkasan.tersimpan.toLocaleString("id-ID")} pegawai tersimpan
            <span className="font-normal text-muted">
              {" "}
              (dari {state.ringkasan.totalPegawaiSumber.toLocaleString("id-ID")} pegawai di e-Presensi)
            </span>
          </p>
          {/* RINCIAN DILEWATI DILIPAT.
              Yang perlu dibaca tiap kali cuma satu: berapa yang tersimpan.
              Rinciannya dibuka kalau angkanya terasa janggal - dan itu tidak
              terjadi tiap tarikan.

              `<details>` BAWAAN HTML, bukan state React: buka-tutupnya
              ditangani browser, jadi tetap jalan tanpa JavaScript. Pola yang
              sama dengan grup lipat di sidebar.

              JUMLAHNYA TETAP TERLIHAT SAAT TERTUTUP. Kalau ringkasannya cuma
              berbunyi "Lihat rincian", orang harus membukanya dulu untuk tahu
              ada tidaknya yang perlu diperiksa - dan yang tidak pernah dibuka
              tidak pernah ketahuan. */}
          {state.ringkasan.dilewati.length > 0 && (
            <details className="mt-2 group">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-muted transition hover:text-ink-2 [&::-webkit-details-marker]:hidden">
                <svg
                  viewBox="0 0 24 24"
                  className="size-3.5 shrink-0 transition-transform group-open:rotate-90"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 18l6-6-6-6" />
                </svg>
                {jumlahDilewati.toLocaleString("id-ID")} pegawai dilewati
                <span className="font-normal text-muted group-open:hidden">&mdash; lihat detail</span>
              </summary>

              {/* SATUANNYA DISEBUT ("223 pegawai", bukan "223 -"). Dulu
                  angkanya berdiri sendiri di depan tanda hubung dan terbaca
                  seperti nomor urut atau kode; yang membacanya harus menebak
                  itu menghitung apa. */}
              <ul className="mt-2 space-y-0.5 border-t border-line-2 pt-2 text-xs text-muted">
                {state.ringkasan.dilewati.slice(0, BATAS_ALASAN).map((d) => (
                  <li key={d.alasan}>
                    <strong className="font-semibold text-ink-2">
                      {d.jumlah.toLocaleString("id-ID")} pegawai
                    </strong>{" "}
                    &mdash; {d.alasan}
                  </li>
                ))}
              </ul>
              {/* Daftarnya dipotong, dan potongannya HARUS disebut. Tanpa
                  baris ini, delapan angka yang berjumlah seribuan terbaca
                  seperti seluruh yang dilewati - padahal bisa lima ribu. */}
              {state.ringkasan.dilewati.length > BATAS_ALASAN && (
                <p className="mt-1 text-xs text-muted">
                  &hellip; dan {(state.ringkasan.dilewati.length - BATAS_ALASAN).toLocaleString("id-ID")} alasan
                  lain yang tidak ditampilkan.
                </p>
              )}
            </details>
          )}
          <p className="mt-2 text-xs text-muted">
            Kalkulasi Tukin/uang makan TIDAK otomatis dihitung ulang - jalankan sendiri dari halaman Kalkulasi.
          </p>
        </div>
      )}
    </div>
  );
}
