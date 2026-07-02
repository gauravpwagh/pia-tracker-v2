/**
 * ChainageWidget — RJSF custom widget for railway chainage values.
 *
 * Chainage is expressed as `KM+M`, e.g. `42+500` meaning 42 km and 500 m.
 * On disk / on the wire the value is a single string in `^\d+\+\d{3}$` format.
 *
 * The UI is a single numeric box in decimal-kilometre form (42.500 KM), where
 * the 3 decimal places are the metre component. This is far more compact than
 * two side-by-side boxes (which overflowed the grid cell) and matches how
 * chainage is usually written on plans.
 *
 * The schema field type is `string` with `"ui:widget": "chainage"`.
 */

import { useEffect, useState } from 'react';
import { InputNumber } from 'antd';
import type { WidgetProps } from '@rjsf/utils';

/** Parse `"42+500"` → `42.5` (decimal km). Returns null for empty / invalid. */
function parse(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.match(/^(\d+)\+(\d{1,3})$/);
  if (!match) return null;
  return parseInt(match[1], 10) + parseInt(match[2], 10) / 1000;
}

/** Format decimal km `42.5` → `"42+500"`, deriving m from the fractional part. */
function format(dec: number | null): string {
  if (dec === null || Number.isNaN(dec)) return '';
  const km = Math.floor(dec);
  const m = Math.round((dec - km) * 1000);
  // Guard against 999.9995 rounding up to 1000
  if (m >= 1000) return `${km + 1}+000`;
  return `${km}+${String(m).padStart(3, '0')}`;
}

export function ChainageWidget({
  value,
  onChange,
  disabled,
  readonly,
  label,
  schema,
}: WidgetProps) {
  const [km, setKm] = useState<number | null>(parse(typeof value === 'string' ? value : undefined));
  const title = (schema.title as string | undefined) ?? label;

  // Keep local state in sync when value is reset externally (e.g. form initialisation)
  useEffect(() => {
    setKm(parse(typeof value === 'string' ? value : undefined));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleChange = (v: number | null) => {
    setKm(v);
    const str = format(v);
    // Emit undefined when empty so RJSF treats the field as unset (not '')
    onChange(str || undefined);
  };

  return (
    <InputNumber
      aria-label={`${title ?? 'Chainage'} — kilometres (decimals are metres)`}
      min={0}
      step={0.001}
      precision={3}
      value={km}
      onChange={handleChange}
      disabled={disabled || readonly}
      addonAfter="KM"
      style={{ width: 180 }}
      placeholder="0.000"
    />
  );
}
