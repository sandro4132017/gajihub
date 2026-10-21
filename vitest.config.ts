import { defineConfig } from "vitest/config";
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
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
