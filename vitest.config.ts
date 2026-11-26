import { configDefaults, defineConfig } from "vitest/config";
import path from "node:path";

// ============================================================================
// Konfigurasi vitest.
//
// SEBELUM berkas ini ada, vitest jalan tanpa konfigurasi sama sekali - dan
// akibatnya tidak kelihatan sampai dicoba: alias `@/` dari tsconfig TIDAK
// dikenali, jadi modul mana pun yang memakainya mustahil diuji. Yang terjadi
// bukan test gagal, melainkan test yang tidak pernah ditulis - seluruh
// src/app/tte/actions.ts dan rute-rute di bawahnya memakai alias itu.
//
// Isinya sengaja cuma alias. Selebihnya dibiarkan bawaan vitest, supaya
// perilaku test yang sudah ada tidak bergeser.
// ============================================================================

export default defineConfig({
  test: {
    // Worktree sesi Claude Code tinggal di .claude/worktrees/ DI DALAM repo.
    // Tanpa pengecualian ini, `npm test` dari checkout utama ikut menjalankan
    // salinan test di sana (jumlahnya jadi dobel), dan salinan itu bisa gagal
    // karena konteksnya berbeda - verify merah padahal kodenya sehat.
    exclude: [...configDefaults.exclude, ".claude/**"],
    // Esign Client tidak punya nilai cadangan di kode (repo publik), jadi test
    // memberi alamat & kredensial PALSU. `.invalid` tidak pernah ter-resolve.
    env: {
      ESIGN_BASE_URL: "http://esign.uji.invalid",
      ESIGN_API_USER: "pengguna-uji",
      ESIGN_API_PASS: "sandi-uji",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
