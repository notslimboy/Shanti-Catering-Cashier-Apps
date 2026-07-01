import sqlite3

conn = sqlite3.connect('/Users/notslimboy/Documents/Cashier Web Apps/kasir-bento.sqlite3')
cursor = conn.cursor()

cursor.execute("SELECT id, name, default_shipping FROM customers WHERE name LIKE '%Keputih%' OR name LIKE '%Tegal%' OR name LIKE '%Timur%'")
rows = cursor.fetchall()
print("Matching customers in DB:")
for r in rows:
    print(r)

conn.close()
