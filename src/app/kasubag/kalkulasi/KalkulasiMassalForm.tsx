"use client";

import { useActionState, useState } from "react";
import { kalkulasiMassalTukinUangMakanAction, type KalkulasiMassalFormState } from "./actions";

const INITIAL_STATE: KalkulasiMassalFormState = {};

export function KalkulasiMassalForm({
  satuanKerja,
  periodeBulan,
  periodeTahun,
  jumlahBelumPunyaPredikat,
  jumlahSudahApproved,
  namaBulan,
}: {
  satuanKerja: string;
  periodeBulan: number;
  periodeTahun: number;
  /** Pegawai aktif yang predikat kinerjanya belum masuk - 0 berarti lengkap. */
  jumlahBelumPunyaPredikat: number;
  /** Baris Tukin periode ini yang sudah APPROVED - menghitung ulang membatalkannya. */
  jumlahSudahApproved: number;
  namaBulan: string;
}) {
  const [state, formAction, pending] = useActionState(kalkulasiMassalTukinUangMakanAction, INITIAL_STATE);
  const belumLengkap = jumlahBelumPunyaPredikat > 0;
  // Pilihan default SELALU yang aman (lewati). Yang merusak harus dipilih
  // sadar lalu dikonfirmasi - dua langkah, sama seperti "Setujui semua".
  const [perlakuan, setPerlakuan] = useState<"lewati" | "hitungUlang">("lewati");
  const adaApproved = jumlahSudahApproved > 0;

  return (
    <form action={formAction} className="card mt-4 p-4">
      <input type="hidden" name="satuanKerja" value={satuanKerja} />
      <input type="hidden" name="periodeBulan" value={periodeBulan} />
      <input type="hidden" name="periodeTahun" value={periodeTahun} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-ink">Ajukan kalkulasi Tukin + Uang Makan massal</p>
          <p className="text-xs text-muted">
            Periode {periodeBulan}/{periodeTahun} - dihitung dari presensi & predikat kinerja yang sudah tersedia. Pegawai
            tanpa presensi/predikat periode ini akan dilewati.
          </p>
        </div>
        <button type="submit" disabled={pending} className="btn btn-primary shrink-0">
          {pending ? "Menghitung..." : "Hitung sekarang"}
        </button>
      </div>

      {/* Gerbang kelengkapan. SENGAJA bukan tombol yang dimatikan: ada kasus
          sah di mana seseorang memang tidak akan pernah punya predikat periode
          itu (mis. baru masuk), dan tombol mati tanpa jalan keluar membuat satu
          unit tidak bisa dibayar sama sekali. Yang dilakukan: memaksa
          keputusannya diambil sadar, dan mencatat siapa yang memutuskan lewat
          AuditTrail di sisi action. */}
      {belumLengkap && (
        <label className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-gold-tint p-3 text-xs text-ink-2 dark:border-amber-800">
          <input type="checkbox" name="lanjutkanTanpaLengkap" value="1" className="mt-0.5 shrink-0" />
          <span>
            <strong>{jumlahBelumPunyaPredikat} pegawai aktif belum punya predikat kinerja.</strong> Centang kalau tetap
            mau menghitung sekarang - mereka akan dilewati dan tidak punya Tukin periode ini sampai dihitung ulang.
          </span>
        </label>
      )}

      {/* ==================================================================
          GERBANG "SUDAH DISETUJUI"
          ==================================================================
          Menghitung ulang mengembalikan status ke DRAFT dan membuat seluruh
          approval periode ini dianggap basi - export ADK langsung kosong
          lagi. Sebelum ada panel ini, itu terjadi TANPA peringatan apa pun,
          dan sudah benar-benar menimpa periode 7/2026 sekitar tiga kali. */}
      {adaApproved && (
        <div className="mt-3 rounded-lg border border-red/40 bg-red-tint p-3">
          <p className="text-sm font-bold text-ink">
            {jumlahSudahApproved} pegawai periode {namaBulan} {periodeTahun} sudah <strong>APPROVED</strong>
          </p>
          <p className="mt-0.5 text-xs text-ink-2">
            Menghitung ulang mengembalikan mereka ke <strong>DRAFT</strong> dan membatalkan approval yang sudah
            selesai - termasuk jenjang 2. Export ADK periode ini akan kosong lagi sampai disetujui ulang.
          </p>

          <div className="mt-2.5 space-y-2 text-xs text-ink-2">
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="perlakuanApproved"
                value="lewati"
                checked={perlakuan === "lewati"}
                onChange={() => setPerlakuan("lewati")}
                className="mt-0.5 shrink-0"
              />
              <span>
                <strong>Lewati yang sudah disetujui</strong> (disarankan) - hanya baris yang belum APPROVED yang
                dihitung. Approval yang sudah ada tetap utuh.
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="perlakuanApproved"
                value="hitungUlang"
                checked={perlakuan === "hitungUlang"}
                onChange={() => setPerlakuan("hitungUlang")}
                className="mt-0.5 shrink-0"
              />
              <span>
                <strong>Hitung ulang semua</strong> - dipakai kalau presensi atau predikatnya memang berubah dan
                angkanya harus diperbarui.
              </span>
            </label>
          </div>

          {perlakuan === "hitungUlang" && (
            <label className="mt-2.5 flex items-start gap-2 rounded-lg border border-red/50 bg-surface p-2.5 text-xs text-ink-2">
              <input type="checkbox" name="konfirmasiResetApproval" value="1" className="mt-0.5 shrink-0" />
              <span>
                Saya paham approval <strong>{jumlahSudahApproved} pegawai</strong> akan dibatalkan dan harus disetujui
                ulang di Dashboard Tukin sebelum bisa diekspor.
              </span>
            </label>
          )}
        </div>
      )}

      {state.success && <p className="mt-3 text-sm font-semibold text-green">{state.success}</p>}
      {state.peringatan && (
        <p className="mt-3 rounded-lg border border-amber-300 bg-gold-tint p-3 text-sm font-medium text-ink-2 dark:border-amber-800">
          {state.peringatan}
        </p>
      )}
      {state.error && <p className="mt-3 text-sm font-medium text-red">{state.error}</p>}
      {state.ringkasan && state.ringkasan.detailSebagian.length > 0 && (
        <div className="mt-3 rounded-lg bg-gold-tint p-3 text-xs text-ink-2">
          <p className="font-semibold">
            {state.ringkasan.detailSebagian.length} pegawai terhitung SEBAGIAN (Tukin tersimpan, uang makan/lembur
            tidak):
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {state.ringkasan.detailSebagian.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </div>
      )}

      {state.ringkasan && state.ringkasan.dilewati > 0 && (
        <div className="mt-3 rounded-lg border border-line-2 bg-surface-2 p-3 text-xs text-muted">
          <p className="font-semibold text-ink-2">
            {state.ringkasan.dilewati} pegawai dilewati sepenuhnya (tidak ada yang tersimpan):
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {state.ringkasan.detailDilewati.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
