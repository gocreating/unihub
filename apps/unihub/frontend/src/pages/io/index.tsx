import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Collapse,
  Form,
  Input,
  Radio,
  Select,
  Space,
  Tabs,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd';
import { DownloadOutlined, InboxOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ImportPreviewResponse,
  TableInfo,
  ZipTablePreviewResult,
} from '@/services/unihub-backend/io';
import {
  exportTables,
  importConfirm,
  importPreview,
  importZipConfirm,
  importZipPreview,
  listTables,
} from '@/services/unihub-backend/io';
import { ChangePreviewTable } from '@/components/ImportExport/ChangePreviewTable';

const { TextArea } = Input;
const { Text, Title } = Typography;
const { Dragger } = Upload;

// ── Helpers ──────────────────────────────────────────────────────────

function groupTables(tables: TableInfo[]): [string, TableInfo[]][] {
  const map = new Map<string, TableInfo[]>();
  for (const t of tables) {
    const category =
      t.content_type_label.split('.')[0]!.charAt(0).toUpperCase() +
      t.content_type_label.split('.')[0]!.slice(1);
    if (!map.has(category)) map.set(category, []);
    map.get(category)!.push(t);
  }
  return Array.from(map.entries());
}

// ── Export Section ────────────────────────────────────────────────────

function ExportSection({ tables }: { tables: TableInfo[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const groups = groupTables(tables);

  async function handleExport() {
    if (selected.length === 0) {
      message.warning('Select at least one table to export.');
      return;
    }
    setLoading(true);
    try {
      const blob = await exportTables(selected);
      let filename: string;
      if (selected.length === 1) {
        filename = `${selected[0]!.replace('.', '_')}.csv`;
      } else {
        const ts = new Date()
          .toISOString()
          .replace('T', '_')
          .replace(/:/g, '')
          .slice(0, 15);
        filename = `unihub-export-${ts}.zip`;
      }
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

  const allLabels = tables.map((t) => t.content_type_label);
  const allChecked = selected.length === allLabels.length;
  const indeterminate = selected.length > 0 && !allChecked;

  function toggleGroup(groupLabels: string[], checked: boolean) {
    if (checked) {
      setSelected((prev) => Array.from(new Set([...prev, ...groupLabels])));
    } else {
      setSelected((prev) => prev.filter((l) => !groupLabels.includes(l)));
    }
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Text type="secondary">
        Select tables to download. Single table → <strong>.csv</strong>; multiple tables →{' '}
        <strong>.zip</strong> archive with timestamp in filename.
      </Text>

      <Card size="small" style={{ maxWidth: 480 }}>
        <Checkbox
          indeterminate={indeterminate}
          checked={allChecked}
          onChange={(e) => setSelected(e.target.checked ? allLabels : [])}
          style={{ marginBottom: 12, fontWeight: 600 }}
        >
          Select all
        </Checkbox>

        {groups.map(([category, groupTables]) => {
          const groupLabels = groupTables.map((t) => t.content_type_label);
          const groupChecked = groupLabels.every((l) => selected.includes(l));
          const groupIndeterminate =
            groupLabels.some((l) => selected.includes(l)) && !groupChecked;
          return (
            <div key={category} style={{ marginBottom: 12 }}>
              <Checkbox
                indeterminate={groupIndeterminate}
                checked={groupChecked}
                onChange={(e) => toggleGroup(groupLabels, e.target.checked)}
                style={{ fontWeight: 600, marginBottom: 4 }}
              >
                {category}
              </Checkbox>
              <div style={{ paddingLeft: 24, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {groupTables.map((t) => (
                  <Checkbox
                    key={t.content_type_label}
                    value={t.content_type_label}
                    checked={selected.includes(t.content_type_label)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelected((prev) => [...prev, t.content_type_label]);
                      } else {
                        setSelected((prev) => prev.filter((l) => l !== t.content_type_label));
                      }
                    }}
                  >
                    {t.display_name}{' '}
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      ({t.content_type_label})
                    </Text>
                  </Checkbox>
                ))}
              </div>
            </div>
          );
        })}
      </Card>

      <Button
        type="primary"
        icon={<DownloadOutlined />}
        loading={loading}
        disabled={selected.length === 0}
        onClick={handleExport}
        size="large"
      >
        {selected.length === 0
          ? 'Download'
          : selected.length === 1
            ? 'Download CSV'
            : `Download ZIP (${selected.length} tables)`}
      </Button>
    </Space>
  );
}

// ── Import: Single Table ──────────────────────────────────────────────

type ImportMode = 'upsert' | 'replace';

function SingleTableImport({ tables }: { tables: TableInfo[] }) {
  const queryClient = useQueryClient();
  const groups = groupTables(tables);
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
      setPreview(await importPreview(tableLabel, mode, csvText));
    } catch {
      message.error('Preview failed.');
    } finally {
      setPreviewing(false);
    }
  }

  async function handleConfirm() {
    if (!tableLabel || !csvText.trim()) return;
    setConfirming(true);
    try {
      const r = await importConfirm(tableLabel, mode, csvText);
      message.success(`Done: ${r.created} created, ${r.updated} updated, ${r.deleted} deleted.`);
      queryClient.invalidateQueries();
      setPreview(null);
      setCsvText('');
    } catch {
      message.error('Import failed.');
    } finally {
      setConfirming(false);
    }
  }

  const groupedOptions = groups.map(([category, ts]) => ({
    label: category,
    options: ts.map((t) => ({ value: t.content_type_label, label: t.display_name })),
  }));

  const hasErrors = !!preview && preview.errors.length > 0;
  const hasChanges =
    !!preview &&
    !hasErrors &&
    (preview.creates.length > 0 || preview.updates.length > 0 || preview.deletes.length > 0);
  const noChanges = !!preview && !hasErrors && !hasChanges;

  return (
    <Space direction="vertical" style={{ width: '100%', maxWidth: 680 }} size="large">
      <Form layout="vertical">
        <Form.Item label="Table" required>
          <Select
            placeholder="Select a table"
            options={groupedOptions}
            value={tableLabel}
            onChange={(v) => { setTableLabel(v); setPreview(null); }}
            showSearch
            optionFilterProp="label"
            style={{ maxWidth: 380 }}
          />
        </Form.Item>

        <ModeSelector mode={mode} onChange={(m) => { setMode(m); setPreview(null); }} />

        <Form.Item label="CSV data" required>
          <Dragger
            accept=".csv,text/csv"
            beforeUpload={() => false}
            onChange={({ fileList }) => { const last = fileList[fileList.length - 1]; if (last) handleFileRead(last); }}
            showUploadList={false}
            style={{ marginBottom: 8 }}
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">Click or drag a CSV file here</p>
          </Dragger>
          <TextArea
            rows={8}
            placeholder="Or paste CSV text here…"
            value={csvText}
            onChange={(e) => { setCsvText(e.target.value); setPreview(null); }}
            style={{ fontFamily: 'monospace', fontSize: 12 }}
          />
        </Form.Item>
      </Form>

      <Space>
        <Button onClick={handlePreview} loading={previewing} disabled={!tableLabel || !csvText.trim()} size="large">
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

      {hasErrors && <Alert type="error" showIcon message="Fix validation errors before importing." />}
      {noChanges && <Alert type="success" showIcon message="No changes — the database already matches this CSV." />}
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

// ── Import: Multi-table ZIP ───────────────────────────────────────────

function ZipImport() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<ImportMode>('upsert');
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ZipTablePreviewResult[] | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function handlePreview() {
    if (!zipFile) return;
    setPreviewing(true);
    setPreview(null);
    try {
      setPreview(await importZipPreview(zipFile, mode));
    } catch {
      message.error('Preview failed. Check the ZIP file.');
    } finally {
      setPreviewing(false);
    }
  }

  async function handleConfirm() {
    if (!zipFile) return;
    setConfirming(true);
    try {
      const results = await importZipConfirm(zipFile, mode);
      const total = results.reduce(
        (acc, r) => ({
          created: acc.created + r.created,
          updated: acc.updated + r.updated,
          deleted: acc.deleted + r.deleted,
        }),
        { created: 0, updated: 0, deleted: 0 },
      );
      message.success(
        `Import complete across ${results.length} tables: ${total.created} created, ${total.updated} updated, ${total.deleted} deleted.`,
      );
      queryClient.invalidateQueries();
      setPreview(null);
      setZipFile(null);
    } catch {
      message.error('Import failed.');
    } finally {
      setConfirming(false);
    }
  }

  const anyErrors = preview?.some((r) => r.errors.length > 0) ?? false;
  const anyChanges =
    preview?.some(
      (r) => r.creates.length > 0 || r.updates.length > 0 || r.deletes.length > 0,
    ) ?? false;

  const collapseItems = preview?.map((r) => {
    const total = r.creates.length + r.updates.length + r.deletes.length;
    const hasErr = r.errors.length > 0;
    return {
      key: r.table_label,
      label: (
        <span>
          <Text strong>{r.display_name}</Text>{' '}
          <Text type="secondary" style={{ fontSize: 12 }}>
            ({r.table_label})
          </Text>{' '}
          {hasErr ? (
            <Tag color="red">{r.errors.length} errors</Tag>
          ) : (
            <>
              {r.creates.length > 0 && <Tag color="green">+{r.creates.length}</Tag>}
              {r.updates.length > 0 && <Tag color="orange">~{r.updates.length}</Tag>}
              {r.deletes.length > 0 && <Tag color="red">-{r.deletes.length}</Tag>}
              {total === 0 && <Tag>no changes</Tag>}
            </>
          )}
        </span>
      ),
      children: (
        <ChangePreviewTable
          creates={r.creates}
          updates={r.updates}
          deletes={r.deletes}
          errors={r.errors}
        />
      ),
    };
  });

  return (
    <Space direction="vertical" style={{ width: '100%', maxWidth: 760 }} size="large">
      <Text type="secondary">
        Upload a <strong>.zip</strong> file previously exported from this system. All recognized
        tables inside will be imported in the correct order.
      </Text>

      <Form layout="vertical">
        <ModeSelector mode={mode} onChange={(m) => { setMode(m); setPreview(null); }} />

        <Form.Item label="ZIP file" required>
          <Dragger
            accept=".zip,application/zip"
            beforeUpload={(file) => { setZipFile(file); setPreview(null); return false; }}
            showUploadList={!!zipFile}
            maxCount={1}
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">Click or drag a ZIP file here</p>
            <p className="ant-upload-hint">
              Must be a .zip exported from the Export tab
            </p>
          </Dragger>
        </Form.Item>
      </Form>

      <Space>
        <Button onClick={handlePreview} loading={previewing} disabled={!zipFile} size="large">
          Preview Changes
        </Button>
        {preview && anyChanges && !anyErrors && (
          <Button
            type="primary"
            danger={mode === 'replace'}
            onClick={handleConfirm}
            loading={confirming}
            size="large"
          >
            Confirm Import
          </Button>
        )}
      </Space>

      {preview && !anyChanges && !anyErrors && (
        <Alert type="success" showIcon message="No changes — all tables already match the ZIP." />
      )}

      {preview && collapseItems && collapseItems.length > 0 && (
        <Collapse items={collapseItems} defaultActiveKey={preview.map((r) => r.table_label)} />
      )}
    </Space>
  );
}

// ── Shared mode selector ──────────────────────────────────────────────

function ModeSelector({ mode, onChange }: { mode: ImportMode; onChange: (m: ImportMode) => void }) {
  return (
    <Form.Item label="Import mode" required>
      <Radio.Group value={mode} onChange={(e) => onChange(e.target.value as ImportMode)}>
        <Space direction="vertical">
          <Radio value="upsert">
            <strong>Upsert</strong> — add new rows and update existing ones; rows absent from the
            source are left untouched
          </Radio>
          <Radio value="replace">
            <strong>Replace</strong> — sync exactly; rows absent from the source are{' '}
            <Text type="danger">deleted</Text>
          </Radio>
        </Space>
      </Radio.Group>
      {mode === 'replace' && (
        <Alert
          type="warning"
          showIcon
          message="Replace mode permanently deletes rows not present in the source."
          style={{ marginTop: 8 }}
        />
      )}
    </Form.Item>
  );
}

// ── Import Section (tabbed: single / multi-table) ─────────────────────

function ImportSection({ tables }: { tables: TableInfo[] }) {
  const importTabs = [
    {
      key: 'single',
      label: 'Single table (CSV)',
      children: <SingleTableImport tables={tables} />,
    },
    {
      key: 'zip',
      label: 'Multiple tables (ZIP)',
      children: <ZipImport />,
    },
  ];
  return <Tabs defaultActiveKey="single" items={importTabs} />;
}

// ── Page ──────────────────────────────────────────────────────────────

export function IoPage() {
  const { data: tables = [], isError } = useQuery({
    queryKey: ['io', 'tables'],
    queryFn: listTables,
  });

  if (isError) {
    return <Alert type="error" message="Failed to load table registry." />;
  }

  const tabs = [
    { key: 'export', label: 'Export', children: <ExportSection tables={tables} /> },
    { key: 'import', label: 'Import', children: <ImportSection tables={tables} /> },
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
