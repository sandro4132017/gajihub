/** Bagian murni penyaringan anggota tim (tanpa prisma, supaya mudah diuji). */

export interface KandidatAnggota {
  id: string;
  statusPegawai: string;
}

/** Keluarkan kepala tim sendiri dan pegawai yang statusnya bukan AKTIF. */
export function saringAnggotaTim<T extends KandidatAnggota>(
  kandidat: T[],
  kepalaTimPegawaiId: string,
): T[] {
  return kandidat.filter((p) => p.id !== kepalaTimPegawaiId && p.statusPegawai === "AKTIF");
}
