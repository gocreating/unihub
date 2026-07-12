import { Card, Descriptions } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useIntl } from 'react-intl';
import { getSystemVersion } from '@/services/unihub-backend/system';
import { EmptyValue } from '@/components/EmptyValue';

const EMPTY = <EmptyValue />;

export function ProfilePage() {
  const { formatMessage: t } = useIntl();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['system', 'version'],
    queryFn: getSystemVersion,
  });

  const version = isLoading || isError ? EMPTY : (data?.version ?? EMPTY);

  return (
    <Card title={t({ id: 'pages.system.profile.title' })}>
      <Descriptions column={1}>
        <Descriptions.Item label={t({ id: 'pages.system.profile.version' })}>
          {version}
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );
}
