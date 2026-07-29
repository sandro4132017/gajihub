/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Default body Server Action cuma 1 MB - kekecilan buat upload ADK gaji
    // dari GPP (file contoh 1 satker sudah ~600 KB untuk 350 pegawai, satker
    // lain bisa lebih besar). Action-nya sendiri menolak file > 8 MB dengan
    // pesan yang jelas (src/app/ppabp/gaji-induk/actions.ts), jadi batas di
    // sini sengaja lebih longgar supaya yang kena duluan adalah pengecekan
    // aplikasi, bukan error mentah dari framework.
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
