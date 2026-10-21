import { describe, it, expect } from "vitest";
import zlib from "zlib";
import {
  buatSpesimenQr,
  sandikanPng,
  ambilTemplateSpesimen,
  TEMPLATE_BAWAAN,
} from "../spesimenTte";

const TAUTAN = "http://192.168.221.44:3002/tte/verify/85bcd15a-a5f7-4b76-ab8a-09437cbe6d46";

/** Baca kembali piksel dari PNG yang kita sandikan sendiri. */
function bacaPng(png: Buffer) {
  expect(png.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  );
  expect(png.subarray(12, 16).toString("latin1")).toBe("IHDR");
  const lebar = png.readUInt32BE(16);
  const tinggi = png.readUInt32BE(20);

  // Kumpulkan seluruh bagian IDAT, lalu kembangkan.
  let pos = 8;
  const potongan: Buffer[] = [];
  while (pos < png.length) {
    const panjang = png.readUInt32BE(pos);
    const jenis = png.subarray(pos + 4, pos + 8).toString("latin1");
    if (jenis === "IDAT") potongan.push(png.subarray(pos + 8, pos + 8 + panjang));
    pos += 12 + panjang;
  }
  const mentah = zlib.inflateSync(Buffer.concat(potongan));

  const piksel = (x: number, y: number) => {
    const i = y * (1 + lebar * 4) + 1 + x * 4;
    return [mentah[i], mentah[i + 1], mentah[i + 2]] as [number, number, number];
  };
  return { lebar, tinggi, piksel, mentah };
}

describe("sandikanPng", () => {
  it("menghasilkan PNG yang bisa dibaca ulang, warnanya utuh", () => {
    const rgba = new Uint8Array(2 * 2 * 4);
    // satu piksel merah di (0,0), sisanya hitam pekat
    rgba.set([255, 0, 0, 255], 0);
    for (let i = 1; i < 4; i++) rgba.set([0, 0, 0, 255], i * 4);

    const { lebar, tinggi, piksel } = bacaPng(sandikanPng(2, 2, rgba));
    expect([lebar, tinggi]).toEqual([2, 2]);
    expect(piksel(0, 0)).toEqual([255, 0, 0]);
    expect(piksel(1, 1)).toEqual([0, 0, 0]);
  });

  it("tiap baris didahului bita penyaring 0", () => {
    const { mentah } = bacaPng(sandikanPng(3, 2, new Uint8Array(3 * 2 * 4)));
    expect(mentah[0]).toBe(0);
    expect(mentah[1 + 3 * 4]).toBe(0);
  });
});

describe("buatSpesimenQr", () => {
  it("ukurannya = modul + tepi di kedua sisi, dan berbentuk bujur sangkar", () => {
    const h = buatSpesimenQr(TAUTAN);
    const diharapkan =
      h.modul * TEMPLATE_BAWAAN.pikselPerModul +
      TEMPLATE_BAWAAN.modulTepi * TEMPLATE_BAWAAN.pikselPerModul * 2;
    expect(h.lebar).toBe(diharapkan);
    expect(h.tinggi).toBe(h.lebar);
  });

  it("tepinya tetap terang - pemindai butuh zona sunyi", () => {
    const h = buatSpesimenQr(TAUTAN);
    const { piksel } = bacaPng(h.png);
    expect(piksel(1, 1)).toEqual([255, 255, 255]);
    expect(piksel(h.lebar - 2, 1)).toEqual([255, 255, 255]);
    expect(piksel(1, h.tinggi - 2)).toEqual([255, 255, 255]);
  });

  it("pola pencari di pojok kiri atas tergambar gelap", () => {
    const h = buatSpesimenQr(TAUTAN);
    const { piksel } = bacaPng(h.png);
    const mp = TEMPLATE_BAWAAN.pikselPerModul;
    const tepi = TEMPLATE_BAWAAN.modulTepi * mp;
    // Modul (0,0) selalu bagian dari pola pencari - selalu gelap.
    expect(piksel(tepi + 1, tepi + 1)).toEqual([...TEMPLATE_BAWAAN.warnaQr]);
  });

  it("logo tergambar di tengah - warna khas Gajihub muncul di sana", () => {
    const h = buatSpesimenQr(TAUTAN);
    const { piksel } = bacaPng(h.png);
    const tengah = Math.floor(h.lebar / 2);

    // Sapu kotak tengah, cari tosca (#00B3A4) dan emas (#D4A017) milik logo.
    let adaTosca = false;
    let adaEmas = false;
    const jangkau = Math.floor(h.lebar * 0.14);
    for (let y = tengah - jangkau; y <= tengah + jangkau; y++) {
      for (let x = tengah - jangkau; x <= tengah + jangkau; x++) {
        const [r, g, b] = piksel(x, y);
        if (Math.abs(r - 0) < 40 && Math.abs(g - 179) < 40 && Math.abs(b - 164) < 40) adaTosca = true;
        if (Math.abs(r - 212) < 40 && Math.abs(g - 160) < 40 && Math.abs(b - 23) < 40) adaEmas = true;
      }
    }
    expect(adaTosca).toBe(true);
    expect(adaEmas).toBe(true);
  });

  it("tanpa logo, tengahnya tidak memuat warna logo sama sekali", () => {
    const h = buatSpesimenQr(TAUTAN, ambilTemplateSpesimen({ pakaiLogo: false }));
    const { piksel } = bacaPng(h.png);
    const tengah = Math.floor(h.lebar / 2);
    let adaTosca = false;
    for (let y = tengah - 20; y <= tengah + 20; y++) {
      for (let x = tengah - 20; x <= tengah + 20; x++) {
        const [r, g, b] = piksel(x, y);
        if (Math.abs(r - 0) < 40 && Math.abs(g - 179) < 40 && Math.abs(b - 164) < 40) adaTosca = true;
      }
    }
    expect(adaTosca).toBe(false);
  });

  it("tautan berbeda menghasilkan gambar berbeda", () => {
    const a = buatSpesimenQr(TAUTAN).png;
    const b = buatSpesimenQr(TAUTAN + "x").png;
    expect(a.equals(b)).toBe(false);
  });

  it("tautan sama menghasilkan gambar yang sama persis - hasilnya bisa diulang", () => {
    expect(buatSpesimenQr(TAUTAN).png.equals(buatSpesimenQr(TAUTAN).png)).toBe(true);
  });

  it("warna QR mengikuti template", () => {
    const merah: readonly [number, number, number] = [192, 73, 47];
    const h = buatSpesimenQr(TAUTAN, ambilTemplateSpesimen({ warnaQr: merah }));
    const { piksel } = bacaPng(h.png);
    const mp = TEMPLATE_BAWAAN.pikselPerModul;
    const tepi = TEMPLATE_BAWAAN.modulTepi * mp;
    expect(piksel(tepi + 1, tepi + 1)).toEqual([...merah]);
  });
});

describe("ambilTemplateSpesimen", () => {
  it("tanpa penimpa mengembalikan nilai bawaan", () => {
    expect(ambilTemplateSpesimen()).toEqual(TEMPLATE_BAWAAN);
  });

  it("penimpa hanya mengganti yang disebut", () => {
    const t = ambilTemplateSpesimen({ pakaiLogo: false });
    expect(t.pakaiLogo).toBe(false);
    expect(t.pikselPerModul).toBe(TEMPLATE_BAWAAN.pikselPerModul);
  });

  it("lencana bawaan tidak melewati 0,3 - di atas itu QR berhenti terbaca", () => {
    expect(TEMPLATE_BAWAAN.rasioLencana).toBeLessThanOrEqual(0.3);
  });
});
