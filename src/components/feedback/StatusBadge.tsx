const KELAS: Record<"hijau" | "amber" | "merah" | "abu", string> = {
  hijau: "chip-ok",
  amber: "chip-wait",
  merah: "chip-danger",
  abu: "chip-draft",
};

export function StatusBadge({ label, warna }: { label: string; warna: "hijau" | "amber" | "merah" | "abu" }) {
  return <span className={`chip ${KELAS[warna]}`}>{label}</span>;
}
