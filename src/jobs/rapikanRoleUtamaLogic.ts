// Logika job `rapikan:role-utama`: SEKALI JALAN merapikan Role Utama (User.role)
// semua akun menjadi role tertinggi yang dimiliki menurut URUTAN_ROLE_BAWAAN
// (Pimpinan > Kasubag TU > PPABP > OSDMA > Pegawai > Admin; Admin hanya bila
// satu-satunya). Keputusan user 2026-11-11: dirapikan otomatis sekarang,
// sesudahnya Role Utama tetap boleh diubah MANUAL di Kelola Role.
//
// Tidak ada role yang hilang: role utama lama dipindah ke role tambahan, dan
// role PEGAWAI tetap wajib bagi akun yang punya data Pegawai. Himpunan role
// akun TIDAK berubah, jadi hak akses tidak berubah dan sesi tidak diputus.
//
// Murni kecuali `jalankanRapikanRoleUtama` - dipisah supaya bisa diuji tanpa DB.
import type { Role } from "@prisma/client";
import { pilihRoleBawaan } from "../auth/roleAktif";
import { lengkapiRolePegawai } from "../auth/rolePegawaiWajib";

export const UKURAN_BATCH = 500;

export interface AkunRoleUtama {
  id: string;
  nip: string;
  role: Role;
  rolesTambahan: Role[];
  satuanKerja: string | null;
}

export interface PerubahanRoleUtama {
  id: string;
  roleSebelum: Role;
  rolesTambahanSebelum: Role[];
  roleBaru: Role;
  rolesTambahanBaru: Role[];
  /** Kasubag TU tanpa satuan kerja - tetap dirapikan, tapi dilaporkan. */
  kasubagTanpaUnit: boolean;
}

/** Murni: hasil rapikan satu akun, atau null kalau Role Utamanya sudah benar. */
export function rapikanSatuAkun(a: AkunRoleUtama, punyaDataPegawai: boolean): PerubahanRoleUtama | null {
  const roleBaru = pilihRoleBawaan({ role: a.role, rolesTambahan: a.rolesTambahan });
  if (roleBaru === a.role) return null;
  const semua: Role[] = [];
  for (const r of [a.role, ...(a.rolesTambahan ?? [])]) if (!semua.includes(r)) semua.push(r);
  const rolesTambahanBaru = lengkapiRolePegawai(
    { role: roleBaru, rolesTambahan: semua.filter((r) => r !== roleBaru) },
    punyaDataPegawai
  );
  return {
    id: a.id,
    roleSebelum: a.role,
    rolesTambahanSebelum: a.rolesTambahan,
    roleBaru,
    rolesTambahanBaru,
    kasubagTanpaUnit: roleBaru === "KASUBAG_TU" && !a.satuanKerja,
  };
}

export function pilihAkunPerluDirapikan(
  akun: readonly AkunRoleUtama[],
  nipPegawai: ReadonlySet<string>
): PerubahanRoleUtama[] {
  const hasil: PerubahanRoleUtama[] = [];
  for (const a of akun) {
    const p = rapikanSatuAkun(a, nipPegawai.has(a.nip));
    if (p) hasil.push(p);
  }
  return hasil;
}

/** Jumlah per perpindahan, mis. { "PEGAWAI -> KASUBAG_TU": 12 }. */
export function hitungPerpindahan(perubahan: readonly PerubahanRoleUtama[]): Record<string, number> {
  const hasil: Record<string, number> = {};
  for (const p of perubahan) {
    const k = `${p.roleSebelum} -> ${p.roleBaru}`;
    hasil[k] = (hasil[k] ?? 0) + 1;
  }
  return hasil;
}

export interface DbJobRoleUtama {
  user: { findMany(args: unknown): Promise<AkunRoleUtama[]>; update(args: unknown): unknown };
  pegawai: { findMany(args: unknown): Promise<{ nip: string }[]> };
  auditTrail: { create(args: unknown): unknown };
  $transaction(ops: unknown[]): Promise<unknown>;
}

export interface HasilJobRoleUtama {
  perluDirapikan: number;
  perPerpindahan: Record<string, number>;
  kasubagTanpaUnit: number;
  ditulis: number;
}

/** Bawaan UJI KERING; menulis hanya bila `terapkan`. Idempoten. Log cuma jumlah. */
export async function jalankanRapikanRoleUtama(
  db: DbJobRoleUtama,
  terapkan: boolean,
  log: (s: string) => void = console.log
): Promise<HasilJobRoleUtama> {
  const [akun, pegawai] = await Promise.all([
    db.user.findMany({ select: { id: true, nip: true, role: true, rolesTambahan: true, satuanKerja: true } }),
    db.pegawai.findMany({ select: { nip: true } }),
  ]);
  const perubahan = pilihAkunPerluDirapikan(akun, new Set(pegawai.map((p) => p.nip)));
  const perPerpindahan = hitungPerpindahan(perubahan);
  const kasubagTanpaUnit = perubahan.filter((p) => p.kasubagTanpaUnit).length;

  log(
    terapkan
      ? "MODE TERAPKAN - Role Utama akan ditulis ke database."
      : "UJI KERING - tidak ada yang ditulis. Tambahkan --terapkan untuk menyimpan."
  );
  log(`Akun diperiksa: ${akun.length}; Role Utama perlu dirapikan: ${perubahan.length}`);
  for (const [k, n] of Object.entries(perPerpindahan)) log(`  ${k}: ${n}`);
  if (kasubagTanpaUnit > 0) {
    log(`  Perhatian: ${kasubagTanpaUnit} akun jadi Kasubag TU tetapi satuan kerjanya kosong - isi di Kelola Role.`);
  }

  let ditulis = 0;
  if (terapkan) {
    for (let i = 0; i < perubahan.length; i += UKURAN_BATCH) {
      const potong = perubahan.slice(i, i + UKURAN_BATCH);
      const ops = potong.flatMap((p) => [
        db.user.update({ where: { id: p.id }, data: { role: p.roleBaru, rolesTambahan: p.rolesTambahanBaru } }),
        db.auditTrail.create({
          data: {
            entitas: "app_user",
            entitasId: p.id,
            aksi: "UPDATE",
            aktor: "SYSTEM",
            dataSebelum: { role: p.roleSebelum, rolesTambahan: p.rolesTambahanSebelum },
            dataSesudah: {
              role: p.roleBaru,
              rolesTambahan: p.rolesTambahanBaru,
              sumber: "Job rapikan:role-utama (Role Utama = role tertinggi)",
            },
          },
        }),
      ]);
      await db.$transaction(ops);
      ditulis += potong.length;
    }
    log(`Selesai: ${ditulis} akun dirapikan.`);
  }
  return { perluDirapikan: perubahan.length, perPerpindahan, kasubagTanpaUnit, ditulis };
}
