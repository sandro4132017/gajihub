"use client";

// Unggah naskah yang dipegang, cocokkan sidiknya dengan yang dicatat Gajihub.
//
// Berkasnya TIDAK dikirim ke mana-mana selain server ini, tidak disimpan, dan
// tidak pernah dibandingkan di sisi browser - perbandingan di klien gampang
// dipalsukan dan tidak membuktikan apa pun.
//
// TANPA JAVASCRIPT tetap ada jalan keluarnya, dan itu disengaja: nilai sidiknya
// tercetak di halaman ini, jadi siapa pun bisa menjalankan `sha256sum` sendiri
// lalu membandingkan dengan mata. Formulir ini cuma memudahkan.

import { useState } from "react";

interface HasilValidasi {
  bisaDibandingkan?: boolean;
  cocok?: boolean;
  hashDiunggah?: string;
  namaBerkas?: string;
  pesan?: string;
  error?: string;
}

export default function FormValidasiNaskah({ dokumenId }: { dokumenId: string }) {
  const [sibuk, setSibuk] = useState(false);
  const [hasil, setHasil] = useState<HasilValidasi | null>(null);

  async function kirim(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setSibuk(true);
    setHasil(null);
    try {
      const res = await fetch(`/tte/verify/${dokumenId}/validasi`, {
        method: "POST",
        body: new FormData(form),
      });
      setHasil((await res.json()) as HasilValidasi);
    } catch (err) {
      setHasil({
        error: `Tidak bisa menghubungi server: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
    } finally {
      setSibuk(false);
    }
  }

  return (
    <form onSubmit={kirim} className="space-y-3">
      <input
        type="file"
        name="berkas"
        accept="application/pdf,.pdf"
        required
        className="block w-full rounded-xl border border-dashed border-line bg-surface-2 px-3 py-3 text-xs text-ink file:mr-3 file:rounded-lg file:border-0 file:bg-navy file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white"
      />
      <button type="submit" disabled={sibuk} className="btn btn-primary w-full text-xs py-2.5">
        {sibuk ? "Memeriksa…" : "Validasi Naskah"}
      </button>

      {hasil?.error && (
        <p className="rounded-xl bg-red-tint/40 px-3 py-2 text-[11px] font-bold text-red">
          {hasil.error}
        </p>
      )}

      {hasil?.bisaDibandingkan === false && (
        <p className="rounded-xl bg-surface-2 px-3 py-2 text-[11px] text-muted">
          {hasil.pesan}
        </p>
      )}

      {hasil?.bisaDibandingkan && (
        <div
          className={`rounded-xl px-3 py-3 ${
            hasil.cocok ? "bg-green-tint/60" : "bg-red-tint/40"
          }`}
        >
          <p
            className={`text-xs font-black ${
              hasil.cocok ? "text-green" : "text-red"
            }`}
          >
            {hasil.cocok ? "NASKAH COCOK" : "NASKAH TIDAK COCOK"}
          </p>
          <p className="mt-1 text-[11px] text-ink">
            {hasil.cocok
              ? "Berkas yang Anda unggah sama persis dengan yang dicatat Gajihub saat penandatanganan."
              : "Berkas yang Anda unggah BERBEDA dari yang dicatat Gajihub. Bisa jadi berkasnya sudah diubah, atau itu dokumen lain."}
          </p>
          {hasil.namaBerkas && (
            <p className="mt-2 text-[10px] text-muted">
              Berkas diperiksa: {hasil.namaBerkas}
            </p>
          )}
          {!hasil.cocok && hasil.hashDiunggah && (
            <p className="mt-1 break-all font-mono text-[10px] text-muted">
              Sidik berkas Anda: {hasil.hashDiunggah}
            </p>
          )}
        </div>
      )}
    </form>
  );
}
