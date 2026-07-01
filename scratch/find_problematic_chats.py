import re
from datetime import datetime
from parse_june26 import load_database, extract_chats, match_customer, parse_message_orders

db = load_database('/Users/notslimboy/Documents/Cashier Web Apps/instruksi_ai_parser.md')
chat1_path = '/Users/notslimboy/Documents/Cashier Web Apps/_chat.txt'
chat2_path = '/Users/notslimboy/Documents/Cashier Web Apps/_chat 2.txt'

def extract_all_chats(filepath):
    extracted = []
    current_msg = None
    timestamp_regex = re.compile(r'^\[(\d{2})/(\d{2})/(\d{2}),\s+(\d{2})[.:](\d{2})[.:](\d{2})\]\s+(.*?)$')
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            line_clean = line.replace('\u200e', '').replace('\u200f', '').strip()
            match = timestamp_regex.match(line_clean)
            if match:
                if current_msg:
                    extracted.append(current_msg)
                day, month, year_short, hour, minute, second, rest = match.groups()
                year = 2000 + int(year_short)
                try:
                    dt = datetime(year, int(month), int(day), int(hour), int(minute), int(second))
                except ValueError:
                    dt = datetime.min
                parts = rest.split(':', 1)
                sender = parts[0].strip() if len(parts) == 2 else ""
                text = parts[1].strip() if len(parts) == 2 else rest.strip()
                current_msg = {
                    'datetime': dt,
                    'chatDate': f"{day}/{month}/{year} {hour}.{minute}.{second}",
                    'sender': sender,
                    'text': text
                }
            else:
                if current_msg:
                    current_msg['text'] += "\n" + line_clean
        if current_msg:
            extracted.append(current_msg)
    return extracted

chats = extract_all_chats(chat1_path) + extract_all_chats(chat2_path)
chats.sort(key=lambda x: x['datetime'])

# Batas waktu target
start_time = datetime(2026, 6, 25, 18, 31, 0)
end_time = datetime(2026, 6, 26, 12, 0, 0)

target_keywords = ["villa royal", "bpd b 23", "bpd b/23", "bpd b 23", "nenet", "p3 no 32", "puri asri"]

print("=== MENCARI CHAT YANG BERADA DI TARGET TIME RANGE (25 JUN 18:31 s.d. 26 JUN 12:00) ===")
found_any = False
for msg in chats:
    if start_time <= msg['datetime'] <= end_time:
        sender = msg['sender']
        text = msg['text']
        items, address_lines, delivery_note = parse_message_orders(text)
        matched_cust = match_customer(sender, address_lines, db)
        matched_name = matched_cust['name'] if matched_cust else None
        
        is_matched = False
        if matched_name and any(kw in matched_name.lower() for kw in ["villa royal", "bpd b 23", "nenet"]):
            is_matched = True
        for kw in target_keywords:
            if kw in sender.lower() or kw in text.lower():
                is_matched = True
                
        if is_matched:
            found_any = True
            print(f"DATETIME: {msg['chatDate']}")
            print(f"SENDER: {sender}")
            print(f"MATCHED CUSTOMER: {matched_name}")
            print(f"TEXT:\n{text}")
            print(f"PARSED ITEMS: {items}")
            print("-" * 50)

if not found_any:
    print("Tidak ditemukan chat dari customer bermasalah di dalam range target waktu!")

print("\n=== MENCARI CHAT DI LUAR TARGET RANGE (26 JUN > 12:00 ATAU SEBELUMNYA) ===")
# Cetak 10 chat terbaru yang mengandung keyword
count = 0
for msg in reversed(chats):
    if msg['datetime'] > end_time or msg['datetime'] < start_time:
        sender = msg['sender']
        text = msg['text']
        
        is_target = False
        for kw in target_keywords:
            if kw in sender.lower() or kw in text.lower():
                is_target = True
                break
        
        if is_target:
            print(f"DATETIME: {msg['chatDate']}")
            print(f"SENDER: {sender}")
            print(f"TEXT:\n{text}")
            print("-" * 50)
            count += 1
            if count >= 10:
                break
