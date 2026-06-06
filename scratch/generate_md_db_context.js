const SUPABASE_URL = "https://ddfalsclevkqhiyojngx.supabase.co";
const SUPABASE_KEY = "sb_publishable_Ve_QZUvSQgQSE9_LcEAHmw_WLaQDSrP";

async function run() {
  try {
    const custRes = await fetch(`${SUPABASE_URL}/rest/v1/customers?select=*`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`
      }
    });
    const customers = await custRes.json();

    const aliasRes = await fetch(`${SUPABASE_URL}/rest/v1/customer_aliases?select=*`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`
      }
    });
    const aliases = await aliasRes.json();

    console.log("Formatting customer database context...");
    let lines = [];
    customers.forEach(c => {
      const cAliases = aliases.filter(a => a.customer_id === c.id).map(a => a.alias);
      const allNames = [c.name, ...cAliases].map(n => `"${n}"`).join(", ");
      lines.push(`- **${c.name}** (Match terms: [${allNames}]) | Ongkir: ${c.default_shipping || 0}`);
    });

    // Write to a temporary file
    const fs = require("fs");
    fs.writeFileSync("/Users/notslimboy/Documents/Cashier Web Apps/scratch/db_context_snippet.md", lines.join("\n"));
    console.log("Snippet saved to db_context_snippet.md");
  } catch (err) {
    console.error(err);
  }
}

run();
