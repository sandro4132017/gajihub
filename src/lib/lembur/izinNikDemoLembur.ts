// Kapan NIK demo BSrE boleh dipakai untuk menandatangani dokumen lembur
// (surat tugas harian & SPKL bulanan).
//
// Bawaannya TIDAK PERNAH: tanda tangan lembur melekat pada orang dan langsung
// menentukan jam lembur yang dibayar. Pengecualian hanya untuk akun uji coba,
// dan keduanya tetap butuh sakelar TTE_IZINKAN_NIK_DEMO="true" di server:
// - unit uji akun penguji (pegawai DUMMY_UJI, disaring dari semua berkas ADK);
// - akun dev (NIP = DEV_AUTH_NIP), keputusan user 2026-11-20 supaya developer
//   bisa mencoba sisi Kepala Tim tanpa SSO.
// PERINGATAN: perintah dari akun dev menyasar pegawai SUNGGUHAN satkernya.
// Matikan TTE_IZINKAN_NIK_DEMO (atau DEV_AUTH_*) di server yang datanya dipakai
// untuk membayar. TODO(confirm): cabut pengecualian akun dev sebelum go-live.

import { SATKER_DUMMY } from "../dataUji";
import { izinkanNikDemo, NIK_DEMO_BSRE } from "../tte/simulasiTte";

type Env = Record<string, string | undefined>;

function bersih(v: string | undefined): string {
  return (v ?? "").trim().replace(/^["']|["']$/g, "");
}

export function izinkanNikDemoLembur(
  penandatangan: { satuanKerja: string | null | undefined; nip: string | null | undefined },
  env: Env = process.env
): boolean {
  if (!izinkanNikDemo(NIK_DEMO_BSRE, env)) return false;
  if (penandatangan.satuanKerja?.trim() === SATKER_DUMMY) return true;
  const nipDev = bersih(env.DEV_AUTH_NIP);
  return nipDev !== "" && penandatangan.nip?.trim() === nipDev;
}
