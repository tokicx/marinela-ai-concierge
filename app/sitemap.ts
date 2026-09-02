import type { MetadataRoute } from "next";
import { canonicalUrl } from "../lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: canonicalUrl("/"),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: canonicalUrl("/rezervacija"),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: canonicalUrl("/cjenik"),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: canonicalUrl("/concierge"),
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ];
}
