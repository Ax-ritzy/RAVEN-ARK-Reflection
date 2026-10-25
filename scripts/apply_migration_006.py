import sys
import os
import psycopg2
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
load_dotenv(env_path)

PROJECT_REF = "jztvtgyrfuclkxkhcyco"
MIGRATION_FILE = os.path.join(os.path.dirname(__file__), "..", "database", "migrations", "006_session_expiry_timer.sql")

def apply_with_password(db_password: str):
    print(f"[*] Attempting PostgreSQL connection to db.{PROJECT_REF}.supabase.co:5432...")
    
    hosts = [
        f"db.{PROJECT_REF}.supabase.co",
        f"aws-0-ap-south-1.pooler.supabase.com"
    ]
    
    sql_content = ""
    with open(MIGRATION_FILE, "r", encoding="utf-8") as f:
        sql_content = f.read()

    conn = None
    for host in hosts:
        try:
            port = 5432 if "db." in host else 6543
            user = "postgres" if port == 5432 else f"postgres.{PROJECT_REF}"
            print(f"[*] Connecting to {host}:{port} as {user}...")
            conn = psycopg2.connect(
                host=host,
                port=port,
                dbname="postgres",
                user=user,
                password=db_password,
                connect_timeout=10
            )
            print("[+] Connected successfully!")
            break
        except Exception as e:
            print(f"[-] Connection to {host} failed: {e}")

    if not conn:
        print("[ERROR] Could not connect to Supabase database with provided password.")
        return False

    try:
        conn.autocommit = True
        with conn.cursor() as cur:
            print("[*] Applying Migration 006 (expires_at)...")
            cur.execute(sql_content)
            print("[SUCCESS] Migration 006 applied successfully to live Supabase database!")
        conn.close()
        return True
    except Exception as e:
        print(f"[ERROR] Failed to execute SQL migration: {e}")
        conn.close()
        return False

def apply_with_access_token(token: str):
    import urllib.request
    import json
    
    print(f"[*] Executing Migration 006 via Supabase Management API...")
    url = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"
    
    with open(MIGRATION_FILE, "r", encoding="utf-8") as f:
        sql_content = f.read()

    req = urllib.request.Request(
        url,
        data=json.dumps({"query": sql_content}).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        },
        method="POST"
    )
    
    try:
        with urllib.request.urlopen(req) as resp:
            print("[SUCCESS] Migration 006 applied successfully to live Supabase via Management API!")
            return True
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode()
        print(f"[ERROR] Management API returned HTTP {e.code}: {err_msg}")
        return False
    except Exception as e:
        print(f"[ERROR] Error calling Supabase Management API: {e}")
        return False

if __name__ == "__main__":
    if len(sys.argv) > 1:
        secret_input = sys.argv[1].strip()
    else:
        secret_input = input("Enter Supabase DB Password OR Personal Access Token (sbp_...): ").strip()
    
    if not secret_input:
        print("[!] No input provided. Exiting.")
        sys.exit(1)
        
    if secret_input.startswith("sbp_"):
        success = apply_with_access_token(secret_input)
    else:
        success = apply_with_password(secret_input)
        
    if not success:
        sys.exit(1)
