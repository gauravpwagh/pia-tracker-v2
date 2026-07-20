/**
 * ArbitrationHearingsPanel — Land Acquisition "Arbitration" section.
 *
 * A case can go through multiple hearings before it's finalized. Hearings are
 * stored as a JSON array in dataJson.arbitration_hearings (one entry per
 * hearing), the same repeat-a-block pattern as DrawingObservationsPanel. The
 * add/edit form is inline (not a modal). The first hearing's form opens
 * automatically since a record always needs at least one; answering "No" to
 * "case finalized on 1st hearing?" and saving opens the next hearing's form
 * automatically too, rather than making the user click "Add Hearing" again.
 *
 * Each hearing's four PDF attachments are scoped by the hearing's own id
 * (ACTIVITY_RECORD__arbitration_hearing__{hearingId}__{field}), so a new,
 * not-yet-saved hearing gets a client-generated id up front purely so its
 * attachment fields have somewhere stable to upload to before "Save".
 */

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  Alert,
  Button,
  DatePicker,
  Descriptions,
  Divider,
  Form,
  Input,
  InputNumber,
  Space,
  Switch,
  Tag,
  Typography,
} from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { AttachmentPanel } from '@components/attachments/AttachmentPanel';
import { patchRecord } from '@api/activityRecords';

const { Text } = Typography;

export interface ArbitrationHearing {
  id: string;
  gat_number: string;
  acquired_area_affected: number | null;
  land_owner_name: string;
  arbitrator_name: string;
  fees_demand_date: string | null;
  fees_demand_amount: number | null;
  fees_paid_date: string | null;
  arbitration_case_no: string;
  date_of_hearing: string | null;
  case_finalized_on_first_hearing: boolean | null;
  more_compensation_to_be_paid: boolean | null;
  extra_compensation_amount: number | null;
  created_at: string;
}

interface Props {
  recordId: string;
  /** Full current record.dataJson — merged with the updated hearings array
   * before saving (patchRecord replaces the whole dataJson, it does not
   * merge server-side). */
  recordData: Record<string, unknown>;
  hearings: ArbitrationHearing[];
  canEdit: boolean;
}

type FormState = Omit<ArbitrationHearing, 'created_at'> & {
  fees_demand_date_d: dayjs.Dayjs | null;
  fees_paid_date_d: dayjs.Dayjs | null;
  date_of_hearing_d: dayjs.Dayjs | null;
};

function emptyForm(id: string): FormState {
  return {
    id,
    gat_number: '',
    acquired_area_affected: null,
    land_owner_name: '',
    arbitrator_name: '',
    fees_demand_date: null,
    fees_demand_date_d: null,
    fees_demand_amount: null,
    fees_paid_date: null,
    fees_paid_date_d: null,
    arbitration_case_no: '',
    date_of_hearing: null,
    date_of_hearing_d: null,
    case_finalized_on_first_hearing: false,
    more_compensation_to_be_paid: false,
    extra_compensation_amount: null,
  };
}

function entityTypeFor(hearingId: string, field: string) {
  return `ACTIVITY_RECORD__arbitration_hearing__${hearingId}__${field}`;
}

export function ArbitrationHearingsPanel({ recordId, recordData, hearings, canEdit }: Props) {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(crypto.randomUUID()));
  const autoOpenedRef = useRef(false);

  const saveMutation = useMutation({
    mutationFn: (newHearings: ArbitrationHearing[]) =>
      patchRecord(recordId, { ...recordData, arbitration_hearings: newHearings }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['record', recordId] });
      setFormOpen(false);
      setEditingId(null);
    },
  });

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm(crypto.randomUUID()));
    setFormOpen(true);
  }

  // First time this record has no hearings yet, open the "Add Hearing" form
  // automatically instead of making the user click the button — there is
  // always at least one hearing to fill in.
  useEffect(() => {
    if (!autoOpenedRef.current && canEdit && hearings.length === 0) {
      autoOpenedRef.current = true;
      openAdd();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, hearings.length]);

  function openEdit(h: ArbitrationHearing) {
    setEditingId(h.id);
    setForm({
      ...h,
      case_finalized_on_first_hearing: h.case_finalized_on_first_hearing ?? false,
      more_compensation_to_be_paid: h.more_compensation_to_be_paid ?? false,
      fees_demand_date_d: h.fees_demand_date ? dayjs(h.fees_demand_date) : null,
      fees_paid_date_d: h.fees_paid_date ? dayjs(h.fees_paid_date) : null,
      date_of_hearing_d: h.date_of_hearing ? dayjs(h.date_of_hearing) : null,
    });
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
  }

  function handleSave() {
    const now = new Date().toISOString();
    const built: ArbitrationHearing = {
      id: form.id,
      gat_number: form.gat_number,
      acquired_area_affected: form.acquired_area_affected,
      land_owner_name: form.land_owner_name,
      arbitrator_name: form.arbitrator_name,
      fees_demand_date: form.fees_demand_date_d?.format('YYYY-MM-DD') ?? null,
      fees_demand_amount: form.fees_demand_amount,
      fees_paid_date: form.fees_paid_date_d?.format('YYYY-MM-DD') ?? null,
      arbitration_case_no: form.arbitration_case_no,
      date_of_hearing: form.date_of_hearing_d?.format('YYYY-MM-DD') ?? null,
      case_finalized_on_first_hearing: form.case_finalized_on_first_hearing,
      more_compensation_to_be_paid:
        form.case_finalized_on_first_hearing === true ? form.more_compensation_to_be_paid : false,
      extra_compensation_amount:
        form.case_finalized_on_first_hearing === true && form.more_compensation_to_be_paid === true
          ? form.extra_compensation_amount
          : null,
      created_at: editingId ? (hearings.find((h) => h.id === editingId)?.created_at ?? now) : now,
    };
    const newHearings = editingId
      ? hearings.map((h) => (h.id === editingId ? built : h))
      : [...hearings, built];
    // Case not finalized on a freshly-added hearing → the next hearing is
    // needed, so open its form automatically instead of making the user
    // click "Add Hearing" again. Only for the add flow, not when editing an
    // older hearing (that could spawn a duplicate follow-up hearing).
    const openNextHearing = !editingId && built.case_finalized_on_first_hearing === false;
    saveMutation.mutate(newHearings, {
      onSuccess: () => {
        if (openNextHearing) openAdd();
      },
    });
  }

  function handleDelete(id: string) {
    saveMutation.mutate(hearings.filter((h) => h.id !== id));
  }

  // 1-based position of the hearing currently open in the form, purely for
  // display ("Hearing 2") — editing an existing hearing keeps its original
  // position; adding a new one is always the next position in the list.
  const editIndex = editingId ? hearings.findIndex((h) => h.id === editingId) : -1;
  const activeHearingNumber = editIndex >= 0 ? editIndex + 1 : hearings.length + 1;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
        <Divider
          orientation="left"
          orientationMargin={0}
          style={{ flex: '1 1 auto', minWidth: 0, margin: '0 0 8px', fontSize: 11, fontWeight: 600, color: 'var(--ant-color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}
        >
          Arbitration Hearings
        </Divider>
        {canEdit && !formOpen && (
          <Button size="small" icon={<PlusOutlined />} onClick={openAdd} style={{ flexShrink: 0 }}>
            Add Hearing
          </Button>
        )}
      </div>

      {formOpen && (
        <div
          style={{
            border: '1px solid var(--ant-color-border)',
            borderRadius: 6,
            padding: '12px 12px 4px',
            marginBottom: 8,
            background: 'var(--ant-color-fill-alter)',
          }}
        >
          <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
            {editingId ? `Edit Hearing ${activeHearingNumber}` : `Add Hearing ${activeHearingNumber}`}
          </Text>
          <Form layout="vertical">
            <div style={{ display: 'flex', gap: 12, width: '100%' }}>
              <Form.Item label="Gat Number" style={{ flex: 1 }}>
                <Input value={form.gat_number} onChange={(e) => setForm((f) => ({ ...f, gat_number: e.target.value }))} />
              </Form.Item>
              <Form.Item label="Acquired Area Affected (ha)" style={{ flex: 1 }}>
                <InputNumber
                  style={{ width: '100%' }}
                  min={0}
                  value={form.acquired_area_affected}
                  onChange={(v) => setForm((f) => ({ ...f, acquired_area_affected: v }))}
                />
              </Form.Item>
            </div>
            <div style={{ display: 'flex', gap: 12, width: '100%' }}>
              <Form.Item label="Name of Person / Land Owner" style={{ flex: 1 }}>
                <Input value={form.land_owner_name} onChange={(e) => setForm((f) => ({ ...f, land_owner_name: e.target.value }))} />
              </Form.Item>
              <Form.Item label="Name of Arbitrator" style={{ flex: 1 }}>
                <Input value={form.arbitrator_name} onChange={(e) => setForm((f) => ({ ...f, arbitrator_name: e.target.value }))} />
              </Form.Item>
            </div>

            <Divider orientation="left" orientationMargin={0} style={{ fontSize: 11, margin: '4px 0 8px' }}>Fees Demanded by Arbitrator</Divider>
            <div style={{ display: 'flex', gap: 12, width: '100%' }}>
              <Form.Item label="Date" style={{ flex: 1 }}>
                <DatePicker
                  style={{ width: '100%' }}
                  format="D MMM YYYY"
                  value={form.fees_demand_date_d}
                  onChange={(v) => setForm((f) => ({ ...f, fees_demand_date_d: v }))}
                />
              </Form.Item>
              <Form.Item label="Amount" style={{ flex: 1 }}>
                <InputNumber
                  style={{ width: '100%' }}
                  min={0}
                  value={form.fees_demand_amount}
                  onChange={(v) => setForm((f) => ({ ...f, fees_demand_amount: v }))}
                />
              </Form.Item>
            </div>
            <Form.Item label="Fees Demand PDF">
              <AttachmentPanel
                entityType={entityTypeFor(form.id, 'fees_demand_pdf')}
                entityId={recordId}
                accept="application/pdf"
                canUpload
                canDelete
              />
            </Form.Item>

            <Divider orientation="left" orientationMargin={0} style={{ fontSize: 11, margin: '4px 0 8px' }}>Fees Paid to Arbitrator</Divider>
            <Form.Item label="Date">
              <DatePicker
                style={{ width: '100%' }}
                format="D MMM YYYY"
                value={form.fees_paid_date_d}
                onChange={(v) => setForm((f) => ({ ...f, fees_paid_date_d: v }))}
              />
            </Form.Item>
            <Form.Item label="Fees Paid PDF">
              <AttachmentPanel
                entityType={entityTypeFor(form.id, 'fees_paid_pdf')}
                entityId={recordId}
                accept="application/pdf"
                canUpload
                canDelete
              />
            </Form.Item>

            <Divider orientation="left" orientationMargin={0} style={{ fontSize: 11, margin: '4px 0 8px' }}>Hearing</Divider>
            <div style={{ display: 'flex', gap: 12, width: '100%' }}>
              <Form.Item label="Arbitration Case No." style={{ flex: 1 }}>
                <Input value={form.arbitration_case_no} onChange={(e) => setForm((f) => ({ ...f, arbitration_case_no: e.target.value }))} />
              </Form.Item>
              <Form.Item label="Date of Hearing" style={{ flex: 1 }}>
                <DatePicker
                  style={{ width: '100%' }}
                  format="D MMM YYYY"
                  value={form.date_of_hearing_d}
                  onChange={(v) => setForm((f) => ({ ...f, date_of_hearing_d: v }))}
                />
              </Form.Item>
            </div>
            <Form.Item label="Discussion of Case Minutes (PDF)">
              <AttachmentPanel
                entityType={entityTypeFor(form.id, 'discussion_minutes_pdf')}
                entityId={recordId}
                accept="application/pdf"
                canUpload
                canDelete
              />
            </Form.Item>
            <Form.Item label="Decision Copy of Arbitrator (PDF)">
              <AttachmentPanel
                entityType={entityTypeFor(form.id, 'decision_copy_pdf')}
                entityId={recordId}
                accept="application/pdf"
                canUpload
                canDelete
              />
            </Form.Item>

            <Form.Item label="Whether case finalized at this hearing?">
              <Switch
                checked={form.case_finalized_on_first_hearing === true}
                checkedChildren="Yes"
                unCheckedChildren="No"
                onChange={(checked) =>
                  setForm((f) => ({
                    ...f,
                    case_finalized_on_first_hearing: checked,
                    more_compensation_to_be_paid: checked ? f.more_compensation_to_be_paid : false,
                    extra_compensation_amount: checked ? f.extra_compensation_amount : null,
                  }))
                }
              />
            </Form.Item>

            {form.case_finalized_on_first_hearing === true && (
              <>
                <Form.Item label="Whether more compensation to be paid?">
                  <Switch
                    checked={form.more_compensation_to_be_paid === true}
                    checkedChildren="Yes"
                    unCheckedChildren="No"
                    onChange={(checked) =>
                      setForm((f) => ({
                        ...f,
                        more_compensation_to_be_paid: checked,
                        extra_compensation_amount: checked ? f.extra_compensation_amount : null,
                      }))
                    }
                  />
                </Form.Item>
                {form.more_compensation_to_be_paid === true && (
                  <Form.Item label="Amount of Extra Compensation">
                    <InputNumber
                      style={{ width: '100%' }}
                      min={0}
                      value={form.extra_compensation_amount}
                      onChange={(v) => setForm((f) => ({ ...f, extra_compensation_amount: v }))}
                    />
                  </Form.Item>
                )}
              </>
            )}

            {form.case_finalized_on_first_hearing === false && (
              <Alert
                type="info"
                showIcon
                message="Case not finalized"
                description={
                  editingId
                    ? 'Save this hearing, then click "Add Hearing" to record the next hearing date.'
                    : 'The next hearing will be added automatically after you save this one.'
                }
                style={{ marginBottom: 12 }}
              />
            )}
          </Form>
          {saveMutation.isError && (
            <Alert type="error" message="Failed to save hearing" showIcon style={{ marginBottom: 12 }} />
          )}
          <Space style={{ marginBottom: 12 }}>
            <Button type="primary" onClick={handleSave} loading={saveMutation.isPending}>
              {editingId ? 'Update' : 'Add'}
            </Button>
            <Button onClick={closeForm}>Cancel</Button>
          </Space>
        </div>
      )}

      {hearings.length === 0 ? (
        <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic' }}>
          No arbitration hearings recorded yet.
        </Text>
      ) : (
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          {hearings.map((h, idx) => {
            const hearingNumber = idx + 1;
            return (
            <div
              key={h.id}
              style={{
                border: '1px solid var(--ant-color-border)',
                borderRadius: 6,
                padding: '8px 10px',
                background: h.case_finalized_on_first_hearing
                  ? 'var(--ant-color-success-bg)'
                  : 'var(--ant-color-warning-bg)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <Space size={6} wrap style={{ marginBottom: 4 }}>
                    <Text strong style={{ fontSize: 12 }}>
                      {`Hearing ${hearingNumber}`}
                      {h.date_of_hearing ? ` — ${dayjs(h.date_of_hearing).format('D MMM YYYY')}` : ''}
                    </Text>
                    {h.case_finalized_on_first_hearing === true ? (
                      <Tag color="green" style={{ margin: 0 }}>Finalized</Tag>
                    ) : h.case_finalized_on_first_hearing === false ? (
                      <Tag color="orange" style={{ margin: 0 }}>Not finalized — next hearing pending</Tag>
                    ) : null}
                  </Space>
                  <Descriptions size="small" column={2} style={{ marginBottom: 0 }}>
                    <Descriptions.Item label="Gat Number">{h.gat_number || '—'}</Descriptions.Item>
                    <Descriptions.Item label="Acquired Area Affected">{h.acquired_area_affected ?? '—'}</Descriptions.Item>
                    <Descriptions.Item label="Land Owner">{h.land_owner_name || '—'}</Descriptions.Item>
                    <Descriptions.Item label="Arbitrator">{h.arbitrator_name || '—'}</Descriptions.Item>
                    <Descriptions.Item label="Fees Demanded">
                      {h.fees_demand_amount != null || h.fees_demand_date
                        ? `${h.fees_demand_amount ?? '—'}${h.fees_demand_date ? ` on ${dayjs(h.fees_demand_date).format('D MMM YYYY')}` : ''}`
                        : '—'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Fees Paid">
                      {h.fees_paid_date ? dayjs(h.fees_paid_date).format('D MMM YYYY') : '—'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Case No.">{h.arbitration_case_no || '—'}</Descriptions.Item>
                    {h.case_finalized_on_first_hearing === true && (
                      <Descriptions.Item label="More Compensation?">
                        {h.more_compensation_to_be_paid === true
                          ? `Yes — ${h.extra_compensation_amount ?? '—'}`
                          : h.more_compensation_to_be_paid === false
                            ? 'No'
                            : '—'}
                      </Descriptions.Item>
                    )}
                  </Descriptions>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: 16,
                      marginTop: 6,
                    }}
                  >
                    <div>
                      <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Fees Demand PDF</Text>
                      <AttachmentPanel
                        entityType={entityTypeFor(h.id, 'fees_demand_pdf')}
                        entityId={recordId}
                        accept="application/pdf"
                        canUpload={canEdit}
                        canDelete={canEdit}
                      />
                    </div>
                    <div>
                      <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Fees Paid PDF</Text>
                      <AttachmentPanel
                        entityType={entityTypeFor(h.id, 'fees_paid_pdf')}
                        entityId={recordId}
                        accept="application/pdf"
                        canUpload={canEdit}
                        canDelete={canEdit}
                      />
                    </div>
                    <div>
                      <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Discussion of Case Minutes</Text>
                      <AttachmentPanel
                        entityType={entityTypeFor(h.id, 'discussion_minutes_pdf')}
                        entityId={recordId}
                        accept="application/pdf"
                        canUpload={canEdit}
                        canDelete={canEdit}
                      />
                    </div>
                    <div>
                      <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Decision Copy of Arbitrator</Text>
                      <AttachmentPanel
                        entityType={entityTypeFor(h.id, 'decision_copy_pdf')}
                        entityId={recordId}
                        accept="application/pdf"
                        canUpload={canEdit}
                        canDelete={canEdit}
                      />
                    </div>
                  </div>
                </div>
                {canEdit && !formOpen && (
                  <Space size={4} style={{ flexShrink: 0, marginLeft: 8 }}>
                    <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(h)} />
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      loading={saveMutation.isPending}
                      onClick={() => handleDelete(h.id)}
                    />
                  </Space>
                )}
              </div>
            </div>
            );
          })}
        </Space>
      )}

    </div>
  );
}
