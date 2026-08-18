-- Scope panel Notifikasi & Aktivitas per satuan kerja.
-- Satu ADD COLUMN nullable + satu index. Non-destruktif: baris lama bernilai
-- NULL, yang artinya "lintas satker" - jadi cuma terlihat oleh role lintas
-- unit, bukan bocor ke unit manapun.
ALTER TABLE "audit_trail" ADD COLUMN "satuan_kerja" TEXT;
CREATE INDEX "audit_trail_satuan_kerja_timestamp_idx" ON "audit_trail"("satuan_kerja", "timestamp");
