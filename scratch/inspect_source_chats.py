import re

timestamps = ["25/06/2026 19.47.52", "25/06/2026 20.13.09", "25/06/2026 20.14.56", "25/06/2026 22.24.14", "26/06/2026 06.58.10"]

chat1_path = '/Users/notslimboy/Documents/Cashier Web Apps/_chat.txt'
chat2_path = '/Users/notslimboy/Documents/Cashier Web Apps/_chat 2.txt'

def inspect_chat_for_timestamps(filepath, name):
    timestamp_regex = re.compile(r'^\[(\d{2})/(\d{2})/(\d{2}),\s+(\d{2})[.:](\d{2})[.:](\d{2})\]\s+(.*?)$')
    current_msg = None
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            line_clean = line.replace('\u200e', '').replace('\u200f', '').strip()
            match = timestamp_regex.match(line_clean)
            if match:
                if current_msg:
                    # check if current_msg matches any timestamp
                    for ts in timestamps:
                        if ts in current_msg['chatDate']:
                            print(f"FILE: {name}")
                            print(f"DATETIME: {current_msg['chatDate']}")
                            print(f"SENDER: {current_msg['sender']}")
                            print(f"TEXT:\n{current_msg['text']}")
                            print("-" * 60)
                day, month, year_short, hour, minute, second, rest = match.groups()
                year = 2000 + int(year_short)
                parts = rest.split(':', 1)
                sender = parts[0].strip() if len(parts) == 2 else ""
                text = parts[1].strip() if len(parts) == 2 else rest.strip()
                current_msg = {
                    'chatDate': f"{day}/{month}/{year} {hour}.{minute}.{second}",
                    'sender': sender,
                    'text': text
                }
            else:
                if current_msg:
                    current_msg['text'] += "\n" + line_clean
        if current_msg:
            for ts in timestamps:
                if ts in current_msg['chatDate']:
                    print(f"FILE: {name}")
                    print(f"DATETIME: {current_msg['chatDate']}")
                    print(f"SENDER: {current_msg['sender']}")
                    print(f"TEXT:\n{current_msg['text']}")
                    print("-" * 60)

inspect_chat_for_timestamps(chat1_path, "_chat.txt")
inspect_chat_for_timestamps(chat2_path, "_chat 2.txt")
