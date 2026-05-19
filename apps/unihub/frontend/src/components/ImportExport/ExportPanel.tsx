import { useState } from 'react';
import { Button, Space, Typography, message } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { exportTables } from '@/services/unihub-backend/io';

const { Text } = Typography;

interface ExportPanelProps {
  contentTypeLabel: string;
  displayName: string;
}

export function ExportPanel({ contentTypeLabel, displayName }: ExportPanelProps) {
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      const blob = await exportTables([contentTypeLabel]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${contentTypeLabel.replace('.', '_')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      message.error('Export failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Text type="secondary">
        Download all <strong>{displayName}</strong> data as a CSV file.
      </Text>
      <Button
        type="primary"
        icon={<DownloadOutlined />}
        loading={loading}
        onClick={handleExport}
      >
        Download CSV
      </Button>
    </Space>
  );
}
