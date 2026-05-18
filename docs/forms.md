# PIA Tracker — Forms

**Status:** Draft v1.
**See also:** `architecture.md` § 4.1 (schema-as-data); `database.md` § 6 (`form_definitions` schema); `workflow.md`.

This document specifies the form definition model, JSON Schema conventions, reusable field types, per-activity form catalogs, versioning rules, and the admin editing flow.

---

## 1. Form definition model

A form definition is one row in `form_definitions` (see `database.md` § 6). Key columns:

- `activity_type_code` — which activity this form belongs to (LAND_ACQUISITION, DRAWING_APPROVAL, ...)
- `code` + `version` — uniquely identifies the form
- `schema_json` — JSON Schema Draft 2020-12 describing the data shape
- `ui_schema_json` — RJSF rendering hints (widget choices, ordering, field grouping)
- `workflow_definition_id` — null for drawings, set for everything else
- `section_codes` — ordered list for forms with section-level workflow
- `default_approver_designations` — drawing forms only

Form definitions are seeded at install via Flyway. Subsequent edits go through the admin form editor (UI archetype 6) which inserts new rows.

---

## 2. JSON Schema conventions

We use Draft 2020-12 throughout. The `$id` of each schema is `https://pia.tracker/schemas/{activity_type}/{form_code}/{version}.json`. Validation is performed server-side by networknt's json-schema-validator on every record save.

**Standard top-level structure:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://pia.tracker/schemas/land_acquisition/LAND_ACQUISITION_V1/1.json",
  "type": "object",
  "title": "Land Acquisition Record",
  "description": "Per-village land acquisition data",
  "required": ["village_name", "village_chainage_from", "village_chainage_to"],
  "properties": {
    "village_name": { "type": "string", "minLength": 1, "maxLength": 256 },
    "village_chainage_from": { "$ref": "#/$defs/Chainage" },
    "village_chainage_to": { "$ref": "#/$defs/Chainage" },
    "srp": { "$ref": "#/$defs/SrpSection" },
    "cala": { "$ref": "#/$defs/CalaSection" },
    "..." : "..."
  },
  "$defs": {
    "Chainage": { "type": "string", "pattern": "^[0-9]+\\+[0-9]{3}$" },
    "SrpSection": { "type": "object", "properties": { "..." : "..." } }
  }
}
```

**ui_schema_json** corresponds to RJSF's ui-schema:

```json
{
  "ui:order": ["village_name", "village_chainage_from", "village_chainage_to", "srp", "cala", "..."],
  "village_chainage_from": { "ui:widget": "chainage" },
  "village_chainage_to": { "ui:widget": "chainage" },
  "srp": {
    "ui:title": "SRP — Survey & Reconnaissance",
    "ui:order": ["srp_declared_in_gaz_on", "srp_gazette_pdf"],
    "srp_gazette_pdf": { "ui:widget": "attachment" }
  }
}
```

---

## 3. Reusable field types

Custom RJSF widgets are registered via `ui:widget`. Implementation lives in `frontend/src/forms/widgets/`.

### `chainage`

Railway chainage value in `KM+M` format, e.g., `132+450`. Validates `^\d+\+\d{3}$`. Component shows two inputs side by side (km, m).

### `gazette_reference`

Composite field: gazette publication date + gazette number + PDF attachment. Stored as object: `{ published_on: "2025-04-15", gaz_number: "12345", pdf_attachment_id: "uuid" }`.

### `attachment`

Single-file upload. PDF only at v1, 48 MB cap. Stored as `attachment_id` (UUID) on the field. Triggers ClamAV scan; on success the field gets a viewable link.

### `village_reference`

Looks up a village from the project's `villages` denormalized table (seeded from the project metadata). Returns a village ID. Used in any field that needs a village picker.

### `approver_user_picker`

Drawing-only. Filters by designation + zone (see `permissions.md` § 5 picker F). Returns `user_id`.

### `currency`

Decimal field in rupees, displayed with thousand-separators, stored as a string to avoid float loss. Schema type `string` with `pattern: ^-?\\d+(\\.\\d{1,2})?$`.

### `hectares`

Decimal field in hectares, four decimal places. Stored as string, `pattern: ^\\d+(\\.\\d{1,4})?$`.

### `daterange`

Two date fields (from, to) with cross-field validation (`from <= to`).

### `approval_chain_entry`

Used inside drawing forms for each approver row. Composite: `{ designation_code, user_id?, status, acted_at?, comment? }`. Renders as a checklist item.

---

## 4. Section-level workflow forms

For forms with section-level workflow (Land Acquisition has 9 sections, Forest Clearance has 3 stages), the schema is organized as nested objects per section:

```json
{
  "type": "object",
  "properties": {
    "village_name": { "type": "string" },
    "srp": { "$ref": "#/$defs/SrpSection" },
    "cala": { "$ref": "#/$defs/CalaSection" },
    "section_20a": { "$ref": "#/$defs/Section20A" },
    "jmr": { "$ref": "#/$defs/Jmr" },
    "section_20d": { "$ref": "#/$defs/Section20D" },
    "section_20e": { "$ref": "#/$defs/Section20E" },
    "section_20f_g": { "$ref": "#/$defs/Section20FG" },
    "section_20h_i": { "$ref": "#/$defs/Section20HI" },
    "mutation": { "$ref": "#/$defs/Mutation" }
  }
}
```

`form_definitions.section_codes` lists these section keys in order: `["srp", "cala", "section_20a", "jmr", "section_20d", "section_20e", "section_20f_g", "section_20h_i", "mutation"]`.

The engine starts 9 `workflow_instances` per Land Acquisition record, one per section, each on the same `workflow_definition_id`. Each section can advance independently. Soft warnings appear in the UI when prerequisites are not yet authenticated (e.g., editing section_20e while section_20a is still in draft). The user can proceed past warnings.

---

## 5. Per-activity form catalog (v1 forms)

### Project Creation Form

Belongs to no activity type — used for project entity itself. Three sections (matching the wizard steps):

1. **Identity**: project_code (unique), name, project_type (enum), zone_id, division_id, target_completion_year.
2. **Scope**: chainage_from, chainage_to (chainage widget), length_km, recommended_by_board_on (date), villages_estimated_count, brief description.
3. **Documents**: sanction order PDF, board minutes PDF, scope document PDF (each an attachment).

### Activity Creation Form

Used by Add-Activity modal. Five fields:

1. activity_type_code (dropdown of `activity_types`)
2. name (default to activity type name; user can append phase info)
3. scope_notes (textarea, optional)
4. target_completion_date (date, optional)
5. primary_dyce_user_id (picker F filtered to project's Dy CE/Cs)

### Land Acquisition Form (`LAND_ACQUISITION_V1`)

Per-village record. Nine sections, all using the standard record workflow (so 9 workflow instances per record).

Section fields (illustrative — full schema in seed migration):

- **SRP**: srp_declared_in_gaz_on (date), srp_gazette (gazette_reference)
- **CALA**: cala_received_from_state_on (date), cala_publication_in_gaz (gazette_reference)
- **Section 20A**: notification_date (date), gazette_pub (gazette_reference), local_newspaper_pub_date (date), local_newspaper_pdf (attachment)
- **JMR**: jmr_fee_demanded_on (date), jmr_fee_amount (currency), jmr_fee_submitted_on (date), jmr_done_on (date), revision_required (boolean), revision_reason (string, conditional)
- **Section 20D**: objections_received (boolean), objections_summary (textarea), hearing_date (date), objections_pdf (attachment)
- **Section 20E**: declaration_gazette (gazette_reference), local_newspaper_pub_date (date)
- **Section 20F-G**: competent_authority (string), compensation_determined_on (date), compensation_amount (currency), market_value_basis (textarea)
- **Section 20H-I**: payment_made_to (string), payment_date (date), possession_given_on (date), possession_pdf (attachment)
- **Mutation**: mutation_done_on (date), revenue_records_updated (boolean), land_plan_approved (boolean), mutation_certificate (attachment), arbitration_required (boolean), arbitration_notes (textarea, conditional)

Top-level fields (outside sections): village_name, village_chainage_from, village_chainage_to, district, sub_division_taluka, area_hectares_total, area_hectares_private, area_hectares_govt, area_hectares_forest.

### Utility Shifting Form (master form `UTILITY_SHIFTING_V1`)

One form for all utility types, with `utility_type` discriminator driving conditional fields. Record-level workflow only.

Common fields: utility_type (enum: LT_HT_EHV / PIPELINE / SNT / QUARTER_STATION / TSS_SS_OHE / OTHER), owner_agency, railway_chainage_from, railway_chainage_to, length_alignment_affected_km, relocation_required (boolean), executing_agency (enum: RAILWAY / USER / OPEN_LINE / CONSTRUCTION), target_date_for_removal (date), remark.

Conditional fields driven by `utility_type`:

- LT_HT_EHV: voltage_type (enum: LT / HT / EHV)
- PIPELINE: pipeline_type (enum: WATER / INFLAMMABLE / OTHER)
- SNT: infringement_type, position_of_estimate_and_funds (textarea, when executing_agency = OPEN_LINE), material_available (boolean, when executing_agency = CONSTRUCTION), executing_agency_assigned (boolean)
- QUARTER_STATION: drawing_and_execution_plan_status (textarea), state_govt_consent_obtained (boolean)
- TSS_SS_OHE: same as QUARTER_STATION

`record_subtype` on the activity_records row mirrors `utility_type` for filtering convenience.

### Forest Clearance Form (`FOREST_CLEARANCE_V1`)

Three sections (section-level workflow):

- **Stage I — Submission & In-Principle Approval**: proposal_submitted_on_parivesh (boolean + date), scrutiny_by_dfo (boolean + date), site_inspection (boolean + date), inspection_report_pdf (attachment), in_principle_approval (boolean + date), stipulated_conditions (textarea), queries[] (array of: submitted_on, returned_on, remark)
- **Stage II — Final Approval**: compliance_submitted_on (date), state_recommendation_forwarded_on (date), final_approval_on (date), final_approval_pdf (attachment), queries[]
- **Post-Approval**: formal_order_issued_on (date), tree_felling_started_on (date), compensatory_afforestation_initiated_on (date), queries[]

Top-level: forest_division_name, forest_area_hectares, project_chainage_from, project_chainage_to.

### Drawing Approval Form (one definition per drawing type)

Each drawing type has its own form definition (ESP, SIP, ST_LT_TOC, SWR, SWRD, FAT, SAT, RSP, CABLE_ROUTE_PLAN, LOP, PROJECT_SHEET, GAD_MEGA, GAD_MAJOR, GAD_MINOR, LWR_PLAN, CURVE_DETAILS, GRADE_CONDONATION, BRIDGE_MINOR_SANCTION, YARD_DISPENSATION, YARD_MINOR_SANCTION, STATION_BUILDING_GAD, FOB_GAD_TAD, TUNNEL_DESIGN).

`workflow_definition_id = null` — drawings use the checklist model.

Common fields: drawing_number, name_of_section, drawing_title, initiation_date (date), revision_number, drawing_pdf (attachment), drafted_by (user), remarks.

Per-type fields (illustrative): ESP carries name_of_station and concept_plan_diff (textarea); GAD_MEGA carries bridge_chainage, span_arrangement, deck_type; TUNNEL_DESIGN carries tunnel_alignment_approved (boolean), length_meters, chainage_from, chainage_to, geotech_report_available (boolean), gad_submitted (boolean); etc.

`default_approver_designations` for ESP is `[DY_CE, DY_CEE, DY_CSTE, SR_DEN, SR_DEN_CO, SR_DOM, SR_DEE_TRD, SR_DSTE, SR_DCM, ADRM, DRM, CE_PLANNING]`. Per-drawing-type lists are seeded explicitly — see `db/data/V030__seed_drawing_approver_designations.sql`.

`record_subtype` on the activity_records row equals the drawing type code (`ESP`, `GAD_MEGA`, etc.), so the records list and inbox can filter by it.

### Tender Packaging Form (`TENDER_PACKAGING_V1`)

Record-level workflow. Simple form:

- package_name (string)
- scope_description (textarea)
- estimated_value (currency)
- epc_document_prepared (boolean)
- epc_document_pdf (attachment, conditional)
- tender_finalized (boolean)
- tender_finalization_date (date, conditional)
- nit_published_on (date)
- tender_id (string)
- remarks (textarea)

### Temporary Office Space Form (`TEMPORARY_OFFICE_SPACE_V1`)

Record-level workflow. One record per office site:

- temporary_office_required (boolean)
- count (integer)
- location_chainage (chainage)
- location_name (string)
- structure_type (enum: NEW_REQUIRED / OLD_AVAILABLE / HIRING)
- new_structure_agency_available (boolean, conditional)
- new_structure_tdc (date, conditional)
- old_structure_possession_given_by_ol (boolean, conditional)
- old_structure_likely_tdc (date, conditional)
- hiring_rent_agreement_available (boolean, conditional)
- hiring_tdc (date, conditional)
- remarks

---

## 6. Versioning rules

Form versioning is hybrid (decision 1):

**Backwards-compatible changes** (auto-migrate on next read):

- Adding an optional field
- Widening a string `maxLength`
- Adding a value to an enum
- Making a required field optional
- Adding a new $defs definition
- Adding a new section to a section-workflow form (existing records' workflow_instances stay; the new section gets an instance auto-created on first read)

**Breaking changes** (require explicit Kotlin migration class):

- Renaming a field (with no alias)
- Narrowing a string `maxLength` below existing data
- Removing an enum value used in existing data
- Making an optional field required
- Removing a field
- Removing a section
- Changing a field's type

The schema-diff classifier in `forms/SchemaDiffClassifier.kt` compares two `schema_json` blobs and returns either `BackwardsCompatible` or `Breaking(reasons)`. The admin form editor shows this label before save.

Breaking changes: the admin uploads a Kotlin migration class to `backend/src/main/resources/db/jsonb-migration/V{date}_{seq}__{description}.kt` extending `JsonbMigration` with a `transform(data: JsonNode): JsonNode` method. On first read of an affected `activity_records.data_json`, the migration runs lazily; the result is saved back as `schema_version_at_save` advances.

---

## 7. Admin form editor flow

Located at `/admin/forms` (Admin role only).

1. List of all `form_definitions` rows, latest active version per code.
2. Click a form → editor view: two-pane (left = JSON Schema, right = live RJSF preview).
3. Editor offers visual mode (click-to-add field) and raw JSON mode.
4. On "Save Draft", a new `form_definitions` row is inserted with `is_active = false`. The previous active version stays active.
5. The editor runs the diff classifier; if `Breaking`, prompts for migration class upload.
6. On "Publish", the new version becomes `is_active = true` and the old one becomes `is_active = false`. Existing records bound to old version continue to use it; new records use the new version.
7. Side-by-side "Affected records" tab shows how many existing records exist on the previous version.

The editor is permission-gated by `FORM_DEFINITION.UPDATE` and `FORM_DEFINITION.PUBLISH`.

---

## 8. Cross-field validators

JSON Schema covers type/range/required. Business rules with multi-field dependencies are written in Kotlin per form:

```kotlin
interface FormValidator {
    val activityTypeCode: String
    val formCode: String
    fun validate(data: JsonNode, context: ValidationContext): List<ValidationError>
}

@Component
class LandAcquisitionValidator : FormValidator {
    override val activityTypeCode = "LAND_ACQUISITION"
    override val formCode = "LAND_ACQUISITION_V1"

    override fun validate(data: JsonNode, context: ValidationContext): List<ValidationError> {
        val errors = mutableListOf<ValidationError>()
        val section20a = data["section_20a"]?.get("notification_date")?.asText()?.let(LocalDate::parse)
        val section20e = data["section_20e"]?.get("declaration_gazette")?.get("published_on")?.asText()?.let(LocalDate::parse)
        if (section20a != null && section20e != null && section20e.isBefore(section20a)) {
            errors += ValidationError("section_20e.declaration_gazette.published_on",
                "20E declaration date must be on or after 20A notification date")
        }
        // ... more rules
        return errors
    }
}
```

Validators are auto-discovered by Spring DI. The `FormService.save()` runs JSON Schema validation, then iterates registered validators for the form, then attempts the database write.

---

## 9. Seed data plan

The Flyway migration sequence for forms:

```
V100__form_definitions_table.sql                 -- schema (already in V001 baseline)
V101__seed_land_acquisition_v1.sql               -- form definition
V102__seed_forest_clearance_v1.sql
V103__seed_utility_shifting_v1.sql
V104__seed_tender_packaging_v1.sql
V105__seed_temporary_office_space_v1.sql
V110__seed_drawing_esp_v1.sql                    -- one migration per drawing type for diff-ability
V111__seed_drawing_sip_v1.sql
V112__seed_drawing_st_lt_v1.sql
... (one per drawing type)
V130__seed_drawing_approver_designations.sql     -- default approver lists per drawing
```

Each seed migration inserts one `form_definitions` row with the full schema/ui_schema JSON. The JSON content is in a file alongside the migration, loaded via `pg_read_file()` for readability. Detailed seed schemas are too long for this document — they live in the migrations themselves and become the reference.

---

## 10. Testing forms

For each form definition:

- **JSON Schema validation tests**: a fixture file per form (`tests/fixtures/{form_code}_valid.json`, `_invalid.json`) asserts the schema accepts and rejects the right shapes.
- **Diff classifier tests**: pairs of schema versions, asserts the classifier verdict.
- **Cross-field validator tests**: parameterized tests covering each business rule.
- **Round-trip tests**: form save → read → render → re-save produces the same data_json.
- **Migration tests** (for each breaking-change migration): old-shape input → migrate → new-shape output matches expected.

The end-to-end "fill the form, submit, verify, authenticate" scenarios are in `testing.md` and Playwright tests.
