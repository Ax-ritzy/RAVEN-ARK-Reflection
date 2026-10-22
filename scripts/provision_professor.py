import sys
import os
import json
import urllib.request
from dotenv import load_dotenv

# Load root .env
env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
load_dotenv(env_path)

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SERVICE_KEY:
    print("[ERROR] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env")
    sys.exit(1)

def provision_professor(email: str, password: str, full_name: str):
    print(f"[*] Provisioning Professor account for: {email} ({full_name})...")
    
    # 1. Create Auth User
    admin_auth_url = f"{SUPABASE_URL.rstrip('/')}/auth/v1/admin/users"
    auth_payload = {
        "email": email.strip().lower(),
        "password": password,
        "email_confirm": True,
        "user_metadata": {
            "full_name": full_name.strip(),
            "role": "PROFESSOR"
        }
    }
    
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json"
    }
    
    req = urllib.request.Request(admin_auth_url, data=json.dumps(auth_payload).encode(), headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            auth_user = json.loads(resp.read().decode())
            user_id = auth_user["id"]
            print(f"[+] Auth User created with ID: {user_id}")
    except urllib.error.HTTPError as e:
        err_body = e.read().decode()
        print(f"[-] Auth User creation failed ({e.code}): {err_body}")
        return False
    except Exception as e:
        print(f"[-] Error: {e}")
        return False

    # 2. Insert into public.profiles
    profile_url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/profiles"
    profile_payload = {
        "auth_user_id": user_id,
        "role": "PROFESSOR",
        "full_name": full_name.strip(),
        "usn": None,
        "status": "ACTIVE"
    }
    
    headers["Prefer"] = "return=representation"
    req_profile = urllib.request.Request(profile_url, data=json.dumps(profile_payload).encode(), headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req_profile) as resp:
            profile = json.loads(resp.read().decode())
            print(f"[+] Linked Professor profile created successfully: ID {profile[0]['id']}")
            print(f"\n[SUCCESS] Professor account is ready to log in to Professor Portal at http://localhost:3001/login")
            return True
    except urllib.error.HTTPError as e:
        err_body = e.read().decode()
        print(f"[-] Profile creation failed ({e.code}): {err_body}")
        return False

if __name__ == "__main__":
    if len(sys.argv) < 3:
        email = input("Enter Professor Email: ")
        password = input("Enter Professor Password (min 6 chars): ")
        name = input("Enter Professor Full Name: ")
    else:
        email = sys.argv[1]
        password = sys.argv[2]
        name = sys.argv[3] if len(sys.argv) > 3 else "Lead Professor"

    provision_professor(email, password, name)
