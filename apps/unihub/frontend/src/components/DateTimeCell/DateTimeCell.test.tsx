import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { DateTimeCell, dateTimeLines } from './index';

dayjs.extend(relativeTime);

const VALUE = dayjs().subtract(3, 'day').toISOString();

describe('DateTimeCell (constitution v1.18.0 two-row datetime)', () => {
  // DTC-01: absolute datetime is the primary row
  it('renders the absolute datetime as the primary row', () => {
    render(<DateTimeCell value={VALUE} />);
    expect(screen.getByText(dayjs(VALUE).format('YYYY-MM-DD HH:mm'))).toBeInTheDocument();
  });

  // DTC-02: relative time is the muted secondary row
  it('renders the relative time as a secondary row', () => {
    render(<DateTimeCell value={VALUE} />);
    const rel = screen.getByText(dayjs(VALUE).fromNow());
    expect(rel).toBeInTheDocument();
    expect(rel.closest('.ant-typography')).not.toBeNull();
  });

  // DTC-03: absolute string precision can be overridden, structure kept
  it('honors a format override while keeping both rows', () => {
    render(<DateTimeCell value={VALUE} format="YYYY-MM-DD" />);
    expect(screen.getByText(dayjs(VALUE).format('YYYY-MM-DD'))).toBeInTheDocument();
    expect(screen.getByText(dayjs(VALUE).fromNow())).toBeInTheDocument();
  });

  // DTC-04: absent value → the standard short dimmed non-selectable "-" (v1.20.0)
  it('renders the standard placeholder for null', () => {
    render(<DateTimeCell value={null} />);
    const empty = screen.getByText('-');
    expect(empty).toBeInTheDocument();
    expect(empty).toHaveStyle({ userSelect: 'none' });
    expect(empty.className).toContain('ant-typography-disabled');
  });

  // DTC-05: measurement helper exposes both lines for width computation
  it('dateTimeLines returns both lines, or empty for null', () => {
    expect(dateTimeLines(VALUE)).toEqual([
      dayjs(VALUE).format('YYYY-MM-DD HH:mm'),
      dayjs(VALUE).fromNow(),
    ]);
    expect(dateTimeLines(null)).toEqual([]);
  });
});
