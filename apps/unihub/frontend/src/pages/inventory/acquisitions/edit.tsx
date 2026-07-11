import { Breadcrumb, Spin } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useIntl } from 'react-intl';
import { getAcquisition } from '@/services/unihub-backend/inventory';
import { AcquisitionForm } from './AcquisitionForm';

export function AcquisitionEditPage() {
  const { id = '' } = useParams();
  const { formatMessage: t } = useIntl();
  const { data, isLoading } = useQuery({
    queryKey: ['inventory', 'acquisition', id],
    queryFn: () => getAcquisition(id),
  });

  return (
    <div style={{ padding: 24 }}>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <Link to="/inventory/acquisitions">{t({ id: 'menu.inventory.acquisitions' })}</Link> },
          { title: data?.source || t({ id: 'pages.inventory.acquisitions.edit' }) },
        ]}
      />
      {isLoading || !data ? <Spin /> : <AcquisitionForm initial={data} />}
    </div>
  );
}
