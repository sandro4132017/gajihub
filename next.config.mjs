/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Default body Server Action cuma 1 MB - kekecilan buat upload ADK gaji
    // dari GPP (file contoh 1 satker sudah ~600 KB untuk 350 pegawai, satker
    // lain bisa lebih besar). Action-nya sendiri menolak file > 8 MB dengan
    // pesan yang jelas (src/app/ppabp/gaji-induk/actions.ts), jadi batas di
    // sini sengaja lebih longgar supaya yang kena duluan adalah pengecekan
    // aplikasi, bukan error mentah dari framework.
    serverActions: {
      bodySizeLimit: "10mb",

      // WAJIB ADA SELAMA APLIKASI DIJALANKAN DI BELAKANG PROXY.
      //
      // Next memverifikasi header `Origin` permintaan Server Action terhadap
      // host yang diterimanya - penahan CSRF bawaan. Lewat proxy Pusdatik,
      // browser mengirim `Origin: https://gajihub.kemnaker.go.id` sementara
      // aplikasi menerima `Host: localhost:3002` (atau IP internalnya), jadi
      // keduanya TIDAK COCOK dan seluruh Server Action ditolak.
      //
      // Gejalanya menyesatkan: halaman terbuka normal, gambar termuat, semua
      // GET 200 - yang gagal HANYA form (login, approval, upload). Dibuka
      // langsung ke 192.168.221.44:3002 semuanya jalan, karena di situ Origin
      // dan Host memang sama.
      //
      // Daftar ini BUKAN "izinkan semua": tiap nama host yang sah harus
      // disebut. Kalau nanti pindah domain, tambahkan di sini - kalau tidak,
      // form-nya berhenti berfungsi lagi dengan cara yang persis sama.
      allowedOrigins: [
        "gajihub.kemnaker.go.id",
        "192.168.221.44:3002",
        "localhost:3000",
        "localhost:3002",
      ],
    },
  },
};

export default nextConfig;
