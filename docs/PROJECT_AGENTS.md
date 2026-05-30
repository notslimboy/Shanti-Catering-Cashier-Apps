# Project Agents

Use these roles when handing work to another agent or returning to the cashier app later. Keep requests small, include the files or screens involved, and ask the agent to preserve existing work unless a change is explicitly requested.

## Project Context

- Project: cashier web app in `/Users/notslimboy/Documents/Cashier Web Apps`
- Current app name: Kasir Shanti Catering.
- Protect existing cashier data: do not delete `kasir-bento.sqlite3`, browser state, imported menus, or driver files unless the user explicitly asks.
- Useful baseline: this app helps Shanti Catering ring up menu items, sync inventory from Google Sheets, mirror products into SQLite, manage daily menus, create/edit/reprint thermal receipts, and review daily sales.
- Deep technical context lives in `_forAI/PROJECT_TECHNICAL_CONTEXT.md`.

## Product/UX Agent

Invoke when planning features, flows, labels, layout, or cashier-facing behavior.

Good tasks:

- Define the checkout flow from item search to payment and receipt.
- Decide what the cashier sees for cart, discounts, totals, stock warnings, and errors.
- Review whether the app is beginner-friendly for a non-technical shop owner.
- Turn rough ideas into clear requirements before coding starts.

Project notes:

- Favor fast, low-friction actions over decorative screens.
- Use Indonesian cashier-facing language: barang/menu, stok, keranjang, total, pembayaran, ongkir, struk.
- Prioritize common shop moments: price lookup, quantity changes, mistaken taps, cash payments, and offline use.

## Frontend/PWA Agent

Invoke when building or reviewing the browser app, responsive layout, local storage, installability, or offline behavior.

Good tasks:

- Implement the main cashier interface.
- Add responsive support for phone, tablet, and desktop checkout counters.
- Add PWA basics such as manifest, service worker, offline shell, and install prompt behavior.
- Keep UI state predictable after refreshes, Google Sheet syncs, or network loss.

Project notes:

- Check that buttons are large enough for touch use.
- Keep the checkout screen immediately useful; avoid landing-page style layouts.
- Preserve browser `localStorage` and the SQLite product mirror when changing persistence behavior.

## Inventory/Google Sheets Agent

Invoke when importing, exporting, validating, or organizing item data.

Good tasks:

- Design a simple product schema for SKU, name, category, price, cost, stock, and barcode.
- Create Google Sheets sync and CSV fallback workflows.
- Validate inventory data and show friendly errors for missing prices or duplicate SKUs.
- Plan stock adjustments after sales, returns, manual corrections, and sheet refreshes.
- Add Google Apps Script or backend write-back when sales need to update the Google Sheet automatically.

Project notes:

- Keep spreadsheet columns stable and clearly named.
- Current sync is one-way from Google Sheets into the app.
- Product inventory is cached in browser state and mirrored into SQLite via `/api/products`.
- Public/published Google Sheets work without login; private Sheets need OAuth, Apps Script, or a backend.
- Prices should be treated as currency values, not floating-point display guesses.
- Inventory changes should be easy to audit later.

## Receipt/Printer QA Agent

Invoke when receipt layout, printing, PDF export, thermal printer behavior, or transaction totals need careful checking.

Good tasks:

- Verify receipt totals, taxes, discounts, payment, and change.
- Test print styles for narrow receipt widths.
- Review whether receipts are readable in browser print preview.
- Check edge cases such as long item names, many line items, voids, and returns.

Project notes:

- Receipt content should be compact, legible, and accurate.
- Include date/time, item lines, subtotal, ongkir, taxes if used, payment, total, and footer note.
- The project includes `drivers/XP PRINTER DRIVER.rar` for the intended XP/POS thermal printer setup.
- Test with real browser print preview before considering printer work done.

## Testing/Accessibility Agent

Invoke when verifying behavior, preventing regressions, or improving keyboard and screen-reader support.

Good tasks:

- Create a checklist for checkout, inventory, receipts, offline mode, and responsive layouts.
- Add or run tests for cart math, stock updates, persistence, and import/export validation.
- Review keyboard navigation, focus order, labels, contrast, and touch target sizes.
- Test important flows on small screens and with browser zoom.

Project notes:

- Totals and receipt math deserve focused tests.
- Cashier actions should not depend on color alone.
- Error messages should tell the user what to fix and where.

## Handoff Template

Copy this into future agent requests:

```text
Project: Cashier web app
Role needed: [Product/UX | Frontend/PWA | Inventory/Google Sheets | Receipt/Printer QA | Testing/Accessibility]
Goal:
Relevant files or screens:
Constraints:
- Preserve existing unrelated changes.
- Do not rewrite app structure unless required.
- Keep the experience beginner-friendly for a small shop cashier.
Definition of done:
```
