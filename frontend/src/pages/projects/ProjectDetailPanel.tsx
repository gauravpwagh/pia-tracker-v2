/**
 * ProjectDetailPanel — slide-in right pane for a selected project.
 *
 * Renders:
 *   • Project metadata (name, code, zone, state, chainage…)
 *   • Lifecycle action section — buttons and modals for the current state:
 *       AWAITING_CAO_ALLOCATION  → "Allocate to CE/C"  (requires PROJECT.ALLOCATE)
 *       AWAITING_CEC_ASSIGNMENT  → "Assign Dy CE/C"    (requires PROJECT.ASSIGN_DYCE)
 *       ACTIVE                   → "Designate Nodal"   (requires PROJECT.DESIGNATE_NODAL)
 *
 * After any successful action the panel invalidates ['project', id] and
 * ['projects'] so the tree badge and detail content both refresh.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Button,
  Descriptions,
  Form,
  Modal,
  Select,
  Skeleton,
  Space,
  Tag,
  Typography,
} from 'antd';
import {
  CloseOutlined,
  ProjectOutlined,
  UserAddOutlined,
  UsergroupAddOutlined,
  StarOutlined,
} from '@ant-design/icons';
import {
  fetchProjectDetail,
  fetchProjectAssignments,
  fetchZones,
  allocateProject,
  assignDyceUsers,
  designateNodalUser,
  type ProjectDetailResponse,
} from '@api/projects';
import { fetchUsersByDesignation, type UserSummary } from '@api/auth';
import type { PrincipalInfo } from '@api/auth';

const { Title, Text } = Typography;

// ── Helpers ───────────────────────────────────────────────────────────────────

const LIFECYCLE_COLORS: Record<string, string> = {
  DRAFT: 'default',
  AWAITING_CAO_ALLOCATION: 'orange',
  AWAITING_CEC_ASSIGNMENT: 'gold',
  ACTIVE: 'green',
  CLOSED: 'default',
  CANCELLED: 'red',
};

const LIFECYCLE_LABELS: Record<string, string> = {
  AWAITING_CAO_ALLOCATION: 'Awaiting CAO/C Allocation',
  AWAITING_CEC_ASSIGNMENT: 'Awaiting CE/C Assignment',
  ACTIVE: 'Active',
  DRAFT: 'Draft',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
};

function StateBadge({ state }: { state: string }) {
  return (
    <Tag color={LIFECYCLE_COLORS[state] ?? 'default'}>
      {LIFECYCLE_LABELS[state] ?? state.replace(/_/g, ' ')}
    </Tag>
  );
}

// ── Allocate modal ────────────────────────────────────────────────────────────

function AllocateModal({
  projectId,
  open,
  onClose,
  onSuccess,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const [form] = Form.useForm<{ ceUserId: string }>();

  const cecUsersQuery = useQuery({
    queryKey: ['users', 'CE_C'],
    queryFn: () => fetchUsersByDesignation('CE_C'),
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: ({ ceUserId }: { ceUserId: string }) =>
      allocateProject(projectId, ceUserId),
    onSuccess: () => {
      form.resetFields();
      onSuccess();
      onClose();
    },
  });

  const handleOk = () => {
    form.validateFields().then(({ ceUserId }) => mutation.mutate({ ceUserId }));
  };

  return (
    <Modal
      title={
        <Space>
          <UserAddOutlined />
          {t('projects.action.allocate.title', 'Allocate to CE/C')}
        </Space>
      }
      open={open}
      onOk={handleOk}
      onCancel={() => { if (!mutation.isPending) { form.resetFields(); onClose(); } }}
      okText={t('projects.action.allocate.submit', 'Allocate')}
      confirmLoading={mutation.isPending}
      destroyOnClose
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        {t('projects.action.allocate.help',
          'Select the Chief Engineer (Construction) who will oversee this project. ' +
          'The project will move to "Awaiting CE/C Assignment" and CE/C will be notified.')}
      </Text>

      {mutation.isError && (
        <Alert
          type="error"
          message={t('projects.action.allocate.error', 'Allocation failed')}
          description={mutation.error instanceof Error ? mutation.error.message : undefined}
          style={{ marginBottom: 12 }}
          showIcon
        />
      )}

      <Form form={form} layout="vertical">
        <Form.Item
          name="ceUserId"
          label={t('projects.action.allocate.label', 'CE/C')}
          rules={[{ required: true, message: t('projects.action.allocate.required', 'Please select a CE/C') }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            loading={cecUsersQuery.isLoading}
            placeholder={t('projects.action.allocate.placeholder', 'Select CE/C…')}
            options={cecUsersQuery.data?.map((u: UserSummary) => ({
              value: u.id,
              label: `${u.name}`,
            }))}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ── Assign Dy CE/C modal ──────────────────────────────────────────────────────

function AssignDyceModal({
  projectId,
  open,
  onClose,
  onSuccess,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const [form] = Form.useForm<{ dyceUserIds: string[] }>();

  const dyceUsersQuery = useQuery({
    queryKey: ['users', 'DY_CE_C'],
    queryFn: () => fetchUsersByDesignation('DY_CE_C'),
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: ({ dyceUserIds }: { dyceUserIds: string[] }) =>
      assignDyceUsers(projectId, dyceUserIds),
    onSuccess: () => {
      form.resetFields();
      onSuccess();
      onClose();
    },
  });

  const handleOk = () => {
    form.validateFields().then(({ dyceUserIds }) => mutation.mutate({ dyceUserIds }));
  };

  return (
    <Modal
      title={
        <Space>
          <UsergroupAddOutlined />
          {t('projects.action.assignDyce.title', 'Assign Dy CE/C')}
        </Space>
      }
      open={open}
      onOk={handleOk}
      onCancel={() => { if (!mutation.isPending) { form.resetFields(); onClose(); } }}
      okText={t('projects.action.assignDyce.submit', 'Assign')}
      confirmLoading={mutation.isPending}
      destroyOnClose
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        {t('projects.action.assignDyce.help',
          'Select one or more Deputy Chief Engineers (Construction) for this project. ' +
          'The project becomes Active once assigned. You can designate a Nodal Dy CE/C afterwards.')}
      </Text>

      {mutation.isError && (
        <Alert
          type="error"
          message={t('projects.action.assignDyce.error', 'Assignment failed')}
          description={mutation.error instanceof Error ? mutation.error.message : undefined}
          style={{ marginBottom: 12 }}
          showIcon
        />
      )}

      <Form form={form} layout="vertical">
        <Form.Item
          name="dyceUserIds"
          label={t('projects.action.assignDyce.label', 'Dy CE/C(s)')}
          rules={[{ required: true, message: t('projects.action.assignDyce.required', 'Select at least one Dy CE/C') }]}
        >
          <Select
            mode="multiple"
            showSearch
            optionFilterProp="label"
            loading={dyceUsersQuery.isLoading}
            placeholder={t('projects.action.assignDyce.placeholder', 'Select Dy CE/C(s)…')}
            options={dyceUsersQuery.data?.map((u: UserSummary) => ({
              value: u.id,
              label: `${u.name}`,
            }))}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ── Designate Nodal modal ─────────────────────────────────────────────────────

function DesignateNodalModal({
  projectId,
  open,
  onClose,
  onSuccess,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const [form] = Form.useForm<{ nodalUserId: string }>();

  // Load only DY_CE_C users already assigned to this project
  const assignmentsQuery = useQuery({
    queryKey: ['project-assignments', projectId],
    queryFn: () => fetchProjectAssignments(projectId),
    staleTime: 30_000,
    enabled: open,
  });

  const allDyceQuery = useQuery({
    queryKey: ['users', 'DY_CE_C'],
    queryFn: () => fetchUsersByDesignation('DY_CE_C'),
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });

  // Filter to only the DY_CE_Cs assigned to this project
  const assignedDyceIds = new Set(
    (assignmentsQuery.data ?? [])
      .filter((a) => a.assignmentRole === 'DY_CE_C')
      .map((a) => a.userId),
  );
  const assignedDyceUsers = (allDyceQuery.data ?? []).filter((u) => assignedDyceIds.has(u.id));

  const mutation = useMutation({
    mutationFn: ({ nodalUserId }: { nodalUserId: string }) =>
      designateNodalUser(projectId, nodalUserId),
    onSuccess: () => {
      form.resetFields();
      onSuccess();
      onClose();
    },
  });

  const handleOk = () => {
    form.validateFields().then(({ nodalUserId }) => mutation.mutate({ nodalUserId }));
  };

  const isLoading = assignmentsQuery.isLoading || allDyceQuery.isLoading;

  return (
    <Modal
      title={
        <Space>
          <StarOutlined />
          {t('projects.action.designateNodal.title', 'Designate Nodal Dy CE/C')}
        </Space>
      }
      open={open}
      onOk={handleOk}
      onCancel={() => { if (!mutation.isPending) { form.resetFields(); onClose(); } }}
      okText={t('projects.action.designateNodal.submit', 'Designate')}
      confirmLoading={mutation.isPending}
      destroyOnClose
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        {t('projects.action.designateNodal.help',
          'The Nodal Dy CE/C coordinates across all activities for this project. ' +
          'Only Dy CE/Cs already assigned to this project are shown.')}
      </Text>

      {mutation.isError && (
        <Alert
          type="error"
          message={t('projects.action.designateNodal.error', 'Designation failed')}
          description={mutation.error instanceof Error ? mutation.error.message : undefined}
          style={{ marginBottom: 12 }}
          showIcon
        />
      )}

      {assignedDyceUsers.length === 0 && !isLoading && (
        <Alert
          type="warning"
          message={t('projects.action.designateNodal.noDyce',
            'No Dy CE/C is assigned to this project yet. Assign at least one Dy CE/C first.')}
          style={{ marginBottom: 12 }}
          showIcon
        />
      )}

      <Form form={form} layout="vertical">
        <Form.Item
          name="nodalUserId"
          label={t('projects.action.designateNodal.label', 'Nodal Dy CE/C')}
          rules={[{ required: true, message: t('projects.action.designateNodal.required', 'Please select a Dy CE/C') }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            loading={isLoading}
            disabled={assignedDyceUsers.length === 0}
            placeholder={t('projects.action.designateNodal.placeholder', 'Select Dy CE/C…')}
            options={assignedDyceUsers.map((u: UserSummary) => ({
              value: u.id,
              label: `${u.name}`,
            }))}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ── Action bar ────────────────────────────────────────────────────────────────

function ProjectActionBar({
  project,
  currentUser,
  onActionSuccess,
}: {
  project: ProjectDetailResponse;
  currentUser: PrincipalInfo;
  onActionSuccess: () => void;
}) {
  const { t } = useTranslation();
  const [modal, setModal] = useState<'allocate' | 'assignDyce' | 'designateNodal' | null>(null);

  const perms = currentUser.permissions;
  const state = project.lifecycleState;

  const canAllocate = perms.includes('PROJECT.ALLOCATE') && state === 'AWAITING_CAO_ALLOCATION';
  const canAssignDyce = perms.includes('PROJECT.ASSIGN_DYCE') && state === 'AWAITING_CEC_ASSIGNMENT';
  const canDesignateNodal = perms.includes('PROJECT.DESIGNATE_NODAL') && state === 'ACTIVE';

  if (!canAllocate && !canAssignDyce && !canDesignateNodal) return null;

  return (
    <>
      <div style={{
        borderTop: '1px solid var(--ant-color-border)',
        padding: '12px 16px',
        background: 'var(--ant-color-bg-layout)',
      }}>
        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
          {t('projects.action.heading', 'ACTIONS')}
        </Text>
        <Space wrap>
          {canAllocate && (
            <Button
              type="primary"
              icon={<UserAddOutlined />}
              onClick={() => setModal('allocate')}
            >
              {t('projects.action.allocate.button', 'Allocate to CE/C')}
            </Button>
          )}
          {canAssignDyce && (
            <Button
              type="primary"
              icon={<UsergroupAddOutlined />}
              onClick={() => setModal('assignDyce')}
            >
              {t('projects.action.assignDyce.button', 'Assign Dy CE/C')}
            </Button>
          )}
          {canDesignateNodal && (
            <Button
              icon={<StarOutlined />}
              onClick={() => setModal('designateNodal')}
            >
              {t('projects.action.designateNodal.button', 'Designate Nodal')}
            </Button>
          )}
        </Space>
      </div>

      <AllocateModal
        projectId={project.id}
        open={modal === 'allocate'}
        onClose={() => setModal(null)}
        onSuccess={onActionSuccess}
      />
      <AssignDyceModal
        projectId={project.id}
        open={modal === 'assignDyce'}
        onClose={() => setModal(null)}
        onSuccess={onActionSuccess}
      />
      <DesignateNodalModal
        projectId={project.id}
        open={modal === 'designateNodal'}
        onClose={() => setModal(null)}
        onSuccess={onActionSuccess}
      />
    </>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface ProjectDetailPanelProps {
  projectId: string;
  currentUser: PrincipalInfo;
  onClose: () => void;
}

export function ProjectDetailPanel({ projectId, currentUser, onClose }: ProjectDetailPanelProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const projectQuery = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => fetchProjectDetail(projectId),
    staleTime: 30_000,
  });

  const zonesQuery = useQuery({
    queryKey: ['zones'],
    queryFn: fetchZones,
    staleTime: 10 * 60 * 1000,
  });

  const zoneLabel: Record<string, string> = {};
  zonesQuery.data?.forEach((z) => { zoneLabel[z.id] = `${z.shortName} — ${z.name}`; });

  const handleActionSuccess = () => {
    void queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    void queryClient.invalidateQueries({ queryKey: ['projects'] });
    void queryClient.invalidateQueries({ queryKey: ['project-assignments', projectId] });
  };

  const project = projectQuery.data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: '1px solid var(--ant-color-border)',
        flexShrink: 0,
      }}>
        <Space>
          <ProjectOutlined />
          <Text strong>{t('projects.detail.heading', 'Project')}</Text>
        </Space>
        <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose} />
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {projectQuery.isLoading && <Skeleton active paragraph={{ rows: 6 }} />}

        {projectQuery.isError && (
          <Alert
            type="error"
            message={t('projects.detail.loadError', 'Failed to load project')}
            showIcon
          />
        )}

        {project && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Space style={{ width: '100%', justifyContent: 'space-between', flexWrap: 'nowrap' }}>
              <Title level={5} style={{ margin: 0, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {project.name}
              </Title>
              <StateBadge state={project.lifecycleState} />
            </Space>

            {project.projectCode && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('projects.detail.code', 'Code')}: <Text code>{project.projectCode}</Text>
              </Text>
            )}

            <Descriptions size="small" column={1} bordered>
              <Descriptions.Item label={t('projects.detail.zone', 'Zone')}>
                {zoneLabel[project.zoneId] ?? project.zoneId}
              </Descriptions.Item>

              {project.projectType && (
                <Descriptions.Item label={t('projects.detail.type', 'Type')}>
                  {project.projectType.replace(/_/g, ' ')}
                </Descriptions.Item>
              )}

              {project.targetCompletionYear && (
                <Descriptions.Item label={t('projects.detail.targetYear', 'Target year')}>
                  {project.targetCompletionYear}
                </Descriptions.Item>
              )}

              {(project.chainageFromKm != null || project.chainageToKm != null) && (
                <Descriptions.Item label={t('projects.detail.chainage', 'Chainage')}>
                  {project.chainageFromKm ?? '?'} – {project.chainageToKm ?? '?'} km
                  {project.lengthKm != null && ` (${project.lengthKm} km)`}
                </Descriptions.Item>
              )}
            </Descriptions>

            {/* Inline state guide */}
            <StateGuide state={project.lifecycleState} />
          </Space>
        )}
      </div>

      {/* Action bar — pinned to bottom */}
      {project && (
        <ProjectActionBar
          project={project}
          currentUser={currentUser}
          onActionSuccess={handleActionSuccess}
        />
      )}
    </div>
  );
}

// ── State guide ───────────────────────────────────────────────────────────────

function StateGuide({ state }: { state: string }) {
  const guides: Record<string, { color: string; text: string }> = {
    AWAITING_CAO_ALLOCATION: {
      color: 'orange',
      text: 'Waiting for CAO/C to allocate this project to a CE/C.',
    },
    AWAITING_CEC_ASSIGNMENT: {
      color: 'gold',
      text: 'Waiting for CE/C to assign Dy CE/C(s) to this project.',
    },
    ACTIVE: {
      color: 'green',
      text: 'Project is active. CE/C can designate a Nodal Dy CE/C.',
    },
    DRAFT: { color: 'default', text: 'Project is in draft.' },
    CLOSED: { color: 'default', text: 'Project is closed.' },
    CANCELLED: { color: 'red', text: 'Project has been cancelled.' },
  };

  const guide = guides[state];
  if (!guide) return null;

  return (
    <Alert
      type={guide.color === 'green' ? 'success' : guide.color === 'red' ? 'error' : 'warning'}
      message={guide.text}
      showIcon
      style={{ fontSize: 12 }}
    />
  );
}
