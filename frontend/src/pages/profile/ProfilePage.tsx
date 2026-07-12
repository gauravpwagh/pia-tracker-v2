import { useState } from 'react';
import {
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Space,
  Typography,
  message,
} from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { useAuthStore } from '@stores/authStore';
import { changePassword } from '@api/auth';

const { Title, Text } = Typography;

const MIN_PASSWORD_LENGTH = 6;

interface ChangePasswordForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/**
 * My Profile — shows the current user and a self-service change-password form for
 * the fallback username+password login. See PasswordAuthService on the backend.
 */
export default function ProfilePage() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const [form] = Form.useForm<ChangePasswordForm>();
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (values: ChangePasswordForm) => {
    setSaving(true);
    try {
      await changePassword(values.currentPassword, values.newPassword);
      message.success('Password changed.');
      form.resetFields();
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Could not change password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 24 }}>
      <Title level={3} style={{ marginTop: 0 }}>My Profile</Title>

      <Card style={{ marginBottom: 24 }}>
        <Descriptions column={1} size="small" colon>
          <Descriptions.Item label="Name">{currentUser?.name ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Email">{currentUser?.email ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Designation">{currentUser?.designationCode ?? '—'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="Change Password">
        <Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 13 }}>
          If you have never changed it, your current password is your HRMS ID.
        </Text>
        <Form form={form} layout="vertical" onFinish={handleSubmit} requiredMark={false}>
          <Form.Item
            name="currentPassword"
            label="Current password"
            rules={[{ required: true, message: 'Enter your current password.' }]}
          >
            <Input.Password prefix={<LockOutlined />} autoComplete="current-password" />
          </Form.Item>

          <Form.Item
            name="newPassword"
            label="New password"
            rules={[
              { required: true, message: 'Enter a new password.' },
              { min: MIN_PASSWORD_LENGTH, message: `At least ${MIN_PASSWORD_LENGTH} characters.` },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
          </Form.Item>

          <Form.Item
            name="confirmPassword"
            label="Confirm new password"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: 'Re-enter the new password.' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                  return Promise.reject(new Error('Passwords do not match.'));
                },
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
          </Form.Item>

          <Space>
            <Button type="primary" htmlType="submit" loading={saving}>
              Change password
            </Button>
            <Button onClick={() => form.resetFields()} disabled={saving}>
              Clear
            </Button>
          </Space>
        </Form>
      </Card>
    </div>
  );
}
