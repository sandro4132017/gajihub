import { LABEL_STATUS } from "../../../../lib/format/presensiTampilan";
import {
  STATUS_WAJIB_PRESENSI,
  kejadianTidakPresensiHari,
  keteranganPotonganHarian,
  potonganHarianPersen,
  rincianJamKerjaHari,
} from "../../../../business-logic/rincianJamKerjaHarian";
import type { BarisTabelRincianJamKerja } from "./TabelRincianJamKerja";

/** Kolom `PresensiHarian` yang dibutuhkan rincian per hari. */
export interface HariPresensiPegawai {
  tanggal: Date;
  statusKehadiran: string;
  jamMasuk: Date | null;
  jamKeluar: Date | null;
  menitTerlambat: number;
  menitPulangCepat: number;
  menitMeninggalkanKantor: number;
  tidakIkutUpacara: boolean;
  jamLembur: number;
}

export interface KoreksiHariPegawai {
  jamMasuk: Date | null;
  jamKeluar: Date | null;
  jamLembur: number | null;
}

const menitDariWaktu = (w: Date | null) => (w === null ? null : w.getUTCHours() * 60 + w.getUTCMinutes());

/**
 * Rincian per hari satu pegawai - dipakai halaman `/tukin/presensi/[nip]` DAN
 * Excel perorangannya, supaya keduanya tidak bisa bercerita beda. Murni.
 *
 * Menit terlambat / pulang cepat diambil dari `PresensiHarian` (angka mesin
 * yang membayar), bukan dihitung ulang di sini.
 */
export function susunBarisHarianPegawai(
  harian: readonly HariPresensiPegawai[],
  opsi: {
    petaKoreksi: ReadonlyMap<string, KoreksiHariPegawai>;
    tanggalKendala: ReadonlySet<string>;
    hariLibur: ReadonlyMap<string, string>;
  }
): BarisTabelRincianJamKerja[] {
  return harian.map((h) => {
    const iso = h.tanggal.toISOString().slice(0, 10);
    const keteranganLibur = opsi.hariLibur.get(iso) ?? null;
    const koreksiHari = opsi.petaKoreksi.get(iso);
    const rincian = rincianJamKerjaHari({
      tanggalIso: iso,
      indeksHari: h.tanggal.getUTCDay(),
      hariLibur: keteranganLibur !== null,
      jamMasukMenit: menitDariWaktu(koreksiHari?.jamMasuk ?? h.jamMasuk),
      jamKeluarMenit: menitDariWaktu(koreksiHari?.jamKeluar ?? h.jamKeluar),
      masukDikoreksi: koreksiHari?.jamMasuk != null,
      keluarDikoreksi: koreksiHari?.jamKeluar != null,
    });

    const kejadianTidakPresensi = kejadianTidakPresensiHari({
      wajibPresensi: STATUS_WAJIB_PRESENSI.includes(h.statusKehadiran),
      hariLibur: rincian.hariLibur,
      jamMasukMenit: rincian.jamMasukMenit,
      jamKeluarMenit: rincian.jamKeluarMenit,
      dikecualikanKendala: opsi.tanggalKendala.has(iso),
      dikoreksiManual: opsi.petaKoreksi.has(iso),
      tapTidakWajar: rincian.tapTidakWajar,
    });

    const pelanggaran = {
      hariAlpha: h.statusKehadiran === "ALPHA" && !rincian.hariLibur,
      kejadianTidakPresensi,
      menitTerlambat: h.menitTerlambat,
      menitPulangCepat: h.menitPulangCepat,
      menitMeninggalkanKantor: h.menitMeninggalkanKantor,
      tidakIkutUpacara: h.tidakIkutUpacara,
    };

    return {
      tanggal: h.tanggal,
      statusLabel: LABEL_STATUS[h.statusKehadiran] ?? h.statusKehadiran,
      rincian,
      potonganPersen: potonganHarianPersen(pelanggaran),
      bagianPotongan: keteranganPotonganHarian(pelanggaran, rincian),
      keteranganLibur,
      dikoreksiManual: opsi.petaKoreksi.has(iso),
      masukDikoreksi: koreksiHari?.jamMasuk != null,
      keluarDikoreksi: koreksiHari?.jamKeluar != null,
      jamLembur: koreksiHari?.jamLembur ?? h.jamLembur,
      jamLemburMesin: h.jamLembur,
      kejadianTidakPresensi,
    };
  });
}
