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
      {/* Two (or more, space permitting) fields per row instead of RJSF's default
          one-per-row — cuts vertical scrolling substantially on long forms.
          auto-fit/minmax lets a field that needs more room (e.g. a textarea)
          still wrap to its own row via the browser's natural grid flow. */}
      <div style={{ display: 'grid', gridTemplateColumns: gridColumns, columnGap: 20, rowGap: 0 }}>
        {properties.map((prop) => (
          <div key={prop.name}>{prop.content}</div>
        ))}
      </div>
    </div>
  );
}
