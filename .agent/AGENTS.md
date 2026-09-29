# WhatsApp Order CSV Rules

For any Shanti Catering WhatsApp parsing task, read these files before producing or editing a CSV:

1. `../instruksi_ai_parser.md` - business rules and parsing workflow.
2. `../_forAI/ORDER_PARSING_GUARDRAILS.md` - required scope, source-audit, stock, mutation-safety, and QA protocol.
3. `../_forAI/wa_chat_parser_instruction.md` - ready-to-use parser prompt.
4. `../customers.csv` - active local snapshot for customer names, aliases, tags, and ongkir.

Hard rules:

- Always use the Python-first pipeline: run `../scripts/prepare_order_parse_context.py` for the exact date-time range and menu, then let AI audit and clean its compact evidence bundle.
- Never load complete `Chat1.txt` or `Chat2.txt` into model context. The Python script must read and merge both exports; AI verifies against the filtered `chat-range.txt` only.
- Use the existing local `customers.csv` immediately. Do not auto-run customer sync or matching helpers that contact Supabase or write customer data.
- `Tambah` means append, never replace. `Buat CSV baru` must not modify a same-date CSV.
- Code-block requests must not write files.
- Only one writer edits the final CSV; other agents stay read-only and provide evidence/QA.
- Do not invent timestamps, force-match addresses, exceed limited stock, or duplicate screenshot-confirmed orders.
- Use the exact 9-column schema: `customer,chatDate,payment,ongkir,item,quantity,harga,note,sendNote`.
- Use `[PERLU REVIEW]` or ask the user when evidence conflicts.
