import type { MetadataRoute } from "next";

const productionUrl = "https://n2n-final.kumaikinpuck.workers.dev";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/receive/"],
    },
    sitemap: `${productionUrl}/sitemap.xml`,
    host: productionUrl,
  };
}
