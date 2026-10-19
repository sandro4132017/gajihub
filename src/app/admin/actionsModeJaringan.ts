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

  // 2. Simpan ke berkas .env agar tetap bertahan saat server di-restart
  try {
    const envPath = path.join(process.cwd(), ".env");
    const envRaw = await fs.readFile(envPath, "utf8").catch(() => "");
    if (envRaw) {
      let envUpdated: string;
      if (/^NETWORK_MODE\s*=/m.test(envRaw)) {
        envUpdated = envRaw.replace(/^NETWORK_MODE\s*=.*$/m, `NETWORK_MODE="${modeBaru}"`);
      } else {
        envUpdated = `${envRaw.trimEnd()}\nNETWORK_MODE="${modeBaru}"\n`;
      }
      await fs.writeFile(envPath, envUpdated, "utf8");
    }
  } catch {
    // Jika filesystem read-only, perubahan tetap berlaku di memori proses saat ini
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
      modeBaru === "INTERNAL"
        ? "Mode Jaringan Internal (Intranet / VPN) diaktifkan. Redirect publik dinonaktifkan & login NIP internal dibuka."
        : "Mode Akses Publik (gajihub.kemnaker.go.id) diaktifkan. Redirect publik & penguncian SSO Kemnaker berlaku kembali.",
  };
}

