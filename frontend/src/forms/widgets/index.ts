/**
 * RJSF custom widget registry.
 *
 * Import this object and spread it into the RJSF `<Form widgets={...}>` prop.
 * Keys must match the `"ui:widget"` value in the form definition's ui-schema.
 */

export { ChainageWidget } from './ChainageWidget';
export { GazetteReferenceWidget } from './GazetteReferenceWidget';
export { AttachmentWidget } from './AttachmentWidget';

import { ChainageWidget } from './ChainageWidget';
import { GazetteReferenceWidget } from './GazetteReferenceWidget';
import { AttachmentWidget } from './AttachmentWidget';

export const customWidgets = {
  chainage: ChainageWidget,
  gazette_reference: GazetteReferenceWidget,
  attachment: AttachmentWidget,
} as const;
