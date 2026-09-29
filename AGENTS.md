# Agent Knowledge Base - Shanti Catering Order Parser

## ⚠️ Critical Failure Log (4 Aug 2026)

### What Went Wrong
Agent (Kimi) produced incomplete order CSV because it **only relied on script output** (`hasil-parser.csv`) without performing **AI interpretation stage** on `chat-range.txt`.

**Missing Orders:**
- "Oseng tahu udang taoco" → missed (script expected exact "Oseng Tahu Tauco")
- "Lele grng" → missed (abbreviation not matched)
- "mendol" → missed (colloquial for "Tempe Mendol")
- "soto daging", "dawet", "rujak matengan" → missed
- Donat orders → completely missed

### Root Cause Analysis
1. **Skipped mandatory reading**: Did not read `_forAI/PARSER_RUNTIME_COMPACT.md` and `_forAI/ORDER_PARSING_GUARDRAILS.md` before starting
2. **Misunderstood pipeline**: Thought Python script output = final orders, when actually:
   - Stage 1: Python = deterministic filtering + candidate extraction
   - Stage 2: AI = interpretation, fuzzy matching, manual verification against `chat-range.txt`
   - Stage 3: AI = final CSV generation
3. **Exact matching trap**: Script uses strict regex matching, AI must compensate with contextual interpretation

### The Fix (What Agent Should Do)

```
User request
    ↓
Read _forAI/*.md (MANDATORY - never skip)
    ↓
Run prepare_order_parse_context.py
    ↓
Read review.md + hasil-parser.csv (candidates only)
    ↓
**CRITICAL: Read ALL of chat-range.txt**
    ↓
AI fuzzy-match: "lele grng" → "Lele Goreng /3"
            "taoco" → "tauco"
            "mendol" → "Tempe Mendol"
    ↓
Verify against customers.csv
    ↓
Generate final CSV
```

### Golden Rules

1. **Never trust script output blindly** - `hasil-parser.csv` contains candidates, not final orders
2. **Always read chat-range.txt completely** - Every message must be reviewed by AI
3. **Fuzzy matching is AI's job** - Handle typos, abbreviations, colloquial terms
4. **Read _forAI/ first** - Always read companion docs before instruksi_ai_parser.md
5. **When in doubt, audit the source** - If numbers don't match, read raw chat evidence

### Customer Matching Lessons

❌ **DON'T**: Stop at script's customer-terdeteksi.csv if UNMATCHED  
✅ **DO**: Search customers.csv manually for partial matches (e.g., "Bhas 7/17" → "Bhaskara 7/17")

❌ **DON'T**: Assume sender name = customer  
✅ **DO**: Check message body for address phrases (e.g., "Bhaskara 7/17" in body)

### Menu Matching Lessons

Script looks for exact menu names. AI must handle:
- Abbreviations: "grng" → "Goreng", "mendol" → "Tempe Mendol"
- Typos: "taoco" → "tauco", "cingur" vs "cingur"
- Partial names: "soto daging" → "Soto Madura" (with note "daging")
- Context clues: "soto" + "daging tnp jerohan" = Soto Madura

### Verification Checklist

Before finalizing CSV:
- [ ] Count distinct senders in chat-range.txt = count in final CSV
- [ ] Every sender with food keywords has order rows
- [ ] Abbreviations mapped to full menu names
- [ ] [PERLU REVIEW] added for ambiguous customers
- [ ] Notes extracted: tanpa lombok, kuah banyak, matengan, etc.

## Standard Operating Procedure

### Phase 1: Preparation (Script)
- Run `prepare_order_parse_context.py` with exact timestamps + menu
- Input: Chat1.txt, Chat2.txt, customers.csv
- Output: Bundle in `orderan/hasil-parser/<range>/`

### Phase 2: AI Interpretation (MUST DO)
1. Read `_forAI/PARSER_RUNTIME_COMPACT.md`
2. Read `_forAI/ORDER_PARSING_GUARDRAILS.md`
3. Read `review.md` for sender groups
4. **Read EVERY message in `chat-range.txt`**
5. Cross-reference with `customers.csv` for fuzzy address matching
6. Map colloquial/abbreviated items to official menu
7. Consolidate additions/revisions per sender
8. Resolve [PERLU REVIEW] cases

### Phase 3: CSV Generation
- Generate exact 9-column format
- Ascending sort by final order timestamp
- QA: Row count, no duplicates, menu names exact

## Remember

> "Python menyaring dan menyusun; **AI mengaudit dan merapikan.**"
>
> Agent dilarang memasukkan Chat1.txt atau Chat2.txt utuh ke konteks model. 
> Tapi AI **WAJIB** membaca chat-range.txt seluruhnya untuk interpretasi.

The script is a filter, not a parser. The AI is the parser.
