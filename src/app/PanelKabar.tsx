"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SearchableSelect } from "./SearchableSelect";
import type { IsiPanelKabar } from "./kabarData";

/**
 * Panel kanan Notifikasi & Aktivitas - TIDAK permanen, dibuka lewat tombol.
 *
 * KENAPA TIDAK PERMANEN: hampir semua halaman di sini bertabel lebar (rincian
 * tukin 12 kolom, grid ADK 33 kolom). Panel tetap selebar ~320px memakan ruang
 * yang justru paling dibutuhkan, dan isinya bukan sesuatu yang perlu dipelototi
 * terus-menerus.
 *
 * ISINYA DIAMBIL SAAT DIBUKA, bukan saat halaman dirender: kalau ikut tiap
 * render, setiap halaman menanggung 4 query tambahan hanya untuk panel yang
 * mungkin tidak pernah dibuka.
 */
function waktuRelatif(iso: string): string {
  const detik = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (detik < 60) return "Baru saja";
  if (detik < 3600) return `${Math.floor(detik / 60)} menit lalu`;
  if (detik < 86400) return `${Math.floor(detik / 3600)} jam lalu`;
  const hari = Math.floor(detik / 86400);
  if (hari < 7) return `${hari} hari lalu`;
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
}

type IsiTerkirim = Omit<IsiPanelKabar, "aktivitas"> & {
  aktivitas: (Omit<IsiPanelKabar["aktivitas"][number], "waktu"> & { waktu: string })[];
};

export function PanelKabar({ tampilkan }: { tampilkan: boolean }) {
  const [buka, setBuka] = useState(false);
  const [isi, setIsi] = useState<IsiTerkirim | null>(null);
  const [memuat, setMemuat] = useState(false);
  // Penyaring unit buat pemakai lintas satker (PPABP, OSDMA, Pimpinan, Admin).
  // "" = semua satuan kerja. Server tetap yang menentukan boleh atau tidak -
  // ini cuma mempersempit.
  const [satker, setSatker] = useState("");

  useEffect(() => {
    if (!buka) return;
    let batal = false;
    setMemuat(true);
    fetch(`/api/kabar${satker ? `?satker=${encodeURIComponent(satker)}` : ""}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !batal && setIsi(d))
      .catch(() => !batal && setIsi(null))
      .finally(() => !batal && setMemuat(false));
    // Sengaja mengambil ulang tiap kali dibuka (bukan sekali lalu di-cache):
    // isi panel ini justru yang paling cepat basi - approval & ekspor terjadi
    // sambil halamannya dibiarkan terbuka.
    return () => {
      batal = true;
    };
  }, [buka, satker]);

  // Esc menutup - panel ini menumpuk di atas konten, jadi harus ada jalan
  // keluar tanpa harus mencari tombolnya.
  useEffect(() => {
    if (!buka) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setBuka(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [buka]);

  const jumlahNotif = isi?.notifikasi.length ?? 0;
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
        {jumlahNotif > 0 && (
          <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-red text-[10px] font-extrabold text-white">
            {jumlahNotif}
          </span>
        )}
      </button>

      {buka && <div className="fixed inset-0 z-40 bg-black/20 print:hidden" onClick={() => setBuka(false)} />}

      <aside
        className={`fixed inset-y-0 right-0 z-50 w-[320px] max-w-[85vw] overflow-y-auto border-l border-line bg-surface transition-transform duration-200 print:hidden ${
          buka ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <p className="text-sm font-extrabold text-navy">Kabar</p>
          <button
            type="button"
            onClick={() => setBuka(false)}
            aria-label="Tutup"
            className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-line-2 hover:text-navy"
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
          <p className="border-b border-line bg-surface-2 px-4 py-2 text-[11px] font-semibold text-muted">
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
          <div className="px-4 pb-8">
            <p className="pb-1 pt-4 text-sm font-bold text-navy">Notifikasi</p>
            {isi.notifikasi.length === 0 && (
              <p className="py-2 text-xs text-muted">Tidak ada yang perlu ditangani.</p>
            )}
            {isi.notifikasi.map((n) => (
              <Link
                key={n.id}
                href={n.href}
                onClick={() => setBuka(false)}
                className="mt-2 flex gap-2.5 rounded-xl border border-line p-2.5 transition hover:border-teal"
              >
                <span
                  className={`mt-0.5 grid size-7 flex-none place-items-center rounded-lg ${
                    n.nada === "danger" ? "bg-red-tint text-red" : "bg-gold-tint text-gold-deep"
                  }`}
                >
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M12 8v5" />
                    <path d="M12 17h.01" />
                  </svg>
                </span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-bold text-ink">{n.teks}</span>
                  <span className="block text-[11px] leading-snug text-muted">{n.keterangan}</span>
                </span>
              </Link>
            ))}

            <p className="pb-1 pt-5 text-sm font-bold text-navy">Aktivitas</p>
            {isi.aktivitas.length === 0 && (
              <p className="py-2 text-xs text-muted">
                {isi.satkerPilih
                  ? `Belum ada aktivitas tercatat untuk ${isi.satkerPilih}.`
                  : "Belum ada aktivitas tercatat."}
              </p>
            )}
            <ul className="mt-1">
              {isi.aktivitas.map((a, i) => (
                <li key={a.id} className="flex gap-2.5">
                  {/* Garis waktu: titik + garis penyambung, kecuali baris terakhir. */}
                  <span className="flex flex-none flex-col items-center">
                    <span className="mt-1.5 size-2 rounded-full bg-biru" />
                    {i < isi.aktivitas.length - 1 && <span className="w-px flex-1 bg-line" />}
                  </span>
                  <span className="min-w-0 pb-3">
                    <span className="block text-[12.5px] font-semibold text-ink">{a.teks}</span>
                    <span className="block text-[11px] text-muted">
                      {a.aktor} &middot; {waktuRelatif(a.waktu)}
                      {/* Unit disebut per baris cuma kalau daftarnya memang
                          bercampur - kalau sudah disaring, mengulanginya di
                          tiap baris tidak menambah keterangan apa pun. */}
                      {!isi.satkerScope && !isi.satkerPilih && a.satuanKerja ? ` · ${a.satuanKerja}` : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!isi && !memuat && <p className="px-4 py-6 text-sm text-muted">Tidak ada kabar untuk ditampilkan.</p>}
      </aside>
    </>
  );
}
