const fs = require("fs");
const path = require("path");

const filePath = "/Users/notslimboy/Documents/Cashier Web Apps/instruksi_ai_parser.md";
const snippetPath = "/Users/notslimboy/Documents/Cashier Web Apps/scratch/db_context_snippet.md";

try {
  let content = fs.readFileSync(filePath, "utf8");
  const snippet = fs.readFileSync(snippetPath, "utf8");

  // 1. Replace customer section
  const customerTarget = `2. **\`customer\`**:
   - Contains the **WhatsApp contact name/customer name along with their delivery address, block number, or location landmark** mentioned in the chat.
   - **DEDUPLICATION RULE**: If the WhatsApp contact name and the name/address written inside the message body are highly similar, redundant, or represent the same block/house (e.g. contact name is \`SPR F - 20\` and message has \`SPR F20\`, or contact name is \`P1/40\` and message has \`P1.40\`), you **MUST DEDUPLICATE** them. Do not write both versions. Merge them into a single clean, non-redundant name/address.
     - *Bad (Redundant)*: \`SPR F - 20 SPR F20\`, \`P1/40 P1.40\`, \`N - 2 N.2\`, \`T - 72 T 72\`, \`BPD B / 46 M BPD B/46\`.
     - *Good (Deduplicated)*: \`SPR F - 20\`, \`P1/40\`, \`N - 2\`, \`T - 72\`, \`M BPD B/46\`.
   - **IMPORTANT**: All customer identity details and address information must be merged and placed in this column. Do not split them into the note column.
   - Examples: \`Mulyosari prima 1/92 mc 19\`, \`Villa Royal C4 / 18\`, \`Bhsksari 60\`, \`Emi Bumi Marina\`, \`Sutorejo Sel 1/22\`, \`SMA 5 .. ratna juli\`.`;

  const customerReplacement = `2. **\`customer\`**:
   - Contains the **WhatsApp contact name/customer name along with their delivery address, block number, or location landmark** mentioned in the chat.
   - **DATABASE MATCHING & DEDUPLICATION RULE**: You **MUST MATCH** the customer identity from the chat to the official database name or aliases listed in the **DATABASE CONTEXT** section at the bottom of this file.
     - If a match is found, output the **Official Bold Customer Name** (e.g. \`SPR F20\`, \`Kalijudan Taruna 2/6\`, \`ITS N/2\`, \`ITS i 6\`).
     - If the name in the chat is redundant with the contact name (e.g. contact is \`SPR F - 20\` and message has \`SPR F20\`), deduplicate them and output only the official database name (e.g., \`SPR F20\`).
     - If no match is found in the database, output the clean customer name/address from the chat.
   - **IMPORTANT**: All customer identity details and address information must be merged and placed in this column. Do not split them into the note column.
   - Examples: \`Mulyosari prima 1/92 mc 19\`, \`Villa Royal C4 / 18\`, \`Bhsksari 60\`, \`Emi Bumi Marina\`, \`Sutorejo Sel 1/22\`, \`SMA 5 .. ratna juli\`.`;

  content = content.replace(customerTarget, customerReplacement);

  // 2. Replace ongkir section
  const ongkirTarget = `5. **\`ongkir\`**:
   - Always fill with \`0\` as the default value.`;

  const ongkirReplacement = `5. **\`ongkir\`**:
   - Look up the matched customer in the **DATABASE CONTEXT** section.
     - If the customer has an \`Ongkir\` value > 0, write that value here (e.g. \`10000\` or \`15000\`).
     - Otherwise, write \`0\`.`;

  content = content.replace(ongkirTarget, ongkirReplacement);

  // 3. Append database context at the end
  const executionTarget = `## EXECUTION INSTRUCTION
The user will provide the **Daftar Menu Hari Ini** and the **WhatsApp chat history** below. Read them, map and match the items exactly (casing, spelling, spacing) to Today's Menu, and generate a clean CSV output according to the format and rules above. ONLY output the raw CSV block without any extra explanation or text.`;

  const executionReplacement = `## EXECUTION INSTRUCTION
The user will provide the **Daftar Menu Hari Ini** and the **WhatsApp chat history** below. Read them, map and match the items exactly (casing, spelling, spacing) to Today's Menu, and generate a clean CSV output according to the format and rules above. ONLY output the raw CSV block without any extra explanation or text.

---

## DATABASE CONTEXT: OFFICIAL CUSTOMERS & ONGKIR
Below is the list of official customer names registered in the cashier app database, their match terms/aliases, and their default shipping/ongkir fee:

${snippet}`;

  content = content.replace(executionTarget, executionReplacement);

  fs.writeFileSync(filePath, content, "utf8");
  console.log("Successfully updated instruksi_ai_parser.md!");

} catch (err) {
  console.error("Error updating file:", err);
}
