import { StatusKoneksiBsre } from "../../tte/StatusKoneksiBsre";
import { PanelTteSptjm } from "./PanelTteSptjm";
import { KepalaTahap } from "./KepalaTahap";
import { InfoIkon, type PoinInfo } from "./InfoIkon";
import {
  LABEL_SPTJM,
  URUTAN_SPTJM,
  daftarTeks,
  type JenisSptjmUnit,
} from "../../../business-logic/sptjmUnit";

export interface DokumenSptjmTampil {
  id: string;
  status: string;
  nomorDokumen: string | null;
  fileSignedPath: string | null;
  /** ISO string - dilewatkan ke komponen klien. */
  signedAt: string | null;
  penandatanganNama: string | null;
}

/**
 * TAHAP 3 - Tanda Tangan Elektronik (TTE) SPTJM.
 *
 * Kepala: judul + ikon (i) berisi keterangan (termasuk sebab TTE ulang), dan
 * status koneksi BSrE. Isi: tiga baris dokumen ringkas. Seluruh fungsi tanda tangan ada di PanelTteSptjm
 * dan ModalPassphraseTte - passphrase TIDAK disimpan di mana pun, dan modalnya
 * tidak disentuh perombakan ini.
 */
export function TahapTteSptjm({
  periodeBulan,
  periodeTahun,
  satuanKerja,
  namaPenandatangan,
  dikembalikanPada,
  dokumen,
  ringkasan,
  perluUlang,
  lemburWajib,
  dihitungTerakhir,
  terkunci = false,
}: {
  periodeBulan: number;
  periodeTahun: number;
  satuanKerja: string;
  namaPenandatangan: string;
  dikembalikanPada: string | null;
  dokumen: Record<JenisSptjmUnit, DokumenSptjmTampil | null>;
  /** Sub-judul tiap dokumen ("n Pegawai - Rp ..."). */
  ringkasan: Record<JenisSptjmUnit, string>;
  /** Jenis yang tanda tangannya mendahului pengembalian PPABP. */
  perluUlang: readonly JenisSptjmUnit[];
  /** SPTJM Lembur menahan pengiriman hanya bila true. */
  lemburWajib: boolean;
  /** Kalkulasi terakhir per jenis (ISO) - TTE sebelum ini perlu diulang. */
  dihitungTerakhir: Record<JenisSptjmUnit, string | null>;
  /** Rekap sudah dikirim & terkunci - baris hanya-baca. */
  terkunci?: boolean;
}) {
  const poin: PoinInfo[] = [
    {
      judul: "Pengesahan via BSrE BSSN",
      isi: "SPTJM Tunjangan Kinerja, Uang Makan, dan Uang Lembur disahkan dengan tanda tangan elektronik (sertifikat BSrE).",
    },
    {
      judul: lemburWajib ? "Ketiganya wajib sebelum kirim" : "Tukin & Uang Makan wajib sebelum kirim",
      isi: lemburWajib
        ? "Ketiga SPTJM wajib ditandatangani sebelum rekap dikirim ke PPABP."
        : "SPTJM Uang Lembur belum diwajibkan selama uang lembur ditunda.",
    },
  ];
  if (perluUlang.length > 0 && !terkunci) {
    poin.push({
      judul: `SPTJM ${daftarTeks(perluUlang.map((j) => LABEL_SPTJM[j]))} perlu ditandatangani ulang`,
      isi: "Angkanya dihitung ulang, atau rekap dikembalikan PPABP, setelah dokumen itu ditandatangani. Tanda tangan yang lama membenarkan angka yang sudah berubah.",
    });
  }

  return (
    <section id="tahap-3" className="card scroll-mt-4 p-4 sm:p-5" aria-labelledby="judul-tahap-3">
      <div id="judul-tahap-3">
        <KepalaTahap
          nomor={3}
          judul="Tanda Tangan Elektronik (TTE) SPTJM"
          info={<InfoIkon judul="Tentang TTE SPTJM" poin={poin} />}
        >
          {/* Status BSrE hanya relevan selama masih bisa menandatangani. */}
          {!terkunci && <StatusKoneksiBsre />}
        </KepalaTahap>
      </div>

      <div className="mt-4 space-y-2.5">
        {URUTAN_SPTJM.map((jenis) => (
          <PanelTteSptjm
            key={jenis}
            jenisDokumen={jenis}
            dikembalikanPada={dikembalikanPada}
            dihitungTerakhir={dihitungTerakhir[jenis]}
            periodeBulan={periodeBulan}
            periodeTahun={periodeTahun}
            satuanKerja={satuanKerja}
            namaPenandatangan={namaPenandatangan}
            dokumenTteTerbaru={dokumen[jenis]}
            ringkasan={ringkasan[jenis]}
            wajib={jenis !== "SPTJM_LEMBUR" || lemburWajib}
            terkunci={terkunci}
          />
        ))}
      </div>
    </section>
  );
}
