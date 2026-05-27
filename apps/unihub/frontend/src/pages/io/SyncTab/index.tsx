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
  Typography,
  message,
} from 'antd';
import {
  CheckCircleOutlined,
  CloudDownloadOutlined,
  CloudUploadOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useIntl } from 'react-intl';
import type { SyncApplyChange, SyncConfigWrite } from '@/services/unihub-backend/sync';
import {
  confirmApply,
  forcePublishSync,
  getApplyPreview,
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

// ── Actions Card (publish + apply in one place) ───────────────────────

function ActionsCard({ configured }: { configured: boolean }) {
  const { formatMessage: t } = useIntl();
  const queryClient = useQueryClient();
  const [diverged, setDiverged] = useState(false);
  const [previewResult, setPreviewResult] = useState<SyncApplyChange[] | null>(null);
  const [previewing, setPreviewing] = useState(false);

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
    <>
      <Card size="small">
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Space wrap>
            <Button
              type="primary"
              icon={<CloudUploadOutlined />}
              loading={publish.isPending}
              onClick={() => publish.mutate()}
              disabled={forcePublish.isPending}
            >
              {t({ id: 'pages.io.sync.publish.button' })}
            </Button>
            <Button
              icon={<CloudDownloadOutlined />}
              loading={previewing}
              onClick={() => void handlePreview()}
            >
              {t({ id: 'pages.io.sync.apply.previewButton' })}
            </Button>
          </Space>

          {previewResult !== null && previewResult.length > 0 && (
            <Space direction="vertical" style={{ width: '100%' }} size="small">
              {previewResult.map((ch) => (
                <Text key={ch.table} type="secondary" style={{ fontSize: 12 }}>
                  {ch.display_name}: +{ch.added} ~{ch.modified} -{ch.deleted}
                </Text>
              ))}
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                loading={confirm.isPending}
                onClick={() => confirm.mutate()}
              >
                {t({ id: 'pages.io.sync.apply.confirmButton' })}
              </Button>
            </Space>
          )}
        </Space>
      </Card>

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
          <ActionsCard configured={configured} />
          <ConfigSection configured={configured} />
        </>
      ) : (
        <ConfigSection configured={false} />
      )}
    </Space>
  );
}
