// Membuat hash kata sandi untuk akun penguji (PENGUJI_PASS_HASH).
//
// Kata sandi dibaca dari stdin dan TIDAK PERNAH dicetak ulang; yang tercetak
// hanya satu baris hash. Jalankan di mesin sendiri, bukan di server:
//
//   npm run hash:penguji                      (ketik sandi, tekan Enter; tanpa echo di terminal)
//   echo sandi-palsu | npm run hash:penguji   (lewat pipe)
//
// Format hash harus sama dengan src/auth/akunPenguji.ts: scrypt:N:r:p:salt:hash
// (base64url, tanpa karakter $ supaya aman ditaruh di berkas konfigurasi).
import { randomBytes, scryptSync } from "node:crypto";

const N = 16384;
const R = 8;
const P = 1;

function bacaStdin() {
  return new Promise((resolve) => {
    const potongan = [];
    process.stdin.on("data", (d) => potongan.push(d));
    process.stdin.on("end", () => resolve(Buffer.concat(potongan).toString("utf8")));
  });
}

function bacaTanpaEcho() {
  return new Promise((resolve) => {
    process.stderr.write("Kata sandi: ");
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let sandi = "";
    const saatKunci = (ch) => {
      for (const c of ch) {
        if (c === "\r" || c === "\n" || c === "\u0004") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener("data", saatKunci);
          process.stderr.write("\n");
          resolve(sandi);
          return;
        }
        if (c === "\u0003") {
          stdin.setRawMode(false);
          process.stderr.write("\n");
          process.exit(130);
        }
        if (c === "\u007f" || c === "\b") sandi = sandi.slice(0, -1);
        else sandi += c;
      }
    };
    stdin.on("data", saatKunci);
  });
}

const mentah = process.stdin.isTTY ? await bacaTanpaEcho() : await bacaStdin();
const sandi = mentah.replace(/[\r\n]+$/, "");

if (sandi.length < 8) {
  console.error("Kata sandi minimal 8 karakter.");
  process.exit(1);
}

const salt = randomBytes(16);
const hash = scryptSync(sandi, salt, 32, { N, r: R, p: P, maxmem: 256 * N * R });
console.log(["scrypt", N, R, P, salt.toString("base64url"), hash.toString("base64url")].join(":"));
