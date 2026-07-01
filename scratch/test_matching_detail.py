from parse_june26 import load_database, match_customer, get_tokens, get_numbers

db = load_database('/Users/notslimboy/Documents/Cashier Web Apps/instruksi_ai_parser.md')

sender = "Tohir 23"
address_lines = []
query_text = sender + " " + " ".join(address_lines)

print(f"Query text: {query_text}")
print(f"Query tokens: {get_tokens(query_text)}")
print(f"Query numbers: {get_numbers(query_text)}")

# Let's run matching manually and print scores
results = []
q_tokens = get_tokens(query_text)
q_nums = get_numbers(query_text)

for cust in db:
    c_nums = get_numbers(cust['name'])
    for term in cust['terms']:
        c_nums.update(get_numbers(term))
        
    if c_nums:
        if not c_nums.issubset(q_nums):
            continue
            
    # Score
    c_tokens = get_tokens(cust['name'])
    score = 0
    for qt in q_tokens:
        if qt in c_tokens:
            score += 4
        else:
            if len(qt) >= 3:
                for ct in c_tokens:
                    if qt in ct or ct in qt:
                        score += 1
                        
    for term in cust['terms']:
        t_tokens = get_tokens(term)
        term_score = 0
        for qt in q_tokens:
            if qt in t_tokens:
                term_score += 4
            else:
                if len(qt) >= 3:
                    for tt in t_tokens:
                        if qt in tt or tt in qt:
                            term_score += 1
        score = max(score, term_score)
        
    if score >= 6:
        results.append((cust['name'], score))

results.sort(key=lambda x: x[1], reverse=True)
print("Matching Results:")
for name, score in results[:10]:
    print(f" - {name} : {score}")
