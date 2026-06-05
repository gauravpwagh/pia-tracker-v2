/**
 * YesNoWidget — replaces RJSF's default CheckboxWidget for boolean fields.
 *
 * Renders an Ant Design Switch with "Yes" / "No" children instead of a
 * bare checkbox, matching the style used in ActivityMetadataForm.
 *
 * Registered as `CheckboxWidget` so it applies to every `type: "boolean"`
 * field across all RJSF forms without requiring ui-schema changes.
 */

import { Switch, Typography } from 'antd';
import type { WidgetProps } from '@rjsf/utils';

const { Text } = Typography;

export function YesNoWidget({
  id,
  value,
  disabled,
  readonly,
  onChange,
  label,
  schema,
}: WidgetProps) {
  const checked = typeof value === 'boolean' ? value : false;
  // Use the schema title if available, fall back to the label RJSF derives
  // from the field key.
  const question = (schema.title as string | undefined) || label;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {question && (
        <Text style={{ fontSize: 13 }}>{question}</Text>
      )}
      <Switch
        id={id}
        checked={checked}
        disabled={disabled || readonly}
        checkedChildren="Yes"
        unCheckedChildren="No"
        onChange={(val) => onChange(val)}
      />
    </div>
  );
}
