import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "id.co.shanticatering.kasir",
  appName: "Kasir Shanti Catering",
  webDir: "www",
  bundledWebRuntime: false,
  server: {
    androidScheme: "https",
  },
};

export default config;
