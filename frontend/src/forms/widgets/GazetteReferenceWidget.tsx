/**
 * GazetteReferenceWidget — RJSF custom widget for gazette notifications.
 *
 * A gazette reference is a composite of:
 *   - Gazette date     (DatePicker)
 *   - Gazette number   (text Input)
 *   - Gazette PDF      (AttachmentWidget stub)
 *
 * The schema field type is `object` with `"ui:widget": "gazette_reference"`.
 * The stored value is a JSON object: `{ gazette_date, gazette_number, gazette_pdf? }`.
 *
 * Because RJSF calls custom widgets with a scalar value, we deserialise the
 * object from the string value (or from the already-parsed object that RJSF
 * may pass for object-typed fields) and re-serialise on every change.
 */

import { Button, DatePicker, Input, Space, Typography } from 'antd';
import { PaperClipOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import type { WidgetProps } from '@rjsf/utils';

const { Text } = Typography;

interface GazetteValue {
  gazette_date?: string;      // ISO date string, e.g. "2024-03-15"
  gazette_number?: string;
  gazette_pdf?: string;       // MinIO object key stub
}

function parseValue(value: unknown): GazetteValue {
  if (!value) return {};
  if (typeof value === 'object' && value !== null) return value as GazetteValue;
  if (typeof value === 'string') {
    try { return JSON.parse(value) as GazetteValue; } catch { return {}; }
  }
  return {};
}

export function GazetteReferenceWidget({
  value,
  onChange,
  disabled,
  readonly,
  label,
  required,
  schema,
}: WidgetProps) {
  const title = (schema.title as string | undefined) ?? label;
  const parsed = parseValue(value);

  const emit = (patch: Partial<GazetteValue>) => {
    onChange({ ...parsed, ...patch });
  };

  const handleDate = (date: Dayjs | null) => {
    emit({ gazette_date: date ? date.format('YYYY-MM-DD') : undefined });
  };

  const handleNumber = (e: React.ChangeEvent<HTMLInputElement>) => {
    emit({ gazette_number: e.target.value || undefined });
  };

  const isDisabled = disabled || readonly;

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
      <Space direction="vertical" style={{ width: '100%' }} size={8}>
        <Space wrap>
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 2 }}>
              Gazette Date
            </Text>
            <DatePicker
              value={parsed.gazette_date ? dayjs(parsed.gazette_date) : null}
              onChange={handleDate}
              disabled={isDisabled}
              format="DD MMM YYYY"
              placeholder="Select date"
            />
          </div>
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 2 }}>
              Gazette Number
            </Text>
            <Input
              value={parsed.gazette_number ?? ''}
              onChange={handleNumber}
              disabled={isDisabled}
              placeholder="e.g. GZ-2024-0042"
              style={{ width: 200 }}
            />
          </div>
        </Space>
        <div>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 2 }}>
            Gazette PDF
          </Text>
          {parsed.gazette_pdf ? (
            <Text type="secondary" style={{ fontFamily: 'monospace' }}>
              📎 {parsed.gazette_pdf}
            </Text>
          ) : (
            <Button icon={<PaperClipOutlined />} disabled size="small">
              Attach gazette PDF (available in a later phase)
            </Button>
          )}
        </div>
      </Space>
    </div>
  );
}
