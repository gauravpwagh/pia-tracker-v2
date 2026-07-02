#!/usr/bin/env python3
"""
generate_user_migration.py
--------------------------
Reads a tab-separated (or comma-separated) HRMS user export and produces a
Flyway data migration SQL file that inserts those users into the PIA Tracker
`users` table.

Usage:
    python ops/generate_user_migration.py <path-to-csv>

Output:
    backend/src/main/resources/db/data/V022_001__seed_hrms_users.sql

The script is idempotent — re-running it overwrites the output file.
Inspect the generated SQL before running `make migrate`.
"""

import csv
import sys
import uuid
import re
from pathlib import Path

# ──────────────────────────────────────────────────────────────────────────────
# Mapping: HRMS desig_desc (normalised, lowercase) → system designation_code
# Add new rows here if you encounter unmapped designations in your CSV.
# ──────────────────────────────────────────────────────────────────────────────
DESIG_MAP: dict[str, str] = {
    # Construction
    "edgs/c-i":         "EDGS_CI",
    "edgs ci":          "EDGS_CI",
    "cao/c":            "CAO_C",
    "cao c":            "CAO_C",
    "ce/c":             "CE_C",
    "ce c":             "CE_C",
    "ce":               "CE_C",
    "ce/planning":      "CE_PLANNING",
    "ce planning":      "CE_PLANNING",
    "dy ce/c":          "DY_CE_C",
    "dy ce c":          "DY_CE_C",
    "dy ce/planning":   "DY_CE_PLANNING",
    "dy ce planning":   "DY_CE_PLANNING",
    "dy ce/design":     "DY_CE_DESIGN",
    "dy ce design":     "DY_CE_DESIGN",
    "dy ce":            "DY_CE",
    "dyce":             "DY_CE",
    # Note: "Dy CE (GS)" intentionally NOT mapped here — it slugifies to
    # DY_CE_GS and gets its own designation row (per user request).
    # CAO variants
    "cao":              "CAO_C",
    "cao(c)/rsp":       "CAO_C",       # Road Safety Project posting
    "cao(c) rsp":       "CAO_C",
    # CE variants with project suffixes
    "ce/con (road safety project)": "CE_C",
    "ce/con(road safety project)":  "CE_C",
    # Engineering approvers
    "sr den":           "SR_DEN",
    "sr den/co":        "SR_DEN_CO",
    "cbe":              "CBE",
    "dy ce/bridge":     "DY_CE_BRIDGE",
    "cte":              "CTE",
    "dy ce/track":      "DY_CE_TRACK",
    "cpde":             "CPDE",
    "pce":              "PCE",
    # S&T
    "dy cste":          "DY_CSTE",
    "sr dste":          "SR_DSTE",
    "cste/con":         "CSTE_CON",
    "cste/ol":          "CSTE_OL",
    "pscte":            "PSCTE",
    # Electrical
    "dy cee":           "DY_CEE",
    "sr dee/trd":       "SR_DEE_TRD",
    "cee/con":          "CEE_CON",
    "pcee":             "PCEE",
    # Operations / Safety
    "sr dom":           "SR_DOM",
    "pcom":             "PCOM",
    "sr dcm":           "SR_DCM",
    "adrm":             "ADRM",
    "drm":              "DRM",
    "ctpm":             "CTPM",
    "pcso":             "PCSO",
    "crs":              "CRS",
    "gm":               "GM",
    # System
    "admin":            "ADMIN",
    "super admin":      "SUPER_ADMIN",
}

DATA_DIR = Path(__file__).parent.parent / "backend/src/main/resources/db/data"
# Repeatable (R__) migrations: Flyway re-runs them whenever their content
# changes, so regenerating from an updated CSV just re-applies cleanly — no
# version bumps, no checksum errors. They run AFTER all versioned migrations,
# in alphabetical order of description, so the numeric prefixes enforce the
# FK-safe order: zones → designations → users. All SQL is idempotent.
ZONES_OUTPUT        = DATA_DIR / "R__91_hrms_extra_zones.sql"
DESIGNATIONS_OUTPUT = DATA_DIR / "R__92_hrms_designations.sql"
OUTPUT              = DATA_DIR / "R__93_hrms_users.sql"

# Designation codes already seeded by V001_003__seed_designations.sql.
# Anything not in DESIG_MAP and not here gets a new auto-created designation row.
KNOWN_DESIGNATIONS = {
    "EDGS_CI", "CAO_C", "CE_C", "CE_PLANNING", "DY_CE_C", "DY_CE_PLANNING",
    "DY_CE_DESIGN", "DY_CE", "SR_DEN", "SR_DEN_CO", "CBE", "DY_CE_BRIDGE",
    "CTE", "DY_CE_TRACK", "CPDE", "PCE", "DY_CSTE", "SR_DSTE", "CSTE_CON",
    "CSTE_OL", "PSCTE", "DY_CEE", "SR_DEE_TRD", "CEE_CON", "PCEE", "SR_DOM",
    "PCOM", "SR_DCM", "ADRM", "DRM", "CTPM", "PCSO", "CRS", "GM",
    "ADMIN", "SUPER_ADMIN",
}


def normalise(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip().lower())


def slugify_desig(desig_desc: str) -> str:
    """Turn an HRMS designation label into an uppercase code.
    e.g. 'Dy CE (GS)' -> 'DY_CE_GS', 'CE/Con (Road Safety)' -> 'CE_CON_ROAD_SAFETY'."""
    code = re.sub(r"[^A-Za-z0-9]+", "_", desig_desc.strip().upper()).strip("_")
    return code or "UNKNOWN"


def map_designation(
    desig_desc: str,
    desig_code: str,
    emp_id: str,
    new_designations: dict[str, str],
) -> str:
    """Return the system designation_code for an HRMS designation.

    - If it's in DESIG_MAP, use the curated mapping (keeps core roles wired to
      existing permissions/workflows).
    - Otherwise derive a clean code via slugify and record it in
      `new_designations` so a designations migration is generated for it.
    """
    key = normalise(desig_desc)
    if key in DESIG_MAP:
        return DESIG_MAP[key]
    code = slugify_desig(desig_desc)
    if code not in KNOWN_DESIGNATIONS:
        new_designations[code] = desig_desc.strip()
    return code


def role_for_designation(code: str, is_new: bool) -> str | None:
    """Default role for a designation, per the import rule:
      EDGS_* → ROLE_EDGS_CI  (project create + read)
      DY_*   → ROLE_DY_CE_C  (project read + record entry/edit)
      CE_*   → ROLE_CE_C     (project read + create/allocate)
      otherwise → ROLE_APPROVER_GENERIC for *new* codes (so they aren't
                  permission-less); None for existing codes (keep their seed)."""
    if code.startswith("EDGS_"):
        return "ROLE_EDGS_CI"
    if code.startswith("DY_"):
        return "ROLE_DY_CE_C"
    if code.startswith("CE_"):
        return "ROLE_CE_C"
    return "ROLE_APPROVER_GENERIC" if is_new else None


def sql_escape(s: str) -> str:
    return s.replace("'", "''")


def email(emp_hrms_id: str, zone_code: str) -> str:
    return f"{emp_hrms_id.lower()}@{zone_code.lower()}.railnet.gov.in"


EXPECTED_COLUMNS = [
    "emp_hrms_id", "employee_name", "desig_code",
    "desig_desc", "zone_code", "zone_name",
]


def detect_delimiter(sample: str) -> str:
    """Sniff the delimiter, falling back to a tab/comma heuristic."""
    try:
        return csv.Sniffer().sniff(sample, delimiters="\t,;|").delimiter
    except csv.Error:
        # Heuristic fallback: pick whichever appears most in the header line.
        first = sample.splitlines()[0] if sample else ""
        counts = {d: first.count(d) for d in ("\t", ",", ";", "|")}
        return max(counts, key=counts.get) or ","


def normalise_header(name: str) -> str:
    """Strip whitespace/BOM and lowercase a header field name."""
    return name.strip().lstrip("﻿").lower()


def main(csv_path: str, dry_run: bool = False) -> None:
    path = Path(csv_path)
    if not path.exists():
        print(f"Error: file not found: {csv_path}")
        sys.exit(1)

    text = path.read_text(encoding="utf-8-sig")
    rows = text.splitlines()
    if not rows:
        print("Error: CSV is empty.")
        sys.exit(1)

    delimiter = detect_delimiter("\n".join(rows[:20]))
    delim_name = {"\t": "TAB", ",": "COMMA", ";": "SEMICOLON", "|": "PIPE"}.get(delimiter, repr(delimiter))

    reader = csv.DictReader(rows, delimiter=delimiter)
    # Normalise header names so 'Zone_Code ' etc. still map correctly.
    if reader.fieldnames:
        reader.fieldnames = [normalise_header(h) for h in reader.fieldnames]
    all_rows = list(reader)

    # ── Diagnostics: show how the file was parsed ─────────────────────────
    headers = reader.fieldnames or []
    missing = [c for c in EXPECTED_COLUMNS if c not in headers]
    print(f"\nDetected delimiter : {delim_name}")
    print(f"Parsed columns     : {headers}")
    print(f"Data rows          : {len(all_rows)}")
    if missing:
        print(f"\n  ✗ MISSING expected column(s): {missing}")
        print("    The header names in your CSV don't match what the script expects.")
        print("    Check the delimiter above is correct, or rename the columns.")
        sys.exit(1)

    print("\nFirst 3 rows as parsed (verify columns line up):")
    for r in all_rows[:3]:
        print(f"  - id={r.get('emp_hrms_id','').strip()!r:12} "
              f"name={r.get('employee_name','').strip()!r:24} "
              f"desig={r.get('desig_desc','').strip()!r:14} "
              f"zone={r.get('zone_code','').strip()!r}")

    if dry_run:
        print("\n[dry-run] No files written. Re-run without --dry-run to generate SQL.")
        return

    # ── Collect every zone referenced in the CSV ──────────────────────────
    # We create them all idempotently (ON CONFLICT DO NOTHING). Existing zones
    # keep their seeded names; zones missing from the DB (e.g. RB) get created.
    # No user is ever skipped for an unrecognised zone.
    csv_zones: dict[str, str] = {}  # zone_code → zone_name (first non-empty seen)
    for row in all_rows:
        zc = row.get("zone_code", "").strip().upper()
        zn = row.get("zone_name", "").strip()
        if zc and zc not in csv_zones:
            csv_zones[zc] = zn

    zone_rows = []
    for i, (zc, zn) in enumerate(sorted(csv_zones.items())):
        full_name = sql_escape(zn or zc)
        zone_rows.append(f"    ('{zc}', '{full_name}', '{zc}', {200 + i})")
    zones_sql = (
        "-- PIA Tracker — all zones referenced by the HRMS import (repeatable).\n"
        "-- Generated by ops/generate_user_migration.py. Idempotent: existing\n"
        "-- zones keep their seeded name/short_name; missing ones are created.\n\n"
        "INSERT INTO zones (code, name, short_name, display_order)\nVALUES\n"
        + ",\n".join(zone_rows)
        + "\nON CONFLICT (code) DO NOTHING;\n"
    )
    ZONES_OUTPUT.write_text(zones_sql, encoding="utf-8")
    print(f"\n  ✓ Ensured {len(zone_rows)} zone(s) exist → {ZONES_OUTPUT.name}")

    # ── Second pass: build INSERT rows ───────────────────────────────────
    inserts: list[str] = []
    new_designations: dict[str, str] = {}  # new code → original HRMS label
    used_desig_codes: set[str] = set()     # every designation_code assigned to a user
    skipped: list[str] = []

    for row in all_rows:
        emp_id    = row.get("emp_hrms_id", "").strip()
        name      = row.get("employee_name", "").strip()
        desig_code= row.get("desig_code", "").strip()
        desig_desc= row.get("desig_desc", "").strip()
        zone_code = row.get("zone_code", "").strip().upper()

        if not emp_id or not name or not zone_code:
            skipped.append(emp_id or str(row))
            continue

        desig_system = map_designation(desig_desc, desig_code, emp_id, new_designations)
        used_desig_codes.add(desig_system)

        uid  = str(uuid.uuid4())
        mail = email(emp_id, zone_code)

        inserts.append(
            f"    ('{uid}', '{sql_escape(emp_id)}', "
            f"'{sql_escape(name)}', '{sql_escape(mail)}', "
            f"'{desig_system}', "
            f"(SELECT id FROM zones WHERE code = '{zone_code}'), "
            f"true, false)"
        )

    if not inserts:
        print("No valid rows found — nothing to generate.")
        sys.exit(1)

    # ── Generate designations + default-role migration ───────────────────
    # Part A: create rows for any new designation codes.
    # Part B: wire default roles so imported users have permissions:
    #   DY_* → ROLE_DY_CE_C, CE_* → ROLE_CE_C, new others → ROLE_APPROVER_GENERIC.
    desig_rows = []
    for i, (code, label) in enumerate(sorted(new_designations.items())):
        display_order = 1000 + i
        desig_rows.append(
            f"    ('{sql_escape(code)}', '{sql_escape(label)}', "
            f"'{sql_escape(label[:32])}', 'CONSTRUCTION', false, true, "
            f"{display_order}, '{sql_escape(label)} (imported from HRMS)')"
        )

    role_rows = []
    role_summary: list[str] = []
    for code in sorted(used_desig_codes):
        role = role_for_designation(code, is_new=code in new_designations)
        if role:
            role_rows.append(f"    ('{sql_escape(code)}', '{role}')")
            role_summary.append(f"{code} → {role}")

    if desig_rows or role_rows:
        parts = [
            "-- PIA Tracker — HRMS designations + default roles (repeatable migration).",
            "-- Generated by ops/generate_user_migration.py.",
            "-- New designations default to data-entry roles to satisfy",
            "-- chk_designations_at_least_one_role. Default-role rules:",
            "--   DY_* → ROLE_DY_CE_C, CE_* → ROLE_CE_C, new others → ROLE_APPROVER_GENERIC.",
            "",
        ]
        if desig_rows:
            parts += [
                "INSERT INTO designations",
                "    (code, name, short_label, category, is_approval_role, is_data_entry_role, display_order, description)",
                "VALUES",
                ",\n".join(desig_rows),
                "ON CONFLICT (code) DO NOTHING;",
                "",
            ]
        if role_rows:
            parts += [
                "INSERT INTO designation_default_roles (designation_code, role_code)",
                "VALUES",
                ",\n".join(role_rows),
                "ON CONFLICT (designation_code, role_code) DO NOTHING;",
                "",
            ]
        DESIGNATIONS_OUTPUT.write_text("\n".join(parts), encoding="utf-8")
        print(f"\n  ✓ Generated {len(new_designations)} new designation(s) + "
              f"{len(role_rows)} default-role mapping(s) → {DESIGNATIONS_OUTPUT.name}")

    lines = ",\n".join(inserts)
    sql = f"""\
-- PIA Tracker — Real HRMS users (repeatable migration).
-- Generated by ops/generate_user_migration.py from HRMS export.
-- DO NOT hand-edit; re-run the script if the source CSV changes.
--
-- Designation mapping: see ops/generate_user_migration.py DESIG_MAP.
-- Designations not in DESIG_MAP get a slugified code (e.g. Dy CE(GS) -> DY_CE_GS)
-- and are created in R__92_hrms_designations.sql.

-- Deactivate seed demo users so they don't appear in the login picker.
UPDATE users SET is_active = false
WHERE employee_id IN ('EMP001','EMP002','EMP003','EMP004','EMP005','EMP006')
  AND is_system_user = false;

INSERT INTO users (id, employee_id, name, email, designation_code, primary_zone_id, is_active, is_system_user)
VALUES
{lines}
ON CONFLICT (employee_id) DO UPDATE
    SET name             = EXCLUDED.name,
        designation_code = EXCLUDED.designation_code,
        primary_zone_id  = EXCLUDED.primary_zone_id,
        is_active        = true;
"""

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(sql, encoding="utf-8")

    print(f"\n✓ Generated {len(inserts)} user(s) → {OUTPUT.name}")
    if new_designations:
        print(f"\n⚠  {len(new_designations)} new designation code(s) created (review R__92):")
        for code, label in sorted(new_designations.items()):
            print(f"     {label!r:30} → {code}")
    if skipped:
        print(f"\n⚠  Skipped {len(skipped)} row(s) (blank id/name or excluded zone).")
    print("\nRepeatable migration order: R__91 zones → R__92 designations → R__93 users")
    print("\nNext steps:")
    print("  1. Review the generated SQL files.")
    print("  2. make migrate   (or make reset && make setup if starting fresh)")


if __name__ == "__main__":
    # Force UTF-8 stdout so glyphs (✓ ✗ ⚠ →) print on any console (e.g. Windows cp1252).
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    dry = "--dry-run" in sys.argv
    if len(args) != 1:
        print(f"Usage: python {sys.argv[0]} [--dry-run] <path-to-hrms-csv>")
        sys.exit(1)
    main(args[0], dry_run=dry)
