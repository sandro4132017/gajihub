import type { Role } from "@prisma/client";

/**
 * Role yang berhak atas panel Kabar: isinya merangkum aktivitas banyak
 * pegawai. DAFTAR DIIZINKAN - PEGAWAI dan KEPALA_TIM tidak mendapat panel,
 * dan role baru tidak otomatis ikut.
 */
export const ROLE_PANEL_KABAR: readonly Role[] = ["KASUBAG_TU", "OSDMA", "PPABP", "PIMPINAN", "ADMIN"];
