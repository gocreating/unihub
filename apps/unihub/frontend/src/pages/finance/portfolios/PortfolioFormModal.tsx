import { Form, Input, Modal, Select, Tag, Typography } from 'antd';
import { useIntl } from 'react-intl';
import type { Currency, Portfolio } from '@/services/unihub-backend/finance';

export interface PortfolioCreateFormValues {
  name: string;
  base_currency: string;
  state: 'active' | 'closed';
  description?: string;
}

export interface PortfolioUpdateFormValues {
  name: string;
  state: 'active' | 'closed';
  description?: string;
}

interface PortfolioFormModalProps {
  open: boolean;
  /** null = create mode; a portfolio = edit mode (base currency shown read-only). */
  portfolio: Portfolio | null;
  /** Currency options for create mode; unused in edit mode. */
  currencies?: Currency[];
  submitting: boolean;
  onCancel: () => void;
  onCreate?: (values: PortfolioCreateFormValues) => void;
  onUpdate?: (values: PortfolioUpdateFormValues) => void;
}

/**
 * Shared create/edit modal for Portfolio, used by the Portfolios list (create)
 * and the portfolio detail page's "Portfolio" panel (edit). Staged mutations:
 * nothing is sent until Save; the parent owns the mutation.
 */
export function PortfolioFormModal({
  open, portfolio, currencies = [], submitting, onCancel, onCreate, onUpdate,
}: PortfolioFormModalProps) {
  const { formatMessage: t } = useIntl();
  const [createForm] = Form.useForm<PortfolioCreateFormValues>();
  const [updateForm] = Form.useForm<PortfolioUpdateFormValues>();

  return (
    <Modal
      title={portfolio ? t({ id: 'pages.finance.portfolios.edit' }) : t({ id: 'pages.finance.portfolios.new' })}
      open={open}
      onCancel={onCancel}
      onOk={() => (portfolio ? updateForm.submit() : createForm.submit())}
      confirmLoading={submitting}
      destroyOnClose
    >
      {portfolio ? (
        <Form
          form={updateForm}
          layout="vertical"
          onFinish={(values) => onUpdate?.(values)}
          initialValues={{ name: portfolio.name, state: portfolio.state, description: portfolio.description }}
          preserve={false}
        >
          <Form.Item name="name" label={t({ id: 'pages.finance.portfolios.form.name' })} rules={[{ required: true }]}>
            <Input placeholder={t({ id: 'pages.finance.portfolios.form.namePlaceholder' })} />
          </Form.Item>
          <Form.Item name="description" label={t({ id: 'pages.finance.portfolios.form.description' })}>
            {/* Multi-line, uncapped (FR-025: the column is a TextField). */}
            <Input.TextArea
              autoSize={{ minRows: 2, maxRows: 8 }}
              placeholder={t({ id: 'pages.finance.portfolios.form.descriptionPlaceholder' })}
            />
          </Form.Item>
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            {t({ id: 'pages.finance.portfolios.col.baseCurrency' })}: <Tag>{portfolio.base_currency}</Tag>
          </Typography.Text>
          <Form.Item name="state" label={t({ id: 'pages.finance.portfolios.form.state' })}>
            <Select>
              <Select.Option value="active">{t({ id: 'pages.finance.portfolios.state.active' })}</Select.Option>
              <Select.Option value="closed">{t({ id: 'pages.finance.portfolios.state.closed' })}</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      ) : (
        <Form
          form={createForm}
          layout="vertical"
          onFinish={(values) => onCreate?.(values)}
          preserve={false}
        >
          <Form.Item name="name" label={t({ id: 'pages.finance.portfolios.form.name' })} rules={[{ required: true }]}>
            <Input placeholder={t({ id: 'pages.finance.portfolios.form.namePlaceholder' })} />
          </Form.Item>
          <Form.Item name="base_currency" label={t({ id: 'pages.finance.portfolios.form.baseCurrency' })} rules={[{ required: true }]}>
            <Select placeholder={t({ id: 'pages.finance.portfolios.form.baseCurrencyPlaceholder' })}>
              {currencies.map((c) => (
                <Select.Option key={c.code} value={c.code}>{c.code} — {c.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="description" label={t({ id: 'pages.finance.portfolios.form.description' })}>
            {/* Multi-line, uncapped (FR-025: the column is a TextField). */}
            <Input.TextArea
              autoSize={{ minRows: 2, maxRows: 8 }}
              placeholder={t({ id: 'pages.finance.portfolios.form.descriptionPlaceholder' })}
            />
          </Form.Item>
          <Form.Item name="state" label={t({ id: 'pages.finance.portfolios.form.state' })} initialValue="active">
            <Select>
              <Select.Option value="active">{t({ id: 'pages.finance.portfolios.state.active' })}</Select.Option>
              <Select.Option value="closed">{t({ id: 'pages.finance.portfolios.state.closed' })}</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      )}
    </Modal>
  );
}
