import sqlite3
from datetime import datetime

DB_PATH = "kasir-bento.sqlite3"

products_to_insert = [
    # id, client_id, sku, name, price, stock, stock_unlimited, category, aliases, source
    (16164, "item-mqfz02ke-mik8wk", "", "Ayam Goreng BaPut", 30000, 0, 1, "Lauk", "[]", "google"),
    (16165, "item-mqfz02ke-vntdzv", "", "Kotokan Iwak Pe", 30000, 0, 1, "Lauk", "[]", "google"),
    (16166, "item-mqfz02ke-vsv0zz", "", "Sayur Sop Makaroni", 20000, 0, 1, "Sayur", "[]", "google"),
    (16167, "item-mqfz02ke-4wtivs", "", "Pangsit Kuah", 20000, 0, 1, "Lauk", "[]", "google"),
    (16168, "item-mqfz02ke-1x42pj", "", "Oseng Tahu Tempe", 15000, 0, 1, "Lauk", "[]", "google"),
    (16169, "item-mqfz02ke-1r1l6h", "", "Bubur Suro", 20000, 0, 1, "Makanan", "[]", "google"),
    (16170, "item-mqfz02kf-lmthxy", "", "Kolak Kacang Ijo", 10000, 0, 1, "Minuman", "[]", "google"),
    (17062, "item-mqg0irmk-13lq61", "", "Oseng Tahu Tempe 1/2", 10000, 0, 1, "Lauk", '["oseng tahu tempe setengah","oseng tempe 1/2"]', "google"),
    (17063, "item-mqg0irmk-g8z06d", "", "Kotokan Iwak Pe 1/2", 15000, 0, 1, "Lauk", '["kotokan iwak pe setengah","iwak pe 1/2"]', "google")
]

print(f"Connecting to local SQLite database: {DB_PATH}")
conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

now = datetime.utcnow().isoformat() + "Z"

inserted_count = 0
for prod in products_to_insert:
    # Cek apakah id atau client_id sudah ada
    cursor.execute("SELECT id FROM products WHERE id = ? OR client_id = ?", (prod[0], prod[1]))
    exists = cursor.fetchone()
    if not exists:
        cursor.execute("""
            INSERT INTO products (id, client_id, sku, name, price, stock, stock_unlimited, category, aliases, source, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, prod + (now,))
        print(f"[INSERTED] {prod[3]} (ID: {prod[0]})")
        inserted_count += 1
    else:
        # Update harganya
        cursor.execute("UPDATE products SET price = ?, name = ?, updated_at = ? WHERE id = ?", (prod[4], prod[3], now, prod[0]))
        print(f"[UPDATED] {prod[3]} (ID: {prod[0]}) price set to {prod[4]}")

conn.commit()
conn.close()
print(f"\nDone! Seeded/Updated {inserted_count} new products into the local SQLite database.")
