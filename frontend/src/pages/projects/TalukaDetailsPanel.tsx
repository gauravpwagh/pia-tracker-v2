/**
 * Sub division/taluka — master-detail panel for Land Acquisition.
 *
 * Replaces the Records master-detail area (same real estate) when selected,
 * exactly like the Scope panel does today. SRP and CALA gazette details are
 * entered once per taluka here; records reference a taluka by name and fetch
 * these fields read-only (see TalukaSrpCalaPanel in RecordEditPage.tsx).
 *
 * "Save Draft" keeps the taluka editable. "Create" locks it permanently —
 * the backend rejects further PATCH/DELETE once `isFinalized` is true.
 */

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, DatePicker, Empty, Input, Popconfirm, Select, Spin, Tag, Typography } from 'antd';
import { PlusOutlined, DeleteOutlined, LockOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  fetchTalukas,
  createTaluka,
  updateTaluka,
  deleteTaluka,
  type TalukaDetail,
} from '@api/talukaDetails';
import { AttachmentPanel, ACCEPT_DOCUMENTS } from '@components/attachments/AttachmentPanel';
import { fetchAttachments } from '@api/attachments';
import { useAuthStore } from '@stores/authStore';

const { Text } = Typography;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 11, color: 'var(--ant-color-text-secondary)', marginBottom: 3 }}>{label}</div>
      {children}
    </div>
  );
}

function isComplete(t: TalukaDetail): boolean {
  return !!t.srpDeclaredInGazOn && !!t.calaReceivedFromStateOn;
}

type CompletionFilter = 'all' | 'complete' | 'incomplete';

interface TalukaFormState {
  talukaName: string;
  srpDeclaredInGazOn: dayjs.Dayjs | null;
  srpGazettePublishedOn: dayjs.Dayjs | null;
  srpGazetteNumber: string;
  calaReceivedFromStateOn: dayjs.Dayjs | null;
  calaGazettePublishedOn: dayjs.Dayjs | null;
  calaGazetteNumber: string;
}

function toFormState(t: TalukaDetail | null): TalukaFormState {
  return {
    talukaName: t?.talukaName ?? '',
    srpDeclaredInGazOn: t?.srpDeclaredInGazOn ? dayjs(t.srpDeclaredInGazOn) : null,
    srpGazettePublishedOn: t?.srpGazettePublishedOn ? dayjs(t.srpGazettePublishedOn) : null,
    srpGazetteNumber: t?.srpGazetteNumber ?? '',
    calaReceivedFromStateOn: t?.calaReceivedFromStateOn ? dayjs(t.calaReceivedFromStateOn) : null,
    calaGazettePublishedOn: t?.calaGazettePublishedOn ? dayjs(t.calaGazettePublishedOn) : null,
    calaGazetteNumber: t?.calaGazetteNumber ?? '',
  };
}

export function TalukaDetailsPanel({ activityId, canEdit }: { activityId: string; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.currentUser);
  // Same permission gate the activity Scope checklist uses — matching it here avoids
  // showing an upload button the backend will 403 on (ATTACHMENT.UPLOAD.OWN_RECORDS).
  const canUploadDocs = currentUser?.permissions.includes('ATTACHMENT.UPLOAD.OWN_RECORDS') ?? false;

  const { data: talukas, isLoading } = useQuery({
    queryKey: ['talukas', activityId],
    queryFn: () => fetchTalukas(activityId),
  });

  const [selectedId, setSelectedId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<TalukaFormState>(toFormState(null));
  const [search, setSearch] = useState('');
  const [completionFilter, setCompletionFilter] = useState<CompletionFilter>('all');

  const selected = selectedId && selectedId !== 'new' ? talukas?.find((t) => t.id === selectedId) : null;
  const locked = !!selected?.isFinalized;

  // Create is only allowed once every field is filled AND both gazette PDFs are attached.
  const { data: srpAttachments } = useQuery({
    queryKey: ['attachments', 'ACTIVITY_TALUKA__srp_gazette', selected?.id],
    queryFn: () => fetchAttachments('ACTIVITY_TALUKA__srp_gazette', selected!.id),
    enabled: !!selected?.id,
  });
  const { data: calaAttachments } = useQuery({
    queryKey: ['attachments', 'ACTIVITY_TALUKA__cala_gazette', selected?.id],
    queryFn: () => fetchAttachments('ACTIVITY_TALUKA__cala_gazette', selected!.id),
    enabled: !!selected?.id,
  });
  const allFieldsFilled =
    !!form.talukaName.trim() &&
    !!form.srpDeclaredInGazOn && !!form.srpGazettePublishedOn && !!form.srpGazetteNumber.trim() &&
    !!form.calaReceivedFromStateOn && !!form.calaGazettePublishedOn && !!form.calaGazetteNumber.trim();
  const pdfsUploaded = (srpAttachments?.length ?? 0) > 0 && (calaAttachments?.length ?? 0) > 0;
  const createEnabled = allFieldsFilled && pdfsUploaded;

  useEffect(() => {
    if (selectedId === 'new') {
      setForm(toFormState(null));
    } else if (selected) {
      setForm(toFormState(selected));
    }
  }, [selectedId, selected]);

  // Select the first taluka once the list loads, if nothing is selected yet.
  useEffect(() => {
    if (selectedId === null && talukas && talukas.length > 0) {
      setSelectedId(talukas[0].id);
    }
  }, [talukas, selectedId]);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['talukas', activityId] });

  const saveMutation = useMutation({
    mutationFn: async (finalize: boolean) => {
      const payload = {
        talukaName: form.talukaName.trim(),
        srpDeclaredInGazOn: form.srpDeclaredInGazOn ? form.srpDeclaredInGazOn.format('YYYY-MM-DD') : null,
        srpGazettePublishedOn: form.srpGazettePublishedOn ? form.srpGazettePublishedOn.format('YYYY-MM-DD') : null,
        srpGazetteNumber: form.srpGazetteNumber || null,
        calaReceivedFromStateOn: form.calaReceivedFromStateOn ? form.calaReceivedFromStateOn.format('YYYY-MM-DD') : null,
        calaGazettePublishedOn: form.calaGazettePublishedOn ? form.calaGazettePublishedOn.format('YYYY-MM-DD') : null,
        calaGazetteNumber: form.calaGazetteNumber || null,
        finalize,
      };
      if (selectedId === 'new' || !selected) {
        return createTaluka(activityId, payload);
      }
      return updateTaluka(activityId, selected.id, payload, selected.version);
    },
    onSuccess: (saved) => {
      invalidate();
      setSelectedId(saved.id);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTaluka(activityId, id),
    onSuccess: () => {
      invalidate();
      setSelectedId(null);
    },
  });

  const list = talukas ?? [];
  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((t) => {
      if (q && !t.talukaName.toLowerCase().includes(q)) return false;
      if (completionFilter === 'complete' && !isComplete(t)) return false;
      if (completionFilter === 'incomplete' && isComplete(t)) return false;
      return true;
    });
  }, [list, search, completionFilter]);

  if (isLoading) return <Spin style={{ display: 'block', margin: '32px auto' }} />;

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 14, padding: '14px 20px 18px' }}>
      {/* list */}
      <div style={{ width: 360, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>{list.length} taluka{list.length === 1 ? '' : 's'}</Text>
          {canEdit && (
            <Button size="small" icon={<PlusOutlined />} onClick={() => setSelectedId('new')}>Add Sub Division/Taluka</Button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <Input size="small" allowClear placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1 }} />
          <Select
            size="small"
            style={{ width: 150, flexShrink: 0 }}
            value={completionFilter}
            onChange={setCompletionFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'complete', label: 'Complete' },
              { value: 'incomplete', label: 'Incomplete' },
            ]}
          />
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filteredList.length === 0 && selectedId !== 'new' ? (
            <Empty description={list.length === 0 ? 'No talukas yet.' : 'No talukas match the filters.'} style={{ marginTop: 32 }} />
          ) : (
            filteredList.map((t) => {
              const sel = selectedId === t.id;
              return (
                <div key={t.id} onClick={() => setSelectedId(t.id)}
                  style={{
                    padding: '8px 12px', marginBottom: 6, borderRadius: 8, cursor: 'pointer',
                    background: sel ? '#e3effd' : 'var(--ant-color-bg-container)',
                    border: `1px solid ${sel ? 'var(--ant-color-primary)' : 'var(--ant-color-border)'}`,
                    borderLeft: sel ? '5px solid var(--ant-color-primary)' : '1px solid var(--ant-color-border)',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: sel ? 'var(--ant-color-primary)' : undefined }}>
                      {t.talukaName}
                    </span>
                    {t.isFinalized && <LockOutlined style={{ fontSize: 11, color: 'var(--ant-color-text-tertiary)' }} />}
                  </div>
                  <div style={{ display: 'flex', gap: 10, fontSize: 11 }}>
                    <span style={{ color: t.srpDeclaredInGazOn ? 'var(--ant-color-success)' : 'var(--ant-color-error)' }}>
                      SRP: {t.srpDeclaredInGazOn ? 'Done' : 'Missing'}
                    </span>
                    <span style={{ color: t.calaReceivedFromStateOn ? 'var(--ant-color-success)' : 'var(--ant-color-error)' }}>
                      CALA: {t.calaReceivedFromStateOn ? 'Done' : 'Missing'}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* detail */}
      <div style={{ flex: 1, minWidth: 0, border: '1px solid var(--ant-color-border)', borderRadius: 10, background: 'var(--ant-color-bg-container)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {selectedId === null ? (
          <Empty description="Select or add a taluka." style={{ marginTop: 32 }} />
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', flexShrink: 0, borderBottom: '1px solid var(--ant-color-border)' }}>
              <Text strong style={{ fontSize: 13, whiteSpace: 'nowrap' }}>Sub Division/Taluka Name:</Text>
              <Input
                value={form.talukaName}
                disabled={!canEdit || locked}
                onChange={(e) => setForm((f) => ({ ...f, talukaName: e.target.value }))}
                style={{ maxWidth: 320, fontWeight: 600 }}
              />
              {locked && <Tag icon={<LockOutlined />} color="default">Created — locked</Tag>}
              {selected && canEdit && !locked && (
                <Popconfirm
                  title="Delete this taluka?"
                  description={selected.recordCount > 0
                    ? `Still used by ${selected.recordCount} record(s) — reassign them first.`
                    : 'This cannot be undone.'}
                  okButtonProps={{ danger: true, disabled: selected.recordCount > 0 }}
                  onConfirm={() => deleteMutation.mutate(selected.id)}
                >
                  <Button type="text" danger icon={<DeleteOutlined />} style={{ marginLeft: 'auto' }} />
                </Popconfirm>
              )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
              {locked && (
                <Alert type="info" showIcon style={{ marginBottom: 14 }}
                  message="This taluka has been created and is locked — it can no longer be edited or deleted." />
              )}
              <div style={{ border: '1px solid var(--ant-color-border)', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>SRP — survey and reconnaissance</div>
                <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                  <Field label="SRP declared in gazette on">
                    <DatePicker style={{ width: '100%' }} disabled={!canEdit || locked} value={form.srpDeclaredInGazOn}
                      onChange={(v) => setForm((f) => ({ ...f, srpDeclaredInGazOn: v }))} />
                  </Field>
                  <Field label="Gazette published on">
                    <DatePicker style={{ width: '100%' }} disabled={!canEdit || locked} value={form.srpGazettePublishedOn}
                      onChange={(v) => setForm((f) => ({ ...f, srpGazettePublishedOn: v }))} />
                  </Field>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                  <Field label="Gazette number">
                    <Input disabled={!canEdit || locked} value={form.srpGazetteNumber}
                      onChange={(e) => setForm((f) => ({ ...f, srpGazetteNumber: e.target.value }))} />
                  </Field>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--ant-color-text-secondary)', marginBottom: 3 }}>Gazette PDF</div>
                    {selected ? (
                      <AttachmentPanel
                        entityType="ACTIVITY_TALUKA__srp_gazette"
                        entityId={selected.id}
                        canUpload={canUploadDocs && !locked}
                        canDelete={!locked}
                        currentUserId={currentUser?.userId}
                        accept={ACCEPT_DOCUMENTS}
                        uploadLabel="Upload"
                      />
                    ) : (
                      <Text type="secondary" style={{ fontSize: 12 }}>Save the taluka first to attach a PDF.</Text>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ border: '1px solid var(--ant-color-border)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>CALA — certificate of availability of land</div>
                <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                  <Field label="CALA received from state on">
                    <DatePicker style={{ width: '100%' }} disabled={!canEdit || locked} value={form.calaReceivedFromStateOn}
                      onChange={(v) => setForm((f) => ({ ...f, calaReceivedFromStateOn: v }))} />
                  </Field>
                  <Field label="Gazette published on">
                    <DatePicker style={{ width: '100%' }} disabled={!canEdit || locked} value={form.calaGazettePublishedOn}
                      onChange={(v) => setForm((f) => ({ ...f, calaGazettePublishedOn: v }))} />
                  </Field>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                  <Field label="Gazette number">
                    <Input disabled={!canEdit || locked} value={form.calaGazetteNumber}
                      onChange={(e) => setForm((f) => ({ ...f, calaGazetteNumber: e.target.value }))} />
                  </Field>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--ant-color-text-secondary)', marginBottom: 3 }}>Gazette PDF</div>
                    {selected ? (
                      <AttachmentPanel
                        entityType="ACTIVITY_TALUKA__cala_gazette"
                        entityId={selected.id}
                        canUpload={canUploadDocs && !locked}
                        canDelete={!locked}
                        currentUserId={currentUser?.userId}
                        accept={ACCEPT_DOCUMENTS}
                        uploadLabel="Upload"
                      />
                    ) : (
                      <Text type="secondary" style={{ fontSize: 12 }}>Save the taluka first to attach a PDF.</Text>
                    )}
                  </div>
                </div>
              </div>

              {saveMutation.isError && (
                <Text type="danger" style={{ display: 'block', marginTop: 10, fontSize: 12 }}>
                  {saveMutation.error instanceof Error ? saveMutation.error.message : 'Failed to save'}
                </Text>
              )}
            </div>

            {canEdit && !locked && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderTop: '1px solid var(--ant-color-border)', flexShrink: 0 }}>
                {selected && (
                  <Text type="secondary" style={{ fontSize: 11 }}>Used by {selected.recordCount} record{selected.recordCount === 1 ? '' : 's'}</Text>
                )}
                <Button style={{ marginLeft: 'auto' }} loading={saveMutation.isPending}
                  disabled={!form.talukaName.trim()}
                  onClick={() => saveMutation.mutate(false)}>Save Draft</Button>
                <Popconfirm
                  title="Create this taluka?"
                  description="Once created, it's locked — the name, SRP, and CALA details can no longer be edited or deleted."
                  okText="Create"
                  disabled={!createEnabled}
                  onConfirm={() => saveMutation.mutate(true)}
                >
                  <Button type="primary" loading={saveMutation.isPending} disabled={!createEnabled}
                    title={createEnabled ? undefined : 'Fill in all SRP/CALA fields and upload both gazette PDFs first'}>
                    Create
                  </Button>
                </Popconfirm>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
