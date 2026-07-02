/**
 * ProjectCreateWizard — "New Project" modal.
 *
 * Manual fields: Project Name, Project Type (Plan Head), Zone.
 * The Project ID is auto-composed from those fields as:
 *   pia.<zone>.<division>.<planHead>.<year>.<authority>.<executingAgency>.<serial>
 * per the Railway Board Project ID numbering scheme — division and executing
 * agency are fixed at "00" for now, sanctioning authority fixed at "1"
 * (Railway Board), year is the 2-digit current year, and the serial number
 * is fetched from the backend (count of existing projects sharing the same
 * prefix + 1).
 *
 * Create is enabled only once all three manual fields are filled.
 */

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Form, Input, Modal, Select, Space, Typography } from 'antd';
import { CheckOutlined } from '@ant-design/icons';
import {
  createProject,
  fetchNextSerial,
  fetchZones,
  type CreateProjectRequest,
  type ProjectDetailResponse,
} from '@api/projects';
import { useAuthStore } from '@stores/authStore';

const { Text } = Typography;

// ── Constants ─────────────────────────────────────────────────────────────────

// Project type -> Plan Head. Value sent to the backend; label shown to the user.
const PROJECT_TYPES: { value: string; planHead: string; label: string }[] = [
  { value: 'NEW_LINE',         planHead: '11', label: 'PH-11 : New Line' },
  { value: 'GAUGE_CONVERSION', planHead: '14', label: 'PH-14 : Gauge Conversion' },
  { value: 'DOUBLING',         planHead: '15', label: 'PH-15 : Doubling' },
  { value: 'ROAD_OVER_BRIDGE', planHead: '30', label: 'PH-30 : Road Over Bridge' },
  { value: 'ELECTRIFICATION',  planHead: '35', label: 'PH-35 : Electrification' },
];
const PLAN_HEAD_BY_TYPE = Object.fromEntries(PROJECT_TYPES.map((p) => [p.value, p.planHead]));

// Railway zone -> 2-digit numeric zone code (per the Railway Board numbering scheme).
const ZONE_NUMERIC_CODE: Record<string, string> = {
  CR: '01', ER: '02', ECR: '03', ECOR: '04', NR: '05', NCR: '06', NER: '07',
  NFR: '08', NWR: '09', SR: '10', SCR: '11', SER: '12', SECR: '13', SWR: '14',
  WR: '15', WCR: '16', MRK: '17',
};

const DIVISION_CODE = '00';
const SANCTIONING_AUTHORITY = '1'; // Railway Board
const EXECUTING_AGENCY_CODE = '00'; // Not identified, per the numbering scheme
const YEAR_CODE = String(new Date().getFullYear()).slice(-2);

// ── Form values ───────────────────────────────────────────────────────────────

interface FormValues {
  name: string;
  projectType?: string;
  zoneId: string;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ProjectCreateWizardProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (project: ProjectDetailResponse) => void;
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export default function ProjectCreateWizard({
  open,
  onClose,
  onCreated,
}: ProjectCreateWizardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [form] = Form.useForm<FormValues>();
  const currentUser = useAuthStore((s) => s.currentUser);

  const name = Form.useWatch('name', form);
  const projectType = Form.useWatch('projectType', form);
  const zoneId = Form.useWatch('zoneId', form);

  // ── Data ───────────────────────────────────────────────────────────────────

  const zonesQuery = useQuery({
    queryKey: ['zones'],
    queryFn: fetchZones,
    staleTime: 10 * 60 * 1000,
    enabled: open,
  });

  const hasAllZoneAccess = currentUser?.isSuperAdmin
    || (currentUser?.permissions.includes('PROJECT.READ.ALL') ?? false);
  const accessibleZoneIds = hasAllZoneAccess ? null : new Set(currentUser?.accessibleZoneIds ?? []);
  const visibleZones = (zonesQuery.data ?? []).filter(
    (z) => accessibleZoneIds === null || accessibleZoneIds.has(z.id),
  );

  const selectedZone = visibleZones.find((z) => z.id === zoneId);
  const zoneNumeric = selectedZone ? ZONE_NUMERIC_CODE[selectedZone.code] : undefined;
  const planHead = projectType ? PLAN_HEAD_BY_TYPE[projectType] : undefined;

  // Prefix is everything except the trailing serial number.
  const codePrefix = zoneNumeric && planHead
    ? `${zoneNumeric}.${DIVISION_CODE}.${planHead}.${YEAR_CODE}.${SANCTIONING_AUTHORITY}.${EXECUTING_AGENCY_CODE}.`
    : undefined;

  const serialQuery = useQuery({
    queryKey: ['next-serial', codePrefix],
    queryFn: () => fetchNextSerial(codePrefix!),
    enabled: open && !!codePrefix,
  });

  const projectCode = useMemo(() => {
    if (!codePrefix) return undefined;
    const serial = serialQuery.data ?? '···';
    return `pia.${codePrefix}${serial}`;
  }, [codePrefix, serialQuery.data]);

  const canCreate = !!name?.trim() && !!projectType && !!zoneId;

  // ── Mutation ───────────────────────────────────────────────────────────────

  const mutation = useMutation({
    mutationFn: createProject,
    onSuccess: (project) => {
      onCreated?.(project);
      handleReset();
      if (project.projectCode) {
        navigate(`/projects/${project.projectCode}`);
      }
      onClose();
    },
  });

  const handleReset = () => {
    form.resetFields();
  };

  const handleClose = () => {
    if (!mutation.isPending) {
      handleReset();
      onClose();
    }
  };

  const handleSubmit = async () => {
    if (!canCreate || !projectCode || serialQuery.isLoading) return;
    const request: CreateProjectRequest = {
      name: name.trim(),
      zoneId,
      projectType,
      projectCode,
    };
    mutation.mutate(request);
  };

  return (
    <Modal
      title={t('projects.wizard.title', 'New Project')}
      open={open}
      onCancel={handleClose}
      width={520}
      destroyOnClose
      footer={
        <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
          <Button onClick={handleClose} disabled={mutation.isPending}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            type="primary"
            icon={<CheckOutlined />}
            disabled={!canCreate || serialQuery.isLoading}
            loading={mutation.isPending}
            onClick={handleSubmit}
          >
            {t('wizard.submit', 'Create Project')}
          </Button>
        </Space>
      }
    >
      {mutation.isError && (
        <Alert
          type="error"
          message={t('projects.wizard.error', 'Failed to create project')}
          description={mutation.error instanceof Error ? mutation.error.message : undefined}
          style={{ marginBottom: 16 }}
          showIcon
          closable
        />
      )}

      <div style={{ marginBottom: 16 }}>
        <Text style={{ fontSize: 12, fontWeight: 600, color: 'var(--ant-color-text-secondary)' }}>
          {t('wizard.step1.codeLabel', 'Project ID')}
        </Text>
        <div style={{
          marginTop: 4,
          padding: '8px 12px',
          borderRadius: 6,
          background: 'var(--ant-color-bg-layout)',
          border: '1px dashed var(--ant-color-border)',
          fontFamily: 'monospace',
          fontSize: 14,
          color: projectCode ? 'var(--ant-color-text)' : 'var(--ant-color-text-tertiary)',
        }}>
          {projectCode ?? t('wizard.step1.codePending', 'Select project type and zone to generate the Project ID')}
        </div>
      </div>

      <Form form={form} layout="vertical" requiredMark>
        <Form.Item
          name="name"
          label={t('wizard.step1.nameLabel', 'Project name')}
          rules={[
            { required: true, message: t('wizard.step1.nameRequired', 'Project name is required') },
            { max: 256, message: t('wizard.step1.nameTooLong', 'Must be 256 characters or fewer') },
          ]}
        >
          <Input placeholder={t('wizard.step1.namePlaceholder', 'e.g. Doubling of Bina–Katni section')} />
        </Form.Item>

        <Form.Item
          name="projectType"
          label={t('wizard.step1.typeLabel', 'Project type')}
          rules={[{ required: true, message: t('wizard.step1.typeRequired', 'Project type is required') }]}
        >
          <Select
            placeholder={t('wizard.step1.typePlaceholder', 'Select type')}
            options={PROJECT_TYPES.map(({ value, label }) => ({ value, label }))}
          />
        </Form.Item>

        <Form.Item
          name="zoneId"
          label={t('wizard.step1.zoneLabel', 'Zone')}
          rules={[{ required: true, message: t('wizard.step1.zoneRequired', 'Zone is required') }]}
        >
          <Select
            placeholder={t('wizard.step1.zonePlaceholder', 'Select a zone')}
            loading={zonesQuery.isLoading}
            showSearch
            optionFilterProp="label"
            options={visibleZones.map((z) => ({
              value: z.id,
              label: `${z.shortName} — ${z.name}`,
            }))}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
