/**
 * AttachmentWidget — RJSF custom widget stub for file attachments.
 *
 * Phase 1.9: renders a disabled "Attach file" button as a placeholder.
 * Real MinIO upload + ClamAV integration ships in Phase 2.1.
 *
 * The schema field type is `string` with `"ui:widget": "attachment"`.
 * When an attachment is uploaded, the widget stores the MinIO object key
 * (a UUID string) as the field value.
 */

import { Button, Typography } from 'antd';
import { PaperClipOutlined } from '@ant-design/icons';
import type { WidgetProps } from '@rjsf/utils';

const { Text } = Typography;

export function AttachmentWidget({ value, label, schema, required }: WidgetProps) {
  const title = (schema.title as string | undefined) ?? label;

  return (
    <div>
      {title && (
        <div style={{ marginBottom: 4 }}>
          <Text strong>
            {title}
            {required && <Text type="danger"> *</Text>}
          </Text>
        </div>
      )}
      {value ? (
        <Text type="secondary" style={{ fontFamily: 'monospace' }}>
          <PaperClipOutlined /> {String(value)}
        </Text>
      ) : (
        <Button icon={<PaperClipOutlined />} disabled>
          Attach file
          <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
            (available in a later phase)
          </Text>
        </Button>
      )}
    </div>
  );
}
