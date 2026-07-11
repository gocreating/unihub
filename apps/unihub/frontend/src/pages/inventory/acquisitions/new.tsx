import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Breadcrumb,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  List,
  Select,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { Link, useNavigate } from 'react-router-dom';
import { useIntl } from 'react-intl';
import type { AcquisitionMethod, ItemWrite } from '@/services/unihub-backend/inventory';
import { createAcquisition } from '@/services/unihub-backend/inventory';
import { listCurrencies } from '@/services/unihub-backend/finance';
import { ItemFormModal } from '../items/ItemFormModal';

const METHODS: AcquisitionMethod[] = ['purchase', 'gift', 'transfer', 'found', 'other'];

interface AcquisitionFormValues {
  source?: string;
  method?: AcquisitionMethod;
  obtained_at?: dayjs.Dayjs | null;
  remark?: string;
}

export function AcquisitionNewPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { formatMessage: t } = useIntl();
  const [form] = Form.useForm<AcquisitionFormValues>();
  const [items, setItems] = useState<ItemWrite[]>([]);
  const [itemModalOpen, setItemModalOpen] = useState(false);

  const { data: currenciesData } = useQuery({
    queryKey: ['finance', 'currencies'],
    queryFn: () => listCurrencies(),
  });
  const currencyOptions = useMemo(
    () => (currenciesData?.results ?? []).map((c) => ({ value: c.code, label: c.code })),
    [currenciesData],
  );

  const createMutation = useMutation({
    mutationFn: createAcquisition,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', 'acquisitions'] });
      queryClient.invalidateQueries({ queryKey: ['inventory', 'items'] });
      message.success(t({ id: 'pages.inventory.acquisitions.saved' }));
      navigate('/inventory/acquisitions');
    },
    onError: () => message.error(t({ id: 'pages.inventory.acquisitions.saveError' })),
  });

  const handleSubmit = () => {
    if (items.length === 0) {
      message.warning(t({ id: 'pages.inventory.acquisitions.new.needItem' }));
      return;
    }
    const values = form.getFieldsValue();
    createMutation.mutate({
      source: values.source ?? '',
      method: values.method ?? '',
      obtained_at: values.obtained_at ? values.obtained_at.toISOString() : null,
      remark: values.remark ?? '',
      items,
    });
  };

  return (
    <div style={{ padding: 24 }}>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <Link to="/inventory/acquisitions">{t({ id: 'menu.inventory.acquisitions' })}</Link> },
          { title: t({ id: 'pages.inventory.acquisitions.new' }) },
        ]}
      />

      <Card title={t({ id: 'pages.inventory.acquisitions.new' })} style={{ marginBottom: 16 }}>
        <Form form={form} layout="vertical">
          <Form.Item name="source" label={t({ id: 'pages.inventory.acquisitions.col.source' })}>
            <Input placeholder={t({ id: 'pages.inventory.acquisitions.form.sourcePlaceholder' })} />
          </Form.Item>
          <Form.Item name="method" label={t({ id: 'pages.inventory.acquisitions.col.method' })}>
            <Select
              allowClear
              options={METHODS.map((m) => ({
                value: m,
                label: t({ id: `pages.inventory.acquisitions.method.${m}` }),
              }))}
            />
          </Form.Item>
          <Form.Item name="obtained_at" label={t({ id: 'pages.inventory.acquisitions.col.obtainedAt' })}>
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="remark" label={t({ id: 'pages.inventory.acquisitions.col.remark' })}>
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Card>

      <Card
        title={t({ id: 'pages.inventory.acquisitions.new.items' })}
        extra={
          <Button icon={<PlusOutlined />} onClick={() => setItemModalOpen(true)}>
            {t({ id: 'pages.inventory.acquisitions.new.addItem' })}
          </Button>
        }
        style={{ marginBottom: 16 }}
      >
        <List
          dataSource={items}
          locale={{ emptyText: t({ id: 'pages.inventory.acquisitions.new.noItems' }) }}
          renderItem={(item, idx) => (
            <List.Item
              actions={[
                <Button
                  key="del"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                >
                  {t({ id: 'common.remove' })}
                </Button>,
              ]}
            >
              <Space>
                <Typography.Text strong>{item.name}</Typography.Text>
                <Tag>{t({ id: `pages.inventory.items.type.${item.item_type ?? 'stockable'}` })}</Tag>
                {item.cost && (
                  <Typography.Text type="secondary">
                    {item.cost} {item.cost_currency}
                  </Typography.Text>
                )}
              </Space>
            </List.Item>
          )}
        />
      </Card>

      <Space>
        <Button
          type="primary"
          loading={createMutation.isPending}
          onClick={handleSubmit}
        >
          {t({ id: 'pages.inventory.acquisitions.new.create' })}
        </Button>
        <Button onClick={() => navigate('/inventory/acquisitions')}>
          {t({ id: 'common.cancel' })}
        </Button>
      </Space>

      <ItemFormModal
        open={itemModalOpen}
        title={t({ id: 'pages.inventory.acquisitions.new.addItem' })}
        currencyOptions={currencyOptions}
        onCancel={() => setItemModalOpen(false)}
        onOk={(itemData) => {
          setItems((prev) => [...prev, itemData]);
          setItemModalOpen(false);
        }}
      />
    </div>
  );
}
