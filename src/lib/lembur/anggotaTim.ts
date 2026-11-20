import type { PrismaClient } from "@prisma/client";
import { pegawaiBukanUji } from "../dataUji";
import { saringAnggotaTim } from "./saringAnggotaTim";

export { saringAnggotaTim };

/**
 * Anggota tim seorang kepala tim.
 *
 * Pilot = SEMUA pegawai aktif satker yang sama (satker dari Pegawai kepala
 * tim, lewat NIP user, bukan User.satuanKerja). Ini SATU-SATUNYA titik yang
 * diganti kalau nanti ada tabel anggota tim.
 */
export async function anggotaTimUntuk(prisma: PrismaClient, kepalaTim: { nip: string }) {
  const kepala = await prisma.pegawai.findUnique({
    where: { nip: kepalaTim.nip },
    select: { id: true, satuanKerja: true },
  });
  if (!kepala) return [];
  const semua = await prisma.pegawai.findMany({
    // Aktif dan bukan pegawai uji disaring di database; `saringAnggotaTim`
    // tetap dipakai sebagai lapis kedua (murni, teruji).
    where: { satuanKerja: kepala.satuanKerja, statusPegawai: "AKTIF", ...pegawaiBukanUji(kepala.satuanKerja) },
    select: {
      id: true,
      nip: true,
      nama: true,
      jabatan: true,
      gelarDepan: true,
      gelarBelakang: true,
      statusPegawai: true,
    },
    orderBy: { nama: "asc" },
  });
  return saringAnggotaTim(semua, kepala.id);
}
