import type { MetadataRoute } from "next";

const productionUrl = "https://n2n-final.kumaikinpuck.workers.dev";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: productionUrl,
      lastModified: new Date("2026-08-20"),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
