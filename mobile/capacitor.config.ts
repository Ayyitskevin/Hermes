import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.hermesjournal.mobile",
  appName: "Hermes Journal",
  webDir: "dist-mobile",
  plugins: {
    CapacitorSQLite: {
      iosDatabaseLocation: "Documents",
      iosIsEncryption: true,
      iosKeychainPrefix: "app.hermesjournal.mobile",
      iosBiometric: {
        biometricAuth: false,
        biometricTitle: "Unlock Hermes Journal",
      },
    },
  },
};

export default config;
