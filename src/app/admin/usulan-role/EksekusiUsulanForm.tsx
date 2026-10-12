"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SearchableSelect } from "../../SearchableSelect";

export function EksekusiUsulanForm({
  usulanId,
  butuhSatuanKerja,
  satuanKerjaList,
  satuanKerjaDefault,
}: {
  usulanId: string;
  /** true kalau role yang diusulkan KASUBAG_TU - unit akun WAJIB diisi. */
  butuhSatuanKerja: boolean;
  satuanKerjaList: string[];
  /** Prefill: unit akun sekarang, atau kalau kosong unit data pegawainya. */
  satuanKerjaDefault: string;
}) {
  const router = useRouter();
  const [satuanKerja, setSatuanKerja] = useState(satuanKerjaDefault);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (success) {
    return <p className="mt-3 text-xs font-semibold text-green">{success}</p>;
  }

  async function kirim(keputusan: "EKSEKUSI" | "TOLAK") {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/usulan-role/eksekusi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usulanId, keputusan, satuanKerja }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "Gagal memproses usulan");
      } else {
        setSuccess(data.success || "Berhasil");
        router.refresh();
      }
    } catch (err) {
      setError(`Gagal menghubungi server: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-3 border-t border-line-2 pt-3">
      {/* Ini yang dulu bikin akun "buta unit": eksekusi mengubah role jadi
          Kasubag TU tanpa pernah mengisi User.satuanKerja, jadi akunnya
          langsung tidak bisa lihat unit manapun. Sekarang unitnya diminta
          di sini juga (default: unit data pegawainya sendiri). */}
      {butuhSatuanKerja && (
        <div className="mb-3 max-w-md">
          <label className="field-label">Unit kerja untuk akun ini (wajib buat Kasubag TU)</label>
          <SearchableSelect
            name="satuanKerja"
            options={satuanKerjaList.map((s) => ({ value: s, label: s }))}
            defaultValue={satuanKerjaDefault}
            onValueChange={setSatuanKerja}
            required
          />
          <p className="mt-1 text-[11px] text-muted">
            Tanpa unit, akun ber-role Kasubag TU tidak bisa melihat data apa pun.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => kirim("EKSEKUSI")}
          disabled={pending}
          className="btn btn-primary btn-sm"
        >
          {pending ? "..." : "Eksekusi"}
        </button>
        <button
          type="button"
          onClick={() => kirim("TOLAK")}
          disabled={pending}
          className="btn btn-danger btn-sm"
        >
          {pending ? "..." : "Tolak"}
        </button>
        {error && <p className="text-sm font-medium text-red">{error}</p>}
      </div>
    </div>
  );
}
