# Capacitor Mobile Shell

The Capacitor shell packages the existing cashier UI for Android and iOS without changing the browser workflow. Source web files stay in the repository root; `npm run cap:prepare` creates the generated `www/` web bundle used by the native projects.

## First setup

```bash
npm install
npm run cap:add:android
npm run cap:add:ios
npm run cap:sync
```

`android/` is opened with Android Studio and `ios/` with Xcode. After any web change, run `npm run cap:sync` before testing a native build.

## Printing behavior

- Browser/PWA: keeps the current thermal HTML preview and browser print dialog.
- Android Capacitor: the same receipt is converted to ESC/POS bytes with `ReceiptPrinterEncoder` and sent to the native `NativePosPrinter` plugin.
- The Android plugin supports paired Bluetooth Classic printers through SPP and Wi-Fi/LAN printers through RAW TCP (normally port `9100`).
- The Setup Printer screen keeps the selected connection in the local Zustand state. A missing or invalid configuration safely opens the receipt preview instead of attempting an unsupported browser print.

The Android plugin contract is intentionally small:

```ts
window.Capacitor.Plugins.NativePosPrinter.printRaw({
  transport: "bluetooth", // or "network"
  address: "00:11:22:33:44:55", // Bluetooth only
  host: "192.168.1.120", // network only
  port: 9100, // network only
  dataBase64: "...",
  encoding: "base64",
  language: "esc-pos",
  cut: "partial",
  feedLines: 0,
  jobName: "Kasir Shanti Catering",
});
```

The plugin sends the exact byte sequence generated from the same receipt data as the preview: logo, store header, boxed double-size customer name, queue number, `CATATAN KIRIM`, items, shipping, total, and footer. The printer must support standard ESC/POS commands and, for Bluetooth, the Classic Serial Port Profile (SPP). BLE-only printers and iOS native printing need their own transport plugin before they can be enabled.

## Offline and Supabase sync

- Zustand vanilla owns the app state, and its durable snapshot remains in browser/native WebView storage.
- When Supabase is unavailable, completed sales are put in the persisted `syncOutbox` instead of being discarded.
- Pending sales stay visible in the dashboard and are retried automatically when the device regains connectivity.
- Menu changes remain in the local state and are retried to Supabase on the next `online` event.

Only network failures are deferred. Schema, validation, and permission errors remain visible so incorrect data is never silently marked as synced.

## Important runtime note

The app defaults to Supabase, which can be used from a mobile build when the device is online. The local Python `/api` and SQLite backup endpoints remain desktop/server features; they are not bundled inside an Android or iOS application.
