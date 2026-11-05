import type { Pegawai, User } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { NIP_PENGUJI, SUMBER_DUMMY } from "../lib/dataUji";

/** Jabatan yang tampil di sesi akun penguji. */
export const JABATAN_PENGUJI = "Tim Pusdatik";

export type HasilAkunPenguji =
  | { status: "ok"; user: User; pegawai: Pegawai }
  | { status: "belum" }
  | { status: "nonaktif" };

/**
 * Akun penguji hanya sah bila akun User DAN pegawai uji (penanda DUMMY_UJI)
 * ber-NIP penguji sudah ada di database server ini (disiapkan oleh
 * `npm run seed:uji`). Tidak membuat apa pun secara otomatis: tanpa data itu
 * login penguji tidak lolos walau konfigurasinya terisi.
 */
export async function cariAkunPenguji(): Promise<HasilAkunPenguji> {
  const user = await prisma.user.findUnique({ where: { nip: NIP_PENGUJI } });
  const pegawai = await prisma.pegawai.findUnique({ where: { nip: NIP_PENGUJI } });
  if (!user || !pegawai || pegawai.sourceSystem !== SUMBER_DUMMY) return { status: "belum" };
  if (!user.aktif) return { status: "nonaktif" };
  return { status: "ok", user, pegawai };
}

export const PESAN_PENGUJI_BELUM_SIAP = "Akun penguji belum disiapkan di server ini.";
export const PESAN_PENGUJI_NONAKTIF = "Akun penguji sedang dinonaktifkan. Hubungi Admin Gajihub.";
