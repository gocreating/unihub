import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Collapse,
  Descriptions,
  Form,
  Input,
  Modal,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import { SyncOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useIntl } from 'react-intl';
import type { SyncApplyChange, SyncConfigWrite } from '@/services/unihub-backend/sync';
import {
  confirmApply,
  forcePublishSync,
  getApplyPreview,
  getSyncConfig,
  getSyncStatus,
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

// ── Status badge ──────────────────────────────────────────────────────

function StatusTag({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    in_sync: 'green',
    ahead: 'blue',
    behind: 'orange',
    diverged: 'red',
    no_remote: 'default',
    error: 'red',
  };
  return <Tag color={colorMap[status] ?? 'default'}>{status.replace('_', ' ')}</Tag>;
}

// ── Config Section ────────────────────────────────────────────────────

function ConfigSection() {
  const { formatMessage: t } = useIntl();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<SyncConfigWrite>();

  const { data: config } = useQuery({
    queryKey: ['sync', 'config'],
    queryFn: getSyncConfig,
  });

  useEffect(() => {
    if (config?.repo_url) {
      form.setFieldValue('repo_url', config.repo_url);
    }
  }, [config?.repo_url, form]);

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

  return (
    <Card title={t({ id: 'pages.io.sync.config.title' })} size="small">
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) => save.mutate(values)}
        style={{ maxWidth: 560 }}
      >
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
          rules={[{ required: true }]}
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
    </Card>
  );
}

// ── Status Section ────────────────────────────────────────────────────

function StatusSection({ configured }: { configured: boolean }) {
  const { formatMessage: t } = useIntl();

  const { data: status, isLoading, refetch } = useQuery({
    queryKey: ['sync', 'status'],
    queryFn: getSyncStatus,
    enabled: configured,
  });

  const { data: config } = useQuery({
    queryKey: ['sync', 'config'],
    queryFn: getSyncConfig,
    enabled: configured,
  });

  if (!configured) return null;

  function statusLabel() {
    if (!status) return null;
    const s = status.status;
    if (s === 'in_sync') return t({ id: 'pages.io.sync.status.inSync' });
    if (s === 'ahead') return t({ id: 'pages.io.sync.status.ahead' }, { count: status.ahead_count });
    if (s === 'behind') return t({ id: 'pages.io.sync.status.behind' }, { count: status.behind_count });
    if (s === 'diverged') return t({ id: 'pages.io.sync.status.diverged' });
    if (s === 'no_remote') return t({ id: 'pages.io.sync.status.noRemote' });
    if (s === 'error') return t({ id: 'pages.io.sync.status.error' }, { message: status.error_message ?? '' });
    return s;
  }

  return (
    <Card
      title={t({ id: 'pages.io.sync.status.title' })}
      size="small"
      extra={
        <Button size="small" icon={<SyncOutlined spin={isLoading} />} onClick={() => void refetch()}>
          Refresh
        </Button>
      }
    >
      <Descriptions size="small" column={1}>
        {status && (
          <Descriptions.Item label="Status">
            <Space>
              <StatusTag status={status.status} />
              <Text type="secondary">{statusLabel()}</Text>
            </Space>
          </Descriptions.Item>
        )}
        {config?.last_published_at && (
          <Descriptions.Item label="Last published">
            {new Date(config.last_published_at).toLocaleString()}
            {config.last_published_commit && (
              <Text type="secondary" style={{ marginLeft: 8, fontFamily: 'monospace', fontSize: 11 }}>
                {config.last_published_commit.slice(0, 7)}
              </Text>
            )}
          </Descriptions.Item>
        )}
        {config?.last_applied_at && (
          <Descriptions.Item label="Last applied">
            {new Date(config.last_applied_at).toLocaleString()}
          </Descriptions.Item>
        )}
      </Descriptions>
    </Card>
  );
}

// ── Publish Section ───────────────────────────────────────────────────

function PublishSection({ configured }: { configured: boolean }) {
  const { formatMessage: t } = useIntl();
  const queryClient = useQueryClient();
  const [diverged, setDiverged] = useState(false);

  const publish = useMutation({
    mutationFn: publishSync,
    onSuccess: (result) => {
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

  if (!configured) return null;

  return (
    <>
      <Button
        type="primary"
        loading={publish.isPending}
        onClick={() => publish.mutate()}
        disabled={forcePublish.isPending}
      >
        {t({ id: 'pages.io.sync.publish.button' })}
      </Button>

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

// ── Apply Section ─────────────────────────────────────────────────────

function ApplySection({ configured }: { configured: boolean }) {
  const { formatMessage: t } = useIntl();
  const queryClient = useQueryClient();
  const [previewResult, setPreviewResult] = useState<SyncApplyChange[] | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const confirm = useMutation({
    mutationFn: confirmApply,
    onSuccess: () => {
      setPreviewResult(null);
      void queryClient.invalidateQueries();
      void message.success(t({ id: 'pages.io.sync.apply.success' }));
    },
    onError: () => {
      void message.error(t({ id: 'pages.io.sync.apply.error' }));
    },
  });

  async function handlePreview() {
    setPreviewing(true);
    try {
      const result = await getApplyPreview();
      if (result.status === 'up_to_date') {
        setPreviewResult(null);
        void message.info(t({ id: 'pages.io.sync.apply.upToDate' }));
      } else {
        setPreviewResult(result.changes ?? []);
      }
    } catch {
      void message.error(t({ id: 'pages.io.sync.apply.error' }));
    } finally {
      setPreviewing(false);
    }
  }

  if (!configured) return null;

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="small">
      <Button loading={previewing} onClick={() => void handlePreview()}>
        {t({ id: 'pages.io.sync.apply.previewButton' })}
      </Button>

      {previewResult !== null && previewResult.length > 0 && (
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          {previewResult.map((ch) => (
            <Text key={ch.table} type="secondary" style={{ fontSize: 12 }}>
              {ch.display_name}: +{ch.added} ~{ch.modified} -{ch.deleted}
            </Text>
          ))}
          <Button
            type="primary"
            loading={confirm.isPending}
            onClick={() => confirm.mutate()}
          >
            {t({ id: 'pages.io.sync.apply.confirmButton' })}
          </Button>
        </Space>
      )}
    </Space>
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
      <ConfigSection />
      {configured && (
        <>
          <StatusSection configured={configured} />
          <Card size="small">
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <PublishSection configured={configured} />
              <ApplySection configured={configured} />
            </Space>
          </Card>
        </>
      )}
    </Space>
  );
}
