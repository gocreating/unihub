import { TranslationOutlined } from '@ant-design/icons';
import { Dropdown } from 'antd';
import { useLocale, type LocaleKey } from '@/contexts/LocaleContext';

const LANGS: { key: LocaleKey; label: string }[] = [
  { key: 'en-US', label: 'English' },
  { key: 'zh-TW', label: '繁體中文' },
  { key: 'zh-CN', label: '简体中文' },
];

export function SelectLang() {
  const { locale, setLocale } = useLocale();

  return (
    <Dropdown
      menu={{
        selectedKeys: [locale],
        items: LANGS.map((l) => ({ key: l.key, label: l.label })),
        onClick: ({ key }) => setLocale(key as LocaleKey),
      }}
    >
      <span style={{ cursor: 'pointer', padding: 4, display: 'inline-flex', alignItems: 'center' }}>
        <TranslationOutlined style={{ fontSize: 16 }} />
      </span>
    </Dropdown>
  );
}
