/**
 * PiaObjectFieldTemplate — replaces RJSF's default bordered-box object
 * renderer with a lightweight Ant Design Divider for the title, followed
 * by the fields.  Applied to all nested objects in the form (e.g.
 * GazetteReference sub-objects).
 */

import { Divider } from 'antd';
import type { ObjectFieldTemplateProps } from '@rjsf/utils';

export function PiaObjectFieldTemplate({
  title,
  description,
  properties,
}: ObjectFieldTemplateProps) {
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
      {description && (
        <p style={{ marginBottom: 8, color: 'var(--ant-color-text-secondary)', fontSize: 12 }}>
          {description}
        </p>
      )}
      {properties.map((prop) => prop.content)}
    </div>
  );
}
