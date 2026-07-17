/**
 * PiaObjectFieldTemplate — replaces RJSF's default bordered-box object
 * renderer with a lightweight Ant Design Divider for the title, followed
 * by the fields.  Applied to all nested objects in the form (e.g.
 * GazetteReference sub-objects).
 *
 * Also renders `ui:description` from the ui_schema as a styled info label.
 * Used by drawing forms to show the approving authority chain.
 */

import { Divider, Typography } from 'antd';
import type { ObjectFieldTemplateProps } from '@rjsf/utils';

const { Text } = Typography;

// Explicit field groups that should render together on their own row instead
// of falling wherever the auto-fit grid happens to wrap them. A group only
// applies when every one of its fields is present on the object (so this is
// a no-op for objects that don't have that exact combination).
const FIELD_ROW_GROUPS: string[][] = [
  // TOS, US root; LA/FC's acquisition_details
  ['record_name', 'block_section_from', 'block_section_to'],
  // Utility Shifting root — remaining rows (record_name/from/to above is shared with TOS)
  ['utility_type', 'owner_agency'],
  ['chainage_from', 'chainage_to', 'length_affected_km'],
  ['executing_agency', 'target_removal_date', 'consent_state_govt'],
  ['status_drawing_execution', 'remarks'],
  // Temporary Office Space
  ['office_spaces_required', 'location', 'structure_type'],
  // LA/FC's acquisition_details — Chainage row above District/Taluka, which
  // in turn sits above the Area row (must stay in this relative order —
  // activeGroups render in this array's order, not ui:order). This 2-field
  // chainage group is intentionally distinct from the 3-field Utility
  // Shifting one above: the sequential dedup below means whichever group
  // matches first (Utility Shifting's, since it's earlier in this array)
  // claims chainage_from/_to, so this one is a no-op for that schema.
  ['chainage_from', 'chainage_to'],
  ['district', 'sub_division_taluka'],
  // (Total is auto-filled as the sum of the other three, but stays editable — see
  // RecordEditPage.tsx's handleFormChange).
  ['area_hectares_private', 'area_hectares_govt', 'area_hectares_forest', 'area_hectares_total'],
  // Land Acquisition — Section 20A
  ['notification_date', 'gazette_published_on'],
  ['gazette_number', 'gazette_pdf'],
  // Land Acquisition — Section 20E (must come before the shared newspaper group
  // below — activeGroups render in this array's order, not ui:order, so a group
  // shared by two forms has to sit after each form's own earlier-numbered rows)
  ['declaration_gazette_published_on', 'declaration_gazette_number'],
  ['declaration_gazette_pdf'],
  // Shared by Section 20A and Section 20E (same field names in both)
  ['local_newspaper_name', 'local_newspaper_pub_date'],
  // Land Acquisition — JMR
  ['jmr_fee_demanded_on', 'jmr_fee_amount'],
  ['jmr_fee_submitted_on', 'jmr_done_on'],
  ['revision_required', 'revision_reason'],
  ['re_jmr'],
  ['re_jmr_fee_demanded_on', 're_jmr_fee_amount'],
  ['re_jmr_fee_submitted_on', 're_jmr_done_on'],
];

export function PiaObjectFieldTemplate({
  title,
  description,
  properties,
  uiSchema,
  schema,
}: ObjectFieldTemplateProps) {
  const uiDescription = uiSchema?.['ui:description'] as string | undefined;

  // Single-column when the section contains a nested *object* child (a scalar
  // sitting next to a multi-field sub-block — e.g. SRP's date beside its
  // Gazette object — looks lopsided). Arrays (e.g. Forest's "Queries from
  // Approving Authority") do NOT force single-column: they span the full width
  // on their own row (see PiaFieldTemplate) while the section's scalar fields
  // stay two-per-row.
  const props = (schema?.properties ?? {}) as Record<string, { type?: string; $ref?: string }>;
  const hasNestedObject = Object.values(props).some(
    (p) => p?.type === 'object' || typeof p?.$ref === 'string',
  );
  const gridColumns = hasNestedObject ? '1fr' : 'repeat(auto-fit, minmax(260px, 1fr))';

  // Sequential dedup: a group only activates if every field is present AND
  // none of its fields were already claimed by an earlier (higher-priority)
  // active group. Needed because some field-name combinations (e.g. plain
  // chainage_from/_to) are a subset of another schema's larger group.
  const usedFieldNames = new Set<string>();
  const activeGroups = FIELD_ROW_GROUPS.filter((group) => {
    if (!group.every((name) => name in props)) return false;
    if (group.some((name) => usedFieldNames.has(name))) return false;
    group.forEach((name) => usedFieldNames.add(name));
    return true;
  });
  const groupedNames = usedFieldNames;
  const restProps = properties.filter((p) => !groupedNames.has(p.name));

  return (
    <div>
      {title && (
        <Divider
          orientation="left"
          orientationMargin={0}
          style={{ fontSize: 13, color: 'var(--ant-color-text-secondary)', margin: '6px 0 4px' }}
        >
          {title}
        </Divider>
      )}
      {uiDescription && (
        <div style={{
          background: 'var(--ant-color-info-bg)',
          border: '1px solid var(--ant-color-info-border)',
          borderRadius: 6,
          padding: '6px 12px',
          marginBottom: 12,
          fontSize: 12,
        }}>
          <Text style={{ color: 'var(--ant-color-info-text)', fontSize: 12 }}>
            {uiDescription}
          </Text>
        </div>
      )}
      {description && (
        <p style={{ marginBottom: 8, color: 'var(--ant-color-text-secondary)', fontSize: 12 }}>
          {description}
        </p>
      )}
      {activeGroups.map((group) => {
        const groupProps = group
          .map((name) => properties.find((p) => p.name === name))
          .filter((p): p is (typeof properties)[number] => p !== undefined);
        return (
          <div
            key={group.join('+')}
            style={{ display: 'grid', gridTemplateColumns: `repeat(${groupProps.length}, minmax(160px, 1fr))`, columnGap: 20 }}
          >
            {groupProps.map((prop) => (
              <div key={prop.name}>{prop.content}</div>
            ))}
          </div>
        );
      })}
      {/* Two (or more, space permitting) fields per row instead of RJSF's default
          one-per-row — cuts vertical scrolling substantially on long forms.
          auto-fit/minmax lets a field that needs more room (e.g. a textarea)
          still wrap to its own row via the browser's natural grid flow. */}
      <div style={{ display: 'grid', gridTemplateColumns: gridColumns, columnGap: 20, rowGap: 0 }}>
        {restProps.map((prop) => (
          <div key={prop.name}>{prop.content}</div>
        ))}
      </div>
    </div>
  );
}
