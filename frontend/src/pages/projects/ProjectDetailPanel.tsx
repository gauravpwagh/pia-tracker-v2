/**
 * ProjectDetailPanel — slide-in right pane for a selected project.
 *
 * Header bar contains ALL action buttons so they are always in the same place:
 *   • Lifecycle actions (state-gated, permission-gated):
 *       AWAITING_CAO_ALLOCATION → "Allocate to CE/C"   (PROJECT.ALLOCATE)
 *       AWAITING_CEC_ASSIGNMENT → "Assign Dy CE/C"     (PROJECT.ASSIGN_DYCE)
 *       ACTIVE                  → "Designate Nodal"    (PROJECT.DESIGNATE_NODAL)
 *   • "+ Add Activity" (ACTIVITY.CREATE.ASSIGNED, state = ACTIVE)
 *
 * Body: scrollable project metadata + state guide.
 */

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Button,
  Descriptions,
  Divider,
  Form,
  Modal,
  Select,
  Skeleton,
  Space,
  Steps,
  Tag,
  Typography,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseOutlined,
  PlusOutlined,
  ProjectOutlined,
  StarOutlined,
  TeamOutlined,
  UserAddOutlined,
  UsergroupAddOutlined,
} from '@ant-design/icons';
import {
  fetchProjectDetail,
  fetchProjectAssignments,
  fetchZones,
  allocateProject,
  assignDyceUsers,
  designateNodalUser,
  type ActivityDetailResponse,
} from '@api/projects';
import { fetchUsers, fetchUsersByDesignation, fetchUsersByDesignationAndZone, type UserSummary } from '@api/auth';
import type { PrincipalInfo } from '@api/auth';
import ActivityCreateWizard from './ActivityCreateWizard';
import dayjs from 'dayjs';

const { Text, Title } = Typography;

// ── Constants ─────────────────────────────────────────────────────────────────

const LIFECYCLE_COLORS: Record<string, string> = {
  DRAFT:                   'default',
  AWAITING_CAO_ALLOCATION: 'orange',
  AWAITING_CEC_ASSIGNMENT: 'gold',
  ACTIVE:                  'green',
  CLOSED:                  'default',
  CANCELLED:               'red',
};

const LIFECYCLE_LABELS: Record<string, string> = {
  AWAITING_CAO_ALLOCATION: 'Awaiting CAO/C Allocation',
  AWAITING_CEC_ASSIGNMENT: 'Awaiting CE/C Assignment',
  ACTIVE:                  'Active',
  DRAFT:                   'Draft',
  CLOSED:                  'Closed',
  CANCELLED:               'Cancelled',
};

// ── Small helpers ─────────────────────────────────────────────────────────────

function StateBadge({ state }: { state: string }) {
  return (
    <Tag color={LIFECYCLE_COLORS[state] ?? 'default'} style={{ margin: 0 }}>
      {LIFECYCLE_LABELS[state] ?? state.replace(/_/g, ' ')}
    </Tag>
  );
}

// ── Allocate modal ────────────────────────────────────────────────────────────

function AllocateModal({
  projectId, zoneId, open, onClose, onSuccess,
}: { projectId: string; zoneId: string; open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [form] = Form.useForm<{ ceUserId: string }>();
  const cecQuery = useQuery({
    queryKey: ['users', 'CE_C', zoneId],
    queryFn: () => fetchUsersByDesignationAndZone('CE_C', zoneId),
    staleTime: 5 * 60_000,
    enabled: open,
  });
  const mutation = useMutation({
    mutationFn: ({ ceUserId }: { ceUserId: string }) => allocateProject(projectId, [ceUserId]),
    onSuccess: () => { form.resetFields(); onSuccess(); onClose(); },
  });
  return (
    <Modal
      title={<Space><UserAddOutlined />Allocate to CE/C</Space>}
      open={open}
      onOk={() => form.validateFields().then(({ ceUserId }) => mutation.mutate({ ceUserId }))}
      onCancel={() => { if (!mutation.isPending) { form.resetFields(); onClose(); } }}
      okText="Allocate"
      confirmLoading={mutation.isPending}
      destroyOnClose
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Select the Chief Engineer (Construction) to oversee this project.
        The project will move to "Awaiting CE/C Assignment".
      </Text>
      {mutation.isError && (
        <Alert type="error" message="Allocation failed"
          description={mutation.error instanceof Error ? mutation.error.message : undefined}
          style={{ marginBottom: 12 }} showIcon />
      )}
      <Form form={form} layout="vertical">
        <Form.Item name="ceUserId" label="CE/C"
          rules={[{ required: true, message: 'Please select a CE/C' }]}>
          <Select showSearch optionFilterProp="label" loading={cecQuery.isLoading}
            placeholder="Select CE/C…"
            options={cecQuery.data?.map((u: UserSummary) => ({ value: u.id, label: u.name }))} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ── Assign Dy CE/C modal ──────────────────────────────────────────────────────

function AssignDyceModal({
  projectId, zoneId, open, onClose, onSuccess,
}: { projectId: string; zoneId: string; open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [form] = Form.useForm<{ dyceUserIds: string[] }>();
  const dyceQuery = useQuery({
    queryKey: ['users', 'DY_CE_C', zoneId],
    queryFn: () => fetchUsersByDesignationAndZone('DY_CE_C', zoneId),
    staleTime: 5 * 60_000,
    enabled: open,
  });
  const mutation = useMutation({
    mutationFn: ({ dyceUserIds }: { dyceUserIds: string[] }) => assignDyceUsers(projectId, dyceUserIds),
    onSuccess: () => { form.resetFields(); onSuccess(); onClose(); },
  });
  return (
    <Modal
      title={<Space><UsergroupAddOutlined />Assign Dy CE/C</Space>}
      open={open}
      onOk={() => form.validateFields().then(({ dyceUserIds }) => mutation.mutate({ dyceUserIds }))}
      onCancel={() => { if (!mutation.isPending) { form.resetFields(); onClose(); } }}
      okText="Assign"
      confirmLoading={mutation.isPending}
      destroyOnClose
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Select one or more Dy CE/Cs for this project. The project becomes Active once assigned.
      </Text>
      {mutation.isError && (
        <Alert type="error" message="Assignment failed"
          description={mutation.error instanceof Error ? mutation.error.message : undefined}
          style={{ marginBottom: 12 }} showIcon />
      )}
      <Form form={form} layout="vertical">
        <Form.Item name="dyceUserIds" label="Dy CE/C(s)"
          rules={[{ required: true, message: 'Select at least one Dy CE/C' }]}>
          <Select mode="multiple" showSearch optionFilterProp="label" loading={dyceQuery.isLoading}
            placeholder="Select Dy CE/C(s)…"
            options={dyceQuery.data?.map((u: UserSummary) => ({ value: u.id, label: u.name }))} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ── Designate Nodal modal ─────────────────────────────────────────────────────

function DesignateNodalModal({
  projectId, open, onClose, onSuccess,
}: { projectId: string; open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [form] = Form.useForm<{ nodalUserId: string }>();
  const assignmentsQuery = useQuery({
    queryKey: ['project-assignments', projectId],
    queryFn: () => fetchProjectAssignments(projectId),
    staleTime: 30_000,
    enabled: open,
  });
  const allDyceQuery = useQuery({
    queryKey: ['users', 'DY_CE_C'],
    queryFn: () => fetchUsersByDesignation('DY_CE_C'),
    staleTime: 5 * 60_000,
    enabled: open,
  });
  const assignedIds = new Set(
    (assignmentsQuery.data ?? []).filter((a) => a.assignmentRole === 'DY_CE_C').map((a) => a.userId),
  );
  const options = (allDyceQuery.data ?? []).filter((u) => assignedIds.has(u.id));
  const isLoading = assignmentsQuery.isLoading || allDyceQuery.isLoading;
  const mutation = useMutation({
    mutationFn: ({ nodalUserId }: { nodalUserId: string }) => designateNodalUser(projectId, nodalUserId),
    onSuccess: () => { form.resetFields(); onSuccess(); onClose(); },
  });
  return (
    <Modal
      title={<Space><StarOutlined />Designate Nodal Dy CE/C</Space>}
      open={open}
      onOk={() => form.validateFields().then(({ nodalUserId }) => mutation.mutate({ nodalUserId }))}
      onCancel={() => { if (!mutation.isPending) { form.resetFields(); onClose(); } }}
      okText="Designate"
      confirmLoading={mutation.isPending}
      destroyOnClose
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        The Nodal Dy CE/C coordinates across all activities. Only already-assigned Dy CE/Cs are shown.
      </Text>
      {mutation.isError && (
        <Alert type="error" message="Designation failed"
          description={mutation.error instanceof Error ? mutation.error.message : undefined}
          style={{ marginBottom: 12 }} showIcon />
      )}
      {options.length === 0 && !isLoading && (
        <Alert type="warning" message="No Dy CE/C assigned to this project yet."
          style={{ marginBottom: 12 }} showIcon />
      )}
      <Form form={form} layout="vertical">
        <Form.Item name="nodalUserId" label="Nodal Dy CE/C"
          rules={[{ required: true, message: 'Please select a Dy CE/C' }]}>
          <Select showSearch optionFilterProp="label" loading={isLoading} disabled={options.length === 0}
            placeholder="Select Dy CE/C…"
            options={options.map((u: UserSummary) => ({ value: u.id, label: u.name }))} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ── State guide ───────────────────────────────────────────────────────────────

function StateGuide({ state }: { state: string }) {
  const guides: Record<string, { type: 'warning' | 'success' | 'error' | 'info'; text: string }> = {
    AWAITING_CAO_ALLOCATION: { type: 'warning', text: 'Waiting for CAO/C to allocate this project to a CE/C.' },
    AWAITING_CEC_ASSIGNMENT: { type: 'warning', text: 'Waiting for CE/C to assign Dy CE/C(s) to this project.' },
    ACTIVE:                  { type: 'success', text: 'Project is active. Dy CE/C can now add activities.' },
    DRAFT:                   { type: 'info',    text: 'Project is in draft.' },
    CLOSED:                  { type: 'info',    text: 'Project is closed.' },
    CANCELLED:               { type: 'error',   text: 'Project has been cancelled.' },
  };
  const guide = guides[state];
  if (!guide) return null;
  return <Alert type={guide.type} message={guide.text} showIcon style={{ fontSize: 12 }} />;
}

// ── Lifecycle step index ──────────────────────────────────────────────────────

function lifecycleStepIndex(state: string): number {
  switch (state) {
    case 'DRAFT':
    case 'AWAITING_CAO_ALLOCATION': return 1; // step 0 done, step 1 in-progress
    case 'AWAITING_CEC_ASSIGNMENT': return 2; // steps 0–1 done, step 2 in-progress
    case 'ACTIVE':
    case 'CLOSED':
    case 'CANCELLED':
    default:                         return 3; // all steps finished (or error handled separately)
  }
}

// ── Workflow + team section ───────────────────────────────────────────────────

interface WorkflowSectionProps {
  state: string;
  ceName: string | null;
  dyceNames: string[];
  nodalName: string | null;
}

function WorkflowSection({ state, ceName, dyceNames, nodalName }: WorkflowSectionProps) {
  const isCancelled = state === 'CANCELLED';

  return (
    <>
      {/* Lifecycle stepper */}
      <Divider orientation="left" orientationMargin={0}
        style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)', margin: '4px 0 10px' }}>
        Lifecycle
      </Divider>
      <Steps
        direction="vertical"
        size="small"
        current={lifecycleStepIndex(state)}
        status={isCancelled ? 'error' : 'process'}
        style={{ paddingLeft: 4 }}
        items={[
          {
            title: 'Submitted',
            description: 'Project created and submitted for allocation',
          },
          {
            title: 'CE/C Allocated',
            description: ceName
              ? <span style={{ fontSize: 12 }}>{ceName}</span>
              : <span style={{ fontSize: 12, color: 'var(--ant-color-text-tertiary)' }}>Pending</span>,
          },
          {
            title: 'Dy CE/C Assigned',
            description: dyceNames.length > 0
              ? <span style={{ fontSize: 12 }}>{dyceNames.join(', ')}</span>
              : <span style={{ fontSize: 12, color: 'var(--ant-color-text-tertiary)' }}>Pending</span>,
          },
        ]}
      />

      {/* Team assignments */}
      {(ceName || dyceNames.length > 0 || nodalName) && (
        <>
          <Divider orientation="left" orientationMargin={0}
            style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)', margin: '12px 0 10px' }}>
            <Space size={4}><TeamOutlined /> Team</Space>
          </Divider>
          <Descriptions size="small" column={1} bordered>
            {ceName && (
              <Descriptions.Item label="CE/C">{ceName}</Descriptions.Item>
            )}
            {dyceNames.length > 0 && (
              <Descriptions.Item label="Dy CE/C">
                <Space direction="vertical" size={2}>
                  {dyceNames.map((n) => (
                    <span key={n} style={{ fontSize: 12 }}>{n}</span>
                  ))}
                </Space>
              </Descriptions.Item>
            )}
            {nodalName && (
              <Descriptions.Item label={<Space size={4}><StarOutlined />Nodal</Space>}>
                <Space size={4}>
                  <CheckCircleOutlined style={{ color: 'var(--ant-color-success)' }} />
                  {nodalName}
                </Space>
              </Descriptions.Item>
            )}
          </Descriptions>
        </>
      )}
    </>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

type ModalKind = 'allocate' | 'assignDyce' | 'designateNodal' | 'addActivity' | null;

interface ProjectDetailPanelProps {
  projectId: string;
  currentUser: PrincipalInfo;
  onClose: () => void;
  onActivityCreated?: () => void;
}

export function ProjectDetailPanel({
  projectId,
  currentUser,
  onClose,
  onActivityCreated,
}: ProjectDetailPanelProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [modal, setModal] = useState<ModalKind>(null);

  const projectQuery = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => fetchProjectDetail(projectId),
    staleTime: 30_000,
  });

  const zonesQuery = useQuery({
    queryKey: ['zones'],
    queryFn: fetchZones,
    staleTime: 10 * 60_000,
  });

  const assignmentsQuery = useQuery({
    queryKey: ['project-assignments', projectId],
    queryFn: () => fetchProjectAssignments(projectId),
    staleTime: 30_000,
  });

  const usersQuery = useQuery({
    queryKey: ['users-all'],
    queryFn: fetchUsers,
    staleTime: 5 * 60_000,
  });

  const userById = useMemo(() => {
    const map: Record<string, string> = {};
    usersQuery.data?.forEach((u) => { map[u.id] = u.name; });
    return map;
  }, [usersQuery.data]);

  const assignments = assignmentsQuery.data ?? [];
  const ceAssignment    = assignments.find((a) => a.assignmentRole === 'CE_C' && a.isActive);
  const dyceAssignments = assignments.filter((a) => a.assignmentRole === 'DY_CE_C' && a.isActive);
  const nodalAssignment = assignments.find((a) => a.assignmentRole === 'NODAL_DY_CE_C' && a.isActive);

  const ceName    = ceAssignment    ? (userById[ceAssignment.userId]    ?? '…') : null;
  const dyceNames = dyceAssignments.map((a) => userById[a.userId] ?? '…');
  const nodalName = nodalAssignment ? (userById[nodalAssignment.userId] ?? '…') : null;

  const zoneLabel: Record<string, string> = {};
  zonesQuery.data?.forEach((z) => { zoneLabel[z.id] = `${z.shortName} — ${z.name}`; });

  const handleActionSuccess = () => {
    void queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    void queryClient.invalidateQueries({ queryKey: ['projects'] });
    void queryClient.invalidateQueries({ queryKey: ['project-assignments', projectId] });
    void queryClient.invalidateQueries({ queryKey: ['users-all'] });
  };

  const handleActivitySuccess = () => {
    handleActionSuccess();
    void queryClient.invalidateQueries({ queryKey: ['activities', projectId] });
    onActivityCreated?.();
  };

  const project = projectQuery.data;
  const perms = currentUser.permissions;
  const state = project?.lifecycleState ?? '';

  // ── Button visibility ──────────────────────────────────────────────────────
  const canAllocate      = perms.includes('PROJECT.ALLOCATE')        && state === 'AWAITING_CAO_ALLOCATION';
  const canAssignDyce    = perms.includes('PROJECT.ASSIGN_DYCE')     && state === 'AWAITING_CEC_ASSIGNMENT';
  const canDesignateNodal = perms.includes('PROJECT.DESIGNATE_NODAL') && state === 'ACTIVE';
  const canAddActivity   = perms.includes('ACTIVITY.CREATE.ASSIGNED') && state === 'ACTIVE';

  const hasActions = canAllocate || canAssignDyce || canDesignateNodal || canAddActivity;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ── Title bar ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderBottom: '1px solid var(--ant-color-border)',
        flexShrink: 0,
        flexWrap: 'wrap',
        minHeight: 48,
      }}>
        {/* Left: icon + project name */}
        <ProjectOutlined style={{ color: 'var(--ant-color-text-secondary)', flexShrink: 0 }} />
        <Text
          strong
          style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}
        >
          {project?.name ?? t('projects.detail.heading', 'Project')}
        </Text>

        {/* Right: action buttons */}
        {project && hasActions && (
          <Space size={4} style={{ flexShrink: 0 }}>
            {canAllocate && (
              <Button size="small" type="primary" icon={<UserAddOutlined />}
                onClick={() => setModal('allocate')}>
                Allocate to CE/C
              </Button>
            )}
            {canAssignDyce && (
              <Button size="small" type="primary" icon={<UsergroupAddOutlined />}
                onClick={() => setModal('assignDyce')}>
                Assign Dy CE/C
              </Button>
            )}
            {canDesignateNodal && (
              <Button size="small" icon={<StarOutlined />}
                onClick={() => setModal('designateNodal')}>
                Designate Nodal
              </Button>
            )}
            {canAddActivity && (
              <Button size="small" type="default" icon={<PlusOutlined />}
                onClick={() => setModal('addActivity')}>
                Add Activity
              </Button>
            )}
          </Space>
        )}

        {/* Close */}
        <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose}
          style={{ flexShrink: 0 }} />
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {projectQuery.isLoading && <Skeleton active paragraph={{ rows: 6 }} />}

        {projectQuery.isError && (
          <Alert type="error" message={t('projects.detail.loadError', 'Failed to load project')} showIcon />
        )}

        {project && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {/* Name + badge */}
            <Space style={{ width: '100%', justifyContent: 'space-between', flexWrap: 'nowrap' }}>
              <Title level={5} style={{ margin: 0, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {project.name}
              </Title>
              <StateBadge state={project.lifecycleState} />
            </Space>

            {project.projectCode && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Code: <Text code>{project.projectCode}</Text>
              </Text>
            )}

            <Descriptions size="small" column={1} bordered>
              <Descriptions.Item label="Zone">
                {zoneLabel[project.zoneId] ?? project.zoneId}
              </Descriptions.Item>
              {project.projectType && (
                <Descriptions.Item label="Type">
                  {project.projectType.replace(/_/g, ' ')}
                </Descriptions.Item>
              )}
              {(project.chainageFromKm != null || project.chainageToKm != null) && (
                <Descriptions.Item label="Chainage">
                  {project.chainageFromKm ?? '?'} – {project.chainageToKm ?? '?'} km
                  {project.lengthKm != null && ` (${project.lengthKm} km)`}
                </Descriptions.Item>
              )}
              {project.targetCompletionYear && (
                <Descriptions.Item label="Target year">
                  {project.targetCompletionYear}
                </Descriptions.Item>
              )}
              {project.recommendedByBoardOn && (
                <Descriptions.Item label="Board recommendation">
                  {dayjs(project.recommendedByBoardOn).format('D MMM YYYY')}
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Created">
                {dayjs(project.createdAt).format('D MMM YYYY, HH:mm')}
                {project.createdByUserId && userById[project.createdByUserId]
                  ? ` by ${userById[project.createdByUserId]}`
                  : ''}
              </Descriptions.Item>
              <Descriptions.Item label="Last updated">
                {dayjs(project.updatedAt).format('D MMM YYYY, HH:mm')}
              </Descriptions.Item>
            </Descriptions>

            <StateGuide state={project.lifecycleState} />

            <WorkflowSection
              state={project.lifecycleState}
              ceName={ceName}
              dyceNames={dyceNames}
              nodalName={nodalName}
            />
          </Space>
        )}
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {project && (
        <>
          <AllocateModal
            projectId={project.id}
            zoneId={project.zoneId}
            open={modal === 'allocate'}
            onClose={() => setModal(null)}
            onSuccess={handleActionSuccess}
          />
          <AssignDyceModal
            projectId={project.id}
            zoneId={project.zoneId}
            open={modal === 'assignDyce'}
            onClose={() => setModal(null)}
            onSuccess={handleActionSuccess}
          />
          <DesignateNodalModal
            projectId={project.id}
            open={modal === 'designateNodal'}
            onClose={() => setModal(null)}
            onSuccess={handleActionSuccess}
          />
          <ActivityCreateWizard
            projectId={project.id}
            open={modal === 'addActivity'}
            onClose={() => setModal(null)}
            onCreated={(activity: ActivityDetailResponse) => { handleActivitySuccess(); void activity; }}
          />
        </>
      )}
    </div>
  );
}
