import { Typography } from 'antd';

const { Title, Paragraph } = Typography;

export function MusicPage() {
  return (
    <div>
      <Title level={2}>Music</Title>
      <Paragraph type="secondary">
        Your personal song collection.
      </Paragraph>
    </div>
  );
}
