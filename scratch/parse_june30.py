import re
import csv
from datetime import datetime

# Menu hari ini (30 Juni 2026)
TODAY_MENU = [
    "Asem Asem Daging",
    "Ayam Goreng Laos / 3",
    "Otak Otak / 1",
    "Tahu Tempe Bacem",
    "Dadar Jagung",
    "Botok Telor Asin",
    "Gado Gado",
    "Singkong Thailand",
    "Klapertart",
    "Lemper Bakar"
]

# Pemetaan kata kunci ke menu resmi (termasuk penambahan varian typo/singkatan)
MENU_KEYWORDS = {
    "Asem Asem Daging": ["asem asem daging", "asem2 daging", "asem daging", "asem-asem daging"],
    "Ayam Goreng Laos / 3": ["ayam goreng laos / 3", "ayam goreng laos", "ayam laos", "ayam gr laos", "ayam grg laos", "ayam"],
    "Otak Otak / 1": ["otak otak / 1", "otak otak", "otak-otak", "otak\"", "otak2", "otak"],
    "Tahu Tempe Bacem": ["tahu tempe bacem", "tatem bacem", "tahutempebacem", "bacem"],
    "Dadar Jagung": ["dadar jagung", "dadas jagung"],
    "Botok Telor Asin": ["botok telur asin", "botok telor asin", "botok telor", "botok telur", "botok", "botol telur asin", "botol telor asin", "botol telur", "botol telor", "botol"],
    "Gado Gado": ["gado gado", "gado-gado", "gado2", "gado\"", "gadogado"],
    "Singkong Thailand": ["singkong thailand", "singkong thai", "singkong", "pohong"],
    "Klapertart": ["klapertart", "klappertaart", "klapert tart"],
    "Lemper Bakar": ["lemper bakar", "lemper"]
}

# Jam target (29 Juni 19:04 s.d. 30 Juni 12:00 siang)
start_time = datetime(2026, 6, 29, 19, 4, 0)
end_time = datetime(2026, 6, 30, 12, 0, 0)

# Jam mulai perhitungan limit stok Klapertart & Lemper
stock_limit_start = datetime(2026, 6, 30, 8, 8, 0)

timestamp_regex = re.compile(r'^\[(\d{2})/(\d{2})/(\d{2}),\s+(\d{2})[.:](\d{2})[.:](\d{2})\]\s+(.*?)$')

def clean_control_chars(text):
    return text.replace('\u200e', '').replace('\u200f', '').strip()

def clean_str(s):
    if not s:
        return ""
    return re.sub(r'[^a-z0-9]', '', s.lower())

def is_duplicate_address(sender, addr):
    s_clean = clean_str(sender)
    a_clean = clean_str(addr)
    if not a_clean or not s_clean:
        return True
    if a_clean in s_clean or s_clean in a_clean:
        return True
    return False

def load_database(filepath):
    db_pattern = re.compile(r'- \*\*([^*]+)\*\* \(Match terms: \[(.*?)\]\) \| Ongkir: (\d+)')
    database = []
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            for line in f:
                match = db_pattern.search(line)
                if match:
                    name, terms_raw, ongkir = match.groups()
                    terms = [t.strip('\" ') for t in terms_raw.split(',')]
                    database.append({
                        'name': name.strip(),
                        'terms': terms,
                        'ongkir': int(ongkir)
                     })
    except Exception as e:
        print(f"Warning: Failed to load database from {filepath}: {e}")
    return database

def get_tokens(s):
    tokens = re.findall(r'[a-z0-9]+', str(s).lower())
    skip_words = {'bu', 'pak', 'ibu', 'blok', 'no', 'no.', 'yg', 'yang', 'di', 'ke', 'dari', 'dan', 'sama', 'pesan', 'pesen', 'mau', 'saya', 'sy'}
    return [t for t in tokens if t not in skip_words and len(t) > 0]

def get_numbers(s):
    numbers = set(re.findall(r'\d+', str(s)))
    words = re.findall(r'[a-z]+', str(s).lower())
    roman_map = {'i': '1', 'ii': '2', 'iii': '3', 'iv': '4', 'v': '5', 'vi': '6', 'vii': '7', 'viii': '8', 'ix': '9', 'x': '10'}
    for w in words:
        if w in roman_map:
            numbers.add(roman_map[w])
    return numbers

def match_customer(sender, address_lines, database):
    query_text = sender + " " + " ".join(address_lines)
    q_tokens = get_tokens(query_text)
    if not q_tokens:
        return None
        
    best_match = None
    highest_score = 0
    q_nums = get_numbers(query_text)
    
    for cust in database:
        c_nums = get_numbers(cust['name'])
        for term in cust['terms']:
            c_nums.update(get_numbers(term))
            
        if c_nums:
            if not c_nums.issubset(q_nums):
                continue
                
        c_tokens = set(get_tokens(cust['name']))
        score = 0
        for ct in c_tokens:
            if ct in q_tokens:
                score += 4
            else:
                if len(ct) >= 3:
                    for qt in q_tokens:
                        if ct in qt or qt in ct:
                            score += 1
                            break
                            
        for term in cust['terms']:
            t_tokens = set(get_tokens(term))
            term_score = 0
            for tt in t_tokens:
                if tt in q_tokens:
                    term_score += 4
                else:
                    if len(tt) >= 3:
                        for qt in q_tokens:
                            if tt in qt or qt in tt:
                                term_score += 1
                                break
            score = max(score, term_score)
            
        if score > highest_score:
            highest_score = score
            best_match = cust
            
    if highest_score >= 6:
        return best_match
    return None

def remove_overlapping_occurrences(occurrences):
    occurrences.sort(key=lambda x: x['end'] - x['start'], reverse=True)
    kept = []
    for occ in occurrences:
        overlap = False
        for k in kept:
            if max(occ['start'], k['start']) < min(occ['end'], k['end']):
                overlap = True
                break
        if not overlap:
            kept.append(occ)
    kept.sort(key=lambda x: x['start'])
    return kept

def split_order_items(order_items):
    final_items = []
    for item in order_items:
        note_lower = item['note'].lower()
        qty = item['quantity']
        if qty > 1 and any(p in note_lower for p in ['satu', '1', 'sebagian']):
            clean_note = re.sub(r'\b(yg|yang)?\s*(satu|1|sebagian)\b', '', item['note'], flags=re.IGNORECASE).strip()
            clean_note = re.sub(r'^[\s\.\-\_:,]+|[\s\.\-\_:,]+$', '', clean_note).strip()
            final_items.append({'item': item['item'], 'quantity': 1, 'note': clean_note})
            final_items.append({'item': item['item'], 'quantity': qty - 1, 'note': ''})
        else:
            final_items.append(item)
    return final_items

def parse_line_with_segments(line):
    parts = []
    current = []
    bracket_level = 0
    i = 0
    while i < len(line):
        c = line[i]
        if c == '(':
            bracket_level += 1
        elif c == ')':
            bracket_level -= 1
        
        if bracket_level == 0:
            if c == ',':
                parts.append("".join(current).strip())
                current = []
                i += 1
                continue
            elif line[i:i+5].lower() == ' dan ':
                parts.append("".join(current).strip())
                current = []
                i += 5
                continue
            elif line[i:i+4].lower() == ' sm ':
                parts.append("".join(current).strip())
                current = []
                i += 4
                continue
            elif c == '+':
                parts.append("".join(current).strip())
                current = []
                i += 1
                continue
        current.append(c)
        i += 1
    if current:
        parts.append("".join(current).strip())
        
    parsed_items = []
    address_parts = []
    
    for part in parts:
        if not part.strip():
            continue
        part_lower = part.lower().replace('²', '2')
        
        # Special check untuk tahu tempe bacem w -> Qty 2 (Konfirmasi User)
        if 'tahu tempe bacem w' in part_lower:
            parsed_items.append({'item': 'Tahu Tempe Bacem', 'quantity': 2, 'note': ''})
            continue
            
        occurrences = []
        for menu_name, keywords in MENU_KEYWORDS.items():
            for keyword in keywords:
                pattern = r'(?<![a-zA-Z])' + re.escape(keyword) + r'(?![a-zA-Z])'
                for m in re.finditer(pattern, part_lower):
                    occurrences.append({
                        'menu': menu_name,
                        'keyword': keyword,
                        'start': m.start(),
                        'end': m.end()
                    })
        occurrences = remove_overlapping_occurrences(occurrences)
        
        if occurrences:
            for j, occ in enumerate(occurrences):
                preceding_text = part[:occ['start']]
                succeeding_text = part[occ['end']:]
                
                qty = 1
                qty_match_before = re.findall(r'\b\d+\b', preceding_text)
                if qty_match_before:
                    qty = int(qty_match_before[-1])
                else:
                    qty_match_after = re.findall(r'\b\d+\b', succeeding_text)
                    if qty_match_after:
                        qty = int(qty_match_after[0])
                
                note = preceding_text + " " + succeeding_text
                note = re.sub(r'\b' + str(qty) + r'\b', '', note, count=1)
                note = re.sub(r'[\.\-\_:=,\(\)\+]+', ' ', note).strip()
                note = re.sub(r'\b(porsi|porsy|x|pcs|biji|butir|dan|bh|pax)\b', ' ', note).strip()
                
                polite_words = ['matur nuwun', 'terima kasih', 'ready', 'pesan', 'pesen', 'order', 'halo', 'ok', 'oke', 'maturnuwun', 'mbk', 'mas', 'pak', 'bu', 'dan', 'yg', 'yang', 'mtrnuwun', 'suwun', 'nuwun', 'mks', 'makasih', 'thx', 'thanks', 'tq', 'nuhun', 'atur']
                note_words = re.findall(r'[a-zA-Z0-9]+', note.lower())
                clean_words = [w for w in note_words if w not in polite_words]
                note = ' '.join(clean_words)
                
                is_half = False
                half_patterns = [r'\b1/2\b', r'\bsetengah\b', r'\bseparuh\b', r'\bseparo\b']
                if any(re.search(pat, part_lower) for pat in half_patterns):
                    is_half = True
                
                is_jumbo = False
                jumbo_patterns = [r'\bjumbo\b', r'\bbesar\b', r'\bgede\b']
                if any(re.search(pat, part_lower) for pat in jumbo_patterns):
                    is_jumbo = True
                
                item_name = occ['menu']
                if is_half:
                    item_name = f"{item_name} 1/2"
                    note = f"separuh porsi; {note}" if note else "separuh porsi"
                elif is_jumbo:
                    item_name = f"{item_name} Jumbo"
                    note = f"porsi jumbo; {note}" if note else "porsi jumbo"
                
                parsed_items.append({'item': item_name, 'quantity': qty, 'note': note})
        else:
            address_parts.append(part)
            
    return parsed_items, address_parts

def parse_message_orders(text, sender=""):
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    order_items = []
    address_lines = []
    delivery_note = ''
    
    for line in lines:
        line_clean = line.strip()
        line_clean = re.sub(r'gambar tidak disertakan|stiker tidak disertakan|pesan ini dihapus', '', line_clean, flags=re.IGNORECASE).strip()
        line_lower = line_clean.lower()
        
        if not line_clean:
            continue
            
        if any(w in line_lower for w in ['bismillaah', 'matur nuwun', 'maturnuwun', 'terima kasih', 'terimakasih', 'trims', 'suwun']):
            continue
            
        # Split line by main delimiters
        delims = r'\s*\.\.\.+\s*(?!\s*\d|\s*\.)|\s+-\s+|\t|;|\s+pesan\s*:\s*|\s+pesan\s+|\s+pesen\s*:\s*|\s+pesen\s+|\s+psn\s*:\s*|\s+psn\s+|\s+beli\s*:\s*|\s+beli\s+|\s*:\s*(?!\s*\d)|\b(?:tambah|nambah|plus|tambahin)\b'
        sub_lines = re.split(delims, line_clean, flags=re.IGNORECASE)
        final_sub_lines = [sl.strip() for sl in sub_lines if sl.strip()]
                    
        for sub_line in final_sub_lines:
            # Clean leading list markers
            sub_line = re.sub(r'^\s*(?:\d+\s*[\.\)\-\:]|[\-\•\*\•])\s*', '', sub_line)
            
            # Clean "jadi" or "total" clarifications first
            sub_line = re.sub(r'\b(jadi|total)\s+.*', '', sub_line, flags=re.IGNORECASE)
            
            # Ubah pecahan 1/2 menjadi teks "setengah"
            sub_line = re.sub(r'\b1/2\b', 'setengah', sub_line)
            sub_lower = sub_line.lower()
            
            # Question check first
            is_question = '?' in sub_lower or any(q in sub_lower for q in ['ready', 'readykah', 'adakah', 'apakah', 'kah'])
            if is_question:
                has_number = bool(re.search(r'\b\d+\b', sub_lower))
                if not has_number:
                    continue
            
            # Parse using the robust segment-based parsing
            items, addrs = parse_line_with_segments(sub_line)
            order_items.extend(items)
            
            for addr in addrs:
                is_instruction = any(w in addr.lower() for w in ['antar', 'kirim', 'ambil', 'titip', 'pagar', 'centel', 'pintu', 'gerbang', 'sore', 'pagi', 'siang', 'jam'])
                if is_instruction:
                    if delivery_note:
                        delivery_note += '; ' + addr
                    else:
                        delivery_note = addr
                else:
                    polite_words = ['matur nuwun', 'terima kasih', 'ready', 'pesan', 'pesen', 'order', 'halo', 'ok', 'oke', 'maturnuwun', 'mbk', 'mas', 'pak', 'bu', 'dan', 'yg', 'yang', 'mtrnuwun', 'suwun', 'nuwun', 'mks', 'makasih', 'thx', 'thanks', 'tq', 'nuhun', 'atur']
                    is_purely_polite = all(w in polite_words or len(w) < 2 for w in re.findall(r'[a-zA-Z]+', addr.lower()))
                    if not is_purely_polite and addr:
                        if re.search(r'[a-zA-Z0-9]', addr):
                            address_lines.append(addr)
                            
    return order_items, address_lines, delivery_note

def extract_chats(filepath, source_name):
    extracted = []
    current_msg = None
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            cleaned_line = clean_control_chars(line)
            match = timestamp_regex.match(cleaned_line)
            if match:
                if current_msg:
                    if start_time <= current_msg['datetime'] <= end_time:
                        extracted.append(current_msg)
                day, month, year_short, hour, minute, second, rest = match.groups()
                year = 2000 + int(year_short)
                try:
                    dt = datetime(year, int(month), int(day), int(hour), int(minute), int(second))
                except ValueError:
                    dt = datetime.min
                parts = rest.split(':', 1)
                if len(parts) == 2:
                    sender = parts[0].strip()
                    text = parts[1].strip()
                else:
                    sender = ""
                    text = rest.strip()
                current_msg = {
                    'datetime': dt,
                    'chatDate': f"{day}/{month}/{year} {hour}.{minute}.{second}",
                    'sender': sender,
                    'text': text,
                    'source': source_name
                }
            else:
                if current_msg:
                    current_msg['text'] += "\n" + cleaned_line
        if current_msg:
            if start_time <= current_msg['datetime'] <= end_time:
                extracted.append(current_msg)
    return extracted

if __name__ == '__main__':
    database_file = '/Users/notslimboy/Documents/Cashier Web Apps/instruksi_ai_parser.md'
    db = load_database(database_file)
    print(f"Loaded {len(db)} customer records.")

    chat1_path = '/Users/notslimboy/Documents/Cashier Web Apps/_chat.txt'
    chat2_path = '/Users/notslimboy/Documents/Cashier Web Apps/_chat 2.txt'
    
    chats = extract_chats(chat1_path, '_chat.txt') + extract_chats(chat2_path, '_chat 2.txt')
    chats.sort(key=lambda x: x['datetime'])
    print(f"Extracted {len(chats)} messages.")

    orders_by_sender = {}
    for msg in chats:
        sender = msg['sender']
        text_lower = msg['text'].lower()
        
        if sender in ['Shanti Catering', 'Elok', 'Lilik Sakun', 'Syifa'] or 'pesan ini dihapus' in text_lower or msg['text'].strip() in ['—————', '——————', '——————-', '————-']:
            continue
            
        items, address_lines, delivery_note = parse_message_orders(msg['text'], sender)
        is_cancel_msg = any(cw in text_lower for cw in ['batal', 'cancel', 'gak jadi', 'g jadi', 'g jd', 'gk jd', 'tidak jadi', 'ga jadi', 'ga jd', 'dibatalkan', 'batalkan'])
        
        if not items and not address_lines and not delivery_note and not is_cancel_msg:
            continue
            
        order_info = {
            'sender': sender,
            'chatDate': msg['chatDate'],
            'datetime': msg['datetime'],
            'items': items,
            'address_lines': address_lines,
            'delivery_note': delivery_note,
            'raw_text': msg['text'],
            'is_cancel_msg': is_cancel_msg
        }
        
        if sender not in orders_by_sender:
            orders_by_sender[sender] = []
        orders_by_sender[sender].append(order_info)

    final_consolidated_orders = []
    for sender, msgs in orders_by_sender.items():
        msgs.sort(key=lambda x: x['datetime'])
        current = msgs[0]
        if current['is_cancel_msg'] and not current['items']:
            current['items'] = []
            
        for next_msg in msgs[1:]:
            if next_msg['is_cancel_msg'] and not next_msg['items']:
                current['items'] = []
                current['chatDate'] = next_msg['chatDate']
                current['datetime'] = next_msg['datetime']
                current['address_lines'] = list(set(current['address_lines'] + next_msg['address_lines']))
                if next_msg['delivery_note']:
                    if current['delivery_note']:
                        if next_msg['delivery_note'] not in current['delivery_note']:
                            current['delivery_note'] += "; " + next_msg['delivery_note']
                    else:
                        current['delivery_note'] = next_msg['delivery_note']
                continue

            if not next_msg['items']:
                current['address_lines'] = list(set(current['address_lines'] + next_msg['address_lines']))
                if next_msg['delivery_note']:
                    if current['delivery_note']:
                        if next_msg['delivery_note'] not in current['delivery_note']:
                            current['delivery_note'] += "; " + next_msg['delivery_note']
                    else:
                        current['delivery_note'] = next_msg['delivery_note']
                continue

            # Merge items
            def sort_key(it):
                return (it['item'], it['quantity'], it['note'])
            curr_items_sorted = sorted(current['items'], key=sort_key)
            next_items_sorted = sorted(next_msg['items'], key=sort_key)
            
            items_same = len(curr_items_sorted) == len(next_items_sorted)
            if items_same:
                for it1, it2 in zip(curr_items_sorted, next_items_sorted):
                    if it1['item'] != it2['item'] or it1['quantity'] != it2['quantity'] or it1['note'] != it2['note']:
                        items_same = False
                        break
                        
            has_add_keyword = any(k in next_msg['raw_text'].lower() for k in ["tambah", "nambah", "plus", "tambah lagi", "+"])
            
            if items_same and not has_add_keyword:
                current['chatDate'] = next_msg['chatDate']
                current['datetime'] = next_msg['datetime']
                current['address_lines'] = list(set(current['address_lines'] + next_msg['address_lines']))
                if next_msg['delivery_note']:
                    if current['delivery_note']:
                        if next_msg['delivery_note'] not in current['delivery_note']:
                            current['delivery_note'] += "; " + next_msg['delivery_note']
                    else:
                        current['delivery_note'] = next_msg['delivery_note']
            else:
                merged_items = []
                for it1 in current['items']:
                    merged_items.append(dict(it1))
                for it2 in next_msg['items']:
                    found = False
                    for it1 in merged_items:
                        if it1['item'] == it2['item'] and it1['note'] == it2['note']:
                            it1['quantity'] += it2['quantity']
                            found = True
                            break
                    if not found:
                        merged_items.append(dict(it2))
                current['items'] = merged_items
                current['chatDate'] = next_msg['chatDate']
                current['datetime'] = next_msg['datetime']
                current['address_lines'] = list(set(current['address_lines'] + next_msg['address_lines']))
                if next_msg['delivery_note']:
                    if current['delivery_note']:
                        if next_msg['delivery_note'] not in current['delivery_note']:
                            current['delivery_note'] += "; " + next_msg['delivery_note']
                    else:
                        current['delivery_note'] = next_msg['delivery_note']

        current['items'] = split_order_items(current['items'])
        if current['items']:
            final_consolidated_orders.append(current)

    manual_additions = [
        {
            'sender': 'Tohir 17',
            'chatDate': '30/06/2026 09.15.00',
            'datetime': datetime(2026, 6, 30, 9, 15, 0),
            'items': [
                {'item': 'Dadar Jagung', 'quantity': 1, 'note': ''},
                {'item': 'Botok Telor Asin', 'quantity': 5, 'note': ''},
                {'item': 'Asem Asem Daging', 'quantity': 1, 'note': ''}
            ],
            'address_lines': [],
            'delivery_note': '',
            'raw_text': '',
            'is_cancel_msg': False
        },
        {
            'sender': 'Bhaskara v/56',
            'chatDate': '30/06/2026 09.16.00',
            'datetime': datetime(2026, 6, 30, 9, 16, 0),
            'items': [
                {'item': 'Asem Asem Daging', 'quantity': 1, 'note': 'tanpa buncis'}
            ],
            'address_lines': [],
            'delivery_note': '',
            'raw_text': '',
            'is_cancel_msg': False
        },
        {
            'sender': 'ITS U196',
            'chatDate': '30/06/2026 09.17.00',
            'datetime': datetime(2026, 6, 30, 9, 17, 0),
            'items': [
                {'item': 'Singkong Thailand', 'quantity': 3, 'note': ''},
                {'item': 'Tahu Tempe Bacem', 'quantity': 1, 'note': ''}
            ],
            'address_lines': [],
            'delivery_note': '',
            'raw_text': '',
            'is_cancel_msg': False
        },
        {
            'sender': 'Tuwowo Rejo 2 no 8',
            'chatDate': '30/06/2026 09.18.00',
            'datetime': datetime(2026, 6, 30, 9, 18, 0),
            'items': [
                {'item': 'Asem Asem Daging', 'quantity': 1, 'note': ''},
                {'item': 'Tahu Tempe Bacem', 'quantity': 3, 'note': ''},
                {'item': 'Botok Telor Asin', 'quantity': 3, 'note': ''},
                {'item': 'Dadar Jagung', 'quantity': 3, 'note': ''},
                {'item': 'Singkong Thailand', 'quantity': 3, 'note': ''}
            ],
            'address_lines': [],
            'delivery_note': '',
            'raw_text': '',
            'is_cancel_msg': False
        },
        {
            'sender': 'Mulyo Utara 2 / 69',
            'chatDate': '30/06/2026 09.19.00',
            'datetime': datetime(2026, 6, 30, 9, 19, 0),
            'items': [
                {'item': 'Ayam Goreng Laos / 3', 'quantity': 1, 'note': 'dada'},
                {'item': 'Gado Gado', 'quantity': 1, 'note': ''},
                {'item': 'Singkong Thailand', 'quantity': 1, 'note': ''}
            ],
            'address_lines': [],
            'delivery_note': '',
            'raw_text': '',
            'is_cancel_msg': False
        },
        {
            'sender': 'Jojoran 1 Blok B / 19',
            'chatDate': '30/06/2026 09.20.00',
            'datetime': datetime(2026, 6, 30, 9, 20, 0),
            'items': [
                {'item': 'Singkong Thailand', 'quantity': 2, 'note': ''},
                {'item': 'Dadar Jagung', 'quantity': 3, 'note': ''},
                {'item': 'Ayam Goreng Laos / 3', 'quantity': 3, 'note': ''}
            ],
            'address_lines': [],
            'delivery_note': '',
            'raw_text': '',
            'is_cancel_msg': False
        },
        {
            'sender': 'Tohir 9',
            'chatDate': '30/06/2026 09.21.00',
            'datetime': datetime(2026, 6, 30, 9, 21, 0),
            'items': [
                {'item': 'Ayam Goreng Laos / 3', 'quantity': 1, 'note': ''},
                {'item': 'Otak Otak / 1', 'quantity': 2, 'note': ''},
                {'item': 'Botok Telor Asin', 'quantity': 2, 'note': ''}
            ],
            'address_lines': [],
            'delivery_note': '',
            'raw_text': '',
            'is_cancel_msg': False
        },
        {
            'sender': 'ITS T85',
            'chatDate': '30/06/2026 09.22.00',
            'datetime': datetime(2026, 6, 30, 9, 22, 0),
            'items': [
                {'item': 'Gado Gado', 'quantity': 2, 'note': ''},
                {'item': 'Otak Otak / 1', 'quantity': 1, 'note': ''},
                {'item': 'Ayam Goreng Laos / 3', 'quantity': 1, 'note': ''},
                {'item': 'Singkong Thailand', 'quantity': 2, 'note': ''}
            ],
            'address_lines': [],
            'delivery_note': '',
            'raw_text': '',
            'is_cancel_msg': False
        },
        {
            'sender': 'Samlangyu 23',
            'chatDate': '30/06/2026 09.23.00',
            'datetime': datetime(2026, 6, 30, 9, 23, 0),
            'items': [
                {'item': 'Botok Telor Asin', 'quantity': 5, 'note': ''}
            ],
            'address_lines': [],
            'delivery_note': '',
            'raw_text': '',
            'is_cancel_msg': False
        },
        {
            'sender': 'Anis BTH',
            'chatDate': '30/06/2026 09.24.00',
            'datetime': datetime(2026, 6, 30, 9, 24, 0),
            'items': [
                {'item': 'Botok Telor Asin', 'quantity': 6, 'note': ''},
                {'item': 'Tahu Tempe Bacem', 'quantity': 2, 'note': ''},
                {'item': 'Singkong Thailand', 'quantity': 2, 'note': ''}
            ],
            'address_lines': ['kirim ke BRIN sebelah gedung nasdec'],
            'delivery_note': '',
            'raw_text': '',
            'is_cancel_msg': False
        },
        {
            'sender': 'Klampis Semolo Timur 7 A-1',
            'chatDate': '30/06/2026 09.25.00',
            'datetime': datetime(2026, 6, 30, 9, 25, 0),
            'items': [
                {'item': 'Asem Asem Daging', 'quantity': 1, 'note': ''},
                {'item': 'Ayam Goreng Laos / 3', 'quantity': 1, 'note': ''},
                {'item': 'Otak Otak / 1', 'quantity': 1, 'note': ''}
            ],
            'address_lines': [],
            'delivery_note': '',
            'raw_text': '',
            'is_cancel_msg': False
        },
        {
            'sender': 'j41',
            'chatDate': '30/06/2026 08.16.00',
            'datetime': datetime(2026, 6, 30, 8, 16, 0),
            'items': [
                {'item': 'Lemper Bakar', 'quantity': 4, 'note': ''},
                {'item': 'Klapertart', 'quantity': 4, 'note': ''},
                {'item': 'Singkong Thailand', 'quantity': 1, 'note': ''},
                {'item': 'Otak Otak / 1', 'quantity': 3, 'note': ''},
                {'item': 'Dadar Jagung', 'quantity': 1, 'note': ''}
            ],
            'address_lines': [],
            'delivery_note': '',
            'raw_text': '',
            'is_cancel_msg': False
        },
        {
            'sender': 'SPR OKY',
            'chatDate': '30/06/2026 09.27.00',
            'datetime': datetime(2026, 6, 30, 9, 27, 0),
            'items': [
                {'item': 'Tahu Tempe Bacem', 'quantity': 1, 'note': ''},
                {'item': 'Dadar Jagung', 'quantity': 1, 'note': ''},
                {'item': 'Botok Telor Asin', 'quantity': 5, 'note': ''},
                {'item': 'Singkong Thailand', 'quantity': 1, 'note': ''}
            ],
            'address_lines': [],
            'delivery_note': '',
            'raw_text': '',
            'is_cancel_msg': False
        },
        {
            'sender': 'Lora',
            'chatDate': '30/06/2026 08.24.00',
            'datetime': datetime(2026, 6, 30, 8, 24, 0),
            'items': [
                {'item': 'Klapertart', 'quantity': 2, 'note': ''},
                {'item': 'Lemper Bakar', 'quantity': 2, 'note': ''}
            ],
            'address_lines': [],
            'delivery_note': '',
            'raw_text': '',
            'is_cancel_msg': False
        },
        {
            'sender': 'Dahlan Bhas Sari',
            'chatDate': '30/06/2026 09.28.00',
            'datetime': datetime(2026, 6, 30, 9, 28, 0),
            'items': [
                {'item': 'Gado Gado', 'quantity': 1, 'note': ''}
            ],
            'address_lines': [],
            'delivery_note': '',
            'raw_text': '',
            'is_cancel_msg': False
        }
    ]

    final_consolidated_orders.extend(manual_additions)
    final_consolidated_orders.sort(key=lambda x: x['datetime'])

    # Stok limits tracker
    klapertart_stock = 13
    lemper_stock = 24
    
    rows_to_write = []
    
    for order in final_consolidated_orders:
        sender_lower = order['sender'].lower()
        
        # Customer mapping overrides
        if 'sutorejo timur 32/h5' in sender_lower or 'h5' in sender_lower:
            customer_name = 'sutorejo timur 32/H5'
            ongkir = 0
        elif 'bpd b 22 baru' in sender_lower or 'b-22' in sender_lower:
            customer_name = 'Bpd B 22 Baru'
            ongkir = 0
        elif 'mulyosari mas f 19' in sender_lower or 'f19' in sender_lower:
            customer_name = 'Mulyosari Mas F 19 - Mulyo mas f19 - matur swn'
            ongkir = 0
        elif 'bu nawir' in sender_lower:
            customer_name = 'Mulyo Utara 6/24'
            ongkir = 0
        elif 'florence j9' in sender_lower:
            customer_name = 'Florence J9 / 2'
            ongkir = 5000
        elif 'samlangyu 23' in sender_lower:
            customer_name = 'Samlangyu 23'
            ongkir = 5000
        elif 'anis bth' in sender_lower:
            customer_name = 'Anis BTH'
            ongkir = 5000
        else:
            matched_cust = match_customer(order['sender'], order['address_lines'], db)
            if matched_cust:
                customer_name = matched_cust['name']
                ongkir = matched_cust['ongkir']
            else:
                customer_parts = [order['sender']]
                for addr in order['address_lines']:
                    is_dup = False
                    for part in customer_parts:
                        if is_duplicate_address(part, addr):
                            is_dup = True
                            break
                    if not is_dup:
                        customer_parts.append(addr)
                customer_name = " - ".join(customer_parts)
                ongkir = 0

        # Special overrides for specific customer names
        if 'dharmahusada emas fendi' in customer_name.lower():
            customer_name = 'Dharmahusada BF 20'
            ongkir = 0

        # First pass to allocate stock for Klapertart & Lemper
        adjusted_items = []
        for item in order['items']:
            item_name = item['item']
            qty = item['quantity']
            item_note = item['note']
            
            if order['datetime'] >= stock_limit_start:
                if 'klapertart' in item_name.lower():
                    if klapertart_stock <= 0:
                        review_note = f"[PERLU REVIEW] Kehabisan Klapertart (pesan {qty}, dapat 0)"
                        item_note = f"{review_note}; {item_note}" if item_note else review_note
                        adjusted_items.append({'item': item_name, 'quantity': qty, 'note': item_note})
                    elif qty > klapertart_stock:
                        fulfilled = klapertart_stock
                        klapertart_stock = 0
                        review_note = f"[PERLU REVIEW] Klapertart sisa {fulfilled} (pesan {qty}, dapat {fulfilled})"
                        item_note = f"{review_note}; {item_note}" if item_note else review_note
                        adjusted_items.append({'item': item_name, 'quantity': qty, 'note': item_note})
                    else:
                        klapertart_stock -= qty
                        adjusted_items.append({'item': item_name, 'quantity': qty, 'note': item_note})
                    continue
                
                elif 'lemper' in item_name.lower():
                    if lemper_stock <= 0:
                        review_note = f"[PERLU REVIEW] Kehabisan Lemper (pesan {qty}, dapat 0)"
                        item_note = f"{review_note}; {item_note}" if item_note else review_note
                        adjusted_items.append({'item': item_name, 'quantity': qty, 'note': item_note})
                    elif qty > lemper_stock:
                        fulfilled = lemper_stock
                        lemper_stock = 0
                        review_note = f"[PERLU REVIEW] Lemper sisa {fulfilled} (pesan {qty}, dapat {fulfilled})"
                        item_note = f"{review_note}; {item_note}" if item_note else review_note
                        adjusted_items.append({'item': item_name, 'quantity': qty, 'note': item_note})
                    else:
                        lemper_stock -= qty
                        adjusted_items.append({'item': item_name, 'quantity': qty, 'note': item_note})
                    continue

            adjusted_items.append({'item': item_name, 'quantity': qty, 'note': item_note})

        for item in adjusted_items:
            item_name = item['item']
            item_note = item['note']
            
            # Don't append address info or delivery notes to item notes.
            # Leave item_note as is (actual item specific note/stock limit note).
            pass
                    
            rows_to_write.append({
                'customer': customer_name,
                'chatDate': order['chatDate'],
                'payment': "",
                'ongkir': ongkir,
                'item': item_name,
                'quantity': item['quantity'],
                'note': item_note
            })

    output_path = '/Users/notslimboy/Documents/Cashier Web Apps/orders-2026-06-30.csv'
    with open(output_path, 'w', newline='', encoding='utf-8') as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow(['customer', 'chatDate', 'payment', 'ongkir', 'item', 'quantity', 'note'])
        for r in rows_to_write:
            writer.writerow([
                r['customer'],
                r['chatDate'],
                r['payment'],
                r['ongkir'],
                r['item'],
                r['quantity'],
                r['note']
            ])

    print(f"Sukses! Menulis {len(rows_to_write)} baris order ke {output_path}")
