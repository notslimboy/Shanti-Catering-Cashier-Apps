import csv

csv_wrong_text = """customer,chatDate,payment,ongkir,item,quantity,note
ITS N/2,25/06/2026 18.34.18,,0,Lontong Kikil,1,
ITS N/2,25/06/2026 18.34.18,,0,Salad Buah,1,
ITS N 11,25/06/2026 18.36.05,,0,Salad Buah,1,
ITS N 11,25/06/2026 18.36.05,,0,Bali Tahu Telur,1,
ITS N 11,25/06/2026 18.36.05,,0,Mendol Tempe MLG / 6,2,
ITS X 16,25/06/2026 18.48.16,,0,Lontong Kikil,1,
ITS X 16,25/06/2026 18.48.16,,0,Salad Buah,1,
ITS X 16,25/06/2026 18.48.16,,0,Martabak Jadul,3,
ITS X 16,25/06/2026 18.48.16,,0,Kpl Ikan Mayung,1,bumbu pedas
ITS X 16,25/06/2026 18.48.16,,0,Mendol Tempe MLG / 6,1,kacang malang
Tek Lingkungan Khusnul,25/06/2026 18.48.58,,0,Kpl Ikan Mayung,1,kirim di teknik lingkungan
Tek Lingkungan Khusnul,25/06/2026 18.48.58,,0,Salad Buah,1,kirim di teknik lingkungan
Tek Lingkungan Khusnul,25/06/2026 18.48.58,,0,Mendol Tempe MLG / 6,1,1; kirim di teknik lingkungan
Pantai Mentari Blok SF no. 9,25/06/2026 19.45.11,,10000,Kpl Ikan Mayung,1,pedas
Pantai Mentari Blok SF no. 9,25/06/2026 19.45.11,,10000,Rawon,1,
Pantai Mentari Blok SF no. 9,25/06/2026 19.45.11,,10000,Botok Uritan / 1,1,
Pantai Mentari Blok SF no. 9,25/06/2026 19.45.11,,10000,Martabak Jadul,6,
Pantai Mentari Blok SF no. 9,25/06/2026 19.45.11,,10000,Salad Buah,4,
Mulyo BPD BLOK B / 23,25/06/2026 19.47.52,,0,Rawon,2,
BPD B / 33,25/06/2026 19.54.46,,0,Salad Buah,1,
BPD B / 33,25/06/2026 19.54.46,,0,Mendol Tempe MLG / 6,2,kacang malang
V / 3,25/06/2026 19.57.08,,0,Lontong Kikil,1,tanpa lontong
V / 3,25/06/2026 19.57.08,,0,Kpl Ikan Mayung,1,
ITS T/4,25/06/2026 20.03.32,,0,Kpl Ikan Mayung,1,
ITS T/4,25/06/2026 20.03.32,,0,Martabak Jadul,3,
ITS T/4,25/06/2026 20.03.32,,0,Lontong Kikil,1,
Pucangan 3.no.49,25/06/2026 20.07.57,,25000,Kpl Ikan Mayung,1,pedas
Pucangan 3.no.49,25/06/2026 20.07.57,,25000,Rawon,1,
Pucangan 3.no.49,25/06/2026 20.07.57,,25000,Mendol Tempe MLG / 6,2,
Pucangan 3.no.49,25/06/2026 20.07.57,,25000,Martabak Jadul,5,
Pucangan 3.no.49,25/06/2026 20.07.57,,25000,Salad Buah,4,
Gatot - Tri T 29,25/06/2026 20.09.25,,0,Kpl Ikan Mayung,1,
Gatot - Tri T 29,25/06/2026 20.09.25,,0,Botok Uritan / 1,1,
Gatot - Tri T 29,25/06/2026 20.09.25,,0,Sayur Bayem,1,
Puri Asri P3 no. 32 Nenet,25/06/2026 20.13.09,,5000,Rawon,1,
Puri Asri P3 no. 32 Nenet,25/06/2026 20.13.09,,5000,Salad Buah,1,
Villa Royal C4/18,25/06/2026 20.14.56,,5000,Kpl Ikan Mayung,2,pedas
Villa Royal C4/18,25/06/2026 20.14.56,,5000,Salad Buah,2,
Mulyo Utara 6/24,25/06/2026 20.35.14,,0,Sayur Bayem,1,
Mulyo Utara 6/24,25/06/2026 20.35.14,,0,Salad Buah,4,4
Dharmahusada Emas Fendi - Dharmas bf20,25/06/2026 20.53.27,,0,Lontong Kikil,3,
Mulyo BPD B -1,25/06/2026 20.55.28,,0,Sayur Bayem,1,
Mulyo BPD B -1,25/06/2026 20.55.28,,0,Mendol Tempe MLG / 6,1,
Mulyo Tng 6 / 5,25/06/2026 21.17.12,,0,Rawon,1,
Villa Royal C4/18,25/06/2026 22.24.14,,5000,Botok Uritan / 1,2,
Villa Royal C4/18,25/06/2026 22.24.14,,5000,Lontong Kikil,1,
Sutorejo Tengah 8/10,26/06/2026 03.05.58,,0,Rawon,1,
Sutorejo Tengah 8/10,26/06/2026 03.05.58,,0,Bali Tahu Telur,1,
Wisper Tengah Blok Kk,26/06/2026 04.32.35,,0,Sayur Bayem,1,
Wisper Tengah Blok Kk,26/06/2026 04.32.35,,0,Mendol Tempe MLG / 6,1,
Wisper Tengah Blok Kk,26/06/2026 04.32.35,,0,Salad Buah,1,
M 4 A,26/06/2026 04.39.36,,0,Rawon,1,35rb
M 4 A,26/06/2026 04.39.36,,0,Lontong Kikil,1,tanpa lontong 30rb
M 4 A,26/06/2026 04.39.36,,0,Kpl Ikan Mayung,1,15rb
ITS F 6,26/06/2026 05.32.58,,0,Salad Buah,1,
ITS F 6,26/06/2026 05.32.58,,0,Rawon,1,
ITS F 6,26/06/2026 05.32.58,,0,Kpl Ikan Mayung,1,
Emi Bumi Marina - Teknik Fisika,26/06/2026 05.43.31,,5000,Sayur Bayem,1,
Emi Bumi Marina - Teknik Fisika,26/06/2026 05.43.31,,5000,Bali Tahu Telur,1,
ITS T 8 LAMA,26/06/2026 05.53.12,,5000,Salad Buah,1,
ITS T 8 LAMA,26/06/2026 05.53.12,,5000,Martabak Jadul,3,
Mbak JU KARIS - Ibu Artha suteng blok G no.11,26/06/2026 06.07.02,,0,Lontong Kikil,3,
Mbak JU KARIS - Ibu Artha suteng blok G no.11,26/06/2026 06.07.02,,0,Rawon,3,
Mbak JU KARIS - Ibu Artha suteng blok G no.11,26/06/2026 06.07.02,,0,Kpl Ikan Mayung,2,
Mbak JU KARIS - Ibu Artha suteng blok G no.11,26/06/2026 06.07.02,,0,Bali Tahu Telur,2,
Mbak JU KARIS - Ibu Artha suteng blok G no.11,26/06/2026 06.07.02,,0,Salad Buah,2,
ITS W/6,26/06/2026 06.15.50,,0,Salad Buah,1,
ITS W/6,26/06/2026 06.15.50,,0,Martabak Jadul,4,
Suto Sel 8/27,26/06/2026 06.35.40,,0,Rawon,1,
Suto Sel 8/27,26/06/2026 06.35.40,,0,Mendol Tempe MLG / 6,1,
SUTO TIMUR 3 / 33,26/06/2026 06.38.11,,0,Sayur Bayem,1,
SUTO TIMUR 3 / 33,26/06/2026 06.38.11,,0,Bali Tahu Telur,1,
SUTO TIMUR 3 / 33,26/06/2026 06.38.11,,0,Mendol Tempe MLG / 6,1,1
Blok T 86.bu Ratna,26/06/2026 06.40.39,,0,Lontong Kikil,1,lontong pisah
Blok T 86.bu Ratna,26/06/2026 06.40.39,,0,Salad Buah,1,
Griya Asri G2 - 28,26/06/2026 06.48.21,,5000,Rawon,2,daging sj dn kuahnya yg byk
SUTO SEL 7/37,26/06/2026 06.53.45,,0,Lontong Kikil,1,lontong
Mulyo Utara/21 - MU21 pesan,26/06/2026 07.01.54,,0,Lontong Kikil,1,lontongnya utuh dipisah jangan lupa sambal
U 4 / 5 A Perpus - Blok U-IV/5A,26/06/2026 07.09.51,,0,Salad Buah,1,
U 4 / 5 A Perpus - Blok U-IV/5A,26/06/2026 07.09.51,,0,Martabak Jadul,3,
U 4 / 5 A Perpus - Blok U-IV/5A,26/06/2026 07.09.51,,0,Mendol Tempe MLG / 6,1,
T - 49,26/06/2026 07.36.43,,0,Lontong Kikil,1,tanpa lontong
T - 49,26/06/2026 07.36.43,,0,Botok Uritan / 1,2,
T - 49,26/06/2026 07.36.43,,0,Martabak Jadul,3,
Kalijudan Taruna 2/6,26/06/2026 07.45.27,,15000,Rawon,1,
Kalijudan Taruna 2/6,26/06/2026 07.45.27,,15000,Mendol Tempe MLG / 6,1,
Kalijudan Taruna 2/6,26/06/2026 07.45.27,,15000,Salad Buah,2,
Bumi Galaxy Permai M3 / 17,26/06/2026 07.47.43,,15000,Sayur Bayem,1,dicantolin klo gk ada org
Bumi Galaxy Permai M3 / 17,26/06/2026 07.47.43,,15000,Bali Tahu Telur,1,dicantolin klo gk ada org
Bumi Galaxy Permai M3 / 17,26/06/2026 07.47.43,,15000,Salad Buah,2,dicantolin klo gk ada org
Dina Tohir 9,26/06/2026 08.06.04,,5000,Sayur Bayem,1,
Dina Tohir 9,26/06/2026 08.06.04,,5000,Salad Buah,1,
Dina Tohir 9,26/06/2026 08.06.04,,5000,Martabak Jadul,6,
ITS T 85,26/06/2026 08.06.04,,5000,Kpl Ikan Mayung,2,tanpa santan dan gak pedes
ITS T 85,26/06/2026 08.06.04,,5000,Salad Buah,1,
Keputih Tgl Timur 2 / 15A,26/06/2026 08.06.04,,0,Botok Uritan / 1,3,
Keputih Tgl Timur 2 / 15A,26/06/2026 08.06.04,,0,Mendol Tempe MLG / 6,2,
Keputih Tgl Timur 2 / 15A,26/06/2026 08.06.04,,0,Salad Buah,1,
ITS J 41,26/06/2026 08.06.04,,0,Martabak Jadul,5,
ITS J 41,26/06/2026 08.06.04,,0,Salad Buah,1,
ITS J 41,26/06/2026 08.06.04,,0,Lontong Kikil,1,
ITS J 41,26/06/2026 08.06.04,,0,Rawon,1,
ITS J 41,26/06/2026 08.06.04,,0,Mendol Tempe MLG / 6,1,
ITS J 41,26/06/2026 08.06.04,,0,Sayur Bayem 1/2,1,separuh porsi
Tohir 17,26/06/2026 08.06.04,,5000,Kpl Ikan Mayung,1,
"""

# Parse the wrong CSV
wrong_rows = []
for row in csv.DictReader(csv_wrong_text.strip().split('\n')):
    wrong_rows.append(row)

# Load current (fixed) CSV
fixed_rows = []
with open('/Users/notslimboy/Documents/Cashier Web Apps/orders-2026-06-26.csv', 'r', encoding='utf-8') as f:
    for r in csv.DictReader(f):
        fixed_rows.append(r)

# Helper function to create unique key
def make_key(r):
    return (r['customer'], r['chatDate'], r['item'], r['quantity'], r['note'], r['ongkir'])

wrong_keys = {make_key(r): r for r in wrong_rows}
fixed_keys = {make_key(r): r for r in fixed_rows}

print("=== BARIS DI CSV SALAH TAPI HILANG/DIUBAH DI CSV BARU ===")
for k, r in wrong_keys.items():
    if k not in fixed_keys:
        print(f"Customer: {r['customer']} | Date: {r['chatDate']} | Item: {r['item']} ({r['quantity']}) | Ongkir: {r['ongkir']} | Note: {r['note']}")

print("\n=== BARIS BARU / HASIL PERBAIKAN DI CSV BARU ===")
for k, r in fixed_keys.items():
    if k not in wrong_keys:
        print(f"Customer: {r['customer']} | Date: {r['chatDate']} | Item: {r['item']} ({r['quantity']}) | Ongkir: {r['ongkir']} | Note: {r['note']}")
