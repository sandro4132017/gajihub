"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { FiInfo } from "react-icons/fi";
import type { KeadaanKoneksi, SebabGangguan } from "@/lib/koneksi/statusKoneksi";

// Indikator koneksi layanan luar (BSrE, e-Presensi, ...): badge ringkas +
// ikon "i" yang membuka rincian (jam periksa, alasan bila offline). Jawaban
// endpoint hanya keadaan + sebab + waktu periksa; tidak ada alamat server di
// layar. Tanpa polling: diperiksa saat dibuka dan saat "Periksa ulang".

export interface JawabanKoneksi {
  keadaan: KeadaanKoneksi;
  sebab?: SebabGangguan;
  diperiksaPada: string;
}

const FORMAT_JAM = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Jakarta",
});

export function formatJamPeriksa(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : FORMAT_JAM.format(d);
}

/**
 * Menafsirkan respons fetch ke endpoint koneksi. Sesi habis dijawab middleware
 * dengan pengalihan ke /login (fetch mengikutinya), jadi pengalihan diperlakukan
 * sama seperti 401/403: indikator disembunyikan, bukan ditampilkan "Unknown".
 */
export function tafsirkanRespons(res: {
  status: number;
  redirected?: boolean;
  url?: string;
}): "sembunyi" | "baca" {
  if (res.status === 401 || res.status === 403) return "sembunyi";
  if (res.redirected) return "sembunyi";
  if (res.url) {
    try {
      if (new URL(res.url, "http://x").pathname.startsWith("/login")) return "sembunyi";
    } catch {
      /* url cacat: lanjut baca */
    }
  }
  return "baca";
}

/** Teks badge persis seperti keputusan user (bahasa Inggris apa adanya). */
export function labelBadgeKoneksi(
  namaLayanan: string,
  memeriksa: boolean,
  jawaban: JawabanKoneksi | null
): string {
  if (memeriksa) return `${namaLayanan}: Checking…`;
  if (jawaban?.keadaan === "TERHUBUNG") return `${namaLayanan}: Connected`;
  if (jawaban?.keadaan === "GANGGUAN") return `${namaLayanan}: Offline`;
  return `${namaLayanan}: Unknown`;
}

interface IsiPanelProps {
  memeriksa: boolean;
  jawaban: JawabanKoneksi | null;
  onPeriksaUlang: () => void;
  alasanOffline: Record<SebabGangguan, string>;
}

/** Isi popover rincian: jam periksa, alasan bila offline, "Periksa ulang". */
export function IsiPanelKoneksi({ memeriksa, jawaban, onPeriksaUlang, alasanOffline }: IsiPanelProps) {
  const offline = !memeriksa && jawaban?.keadaan === "GANGGUAN";
  return (
    <>
      <p>
        {jawaban ? (
          <>
            Diperiksa pukul{" "}
            <span className="font-mono font-semibold text-ink">
              {formatJamPeriksa(jawaban.diperiksaPada)}
            </span>
          </>
        ) : (
          "Belum pernah diperiksa"
        )}
      </p>
      {offline && jawaban?.sebab && (
        <p className="mt-1">
          Alasan: <span className="text-ink">{alasanOffline[jawaban.sebab]}</span>
        </p>
      )}
      <button
        type="button"
        onClick={onPeriksaUlang}
        disabled={memeriksa}
        className="mt-2 text-[11px] font-bold text-biru underline hover:text-navy disabled:opacity-50 disabled:no-underline"
      >
        Periksa ulang
      </button>
    </>
  );
}

const KELAS_POPOVER =
  "w-72 max-w-[calc(100vw-16px)] rounded-xl border border-line bg-surface p-3 text-xs text-ink-2 shadow-[0_18px_40px_rgba(19,65,107,0.18)]";

interface TampilanProps extends IsiPanelProps {
  namaLayanan: string;
  terbuka: boolean;
  idPanel: string;
  onToggle: () => void;
  /** Peringatan satu baris di bawah badge, hanya tampil saat Offline. */
  peringatanOffline?: string;
  /** Tombol "i" - dipakai popover untuk menghitung posisinya. */
  tombolRef?: RefObject<HTMLButtonElement | null>;
  panelRef?: RefObject<HTMLDivElement | null>;
}

/**
 * Popover melayang di atas halaman (portal ke body, posisi fixed), supaya
 * tidak terpotong wadah yang menggulung - termasuk Modal (overflow-y-auto,
 * z-50). Ditempatkan di bawah tombol "i", digeser ke kiri bila ruang di
 * kanan tidak cukup.
 */
function PopoverKoneksi({
  idPanel,
  namaLayanan,
  tombolRef,
  panelRef,
  children,
}: {
  idPanel: string;
  namaLayanan: string;
  tombolRef?: RefObject<HTMLButtonElement | null>;
  panelRef?: RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  const [posisi, setPosisi] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    function hitung() {
      const tombol = tombolRef?.current;
      if (!tombol) return;
      const r = tombol.getBoundingClientRect();
      const lebar = panelRef?.current?.offsetWidth ?? 288;
      const tepi = 8;
      const left = Math.max(tepi, Math.min(r.left, window.innerWidth - lebar - tepi));
      setPosisi({ top: r.bottom + 6, left });
    }
    hitung();
    window.addEventListener("resize", hitung);
    window.addEventListener("scroll", hitung, true);
    return () => {
      window.removeEventListener("resize", hitung);
      window.removeEventListener("scroll", hitung, true);
    };
  }, [tombolRef, panelRef]);

  return createPortal(
    <div
      id={idPanel}
      ref={panelRef}
      role="dialog"
      aria-label={`Detail status ${namaLayanan}`}
      style={{ top: posisi?.top ?? -9999, left: posisi?.left ?? -9999 }}
      className={`fixed z-[60] ${KELAS_POPOVER}`}
    >
      {children}
    </div>,
    document.body
  );
}

/** Bagian tampilan (tanpa fetch), supaya bisa dirender di test. */
export function TampilanBadgeKoneksi({
  namaLayanan,
  memeriksa,
  jawaban,
  terbuka,
  idPanel,
  onToggle,
  onPeriksaUlang,
  alasanOffline,
  peringatanOffline,
  tombolRef,
  panelRef,
}: TampilanProps) {
  const keadaan = memeriksa ? null : jawaban?.keadaan;
  const warnaTitik =
    keadaan === "TERHUBUNG" ? "bg-green" : keadaan === "GANGGUAN" ? "bg-red" : "bg-muted";
  const warnaTeks =
    keadaan === "TERHUBUNG" ? "text-green" : keadaan === "GANGGUAN" ? "text-red" : "text-muted";
  const offline = keadaan === "GANGGUAN";
  const isi = (
    <IsiPanelKoneksi
      memeriksa={memeriksa}
      jawaban={jawaban}
      onPeriksaUlang={onPeriksaUlang}
      alasanOffline={alasanOffline}
    />
  );
  const labelDetail = `Detail status ${namaLayanan}`;

  return (
    <div className="text-xs">
      {/* Bentuk pill sama dengan penanda periode ("Tahun 2026") di dashboard. */}
      <div className="inline-flex items-center gap-1 rounded-xl border border-line bg-surface-2 py-0.5 pl-3 pr-1">
        <span role="status" aria-live="polite" className={`inline-flex items-center gap-1.5 font-bold ${warnaTeks}`}>
          <span aria-hidden="true" className={`inline-block size-2.5 shrink-0 rounded-full ${warnaTitik}`} />
          {labelBadgeKoneksi(namaLayanan, memeriksa, jawaban)}
        </span>
        <button
          ref={tombolRef}
          type="button"
          onClick={onToggle}
          aria-label={labelDetail}
          aria-expanded={terbuka}
          aria-controls={idPanel}
          aria-haspopup="dialog"
          className="inline-flex size-6 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-biru"
        >
          <FiInfo aria-hidden="true" className="size-3.5" />
        </button>
      </div>

      {terbuka &&
        (typeof document === "undefined" ? (
          // Render di server/test: tanpa portal, isi tetap sama.
          <div id={idPanel} role="dialog" aria-label={labelDetail} className={KELAS_POPOVER}>
            {isi}
          </div>
        ) : (
          <PopoverKoneksi
            idPanel={idPanel}
            namaLayanan={namaLayanan}
            tombolRef={tombolRef}
            panelRef={panelRef}
          >
            {isi}
          </PopoverKoneksi>
        ))}

      {peringatanOffline && offline && (
        <p role="alert" className="mt-1.5 text-red">
          {peringatanOffline}
        </p>
      )}
    </div>
  );
}

interface Props {
  namaLayanan: string;
  /** Path endpoint GET yang mengembalikan {keadaan, sebab?, diperiksaPada}. */
  endpoint: string;
  alasanOffline: Record<SebabGangguan, string>;
  peringatanOffline?: string;
  /** Lewati cache server (tetap dibatasi umur minimum 15 dtk di server). */
  paksaSaatMuat?: boolean;
  onBerubah?: (keadaan: KeadaanKoneksi) => void;
}

export function BadgeKoneksi({
  namaLayanan,
  endpoint,
  alasanOffline,
  peringatanOffline,
  paksaSaatMuat = false,
  onBerubah,
}: Props) {
  const [memeriksa, setMemeriksa] = useState(true);
  const [jawaban, setJawaban] = useState<JawabanKoneksi | null>(null);
  const [tersembunyi, setTersembunyi] = useState(false);
  const [terbuka, setTerbuka] = useState(false);
  const idPanel = useId();
  const wadahRef = useRef<HTMLDivElement>(null);
  const tombolRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const onBerubahRef = useRef(onBerubah);
  onBerubahRef.current = onBerubah;
  const batalRef = useRef<AbortController | null>(null);

  const periksa = useCallback(
    async (paksa: boolean) => {
      batalRef.current?.abort();
      const ac = new AbortController();
      batalRef.current = ac;
      setMemeriksa(true);
      let hasil: JawabanKoneksi | null = null;
      try {
        const res = await fetch(`${endpoint}${paksa ? "?paksa=1" : ""}`, {
          cache: "no-store",
          signal: ac.signal,
        });
        if (tafsirkanRespons(res) === "sembunyi") {
          setTersembunyi(true);
          return;
        }
        const data = (await res.json()) as JawabanKoneksi;
        if (data && typeof data.keadaan === "string") hasil = data;
      } catch {
        if (ac.signal.aborted) return;
      }
      const akhir: JawabanKoneksi = hasil ?? {
        keadaan: "TIDAK_DIKETAHUI",
        diperiksaPada: new Date().toISOString(),
      };
      setJawaban(akhir);
      setMemeriksa(false);
      onBerubahRef.current?.(akhir.keadaan);
    },
    [endpoint]
  );

  useEffect(() => {
    void periksa(paksaSaatMuat);
    return () => batalRef.current?.abort();
  }, [periksa, paksaSaatMuat]);

  // Tutup rincian: klik di luar atau Escape (pola sama dengan AccountMenu).
  useEffect(() => {
    if (!terbuka) return;
    function onPointerDown(e: MouseEvent) {
      // Popover dirender lewat portal di luar wadah, jadi keduanya dicek.
      const t = e.target as Node;
      if (!wadahRef.current?.contains(t) && !panelRef.current?.contains(t)) setTerbuka(false);
    }
    // Escape didengar di fase CAPTURE dan dihentikan di sini: Modal
    // mendengarkan Escape di document (fase bubble) dan akan ikut tertutup.
    // Dengan capture, penutupan panel "i" selesai di sini saja.
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setTerbuka(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [terbuka]);

  if (tersembunyi) return null;

  return (
    <div ref={wadahRef}>
      <TampilanBadgeKoneksi
        namaLayanan={namaLayanan}
        memeriksa={memeriksa}
        jawaban={jawaban}
        terbuka={terbuka}
        idPanel={idPanel}
        onToggle={() => setTerbuka((t) => !t)}
        onPeriksaUlang={() => void periksa(true)}
        alasanOffline={alasanOffline}
        peringatanOffline={peringatanOffline}
        tombolRef={tombolRef}
        panelRef={panelRef}
      />
    </div>
  );
}
