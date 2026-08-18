import { describe, it, expect } from "vitest";
import { rincianTukinTersimpan } from "../rincianTukinTersimpan";
import { TUKIN_POKOK_PER_KELAS_JABATAN } from "../tarifTukinPokok";

// Kelas jabatan 10 dipakai di seluruh test ini karena angkanya yang muncul di
// verifikasi manual end-to-end (lihat CLAUDE.md, kasus Ayu Puspita Sari), jadi
// hasil di sini bisa diadu langsung dengan angka yang sudah pernah dicek.
const TARIF_KELAS_10 = TUKIN_POKOK_PER_KELAS_JABATAN[10]; // 5.979.200
const BOBOT_HADIR = TARIF_KELAS_10 * 0.3; // 1.793.760
const BOBOT_KINERJA = TARIF_KELAS_10 * 0.7; // 4.185.440

describe("rincianTukinTersimpan", () => {
  it("memecah tukin bersih pegawai tanpa pelanggaran & predikat 100%", () => {
    const r = rincianTukinTersimpan(
      {
        komponenKehadiran: BOBOT_HADIR,
        komponenKinerja: BOBOT_KINERJA,
        tukinPokok: TARIF_KELAS_10,
        potonganPph: 0,
        tukinBersih: TARIF_KELAS_10,
      },
      TARIF_KELAS_10
    );

    // toBeCloseTo, bukan toBe: 5.979.200 x 0.7 = 4185439,9999999995 di
    // aritmatika floating point. Pembulatannya urusan lapisan tampilan.
    expect(r.bobotKehadiranPenuh).toBeCloseTo(1_793_760, 6);
    expect(r.bobotKinerjaPenuh).toBeCloseTo(4_185_440, 6);
    expect(r.potonganKehadiran).toBe(0);
    expect(r.potonganKinerja).toBe(0);
    expect(r.tukinBruto).toBe(TARIF_KELAS_10);
    expect(r.adaSelisih).toBe(false);
  });

  it("merekonstruksi potongan Pasal 13 dalam rupiah (kasus verifikasi 8,60%)", () => {
    // Angka ini hasil verifikasi manual end-to-end: 1 hari alpha + 2 kejadian
    // tidak presensi + 30/20/10 menit + 1 kejadian bolos upacara = potongan
    // 8,60% DARI BOBOT KEHADIRAN, komponen kehadiran jadi Rp 1.639.497.
    const komponenKehadiran = BOBOT_HADIR * (1 - 0.086);

    const r = rincianTukinTersimpan(
      {
        komponenKehadiran,
        komponenKinerja: BOBOT_KINERJA,
        tukinPokok: komponenKehadiran + BOBOT_KINERJA,
        potonganPph: 0,
        tukinBersih: komponenKehadiran + BOBOT_KINERJA,
      },
      TARIF_KELAS_10
    );

    expect(Math.round(r.komponenKehadiran)).toBe(1_639_497);
    expect(r.potonganKehadiran).toBeCloseTo(BOBOT_HADIR * 0.086, 6);
    // Potongan Pasal 13 TIDAK boleh menyentuh komponen kinerja.
    expect(r.potonganKinerja).toBe(0);
    expect(r.adaSelisih).toBe(false);
  });

  it("menampilkan selisih bobot kinerja saat predikat di bawah 100%", () => {
    // Predikat "Kurang" = 60% (Kepsekjen 82/2025).
    const komponenKinerja = BOBOT_KINERJA * 0.6;

    const r = rincianTukinTersimpan(
      {
        komponenKehadiran: BOBOT_HADIR,
        komponenKinerja,
        tukinPokok: BOBOT_HADIR + komponenKinerja,
        potonganPph: 0,
        tukinBersih: BOBOT_HADIR + komponenKinerja,
      },
      TARIF_KELAS_10
    );

    expect(r.potonganKinerja).toBeCloseTo(BOBOT_KINERJA * 0.4, 6);
    expect(r.potonganKehadiran).toBe(0);
    expect(r.adaSelisih).toBe(false);
  });

  it("mengurangi PPh dari bruto, bukan dari salah satu komponen", () => {
    const pph = 299_960;
    const r = rincianTukinTersimpan(
      {
        komponenKehadiran: BOBOT_HADIR,
        komponenKinerja: BOBOT_KINERJA,
        tukinPokok: TARIF_KELAS_10,
        potonganPph: pph,
        tukinBersih: TARIF_KELAS_10 - pph,
      },
      TARIF_KELAS_10
    );

    expect(r.tukinBruto - r.potonganPph).toBe(r.tukinBersih);
    expect(r.komponenKehadiran + r.komponenKinerja).toBe(r.tukinBruto);
  });

  it("TIDAK menebak rincian kalau tarif kelas jabatan tidak diketahui", () => {
    const r = rincianTukinTersimpan(
      {
        komponenKehadiran: 1_000_000,
        komponenKinerja: 2_000_000,
        tukinPokok: 3_000_000,
        potonganPph: 0,
        tukinBersih: 3_000_000,
      },
      null
    );

    expect(r.bobotKehadiranPenuh).toBeNull();
    expect(r.bobotKinerjaPenuh).toBeNull();
    expect(r.potonganKehadiran).toBeNull();
    expect(r.potonganKinerja).toBeNull();
    // Angka yang memang tersimpan tetap dikembalikan apa adanya.
    expect(r.tukinBruto).toBe(3_000_000);
    expect(r.adaSelisih).toBe(false);
  });

  it("menandai selisih saat override cuti Pasal 14 menimpa tukin pokok", () => {
    // Pasal 14 huruf c bulan pertama: dibayar 50% dari tarif kelas jabatan.
    // hitungTukin menimpa tukinPokok TANPA menyentuh kedua komponen, jadi
    // penjumlahannya memang tidak lagi cocok - itu yang harus terdeteksi.
    const r = rincianTukinTersimpan(
      {
        komponenKehadiran: BOBOT_HADIR,
        komponenKinerja: BOBOT_KINERJA,
        tukinPokok: TARIF_KELAS_10 * 0.5,
        potonganPph: 0,
        tukinBersih: TARIF_KELAS_10 * 0.5,
      },
      TARIF_KELAS_10
    );

    expect(r.adaSelisih).toBe(true);
    expect(r.selisihAritmatika).toBeCloseTo(-TARIF_KELAS_10 * 0.5, 6);
  });

  it("tidak menganggap sisa pembulatan floating point sebagai selisih", () => {
    const r = rincianTukinTersimpan(
      {
        komponenKehadiran: 1_639_496.64,
        komponenKinerja: 4_185_440,
        tukinPokok: 5_824_936.639999,
        potonganPph: 0,
        tukinBersih: 5_824_936.639999,
      },
      TARIF_KELAS_10
    );

    expect(r.adaSelisih).toBe(false);
  });
});
