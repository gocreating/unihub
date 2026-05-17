import { Typography } from 'antd';

const { Title, Paragraph } = Typography;

export function LanguagePage() {
  return (
    <div>
      <Title level={2}>Language Learning</Title>
      <Paragraph type="secondary">
        Word cards and grammar cheat sheets for your target languages.
      </Paragraph>
    </div>
  );
}
