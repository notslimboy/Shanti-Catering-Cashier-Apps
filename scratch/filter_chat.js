const fs = require('fs');
const path = require('path');

const files = ['_chat.txt', '_chat 2.txt'];
const startLimit = new Date('2026-06-19T18:06:00+07:00');
const endLimit = new Date('2026-06-20T12:00:00+07:00');

function parseDate(dateStr, timeStr) {
  const [d, m, y] = dateStr.split('/').map(Number);
  const timeParts = timeStr.split('.');
  const h = Number(timeParts[0]);
  const min = Number(timeParts[1]);
  const s = timeParts[2] ? Number(timeParts[2]) : 0;
  const fullYear = y < 100 ? 2000 + y : y;
  return new Date(`${fullYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(s).padStart(2, '0')}+07:00`);
}

let allMessages = [];

for (const file of files) {
  const filePath = path.join(__dirname, '..', file);
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${filePath}`);
    continue;
  }
  
  console.log(`Processing file: ${file}`);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  let currentMsg = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Bersihkan karakter LRM (\u200e) atau RLM (\u200f) di awal baris
    const cleanLine = line.replace(/^[\u200e\u200f]+/, '');
    
    // Regex matching: [dd/mm/yy, HH.MM.SS] Sender: Message
    const match = cleanLine.match(/^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s+(\d{1,2}\.\d{2}(?:\.\d{2})?)\]\s+([^:]+):\s*(.*)/);
    
    if (match) {
      if (currentMsg) {
        allMessages.push(currentMsg);
      }
      const [_, dateStr, timeStr, sender, msgText] = match;
      const dateObj = parseDate(dateStr, timeStr);
      currentMsg = {
        file,
        lineNum: i + 1,
        dateStr,
        timeStr,
        dateObj,
        sender: sender.trim(),
        text: msgText,
        fullTimestamp: `${dateStr} ${timeStr}`
      };
    } else {
      if (currentMsg) {
        currentMsg.text += '\n' + line;
      }
    }
  }
  if (currentMsg) {
    allMessages.push(currentMsg);
  }
}

// Filter messages in range
const filtered = allMessages.filter(msg => {
  return msg.dateObj >= startLimit && msg.dateObj <= endLimit;
});

// Sort by dateObj
filtered.sort((a, b) => a.dateObj - b.dateObj);

console.log(`Found ${filtered.length} messages in range.`);

// Write to output file in scratch
const outputPath = path.join(__dirname, 'filtered_chat_v2.json');
fs.writeFileSync(outputPath, JSON.stringify(filtered, null, 2), 'utf8');
console.log(`Saved to ${outputPath}`);

// Also print them out nicely
filtered.forEach(msg => {
  console.log(`[${msg.file}][Line ${msg.lineNum}][${msg.fullTimestamp}] ${msg.sender}:`);
  console.log(msg.text);
  console.log('-'.repeat(40));
});
