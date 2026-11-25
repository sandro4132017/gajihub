import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { KerangkaHalaman } from "../KerangkaHalaman";

describe("KerangkaHalaman", () => {
  it("diumumkan ke pembaca layar sebagai sedang memuat, denyut hanya bila gerakan diizinkan", () => {
    const html = renderToStaticMarkup(<KerangkaHalaman />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Memuat halaman...");
    expect(html).toContain("motion-safe:animate-pulse");
    expect(html).not.toMatch(/ animate-pulse/);
  });
});
