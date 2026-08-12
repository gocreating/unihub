import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Typography } from 'antd';
import { EmptyValue } from '@/components/EmptyValue';
import { SearchMark } from '@/components/HighlightText/SearchMark';

dayjs.extend(relativeTime);

const DEFAULT_FORMAT = 'YYYY-MM-DD HH:mm';

/** Both display lines of a datetime cell — used by tables to measure column width. */
// eslint-disable-next-line react-refresh/only-export-components
export function dateTimeLines(
  value: string | null | undefined,
  format: string = DEFAULT_FORMAT,
): string[] {
  if (!value) return [];
  const d = dayjs(value);
  return [d.format(format), d.fromNow()];
}

export interface DateTimeCellProps {
  value: string | null | undefined;
  /** Absolute-row format override (e.g. date-only); the two-row structure is kept. */
  format?: string;
}

// Constitution v1.18.0: absolute datetime as the primary row, relative time as
// a muted secondary row; absent values render the standard <EmptyValue />.
export function DateTimeCell({ value, format = DEFAULT_FORMAT }: DateTimeCellProps) {
  const lines = dateTimeLines(value, format);
  if (lines.length === 0) {
    return <EmptyValue />;
  }
  return (
    <div>
      <div>
        <SearchMark text={lines[0]} />
      </div>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {lines[1]}
      </Typography.Text>
    </div>
  );
}
