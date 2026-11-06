import type { MetadataRoute } from "next";

/** Aplikasi internal berlogin: mesin pencari tidak perlu mengindeks apa pun (pentest F-05/robots). */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
