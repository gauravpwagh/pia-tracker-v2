/**
 * ProjectCreateWizard — 3-step wizard for creating a new project.
 *
 * Step 1 — Identity: name, projectCode, projectType, zone, division, targetCompletionYear
 * Step 2 — Scope:    chainageFromKm, chainageToKm, lengthKm
 * Step 3 — Documents: placeholder (Phase 2 attachment upload)
 *
 * Navigates back to /projects on success; calls onCreated with the new project ID.
 * Can be rendered inline (Modal wrapper) or as a routed page (/projects/new).
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Button,
  DatePicker,
  Divider,
  Form,
  InputNumber,
  Modal,
  Select,
  Space,
  Steps,
  Typography,
  Input,
} from 'antd';
import { ArrowLeftOutlined, ArrowRightOutlined, CheckOutlined, InboxOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import {
  createProject,
  fetchDivisions,
  fetchZones,
  type CreateProjectRequest,
  type ProjectDetailResponse,
} from '@api/projects';
import { useAuthStore } from '@stores/authStore';

const { Text } = Typography;

// ── Constants ─────────────────────────────────────────────────────────────────

const PROJECT_TYPES = [
  { value: 'NEW_LINE', label: 'New Line' },
  { value: 'DOUBLING', label: 'Doubling' },
  { value: 'GAUGE_CONVERSION', label: 'Gauge Conversion' },
  { value: 'ELECTRIFICATION', label: 'Electrification' },
  { value: 'ROAD_OVER_BRIDGE', label: 'Road Over Bridge' },
  { value: 'OTHER', label: 'Other' },
];

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 20 }, (_, i) => ({
  value: CURRENT_YEAR + i,
  label: String(CURRENT_YEAR + i),
}));

// ── Step 1 form values ────────────────────────────────────────────────────────

interface Step1Values {
  name: string;
  projectCode?: string;
  projectType?: string;
  zoneId: string;
  divisionId?: string;
  ipaDate?: Dayjs;
  targetCompletionYear?: number;
}

// ── Step 2 form values ────────────────────────────────────────────────────────

interface Step2Values {
  chainageFromKm?: number;
  chainageToKm?: number;
  lengthKm?: number;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ProjectCreateWizardProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (project: ProjectDetailResponse) => void;
}

// ── Wizard ────────────────────────────────────────────────────────────────────

export default function ProjectCreateWizard({
  open,
  onClose,
  onCreated,
}: ProjectCreateWizardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [step1Values, setStep1Values] = useState<Step1Values | null>(null);
  const [step2Values, setStep2Values] = useState<Step2Values | null>(null);
  const [form1] = Form.useForm<Step1Values>();
  const [form2] = Form.useForm<Step2Values>();

  const selectedZoneId = Form.useWatch('zoneId', form1);
  const currentUser = useAuthStore((s) => s.currentUser);

  // ── Data ───────────────────────────────────────────────────────────────────

  const zonesQuery = useQuery({
    queryKey: ['zones'],
    queryFn: fetchZones,
    staleTime: 10 * 60 * 1000,
    enabled: open,
  });

  // Super admin and board-level roles (EDGS/CI) with PROJECT.READ.ALL see all zones.
  const hasAllZoneAccess = currentUser?.isSuperAdmin
    || (currentUser?.permissions.includes('PROJECT.READ.ALL') ?? false);
  const accessibleZoneIds = hasAllZoneAccess ? null : new Set(currentUser?.accessibleZoneIds ?? []);
  const visibleZones = (zonesQuery.data ?? []).filter(
    (z) => accessibleZoneIds === null || accessibleZoneIds.has(z.id),
  );

  const divisionsQuery = useQuery({
    queryKey: ['divisions', selectedZoneId],
    queryFn: () => fetchDivisions(selectedZoneId),
    staleTime: 5 * 60 * 1000,
    enabled: open && !!selectedZoneId,
  });

  // ── Mutation ───────────────────────────────────────────────────────────────

  const mutation = useMutation({
    mutationFn: createProject,
    onSuccess: (project) => {
      onCreated?.(project);
      handleReset();
      // Navigate to the new project in the tree
      if (project.projectCode) {
        navigate(`/projects/${project.projectCode}`);
      }
      onClose();
    },
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  const handleReset = () => {
    setCurrentStep(0);
    setStep1Values(null);
    setStep2Values(null);
    form1.resetFields();
    form2.resetFields();
  };

  const handleClose = () => {
    if (!mutation.isPending) {
      handleReset();
      onClose();
    }
  };

  const handleNext = async () => {
    if (currentStep === 0) {
      try {
        const values = await form1.validateFields();
        setStep1Values(values);
        setCurrentStep(1);
      } catch {
        // validation errors shown inline
      }
    } else if (currentStep === 1) {
      const values = form2.getFieldsValue();
      setStep2Values(values);
      setCurrentStep(2);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  const handleSubmit = async () => {
    if (!step1Values) return;
    const s2 = step2Values ?? {};
    const request: CreateProjectRequest = {
      name: step1Values.name,
      zoneId: step1Values.zoneId,
      ...(step1Values.projectCode ? { projectCode: step1Values.projectCode } : {}),
      ...(step1Values.projectType ? { projectType: step1Values.projectType } : {}),
      ...(step1Values.divisionId ? { divisionId: step1Values.divisionId } : {}),
      ...(step1Values.ipaDate ? { ipaDate: step1Values.ipaDate.format('YYYY-MM-DD') } : {}),
      ...(step1Values.targetCompletionYear ? { targetCompletionYear: step1Values.targetCompletionYear } : {}),
      ...(s2.chainageFromKm != null ? { chainageFromKm: s2.chainageFromKm } : {}),
      ...(s2.chainageToKm != null ? { chainageToKm: s2.chainageToKm } : {}),
      ...(s2.lengthKm != null ? { lengthKm: s2.lengthKm } : {}),
    };
    mutation.mutate(request);
  };

  // ── Render helpers ─────────────────────────────────────────────────────────

  const steps = [
    { title: t('wizard.step1.title', 'Identity') },
    { title: t('wizard.step2.title', 'Scope') },
    { title: t('wizard.step3.title', 'Documents') },
  ];

  const footer = (
    <Space style={{ justifyContent: 'space-between', width: '100%' }}>
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={currentStep === 0 ? handleClose : handleBack}
        disabled={mutation.isPending}
      >
        {currentStep === 0
          ? t('common.cancel', 'Cancel')
          : t('common.back', 'Back')}
      </Button>
      {currentStep < 2 ? (
        <Button type="primary" icon={<ArrowRightOutlined />} iconPosition="end" onClick={handleNext}>
          {t('common.next', 'Next')}
        </Button>
      ) : (
        <Button
          type="primary"
          icon={<CheckOutlined />}
          onClick={handleSubmit}
          loading={mutation.isPending}
        >
          {t('wizard.submit', 'Create Project')}
        </Button>
      )}
    </Space>
  );

  return (
    <Modal
      title={t('projects.wizard.title', 'New Project')}
      open={open}
      onCancel={handleClose}
      footer={footer}
      width={640}
      destroyOnClose
    >
      <Steps
        current={currentStep}
        items={steps}
        size="small"
        style={{ marginBottom: 24 }}
      />

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

      {/* Step 1 — Identity */}
      <div style={{ display: currentStep === 0 ? 'block' : 'none' }}>
        <Form form={form1} layout="vertical" requiredMark>
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
            name="projectCode"
            label={t('wizard.step1.codeLabel', 'Project code')}
            tooltip={t('wizard.step1.codeTooltip', 'Railway Board project code (optional if not yet assigned)')}
          >
            <Input placeholder="e.g. CR/CON/XYZ/2024" style={{ textTransform: 'uppercase' }} />
          </Form.Item>

          <Form.Item
            name="projectType"
            label={t('wizard.step1.typeLabel', 'Project type')}
          >
            <Select
              placeholder={t('wizard.step1.typePlaceholder', 'Select type')}
              options={PROJECT_TYPES}
              allowClear
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
              onChange={() => {
                form1.setFieldValue('divisionId', undefined);
              }}
              options={visibleZones.map((z) => ({
                value: z.id,
                label: `${z.shortName} — ${z.name}`,
              }))}
            />
          </Form.Item>

          <Form.Item
            name="divisionId"
            label={t('wizard.step1.divisionLabel', 'Division')}
          >
            <Select
              placeholder={
                selectedZoneId
                  ? t('wizard.step1.divisionPlaceholder', 'Select a division')
                  : t('wizard.step1.divisionDisabled', 'Select a zone first')
              }
              loading={divisionsQuery.isLoading}
              disabled={!selectedZoneId}
              showSearch
              optionFilterProp="label"
              allowClear
              options={divisionsQuery.data?.map((d) => ({
                value: d.id,
                label: `${d.code} — ${d.name}`,
              }))}
            />
          </Form.Item>

          <Form.Item
            name="ipaDate"
            label={t('wizard.step1.ipaDateLabel', 'IPA Date')}
            tooltip={t('wizard.step1.ipaDateTooltip', 'Investment Programme Approval date')}
          >
            <DatePicker
              style={{ width: '100%' }}
              format="DD-MM-YYYY"
              placeholder={t('wizard.step1.ipaDatePlaceholder', 'Select IPA date')}
              disabledDate={(d) => d.isAfter(dayjs())}
            />
          </Form.Item>

          <Form.Item
            name="targetCompletionYear"
            label={t('wizard.step1.yearLabel', 'Target completion year')}
          >
            <Select
              placeholder={t('wizard.step1.yearPlaceholder', 'Select year')}
              options={YEAR_OPTIONS}
              allowClear
            />
          </Form.Item>
        </Form>
      </div>

      {/* Step 2 — Scope */}
      <div style={{ display: currentStep === 1 ? 'block' : 'none' }}>
        <Form form={form2} layout="vertical">
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            {t('wizard.step2.description', 'Chainage and length help place this project on the railway map. All fields optional — they can be updated later.')}
          </Text>

          <Space style={{ width: '100%' }} align="start">
            <Form.Item
              name="chainageFromKm"
              label={t('wizard.step2.fromLabel', 'Chainage from (km)')}
            >
              <InputNumber min={0} max={99999} precision={3} style={{ width: 160 }} placeholder="0.000" />
            </Form.Item>
            <Form.Item
              name="chainageToKm"
              label={t('wizard.step2.toLabel', 'Chainage to (km)')}
            >
              <InputNumber min={0} max={99999} precision={3} style={{ width: 160 }} placeholder="0.000" />
            </Form.Item>
          </Space>

          <Form.Item
            name="lengthKm"
            label={t('wizard.step2.lengthLabel', 'Length (km)')}
            tooltip={t('wizard.step2.lengthTooltip', 'Computed automatically from chainage if not entered')}
          >
            <InputNumber min={0} max={99999} precision={3} style={{ width: 160 }} placeholder="0.000" />
          </Form.Item>
        </Form>
      </div>

      {/* Step 3 — Documents (Phase 2 placeholder) */}
      <div style={{ display: currentStep === 2 ? 'block' : 'none' }}>
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ant-color-text-tertiary)' }}>
          <InboxOutlined style={{ fontSize: 48, marginBottom: 16, display: 'block' }} />
          <Text type="secondary">
            {t('wizard.step3.placeholder', 'Document uploads (sanction order, board minutes, scope document) will be available in the next phase. Click "Create Project" to proceed without documents.')}
          </Text>
        </div>
        <Divider />
        {step1Values && (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Text strong>{t('wizard.review.heading', 'Summary')}</Text>
            <Text>{t('wizard.review.name', 'Name')}: <Text strong>{step1Values.name}</Text></Text>
            {step1Values.projectCode && (
              <Text>{t('wizard.review.code', 'Code')}: <Text strong>{step1Values.projectCode}</Text></Text>
            )}
            {step1Values.projectType && (
              <Text>{t('wizard.review.type', 'Type')}: <Text strong>{PROJECT_TYPES.find(p => p.value === step1Values.projectType)?.label ?? step1Values.projectType}</Text></Text>
            )}
            {step2Values?.chainageFromKm != null && step2Values?.chainageToKm != null && (
              <Text>{t('wizard.review.chainage', 'Chainage')}: <Text strong>{step2Values.chainageFromKm} – {step2Values.chainageToKm} km</Text></Text>
            )}
          </Space>
        )}
      </div>
    </Modal>
  );
}
