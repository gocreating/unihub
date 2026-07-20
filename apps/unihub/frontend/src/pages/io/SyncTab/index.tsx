import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Collapse,
  Form,
  Input,
  Modal,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseOutlined,
  CloudDownloadOutlined,
  CloudUploadOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useIntl } from 'react-intl';
import type {
  SyncApplyChange,
  SyncConfigWrite,
  SyncPublishPreviewChange,
  SyncPublishPreviewResult,
} from '@/services/unihub-backend/sync';
import { ChangePreviewTable } from '@/components/ImportExport/ChangePreviewTable';
import { CommitGraph } from './CommitGraph';
import {
  confirmApply,
  forcePublishSync,
  getApplyPreview,
  getPublishPreview,
  getSyncConfig,
  publishSync,
  saveSyncConfig,
} from '@/services/unihub-backend/sync';

const { Text, Paragraph } = Typography;

// ── PAT guide ─────────────────────────────────────────────────────────

function PatGuide() {
  const { formatMessage: t } = useIntl();
  return (
    <Collapse
      size="small"
      items={[
        {
          key: 'guide',
          label: 'Personal Access Token guide',
          children: (
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              {/* Already have a token */}
              <div>
                <Text strong>{t({ id: 'pages.io.sync.config.patGuide.existing.heading' })}</Text>
                <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                  <li>
                    <Text>{t({ id: 'pages.io.sync.config.patGuide.existing.saved' })}</Text>
                  </li>
                  <li>
                    <Text>{t({ id: 'pages.io.sync.config.patGuide.existing.regen' })}</Text>{' '}
                    <a
                      href="https://github.com/settings/personal-access-tokens"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t({ id: 'pages.io.sync.config.patGuide.existing.regenLink' })}
                    </a>
                  </li>
                </ul>
              </div>

              {/* Creating a new token */}
              <div>
                <Text strong>{t({ id: 'pages.io.sync.config.patGuide.new.heading' })}</Text>
                <Paragraph style={{ margin: '4px 0 0' }}>
                  {t({ id: 'pages.io.sync.config.patGuide.intro' })}{' '}
                  <a
                    href="https://github.com/settings/personal-access-tokens/new"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t({ id: 'pages.io.sync.config.patGuide.link' })}
                  </a>
                </Paragraph>
                <ol style={{ margin: 0, paddingLeft: 20 }}>
                  <li>{t({ id: 'pages.io.sync.config.patGuide.step1' })}</li>
                  <li>{t({ id: 'pages.io.sync.config.patGuide.step2' })}</li>
                  <li>{t({ id: 'pages.io.sync.config.patGuide.step3' })}</li>
                  <li>{t({ id: 'pages.io.sync.config.patGuide.step4' })}</li>
                </ol>
              </div>
            </Space>
          ),
        },
      ]}
    />
  );
}

// ── Config Section ────────────────────────────────────────────────────

function ConfigSection({ configured }: { configured: boolean }) {
  const { formatMessage: t } = useIntl();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<SyncConfigWrite>();

  const { data: config } = useQuery({
    queryKey: ['sync', 'config'],
    queryFn: getSyncConfig,
  });

  useEffect(() => {
    if (config?.repo_url) {
      form.setFieldsValue({ repo_url: config.repo_url, pat: config.pat ?? '' });
    }
  }, [config?.repo_url, config?.pat, form]);

  const save = useMutation({
    mutationFn: saveSyncConfig,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sync'] });
      void message.success(t({ id: 'pages.io.sync.config.saved' }));
    },
    onError: () => {
      void message.error(t({ id: 'pages.io.sync.config.saveError' }));
    },
  });

  const formContent = (
    <div style={{ maxWidth: 560 }}>
      <Form form={form} layout="vertical" onFinish={(values) => save.mutate(values)}>
        <Form.Item
          name="repo_url"
          label={t({ id: 'pages.io.sync.config.repoUrl' })}
          rules={[{ required: true }]}
        >
          <Input placeholder={t({ id: 'pages.io.sync.config.repoUrl.placeholder' })} />
        </Form.Item>

        <Form.Item
          name="pat"
          label={t({ id: 'pages.io.sync.config.pat' })}
          rules={configured ? [] : [{ required: true }]}
        >
          <Input.Password placeholder={t({ id: 'pages.io.sync.config.pat.placeholder' })} />
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit" loading={save.isPending}>
            {t({ id: 'pages.io.sync.config.save' })}
          </Button>
        </Form.Item>
      </Form>

      <PatGuide />
    </div>
  );

  if (configured) {
    return (
      <Collapse
        size="small"
        items={[
          {
            key: 'config',
            label: t({ id: 'pages.io.sync.config.title' }),
            children: formContent,
          },
        ]}
      />
    );
  }

  return (
    <Card title={t({ id: 'pages.io.sync.config.title' })} size="small">
      {formContent}
    </Card>
  );
}

// ── Shared collapse preview renderer ─────────────────────────────────

type PreviewChange = (SyncApplyChange | SyncPublishPreviewChange) & {
  is_new_table?: boolean;
};

function renderPreviewCollapse(changes: PreviewChange[], t: (d: { id: string }) => string) {
  return (
    <Collapse
      defaultActiveKey={changes.map((ch) => ch.table)}
      items={changes.map((ch) => {
        const creates = ch.rows.filter((r) => r.operation === 'create');
        const updates = ch.rows.filter((r) => r.operation === 'update');
        const deletes = ch.rows.filter((r) => r.operation === 'delete');
        return {
          key: ch.table,
          label: (
            <span>
              <Text strong>{ch.display_name}</Text>
              <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
                ({ch.table})
              </Text>
              <span style={{ marginLeft: 8 }}>
                {creates.length > 0 && <Tag color="green">+{creates.length}</Tag>}
                {updates.length > 0 && <Tag color="orange">~{updates.length}</Tag>}
                {deletes.length > 0 && <Tag color="red">-{deletes.length}</Tag>}
                {ch.is_new_table === true && creates.length === 0 && updates.length === 0 && deletes.length === 0 && (
                  <Tag color="blue">{t({ id: 'pages.io.sync.publishPreview.newTable' })}</Tag>
                )}
              </span>
            </span>
          ),
          children: (
            <ChangePreviewTable creates={creates} updates={updates} deletes={deletes} errors={[]} />
          ),
        };
      })}
    />
  );
}

// ── Actions Card (publish + apply in one place) ───────────────────────

function ActionsCard({ configured }: { configured: boolean }) {
  const { formatMessage: t } = useIntl();
  const queryClient = useQueryClient();
  const [diverged, setDiverged] = useState(false);
  const [pullPreview, setPullPreview] = useState<SyncApplyChange[] | null>(null);
  const [pullPreviewing, setPullPreviewing] = useState(false);
  const [pushPreview, setPushPreview] = useState<SyncPublishPreviewResult | null>(null);
  const [pushPreviewing, setPushPreviewing] = useState(false);

  const publish = useMutation({
    mutationFn: publishSync,
    onSuccess: (result) => {
      setPushPreview(null);
      void queryClient.invalidateQueries({ queryKey: ['sync'] });
      if (result.status === 'up_to_date') {
        void message.info(t({ id: 'pages.io.sync.publish.upToDate' }));
      } else {
        void message.success(
          t(
            { id: 'pages.io.sync.publish.success' },
            { sha: (result.commit_sha ?? '').slice(0, 7), count: result.tables_exported?.length ?? 0 },
          ),
        );
      }
    },
    onError: (err: Error & { code?: string }) => {
      if (err.code === 'diverged') {
        setDiverged(true);
      } else if (err.code === 'preview_stale') {
        // The data or the remote changed since this preview was computed —
        // never publish anything other than what was previewed (FR-002).
        void message.warning(t({ id: 'pages.io.sync.publish.stale' }));
        void handlePushPreview();
      } else {
        void message.error(t({ id: 'pages.io.sync.publish.error' }));
      }
    },
  });

  const forcePublish = useMutation({
    mutationFn: forcePublishSync,
    onSuccess: (result) => {
      setDiverged(false);
      void queryClient.invalidateQueries({ queryKey: ['sync'] });
      void message.success(
        t({ id: 'pages.io.sync.forcePublish.success' }, { sha: (result.commit_sha ?? '').slice(0, 7) }),
      );
    },
    onError: () => {
      void message.error(t({ id: 'pages.io.sync.forcePublish.error' }));
    },
  });

  const applyConfirm = useMutation({
    mutationFn: confirmApply,
    onSuccess: () => {
      setPullPreview(null);
      void queryClient.invalidateQueries();
      void message.success(t({ id: 'pages.io.sync.apply.success' }));
    },
    onError: () => {
      void message.error(t({ id: 'pages.io.sync.apply.error' }));
    },
  });

  async function handlePushPreview() {
    setPushPreviewing(true);
    try {
      const result = await getPublishPreview();
      if (result.status === 'up_to_date') {
        setPushPreview(null);
        void message.info(t({ id: 'pages.io.sync.publishPreview.upToDate' }));
      } else {
        setPushPreview(result);
      }
    } catch {
      void message.error(t({ id: 'pages.io.sync.publishPreview.error' }));
    } finally {
      setPushPreviewing(false);
    }
  }

  async function handlePullPreview() {
    setPullPreviewing(true);
    try {
      const result = await getApplyPreview();
      if (result.status === 'up_to_date') {
        void message.info(t({ id: 'pages.io.sync.apply.upToDate' }));
      } else {
        setPullPreview(result.changes ?? []);
      }
    } catch {
      void message.error(t({ id: 'pages.io.sync.apply.error' }));
    } finally {
      setPullPreviewing(false);
    }
  }

  if (!configured) return null;

  return (
    <>
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {/* Primary action buttons — always available */}
        <Space wrap>
          <Button
            type="primary"
            icon={<CloudUploadOutlined />}
            loading={pushPreviewing || publish.isPending}
            onClick={() => void handlePushPreview()}
            disabled={forcePublish.isPending}
          >
            {t({ id: 'pages.io.sync.publish.button' })}
          </Button>
          <Button
            icon={<CloudDownloadOutlined />}
            loading={pullPreviewing}
            onClick={() => void handlePullPreview()}
            disabled={applyConfirm.isPending}
          >
            {t({ id: 'pages.io.sync.apply.previewButton' })}
          </Button>
        </Space>

        {/* Push preview */}
        {pushPreview !== null && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            {renderPreviewCollapse(pushPreview.changes ?? [], t)}
            <Space>
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                loading={publish.isPending}
                onClick={() =>
                  publish.mutate({
                    base_commit: pushPreview.base_commit ?? null,
                    diff_digest: pushPreview.diff_digest ?? '',
                  })
                }
              >
                {t({ id: 'pages.io.sync.publishPreview.confirmButton' })}
              </Button>
              <Button
                icon={<CloseOutlined />}
                onClick={() => setPushPreview(null)}
                disabled={publish.isPending}
              >
                {t({ id: 'pages.io.sync.publishPreview.cancelButton' })}
              </Button>
            </Space>
          </Space>
        )}

        {/* Pull preview */}
        {pullPreview !== null && pullPreview.length > 0 && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            {renderPreviewCollapse(pullPreview, t)}
            <Space>
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                loading={applyConfirm.isPending}
                onClick={() => applyConfirm.mutate()}
              >
                {t({ id: 'pages.io.sync.apply.confirmButton' })}
              </Button>
              <Button
                icon={<CloseOutlined />}
                onClick={() => setPullPreview(null)}
                disabled={applyConfirm.isPending}
              >
                {t({ id: 'pages.io.sync.publishPreview.cancelButton' })}
              </Button>
            </Space>
          </Space>
        )}
      </Space>

      <Modal
        open={diverged}
        title={t({ id: 'pages.io.sync.diverged.title' })}
        footer={null}
        onCancel={() => setDiverged(false)}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Alert
            type="warning"
            showIcon
            message={t({ id: 'pages.io.sync.diverged.description' })}
          />
          <Space>
            <Button
              danger
              type="primary"
              loading={forcePublish.isPending}
              onClick={() => forcePublish.mutate()}
            >
              {t({ id: 'pages.io.sync.diverged.forcePublish' })}
            </Button>
            <Button onClick={() => setDiverged(false)}>
              {t({ id: 'pages.io.sync.diverged.cancel' })}
            </Button>
          </Space>
        </Space>
      </Modal>
    </>
  );
}

// ── SyncTab ───────────────────────────────────────────────────────────

export function SyncTab() {
  const { data: config } = useQuery({
    queryKey: ['sync', 'config'],
    queryFn: getSyncConfig,
  });

  const configured = config?.is_configured ?? false;

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      {configured ? (
        <>
          <CommitGraph />
          <ActionsCard configured={configured} />
          <ConfigSection configured={configured} />
        </>
      ) : (
        <ConfigSection configured={false} />
      )}
    </Space>
  );
}
