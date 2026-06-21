/**
 * ChainageWidget — RJSF custom widget for railway chainage values.
 *
 * Chainage is expressed as `KM+M`, e.g. `42+500` meaning 42 km and 500 m.
 * The widget renders two numeric inputs side-by-side and produces / consumes
 * a single string value in `^\d+\+\d{3}$` format.
 *
 * The schema field type is `string` with `"ui:widget": "chainage"`.
 *
 * Validation of format correctness is enforced by JSON Schema pattern
 * on the form definition; this widget handles only the UX decomposition.
 */

import { useEffect, useState } from 'react';
import { InputNumber, Space, Typography } from 'antd';
import type { WidgetProps } from '@rjsf/utils';

const { Text } = Typography;

/** Parse `"42+500"` → `{ km: 42, m: 500 }`. Returns nulls for empty / invalid. */
function parse(value: string | undefined): { km: number | null; m: number | null } {
  if (!value) return { km: null, m: null };
  const match = value.match(/^(\d+)\+(\d{1,3})$/);
  if (!match) return { km: null, m: null };
  return { km: parseInt(match[1], 10), m: parseInt(match[2], 10) };
}

/** Format `{ km, m }` → `"42+500"`, zero-padding m to 3 digits.
 *  m defaults to 0 when unset so a km-only entry still produces a valid string. */
function format(km: number | null, m: number | null): string {
  if (km === null) return '';
  return `${km}+${String(m ?? 0).padStart(3, '0')}`;
}

export function ChainageWidget({
  value,
  onChange,
  disabled,
  readonly,
  label,
  required,
  schema,
}: WidgetProps) {
  const initial = parse(typeof value === 'string' ? value : undefined);
  const [km, setKm] = useState<number | null>(initial.km);
  const [m, setM] = useState<number | null>(initial.m);
  const title = (schema.title as string | undefined) ?? label;

  // Keep local state in sync when value is reset externally (e.g. form initialisation)
  useEffect(() => {
    const p = parse(typeof value === 'string' ? value : undefined);
    setKm(p.km);
    setM(p.m);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emit = (newKm: number | null, newM: number | null) => {
    const str = format(newKm, newM);
    // Emit undefined when incomplete so RJSF treats the field as empty (not '')
    onChange(str || undefined);
  };

  const handleKm = (v: number | null) => { setKm(v); emit(v, m); };
  const handleM  = (v: number | null) => { setM(v);  emit(km, v); };

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
      <Space align="center">
        <InputNumber
          aria-label={`${title ?? 'Chainage'} — kilometres`}
          min={0}
          value={km}
          onChange={handleKm}
          disabled={disabled || readonly}
          addonAfter="KM"
          style={{ width: 120 }}
          placeholder="0"
        />
        <Text>+</Text>
        <InputNumber
          aria-label={`${title ?? 'Chainage'} — metres`}
          min={0}
          max={999}
          value={m}
          onChange={handleM}
          disabled={disabled || readonly}
          addonAfter="M"
          style={{ width: 120 }}
          placeholder="000"
        />
      </Space>
    </div>
  );
}
