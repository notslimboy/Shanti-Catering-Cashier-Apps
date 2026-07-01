import re

chat1_path = '/Users/notslimboy/Documents/Cashier Web Apps/_chat.txt'
chat2_path = '/Users/notslimboy/Documents/Cashier Web Apps/_chat 2.txt'

def search_all_chats(filepath, query):
    results = []
    current_msg = None
    timestamp_regex = re.compile(r'^\[(\d{2})/(\d{2})/(\d{2}),\s+(\d{2})[.:](\d{2})[.:](\d{2})\]\s+(.*?)$')
    
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            match = timestamp_regex.match(line)
            if match:
                if current_msg:
                    if query.lower() in current_msg['text'].lower() or query.lower() in current_msg['sender'].lower():
                        results.append(current_msg)
                day, month, year_short, hour, minute, second, rest = match.groups()
                parts = rest.split(':', 1)
                sender = parts[0].strip() if len(parts) == 2 else ""
                text = parts[1].strip() if len(parts) == 2 else rest.strip()
                current_msg = {
                    'chatDate': f"{day}/{month}/{2000+int(year_short)} {hour}.{minute}.{second}",
                    'sender': sender,
                    'text': text
                }
            else:
                if current_msg:
                    current_msg['text'] += "\n" + line
        if current_msg:
            if query.lower() in current_msg['text'].lower() or query.lower() in current_msg['sender'].lower():
                results.append(current_msg)
    return results

print("Mencari 'keputih' di semua chat...")
all_results = search_all_chats(chat1_path, 'keputih') + search_all_chats(chat2_path, 'keputih')
for r in all_results[:30]:  # Batasi 30 agar tidak kepanjangan
    print(f"DATE: {r['chatDate']} | SENDER: {r['sender']}")
    print(f"TEXT: {repr(r['text'])}")
    print("-" * 50)
