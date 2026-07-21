import { useRef, useState } from 'react';
import {
  Button,
  List,
  Popconfirm,
  Progress,
  Space,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  DownloadOutlined,
  ExclamationCircleOutlined,
  LoadingOutlined,
  PaperClipOutlined,
  UploadOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchAttachments,
  getAttachmentDownloadUrl,
  deleteAttachment,
  type AttachmentDto,
} from '@api/attachments';
import { uploadFile, type UploadProgress } from '@utils/uploadEngine';
import dayjs from 'dayjs';

const { Text } = Typography;

// ── Allowed MIME types for the generic panel ──────────────────────────────────

export const ACCEPT_DOCUMENTS =
  'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const ACCEPT_IMAGES = 'image/jpeg,image/png,image/tiff,image/geo+tiff,image/geotiff';

export const ACCEPT_GEOGRAPHIC =
  'application/vnd.google-earth.kmz,application/vnd.google-earth.kml+xml,application/zip,application/x-zip-compressed,application/gpx+xml,text/csv';

export const ACCEPT_VIDEO = 'video/mp4,video/quicktime,video/x-matroska,video/x-msvideo,video/mpeg';

export const ACCEPT_ALL = [
  ACCEPT_DOCUMENTS,
  ACCEPT_IMAGES,
  ACCEPT_GEOGRAPHIC,
  ACCEPT_VIDEO,
].join(',');

// ── Props ──────────────────────────────────────────────────────────────────────

interface AttachmentPanelProps {
  entityType: string;
  entityId: string;
  canUpload?: boolean;
  canDelete?: boolean;
  currentUserId?: string;
  /** Comma-separated MIME types for the file picker. Defaults to all allowed types. */
  accept?: string;
  /** Label shown on the upload button. Defaults to "Upload file". */
  uploadLabel?: string;
  /** Hint text shown below the button (e.g. "PDF · KMZ · max 10 GB"). */
  uploadHint?: string;
}

// ── Scan status display ───────────────────────────────────────────────────────

const SCAN_CONFIG: Record<
  string,
  { color: string; icon: React.ReactNode; label: string; tooltip: string }
> = {
  PENDING: {
    color: 'default',
    icon: <ClockCircleOutlined />,
    label: 'Pending',
    tooltip: 'Waiting for upload confirmation',
  },
  SCANNING: {
    color: 'processing',
    icon: <LoadingOutlined />,
    label: 'Scanning',
    tooltip: 'Malware scan in progress',
  },
  CLEAN: {
    color: 'success',
    icon: <CheckCircleOutlined />,
    label: 'Clean',
    tooltip: 'Passed malware scan',
  },
  INFECTED: {
    color: 'error',
    icon: <ExclamationCircleOutlined />,
    label: 'Infected',
    tooltip: 'Malware detected — file removed',
  },
  SCAN_FAILED: {
    color: 'warning',
    icon: <WarningOutlined />,
    label: 'Scan failed',
    tooltip: 'Malware scanner unavailable — please retry',
  },
  EXEMPT: {
    color: 'default',
    icon: <CheckCircleOutlined />,
    label: 'Exempt',
    tooltip: 'Large file — integrity hash stored, malware scan skipped',
  },
};

export function ScanBadge({ status }: { status: string }) {
  const cfg = SCAN_CONFIG[status] ?? SCAN_CONFIG.PENDING;
  return (
    <Tooltip title={cfg.tooltip}>
      <Tag icon={cfg.icon} color={cfg.color} style={{ fontSize: 11 }}>
        {cfg.label}
      </Tag>
    </Tooltip>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AttachmentPanel({
  entityType,
  entityId,
  canUpload = false,
  canDelete = true,
  currentUserId,
  accept = ACCEPT_ALL,
  uploadLabel = 'Upload file',
  uploadHint,
}: AttachmentPanelProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { data: attachments = [], isLoading } = useQuery({
    queryKey: ['attachments', entityType, entityId],
    queryFn: () => fetchAttachments(entityType, entityId),
    enabled: !!entityId,
    // Poll while any attachment is still being scanned
    refetchInterval: (query) => {
      const data = query.state.data as AttachmentDto[] | undefined;
      return data?.some((a) => a.scanStatus === 'SCANNING' || a.scanStatus === 'PENDING')
        ? 5_000
        : false;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAttachment(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['attachments', entityType, entityId] });
      void queryClient.invalidateQueries({ queryKey: ['attachments', 'section-panel'] });
      void message.success('Attachment deleted');
    },
    onError: (err: Error) => {
      void message.error(`Delete failed: ${err.message}`);
    },
  });

  const downloadMutation = useMutation({
    mutationFn: (id: string) => getAttachmentDownloadUrl(id),
    onSuccess: (data) => {
      window.open(data.presignedUrl, '_blank', 'noopener,noreferrer');
    },
    onError: (err: Error) => {
      void message.error(`Could not get download link: ${err.message}`);
    },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const controller = new AbortController();
    abortRef.current = controller;
    setProgress({ loaded: 0, total: file.size, percent: 0 });
    try {
      await uploadFile(entityType, entityId, file, (p) => setProgress(p), accept, controller.signal);
      void queryClient.invalidateQueries({ queryKey: ['attachments', entityType, entityId] });
      void queryClient.invalidateQueries({ queryKey: ['attachments', 'section-panel'] });
      void message.success('File uploaded — malware scan in progress');
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        void message.warning('Upload cancelled');
      } else {
        void message.error(`Upload failed: ${(err as Error).message}`);
      }
    } finally {
      abortRef.current = null;
      setProgress(null);
    }
  };

  const isUploading = progress !== null;

  return (
    <div>
      {canUpload && (
        <div style={{ marginBottom: 12 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            style={{ display: 'none' }}
            onChange={(e) => void handleFileChange(e)}
          />
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            <Space>
              <Button
                icon={<UploadOutlined />}
                size="small"
                loading={isUploading}
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadLabel}
              </Button>
              {uploadHint && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {uploadHint}
                </Text>
              )}
            </Space>
            {isUploading && progress && (
              <Space size={8} align="center">
                <Progress
                  percent={progress.percent}
                  size="small"
                  status={progress.percent < 100 ? 'active' : 'success'}
                  format={(pct) =>
                    `${pct}% · ${formatBytes(progress.loaded)} / ${formatBytes(progress.total)}`
                  }
                  style={{ width: 320 }}
                />
                <Button
                  size="small"
                  type="text"
                  danger
                  onClick={() => abortRef.current?.abort()}
                  title="Cancel upload"
                >
                  Cancel
                </Button>
              </Space>
            )}
          </Space>
        </div>
      )}

      <List<AttachmentDto>
        size="small"
        loading={isLoading}
        dataSource={attachments}
        locale={{ emptyText: 'No attachments yet' }}
        renderItem={(item) => (
          <List.Item style={{ padding: '6px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minWidth: 0, flexWrap: 'wrap' }}>
              <PaperClipOutlined style={{ color: 'var(--ant-color-text-secondary)', flexShrink: 0 }} />
              <Text
                style={{ fontSize: 13, flex: '1 1 120px', minWidth: 0 }}
                ellipsis={{ tooltip: item.originalFilename }}
                delete={item.scanStatus === 'INFECTED'}
              >
                {item.originalFilename}
              </Text>
              <Tag style={{ fontSize: 11, flexShrink: 0, margin: 0 }}>{formatBytes(item.fileSizeBytes)}</Tag>
              <ScanBadge status={item.scanStatus} />
              <Text type="secondary" style={{ fontSize: 11, flexShrink: 0, whiteSpace: 'nowrap' }}>
                {dayjs(item.createdAt).format('DD MMM YYYY HH:mm')}
              </Text>
              <Space size={0} style={{ flexShrink: 0, marginLeft: 'auto' }}>
                <Button
                  type="text"
                  icon={<DownloadOutlined />}
                  size="small"
                  loading={downloadMutation.isPending}
                  disabled={item.scanStatus === 'INFECTED'}
                  onClick={() => downloadMutation.mutate(item.id)}
                  title="Download"
                />
                {canDelete && (item.uploadedByUserId === currentUserId || !currentUserId) && (
                  <Popconfirm
                    title="Delete this attachment?"
                    onConfirm={() => deleteMutation.mutate(item.id)}
                    okText="Delete"
                    okButtonProps={{ danger: true }}
                  >
                    <Button
                      type="text"
                      icon={<DeleteOutlined />}
                      size="small"
                      danger
                      loading={deleteMutation.isPending}
                      title="Delete"
                    />
                  </Popconfirm>
                )}
              </Space>
            </div>
          </List.Item>
        )}
      />
    </div>
  );
}
