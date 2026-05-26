/**
 * ActivityCreateWizard — 2-step wizard modal for creating a new activity,
 * matching the style of ProjectCreateWizard.
 *
 * Step 1 — Details:  activity type, name, scope notes, target completion date
 * Step 2 — Specifics: type-specific metadata fields (ActivityMetadataForm)
 *
 * Calls onCreated with the new activity ID on success.
 */

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Alert,
  Button,
  DatePicker,
  Descriptions,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Steps,
  Typography,
} from 'antd';
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  createActivity,
  type ActivityDetailResponse,
  type CreateActivityRequest,
} from '@api/projects';
import { ActivityMetadataForm } from './ActivityMetadataForm';

const { Text } = Typography;
const { TextArea } = Input;

// ── Constants ─────────────────────────────────────────────────────────────────

const ACTIVITY_TYPES = [
  { code: 'LAND_ACQUISITION',       label: 'Land Acquisition' },
  { code: 'FOREST_CLEARANCE',       label: 'Forest Clearance' },
  { code: 'UTILITY_SHIFTING',       label: 'Utility Shifting' },
  { code: 'DRAWING_APPROVAL',       label: 'Drawing Approval' },
  { code: 'TENDER_PACKAGING',       label: 'Tender Packaging' },
  { code: 'TEMPORARY_OFFICE_SPACE', label: 'Temporary Office Space' },
];

const SCOPE_NOTE_PLACEHOLDERS: Record<string, string> = {
  LAND_ACQUISITION:       'Villages, survey numbers, district, total area (ha), acquisition stage…',
  FOREST_CLEARANCE:       'Forest division, area (ha), FC-I / FC-II stage, compensatory afforestation details…',
  UTILITY_SHIFTING:       'Utility type, chainage range, executing agency, estimated cost…',
  DRAWING_APPROVAL:       'Drawing type, DPR reference, design standard, approving authority…',
  TENDER_PACKAGING:       'Package scope, estimated cost range, tender type, current stage…',
  TEMPORARY_OFFICE_SPACE: 'Location, area required (sqm), type (rented / railway land), facilities needed…',
};

// ── Step 1 form values ────────────────────────────────────────────────────────

interface Step1Values {
  activityTypeCode: string;
  name: string;
  scopeNotes?: string;
  targetCompletionDate?: dayjs.Dayjs | null;
}

// ── Step 2 form values ────────────────────────────────────────────────────────

interface Step2Values {
  metadata?: Record<string, unknown>;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ActivityCreateWizardProps {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onCreated?: (activity: ActivityDetailResponse) => void;
}

// ── Wizard ────────────────────────────────────────────────────────────────────

export default function ActivityCreateWizard({
  projectId,
  open,
  onClose,
  onCreated,
}: ActivityCreateWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [step1Values, setStep1Values] = useState<Step1Values | null>(null);
  const [form1] = Form.useForm<Step1Values>();
  const [form2] = Form.useForm<Step2Values>();

  // Track selected type via local state so the step-2 form and summary update instantly
  const [selectedType, setSelectedType] = useState<string | undefined>();

  // ── Mutation ───────────────────────────────────────────────────────────────

  const mutation = useMutation({
    mutationFn: (req: CreateActivityRequest) => createActivity(projectId, req),
    onSuccess: (activity) => {
      onCreated?.(activity);
      handleReset();
      onClose();
    },
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  const handleReset = () => {
    setCurrentStep(0);
    setStep1Values(null);
    setSelectedType(undefined);
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
    }
  };

  const handleBack = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  const handleSubmit = async () => {
    if (!step1Values) return;
    const step2 = form2.getFieldsValue();

    const cleanedMetadata = Object.fromEntries(
      Object.entries(step2.metadata ?? {}).filter(
        ([, v]) => v !== undefined && v !== null && v !== '',
      ),
    );

    const request: CreateActivityRequest = {
      activityTypeCode: step1Values.activityTypeCode,
      name: step1Values.name,
      ...(step1Values.scopeNotes ? { scopeNotes: step1Values.scopeNotes } : {}),
      ...(step1Values.targetCompletionDate
        ? { targetCompletionDate: step1Values.targetCompletionDate.format('YYYY-MM-DD') }
        : {}),
      ...(Object.keys(cleanedMetadata).length > 0 ? { metadataJson: cleanedMetadata } : {}),
    };

    mutation.mutate(request);
  };

  // ── Type label helper ──────────────────────────────────────────────────────

  const typeLabel = (code: string | undefined) =>
    ACTIVITY_TYPES.find((t) => t.code === code)?.label ?? code ?? '';

  // ── Footer ─────────────────────────────────────────────────────────────────

  const footer = (
    <Space style={{ justifyContent: 'space-between', width: '100%' }}>
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={currentStep === 0 ? handleClose : handleBack}
        disabled={mutation.isPending}
      >
        {currentStep === 0 ? 'Cancel' : 'Back'}
      </Button>
      {currentStep < 1 ? (
        <Button type="primary" icon={<ArrowRightOutlined />} iconPosition="end" onClick={handleNext}>
          Next
        </Button>
      ) : (
        <Button
          type="primary"
          icon={<CheckOutlined />}
          onClick={handleSubmit}
          loading={mutation.isPending}
        >
          Create Activity
        </Button>
      )}
    </Space>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  const scopePlaceholder = selectedType
    ? (SCOPE_NOTE_PLACEHOLDERS[selectedType] ?? 'Describe the scope…')
    : 'Select an activity type to see hints…';

  return (
    <Modal
      title="New Activity"
      open={open}
      onCancel={handleClose}
      footer={footer}
      width={600}
      destroyOnClose
    >
      <Steps
        current={currentStep}
        size="small"
        style={{ marginBottom: 24 }}
        items={[
          { title: 'Details' },
          { title: 'Specifics' },
        ]}
      />

      {mutation.isError && (
        <Alert
          type="error"
          message="Failed to create activity"
          description={mutation.error instanceof Error ? mutation.error.message : undefined}
          style={{ marginBottom: 16 }}
          showIcon
          closable
        />
      )}

      {/* ── Step 1 — Common details ─────────────────────────────────────── */}
      <div style={{ display: currentStep === 0 ? 'block' : 'none' }}>
        <Form form={form1} layout="vertical" requiredMark>
          <Form.Item
            name="activityTypeCode"
            label="Activity type"
            rules={[{ required: true, message: 'Select an activity type' }]}
          >
            <Select
              placeholder="Select type…"
              options={ACTIVITY_TYPES.map((t) => ({ value: t.code, label: t.label }))}
              onChange={(code: string) => {
                setSelectedType(code);
                const found = ACTIVITY_TYPES.find((t) => t.code === code);
                if (found) form1.setFieldValue('name', found.label);
              }}
            />
          </Form.Item>

          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: 'Enter a name for this activity' }]}
          >
            <Input placeholder="e.g. Land Acquisition — Phase 1" />
          </Form.Item>

          <Form.Item name="scopeNotes" label="Scope notes">
            <TextArea rows={4} placeholder={scopePlaceholder} />
          </Form.Item>

          <Form.Item name="targetCompletionDate" label="Target completion date">
            <DatePicker style={{ width: '100%' }} format="D MMM YYYY" />
          </Form.Item>
        </Form>
      </div>

      {/* ── Step 2 — Type-specific metadata ────────────────────────────── */}
      <div style={{ display: currentStep === 1 ? 'block' : 'none' }}>
        {/* Summary of step 1 */}
        {step1Values && (
          <Descriptions size="small" column={1} bordered style={{ marginBottom: 20 }}>
            <Descriptions.Item label="Type">
              {typeLabel(step1Values.activityTypeCode)}
            </Descriptions.Item>
            <Descriptions.Item label="Name">
              {step1Values.name}
            </Descriptions.Item>
            {step1Values.targetCompletionDate && (
              <Descriptions.Item label="Target date">
                {step1Values.targetCompletionDate.format('D MMM YYYY')}
              </Descriptions.Item>
            )}
          </Descriptions>
        )}

        <Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 12 }}>
          Fill in the details specific to this {typeLabel(step1Values?.activityTypeCode)} activity.
          All fields are optional and can be updated later.
        </Text>

        <Form form={form2} layout="vertical">
          {step1Values?.activityTypeCode && (
            <ActivityMetadataForm activityTypeCode={step1Values.activityTypeCode} />
          )}
        </Form>
      </div>
    </Modal>
  );
}
