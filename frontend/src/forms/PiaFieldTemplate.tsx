/**
 * PiaFieldTemplate — thin wrapper around RJSF's default FieldTemplate that
 * makes a field span the full width of PiaObjectFieldTemplate's 2-per-row grid
 * (its own row) when it wouldn't make sense side-by-side with a sibling:
 *   - nested objects/arrays (they render their own multi-field sub-section,
 *     e.g. a Gazette Reference block with its own heading + several fields)
 *   - attachment / gazette_reference widgets (tall blocks with an upload
 *     control + attachment list)
 *   - long-text fields (status / comment / remark / reason / note /
 *     description / plan / execution / summary / objection / detail, or
 *     anything using the textarea widget) — these read better on their own row
 *     than cramped into half the width.
 * Everything else keeps RJSF's default stacked layout (label above input) at
 * its natural cell width — we deliberately do NOT force label/input onto the
 * same line, which squeezed inputs and wrapped long labels.
 */

import type { FieldTemplateProps } from '@rjsf/utils';
import { Templates as AntdTemplates } from '@rjsf/antd';

// Import antd's own default FieldTemplate directly rather than resolving
// "FieldTemplate" via registry.templates — the registry now has THIS
// component registered under that name (see RjsfForm.tsx), so looking it up
// by name would resolve back to itself and recurse infinitely (crashes the
// tab with a stack overflow — this is exactly what caused the "page
// unresponsive" hang when opening a record's edit/view area).
const DefaultFieldTemplate = AntdTemplates.FieldTemplate!;

const LONG_TEXT_NAME_PATTERN =
  /status|comment|remark|reason|note|description|execution|summary|objection/i;
const FULL_WIDTH_WIDGETS = new Set(['attachment', 'gazette_reference', 'textarea']);
// Widgets that render their own bold title internally. RJSF's field label would
// duplicate it (e.g. the Checklist showed "KMZ File" twice), so we suppress the
// RJSF-rendered label for these via displayLabel:false.
const SELF_TITLED_WIDGETS = new Set(['attachment', 'gazette_reference']);

export function PiaFieldTemplate(props: FieldTemplateProps) {
  const { uiSchema, schema, id } = props;

  const isObjectOrArray = schema.type === 'object' || schema.type === 'array';
  const widget = uiSchema?.['ui:widget'] as string | undefined;
  const isFullWidthWidget = widget !== undefined && FULL_WIDTH_WIDGETS.has(widget);
  const isLongTextField = LONG_TEXT_NAME_PATTERN.test(id ?? '');
  const spanFullWidth = isObjectOrArray || isFullWidthWidget || isLongTextField;

  const rendersOwnTitle = widget !== undefined && SELF_TITLED_WIDGETS.has(widget);
  const fieldProps = rendersOwnTitle ? { ...props, displayLabel: false } : props;

  return (
    <div style={spanFullWidth ? { gridColumn: '1 / -1' } : undefined}>
      <DefaultFieldTemplate {...fieldProps} />
    </div>
  );
}
