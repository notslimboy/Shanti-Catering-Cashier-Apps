import csv

# 1. Read existing CSV
rows = []
with open('/Users/notslimboy/Documents/Cashier Web Apps/orders-2026-06-26.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for r in reader:
        # Check if customer name contains Bumi Galaxy Permai
        if "Bumi Galaxy Permai" in r['customer']:
            r['note'] = "dicantolin klo gk ada org"
        rows.append(r)

# 2. Add new records
new_orders = [
    # ITS J / 3 (dari chat rujukan)
    {'customer': 'ITS J / 3', 'chatDate': '25/06/2026 20.17.08', 'payment': '', 'ongkir': '0', 'item': 'Kpl Ikan Mayung', 'quantity': '2', 'note': 'tidak pakai cabe sama sekali dan tdk usah pakai santan'},
    
    # Bhaskara 4 / 5 (dari chat rujukan)
    {'customer': 'Bhaskara 4 / 5', 'chatDate': '25/06/2026 20.25.04', 'payment': '', 'ongkir': '0', 'item': 'Kpl Ikan Mayung', 'quantity': '4', 'note': 'Tdk pedas sama sekali + tanpa santan'},

    # Dina Tohir 9
    {'customer': 'Dina Tohir 9', 'chatDate': '26/06/2026 08.06.04', 'payment': '', 'ongkir': '5000', 'item': 'Sayur Bayem', 'quantity': '1', 'note': ''},
    {'customer': 'Dina Tohir 9', 'chatDate': '26/06/2026 08.06.04', 'payment': '', 'ongkir': '5000', 'item': 'Salad Buah', 'quantity': '1', 'note': ''},
    {'customer': 'Dina Tohir 9', 'chatDate': '26/06/2026 08.06.04', 'payment': '', 'ongkir': '5000', 'item': 'Martabak Jadul', 'quantity': '6', 'note': ''},
    
    # T85
    {'customer': 'ITS T 85', 'chatDate': '26/06/2026 08.06.04', 'payment': '', 'ongkir': '5000', 'item': 'Kpl Ikan Mayung', 'quantity': '2', 'note': 'tanpa santan dan gak pedes'},
    {'customer': 'ITS T 85', 'chatDate': '26/06/2026 08.06.04', 'payment': '', 'ongkir': '5000', 'item': 'Salad Buah', 'quantity': '1', 'note': ''},
    
    # Keputih Tegal Timur GG 15A
    {'customer': 'Keputih Tgl Timur 2 / 15A', 'chatDate': '26/06/2026 08.06.04', 'payment': '', 'ongkir': '15000', 'item': 'Botok Uritan / 1', 'quantity': '3', 'note': ''},
    {'customer': 'Keputih Tgl Timur 2 / 15A', 'chatDate': '26/06/2026 08.06.04', 'payment': '', 'ongkir': '15000', 'item': 'Mendol Tempe MLG / 6', 'quantity': '2', 'note': ''},
    {'customer': 'Keputih Tgl Timur 2 / 15A', 'chatDate': '26/06/2026 08.06.04', 'payment': '', 'ongkir': '15000', 'item': 'Salad Buah', 'quantity': '1', 'note': ''},
    
    # j41
    {'customer': 'ITS J 41', 'chatDate': '26/06/2026 08.06.04', 'payment': '', 'ongkir': '0', 'item': 'Martabak Jadul', 'quantity': '5', 'note': ''},
    {'customer': 'ITS J 41', 'chatDate': '26/06/2026 08.06.04', 'payment': '', 'ongkir': '0', 'item': 'Salad Buah', 'quantity': '1', 'note': ''},
    {'customer': 'ITS J 41', 'chatDate': '26/06/2026 08.06.04', 'payment': '', 'ongkir': '0', 'item': 'Lontong Kikil', 'quantity': '1', 'note': ''},
    {'customer': 'ITS J 41', 'chatDate': '26/06/2026 08.06.04', 'payment': '', 'ongkir': '0', 'item': 'Rawon', 'quantity': '1', 'note': ''},
    {'customer': 'ITS J 41', 'chatDate': '26/06/2026 08.06.04', 'payment': '', 'ongkir': '0', 'item': 'Mendol Tempe MLG / 6', 'quantity': '1', 'note': ''},
    {'customer': 'ITS J 41', 'chatDate': '26/06/2026 08.06.04', 'payment': '', 'ongkir': '0', 'item': 'Sayur Bayem 1/2', 'quantity': '1', 'note': 'separuh porsi'},
    
    # Tohir 17
    {'customer': 'Tohir 17', 'chatDate': '26/06/2026 08.06.04', 'payment': '', 'ongkir': '5000', 'item': 'Kpl Ikan Mayung', 'quantity': '1', 'note': ''}
]

rows.extend(new_orders)

# 3. Write back to CSV
with open('/Users/notslimboy/Documents/Cashier Web Apps/orders-2026-06-26.csv', 'w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=['customer', 'chatDate', 'payment', 'ongkir', 'item', 'quantity', 'note'])
    writer.writeheader()
    writer.writerows(rows)

print("Updated CSV successfully!")
