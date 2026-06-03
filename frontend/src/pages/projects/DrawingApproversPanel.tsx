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
  Skeleton,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { CheckCircleOutlined, ClockCircleOutlined, SaveOutlined } from '@ant-design/icons';
import {
  fetchDrawingApprovers,
  updateDrawingApproval,
  type DrawingApproverDto,
} from '@api/activityRecords';

const { Text } = Typography;

interface Props {
  recordId: string;
  canEdit: boolean;
}

interface RowState {
  approvedOn: dayjs.Dayjs | null;
  remarks: string;
  dirty: boolean;
}

export function DrawingApproversPanel({ recordId, canEdit }: Props) {
  const queryClient = useQueryClient();
  const queryKey = ['drawingApprovers', recordId];

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => fetchDrawingApprovers(recordId),
    staleTime: 30_000,
  });

  // Per-row local edit state keyed by approverId
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});

  const saveMutation = useMutation({
    mutationFn: ({ approverId, approvedOn, remarks }: { approverId: string; approvedOn: string | null; remarks: string | null }) =>
      updateDrawingApproval(recordId, approverId, approvedOn, remarks),
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
      approvedOn: approver.approvedOn ? dayjs(approver.approvedOn) : null,
      remarks: approver.remarks ?? '',
      dirty: false,
    };
  }

  function setRow(approverId: string, patch: Partial<RowState>) {
    setRowStates((prev) => {
      const current = prev[approverId] ?? {
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

      {/* Approver rows */}
      <Space direction="vertical" size={6} style={{ width: '100%' }}>
        {data.approvers.map((approver) => {
          const row = getRow(approver);
          const isSaving = saveMutation.isPending && saveMutation.variables?.approverId === approver.id;

          return (
            <div
              key={approver.id}
              style={{
                border: '1px solid var(--ant-color-border)',
                borderRadius: 6,
                padding: '8px 10px',
                background: approver.approvedOn
                  ? 'var(--ant-color-success-bg)'
                  : 'var(--ant-color-bg-container)',
              }}
            >
              {/* Designation name + approved tag */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text strong style={{ fontSize: 12 }}>{approver.designationName}</Text>
                {approver.approvedOn && (
                  <Tag color="green" style={{ margin: 0, fontSize: 11 }}>
                    Approved {dayjs(approver.approvedOn).format('D MMM YYYY')}
                  </Tag>
                )}
              </div>

              {canEdit && (
                <Space size={6} style={{ width: '100%' }} wrap>
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

              {!canEdit && approver.remarks && (
                <Text type="secondary" style={{ fontSize: 11 }}>{approver.remarks}</Text>
              )}
            </div>
          );
        })}
      </Space>

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
