import { useState } from 'react';
import {
  Alert,
  Button,
  Collapse,
  Flex,
  Form,
  Input,
  Radio,
  Space,
  Splitter,
  Steps,
  Tabs,
  Tag,
  Tree,
  Typography,
  Upload,
  message,
  theme,
} from 'antd';
import {
  CopyOutlined,
  DownloadOutlined,
  ExclamationCircleFilled,
  FileOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import type { TreeDataNode } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useIntl } from 'react-intl';
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

type ImportMode = 'upsert' | 'replace';
type TableSource =
  | { kind: 'file'; fileName: string; csv: string }
  | { kind: 'paste'; csv: string }
  | null;

// Keys used for non-table nodes
const ALL_KEY = 'all';
const CAT_PREFIX = 'cat.';

// ── Helpers ──────────────────────────────────────────────────────────

function groupTables(tables: TableInfo[]): [string, TableInfo[]][] {
  const map = new Map<string, TableInfo[]>();
  for (const tbl of tables) {
    const seg = tbl.content_type_label.split('.')[0]!;
    const category = seg.charAt(0).toUpperCase() + seg.slice(1);
    if (!map.has(category)) map.set(category, []);
    map.get(category)!.push(tbl);
  }
  return Array.from(map.entries());
}

function matchFileToTable(filename: string, tables: TableInfo[]): TableInfo | undefined {
  const base = filename.replace(/\.csv$/i, '');
  return tables.find((t) => t.content_type_label.replace('.', '_') === base);
}

function isTableKey(key: string): boolean {
  return key !== ALL_KEY && !key.startsWith(CAT_PREFIX);
}

function buildTreeData(
  tables: TableInfo[],
  rootTitle: string,
  opts?: { rootSelectable?: boolean; categoriesSelectable?: boolean },
): TreeDataNode[] {
  return [
    {
      key: ALL_KEY,
      title: rootTitle,
      selectable: opts?.rootSelectable ?? true,
      children: groupTables(tables).map(([category, tbls]) => ({
        key: `${CAT_PREFIX}${category.toLowerCase()}`,
        title: category,
        selectable: opts?.categoriesSelectable ?? false,
        children: tbls.map((tbl) => ({
          key: tbl.content_type_label,
          title: tbl.display_name,
          isLeaf: true,
        })),
      })),
    },
  ];
}

// ── Export Section ────────────────────────────────────────────────────

function ExportSection({ tables }: { tables: TableInfo[] }) {
  const { formatMessage: t } = useIntl();
  const [checkedKeys, setCheckedKeys] = useState<string[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [copying, setCopying] = useState(false);

  const treeData = buildTreeData(tables, t({ id: 'pages.io.tree.allNode' }), {
    rootSelectable: false,
    categoriesSelectable: false,
  });

  const checkedTables = checkedKeys.filter(isTableKey);

  async function handleDownload() {
    setDownloading(true);
    try {
      const blob = await exportTables(checkedTables);
      const filename =
        checkedTables.length === 1
          ? `${checkedTables[0]!.replace('.', '_')}.csv`
          : `unihub-export-${new Date().toISOString().replace('T', '_').replace(/:/g, '').slice(0, 15)}.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      void message.success(t({ id: 'pages.io.export.success' }, { filename }));
    } catch {
      void message.error(t({ id: 'pages.io.export.error' }));
    } finally {
      setDownloading(false);
    }
  }

  async function handleCopy() {
    setCopying(true);
    try {
      const blob = await exportTables(checkedTables);
      await navigator.clipboard.writeText(await blob.text());
      void message.success(t({ id: 'pages.io.export.copySuccess' }));
    } catch {
      void message.error(t({ id: 'pages.io.export.copyError' }));
    } finally {
      setCopying(false);
    }
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      {/* Checkable tree — fills container width */}
      <div style={{ border: '1px solid #d9d9d9', borderRadius: 6, padding: '8px 0', overflow: 'auto', maxHeight: 480 }}>
        <Tree
          key={tables.length}
          checkable
          selectable={false}
          defaultExpandAll
          treeData={treeData}
          checkedKeys={checkedKeys}
          onCheck={(checked) => setCheckedKeys(checked as string[])}
        />
      </div>

      {/* Actions below the tree */}
      <Space size="small">
        <Button
          type="primary"
          size="large"
          icon={<DownloadOutlined />}
          loading={downloading}
          disabled={checkedTables.length === 0}
          onClick={handleDownload}
        >
          {checkedTables.length > 1
            ? t({ id: 'pages.io.export.downloadZip' }, { count: checkedTables.length })
            : t({ id: 'pages.io.export.downloadCsv' })}
        </Button>
        <Button
          size="large"
          icon={<CopyOutlined />}
          loading={copying}
          disabled={checkedTables.length !== 1}
          onClick={handleCopy}
        >
          {t({ id: 'pages.io.export.copyClipboard' })}
        </Button>
      </Space>
    </Space>
  );
}

// ── Mode Selector ─────────────────────────────────────────────────────

function ModeSelector({
  mode,
  onChange,
}: {
  mode: ImportMode;
  onChange: (m: ImportMode) => void;
}) {
  const { formatMessage: t } = useIntl();
  return (
    <Form.Item style={{ marginBottom: 0 }}>
      <Radio.Group value={mode} onChange={(e) => onChange(e.target.value as ImportMode)}>
        <Space direction="vertical">
          <Radio value="upsert">
            <strong>{t({ id: 'pages.io.import.mode.upsert.title' })}</strong>{' '}
            {t({ id: 'pages.io.import.mode.upsert.desc' })}
          </Radio>
          <Radio value="replace">
            <strong>{t({ id: 'pages.io.import.mode.replace.title' })}</strong>{' '}
            {t({ id: 'pages.io.import.mode.replace.desc' })}
          </Radio>
        </Space>
      </Radio.Group>
      {mode === 'replace' && (
        <Alert
          type="warning"
          showIcon
          message={t({ id: 'pages.io.import.mode.replace.warning' })}
          style={{ marginTop: 8 }}
        />
      )}
    </Form.Item>
  );
}

// ── Table Workspace (right panel for a table node) ────────────────────

function TableWorkspace({
  table,
  source,
  onFileSet,
  onPasteChange,
  onRemoveFile,
}: {
  table: TableInfo;
  source: TableSource;
  onFileSet: (fileName: string, csv: string) => void;
  onPasteChange: (csv: string) => void;
  onRemoveFile: () => void;
}) {
  const { formatMessage: t } = useIntl();

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <div>
        <Text strong style={{ fontSize: 15 }}>
          {table.display_name}
        </Text>
        <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
          {table.content_type_label}
        </Text>
      </div>

      {/* File dragger — always visible; dropping always switches to file mode */}
      <Dragger
        accept=".csv,text/csv"
        beforeUpload={(file) => {
          const f = file as unknown as File;
          void f.text().then((csv) => onFileSet(f.name, csv));
          return false;
        }}
        showUploadList={false}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">{t({ id: 'pages.io.import.panel.dragText' })}</p>
      </Dragger>

      {/* File badge (exclusive with textarea) */}
      {source?.kind === 'file' ? (
        <Flex
          align="center"
          gap={8}
          style={{
            padding: '8px 12px',
            background: '#f6ffed',
            border: '1px solid #b7eb8f',
            borderRadius: 6,
          }}
        >
          <FileOutlined style={{ color: '#52c41a' }} />
          <Text style={{ flex: 1 }} ellipsis>
            {source.fileName}
          </Text>
          <Button size="small" onClick={onRemoveFile}>
            {t({ id: 'common.remove' })}
          </Button>
        </Flex>
      ) : (
        /* Paste textarea (shown when no file is loaded) */
        <TextArea
          rows={8}
          placeholder={t({ id: 'pages.io.import.panel.pastePlaceholder' })}
          value={source?.kind === 'paste' ? source.csv : ''}
          onChange={(e) => onPasteChange(e.target.value)}
          style={{ fontFamily: 'monospace', fontSize: 12 }}
        />
      )}
    </Space>
  );
}

// ── Import Section ────────────────────────────────────────────────────

function ImportSection({ tables }: { tables: TableInfo[] }) {
  const { formatMessage: t } = useIntl();
  const queryClient = useQueryClient();

  const [activeKey, setActiveKey] = useState<string>(ALL_KEY);
  const [checkedKeys, setCheckedKeys] = useState<string[]>([]);
  const [tableSources, setTableSources] = useState<Record<string, TableSource>>({});
  const [noMatchWarning, setNoMatchWarning] = useState(false);
  const [mode, setMode] = useState<ImportMode>('upsert');
  const [previewMap, setPreviewMap] = useState<Record<string, ImportPreviewResponse> | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [importResult, setImportResult] = useState<
    | { kind: 'success'; created: number; updated: number; deleted: number }
    | { kind: 'error' }
    | null
  >(null);

  // ── Helpers ──────────────────────────────────────────────────────

  const checkedTables = checkedKeys.filter(isTableKey);
  const getTableCsv = (label: string) => tableSources[label]?.csv ?? '';
  const invalidChecked = checkedTables.filter((l) => !getTableCsv(l).trim());
  const previewDisabled = checkedTables.length === 0 || invalidChecked.length > 0;

  function autoCheckTable(label: string) {
    setCheckedKeys((prev) => (prev.includes(label) ? prev : [...prev, label]));
  }

  function clearPreviewForTable(label: string) {
    setPreviewMap((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      delete next[label];
      return Object.keys(next).length > 0 ? next : null;
    });
  }

  function setFileSource(label: string, fileName: string, csv: string) {
    setTableSources((prev) => ({ ...prev, [label]: { kind: 'file', fileName, csv } }));
    clearPreviewForTable(label);
    if (csv.trim()) autoCheckTable(label);
  }

  function setPasteSource(label: string, csv: string) {
    setTableSources((prev) => ({
      ...prev,
      [label]: csv ? { kind: 'paste', csv } : null,
    }));
    clearPreviewForTable(label);
    if (csv.trim()) autoCheckTable(label);
  }

  function removeFileSource(label: string) {
    setTableSources((prev) => {
      const next = { ...prev };
      delete next[label];
      return next;
    });
    clearPreviewForTable(label);
  }

  // ── "All" drop zone ───────────────────────────────────────────────

  async function handleAllFileDrop(file: File) {
    const tbl = matchFileToTable(file.name, tables);
    if (!tbl) {
      setNoMatchWarning(true);
      return;
    }
    setNoMatchWarning(false);
    const csv = await file.text();
    setFileSource(tbl.content_type_label, file.name, csv);
  }

  // ── Preview ───────────────────────────────────────────────────────

  async function handlePreviewChanges() {
    const toPreview = checkedTables.filter((l) => !!getTableCsv(l).trim());
    if (toPreview.length === 0) return;

    setPreviewing(true);
    setPreviewMap(null);
    try {
      const entries = await Promise.all(
        toPreview.map(async (label) => {
          const result = await importPreview(label, mode, getTableCsv(label));
          return [label, result] as const;
        }),
      );
      setPreviewMap(Object.fromEntries(entries));
    } catch {
      void message.error(t({ id: 'pages.io.import.panel.previewError' }));
    } finally {
      setPreviewing(false);
    }
  }

  // ── Confirm ───────────────────────────────────────────────────────

  async function handleConfirmImport() {
    if (!previewMap) return;

    const toConfirm = Object.entries(previewMap)
      .filter(([, p]) => p.errors.length === 0 && p.creates.length + p.updates.length + p.deletes.length > 0)
      .map(([label]) => label);

    if (toConfirm.length === 0) return;
    setConfirming(true);
    try {
      const results = await Promise.all(
        toConfirm.map((label) => importConfirm(label, mode, getTableCsv(label))),
      );
      const total = results.reduce(
        (acc, r) => ({ created: acc.created + r.created, updated: acc.updated + r.updated, deleted: acc.deleted + r.deleted }),
        { created: 0, updated: 0, deleted: 0 },
      );
      void queryClient.invalidateQueries();
      setImportResult({ kind: 'success', ...total });
    } catch {
      setImportResult({ kind: 'error' });
    } finally {
      setConfirming(false);
    }
  }

  function handleDone() {
    setTableSources({});
    setCheckedKeys([]);
    setPreviewMap(null);
    setActiveKey(ALL_KEY);
    setNoMatchWarning(false);
    setImportResult(null);
  }

  // ── Tree rendering ────────────────────────────────────────────────

  const treeData = buildTreeData(tables, t({ id: 'pages.io.tree.allNode' }), {
    rootSelectable: true,
    categoriesSelectable: false,
  });

  function renderNodeTitle(node: TreeDataNode): React.ReactNode {
    const key = node.key as string;
    if (key === ALL_KEY || key.startsWith(CAT_PREFIX)) return node.title as React.ReactNode;

    const isChecked = checkedTables.includes(key);
    const csv = getTableCsv(key);
    const hasCsv = !!csv.trim();
    const isInvalid = isChecked && !hasCsv;

    const preview = previewMap?.[key];
    const dotColor = !hasCsv
      ? undefined
      : !preview
        ? '#1677ff'
        : preview.errors.length > 0
          ? '#ff4d4f'
          : '#52c41a';

    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: dotColor ?? 'transparent',
            border: dotColor ? 'none' : '1px solid #d9d9d9',
            flexShrink: 0,
            display: 'inline-block',
          }}
        />
        <span style={{ color: isInvalid ? '#ff4d4f' : undefined }}>
          {node.title as string}
        </span>
        {isInvalid && (
          <ExclamationCircleFilled style={{ color: '#ff4d4f', fontSize: 11 }} />
        )}
      </span>
    );
  }

  // ── Right panel ───────────────────────────────────────────────────

  const activeTable = isTableKey(activeKey)
    ? (tables.find((t) => t.content_type_label === activeKey) ?? null)
    : null;

  const rightPanel =
    activeKey === ALL_KEY ? (
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Dragger
          accept=".csv,text/csv"
          multiple
          beforeUpload={(file) => {
            void handleAllFileDrop(file as unknown as File);
            return false;
          }}
          showUploadList={false}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">{t({ id: 'pages.io.import.dropzone.text' })}</p>
          <p className="ant-upload-hint">{t({ id: 'pages.io.import.dropzone.hint' })}</p>
        </Dragger>
        {noMatchWarning && (
          <Alert
            type="warning"
            showIcon
            message={t({ id: 'pages.io.import.dropzone.noMatch' })}
          />
        )}
      </Space>
    ) : activeTable ? (
      <TableWorkspace
        key={activeKey}
        table={activeTable}
        source={tableSources[activeKey] ?? null}
        onFileSet={(fileName, csv) => setFileSource(activeKey, fileName, csv)}
        onPasteChange={(csv) => setPasteSource(activeKey, csv)}
        onRemoveFile={() => removeFileSource(activeKey)}
      />
    ) : null;

  // ── Preview results collapse ──────────────────────────────────────

  const previewItems = previewMap
    ? Object.entries(previewMap).map(([label, preview]) => {
        const tbl = tables.find((tb) => tb.content_type_label === label);
        const hasErrors = preview.errors.length > 0;
        const total = preview.creates.length + preview.updates.length + preview.deletes.length;
        return {
          key: label,
          label: (
            <span>
              <Text strong>{tbl?.display_name ?? label}</Text>
              <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>({label})</Text>
              <span style={{ marginLeft: 8 }}>
                {hasErrors ? (
                  <Tag color="red">{preview.errors.length} errors</Tag>
                ) : (
                  <>
                    {preview.creates.length > 0 && <Tag color="green">+{preview.creates.length}</Tag>}
                    {preview.updates.length > 0 && <Tag color="orange">~{preview.updates.length}</Tag>}
                    {preview.deletes.length > 0 && <Tag color="red">-{preview.deletes.length}</Tag>}
                    {total === 0 && <Tag>no changes</Tag>}
                  </>
                )}
              </span>
            </span>
          ),
          children: (
            <ChangePreviewTable
              creates={preview.creates}
              updates={preview.updates}
              deletes={preview.deletes}
              errors={preview.errors}
            />
          ),
        };
      })
    : [];

  const hasAnyErrors = previewMap
    ? Object.values(previewMap).some((p) => p.errors.length > 0)
    : false;
  const hasAnyChanges = previewMap
    ? Object.values(previewMap).some((p) => p.creates.length + p.updates.length + p.deletes.length > 0)
    : false;

  const currentStep = importResult !== null
    ? 3
    : previewMap !== null
      ? 2
      : checkedTables.some((l) => !!getTableCsv(l).trim())
        ? 1
        : 0;

  return (
    <Steps
      direction="vertical"
      current={currentStep}
      items={[
        {
          title: t({ id: 'pages.io.import.step.data' }),
          description: (
            <div style={{ paddingTop: 8 }}>
              <Splitter
                style={{
                  border: '1px solid #d9d9d9',
                  borderRadius: 6,
                  height: 'auto',
                }}
              >
                <Splitter.Panel defaultSize="30%" min="20%" max="50%">
                  <div style={{ padding: '8px 4px', overflowY: 'auto', maxHeight: 600 }}>
                    <Tree
                      key={tables.length}
                      checkable
                      defaultExpandAll
                      treeData={treeData}
                      checkedKeys={checkedKeys}
                      onCheck={(checked) => setCheckedKeys(checked as string[])}
                      selectedKeys={[activeKey]}
                      onSelect={(keys) => {
                        if (keys.length > 0) setActiveKey(keys[0] as string);
                      }}
                      titleRender={renderNodeTitle}
                    />
                  </div>
                </Splitter.Panel>
                <Splitter.Panel>
                  <div style={{ padding: 20, overflowY: 'auto', maxHeight: 600 }}>
                    {rightPanel}
                  </div>
                </Splitter.Panel>
              </Splitter>
            </div>
          ),
        },
        {
          title: t({ id: 'pages.io.import.step.mode' }),
          description: (
            <div style={{ paddingTop: 8 }}>
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <Form layout="vertical" style={{ maxWidth: 640 }}>
                  <ModeSelector mode={mode} onChange={setMode} />
                </Form>
                <Button
                  type="primary"
                  size="large"
                  loading={previewing}
                  disabled={previewDisabled}
                  onClick={handlePreviewChanges}
                >
                  {t({ id: 'pages.io.import.panel.preview' })}
                </Button>
              </Space>
            </div>
          ),
        },
        {
          title: t({ id: 'pages.io.import.step.preview' }),
          description: previewMap ? (
            <div style={{ paddingTop: 8 }}>
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <Collapse
                  items={previewItems}
                  defaultActiveKey={
                    Object.entries(previewMap)
                      .filter(([, p]) => p.creates.length + p.updates.length + p.deletes.length + p.errors.length > 0)
                      .map(([label]) => label)
                  }
                />
                {hasAnyErrors && (
                  <Alert type="error" showIcon message={t({ id: 'pages.io.import.panel.hasErrors' })} />
                )}
                {!hasAnyErrors && !hasAnyChanges && (
                  <Alert type="success" showIcon message={t({ id: 'pages.io.import.panel.noChanges' })} />
                )}
                {hasAnyChanges && !hasAnyErrors && (
                  <Button
                    type="primary"
                    size="large"
                    loading={confirming}
                    onClick={handleConfirmImport}
                  >
                    {t({ id: 'pages.io.import.panel.confirm' })}
                  </Button>
                )}
              </Space>
            </div>
          ) : undefined,
        },
        {
          title: t({ id: 'pages.io.import.step.result' }),
          description: importResult ? (
            <div style={{ paddingTop: 8 }}>
              <Space direction="vertical" size="middle">
                {importResult.kind === 'success' ? (
                  <Alert
                    type="success"
                    showIcon
                    message={t(
                      { id: 'pages.io.import.panel.importSuccess' },
                      { created: importResult.created, updated: importResult.updated, deleted: importResult.deleted },
                    )}
                  />
                ) : (
                  <Alert type="error" showIcon message={t({ id: 'pages.io.import.panel.importError' })} />
                )}
                <Button size="large" onClick={handleDone}>
                  {t({ id: 'pages.io.import.result.done' })}
                </Button>
              </Space>
            </div>
          ) : undefined,
        },
      ]}
    />
  );
}

// ── Page ──────────────────────────────────────────────────────────────

export function IoPage() {
  const { formatMessage: t } = useIntl();
  const { token } = theme.useToken();
  const { data: tables = [], isError } = useQuery({
    queryKey: ['io', 'tables'],
    queryFn: listTables,
  });

  if (isError) {
    return <Alert type="error" message={t({ id: 'pages.io.loadError' })} />;
  }

  const tabs = [
    {
      key: 'export',
      label: t({ id: 'pages.io.tab.export' }),
      children: <ExportSection tables={tables} />,
    },
    {
      key: 'import',
      label: t({ id: 'pages.io.tab.import' }),
      children: <ImportSection tables={tables} />,
    },
  ];

  return (
    <div
      style={{
        background: token.colorBgContainer,
        borderRadius: token.borderRadiusLG,
      }}
    >
      <Flex
        justify="space-between"
        align="center"
        style={{ padding: '16px 24px' }}
      >
        <Title level={4} style={{ margin: 0 }}>
          {t({ id: 'pages.io.title' })}
        </Title>
      </Flex>

      <div style={{ padding: '0 24px 24px' }}>
        <Tabs defaultActiveKey="export" items={tabs} size="large" />
      </div>
    </div>
  );
}
