import re
from datetime import datetime
from parse_june26 import load_database, extract_chats, match_customer, parse_message_orders

db = load_database('/Users/notslimboy/Documents/Cashier Web Apps/instruksi_ai_parser.md')
chat1_path = '/Users/notslimboy/Documents/Cashier Web Apps/_chat.txt'
chat2_path = '/Users/notslimboy/Documents/Cashier Web Apps/_chat 2.txt'

chats = extract_chats(chat1_path, '_chat.txt') + extract_chats(chat2_path, '_chat 2.txt')
chats.sort(key=lambda x: x['datetime'])

print("Mencari chat yang cocok dengan Bumi Galaxy Permai M3 / 17...")
for msg in chats:
    sender = msg['sender']
    text_lower = msg['text'].lower()
    
    if sender in ['Shanti Catering', 'Elok', 'Lilik Sakun', 'Syifa']:
        continue
        
    items, address_lines, delivery_note = parse_message_orders(msg['text'])
    if not items and not address_lines and not delivery_note:
        continue
        
    matched_cust = match_customer(sender, address_lines, db)
    if matched_cust and "Bumi Galaxy" in matched_cust['name']:
        print(f"SENDER: {sender}")
        print(f"DATETIME: {msg['chatDate']}")
        print(f"TEXT:\n{msg['text']}")
        print(f"ITEMS: {items}")
        print(f"ADDRESS: {address_lines}")
        print(f"DELIVERY NOTE: {delivery_note}")
        print("-" * 50)
