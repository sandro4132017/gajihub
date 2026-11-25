/** "Rp 1.234.000" - tanpa desimal. Murni tampilan. */
export const formatRupiah = (nilai: number): string =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(nilai);

/** "12,5%" - desimal dibuang bila bulat. */
export const formatPersen = (nilai: number, desimal = 2): string =>
  new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: desimal }).format(nilai) + "%";
