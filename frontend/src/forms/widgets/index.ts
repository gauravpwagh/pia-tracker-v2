/**
 * RJSF custom widget registry.
 *
 * Import this object and spread it into the RJSF `<Form widgets={...}>` prop.
 * Keys must match the `"ui:widget"` value in the form definition's ui-schema.
 */

export { ChainageWidget } from './ChainageWidget';
export { GazetteReferenceWidget } from './GazetteReferenceWidget';
export { AttachmentWidget } from './AttachmentWidget';
export { YesNoWidget } from './YesNoWidget';
export { SelectWidget } from './SelectWidget';

import { ChainageWidget } from './ChainageWidget';
import { GazetteReferenceWidget } from './GazetteReferenceWidget';
import { AttachmentWidget } from './AttachmentWidget';
import { YesNoWidget } from './YesNoWidget';
import { SelectWidget } from './SelectWidget';

export const customWidgets = {
  // Named widgets (referenced via ui:widget in the form's ui-schema)
  chainage: ChainageWidget,
  gazette_reference: GazetteReferenceWidget,
  attachment: AttachmentWidget,
  // Default boolean widget override — replaces the bare checkbox with a
  // Yes / No switch for every type: "boolean" field across all RJSF forms.
  CheckboxWidget: YesNoWidget,
  // Default enum dropdown override — same as @rjsf/antd but without the
  // leading blank option (see SelectWidget.tsx).
  SelectWidget,
} as const;
