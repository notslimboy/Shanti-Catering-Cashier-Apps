import re
import csv
from datetime import datetime

# Menu hari ini (6-7 Juni)
TODAY_MENU = [
    "Jangkang Goreng",
    "Pepes Udang Jamur",
    "Oseng Lorjuk",
    "Sayur Bayam",
    "Mendol",
    "Botok Ontong",
    "Bubur Ayam",
    "Es Degan"
]

# Pemetaan kata kunci ke menu resmi
MENU_KEYWORDS = {
    "Jangkang Goreng": ["jangkang goreng", "jangkang", "jangkang grg"],
    "Pepes Udang Jamur": ["pepes udang jamur", "pepes udang", "pepes udang jmr"],
    "Oseng Lorjuk": ["oseng lorjuk", "lorjuk", "oseng lorjok", "lorjok", "oseng lorju", "lorju"],
    "Sayur Bayam": ["sayur bayam", "bayam", "sayur bym", "bym", "sayur bayem", "bayem"],
    "Mendol": ["mendol"],
    "Botok Ontong": ["botok ontong", "bothok ontong", "ontong", "botok"],
    "Bubur Ayam": ["bubur ayam", "bubur", "bubur aym", "buryam"],
    "Es Degan": ["es degan", "degan", "es degan ijo", "degan ijo"]
}

# Jam target (6 Juni 18:22 s.d. 7 Juni 12:00 siang)
start_time = datetime(2026, 6, 6, 18, 22, 0)
end_time = datetime(2026, 6, 7, 12, 0, 0)

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

def match_customer(sender, address_lines, database):
    sender_clean = clean_str(sender)
    addr_cleans = [clean_str(line) for line in address_lines if line]
    
    # 1. Exact match on terms first
    for cust in database:
        for term in cust['terms']:
            term_clean = clean_str(term)
            if not term_clean:
                continue
            if sender_clean == term_clean or any(ac == term_clean for ac in addr_cleans):
                return cust
                
    # 2. Substring match for longer terms
    for cust in database:
        for term in cust['terms']:
            term_clean = clean_str(term)
            if len(term_clean) < 4:
                continue
            if term_clean in sender_clean or sender_clean in term_clean:
                return cust
            for ac in addr_cleans:
                if term_clean in ac or ac in term_clean:
                    return cust
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

def parse_message_orders(text):
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    order_items = []
    address_lines = []
    delivery_note = ''
    
    for line in lines:
        line_clean = line.strip()
        line_lower = line_clean.lower()
        
        if any(w in line_lower for w in ['stiker tidak disertakan', 'gambar tidak disertakan', 'pesan ini dihapus', 'bismillaah', 'matur nuwun', 'maturnuwun', 'terima kasih', 'terimakasih', 'trims', 'suwun']):
            continue
            
        # Split line by delimiters, protecting dots followed by digits (like Mendol....2)
        sub_lines = re.split(r'\s*\.\.\.+\s*(?!\d|\.)|\s+-\s+|\t|;', line_clean)
        final_sub_lines = []
        for sl in sub_lines:
            for ssl in sl.split(','):
                if ssl.strip():
                    final_sub_lines.append(ssl.strip())
                    
        for sub_line in final_sub_lines:
            sub_lower = sub_line.lower()
            
            # Question check first
            is_question = '?' in sub_lower or any(q in sub_lower for q in ['ready', 'readykah', 'adakah', 'apakah', 'kah'])
            if is_question:
                has_number = bool(re.search(r'\b\d+\b', sub_lower))
                if not has_number:
                    continue # Skip question line
                    
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
                    end = occurrences[i+1]['start'] if i+1 < len(occurrences) else len(sub_line)
                    segment = sub_line[start:end]
                    segment_lower = segment.lower()
                    
                    qty_match = re.search(r'\b\d+\b', segment_lower)
                    qty = 1
                    if qty_match:
                        qty = int(qty_match.group())
                    else:
                        before_text = sub_lower[:start]
                        qty_match_before = re.findall(r'\b\d+\b', before_text)
                        if qty_match_before:
                            qty = int(qty_match_before[-1])
                            
                    clean_seg = segment_lower.replace(occ['keyword'], ' ')
                    if qty_match:
                        clean_seg = clean_seg.replace(qty_match.group(), ' ')
                    note = re.sub(r'[\.\-\_:=,\(\)]+', ' ', clean_seg).strip()
                    note = re.sub(r'\b(porsi|porsy|x|pcs|biji|butir|dan|bh|pax)\b', ' ', note).strip()
                    note = re.sub(r'\s+', ' ', note)
                    
                    bracket_match = re.search(r'\((.*?)\)', segment)
                    if bracket_match:
                        note = bracket_match.group(1).replace(',', ';').strip()
                        
                    if note.lower() in ['', 'dan']:
                        note = ''
                        
                    order_items.append({'item': occ['menu'], 'quantity': qty, 'note': note})
            else:
                # Non-menu segment
                is_instruction = any(w in sub_lower for w in ['antar', 'kirim', 'ambil', 'titip', 'pagar', 'centel', 'pintu', 'gerbang', 'sore', 'pagi', 'siang', 'jam'])
                if is_instruction:
                    if delivery_note:
                        delivery_note += '; ' + sub_line
                    else:
                        delivery_note = sub_line
                else:
                    polite_words = ['matur nuwun', 'terima kasih', 'ready', 'pesan', 'pesen', 'order', 'halo', 'ok', 'oke', 'maturnuwun', 'mbk', 'mas', 'pak', 'bu', 'dan', 'yg', 'yang']
                    is_purely_polite = all(w in polite_words or len(w) < 2 for w in re.findall(r'[a-zA-Z]+', sub_lower))
                    if not is_purely_polite and sub_line:
                        if re.search(r'[a-zA-Z0-9]', sub_line):
                            address_lines.append(sub_line)
                            
    return order_items, address_lines, delivery_note

def extract_chats(filepath, source_name):
    extracted = []
    current_msg = None
    with open(filepath, 'r', encoding='utf-8') as f:
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

# Main execution
if __name__ == '__main__':
    # Load database context
    database_file = '/Users/notslimboy/Documents/Cashier Web Apps/instruksi_ai_parser.md'
    db = load_database(database_file)
    print(f"Loaded {len(db)} customer records from database.")

    # Read chats
    chat1_path = '/Users/notslimboy/Documents/Cashier Web Apps/_chat.txt'
    chat2_path = '/Users/notslimboy/Documents/Cashier Web Apps/_chat 2.txt'
    
    chats = extract_chats(chat1_path, '_chat.txt') + extract_chats(chat2_path, '_chat 2.txt')
    chats.sort(key=lambda x: x['datetime'])
    print(f"Extracted {len(chats)} messages in target time range.")

    # Group parsed orders by sender name
    orders_by_sender = {}
    for msg in chats:
        sender = msg['sender']
        text_lower = msg['text'].lower()
        
        # General filter for spam/empty/catering messages
        if sender == 'Shanti Catering' or 'stiker tidak disertakan' in text_lower or 'gambar tidak disertakan' in text_lower or 'pesan ini dihapus' in text_lower or msg['text'].strip() in ['—————', '——————', '——————-', '————-']:
            continue
            
        items, address_lines, delivery_note = parse_message_orders(msg['text'])
        if not items:
            continue
            
        items = split_order_items(items)
        
        order_info = {
            'sender': sender,
            'chatDate': msg['chatDate'],
            'datetime': msg['datetime'],
            'items': items,
            'address_lines': address_lines,
            'delivery_note': delivery_note,
            'raw_text': msg['text']
        }
        
        if sender not in orders_by_sender:
            orders_by_sender[sender] = []
        orders_by_sender[sender].append(order_info)

    # Consolidate orders for each sender separately (NEVER merge different senders!)
    final_consolidated_orders = []
    for sender, msgs in orders_by_sender.items():
        msgs.sort(key=lambda x: x['datetime'])
        
        current = msgs[0]
        for next_msg in msgs[1:]:
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
                        
            has_add_keyword = any(k in next_msg['raw_text'].lower() for k in ["tambah", "nambah", "plus", "tambahin", "tambah lagi"])
            
            if items_same and not has_add_keyword:
                # RESEND/RECHAT: Keep original quantity, update chatDate to the latest
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
                # ADDITION/REVISION: Merge quantities
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
                        
        final_consolidated_orders.append(current)

    # Sort final consolidated orders chronologically
    final_consolidated_orders.sort(key=lambda x: x['datetime'])

    # Write to CSV file
    output_path = '/Users/notslimboy/Documents/Cashier Web Apps/orders-2026-05-28-1900-2359.csv'
    
    with open(output_path, 'w', newline='', encoding='utf-8') as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow(['customer', 'chatDate', 'payment', 'ongkir', 'item', 'quantity', 'note'])
        
        for order in final_consolidated_orders:
            # 1. Match customer in database
            matched_cust = match_customer(order['sender'], order['address_lines'], db)
            
            if matched_cust:
                customer_name = matched_cust['name']
                ongkir = matched_cust['ongkir']
            else:
                # Deduplicate address segments and join
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
                
            # 2. Write each item
            for item in order['items']:
                # Combine item note with delivery note
                item_note = item['note']
                if order['delivery_note']:
                    if item_note:
                        item_note = f"{item_note}; {order['delivery_note']}"
                    else:
                        item_note = order['delivery_note']
                        
                writer.writerow([
                    customer_name,
                    order['chatDate'],
                    "", # payment
                    ongkir,
                    item['item'],
                    item['quantity'],
                    item_note
                ])

    # Add manual Wisper 5/18 (checking if it matches DB to write correct official name and ongkir)
    wisper_manual = "Wisper 5 / 18"
    wisper_ongkir = 5000
    # Search database for Wisper 5 / 18
    for cust in db:
        if "Wisper 5" in cust['name']:
            wisper_manual = cust['name']
            wisper_ongkir = cust['ongkir']
            break
            
    with open(output_path, 'a', newline='', encoding='utf-8') as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow([wisper_manual, "07/06/2026 08.34.00", "", wisper_ongkir, "Botok Ontong", 2, ""])
        writer.writerow([wisper_manual, "07/06/2026 08.34.00", "", wisper_ongkir, "Mendol", 1, ""])
        writer.writerow([wisper_manual, "07/06/2026 08.34.00", "", wisper_ongkir, "Es Degan", 1, ""])

    print(f"Sukses! Menulis {len(final_consolidated_orders) + 1} order ke {output_path}")
