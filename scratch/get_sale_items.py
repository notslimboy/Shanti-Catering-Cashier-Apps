import sqlite3

conn = sqlite3.connect('/Users/notslimboy/Documents/Cashier Web Apps/kasir-bento.sqlite3')
cursor = conn.cursor()

# Get sales where customer_name contains 'Keputih' or 'Tegal'
cursor.execute("SELECT id, receipt_no, completed_at, customer_name, subtotal, total FROM sales WHERE customer_name LIKE '%Keputih%' OR customer_name LIKE '%Tegal%'")
sales = cursor.fetchall()

print(f"Found {len(sales)} sales:")
for s in sales:
    sale_id, receipt_no, completed_at, customer_name, subtotal, total = s
    print(f"\nSale ID: {sale_id} | Receipt: {receipt_no} | Date: {completed_at} | Customer: {customer_name} | Subtotal: {subtotal} | Total: {total}")
    
    # Get items for this sale
    cursor.execute("SELECT sku, name, price, quantity, line_total, note FROM sale_items WHERE sale_id = ?", (sale_id,))
    items = cursor.fetchall()
    for item in items:
        sku, name, price, qty, line_total, note = item
        print(f"  -> Item: {name} (SKU: {sku}) | Price: {price} | Qty: {qty} | Total: {line_total} | Note: {note}")

conn.close()
