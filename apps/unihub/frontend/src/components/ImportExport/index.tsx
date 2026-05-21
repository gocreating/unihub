import { Drawer, Tabs } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { ExportPanel } from './ExportPanel';
import { ImportPanel } from './ImportPanel';

export interface ImportExportDrawerProps {
  open: boolean;
  onClose: () => void;
  contentTypeLabel: string;
  displayName: string;
  /** Query keys to invalidate after a successful import */
  invalidateKeys?: string[][];
}

export function ImportExportDrawer({
  open,
  onClose,
  contentTypeLabel,
  displayName,
  invalidateKeys = [],
}: ImportExportDrawerProps) {
  const queryClient = useQueryClient();

  function handleImportDone() {
    for (const key of invalidateKeys) {
      queryClient.invalidateQueries({ queryKey: key });
    }
    onClose();
  }

  const tabs = [
    {
      key: 'export',
      label: 'Export',
      children: (
        <ExportPanel contentTypeLabel={contentTypeLabel} displayName={displayName} />
      ),
    },
    {
      key: 'import',
      label: 'Import',
      children: (
        <ImportPanel
          contentTypeLabel={contentTypeLabel}
          displayName={displayName}
          onDone={handleImportDone}
        />
      ),
    },
  ];

  return (
    <Drawer
      title={`Import / Export — ${displayName}`}
      open={open}
      onClose={onClose}
      width={600}
      destroyOnClose
    >
      <Tabs defaultActiveKey="export" items={tabs} />
    </Drawer>
  );
}
