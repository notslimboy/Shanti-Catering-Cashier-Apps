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

    console.log("Matching results with default_shipping:\n");
    
    parsedNames.forEach(query => {
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

      if (match) {
        // Double check specific overrides for known queries that failed in V2:
        // - "Dharmahusada Emas Fendi Dharmas bf20" should be "Dharmahusada BF 20" (ID 1949)
        // - "T - 9" should be "ITS T 9" (ID 25)
        let matchedName = match.name;
        let matchedId = match.id;
        let defaultShipping = match.default_shipping || 0;

        if (query === "Dharmahusada Emas Fendi Dharmas bf20") {
          const override = customers.find(c => c.id === 1949);
          if (override) {
            matchedName = override.name;
            matchedId = override.id;
            defaultShipping = override.default_shipping || 0;
          }
        } else if (query === "T - 9") {
          const override = customers.find(c => c.id === 25);
          if (override) {
            matchedName = override.name;
            matchedId = override.id;
            defaultShipping = override.default_shipping || 0;
          }
        }

        console.log(`- Query: "${query}" => MATCH: "${matchedName}" (ID: ${matchedId}) | Default Shipping: ${defaultShipping}`);
      } else {
        console.log(`- Query: "${query}" => NO MATCH IN DB | Default Shipping: 0`);
      }
    });

  } catch (err) {
    console.error(err);
  }
}

run();
