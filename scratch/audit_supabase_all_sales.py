import json
import urllib.request
from datetime import datetime

SUPABASE_URL = 'https://ddfalsclevkqhiyojngx.supabase.co'
SUPABASE_KEY = 'sb_publishable_Ve_QZUvSQgQSE9_LcEAHmw_WLaQDSrP'

def fetch_supabase(path):
    req = urllib.request.Request(
        f"{SUPABASE_URL}{path}",
        headers={
            'apikey': SUPABASE_KEY,
            'Authorization': f'Bearer {SUPABASE_KEY}'
        }
    )
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read().decode('utf-8'))

sales = fetch_supabase('/rest/v1/sales?select=*&created_at=gte.2026-06-30T00:00:00Z')
items = fetch_supabase('/rest/v1/sale_items?select=*')

sale_ids = {s['id'] for s in sales}
june30_items = [item for item in items if item['sale_id'] in sale_ids]

target_items = [item for item in june30_items if 'Klapertart' in item['name'] or 'Lemper' in item['name']]
target_sales = [s for s in sales if any(ti['sale_id'] == s['id'] for ti in target_items)]

# Print each target sale with its items
for s in target_sales:
    s_items = [ti for ti in target_items if ti['sale_id'] == s['id']]
    print(f"Sale ID: {s['id']} | Customer: {s['customer_name']} | Subtotal: {s['subtotal']} | Total: {s['total']}")
    for item in s_items:
        print(f"  - {item['name']}: qty {item['quantity']}, price {item['price']}, total {item['line_total']}, note: {item['note']}")
