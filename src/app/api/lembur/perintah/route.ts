import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ambilUserSesi } from "@/auth/getSessionAccount";
import { canBuatPerintahLembur, type AuthUser } from "@/auth/permissions";
import {
  batasKirimPerintah,
  cariBentrok,
  validasiPerintah,
  type AnggotaPerintahInput,
} from "@/business-logic/perintahLembur";
import { namaCetakPegawai } from "@/business-logic/namaPegawai";
import { SATKER_DUMMY, SUMBER_DUMMY } from "@/lib/dataUji";
import { pesanGalatUntukLayar } from "@/lib/koneksi/galatSumber";
import { tandatanganiDokumen } from "@/lib/tte/tandatanganiDokumen";
import { NIK_DEMO_BSRE } from "@/lib/tte/simulasiTte";
import { izinkanNikDemoLembur } from "@/lib/lembur/izinNikDemoLembur";
import {
  generateSuratTugasLemburPdf,
  type PesertaSuratTugasLembur,
} from "@/lib/tte/suratTugasLemburPdf";
import {
  BATAS_WAKTU_SIGN_LEMBUR_MS,
  generateNamaFileSuratTugasLembur,
  generateNomorSuratTugasLemburDefault,
} from "@/lib/tte/lemburTypes";
import { hariTanggalId } from "@/lib/tte/pdfLemburBersama";

export const dynamic = "force-dynamic";

/**
 * Route Handler JSON untuk perintah lembur (SPKL) Kepala Tim: `pratinjau` dan
 * `kirim`. JSON POST, bukan Server Action, supaya bebas dari HTTP 500 di balik
 * FortiWeb (lihat src/app/api/tte/route.ts).
 *
 * TIDAK ADA DRAFT TERSIMPAN. Pratinjau membuat PDF di memori dan
 * mengembalikannya; baris PerintahLembur baru ada saat perintah SUDAH
 * ditandatangani dan lolos semua pemeriksaan, langsung berstatus TERKIRIM.
 * Status DRAFT/GAGAL di enum tidak dipakai jalur ini.
 *
 * URUTAN `kirim` (tiap langkah menolak SEBELUM langkah yang lebih mahal):
 *  1. sesi -> allowlist field -> validasiPerintah -> NIK tepat 16 digit
 *  2. Pegawai kepala tim diambil ulang dari DB (satker dari situ, bukan klien)
 *  3. canBuatPerintahLembur untuk kepala tim, lalu PER BARIS anggota (diambil
 *     ulang dari DB: aktif, bukan uji, satker sama, bukan diri sendiri)
 *  4. batas 15.00 WIB pada hari lembur (SEBELUM BSrE)
 *  5. cek bentrok (pesan ramah; DB tetap penjaga akhirnya)
 *  6. PDF + tanda tangan BSrE (tandatanganiDokumen, NIK demo ditolak)
 *  7. batas 15.00 WIB DIPERIKSA LAGI terhadap waktu tanda tangan selesai
 *  8. satu $transaction: PerintahLembur TERKIRIM + anggota terkirim=true +
 *     AuditTrail. Unique (pegawai, tanggal, terkirim) menolak yang kedua.
 *
 * DOKUMEN YATIM. Tanda tangan (6) terjadi di luar transaksi dan tidak bisa
 * ditarik dari BSrE. Bila langkah 7 atau 8 menolak (kalah balapan, lewat
 * 15.00, galat DB), perintah TIDAK dibuat: keabsahan sebuah perintah HANYA
 * ditentukan oleh baris PerintahLembur berstatus TERKIRIM yang menunjuk
 * dokumennya, bukan oleh adanya berkas bertanda tangan. DokumenTte-nya
 * ditandai GAGAL (berkas bertanda tangan tidak lagi disajikan ke pengguna;
 * rute unduhan hanya menyajikan yang TERTANDATANGANI) dan kejadiannya dicatat
 * di AuditTrail beserta id dokumennya. Kepala tim yang kalah balapan harus
 * membuat perintah baru (tanda tangan baru) bila masih perlu.
 *
 * PASSPHRASE hanya di memori selama pemanggilan: tidak masuk log, galat,
 * AuditTrail, maupun respons.
 *
 * Sengaja TANPA revalidatePath: halaman yang memuat daftar pegawai tidak
 * boleh dipicu dari jalur yang dapat dipanggil sembarang waktu (pelajaran
 * pentest F-02). Klien memanggil router.refresh() sendiri.
 */

const JAM_BATAS_PESAN = "15.00 WIB";
const MAKS_ANGGOTA = 200;
const MAKS_URAIAN = 1000;
const FORMAT_NIK = /^\d{16}$/;
const FORMAT_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

interface Masukan {
  action: string;
  tanggal: string;
  uraianTugas: string;
  anggota: AnggotaPerintahInput[];
  nik: string;
  passphrase: string;
}

/**
 * DAFTAR PUTIH. Hanya field di bawah yang dibaca dari badan permintaan; satker,
 * kepalaTimId, terkirim, status, nomorSurat, dsb. dari klien DIABAIKAN karena
 * tidak pernah dibaca. Tiap anggota hanya dibaca `pegawaiId` dan `jam`.
 */
function bacaMasukan(body: unknown): Masukan {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const anggotaMentah = Array.isArray(b.anggota) ? b.anggota.slice(0, MAKS_ANGGOTA + 1) : [];
  const anggota: AnggotaPerintahInput[] = anggotaMentah.map((a) => {
    const r = (a && typeof a === "object" ? a : {}) as Record<string, unknown>;
    const jam = typeof r.jam === "number" ? r.jam : typeof r.jam === "string" && r.jam.trim() !== "" ? Number(r.jam) : NaN;
    return { pegawaiId: typeof r.pegawaiId === "string" ? r.pegawaiId : "", jam };
  });
  return {
    action: typeof b.action === "string" ? b.action : "",
    tanggal: typeof b.tanggal === "string" ? b.tanggal.trim() : "",
    uraianTugas: typeof b.uraianTugas === "string" ? b.uraianTugas : "",
    anggota,
    nik: typeof b.nik === "string" ? b.nik.trim() : "",
    passphrase: typeof b.passphrase === "string" ? b.passphrase : "",
  };
}

function galat(pesan: string, status: number) {
  return NextResponse.json({ error: pesan }, { status });
}

function tanggalKeDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function kodePrisma(err: unknown): string | undefined {
  return typeof err === "object" && err !== null && "code" in err
    ? String((err as { code: unknown }).code)
    : undefined;
}

export async function POST(req: NextRequest) {
  // Passphrase di luar try supaya blok catch bisa menyamarkannya dari pesan galat.
  let passphrase = "";
  try {
    const m = bacaMasukan(await req.json().catch(() => ({})));
    passphrase = m.passphrase;

    if (m.action !== "pratinjau" && m.action !== "kirim") {
      return galat("Aksi perintah lembur tidak dikenali.", 400);
    }

    const user = await ambilUserSesi();
    if (!user) return galat("Sesi tidak ditemukan. Silakan login kembali.", 401);

    // ---- Bentuk isian ----
    if (!FORMAT_TANGGAL.test(m.tanggal)) return galat("Tanggal lembur tidak valid.", 400);
    if (m.anggota.length > MAKS_ANGGOTA) {
      return galat(`Maksimal ${MAKS_ANGGOTA} anggota dalam satu perintah.`, 400);
    }
    if (m.uraianTugas.trim().length > MAKS_URAIAN) {
      return galat(`Uraian tugas maksimal ${MAKS_URAIAN} karakter.`, 400);
    }
    const galatIsian = validasiPerintah({ anggota: m.anggota, uraianTugas: m.uraianTugas });
    if (galatIsian.length > 0) return galat(galatIsian.join(" "), 400);

    // ---- Kepala tim: satker DARI DATABASE ----
    const kepala = await prisma.pegawai.findUnique({
      where: { nip: user.nip },
      select: { id: true, satuanKerja: true },
    });
    const authUser: AuthUser = {
      nip: user.nip,
      role: user.role,
      satuanKerja: user.satuanKerja,
      aktif: user.aktif,
    };
    const satkerKepala = kepala?.satuanKerja?.trim() ?? "";
    // Gerbang role + satker pilot + tanggal, sebelum menyentuh data anggota.
    if (!kepala || !canBuatPerintahLembur(authUser, satkerKepala, satkerKepala, m.tanggal)) {
      return galat("Anda tidak berwenang membuat perintah lembur untuk tanggal ini.", 403);
    }

    // ---- Anggota: diambil ulang dari DB, diperiksa PER BARIS ----
    const ids = m.anggota.map((a) => a.pegawaiId);
    const baris = await prisma.pegawai.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        nip: true,
        nama: true,
        jabatan: true,
        satuanKerja: true,
        statusPegawai: true,
        sourceSystem: true,
      },
    });
    const peta = new Map(baris.map((p) => [p.id, p]));
    const bukanAnggota = ids.some((id) => {
      const p = peta.get(id);
      if (!p) return true;
      if (p.id === kepala.id) return true; // tanpa diri sendiri
      if (p.statusPegawai !== "AKTIF") return true;
      if (p.sourceSystem === SUMBER_DUMMY && satkerKepala !== SATKER_DUMMY) return true;
      return !canBuatPerintahLembur(authUser, satkerKepala, p.satuanKerja, m.tanggal);
    });
    // Tanpa menyebut nama/penyebab: id asing tidak boleh dipakai untuk menebak data pegawai lain.
    if (bukanAnggota) {
      return galat("Ada anggota yang bukan anggota tim Anda atau sudah tidak aktif. Muat ulang halaman lalu pilih ulang.", 403);
    }

    // ---- Batas kirim 15.00 WIB, SEBELUM BSrE ----
    const batas = batasKirimPerintah(m.tanggal, new Date());
    if (!batas.boleh) return galat(batas.alasan ?? "Batas waktu kirim perintah sudah lewat.", 422);

    const [tahun, bulan] = m.tanggal.split("-").map(Number);
    const nomorSurat = generateNomorSuratTugasLemburDefault(bulan, tahun);
    const uraian = m.uraianTugas.trim();
    const peserta = (penugasan: AnggotaPerintahInput[]): PesertaSuratTugasLembur[] =>
      penugasan.map((a) => {
        const p = peta.get(a.pegawaiId)!;
        return {
          nip: p.nip,
          nama: namaCetakPegawai(p),
          jabatan: p.jabatan?.trim() || "-",
          // Hanya JUMLAH jam yang diputuskan kepala tim, bukan jam mulai-selesai.
          jamLembur: `${a.jam} jam`,
        };
      });
    const pdfDari = (
      penandatangan: { nama: string; nip: string; jabatan: string },
      previewTte: boolean,
    ) =>
      generateSuratTugasLemburPdf({
        nomorDokumen: nomorSurat,
        tanggalLembur: m.tanggal,
        uraianTugas: uraian,
        satuanKerja: satkerKepala,
        penandatangan,
        peserta: peserta(m.anggota),
        previewTte,
      });

    // ---- PRATINJAU ----
    if (m.action === "pratinjau") {
      const ttd = await prisma.pegawai.findUnique({
        where: { nip: user.nip },
        select: { nama: true, nip: true, jabatan: true },
      });
      const jabatan = ttd?.jabatan?.trim();
      if (!ttd || !jabatan) {
        return galat("Jabatan pada data pegawai Anda masih kosong. Lengkapi dulu sebelum membuat perintah lembur.", 422);
      }
      const pdf = await pdfDari({ nama: namaCetakPegawai(ttd), nip: ttd.nip, jabatan }, true);
      return NextResponse.json({
        success: true,
        namaBerkas: `Pratinjau ${generateNamaFileSuratTugasLembur(m.tanggal, satkerKepala)}`,
        pdfBase64: pdf.toString("base64"),
      });
    }

    // ---- KIRIM ----
    // NIK tepat 16 digit KHUSUS jalur ini (NIP 18 digit sering terketik).
    if (!FORMAT_NIK.test(m.nik)) return galat("NIK harus tepat 16 digit angka (bukan NIP).", 400);
    if (m.nik === NIK_DEMO_BSRE && !izinkanNikDemoLembur({ satuanKerja: satkerKepala, nip: user.nip })) {
      // Ditolak di pintu masuk; tandatanganiDokumen menolaknya lagi (izinkanNikDemoBsre:false).
      return galat("NIK sertifikat demo BSrE tidak boleh dipakai untuk surat tugas lembur. Gunakan NIK Anda sendiri.", 400);
    }
    if (!m.passphrase) return galat("Passphrase wajib diisi untuk menandatangani dokumen.", 400);

    const idAnggota = m.anggota.map((a) => a.pegawaiId);
    const tanggalDb = tanggalKeDate(m.tanggal);
    const namaBentrok = async (): Promise<string[]> => {
      const ada = await prisma.perintahLemburAnggota.findMany({
        where: { pegawaiId: { in: idAnggota }, tanggal: tanggalDb, terkirim: true },
        select: { pegawaiId: true },
      });
      return cariBentrok(idAnggota, ada).map((id) => namaCetakPegawai(peta.get(id)!));
    };
    const pesanBentrok = (nama: string[]) =>
      `Sudah ada perintah lembur terkirim untuk ${nama.join(", ")} pada ${hariTanggalId(m.tanggal)}. ` +
      "Satu pegawai hanya boleh punya satu perintah terkirim per tanggal; keluarkan nama itu dari perintah ini.";

    const sudah = await namaBentrok();
    if (sudah.length > 0) return galat(pesanBentrok(sudah), 409);

    const hasil = await tandatanganiDokumen({
      user: { id: user.id, nip: user.nip },
      jenisDokumen: "SURAT_TUGAS_LEMBUR",
      satuanKerja: satkerKepala,
      periodeBulan: bulan,
      periodeTahun: tahun,
      nomorDokumen: nomorSurat,
      judulDokumen: `Surat Tugas Lembur ${m.tanggal}`,
      labelDokumen: "surat tugas lembur",
      namaBerkasResmi: generateNamaFileSuratTugasLembur(m.tanggal, satkerKepala),
      namaBerkasKirim: generateNamaFileSuratTugasLembur(m.tanggal, satkerKepala),
      nik: m.nik,
      passphrase: m.passphrase,
      // Satker sungguhan TIDAK PERNAH memakai sertifikat demo; hanya unit uji.
      izinkanNikDemoBsre: izinkanNikDemoLembur({ satuanKerja: satkerKepala, nip: user.nip }),
      buatPdf: (penandatangan) => pdfDari(penandatangan, false),
      pathRevalidasi: [],
      batasWaktuSignMs: BATAS_WAKTU_SIGN_LEMBUR_MS,
    });
    if (!hasil.success || !hasil.dokumenId) {
      return galat(hasil.error ?? "Penandatanganan gagal.", 422);
    }
    const dokumenId = hasil.dokumenId;

    // Dokumen yatim: ditandai GAGAL + dicatat. Gagal mencatat tidak mengubah jawaban.
    const tandaiYatim = async (sebab: string) => {
      await prisma.dokumenTte
        .update({ where: { id: dokumenId }, data: { status: "GAGAL" } })
        .catch(() => null);
      await prisma.auditTrail
        .create({
          data: {
            entitas: "perintah_lembur",
            entitasId: dokumenId,
            aksi: "UPDATE",
            aktor: user.nip,
            satuanKerja: satkerKepala,
            dataSesudah: {
              keterangan: "Dokumen sudah ditandatangani tetapi perintah TIDAK dibuat; dokumen tidak dianggap sah",
              sebab,
              tanggal: m.tanggal,
              jumlahAnggota: m.anggota.length,
            },
          },
        })
        .catch(() => null);
    };

    // Batas dicek lagi terhadap waktu tanda tangan SELESAI (signedAt), bukan
    // waktu transaksi: tanda tangan yang selesai 14.59 tidak ditolak karena
    // transaksinya baru jalan 15.00.
    const dok = await prisma.dokumenTte
      .findUnique({ where: { id: dokumenId }, select: { signedAt: true } })
      .catch(() => null);
    const batasAkhir = batasKirimPerintah(m.tanggal, dok?.signedAt ?? new Date());
    if (!batasAkhir.boleh) {
      await tandaiYatim("LEWAT_BATAS_WAKTU");
      return galat(
        `Tanda tangan baru selesai setelah pukul ${JAM_BATAS_PESAN}, jadi perintah ini TIDAK berlaku dan tidak dikirim. ` +
          "Surat yang terlanjur ditandatangani tidak dianggap sah. Buat perintah untuk tanggal berikutnya.",
        422,
      );
    }

    try {
      const perintah = await prisma.$transaction(async (tx) => {
        const dibuat = await tx.perintahLembur.create({
          data: {
            satuanKerja: satkerKepala,
            tanggal: tanggalDb,
            kepalaTimId: user.id,
            uraianTugas: uraian,
            status: "TERKIRIM",
            nomorSurat,
            dokumenTteId: dokumenId,
            dikirimPada: new Date(),
            anggota: {
              create: m.anggota.map((a) => ({
                pegawaiId: a.pegawaiId,
                tanggal: tanggalDb,
                jamDiperintahkan: a.jam,
                terkirim: true,
              })),
            },
          },
          select: { id: true },
        });
        await tx.auditTrail.create({
          data: {
            entitas: "perintah_lembur",
            entitasId: dibuat.id,
            aksi: "CREATE",
            aktor: user.nip,
            satuanKerja: satkerKepala,
            dataSesudah: {
              tanggal: m.tanggal,
              jumlahAnggota: m.anggota.length,
              totalJam: m.anggota.reduce((s, a) => s + a.jam, 0),
              nomorSurat,
              dokumenTteId: dokumenId,
            },
          },
        });
        return dibuat;
      });

      return NextResponse.json({
        success: true,
        perintahId: perintah.id,
        dokumenId,
        downloadUrl: hasil.downloadUrl,
        nomorDokumen: nomorSurat,
        idDokumenBsre: hasil.idDokumenBsre,
        penandatanganNama: hasil.penandatanganNama,
        isSimulasi: hasil.isSimulasi,
        jumlahAnggota: m.anggota.length,
      });
    } catch (err) {
      // Kalah balapan: unique (pegawai, tanggal, terkirim) menolak yang kedua.
      if (kodePrisma(err) === "P2002") {
        const nama = await namaBentrok().catch(() => [] as string[]);
        await tandaiYatim("BENTROK_BALAPAN");
        return galat(
          nama.length > 0
            ? `${pesanBentrok(nama)} Surat yang baru saja ditandatangani tidak berlaku.`
            : "Perintah lain untuk salah satu anggota terkirim lebih dulu. Surat yang baru saja ditandatangani tidak berlaku.",
          409,
        );
      }
      await tandaiYatim("GALAT_PENYIMPANAN");
      throw err;
    }
  } catch (err) {
    return NextResponse.json(
      { error: pesanGalatUntukLayar("api.lembur.perintah", err, "Terjadi kendala pada perintah lembur", [passphrase]) },
      { status: 500 },
    );
  }
}
