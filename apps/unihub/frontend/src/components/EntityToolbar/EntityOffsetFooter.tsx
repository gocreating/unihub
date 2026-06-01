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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageSizeOptions, isValidCustom, customNum],
  );

  return (
    <Flex justify="space-between" align="center">
      <Space>
        {total !== undefined && (
          <Typography.Text type="secondary">
            {t({ id: 'common.entityOps.pagination.total' }, { total })}
          </Typography.Text>
        )}
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
      </Space>
      <Pagination
        total={total}
        pageSize={pageSize}
        current={current}
        showSizeChanger={false}
        onChange={onChange}
      />
    </Flex>
  );
}
