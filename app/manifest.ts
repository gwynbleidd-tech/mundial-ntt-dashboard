import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Porra NTT",
    short_name: "Porra NTT",
    description: "Dashboard de predicciones del Mundial 2026",
    start_url: "/",
    display: "standalone",
    background_color: "#FBF7EE",
    theme_color: "#1B5E3A",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
