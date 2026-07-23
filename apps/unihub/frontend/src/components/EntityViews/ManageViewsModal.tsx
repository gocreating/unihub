/**
 * ManageViewsModal — organize saved views (016, US4).
 *
 * All edits are STAGED locally: rename (inline input), pin/unpin, drag
 * reorder (shared SortableList), delete (row leaves the list). NOTHING hits
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
}

export interface ManageViewsModalProps {
  open: boolean;
  views: UseEntityViewsReturn;
  onClose: () => void;
}

export function ManageViewsModal({ open, views, onClose }: ManageViewsModalProps) {
  const { styles } = useStyles();
  const { formatMessage: t } = useIntl();
  // The materialized default view is staged separately: rename/pin only —
  // never deletable, never part of the drag reorder (round 2, FR-003).
  const [defaultItem, setDefaultItem] = useState<StagedItem | null>(null);
  const [items, setItems] = useState<StagedItem[]>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // (Re)stage from the live saved-view list each time the modal opens.
  useEffect(() => {
    if (!open) return;
    const defaultView = views.savedViews.find((v) => v.is_default);
    setDefaultItem(
      defaultView
        ? { id: defaultView.id, name: defaultView.name, pinned: defaultView.pinned }
        : null,
    );
    setItems(
      views.savedViews
        .filter((v) => !v.is_default)
        .map(({ id, name, pinned }) => ({ id, name, pinned })),
    );
    setDeletedIds([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const commit = async () => {
    setSaving(true);
    try {
      const changes: ManageChanges = {
        items: defaultItem ? [defaultItem, ...items] : items,
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
        {defaultItem && (
          <div className={styles.row} data-testid="manage-default-row">
            <span className={styles.handle} style={{ visibility: 'hidden' }}>
              <HolderOutlined />
            </span>
            <Input
              className={styles.name}
              value={defaultItem.name}
              maxLength={100}
              onChange={(e) =>
                setDefaultItem((prev) => (prev ? { ...prev, name: e.target.value } : prev))
              }
            />
            <Button
              type="text"
              size="small"
              aria-label={t({
                id: defaultItem.pinned ? 'common.entityViews.unpin' : 'common.entityViews.pin',
              })}
              icon={defaultItem.pinned ? <PushpinFilled /> : <PushpinOutlined />}
              onClick={() =>
                setDefaultItem((prev) => (prev ? { ...prev, pinned: !prev.pinned } : prev))
              }
            />
            {/* No delete button — the default view is the guaranteed fallback. */}
            <Button type="text" size="small" disabled style={{ visibility: 'hidden' }} />
          </div>
        )}
        {items.length === 0 && !defaultItem ? (
          <div className={styles.empty}>{t({ id: 'common.entityViews.noSaved' })}</div>
        ) : (
          <SortableList
            items={items}
            onReorder={setItems}
            renderItem={(item, handleProps) => (
              <div className={styles.row}>
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
                  aria-label={t({
                    id: item.pinned ? 'common.entityViews.unpin' : 'common.entityViews.pin',
                  })}
                  icon={item.pinned ? <PushpinFilled /> : <PushpinOutlined />}
                  onClick={() => patchItem(item.id, { pinned: !item.pinned })}
                />
                <Button
                  type="text"
                  size="small"
                  danger
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
