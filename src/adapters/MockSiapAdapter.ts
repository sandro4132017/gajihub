import type { SiapAdapter, PegawaiRecord } from "./DataSourceAdapter";

/**
 * Mock implementation - data statis untuk development & demo.
 * Ganti dengan RealSiapAdapter (panggil REST API SIAP asli) begitu akses
 * resmi tersedia, tanpa mengubah kode yang memakai SiapAdapter di tempat lain.
 */
export class MockSiapAdapter implements SiapAdapter {
  // NIP sengaja pakai prefix "0000" (tahun lahir 0000 tidak pernah valid di
  // format NIP asli) supaya PASTI tidak pernah bentrok dengan NIP pegawai
  // sungguhan - pernah kejadian NIP contoh di sini kebetulan sama persis
  // dengan NIP pegawai asli waktu basis data pegawai diimpor, dan data demo
  // (kalkulasi + approval palsu) jadi ke-attach ke orang sungguhan.
  private data: PegawaiRecord[] = [
    {
      nip: "000000000000000001",
      nama: "Contoh Pegawai Satu",
      unitKerja: "Biro Keuangan dan BMN",
      satuanKerja: "Sekretariat Jenderal",
      statusPegawai: "AKTIF",
      jabatan: "Kepala Subbagian Tata Usaha",
      golongan: "III/d",
      kelasJabatan: 8,
    },
    {
      nip: "000000000000000003",
      nama: "Contoh Pegawai Dua",
      unitKerja: "Biro Keuangan dan BMN",
      satuanKerja: "Sekretariat Jenderal",
      statusPegawai: "AKTIF",
      jabatan: "Pengelola Keuangan",
      golongan: "III/b",
      kelasJabatan: 7,
    },
  ];

  async getPegawaiAktif(satuanKerja?: string): Promise<PegawaiRecord[]> {
    const hasil = this.data.filter((p) => p.statusPegawai === "AKTIF");
    if (!satuanKerja) return hasil;
    return hasil.filter((p) => p.satuanKerja === satuanKerja);
  }

  async getPegawaiByNip(nip: string): Promise<PegawaiRecord | null> {
    return this.data.find((p) => p.nip === nip) ?? null;
  }
}
