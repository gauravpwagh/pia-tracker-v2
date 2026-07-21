/**
 * LandCoverageField — Land Acquisition "Land Coverage Progress" block, part
 * of the Acquisition Details section.
 *
 * Private/Govt/Forest Land are live-fetched (read-only) from this same
 * record's own Acquisition Details fields via formContext.acquisitionDetails
 * — not duplicated into land_coverage's own data, so they can never drift.
 * Total Land, Section E Done, and % Section E Done are computed live from
 * those plus the three user-entered fields below (which name the Land
 * Acquisition Act's actual Section 20E — a legal section, not an app tab);
 * none of the three computed values are persisted, only recomputed on render.
 *
 * Registered as  ui:field: "landCoverage"  on the `land_coverage` property in
 * Acquisition Details' ui_schema_json.
 */

import { InputNumber, Typography } from 'antd';
import type { FieldProps } from '@rjsf/utils';

const { Text } = Typography;

interface LandCoverageData {
  section_20e_done_private?: number | null;
  permission_taken_govt_land?: number | null;
  working_permission_obtained?: number | null;
}

function asNumber(v: unknown): number {
  return typeof v === 'number' ? v : 0;
}

function ReadOnlyStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Text style={{ fontSize: 12, display: 'block' }}>{label}</Text>
      <Text strong>{value}</Text>
    </div>
  );
}

export function LandCoverageField({ formData, onChange, disabled, readonly, formContext }: FieldProps) {
  const data = (formData as LandCoverageData | undefined) ?? {};
  const acquisitionDetails =
    ((formContext as Record<string, unknown> | undefined)?.acquisitionDetails as Record<string, unknown> | undefined) ?? {};

  const privateLand = asNumber(acquisitionDetails.area_hectares_private);
  const govtLand = asNumber(acquisitionDetails.area_hectares_govt);
  const forestLand = asNumber(acquisitionDetails.area_hectares_forest);

  const donePrivate = asNumber(data.section_20e_done_private);
  const doneGovt = asNumber(data.permission_taken_govt_land);
  const doneForest = asNumber(data.working_permission_obtained);

  const totalLand = privateLand + govtLand + forestLand;
  const sectionEDone = donePrivate + doneGovt + doneForest;
  const percentDone = totalLand > 0 ? (sectionEDone / totalLand) * 100 : 0;

  const isDisabled = disabled || readonly;
  const update = (patch: Partial<LandCoverageData>) => onChange({ ...data, ...patch });

  return (
    <div style={{ marginBottom: 8 }}>
      <Text
        type="secondary"
        style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}
      >
        Land Coverage Progress
      </Text>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginBottom: 12 }}>
        <ReadOnlyStat label="Private Land (ha)" value={privateLand.toFixed(4)} />
        <div>
          <Text style={{ fontSize: 12, display: 'block' }}>Section 20E Done (Private)</Text>
          <InputNumber
            style={{ width: '100%' }}
            min={0}
            disabled={isDisabled}
            value={data.section_20e_done_private ?? null}
            onChange={(v) => update({ section_20e_done_private: v })}
          />
        </div>

        <ReadOnlyStat label="Govt Land (ha)" value={govtLand.toFixed(4)} />
        <div>
          <Text style={{ fontSize: 12, display: 'block' }}>Permission Taken by Railway of Govt. Land</Text>
          <InputNumber
            style={{ width: '100%' }}
            min={0}
            disabled={isDisabled}
            value={data.permission_taken_govt_land ?? null}
            onChange={(v) => update({ permission_taken_govt_land: v })}
          />
        </div>

        <ReadOnlyStat label="Forest Land (ha)" value={forestLand.toFixed(4)} />
        <div>
          <Text style={{ fontSize: 12, display: 'block' }}>Working Permission Obtained</Text>
          <InputNumber
            style={{ width: '100%' }}
            min={0}
            disabled={isDisabled}
            value={data.working_permission_obtained ?? null}
            onChange={(v) => update({ working_permission_obtained: v })}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, borderTop: '1px solid var(--ant-color-border)', paddingTop: 8 }}>
        <ReadOnlyStat label="Total Land (ha)" value={totalLand.toFixed(4)} />
        <ReadOnlyStat label="Section E Done (ha)" value={sectionEDone.toFixed(4)} />
        <ReadOnlyStat label="% Section E Done" value={`${percentDone.toFixed(1)}%`} />
      </div>
    </div>
  );
}
