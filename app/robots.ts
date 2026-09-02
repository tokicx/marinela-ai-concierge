import type { MetadataRoute } from "next";
import { CANONICAL_SITE_ORIGIN, canonicalUrl } from "../lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/signin-with-chatgpt",
        "/signout-with-chatgpt",
        "/callback",
      ],
    },
    sitemap: canonicalUrl("/sitemap.xml"),
    host: CANONICAL_SITE_ORIGIN,
  };
}
