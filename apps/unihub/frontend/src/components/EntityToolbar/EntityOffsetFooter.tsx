import { useMemo, useState } from 'react';
import { Flex, Pagination, Select, Space, Typography } from 'antd';
import { useIntl } from 'react-intl';
import { ENTITY_PAGE_SIZE_OPTIONS } from './useEntityTable';

export interface EntityOffsetFooterProps {
  total: number | undefined;
  pageSize: number;
  current: number;
  onChange: (page: number, size: number) => void;
  pageSizeOptions?: readonly number[];
}

export function EntityOffsetFooter({
  total,
  pageSize,
  current,
  onChange,
  pageSizeOptions = ENTITY_PAGE_SIZE_OPTIONS,
}: EntityOffsetFooterProps) {
  const { formatMessage: t } = useIntl();
  const [searchValue, setSearchValue] = useState('');

  const customNum = searchValue ? parseInt(searchValue, 10) : NaN;
  const isValidCustom =
    Number.isFinite(customNum) &&
    customNum > 0 &&
    !(pageSizeOptions as readonly number[]).includes(customNum);

  const sizeOptions = useMemo(
    () => [
      ...(pageSizeOptions as readonly number[]).map((n) => ({
        value: n,
        label: t({ id: 'common.entityOps.pagination.perPage' }, { n }),
      })),
      ...(isValidCustom
        ? [{ value: customNum, label: t({ id: 'common.entityOps.pagination.perPage' }, { n: customNum }) }]
        : []),
    ],
    [pageSizeOptions, isValidCustom, customNum, t],
  );

  // Constitution v1.19.0 footer layout: non-interactive information (record
  // count) on the left; ALL interactive controls grouped on the right — the
  // per-page selector first, then the pagination.
  return (
    <Flex justify="space-between" align="center">
      {total !== undefined ? (
        <Typography.Text type="secondary">
          {t({ id: 'common.entityOps.pagination.total' }, { total })}
        </Typography.Text>
      ) : (
        <span />
      )}
      <Space>
        <Select
          value={pageSize}
          options={sizeOptions}
          showSearch
          searchValue={searchValue}
          onSearch={setSearchValue}
          filterOption={false}
          onChange={(val) => { onChange(1, val); setSearchValue(''); }}
          popupMatchSelectWidth={false}
          style={{ minWidth: 90 }}
        />
        <Pagination
          total={total}
          pageSize={pageSize}
          current={current}
          showSizeChanger={false}
          onChange={onChange}
        />
      </Space>
    </Flex>
  );
}
