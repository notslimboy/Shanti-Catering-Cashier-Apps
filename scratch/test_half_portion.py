import sys
sys.path.append("/Users/notslimboy/Documents/Cashier Web Apps/scratch")
from chat_parser import parse_message_orders

test_cases = [
    ("oseng tempe 1/2", "Oseng Tahu Tempe 1/2", "separuh porsi"),
    ("kotokan separuh porsi pedes", "Kotokan Iwak Pe 1/2", "separuh porsi; pedes"),
    ("sayur sop setengah porsi", "Sayur Sop Makaroni 1/2", "separuh porsi"),
    ("kolak kacang ijo 1/2 porsi manis", "Kolak Kacang Ijo 1/2", "separuh porsi; manis"),
    ("ayam baput jumbo", "Ayam Goreng BaPut Jumbo", "porsi jumbo"),
    ("sop porsi gede", "Sayur Sop Makaroni Jumbo", "porsi jumbo"),
    ("kotokan iwak pe besar paha", "Kotokan Iwak Pe Jumbo", "porsi jumbo; paha"),
]

print("Running half-portion variant parser tests...\n")
success = True
for chat, expected_item, expected_note in test_cases:
    items, _, _ = parse_message_orders(chat)
    if not items:
        print(f"[FAIL] '{chat}' -> No items parsed!")
        success = False
        continue
    parsed_item = items[0]['item']
    parsed_note = items[0]['note']
    if parsed_item == expected_item and parsed_note == expected_note:
        print(f"[SUCCESS] '{chat}' -> Item: '{parsed_item}', Note: '{parsed_note}'")
    else:
        print(f"[FAIL] '{chat}' -> Expected: ('{expected_item}', '{expected_note}'), Got: ('{parsed_item}', '{parsed_note}')")
        success = False

if success:
    print("\nAll unit tests passed successfully!")
else:
    print("\nSome tests failed!")
