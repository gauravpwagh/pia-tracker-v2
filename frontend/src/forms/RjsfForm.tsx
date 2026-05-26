/**
 * RjsfForm — configured RJSF Form component with PIA Tracker widgets.
 *
 * Wraps `@rjsf/antd` with:
 *   - Custom widget registry (chainage, gazette_reference, attachment)
 *   - Schema validation disabled on autosave (liveValidate: false)
 *   - "Submit" button hidden (we use our own action bar)
 *   - Forwards ref so parent components can call `form.current?.submit()`
 *     to trigger a final-validation submit when needed.
 *
 * The parent is responsible for the `onChange` handler that feeds the
 * autosave hook. The `onSubmit` handler is called when the user explicitly
 * submits (Phase 1.11 workflow action).
 */

import { forwardRef, useImperativeHandle, useRef } from 'react';
import Form from '@rjsf/antd';
import validator from '@rjsf/validator-ajv8';
import type { IChangeEvent, FormProps } from '@rjsf/core';
import type { RJSFSchema, UiSchema } from '@rjsf/utils';
import { customWidgets } from './widgets';
import { PiaObjectFieldTemplate } from './PiaObjectFieldTemplate';

export interface RjsfFormHandle {
  /** Programmatically trigger form validation + submit. */
  submit: () => void;
}

export interface RjsfFormProps {
  schema: RJSFSchema;
  uiSchema?: UiSchema;
  formData: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
  onSubmit?: (data: Record<string, unknown>) => void;
  disabled?: boolean;
  readonly?: boolean;
}

export const RjsfForm = forwardRef<RjsfFormHandle, RjsfFormProps>(function RjsfForm(
  { schema, uiSchema, formData, onChange, onSubmit, disabled, readonly },
  ref,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const formRef = useRef<any>(null);

  useImperativeHandle(ref, () => ({
    submit: () => {
      formRef.current?.submit();
    },
  }));

  const handleChange = (e: IChangeEvent<Record<string, unknown>>) => {
    onChange(e.formData ?? {});
  };

  const handleSubmit: FormProps['onSubmit'] = (e) => {
    onSubmit?.(e.formData ?? {});
  };

  // Merge the submit-button suppression into the incoming ui-schema so we
  // never render RJSF's default submit button (we provide our own action bar).
  const mergedUiSchema: UiSchema = {
    ...uiSchema,
    'ui:submitButtonOptions': { norender: true },
  };

  return (
    <Form
      ref={formRef}
      schema={schema}
      uiSchema={mergedUiSchema}
      formData={formData}
      validator={validator}
      widgets={customWidgets}
      templates={{ ObjectFieldTemplate: PiaObjectFieldTemplate }}
      onChange={handleChange}
      onSubmit={handleSubmit}
      liveValidate={false}
      disabled={disabled}
      readonly={readonly}
    />
  );
});
