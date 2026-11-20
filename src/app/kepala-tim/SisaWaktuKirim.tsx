"use client";

import { useEffect, useState } from "react";
import {
  JAM_BATAS_KIRIM_WIB,
  batasKirimPerintah,
  formatSisaWaktu,
  sisaMenujuBatasMs,
} from "@/business-logic/perintahLembur";
import { tanggalIsoTeks } from "@/lib/lembur/waktuTampil";

/**
 * Jam "sekarang" untuk tampilan, berpatokan pada JAM SERVER (bukan jam komputer
 * pengguna yang bisa salah): dihitung dari `serverNowMs` yang dikirim server
 * saat halaman dirender, lalu berjalan dengan selisih terhadap jam browser.
 * Hanya tampilan; keputusan boleh/tidaknya tetap diambil server saat kirim.
 */
export function useJamServer(serverNowMs: number): number {
  const [sekarang, setSekarang] = useState(serverNowMs);
  useEffect(() => {
    const selisih = serverNowMs - Date.now();
    const tik = () => setSekarang(Date.now() + selisih);
    tik();
    const id = setInterval(tik, 1000);
    return () => clearInterval(id);
  }, [serverNowMs]);
  return sekarang;
}

export function SisaWaktuKirim({
  tanggalIso,
  serverNowMs,
  hariIni,
}: {
  tanggalIso: string;
  serverNowMs: number;
  hariIni: boolean;
}) {
  const sekarang = useJamServer(serverNowMs);
  const batas = String(JAM_BATAS_KIRIM_WIB).padStart(2, "0");
  const sisa = sisaMenujuBatasMs(tanggalIso, new Date(sekarang));
  const boleh = batasKirimPerintah(tanggalIso, new Date(sekarang)).boleh;
  const awalan = hariIni ? "hari ini" : tanggalIsoTeks(tanggalIso);

  if (sisa === null) return null;
  if (!boleh) {
    return (
      <p role="timer" className="text-xs font-semibold text-red">
        Batas kirim pukul {batas}.00 WIB untuk {awalan} sudah lewat.
      </p>
    );
  }
  return (
    <p role="timer" className="text-xs text-ink-2">
      Batas kirim untuk {awalan}: pukul {batas}.00 WIB. Sisa{" "}
      <strong className="font-mono text-ink">{formatSisaWaktu(sisa)}</strong>.
    </p>
  );
}
