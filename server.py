from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from datetime import datetime, timezone
import json
import mimetypes
import os
from pathlib import Path
import re
import shutil
import sqlite3
import sys
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("KASIR_DB_PATH", str(ROOT / "kasir-bento.sqlite3"))).expanduser().resolve()


def utc_now_text():
    return datetime.now(timezone.utc).isoformat()


def get_connection():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_database():
    with get_connection() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS sales (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                receipt_no TEXT NOT NULL UNIQUE,
                completed_at TEXT NOT NULL,
                store_name TEXT NOT NULL,
                payment TEXT NOT NULL,
                subtotal INTEGER NOT NULL DEFAULT 0,
                discount INTEGER NOT NULL DEFAULT 0,
                tax INTEGER NOT NULL DEFAULT 0,
                total INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS sale_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sale_id INTEGER NOT NULL,
                sku TEXT,
                name TEXT NOT NULL,
                price INTEGER NOT NULL DEFAULT 0,
                quantity INTEGER NOT NULL DEFAULT 0,
                line_total INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS customers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                default_shipping INTEGER NOT NULL DEFAULT 0,
                last_order_at TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                deposit_balance INTEGER NOT NULL DEFAULT 0,
                tag TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS customer_aliases (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_id INTEGER NOT NULL,
                alias TEXT NOT NULL,
                alias_key TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_id TEXT NOT NULL UNIQUE,
                sku TEXT NOT NULL DEFAULT '',
                name TEXT NOT NULL,
                price INTEGER NOT NULL DEFAULT 0,
                stock INTEGER NOT NULL DEFAULT 0,
                stock_unlimited INTEGER NOT NULL DEFAULT 0,
                category TEXT NOT NULL DEFAULT '',
                aliases TEXT NOT NULL DEFAULT '[]',
                source TEXT NOT NULL DEFAULT 'manual',
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS product_variants (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_id TEXT NOT NULL UNIQUE,
                product_client_id TEXT NOT NULL,
                name TEXT NOT NULL DEFAULT 'Normal',
                pricing_type TEXT NOT NULL DEFAULT 'fixed',
                price INTEGER NOT NULL DEFAULT 0,
                unit_name TEXT NOT NULL DEFAULT 'porsi',
                package_quantity INTEGER NOT NULL DEFAULT 1,
                package_unit TEXT NOT NULL DEFAULT '',
                receipt_label TEXT NOT NULL DEFAULT '',
                is_default INTEGER NOT NULL DEFAULT 0,
                allow_quantity_override INTEGER NOT NULL DEFAULT 1,
                allow_price_override INTEGER NOT NULL DEFAULT 0,
                stock INTEGER NOT NULL DEFAULT 0,
                stock_unlimited INTEGER NOT NULL DEFAULT 1,
                aliases TEXT NOT NULL DEFAULT '[]',
                sort_order INTEGER NOT NULL DEFAULT 0,
                active INTEGER NOT NULL DEFAULT 1,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (product_client_id) REFERENCES products(client_id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS sale_payments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sale_id INTEGER NOT NULL,
                amount INTEGER NOT NULL,
                payment_date TEXT NOT NULL,
                note TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_sales_completed_at ON sales(completed_at DESC);
            CREATE INDEX IF NOT EXISTS idx_sales_receipt_no_nocase ON sales(receipt_no COLLATE NOCASE);
            CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
            CREATE INDEX IF NOT EXISTS idx_sale_items_name_nocase ON sale_items(name COLLATE NOCASE);
            CREATE INDEX IF NOT EXISTS idx_customers_name_nocase ON customers(name COLLATE NOCASE);
            CREATE INDEX IF NOT EXISTS idx_customers_last_order_at ON customers(last_order_at DESC);
            CREATE INDEX IF NOT EXISTS idx_customer_aliases_customer_id ON customer_aliases(customer_id);
            CREATE INDEX IF NOT EXISTS idx_customer_aliases_alias_nocase ON customer_aliases(alias COLLATE NOCASE);
            CREATE INDEX IF NOT EXISTS idx_customer_aliases_alias_key ON customer_aliases(alias_key);
            CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
            CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
            CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_client_id);
            CREATE INDEX IF NOT EXISTS idx_product_variants_default ON product_variants(product_client_id, is_default);
            CREATE INDEX IF NOT EXISTS idx_sale_payments_sale_id ON sale_payments(sale_id);
            """
        )
        item_columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(sale_items)").fetchall()
        }
        if "note" not in item_columns:
            connection.execute("ALTER TABLE sale_items ADD COLUMN note TEXT NOT NULL DEFAULT ''")
        item_extra_columns = {
            "product_client_id": "TEXT NOT NULL DEFAULT ''",
            "variant_client_id": "TEXT NOT NULL DEFAULT ''",
            "menu_name": "TEXT NOT NULL DEFAULT ''",
            "variant_name": "TEXT NOT NULL DEFAULT ''",
            "unit_name": "TEXT NOT NULL DEFAULT ''",
            "unit_quantity": "INTEGER NOT NULL DEFAULT 0",
            "pricing_type": "TEXT NOT NULL DEFAULT ''",
            "receipt_label": "TEXT NOT NULL DEFAULT ''",
        }
        item_columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(sale_items)").fetchall()
        }
        for column, column_type in item_extra_columns.items():
            if column not in item_columns:
                connection.execute(f"ALTER TABLE sale_items ADD COLUMN {column} {column_type}")
        sale_columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(sales)").fetchall()
        }
        sale_extra_columns = {
            "customer_name": "TEXT NOT NULL DEFAULT ''",
            "customer_address": "TEXT NOT NULL DEFAULT ''",
            "order_note": "TEXT NOT NULL DEFAULT ''",
            "due_text": "TEXT NOT NULL DEFAULT ''",
            "chat_date": "TEXT NOT NULL DEFAULT ''",
            "deleted_at": "TEXT NOT NULL DEFAULT ''",
            "stock_restored_on_delete": "INTEGER NOT NULL DEFAULT 0",
            "paid_amount": "INTEGER NOT NULL DEFAULT 0",
        }
        for column, column_type in sale_extra_columns.items():
            if column not in sale_columns:
                connection.execute(f"ALTER TABLE sales ADD COLUMN {column} {column_type}")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_sales_deleted_completed_at ON sales(deleted_at, completed_at DESC)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_sales_customer_name_nocase ON sales(customer_name COLLATE NOCASE)")

        customer_columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(customers)").fetchall()
        }
        if "deposit_balance" not in customer_columns:
            connection.execute("ALTER TABLE customers ADD COLUMN deposit_balance INTEGER NOT NULL DEFAULT 0")
        if "tag" not in customer_columns:
            connection.execute("ALTER TABLE customers ADD COLUMN tag TEXT NOT NULL DEFAULT ''")

        payment_columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(sale_payments)").fetchall()
        }
        if "note" not in payment_columns:
            connection.execute("ALTER TABLE sale_payments ADD COLUMN note TEXT NOT NULL DEFAULT ''")
        if "created_at" not in payment_columns:
            connection.execute("ALTER TABLE sale_payments ADD COLUMN created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP")

        backfill_default_product_variants(connection)
        backfill_customers_from_sales(connection)
        backfill_customer_tags(connection)


def trigger_auto_backup():
    try:
        backup_dir = DB_PATH.parent / "backups"
        backup_dir.mkdir(exist_ok=True)

        for i in range(4, 0, -1):
            src = backup_dir / f"kasir-bento.backup-{i}.sqlite3"
            dst = backup_dir / f"kasir-bento.backup-{i+1}.sqlite3"
            if src.exists():
                if dst.exists():
                    dst.unlink()
                src.rename(dst)

        new_backup = backup_dir / "kasir-bento.backup-1.sqlite3"
        if DB_PATH.exists():
            shutil.copy2(DB_PATH, new_backup)
    except Exception as e:
        print(f"Error rotating backup: {e}", file=sys.stderr)



def customer_alias_key(value):
    return re.sub(r"[^0-9a-z]+", "", str(value or "").lower())


def split_alias_payload(value):
    if isinstance(value, list):
        items = value
    else:
        items = re.split(r"[,\n;]+", str(value or ""))

    aliases = []
    seen = set()
    for item in items:
        alias = str(item or "").strip()
        key = customer_alias_key(alias)
        if not alias or not key or key in seen:
            continue
        seen.add(key)
        aliases.append(alias)
    return aliases


CUSTOMER_ADDRESS_TAG_RULES = [
    (re.compile(r"\b(?:sutorejo|suto|sut)\s*(?:tengah|teng|tgh)\b|\bsutotengah\b|\bsutoteng\b|\bsutotgh\b"), "Sutorejo"),
    (re.compile(r"\b(?:sutorejo|suto|sut)\s*(?:selatan|sel)\b|\bsutoselatan\b|\bsutosel\b"), "Sutorejo"),
    (re.compile(r"\b(?:sutorejo|suto|sut)\s*(?:utara|ut)\b|\bsutoutara\b|\bsutout\b"), "Sutorejo"),
    (re.compile(r"\b(?:sutorejo|suto|sut)\s*(?:timur|tim)\b|\bsutotimur\b|\bsutotim\b"), "Sutorejo"),
    (re.compile(r"\bsutorejo\b|\bsuto\b|\banak\s*7\s*37\b|\bartha\s*catur\b"), "Sutorejo"),
    (re.compile(r"\bbpd\b"), "BPD"),
    (re.compile(r"\bmuly(?:o|osari)?\s*(?:tengah|tng|teng|tgh)\b|\bmulyotengah\b|\bmulyotng\b|\bmulyoteng\b|\bmulyotgh\b"), "Mulyosari"),
    (re.compile(r"\bmuly(?:o|osari)?\s*(?:utara|ut)\b|\bmulyoutara\b|\bmulyout\b"), "Mulyosari"),
    (re.compile(r"\bmulyosari\b|\bmulyo\b|\bmuly\b"), "Mulyosari"),
    (re.compile(r"\b(?:wisper|wis\s*per|spr)\b"), "Wisper"),
    (re.compile(r"\b(?:bhaskara|bhaska|bhas|bhsksari)\b|\bbu\s*bambang\s*gg\s*1\b|\bzainal\s*gg\s*3\b"), "Bhaskara"),
    (re.compile(r"\b(?:kenjeran|pantai\s*ment(?:ari|ri)|sahabudin|tuwowo|tohir|babatan|dupak(?:\s*pecah\s*belah)?|pecah\s*belah|ngadi|putro\s*agung)\b"), "Kenjeran"),
    (re.compile(r"\bkeputih\b|\bjoko\s*sukolilo\b"), "Keputih"),
    (re.compile(r"\bdharmahusada\b"), "Dharmahusada"),
    (re.compile(r"\bpakuwon\b|\b(?:puri|griya)\s*asri\b|\bvilla\s*royal\b|\broyal\s+[a-z]?\d\b|\bsan\s*(?:antonio|diego)\b|\bwestwood\b|\bflorence\b|\blaguna\b|\bmutiara\b|\bnenet\b"), "Pakuwon"),
    (re.compile(r"\bbumi\s*galaxy\s*permai\b|\bbumigalaxypermai\b|\bgalaxy\s*permai\b|\bsma\s*5\s*ratna\s*juli\b|\bsma5ratnajuli\b"), "Bumi Galaxy"),
    (re.compile(r"\bbumi\s*marina\b"), "Bumi Marina"),
    (re.compile(r"\brungkut\b"), "Rungkut"),
    (re.compile(r"\bmanyar\b"), "Manyar"),
    (re.compile(r"\bkalijudan\b"), "Kalijudan"),
    (re.compile(r"\bsupit\b"), "Supit"),
]

CUSTOMER_TAG_ALIASES = {
    "pakuwoncity": "Pakuwon",
    "puriasri": "Pakuwon",
    "griyaasri": "Pakuwon",
    "villaroyal": "Pakuwon",
    "royal": "Pakuwon",
    "sandiego": "Pakuwon",
    "sanantonio": "Pakuwon",
    "westwood": "Pakuwon",
    "florence": "Pakuwon",
    "laguna": "Pakuwon",
    "mutiara": "Pakuwon",
    "kenejeran": "Kenjeran",
    "pantaimentari": "Kenjeran",
    "pantaimentri": "Kenjeran",
    "pantainmentari": "Kenjeran",
    "sahabudin": "Kenjeran",
    "tuwowo": "Kenjeran",
    "tohir": "Kenjeran",
    "babatan": "Kenjeran",
    "dupak": "Kenjeran",
    "dupakpecahbelah": "Kenjeran",
    "pecahbelah": "Kenjeran",
    "ngadi": "Kenjeran",
    "putroagung": "Kenjeran",
}
CUSTOMER_ITS_BLOCK_PATTERN = re.compile(r"\b(?:its\s*)?(?:perum\s*)?(?:blok\s*)?(?:(p1)\s*[/ -]?\s*\d+|([tuvwjdnxmrficahb])(?!\s*o\s*\d)\s*(?:lama\s*)?(?:[/.-]|\s)*[a-z]?\s*\d+)\b")
CUSTOMER_ITS_FALLBACK_PATTERN = re.compile(r"\b(?:its|dptsi|bapkm|sdmo|dpsp|spkb|ftspk|wr\s*3|teknik|tek|t\s*lingkungan|lingku(?:ngan)?|arsitek(?:tur)?|bahasa|mesin|kimia|fisika|geofisika|statistika|mipa|instrumen(?:tasi)?|hidrodinamika|brin|nasdec|riset|research\s*center|gedung\s*riset|gedung\s*rc|rc\s*(?:lt|lantai)|perpus(?:takaan)?|manajemen\s*bisnis)\b")


def normalize_customer_tag(value):
    tag = re.sub(r"\s+", " ", str(value or "").strip())
    return CUSTOMER_TAG_ALIASES.get(customer_alias_key(tag), tag)


def customer_tag_search_text(*values):
    raw_text = " ".join(str(value or "").strip() for value in values if str(value or "").strip())
    spaced = re.sub(r"[^0-9a-z]+", " ", raw_text.lower()).strip()
    compact = customer_alias_key(raw_text)
    return f"{spaced} {compact}".strip()


def infer_customer_tag(*values):
    tag_text = customer_tag_search_text(*values)
    if not tag_text:
        return ""

    if CUSTOMER_ITS_FALLBACK_PATTERN.search(tag_text):
        return "ITS"

    for pattern, tag in CUSTOMER_ADDRESS_TAG_RULES:
        if pattern.search(tag_text):
            return tag

    block_match = CUSTOMER_ITS_BLOCK_PATTERN.search(tag_text)
    if block_match:
        return "ITS"
    return ""


def resolve_customer_tag(name, aliases=None, tag=""):
    return normalize_customer_tag(tag) or infer_customer_tag(name, *(aliases or []))


def fetch_customer_row(connection, customer_id):
    return connection.execute(
        """
        SELECT id, name, default_shipping, last_order_at, created_at, updated_at, deposit_balance, tag
        FROM customers
        WHERE id = ?
        """,
        (customer_id,),
    ).fetchone()


def get_customer_alias_map(connection, customer_ids):
    alias_map = {int(customer_id): [] for customer_id in customer_ids}
    if not customer_ids:
        return alias_map

    placeholders = ",".join("?" for _ in customer_ids)
    rows = connection.execute(
        f"""
        SELECT customer_id, alias
        FROM customer_aliases
        WHERE customer_id IN ({placeholders})
        ORDER BY alias COLLATE NOCASE ASC, id ASC
        """,
        [int(customer_id) for customer_id in customer_ids],
    ).fetchall()
    for row in rows:
        alias_map.setdefault(int(row["customer_id"]), []).append(row["alias"])
    return alias_map


def customer_to_dict(row, aliases=None):
    customer = dict(row)
    customer["aliases"] = aliases or []
    return customer


def add_customer_alias(connection, customer_id, alias):
    alias_text = str(alias or "").strip()
    key = customer_alias_key(alias_text)
    if not alias_text or not key:
        return

    customer = fetch_customer_row(connection, customer_id)
    if customer is None:
        return
    if key == customer_alias_key(customer["name"]):
        return

    connection.execute(
        """
        INSERT OR IGNORE INTO customer_aliases (customer_id, alias, alias_key, created_at)
        VALUES (?, ?, ?, ?)
        """,
        (customer_id, alias_text, key, utc_now_text()),
    )


def find_customer_by_name_or_alias(connection, name):
    customer_name = str(name or "").strip()
    key = customer_alias_key(customer_name)
    if not customer_name or not key:
        return None

    exact = connection.execute(
        """
        SELECT id, name, default_shipping, last_order_at, created_at, updated_at, deposit_balance, tag
        FROM customers
        WHERE LOWER(name) = LOWER(?)
        LIMIT 1
        """,
        (customer_name,),
    ).fetchone()
    if exact is not None:
        return exact

    alias = connection.execute(
        "SELECT customer_id FROM customer_aliases WHERE alias_key = ? LIMIT 1",
        (key,),
    ).fetchone()
    if alias is not None:
        return fetch_customer_row(connection, alias["customer_id"])

    rows = connection.execute(
        "SELECT id, name, default_shipping, last_order_at, created_at, updated_at, deposit_balance, tag FROM customers"
    ).fetchall()
    for row in rows:
        if customer_alias_key(row["name"]) == key:
            return row
    return None


def upsert_customer(connection, name, default_shipping=0, last_order_at=""):
    customer_name = str(name or "").strip()
    if not customer_name:
        return

    shipping = rupiah_number(default_shipping)
    order_at = str(last_order_at or utc_now_text()).strip()
    now = utc_now_text()
    customer_tag = infer_customer_tag(customer_name)
    existing = find_customer_by_name_or_alias(connection, customer_name)
    if existing is not None:
        connection.execute(
            """
            UPDATE customers
            SET default_shipping = CASE
                    WHEN COALESCE(last_order_at, '') = ''
                         OR ? >= last_order_at
                    THEN ?
                    ELSE default_shipping
                END,
                last_order_at = CASE
                    WHEN COALESCE(last_order_at, '') = ''
                         OR ? >= last_order_at
                    THEN ?
                    ELSE last_order_at
                END,
                tag = CASE
                    WHEN TRIM(COALESCE(tag, '')) = ''
                    THEN ?
                    ELSE tag
                END,
                updated_at = ?
            WHERE id = ?
            """,
            (order_at, shipping, order_at, order_at, customer_tag, now, existing["id"]),
        )
        add_customer_alias(connection, existing["id"], customer_name)
        return existing["id"]

    connection.execute(
        """
        INSERT INTO customers (name, default_shipping, last_order_at, created_at, updated_at, tag)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET
            default_shipping = CASE
                WHEN COALESCE(customers.last_order_at, '') = ''
                     OR excluded.last_order_at >= customers.last_order_at
                THEN excluded.default_shipping
                ELSE customers.default_shipping
            END,
            last_order_at = CASE
                WHEN COALESCE(customers.last_order_at, '') = ''
                     OR excluded.last_order_at >= customers.last_order_at
                THEN excluded.last_order_at
                ELSE customers.last_order_at
            END,
            tag = CASE
                WHEN TRIM(COALESCE(customers.tag, '')) = ''
                THEN excluded.tag
                ELSE customers.tag
            END,
            updated_at = ?
        """,
        (customer_name, shipping, order_at, now, now, customer_tag, now),
    )
    row = connection.execute("SELECT id FROM customers WHERE name = ?", (customer_name,)).fetchone()
    return row["id"] if row else None


def backfill_customers_from_sales(connection):
    rows = connection.execute(
        """
        SELECT customer_name, discount, completed_at
        FROM sales
        WHERE TRIM(COALESCE(customer_name, '')) != ''
          AND COALESCE(deleted_at, '') = ''
        ORDER BY completed_at ASC, id ASC
        """
    ).fetchall()
    for row in rows:
        upsert_customer(connection, row["customer_name"], row["discount"], row["completed_at"])


def backfill_customer_tags(connection):
    rows = connection.execute(
        """
        SELECT id, name, tag
        FROM customers
        WHERE TRIM(COALESCE(name, '')) != ''
        """
    ).fetchall()
    alias_map = get_customer_alias_map(connection, [row["id"] for row in rows])
    for row in rows:
        current_tag = normalize_customer_tag(row["tag"])
        tag = current_tag or infer_customer_tag(row["name"], *alias_map.get(row["id"], []))
        if tag and tag != row["tag"]:
            connection.execute(
                "UPDATE customers SET tag = ?, updated_at = ? WHERE id = ?",
                (tag, utc_now_text(), row["id"]),
            )


def rupiah_number(value):
    try:
        return max(0, int(round(float(value))))
    except (TypeError, ValueError):
        return 0


def receipt_date_key(payload):
    explicit_date = str(payload.get("receiptDateKey") or "").strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", explicit_date):
        return explicit_date.replace("-", "")

    completed_at = str(payload.get("completedAt") or "").strip()
    if re.match(r"^\d{4}-\d{2}-\d{2}", completed_at):
        return completed_at[:10].replace("-", "")

    return "00000000"


def next_receipt_number(connection, date_key):
    prefix = f"SH-{date_key}-"
    row = connection.execute(
        """
        SELECT receipt_no
        FROM sales
        WHERE receipt_no LIKE ?
        ORDER BY receipt_no DESC
        LIMIT 1
        """,
        (f"{prefix}%",),
    ).fetchone()

    next_number = 1
    if row:
        suffix = str(row["receipt_no"]).removeprefix(prefix)
        if suffix.isdigit():
            next_number = int(suffix) + 1

    return f"{prefix}{next_number:04d}"


def normalize_aliases(value):
    if isinstance(value, list):
        items = value
    else:
        text = str(value or "").strip()
        if not text:
            return []
        try:
            parsed = json.loads(text)
            items = parsed if isinstance(parsed, list) else [text]
        except json.JSONDecodeError:
            items = re.split(r"[,\n;]+", text)

    aliases = []
    seen = set()
    for item in items:
        alias = str(item or "").strip()
        key = re.sub(r"[\s_-]+", "", alias.lower())
        if not alias or key in seen:
            continue
        seen.add(key)
        aliases.append(alias)
    return aliases


VARIANT_PRICING_TYPES = {"fixed", "unit", "package", "custom"}


def bool_int(value, default=0):
    if value is None:
        return 1 if default else 0
    if isinstance(value, str):
        return 1 if value.strip().lower() in {"1", "true", "yes", "ya", "on"} else 0
    return 1 if value else 0


def normalize_pricing_type(value):
    key = str(value or "").strip().lower().replace("-", "_")
    aliases = {
        "harga_tetap": "fixed",
        "fixed_price": "fixed",
        "per_satuan": "unit",
        "per_unit": "unit",
        "satuan": "unit",
        "bijian": "unit",
        "paket": "package",
        "manual": "custom",
        "harga_custom": "custom",
        "custom_price": "custom",
    }
    key = aliases.get(key, key)
    return key if key in VARIANT_PRICING_TYPES else "fixed"


def normalize_variant_suffix(name):
    text = str(name or "").strip()
    match = re.match(r"^(.+?)\s+(1/2|setengah|separuh|jumbo)$", text, re.IGNORECASE)
    if not match:
        return None
    parent_name = match.group(1).strip()
    raw_variant = match.group(2).strip().lower()
    variant_name = "1/2" if raw_variant in {"1/2", "setengah", "separuh"} else "Jumbo"
    receipt_label = "1/2 porsi" if variant_name == "1/2" else "Jumbo"
    return parent_name, variant_name, receipt_label


def default_variant_client_id(product_client_id):
    return f"{product_client_id}::normal"


def half_variant_client_id(product_client_id):
    return f"{product_client_id}::half"


def custom_variant_client_id(product_client_id):
    return f"{product_client_id}::custom"


def half_variant_price(price):
    amount = rupiah_number(price)
    return (amount + 1) // 2


def base_variant_kind(variant, product_client_id):
    client_id = str(variant.get("client_id") or variant.get("id") or "").strip()
    key = re.sub(r"[\s_-]+", "", str(variant.get("name") or "").strip().lower())
    if client_id == default_variant_client_id(product_client_id) or key == "normal":
        return "normal"
    if client_id == half_variant_client_id(product_client_id) or key in {"1/2", "setengah", "separuh", "halfporsi", "1/2porsi"}:
        return "half"
    if client_id == custom_variant_client_id(product_client_id) or key in {"custom", "custominput", "hargacustom", "manual"}:
        return "custom"
    return ""


def variant_from_row(row):
    variant = dict(row)
    return {
        "id": variant["client_id"],
        "client_id": variant["client_id"],
        "productId": variant["product_client_id"],
        "product_client_id": variant["product_client_id"],
        "name": variant["name"],
        "pricingType": variant["pricing_type"],
        "pricing_type": variant["pricing_type"],
        "price": variant["price"],
        "unitName": variant["unit_name"],
        "unit_name": variant["unit_name"],
        "packageQuantity": variant["package_quantity"],
        "package_quantity": variant["package_quantity"],
        "packageUnit": variant["package_unit"],
        "package_unit": variant["package_unit"],
        "receiptLabel": variant["receipt_label"],
        "receipt_label": variant["receipt_label"],
        "isDefault": bool(variant["is_default"]),
        "is_default": bool(variant["is_default"]),
        "allowQuantityOverride": bool(variant["allow_quantity_override"]),
        "allow_quantity_override": bool(variant["allow_quantity_override"]),
        "allowPriceOverride": bool(variant["allow_price_override"]),
        "allow_price_override": bool(variant["allow_price_override"]),
        "stock": variant["stock"],
        "stockUnlimited": bool(variant["stock_unlimited"]),
        "stock_unlimited": bool(variant["stock_unlimited"]),
        "aliases": normalize_aliases(variant["aliases"]),
        "sortOrder": variant["sort_order"],
        "sort_order": variant["sort_order"],
        "active": bool(variant["active"]),
        "updatedAt": variant["updated_at"],
    }


def product_from_row(row, variants=None):
    product = dict(row)
    product_payload = {
        "id": product["client_id"],
        "client_id": product["client_id"],
        "sku": product["sku"],
        "name": product["name"],
        "price": product["price"],
        "stock": product["stock"],
        "stockUnlimited": bool(product["stock_unlimited"]),
        "category": product["category"],
        "aliases": normalize_aliases(product["aliases"]),
        "source": product["source"],
        "updatedAt": product["updated_at"],
    }
    product_payload["variants"] = variants or []
    return product_payload


def sanitize_variant_payload(product, variant, index=0, force_default=False, allow_zero_price=False):
    variant = variant if isinstance(variant, dict) else {}
    product_client_id = product["client_id"]
    pricing_type = normalize_pricing_type(variant.get("pricingType") or variant.get("pricing_type"))
    name = str(variant.get("name") or ("Normal" if force_default or index == 0 else f"Variasi {index + 1}")).strip() or "Normal"
    price = rupiah_number(variant.get("price"))
    if pricing_type == "custom":
        price = 0
    if price <= 0 and pricing_type != "custom":
        price = rupiah_number(product.get("price"))
    if price <= 0 and pricing_type != "custom" and not allow_zero_price:
        return None

    client_id = str(variant.get("id") or variant.get("client_id") or "").strip()
    if not client_id:
        suffix = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or f"variant-{index + 1}"
        client_id = default_variant_client_id(product_client_id) if force_default or index == 0 else f"{product_client_id}::{suffix}"

    stock_unlimited = bool_int(
        variant.get("stockUnlimited")
        if variant.get("stockUnlimited") is not None
        else variant.get("stock_unlimited", product.get("stock_unlimited", 1)),
        default=1,
    )
    package_quantity = rupiah_number(variant.get("packageQuantity") if variant.get("packageQuantity") is not None else variant.get("package_quantity"))
    unit_name = str(variant.get("unitName") or variant.get("unit_name") or ("biji" if pricing_type == "unit" else "porsi")).strip() or "porsi"
    package_unit = str(variant.get("packageUnit") or variant.get("package_unit") or unit_name).strip()

    return {
        "client_id": client_id,
        "product_client_id": product_client_id,
        "name": name,
        "pricing_type": pricing_type,
        "price": price,
        "unit_name": unit_name,
        "package_quantity": max(1, package_quantity or 1),
        "package_unit": package_unit,
        "receipt_label": str(variant.get("receiptLabel") or variant.get("receipt_label") or ("" if name.lower() == "normal" else name)).strip(),
        "is_default": 1 if force_default or variant.get("isDefault") or variant.get("is_default") else 0,
        "allow_quantity_override": bool_int(
            variant.get("allowQuantityOverride")
            if variant.get("allowQuantityOverride") is not None
            else variant.get("allow_quantity_override", 1),
            default=1,
        ),
        "allow_price_override": bool_int(
            variant.get("allowPriceOverride")
            if variant.get("allowPriceOverride") is not None
            else variant.get("allow_price_override", pricing_type == "custom"),
            default=1 if pricing_type == "custom" else 0,
        ),
        "stock": 0 if stock_unlimited else rupiah_number(variant.get("stock")),
        "stock_unlimited": stock_unlimited,
        "aliases": json.dumps(normalize_aliases(variant.get("aliases") or variant.get("alias")), ensure_ascii=False),
        "sort_order": rupiah_number(variant.get("sortOrder") if variant.get("sortOrder") is not None else variant.get("sort_order", index)),
        "active": bool_int(variant.get("active", 1), default=1),
    }


def ensure_base_product_variants(product, variants):
    product_client_id = product["client_id"]
    existing_by_kind = {}
    other_variants = []

    for variant in variants:
        if not variant:
            continue
        variant = dict(variant)
        if variant.get("pricing_type") == "custom":
            variant["price"] = 0
            variant["allow_price_override"] = 1
        kind = base_variant_kind(variant, product_client_id)
        if kind and kind not in existing_by_kind:
            existing_by_kind[kind] = variant
        elif not kind:
            other_variants.append(variant)

    normal_seed = existing_by_kind.get("normal")
    if not normal_seed:
        normal_seed = next((variant for variant in variants if variant and variant.get("is_default")), None)
    if not normal_seed:
        normal_seed = next((variant for variant in variants if variant), None)
    normal_price = rupiah_number((normal_seed or {}).get("price"))
    if normal_price <= 0:
        normal_price = rupiah_number(product.get("price"))

    base_specs = [
        (
            "normal",
            {
                **existing_by_kind.get("normal", {}),
                "id": default_variant_client_id(product_client_id),
                "client_id": default_variant_client_id(product_client_id),
                "name": "Normal",
                "pricingType": "fixed",
                "pricing_type": "fixed",
                "price": normal_price,
                "unitName": "porsi",
                "unit_name": "porsi",
                "receiptLabel": "",
                "receipt_label": "",
                "isDefault": True,
                "is_default": 1,
                "allowPriceOverride": False,
                "allow_price_override": 0,
                "active": 1,
            },
        ),
        (
            "half",
            {
                **existing_by_kind.get("half", {}),
                "id": half_variant_client_id(product_client_id),
                "client_id": half_variant_client_id(product_client_id),
                "name": "1/2",
                "pricingType": "fixed",
                "pricing_type": "fixed",
                "price": half_variant_price(normal_price),
                "unitName": "porsi",
                "unit_name": "porsi",
                "receiptLabel": "1/2 porsi",
                "receipt_label": "1/2 porsi",
                "isDefault": False,
                "is_default": 0,
                "allowPriceOverride": False,
                "allow_price_override": 0,
                "active": 1,
            },
        ),
        (
            "custom",
            {
                **existing_by_kind.get("custom", {}),
                "id": custom_variant_client_id(product_client_id),
                "client_id": custom_variant_client_id(product_client_id),
                "name": "Custom input",
                "pricingType": "custom",
                "pricing_type": "custom",
                "price": 0,
                "unitName": "porsi",
                "unit_name": "porsi",
                "receiptLabel": "Harga custom",
                "receipt_label": "Harga custom",
                "isDefault": False,
                "is_default": 0,
                "allowPriceOverride": True,
                "allow_price_override": 1,
                "active": 1,
            },
        ),
    ]

    arranged = []
    for index, (_, payload) in enumerate(base_specs):
        sanitized = sanitize_variant_payload(product, payload, index, force_default=index == 0, allow_zero_price=True)
        if sanitized:
            arranged.append(sanitized)

    arranged.extend(other_variants)
    for index, variant in enumerate(arranged):
        variant["product_client_id"] = product_client_id
        variant["sort_order"] = index
        variant["is_default"] = 1 if variant["client_id"] == default_variant_client_id(product_client_id) else 0
        if variant["pricing_type"] == "custom":
            variant["price"] = 0
            variant["allow_price_override"] = 1
    return arranged


def sanitize_product_payload(product):
    if not isinstance(product, dict):
        return None

    name = str(product.get("name") or "").strip()
    variants_input = product.get("variants") if isinstance(product.get("variants"), list) else []
    price = rupiah_number(product.get("price"))
    if not name:
        return None

    client_id = str(product.get("id") or product.get("client_id") or "").strip()
    if not client_id:
        client_id = f"sql-{re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')}-{price or 'menu'}"

    stock_unlimited = 1 if product.get("stockUnlimited") or product.get("stock_unlimited") or product.get("unlimitedStock") else 0
    sanitized_product = {
        "client_id": client_id,
        "sku": str(product.get("sku") or "").strip(),
        "name": name,
        "price": price,
        "stock": 0 if stock_unlimited else rupiah_number(product.get("stock")),
        "stock_unlimited": stock_unlimited,
        "category": str(product.get("category") or "").strip(),
        "aliases": json.dumps(normalize_aliases(product.get("aliases") or product.get("alias")), ensure_ascii=False),
        "source": str(product.get("source") or "manual").strip() or "manual",
    }
    sanitized_variants = [
        sanitize_variant_payload(sanitized_product, variant, index)
        for index, variant in enumerate(variants_input)
    ]
    sanitized_variants = [variant for variant in sanitized_variants if variant]
    sanitized_variants = ensure_base_product_variants(sanitized_product, sanitized_variants)
    if not sanitized_variants:
        return None

    default_seen = False
    for index, variant in enumerate(sanitized_variants):
        if variant["is_default"] and not default_seen:
            default_seen = True
        elif variant["is_default"]:
            variant["is_default"] = 0
        variant["sort_order"] = index
    if not default_seen:
        sanitized_variants[0]["is_default"] = 1

    default_variant = next((variant for variant in sanitized_variants if variant["is_default"]), sanitized_variants[0])
    if default_variant["price"] > 0:
        sanitized_product["price"] = default_variant["price"]
    return {"product": sanitized_product, "variants": sanitized_variants}


def backfill_default_product_variants(connection):
    rows = connection.execute(
        """
        SELECT id, client_id, sku, name, price, stock, stock_unlimited, category, aliases, source, updated_at
        FROM products
        ORDER BY id ASC
        """
    ).fetchall()
    products = [dict(row) for row in rows]
    by_name = {re.sub(r"\s+", " ", product["name"].strip()).lower(): product for product in products}
    now = utc_now_text()

    for product in products:
        variant_parts = normalize_variant_suffix(product["name"])
        if not variant_parts:
            continue
        parent_name, variant_name, receipt_label = variant_parts
        parent = by_name.get(re.sub(r"\s+", " ", parent_name).lower())
        if not parent or parent["client_id"] == product["client_id"]:
            continue

        exists = connection.execute(
            "SELECT 1 FROM product_variants WHERE client_id = ?",
            (product["client_id"],),
        ).fetchone()
        if not exists:
            connection.execute(
                """
                INSERT INTO product_variants (
                    client_id, product_client_id, name, pricing_type, price, unit_name,
                    package_quantity, package_unit, receipt_label, is_default,
                    allow_quantity_override, allow_price_override, stock, stock_unlimited,
                    aliases, sort_order, active, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    product["client_id"],
                    parent["client_id"],
                    variant_name,
                    "fixed",
                    product["price"],
                    "porsi",
                    1,
                    "porsi",
                    receipt_label,
                    0,
                    1,
                    0,
                    product["stock"],
                    product["stock_unlimited"],
                    product["aliases"],
                    10,
                    1,
                    now,
                ),
            )
        connection.execute("DELETE FROM products WHERE client_id = ?", (product["client_id"],))

    product_rows = connection.execute(
        """
        SELECT client_id, name, price, stock, stock_unlimited, aliases, category, sku, source
        FROM products
        ORDER BY id ASC
        """
    ).fetchall()
    for product_row in product_rows:
        product = dict(product_row)
        variant_rows = connection.execute(
            """
            SELECT client_id, product_client_id, name, pricing_type, price, unit_name,
                   package_quantity, package_unit, receipt_label, is_default,
                   allow_quantity_override, allow_price_override, stock, stock_unlimited,
                   aliases, sort_order, active, updated_at
            FROM product_variants
            WHERE product_client_id = ?
            ORDER BY sort_order ASC, id ASC
            """,
            (product["client_id"],),
        ).fetchall()
        variants = ensure_base_product_variants(product, [dict(row) for row in variant_rows])
        default_variant = next((variant for variant in variants if variant["is_default"]), variants[0] if variants else None)
        if default_variant and default_variant["price"] > 0 and product["price"] != default_variant["price"]:
            connection.execute(
                "UPDATE products SET price = ?, updated_at = ? WHERE client_id = ?",
                (default_variant["price"], now, product["client_id"]),
            )
            product["price"] = default_variant["price"]

        connection.execute("DELETE FROM product_variants WHERE product_client_id = ?", (product["client_id"],))
        connection.executemany(
            """
            INSERT INTO product_variants (
                client_id, product_client_id, name, pricing_type, price, unit_name,
                package_quantity, package_unit, receipt_label, is_default,
                allow_quantity_override, allow_price_override, stock, stock_unlimited,
                aliases, sort_order, active, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    variant["client_id"],
                    variant["product_client_id"],
                    variant["name"],
                    variant["pricing_type"],
                    variant["price"],
                    variant["unit_name"],
                    variant["package_quantity"],
                    variant["package_unit"],
                    variant["receipt_label"],
                    variant["is_default"],
                    variant["allow_quantity_override"],
                    variant["allow_price_override"],
                    variant["stock"],
                    variant["stock_unlimited"],
                    variant["aliases"],
                    variant["sort_order"],
                    variant["active"],
                    now,
                )
                for variant in variants
            ],
        )


class CashierHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        if self.path == "/" or self.path.startswith("/index.html") or self.path.startswith("/service-worker.js"):
            self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/products":
            self.handle_list_products()
            return
        if path == "/api/sales":
            self.handle_list_sales()
            return
        if path == "/api/customers":
            self.handle_list_customers()
            return
        if path == "/api/backup/database":
            self.handle_backup_database()
            return
        if path == "/api/health":
            self.send_json({"ok": True, "database": str(DB_PATH.name)})
            return
        super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/sales":
            self.handle_create_sale()
            return
        if path == "/api/customers":
            self.handle_create_customer()
            return
        if path == "/api/customers/merge":
            self.handle_merge_customers()
            return
        if path == "/api/backup/restore":
            self.handle_restore_database()
            return
        if path.startswith("/api/sales/") and path.endswith("/restore"):
            self.handle_restore_sale(path)
            return
        if path.startswith("/api/sales/") and path.endswith("/payments"):
            self.handle_add_sale_payment(path)
            return
        if path.startswith("/api/sales/") and path.endswith("/revoke-lunas"):
            self.handle_revoke_sale_payments(path)
            return
        self.send_error(404, "Not found")

    def do_PUT(self):
        path = urlparse(self.path).path
        if path == "/api/products":
            self.handle_save_products()
            return
        if path.startswith("/api/customers/"):
            self.handle_update_customer(path)
            return
        if path.startswith("/api/sales/"):
            self.handle_update_sale(path)
            return
        self.send_error(404, "Not found")

    def do_DELETE(self):
        path = urlparse(self.path).path
        if path == "/api/products":
            self.handle_clear_products()
            return
        if path.startswith("/api/customers/"):
            self.handle_delete_customer(path)
            return
        if path.startswith("/api/sales/"):
            self.handle_delete_sale(path)
            return
        self.send_error(404, "Not found")

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            return {}
        raw_body = self.rfile.read(length)
        return json.loads(raw_body.decode("utf-8"))

    def send_file(self, path, filename, content_type):
        if not path.exists():
            self.send_json({"error": "File backup belum tersedia."}, status=404)
            return

        body = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def handle_list_products(self):
        init_database()
        with get_connection() as connection:
            rows = connection.execute(
                """
                SELECT client_id, sku, name, price, stock, stock_unlimited, category, aliases, source, updated_at
                FROM products
                ORDER BY name COLLATE NOCASE ASC, price ASC, id ASC
                """
            ).fetchall()
            variant_rows = connection.execute(
                """
                SELECT client_id, product_client_id, name, pricing_type, price, unit_name,
                       package_quantity, package_unit, receipt_label, is_default,
                       allow_quantity_override, allow_price_override, stock, stock_unlimited,
                       aliases, sort_order, active, updated_at
                FROM product_variants
                ORDER BY product_client_id ASC, sort_order ASC, id ASC
                """
            ).fetchall()

        variants_by_product = {}
        for row in variant_rows:
            variant = variant_from_row(row)
            variants_by_product.setdefault(variant["product_client_id"], []).append(variant)

        self.send_json({"products": [product_from_row(row, variants_by_product.get(row["client_id"], [])) for row in rows]})

    def handle_save_products(self):
        try:
            payload = self.read_json()
        except json.JSONDecodeError:
            self.send_json({"error": "Data barang tidak valid."}, status=400)
            return

        products = payload.get("products") if isinstance(payload, dict) else None
        if not isinstance(products, list):
            self.send_json({"error": "Payload barang harus berisi daftar products."}, status=400)
            return

        sanitized_payloads = [sanitize_product_payload(product) for product in products]
        sanitized_payloads = [payload for payload in sanitized_payloads if payload]
        now = utc_now_text()

        with get_connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute("DELETE FROM product_variants")
            connection.execute("DELETE FROM products")
            connection.executemany(
                """
                INSERT INTO products (
                    client_id, sku, name, price, stock, stock_unlimited, category, aliases, source, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        product["client_id"],
                        product["sku"],
                        product["name"],
                        product["price"],
                        product["stock"],
                        product["stock_unlimited"],
                        product["category"],
                        product["aliases"],
                        product["source"],
                        now,
                    )
                    for product in (payload["product"] for payload in sanitized_payloads)
                ],
            )
            variant_values = []
            for payload in sanitized_payloads:
                for variant in payload["variants"]:
                    variant_values.append(
                        (
                            variant["client_id"],
                            variant["product_client_id"],
                            variant["name"],
                            variant["pricing_type"],
                            variant["price"],
                            variant["unit_name"],
                            variant["package_quantity"],
                            variant["package_unit"],
                            variant["receipt_label"],
                            variant["is_default"],
                            variant["allow_quantity_override"],
                            variant["allow_price_override"],
                            variant["stock"],
                            variant["stock_unlimited"],
                            variant["aliases"],
                            variant["sort_order"],
                            variant["active"],
                            now,
                        )
                    )
            connection.executemany(
                """
                INSERT INTO product_variants (
                    client_id, product_client_id, name, pricing_type, price, unit_name,
                    package_quantity, package_unit, receipt_label, is_default,
                    allow_quantity_override, allow_price_override, stock, stock_unlimited,
                    aliases, sort_order, active, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                variant_values,
            )

        self.send_json({"ok": True, "count": len(sanitized_payloads), "variantCount": len(variant_values)})

    def handle_clear_products(self):
        with get_connection() as connection:
            connection.execute("DELETE FROM product_variants")
            connection.execute("DELETE FROM products")
        self.send_json({"ok": True, "count": 0})

    def handle_backup_database(self):
        init_database()
        self.send_file(DB_PATH, "backup-kasir-shanti-catering.sqlite3", "application/vnd.sqlite3")

    def handle_restore_database(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            self.send_json({"error": "File backup kosong."}, status=400)
            return

        body = self.rfile.read(length)
        temp_path = DB_PATH.with_suffix(".restore.tmp")
        safety_path = DB_PATH.with_suffix(".before-restore.sqlite3")
        temp_path.write_bytes(body)

        try:
            with sqlite3.connect(temp_path) as connection:
                integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
                if integrity != "ok":
                    raise ValueError("File SQLite tidak valid.")
                tables = {
                    row[0]
                    for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
                }
                if "sales" not in tables or "sale_items" not in tables:
                    raise ValueError("Backup bukan database kasir yang lengkap.")
        except (sqlite3.DatabaseError, ValueError) as error:
            temp_path.unlink(missing_ok=True)
            self.send_json({"error": str(error) or "File backup tidak bisa dibaca."}, status=400)
            return

        if DB_PATH.exists():
            shutil.copy2(DB_PATH, safety_path)
        temp_path.replace(DB_PATH)
        init_database()
        self.send_json({"ok": True, "message": "Backup database berhasil direstore."})

    def handle_list_sales(self):
        query = parse_qs(urlparse(self.path).query)
        limit = min(max(int(query.get("limit", ["50"])[0]), 1), 1000)
        include_deleted = query.get("includeDeleted", ["0"])[0] in {"1", "true", "yes"}

        with get_connection() as connection:
            sales_rows = connection.execute(
                """
                SELECT id, receipt_no, completed_at, store_name, payment, subtotal, discount, tax, total,
                       customer_name, customer_address, order_note, due_text, chat_date,
                       deleted_at, stock_restored_on_delete, paid_amount
                FROM sales
                WHERE (? OR COALESCE(deleted_at, '') = '')
                ORDER BY completed_at DESC, id DESC
                LIMIT ?
                """,
                (1 if include_deleted else 0, limit),
            ).fetchall()

            sale_ids = [row["id"] for row in sales_rows]
            items_by_sale = {sale_id: [] for sale_id in sale_ids}
            payments_by_sale = {sale_id: [] for sale_id in sale_ids}
            if sale_ids:
                placeholders = ",".join("?" for _ in sale_ids)
                item_rows = connection.execute(
                    f"""
                    SELECT sale_id, sku, name, price, quantity, line_total, note,
                           product_client_id, variant_client_id, menu_name, variant_name,
                           unit_name, unit_quantity, pricing_type, receipt_label
                    FROM sale_items
                    WHERE sale_id IN ({placeholders})
                    ORDER BY id ASC
                    """,
                    sale_ids,
                ).fetchall()
                for item in item_rows:
                    items_by_sale[item["sale_id"]].append(dict(item))

                payment_rows = connection.execute(
                    f"""
                    SELECT id, sale_id, amount, payment_date, note, created_at
                    FROM sale_payments
                    WHERE sale_id IN ({placeholders})
                    ORDER BY id ASC
                    """,
                    sale_ids,
                ).fetchall()
                for pay in payment_rows:
                    payments_by_sale[pay["sale_id"]].append(dict(pay))

            totals = connection.execute(
                """
                SELECT
                    SUM(CASE WHEN COALESCE(deleted_at, '') = '' THEN 1 ELSE 0 END) AS count,
                    COALESCE(SUM(CASE WHEN COALESCE(deleted_at, '') = '' THEN total ELSE 0 END), 0) AS revenue,
                    SUM(CASE WHEN COALESCE(deleted_at, '') != '' THEN 1 ELSE 0 END) AS deleted_count
                FROM sales
                """
            ).fetchone()

        sales = []
        for row in sales_rows:
            sale = dict(row)
            sale["items"] = items_by_sale.get(row["id"], [])
            pays = payments_by_sale.get(row["id"], [])
            sale["payments"] = pays
            sale["usedDeposit"] = sum(pay["amount"] for pay in pays if pay["note"] == "Otomatis Potong Deposit")
            sales.append(sale)

        self.send_json(
            {
                "sales": sales,
                "summary": {
                    "totalSales": totals["count"],
                    "totalRevenue": totals["revenue"],
                    "deletedSales": totals["deleted_count"],
                },
            }
        )

    def handle_list_customers(self):
        query = parse_qs(urlparse(self.path).query)
        limit = min(max(int(query.get("limit", ["300"])[0]), 1), 500)
        search = str(query.get("q", [""])[0] or "").strip()
        search_key = customer_alias_key(search)

        with get_connection() as connection:
            if search:
                rows = connection.execute(
                    """
                    SELECT id, name, default_shipping, last_order_at, created_at, updated_at, deposit_balance, tag
                    FROM customers
                    WHERE TRIM(COALESCE(name, '')) != ''
                    ORDER BY COALESCE(last_order_at, '') DESC, name ASC
                    """,
                ).fetchall()
            else:
                rows = connection.execute(
                    """
                    SELECT id, name, default_shipping, last_order_at, created_at, updated_at, deposit_balance, tag
                    FROM customers
                    WHERE TRIM(COALESCE(name, '')) != ''
                    ORDER BY COALESCE(last_order_at, '') DESC, name ASC
                    LIMIT ?
                    """,
                    (limit,),
                ).fetchall()
            alias_map = get_customer_alias_map(connection, [row["id"] for row in rows])

        customers = [customer_to_dict(row, alias_map.get(row["id"], [])) for row in rows]
        if search:
            search_text = search.lower()
            customers = [
                customer
                for customer in customers
                if search_text in str(customer["name"]).lower()
                or search_text in str(customer.get("tag", "")).lower()
                or any(search_text in str(alias).lower() for alias in customer["aliases"])
                or (search_key and search_key in customer_alias_key(customer["name"]))
                or (search_key and search_key in customer_alias_key(customer.get("tag", "")))
                or any(search_key and search_key in customer_alias_key(alias) for alias in customer["aliases"])
            ]

        self.send_json({"customers": customers[:limit]})

    def handle_create_customer(self):
        try:
            payload = self.read_json()
        except json.JSONDecodeError:
            self.send_json({"error": "Data customer tidak valid."}, status=400)
            return

        if not isinstance(payload, dict):
            self.send_json({"error": "Data customer tidak valid."}, status=400)
            return

        customer_name = str(payload.get("name") or payload.get("customerName") or "").strip()
        if not customer_name:
            self.send_json({"error": "Nama customer tidak boleh kosong."}, status=400)
            return

        shipping_source = payload.get("defaultShipping")
        if shipping_source is None:
            shipping_source = payload.get("default_shipping")
        if shipping_source is None:
            shipping_source = payload.get("shipping")
        shipping = rupiah_number(shipping_source)
        aliases = split_alias_payload(payload.get("aliases"))
        customer_tag = resolve_customer_tag(customer_name, aliases, payload.get("tag") or payload.get("customerTag") or payload.get("address_tag") or payload.get("addressTag"))

        deposit_source = payload.get("depositBalance")
        if deposit_source is None:
            deposit_source = payload.get("deposit_balance")
        deposit = rupiah_number(deposit_source) if deposit_source is not None else 0

        try:
            with get_connection() as connection:
                connection.execute("BEGIN IMMEDIATE")
                if find_customer_by_name_or_alias(connection, customer_name) is not None:
                    self.send_json({"error": "Customer sudah ada di data customer."}, status=409)
                    return

                for alias in aliases:
                    if find_customer_by_name_or_alias(connection, alias) is not None:
                        self.send_json({"error": f"Alias {alias} sudah dipakai customer lain."}, status=409)
                        return

                now = utc_now_text()
                cursor = connection.execute(
                    """
                    INSERT INTO customers (name, default_shipping, last_order_at, created_at, updated_at, deposit_balance, tag)
                    VALUES (?, ?, '', ?, ?, ?, ?)
                    """,
                    (customer_name, shipping, now, now, deposit, customer_tag),
                )
                customer_id = cursor.lastrowid
                for alias in aliases:
                    add_customer_alias(connection, customer_id, alias)

                row = fetch_customer_row(connection, customer_id)
                alias_map = get_customer_alias_map(connection, [customer_id])
        except sqlite3.IntegrityError:
            self.send_json({"error": "Customer atau alias sudah ada."}, status=409)
            return

        self.send_json({"ok": True, "customer": customer_to_dict(row, alias_map.get(customer_id, []))}, status=201)

    def handle_update_customer(self, path):
        customer_id_value = path.removeprefix("/api/customers/").strip("/")
        try:
            customer_id = int(customer_id_value)
        except ValueError:
            self.send_json({"error": "ID customer tidak valid."}, status=400)
            return

        try:
            payload = self.read_json()
        except json.JSONDecodeError:
            self.send_json({"error": "Data customer tidak valid."}, status=400)
            return

        if not isinstance(payload, dict):
            self.send_json({"error": "Data customer tidak valid."}, status=400)
            return

        customer_name = str(payload.get("name") or payload.get("customerName") or "").strip()
        if not customer_name:
            self.send_json({"error": "Nama customer tidak boleh kosong."}, status=400)
            return

        shipping_source = payload.get("defaultShipping")
        if shipping_source is None:
            shipping_source = payload.get("default_shipping")
        if shipping_source is None:
            shipping_source = payload.get("shipping")
        shipping = rupiah_number(shipping_source)
        customer_tag = resolve_customer_tag(customer_name, [], payload.get("tag") or payload.get("customerTag") or payload.get("address_tag") or payload.get("addressTag"))

        deposit_source = payload.get("depositBalance")
        if deposit_source is None:
            deposit_source = payload.get("deposit_balance")
        deposit_balance = rupiah_number(deposit_source) if deposit_source is not None else None

        try:
            with get_connection() as connection:
                connection.execute("BEGIN IMMEDIATE")
                existing = connection.execute(
                    """
                    SELECT id, name
                    FROM customers
                    WHERE id = ?
                    """,
                    (customer_id,),
                ).fetchone()
                if existing is None:
                    self.send_json({"error": "Customer tidak ditemukan."}, status=404)
                    return

                matched = find_customer_by_name_or_alias(connection, customer_name)
                if matched is not None and int(matched["id"]) != customer_id:
                    self.send_json({"error": "Nama customer sudah dipakai data lain."}, status=409)
                    return

                if deposit_balance is not None:
                    connection.execute(
                        """
                        UPDATE customers
                        SET name = ?, default_shipping = ?, deposit_balance = ?, tag = ?, updated_at = ?
                        WHERE id = ?
                        """,
                        (customer_name, shipping, deposit_balance, customer_tag, utc_now_text(), customer_id),
                    )
                else:
                    connection.execute(
                        """
                        UPDATE customers
                        SET name = ?, default_shipping = ?, tag = ?, updated_at = ?
                        WHERE id = ?
                        """,
                        (customer_name, shipping, customer_tag, utc_now_text(), customer_id),
                    )
                add_customer_alias(connection, customer_id, existing["name"])
                updated = fetch_customer_row(connection, customer_id)
                alias_map = get_customer_alias_map(connection, [customer_id])
        except sqlite3.IntegrityError:
            self.send_json({"error": "Nama customer sudah ada."}, status=409)
            return

        self.send_json({"ok": True, "customer": customer_to_dict(updated, alias_map.get(customer_id, []))})

    def handle_delete_customer(self, path):
        customer_id_value = path.removeprefix("/api/customers/").strip("/")
        try:
            customer_id = int(customer_id_value)
        except ValueError:
            self.send_json({"error": "ID customer tidak valid."}, status=400)
            return

        with get_connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            existing = fetch_customer_row(connection, customer_id)
            if existing is None:
                self.send_json({"error": "Customer tidak ditemukan."}, status=404)
                return

            connection.execute("DELETE FROM customers WHERE id = ?", (customer_id,))

        self.send_json({"ok": True, "customerId": customer_id, "name": existing["name"]})

    def handle_merge_customers(self):
        try:
            payload = self.read_json()
        except json.JSONDecodeError:
            self.send_json({"error": "Data merge customer tidak valid."}, status=400)
            return

        if not isinstance(payload, dict):
            self.send_json({"error": "Data merge customer tidak valid."}, status=400)
            return

        try:
            target_id = int(payload.get("targetId") or payload.get("target_id"))
        except (TypeError, ValueError):
            self.send_json({"error": "Customer utama belum dipilih."}, status=400)
            return

        duplicate_ids = []
        for value in payload.get("duplicateIds") or payload.get("duplicate_ids") or []:
            try:
                duplicate_id = int(value)
            except (TypeError, ValueError):
                continue
            if duplicate_id != target_id and duplicate_id not in duplicate_ids:
                duplicate_ids.append(duplicate_id)

        if not duplicate_ids:
            self.send_json({"error": "Pilih minimal satu customer untuk merge."}, status=400)
            return

        with get_connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            target = fetch_customer_row(connection, target_id)
            if target is None:
                self.send_json({"error": "Customer utama tidak ditemukan."}, status=404)
                return

            placeholders = ",".join("?" for _ in duplicate_ids)
            duplicates = connection.execute(
                f"""
                SELECT id, name, default_shipping, last_order_at, created_at, updated_at, deposit_balance, tag
                FROM customers
                WHERE id IN ({placeholders})
                """,
                duplicate_ids,
            ).fetchall()
            if len(duplicates) != len(duplicate_ids):
                self.send_json({"error": "Ada customer yang tidak ditemukan."}, status=404)
                return

            duplicate_alias_map = get_customer_alias_map(connection, duplicate_ids)
            for duplicate in duplicates:
                add_customer_alias(connection, target_id, duplicate["name"])
                for alias in duplicate_alias_map.get(duplicate["id"], []):
                    add_customer_alias(connection, target_id, alias)

            connection.execute(
                f"DELETE FROM customers WHERE id IN ({placeholders})",
                duplicate_ids,
            )
            connection.execute(
                "UPDATE customers SET updated_at = ? WHERE id = ?",
                (utc_now_text(), target_id),
            )
            updated = fetch_customer_row(connection, target_id)
            alias_map = get_customer_alias_map(connection, [target_id])
            merged_tag = resolve_customer_tag(updated["name"], alias_map.get(target_id, []), updated["tag"])
            if merged_tag != normalize_customer_tag(updated["tag"]):
                connection.execute(
                    "UPDATE customers SET tag = ?, updated_at = ? WHERE id = ?",
                    (merged_tag, utc_now_text(), target_id),
                )
                updated = fetch_customer_row(connection, target_id)

        self.send_json(
            {
                "ok": True,
                "customer": customer_to_dict(updated, alias_map.get(target_id, [])),
                "mergedCount": len(duplicate_ids),
            }
        )

    def handle_create_sale(self):
        try:
            payload = self.read_json()
        except json.JSONDecodeError:
            self.send_json({"error": "Data transaksi tidak valid."}, status=400)
            return

        items = payload.get("items")
        if not isinstance(items, list) or not items:
            self.send_json({"error": "Transaksi harus punya minimal satu barang."}, status=400)
            return

        completed_at = str(payload.get("completedAt") or "").strip()
        if not completed_at:
            self.send_json({"error": "Waktu transaksi kosong."}, status=400)
            return

        used_deposit = 0

        try:
            with get_connection() as connection:
                connection.execute("BEGIN IMMEDIATE")
                receipt_no = next_receipt_number(connection, receipt_date_key(payload))
                customer_name = str(payload.get("customerName") or payload.get("customer") or payload.get("customerAddress") or payload.get("address") or "").strip()
                total_amount = rupiah_number(payload.get("total"))
                paid_amount = rupiah_number(payload.get("paidAmount", 0))

                used_deposit = 0
                customer_id_for_deposit = None
                if customer_name:
                    cust = find_customer_by_name_or_alias(connection, customer_name)
                    if cust and cust["deposit_balance"] > 0:
                        customer_id_for_deposit = cust["id"]
                        used_deposit = min(cust["deposit_balance"], total_amount)
                        paid_amount += used_deposit

                sale_values = (
                    receipt_no,
                    completed_at,
                    str(payload.get("storeName") or "Toko").strip(),
                    str(payload.get("payment") or "Tunai").strip(),
                    rupiah_number(payload.get("subtotal")),
                    rupiah_number(payload.get("shipping") if payload.get("shipping") is not None else payload.get("discount")),
                    rupiah_number(payload.get("tax")),
                    total_amount,
                    customer_name,
                    "",
                    "",
                    "",
                    str(payload.get("chatDate") or "").strip(),
                    paid_amount,
                )
                shipping = sale_values[5]
                cursor = connection.execute(
                    """
                    INSERT INTO sales (
                        receipt_no, completed_at, store_name, payment, subtotal, discount, tax, total,
                        customer_name, customer_address, order_note, due_text, chat_date, paid_amount
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    sale_values,
                )
                sale_id = cursor.lastrowid

                if used_deposit > 0:
                    connection.execute(
                        """
                        UPDATE customers
                        SET deposit_balance = deposit_balance - ?, updated_at = ?
                        WHERE id = ?
                        """,
                        (used_deposit, utc_now_text(), customer_id_for_deposit)
                    )
                    connection.execute(
                        """
                        INSERT INTO sale_payments (sale_id, amount, payment_date, note)
                        VALUES (?, ?, ?, ?)
                        """,
                        (sale_id, used_deposit, completed_at, "Otomatis Potong Deposit")
                    )

                remaining_initial_pay = paid_amount - used_deposit
                if remaining_initial_pay > 0:
                    connection.execute(
                        """
                        INSERT INTO sale_payments (sale_id, amount, payment_date, note)
                        VALUES (?, ?, ?, ?)
                        """,
                        (sale_id, remaining_initial_pay, completed_at, "Pembayaran Awal")
                    )
                for item in items:
                    quantity = rupiah_number(item.get("quantity"))
                    price = rupiah_number(item.get("price"))
                    line_total = rupiah_number(item.get("lineTotal")) or price * quantity
                    connection.execute(
                        """
                    INSERT INTO sale_items (
                        sale_id, sku, name, price, quantity, line_total, note,
                        product_client_id, variant_client_id, menu_name, variant_name,
                        unit_name, unit_quantity, pricing_type, receipt_label
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        sale_id,
                        str(item.get("sku") or "").strip(),
                        str(item.get("name") or "Barang").strip(),
                        price,
                        quantity,
                        line_total,
                        str(item.get("note") or "").strip(),
                        str(item.get("productClientId") or item.get("product_client_id") or "").strip(),
                        str(item.get("variantId") or item.get("variantClientId") or item.get("variant_client_id") or "").strip(),
                        str(item.get("menuName") or item.get("menu_name") or item.get("name") or "Barang").strip(),
                        str(item.get("variantName") or item.get("variant_name") or "").strip(),
                        str(item.get("unitName") or item.get("unit_name") or "").strip(),
                        rupiah_number(item.get("unitQuantity") if item.get("unitQuantity") is not None else item.get("unit_quantity")),
                        str(item.get("pricingType") or item.get("pricing_type") or "").strip(),
                        str(item.get("receiptLabel") or item.get("receipt_label") or "").strip(),
                    ),
                )
                upsert_customer(connection, customer_name, shipping, completed_at)
        except sqlite3.IntegrityError:
            self.send_json({"error": "Nomor struk sudah ada. Coba selesaikan transaksi lagi."}, status=409)
            return

        trigger_auto_backup()
        self.send_json({"ok": True, "saleId": sale_id, "receiptNo": receipt_no, "usedDeposit": used_deposit}, status=201)

    def fetch_sale(self, connection, sale_id):
        row = connection.execute(
            """
            SELECT id, receipt_no, completed_at, store_name, payment, subtotal, discount, tax, total,
                   customer_name, customer_address, order_note, due_text, chat_date,
                   deleted_at, stock_restored_on_delete, paid_amount
            FROM sales
            WHERE id = ?
            """,
            (sale_id,),
        ).fetchone()
        if row is None:
            return None

        item_rows = connection.execute(
            """
            SELECT sale_id, sku, name, price, quantity, line_total, note,
                   product_client_id, variant_client_id, menu_name, variant_name,
                   unit_name, unit_quantity, pricing_type, receipt_label
            FROM sale_items
            WHERE sale_id = ?
            ORDER BY id ASC
            """,
            (sale_id,),
        ).fetchall()
        
        payment_rows = connection.execute(
            """
            SELECT id, amount, payment_date, note, created_at
            FROM sale_payments
            WHERE sale_id = ?
            ORDER BY id ASC
            """,
            (sale_id,),
        ).fetchall()

        sale = dict(row)
        sale["items"] = [dict(item) for item in item_rows]
        sale["payments"] = [dict(pay) for pay in payment_rows]
        sale["usedDeposit"] = sum(pay["amount"] for pay in payment_rows if pay["note"] == "Otomatis Potong Deposit")
        return sale

    def handle_update_sale(self, path):
        sale_id_value = path.removeprefix("/api/sales/").strip("/")
        try:
            sale_id = int(sale_id_value)
        except ValueError:
            self.send_json({"error": "ID transaksi tidak valid."}, status=400)
            return

        try:
            payload = self.read_json()
        except json.JSONDecodeError:
            self.send_json({"error": "Data edit transaksi tidak valid."}, status=400)
            return

        with get_connection() as connection:
            sale = connection.execute(
                """
                SELECT id, completed_at, payment, subtotal, discount, tax, customer_name, chat_date
                FROM sales
                WHERE id = ?
                """,
                (sale_id,),
            ).fetchone()
            if sale is None:
                self.send_json({"error": "Transaksi tidak ditemukan."}, status=404)
                return

            item_update_requested = "items" in payload
            sanitized_items = []
            if item_update_requested:
                items = payload.get("items")
                if not isinstance(items, list) or not items:
                    self.send_json({"error": "Edit struk harus punya minimal satu item."}, status=400)
                    return

                for item in items:
                    if not isinstance(item, dict):
                        continue
                    quantity = rupiah_number(item.get("quantity"))
                    price = rupiah_number(item.get("price"))
                    name = str(item.get("name") or "").strip()
                    if not name or quantity <= 0 or price <= 0:
                        continue
                    line_total = rupiah_number(item.get("lineTotal") if item.get("lineTotal") is not None else item.get("line_total")) or price * quantity
                    sanitized_items.append(
                        {
                            "sku": str(item.get("sku") or "").strip(),
                            "name": name,
                            "price": price,
                            "quantity": quantity,
                            "line_total": line_total,
                            "note": str(item.get("note") or "").strip(),
                            "product_client_id": str(item.get("productClientId") or item.get("product_client_id") or "").strip(),
                            "variant_client_id": str(item.get("variantId") or item.get("variantClientId") or item.get("variant_client_id") or "").strip(),
                            "menu_name": str(item.get("menuName") or item.get("menu_name") or name).strip(),
                            "variant_name": str(item.get("variantName") or item.get("variant_name") or "").strip(),
                            "unit_name": str(item.get("unitName") or item.get("unit_name") or "").strip(),
                            "unit_quantity": rupiah_number(item.get("unitQuantity") if item.get("unitQuantity") is not None else item.get("unit_quantity")),
                            "pricing_type": str(item.get("pricingType") or item.get("pricing_type") or "").strip(),
                            "receipt_label": str(item.get("receiptLabel") or item.get("receipt_label") or "").strip(),
                        }
                    )

                if not sanitized_items:
                    self.send_json({"error": "Item edit struk belum valid."}, status=400)
                    return

            tax_source = payload.get("tax", sale["tax"])
            shipping_source = payload.get("shipping") if payload.get("shipping") is not None else payload.get("discount", sale["discount"])
            shipping = rupiah_number(shipping_source)
            tax = rupiah_number(tax_source)
            subtotal = sum(item["line_total"] for item in sanitized_items) if item_update_requested else rupiah_number(sale["subtotal"])
            total = subtotal + shipping + tax
            payment = str(payload.get("payment", sale["payment"]) or "Tunai").strip()
            customer_name = str(payload.get("customerName", payload.get("customer_name", sale["customer_name"])) or "").strip()
            chat_date = str(payload.get("chatDate", payload.get("chat_date", sale["chat_date"])) or "").strip()

            connection.execute(
                """
                UPDATE sales
                SET payment = ?, subtotal = ?, discount = ?, tax = ?, total = ?, customer_name = ?, chat_date = ?
                WHERE id = ?
                """,
                (payment, subtotal, shipping, tax, total, customer_name, chat_date, sale_id),
            )
            if item_update_requested:
                connection.execute("DELETE FROM sale_items WHERE sale_id = ?", (sale_id,))
                connection.executemany(
                    """
                    INSERT INTO sale_items (
                        sale_id, sku, name, price, quantity, line_total, note,
                        product_client_id, variant_client_id, menu_name, variant_name,
                        unit_name, unit_quantity, pricing_type, receipt_label
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    [
                        (
                            sale_id,
                            item["sku"],
                            item["name"],
                            item["price"],
                            item["quantity"],
                            item["line_total"],
                            item["note"],
                            item["product_client_id"],
                            item["variant_client_id"],
                            item["menu_name"],
                            item["variant_name"],
                            item["unit_name"],
                            item["unit_quantity"],
                            item["pricing_type"],
                            item["receipt_label"],
                        )
                        for item in sanitized_items
                    ],
                )
            upsert_customer(connection, customer_name, shipping, sale["completed_at"])
            updated_sale = self.fetch_sale(connection, sale_id)

        trigger_auto_backup()
        self.send_json({"ok": True, "sale": updated_sale})

    def handle_delete_sale(self, path):
        sale_id_value = path.removeprefix("/api/sales/").strip("/")
        try:
            sale_id = int(sale_id_value)
        except ValueError:
            self.send_json({"error": "ID transaksi tidak valid."}, status=400)
            return

        payload = {}
        if int(self.headers.get("Content-Length", "0")) > 0:
            try:
                payload = self.read_json()
            except json.JSONDecodeError:
                self.send_json({"error": "Data hapus transaksi tidak valid."}, status=400)
                return
        stock_restored = 1 if payload.get("restoreStock") else 0

        with get_connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            sale = connection.execute(
                "SELECT receipt_no, deleted_at, customer_name FROM sales WHERE id = ?",
                (sale_id,),
            ).fetchone()
            if sale is None:
                self.send_json({"error": "Transaksi tidak ditemukan."}, status=404)
                return

            if not sale["deleted_at"]:
                # Balikin deposit pas transaksi dihapus
                payments = connection.execute(
                    "SELECT amount, note FROM sale_payments WHERE sale_id = ?",
                    (sale_id,)
                ).fetchall()

                customer_name = sale["customer_name"]
                deposit_adjustment = 0
                for pay in payments:
                    note = pay["note"] or ""
                    amount = pay["amount"]
                    if note == "Otomatis Potong Deposit":
                        deposit_adjustment += amount
                    elif "Kelebihan Rp" in note:
                        match = re.search(r"Kelebihan Rp\s*([0-9.,]+)", note)
                        if match:
                            val_str = match.group(1).replace(".", "").replace(",", "")
                            try:
                                excess = int(val_str)
                                deposit_adjustment -= excess
                            except ValueError:
                                pass

                if customer_name and deposit_adjustment != 0:
                    cust = find_customer_by_name_or_alias(connection, customer_name)
                    if cust:
                        new_balance = max(0, cust["deposit_balance"] + deposit_adjustment)
                        connection.execute(
                            """
                            UPDATE customers
                            SET deposit_balance = ?, updated_at = ?
                            WHERE id = ?
                            """,
                            (new_balance, utc_now_text(), cust["id"])
                        )

            connection.execute(
                """
                UPDATE sales
                SET deleted_at = CASE WHEN COALESCE(deleted_at, '') = '' THEN ? ELSE deleted_at END,
                    stock_restored_on_delete = ?
                WHERE id = ?
                """,
                (utc_now_text(), stock_restored, sale_id),
            )
            deleted_sale = self.fetch_sale(connection, sale_id)

        trigger_auto_backup()
        self.send_json({"ok": True, "saleId": sale_id, "receiptNo": sale["receipt_no"], "sale": deleted_sale})

    def handle_restore_sale(self, path):
        sale_id_value = path.removeprefix("/api/sales/").removesuffix("/restore").strip("/")
        try:
            sale_id = int(sale_id_value)
        except ValueError:
            self.send_json({"error": "ID transaksi tidak valid."}, status=400)
            return

        with get_connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            sale = connection.execute(
                "SELECT receipt_no, deleted_at, customer_name FROM sales WHERE id = ?",
                (sale_id,),
            ).fetchone()
            if sale is None:
                self.send_json({"error": "Transaksi tidak ditemukan."}, status=404)
                return

            if sale["deleted_at"]:
                # Potong lagi deposit pas transaksi di-restore (un-delete)
                payments = connection.execute(
                    "SELECT amount, note FROM sale_payments WHERE sale_id = ?",
                    (sale_id,)
                ).fetchall()

                customer_name = sale["customer_name"]
                deposit_adjustment = 0
                for pay in payments:
                    note = pay["note"] or ""
                    amount = pay["amount"]
                    if note == "Otomatis Potong Deposit":
                        deposit_adjustment -= amount
                    elif "Kelebihan Rp" in note:
                        match = re.search(r"Kelebihan Rp\s*([0-9.,]+)", note)
                        if match:
                            val_str = match.group(1).replace(".", "").replace(",", "")
                            try:
                                excess = int(val_str)
                                deposit_adjustment += excess
                            except ValueError:
                                pass

                if customer_name and deposit_adjustment != 0:
                    cust = find_customer_by_name_or_alias(connection, customer_name)
                    if cust:
                        new_balance = max(0, cust["deposit_balance"] + deposit_adjustment)
                        connection.execute(
                            """
                            UPDATE customers
                            SET deposit_balance = ?, updated_at = ?
                            WHERE id = ?
                            """,
                            (new_balance, utc_now_text(), cust["id"])
                        )

            connection.execute(
                "UPDATE sales SET deleted_at = '', stock_restored_on_delete = 0 WHERE id = ?",
                (sale_id,),
            )
            restored_sale = self.fetch_sale(connection, sale_id)

        trigger_auto_backup()
        self.send_json({"ok": True, "saleId": sale_id, "receiptNo": sale["receipt_no"], "sale": restored_sale})

    def handle_add_sale_payment(self, path):
        sale_id_value = path.removeprefix("/api/sales/").removesuffix("/payments").strip("/")
        try:
            sale_id = int(sale_id_value)
        except ValueError:
            self.send_json({"error": "ID transaksi tidak valid."}, status=400)
            return

        try:
            payload = self.read_json()
        except json.JSONDecodeError:
            self.send_json({"error": "Data pembayaran tidak valid."}, status=400)
            return

        amount = rupiah_number(payload.get("amount"))
        if amount <= 0:
            self.send_json({"error": "Jumlah pembayaran harus lebih dari 0."}, status=400)
            return

        payment_date = str(payload.get("paymentDate") or payload.get("payment_date") or "").strip()
        if not payment_date:
            payment_date = utc_now_text()

        with get_connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            sale = connection.execute(
                """
                SELECT id, total, paid_amount, customer_name
                FROM sales
                WHERE id = ? AND COALESCE(deleted_at, '') = ''
                """,
                (sale_id,),
            ).fetchone()

            if sale is None:
                self.send_json({"error": "Transaksi tidak ditemukan atau sudah dihapus."}, status=404)
                return

            total = sale["total"]
            paid_amount = sale["paid_amount"]
            remaining_debt = total - paid_amount

            if remaining_debt <= 0:
                self.send_json({"error": "Transaksi ini sudah lunas."}, status=400)
                return

            amount_to_apply = min(amount, remaining_debt)
            deposit_to_add = amount - amount_to_apply

            new_paid_amount = paid_amount + amount_to_apply

            note = "Pembayaran Cicilan"
            if deposit_to_add > 0:
                note = f"Bayar Rp {amount:,} (Kelebihan Rp {deposit_to_add:,} masuk deposit)"

            connection.execute(
                """
                INSERT INTO sale_payments (sale_id, amount, payment_date, note)
                VALUES (?, ?, ?, ?)
                """,
                (sale_id, amount, payment_date, note)
            )

            connection.execute(
                """
                UPDATE sales
                SET paid_amount = ?
                WHERE id = ?
                """,
                (new_paid_amount, sale_id)
            )

            customer_name = sale["customer_name"]
            if deposit_to_add > 0 and customer_name:
                cust = find_customer_by_name_or_alias(connection, customer_name)
                if cust:
                    connection.execute(
                        """
                        UPDATE customers
                        SET deposit_balance = deposit_balance + ?, updated_at = ?
                        WHERE id = ?
                        """,
                        (deposit_to_add, utc_now_text(), cust["id"])
                    )
                else:
                    cust_id = upsert_customer(connection, customer_name)
                    if cust_id:
                        connection.execute(
                            """
                            UPDATE customers
                            SET deposit_balance = deposit_balance + ?, updated_at = ?
                            WHERE id = ?
                            """,
                            (deposit_to_add, utc_now_text(), cust_id)
                        )

            updated_sale = self.fetch_sale(connection, sale_id)

        trigger_auto_backup()
        self.send_json({"ok": True, "sale": updated_sale})

    def handle_revoke_sale_payments(self, path):
        sale_id_value = path.removeprefix("/api/sales/").removesuffix("/revoke-lunas").strip("/")
        try:
            sale_id = int(sale_id_value)
        except ValueError:
            self.send_json({"error": "ID transaksi tidak valid."}, status=400)
            return

        with get_connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            sale = connection.execute(
                """
                SELECT id, receipt_no, customer_name, total, paid_amount
                FROM sales
                WHERE id = ? AND COALESCE(deleted_at, '') = ''
                """,
                (sale_id,),
            ).fetchone()

            if sale is None:
                self.send_json({"error": "Transaksi tidak ditemukan atau sudah dihapus."}, status=404)
                return

            payments = connection.execute(
                "SELECT amount, note FROM sale_payments WHERE sale_id = ?",
                (sale_id,)
            ).fetchall()

            customer_name = sale["customer_name"]
            deposit_adjustment = 0
            for pay in payments:
                note = pay["note"] or ""
                amount = pay["amount"]
                if note == "Otomatis Potong Deposit":
                    deposit_adjustment += amount
                elif "Kelebihan Rp" in note:
                    match = re.search(r"Kelebihan Rp\s*([0-9.,]+)", note)
                    if match:
                        val_str = match.group(1).replace(".", "").replace(",", "")
                        try:
                            excess = int(val_str)
                            deposit_adjustment -= excess
                        except ValueError:
                            pass

            # Update customer deposit balance
            if customer_name and deposit_adjustment != 0:
                cust = find_customer_by_name_or_alias(connection, customer_name)
                if cust:
                    new_balance = max(0, cust["deposit_balance"] + deposit_adjustment)
                    connection.execute(
                        """
                        UPDATE customers
                        SET deposit_balance = ?, updated_at = ?
                        WHERE id = ?
                        """,
                        (new_balance, utc_now_text(), cust["id"])
                    )

            # Delete all payments for this sale
            connection.execute(
                "DELETE FROM sale_payments WHERE sale_id = ?",
                (sale_id,)
            )

            # Set paid_amount back to 0
            connection.execute(
                """
                UPDATE sales
                SET paid_amount = 0
                WHERE id = ?
                """,
                (sale_id,)
            )

            updated_sale = self.fetch_sale(connection, sale_id)

        trigger_auto_backup()
        self.send_json({"ok": True, "sale": updated_sale})


def main():
    init_database()
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4174
    mimetypes.add_type("application/manifest+json", ".webmanifest")
    server = ThreadingHTTPServer(("0.0.0.0", port), CashierHandler)
    print(f"Kasir Shanti Catering running at http://0.0.0.0:{port}/")
    print(f"SQLite database: {DB_PATH}")
    server.serve_forever()


if __name__ == "__main__":
    main()
