import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ambilUserSesi } from "@/auth/getSessionAccount";
import { canTandatanganiSpklHarian, type AuthUser } from "@/auth/permissions";
import { namaCetakPegawai } from "@/business-logic/namaPegawai";
import { pesanGalatUntukLayar } from "@/lib/koneksi/galatSumber";
import { spklBerlakuDiPeriode } from "@/lib/lembur/perintahPeriode";
import { muatRekapSpkl, type RekapSpklBulanan } from "@/lib/lembur/rekapSpklBulanan";
import { tandatanganiDokumen, type HasilTandatangani } from "@/lib/tte/tandatanganiDokumen";
import { NIK_DEMO_BSRE } from "@/lib/tte/simulasiTte";
import { izinkanNikDemoLembur } from "@/lib/lembur/izinNikDemoLembur";
import { generateSpklBulananPdf } from "@/lib/tte/spklBulananPdf";
import { BATAS_WAKTU_SIGN_LEMBUR_MS, generateNamaFileSpkl, generateNomorSpklDefault } from "@/lib/tte/lemburTypes";
import { NAMA_BULAN } from "@/lib/tte/sptjmTypes";
import { TTE_LEMBUR_AKTIF } from "@/lib/lembur/sakelarTteLembur";

export const dynamic = "force-dynamic";

/**
 * Route Handler JSON untuk SPKL BULANAN: `spkl-bulanan-pratinjau` dan
 * `spkl-bulanan-kirim`. JSON POST, bukan Server Action, supaya bebas dari
 * HTTP 500 di balik FortiWeb (lihat src/app/api/tte/route.ts). CSRF lapis
 * kedua (Origin) ditegakkan middleware untuk semua POST /api/*, kecuali
 * /api/auth dan RUTE_MESIN; route ini tidak ada di pengecualian itu.
 *
 * ISI DOKUMEN = rekap otomatis semua perintah harian TERKIRIM satker itu pada
 * bulan itu (muatRekapSpkl). Klien TIDAK mengirim daftar pegawai, tanggal,
 * maupun satker; yang dibaca dari badan permintaan hanya action, bulan, tahun,
 * nik, passphrase (daftar putih). Satker diambil dari akun pada sesi.
 *
 * Kedua aksi menuntut `canTandatanganiSpklHarian`: pratinjau mencetak nama
 * pemegang sesi sebagai penanda tangan, jadi PPABP/ADMIN (lihat-saja) tidak
 * diberi pratinjau berpenanda tangan palsu.
 *
 * SATU SPKL TERTANDATANGANI PER SATKER+PERIODE. Tabel DokumenTte tidak punya
 * unique pada (jenis, satker, periode) dan penambahannya butuh migrasi, jadi
 * dijaga dengan kunci penasihat PostgreSQL (`pg_try_advisory_xact_lock`) pada
 * kunci "satker+periode" selama seluruh proses tanda tangan:
 *   - pemeriksaan "sudah ada yang TERTANDATANGANI" dan penandatanganan
 *     terjadi DI DALAM satu transaksi yang memegang kunci itu, jadi dua
 *     permintaan bersamaan tidak bisa sama-sama lolos pemeriksaan;
 *   - yang gagal mendapat kunci TIDAK menunggu, langsung ditolak 409
 *     ("sedang diproses") sehingga tidak ada dokumen BSrE kedua yang terbit;
 *   - kunci dilepas otomatis saat transaksi selesai atau gagal.
 * Konsekuensi: satu koneksi database tertahan selama BSrE menjawab; jarang
 * terjadi (sekali per satker per bulan). Panggilan sign BSrE diberi batas
 * eksplisit BATAS_WAKTU_SIGN_LEMBUR_MS (60 dtk, AbortSignal.timeout), jauh di
 * bawah BATAS_TRANSAKSI_MS (180 dtk) yang juga menampung pemeriksaan
 * sertifikat (maks. ~17 dtk) dan pembuatan PDF; jadi transaksi tidak habis
 * sebelum BSrE dinyatakan gagal.
 *
 * DOKUMEN SEDANG DIPROSES. Dokumen berstatus MENUNGGU_TTE yang dibuat kurang
 * dari 5 menit lalu dianggap sedang diproses (409), termasuk bila transaksi
 * sebelumnya sudah tertutup padahal BSrE belum menjawab. Yang lebih tua tidak
 * memblokir (sisa kegagalan yang tidak sempat ditandai GAGAL).
 * Transaksi yang tertutup/kedaluwarsa (P2028) dijawab dengan pesan khusus
 * "mungkin sudah berhasil", bukan 500.
 *
 * TTE ULANG SENGAJA DITOLAK. SPKL yang sudah ditandatangani adalah perintah
 * resmi bulan itu; menerbitkan versi kedua berarti dua dokumen sah dengan isi
 * berbeda. Perintah yang terkirim SESUDAH SPKL ditandatangani tidak
 * dimuatnya, dan itu ditampilkan sebagai peringatan di halaman.
 * TODO(confirm): apakah SPKL susulan/revisi boleh diterbitkan, dan siapa yang
 * berwenang membatalkan yang lama.
 *
 * AuditTrail ditulis SESUDAH transaksi (galat audit di dalam transaksi akan
 * membatalkan transaksinya padahal dokumen sudah bertanda tangan di BSrE).
 * Isinya periode, jumlah, nomor surat, id dokumen: tanpa NIP/NIK pegawai.
 *
 * PASSPHRASE hanya di memori selama pemanggilan: tidak masuk log, galat,
 * AuditTrail, maupun respons. Sengaja TANPA revalidatePath (pelajaran
 * pentest F-02); klien memanggil router.refresh() sendiri.
 */

const FORMAT_NIK = /^\d{16}$/;
// Di atas BATAS_WAKTU_SIGN_LEMBUR_MS ditambah pemeriksaan sertifikat dan PDF; lihat catatan kunci di atas.
const BATAS_TRANSAKSI_MS = 180_000;
const MASA_SEDANG_DIPROSES_MS = 5 * 60_000;

/** Transaksi Prisma tertutup/kedaluwarsa: P2028 atau pesan "Transaction ... closed/expired". */
function galatTransaksiTertutup(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const kode = "code" in err ? String((err as { code: unknown }).code) : "";
  if (kode === "P2028") return true;
  const pesan = err instanceof Error ? err.message : "";
  return /transaction (already closed|not found)|expired transaction|transaction api error/i.test(pesan);
}

interface Masukan {
  action: string;
  bulan: number;
  tahun: number;
  nik: string;
  passphrase: string;
}

/** DAFTAR PUTIH: field lain (satker, daftar anggota, nomor surat, dst.) dari klien tidak pernah dibaca. */
function bacaMasukan(body: unknown): Masukan {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const angka = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);
  return {
    action: typeof b.action === "string" ? b.action : "",
    bulan: angka(b.bulan),
    tahun: angka(b.tahun),
    nik: typeof b.nik === "string" ? b.nik.trim() : "",
    passphrase: typeof b.passphrase === "string" ? b.passphrase : "",
  };
}

function galat(pesan: string, status: number) {
  return NextResponse.json({ error: pesan }, { status });
}

type HasilTransaksi =
  | { jenis: "sibuk" }
  | { jenis: "sudah" }
  | { jenis: "kosong" }
  | { jenis: "gagal"; pesan: string }
  | { jenis: "ok"; hasil: HasilTandatangani; rekap: RekapSpklBulanan; nomor: string };

export async function POST(req: NextRequest) {
  // Passphrase di luar try supaya blok catch bisa menyamarkannya dari pesan galat.
  let passphrase = "";
  try {
    // Penandatanganan SPKL ditutup selama TTE lembur mati (sakelarTteLembur.ts):
    // SPKL kini harian dan tanpa TTE (lihat /berkas/spkl-harian). Dijawab SEBELUM
    // sesi atau badan permintaan dibaca. Kode di bawah dibiarkan utuh untuk
    // dipakai lagi bila sakelar dinyalakan.
    if (!TTE_LEMBUR_AKTIF) return galat("Tidak ditemukan.", 404);

    const m = bacaMasukan(await req.json().catch(() => ({})));
    passphrase = m.passphrase;

    if (m.action !== "spkl-bulanan-pratinjau" && m.action !== "spkl-bulanan-kirim") {
      return galat("Aksi SPKL bulanan tidak dikenali.", 400);
    }

    const user = await ambilUserSesi();
    if (!user) return galat("Sesi tidak ditemukan. Silakan login kembali.", 401);

    if (!Number.isInteger(m.bulan) || m.bulan < 1 || m.bulan > 12 || !Number.isInteger(m.tahun) || m.tahun < 2000 || m.tahun > 2100) {
      return galat("Periode tidak valid.", 400);
    }

    // Satker DARI AKUN pada sesi, bukan dari badan permintaan.
    const satker = user.satuanKerja?.trim() ?? "";
    const authUser: AuthUser = { nip: user.nip, role: user.role, satuanKerja: satker || null, aktif: user.aktif };
    if (!satker || !canTandatanganiSpklHarian(authUser, satker)) {
      return galat("Anda tidak berwenang menandatangani SPKL bulanan unit ini.", 403);
    }
    if (!spklBerlakuDiPeriode(satker, m.bulan, m.tahun)) {
      return galat("SPKL belum berlaku untuk satuan kerja dan periode ini.", 422);
    }

    const namaBulan = NAMA_BULAN[m.bulan - 1];
    const nomor = generateNomorSpklDefault(m.bulan, m.tahun);
    const namaBerkas = generateNamaFileSpkl(m.bulan, m.tahun, satker);
    const pdfDari = (
      rekap: RekapSpklBulanan,
      penandatangan: { nama: string; nip: string; jabatan: string },
      previewTte: boolean,
    ) =>
      generateSpklBulananPdf({
        nomorDokumen: nomor,
        periodeBulan: m.bulan,
        periodeTahun: m.tahun,
        satuanKerja: satker,
        penandatangan,
        anggota: rekap.anggota,
        previewTte,
      });

    // ---- PRATINJAU ----
    if (m.action === "spkl-bulanan-pratinjau") {
      const rekap = await muatRekapSpkl(prisma, satker, m.bulan, m.tahun);
      if (rekap.anggota.length === 0) {
        return galat(`Belum ada perintah lembur terkirim untuk ${namaBulan} ${m.tahun}, jadi belum ada yang bisa dipratinjau.`, 422);
      }
      const ttd = await prisma.pegawai.findUnique({
        where: { nip: user.nip },
        select: { nama: true, nip: true, jabatan: true },
      });
      const jabatan = ttd?.jabatan?.trim();
      if (!ttd || !jabatan) {
        return galat("Jabatan pada data pegawai Anda masih kosong. Lengkapi dulu sebelum menandatangani SPKL.", 422);
      }
      const pdf = await pdfDari(rekap, { nama: namaCetakPegawai(ttd), nip: ttd.nip, jabatan }, true);
      return NextResponse.json({
        success: true,
        namaBerkas: `Pratinjau ${namaBerkas}`,
        pdfBase64: pdf.toString("base64"),
      });
    }

    // ---- KIRIM ----
    // NIK tepat 16 digit KHUSUS jalur ini (NIP 18 digit sering terketik).
    if (!FORMAT_NIK.test(m.nik)) return galat("NIK harus tepat 16 digit angka (bukan NIP).", 400);
    if (m.nik === NIK_DEMO_BSRE && !izinkanNikDemoLembur({ satuanKerja: satker, nip: user.nip })) {
      // Ditolak di pintu masuk; tandatanganiDokumen menolaknya lagi (izinkanNikDemoBsre:false).
      return galat("NIK sertifikat demo BSrE tidak boleh dipakai untuk SPKL bulanan. Gunakan NIK Anda sendiri.", 400);
    }
    if (!m.passphrase) return galat("Passphrase wajib diisi untuk menandatangani dokumen.", 400);

    const kunci = `spkl-bulanan:${satker}:${m.tahun}-${m.bulan}`;
    const hasilTx: HasilTransaksi = await prisma.$transaction(
      async (tx): Promise<HasilTransaksi> => {
        const kunciDidapat = await tx.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext(${kunci})) AS ok`;
        if (!kunciDidapat[0]?.ok) return { jenis: "sibuk" };

        const sudah = await tx.dokumenTte.findFirst({
          where: {
            jenisDokumen: "SPKL_BULANAN",
            satuanKerja: satker,
            periodeBulan: m.bulan,
            periodeTahun: m.tahun,
            status: "TERTANDATANGANI",
          },
          select: { id: true },
        });
        if (sudah) return { jenis: "sudah" };

        // Draf yang masih segar = penandatanganan lain (mungkin dari transaksi
        // yang sudah tertutup) belum selesai: jangan terbitkan dokumen kedua.
        const diproses = await tx.dokumenTte.findFirst({
          where: {
            jenisDokumen: "SPKL_BULANAN",
            satuanKerja: satker,
            periodeBulan: m.bulan,
            periodeTahun: m.tahun,
            status: "MENUNGGU_TTE",
            createdAt: { gte: new Date(Date.now() - MASA_SEDANG_DIPROSES_MS) },
          },
          select: { id: true },
        });
        if (diproses) return { jenis: "sibuk" };

        const rekap = await muatRekapSpkl(tx, satker, m.bulan, m.tahun);
        if (rekap.anggota.length === 0) return { jenis: "kosong" };

        const hasil = await tandatanganiDokumen({
          user: { id: user.id, nip: user.nip },
          jenisDokumen: "SPKL_BULANAN",
          satuanKerja: satker,
          periodeBulan: m.bulan,
          periodeTahun: m.tahun,
          nomorDokumen: nomor,
          judulDokumen: `SPKL ${namaBulan} ${m.tahun}`,
          labelDokumen: "SPKL bulanan",
          namaBerkasResmi: namaBerkas,
          namaBerkasKirim: namaBerkas,
          nik: m.nik,
          passphrase: m.passphrase,
          // Satker sungguhan TIDAK PERNAH memakai sertifikat demo; hanya unit uji.
          izinkanNikDemoBsre: izinkanNikDemoLembur({ satuanKerja: satker, nip: user.nip }),
          buatPdf: (penandatangan) => pdfDari(rekap, penandatangan, false),
          pathRevalidasi: [],
          batasWaktuSignMs: BATAS_WAKTU_SIGN_LEMBUR_MS,
        });
        if (!hasil.success || !hasil.dokumenId) {
          return { jenis: "gagal", pesan: hasil.error ?? "Penandatanganan gagal." };
        }
        return { jenis: "ok", hasil, rekap, nomor };
      },
      { timeout: BATAS_TRANSAKSI_MS, maxWait: 10_000 },
    );

    if (hasilTx.jenis === "sibuk") {
      return galat("SPKL bulan ini sedang ditandatangani. Tunggu sebentar lalu muat ulang halaman.", 409);
    }
    if (hasilTx.jenis === "sudah") {
      return galat(
        `SPKL ${namaBulan} ${m.tahun} untuk unit ini sudah ditandatangani. Tanda tangan ulang tidak tersedia; muat ulang halaman untuk mengunduhnya.`,
        409,
      );
    }
    if (hasilTx.jenis === "kosong") {
      return galat(`Belum ada perintah lembur terkirim untuk ${namaBulan} ${m.tahun}, jadi tidak ada yang bisa ditandatangani.`, 422);
    }
    if (hasilTx.jenis === "gagal") return galat(hasilTx.pesan, 422);

    const { hasil, rekap } = hasilTx;
    // Gagal mencatat tidak mengubah jawaban: dokumennya sudah bertanda tangan.
    await prisma.auditTrail
      .create({
        data: {
          entitas: "spkl_bulanan",
          entitasId: hasil.dokumenId as string,
          aksi: "CREATE",
          aktor: user.nip,
          satuanKerja: satker,
          dataSesudah: {
            periode: `${m.bulan}/${m.tahun}`,
            jumlahPerintah: rekap.ringkasan.jumlahPerintah,
            jumlahPegawai: rekap.ringkasan.jumlahPegawai,
            totalJam: rekap.ringkasan.totalJam,
            nomorSurat: nomor,
            dokumenTteId: hasil.dokumenId as string,
          },
        },
      })
      .catch(() => console.error("[spkl] AuditTrail SPKL bulanan gagal ditulis"));

    return NextResponse.json({
      success: true,
      dokumenId: hasil.dokumenId,
      downloadUrl: hasil.downloadUrl,
      nomorDokumen: nomor,
      idDokumenBsre: hasil.idDokumenBsre,
      penandatanganNama: hasil.penandatanganNama,
      isSimulasi: hasil.isSimulasi,
      jumlahPegawai: rekap.ringkasan.jumlahPegawai,
    });
  } catch (err) {
    if (galatTransaksiTertutup(err)) {
      return galat(
        "Penandatanganan mungkin sudah berhasil. Muat ulang halaman dan periksa dulu sebelum mencoba lagi.",
        409,
      );
    }
    return NextResponse.json(
      { error: pesanGalatUntukLayar("api.lembur.spkl", err, "Terjadi kendala pada SPKL bulanan", [passphrase]) },
      { status: 500 },
    );
  }
}
