import re
import csv
from datetime import datetime

# Today's menu items
menu_items = {
    'Sop Iga': 35000,
    'Nila Bakar / 2': 25000,
    'Sayap Chili Padi / 3': 25000,
    'Oseng Kangkung': 15000,
    'Oseng Tahu Tempe': 15000,
    'Perkedel': 15000,
    'Tahu Campur': 25000,
    'Klepon Ubi': 4000
}

# Load database mappings from instruksi_ai_parser.md
db = []
with open('instruksi_ai_parser.md', 'r', encoding='utf-8') as f:
    for line in f:
        # Match lines like "- **Customer Name** (Match terms: [...]) | Ongkir: X"
        m = re.match(r'^\s*-\s*\*\*(.*?)\*\*\s*\((?:Match terms|match terms):\s*\[(.*?)\]\)\s*\|\s*Ongkir:\s*(\d+)', line)
        if m:
            name, terms_str, ongkir = m.groups()
            # Parse terms
            terms = [t.strip().strip('"').strip("'") for t in terms_str.split(',')]
            db.append({'name': name, 'terms': terms, 'ongkir': int(ongkir)})

def match_customer(sender, text):
    text_clean = text.lower()
    sender_clean = sender.lower()

    # Check terms
    for entry in db:
        for term in entry['terms']:
            term_clean = term.lower()
            if term_clean in text_clean or term_clean in sender_clean:
                return entry

    # Manual overrides/checks
    if 'sut teng vi gg 11' in text_clean or 'bu edi' in text_clean or 'bu edi' in sender_clean:
        return {'name': 'Anak Bu Edi Baru - Sut teng VI gg 11', 'ongkir': 0}
    if 'h 18' in text_clean or 'h - 18' in sender_clean or 'h 18' in sender_clean:
        return {'name': 'H - 18', 'ongkir': 0}
    if 'sutorejo timur 32/h5' in text_clean or 'sut tmr 32/h5' in text_clean:
        return {'name': 'sutorejo timur 32/H5', 'ongkir': 0}
    if 't8 lm' in text_clean or 't 8 lama' in sender_clean:
        return {'name': 'ITS T 8 LAMA', 'ongkir': 5000}
    if 'x 26' in sender_clean or 'x 26' in text_clean:
        return {'name': 'X 26', 'ongkir': 0}
    if 'tmu 20' in text_clean or 'taman mulyo utara 20' in text_clean or 'taman mulyo utara 20' in sender_clean:
        return {'name': 'Taman Mulyo Utara 20', 'ongkir': 0}

    return None

# Parse chat messages from July 1 18:35 to July 2 12:00
chat1_path = '_chat.txt'
chat2_path = '_chat 2.txt'

start_time = datetime(2026, 7, 1, 18, 35, 0)
end_time = datetime(2026, 7, 2, 12, 0, 0)
timestamp_regex = re.compile(r'^\[(\d{2})/(\d{2})/(\d{2}),\s+(\d{2})[.:](\d{2})[.:](\d{2})\]\s+(.*?)$')

def clean_control_chars(text):
    return text.replace('\u200e', '').replace('\u200f', '').strip()

def scan_chats():
    results = []
    for filepath, name in [(chat1_path, '_chat.txt'), (chat2_path, '_chat 2.txt')]:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            curr = None
            for idx, line in enumerate(f):
                line = clean_control_chars(line)
                m = timestamp_regex.match(line)
                if m:
                    if curr and start_time <= curr['dt'] <= end_time:
                        results.append(curr)
                    day, month, year_short, hour, minute, second, rest = m.groups()
                    dt = datetime(2000 + int(year_short), int(month), int(day), int(hour), int(minute), int(second))
                    parts = rest.split(':', 1)
                    sender = parts[0].strip() if len(parts) == 2 else ''
                    text = parts[1].strip() if len(parts) == 2 else rest.strip()
                    curr = {
                        'dt': dt,
                        'file': name,
                        'line_num': idx + 1,
                        'time': f"{day}/{month}/{2000+int(year_short)} {hour}.{minute}.{second}",
                        'sender': sender,
                        'text': text
                    }
                else:
                    if curr:
                        curr['text'] += '\n' + line
            if curr and start_time <= curr['dt'] <= end_time:
                results.append(curr)
    return results

chats = scan_chats()
chats.sort(key=lambda x: x['dt'])

# We'll map each chat to customer and parse items
# Let's map items
menu_patterns = {
    'Sop Iga': [r'sop\s*iga', r'sup\s*iga', r'sop\b'],
    'Nila Bakar / 2': [r'nila\s*bakar', r'nila\s*bkr', r'nila\b'],
    'Sayap Chili Padi / 3': [r'sayap\s*chili\s*padi', r'chili\s*padi', r'chili\b', r'ayam\s*chili\s*padi'],
    'Oseng Kangkung': [r'oseng\s*kangkung', r'kangkung', r'kakung'],
    'Oseng Tahu Tempe': [r'oseng\s*tahu\s*tempe', r'oseng\s*tahu', r'oseng\s*tatem', r'tempetahu', r'tahu\s*tempe'],
    'Perkedel': [r'perkedel', r'pergedel'],
    'Tahu Campur': [r'tahu\s*campur'],
    'Klepon Ubi': [r'klepon', r'klepon\s*ubi']
}

def parse_items(text):
    lines = text.split('\n')
    items_found = []
    for line in lines:
        line_lower = line.lower()
        # Find quantity
        qty_match = re.search(r'(\d+(?:\./\d+)?|\d+/\d+|\b\d+\b)', line_lower)
        qty = 1
        if qty_match:
            qty_str = qty_match.group(1)
            if '1/2' in qty_str or '0.5' in qty_str:
                qty = 0.5
            else:
                try:
                    qty = int(qty_str)
                except ValueError:
                    qty = 1

        # Check half portions in name
        is_half = '1/2' in line_lower or 'setengah' in line_lower or 'separuh' in line_lower or 'kangkung 1/2' in line_lower

        # Match menu items
        matched_item = None
        for item, patterns in menu_patterns.items():
            for pat in patterns:
                if re.search(pat, line_lower):
                    matched_item = item
                    break
            if matched_item:
                break

        if matched_item:
            # Check if this is a half portion
            if is_half:
                matched_item += ' 1/2'
                qty = 1  # 1 portion of half-size
            items_found.append({'item': matched_item, 'qty': qty, 'line': line})
    return items_found

# Process orders
final_rows = []
for c in chats:
    sender = c['sender']
    text = c['text']

    if sender in ['Shanti Catering', 'Elok'] or 'stiker tidak disertakan' in text.lower():
        continue
    if 'pesan ini dihapus' in text.lower() or '—————' in text:
        continue
    if 'transfer' in text.lower():
        continue

    cust = match_customer(sender, text)
    cust_name = cust['name'] if cust else sender
    ongkir = cust['ongkir'] if cust else 0

    parsed = parse_items(text)
    if parsed:
        for p in parsed:
            # Check note
            note = ''
            if 'tidak pake perkedel' in p['line'].lower() or 'tanpa' in p['line'].lower():
                note = 'tidak pakai perkedel singkong'
            elif 'tdk pedas' in p['line'].lower() or 'pisah' in p['line'].lower():
                note = 'tidak pedas dipisah, kuah banyak'
            elif 'kuah bnyk' in p['line'].lower() or 'kuah banyak' in p['line'].lower():
                note = 'kuah banyak'
            elif 'dada' in p['line'].lower():
                note = 'dada'
            elif 'paha' in p['line'].lower():
                note = 'paha'

            final_rows.append({
                'customer': cust_name,
                'chatDate': c['time'],
                'payment': '',
                'ongkir': str(ongkir),
                'item': p['item'],
                'quantity': str(p['qty']),
                'note': note
            })

# Let's print out the results
for idx, r in enumerate(final_rows):
    print(f"{idx}: {r}")
