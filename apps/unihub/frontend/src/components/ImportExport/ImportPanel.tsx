import { useState } from 'react';
import {
  Alert,
  Button,
  Form,
  Input,
  Radio,
  Space,
  Typography,
  Upload,
  message,
} from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd';
import type { ImportPreviewResponse } from '@/services/unihub-backend/io';
import { importConfirm, importPreview } from '@/services/unihub-backend/io';
import { ChangePreviewTable } from './ChangePreviewTable';

const { TextArea } = Input;
const { Text } = Typography;
const { Dragger } = Upload;

type ImportMode = 'upsert' | 'replace';

interface ImportPanelProps {
  contentTypeLabel: string;
  displayName: string;
  onDone: () => void;
}

export function ImportPanel({ contentTypeLabel, displayName, onDone }: ImportPanelProps) {
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
    return false; // prevent antd auto-upload
  }

  async function handlePreview() {
    if (!csvText.trim()) {
      message.warning('Paste or upload a CSV file first.');
      return;
    }
    setPreviewing(true);
    setPreview(null);
    try {
      const result = await importPreview(contentTypeLabel, mode, csvText);
      setPreview(result);
    } catch {
      message.error('Preview failed. Please check your input.');
    } finally {
      setPreviewing(false);
    }
  }

  async function handleConfirm() {
    if (!csvText.trim()) return;
    setConfirming(true);
    try {
      const result = await importConfirm(contentTypeLabel, mode, csvText);
      const { created, updated, deleted } = result;
      message.success(
        `Import complete: ${created} created, ${updated} updated, ${deleted} deleted.`,
      );
      // Invalidation happens via the onDone callback — the parent re-fetches
      onDone();
    } catch {
      message.error('Import failed. Please try again.');
    } finally {
      setConfirming(false);
    }
  }

  const hasErrors = preview && preview.errors.length > 0;
  const hasChanges =
    preview &&
    !hasErrors &&
    (preview.creates.length > 0 || preview.updates.length > 0 || preview.deletes.length > 0);

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Text type="secondary">
        Import <strong>{displayName}</strong> data from a CSV file.
      </Text>

      <Form layout="vertical">
        <Form.Item label="Import mode">
          <Radio.Group
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as ImportMode);
              setPreview(null);
            }}
          >
            <Radio value="upsert">Upsert (add &amp; update, keep existing)</Radio>
            <Radio value="replace">Replace (sync exactly — deletes absent rows)</Radio>
          </Radio.Group>
        </Form.Item>

        {mode === 'replace' && (
          <Alert
            type="warning"
            showIcon
            message="Replace mode will delete any rows in the database that are not present in the CSV."
            style={{ marginBottom: 16 }}
          />
        )}

        <Form.Item label="CSV data">
          <Dragger
            accept=".csv,text/csv"
            beforeUpload={() => false}
            onChange={({ fileList }) => {
              const last = fileList[fileList.length - 1];
              if (last) handleFileRead(last);
            }}
            showUploadList={false}
            style={{ marginBottom: 8 }}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">Click or drag a CSV file here</p>
          </Dragger>
          <TextArea
            rows={8}
            placeholder="Or paste CSV text here…"
            value={csvText}
            onChange={(e) => {
              setCsvText(e.target.value);
              setPreview(null);
            }}
            style={{ fontFamily: 'monospace', fontSize: 12 }}
          />
        </Form.Item>
      </Form>

      <Space>
        <Button onClick={handlePreview} loading={previewing} disabled={!csvText.trim()}>
          Preview Changes
        </Button>
        {hasChanges && (
          <Button
            type="primary"
            danger={mode === 'replace' && (preview?.deletes.length ?? 0) > 0}
            onClick={handleConfirm}
            loading={confirming}
          >
            Confirm Import
          </Button>
        )}
        {hasErrors && (
          <Text type="danger">Fix validation errors before importing.</Text>
        )}
      </Space>

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
