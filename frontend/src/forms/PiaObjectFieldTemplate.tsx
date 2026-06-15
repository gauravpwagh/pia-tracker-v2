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
}: ObjectFieldTemplateProps) {
  const uiDescription = uiSchema?.['ui:description'] as string | undefined;

  return (
    <div>
      {title && (
        <Divider
          orientation="left"
          orientationMargin={0}
          style={{ fontSize: 13, color: 'var(--ant-color-text-secondary)', margin: '12px 0 8px' }}
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
      {properties.map((prop) => prop.content)}
    </div>
  );
}
