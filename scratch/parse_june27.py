import re
import csv
from datetime import datetime

# Menu hari ini (27 Juni 2026)
TODAY_MENU = [
    "Cumi Bunting",
    "Tengiri Balado",
    "Ayam Kremes",
    "Dadar Telur",
    "Gulai Singkong",
    "Ikan Asap Banyar / 1",
    "Lontong Balap",
    "Sempol / 6",
    "Es Campur",
    "Pastel"
]

# Pemetaan kata kunci ke menu resmi
MENU_KEYWORDS = {
    "Cumi Bunting": ["cumi bunting", "cumi"],
    "Tengiri Balado": ["tengiri balado", "tengiri bumbu balado", "tengiri", "tenggiri bumbu balado", "tenggiri balado", "tenggiri"],
    "Ayam Kremes": ["ayam kremes", "ayam"],
    "Dadar Telur": ["dadar telur", "telur dadar", "dadar telor", "telor dadar", "dadar"],
    "Gulai Singkong": ["gulai singkong", "gule singkong", "gule daun singkong", "gulai daun singkong", "gule", "gulai", "guali singkong", "guali"],
    "Ikan Asap Banyar / 1": ["ikan asap banyar / 1", "ikan asap banyar", "ikan asap banyar /1", "ikan asap", "asap banyar", "asap"],
    "Lontong Balap": ["lontong balap", "lontong"],
    "Sempol / 6": ["sempol / 6", "sempol", "sempol /6"],
    "Es Campur": ["es campur", "campur"],
    "Pastel": ["pastel"]
}

# Jam target (26 Juni 19:30 s.d. 27 Juni 12:00 siang)
start_time = datetime(2026, 6, 26, 19, 30, 0)
end_time = datetime(2026, 6, 27, 12, 0, 0)

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
        # Check if numbers match (database numbers must be a subset of query numbers)
        c_nums = get_numbers(cust['name'])
        for term in cust['terms']:
            c_nums.update(get_numbers(term))
            
        if c_nums:
            if not c_nums.issubset(q_nums):
                continue
                
        # Score the main name
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
                            
        # Score the aliases
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
            
        # Split line by main delimiters (do NOT split by comma to keep notes with items)
        delims = r'\s*\.\.\.+\s*(?!\s*\d|\s*\.)|\s+-\s+|\t|;|\s+pesan\s*:\s*|\s+pesan\s+|\s+pesen\s*:\s*|\s+pesen\s+|\s+psn\s*:\s*|\s+psn\s+|\s+beli\s*:\s*|\s+beli\s+|\s*:\s*(?!\s*\d)|\b(?:tambah|nambah|plus|tambahin)\b'
        sub_lines = re.split(delims, line_clean, flags=re.IGNORECASE)
        final_sub_lines = [sl.strip() for sl in sub_lines if sl.strip()]
                    
        for sub_line in final_sub_lines:
            # Clean leading list markers
            sub_line = re.sub(r'^\s*(?:\d+\s*[\.\)\-\:]|[\-\•\*\•])\s*', '', sub_line)
            
            # Clean "jadi" or "total" clarifications first (to align indices)
            sub_line = re.sub(r'\b(jadi|total)\s+.*', '', sub_line, flags=re.IGNORECASE)
            
            # Special case Dadar Jagung override for BPD B/46
            if 'dadar jagung' in sub_line.lower() and ('bpd b' in sender.lower() or 'b/46' in sender.lower()):
                order_items.append({'item': 'Dadar Telur', 'quantity': 1, 'note': ''})
                continue
            
            # Ubah pecahan 1/2 menjadi teks "setengah" agar tidak mengacaukan deteksi kuantitas numerik
            sub_line = re.sub(r'\b1/2\b', 'setengah', sub_line)
            sub_lower = sub_line.lower()
            
            # Question check first
            is_question = '?' in sub_lower or any(q in sub_lower for q in ['ready', 'readykah', 'adakah', 'apakah', 'kah'])
            if is_question:
                # Unless it has numbers (which might indicate an order), skip
                has_number = bool(re.search(r'\b\d+\b', sub_lower))
                if not has_number:
                    continue
                    
            # Find occurrences
            occurrences = []
            for menu_name, keywords in MENU_KEYWORDS.items():
                for keyword in keywords:
                    pattern = r'(?<![a-zA-Z])' + re.escape(keyword) + r'(?![a-zA-Z])'
                    for m in re.finditer(pattern, sub_lower):
                        occurrences.append({
                            'menu': menu_name,
                            'keyword': keyword,
                            'start': m.start(),
                            'end': m.end()
                        })
                        
            occurrences = remove_overlapping_occurrences(occurrences)
            
            if occurrences:
                for i, occ in enumerate(occurrences):
                    start = occ['start']
                    end = occ['end']
                    
                    left_boundary = occurrences[i-1]['end'] if i > 0 else 0
                    right_boundary = occurrences[i+1]['start'] if i+1 < len(occurrences) else len(sub_line)
                    
                    preceding_text = sub_line[left_boundary:start]
                    succeeding_text = sub_line[end:right_boundary]
                    
                    # Determine quantity
                    qty_match_before = re.findall(r'\b\d+\b', preceding_text)
                    qty = 1
                    note_preceding = preceding_text
                    
                    if qty_match_before:
                        last_match = list(re.finditer(r'\b\d+\b', preceding_text))[-1]
                        qty = int(last_match.group())
                        note_preceding = preceding_text[:last_match.start()] + preceding_text[last_match.end():]
                    else:
                        qty_match_after = re.findall(r'\b\d+\b', succeeding_text)
                        if qty_match_after:
                            first_match = list(re.finditer(r'\b\d+\b', succeeding_text))[0]
                            qty = int(first_match.group())
                            
                    # Clean succeeding_text for note of i
                    note_succeeding = succeeding_text
                    if i + 1 < len(occurrences):
                        next_qty_matches = list(re.finditer(r'\b\d+\b', succeeding_text))
                        if next_qty_matches:
                            last_match = next_qty_matches[-1]
                            note_succeeding = succeeding_text[:last_match.start()] + succeeding_text[last_match.end():]
                    else:
                        qty_match_after = re.findall(r'\b\d+\b', succeeding_text)
                        if qty_match_after and not qty_match_before:
                            first_match = list(re.finditer(r'\b\d+\b', succeeding_text))[0]
                            note_succeeding = succeeding_text[:first_match.start()] + succeeding_text[first_match.end():]
                            
                    combined_note = (note_preceding + ' ' + note_succeeding).lower()
                    combined_note = re.sub(r'[\.\-\_:=,\(\)\+]+', ' ', combined_note).strip()
                    combined_note = re.sub(r'\b(porsi|porsy|x|pcs|biji|butir|dan|bh|pax)\b', ' ', combined_note).strip()
                    
                    # Clean polite/filler words
                    polite_words = ['matur nuwun', 'terima kasih', 'ready', 'pesan', 'pesen', 'order', 'halo', 'ok', 'oke', 'maturnuwun', 'mbk', 'mas', 'pak', 'bu', 'dan', 'yg', 'yang', 'mtrnuwun', 'suwun', 'nuwun', 'mks', 'makasih', 'thx', 'thanks', 'tq', 'nuhun', 'atur']
                    note_words = re.findall(r'[a-zA-Z0-9]+', combined_note)
                    clean_words = [w for w in note_words if w not in polite_words]
                    combined_note = ' '.join(clean_words)
                    
                    bracket_match = re.search(r'\((.*?)\)', succeeding_text)
                    if bracket_match:
                        combined_note = bracket_match.group(1).replace(',', ';').strip()
                        
                    # Deteksi porsi setengah (global)
                    is_half = False
                    half_patterns = [r'\b1/2\b', r'\bsetengah\b', r'\bseparuh\b', r'\bseparo\b']
                    if any(re.search(pat, sub_lower) for pat in half_patterns):
                        is_half = True
                    
                    # Deteksi porsi jumbo (global)
                    is_jumbo = False
                    jumbo_patterns = [r'\bjumbo\b', r'\bbesar\b', r'\bgede\b']
                    if any(re.search(pat, sub_lower) for pat in jumbo_patterns):
                        is_jumbo = True
                    
                    # Bersihkan kata kunci setengah & jumbo dari combined_note
                    for pat in half_patterns:
                        combined_note = re.sub(pat, '', combined_note, flags=re.IGNORECASE)
                    for pat in jumbo_patterns:
                        combined_note = re.sub(pat, '', combined_note, flags=re.IGNORECASE)
                    
                    # Bersihkan spasi ganda
                    combined_note = re.sub(r'\s+', ' ', combined_note).strip()
                    
                    if combined_note in ['', 'dan']:
                        combined_note = ''
                        
                    item_name = occ['menu']
                    if is_half:
                        item_name = f"{item_name} 1/2"
                        if combined_note:
                            combined_note = f"separuh porsi; {combined_note}"
                        else:
                            combined_note = "separuh porsi"
                    elif is_jumbo:
                        item_name = f"{item_name} Jumbo"
                        if combined_note:
                            combined_note = f"porsi jumbo; {combined_note}"
                        else:
                            combined_note = "porsi jumbo"
                            
                    order_items.append({'item': item_name, 'quantity': qty, 'note': combined_note})
            else:
                # Non-menu segment
                is_instruction = any(w in sub_lower for w in ['antar', 'kirim', 'ambil', 'titip', 'pagar', 'centel', 'pintu', 'gerbang', 'sore', 'pagi', 'siang', 'jam'])
                if is_instruction:
                    if delivery_note:
                        delivery_note += '; ' + sub_line
                    else:
                        delivery_note = sub_line
                else:
                    polite_words = ['matur nuwun', 'terima kasih', 'ready', 'pesan', 'pesen', 'order', 'halo', 'ok', 'oke', 'maturnuwun', 'mbk', 'mas', 'pak', 'bu', 'dan', 'yg', 'yang', 'mtrnuwun', 'suwun', 'nuwun', 'mks', 'makasih', 'thx', 'thanks', 'tq', 'nuhun', 'atur']
                    is_purely_polite = all(w in polite_words or len(w) < 2 for w in re.findall(r'[a-zA-Z]+', sub_lower))
                    if not is_purely_polite and sub_line:
                        if re.search(r'[a-zA-Z0-9]', sub_line):
                            address_lines.append(sub_line)
                            
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
    print(f"Loaded {len(db)} customer records from database.")

    chat1_path = '/Users/notslimboy/Documents/Cashier Web Apps/_chat.txt'
    chat2_path = '/Users/notslimboy/Documents/Cashier Web Apps/_chat 2.txt'
    
    chats = extract_chats(chat1_path, '_chat.txt') + extract_chats(chat2_path, '_chat 2.txt')
    chats.sort(key=lambda x: x['datetime'])
    print(f"Extracted {len(chats)} messages in target time range.")

    orders_by_sender = {}
    for msg in chats:
        sender = msg['sender']
        text_lower = msg['text'].lower()
        
        # Ignore admin messages and divider lines
        if sender in ['Shanti Catering', 'Elok', 'Lilik Sakun', 'Syifa'] or 'pesan ini dihapus' in text_lower or msg['text'].strip() in ['—————', '——————', '——————-', '————-']:
            continue
            
        items, address_lines, delivery_note = parse_message_orders(msg['text'], sender)
        
        # Check for cancellation keywords
        is_cancel_msg = any(cw in text_lower for cw in ['batal', 'cancel', 'gak jadi', 'g jadi', 'g jd', 'gk jd', 'tidak jadi', 'ga jadi', 'ga jd', 'dibatalkan', 'batalkan'])
        
        # If no items and not a cancellation/address/delivery message, skip
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
            # Special case for U / 9 Atria or U9 so we don't overwrite the Pastel order
            if 'u / 9' in sender.lower() or 'u9' in sender.lower():
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
                continue

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

            # Compare items
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
            
            # Override for Westwood "Tambah 1 tengiri bumbu baladonya"
            if "tambah 1" in next_msg['raw_text'].lower() and "tengiri" in next_msg['raw_text'].lower() and "westwood" in sender.lower():
                has_add_keyword = True
                next_msg['items'] = [{'item': 'Tengiri Balado', 'quantity': 1, 'note': ''}]

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
            elif has_add_keyword:
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
            else:
                current['items'] = next_msg['items']
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

    final_consolidated_orders.sort(key=lambda x: x['datetime'])

    output_path = '/Users/notslimboy/Documents/Cashier Web Apps/orders-2026-06-27.csv'
    
    with open(output_path, 'w', newline='', encoding='utf-8') as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow(['customer', 'chatDate', 'payment', 'ongkir', 'item', 'quantity', 'note'])
        
        for order in final_consolidated_orders:
            # Ambiguity overrides based on the implementation plan
            sender_lower = order['sender'].lower()
            
            # 1. Memet 22
            if 'memet 22' in sender_lower or 'memet' in sender_lower:
                customer_name = '44 Ny. Iin Oman - Jl. Memet Sastrowiryo no 22'
                ongkir = 5000
            # 2. Suto Ut Gg 11 No 10
            elif 'suto ut gg 11' in sender_lower or 'suto ut' in sender_lower or 'xi/10' in sender_lower:
                customer_name = 'Suto Ut Gg 11 No 10'
                ongkir = 0
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
            
            # Manual override customer name for Bu Nawir Mulyosari -> Mulyo Utara 6/24
            if 'bu nawir' in customer_name.lower():
                customer_name = 'Mulyo Utara 6/24'
                ongkir = 0

            for item in order['items']:
                item_name = item['item']
                item_note = item['note']
                
                # Apply special overrides for ambiguities
                # U/9 Atria Pastel 5 - confirmed valid
                # Leli Wisper Tengiri Balado - confirmed valid (not spicy)
                if 'leli wisper' in customer_name.lower() or 'leli - wisper' in customer_name.lower():
                    if item_name == 'Tengiri Balado':
                        if item_note:
                            item_note = f"tidak pedas; {item_note}"
                        else:
                            item_note = "tidak pedas"
                
                notes_to_add = []
                # Don't add address if it is already in the customer name or a review tag
                if not '[perlu review]' in customer_name.lower():
                    for addr in order['address_lines']:
                        # Try to find mapped db record to avoid duplicating address terms
                        # We can query matching terms
                        matched_db_cust = next((c for c in db if c['name'] == customer_name), None)
                        if matched_db_cust:
                            if not is_duplicate_address(matched_db_cust['name'], addr):
                                notes_to_add.append(addr)
                        else:
                            if not is_duplicate_address(customer_name, addr):
                                notes_to_add.append(addr)
                else:
                    # If it's a review tag, add raw address lines to note
                    for addr in order['address_lines']:
                        notes_to_add.append(addr)
                        
                if order['delivery_note']:
                    notes_to_add.append(order['delivery_note'])
                    
                if notes_to_add:
                    extra_note = "; ".join(notes_to_add)
                    if item_note:
                        item_note = f"{item_note}; {extra_note}"
                    else:
                        item_note = extra_note
                        
                writer.writerow([
                    customer_name,
                    order['chatDate'],
                    "", # payment
                    ongkir,
                    item_name,
                    item['quantity'],
                    item_note
                ])
 
    print(f"Sukses! Menulis {len(final_consolidated_orders)} order ke {output_path}")
