/**
 * ManageViewsModal — organize saved views (016, US4).
 *
 * All edits are STAGED locally: rename (inline input), pin/unpin, drag
 * reorder (shared SortableList), delete (row leaves the list). Round 3: the
 * default holder sits in the SAME list — draggable and renamable — with its
 * pin and delete disabled (the guaranteed fallback). NOTHING hits
 * the API until Save; Save with staged deletions confirms first via
 * Modal.confirm (okType danger, ICU-plural count — constitution delete gate).
 * Footer: Cancel flushed left, primary Save right; no outside-click close.
 */
import { useEffect, useState } from 'react';
import { Button, Input, Modal } from 'antd';
import { DeleteOutlined, HolderOutlined, PushpinFilled, PushpinOutlined } from '@ant-design/icons';
import { createStyles } from 'antd-style';
import { useIntl } from 'react-intl';
import { SortableList } from '../EntityToolbar/SortableList';
import type { ManageChanges, UseEntityViewsReturn } from './useEntityViews';

const useStyles = createStyles(({ token }) => ({
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: token.marginXS,
    padding: '4px 0',
  },
  handle: {
    cursor: 'grab',
    color: token.colorTextTertiary,
  },
  name: {
    flex: 1,
    minWidth: 0,
  },
  list: {
    maxHeight: '60vh',
    overflowY: 'auto',
  },
  empty: {
    color: token.colorTextTertiary,
    textAlign: 'center',
    padding: token.paddingLG,
  },
}));

interface StagedItem {
  id: string;
  name: string;
  pinned: boolean;
  /** The view holding the default role: draggable and renamable like any
   *  other (round 3), but never unpinnable and never deletable (FR-003). */
  isDefault: boolean;
}

export interface ManageViewsModalProps {
  open: boolean;
  views: UseEntityViewsReturn;
  onClose: () => void;
}

export function ManageViewsModal({ open, views, onClose }: ManageViewsModalProps) {
  const { styles } = useStyles();
  const { formatMessage: t } = useIntl();
  const [items, setItems] = useState<StagedItem[]>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // (Re)stage from the live saved-view list each time the modal opens.
  useEffect(() => {
    if (!open) return;
    // Round 3: ONE list in position order — the default view is ordered and
    // dragged like any other view (R28).
    setItems(
      views.savedViews.map(({ id, name, pinned, is_default }) => ({
        id,
        name,
        pinned,
        isDefault: is_default,
      })),
    );
    setDeletedIds([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const commit = async () => {
    setSaving(true);
    try {
      const changes: ManageChanges = {
        items: items.map(({ id, name, pinned }) => ({ id, name, pinned })),
        deletedIds,
      };
      await views.commitManageChanges(changes);
      onClose();
    } catch {
      // commitManageChanges already surfaced the error message; stay open.
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    if (deletedIds.length === 0) {
      void commit();
      return;
    }
    Modal.confirm({
      title: t({ id: 'common.entityViews.deleteConfirmTitle' }, { n: deletedIds.length }),
      content: t({ id: 'common.entityViews.deleteConfirmBody' }, { n: deletedIds.length }),
      okType: 'danger',
      onOk: () => commit(),
    });
  };

  const patchItem = (id: string, patch: Partial<StagedItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  return (
    <Modal
      title={t({ id: 'common.entityViews.manageTitle' })}
      open={open}
      onCancel={onClose}
      maskClosable={false}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Button onClick={onClose}>{t({ id: 'common.cancel' })}</Button>
          <Button type="primary" loading={saving} onClick={handleSave}>
            {t({ id: 'common.entityViews.save' })}
          </Button>
        </div>
      }
    >
      <div className={styles.list}>
        {items.length === 0 ? (
          <div className={styles.empty}>{t({ id: 'common.entityViews.noSaved' })}</div>
        ) : (
          <SortableList
            items={items}
            onReorder={setItems}
            renderItem={(item, handleProps) => (
              <div
                className={styles.row}
                data-testid={item.isDefault ? 'manage-default-row' : undefined}
              >
                <span {...handleProps} className={styles.handle}>
                  <HolderOutlined />
                </span>
                <Input
                  className={styles.name}
                  value={item.name}
                  maxLength={100}
                  onChange={(e) => patchItem(item.id, { name: e.target.value })}
                />
                <Button
                  type="text"
                  size="small"
                  disabled={item.isDefault}
                  aria-label={t({
                    id: item.pinned ? 'common.entityViews.unpin' : 'common.entityViews.pin',
                  })}
                  icon={item.pinned ? <PushpinFilled /> : <PushpinOutlined />}
                  onClick={() => patchItem(item.id, { pinned: !item.pinned })}
                />
                <Button
                  type="text"
                  size="small"
                  danger={!item.isDefault}
                  disabled={item.isDefault}
                  aria-label={t({ id: 'common.entityViews.delete' })}
                  icon={<DeleteOutlined />}
                  onClick={() => {
                    setDeletedIds((prev) => [...prev, item.id]);
                    setItems((prev) => prev.filter((i) => i.id !== item.id));
                  }}
                />
              </div>
            )}
          />
        )}
      </div>
    </Modal>
  );
}
