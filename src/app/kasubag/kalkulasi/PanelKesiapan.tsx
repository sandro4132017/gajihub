import { TEMUAN, type RingkasanKesiapan } from "../../../business-logic/kesiapanKalkulasi";

/** Satu sumber yang harus lengkap sebelum kalkulasi berarti. */
export interface SumberKesiapan {
  /** "Rekap presensi" / "Predikat kinerja". */
  nama: string;
  /** "30%" / "70%" - bobotnya di Pasal 5, dipakai menjelaskan taruhannya. */
  bobot: string;
  terisi: number;
  dari: number;
  href: string;
  labelAksi: string;
}


/**
 * Pemeriksaan kelengkapan data, tepat SEBELUM tombol Hitung.
 *
 * LETAKNYA DI ATAS TOMBOL, bukan di bawah hasil. Panel yang muncul sesudah
 * angkanya keluar tidak mencegah apa pun - orang sudah menekan Hitung, dan
 * angka yang sudah tampil terlanjur dipercaya.
 *
 * Yang ditampilkan tanpa dibuka: tiga angka. Rinciannya - siapa saja dan apa
 * yang harus dilakukan - ada di dalam lipatan, karena unit yang datanya sudah
 * lengkap tidak perlu membaca apa pun di sini.
 */
export function PanelKesiapan({
  ringkasan,
  sumber = [],
  tanpaKartu = false,
}: {
  ringkasan: RingkasanKesiapan;
  /**
   * Checklist kelengkapan sumber data - menggantikan kartu "Sumber data
   * periode ini" yang dulu berdiri sendiri.
   *
   * DISATUKAN karena angkanya sama: kartu itu menulis "47 / 48 pegawai aktif"
   * sementara panel ini menulis "48 diperiksa, 47 lengkap, 1 perlu diperiksa",
   * dan pembacanya harus mencocokkan dua angka yang sebenarnya menjawab
   * pertanyaan yang sama. Satu tempat, satu angka.
   *
   * SENGAJA TANPA NAMA PEGAWAI. Bagian ini cuma angka & status; namanya ada
   * di rincian temuan di bawah, yang mengelompokkannya per SEBAB berikut
   * tindakannya - predikat staf ditagih ke penilai di unit ini, predikat
   * pejabat pimpinan tinggi ke penilai di atasnya. Menyebut daftar yang sama
   * dua kali membuat pembacanya harus menebak mana yang perlu dibaca.
   */
  sumber?: SumberKesiapan[];
  /**
   * Menyatu ke dalam kartu milik pemanggil (di Kalkulasi Unit: satu kartu
   * bersama filter periode). Yang dilepas cuma pembungkusnya - garis aksen
   * kiri ikut hilang karena di dalam kartu lain ia terbaca seperti kartu
   * kedua yang menempel.
   *
   * Isyarat keadaannya TIDAK hilang: angkanya sendiri sudah berwarna - hijau
   * untuk yang lengkap, emas untuk yang perlu diperiksa - dan itu yang
   * benar-benar dibaca orang, bukan garis di tepinya.
   */
  tanpaKartu?: boolean;
}) {
  const r = ringkasan;
  // Checklist tetap ditampilkan walau belum ada apa pun yang bisa diperiksa -
  // justru di keadaan itulah orang perlu tahu sumber mana yang masih kosong.
  if (r.jumlahDiperiksa === 0 && sumber.length === 0) return null;

  const semuaLengkap = r.jumlahPerluDiperiksa === 0;

  return (
    <div
      className={
        tanpaKartu
          ? "mt-3 w-full border-t border-line-2 pt-3"
          : `card mt-4 p-4 ${
              r.jumlahTerhalang > 0 ? "border-l-4 border-l-gold" : semuaLengkap ? "border-l-4 border-l-green" : ""
            }`
      }
    >
      {sumber.length > 0 && (
        <ul className="mb-3 space-y-2 border-b border-line-2 pb-3">
          {sumber.map((s) => {
            const lengkap = s.terisi >= s.dari;
            return (
              // Tanpa ikon centang/silang: yang menyampaikan keadaan adalah
              // ANGKANYA sendiri, yang sudah berwarna hijau atau emas. Ikon di
              // depannya cuma mengulang isyarat yang sama, dengan simbol yang
              // artinya harus ditebak lebih dulu.
              <li key={s.nama} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                <span className="font-semibold text-ink">{s.nama}</span>
                <span className="text-xs text-muted">bobot {s.bobot}</span>
                <span className={`font-mono font-bold ${lengkap ? "text-green" : "text-gold-deep"}`}>
                  {s.terisi.toLocaleString("id-ID")} / {s.dari.toLocaleString("id-ID")}
                </span>
                <span className="text-xs text-muted">pegawai aktif</span>
                <a href={s.href} className="text-xs font-semibold text-biru underline">
                  {s.labelAksi}
                </a>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1.5">
        <span className="text-sm font-extrabold text-ink">
          {r.jumlahDiperiksa.toLocaleString("id-ID")} pegawai diperiksa
        </span>
        <span className="inline-flex items-baseline gap-1.5 text-sm text-green">
          <span aria-hidden>&#10003;</span>
          <span className="font-mono font-bold">{r.jumlahLengkap.toLocaleString("id-ID")}</span>
          <span>data lengkap</span>
        </span>
        {r.jumlahPerluDiperiksa > 0 && (
          <span className="inline-flex items-baseline gap-1.5 text-sm text-gold-deep">
            <span aria-hidden>&#9888;</span>
            <span className="font-mono font-bold">{r.jumlahPerluDiperiksa.toLocaleString("id-ID")}</span>
            <span>perlu diperiksa</span>
          </span>
        )}
        {/* Koreksi presensi BUKAN masalah - warnanya netral, dan tidak ikut
            menambah "perlu diperiksa". Ditampilkan karena yang memeriksa
            berhak tahu baris mana yang tidak lagi apa adanya dari e-Presensi. */}
        {r.jumlahAdaKoreksi > 0 && (
          <span className="inline-flex items-baseline gap-1.5 text-sm text-muted">
            <span className="font-mono font-bold text-ink-2">{r.jumlahAdaKoreksi.toLocaleString("id-ID")}</span>
            <span>presensinya pernah dikoreksi</span>
          </span>
        )}
      </div>

      {semuaLengkap && (
        <p className="mt-1.5 text-xs text-muted">
          Data kehadiran dan kinerja lengkap untuk seluruh pegawai yang ikut dihitung periode ini.
        </p>
      )}

      {r.jumlahTerhalang > 0 && (
        <p className="mt-1.5 text-xs text-ink-2">
          <strong className="text-gold-deep">{r.jumlahTerhalang.toLocaleString("id-ID")} pegawai</strong> datanya belum
          cukup untuk dihitung - kalkulasi akan melewati mereka, atau menghasilkan angka yang keliru.
        </p>
      )}

      {r.perJenis.length > 0 && (
        <details className="group mt-3 border-t border-line-2 pt-2.5">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-bold text-teal-deep [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Lihat rincian temuan</span>
            <span className="hidden group-open:inline">Tutup rincian</span>
          </summary>

          <ul className="mt-2.5 space-y-2.5">
            {r.perJenis.map(({ jenis, jumlah, pegawai }) => {
              const t = TEMUAN[jenis];
              return (
                <li key={jenis} className="border-l-2 border-line pl-3">
                  <p className="text-sm">
                    <span
                      className={`chip ${t.tingkat === "HALANG" ? "chip-danger" : "chip-wait"} mr-1.5 align-middle`}
                    >
                      {t.tingkat === "HALANG" ? "Belum bisa dihitung" : "Perlu dicek"}
                    </span>
                    <span className="font-semibold text-ink">{t.label}</span>
                    <span className="ml-1.5 font-mono text-xs font-bold text-ink-2">{jumlah}</span>
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">{t.tindakan}</p>
                  {/* Nama dibatasi 8, sisanya dihitung. Daftar 300 nama
                      mengubur delapan jenis temuan di bawahnya, dan yang
                      benar-benar dipakai orang justru jenis + jumlahnya. */}
                  <p className="mt-1 text-xs text-ink-2">
                    {pegawai
                      .slice(0, 8)
                      .map((p) => p.nama)
                      .join(", ")}
                    {pegawai.length > 8 && (
                      <span className="text-muted"> &mdash; dan {pegawai.length - 8} lainnya</span>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
}
