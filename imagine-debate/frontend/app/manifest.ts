import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE.name,
    short_name: "Imagine Debate",
    description: SITE.description,
    start_url: "/",
    display: "standalone",
    background_color: "#101214",
    theme_color: "#101214",
    categories: ["education", "productivity"],
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
