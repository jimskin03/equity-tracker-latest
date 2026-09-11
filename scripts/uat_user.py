"""Create (and later remove) a temporary confirmed auth user for live UAT.

Prints the credentials so the caller can sign in through the real UI; the user
is deleted again by `--delete <uid>`. Intended for throwaway verification only.

    python3 scripts/uat_user.py create
    python3 scripts/uat_user.py delete <uid>
"""
import json
import pathlib
import secrets
import string
import sys
import uuid

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import mcp_sql  # noqa: E402

DOMAIN = "cryptgregresearch.org"


def create() -> dict:
    uid = str(uuid.uuid4())
    email = f"aixin-uat-{uuid.uuid4().hex[:10]}@{DOMAIN}"
    password = "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(26)) + "Aa1!"
    sql = f"""
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values ('00000000-0000-0000-0000-000000000000', '{uid}'::uuid, 'authenticated', 'authenticated',
  '{email}', crypt('{password}', gen_salt('bf')), now(),
  '{{"provider":"email","providers":["email"]}}'::jsonb, '{{}}'::jsonb, now(), now(), '', '', '', '');
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values ('{uid}', '{uid}'::uuid, jsonb_build_object('sub','{uid}','email','{email}'), 'email', now(), now(), now());
"""
    mcp_sql.connect()
    mcp_sql.run_sql(sql)
    return {"uid": uid, "email": email, "password": password}


def delete(uid: str) -> None:
    mcp_sql.connect()
    mcp_sql.run_sql(f"delete from auth.identities where user_id = '{uid}'::uuid")
    mcp_sql.run_sql(f"delete from auth.users where id = '{uid}'::uuid")


if __name__ == "__main__":
    if sys.argv[1] == "create":
        print(json.dumps(create()))
    elif sys.argv[1] == "delete":
        delete(sys.argv[2])
        print("deleted", sys.argv[2])
    else:
        raise SystemExit("usage: uat_user.py create|delete <uid>")
