import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import type { ProColumns } from '@ant-design/pro-components';
import type { SortRule } from './types';

export interface SortContext {
  sortOrderForField: (field: string) => 'ascend' | 'descend' | null;
  activeRules: SortRule[];
  handleHeaderClick: (field: string) => void;
}

/**
 * Returns column props that drive sort visuals entirely from `activeRules` state,
 * bypassing AntD ProTable's internal sorter state.
 *
 * Root cause of the panel-apply bug:
 *   AntD ProTable tracks ant-table-column-sort class and caret icons through
 *   internal `sorterStates`, which only updates when its own `onChange` fires
 *   (user header click via `sorter` prop). External sortOrder prop changes —
 *   from panel apply/reset — never reach `sorterStates`, so indicators stay stale.
 *
 * This helper sidesteps AntD's mechanism by:
 *   - onHeaderCell.className: applies ant-table-column-sort from our activeRules
 *   - onCell.className: same for body cells
 *   - onHeaderCell.onClick: calls handleHeaderClick directly (no sorter+onChange needed)
 *   - title: custom sort icon driven by activeRules
 *
 * Works for header click AND panel apply/reset because both paths update activeRules,
 * which causes colDefMap to recompute and React to update the th/td elements.
 */
export function makeSortProps<T>(
  field: string,
  label: React.ReactNode,
  ctx: SortContext,
): Pick<ProColumns<T>, 'title' | 'onHeaderCell' | 'onCell'> {
  const order = ctx.sortOrderForField(field);
  const ruleIdx = ctx.activeRules.findIndex((r) => r.field === field);
  const showPriority = order !== null && ctx.activeRules.length > 1;
  const sortedClass = order ? 'ant-table-column-sort' : '';

  return {
    title: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {label}
        {order === 'ascend' && <ArrowUpOutlined style={{ color: '#1677ff', fontSize: 11 }} />}
        {order === 'descend' && <ArrowDownOutlined style={{ color: '#1677ff', fontSize: 11 }} />}
        {showPriority && (
          <span style={{ color: '#1677ff', fontSize: 10, lineHeight: 1, fontWeight: 600 }}>
            {ruleIdx + 1}
          </span>
        )}
      </span>
    ),
    onHeaderCell: () => ({
      onClick: () => ctx.handleHeaderClick(field),
      style: { cursor: 'pointer' },
      className: sortedClass,
    }),
    onCell: () => ({
      className: sortedClass,
    }),
  };
}
