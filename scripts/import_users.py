"""
Import actual users from an XLSX file into the PIA Tracker database.

Usage:
    python scripts/import_users.py <path-to-xlsx>
    python scripts/import_users.py <path-to-xlsx> --dry-run
    python scripts/import_users.py <path-to-xlsx> --container pia-postgres --db-user pia --db-name pia

The script:
  1. Reads rows from the "Users" sheet (skips the sample row and empty rows).
  2. Validates each row against live designation/zone data from the DB.
  3. Skips rows where the email already exists.
  4. Inserts valid rows with is_demo = FALSE into the users table.
  5. Prints a per-row result table and a summary.
"""

import argparse
import subprocess
import sys
import uuid
from pathlib import Path
from typing import Optional

try:
    import openpyxl
except ImportError:
    sys.exit("openpyxl is required: pip install openpyxl")


# ── CLI ────────────────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(description="Import users from XLSX into PIA Tracker DB.")
    p.add_argument("xlsx", help="Path to the filled-in XLSX file")
    p.add_argument("--dry-run", action="store_true", help="Validate only, no DB writes")
    p.add_argument("--container", default="pia-postgres", help="Docker container name (default: pia-postgres)")
    p.add_argument("--db-user",  default="pia",           help="PostgreSQL user (default: pia)")
    p.add_argument("--db-name",  default="pia",           help="PostgreSQL database (default: pia)")
    return p.parse_args()


# ── DB helpers ─────────────────────────────────────────────────────────────────

def psql(container: str, db_user: str, db_name: str, sql: str) -> str:
    result = subprocess.run(
        ["docker", "exec", container, "psql", "-U", db_user, "-d", db_name, "-t", "-A", "-c", sql],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        sys.exit(f"DB error: {result.stderr.strip()}")
    return result.stdout.strip()


def fetch_set(container, db_user, db_name, sql) -> set:
    out = psql(container, db_user, db_name, sql)
    return {line.strip() for line in out.splitlines() if line.strip()}


# ── Designation alias map ──────────────────────────────────────────────────────
# Maps external / HR-system labels to system designation codes.
# Keys are normalised to uppercase with extra spaces collapsed.

DESIGNATION_ALIASES = {
    # DY CE variants
    "DY CE":                                    "DY_CE",
    "DY. CE":                                   "DY_CE",
    "DY CE(GS)":                                "DY_CE",
    "DY CE (GS)":                               "DY_CE",
    "DY CE(GATI SHAKTI)":                       "DY_CE",

    # CAO variants
    "CAO/C":                                    "CAO_C",
    "CAO":                                      "CAO_C",
    "CAO(C)":                                   "CAO_C",
    "CAO(C)/RSP":                               "CAO_C",
    "CAO(C) /RSP":                              "CAO_C",
    "CAO(C)/ROAD SAFETY PROJECT":               "CAO_C",

    # CE/C variants
    "CE/C":                                     "CE_C",
    "CE/CON":                                   "CE_C",
    "CE/CON (ROAD SAFETY PROJECT)":             "CE_C",
    "CE/CON(ROAD SAFETY PROJECT)":              "CE_C",
    "CE/CON (RSP)":                             "CE_C",

    # Executive Director variants
    "EXECUTIVE DIRECTOR/GATI SHAKTI(CIVIL-III)": "EDGS_CI",
    "EXECUTIVE DIRECTOR/GATI SHAKTI (CIVIL-III)": "EDGS_CI",
    "ED/GATI SHAKTI(CIVIL-III)":                "EDGS_CI",
    "ED/GATI SHAKTI (CIVIL-III)":               "EDGS_CI",
    "EDGS/C-I":                                 "EDGS_CI",
}

def resolve_designation(raw: str) -> tuple[str, Optional[str]]:
    """
    Returns (system_code, alias_note).
    alias_note is set when an alias was used so the caller can log it.
    """
    import re
    normalised = re.sub(r"\s+", " ", raw.strip().upper())
    if normalised in DESIGNATION_ALIASES:
        code = DESIGNATION_ALIASES[normalised]
        return code, f"mapped from '{raw}'"
    return raw.strip(), None


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    args = parse_args()
    xlsx_path = Path(args.xlsx)
    if not xlsx_path.exists():
        sys.exit(f"File not found: {xlsx_path}")

    container = args.container
    db_user   = args.db_user
    db_name   = args.db_name

    # ── Load reference data from DB ───────────────────────────────────────────
    print(f"Connecting to DB ({container} / {db_name})…")
    valid_designations = fetch_set(container, db_user, db_name,
        "SELECT code FROM designations;")
    valid_zones = fetch_set(container, db_user, db_name,
        "SELECT code FROM zones WHERE is_active = true;")
    existing_emails = fetch_set(container, db_user, db_name,
        "SELECT lower(email) FROM users WHERE is_deleted = false;")

    print(f"  {len(valid_designations)} designations, {len(valid_zones)} zones, "
          f"{len(existing_emails)} existing users loaded.\n")

    # ── Read XLSX ─────────────────────────────────────────────────────────────
    wb = openpyxl.load_workbook(xlsx_path, data_only=True)
    if "Users" not in wb.sheetnames:
        sys.exit('XLSX must contain a sheet named "Users".')
    ws = wb["Users"]

    rows = []
    # Row 3 = headers, row 4 = sample — data starts at row 5
    for row_num in range(5, ws.max_row + 1):
        def cell(col): return ws.cell(row=row_num, column=col).value

        name         = str(cell(1)).strip() if cell(1) else ""
        email        = str(cell(2)).strip() if cell(2) else ""
        desig_raw    = str(cell(3)).strip() if cell(3) else ""
        zone         = str(cell(4)).strip() if cell(4) else None
        employee_id  = str(cell(5)).strip() if cell(5) else None

        # Skip completely empty rows
        if not any([name, email, desig_raw]):
            continue
        # Skip the italic sample row if user left it in
        if email == "rajesh.sharma@nr.railnet.gov.in":
            continue

        desig, alias_note = resolve_designation(desig_raw)

        errors = []
        notes  = []
        if alias_note:
            notes.append(alias_note)
        if not name:
            errors.append("Name is required")
        if not email:
            errors.append("Email is required")
        elif "@" not in email:
            errors.append("Email looks invalid")
        if not desig_raw:
            errors.append("Designation Code is required")
        elif desig not in valid_designations:
            errors.append(f"Unknown designation '{desig_raw}'")
        if zone and zone not in valid_zones:
            errors.append(f"Unknown zone '{zone}'")
        if email and email.lower() in existing_emails:
            errors.append("Email already exists in DB -- skipped")

        rows.append({
            "row_num": row_num,
            "name": name,
            "email": email,
            "designation_code": desig,
            "zone_code": zone or None,
            "employee_id": employee_id or None,
            "errors": errors,
            "notes": notes,
        })

    if not rows:
        print("No data rows found in the XLSX (rows 5+). Nothing to import.")
        return

    # ── Print validation results ──────────────────────────────────────────────
    print(f"{'Row':<5} {'Status':<10} {'Name':<25} {'Email':<40} {'Desig':<15} {'Zone':<6}  Notes")
    print("-" * 120)

    valid_rows   = []
    skipped_rows = []

    for r in rows:
        ok = not r["errors"]
        status = "OK" if ok else "SKIP"
        all_notes = r["notes"] + r["errors"]
        note_str  = "; ".join(all_notes) if all_notes else ""
        print(f"{r['row_num']:<5} {status:<10} {r['name'][:24]:<25} {r['email'][:39]:<40} "
              f"{r['designation_code'][:14]:<15} {(r['zone_code'] or ''):<6}  {note_str}")
        if ok:
            valid_rows.append(r)
        else:
            skipped_rows.append(r)

    print("-" * 120)
    print(f"\n{len(valid_rows)} valid  |  {len(skipped_rows)} skipped\n")

    if not valid_rows:
        print("Nothing to import.")
        return

    if args.dry_run:
        print("Dry run — no changes written to DB.")
        return

    # ── Insert ────────────────────────────────────────────────────────────────
    print(f"Inserting {len(valid_rows)} user(s)…")

    inserted = 0
    failed   = 0

    for r in valid_rows:
        uid         = str(uuid.uuid4())
        name_esc    = r["name"].replace("'", "''")
        email_esc   = r["email"].replace("'", "''")
        desig_esc   = r["designation_code"].replace("'", "''")
        emp_id_val  = f"'{r['employee_id'].replace(chr(39), chr(39)*2)}'" if r["employee_id"] else "NULL"

        # Resolve zone_id from zone code
        if r["zone_code"]:
            zone_id_val = f"(SELECT id FROM zones WHERE code = '{r['zone_code']}')"
        else:
            zone_id_val = "NULL"

        sql = f"""
INSERT INTO users (id, name, email, designation_code, primary_zone_id, employee_id, is_demo,
                   is_active, is_deleted, is_system_user, created_at, updated_at)
VALUES (
    '{uid}',
    '{name_esc}',
    '{email_esc}',
    '{desig_esc}',
    {zone_id_val},
    {emp_id_val},
    FALSE,
    TRUE,
    FALSE,
    FALSE,
    now(),
    now()
);
""".strip()

        out = psql(container, db_user, db_name, sql)
        if "INSERT 0 1" in out or out == "INSERT 0 1" or out == "":
            # psql -t -A strips the result; check via a count query
            count = psql(container, db_user, db_name,
                f"SELECT count(*) FROM users WHERE email = '{email_esc}';")
            if count == "1":
                print(f"  OK Inserted: {r['name']} <{r['email']}>")
                inserted += 1
            else:
                print(f"  FAIL Failed: {r['name']} <{r['email']}> -- {out}")
                failed += 1
        else:
            print(f"  FAIL Failed: {r['name']} <{r['email']}> -- {out}")
            failed += 1

    print(f"\nDone. {inserted} inserted, {failed} failed, {len(skipped_rows)} skipped.\n")
    if inserted > 0:
        print("Users are marked is_demo=FALSE and will appear in the 'Users' section on the login page.")


if __name__ == "__main__":
    main()
