interface SignPdfOptions {
  fileBuffer: Buffer;
  fileName?: string;
  nik: string;
  passphrase: string;
  tampilan?: "invisible" | "visible";
  image?: boolean; // true = pakai imageTTD, false = QR code
  linkQR?: string;
  imageTTDBuffer?: Buffer;
  tagKoordinat?: string;
  page?: number;
  xAxis?: number;
  yAxis?: number;
  width?: number;
  height?: number;
  reason?: string;
  location?: string;
}

interface SignPdfResult {
  success: boolean;
  signedPdfBuffer?: Buffer;
  idDokumen?: string;
  signingTimeMs?: number;
  error?: string;
  statusCode?: number;
}

interface UserStatusResult {
  success: boolean;
  statusCode: number;
  status: string; // misal "ISSUE", "NOT_REGISTERED", "REVOKED", dll
  message: string;
}

interface VerifyResult {
  success: boolean;
  summary?: string;
  notes?: string;
  details?: any[];
  error?: string;
}

function getEsignConfig() {
  const baseUrl = process.env.ESIGN_BASE_URL || "http://192.168.221.11";
  const apiUser = process.env.ESIGN_API_USER || "temporary";
  const apiPass = process.env.ESIGN_API_PASS || "T3mp0reRy";
  const authHeader = `Basic ${Buffer.from(`${apiUser}:${apiPass}`).toString("base64")}`;

  return { baseUrl, authHeader };
}

/**
 * Cek status sertifikat elektronik pengguna di BSrE berdasarkan NIK
 */
export async function checkUserStatus(nik: string): Promise<UserStatusResult> {
  const { baseUrl, authHeader } = getEsignConfig();

  try {
    const res = await fetch(`${baseUrl}/api/user/status/${encodeURIComponent(nik)}`, {
      method: "GET",
      headers: {
        Authorization: authHeader,
      },
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        success: false,
        statusCode: res.status,
        status: data.status || "ERROR",
        message: data.message || `HTTP ${res.status}: Gagal memeriksa status sertifikat.`,
      };
    }

    return {
      success: true,
      statusCode: data.status_code || res.status,
      status: data.status || "UNKNOWN",
      message: data.message || "Pengecekan status berhasil.",
    };
  } catch (err: any) {
    return {
      success: false,
      statusCode: 500,
      status: "NETWORK_ERROR",
      message: err.message || "Gagal menghubungi server Esign Client BSrE.",
    };
  }
}

/**
 * Kirim request penandatanganan dokumen PDF ke server Esign Client BSrE
 * CATATAN KEAMANAN (Kriteria BSrE V & VIII):
 * Passphrase HANYA digunakan di dalam memori saat eksekusi fetch dan TIDAK PERNAH disimpan / di-log.
 */
export async function signPdf(options: SignPdfOptions): Promise<SignPdfResult> {
  const { baseUrl, authHeader } = getEsignConfig();

  try {
    const formData = new FormData();
    const pdfBlob = new Blob([new Uint8Array(options.fileBuffer)], { type: "application/pdf" });
    formData.append("file", pdfBlob, options.fileName || "dokumen.pdf");
    formData.append("nik", options.nik);
    formData.append("passphrase", options.passphrase);

    const tampilan = options.tampilan || "visible";
    formData.append("tampilan", tampilan);

    if (tampilan === "visible") {
      const useImage = options.image ?? false;
      formData.append("image", useImage ? "true" : "false");

      if (useImage && options.imageTTDBuffer) {
        const imgBlob = new Blob([new Uint8Array(options.imageTTDBuffer)], { type: "image/png" });
        formData.append("imageTTD", imgBlob, "spesimen.png");
      } else if (!useImage && options.linkQR) {
        formData.append("linkQR", options.linkQR);
      }

      if (options.tagKoordinat) {
        formData.append("tag_koordinat", options.tagKoordinat);
      } else if (options.page !== undefined && options.xAxis !== undefined && options.yAxis !== undefined) {
        formData.append("page", options.page.toString());
        formData.append("xAxis", options.xAxis.toString());
        formData.append("yAxis", options.yAxis.toString());
      }

      if (options.width) formData.append("width", options.width.toString());
      if (options.height) formData.append("height", options.height.toString());
    }

    if (options.reason) formData.append("reason", options.reason);
    if (options.location) formData.append("location", options.location);

    const res = await fetch(`${baseUrl}/api/sign/pdf`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
      },
      body: formData,
    });

    const idDokumen = res.headers.get("id_dokumen") || undefined;
    const signingTime = res.headers.get("signing_time");
    const signingTimeMs = signingTime ? parseInt(signingTime, 10) : undefined;
    const contentType = res.headers.get("content-type") || "";

    if (!res.ok || contentType.includes("application/json")) {
      const errorJson = await res.json().catch(() => ({}));
      const errorMsg =
        errorJson.message ||
        errorJson.error ||
        `Gagal menandatangani dokumen (HTTP ${res.status}).`;

      return {
        success: false,
        statusCode: res.status,
        error: errorMsg,
      };
    }

    const arrayBuffer = await res.arrayBuffer();
    const signedPdfBuffer = Buffer.from(arrayBuffer);

    return {
      success: true,
      statusCode: res.status,
      signedPdfBuffer,
      idDokumen,
      signingTimeMs,
    };
  } catch (err: any) {
    return {
      success: false,
      statusCode: 500,
      error: err.message || "Terjadi kesalahan koneksi ke Esign Client BSrE.",
    };
  }
}

/**
 * Verifikasi keabsahan dokumen PDF yang telah ditandatangani
 */
export async function verifyPdf(pdfBuffer: Buffer, fileName: string = "dokumen_signed.pdf"): Promise<VerifyResult> {
  const { baseUrl, authHeader } = getEsignConfig();

  try {
    const formData = new FormData();
    const pdfBlob = new Blob([new Uint8Array(pdfBuffer)], { type: "application/pdf" });
    formData.append("signed_file", pdfBlob, fileName);

    const res = await fetch(`${baseUrl}/api/sign/verify`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
      },
      body: formData,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        success: false,
        error: data.message || `Gagal memverifikasi dokumen (HTTP ${res.status}).`,
      };
    }

    return {
      success: true,
      summary: data.summary,
      notes: data.notes,
      details: data.details,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Terjadi kesalahan saat verifikasi dokumen.",
    };
  }
}

