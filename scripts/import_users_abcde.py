"""
Import ABCDE-sourced officers into the PIA Tracker database as SSO-only users.

These users authenticate at ABCDE, never through PIA's own login form directly —
the SSO handoff (see backend/src/main/kotlin/in/gov/ir/pia/security/SsoTokenVerifier.kt)
maps the JWT's `sub` claim to `users.employee_id`. They still get a password_hash
(BCrypt of their Login ID) so the fallback password-login path works exactly the
same as it does for HRMS-imported users — no NULL / lazy-init special-casing needed.

Usage:
    python scripts/import_users_abcde.py <path-to-csv>
    python scripts/import_users_abcde.py <path-to-csv> --out users_abcde.sql

Expected CSV headers (case/space/punctuation-insensitive, same alias matching as
import_users.py): Login ID, User Name, Designation, Zone, Division, Email.
Mobile No. is read if present but intentionally NOT imported (not stored anywhere yet).

The script only ever writes a .sql file — it never connects to or writes to a
database directly. Review the generated file, then apply it yourself, e.g.:
    scp users_abcde.sql root@<VM>:/tmp/users_abcde.sql
    ssh root@<VM> "sudo podman cp /tmp/users_abcde.sql pia-postgres:/tmp/users_abcde.sql && \\
        sudo podman exec pia-postgres psql -U pia -d pia -f /tmp/users_abcde.sql"

Designation resolution reuses resolve_designation() from import_users.py as-is.
Division is read from the CSV (for your own records) but is NOT written to
users.primary_division_id — that column is intentionally left NULL for now,
reserved for future use.
"""

import argparse
import csv
import re
import sys
import uuid
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).parent))
from import_users import resolve_designation  # noqa: E402 — reuse as-is, per plan


# ── CLI ────────────────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(
        description="Generate users_abcde.sql from an ABCDE officer CSV (SSO-only users)."
    )
    p.add_argument("csv", help="Path to the ABCDE officer CSV")
    p.add_argument("--out", default="users_abcde.sql", metavar="FILE",
                   help="Output SQL file (default: users_abcde.sql)")
    return p.parse_args()


def make_bcrypt_hasher():
    """Return a fn raw->hash matching Spring's BCryptPasswordEncoder() (strength 10, $2a$)."""
    try:
        import bcrypt
    except ImportError:
        sys.exit("This script needs the 'bcrypt' package: pip install bcrypt")

    def _hash(raw: str) -> str:
        return bcrypt.hashpw(raw.encode("utf-8"), bcrypt.gensalt(rounds=10, prefix=b"2a")).decode("ascii")

    return _hash


# ── CSV loading ──────────────────────────────────────────────────────────────
# Header aliases → canonical field. Matching is case-insensitive with spaces/
# underscores/punctuation stripped, same convention as import_users.py.
HEADER_ALIASES = {
    "loginid": "employee_id", "login": "employee_id", "userid": "employee_id",
    "employeeid": "employee_id", "empid": "employee_id",
    "username": "name", "name": "name", "fullname": "name", "officername": "name",
    "designation": "desig_raw", "designationcode": "desig_raw", "desig": "desig_raw",
    "zone": "zone", "zonecode": "zone", "railway": "zone",
    "division": "division", "divisioncode": "division",
    "email": "email", "emailid": "email", "mail": "email",
    "mobno": "mobile", "mobileno": "mobile", "mobile": "mobile", "phone": "mobile",
}


def _norm_header(h: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (h or "").strip().lower())


def load_csv_rows(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        try:
            header = next(reader)
        except StopIteration:
            return []
        col_map: dict[int, str] = {}
        for i, h in enumerate(header):
            field = HEADER_ALIASES.get(_norm_header(h))
            if field:
                col_map[i] = field
        present = set(col_map.values())
        # Email is optional — rows without one get a synthetic placeholder (see
        # validate_rows), so it is not part of the required-header set.
        missing = {"employee_id", "name", "desig_raw"} - present
        if missing:
            sys.exit(
                f"CSV header is missing required column(s): {', '.join(sorted(missing))}.\n"
                f"Found headers: {header}\n"
                f"Expected something matching: Login ID, User Name, Designation, Email "
                f"(+ Zone, Division, Mobile No.)."
            )
        rows = []
        for values in reader:
            rec = {"employee_id": "", "name": "", "desig_raw": "", "zone": None,
                   "division": None, "email": "", "mobile": None}
            for i, field in col_map.items():
                if i < len(values):
                    rec[field] = (values[i] or "").strip()
            if not any([rec["employee_id"], rec["name"], rec["email"]]):
                continue
            rows.append(rec)
        return rows


# ── Validation + SQL emission ──────────────────────────────────────────────────

def validate_rows(raw_rows: list[dict]) -> tuple[list[dict], list[dict]]:
    valid_rows = []
    skipped_rows = []
    for idx, rec in enumerate(raw_rows, start=1):
        desig, alias_note = resolve_designation(rec["desig_raw"])
        errors = []
        notes = []
        if alias_note:
            notes.append(alias_note)
        # Railway Board officers (Railway/Zone == "RB") always land on the ED family
        # (EDGS_CI), regardless of their designation text.
        if (rec["zone"] or "").strip().upper() == "RB":
            if desig != "EDGS_CI":
                notes.append(f"Railway 'RB' — designation set to EDGS_CI (was {desig})")
            desig = "EDGS_CI"
        if not rec["employee_id"]:
            errors.append("Login ID is required")
        if not rec["name"]:
            errors.append("User Name is required")
        # Email fallback: when the CSV email is blank or not a real address (no '@'),
        # default it to <loginid>@gov.in so the user is still imported. Login is by
        # employee_id (the JWT `sub`) anyway, so email here is just a stored placeholder.
        # Real addresses (containing '@') are left untouched.
        if rec["employee_id"] and (not rec["email"] or "@" not in rec["email"]):
            rec["email"] = f"{rec['employee_id']}@gov.in"
            notes.append(f"email blank/invalid — defaulted to {rec['email']}")
        if not rec["email"]:
            errors.append("Email is required")
        elif "@" not in rec["email"]:
            errors.append("Email looks invalid")
        if not rec["desig_raw"]:
            errors.append("Designation is required")
        if rec["division"]:
            notes.append(f"division '{rec['division']}' noted but not imported "
                          f"(primary_division_id left NULL, reserved for future use)")
        if rec["mobile"]:
            notes.append("mobile no. present in CSV but not imported (not stored)")

        row = {
            "row_num": idx,
            "employee_id": rec["employee_id"],
            "name": rec["name"],
            "email": rec["email"],
            "designation_code": desig,
            "zone_code": rec["zone"] or None,
            "errors": errors,
            "notes": notes,
        }
        (skipped_rows if errors else valid_rows).append(row)
    return valid_rows, skipped_rows


def write_sql_file(path: str, valid_rows: list, hasher) -> int:
    """
    Idempotent INSERT per user, ON CONFLICT (employee_id) DO NOTHING — same shape as
    import_users.py's --out-sql mode. password_hash is always set (BCrypt of the Login
    ID) so the fallback password-login path works identically to HRMS-imported users;
    is_sso_only-style special-casing is deliberately NOT used (see module docstring).
    primary_division_id is never set — left NULL, reserved for future use.
    """
    out = [
        "-- PIA Tracker — ABCDE SSO-user import (generated by scripts/import_users_abcde.py).",
        "-- Idempotent: ON CONFLICT (employee_id) DO NOTHING. Review before applying, then:",
        "--   sudo podman exec -i pia-postgres psql -U pia -d pia -f /tmp/users_abcde.sql",
        "",
    ]
    for r in valid_rows:
        uid = str(uuid.uuid4())
        name_esc = r["name"].replace("'", "''")
        email_esc = r["email"].replace("'", "''")
        desig_esc = r["designation_code"].replace("'", "''")
        emp_esc = r["employee_id"].replace("'", "''")
        zone_val = (f"(SELECT id FROM zones WHERE code = '{r['zone_code']}')"
                    if r["zone_code"] else "NULL")
        pw_hash = hasher(r["employee_id"]).replace("'", "''")

        out.append(
            "INSERT INTO users (id, name, email, designation_code, primary_zone_id, employee_id, "
            "is_demo, is_active, is_deleted, is_system_user, password_hash, password_updated_at, "
            "created_at, updated_at) "
            f"VALUES ('{uid}', '{name_esc}', '{email_esc}', '{desig_esc}', {zone_val}, '{emp_esc}', "
            f"FALSE, TRUE, FALSE, FALSE, '{pw_hash}', now(), now(), now()) "
            "ON CONFLICT (employee_id) DO NOTHING;"
        )

    Path(path).write_text("\n".join(out) + "\n", encoding="utf-8")
    return len(valid_rows)


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    args = parse_args()
    csv_path = Path(args.csv)
    if not csv_path.exists():
        sys.exit(f"File not found: {csv_path}")

    raw_rows = load_csv_rows(csv_path)
    if not raw_rows:
        print("No data rows found in the CSV. Nothing to import.")
        return

    valid_rows, skipped_rows = validate_rows(raw_rows)

    print(f"{'Row':<5} {'Status':<10} {'Login ID':<14} {'Name':<25} {'Designation':<15} {'Zone':<6}  Notes")
    print("-" * 120)
    for r in valid_rows + skipped_rows:
        status = "OK" if not r["errors"] else "SKIP"
        note_str = "; ".join(r["notes"] + r["errors"])
        print(f"{r['row_num']:<5} {status:<10} {r['employee_id'][:13]:<14} {r['name'][:24]:<25} "
              f"{r['designation_code'][:14]:<15} {(r['zone_code'] or ''):<6}  {note_str}")
    print("-" * 120)
    print(f"\n{len(valid_rows)} valid  |  {len(skipped_rows)} skipped\n")

    if not valid_rows:
        print("Nothing to import.")
        return

    hasher = make_bcrypt_hasher()
    n = write_sql_file(args.out, valid_rows, hasher)
    print(f"Wrote {n} INSERT statement(s) to {args.out}")
    print("password_hash is pre-set (BCrypt of each user's Login ID) — same convention as HRMS import.")
    print("Review the file, then apply it yourself, e.g.:")
    print(f"  scp {args.out} root@<VM>:/tmp/users_abcde.sql")
    print("  ssh root@<VM> \"sudo podman cp /tmp/users_abcde.sql pia-postgres:/tmp/users_abcde.sql && "
          "sudo podman exec pia-postgres psql -U pia -d pia -f /tmp/users_abcde.sql\"")


if __name__ == "__main__":
    main()
