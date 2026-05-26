/**
 * ActivityMetadataForm — type-specific form fields rendered inside an
 * Ant Design <Form> context.  Each activity type gets its own section.
 *
 * Fields are registered as ['metadata', fieldKey] so the parent form
 * collects them under form.getFieldsValue().metadata.
 *
 * ActivityMetadataView — read-only Descriptions block for the same data,
 * used in the ActivityDetailPanel view mode.
 */

import { Form, Input, InputNumber, Select, Descriptions } from 'antd';

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
function enumLabel(
  key: string,
  value: unknown,
): string {
  const v = String(value ?? '');
  if (key === 'utility_type')     return UTILITY_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v;
  if (key === 'executing_agency') return EXECUTING_AGENCY_OPTIONS.find((o) => o.value === v)?.label ?? v;
  if (key === 'drawing_type')     return DRAWING_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v;
  if (key === 'structure_type')   return STRUCTURE_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v;
  if (key === 'tender_type')      return TENDER_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v;
  if (key === 'estimated_value')  return `₹ ${Number(v).toLocaleString('en-IN')}`;
  return v;
}

// ── Shared sub-components ──────────────────────────────────────────────────

function ChainageField({ name, label }: { name: string[]; label: string }) {
  return (
    <Form.Item
      name={name}
      label={label}
      rules={[{ pattern: /^\d+\+\d{3}$/, message: 'Use KM+M format, e.g. 132+450' }]}
    >
      <Input placeholder="e.g. 132+450" />
    </Form.Item>
  );
}

// ── Form component (edit mode) ─────────────────────────────────────────────

interface ActivityMetadataFormProps {
  activityTypeCode: string;
}

export function ActivityMetadataForm({ activityTypeCode }: ActivityMetadataFormProps) {
  switch (activityTypeCode) {
    // ── Land Acquisition ─────────────────────────────────────────────────
    case 'LAND_ACQUISITION':
      return (
        <>
          <Form.Item name={['metadata', 'district']} label="District">
            <Input placeholder="e.g. Ambala" />
          </Form.Item>
          <Form.Item name={['metadata', 'sub_division_taluka']} label="Sub-Division / Taluka">
            <Input placeholder="e.g. Ambala (Urban)" />
          </Form.Item>
          <Form.Item name={['metadata', 'area_hectares_total']} label="Total Area (ha)">
            <InputNumber
              min={0}
              step={0.0001}
              precision={4}
              style={{ width: '100%' }}
              placeholder="e.g. 12.5000"
            />
          </Form.Item>
          <Form.Item name={['metadata', 'villages_estimated_count']} label="Est. No. of Villages">
            <InputNumber min={1} precision={0} style={{ width: '100%' }} />
          </Form.Item>
        </>
      );

    // ── Forest Clearance ─────────────────────────────────────────────────
    case 'FOREST_CLEARANCE':
      return (
        <>
          <Form.Item name={['metadata', 'forest_division_name']} label="Forest Division">
            <Input placeholder="e.g. North Ambala Forest Division" />
          </Form.Item>
          <Form.Item name={['metadata', 'forest_area_hectares']} label="Forest Area (ha)">
            <InputNumber
              min={0}
              step={0.0001}
              precision={4}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <ChainageField name={['metadata', 'project_chainage_from']} label="Chainage From" />
          <ChainageField name={['metadata', 'project_chainage_to']} label="Chainage To" />
        </>
      );

    // ── Utility Shifting ─────────────────────────────────────────────────
    case 'UTILITY_SHIFTING':
      return (
        <>
          <Form.Item
            name={['metadata', 'utility_type']}
            label="Utility Type"
            rules={[{ required: true, message: 'Select utility type' }]}
          >
            <Select placeholder="Select utility type…" options={UTILITY_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item name={['metadata', 'owner_agency']} label="Owner Agency">
            <Input placeholder="e.g. DHBVN, PWD (Water), BSNL" />
          </Form.Item>
          <Form.Item name={['metadata', 'executing_agency']} label="Executing Agency">
            <Select
              placeholder="Select…"
              options={EXECUTING_AGENCY_OPTIONS}
              allowClear
            />
          </Form.Item>
        </>
      );

    // ── Drawing Approval ─────────────────────────────────────────────────
    case 'DRAWING_APPROVAL':
      return (
        <>
          <Form.Item
            name={['metadata', 'drawing_type']}
            label="Drawing Type"
            rules={[{ required: true, message: 'Select drawing type' }]}
          >
            <Select
              placeholder="Select drawing type…"
              options={DRAWING_TYPE_OPTIONS}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item name={['metadata', 'drawing_number']} label="Drawing Number">
            <Input placeholder="e.g. CONST/NR/ABL-LDH/ESP/001" />
          </Form.Item>
        </>
      );

    // ── Tender Packaging ─────────────────────────────────────────────────
    case 'TENDER_PACKAGING':
      return (
        <>
          <Form.Item name={['metadata', 'package_name']} label="Package Name">
            <Input placeholder="e.g. Civil Works Package 1 — Ambala–Ludhiana" />
          </Form.Item>
          <Form.Item name={['metadata', 'estimated_value']} label="Estimated Value (₹)">
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
            />
          </Form.Item>
          <Form.Item name={['metadata', 'tender_type']} label="Tender Type">
            <Select
              placeholder="Select…"
              options={TENDER_TYPE_OPTIONS}
              allowClear
            />
          </Form.Item>
        </>
      );

    // ── Temporary Office Space ───────────────────────────────────────────
    case 'TEMPORARY_OFFICE_SPACE':
      return (
        <>
          <Form.Item
            name={['metadata', 'structure_type']}
            label="Structure Type"
            rules={[{ required: true, message: 'Select structure type' }]}
          >
            <Select placeholder="Select…" options={STRUCTURE_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item name={['metadata', 'count']} label="No. of Office Spaces">
            <InputNumber min={1} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name={['metadata', 'location_name']} label="Location Name">
            <Input placeholder="e.g. Near Ambala Cantt station" />
          </Form.Item>
          <ChainageField name={['metadata', 'location_chainage']} label="Location Chainage" />
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
