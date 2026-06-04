/**
 * ActivityMetadataForm — type-specific fields rendered as controlled React
 * components.  No Ant Design Form field registration (no `name` props) —
 * the parent supplies `values` and an `onChange(key, value)` callback so
 * that metadata is captured in plain React state with zero form-store magic.
 *
 * ActivityMetadataView — read-only Descriptions block for the same data.
 */

import { DatePicker, Descriptions, Divider, Form, Input, InputNumber, Select, Switch } from 'antd';
import dayjs from 'dayjs';

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
    // Identity
    utility_type:               'Utility Type',
    owner_agency:               'Owner Agency',
    executing_agency:           'Executing Agency',
    // Location & Cost
    chainage_from:              'Chainage From',
    chainage_to:                'Chainage To',
    estimated_cost:             'Estimated Cost (₹)',
    sanctioned_cost:            'Sanctioned Cost (₹)',
    // LT / HT / EHV
    voltage_level:              'Voltage Level',
    length_km:                  'Line Length (km)',
    no_of_poles:                'No. of Poles',
    // Pipeline
    diameter_mm:                'Diameter (mm)',
    pipeline_length_m:          'Pipeline Length (m)',
    fluid_type:                 'Fluid Type',
    // S&T
    cable_type:                 'Cable Type',
    cable_length_km:            'Cable Length (km)',
    no_of_circuits:             'No. of Circuits',
    // Quarter / Station Building
    no_of_units:                'No. of Units',
    area_sqm:                   'Area (sqm)',
    // TSS / SS / OHE
    capacity_mva:               'Capacity (MVA)',
    no_of_bays:                 'No. of Bays',
    // Other
    utility_description:        'Utility Description',
    // Progress
    current_status:             'Current Status',
    work_start_date:            'Work Start Date',
    expected_completion_date:   'Expected Completion',
    actual_completion_date:     'Actual Completion',
    remarks:                    'Remarks',
    // Contractor (non-Railway)
    contractor_name:            'Contractor Name',
    work_order_no:              'Work Order No.',
    work_order_date:            'Work Order Date',
  },
  DRAWING_APPROVAL: {
    drawing_type:    'Drawing Type',
    drawing_number:  'Drawing Number',
    drawing_title:   'Drawing Title',
    name_of_section: 'Name of Section / Station',
    chainage_from:   'Chainage From',
    chainage_to:     'Chainage To',
    revision_number: 'Revision Number',
    remarks:         'Remarks',
  },
  TENDER_PACKAGING: {
    package_name:         'Package Name',
    epc_document_prepared:'EPC Document Prepared',
    tender_finalized:     'EPC Tender Finalized',
  },
  TEMPORARY_OFFICE_SPACE: {
    structure_type:    'Structure Type',
    count:             'No. of Offices',
    location_name:     'Location Name',
    location_chainage: 'Location Chainage',
  },
};

const DATE_KEYS = new Set([
  'work_start_date', 'expected_completion_date', 'actual_completion_date', 'work_order_date',
]);

const CURRENCY_KEYS = new Set([
  'estimated_cost', 'sanctioned_cost',
]);

const BOOLEAN_KEYS = new Set([
  'epc_document_prepared', 'tender_finalized',
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
    case 'UTILITY_SHIFTING': {
      const utilityType     = str('utility_type');
      const executingAgency = str('executing_agency');
      const isLtHtEhv       = utilityType === 'LT_HT_EHV';
      const isPipeline      = utilityType === 'PIPELINE';
      const isSnt           = utilityType === 'SNT';
      const isQuarter       = utilityType === 'QUARTER_STATION';
      const isTss           = utilityType === 'TSS_SS_OHE';
      const isOther         = utilityType === 'OTHER';
      const needsContractor = executingAgency && executingAgency !== 'RAILWAY';
      const dateVal = (key: string) => str(key) ? dayjs(str(key)) : null;

      return (
        <>
          {/* ── Identity ─────────────────────────────────────── */}
          <Form.Item label="Utility Type" required>
            <Select
              placeholder="Select utility type…"
              options={UTILITY_TYPE_OPTIONS}
              value={str('utility_type')}
              onChange={(v) => {
                // Clear type-specific fields when type changes
                onChange('utility_type', v);
                onChange('voltage_level', undefined);
                onChange('length_km', undefined);
                onChange('no_of_poles', undefined);
                onChange('diameter_mm', undefined);
                onChange('pipeline_length_m', undefined);
                onChange('fluid_type', undefined);
                onChange('cable_type', undefined);
                onChange('cable_length_km', undefined);
                onChange('no_of_circuits', undefined);
                onChange('no_of_units', undefined);
                onChange('area_sqm', undefined);
                onChange('capacity_mva', undefined);
                onChange('no_of_bays', undefined);
                onChange('utility_description', undefined);
              }}
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
              onChange={(v) => {
                onChange('executing_agency', v ?? undefined);
                if (v === 'RAILWAY') {
                  onChange('contractor_name', undefined);
                  onChange('work_order_no', undefined);
                  onChange('work_order_date', undefined);
                }
              }}
            />
          </Form.Item>

          {/* ── Location ─────────────────────────────────────── */}
          <Divider orientation="left" orientationMargin={0} style={{ fontSize: 12, margin: '4px 0 10px' }}>
            Location &amp; Cost
          </Divider>
          <Form.Item label="Chainage From" help="KM+M format, e.g. 132+450">
            <Input
              placeholder="e.g. 132+450"
              value={str('chainage_from')}
              onChange={(e) => onChange('chainage_from', e.target.value)}
            />
          </Form.Item>
          <Form.Item label="Chainage To" help="KM+M format, e.g. 132+450">
            <Input
              placeholder="e.g. 145+200"
              value={str('chainage_to')}
              onChange={(e) => onChange('chainage_to', e.target.value)}
            />
          </Form.Item>
          <Form.Item label="Estimated Cost (₹)">
            <InputNumber
              min={0} step={100000} precision={2}
              style={{ width: '100%' }}
              formatter={(v) => v != null ? `₹ ${String(v)}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
              parser={(v) => (v ? parseFloat(v.replace(/₹\s?|,/g, '')) : 0) as unknown as 0}
              value={num('estimated_cost')}
              onChange={(v) => onChange('estimated_cost', v ?? undefined)}
            />
          </Form.Item>
          <Form.Item label="Sanctioned Cost (₹)">
            <InputNumber
              min={0} step={100000} precision={2}
              style={{ width: '100%' }}
              formatter={(v) => v != null ? `₹ ${String(v)}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
              parser={(v) => (v ? parseFloat(v.replace(/₹\s?|,/g, '')) : 0) as unknown as 0}
              value={num('sanctioned_cost')}
              onChange={(v) => onChange('sanctioned_cost', v ?? undefined)}
            />
          </Form.Item>

          {/* ── Type-specific fields ──────────────────────────── */}
          {utilityType && (
            <>
              <Divider orientation="left" orientationMargin={0} style={{ fontSize: 12, margin: '4px 0 10px' }}>
                {UTILITY_TYPE_OPTIONS.find((o) => o.value === utilityType)?.label ?? 'Details'}
              </Divider>

              {isLtHtEhv && (
                <>
                  <Form.Item label="Voltage Level" required>
                    <Select
                      placeholder="Select voltage…"
                      options={VOLTAGE_LEVEL_OPTIONS}
                      value={str('voltage_level')}
                      onChange={(v) => onChange('voltage_level', v)}
                    />
                  </Form.Item>
                  <Form.Item label="Line Length (km)">
                    <InputNumber min={0} step={0.1} precision={3} style={{ width: '100%' }}
                      value={num('length_km')} onChange={(v) => onChange('length_km', v ?? undefined)} />
                  </Form.Item>
                  <Form.Item label="No. of Poles">
                    <InputNumber min={0} precision={0} style={{ width: '100%' }}
                      value={num('no_of_poles')} onChange={(v) => onChange('no_of_poles', v ?? undefined)} />
                  </Form.Item>
                </>
              )}

              {isPipeline && (
                <>
                  <Form.Item label="Diameter (mm)">
                    <InputNumber min={0} precision={0} style={{ width: '100%' }}
                      value={num('diameter_mm')} onChange={(v) => onChange('diameter_mm', v ?? undefined)} />
                  </Form.Item>
                  <Form.Item label="Pipeline Length (m)">
                    <InputNumber min={0} step={1} precision={1} style={{ width: '100%' }}
                      value={num('pipeline_length_m')} onChange={(v) => onChange('pipeline_length_m', v ?? undefined)} />
                  </Form.Item>
                  <Form.Item label="Fluid Type">
                    <Select placeholder="Select…" options={FLUID_TYPE_OPTIONS}
                      allowClear value={str('fluid_type')}
                      onChange={(v) => onChange('fluid_type', v ?? undefined)} />
                  </Form.Item>
                </>
              )}

              {isSnt && (
                <>
                  <Form.Item label="Cable Type">
                    <Input placeholder="e.g. OFC, Copper, Quad"
                      value={str('cable_type')} onChange={(e) => onChange('cable_type', e.target.value)} />
                  </Form.Item>
                  <Form.Item label="Cable Length (km)">
                    <InputNumber min={0} step={0.1} precision={3} style={{ width: '100%' }}
                      value={num('cable_length_km')} onChange={(v) => onChange('cable_length_km', v ?? undefined)} />
                  </Form.Item>
                  <Form.Item label="No. of Circuits">
                    <InputNumber min={0} precision={0} style={{ width: '100%' }}
                      value={num('no_of_circuits')} onChange={(v) => onChange('no_of_circuits', v ?? undefined)} />
                  </Form.Item>
                </>
              )}

              {isQuarter && (
                <>
                  <Form.Item label="No. of Units">
                    <InputNumber min={1} precision={0} style={{ width: '100%' }}
                      value={num('no_of_units')} onChange={(v) => onChange('no_of_units', v ?? undefined)} />
                  </Form.Item>
                  <Form.Item label="Area (sqm)">
                    <InputNumber min={0} step={1} precision={2} style={{ width: '100%' }}
                      value={num('area_sqm')} onChange={(v) => onChange('area_sqm', v ?? undefined)} />
                  </Form.Item>
                </>
              )}

              {isTss && (
                <>
                  <Form.Item label="Capacity (MVA)">
                    <InputNumber min={0} step={0.5} precision={2} style={{ width: '100%' }}
                      value={num('capacity_mva')} onChange={(v) => onChange('capacity_mva', v ?? undefined)} />
                  </Form.Item>
                  <Form.Item label="No. of Bays">
                    <InputNumber min={0} precision={0} style={{ width: '100%' }}
                      value={num('no_of_bays')} onChange={(v) => onChange('no_of_bays', v ?? undefined)} />
                  </Form.Item>
                </>
              )}

              {isOther && (
                <Form.Item label="Utility Description">
                  <Input.TextArea rows={3} placeholder="Describe the utility…"
                    value={str('utility_description')}
                    onChange={(e) => onChange('utility_description', e.target.value)} />
                </Form.Item>
              )}
            </>
          )}

          {/* ── Progress ──────────────────────────────────────── */}
          <Divider orientation="left" orientationMargin={0} style={{ fontSize: 12, margin: '4px 0 10px' }}>
            Progress
          </Divider>
          <Form.Item label="Current Status">
            <Select placeholder="Select…" options={UTILITY_STATUS_OPTIONS} allowClear
              value={str('current_status')}
              onChange={(v) => onChange('current_status', v ?? undefined)} />
          </Form.Item>
          <Form.Item label="Work Start Date">
            <DatePicker style={{ width: '100%' }} format="D MMM YYYY"
              value={dateVal('work_start_date')}
              onChange={(d) => onChange('work_start_date', d ? d.format('YYYY-MM-DD') : undefined)} />
          </Form.Item>
          <Form.Item label="Expected Completion">
            <DatePicker style={{ width: '100%' }} format="D MMM YYYY"
              value={dateVal('expected_completion_date')}
              onChange={(d) => onChange('expected_completion_date', d ? d.format('YYYY-MM-DD') : undefined)} />
          </Form.Item>
          <Form.Item label="Actual Completion">
            <DatePicker style={{ width: '100%' }} format="D MMM YYYY"
              value={dateVal('actual_completion_date')}
              onChange={(d) => onChange('actual_completion_date', d ? d.format('YYYY-MM-DD') : undefined)} />
          </Form.Item>
          <Form.Item label="Remarks">
            <Input.TextArea rows={2} value={str('remarks')}
              onChange={(e) => onChange('remarks', e.target.value)} />
          </Form.Item>

          {/* ── Contractor (non-Railway executing agency) ─────── */}
          {needsContractor && (
            <>
              <Divider orientation="left" orientationMargin={0} style={{ fontSize: 12, margin: '4px 0 10px' }}>
                Contractor Details
              </Divider>
              <Form.Item label="Contractor Name">
                <Input placeholder="e.g. M/s ABC Contractors"
                  value={str('contractor_name')}
                  onChange={(e) => onChange('contractor_name', e.target.value)} />
              </Form.Item>
              <Form.Item label="Work Order No.">
                <Input placeholder="e.g. WO/2024/001"
                  value={str('work_order_no')}
                  onChange={(e) => onChange('work_order_no', e.target.value)} />
              </Form.Item>
              <Form.Item label="Work Order Date">
                <DatePicker style={{ width: '100%' }} format="D MMM YYYY"
                  value={dateVal('work_order_date')}
                  onChange={(d) => onChange('work_order_date', d ? d.format('YYYY-MM-DD') : undefined)} />
              </Form.Item>
            </>
          )}
        </>
      );
    }

    // ── Drawing Approval ─────────────────────────────────────────────────
    // All drawing details are captured here on the activity; no separate
    // record creation is needed (the record is auto-created on the backend).
    case 'DRAWING_APPROVAL':
      return (
        <>
          <Form.Item label="Drawing Type" required tooltip="Determines the approval chain and form. Cannot be changed after creation.">
            <Select
              placeholder="Select drawing type…"
              options={DRAWING_TYPE_OPTIONS}
              showSearch
              optionFilterProp="label"
              value={str('drawing_type')}
              onChange={(v) => onChange('drawing_type', v)}
            />
          </Form.Item>
          <Form.Item label="Drawing Number" required>
            <Input
              placeholder="e.g. CONST/NR/ABL-LDH/ESP/001"
              value={str('drawing_number')}
              onChange={(e) => onChange('drawing_number', e.target.value)}
            />
          </Form.Item>
          <Form.Item label="Drawing Title">
            <Input
              placeholder="e.g. Earth Slope Protection — Km 132 to 145"
              value={str('drawing_title')}
              onChange={(e) => onChange('drawing_title', e.target.value)}
            />
          </Form.Item>
          <Form.Item label="Name of Section / Station">
            <Input
              placeholder="e.g. Ambala–Ludhiana Section or Ambala Cantt"
              value={str('name_of_section')}
              onChange={(e) => onChange('name_of_section', e.target.value)}
            />
          </Form.Item>
          <Form.Item label="Chainage From" help="KM+M format, e.g. 132+450">
            <Input
              placeholder="e.g. 132+450"
              value={str('chainage_from')}
              onChange={(e) => onChange('chainage_from', e.target.value)}
            />
          </Form.Item>
          <Form.Item label="Chainage To" help="KM+M format, e.g. 145+200">
            <Input
              placeholder="e.g. 145+200"
              value={str('chainage_to')}
              onChange={(e) => onChange('chainage_to', e.target.value)}
            />
          </Form.Item>
          <Form.Item label="Revision Number">
            <InputNumber
              min={0}
              precision={0}
              style={{ width: '100%' }}
              placeholder="0"
              value={num('revision_number')}
              onChange={(v) => onChange('revision_number', v ?? undefined)}
            />
          </Form.Item>
          <Form.Item label="Remarks">
            <Input.TextArea
              rows={3}
              placeholder="Additional notes, DPR reference, design standard…"
              value={str('remarks')}
              onChange={(e) => onChange('remarks', e.target.value)}
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
          <Form.Item
            label="EPC Document Prepared"
            tooltip="Has the EPC document been prepared?"
          >
            <Switch
              checkedChildren="Yes"
              unCheckedChildren="No"
              checked={values['epc_document_prepared'] === true}
              onChange={(checked) => onChange('epc_document_prepared', checked)}
            />
          </Form.Item>
          <Form.Item
            label="EPC Tender Finalized"
            tooltip="Has the EPC tender been finalized?"
          >
            <Switch
              checkedChildren="Yes"
              unCheckedChildren="No"
              checked={values['tender_finalized'] === true}
              onChange={(checked) => onChange('tender_finalized', checked)}
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
    // Boolean fields always show (even when undefined/false — display as "No").
    // Other fields are hidden when not yet filled in.
    .filter(({ key, value }) =>
      BOOLEAN_KEYS.has(key) || (value !== undefined && value !== null && value !== ''),
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
