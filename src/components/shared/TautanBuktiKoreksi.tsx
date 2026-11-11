// Tautan bukti koreksi jam presensi - satu per sisi yang punya berkas.
// Dipakai halaman presensi pegawai (Kasubag TU/PPABP) dan "Presensi saya".

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

/** Daftar tautan yang ada; kosong bila koreksi tidak punya berkas apa pun. */
export function daftarTautanBukti(k: BuktiKoreksiRef): { sisi: string; label: string; href: string }[] {
  return SISI.filter((s) => !!k[s.kolom]).map((s) => ({
    sisi: s.sisi,
    label: s.label,
    href: `/berkas/koreksi-presensi/${k.id}?sisi=${s.sisi}`,
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
      {daftar.map((t) => (
        <a key={t.sisi} href={t.href} target="_blank" rel="noopener noreferrer" className={className}>
          {t.label}
        </a>
      ))}
    </>
  );
}
