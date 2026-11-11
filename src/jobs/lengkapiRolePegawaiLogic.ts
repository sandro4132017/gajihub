// Logika job `lengkapi:role-pegawai`: akun yang NIP-nya ada di tabel Pegawai
// wajib punya role PEGAWAI (src/auth/rolePegawaiWajib.ts). Dipisah dari
// pembungkus CLI supaya bisa diuji tanpa database.
import type { Role } from "@prisma/client";
import { kekuranganRolePegawai, lengkapiRolePegawai } from "../auth/rolePegawaiWajib";

export const UKURAN_BATCH = 500;

export interface AkunRole {
  id: string;
  nip: string;
  role: Role;
  rolesTambahan: Role[];
}

export interface Perubahan {
  id: string;
  role: Role;
  rolesTambahanSebelum: Role[];
  rolesTambahanBaru: Role[];
}

/** Murni: akun yang punya data Pegawai tetapi belum punya role PEGAWAI, beserta tambahan barunya. */
export function pilihAkunPerluDilengkapi(akun: readonly AkunRole[], nipPegawai: ReadonlySet<string>): Perubahan[] {
  const hasil: Perubahan[] = [];
  for (const a of akun) {
    const punya = nipPegawai.has(a.nip);
    if (!kekuranganRolePegawai(a, punya)) continue;
    hasil.push({
      id: a.id,
      role: a.role,
      rolesTambahanSebelum: a.rolesTambahan,
      rolesTambahanBaru: lengkapiRolePegawai(a, punya),
    });
  }
  return hasil;
}

export function hitungPerRole(perubahan: readonly Perubahan[]): Record<string, number> {
  const hasil: Record<string, number> = {};
  for (const p of perubahan) hasil[p.role] = (hasil[p.role] ?? 0) + 1;
  return hasil;
}

/** Bagian prisma yang dipakai job - diketik sempit supaya mudah di-mock. */
export interface DbJob {
  user: { findMany(args: unknown): Promise<AkunRole[]>; update(args: unknown): unknown };
  pegawai: { findMany(args: unknown): Promise<{ nip: string }[]> };
  auditTrail: { create(args: unknown): unknown };
  $transaction(ops: unknown[]): Promise<unknown>;
}

export interface HasilJob {
  perluDilengkapi: number;
  perRole: Record<string, number>;
  ditulis: number;
}

/**
 * Bawaan UJI KERING: hanya membaca. Menulis hanya bila `terapkan` true.
 * Idempoten: akun yang sudah punya PEGAWAI tidak dipilih lagi. Log cuma jumlah.
 */
export async function jalankanLengkapiRolePegawai(
  db: DbJob,
  terapkan: boolean,
  log: (s: string) => void = console.log
): Promise<HasilJob> {
  const [akun, pegawai] = await Promise.all([
    db.user.findMany({ select: { id: true, nip: true, role: true, rolesTambahan: true } }),
    db.pegawai.findMany({ select: { nip: true } }),
  ]);
  const perubahan = pilihAkunPerluDilengkapi(akun, new Set(pegawai.map((p) => p.nip)));
  const perRole = hitungPerRole(perubahan);

  log(
    terapkan
      ? "MODE TERAPKAN - role akan ditulis ke database."
      : "UJI KERING - tidak ada yang ditulis. Tambahkan --terapkan untuk menyimpan."
  );
  log(`Akun diperiksa: ${akun.length}; punya data Pegawai tetapi belum punya role PEGAWAI: ${perubahan.length}`);
  for (const [role, jumlah] of Object.entries(perRole)) log(`  role utama ${role}: ${jumlah}`);

  let ditulis = 0;
  if (terapkan) {
    for (let i = 0; i < perubahan.length; i += UKURAN_BATCH) {
      const potong = perubahan.slice(i, i + UKURAN_BATCH);
      const ops = potong.flatMap((p) => [
        db.user.update({ where: { id: p.id }, data: { rolesTambahan: p.rolesTambahanBaru } }),
        // Satu jejak per akun: entitasId = id internal, bukan NIP.
        db.auditTrail.create({
          data: {
            entitas: "app_user",
            entitasId: p.id,
            aksi: "UPDATE",
            aktor: "SYSTEM",
            dataSebelum: { rolesTambahan: p.rolesTambahanSebelum },
            dataSesudah: { rolesTambahan: p.rolesTambahanBaru, sumber: "Job lengkapi:role-pegawai (role PEGAWAI wajib)" },
          },
        }),
      ]);
      await db.$transaction(ops);
      ditulis += potong.length;
    }
    log(`Selesai: ${ditulis} akun dilengkapi.`);
  }
  return { perluDilengkapi: perubahan.length, perRole, ditulis };
}
