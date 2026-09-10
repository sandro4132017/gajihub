"use client";

import { useActionState, useState } from "react";
import { kalkulasiMassalTukinUangMakanAction, type KalkulasiMassalFormState } from "./actions";

const INITIAL_STATE: KalkulasiMassalFormState = {};

export function KalkulasiMassalForm({
  satuanKerja,
  periodeBulan,
  periodeTahun,
  jumlahBelumPunyaPredikat,
  namaBulan,
}: {
  satuanKerja: string;
  periodeBulan: number;
  periodeTahun: number;
  /** Pegawai aktif yang predikat kinerjanya belum masuk - 0 berarti lengkap. */
  jumlahBelumPunyaPredikat: number;
  namaBulan: string;
}) {
  const [state, formAction, pending] = useActionState(kalkulasiMassalTukinUangMakanAction, INITIAL_STATE);
  const belumLengkap = jumlahBelumPunyaPredikat > 0;
  // Sudah dijalankan pada layar ini. Bentuk formnya berubah: yang ditanyakan
  // sebelum menghitung (kotak centang persetujuan) tidak lagi relevan, dan
  // langkah berikutnya yang perlu ditunjukkan adalah mengirim ke PPABP.
  const sudahHitung = Boolean(state.success);
  // Pilihan default SELALU yang aman (lewati). Yang merusak harus dipilih
  // sadar lalu dikonfirmasi - dua langkah, sama seperti "Setujui semua".

  return (
    <form action={formAction} className="card mt-4 p-4">
      <input type="hidden" name="satuanKerja" value={satuanKerja} />
      <input type="hidden" name="periodeBulan" value={periodeBulan} />
      <input type="hidden" name="periodeTahun" value={periodeTahun} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-ink">Ajukan kalkulasi Tukin + Uang Makan massal</p>
          <p className="text-xs text-muted">
            Periode {periodeBulan}/{periodeTahun} - pegawai tanpa presensi/predikat dilewati.
          </p>
        </div>
        {/* HANYA tombol hitung. Tautan "Kirim rekap ke PPABP" sempat dipasang
            di sini lalu DICABUT: mengirim bukan kelanjutan dari menghitung -
            di antara keduanya ada memeriksa tabel rincian, dan panel Kirim
            punya tempatnya sendiri di kaki halaman. Jalan pintas dari sini
            melompati langkah pemeriksaan itu. */}
        <button
          type="submit"
          disabled={pending}
          className={`btn shrink-0 ${sudahHitung ? "btn-ghost" : "btn-primary"}`}
        >
          {pending ? "Menghitung..." : sudahHitung ? "Hitung ulang" : "Hitung sekarang"}
        </button>
      </div>

      {/* Gerbang kelengkapan. SENGAJA bukan tombol yang dimatikan: ada kasus
          sah di mana seseorang memang tidak akan pernah punya predikat periode
          itu (mis. baru masuk), dan tombol mati tanpa jalan keluar membuat satu
          unit tidak bisa dibayar sama sekali. Yang dilakukan: memaksa
          keputusannya diambil sadar, dan mencatat siapa yang memutuskan lewat
          AuditTrail di sisi action. */}
      {belumLengkap && !sudahHitung && (
        <label className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-gold-tint p-3 text-xs text-ink-2 dark:border-amber-800">
          <input type="checkbox" name="lanjutkanTanpaLengkap" value="1" className="mt-0.5 shrink-0" />
          <span>
            <strong>{jumlahBelumPunyaPredikat} pegawai belum punya predikat kinerja.</strong> Centang untuk tetap
            menghitung - mereka dilewati <em>sekali ini saja</em>, dan tetap terhitung sebagai anggota unit.
            {/* Bedanya dengan Kecualikan disebut di sini karena di sinilah
                orang berhadapan dengan pilihannya. Keduanya BUKAN dua cara
                melakukan hal yang sama: yang dikecualikan hilang dari hitungan
                unit untuk seluruh periode dan alasannya tercatat, sementara
                centang ini cuma melewati mereka pada satu kali jalan.
                Begitu seseorang dikecualikan, dia keluar dari angka di kalimat
                ini - jadi kotak ini hilang sendiri, tidak perlu diatur. */}
            <span className="mt-1 block text-muted">
              Kalau orangnya memang sudah tidak seharusnya dihitung di unit ini, pakai{" "}
              <strong>Kecualikan pegawai dari perhitungan</strong> di atas - itu berlaku untuk seluruh periode dan
              alasannya tercatat.
            </span>
          </span>
        </label>
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

      {/* Kotak ini SEKARANG cuma memuat sebab yang baru ketahuan saat mesin
          menghitung - kelas jabatan kosong, tarif belum dikonfigurasi, presensi
          belum ada. Yang dilewati karena predikat tidak lagi didaftar di sini:
          orangnya baru saja menyatakan persetujuan atas hal itu lewat kotak
          centang di atas, dan mengulanginya membuat seluruh daftar berhenti
          dibaca. Jumlahnya tetap disebut, satu baris. */}
      {state.ringkasan && state.ringkasan.dilewatiPredikat > 0 && (
        <p className="mt-3 text-xs text-muted">
          {state.ringkasan.dilewatiPredikat} pegawai dilewati sesuai persetujuan di atas (predikat kinerja belum ada).
        </p>
      )}
      {state.ringkasan && state.ringkasan.detailDilewati.length > 0 && (
        <div className="mt-3 rounded-lg border border-line-2 bg-surface-2 p-3 text-xs text-muted">
          <p className="font-semibold text-ink-2">
            {state.ringkasan.detailDilewati.length} pegawai dilewati sepenuhnya (tidak ada yang tersimpan):
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
