"use server";

import { revalidatePath } from "next/cache";
import fs from "fs/promises";
import path from "path";
import { prisma } from "../../lib/prisma";
import { ambilUserSesi } from "../../auth/getSessionAccount";
import { canKelolaAssignmentRole, canKonfigurasiAdapter, type AuthUser } from "../../auth/permissions";
import { getModeJaringan, type ModeJaringan } from "../../auth/modeJaringan";

export interface UbahModeJaringanResult {
  ok: boolean;
  mode: ModeJaringan;
  pesan?: string;
  error?: string;
}

export async function ubahModeJaringanAction(
  modeTarget: ModeJaringan
): Promise<UbahModeJaringanResult> {
  const user = await ambilUserSesi();
  if (!user) {
    return { ok: false, mode: getModeJaringan(), error: "Sesi telah berakhir. Silakan login kembali." };
  }

  const authUser: AuthUser = {
    nip: user.nip,
    role: user.role,
    satuanKerja: user.satuanKerja,
    aktif: user.aktif,
  };

  if (!canKelolaAssignmentRole(authUser) && !canKonfigurasiAdapter(authUser)) {
    return { ok: false, mode: getModeJaringan(), error: "Hanya Admin yang berwenang mengubah mode jaringan." };
  }

  const modeBaru: ModeJaringan = modeTarget === "PUBLIC" ? "PUBLIC" : "INTERNAL";
  const modeSebelumnya = getModeJaringan();

  // 1. Update di memori proses server secara real-time (tanpa perlu restart)
  process.env.NETWORK_MODE = modeBaru;

  // 2. Simpan ke berkas .env agar tetap bertahan saat server di-restart.
  //
  // DITULIS ATOMIK - berkas sementara lalu `rename`, BUKAN menimpa .env
  // langsung. Berkas itu memuat SELURUH kredensial aplikasi: DATABASE_URL,
  // SIAP, e-Presensi, BSrE, SESSION_SECRET. Penulisan langsung yang terputus
  // di tengah (proses dibunuh, disk penuh) meninggalkan .env TERPOTONG, dan
  // aplikasinya tidak bisa hidup lagi sampai seseorang menyusunnya dari nol.
  // `rename` pada filesystem yang sama bersifat atomik: entah berhasil utuh,
  // entah berkas lamanya tetap apa adanya.
  //
  // KEGAGALANNYA DILAPORKAN, TIDAK DITELAN. Tanpa ini Admin melihat
  // "berhasil" padahal modenya hanya berubah di memori proses, lalu kembali
  // sendiri begitu pm2 me-restart - gejala yang nyaris mustahil ditebak
  // sebabnya karena tidak ada satu pun pesan galat yang muncul.
  let peringatan = "";
  const envPath = path.join(process.cwd(), ".env");
  try {
    const envRaw = await fs.readFile(envPath, "utf8");
    let envUpdated: string;
    if (/^NETWORK_MODE\s*=/m.test(envRaw)) {
      envUpdated = envRaw.replace(/^NETWORK_MODE\s*=.*$/m, `NETWORK_MODE="${modeBaru}"`);
    } else {
      // Akhiran baris mengikuti berkasnya - .env ber-CRLF tidak boleh
      // disisipi satu baris ber-LF tunggal.
      const akhiran = envRaw.includes("\r\n") ? "\r\n" : "\n";
      envUpdated = `${envRaw.trimEnd()}${akhiran}NETWORK_MODE="${modeBaru}"${akhiran}`;
    }
    const tmpPath = `${envPath}.tmp-${process.pid}`;
    await fs.writeFile(tmpPath, envUpdated, "utf8");
    await fs.rename(tmpPath, envPath);
  } catch {
    peringatan =
      " PERINGATAN: gagal menyimpan ke .env, jadi mode ini HANYA berlaku sampai" +
      " server di-restart. Setel NETWORK_MODE secara manual di .env.";
  }

  // 3. Catat ke AuditTrail
  try {
    await prisma.auditTrail.create({
      data: {
        entitas: "mode_jaringan",
        entitasId: "NETWORK_MODE",
        aksi: "UPDATE",
        aktor: user.nip,
        dataSebelum: { mode: modeSebelumnya },
        dataSesudah: { mode: modeBaru },
      },
    });
  } catch {
    // Abaikan jika gagal mencatat audit
  }

  revalidatePath("/admin");
  revalidatePath("/admin/sistem");
  revalidatePath("/login");

  return {
    ok: true,
    mode: modeBaru,
    pesan:
      (modeBaru === "INTERNAL"
        ? "Mode Jaringan Internal (Intranet / VPN) diaktifkan. Redirect publik dinonaktifkan & login NIP internal dibuka."
        : "Mode Akses Publik (gajihub.kemnaker.go.id) diaktifkan. Redirect publik & penguncian SSO Kemnaker berlaku kembali.") +
      peringatan,
  };
}
