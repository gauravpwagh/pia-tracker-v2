/**
 * AttachmentWidget — RJSF custom widget for file attachments.
 *
 * Schema field type: `string` with `"ui:widget": "attachment"`.
 *
 * Supported ui:options:
 *   accept       — comma-separated MIME types (defaults to all allowed types)
 *   uploadLabel  — button label (default: "Attach file")
 *   uploadHint   — hint below button (e.g. "PDF · KMZ · max 10 GB")
 *   entityType   — required: entity type for the attachment API
 *   entityId     — required: entity UUID for the attachment API
 */

import { Typography } from 'antd';
import type { WidgetProps } from '@rjsf/utils';
import { AttachmentPanel, ACCEPT_ALL } from '@components/attachments/AttachmentPanel';

const { Text } = Typography;

export function AttachmentWidget({ id, label, schema, required, uiSchema, formContext }: WidgetProps) {
  const title = (schema.title as string | undefined) ?? label;
  const opts = (uiSchema?.['ui:options'] ?? {}) as Record<string, unknown>;

  // entityType / entityId come from ui:options or formContext (set by the form renderer)
  const entityType =
    (opts.entityType as string | undefined) ?? (formContext as Record<string, string> | undefined)?.entityType ?? '';
  const baseEntityId =
    (opts.entityId as string | undefined) ?? (formContext as Record<string, string> | undefined)?.entityId ?? '';

  // scopeToField: true — append the field path to entityType so each field has its own
  // attachment pool while entityId stays a valid UUID (backend requires UUID for entityId).
  const scopeToField = opts.scopeToField === true;
  const fieldSuffix = id.replace(/^root_/, '');
  const entityId = baseEntityId;
  const effectiveEntityType = scopeToField && entityType ? `${entityType}__${fieldSuffix}` : entityType;

  const accept = (opts.accept as string | undefined) ?? ACCEPT_ALL;
  const uploadLabel = (opts.uploadLabel as string | undefined) ?? 'Attach file';
  const uploadHint = opts.uploadHint as string | undefined;

  return (
    <div>
      {title && (
        <div style={{ marginBottom: 6 }}>
          <Text strong>
            {title}
            {required && <Text type="danger"> *</Text>}
          </Text>
        </div>
      )}
      {entityId ? (
        <AttachmentPanel
          entityType={effectiveEntityType}
          entityId={entityId}
          canUpload
          accept={accept}
          uploadLabel={uploadLabel}
          uploadHint={uploadHint}
        />
      ) : (
        <Text type="secondary" style={{ fontSize: 12 }}>
          Save the form first to attach files.
        </Text>
      )}
    </div>
  );
}
