import { Breadcrumb } from 'antd';
import { Link } from 'react-router-dom';
import { useIntl } from 'react-intl';
import { AcquisitionForm } from './AcquisitionForm';

export function AcquisitionNewPage() {
  const { formatMessage: t } = useIntl();
  return (
    <div style={{ padding: 24 }}>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <Link to="/inventory/catalog">{t({ id: 'menu.inventory.catalog' })}</Link> },
          { title: t({ id: 'pages.inventory.acquisitions.new' }) },
        ]}
      />
      <AcquisitionForm />
    </div>
  );
}
