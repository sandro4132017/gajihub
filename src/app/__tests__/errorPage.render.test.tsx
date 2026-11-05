import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import ErrorPage from "../error";

describe("halaman galat", () => {
  it("tidak menampilkan error.message, menampilkan kode rujukan bila ada digest", () => {
    const error = Object.assign(new Error("RAHASIA-UJI"), { digest: "abc123" });
    const html = renderToStaticMarkup(<ErrorPage error={error} reset={() => {}} />);
    expect(html).not.toContain("RAHASIA-UJI");
    expect(html).toContain("Halaman gagal dimuat");
    expect(html).toContain("kode rujukan abc123");
    expect(html).not.toContain("Digest ID");
  });

  it("tanpa digest tidak ada kalimat kode rujukan", () => {
    const html = renderToStaticMarkup(<ErrorPage error={new Error("RAHASIA-UJI")} reset={() => {}} />);
    expect(html).not.toContain("RAHASIA-UJI");
    expect(html).not.toContain("kode rujukan");
  });
});
