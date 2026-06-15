/**
 * ActivityMetadataForm — type-specific fields rendered as controlled React
 * components.  No Ant Design Form field registration (no `name` props) —
 * the parent supplies `values` and an `onChange(key, value)` callback so
 * that metadata is captured in plain React state with zero form-store magic.
 *
 * ActivityMetadataView — read-only Descriptions block for the same data.
 */

import { Descriptions, Form, Input, InputNumber } from 'antd';

// ── Option lists ────────────────────────────────────────────────────────────

const UTILITY_TYPE_OPTIONS = [
  { value: 'LT_HT_EHV',       label: 'LT / HT / EHV (Electrical Lines)' },
  { value: 'PIPELINE',         label: 'Pipeline' },
  { value: 'SNT',              label: 'S&T (Signalling & Telecom)' },
  { value: 'QUARTER_STATION',  label: 'Quarter / Station Building' },
  { value: 'TSS_SS_OHE',      label: 'TSS / SS / OHE' },
  { value: 'OTHER',            label: 'Other' },
];

const EXECUTING_AGENCY_OPTIONS = [
  { value: 'RAILWAY',       label: 'Railway (Construction)' },
  { value: 'USER',          label: 'User Department' },
  { value: 'OPEN_LINE',     label: 'Open Line' },
  { value: 'CONSTRUCTION',  label: 'Construction Organisation' },
];

const VOLTAGE_LEVEL_OPTIONS = [
  { value: 'LT_11KV',   label: 'LT / 11 kV' },
  { value: 'HT_33KV',   label: 'HT / 33 kV' },
  { value: 'HT_66KV',   label: 'HT / 66 kV' },
  { value: 'EHV_110KV', label: 'EHV / 110 kV' },
  { value: 'EHV_220KV', label: 'EHV / 220 kV' },
  { value: 'EHV_400KV', label: 'EHV / 400 kV' },
];

const FLUID_TYPE_OPTIONS = [
  { value: 'WATER',  label: 'Water' },
  { value: 'OIL',    label: 'Oil / Petroleum' },
  { value: 'GAS',    label: 'Gas' },
  { value: 'SEWAGE', label: 'Sewage' },
  { value: 'OTHER',  label: 'Other' },
];

const UTILITY_STATUS_OPTIONS = [
  { value: 'NOT_STARTED',  label: 'Not Started' },
  { value: 'IN_PROGRESS',  label: 'In Progress' },
  { value: 'COMPLETED',    label: 'Completed' },
  { value: 'ON_HOLD',      label: 'On Hold' },
];

const DRAWING_TYPE_OPTIONS = [
  { value: 'ESP',                    label: 'ESP — Earth Slope Profile' },
  { value: 'SIP',                    label: 'SIP — Section Improvement Plan' },
  { value: 'ST_LT_TOC',             label: 'ST / LT / TOC' },
  { value: 'SWR',                    label: 'SWR — Site Working Report' },
  { value: 'SWRD',                   label: 'SWRD' },
  { value: 'FAT',                    label: 'FAT — Final Alignment Transect' },
  { value: 'SAT',                    label: 'SAT — Site Assessment Template' },
  { value: 'RSP',                    label: 'RSP — Route Survey Plan' },
  { value: 'CABLE_ROUTE_PLAN',       label: 'Cable Route Plan' },
  { value: 'LOP',                    label: 'LOP — Layout of Project' },
  { value: 'PROJECT_SHEET',          label: 'Project Sheet' },
  { value: 'GAD_MEGA',               label: 'GAD — Mega Bridge' },
  { value: 'GAD_MAJOR',              label: 'GAD — Major Bridge' },
  { value: 'GAD_MINOR',              label: 'GAD — Minor Bridge' },
  { value: 'LWR_PLAN',               label: 'LWR Plan' },
  { value: 'CURVE_DETAILS',          label: 'Curve Details' },
  { value: 'GRADE_CONDONATION',      label: 'Grade Condonation' },
  { value: 'BRIDGE_MINOR_SANCTION',  label: 'Bridge Minor Sanction' },
  { value: 'YARD_DISPENSATION',      label: 'Yard Dispensation' },
  { value: 'YARD_MINOR_SANCTION',    label: 'Yard Minor Sanction' },
  { value: 'STATION_BUILDING_GAD',   label: 'Station Building GAD' },
  { value: 'FOB_GAD_TAD',            label: 'FOB GAD / TAD' },
  { value: 'TUNNEL_DESIGN',          label: 'Tunnel Design' },
];

const STRUCTURE_TYPE_OPTIONS = [
  { value: 'NEW_REQUIRED',  label: 'New Structure Required' },
  { value: 'OLD_AVAILABLE', label: 'Old Structure Available' },
  { value: 'HIRING',        label: 'Hiring / Rent' },
];


// ── Label maps for view mode ───────────────────────────────────────────────

const LABEL_MAP: Record<string, Record<string, string>> = {
  LAND_ACQUISITION: {
    district:                'District',
    sub_division_taluka:     'Sub-Division / Taluka',
    area_hectares_total:     'Total Area (ha)',
    area_hectares_private:   'Private Land (ha)',
    area_hectares_govt:      'Govt. Land (ha)',
    area_hectares_forest:    'Forest Land (ha)',
    villages_estimated_count:'Est. Villages',
  },
  FOREST_CLEARANCE: {
    forest_division_name:   'Forest Division',
    forest_area_hectares:   'Forest Area (ha)',
    project_chainage_from:  'Chainage From',
    project_chainage_to:    'Chainage To',
  },
  UTILITY_SHIFTING: {
    total_count:            'Total Utilities (scope)',
    total_track_length_km:  'Total Track Length (km)',
  },
  DRAWING_APPROVAL: {
    total_count: 'No. of Drawing Approvals Required (scope)',
  },
  TENDER_PACKAGING: {
    total_count: 'No. of Tender Packages Required (scope)',
  },
  TEMPORARY_OFFICE_SPACE: {
    total_count: 'No. of Office Spaces Required (scope)',
  },
};

const DATE_KEYS = new Set([
  'work_start_date', 'expected_completion_date', 'actual_completion_date', 'work_order_date',
  'new_tdc', 'old_tdc', 'hiring_tdc',
]);

const CURRENCY_KEYS = new Set([
  'estimated_cost', 'sanctioned_cost',
]);

const BOOLEAN_KEYS = new Set([
  'epc_document_prepared', 'tender_finalized',
  // Temporary Office Space — top-level gate + conditional per-type booleans
  'details_required', 'new_agency_available', 'old_possession_given', 'hiring_rental_agreement',
]);

/** Map enum code → human label for display. */
function enumLabel(key: string, value: unknown): string {
  // Boolean check must come before the early-exit guard below, because
  // value may be false or undefined — both of which produce an empty string
  // from String(value ?? '') and would be swallowed by `if (!v) return v`.
  if (BOOLEAN_KEYS.has(key))      return (value === true || String(value) === 'true') ? 'Yes' : 'No';
  const v = String(value ?? '');
  if (!v) return v;
  if (key === 'utility_type')     return UTILITY_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v;
  if (key === 'executing_agency') return EXECUTING_AGENCY_OPTIONS.find((o) => o.value === v)?.label ?? v;
  if (key === 'voltage_level')    return VOLTAGE_LEVEL_OPTIONS.find((o) => o.value === v)?.label ?? v;
  if (key === 'fluid_type')       return FLUID_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v;
  if (key === 'current_status')   return UTILITY_STATUS_OPTIONS.find((o) => o.value === v)?.label ?? v;
  if (key === 'drawing_type')     return DRAWING_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v;
  if (key === 'structure_type')   return STRUCTURE_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v;
  if (CURRENCY_KEYS.has(key))     return `₹ ${Number(v).toLocaleString('en-IN')}`;
  if (DATE_KEYS.has(key)) {
    // ISO date string → "D MMM YYYY"
    const d = new Date(v);
    return isNaN(d.getTime()) ? v : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  return v;
}

/**
 * Returns default metadata values for an activity type.
 * Used by ActivityDetailPanel to seed boolean fields when entering edit mode
 * so they are always saved — even when the user doesn't explicitly toggle them.
 */
export function getMetadataDefaults(activityTypeCode: string): Record<string, unknown> {
  if (activityTypeCode === 'TENDER_PACKAGING') {
    return { epc_document_prepared: false, tender_finalized: false };
  }
  if (activityTypeCode === 'TEMPORARY_OFFICE_SPACE') {
    return { details_required: false };
  }
  return {};
}

// ── Controlled form component (edit mode) ─────────────────────────────────

export interface ActivityMetadataFormProps {
  activityTypeCode: string;
  /** Current field values — plain React state owned by the parent. */
  values: Record<string, unknown>;
  /** Called whenever any field changes; parent merges into its state. */
  onChange: (key: string, value: unknown) => void;
}

/**
 * Renders type-specific inputs as controlled components.
 *
 * No Ant Design Form field registration is used — `name` is deliberately
 * omitted from all Form.Item elements.  The parent drives values via `values`
 * and receives updates via `onChange(key, value)`.
 */
export function ActivityMetadataForm({
  activityTypeCode,
  values,
  onChange,
}: ActivityMetadataFormProps) {
  const str = (key: string) => (values[key] as string | undefined) ?? undefined;
  const num = (key: string) => (values[key] as number | undefined) ?? undefined;

  switch (activityTypeCode) {
    // ── Land Acquisition ─────────────────────────────────────────────────
    case 'LAND_ACQUISITION':
      return (
        <>
          <Form.Item label="District">
            <Input
              placeholder="e.g. Ambala"
              value={str('district')}
              onChange={(e) => onChange('district', e.target.value)}
            />
          </Form.Item>
          <Form.Item label="Sub-Division / Taluka">
            <Input
              placeholder="e.g. Ambala (Urban)"
              value={str('sub_division_taluka')}
              onChange={(e) => onChange('sub_division_taluka', e.target.value)}
            />
          </Form.Item>
          <Form.Item label="Total Area (ha)">
            <InputNumber
              min={0}
              step={0.0001}
              precision={4}
              style={{ width: '100%' }}
              placeholder="e.g. 12.5000"
              value={num('area_hectares_total')}
              onChange={(v) => onChange('area_hectares_total', v ?? undefined)}
            />
          </Form.Item>
          <Form.Item label="Private Land (ha)">
            <InputNumber
              min={0}
              step={0.0001}
              precision={4}
              style={{ width: '100%' }}
              placeholder="e.g. 8.2500"
              value={num('area_hectares_private')}
              onChange={(v) => onChange('area_hectares_private', v ?? undefined)}
            />
          </Form.Item>
          <Form.Item label="Govt. Land (ha)">
            <InputNumber
              min={0}
              step={0.0001}
              precision={4}
              style={{ width: '100%' }}
              placeholder="e.g. 3.5000"
              value={num('area_hectares_govt')}
              onChange={(v) => onChange('area_hectares_govt', v ?? undefined)}
            />
          </Form.Item>
          <Form.Item label="Forest Land (ha)">
            <InputNumber
              min={0}
              step={0.0001}
              precision={4}
              style={{ width: '100%' }}
              placeholder="e.g. 0.7500"
              value={num('area_hectares_forest')}
              onChange={(v) => onChange('area_hectares_forest', v ?? undefined)}
            />
          </Form.Item>
          <Form.Item label="Est. No. of Villages">
            <InputNumber
              min={1}
              precision={0}
              style={{ width: '100%' }}
              value={num('villages_estimated_count')}
              onChange={(v) => onChange('villages_estimated_count', v ?? undefined)}
            />
          </Form.Item>
        </>
      );

    // ── Forest Clearance ─────────────────────────────────────────────────
    case 'FOREST_CLEARANCE':
      return (
        <>
          <Form.Item label="Forest Division">
            <Input
              placeholder="e.g. North Ambala Forest Division"
              value={str('forest_division_name')}
              onChange={(e) => onChange('forest_division_name', e.target.value)}
            />
          </Form.Item>
          <Form.Item label="Forest Area (ha)">
            <InputNumber
              min={0}
              step={0.0001}
              precision={4}
              style={{ width: '100%' }}
              value={num('forest_area_hectares')}
              onChange={(v) => onChange('forest_area_hectares', v ?? undefined)}
            />
          </Form.Item>
          <Form.Item
            label="Chainage From"
            help="Use KM+M format, e.g. 132+450"
          >
            <Input
              placeholder="e.g. 132+450"
              value={str('project_chainage_from')}
              onChange={(e) => onChange('project_chainage_from', e.target.value)}
            />
          </Form.Item>
          <Form.Item
            label="Chainage To"
            help="Use KM+M format, e.g. 132+450"
          >
            <Input
              placeholder="e.g. 145+200"
              value={str('project_chainage_to')}
              onChange={(e) => onChange('project_chainage_to', e.target.value)}
            />
          </Form.Item>
        </>
      );

    // ── Utility Shifting ─────────────────────────────────────────────────
    // Activity metadata = scope count only.
    // All per-utility details (type, agency, chainage, cost, dimensions)
    // are captured on individual records.
    case 'UTILITY_SHIFTING':
      return (
        <>
          <Form.Item
            label="Total Utilities to Shift"
            help="Total number of utility items in scope"
          >
            <InputNumber
              min={1}
              precision={0}
              style={{ width: '100%' }}
              placeholder="e.g. 4"
              value={num('total_count')}
              onChange={(v) => onChange('total_count', v ?? undefined)}
            />
          </Form.Item>
          <Form.Item
            label="Total Track Length (km)"
            help="Total length of track affected by utility shifting"
          >
            <InputNumber
              min={0}
              precision={3}
              style={{ width: '100%' }}
              placeholder="e.g. 2.450"
              addonAfter="km"
              value={num('total_track_length_km')}
              onChange={(v) => onChange('total_track_length_km', v ?? undefined)}
            />
          </Form.Item>
        </>
      );

    // ── Drawing Approval ─────────────────────────────────────────────────
    // Scope = number of drawing approvals required. Each record = 1 drawing.
    case 'DRAWING_APPROVAL':
      return (
        <Form.Item
          label="No. of Drawing Approvals Required"
          help="Total drawings in scope — drives the KPI balance"
        >
          <InputNumber
            min={1}
            precision={0}
            style={{ width: '100%' }}
            placeholder="e.g. 12"
            value={num('total_count')}
            onChange={(v) => onChange('total_count', v ?? undefined)}
          />
        </Form.Item>
      );

    // ── Tender Packaging ─────────────────────────────────────────────────
    case 'TENDER_PACKAGING':
      return (
        <Form.Item
          label="No. of Tender Packages Required"
          help="Total packages in scope — drives the KPI balance"
        >
          <InputNumber
            min={1}
            precision={0}
            style={{ width: '100%' }}
            placeholder="e.g. 5"
            value={num('total_count')}
            onChange={(v) => onChange('total_count', v ?? undefined)}
          />
        </Form.Item>
      );

    // ── Temporary Office Space ───────────────────────────────────────────
    case 'TEMPORARY_OFFICE_SPACE':
      return (
        <Form.Item
          label="No. of Office Spaces Required"
          help="Total office spaces needed — drives the KPI balance"
        >
          <InputNumber
            min={1}
            precision={0}
            style={{ width: '100%' }}
            placeholder="e.g. 3"
            value={num('total_count')}
            onChange={(v) => onChange('total_count', v ?? undefined)}
          />
        </Form.Item>
      );

    default:
      return null;
  }
}

// ── View component (read-only mode) ──────────────────────────────────────

interface ActivityMetadataViewProps {
  activityTypeCode: string;
  metadataJson: Record<string, unknown>;
}

export function ActivityMetadataView({
  activityTypeCode,
  metadataJson,
}: ActivityMetadataViewProps) {
  const labels = LABEL_MAP[activityTypeCode] ?? {};
  const entries = Object.entries(labels)
    .map(([key, label]) => ({ key, label, value: metadataJson[key] }))
    // Boolean fields show when they are present in the response (value !== undefined).
    // Conditional booleans (e.g. new_agency_available) are omitted by the backend
    // when null, so value will be undefined — hiding them correctly.
    // Non-boolean fields are hidden when not filled in.
    .filter(({ key, value }) =>
      (BOOLEAN_KEYS.has(key) && value !== undefined) ||
      (value !== undefined && value !== null && value !== ''),
    );

  if (entries.length === 0) return null;

  return (
    <Descriptions size="small" column={1} bordered>
      {entries.map(({ key, label, value }) => (
        <Descriptions.Item key={key} label={label}>
          {enumLabel(key, value)}
        </Descriptions.Item>
      ))}
    </Descriptions>
  );
}
