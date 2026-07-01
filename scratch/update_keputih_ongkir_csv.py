import csv

csv_path = '/Users/notslimboy/Documents/Cashier Web Apps/orders-2026-06-26.csv'
rows = []

print("Membaca CSV untuk update ongkir Keputih...")
with open(csv_path, 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    fieldnames = reader.fieldnames
    for r in reader:
        if "Keputih" in r['customer']:
            r['ongkir'] = '15000'
        rows.append(r)

print("Menulis kembali CSV...")
with open(csv_path, 'w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)

print("Update CSV selesai!")
