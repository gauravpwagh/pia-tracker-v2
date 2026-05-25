/**
 * ProjectsPage — list of projects visible to the current user, with a
 * "New Project" button for users who hold PROJECT.CREATE (EDGS/CI).
 *
 * Data:
 *   GET /api/v1/projects  — project list, zone-filtered by the backend
 *   GET /api/v1/zones     — zone reference for the create form picker
 *   POST /api/v1/projects — create (201 Created)
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Button,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import {
  fetchProjects,
  fetchZones,
  createProject,
  type ProjectSummaryResponse,
  type CreateProjectRequest,
} from '@api/projects';
import { useAuthStore } from '@stores/authStore';

const { Title } = Typography;

// ── Query keys ────────────────────────────────────────────────────────────────

export const PROJECTS_QUERY_KEY = ['projects'] as const;
export const ZONES_QUERY_KEY = ['zones'] as const;

// ── Create Project modal ──────────────────────────────────────────────────────

interface CreateProjectModalProps {
  open: boolean;
  onClose: () => void;
}

function CreateProjectModal({ open, onClose }: CreateProjectModalProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<CreateProjectRequest>();

  const zonesQuery = useQuery({
    queryKey: ZONES_QUERY_KEY,
    queryFn: fetchZones,
    staleTime: 10 * 60 * 1000, // zones rarely change
  });

  const mutation = useMutation({
    mutationFn: createProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
      form.resetFields();
      onClose();
    },
  });

  const handleOk = () => {
    form
      .validateFields()
      .then((values) => mutation.mutate(values))
      .catch(() => {/* validation error — form shows inline messages */});
  };

  const handleCancel = () => {
    if (!mutation.isPending) {
      form.resetFields();
      onClose();
    }
  };

  return (
    <Modal
      title={t('projects.createModal.title', 'New Project')}
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      okText={t('projects.createModal.submit', 'Create')}
      cancelText={t('common.cancel', 'Cancel')}
      confirmLoading={mutation.isPending}
      destroyOnClose
    >
      {mutation.isError && (
        <Alert
          type="error"
          message={t('projects.createModal.error', 'Failed to create project')}
          description={mutation.error instanceof Error ? mutation.error.message : undefined}
          style={{ marginBottom: 16 }}
          showIcon
        />
      )}

      <Form form={form} layout="vertical" requiredMark>
        <Form.Item
          name="name"
          label={t('projects.createModal.nameLabel', 'Project name')}
          rules={[
            { required: true, message: t('projects.createModal.nameRequired', 'Project name is required') },
            { max: 256, message: t('projects.createModal.nameTooLong', 'Name must be 256 characters or fewer') },
          ]}
        >
          <Input placeholder={t('projects.createModal.namePlaceholder', 'e.g. Doubling of Bina–Katni section')} />
        </Form.Item>

        <Form.Item
          name="zoneId"
          label={t('projects.createModal.zoneLabel', 'Zone')}
          rules={[{ required: true, message: t('projects.createModal.zoneRequired', 'Zone is required') }]}
        >
          <Select
            placeholder={t('projects.createModal.zonePlaceholder', 'Select a zone')}
            loading={zonesQuery.isLoading}
            showSearch
            optionFilterProp="label"
            options={zonesQuery.data?.map((z) => ({
              value: z.id,
              label: `${z.shortName} — ${z.name}`,
            }))}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ── Projects table ────────────────────────────────────────────────────────────

function useColumns(
  zoneMap: Record<string, string>,
  t: ReturnType<typeof useTranslation>['t'],
): ColumnsType<ProjectSummaryResponse> {
  return [
    {
      title: t('projects.table.name', 'Project name'),
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
    {
      title: t('projects.table.zone', 'Zone'),
      dataIndex: 'zoneId',
      key: 'zone',
      render: (zoneId: string) => zoneMap[zoneId] ?? zoneId,
      width: 180,
    },
  ];
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const { t } = useTranslation();
  const currentUser = useAuthStore((s) => s.currentUser);
  const [modalOpen, setModalOpen] = useState(false);

  const canCreate = currentUser?.permissions.includes('PROJECT.CREATE') ?? false;

  const projectsQuery = useQuery({
    queryKey: PROJECTS_QUERY_KEY,
    queryFn: fetchProjects,
    enabled: currentUser !== null,
  });

  const zonesQuery = useQuery({
    queryKey: ZONES_QUERY_KEY,
    queryFn: fetchZones,
    staleTime: 10 * 60 * 1000,
  });

  // Build a zoneId → shortName map for the table
  const zoneMap: Record<string, string> = {};
  zonesQuery.data?.forEach((z) => {
    zoneMap[z.id] = z.shortName;
  });

  const columns = useColumns(zoneMap, t);

  if (!currentUser) {
    return (
      <Alert
        type="warning"
        message={t('common.notAuthenticated', 'Please select a user to continue.')}
        showIcon
      />
    );
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Title level={4} style={{ margin: 0 }}>
          {t('projects.title', 'Projects')}
        </Title>
        {canCreate && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setModalOpen(true)}
          >
            {t('projects.newButton', 'New Project')}
          </Button>
        )}
      </Space>

      {projectsQuery.isError && (
        <Alert
          type="error"
          message={t('projects.loadError', 'Failed to load projects')}
          description={
            projectsQuery.error instanceof Error
              ? projectsQuery.error.message
              : undefined
          }
          showIcon
        />
      )}

      {projectsQuery.isLoading ? (
        <Spin style={{ display: 'block', margin: '40px auto' }} />
      ) : (
        <Table<ProjectSummaryResponse>
          size="small"
          rowKey="id"
          columns={columns}
          dataSource={projectsQuery.data ?? []}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          locale={{ emptyText: t('projects.empty', 'No projects yet.') }}
        />
      )}

      <CreateProjectModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </Space>
  );
}
