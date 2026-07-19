import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Breadcrumb,
  Button,
  Card,
  Empty,
  Input,
  List,
  Modal,
  Splitter,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  CaretDownOutlined,
  CaretRightOutlined,
  DeleteOutlined,
  EditOutlined,
  HolderOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { CollisionDetection, DragEndEvent, DragMoveEvent, DragStartEvent } from '@dnd-kit/core';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useIntl } from 'react-intl';
import {
  addScenarioItem,
  deleteScenario,
  deleteScenarioItem,
  getScenario,
  listItems,
  listScenarioItems,
  moveScenarioItem,
  updateScenario,
} from '@/services/unihub-backend/inventory';
import type { Item, ScenarioItem } from '@/services/unihub-backend/inventory';
import { useContainerWidth } from '@/hooks/useContainerWidth';
import { ItemDisplay } from '@/components/ItemDisplay';
import { OverflowTooltip } from '@/components/OverflowTooltip';
import { PanelHeaderActions } from '@/components/PanelHeaderActions';
import { acquisitionSummaryLines } from '../acquisitionSummary';
import {
  flattenOrganized,
  gapFromVisible,
  projectDrop,
  sendBack,
  unorganizedLines,
  visibleRows,
  workingRows,
} from './organizeTree';
import type { FlatRow, MovePayload } from './organizeTree';
import { ScenarioFormModal } from './ScenarioFormModal';

const INDENT = 24;

/** Ongoing drag: which line, which pane it started from, source row width. */
interface DragState {
  lineId: string;
  from: 'flat' | 'tree';
  /** Measured width of the grabbed row — the overlay mirrors it (FR-011, iter 29). */
  width?: number;
}

const lineIdOf = (dndId: string | number): string =>
  String(dndId).replace(/^(tree|flat|orgrow)-/, '');

/** Rich shared row content: the shared ItemDisplay with opt-in parameters. */
function RowContent({ line }: { line: ScenarioItem }) {
  return (
    <div style={{ flex: '1 1 auto', minWidth: 0 }}>
      {/* Truncation-gated tooltips (constitution VI); key-value pairs (FR-031). */}
      <ItemDisplay item={line.item} parameters={line.item.parameters} showParameters truncate />
    </div>
  );
}

/** A flat-pane row: draggable, with a pinned remove action (never overflows). */
function FlatPaneRow({
  line,
  onRemove,
  removeLabel,
}: {
  line: ScenarioItem;
  onRemove: () => void;
  removeLabel: string;
}) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `flat-${line.id}`,
  });
  return (
    <div
      ref={setNodeRef}
      data-testid={`flat-row-${line.id}`}
      {...attributes}
      {...listeners}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '6px 4px',
        borderBottom: '1px solid rgba(5,5,5,0.06)',
        cursor: 'grab',
        opacity: isDragging ? 0.4 : 1,
        touchAction: 'none',
      }}
    >
      <HolderOutlined style={{ marginTop: 4, color: 'rgba(0,0,0,0.45)', flex: 'none' }} />
      <RowContent line={line} />
      <Button
        size="small"
        type="text"
        danger
        aria-label={removeLabel}
        icon={<DeleteOutlined />}
        style={{ flex: 'none' }}
        onClick={onRemove}
        onPointerDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}

/**
 * A droppable pane body. Must be its own component: useDroppable registers
 * against the nearest DndContext PROVIDER, so it has to render as a child of
 * <DndContext> — calling it in the page component (which renders the provider
 * itself) would silently register nothing.
 */
function PaneDroppable({
  id,
  testId,
  style,
  children,
}: {
  id: string;
  testId: string;
  style?: React.CSSProperties;
  children: ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <div ref={setNodeRef} data-testid={testId} style={style}>
      {children}
    </div>
  );
}

/** An organized (tree) row: draggable + droppable, indented by depth. */
function OrgRow({
  row,
  hasChildren,
  collapsed,
  dimmed,
  onToggle,
}: {
  row: FlatRow;
  hasChildren: boolean;
  collapsed: boolean;
  dimmed?: boolean;
  onToggle: () => void;
}) {
  const drag = useDraggable({ id: `tree-${row.line.id}` });
  const drop = useDroppable({ id: `orgrow-${row.line.id}` });
  return (
    <div
      ref={(node) => {
        drag.setNodeRef(node);
        drop.setNodeRef(node);
      }}
      data-testid={`org-row-${row.line.id}`}
      {...drag.attributes}
      {...drag.listeners}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '6px 4px',
        paddingLeft: row.depth * INDENT,
        borderBottom: '1px solid rgba(5,5,5,0.06)',
        cursor: 'grab',
        opacity: drag.isDragging || dimmed ? 0.4 : 1,
        touchAction: 'none',
      }}
    >
      {/* Caret toggler (iteration 19): containers collapse/expand; childless
          rows keep an aligned spacer. Pointer events stop so a caret click
          never starts a drag. */}
      {hasChildren ? (
        <span
          aria-label="toggle-children"
          style={{ marginTop: 4, cursor: 'pointer', flex: 'none' }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          {collapsed ? <CaretRightOutlined /> : <CaretDownOutlined />}
        </span>
      ) : (
        <span style={{ width: 14, flex: 'none' }} />
      )}
      <HolderOutlined style={{ marginTop: 4, color: 'rgba(0,0,0,0.45)', flex: 'none' }} />
      <RowContent line={row.line} />
    </div>
  );
}

export function ScenarioDetailPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { formatMessage: t } = useIntl();
  // Splitter orientation follows the CONTENT width (Principle VI).
  const { ref, isNarrow } = useContainerWidth(720);

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [search, setSearch] = useState('');

  // ── Drag state (one dnd-kit system for all three motions, FR-011) ──
  const [drag, setDrag] = useState<DragState | null>(null);
  const [indicator, setIndicator] = useState<{ gapIndex: number; depth: number } | null>(null);
  const [overFlat, setOverFlat] = useState(false);
  const projRef = useRef<{ gapIndex: number; dragDepth: number } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const [scenarioQ, linesQ] = useQueries({
    queries: [
      { queryKey: ['inventory', 'scenario', id], queryFn: () => getScenario(id) },
      { queryKey: ['inventory', 'scenario', id, 'lines'], queryFn: () => listScenarioItems(id) },
    ],
  });
  const scenario = scenarioQ.data;
  const lines = useMemo(() => linesQ.data ?? [], [linesQ.data]);
  const memberItemIds = useMemo(() => new Set(lines.map((l) => l.item.id)), [lines]);
  const flatLines = useMemo(() => unorganizedLines(lines), [lines]);
  const rows = useMemo(() => flattenOrganized(lines), [lines]);
  const lineById = useMemo(() => new Map(lines.map((l) => [l.id, l])), [lines]);

  // Projection/cycle math operates on the subtree-EXCLUDED working list, but
  // RENDERING keeps every row in place during tree drags (iteration 20 — the
  // list must never reflow/jitter; the active subtree just dims).
  const working = useMemo(
    () => workingRows(rows, drag?.from === 'tree' ? drag.lineId : null),
    [rows, drag],
  );
  const activeSubtreeIds = useMemo(() => {
    if (drag?.from !== 'tree') return new Set<string>();
    const kept = new Set(working.map((r) => r.line.id));
    return new Set(rows.filter((r) => !kept.has(r.line.id)).map((r) => r.line.id));
  }, [rows, working, drag]);
  // Caret collapse state (iteration 19) — rendered rows hide collapsed subtrees.
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const shownRows = useMemo(() => visibleRows(rows, collapsedIds), [rows, collapsedIds]);
  // Valid drop targets in visible coordinates (active subtree excluded).
  const mappingVisible = useMemo(
    () => shownRows.filter((r) => !activeSubtreeIds.has(r.line.id)),
    [shownRows, activeSubtreeIds],
  );
  const containerIds = useMemo(
    () => new Set(rows.map((r) => r.parentId).filter((v): v is string => v !== null)),
    [rows],
  );
  const toggleCollapsed = (lineId: string) =>
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });

  // Add-modal search: server-side substring over name OR alias OR spec (FR-030).
  const searchQ = useQuery({
    queryKey: ['inventory', 'scenario-search', search],
    queryFn: () =>
      listItems({
        limit: 20,
        filters: {
          groups: [
            { logic: 'and', conditions: [{ attr: 'name', op: 'contains', val: search }] },
            { logic: 'and', conditions: [{ attr: 'alias_name', op: 'contains', val: search }] },
            { logic: 'and', conditions: [{ attr: 'spec', op: 'contains', val: search }] },
          ],
        },
      }),
    enabled: addOpen && search.trim().length > 0,
  });
  // Empty search box → the 10 most recently acquired items (FR-011, iter 31):
  // same ordering as the catalog default (obtained ↓ NULLS FIRST).
  const recentQ = useQuery({
    queryKey: ['inventory', 'scenario-recent'],
    queryFn: () =>
      listItems({ limit: 10, ordering: '-acquisition__obtained_at__nullsfirst' }),
    enabled: addOpen && search.trim().length === 0,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['inventory', 'scenario', id] });
  };

  const addMutation = useMutation({
    mutationFn: (itemId: string) => addScenarioItem(id, { item_id: itemId }),
    onSuccess: invalidate,
    onError: (err: Error) => message.error(err.message),
  });
  const removeMutation = useMutation({
    mutationFn: (lineId: string) => deleteScenarioItem(id, lineId),
    onSuccess: invalidate,
  });
  const moveMutation = useMutation({
    mutationFn: ({ lineId, ...payload }: { lineId: string } & MovePayload) =>
      moveScenarioItem(id, lineId, payload),
    onSuccess: invalidate,
    onError: () => message.error(t({ id: 'pages.inventory.scenarios.moveFailed' })),
  });
  const updateMutation = useMutation({
    mutationFn: (values: { name: string; description?: string }) => updateScenario(id, values),
    onSuccess: () => {
      invalidate();
      setEditOpen(false);
      message.success(t({ id: 'pages.inventory.scenarios.saved' }));
    },
    onError: () => message.error(t({ id: 'pages.inventory.scenarios.saveError' })),
  });

  const confirmDeleteScenario = () => {
    Modal.confirm({
      title: t({ id: 'pages.inventory.scenarios.delete.title' }),
      content: t({ id: 'pages.inventory.scenarios.delete.confirm' }),
      okText: t({ id: 'common.delete' }),
      okType: 'danger',
      cancelText: t({ id: 'common.cancel' }),
      onOk: async () => {
        await deleteScenario(id);
        message.success(t({ id: 'pages.inventory.scenarios.deleted' }));
        navigate('/inventory/scenarios');
      },
    });
  };

  // ── DnD wiring ──
  // Prefer row droppables over the pane containers when both contain the pointer.
  const collision: CollisionDetection = (args) => {
    const within = pointerWithin(args);
    const hits = within.length > 0 ? within : rectIntersection(args);
    const rowHits = hits.filter((c) => String(c.id).startsWith('orgrow-'));
    return rowHits.length > 0 ? rowHits : hits;
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    const raw = String(active.id);
    const lineId = lineIdOf(raw);
    const from = raw.startsWith('tree-') ? 'tree' : 'flat';
    // The overlay renders at the grabbed row's exact width (FR-011, iter 29).
    const node = document.querySelector(
      from === 'tree' ? `[data-testid="org-row-${lineId}"]` : `[data-testid="flat-row-${lineId}"]`,
    );
    setDrag({ lineId, from, width: node?.getBoundingClientRect().width });
    setIndicator(null);
    setOverFlat(false);
    projRef.current = null;
  };

  const onDragMove = (event: DragMoveEvent) => {
    const { active, over, delta } = event;
    if (!drag) return;
    if (!over) {
      setIndicator(null);
      setOverFlat(false);
      projRef.current = null;
      return;
    }
    const overId = String(over.id);
    if (overId === 'flat-pane') {
      setIndicator(null);
      projRef.current = null;
      setOverFlat(drag.from === 'tree');
      return;
    }
    setOverFlat(false);
    // The pointer targets VISIBLE rows; map the slot back to WORKING
    // coordinates (a slot after a collapsed container lands after its whole
    // subtree — iteration 19). Slots inside the dragged subtree are invalid
    // (iteration 20 — the subtree stays rendered but cannot host itself).
    let visGap: number;
    let workingGap: number;
    if (overId === 'org-end') {
      visGap = shownRows.length;
      workingGap = working.length;
    } else if (overId.startsWith('orgrow-')) {
      const overLineId = lineIdOf(overId);
      if (activeSubtreeIds.has(overLineId)) {
        setIndicator(null);
        projRef.current = null;
        return;
      }
      const shownIdx = shownRows.findIndex((r) => r.line.id === overLineId);
      const mapIdx = mappingVisible.findIndex((r) => r.line.id === overLineId);
      if (shownIdx === -1 || mapIdx === -1) return;
      // Before/after from the POINTER, not the active rect: the DragOverlay
      // (whose rect dnd-kit measures) can be more compact than the grabbed
      // source row, so its center lags the pointer and misclassifies drops
      // near a row's lower half (iteration 26).
      const activator = event.activatorEvent as Partial<PointerEvent>;
      const startY = typeof activator.clientY === 'number' ? activator.clientY : 0;
      const translated = active.rect.current.translated;
      const activeCenter = translated ? translated.top + translated.height / 2 : 0;
      const pointerY = startY > 0 ? startY + delta.y : activeCenter;
      const overCenter = over.rect.top + over.rect.height / 2;
      const after = pointerY > overCenter;
      visGap = after ? shownIdx + 1 : shownIdx;
      workingGap = gapFromVisible(working, mappingVisible, mapIdx, after);
    } else {
      return;
    }
    const baseDepth =
      drag.from === 'tree' ? (rows.find((r) => r.line.id === drag.lineId)?.depth ?? 0) : 0;
    const dragDepth = Math.max(0, baseDepth + Math.round(delta.x / INDENT));
    const projected = projectDrop(rows, drag.from === 'tree' ? drag.lineId : null, workingGap, dragDepth);
    projRef.current = { gapIndex: workingGap, dragDepth };
    setIndicator({ gapIndex: visGap, depth: projected.depth });
  };

  const onDragEnd = ({ over }: DragEndEvent) => {
    const current = drag;
    const proj = projRef.current;
    setDrag(null);
    setIndicator(null);
    setOverFlat(false);
    projRef.current = null;
    if (!current || !over) return;
    const overId = String(over.id);
    if (overId === 'flat-pane') {
      if (current.from === 'tree') {
        moveMutation.mutate({ lineId: current.lineId, ...sendBack() });
      }
      return;
    }
    if (overId.startsWith('orgrow-') && activeSubtreeIds.has(lineIdOf(overId))) return;
    if ((overId === 'org-end' || overId.startsWith('orgrow-')) && proj) {
      const payload = projectDrop(
        rows,
        current.from === 'tree' ? current.lineId : null,
        proj.gapIndex,
        proj.dragDepth,
      );
      moveMutation.mutate({
        lineId: current.lineId,
        container_id: payload.container_id,
        index: payload.index,
        organized: true,
      });
    }
  };

  const onDragCancel = () => {
    setDrag(null);
    setIndicator(null);
    setOverFlat(false);
    projRef.current = null;
  };

  const dropIndicator = (
    <div
      data-testid="drop-indicator"
      style={{
        height: 2,
        background: '#1677ff',
        marginLeft: (indicator?.depth ?? 0) * INDENT,
        borderRadius: 1,
        // Paint ABOVE the drag overlay (zIndex 900) so the prospective drop
        // position is never hidden by the preview (FR-011, iteration 31).
        position: 'relative',
        zIndex: 1000,
      }}
    />
  );

  const draggedLine = drag ? lineById.get(drag.lineId) : null;

  const searching = search.trim().length > 0;
  const searchResults = (searching ? searchQ.data?.results : recentQ.data?.results) ?? [];
  const untitled = t({ id: 'pages.inventory.acquisitions.new.untitled' });
  // Acquisition context on results (iteration 19): source + date summary,
  // truncation-gated (constitution VI, iteration 20).
  const modalItemContext = (item: Item): ReactNode => {
    const summary = item.acquisition
      ? acquisitionSummaryLines(item.acquisition, untitled)
      : null;
    if (!summary) return undefined;
    const contextLine = `${summary.primary}${summary.secondary ? ` · ${summary.secondary}` : ''}`;
    return (
      <OverflowTooltip title={contextLine} style={{ maxWidth: '100%' }}>
        {contextLine}
      </OverflowTooltip>
    );
  };

  return (
    <div ref={ref} style={{ padding: 16 }}>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <Link to="/inventory/scenarios">{t({ id: 'pages.inventory.scenarios.title' })}</Link> },
          { title: scenario?.name ?? '…' },
        ]}
      />

      {/* Standalone info panel with the scenario actions (FR-011, iteration 18). */}
      <Card
        title={scenario?.name}
        style={{ marginBottom: 16 }}
        extra={
          <PanelHeaderActions
            narrow={isNarrow}
            kebabLabel="scenario-actions"
            visible={[
              {
                key: 'edit',
                label: t({ id: 'common.edit' }),
                icon: <EditOutlined />,
                onClick: () => setEditOpen(true),
              },
            ]}
            advanced={[
              {
                key: 'delete',
                label: t({ id: 'common.delete' }),
                icon: <DeleteOutlined />,
                danger: true,
                onClick: confirmDeleteScenario,
              },
            ]}
          />
        }
      >
        {scenario?.description ? (
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            {scenario.description}
          </Typography.Paragraph>
        ) : (
          <Typography.Text type="secondary" disabled>
            -
          </Typography.Text>
        )}
      </Card>

      <Card
        title={t({ id: 'pages.inventory.scenarios.organize' })}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
            {t({ id: 'pages.inventory.scenarios.organize.add' })}
          </Button>
        }
        styles={{ body: { padding: 0 } }}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={collision}
          onDragStart={onDragStart}
          onDragMove={onDragMove}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
        >
          <Splitter layout={isNarrow ? 'vertical' : 'horizontal'} style={{ minHeight: 320 }}>
            <Splitter.Panel defaultSize="40%" min="20%">
              <PaneDroppable
                id="flat-pane"
                testId="unorganized-pane"
                style={{
                  padding: 12,
                  height: '100%',
                  outline: overFlat ? '2px dashed #1677ff' : undefined,
                  outlineOffset: -2,
                }}
              >
                {flatLines.length === 0 ? (
                  <Empty
                    description={t({ id: 'pages.inventory.scenarios.organize.unorganizedEmpty' })}
                  />
                ) : (
                  flatLines.map((line) => (
                    <FlatPaneRow
                      key={line.id}
                      line={line}
                      removeLabel={t({ id: 'pages.inventory.scenarios.organize.remove' })}
                      onRemove={() => removeMutation.mutate(line.id)}
                    />
                  ))
                )}
              </PaneDroppable>
            </Splitter.Panel>
            <Splitter.Panel>
              <PaneDroppable id="org-end" testId="organized-pane" style={{ padding: 12, height: '100%' }}>
                {shownRows.length === 0 && !indicator ? (
                  <Empty description={t({ id: 'pages.inventory.scenarios.organize.empty' })} />
                ) : (
                  <>
                    {shownRows.map((row, i) => (
                      <div key={row.line.id}>
                        {indicator?.gapIndex === i ? dropIndicator : null}
                        <OrgRow
                          row={row}
                          hasChildren={containerIds.has(row.line.id)}
                          collapsed={collapsedIds.has(row.line.id)}
                          dimmed={activeSubtreeIds.has(row.line.id)}
                          onToggle={() => toggleCollapsed(row.line.id)}
                        />
                      </div>
                    ))}
                    {indicator?.gapIndex === shownRows.length ? dropIndicator : null}
                  </>
                )}
              </PaneDroppable>
            </Splitter.Panel>
          </Splitter>
          <DragOverlay zIndex={900}>
            {draggedLine ? (
              // Faithful preview (FR-011, iteration 29): the SAME row content
              // (holder + ItemDisplay) at the grabbed row's measured width.
              // Semi-transparent + below the drop indicator (iteration 31).
              <div
                data-testid="drag-overlay"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  padding: '6px 4px',
                  boxSizing: 'border-box',
                  width: drag?.width,
                  background: '#fff',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  borderRadius: 6,
                  opacity: 0.75,
                }}
              >
                <HolderOutlined style={{ marginTop: 4, color: 'rgba(0,0,0,0.45)', flex: 'none' }} />
                <RowContent line={draggedLine} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </Card>

      {/* Add-items search modal (FR-011): members stay listed but disabled.
          Viewport-anchored (iteration 27): the modal spans a fixed top offset
          down to a fixed bottom offset; ONLY the results list scrolls, so the
          search box never leaves the viewport. */}
      <Modal
        title={t({ id: 'pages.inventory.scenarios.organize.addTitle' })}
        open={addOpen}
        footer={null}
        width={760}
        style={{ top: 64 }}
        styles={{
          body: {
            // 100vh − top offset (64) − header+padding (~72) − bottom gap (24).
            height: 'calc(100vh - 160px)',
            display: 'flex',
            flexDirection: 'column',
          },
        }}
        onCancel={() => {
          setAddOpen(false);
          setSearch('');
        }}
      >
        <Input.Search
          placeholder={t({ id: 'pages.inventory.scenarios.organize.searchPlaceholder' })}
          allowClear
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ marginBottom: 12 }}
        />
        <div data-testid="modal-results" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <List
          size="small"
          loading={searching ? searchQ.isFetching : recentQ.isFetching}
          dataSource={searchResults}
          locale={{
            emptyText: search.trim()
              ? t({ id: 'pages.inventory.scenarios.organize.noResults' })
              : ' ',
          }}
          renderItem={(item) => {
            const isMember = memberItemIds.has(item.id);
            // ONE Add button per row (iteration 19): disabled with an "Added"
            // tooltip on member rows. A disabled button swallows hover events,
            // so the tooltip wraps a span.
            const addButton = (
              <Button
                size="small"
                icon={<PlusOutlined />}
                disabled={isMember}
                loading={addMutation.isPending && addMutation.variables === item.id}
                onClick={() => addMutation.mutate(item.id)}
              >
                {t({ id: 'pages.inventory.scenarios.organize.add' })}
              </Button>
            );
            // The row OWNS its layout (iteration 22): the List `actions` slot
            // injects ul/li wrappers with library margins/padding that broke
            // the right edge — a plain flex row keeps the Add action flush.
            return (
              <List.Item
                style={{
                  overflow: 'hidden',
                  paddingLeft: 0,
                  paddingRight: 0,
                  ...(isMember ? { opacity: 0.65 } : null),
                }}
              >
                <div
                  data-testid="modal-row"
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%' }}
                >
                  <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                    {/* Shared item display (FR-031) with search-match highlighting. */}
                    <ItemDisplay
                      item={item}
                      truncate
                      highlight={search}
                      extraSecondary={modalItemContext(item)}
                    />
                  </div>
                  <div style={{ flex: 'none' }}>
                    {isMember ? (
                      <Tooltip
                        title={t({ id: 'pages.inventory.scenarios.organize.alreadyAdded' })}
                      >
                        <span style={{ display: 'inline-block', cursor: 'not-allowed' }}>
                          {addButton}
                        </span>
                      </Tooltip>
                    ) : (
                      addButton
                    )}
                  </div>
                </div>
              </List.Item>
            );
          }}
        />
        </div>
      </Modal>

      <ScenarioFormModal
        open={editOpen}
        initial={scenario ?? null}
        confirmLoading={updateMutation.isPending}
        onOk={(values) => updateMutation.mutate(values)}
        onCancel={() => setEditOpen(false)}
      />
    </div>
  );
}
