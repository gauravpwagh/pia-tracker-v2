/**
 * SendBackModal — modal that forces a comment when sending a section back
 * for correction.  The comment is required by the workflow definition.
 */

import { useState } from 'react';
import { Form, Input, Modal } from 'antd';
import { useTranslation } from 'react-i18next';

interface SendBackModalProps {
  open: boolean;
  /** Label shown as modal subtitle — e.g. the section code. */
  sectionLabel: string;
  loading: boolean;
  onConfirm: (comment: string) => void;
  onCancel: () => void;
}

export function SendBackModal({
  open,
  sectionLabel,
  loading,
  onConfirm,
  onCancel,
}: SendBackModalProps) {
  const { t } = useTranslation('forms');
  const [comment, setComment] = useState('');
  const [touched, setTouched] = useState(false);

  const isValid = comment.trim().length > 0;

  function handleOk() {
    setTouched(true);
    if (isValid) {
      onConfirm(comment.trim());
      // Reset for next open
      setComment('');
      setTouched(false);
    }
  }

  function handleCancel() {
    setComment('');
    setTouched(false);
    onCancel();
  }

  return (
    <Modal
      open={open}
      title={t('record.sendBackModal.title')}
      okText={t('record.sendBackModal.confirm')}
      cancelText={t('record.sendBackModal.cancel')}
      okButtonProps={{ danger: true, loading, disabled: !isValid && touched }}
      onOk={handleOk}
      onCancel={handleCancel}
      destroyOnClose
    >
      <p style={{ marginBottom: 12, color: 'var(--ant-color-text-secondary)' }}>
        {sectionLabel}
      </p>
      <Form layout="vertical">
        <Form.Item
          label={t('record.sendBackModal.commentLabel')}
          validateStatus={touched && !isValid ? 'error' : ''}
          help={touched && !isValid ? t('record.sendBackModal.commentRequired') : undefined}
          required
        >
          <Input.TextArea
            rows={4}
            value={comment}
            placeholder={t('record.sendBackModal.commentPlaceholder')}
            onChange={(e) => {
              setComment(e.target.value);
              setTouched(true);
            }}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
