"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SearchableSelect } from "../forms/SearchableSelect";
import type { IsiPanelKabar } from "../../app/kabarData";
import { GAYA_JENIS, jamJakarta, kelompokPerHari, labelHari, pecahAngka } from "../../lib/kabar/tampilKabar";

/**
 * Panel kanan Notifikasi & Aktivitas - TIDAK permanen, dibuka lewat tombol.
 *
 * KENAPA TIDAK PERMANEN: hampir semua halaman di sini bertabel lebar (rincian
 * tukin 12 kolom, grid ADK 33 kolom). Panel tetap selebar ~320px memakan ruang
 * yang justru paling dibutuhkan, dan isinya bukan sesuatu yang perlu dipelototi
 * terus-menerus.
 *
 * ISI LENGKAPNYA DIAMBIL SAAT DIBUKA, bukan saat halaman dirender: kalau ikut
 * tiap render, setiap halaman menanggung query tambahan hanya untuk panel yang
 * mungkin tidak pernah dibuka. Satu-satunya yang diambil saat halaman dimuat
 * adalah jumlah notifikasi (`?ringkas=1`) untuk lencana tombol.
 */

export type IsiTerkirim = Omit<IsiPanelKabar, "aktivitas"> & {
  aktivitas: (Omit<IsiPanelKabar["aktivitas"][number], "waktu"> & { waktu: string })[];
};

type BarisTerkirim = IsiTerkirim["aktivitas"][number];

/** Segmen angka ditampilkan font-mono (konvensi proyek). */
function TeksBerangka({ teks }: { teks: string }) {
  return (
    <>
      {pecahAngka(teks).map((s, i) =>
        s.mono ? (
          <span key={i} className="font-mono">
            {s.t}
          </span>
        ) : (
          <span key={i}>{s.t}</span>
        )
      )}
    </>
  );
}

/**
 * Daftar notifikasi + aktivitas. Dipisah dari PanelKabar supaya bisa dirender
 * dengan data tetap tanpa fetch (lihat panelKabar.render.test.tsx).
 */
export function DaftarKabar({
  isi,
  memuatLagi,
  galatLagi = false,
  onMuatLagi,
  onNavigasi,
}: {
  isi: IsiTerkirim;
  memuatLagi: boolean;
  /** Permintaan halaman berikutnya gagal - tombol tetap ada untuk mencoba lagi. */
  galatLagi?: boolean;
  onMuatLagi: () => void;
  onNavigasi: () => void;
}) {
  const kelompok = kelompokPerHari(isi.aktivitas);
  return (
    <div className="px-4 pb-8">
      <p className="pb-1 pt-4 text-sm font-bold text-navy">Notifikasi</p>
      {isi.notifikasi.length === 0 && (
        <p className="py-2 text-xs text-muted">Tidak ada yang perlu ditangani.</p>
      )}
      {isi.notifikasi.map((n) => {
        const isiKartu = (
          <>
            <span
              className={`mt-0.5 grid size-8 flex-none place-items-center rounded-lg ${
                n.nada === "danger" ? "bg-red-tint text-red" : "bg-gold-tint text-gold-deep"
              }`}
            >
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 8v5" />
                <path d="M12 17h.01" />
              </svg>
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-bold text-ink">
                <TeksBerangka teks={n.teks} />
              </span>
              <span className="block text-xs leading-snug text-muted">{n.keterangan}</span>
            </span>
          </>
        );
        const kelas = "mt-2 flex min-h-11 gap-2.5 rounded-xl border border-line p-2.5";
        return n.href ? (
          <Link
            key={n.id}
            href={n.href}
            onClick={() => onNavigasi()}
            className={`${kelas} transition hover:border-teal`}
          >
            {isiKartu}
          </Link>
        ) : (
          <div key={n.id} className={kelas}>
            {isiKartu}
          </div>
        );
      })}

      <p className="pb-1 pt-5 text-sm font-bold text-navy">Aktivitas</p>
      {isi.aktivitas.length === 0 && (
        <p className="py-2 text-xs text-muted">
          {isi.satkerPilih
            ? `Belum ada aktivitas tercatat untuk ${isi.satkerPilih}.`
            : "Belum ada aktivitas tercatat."}
        </p>
      )}
      {kelompok.map((hari) => (
        <section key={hari.kunci}>
          <h3 className="pb-1 pt-3 text-xs font-bold text-muted">{labelHari(hari.kunci)}</h3>
          <ul>
            {hari.baris.map((a) => {
              const gaya = GAYA_JENIS[a.jenis] ?? GAYA_JENIS.ubah;
              const Ikon = gaya.Ikon;
              const waktu = new Date(a.waktu);
              const meta = [
                a.aktor,
                jamJakarta(waktu),
                // Unit disebut per baris cuma kalau daftarnya memang
                // bercampur - kalau sudah disaring, mengulanginya di
                // tiap baris tidak menambah keterangan apa pun.
                !isi.satkerScope && !isi.satkerPilih ? a.satuanKerja : null,
              ]
                .filter(Boolean)
                .join(" · ");
              const isiBaris = (
                <>
                  <span className={`grid size-8 flex-none place-items-center rounded-lg ${gaya.kelas}`}>
                    <Ikon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-ink">
                      <TeksBerangka teks={a.teks} />
                    </span>
                    <span className="block text-xs text-muted">{meta}</span>
                  </span>
                </>
              );
              return (
                <li key={a.id}>
                  {a.href ? (
                    <Link
                      href={a.href}
                      onClick={() => onNavigasi()}
                      className="flex min-h-11 gap-2.5 rounded-lg px-1 py-1.5 transition hover:bg-line-2"
                    >
                      {isiBaris}
                    </Link>
                  ) : (
                    <div className="flex min-h-11 gap-2.5 px-1 py-1.5">{isiBaris}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {isi.kursorBerikut && galatLagi && (
        <p role="alert" className="pt-3 text-xs font-semibold text-red">
          Aktivitas berikutnya tidak dapat dimuat. Coba lagi.
        </p>
      )}
      {isi.kursorBerikut && (
        <button
          type="button"
          onClick={onMuatLagi}
          disabled={memuatLagi}
          className="mt-3 h-11 w-full rounded-lg border border-line bg-surface text-sm font-semibold text-navy transition hover:border-teal disabled:cursor-not-allowed disabled:opacity-60"
        >
          {memuatLagi ? "Memuat..." : galatLagi ? "Coba lagi" : "Muat lebih banyak"}
        </button>
      )}
    </div>
  );
}

export function PanelKabar({ tampilkan }: { tampilkan: boolean }) {
  const [buka, setBuka] = useState(false);
  const [isi, setIsi] = useState<IsiTerkirim | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [memuatLagi, setMemuatLagi] = useState(false);
  // Penyaring unit buat pemakai lintas satker (PPABP, OSDMA, Pimpinan, Admin).
  // "" = semua satuan kerja. Server tetap yang menentukan boleh atau tidak -
  // ini cuma mempersempit.
  const [satker, setSatker] = useState("");
  const [jumlahLencana, setJumlahLencana] = useState(0);
  const [galat, setGalat] = useState(false);
  const [galatLagi, setGalatLagi] = useState(false);
  const [percobaan, setPercobaan] = useState(0);
  // Nomor generasi: naik tiap panel dibuka, penyaring berubah, atau dicoba
  // ulang. Respons yang membawa nomor lama itu basi dan dibuang.
  const generasi = useRef(0);
  const tombolTutup = useRef<HTMLButtonElement>(null);

  // Lencana: satu permintaan ringan saat halaman dimuat.
  useEffect(() => {
    if (!tampilkan) return;
    let batal = false;
    fetch("/api/kabar?ringkas=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { jumlah?: number } | null) => {
        if (!batal && d && typeof d.jumlah === "number") setJumlahLencana(d.jumlah);
      })
      .catch(() => undefined);
    return () => {
      batal = true;
    };
  }, [tampilkan]);

  useEffect(() => {
    if (!buka) return;
    let batal = false;
    generasi.current += 1;
    setMemuat(true);
    setGalat(false);
    setGalatLagi(false);
    fetch(`/api/kabar${satker ? `?satker=${encodeURIComponent(satker)}` : ""}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: IsiTerkirim | null) => {
        if (batal) return;
        setIsi(d);
        setGalat(d === null);
        // Lencana disegarkan hanya dari tampilan tanpa penyaring: dengan
        // penyaring, angkanya sudah mengecil dan bukan jumlah milik pemakai.
        if (d && !satker) setJumlahLencana(d.notifikasi.length);
      })
      .catch(() => {
        if (batal) return;
        setIsi(null);
        setGalat(true);
      })
      .finally(() => !batal && setMemuat(false));
    // Sengaja mengambil ulang tiap kali dibuka (bukan sekali lalu di-cache):
    // isi panel ini justru yang paling cepat basi - approval & ekspor terjadi
    // sambil halamannya dibiarkan terbuka.
    return () => {
      batal = true;
    };
  }, [buka, satker, percobaan]);

  // Fokus pindah ke tombol tutup saat panel dibuka, supaya papan ketik tidak
  // tertinggal di halaman di belakang panel.
  useEffect(() => {
    if (buka) tombolTutup.current?.focus();
  }, [buka]);

  // Esc menutup - panel ini menumpuk di atas konten, jadi harus ada jalan
  // keluar tanpa harus mencari tombolnya.
  useEffect(() => {
    if (!buka) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setBuka(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [buka]);

  const muatLagi = useCallback(async () => {
    const kursor = isi?.kursorBerikut;
    if (!kursor || memuatLagi) return;
    const satkerDiminta = satker;
    const nomor = generasi.current;
    setMemuatLagi(true);
    setGalatLagi(false);
    try {
      const qs = `sebelum=${encodeURIComponent(kursor)}${satkerDiminta ? `&satker=${encodeURIComponent(satkerDiminta)}` : ""}`;
      const r = await fetch(`/api/kabar?${qs}`);
      if (nomor !== generasi.current) return;
      if (!r.ok) {
        setGalatLagi(true);
        return;
      }
      const d = (await r.json()) as { aktivitas: BarisTerkirim[]; kursorBerikut: string | null };
      // Panel dibuka ulang / penyaring berubah selama menunggu: halaman ini
      // milik tampilan lama.
      if (nomor !== generasi.current) return;
      setIsi((lama) =>
        lama ? { ...lama, aktivitas: [...lama.aktivitas, ...d.aktivitas], kursorBerikut: d.kursorBerikut } : lama
      );
    } catch {
      if (nomor === generasi.current) setGalatLagi(true);
    } finally {
      if (nomor === generasi.current) setMemuatLagi(false);
    }
  }, [isi?.kursorBerikut, memuatLagi, satker]);

  const opsiSatker = useMemo(
    () => (isi?.daftarSatker ?? []).map((s) => ({ value: s, label: s })),
    [isi?.daftarSatker]
  );

  // PEGAWAI tidak punya panel ini (ditolak di server). Tombol yang muncul tapi
  // selalu kosong itu dead-end - pola yang sama sudah diperbaiki di tombol
  // approval untuk PIMPINAN.
  if (!tampilkan) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setBuka((v) => !v)}
        aria-label="Notifikasi & aktivitas"
        aria-expanded={buka}
        className="fixed right-4 top-3 z-30 grid size-10 place-items-center rounded-xl border border-line bg-surface text-ink-2 shadow-[0_2px_10px_rgba(19,65,107,0.10)] transition hover:border-teal hover:text-navy print:hidden"
      >
        <svg viewBox="0 0 24 24" className="size-[19px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {jumlahLencana > 0 && (
          <span className="absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-red px-1 font-mono text-xs font-bold leading-5 text-white">
            {jumlahLencana > 9 ? "9+" : jumlahLencana}
          </span>
        )}
      </button>

      {buka && <div className="fixed inset-0 z-40 bg-black/20 print:hidden" onClick={() => setBuka(false)} />}

      <aside
        aria-label="Kabar"
        inert={!buka}
        className={`fixed inset-y-0 right-0 z-50 w-[320px] max-w-[85vw] overflow-y-auto border-l border-line bg-surface transition-[transform,visibility] duration-200 print:hidden ${
          buka ? "visible translate-x-0" : "invisible translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-2">
          <p className="text-sm font-extrabold text-navy">Kabar</p>
          <button
            ref={tombolTutup}
            type="button"
            onClick={() => setBuka(false)}
            aria-label="Tutup"
            className="grid size-11 place-items-center rounded-lg text-muted transition hover:bg-line-2 hover:text-navy"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Cakupan disebut TERANG-TERANGAN. Tanpa ini, orang unit lain yang
            melihat daftar pendek mengira sistemnya sepi, padahal memang
            dibatasi. */}
        {isi?.satkerScope && (
          <p className="border-b border-line bg-surface-2 px-4 py-2 text-xs font-semibold text-muted">
            Lingkup: {isi.satkerScope}
          </p>
        )}

        {/* Penyaring unit - cuma buat yang memang berwenang lintas satker.
            PPABP memproses pembayaran SELURUH unit, jadi daftarnya bercampur;
            ini yang memungkinkan mereka menelusuri satu unit tanpa kehilangan
            jangkauannya. */}
        {isi && !isi.satkerScope && opsiSatker.length > 0 && (
          <div className="border-b border-line bg-surface-2 px-4 py-2.5">
            <span className="field-label">Saring per satuan kerja</span>
            <SearchableSelect
              name="satkerKabar"
              options={opsiSatker}
              defaultValue={isi.satkerPilih ?? ""}
              emptyLabel="Semua satuan kerja"
              placeholder="Ketik nama unit..."
              onValueChange={setSatker}
            />
          </div>
        )}

        {memuat && <p className="px-4 py-6 text-sm text-muted">Memuat...</p>}

        {isi && !memuat && (
          <DaftarKabar
            isi={isi}
            memuatLagi={memuatLagi}
            galatLagi={galatLagi}
            onMuatLagi={muatLagi}
            onNavigasi={() => setBuka(false)}
          />
        )}

        {!isi && !memuat && galat && (
          <div role="alert" className="px-4 py-6">
            <p className="text-sm font-semibold text-red">Kabar tidak dapat dimuat.</p>
            <button
              type="button"
              onClick={() => setPercobaan((n) => n + 1)}
              className="mt-3 h-11 w-full rounded-lg border border-line bg-surface text-sm font-semibold text-navy transition hover:border-teal"
            >
              Coba lagi
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
