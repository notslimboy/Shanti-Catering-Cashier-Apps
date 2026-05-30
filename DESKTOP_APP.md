# Desktop App Build

Tujuan mode desktop ini sederhana: admin double-click app, server Python otomatis hidup, window kasir langsung terbuka, dan SQLite lokal langsung siap dipakai.

## Rekomendasi

Gunakan build Windows `onedir` dari PyInstaller. Hasilnya berupa satu folder app, bukan satu file tunggal. Ini lebih ringan dibuka, lebih stabil untuk SQLite, dan lebih gampang di-backup.

## Cara Build EXE di Windows

1. Install Python 3 di Windows.
2. Buka folder project ini.
3. Double-click `build-windows.bat`.
4. Setelah selesai, ambil folder:

```text
dist\Kasir Shanti Catering
```

5. Buat shortcut ke:

```text
dist\Kasir Shanti Catering\Kasir Shanti Catering.exe
```

Admin cukup double-click shortcut itu.

## Cara Build App di macOS

Setup dependency dulu tanpa build:

```bash
./setup-macos.command
```

Setelah setup siap, build app jika memang sudah mau dibuat:

1. Install Python 3 di Mac.
2. Buka Terminal di folder project ini.
3. Jalankan:

```bash
chmod +x build-macos.command
./build-macos.command
```

4. Setelah selesai, app ada di:

```text
dist/Kasir Shanti Catering.app
```

Admin cukup double-click `.app` itu.

Kalau macOS menahan app karena belum ditandatangani, klik kanan app, pilih `Open`, lalu konfirmasi.

## Setup Windows Tanpa Build

Kalau hanya ingin menyiapkan dependency di Windows tanpa membuat `.exe`, double-click:

```text
setup-windows.bat
```

## Lokasi Database

Saat app desktop dibuka, database SQLite disimpan di:

```text
%LOCALAPPDATA%\Kasir Shanti Catering\kasir-bento.sqlite3
```

Kalau file database belum ada, app akan menyalin database bawaan dari folder app sebagai data awal.

Storage window desktop seperti menu, cart, hold cart, dan pengaturan app disimpan permanen di:

```text
%LOCALAPPDATA%\Kasir Shanti Catering\webview
```

## Mode Development

Untuk coba tanpa build:

```bash
python3 desktop_app.py
```

Jika PyWebView belum terpasang, install dulu:

```bash
python3 -m pip install -r requirements-desktop.txt
```
