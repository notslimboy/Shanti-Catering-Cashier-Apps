const SUPABASE_URL = "https://ddfalsclevkqhiyojngx.supabase.co";
const SUPABASE_KEY = "sb_publishable_Ve_QZUvSQgQSE9_LcEAHmw_WLaQDSrP";

async function run() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/sales?select=*&limit=1`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`
      }
    });
    const data = await res.json();
    console.log("Sales first record:", data[0]);
  } catch (err) {
    console.error(err);
  }
}

run();
