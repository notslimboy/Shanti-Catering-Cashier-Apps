import re
import csv
from datetime import datetime
from parse_june26 import load_database, extract_chats, match_customer, parse_message_orders

db = load_database('/Users/notslimboy/Documents/Cashier Web Apps/instruksi_ai_parser.md')
chat1_path = '/Users/notslimboy/Documents/Cashier Web Apps/_chat.txt'
chat2_path = '/Users/notslimboy/Documents/Cashier Web Apps/_chat 2.txt'

# Load all chats in target range
start_time = datetime(2026, 6, 25, 18, 31, 0)
end_time = datetime(2026, 6, 26, 12, 0, 0)

chats = extract_chats(chat1_path, '_chat.txt') + extract_chats(chat2_path, '_chat 2.txt')
chats.sort(key=lambda x: x['datetime'])

# Load generated CSV rows
generated_rows = []
with open('/Users/notslimboy/Documents/Cashier Web Apps/orders-2026-06-26.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for r in reader:
        generated_rows.append(r)

print(f"Total messages extracted: {len(chats)}")
print(f"Total rows in generated CSV: {len(generated_rows)}")
print("=" * 80)

# We will group generated rows by customer for easy lookup
csv_by_customer = {}
for r in generated_rows:
    cust = r['customer']
    if cust not in csv_by_customer:
        csv_by_customer[cust] = []
    csv_by_customer[cust].append(r)

# Audit each chat
for i, msg in enumerate(chats):
    sender = msg['sender']
    text = msg['text']
    text_lower = text.lower()
    
    # Ignore admin messages
    if sender in ['Shanti Catering', 'Elok', 'Lilik Sakun', 'Syifa'] or 'stiker tidak disertakan' in text_lower or 'gambar tidak disertakan' in text_lower or 'pesan ini dihapus' in text_lower or text.strip() in ['—————', '——————', '——————-', '————-']:
        # But wait! If it's a message containing text + stiker/gambar, it shouldn't be skipped entirely.
        # Let's check if there are actual order items in it
        items, address_lines, delivery_note = parse_message_orders(text)
        if not items and not address_lines and not delivery_note:
            continue
            
    items, address_lines, delivery_note = parse_message_orders(text)
    is_cancel_msg = any(cw in text_lower for cw in ['batal', 'cancel', 'gak jadi', 'g jadi', 'g jd', 'gk jd', 'tidak jadi', 'gak jd', 'ga jadi', 'ga jd', 'dibatalkan', 'batalkan'])
    
    if not items and not address_lines and not delivery_note and not is_cancel_msg:
        continue
        
    matched_cust = match_customer(sender, address_lines, db)
    cust_display_name = matched_cust['name'] if matched_cust else sender
    
    print(f"\nAudit [{i+1}] | Time: {msg['chatDate']} | Sender: {sender} | Matched DB: {matched_cust['name'] if matched_cust else 'NEW CUSTOMER'}")
    print(f"Chat Text:\n{text.strip()}")
    print(f"Parsed Items: {items}")
    print(f"Parsed Address: {address_lines} | Delivery Note: {delivery_note} | Cancel: {is_cancel_msg}")
    
    # Let's look up this customer's rows in our generated CSV
    # Since customer names in CSV might be the matched DB name or clean sender-address combination
    matched_rows = []
    if matched_cust:
        matched_rows = csv_by_customer.get(matched_cust['name'], [])
    else:
        # Find rows where customer contains sender name
        for c_name, rows in csv_by_customer.items():
            if sender in c_name:
                matched_rows = rows
                break
                
    print("CSV Rows for this customer:")
    if matched_rows:
        for mr in matched_rows:
            print(f"  -> Item: {mr['item']} | Qty: {mr['quantity']} | Ongkir: {mr['ongkir']} | Note: {mr['note']}")
    else:
        print("  -> (No rows found in CSV - Cancelled or skipped?)")
    print("-" * 80)
