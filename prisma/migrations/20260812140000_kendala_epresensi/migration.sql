-- Tanggal e-Presensi bermasalah (Pasal 10 ayat (2) Permenaker 15/2024).
-- Satu CREATE TABLE + index + foreign key. Non-destruktif: tidak menyentuh
-- satupun tabel yang sudah ada.

CREATE TABLE "kendala_epresensi" (
    "id" TEXT NOT NULL,
    "tanggal" TIMESTAMP(3) NOT NULL,
    "satuan_kerja" TEXT,
    "alasan" TEXT NOT NULL,
    "ditandai_oleh_id" TEXT NOT NULL,
    "ditandai_pada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kendala_epresensi_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "kendala_epresensi_tanggal_idx" ON "kendala_epresensi"("tanggal");

CREATE UNIQUE INDEX "kendala_epresensi_tanggal_satuan_kerja_key"
    ON "kendala_epresensi"("tanggal", "satuan_kerja");

ALTER TABLE "kendala_epresensi"
    ADD CONSTRAINT "kendala_epresensi_ditandai_oleh_id_fkey"
    FOREIGN KEY ("ditandai_oleh_id") REFERENCES "app_user"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
