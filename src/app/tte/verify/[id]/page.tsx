import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { NAMA_BULAN } from "@/lib/format/bulan";
import { apakahHasilSimulasi } from "../../../../lib/tte/simulasiTte";
import FormValidasiNaskah from "./FormValidasiNaskah";
import { hashUntukDibaca } from "../../../../lib/tte/hashBerkas";
import {
  periksaKeBsre,
  TTL_PERIKSA_MENIT,
  type VonisBsre,
} from "../../../../lib/tte/periksaBsre";

export const dynamic = "force-dynamic";

// ============================================================================
// HALAMAN YANG DILIHAT ORANG LUAR SESUDAH MEMINDAI QR.
//
// Bentuknya sengaja mengikuti pola halaman verifikasi naskah dinas yang sudah
// dikenal orang (SRIKANDI dan sejenisnya) - Jakob's Law: yang memeriksa
// keaslian dokumen di sini bukan pengguna Gajihub, melainkan siapa saja yang
// kebetulan memegang kertasnya. Tata letak yang sudah mereka kenali lebih
// berguna daripada tampilan yang khas tapi asing.
//
// HIERARKI EMPAT LAPIS di dalam satu kartu: vonis jadi strip beraksen, sidik
// berkas jadi blok netral, identitas jadi baris label-nilai polos, dan
// SATU-SATUNYA kotak bergaris penuh adalah aksinya - unggah & validasi. Kalau
// semuanya diberi kotak, tidak ada yang menonjol.
//
// Dibuka dari HP, jadi satu kolom dan sasaran sentuh selebar kartunya
// (Fitts's Law).
// ============================================================================

/** Kata-kata untuk tiap vonis BSrE, apa adanya tanpa menuduh. */
const TEKS_VONIS: Record<VonisBsre, string> = {
  VALID: "Tanda tangan elektronik pada berkas ini SAH menurut BSrE.",
  TANPA_TANDA_TANGAN:
    "BSrE tidak menemukan tanda tangan elektronik apa pun pada berkas ini.",
  // JANGAN DIBACA SEBAGAI "dokumen palsu". Tanda tangan PAdES-LTV menambahkan
  // data validasi SESUDAH penandatanganan - itu memang caranya, supaya tanda
  // tangannya tetap bisa diperiksa bertahun-tahun kemudian - dan sebagian
  // verifier membaca penambahan itu sebagai dokumen berubah.
  TIDAK_DISAHKAN:
    "Tanda tangannya ADA, tetapi verifier BSrE tidak mengesahkannya. Ini belum tentu berarti dokumennya bermasalah: tanda tangan jangka panjang (PAdES-LTV) menambahkan data validasi sesudah penandatanganan, dan sebagian pemeriksa membacanya sebagai perubahan. Pemeriksaan pembanding: buka berkas PDF-nya di Adobe Acrobat Reader.",
  TIDAK_BISA_DIPERIKSA:
    "Layanan verifikasi BSrE tidak dapat dihubungi saat ini, jadi keterangan di halaman ini berasal dari catatan Gajihub - bukan dari BSrE.",
};

/** Satu baris "Label : Nilai", bentuk yang dipakai naskah dinas. */
function Baris({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-3 py-2.5 sm:grid-cols-[9rem_1fr]">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="text-xs font-bold text-ink">{children}</dd>
    </div>
  );
}

function Kop() {
  return (
    <header className="text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/logo-kemnaker.png"
        alt=""
        className="mx-auto h-14 w-auto"
      />
      <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
        Dokumen ini ditandatangani secara elektronik melalui
      </p>
      <p className="mt-1 text-sm font-black uppercase leading-snug tracking-wide text-navy">
        Gajihub &mdash; Sentralisasi Belanja Pegawai
      </p>
      <p className="mt-0.5 text-[11px] font-bold text-muted">
        Kementerian Ketenagakerjaan Republik Indonesia
      </p>
    </header>
  );
}

export default async function VerifyTtePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const dokumen = await prisma.dokumenTte
    .findUnique({ where: { id } })
    .catch(() => null);

  if (!dokumen) {
    return (
      <main className="mx-auto max-w-xl px-4 py-10">
        <Kop />
        <div className="card mt-6 border-l-4 border-l-red p-5 text-center">
          <p className="text-sm font-black text-red">Dokumen Tidak Ditemukan</p>
          <p className="mt-2 text-[11px] text-muted">
            Id dokumen{" "}
            <code className="break-all font-mono font-bold">{id}</code> tidak
            terdaftar pada basis data tanda tangan elektronik Gajihub.
          </p>
          <div className="mt-5">
            <Link href="/login" className="btn btn-secondary text-xs">
              Ke halaman utama
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // DOKUMEN SIMULASI TIDAK BOLEH DINYATAKAN SAH. Halaman ini dibuka dengan
  // memindai QR, jadi inilah yang dilihat orang luar sebagai jawaban atas
  // pertanyaan apakah dokumennya benar - dan stempel simulasi juga berstatus
  // TERTANDATANGANI.
  const simulasi = apakahHasilSimulasi(dokumen);
  const sah = dokumen.status === "TERTANDATANGANI" && !simulasi;
  const namaBulan =
    NAMA_BULAN[(dokumen.periodeBulan ?? 1) - 1] ?? String(dokumen.periodeBulan);

  // DITANYAKAN KE BSrE, bukan disimpulkan dari catatan sendiri. QR menunjuk ke
  // halaman ini karena linkQR di Esign Client memang alamat milik instansi -
  // BSrE tidak punya halaman tujuan untuk dipindai; yang mereka sediakan API.
  const periksa =
    sah && dokumen.fileSignedPath
      ? await periksaKeBsre(dokumen.id, dokumen.fileSignedPath)
      : null;

  const vonis = (() => {
    if (simulasi) {
      return {
        aksen: "border-l-red",
        warna: "text-red",
        label: "Bukan TTE BSrE (simulasi)",
        jelas:
          "Dokumen ini distempel simulasi dan TIDAK pernah ditandatangani sertifikat elektronik BSrE.",
      };
    }
    if (!sah) {
      return {
        aksen: "border-l-gold",
        warna: "text-gold-deep",
        label: `Status: ${dokumen.status}`,
        jelas: "Dokumen ini belum selesai ditandatangani.",
      };
    }
    switch (periksa?.vonis) {
      case "VALID":
        return {
          aksen: "border-l-green",
          warna: "text-green",
          label: "Terverifikasi BSrE",
          jelas: TEKS_VONIS.VALID,
        };
      case "TANPA_TANDA_TANGAN":
        return {
          aksen: "border-l-red",
          warna: "text-red",
          label: "Tidak bertanda tangan",
          jelas: TEKS_VONIS.TANPA_TANDA_TANGAN,
        };
      case "TIDAK_DISAHKAN":
        return {
          aksen: "border-l-gold",
          warna: "text-gold-deep",
          label: "Perlu pemeriksaan lanjut",
          jelas: TEKS_VONIS.TIDAK_DISAHKAN,
        };
      default:
        // BSrE tidak terjangkau - katakan apa yang benar-benar kita tahu, dan
        // JANGAN berbunyi seperti pengesahan.
        return {
          aksen: "border-l-gold",
          warna: "text-gold-deep",
          label: "Tercatat tertandatangani",
          jelas: TEKS_VONIS.TIDAK_BISA_DIPERIKSA,
        };
    }
  })();

  const waktuTtePanjang = dokumen.signedAt
    ? new Date(dokumen.signedAt).toLocaleString("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <Kop />

      <div className="card mt-6 p-5 sm:p-6">
        {/* LAPIS 1 - vonis. Strip beraksen, bukan kotak: ini keterangan, dan
            kotak penuh di halaman ini milik aksinya. */}
        <div className={`border-l-4 ${vonis.aksen} bg-surface-2 py-3 pl-4 pr-3`}>
          <p className={`text-sm font-black ${vonis.warna}`}>{vonis.label}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-2">
            {vonis.jelas}
          </p>
          {periksa && (
            <p className="mt-2 text-[10px] text-muted">
              Ditanyakan ke BSrE{" "}
              {periksa.diperiksaPada.toLocaleString("id-ID", {
                dateStyle: "long",
                timeStyle: "short",
              })}
              , disimpan paling lama {TTL_PERIKSA_MENIT} menit.
            </p>
          )}
        </div>

        {/* LAPIS 2 - sidik berkas. Blok netral; angka selalu font-mono. */}
        {dokumen.hashBerkas && (
          <div className="mt-5 rounded-xl bg-surface-2 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
              Nilai Sidik Berkas (SHA-256)
            </p>
            <p className="mt-1 break-all font-mono text-[11px] font-bold leading-relaxed text-navy">
              {hashUntukDibaca(dokumen.hashBerkas)}
            </p>
          </div>
        )}

        {/* LAPIS 3 - identitas. Baris label-nilai polos, tanpa kotak. */}
        <p className="mt-6 text-sm font-black text-navy">
          Naskah ini telah ditandatangani oleh :
        </p>
        <dl className="mt-2 divide-y divide-line/70">
          <Baris label="Nama">{dokumen.penandatanganNama ?? "-"}</Baris>
          <Baris label="NIP">
            <span className="font-mono">{dokumen.penandatanganNip ?? "-"}</span>
          </Baris>
          <Baris label="Jabatan">{dokumen.penandatanganJabatan ?? "-"}</Baris>
          <Baris label="Unit Kerja">{dokumen.satuanKerja}</Baris>
          <Baris label="Instansi">
            Kementerian Ketenagakerjaan Republik Indonesia
          </Baris>
          <Baris label="Ditandatangani pada">
            {waktuTtePanjang ?? "Belum ditandatangani"}
          </Baris>
        </dl>

        <p className="mt-6 text-sm font-black text-navy">Naskah</p>
        <dl className="mt-2 divide-y divide-line/70">
          <Baris label="Judul">{dokumen.judulDokumen}</Baris>
          <Baris label="Nomor">
            <span className="font-mono">{dokumen.nomorDokumen ?? "-"}</span>
          </Baris>
          <Baris label="Periode">
            {namaBulan} {dokumen.periodeTahun}
          </Baris>
        </dl>

        {/* LAPIS 4 - AKSI. Satu-satunya kotak bergaris penuh di halaman ini. */}
        <section className="mt-6 rounded-2xl border border-line p-4">
          <p className="text-sm font-black text-navy">Validasi Keaslian Naskah</p>
          <p className="mt-1 mb-3 text-[11px] leading-relaxed text-muted">
            Unggah naskah dinas yang Anda miliki untuk diperiksa keasliannya.
            Berkasnya tidak disimpan di server.
          </p>
          <FormValidasiNaskah dokumenId={dokumen.id} />
          {dokumen.hashBerkas && (
            <p className="mt-3 text-[10px] leading-relaxed text-muted">
              Bisa juga diperiksa sendiri tanpa jaringan: jalankan{" "}
              <code className="font-mono font-bold">sha256sum</code> pada berkas
              PDF yang Anda pegang, lalu bandingkan dengan nilai sidik di atas.
            </p>
          )}
        </section>

        {dokumen.fileSignedPath && (
          <a
            /* LEWAT RUTE, BUKAN /uploads/ LANGSUNG. Middleware mencegat .pdf
               dan mengalihkan pengunjung tanpa sesi ke /login - lihat
               berkas/route.ts. */
            href={`/tte/verify/${dokumen.id}/berkas`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary mt-3 w-full text-xs"
          >
            Unduh PDF Bertanda Tangan
          </a>
        )}
      </div>

      {/* Kriteria XI BSrE - klausul resmi ikut tercantum. */}
      <p className="mx-auto mt-5 max-w-md text-center text-[10px] leading-relaxed text-muted">
        Dokumen ini telah ditandatangani secara elektronik menggunakan
        sertifikat elektronik yang diterbitkan oleh Balai Sertifikasi Elektronik
        (BSrE), Badan Siber dan Sandi Negara.
      </p>
    </main>
  );
}
