/**
 * Mark Gajihub - SATU-SATUNYA definisinya. Dipakai bareng sidebar (AppShell)
 * dan halaman login.
 *
 * Sengaja diekstrak begitu pemakainya jadi dua: lambang merek yang disalin ke
 * dua berkas pasti berbeda cepat atau lambat, dan bedanya baru kelihatan
 * waktu keduanya terbuka berdampingan - persis di layar demo.
 *
 * Dua rupa, dan bedanya BUKAN selera. Keduanya soal latar tempat tile itu
 * berdiri, dan aturannya berkebalikan:
 *
 * - `sidebar` - tile BIRU di atas sidebar navy. Tile navy di atas navy tidak
 *   terlihat sama sekali; aksen kedua palet memang untuk keperluan ini.
 * - `login`   - tile NAVY di atas latar terang. Di sini justru sebaliknya,
 *   biru di atas putih terbaca jauh lebih lemah daripada navy.
 *
 * Lingkaran kecil di dalamnya ikut bertukar warna karena alasan yang sama:
 * dia harus BEDA dari warna tile-nya, kalau tidak dia lenyap.
 */
export function GajihubLogo({ rupa = "sidebar" }: { rupa?: "sidebar" | "login" }) {
  const login = rupa === "login";

  return (
    <div
      className={
        login
          ? "grid size-[84px] flex-none place-items-center rounded-[22px] bg-navy shadow-[0_10px_28px_rgba(19,65,107,0.28)]"
          : "grid size-11 flex-none place-items-center rounded-xl bg-biru shadow-[0_6px_16px_rgba(0,0,0,0.28)]"
      }
    >
      <svg viewBox="0 0 64 64" fill="none" className={login ? "size-[52px]" : "size-[30px]"} aria-hidden="true">
        <path d="M45 16 A 21 21 0 1 0 45 48" className="stroke-white" strokeWidth="10.5" strokeLinecap="round" />
        <path d="M31 31 L45 31" className="stroke-white" strokeWidth="10.5" strokeLinecap="round" />
        <circle cx="45.5" cy="45.5" r="8" className={login ? "fill-biru" : "fill-navy"} />
      </svg>
    </div>
  );
}
