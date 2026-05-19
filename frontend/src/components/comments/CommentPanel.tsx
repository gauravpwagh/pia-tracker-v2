/**
 * CommentPanel — right-panel Comments tab for a record.
 *
 * Features:
 *   - Lists top-level comments with their replies (from GET /api/v1/comments).
 *   - Compose box (textarea) with submit button.
 *   - Delete own comment (sends DELETE /api/v1/comments/{id}).
 *   - body_markdown rendered as plain text for Phase 1.13; Phase 3 can add
 *     full markdown + DOMPurify sanitisation.
 *
 * Props:
 *   entityType  — e.g., 'ACTIVITY_RECORD'
 *   entityId    — UUID of the entity
 *   currentUserId — from the auth store; used to show Delete on own comments
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Avatar,
  Button,
  Divider,
  Empty,
  Form,
  Input,
  List,
  Popconfirm,
  Spin,
  Typography,
} from 'antd';
import { DeleteOutlined, UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  fetchComments,
  postComment,
  deleteComment,
  type CommentDto,
} from '@api/comments';

dayjs.extend(relativeTime);

const { Text, Paragraph } = Typography;

// ── State-code label colour (same map as RecordEditPage) ─────────────────────
const STATE_COLORS: Record<string, string> = {
  DRAFT: '#8c8c8c',
  SUBMITTED_FOR_VERIFICATION: '#1677ff',
  VERIFIED: '#52c41a',
  AUTHENTICATED: '#722ed1',
  SENT_BACK_TO_DYCE: '#fa8c16',
  SENT_BACK_TO_NODAL: '#fa8c16',
};

// ── Single comment card ────────────────────────────────────────────────────────

function CommentCard({
  comment,
  currentUserId,
  onDelete,
}: {
  comment: CommentDto;
  currentUserId: string | undefined;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation('forms');
  const isOwn = comment.author.userId === currentUserId;
  const stateColor = comment.workflowStateAtComment
    ? STATE_COLORS[comment.workflowStateAtComment] ?? '#8c8c8c'
    : undefined;

  return (
    <List.Item
      style={{ alignItems: 'flex-start', padding: '8px 0' }}
      actions={
        isOwn
          ? [
              <Popconfirm
                key="del"
                title={t('record.comments.deleteConfirm')}
                onConfirm={() => onDelete(comment.id)}
                okText={t('record.comments.delete')}
                okButtonProps={{ danger: true }}
              >
                <Button
                  type="text"
                  size="small"
                  icon={<DeleteOutlined />}
                  danger
                />
              </Popconfirm>,
            ]
          : undefined
      }
    >
      <List.Item.Meta
        avatar={<Avatar icon={<UserOutlined />} size="small" />}
        title={
          <span>
            <Text strong style={{ fontSize: 12 }}>
              {comment.author.name}
            </Text>
            {comment.workflowStateAtComment && (
              <Text
                style={{
                  fontSize: 11,
                  marginLeft: 6,
                  color: stateColor,
                  fontStyle: 'italic',
                }}
              >
                [{comment.workflowStateAtComment.replace(/_/g, ' ')}]
              </Text>
            )}
            <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
              {dayjs(comment.createdAt).fromNow()}
            </Text>
          </span>
        }
        description={
          <Paragraph
            style={{ fontSize: 13, marginBottom: 0, whiteSpace: 'pre-wrap' }}
          >
            {comment.bodyMarkdown}
          </Paragraph>
        }
      />
    </List.Item>
  );
}

// ── Panel ────────────────────────────────────────────────────────────────────

export interface CommentPanelProps {
  entityType: string;
  entityId: string;
  currentUserId: string | undefined;
}

export function CommentPanel({ entityType, entityId, currentUserId }: CommentPanelProps) {
  const { t } = useTranslation('forms');
  const queryClient = useQueryClient();
  const queryKey = ['comments', entityType, entityId];
  const [draft, setDraft] = useState('');

  const { data: comments, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchComments(entityType, entityId),
    enabled: !!entityId,
  });

  const postMutation = useMutation({
    mutationFn: postComment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setDraft('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteComment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  function handleSubmit() {
    if (!draft.trim()) return;
    postMutation.mutate({ entityType, entityId, bodyMarkdown: draft.trim() });
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
        <Spin size="small" />
      </div>
    );
  }

  const allComments = comments ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Compose box */}
      <Form layout="vertical" onFinish={handleSubmit}>
        <Form.Item style={{ marginBottom: 8 }}>
          <Input.TextArea
            rows={3}
            value={draft}
            placeholder={t('record.comments.placeholder')}
            onChange={(e) => setDraft(e.target.value)}
          />
        </Form.Item>
        <Form.Item style={{ marginBottom: 0 }}>
          <Button
            type="primary"
            size="small"
            htmlType="submit"
            loading={postMutation.isPending}
            disabled={!draft.trim()}
          >
            {t('record.comments.submit')}
          </Button>
        </Form.Item>
      </Form>

      <Divider style={{ margin: '8px 0' }} />

      {/* Comment list */}
      {allComments.length === 0 ? (
        <Empty
          description={t('record.comments.empty')}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : (
        <List
          dataSource={allComments}
          renderItem={(comment) => (
            <>
              <CommentCard
                comment={comment}
                currentUserId={currentUserId}
                onDelete={(id) => deleteMutation.mutate(id)}
              />
              {/* Render replies indented */}
              {comment.replies.length > 0 && (
                <div style={{ paddingLeft: 28 }}>
                  {comment.replies.map((reply) => (
                    <CommentCard
                      key={reply.id}
                      comment={reply}
                      currentUserId={currentUserId}
                      onDelete={(id) => deleteMutation.mutate(id)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        />
      )}
    </div>
  );
}
