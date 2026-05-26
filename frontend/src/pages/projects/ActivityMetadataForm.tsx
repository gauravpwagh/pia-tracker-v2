/**
 * ActivityMetadataForm — type-specific fields rendered as controlled React
 * components.  No Ant Design Form field registration (no `name` props) —
 * the parent supplies `values` and an `onChange(key, value)` callback so
 * that metadata is captured in plain React state with zero form-store magic.
 *
 * ActivityMetadataView — read-only Descriptions block for the same data.
 */

import { Descriptions, Form, Input, InputNumber, Select } from 'antd';

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

const TENDER_TYPE_OPTIONS = [
  { value: 'OPEN',    label: 'Open Tender' },
  { value: 'LIMITED', label: 'Limited Tender' },
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
    utility_type:      'Utility Type',
    owner_agency:      'Owner Agency',
    executing_agency:  'Executing Agency',
  },
  DRAWING_APPROVAL: {
    drawing_type:   'Drawing Type',
    drawing_number: 'Drawing Number',
  },
  TENDER_PACKAGING: {
    package_name:    'Package Name',
    estimated_value: 'Estimated Value',
    tender_type:     'Tender Type',
  },
  TEMPORARY_OFFICE_SPACE: {
    structure_type:    'Structure Type',
    count:             'No. of Offices',
    location_name:     'Location Name',
    location_chainage: 'Location Chainage',
  },
};

/** Map enum code → human label for display. */
function enumLabel(key: string, value: unknown): string {
  const v = String(value ?? '');
  if (key === 'utility_type')     return UTILITY_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v;
  if (key === 'executing_agency') return EXECUTING_AGENCY_OPTIONS.find((o) => o.value === v)?.label ?? v;
  if (key === 'drawing_type')     return DRAWING_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v;
  if (key === 'structure_type')   return STRUCTURE_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v;
  if (key === 'tender_type')      return TENDER_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v;
  if (key === 'estimated_value')  return `₹ ${Number(v).toLocaleString('en-IN')}`;
  return v;
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
    case 'UTILITY_SHIFTING':
      return (
        <>
          <Form.Item label="Utility Type" required>
            <Select
              placeholder="Select utility type…"
              options={UTILITY_TYPE_OPTIONS}
              value={str('utility_type')}
              onChange={(v) => onChange('utility_type', v)}
            />
          </Form.Item>
          <Form.Item label="Owner Agency">
            <Input
              placeholder="e.g. DHBVN, PWD (Water), BSNL"
              value={str('owner_agency')}
              onChange={(e) => onChange('owner_agency', e.target.value)}
            />
          </Form.Item>
          <Form.Item label="Executing Agency">
            <Select
              placeholder="Select…"
              options={EXECUTING_AGENCY_OPTIONS}
              allowClear
              value={str('executing_agency')}
              onChange={(v) => onChange('executing_agency', v ?? undefined)}
            />
          </Form.Item>
        </>
      );

    // ── Drawing Approval ─────────────────────────────────────────────────
    case 'DRAWING_APPROVAL':
      return (
        <>
          <Form.Item label="Drawing Type" required>
            <Select
              placeholder="Select drawing type…"
              options={DRAWING_TYPE_OPTIONS}
              showSearch
              optionFilterProp="label"
              value={str('drawing_type')}
              onChange={(v) => onChange('drawing_type', v)}
            />
          </Form.Item>
          <Form.Item label="Drawing Number">
            <Input
              placeholder="e.g. CONST/NR/ABL-LDH/ESP/001"
              value={str('drawing_number')}
              onChange={(e) => onChange('drawing_number', e.target.value)}
            />
          </Form.Item>
        </>
      );

    // ── Tender Packaging ─────────────────────────────────────────────────
    case 'TENDER_PACKAGING':
      return (
        <>
          <Form.Item label="Package Name">
            <Input
              placeholder="e.g. Civil Works Package 1 — Ambala–Ludhiana"
              value={str('package_name')}
              onChange={(e) => onChange('package_name', e.target.value)}
            />
          </Form.Item>
          <Form.Item label="Estimated Value (₹)">
            <InputNumber
              min={0}
              step={100000}
              precision={2}
              style={{ width: '100%' }}
              formatter={(v) =>
                v != null
                  ? `₹ ${String(v)}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                  : ''
              }
              parser={(v) =>
                (v ? parseFloat(v.replace(/₹\s?|,/g, '')) : 0) as unknown as 0
              }
              value={num('estimated_value')}
              onChange={(v) => onChange('estimated_value', v ?? undefined)}
            />
          </Form.Item>
          <Form.Item label="Tender Type">
            <Select
              placeholder="Select…"
              options={TENDER_TYPE_OPTIONS}
              allowClear
              value={str('tender_type')}
              onChange={(v) => onChange('tender_type', v ?? undefined)}
            />
          </Form.Item>
        </>
      );

    // ── Temporary Office Space ───────────────────────────────────────────
    case 'TEMPORARY_OFFICE_SPACE':
      return (
        <>
          <Form.Item label="Structure Type" required>
            <Select
              placeholder="Select…"
              options={STRUCTURE_TYPE_OPTIONS}
              value={str('structure_type')}
              onChange={(v) => onChange('structure_type', v)}
            />
          </Form.Item>
          <Form.Item label="No. of Office Spaces">
            <InputNumber
              min={1}
              precision={0}
              style={{ width: '100%' }}
              value={num('count')}
              onChange={(v) => onChange('count', v ?? undefined)}
            />
          </Form.Item>
          <Form.Item label="Location Name">
            <Input
              placeholder="e.g. Near Ambala Cantt station"
              value={str('location_name')}
              onChange={(e) => onChange('location_name', e.target.value)}
            />
          </Form.Item>
          <Form.Item
            label="Location Chainage"
            help="Use KM+M format, e.g. 132+450"
          >
            <Input
              placeholder="e.g. 132+450"
              value={str('location_chainage')}
              onChange={(e) => onChange('location_chainage', e.target.value)}
            />
          </Form.Item>
        </>
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
    .filter(({ value }) => value !== undefined && value !== null && value !== '');

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
