const SUPABASE_URL = "https://ddfalsclevkqhiyojngx.supabase.co";
const SUPABASE_KEY = "sb_publishable_Ve_QZUvSQgQSE9_LcEAHmw_WLaQDSrP";

function normalizeKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_/\.-]+/g, "");
}

function getTokens(str) {
  return String(str ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 0 && t !== "bu" && t !== "pak" && t !== "ibu" && t !== "blok" && t !== "no" && t !== "no.");
}

const parsedNames = [
  "SPR F - 20",
  "Dharmahusada Emas Fendi Dharmas bf20",
  "P1/40",
  "Bhaskara sari 38",
  "Bu wiwik kalijudan taruna 2/6",
  "Zainal Gg. 3",
  "M BPD B/46",
  "Bhaskara sari 60",
  "Mulyo BPD BLOK B / 23",
  "pantai mentari blok SF no. 9",
  "Managmen Bisnis Ayu - gedung dirpaip sebelah gedung FKK ITS lt 2",
  "N - 2",
  "T - 72",
  "I / 6",
  "Ibu Wieke Mulyo Utara 7/6",
  "T - 9",
  "Sut sel 7 no 37",
  "Sut.sel 8/27",
  "Mulyosari BPD B-22",
  "Blok T 86.bu Ratna"
];

async function run() {
  try {
    // 1. Fetch customers
    const custRes = await fetch(`${SUPABASE_URL}/rest/v1/customers?select=*`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`
      }
    });
    const customers = await custRes.json();

    // 2. Fetch aliases
    const aliasRes = await fetch(`${SUPABASE_URL}/rest/v1/customer_aliases?select=*`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`
      }
    });
    const aliases = await aliasRes.json();

    console.log("Matching results with default_shipping and last order shipping:\n");

    for (const query of parsedNames) {
      const qNorm = normalizeKey(query);
      
      // 1. Exact normalized name match
      let match = customers.find(c => normalizeKey(c.name) === qNorm);
      
      // 2. Exact normalized alias match
      if (!match) {
        const aliasMatch = aliases.find(a => normalizeKey(a.alias) === qNorm);
        if (aliasMatch) {
          match = customers.find(c => c.id === aliasMatch.customer_id);
        }
      }

      // 3. Token overlap matching
      if (!match) {
        const qTokens = getTokens(query);
        let bestMatch = null;
        let highestScore = 0;

        customers.forEach(c => {
          if (c.name.length <= 1) return;
          const cTokens = getTokens(c.name);
          
          let score = 0;
          qTokens.forEach(qt => {
            if (cTokens.includes(qt)) {
              score += 4;
            } else if (cTokens.some(ct => ct.includes(qt) || qt.includes(ct))) {
              score += 1;
            }
          });

          const cAliases = aliases.filter(a => a.customer_id === c.id);
          cAliases.forEach(a => {
            const aTokens = getTokens(a.alias);
            qTokens.forEach(qt => {
              if (aTokens.includes(qt)) {
                score += 4;
              } else if (aTokens.some(at => at.includes(qt) || qt.includes(at))) {
                score += 1;
              }
            });
          });

          if (score > highestScore) {
            highestScore = score;
            bestMatch = c;
          }
        });

        if (highestScore >= 2) {
          match = bestMatch;
        }
      }

      // Apply overrides for known queries that failed standard token logic
      let matchedCustName = match ? match.name : null;
      let matchedCustId = match ? match.id : null;
      let defaultShipping = match ? (match.default_shipping || 0) : 0;

      if (query === "Dharmahusada Emas Fendi Dharmas bf20") {
        const override = customers.find(c => c.id === 1949);
        if (override) {
          matchedCustName = override.name;
          matchedCustId = override.id;
          defaultShipping = override.default_shipping || 0;
        }
      } else if (query === "T - 9") {
        const override = customers.find(c => c.id === 25);
        if (override) {
          matchedCustName = override.name;
          matchedCustId = override.id;
          defaultShipping = override.default_shipping || 0;
        }
      }

      if (matchedCustId) {
        // Find their last order's shipping cost
        // We look for sales where customer_name equals the matched customer name or any of their aliases
        const custAliases = aliases.filter(a => a.customer_id === matchedCustId).map(a => a.alias);
        const nameList = [matchedCustName, ...custAliases];
        
        // Let's query the most recent sale from Supabase for this customer
        // Since we can't easily do clean arrays in PostgREST in, we'll query using 'or'
        const namesOrQuery = nameList.map(n => `customer_name.eq."${n.replace(/"/g, '\\"')}"`).join(",");
        
        const salesRes = await fetch(`${SUPABASE_URL}/rest/v1/sales?select=discount,completed_at&or=(${namesOrQuery})&order=completed_at.desc&limit=1`, {
          headers: {
            "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${SUPABASE_KEY}`
          }
        });
        const sales = await salesRes.json();
        
        let lastOrderShipping = 0;
        let lastOrderDate = "Never";
        if (sales && sales.length > 0) {
          lastOrderShipping = sales[0].discount || 0; // discount stores shipping fee
          lastOrderDate = sales[0].completed_at;
        }

        console.log(`- Query: "${query}"`);
        console.log(`  -> Match: "${matchedCustName}" (ID: ${matchedCustId})`);
        console.log(`  -> default_shipping: ${defaultShipping}`);
        console.log(`  -> last_order_shipping: ${lastOrderShipping} (Date: ${lastOrderDate})`);
      } else {
        console.log(`- Query: "${query}" => NO MATCH FOUND`);
      }
    }

  } catch (err) {
    console.error(err);
  }
}

run();
