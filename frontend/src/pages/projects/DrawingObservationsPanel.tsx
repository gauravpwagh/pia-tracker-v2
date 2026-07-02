/**
 * DrawingObservationsPanel — per-drawing observation log.
 *
 * Observations are stored as a JSON array in dataJson.observations.
 * Each observation: { id, approver, observation, observation_date,
 *                     submitted_date, pending, created_at }
 *
 * The approver dropdown is scoped to the designations relevant to the
 * record's drawing type (passed as a prop).
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  Alert,
  Button,
  DatePicker,
  Descriptions,
  Divider,
  Form,
  Input,
  Modal,
  Select,
  Skeleton,
  Space,
  Tag,
  Typography,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { fetchDrawingApprovers, patchRecord } from '@api/activityRecords';

const { Text } = Typography;

export interface DrawingObservation {
  id: string;
  approver: string;
  observation: string;
  observation_date: string | null;
  submitted_date: string | null;
  pending: boolean;
  created_at: string;
}

interface Props {
  recordId: string;
  observations: DrawingObservation[];
  canEdit: boolean;
}

const EMPTY_FORM = {
  approver: undefined as string | undefined,
  observation: '',
  observation_date: null as dayjs.Dayjs | null,
  submitted_date: null as dayjs.Dayjs | null,
  pending: true,
};

function pendingDays(submittedDate: string | null): number | null {
  if (!submittedDate) return null;
  return dayjs().diff(dayjs(submittedDate), 'day');
}

export function DrawingObservationsPanel({ recordId, observations, canEdit }: Props) {
  const queryClient = useQueryClient();

  const approversQuery = useQuery({
    queryKey: ['drawingApprovers', recordId],
    queryFn: () => fetchDrawingApprovers(recordId),
    staleTime: 60_000,
  });
  const approverOptions = (approversQuery.data?.approvers ?? []).map((a) => ({
    value: a.approvalDesignationCode,
    label: a.designationName,
  }));
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const saveMutation = useMutation({
    mutationFn: (newObs: DrawingObservation[]) =>
      patchRecord(recordId, { observations: newObs }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['record', recordId] });
      setModalOpen(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
    },
  });

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(obs: DrawingObservation) {
    setEditingId(obs.id);
    setForm({
      approver: obs.approver,
      observation: obs.observation,
      observation_date: obs.observation_date ? dayjs(obs.observation_date) : null,
      submitted_date: obs.submitted_date ? dayjs(obs.submitted_date) : null,
      pending: obs.pending,
    });
    setModalOpen(true);
  }

  function handleSave() {
    const now = new Date().toISOString();
    if (editingId) {
      saveMutation.mutate(
        observations.map((o) =>
          o.id === editingId
            ? {
                ...o,
                approver: form.approver ?? '',
                observation: form.observation,
                observation_date: form.observation_date?.format('YYYY-MM-DD') ?? null,
                submitted_date: form.submitted_date?.format('YYYY-MM-DD') ?? null,
                pending: form.pending,
              }
            : o
        )
      );
    } else {
      const newObs: DrawingObservation = {
        id: crypto.randomUUID(),
        approver: form.approver ?? '',
        observation: form.observation,
        observation_date: form.observation_date?.format('YYYY-MM-DD') ?? null,
        submitted_date: form.submitted_date?.format('YYYY-MM-DD') ?? null,
        pending: form.pending,
        created_at: now,
      };
      saveMutation.mutate([...observations, newObs]);
    }
  }

  function handleDelete(id: string) {
    saveMutation.mutate(observations.filter((o) => o.id !== id));
  }

  const approverLabel = (code: string) =>
    approverOptions.find((o) => o.value === code)?.label ?? code;

  if (approversQuery.isLoading) return <Skeleton active paragraph={{ rows: 1 }} />;

  return (
    <div>
      {/* Section heading + Add button on one full-width row (the button sits
          beside the title, not below the list). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
        <Divider
          orientation="left"
          orientationMargin={0}
          style={{ flex: '1 1 auto', minWidth: 0, margin: '0 0 8px', fontSize: 11, fontWeight: 600, color: 'var(--ant-color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}
        >
          Queries from Approving Authority
        </Divider>
        {canEdit && (
          <Button size="small" icon={<PlusOutlined />} onClick={openAdd} style={{ flexShrink: 0 }}>
            Add
          </Button>
        )}
      </div>
      {observations.length === 0 ? (
        <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic' }}>
          No observations recorded yet.
        </Text>
      ) : (
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          {observations.map((obs) => {
            const days = obs.pending ? pendingDays(obs.submitted_date) : null;
            return (
              <div
                key={obs.id}
                style={{
                  border: '1px solid var(--ant-color-border)',
                  borderRadius: 6,
                  padding: '8px 10px',
                  background: obs.pending
                    ? 'var(--ant-color-warning-bg)'
                    : 'var(--ant-color-success-bg)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <Descriptions size="small" column={1} style={{ marginBottom: 0 }}>
                      <Descriptions.Item label="Approver" style={{ paddingBottom: 2 }}>
                        <Text strong style={{ fontSize: 12 }}>{approverLabel(obs.approver)}</Text>
                      </Descriptions.Item>
                      <Descriptions.Item label="Observation" style={{ paddingBottom: 2 }}>
                        <Text style={{ fontSize: 12 }}>{obs.observation}</Text>
                      </Descriptions.Item>
                      {obs.observation_date && (
                        <Descriptions.Item label="Observation Date" style={{ paddingBottom: 2 }}>
                          <Text style={{ fontSize: 12 }}>{dayjs(obs.observation_date).format('D MMM YYYY')}</Text>
                        </Descriptions.Item>
                      )}
                      {obs.submitted_date && (
                        <Descriptions.Item label="Submitted Date" style={{ paddingBottom: 2 }}>
                          <Text style={{ fontSize: 12 }}>{dayjs(obs.submitted_date).format('D MMM YYYY')}</Text>
                        </Descriptions.Item>
                      )}
                      <Descriptions.Item label="Pending" style={{ paddingBottom: 2 }}>
                        {obs.pending ? (
                          <Space size={4}>
                            <Tag color="orange" style={{ margin: 0 }}>Yes</Tag>
                            {days !== null && (
                              <Text type="secondary" style={{ fontSize: 11 }}>
                                {days} day{days !== 1 ? 's' : ''} since submitted
                              </Text>
                            )}
                          </Space>
                        ) : (
                          <Tag color="green" style={{ margin: 0 }}>No</Tag>
                        )}
                      </Descriptions.Item>
                    </Descriptions>
                  </div>
                  {canEdit && (
                    <Space size={4} style={{ flexShrink: 0, marginLeft: 8 }}>
                      <Button
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => openEdit(obs)}
                      />
                      <Button
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        loading={saveMutation.isPending}
                        onClick={() => handleDelete(obs.id)}
                      />
                    </Space>
                  )}
                </div>
              </div>
            );
          })}
        </Space>
      )}

      <Modal
        title={editingId ? 'Edit Observation' : 'Add Observation'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setForm(EMPTY_FORM); }}
        onOk={handleSave}
        okText={editingId ? 'Update' : 'Add'}
        okButtonProps={{
          disabled: !form.approver || !form.observation.trim(),
          loading: saveMutation.isPending,
        }}
        destroyOnClose
      >
        <Form layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item label="Approver" required>
            <Select
              options={approverOptions}
              value={form.approver}
              onChange={(v) => setForm((f) => ({ ...f, approver: v }))}
              placeholder="Select approver"
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item label="Observation" required>
            <Input.TextArea
              rows={3}
              value={form.observation}
              onChange={(e) => setForm((f) => ({ ...f, observation: e.target.value }))}
              placeholder="Describe the observation"
            />
          </Form.Item>
          <Form.Item label="Observation Date">
            <DatePicker
              style={{ width: '100%' }}
              format="D MMM YYYY"
              value={form.observation_date}
              onChange={(v) => setForm((f) => ({ ...f, observation_date: v }))}
            />
          </Form.Item>
          <Form.Item label="Observation Submitted Date">
            <DatePicker
              style={{ width: '100%' }}
              format="D MMM YYYY"
              value={form.submitted_date}
              onChange={(v) => setForm((f) => ({ ...f, submitted_date: v }))}
            />
          </Form.Item>
          <Form.Item label="Observation Pending">
            <Select
              value={form.pending}
              onChange={(v) => setForm((f) => ({ ...f, pending: v }))}
              options={[
                { value: true,  label: 'Yes' },
                { value: false, label: 'No'  },
              ]}
            />
          </Form.Item>
        </Form>
        {saveMutation.isError && (
          <Alert
            type="error"
            message="Failed to save observation"
            showIcon
            style={{ marginTop: 8 }}
          />
        )}
      </Modal>
    </div>
  );
}
