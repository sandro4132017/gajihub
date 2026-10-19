import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { NAMA_BULAN } from "@/app/bulan";

export const dynamic = "force-dynamic";

export default async function VerifyTtePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const dokumen = await prisma.dokumenTte
    .findUnique({
      where: { id },
    })
    .catch(() => null);

  if (!dokumen) {
    return (
      <main className="mx-auto max-w-xl px-4 py-12">
        <div className="rounded-2xl border border-red/30 bg-red-tint/40 p-6 text-center shadow-xs">
          <h1 className="text-lg font-extrabold text-red">
            Dokumen TTE Tidak Ditemukan
          </h1>
          <p className="mt-2 text-xs text-muted">
            ID Dokumen <code className="font-mono font-bold">{id}</code> tidak terdaftar pada basis data Tanda Tangan Elektronik Gajihub Kemnaker.
          </p>
          <div className="mt-5">
            <Link href="/login" className="btn btn-secondary text-xs">
              Kembali ke Halaman Utama
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const sah = dokumen.status === "TERTANDATANGANI";
  const namaBulan = NAMA_BULAN[(dokumen.periodeBulan ?? 1) - 1] ?? String(dokumen.periodeBulan);

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm space-y-5">
        <div className="flex items-start justify-between gap-3 border-b border-line pb-4">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-biru">
              Verifikasi Dokumen Elektronik (BSrE - BSSN)
            </span>
            <h1 className="mt-1 text-lg font-black text-navy">
              {dokumen.judulDokumen}
            </h1>
            <p className="text-xs text-muted">
              Kementerian Ketenagakerjaan Republik Indonesia
            </p>
          </div>
          <span
            className={`chip ${
              sah ? "chip-ok" : "chip-warn"
            } shrink-0 font-bold text-xs`}
          >
            {sah ? "TERVERIFIKASI SAH" : dokumen.status}
          </span>
        </div>

        <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
          <div className="rounded-xl bg-surface-2 p-3 border border-line/60">
            <dt className="text-[10px] font-bold uppercase text-muted">Nomor Surat</dt>
            <dd className="mt-0.5 font-mono font-bold text-ink">{dokumen.nomorDokumen}</dd>
          </div>
          <div className="rounded-xl bg-surface-2 p-3 border border-line/60">
            <dt className="text-[10px] font-bold uppercase text-muted">Periode &amp; Satuan Kerja</dt>
            <dd className="mt-0.5 font-bold text-ink">
              {namaBulan} {dokumen.periodeTahun} &bull; {dokumen.satuanKerja}
            </dd>
          </div>
          <div className="rounded-xl bg-surface-2 p-3 border border-line/60">
            <dt className="text-[10px] font-bold uppercase text-muted">Penandatangan</dt>
            <dd className="mt-0.5 font-bold text-ink">{dokumen.penandatanganNama}</dd>
            <dd className="text-[11px] text-muted">NIP. {dokumen.penandatanganNip}</dd>
            <dd className="text-[11px] text-muted">{dokumen.penandatanganJabatan}</dd>
          </div>
          <div className="rounded-xl bg-surface-2 p-3 border border-line/60">
            <dt className="text-[10px] font-bold uppercase text-muted">ID Dokumen BSrE &amp; Waktu TTE</dt>
            <dd className="mt-0.5 font-mono font-bold text-ink">
              {dokumen.idDokumenBsre ?? "-"}
            </dd>
            <dd className="mt-0.5 text-[11px] text-muted">
              {dokumen.signedAt
                ? new Date(dokumen.signedAt).toLocaleString("id-ID", {
                    dateStyle: "long",
                    timeStyle: "short",
                  })
                : "Belum ditandatangani"}
            </dd>
          </div>
        </dl>

        {dokumen.fileSignedPath && (
          <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-line">
            <p className="text-[11px] text-muted">
              Dokumen ini telah ditandatangani secara elektronik menggunakan sertifikat elektronik BSrE - BSSN.
            </p>
            <a
              href={dokumen.fileSignedPath}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary text-xs px-4 py-2"
            >
              Unduh PDF Bertanda Tangan
            </a>
          </div>
        )}
      </div>
    </main>
  );
}

