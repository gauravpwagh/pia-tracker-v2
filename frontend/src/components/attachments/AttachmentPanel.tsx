import { useRef } from 'react';
import {
  Button,
  List,
  Popconfirm,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import { DeleteOutlined, DownloadOutlined, PaperClipOutlined, UploadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchAttachments,
  uploadAttachment,
  getAttachmentDownloadUrl,
  deleteAttachment,
  type AttachmentDto,
} from '@api/attachments';
import dayjs from 'dayjs';

const { Text } = Typography;

/**
 * AttachmentPanel — lists attachments for an entity and allows upload/download/delete.
 *
 * Props:
 *   entityType     — e.g. "ACTIVITY_RECORD"
 *   entityId       — UUID of the record
 *   canUpload      — whether the current user has ATTACHMENT.UPLOAD.OWN_RECORDS
 *   currentUserId  — for "own" delete UI hint
 */
interface AttachmentPanelProps {
  entityType: string;
  entityId: string;
  canUpload?: boolean;
  currentUserId?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

export function AttachmentPanel({
  entityType,
  entityId,
  canUpload = false,
  currentUserId,
}: AttachmentPanelProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: attachments = [], isLoading } = useQuery({
    queryKey: ['attachments', entityType, entityId],
    queryFn: () => fetchAttachments(entityType, entityId),
    enabled: !!entityId,
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadAttachment(entityType, entityId, file),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['attachments', entityType, entityId] });
      void message.success('File uploaded successfully');
    },
    onError: (err: Error) => {
      void message.error(`Upload failed: ${err.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAttachment(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['attachments', entityType, entityId] });
      void message.success('Attachment deleted');
    },
    onError: (err: Error) => {
      void message.error(`Delete failed: ${err.message}`);
    },
  });

  const downloadMutation = useMutation({
    mutationFn: (id: string) => getAttachmentDownloadUrl(id),
    onSuccess: (data) => {
      // Open presigned URL in a new tab — the browser handles the download
      window.open(data.presignedUrl, '_blank', 'noopener,noreferrer');
    },
    onError: (err: Error) => {
      void message.error(`Could not get download link: ${err.message}`);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadMutation.mutate(file);
    // Reset so the same file can be re-uploaded if needed
    e.target.value = '';
  };

  return (
    <div>
      {canUpload && (
        <div style={{ marginBottom: 12 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <Button
            icon={<UploadOutlined />}
            size="small"
            loading={uploadMutation.isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            Upload PDF
          </Button>
          <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
            PDF only · max 48 MB
          </Text>
        </div>
      )}

      <List<AttachmentDto>
        size="small"
        loading={isLoading}
        dataSource={attachments}
        locale={{ emptyText: 'No attachments yet' }}
        renderItem={(item) => (
          <List.Item
            style={{ padding: '6px 0' }}
            actions={[
              <Button
                key="dl"
                type="text"
                icon={<DownloadOutlined />}
                size="small"
                loading={downloadMutation.isPending}
                onClick={() => downloadMutation.mutate(item.id)}
                title="Download"
              />,
              (item.uploadedByUserId === currentUserId || !currentUserId) && (
                <Popconfirm
                  key="del"
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
              ),
            ].filter(Boolean)}
          >
            <List.Item.Meta
              avatar={<PaperClipOutlined style={{ color: 'var(--ant-color-text-secondary)', marginTop: 3 }} />}
              title={
                <Space size={6} wrap>
                  <Text style={{ fontSize: 13 }} ellipsis={{ tooltip: item.originalFilename }}>
                    {item.originalFilename}
                  </Text>
                  <Tag style={{ fontSize: 11 }}>{formatBytes(item.fileSizeBytes)}</Tag>
                </Space>
              }
              description={
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {dayjs(item.createdAt).format('DD MMM YYYY HH:mm')}
                </Text>
              }
            />
          </List.Item>
        )}
      />
    </div>
  );
}
