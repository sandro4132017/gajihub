// Tautan bukti koreksi jam presensi - satu per sisi yang punya berkas.
// Dipakai halaman presensi pegawai (Kasubag TU/PPABP) dan "Presensi saya".

import { TombolBukti, type JenisBukti } from "./PenampilBukti";

export interface BuktiKoreksiRef {
  id: string;
  buktiRef: string | null;
  buktiRefKeluar: string | null;
  buktiRefLembur: string | null;
}

const SISI = [
  { sisi: "masuk", kolom: "buktiRef", label: "Bukti masuk" },
  { sisi: "keluar", kolom: "buktiRefKeluar", label: "Bukti pulang" },
  { sisi: "lembur", kolom: "buktiRefLembur", label: "Bukti lembur" },
] as const;

export interface TautanBukti {
  sisi: string;
  label: string;
  href: string;
  /** Dari ekstensi berkas tersimpan - menentukan penampil di pop up. */
  jenis: JenisBukti;
}

/** Daftar tautan yang ada; kosong bila koreksi tidak punya berkas apa pun. */
export function daftarTautanBukti(k: BuktiKoreksiRef): TautanBukti[] {
  return SISI.filter((s) => !!k[s.kolom]).map((s) => ({
    sisi: s.sisi,
    label: s.label,
    href: `/berkas/koreksi-presensi/${k.id}?sisi=${s.sisi}`,
    jenis: /\.pdf$/i.test(k[s.kolom] ?? "") ? "pdf" : "gambar",
  }));
}

export function TautanBuktiKoreksi({
  koreksi,
  className = "link",
  kosong,
}: {
  koreksi: BuktiKoreksiRef;
  className?: string;
  /** Ditampilkan bila tidak ada berkas sama sekali. */
  kosong?: React.ReactNode;
}) {
  const daftar = daftarTautanBukti(koreksi);
  if (daftar.length === 0) return <>{kosong ?? null}</>;
  return (
    <>
      {/* Dibuka di pop up, bukan tab baru (permintaan user 2026-11-16). */}
      {daftar.map((t) => (
        <TombolBukti key={t.sisi} label={t.label} href={t.href} jenis={t.jenis} className={className} />
      ))}
    </>
  );
}
