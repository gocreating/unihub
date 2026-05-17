import { Typography } from 'antd';

const { Title, Paragraph } = Typography;

export function PeoplePage() {
  return (
    <div>
      <Title level={2}>People</Title>
      <Paragraph type="secondary">
        Your personal contact list and relationship network.
      </Paragraph>
    </div>
  );
}
