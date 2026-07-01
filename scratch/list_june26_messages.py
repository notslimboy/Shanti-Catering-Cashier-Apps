import re

chat1_path = '/Users/notslimboy/Documents/Cashier Web Apps/_chat.txt'
chat2_path = '/Users/notslimboy/Documents/Cashier Web Apps/_chat 2.txt'

def list_june26(filepath, filename):
    # Regex matching [DD/MM/YY, HH.MM.SS] or [DD/MM/YYYY, HH.MM.SS]
    # In _chat 2.txt, the date format is [20/06/26, 07.21.39] (YY is 2 digits)
    # In _chat.txt, the date format is [03/09/20, 12.03.49] (YY is 2 digits)
    # Let's write a flexible regex:
    timestamp_regex = re.compile(r'^\[(\d{2})/(\d{2})/(\d{2,4}),\s+(\d{2})[.:](\d{2})[.:](\d{2})\]\s+(.*?)$')
    current_msg = None
    messages = []
    
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            line_clean = line.replace('\u200e', '').replace('\u200f', '').strip()
            match = timestamp_regex.match(line_clean)
            if match:
                if current_msg:
                    messages.append(current_msg)
                day, month, year, hour, minute, second, rest = match.groups()
                year_val = int(year)
                if year_val < 100:
                    year_val += 2000
                parts = rest.split(':', 1)
                sender = parts[0].strip() if len(parts) == 2 else ""
                text = parts[1].strip() if len(parts) == 2 else rest.strip()
                current_msg = {
                    'chatDate': f"{day}/{month}/{year_val} {hour}.{minute}.{second}",
                    'sender': sender,
                    'text': text,
                    'raw_date': (year_val, int(month), int(day), int(hour), int(minute), int(second))
                }
            else:
                if current_msg:
                    current_msg['text'] += "\n" + line_clean
        if current_msg:
            messages.append(current_msg)

    print(f"=== {filename} JUNE 26 MESSAGES ===")
    count = 0
    for msg in messages:
        yr, mo, dy, hr, mn, sc = msg['raw_date']
        if yr == 2026 and mo == 6 and dy == 26:
            print(f"[{msg['chatDate']}] {msg['sender']}: {msg['text']}")
            print("-" * 50)
            count += 1
    print(f"Total June 26 messages in {filename}: {count}")

list_june26(chat1_path, "_chat.txt")
list_june26(chat2_path, "_chat 2.txt")
