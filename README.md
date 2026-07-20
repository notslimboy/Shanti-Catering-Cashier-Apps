# Cashier Web App

A local-first cashier application for Shanti Catering and small food businesses. The project focuses on fast checkout, order imports, inventory management, 58mm/80mm thermal receipt printing, a sales dashboard, and local SQLite transaction storage.

The app runs in a browser with a local Python backend. It is not meant to be a large ERP system; it is a practical daily operations tool that cashiers can use quickly.

It also has a Capacitor mobile shell for Android and iOS. See [docs/CAPACITOR.md](docs/CAPACITOR.md) for the build workflow and the native POS printer bridge contract.

## Scope Status

| Area | Status | Purpose |
| --- | --- | --- |
| Cashier checkout | Available | Search items, add to cart, add item notes, shipping fee, tax, payment, validation, and complete sales. |
| Inventory | Available | Add/edit/delete items, limited or unlimited stock, spreadsheet import, public Google Sheet sync, and local SQLite mirroring. |
| Order import | Available | Import many orders from CSV/TSV or AI summaries into draft orders. |
| Customer profiles | Available | Returning customers appear as suggestions and their latest shipping fee can be reused automatically. |
| Thermal receipts | Available | Preview, test print, auto print, reprint, 58mm/80mm layout, and dynamic print height. |
| Sales dashboard | Available | Modal dashboard with date ranges, revenue summary, best-selling items, search, and active/deleted/all tabs. |
| Edit and delete receipts | Available | Receipt details, edit basic data, edit items/qty/price, reprint, soft delete, and restore deleted receipts. |
| Database backup | Available | Download/restore SQLite, plus `Backup Semua` for SQLite and browser app data. |
| Basic offline/PWA shell | Available | App shell is cached; inventory/cart/drafts are stored in the browser. |
| Supabase sync with offline outbox | Available | Local state stays usable offline; pending sales sync to Supabase automatically when the connection returns. |

## Main Use Cases

This app is suitable for:

- Daily cashier operations for catering, small shops, booths, or home-based pre-orders.
- Recording transactions locally into SQLite.
- Printing receipts to 58mm/80mm POS thermal printers.
- Managing menus from Google Sheets, CSV, XLS, or manual entry.
- Converting AI-assisted chat/order summaries into bulk draft orders.
- Daily closing or multi-day sales reports.
- Soft-deleting incorrect receipts without immediately losing data.
- Using the desktop sidebar or tablet/mobile drawer for larger tools such as import, dashboard, receipt settings, and printer setup.

This app is not yet suitable for:

- Multiple online branches/cashiers working together.
- Payment gateway integration.
- Login, admin/cashier roles, or per-user audit logs.
- Cloud databases without architectural changes.
- Stateless hosting such as Vercel while still relying on local SQLite.

## Supabase and Offline Work

Supabase is the shared cloud database. The cashier does not stop when it is temporarily unreachable: the local Zustand state and browser/native storage keep the active menu, cart, drafts, and a persistent sales outbox. A completed sale affected by a network failure is marked as pending locally, remains visible in the dashboard, and is pushed to Supabase on the next online event.

The local Python + SQLite server remains useful for desktop operation, backups, and its existing API mode. It is not a replacement for the mobile offline cache inside a Capacitor application.

## Running Locally

Start the local backend:

```bash
python3 server.py
```

Open the app:

```text
http://127.0.0.1:4174/
```

Check the backend:

```bash
curl http://127.0.0.1:4174/api/health
```

Default database:

```text
kasir-bento.sqlite3
```

## File Structure

| File | Purpose |
| --- | --- |
| `index.html` | Main UI structure, modals, forms, dashboard, and buttons. |
| `styles.css` | App styling, modals, responsive layout, sticky checkout, and receipt print CSS. |
| `script.js` | Frontend logic: state, cart, inventory, imports, customer profiles, dashboard, receipts, and API calls. |
| `server.py` | Local Python backend for static files, transaction APIs, soft delete/restore, backup, and SQLite. |
| `kasir-bento.sqlite3` | Local transaction database, created automatically when the server runs. |
| `manifest.webmanifest` | PWA metadata. |
| `service-worker.js` | Basic app-shell caching. |
| `sample-items.csv` | Sample item import format. |
| `sample-bulk-orders.csv` | Sample bulk order import format. |
| `logocatering.webp` | Receipt logo and app branding image. |
| `drivers/XP PRINTER DRIVER.rar` | XP/POS thermal printer driver used during cashier printer setup. This is ignored by Git. |
| `docs/PROJECT_AGENTS.md` | Additional guide for future AI agents or maintainers. |
| `_forAI/PROJECT_TECHNICAL_CONTEXT.md` | Detailed technical context for future AI agents or engineers. |

## Checkout Flow

1. The cashier searches for items from the product list.
2. Items are added to the cart.
3. Quantity and item notes can be changed. Items with different notes are tracked as separate lines under unique cart item IDs.
4. The cashier fills in the customer, shipping fee, tax, and payment method.
5. The app shows checkout validation.
6. The cashier clicks `Selesaikan Transaksi`.
7. The frontend sends the transaction to `POST /api/sales`.
8. The backend creates a unique receipt number and saves the transaction to SQLite.
9. Local stock is reduced.
10. The receipt is printed directly or opened in preview, depending on settings.

Validation notes:

- Blocking errors stop checkout, such as an empty cart or insufficient stock (calculated as the sum of all matching products in the cart).
- Warnings do not stop checkout immediately, but the cashier should review them first. Examples: empty customer or Rp0 shipping fee.
- On mobile/tablet, totals and checkout buttons are sticky so the cashier does not need to scroll far.

Carts can also be held with `Tahan`, then restored from `Buka Hold`.

## Customer Profiles

Customer profiles are built automatically from:

- The SQLite `customers` table.
- Active SQLite sales as fallback.
- Import drafts.
- Held carts.
- The last receipt.

When a customer name matches previous history:

- The app shows a returning-customer hint.
- The default shipping fee is filled automatically if different.
- The customer can still be edited manually.

Customer data is intentionally simple:

| Field | Purpose |
| --- | --- |
| `name` | Customer name/address for autocomplete. |
| `default_shipping` | Default shipping fee used when the customer is selected. |
| `last_order_at` | Latest order time, used to prioritize recent suggestions. |

When a new transaction is saved or a receipt is edited, the backend automatically upserts the customer. If the customer already exists, `default_shipping` and `last_order_at` follow the latest order.

## Inventory

Active inventory is stored in browser `localStorage`, then mirrored to local SQLite through `/api/products` when the backend is available:

```text
kasir-bento-state-v1
```

Item sources:

- Manual entry from the `Kelola Barang` modal.
- CSV/TSV/XLS/XLSX import.
- Public Google Sheet or published CSV sync.

Default columns:

```csv
sku,nama,harga,stok,kategori
COF-001,Es Kopi Susu,18000,24,Minuman
```

Important columns:

| Column | Description |
| --- | --- |
| `sku` | Item code, optional but recommended. |
| `nama` | Item name. |
| `harga` | Rupiah price, numbers only. |
| `stok` | Stock quantity. Can be unlimited through the manual UI. |
| `kategori` | Category for product filtering. |
| `alias` | Optional alternate menu names, useful for matching AI-imported orders. |

Google Sheet sync is currently one-way: Sheet to app. Sales do not automatically write back to Google Sheets.

Storage notes:

- When the app opens, products are loaded from SQLite if available.
- If SQLite is empty but the browser has products, the app seeds the SQL mirror from the browser cache.
- After import, manual edits, checkout, delete/restore with stock adjustments, the app saves products back to SQL.
- Google Sheets remain a one-way source; stock in Google Sheets is not automatically changed after sales.

### Menu Variants / Cara Jual
Menus are stored as parent products, while pricing lives in `product_variants`. Each menu can have fixed-price variants, per-unit variants, package variants, or custom/manual-price variants. The legacy `products.price` column is kept as a mirror of the default variant price for imports and older fallback paths.

Existing products are automatically backfilled with a default `Normal` variant. Legacy product names with suffixes such as `1/2`, `setengah`, `separuh`, or `jumbo` are migrated into variants under the matching parent menu when one exists.

### Kelola Menu Panel
The main view of the menu manager is the **Kelola Menu** panel. It displays a searchable list of parent menus with category, stock status, default variant price, and nested variant rows. The edit form is split into menu identity fields and an inline variant editor, so daily edits usually happen on variants instead of renaming the parent menu.

## Order Import

`Import Pesanan` is used to create many draft orders at once.

Supported input:

- Upload CSV/TSV.
- Paste CSV generated from an AI summary.
- Use `Salin Prompt AI` to ask AI to clean up WhatsApp chats into CSV. The prompt keeps parent menu names stable, writes custom prices to `harga`, writes per-unit mentions such as `10 biji` to `quantity` + `unit`, and separates items of the same product with different notes into individual rows.

Column format:

```csv
customer,chatDate,payment,ongkir,item,quantity,note
"Bu Ani - Jl Melati 12","28/5/2026 10.15","Tunai",10000,"Nasi Box Ayam",20,"tanpa sambal 5 box"
```

Drafts do not become transactions until the cashier processes them into the cart or batch process. Ready drafts can be processed together, and batch print is available.

## Receipts and Thermal Printers

Receipts are designed for thermal receipt printers:

- Default app width: 58mm.
- The 58mm print area is slightly narrower for safer output on small thermal printers.
- Printed page height is calculated dynamically from receipt content and printed via a hidden iframe to isolate styles.
- Multiple receipts printed in a batch are printed consecutively on the same roll, separated by a dotted line.
- 80mm remains available in `Edit Struk`.
- Receipt text is bold for readability.
- Customer name/address is printed directly without a `Customer` label.
- Receipt numbers are created by the backend when transactions are saved.

Receipt settings:

- Store name.
- Store address.
- Receipt footer.
- 58mm/80mm receipt width.
- Font size.
- Auto print.
- Direct print or preview first.
- Test print.

Printer setup:

- `Setup Printer` opens a printer checklist modal.
- The modal links to `drivers/XP PRINTER DRIVER.rar`.
- The driver still must be installed at the operating system level. The web app only provides a checklist and test print.

Recommended custom 58mm thermal paper settings on macOS:

```text
Width: 58 mm
Normal height: 150 mm
Margins: 0 mm
Scale: 100%
Headers and footers: Off
```

If right-side prices are cut off:

- Use a POS58/receipt printer driver, not Generic PostScript/AirPrint.
- Paper size must be 58mm.
- Margins should be none/minimum.
- Scale can be reduced to 95%.

## Sales Dashboard

`Dashboard Penjualan` is a modal, not a separate page.

Main features:

- Opens to today's local date by default.
- Ranges: `Harian`, `Mingguan`, `Semua`, and `Custom`.
- `Dari` and `Sampai` date inputs.
- Previous date, next date, and today buttons.
- Status tabs: `Aktif`, `Terhapus`, and `Semua`.
- Transaction count and revenue summary for the selected range.
- Total active transactions from the database.
- Payment method breakdown.
- Sold item breakdown.
- Search by receipt number, item, customer, note, or payment method.
- Receipt cards highlight the customer as the main title.
- Quick actions per receipt: `Cetak`, `Edit`, `Detail`, `Hapus`, or `Restore`.
- Receipt edit form can change customer, payment, shipping fee, tax, chat date, item, qty, price, SKU, and item notes before reprinting.
- Transaction history is paginated at 10 receipts per page.

Soft delete:

- `Hapus` does not permanently delete from SQLite.
- The backend fills the `deleted_at` column.
- Receipts move to the `Terhapus` tab.
- Receipts can be restored with `Restore`.
- During delete, the cashier can choose whether local stock should be restored.
- If a receipt is restored and stock was previously restored, local stock is reduced again.

## Backup and Restore

The dashboard provides:

- `Backup`: download the current SQLite file.
- `Restore`: upload a SQLite backup to replace the transaction database.
- `Backup Semua`: download one JSON file containing SQLite and browser state such as inventory, settings, cart, held carts, and drafts.
- `Restore Semua`: restore a full JSON backup.

Backup restore validation:

- The file must be valid SQLite.
- The file must contain `sales` and `sale_items` tables.
- If valid, the old database is copied first to the safety file `kasir-bento.before-restore.sqlite3`.
- After restore, latest column migrations still run automatically.

Use `Backup Semua` for the most complete backup. Raw SQLite backup remains useful for transactions and SQL tables, but it does not include the active browser state.

## Backend and API

The backend is in `server.py`, using `ThreadingHTTPServer` and SQLite.

Default host:

```text
127.0.0.1:4174
```

Endpoints:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Check the server and database name. |
| `GET` | `/api/customers?limit=300` | Fetch customers for autocomplete and default shipping fee. |
| `GET` | `/api/sales?limit=50` | Fetch latest active transactions. Max limit is 200. |
| `GET` | `/api/sales?limit=50&includeDeleted=1` | Fetch active and deleted transactions. |
| `POST` | `/api/sales` | Save a new transaction to SQLite. |
| `PUT` | `/api/sales/{id}` | Edit basic receipt data and, if `items` is provided, replace receipt items and recalculate subtotal/total. |
| `DELETE` | `/api/sales/{id}` | Soft-delete a transaction. Optional body: `{ "restoreStock": true }`. |
| `POST` | `/api/sales/{id}/restore` | Restore a soft-deleted transaction. |
| `GET` | `/api/products` | Fetch products from the SQLite mirror. |
| `PUT` | `/api/products` | Save all products from the frontend cache into SQLite. |
| `DELETE` | `/api/products` | Clear the SQLite product mirror. |
| `GET` | `/api/backup/database` | Download a SQLite backup file. |
| `POST` | `/api/backup/restore` | Restore the database from an uploaded SQLite file. |

SQLite tables:

| Table | Contents |
| --- | --- |
| `sales` | Transaction header: receipt number, time, store, payment, subtotal, shipping/discount, tax, total, customer, chat date, and soft-delete metadata. |
| `sale_items` | Transaction item snapshots: sale id, SKU, display name, final price, qty, line total, note, menu id/name, variant id/name, unit, pricing type, and receipt label. |
| `customers` | Simple customer profiles: name, default shipping fee, latest order. |
| `products` | Parent menu mirror: client id, SKU, name, default variant price mirror, stock, unlimited flag, category, aliases, source. |
| `product_variants` | Menu selling modes: parent menu id, variant name, pricing type, price, unit/package data, receipt label, default flag, override flags, stock, aliases, sort order, active flag. |

For Supabase, run [`docs/supabase-menu-variants.sql`](docs/supabase-menu-variants.sql) in the SQL editor before enabling cloud sync for menu variants.

Important `sales` columns:

| Column | Purpose |
| --- | --- |
| `receipt_no` | Unique receipt number per date. |
| `completed_at` | Transaction completion time. |
| `discount` | Used as legacy shipping fee for compatibility. |
| `customer_name` | Customer name/address. |
| `chat_date` | Chat/order time from imports. |
| `deleted_at` | Empty when active; contains a timestamp when soft-deleted. |
| `stock_restored_on_delete` | Marks whether local stock was restored during delete. |

Important `customers` columns:

| Column | Purpose |
| --- | --- |
| `name` | Unique customer name/address. |
| `default_shipping` | Latest default shipping fee. |
| `last_order_at` | Latest order time. |
| `created_at` | First time the customer was stored. |
| `updated_at` | Last time the customer profile changed. |

## Data Storage

Data is stored in two places:

| Location | Contents | Risk |
| --- | --- | --- |
| Browser `localStorage` | UI product cache, active cart, held carts, settings, sync cache, import drafts. | Can be lost if browser data is cleared. |
| SQLite `kasir-bento.sqlite3` | Completed transactions, sale items, simple customer profiles, and product mirror. | Must be backed up regularly. |

For device migration or full recovery, use `Backup Semua` because it includes both SQLite and browser state.

## Current Limitations

- No login or user roles yet.
- No per-user audit log yet.
- No cloud database yet.
- No transaction sync across devices yet.
- No automatic write-back to Google Sheets yet.
- No dedicated modal for manual customer management yet.
- No formal refund/return workflow yet. Corrections are handled through edit, soft delete, and restore.
- Thermal printer behavior still depends on OS drivers and the browser print dialog.

## Notes for Future AI Agents

Use this section as context before changing the project:

- Do not delete SQLite data or `localStorage` without clear instruction.
- Do not replace soft delete with hard delete unless explicitly requested.
- Keep the cashier experience fast. Core features should work without long tutorials.
- For UI work, follow the patterns in `index.html`, `styles.css`, and `script.js`.
- For receipt changes, test print preview and consider the 58mm thermal width limit.
- For dashboard changes, dates must follow the user's local timezone.
- For inventory changes, do not break existing Google Sheet/CSV formats.
- For transaction features, keep payloads compatible with `POST /api/sales`.
- If you add a new API, document it in this README.
- If you add a major workflow, also update `docs/PROJECT_AGENTS.md` if role/handoff guidance changes.

Useful handoff guide:

[docs/PROJECT_AGENTS.md](docs/PROJECT_AGENTS.md)
