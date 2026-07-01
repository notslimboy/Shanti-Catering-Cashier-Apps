import re
from datetime import datetime
from parse_june26 import load_database, extract_chats

chat1_path = '/Users/notslimboy/Documents/Cashier Web Apps/_chat.txt'
chat2_path = '/Users/notslimboy/Documents/Cashier Web Apps/_chat 2.txt'

chats = extract_chats(chat1_path, '_chat.txt') + extract_chats(chat2_path, '_chat 2.txt')
chats.sort(key=lambda x: x['datetime'])

print("Semua pesan dari SMA 5 .. ratna juli:")
for msg in chats:
    if "ratna juli" in msg['sender'].lower():
        print(f"DATETIME: {msg['chatDate']} | SENDER: {msg['sender']}")
        print(f"TEXT: {repr(msg['text'])}")
        print("-" * 50)
