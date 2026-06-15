/**
 * ApprovalChainField — custom RJSF field for drawing approval authority chains.
 *
 * Renders a vertical Ant Design Steps component where each step represents
 * one approving authority in order. A DatePicker in each step captures the
 * date that authority approved the drawing.
 *
 * Schema shape expected (under the `approval_chain` property):
 *   { type: "object", title: "Approving Authority",
 *     properties: { SR_DEN: { type: "string", format: "date", title: "Sr DEN" }, ... } }
 *
 * Registered as  ui:field: "approvalChain"  in drawing form ui_schema_json.
 */

import { DatePicker, Steps, Typography } from 'antd';
import dayjs from 'dayjs';
import type { FieldProps } from '@rjsf/utils';

const { Text } = Typography;

type ChainData = Record<string, string | undefined>;

export function ApprovalChainField({
  schema,
  formData,
  onChange,
  disabled,
  readonly,
}: FieldProps) {
  const props = (schema.properties ?? {}) as Record<string, { title?: string }>;
  const keys  = Object.keys(props);
  const data  = (formData as ChainData | undefined) ?? {};

  const handleChange = (key: string, dateStr: string | null) => {
    const next = { ...data };
    if (dateStr) {
      next[key] = dateStr;
    } else {
      delete next[key];
    }
    onChange(next);
  };

  // Count how many authorities have a date — drives the "current" step indicator.
  const doneCount = keys.filter((k) => !!data[k]).length;

  return (
    <div style={{ marginBottom: 8 }}>
      <Text
        type="secondary"
        style={{ fontSize: 12, display: 'block', marginBottom: 8 }}
      >
        {schema.title ?? 'Approving Authority'}
      </Text>

      <Steps
        direction="vertical"
        size="small"
        current={doneCount}
        items={keys.map((key, i) => {
          const label   = props[key]?.title ?? key;
          const dateVal = data[key];
          const isDone  = !!dateVal;

          return {
            title: (
              <Text style={{ fontSize: 13, fontWeight: isDone ? 500 : 400 }}>
                {label}
              </Text>
            ),
            status: isDone ? 'finish' : i === doneCount ? 'process' : 'wait',
            description: (
              <DatePicker
                size="small"
                value={dateVal ? dayjs(dateVal) : null}
                onChange={(_, ds) =>
                  handleChange(key, typeof ds === 'string' ? ds || null : null)
                }
                disabled={disabled || readonly}
                placeholder="Select approval date"
                style={{ marginBottom: 4 }}
              />
            ),
          };
        })}
      />
    </div>
  );
}
