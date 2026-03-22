import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

function getPackageName(id: string) {
  const cleanedPath = id.split("node_modules/")[1];
  if (!cleanedPath) {
    return null;
  }

  const pathSegments = cleanedPath.split("/");
  if (pathSegments[0]?.startsWith("@")) {
    return pathSegments.slice(0, 2).join("/");
  }

  return pathSegments[0] ?? null;
}

export default defineConfig(({ command }) => ({
  base: command === "build" ? "./" : "/",
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  css: {
    postcss: {
      plugins: [],
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          const packageName = getPackageName(id);
          if (!packageName) {
            return "vendor";
          }

          if (packageName === "detect-node-es") {
            return undefined;
          }

          if (
            packageName === "react" ||
            packageName === "react-dom" ||
            packageName === "scheduler" ||
            packageName === "use-sync-external-store" ||
            packageName === "wouter" ||
            packageName.startsWith("@tanstack/")
          ) {
            return "framework";
          }

          if (
            packageName.startsWith("@radix-ui/") ||
            packageName === "cmdk" ||
            packageName === "lucide-react"
          ) {
            return "ui";
          }

          if (packageName === "recharts" || packageName === "framer-motion") {
            return "visuals";
          }

          if (packageName === "date-fns") {
            return "date";
          }

          return `vendor-${packageName.replaceAll("@", "").replaceAll("/", "-")}`;
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
}));
