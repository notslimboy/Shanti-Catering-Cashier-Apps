/**
 * Script untuk mencocokkan customer di draft CSV dengan database Supabase
 * dan mengisi ongkir secara otomatis berdasarkan default_shipping di DB.
 * 
 * Cara Penggunaan:
 *   node match_draft_to_db.js <path_ke_file_draft.csv>
 * 
 * Contoh:
 *   node match_draft_to_db.js draft.csv
 * 
 * Output:
 *   Akan menghasilkan file baru dengan nama '<nama_file>_matched.csv'
 */

const fs = require("fs");
const path = require("path");

// Konfigurasi Supabase (diambil dari script.js)
const SUPABASE_URL = "https://ddfalsclevkqhiyojngx.supabase.co";
const SUPABASE_KEY = "sb_publishable_Ve_QZUvSQgQSE9_LcEAHmw_WLaQDSrP";

// Helper Normalisasi Key (sama seperti di kasir app)
function normalizeKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_/\.-]+/g, "");
}

// Helper Tokenizer untuk pencocokan kata (overlap matching)
function getTokens(str) {
  return String(str ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 0 && t !== "bu" && t !== "pak" && t !== "ibu" && t !== "blok" && t !== "no" && t !== "no.");
}

// Zero-dependency CSV Parser
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return [];
  
  const headers = splitCSVLine(lines[0]);
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = splitCSVLine(lines[i]);
    const row = {};
    headers.forEach((header, index) => {
      row[header.trim()] = values[index] !== undefined ? values[index].trim() : "";
    });
    rows.push(row);
  }
  
  return { headers, rows };
}

function splitCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.replace(/^"|"$/g, ''));
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.replace(/^"|"$/g, ''));
  return result;
}

// Zero-dependency CSV Writer
function writeCSV(headers, rows) {
  const headerLine = headers.join(",");
  const rowLines = rows.map(row => {
    return headers.map(header => {
      let val = String(row[header] ?? "");
      // Escape quotes and wrap in quotes if value contains commas or quotes
      if (val.includes(",") || val.includes('"') || val.includes("\n")) {
        val = `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    }).join(",");
  });
  return [headerLine, ...rowLines].join("\n");
}

async function run() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Error: Mohon masukkan path file CSV draft.");
    console.log("Penggunaan: node match_draft_to_db.js <file_draft.csv>");
    process.exit(1);
  }

  const inputFilePath = path.resolve(args[0]);
  if (!fs.existsSync(inputFilePath)) {
    console.error(`Error: File tidak ditemukan di path: ${inputFilePath}`);
    process.exit(1);
  }

  console.log(`Membaca file draft: ${path.basename(inputFilePath)}...`);
  const rawCSVText = fs.readFileSync(inputFilePath, "utf8");
  const { headers, rows } = parseCSV(rawCSVText);

  if (!headers.includes("customer")) {
    console.error("Error: CSV harus memiliki kolom 'customer'!");
    process.exit(1);
  }

  try {
    console.log("Menghubungkan ke Supabase...");
    
    // 1. Fetch Customers
    const custRes = await fetch(`${SUPABASE_URL}/rest/v1/customers?select=*`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`
      }
    });
    if (!custRes.ok) throw new Error(`Gagal fetch customers: ${custRes.statusText}`);
    const customers = await custRes.json();

    // 2. Fetch Aliases
    const aliasRes = await fetch(`${SUPABASE_URL}/rest/v1/customer_aliases?select=*`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`
      }
    });
    if (!aliasRes.ok) throw new Error(`Gagal fetch aliases: ${aliasRes.statusText}`);
    const aliases = await aliasRes.json();

    console.log(`Berhasil memuat ${customers.length} data customer dari database.`);

    const matchCache = {}; // Cache hasil pencocokan agar tidak query berulang

    console.log("\nMulai mencocokkan customer & ongkir...");
    
    for (const row of rows) {
      const origName = row["customer"];
      if (!origName) continue;

      // Cek cache dulu
      if (matchCache[origName]) {
        row["customer"] = matchCache[origName].name;
        row["ongkir"] = matchCache[origName].shipping;
        continue;
      }

      const qNorm = normalizeKey(origName);
      
      // 1. Cari exact match nama customer
      let match = customers.find(c => normalizeKey(c.name) === qNorm);
      
      // 2. Cari exact match alias
      if (!match) {
        const aliasMatch = aliases.find(a => normalizeKey(a.alias) === qNorm);
        if (aliasMatch) {
          match = customers.find(c => c.id === aliasMatch.customer_id);
        }
      }

      // 3. Cari dengan Token overlap (Fuzzy Matching)
      if (!match) {
        const qTokens = getTokens(origName);
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

      // Overrides manual untuk query khusus yang kurang pas jika menggunakan token matching saja
      let finalName = origName;
      let finalShipping = row["ongkir"] || "0";

      if (match) {
        finalName = match.name;
        finalShipping = match.default_shipping || 0;

        // Manual override untuk case khusus agar presisi
        if (origName.includes("Dharmahusada Emas Fendi")) {
          const override = customers.find(c => c.id === 1949); // Dharmahusada BF 20
          if (override) {
            finalName = override.name;
            finalShipping = override.default_shipping || 0;
          }
        } else if (origName.includes("T - 9")) {
          const override = customers.find(c => c.id === 25); // ITS T 9
          if (override) {
            finalName = override.name;
            finalShipping = override.default_shipping || 0;
          }
        } else if (
          origName.includes("Tohir 23") ||
          origName.includes("Sutorejo Tengah 2/6") ||
          origName.includes("Suto Utara Baru 17 A") ||
          origName.includes("U I76") ||
          origName.includes("Taman Suto Timur 48 Baru")
        ) {
          match = null;
          finalName = origName;
          finalShipping = "0";
        }

        console.log(`[OK] "${origName}" -> dipetakan ke "${finalName}" | Ongkir: ${finalShipping}`);
      } else {
        console.log(`[?] "${origName}" -> TIDAK COCOK DI DB (Pakai nama asli) | Ongkir: 0`);
        finalShipping = "0";
      }

      // Update baris CSV
      row["customer"] = finalName;
      row["ongkir"] = String(finalShipping);

      // Simpan ke cache
      matchCache[origName] = {
        name: finalName,
        shipping: finalShipping
      };
    }

    // Tulis kembali ke CSV baru
    const outputCSVText = writeCSV(headers, rows);
    const ext = path.extname(inputFilePath);
    const base = path.basename(inputFilePath, ext);
    const outputFilePath = path.join(path.dirname(inputFilePath), `${base}_matched${ext}`);

    fs.writeFileSync(outputFilePath, outputCSVText, "utf8");
    console.log(`\nSelesai! Hasil pencocokan berhasil disimpan di:\n-> ${outputFilePath}`);

  } catch (error) {
    console.error("Terjadi error saat memproses:", error.message);
  }
}

run();
