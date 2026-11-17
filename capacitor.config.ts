import type { CapacitorConfig } from '@capacitor/cli';

const isAndroidDebug =
  process.env.CAPACITOR_DEBUG === '1' ||
  process.env.CAPACITOR_DEBUG === 'true';

const config: CapacitorConfig = {
  appId: 'com.wwchess.fantasyautobattler',
  appName: 'WWCHESS Fantasy AutoBattler',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: isAndroidDebug,
    captureInput: true,
    webContentsDebuggingEnabled: isAndroidDebug,
  },
};

export default config;