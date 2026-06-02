import { Button, Flex, Space } from 'antd';
import { useIntl } from 'react-intl';

export interface EntityCursorFooterProps {
  hasNext: boolean;
  hasPrev: boolean;
  onNext: () => void;
  onPrev: () => void;
}

export function EntityCursorFooter({ hasNext, hasPrev, onNext, onPrev }: EntityCursorFooterProps) {
  const { formatMessage: t } = useIntl();
  return (
    <Flex justify="flex-end">
      <Space>
        <Button disabled={!hasPrev} onClick={onPrev}>
          ← {t({ id: 'common.entityOps.pagination.previous' })}
        </Button>
        <Button disabled={!hasNext} onClick={onNext}>
          {t({ id: 'common.entityOps.pagination.next' })} →
        </Button>
      </Space>
    </Flex>
  );
}
