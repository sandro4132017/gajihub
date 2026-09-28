"use client";

import { useActionState } from "react";
import {
  periksaSyncPegawaiAction,
  terapkanSyncPegawaiAction,
  type SyncPegawaiFormState,
} from "./actionsSyncPegawai";

/**
 * Tombol sinkronisasi pegawai - DUA LANGKAH, dan langkah pertama wajib.
 *
 * Tombol "Terapkan" baru muncul SETELAH pratinjaunya tampil. Bukan sekadar
 * dinonaktifkan: selama daftar perubahannya belum ada di layar, tombol itu
 * tidak ada sama sekali, jadi tidak ada jalan menerapkan perubahan yang belum
 * dilihat. Servernya sendiri tidak menuntut urutan itu - yang menjaganya di
 * sini bentuk layarnya, dan itu memang cukup untuk aksi yang cuma bisa
 * dijalankan Admin.
 */

const AWAL: SyncPegawaiFormState = {};

export function SinkronPegawaiForm() {
  const [cek, aksiCek, sedangCek] = useActionState(periksaSyncPegawaiAction, AWAL);
  const [terap, aksiTerap, sedangTerap] = useActionState(terapkanSyncPegawaiAction, AWAL);

  // Yang ditampilkan: hasil penerapan kalau sudah ada, kalau belum ya
  // pratinjaunya. Sesudah diterapkan, angka pratinjau sudah basi dan
  // menampilkannya berdampingan cuma mengundang orang membaca yang salah.
  const rencana = terap.hasil?.rencana ?? cek.rencana;
  const sudahDiterapkan = terap.hasil !== undefined;
  const pesanGalat = terap.error ?? cek.error;

  return (
    <section className="card mt-4 border-l-4 border-l-navy p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-ink">Sinkronisasi data pegawai dari SIAP</h2>
          <p className="mt-1 text-xs text-muted">
            Menarik identitas, jabatan, golongan, kelas jabatan, dan satuan kerja. SIAP dibaca{" "}
            <strong>baca-saja</strong> - Gajihub tidak pernah menulis ke sana.
          </p>
        </div>
        <div className="flex flex-none items-center gap-2">
          <form action={aksiCek}>
            <button type="submit" disabled={sedangCek || sedangTerap} className="btn btn-secondary">
              {sedangCek ? "Memeriksa..." : "Periksa perubahan"}
            </button>
          </form>
          {rencana && !sudahDiterapkan && (
            <form action={aksiTerap}>
              <button type="submit" disabled={sedangTerap} className="btn btn-primary">
                {sedangTerap ? "Menerapkan..." : "Terapkan"}
              </button>
            </form>
          )}
        </div>
      </div>

      {pesanGalat && (
        <p className="mt-3 rounded-lg border border-red bg-red-tint px-3 py-2 text-sm font-medium text-red">
          {pesanGalat}
        </p>
      )}

      {sudahDiterapkan && (
        <p className="mt-3 rounded-lg border border-green bg-green/10 px-3 py-2 text-sm font-semibold text-green">
          Selesai - {terap.hasil!.tersimpan.toLocaleString("id-ID")} pegawai tersimpan/diperbarui,{" "}
          {terap.hasil!.statusDiperbarui} status ditandai ulang,{" "}
          {terap.hasil!.perubahanTercatat} perubahan masuk daftar periksa unit.
        </p>
      )}

      {rencana && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Angka label="Pegawai baru" nilai={rencana.pegawaiBaru.length} />
            {/* Pindah unit disorot walau nilainya nol - justru karena biasanya
                nol, angka bukan-nol di situ harus langsung terlihat. */}
            <Angka label="Pindah unit" nilai={rencana.pindahUnit.length} sorot />
            {/* Kelas jabatan ikut disorot: ia menentukan SELURUH tarif tukin
                pokok, jadi satu angka yang bergeser di sini mengubah
                pembayaran orangnya tanpa kolom lain ikut berubah. */}
            <Angka label="Kelas jabatan" nilai={rencana.gantiKelasJabatan.length} sorot />
            <Angka label="Ganti status" nilai={rencana.gantiStatus.length} sorot />
            {/* "Baris ter-upsert", bukan "data diperbarui": angka ini mencacah
                SETIAP pegawai yang sudah ada, berubah atau tidak. Labelnya yang
                lama membuatnya terbaca sebagai jumlah perubahan - padahal
                nilainya praktis selalu sebesar seluruh roster. */}
            <Angka label="Baris ter-upsert" nilai={rencana.jumlahDiperbarui} />
          </div>

          <p className="mt-2 text-[11px] text-muted">
            Sumber: SIAP <span className="font-mono">{rencana.sumber}</span> &middot;{" "}
            {rencana.dibacaDariSiap.toLocaleString("id-ID")} baris terbaca &middot;{" "}
            {rencana.siapDisimpan.toLocaleString("id-ID")} siap disimpan
            {rencana.dilewati.length > 0 && (
              <> &middot; {rencana.dilewati.reduce((n, d) => n + d.jumlah, 0)} dilewati</>
            )}
          </p>

          {rencana.pindahUnit.length > 0 && (
            <div className="mt-3 rounded-lg border border-gold bg-gold-tint p-3">
              <p className="text-sm font-bold text-gold-deep">
                {rencana.pindahUnit.length} pegawai berpindah satuan kerja
              </p>
              {/* Akibatnya disebut SEBELUM daftarnya, bukan sesudah: yang
                  membaca sedang memutuskan menekan Terapkan atau tidak, dan
                  keputusan itu bergantung pada tahu apa yang ikut berpindah. */}
              <p className="mt-1 text-xs text-ink-2">
                Seluruh riwayat pembayaran mereka ikut pindah ke unit baru - termasuk periode yang sudah
                dikirim &amp; dikunci unit lama. Periksa berkas ADK periode berjalan sesudah ini.
              </p>
              <ul className="mt-2 space-y-1.5 text-xs text-ink-2">
                {rencana.pindahUnit.map((c) => (
                  <li key={c.nip}>
                    <span className="font-semibold text-ink">{c.nama}</span>{" "}
                    <span className="font-mono text-[11px] text-muted">{c.nip}</span>
                    <span className="block">
                      {c.dari} <span className="text-muted">&rarr;</span> {c.ke}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {rencana.gantiKelasJabatan.length > 0 && (
            <div className="mt-3 rounded-lg border border-gold bg-gold-tint p-3">
              <p className="text-sm font-bold text-gold-deep">
                {rencana.gantiKelasJabatan.length} pegawai berubah kelas jabatan
              </p>
              <p className="mt-1 text-xs text-ink-2">
                Tarif tukin pokok diturunkan seluruhnya dari kelas jabatan. Periode yang sudah dihitung
                memakai kelas LAMA - hitung ulang unitnya sesudah ini.
              </p>
              <ul className="mt-2 space-y-1.5 text-xs text-ink-2">
                {rencana.gantiKelasJabatan.map((c) => (
                  <li key={c.nip}>
                    <span className="font-semibold text-ink">{c.nama}</span>{" "}
                    <span className="font-mono text-[11px] text-muted">{c.nip}</span>
                    <span className="block">
                      kelas {c.dari} <span className="text-muted">&rarr;</span> {c.ke} &middot; {c.satuanKerja}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {rencana.gantiStatus.length > 0 && (
            <details className="mt-2 rounded-lg border border-line-2 p-3">
              <summary className="cursor-pointer text-xs font-bold text-ink">
                {rencana.gantiStatus.length} pegawai berganti status
              </summary>
              <p className="mt-1 text-[11px] text-muted">
                Ditandai saja, tidak pernah dihapus - yang pensiun di tengah tahun tetap berhak atas tukin
                bulan-bulan yang sudah dikerjakannya.
              </p>
              <ul className="mt-2 space-y-1 text-xs text-ink-2">
                {rencana.gantiStatus.map((c) => (
                  <li key={c.nip}>
                    {c.nama} <span className="font-mono text-[11px] text-muted">{c.nip}</span>:{" "}
                    {c.dari} <span className="text-muted">&rarr;</span>{" "}
                    <span className="font-semibold text-ink">{c.ke}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {rencana.pegawaiBaru.length > 0 && (
            <details className="mt-2 rounded-lg border border-line-2 p-3">
              <summary className="cursor-pointer text-xs font-bold text-ink">
                {rencana.pegawaiBaru.length} pegawai baru
              </summary>
              <ul className="mt-2 space-y-1 text-xs text-ink-2">
                {rencana.pegawaiBaru.slice(0, 50).map((p) => (
                  <li key={p.nip}>
                    {p.nama} <span className="font-mono text-[11px] text-muted">{p.nip}</span> - {p.satuanKerja}
                  </li>
                ))}
              </ul>
              {rencana.pegawaiBaru.length > 50 && (
                <p className="mt-1 text-[11px] text-muted">
                  dan {rencana.pegawaiBaru.length - 50} lainnya.
                </p>
              )}
              <p className="mt-2 text-[11px] text-muted">
                Akun login mereka belum dibuat - jalankan{" "}
                <span className="font-mono">npx tsx src/auth/seedAkunPegawai.ts</span> sesudah ini.
              </p>
            </details>
          )}

          {!sudahDiterapkan && (
            <p className="mt-3 text-xs font-semibold text-ink-2">
              Belum ada yang ditulis. Tekan <strong>Terapkan</strong> kalau daftar di atas sudah benar.
            </p>
          )}

          {sudahDiterapkan && terap.hasil!.catatanSidikNik && (
            <p className="mt-2 text-[11px] text-muted">{terap.hasil!.catatanSidikNik}</p>
          )}
        </>
      )}
    </section>
  );
}

function Angka({ label, nilai, sorot = false }: { label: string; nilai: number; sorot?: boolean }) {
  const menonjol = sorot && nilai > 0;
  return (
    <div className={`rounded-lg border p-2.5 ${menonjol ? "border-gold bg-gold-tint" : "border-line-2"}`}>
      <p className={`font-mono text-lg font-extrabold ${menonjol ? "text-gold-deep" : "text-ink"}`}>
        {nilai.toLocaleString("id-ID")}
      </p>
      <p className="text-[11px] text-muted">{label}</p>
    </div>
  );
}
