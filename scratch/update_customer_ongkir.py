import sqlite3
import urllib.request
import urllib.error
import json
import subprocess

# 1. Update SQLite database lokal
db_path = '/Users/notslimboy/Documents/Cashier Web Apps/kasir-bento.sqlite3'
print("Mengupdate SQLite lokal...")
try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE customers SET default_shipping = 15000 WHERE name = 'Keputih Tegal Timur 2 / 15A'"
    )
    conn.commit()
    print(f"SQLite terupdate! Rows affected: {cursor.rowcount}")
    conn.close()
except Exception as e:
    print(f"Gagal update SQLite: {e}")

# 2. Update Supabase via REST API (urllib)
SUPABASE_URL = "https://ddfalsclevkqhiyojngx.supabase.co"
SUPABASE_KEY = "sb_publishable_Ve_QZUvSQgQSE9_LcEAHmw_WLaQDSrP"

print("Mengupdate Supabase...")
url = f"{SUPABASE_URL}/rest/v1/customers?name=eq.Keputih%20Tegal%20Timur%202%20/%2015A"
data = json.dumps({"default_shipping": 15000}).encode('utf-8')

req = urllib.request.Request(
    url,
    data=data,
    headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    },
    method="PATCH"
)

try:
    with urllib.request.urlopen(req) as response:
        status = response.getcode()
        body = response.read().decode('utf-8')
        print(f"Status HTTP Supabase: {status}")
        if status in [200, 201, 204]:
            print("Supabase berhasil diupdate!")
            print("Response:", body)
        else:
            print(f"Gagal update Supabase. Response: {body}")
except urllib.error.HTTPError as e:
    print(f"HTTPError: {e.code} - {e.reason}")
    print("Response:", e.read().decode('utf-8'))
except Exception as e:
    print(f"Error request ke Supabase: {e}")

# 3. Jalankan script node untuk update instruksi AI
print("Menjalankan script node untuk regenerasi instruksi parser...")
try:
    # Jalankan generate_md_db_context.js
    res1 = subprocess.run(["node", "/Users/notslimboy/Documents/Cashier Web Apps/scratch/generate_md_db_context.js"], capture_output=True, text=True)
    print("generate_md_db_context output:", res1.stdout)
    if res1.stderr:
        print("generate_md_db_context error:", res1.stderr)
        
    # Jalankan update_parser_instructions.js
    res2 = subprocess.run(["node", "/Users/notslimboy/Documents/Cashier Web Apps/scratch/update_parser_instructions.js"], capture_output=True, text=True)
    print("update_parser_instructions output:", res2.stdout)
    if res2.stderr:
        print("update_parser_instructions error:", res2.stderr)
except Exception as e:
    print(f"Gagal menjalankan node scripts: {e}")
