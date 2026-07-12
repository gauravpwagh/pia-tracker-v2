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
  // Temporary Office Space
  ['office_spaces_required', 'location', 'structure_type'],
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

  const activeGroups = FIELD_ROW_GROUPS.filter((group) => group.every((name) => name in props));
  const groupedNames = new Set(activeGroups.flat());
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
