/**
 * DrawingApproversPanel — shown per drawing record in ActivityDetailPanel.
 *
 * DY CE/C or Nodal DY CE/C enters the date on which physical sign-off was
 * received from each approving authority. Approving authorities do NOT log in.
 *
 * State badge: "All Approved" when every slot has an approvedOn date,
 * otherwise shows count of pending slots.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  Alert,
  Button,
  DatePicker,
  Input,
  message,
  Select,
  Skeleton,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { CheckCircleOutlined, ClockCircleOutlined, SaveOutlined } from '@ant-design/icons';
import {
  addDrawingApprover,
  fetchDrawingApprovers,
  removeDrawingApprover,
  updateDrawingApproval,
  type DrawingApproverDto,
} from '@api/activityRecords';
import { fetchApprovalRoleDesignations } from '@api/designations';
import { useAuthStore } from '@stores/authStore';

const { Text } = Typography;

interface Props {
  recordId: string;
  canEdit: boolean;
  /** ISO string — used to compute pending days for unapproved slots. */
  recordCreatedAt?: string;
}

interface RowState {
  sentForReviewOn: dayjs.Dayjs | null;
  reviewedOn: dayjs.Dayjs | null;
  approvedOn: dayjs.Dayjs | null;
  remarks: string;
  dirty: boolean;
}

export function DrawingApproversPanel({ recordId, canEdit, recordCreatedAt }: Props) {
  const queryClient = useQueryClient();
  const queryKey = ['drawingApprovers', recordId];

  const currentUser = useAuthStore((s) => s.currentUser);
  const canEditApprovers = currentUser?.permissions.includes('DRAWING.EDIT_APPROVERS') ?? false;

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => fetchDrawingApprovers(recordId),
    staleTime: 30_000,
  });

  // All possible approving authorities — source list for the picker, not just this
  // drawing's default chain (decision DDDD: any approval-role designation is eligible).
  const { data: allDesignations } = useQuery({
    queryKey: ['approvalRoleDesignations'],
    queryFn: fetchApprovalRoleDesignations,
    staleTime: 5 * 60_000,
    enabled: canEditApprovers,
  });

  const addApproverMutation = useMutation({
    mutationFn: (designationCode: string) => addDrawingApprover(recordId, designationCode),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (err) => void message.error(err instanceof Error ? err.message : 'Failed to add approver'),
  });

  const removeApproverMutation = useMutation({
    mutationFn: (approverId: string) => removeDrawingApprover(recordId, approverId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (err) => void message.error(err instanceof Error ? err.message : 'Failed to remove approver'),
  });

  function handleApproverSelectionChange(newCodes: string[]) {
    if (!data) return;
    const currentCodes = data.approvers.map((a) => a.approvalDesignationCode);

    newCodes
      .filter((code) => !currentCodes.includes(code))
      .forEach((code) => addApproverMutation.mutate(code));

    currentCodes
      .filter((code) => !newCodes.includes(code))
      .forEach((code) => {
        const approver = data.approvers.find((a) => a.approvalDesignationCode === code);
        if (!approver) return;
        if (approver.approvedOn) {
          void message.error(`Cannot remove ${approver.designationName} — already approved. Clear the approval date first.`);
          return;
        }
        removeApproverMutation.mutate(approver.id);
      });
  }

  // Per-row local edit state keyed by approverId
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});

  const saveMutation = useMutation({
    mutationFn: ({
      approverId,
      approvedOn,
      remarks,
      sentForReviewOn,
      reviewedOn,
    }: {
      approverId: string;
      approvedOn: string | null;
      remarks: string | null;
      sentForReviewOn: string | null;
      reviewedOn: string | null;
    }) => updateDrawingApproval(recordId, approverId, { approvedOn, remarks, sentForReviewOn, reviewedOn }),
    onSuccess: (updated) => {
      // Patch the cached list in place
      queryClient.setQueryData<typeof data>(queryKey, (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          allApproved: prev.approvers
            .map((a) => a.id === updated.id ? updated : a)
            .every((a) => a.approvedOn !== null),
          approvers: prev.approvers.map((a) => a.id === updated.id ? updated : a),
        };
      });
      // Clear dirty flag for this row
      setRowStates((prev) => ({
        ...prev,
        [updated.id]: { ...prev[updated.id], dirty: false },
      }));
    },
  });

  if (isLoading) return <Skeleton active paragraph={{ rows: 2 }} style={{ marginTop: 8 }} />;
  if (isError) return <Alert type="error" message="Failed to load approvers" showIcon style={{ marginTop: 8 }} />;
  if (!data) return null;

  const pendingCount = data.approvers.filter((a) => a.approvedOn === null).length;

  function getRow(approver: DrawingApproverDto): RowState {
    return rowStates[approver.id] ?? {
      sentForReviewOn: approver.sentForReviewOn ? dayjs(approver.sentForReviewOn) : null,
      reviewedOn: approver.reviewedOn ? dayjs(approver.reviewedOn) : null,
      approvedOn: approver.approvedOn ? dayjs(approver.approvedOn) : null,
      remarks: approver.remarks ?? '',
      dirty: false,
    };
  }

  function setRow(approverId: string, patch: Partial<RowState>) {
    setRowStates((prev) => {
      const current = prev[approverId] ?? {
        sentForReviewOn: null,
        reviewedOn: null,
        approvedOn: null,
        remarks: '',
        dirty: false,
      };
      return { ...prev, [approverId]: { ...current, ...patch, dirty: true } };
    });
  }

  function handleSave(approver: DrawingApproverDto) {
    const row = getRow(approver);
    saveMutation.mutate({
      approverId: approver.id,
      sentForReviewOn: row.sentForReviewOn ? row.sentForReviewOn.format('YYYY-MM-DD') : null,
      reviewedOn: row.reviewedOn ? row.reviewedOn.format('YYYY-MM-DD') : null,
      approvedOn: row.approvedOn ? row.approvedOn.format('YYYY-MM-DD') : null,
      remarks: row.remarks.trim() || null,
    });
  }

  return (
    <div style={{ marginTop: 8 }}>
      {/* State badge */}
      <div style={{ marginBottom: 8 }}>
        {data.allApproved ? (
          <Tag color="green" icon={<CheckCircleOutlined />}>All Approved</Tag>
        ) : (
          <Tag color="orange" icon={<ClockCircleOutlined />}>
            {pendingCount} pending approval{pendingCount !== 1 ? 's' : ''}
          </Tag>
        )}
      </div>

      {/* Approver picker — Admin / CE/C / Nodal Dy CE/C only (DRAWING.EDIT_APPROVERS).
          Lists every approval-role designation, not just this drawing type's default
          chain; already-added approvers show up pre-selected. */}
      {canEditApprovers && (
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
            Approvers
          </Text>
          <Select
            mode="multiple"
            style={{ width: '100%' }}
            size="small"
            placeholder="Select approving authorities"
            loading={!allDesignations}
            value={data.approvers.map((a) => a.approvalDesignationCode)}
            onChange={handleApproverSelectionChange}
            optionFilterProp="label"
            options={(allDesignations ?? []).map((d) => ({
              value: d.code,
              label: `${d.shortLabel} — ${d.name}`,
            }))}
          />
        </div>
      )}

      {/* Approver rows — two per row on wider panes to cut vertical scrolling */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 8 }}>
        {data.approvers.map((approver) => {
          const row = getRow(approver);
          const isSaving = saveMutation.isPending && saveMutation.variables?.approverId === approver.id;

          const pendingDays = !approver.approvedOn && recordCreatedAt
            ? dayjs().diff(dayjs(recordCreatedAt), 'day')
            : null;

          return (
            <div
              key={approver.id}
              style={{
                border: '1px solid var(--ant-color-border)',
                borderRadius: 6,
                padding: '8px 10px',
                background: approver.approvedOn
                  ? 'var(--ant-color-success-bg)'
                  : 'var(--ant-color-warning-bg)',
              }}
            >
              {/* Designation name + status tag(s) */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 6 }}>
                <Text strong style={{ fontSize: 12 }}>{approver.designationName}</Text>
                <Space size={4}>
                  {approver.daysTakenForApproval !== null && (
                    <Tag style={{ margin: 0, fontSize: 11 }}>
                      {approver.daysTakenForApproval} day{approver.daysTakenForApproval !== 1 ? 's' : ''} taken
                    </Tag>
                  )}
                  {approver.approvedOn ? (
                    <Tag color="green" style={{ margin: 0, fontSize: 11 }}>
                      Approved {dayjs(approver.approvedOn).format('D MMM YYYY')}
                    </Tag>
                  ) : pendingDays !== null ? (
                    <Tag color="orange" icon={<ClockCircleOutlined />} style={{ margin: 0, fontSize: 11 }}>
                      Pending {pendingDays} day{pendingDays !== 1 ? 's' : ''}
                    </Tag>
                  ) : (
                    <Tag color="orange" icon={<ClockCircleOutlined />} style={{ margin: 0, fontSize: 11 }}>
                      Pending
                    </Tag>
                  )}
                </Space>
              </div>

              {canEdit && (
                <Space size={6} style={{ width: '100%' }} wrap>
                  <Tooltip title="Date the drawing was sent to this authority for review">
                    <DatePicker
                      size="small"
                      style={{ width: 130 }}
                      format="D MMM YYYY"
                      value={row.sentForReviewOn}
                      onChange={(val) => setRow(approver.id, { sentForReviewOn: val })}
                      placeholder="Sent for review"
                      allowClear
                    />
                  </Tooltip>
                  <Tooltip title="Date the concerned officer completed their review">
                    <DatePicker
                      size="small"
                      style={{ width: 130 }}
                      format="D MMM YYYY"
                      value={row.reviewedOn}
                      onChange={(val) => setRow(approver.id, { reviewedOn: val })}
                      placeholder="Reviewed on"
                      allowClear
                    />
                  </Tooltip>
                  <Tooltip title="Date of physical sign-off">
                    <DatePicker
                      size="small"
                      style={{ width: 130 }}
                      format="D MMM YYYY"
                      value={row.approvedOn}
                      onChange={(val) => setRow(approver.id, { approvedOn: val })}
                      placeholder="Approved on"
                      allowClear
                    />
                  </Tooltip>
                  <Input
                    size="small"
                    style={{ width: 200 }}
                    placeholder="Remarks (optional)"
                    value={row.remarks}
                    onChange={(e) => setRow(approver.id, { remarks: e.target.value })}
                  />
                  <Button
                    size="small"
                    type={row.dirty ? 'primary' : 'default'}
                    icon={<SaveOutlined />}
                    loading={isSaving}
                    disabled={!row.dirty}
                    onClick={() => handleSave(approver)}
                  >
                    Save
                  </Button>
                </Space>
              )}

              {!canEdit && (approver.sentForReviewOn || approver.reviewedOn || approver.remarks) && (
                <Space direction="vertical" size={0}>
                  {approver.sentForReviewOn && (
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      Sent for review: {dayjs(approver.sentForReviewOn).format('D MMM YYYY')}
                    </Text>
                  )}
                  {approver.reviewedOn && (
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      Reviewed on: {dayjs(approver.reviewedOn).format('D MMM YYYY')}
                    </Text>
                  )}
                  {approver.remarks && (
                    <Text type="secondary" style={{ fontSize: 11 }}>{approver.remarks}</Text>
                  )}
                </Space>
              )}
            </div>
          );
        })}
      </div>

      {saveMutation.isError && (
        <Alert
          type="error"
          message="Failed to save approval"
          description={saveMutation.error instanceof Error ? saveMutation.error.message : undefined}
          showIcon
          closable
          style={{ marginTop: 8 }}
        />
      )}
    </div>
  );
}
