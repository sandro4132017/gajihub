// ============================================================================
// RENCANA PEMINDAHAN UNGGAHAN LAMA (`public/uploads`) KE PENYIMPANAN PRIVAT.
//
// PURE: hash sudah dihitung pemanggil, di sini hanya diputuskan apa yang
// dilakukan pada tiap berkas. Penyalinan sungguhan ada di
// `src/jobs/pindahUnggahanPrivat.ts`.
//
// ATURAN: berkas yang sudah ada di tujuan dengan isi BERBEDA tidak pernah
// ditimpa. Berkas TTE yang ditandatangani dua kali pernah saling menimpa karena
// namanya sama; menimpa di sini akan mengulang kerusakan yang sama, dan yang
// terhapus adalah bukti.
// ============================================================================

import { uraiReferensi } from "./berkasPrivat";

export type StatusPindah = "SALIN" | "SUDAH_SAMA" | "BENTROK" | "LEWATI";

export interface BerkasAsal {
  /** `<jenis>/<relatif>` - sama dengan kunci yang disimpan di database. */
  relatif: string;
  sha256: string;
}

export interface ItemRencana {
  relatif: string;
  status: StatusPindah;
}

export interface RingkasanRencana {
  salin: number;
  sudahSama: number;
  bentrok: number;
  lewati: number;
}

/** Berkas pengisi struktur folder (`.gitkeep`) tidak dipindahkan. */
export function layakDipindah(relatif: string): boolean {
  if (relatif.split("/").pop() === ".gitkeep") return false;
  return uraiReferensi(relatif) !== null;
}

/**
 * @param asal    berkas di `public/uploads` beserta hash isinya
 * @param tujuan  hash berkas yang SUDAH ada di penyimpanan privat, berkunci
 *                `<jenis>/<relatif>`; berkas yang belum ada tidak dimasukkan
 */
export function susunRencanaPindah(
  asal: readonly BerkasAsal[],
  tujuan: ReadonlyMap<string, string>
): ItemRencana[] {
  return asal.map((b) => {
    if (!layakDipindah(b.relatif)) return { relatif: b.relatif, status: "LEWATI" };
    const hashTujuan = tujuan.get(b.relatif);
    if (hashTujuan === undefined) return { relatif: b.relatif, status: "SALIN" };
    return {
      relatif: b.relatif,
      status: hashTujuan === b.sha256 ? "SUDAH_SAMA" : "BENTROK",
    };
  });
}

export function ringkasRencana(rencana: readonly ItemRencana[]): RingkasanRencana {
  const hasil: RingkasanRencana = { salin: 0, sudahSama: 0, bentrok: 0, lewati: 0 };
  for (const r of rencana) {
    if (r.status === "SALIN") hasil.salin++;
    else if (r.status === "SUDAH_SAMA") hasil.sudahSama++;
    else if (r.status === "BENTROK") hasil.bentrok++;
    else hasil.lewati++;
  }
  return hasil;
}

/**
 * Berapa berkas TTE yang isinya TIDAK cocok dengan `hashBerkas` di database.
 * `hashDb` berkunci `<jenis>/<relatif>` hasil `uraiReferensi` atas
 * `fileSignedPath`; berkas tanpa hash di database tidak dihitung.
 */
export function hitungTidakCocokDb(
  asal: readonly BerkasAsal[],
  hashDb: ReadonlyMap<string, string>
): number {
  let n = 0;
  for (const b of asal) {
    const h = hashDb.get(b.relatif);
    if (h !== undefined && h.trim().toLowerCase() !== b.sha256) n++;
  }
  return n;
}
