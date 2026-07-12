/**
 * SelectWidget — PIA Tracker override of the `@rjsf/antd` dropdown widget.
 *
 * The stock antd SelectWidget always prepends a blank option (value "") to the
 * dropdown list whenever the field has no `default`, even for required enums
 * (e.g. Utility Shifting Type, Drawing Type). That blank row is confusing and
 * lets a user "select nothing". This copy removes it — the greyed-out
 * placeholder text still shows while the field is empty.
 *
 * Everything else mirrors the upstream widget (`@rjsf/antd` v5).
 */

import { Select } from 'antd';
import type { SelectProps } from 'antd';
import type { DefaultOptionType } from 'antd/es/select';
import {
  ariaDescribedByIds,
  enumOptionsIndexForValue,
  enumOptionsValueForIndex,
} from '@rjsf/utils';
import type { WidgetProps } from '@rjsf/utils';
import { useMemo } from 'react';

const SELECT_STYLE = { width: '100%' };

export function SelectWidget({
  autofocus,
  disabled,
  formContext = {},
  id,
  multiple,
  onBlur,
  onChange,
  onFocus,
  options,
  placeholder,
  readonly,
  value,
}: WidgetProps) {
  const readonlyAsDisabled = (formContext as Record<string, unknown>).readonlyAsDisabled !== false;
  const { enumOptions, enumDisabled, emptyValue } = options;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleChange = (nextValue: any) =>
    onChange(enumOptionsValueForIndex(nextValue, enumOptions, emptyValue));
  const handleBlur = () => onBlur(id, enumOptionsValueForIndex(value, enumOptions, emptyValue));
  const handleFocus = () => onFocus(id, enumOptionsValueForIndex(value, enumOptions, emptyValue));

  const filterOption: SelectProps['filterOption'] = (input, option) => {
    const label = option?.label;
    if (typeof label === 'string') {
      return label.toLowerCase().indexOf(input.toLowerCase()) >= 0;
    }
    return false;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getPopupContainer = (node: any) => node.parentNode;
  const selectedIndexes = enumOptionsIndexForValue(value, enumOptions, multiple);

  const selectOptions: DefaultOptionType[] | undefined = useMemo(() => {
    if (Array.isArray(enumOptions)) {
      // No blank placeholder option unshifted here (that's the whole point).
      return enumOptions.map(({ value: optionValue, label: optionLabel }, index) => ({
        disabled: Array.isArray(enumDisabled) && enumDisabled.indexOf(optionValue) !== -1,
        key: String(index),
        value: String(index),
        label: optionLabel,
      })) as DefaultOptionType[];
    }
    return undefined;
  }, [enumDisabled, enumOptions]);

  return (
    <Select
      autoFocus={autofocus}
      disabled={disabled || (readonlyAsDisabled && readonly)}
      getPopupContainer={getPopupContainer}
      id={id}
      // `name` isn't in antd's Select typings but is honoured at runtime; spread
      // it in untyped, matching the upstream @rjsf/antd widget.
      {...({ name: id } as Record<string, unknown>)}
      mode={multiple ? 'multiple' : undefined}
      onBlur={!readonly ? handleBlur : undefined}
      onChange={!readonly ? handleChange : undefined}
      onFocus={!readonly ? handleFocus : undefined}
      placeholder={placeholder}
      style={SELECT_STYLE}
      value={selectedIndexes}
      filterOption={filterOption}
      aria-describedby={ariaDescribedByIds(id)}
      options={selectOptions}
    />
  );
}
