"use client";

import { useState } from "react";
import { Modal } from "../../../components/feedback/Modal";

/** Kartu "Struktur & Ketentuan Berkas ADK" - isinya dibuka sebagai pop up. */
export function PanduanAdk() {
  const [buka, setBuka] = useState(false);
  return (
    <div className="card flex items-center justify-between gap-3 px-5 py-4">
      <span className="text-sm font-bold text-ink">Struktur &amp; Ketentuan Berkas ADK</span>
      <button
        type="button"
        onClick={() => setBuka(true)}
        className="shrink-0 text-xs font-semibold text-biru-deep hover:underline"
      >
        Buka panduan
      </button>

      <Modal
        terbuka={buka}
        judul="Struktur & Ketentuan Berkas ADK"
        onTutup={() => setBuka(false)}
        aksi={
          <button type="button" className="btn btn-primary" onClick={() => setBuka(false)}>
            Tutup
          </button>
        }
      >
        <ul className="space-y-2.5">
          <li>
            <strong className="text-ink">Format Setoran PPABP:</strong> Berkas ADK memuat format baku yang diterima
            langsung oleh Web Gaji Kemenkeu tanpa baris header tambahan atau format tabel dekoratif.
          </li>
          <li>
            <strong className="text-ink">Pemisahan SAKTI:</strong> ADK Tukin wajib dipisah per kode bank SPAN karena
            SAKTI hanya dapat menerbitkan SPP per satu rekening bank operasional yang sama.
          </li>
          <li>
            <strong className="text-ink">Struktur Excel ADK Uang Makan &amp; Lembur:</strong> sheet{" "}
            <span className="font-mono text-ink">hasil</span> (data mentah setoran) dan sheet{" "}
            <span className="font-mono text-ink">depan</span> (grid per tanggal untuk audit visual).
          </li>
        </ul>
      </Modal>
    </div>
  );
}
