import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  Radio,
  Select,
  Space,
  Tabs,
  Typography,
  Upload,
  message,
} from 'antd';
import { DownloadOutlined, InboxOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import type { ImportPreviewResponse, TableInfo } from '@/services/unihub-backend/io';
import {
  exportTables,
  importConfirm,
  importPreview,
  listTables,
} from '@/services/unihub-backend/io';
import { ChangePreviewTable } from '@/components/ImportExport/ChangePreviewTable';

const { TextArea } = Input;
const { Text, Title } = Typography;
const { Dragger } = Upload;

// ── Export Panel ─────────────────────────────────────────────────────

function ExportSection({ tables }: { tables: TableInfo[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    if (selected.length === 0) {
      message.warning('Select at least one table to export.');
      return;
    }
    setLoading(true);
    try {
      const blob = await exportTables(selected);
      const isSingle = selected.length === 1;
      const filename = isSingle
        ? `${selected[0]!.replace('.', '_')}.csv`
        : 'export.zip';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      message.success(`Downloaded ${filename}`);
    } catch {
      message.error('Export failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const allChecked = selected.length === tables.length;
  const indeterminate = selected.length > 0 && !allChecked;

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Text type="secondary">
        Select one or more tables to download. A single table downloads as <strong>.csv</strong>;
        multiple tables download as a <strong>.zip</strong> archive.
      </Text>

      <Card size="small" style={{ maxWidth: 520 }}>
        <Checkbox
          indeterminate={indeterminate}
          checked={allChecked}
          onChange={(e) => setSelected(e.target.checked ? tables.map((t) => t.content_type_label) : [])}
          style={{ marginBottom: 12, fontWeight: 600 }}
        >
          Select all
        </Checkbox>
        <Checkbox.Group
          value={selected}
          onChange={(vals) => setSelected(vals as string[])}
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          {tables.map((t) => (
            <Checkbox key={t.content_type_label} value={t.content_type_label}>
              <Text strong>{t.display_name}</Text>{' '}
              <Text type="secondary" style={{ fontSize: 12 }}>
                ({t.content_type_label})
              </Text>
            </Checkbox>
          ))}
        </Checkbox.Group>
      </Card>

      <Button
        type="primary"
        icon={<DownloadOutlined />}
        loading={loading}
        disabled={selected.length === 0}
        onClick={handleExport}
        size="large"
      >
        {selected.length <= 1 ? 'Download CSV' : `Download ZIP (${selected.length} tables)`}
      </Button>
    </Space>
  );
}

// ── Import Panel ─────────────────────────────────────────────────────

type ImportMode = 'upsert' | 'replace';

function ImportSection({ tables }: { tables: TableInfo[] }) {
  const queryClient = useQueryClient();
  const [tableLabel, setTableLabel] = useState<string | undefined>();
  const [mode, setMode] = useState<ImportMode>('upsert');
  const [csvText, setCsvText] = useState('');
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  function handleFileRead(file: UploadFile) {
    const raw = file.originFileObj ?? (file as unknown as File);
    const reader = new FileReader();
    reader.onload = (e) => {
      setCsvText((e.target?.result as string) ?? '');
      setPreview(null);
    };
    reader.readAsText(raw as Blob);
    return false;
  }

  async function handlePreview() {
    if (!tableLabel || !csvText.trim()) return;
    setPreviewing(true);
    setPreview(null);
    try {
      const result = await importPreview(tableLabel, mode, csvText);
      setPreview(result);
    } catch {
      message.error('Preview failed. Please check your input.');
    } finally {
      setPreviewing(false);
    }
  }

  async function handleConfirm() {
    if (!tableLabel || !csvText.trim()) return;
    setConfirming(true);
    try {
      const result = await importConfirm(tableLabel, mode, csvText);
      message.success(
        `Import complete: ${result.created} created, ${result.updated} updated, ${result.deleted} deleted.`,
      );
      queryClient.invalidateQueries();
      setPreview(null);
      setCsvText('');
    } catch {
      message.error('Import failed. Please try again.');
    } finally {
      setConfirming(false);
    }
  }

  const tableOptions = tables.map((t) => ({
    value: t.content_type_label,
    label: `${t.display_name} (${t.content_type_label})`,
  }));

  const hasErrors = !!preview && preview.errors.length > 0;
  const hasChanges =
    !!preview &&
    !hasErrors &&
    (preview.creates.length > 0 || preview.updates.length > 0 || preview.deletes.length > 0);
  const noChanges = !!preview && !hasErrors && !hasChanges;

  return (
    <Space direction="vertical" style={{ width: '100%', maxWidth: 720 }} size="large">
      <Form layout="vertical">
        <Form.Item label="Table" required>
          <Select
            placeholder="Select a table to import into"
            options={tableOptions}
            value={tableLabel}
            onChange={(v) => {
              setTableLabel(v);
              setPreview(null);
            }}
            showSearch
            optionFilterProp="label"
            style={{ maxWidth: 400 }}
          />
        </Form.Item>

        <Form.Item label="Import mode" required>
          <Radio.Group
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as ImportMode);
              setPreview(null);
            }}
          >
            <Radio value="upsert">
              <strong>Upsert</strong> — add new rows and update existing ones; rows absent from the
              CSV are left untouched
            </Radio>
            <Radio value="replace">
              <strong>Replace</strong> — sync table exactly to the CSV; rows absent from the CSV
              are deleted
            </Radio>
          </Radio.Group>
        </Form.Item>

        {mode === 'replace' && (
          <Alert
            type="warning"
            showIcon
            message="Replace mode deletes any rows not present in the CSV. This cannot be undone."
            style={{ marginBottom: 16, maxWidth: 520 }}
          />
        )}

        <Form.Item label="CSV data" required>
          <Dragger
            accept=".csv,text/csv"
            beforeUpload={() => false}
            onChange={({ fileList }) => {
              const last = fileList[fileList.length - 1];
              if (last) handleFileRead(last);
            }}
            showUploadList={false}
            style={{ marginBottom: 8, maxWidth: 520 }}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">Click or drag a CSV file here</p>
            <p className="ant-upload-hint">Or paste CSV text in the box below</p>
          </Dragger>
          <TextArea
            rows={10}
            placeholder="Paste CSV text here…"
            value={csvText}
            onChange={(e) => {
              setCsvText(e.target.value);
              setPreview(null);
            }}
            style={{ fontFamily: 'monospace', fontSize: 12, maxWidth: 520 }}
          />
        </Form.Item>
      </Form>

      <Space>
        <Button
          onClick={handlePreview}
          loading={previewing}
          disabled={!tableLabel || !csvText.trim()}
          size="large"
        >
          Preview Changes
        </Button>
        {hasChanges && (
          <Button
            type="primary"
            danger={mode === 'replace' && (preview?.deletes.length ?? 0) > 0}
            onClick={handleConfirm}
            loading={confirming}
            size="large"
          >
            Confirm Import
          </Button>
        )}
      </Space>

      {hasErrors && (
        <Alert type="error" showIcon message="Fix validation errors before importing." />
      )}
      {noChanges && (
        <Alert type="success" showIcon message="No changes — the database already matches this CSV." />
      )}

      {preview && (
        <ChangePreviewTable
          creates={preview.creates}
          updates={preview.updates}
          deletes={preview.deletes}
          errors={preview.errors}
        />
      )}
    </Space>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

export function IoPage() {
  const { data: tables = [], isError } = useQuery({
    queryKey: ['io', 'tables'],
    queryFn: listTables,
  });

  if (isError) {
    return <Alert type="error" message="Failed to load table registry." />;
  }

  const tabs = [
    {
      key: 'export',
      label: 'Export',
      children: <ExportSection tables={tables} />,
    },
    {
      key: 'import',
      label: 'Import',
      children: <ImportSection tables={tables} />,
    },
  ];

  return (
    <div style={{ padding: '24px 32px' }}>
      <Title level={3} style={{ marginBottom: 24 }}>
        Import / Export
      </Title>
      <Tabs defaultActiveKey="export" items={tabs} size="large" />
    </div>
  );
}
