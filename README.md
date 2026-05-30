# Cashier Web App

Aplikasi kasir lokal untuk Shanti Catering/toko kecil. Fokus utama project ini adalah checkout cepat, import pesanan, stok barang, cetak struk thermal 58mm/80mm, dashboard penjualan, dan penyimpanan transaksi ke SQLite lokal.

App ini berjalan di browser dengan backend Python lokal. Targetnya bukan ERP besar, tetapi alat operasional harian yang bisa dipakai kasir dengan cepat.

## Status Scope

| Area | Status | Kegunaan |
| --- | --- | --- |
| Checkout kasir | Ada | Cari barang, tambah ke keranjang, catatan item, ongkir, pajak, pembayaran, validasi, lalu selesaikan transaksi. |
| Stok barang | Ada | Tambah/edit/hapus barang, stok terbatas atau unlimited, import spreadsheet, sync Google Sheet publik, dan mirror ke SQLite lokal. |
| Import pesanan | Ada | Import banyak order dari CSV/TSV atau rangkuman AI menjadi draft pesanan. |
| Customer profile | Ada | Customer lama muncul sebagai saran dan ongkir terakhir bisa dipakai otomatis. |
| Struk thermal | Ada | Preview, test print, auto print, cetak ulang, layout 58mm/80mm, tinggi print dinamis. |
| Dashboard penjualan | Ada | Modal dashboard dengan range tanggal, ringkasan omzet, item terlaris, pencarian, tab aktif/terhapus/semua. |
| Edit dan hapus struk | Ada | Detail struk, edit data dasar, edit item/qty/harga, cetak ulang, soft delete, restore struk terhapus. |
| Backup database | Ada | Download/restore SQLite, plus `Backup Semua` untuk SQLite dan data app browser. |
| Offline/PWA dasar | Ada | Shell app dicache, inventory/cart/draft disimpan di browser. |
| Cloud multi-device | Belum | Belum ada login, cloud database, role user, atau sync multi-kasir. |

## Kegunaan Utama

App ini cocok untuk:

- Kasir harian catering, toko kecil, booth, atau pre-order rumahan.
- Mencatat transaksi lokal ke SQLite.
- Cetak struk ke printer thermal POS 58mm/80mm.
- Mengelola menu dari Google Sheet, CSV, XLS, atau input manual.
- Mengubah chat/order AI menjadi draft pesanan massal.
- Closing harian atau range beberapa hari.
- Menghapus struk yang salah input tanpa langsung kehilangan data.
- Memakai sidebar di desktop dan burger drawer di tablet/HP untuk tool besar seperti import, dashboard, edit struk, dan setup printer.

App ini belum cocok untuk:

- Banyak cabang/kasir online bersamaan.
- Payment gateway.
- Login, role admin/kasir, audit user.
- Database cloud tanpa perubahan arsitektur.
- Hosting stateless seperti Vercel jika tetap memakai SQLite lokal.

## Cara Menjalankan

Jalankan backend lokal:

```bash
python3 server.py
```

Buka app:

```text
http://127.0.0.1:4174/
```

Cek backend:

```bash
curl http://127.0.0.1:4174/api/health
```

Database default:

```text
kasir-bento.sqlite3
```

## Struktur File

| File | Fungsi |
| --- | --- |
| `index.html` | Struktur UI utama, modal, form, dashboard, dan tombol. |
| `styles.css` | Styling app, modal, responsive layout, sticky checkout, dan print CSS struk. |
| `script.js` | Logika frontend: state, cart, inventory, import, customer profile, dashboard, receipt, API calls. |
| `server.py` | Backend Python lokal untuk static files, API transaksi, soft delete/restore, backup, dan SQLite. |
| `kasir-bento.sqlite3` | Database transaksi lokal, dibuat otomatis saat server jalan. |
| `manifest.webmanifest` | Metadata PWA. |
| `service-worker.js` | Cache dasar app shell. |
| `sample-items.csv` | Contoh format import barang. |
| `sample-bulk-orders.csv` | Contoh format import pesanan banyak. |
| `logocatering.webp` | Logo struk dan branding app. |
| `drivers/XP PRINTER DRIVER.rar` | Driver thermal printer XP/POS yang dipakai untuk setup printer kasir. |
| `docs/PROJECT_AGENTS.md` | Panduan tambahan untuk AI/agent berikutnya. |
| `_forAI/PROJECT_TECHNICAL_CONTEXT.md` | Dokumentasi teknis lengkap untuk AI/engineer berikutnya. |

## Alur Checkout

1. Kasir mencari barang dari daftar produk.
2. Barang ditambahkan ke keranjang.
3. Qty dan catatan item bisa diubah.
4. Kasir mengisi customer, ongkir, pajak, dan metode pembayaran.
5. App menampilkan validasi checkout.
6. Klik `Selesaikan Transaksi`.
7. Frontend mengirim transaksi ke `POST /api/sales`.
8. Backend membuat nomor struk unik dan menyimpan transaksi ke SQLite.
9. Stok lokal dikurangi.
10. Struk dicetak langsung atau dibuka di preview, sesuai pengaturan.

Catatan validasi:

- Error blocking menghentikan transaksi, misalnya keranjang kosong atau stok kurang.
- Warning tidak langsung menghentikan, tapi kasir harus mengecek dulu. Contoh: customer kosong atau ongkir Rp0.
- Pada mobile/tablet, total dan tombol checkout dibuat sticky supaya tidak perlu scroll jauh.

Cart juga bisa ditahan dengan `Tahan`, lalu dibuka lagi dari `Buka Hold`.

## Customer Profile

Customer profile dibuat otomatis dari:

- Tabel SQLite `customers`.
- Transaksi SQLite aktif sebagai fallback.
- Draft import.
- Hold cart.
- Struk terakhir.

Saat nama customer cocok dengan riwayat lama:

- App menampilkan hint customer lama.
- Ongkir default diisi otomatis jika berbeda.
- Customer tetap bisa diedit manual.

Data customer sengaja sederhana:

| Field | Fungsi |
| --- | --- |
| `name` | Nama/alamat customer untuk autocomplete. |
| `default_shipping` | Ongkir default yang dipakai otomatis saat customer dipilih. |
| `last_order_at` | Waktu order terakhir, dipakai untuk prioritas saran customer terbaru. |

Saat transaksi baru tersimpan atau data struk diedit, backend otomatis melakukan upsert customer. Kalau customer sudah ada, `default_shipping` dan `last_order_at` mengikuti order terbaru.

## Inventory

Inventory aktif disimpan di browser melalui `localStorage`, lalu dimirror ke SQLite lokal lewat API `/api/products` saat backend tersedia:

```text
kasir-bento-state-v1
```

Sumber barang:

- Tambah manual dari modal `Kelola Barang`.
- Import CSV/TSV/XLS/XLSX.
- Sync Google Sheet publik atau published CSV.

Kolom default:

```csv
sku,nama,harga,stok,kategori
COF-001,Es Kopi Susu,18000,24,Minuman
```

Kolom penting:

| Kolom | Keterangan |
| --- | --- |
| `sku` | Kode barang, opsional tapi disarankan. |
| `nama` | Nama barang. |
| `harga` | Harga Rupiah, angka saja. |
| `stok` | Jumlah stok. Bisa unlimited lewat UI manual. |
| `kategori` | Kategori untuk filter produk. |
| `alias` | Nama lain menu, opsional. Membantu import AI mencocokkan item. |

Sync Google Sheet saat ini satu arah: Sheet ke app. Penjualan belum otomatis menulis balik ke Google Sheet.

Catatan penyimpanan:

- Saat app dibuka, produk dimuat dari SQLite jika tersedia.
- Jika SQLite masih kosong tetapi browser punya produk, app akan seed mirror SQL dari cache browser.
- Setelah import, edit manual, checkout, hapus/restore struk dengan penyesuaian stok, app menyimpan ulang produk ke SQL.
- Google Sheet tetap sumber satu arah; stok di Google Sheet tidak otomatis berubah setelah penjualan.

## Import Pesanan

Fitur `Import Pesanan` dipakai untuk membuat banyak draft order sekaligus.

Input yang didukung:

- Upload CSV/TSV.
- Paste CSV hasil rangkuman AI.
- Tombol `Salin Prompt AI` untuk meminta AI merapikan chat WhatsApp menjadi CSV.

Format kolom:

```csv
customer,chatDate,payment,ongkir,item,quantity,note
"Bu Ani - Jl Melati 12","28/5/2026 10.15","Tunai",10000,"Nasi Box Ayam",20,"tanpa sambal 5 box"
```

Draft belum menjadi transaksi sampai kasir memprosesnya ke keranjang atau batch process. Draft siap bisa diproses sekaligus, dan opsi batch print tersedia.

## Struk Dan Printer Thermal

Struk dibuat untuk printer thermal receipt:

- Default app: 58mm.
- Print area 58mm dibuat lebih sempit supaya aman di printer thermal kecil.
- Tinggi halaman print dihitung otomatis dari isi struk.
- Opsi 80mm tetap tersedia di `Edit Struk`.
- Teks struk dibuat bold agar lebih terbaca.
- Customer langsung dicetak sebagai nama/alamat, tanpa label `Customer`.
- Nomor struk dibuat backend saat transaksi tersimpan.

Pengaturan struk:

- Nama toko.
- Alamat toko.
- Catatan bawah struk.
- Lebar struk 58mm/80mm.
- Ukuran font.
- Auto print.
- Print langsung atau preview dulu.
- Test print.

Setup printer:

- Tombol `Setup Printer` membuka modal checklist printer.
- Modal menautkan file `drivers/XP PRINTER DRIVER.rar`.
- Driver tetap harus diinstall di OS. Web app hanya membantu checklist dan test print.

Rekomendasi custom paper thermal 58mm di macOS:

```text
Width: 58 mm
Height normal: 150 mm
Margins: 0 mm
Scale: 100%
Headers and footers: Off
```

Jika harga kanan kepotong:

- Driver harus POS58/receipt printer, bukan Generic PostScript/AirPrint.
- Paper size harus 58mm.
- Margins none/minimum.
- Scale bisa diturunkan ke 95%.

## Dashboard Penjualan

`Dashboard Penjualan` ada di modal, bukan halaman terpisah.

Fitur utama:

- Default buka ke tanggal lokal hari ini.
- Range `Harian`, `7 Hari`, `30 Hari`, dan `Custom`.
- Input tanggal `Dari` dan `Sampai`.
- Tombol tanggal sebelumnya, berikutnya, dan hari ini.
- Tab status `Aktif`, `Terhapus`, dan `Semua`.
- Ringkasan jumlah transaksi dan omzet untuk range terpilih.
- Total transaksi aktif dari database.
- Breakdown metode pembayaran.
- Breakdown item terjual.
- Search nomor struk, item, customer, catatan, atau pembayaran.
- Card struk menonjolkan customer sebagai judul utama.
- Aksi cepat per struk: `Cetak`, `Edit`, `Detail`, `Hapus`, atau `Restore`.
- Form edit struk bisa mengubah customer, pembayaran, ongkir, pajak, chat date, item, qty, harga, SKU, dan catatan item sebelum cetak ulang.

Soft delete:

- Tombol `Hapus` tidak menghapus permanen dari SQLite.
- Backend mengisi kolom `deleted_at`.
- Struk pindah ke tab `Terhapus`.
- Struk bisa dikembalikan dengan `Restore`.
- Saat hapus, kasir bisa memilih apakah stok lokal dikembalikan.
- Jika struk direstore dan sebelumnya stok dikembalikan, stok lokal dikurangi lagi.

## Backup Dan Restore Database

Dashboard menyediakan:

- `Backup`: download file SQLite saat ini.
- `Restore`: upload file SQLite backup untuk mengganti database transaksi.
- `Backup Semua`: download satu file JSON berisi SQLite dan state browser seperti inventory, setting, cart, hold cart, dan draft.
- `Restore Semua`: restore file JSON backup penuh.

Restore backup melakukan validasi:

- File harus SQLite valid.
- File harus punya tabel `sales` dan `sale_items`.
- Jika valid, database lama disalin dulu ke file safety `kasir-bento.before-restore.sqlite3`.
- Setelah restore, migrasi kolom terbaru tetap dijalankan otomatis.

Gunakan `Backup Semua` untuk backup paling lengkap. Backup SQLite mentah tetap berguna untuk database transaksi dan tabel SQL, tetapi tidak menyertakan state browser yang sedang aktif.

## Backend Dan API

Backend ada di `server.py`, menggunakan `ThreadingHTTPServer` dan SQLite.

Default host:

```text
127.0.0.1:4174
```

Endpoint:

| Method | Path | Fungsi |
| --- | --- | --- |
| `GET` | `/api/health` | Cek server dan nama database. |
| `GET` | `/api/customers?limit=300` | Ambil customer untuk autocomplete dan ongkir default. |
| `GET` | `/api/sales?limit=50` | Ambil transaksi aktif terbaru. Limit maksimal 200. |
| `GET` | `/api/sales?limit=50&includeDeleted=1` | Ambil transaksi aktif dan terhapus. |
| `POST` | `/api/sales` | Simpan transaksi baru ke SQLite. |
| `PUT` | `/api/sales/{id}` | Edit data dasar struk dan, jika ada payload `items`, ganti item struk lalu hitung ulang subtotal/total. |
| `DELETE` | `/api/sales/{id}` | Soft delete transaksi. Body opsional: `{ "restoreStock": true }`. |
| `POST` | `/api/sales/{id}/restore` | Restore transaksi yang soft-deleted. |
| `GET` | `/api/products` | Ambil produk dari mirror SQLite. |
| `PUT` | `/api/products` | Simpan ulang semua produk dari cache frontend ke SQLite. |
| `DELETE` | `/api/products` | Hapus mirror produk SQLite. |
| `GET` | `/api/backup/database` | Download file SQLite backup. |
| `POST` | `/api/backup/restore` | Restore database dari file SQLite upload. |

Tabel SQLite:

| Tabel | Isi |
| --- | --- |
| `sales` | Header transaksi: nomor struk, waktu, toko, payment, subtotal, ongkir/discount, pajak, total, customer, chat date, soft-delete metadata. |
| `sale_items` | Item transaksi: sale id, SKU, nama, harga, qty, line total, note. |
| `customers` | Profil customer sederhana: nama, ongkir default, order terakhir. |
| `products` | Mirror produk/menu: client id, SKU, nama, harga, stok, unlimited, kategori, alias, source. |

Kolom penting di `sales`:

| Kolom | Fungsi |
| --- | --- |
| `receipt_no` | Nomor struk unik per tanggal. |
| `completed_at` | Waktu transaksi selesai. |
| `discount` | Dipakai sebagai ongkir lama untuk kompatibilitas. |
| `customer_name` | Nama/alamat customer. |
| `chat_date` | Waktu chat/order dari import. |
| `deleted_at` | Kosong jika aktif, berisi timestamp jika soft-deleted. |
| `stock_restored_on_delete` | Penanda stok lokal dikembalikan saat delete. |

Kolom penting di `customers`:

| Kolom | Fungsi |
| --- | --- |
| `name` | Nama/alamat customer, unik. |
| `default_shipping` | Ongkir default terbaru. |
| `last_order_at` | Waktu order terakhir. |
| `created_at` | Waktu customer pertama tersimpan. |
| `updated_at` | Waktu profil customer terakhir berubah. |

## Penyimpanan Data

Data tersimpan di dua tempat:

| Lokasi | Isi | Risiko |
| --- | --- | --- |
| Browser `localStorage` | Cache UI produk, cart aktif, hold cart, pengaturan, cache sync, draft import. | Bisa hilang jika browser data dibersihkan. |
| SQLite `kasir-bento.sqlite3` | Transaksi selesai, item penjualan, customer profile sederhana, dan mirror produk. | Harus rutin dibackup. |

Untuk pindah perangkat atau recovery lengkap, pakai `Backup Semua` karena ia membawa SQLite dan state browser sekaligus.

## Batasan Saat Ini

- Belum ada login atau role pengguna.
- Belum ada audit log per user.
- Belum ada cloud database.
- Belum ada sinkron transaksi antar device.
- Belum ada write-back otomatis ke Google Sheet.
- Belum ada modal khusus untuk mengelola customer manual.
- Belum ada refund/return formal. Koreksi transaksi dilakukan lewat edit, soft delete, dan restore.
- Printer thermal tetap bergantung pada driver OS dan print dialog browser.

## Catatan Untuk AI/Agent Berikutnya

Gunakan bagian ini sebagai konteks sebelum mengubah project:

- Jangan menghapus data SQLite atau `localStorage` tanpa instruksi jelas.
- Jangan mengganti soft delete menjadi hard delete kecuali diminta eksplisit.
- Jaga pengalaman kasir tetap cepat. Fitur utama harus bisa dipakai tanpa membaca tutorial panjang.
- Untuk UI, ikuti pola di `index.html`, `styles.css`, dan `script.js`.
- Untuk perubahan struk, test di print preview dan pikirkan batas 58mm thermal.
- Untuk perubahan dashboard, tanggal harus mengikuti timezone lokal pengguna.
- Untuk perubahan inventory, jangan merusak format Google Sheet/CSV yang sudah didukung.
- Untuk fitur transaksi, pastikan payload tetap cocok dengan `POST /api/sales`.
- Kalau menambah API baru, dokumentasikan di README ini.
- Kalau menambah workflow besar, update juga `docs/PROJECT_AGENTS.md` jika role/handoff ikut berubah.

Useful handoff guide:

[docs/PROJECT_AGENTS.md](docs/PROJECT_AGENTS.md)
