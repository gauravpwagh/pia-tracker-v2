/**
 * YesNoWidget — replaces RJSF's default CheckboxWidget for boolean fields.
 *
 * Renders an Ant Design Switch with "Yes" / "No" children instead of a
 * bare checkbox, matching the style used in ActivityMetadataForm.
 *
 * Registered as `CheckboxWidget` so it applies to every `type: "boolean"`
 * field across all RJSF forms without requiring ui-schema changes.
 */

import { Switch } from 'antd';
import type { WidgetProps } from '@rjsf/utils';

export function YesNoWidget({
  id,
  value,
  disabled,
  readonly,
  onChange,
  label,
  hideLabel,
}: WidgetProps) {
  const checked = typeof value === 'boolean' ? value : false;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled || readonly}
        checkedChildren="Yes"
        unCheckedChildren="No"
        onChange={(val) => onChange(val)}
        aria-label={hideLabel ? label : undefined}
      />
    </div>
  );
}
