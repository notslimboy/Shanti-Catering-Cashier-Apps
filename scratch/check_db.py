import sqlite3

conn = sqlite3.connect('/Users/notslimboy/Documents/Cashier Web Apps/kasir-bento.sqlite3')
cursor = conn.cursor()

# Get all tables
cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = cursor.fetchall()
print("Tables in database:", tables)

for table_tuple in tables:
    table = table_tuple[0]
    print(f"\nInspecting table: {table}")
    try:
        cursor.execute(f"PRAGMA table_info({table});")
        columns = cursor.fetchall()
        col_names = [col[1] for col in columns]
        print("Columns:", col_names)
        
        # Search for 'keputih' in any column
        search_queries = []
        for col in col_names:
            search_queries.append(f"CAST({col} AS TEXT) LIKE '%keputih%'")
        if search_queries:
            query = f"SELECT * FROM {table} WHERE " + " OR ".join(search_queries)
            cursor.execute(query)
            rows = cursor.fetchall()
            if rows:
                print(f"Found {len(rows)} matching rows in {table}:")
                for r in rows[:10]:
                    print(r)
    except Exception as e:
        print("Error:", e)

conn.close()
