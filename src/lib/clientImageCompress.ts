/**
 * Kompresi berkas gambar di sisi browser menggunakan HTML5 Canvas.
 * Menyesuaikan dimensi maksimal dan mengompresi format JPEG/WebP dengan rasio kualitas optimal.
 * Mengurangi ukuran gambar drastis (mis. foto kamera 4-8 MB menjadi ~150-300 KB) dengan
 * tetap mempertahankan teks dokumen yang tajam dan terbaca jelas.
 */

export interface KompresiBerkasResult {
  file: File;
  originalSize: number;
  compressedSize: number;
  reductionPercentage: number;
  previewUrl: string;
}

export function formatUkuranBerkas(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Kompresi gambar client-side.
 * Jika file adalah PDF atau bukan format gambar, kembalikan objek result apa adanya tanpa manipulasi canvas.
 */
export async function kompresGambarKlien(
  file: File,
  options: {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
    outputType?: "image/jpeg" | "image/webp";
  } = {}
): Promise<KompresiBerkasResult> {
  const {
    maxWidth = 1600,
    maxHeight = 1600,
    quality = 0.8,
    outputType = "image/jpeg",
  } = options;

  // Jika bukan gambar (misal PDF), return langsung
  if (!file.type.startsWith("image/")) {
    return {
      file,
      originalSize: file.size,
      compressedSize: file.size,
      reductionPercentage: 0,
      previewUrl: "",
    };
  }

  // Jika window/document tidak tersedia (SSR)
  if (typeof window === "undefined" || typeof document === "undefined") {
    return {
      file,
      originalSize: file.size,
      compressedSize: file.size,
      reductionPercentage: 0,
      previewUrl: "",
    };
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Hitung skala aspect ratio
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve({
            file,
            originalSize: file.size,
            compressedSize: file.size,
            reductionPercentage: 0,
            previewUrl: URL.createObjectURL(file),
          });
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve({
                file,
                originalSize: file.size,
                compressedSize: file.size,
                reductionPercentage: 0,
                previewUrl: URL.createObjectURL(file),
              });
              return;
            }

            // Jika hasil kompresi malah lebih besar, gunakan file asli
            const isCompressedSmaller = blob.size < file.size;
            const finalBlob = isCompressedSmaller ? blob : file;
            const extension = outputType === "image/webp" ? ".webp" : ".jpg";
            const originalNameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
            const newFileName = isCompressedSmaller
              ? `${originalNameWithoutExt}${extension}`
              : file.name;

            const compressedFile = new File([finalBlob], newFileName, {
              type: finalBlob.type || outputType,
              lastModified: Date.now(),
            });

            const reduction =
              file.size > 0
                ? Math.max(0, Math.round(((file.size - compressedFile.size) / file.size) * 100))
                : 0;

            const previewUrl = URL.createObjectURL(compressedFile);

            resolve({
              file: compressedFile,
              originalSize: file.size,
              compressedSize: compressedFile.size,
              reductionPercentage: reduction,
              previewUrl,
            });
          },
          outputType,
          quality
        );
      };

      img.onerror = () => {
        resolve({
          file,
          originalSize: file.size,
          compressedSize: file.size,
          reductionPercentage: 0,
          previewUrl: "",
        });
      };

      img.src = readerEvent.target?.result as string;
    };

    reader.onerror = () => {
      resolve({
        file,
        originalSize: file.size,
        compressedSize: file.size,
        reductionPercentage: 0,
        previewUrl: "",
      });
    };

    reader.readAsDataURL(file);
  });
}

