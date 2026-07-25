import type { Role } from "@prisma/client";

/** Label buat ditampilkan di UI - lihat CLAUDE.md bagian "Role matrix" untuk cakupan akses tiap role. */
export const LABEL_ROLE: Record<Role, string> = {
  PEGAWAI: "Pegawai",
  KASUBAG_TU: "Kasubag TU",
  PPABP: "PPABP",
  BIRO_OSDMA: "Biro OSDMA",
  ADMIN_SISTEM: "Admin Sistem",
  ITJEN: "Itjen",
  PIMPINAN: "Pimpinan",
};
