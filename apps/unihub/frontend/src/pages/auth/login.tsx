import { useState } from 'react';
import { Button, Card, Form, Input, Typography, message } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { createStyles } from 'antd-style';
import { useNavigate } from 'react-router-dom';
import { login } from '@/services/unihub-backend/auth';

interface LoginFormValues {
  username: string;
  password: string;
}

const useStyles = createStyles(({ token }) => ({
  container: {
    position: 'fixed' as const,
    inset: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    background: `linear-gradient(135deg, ${token.colorPrimaryBg} 0%, ${token.colorBgLayout} 100%)`,
    padding: '24px',
    overflowY: 'auto' as const,
  },
  card: {
    width: '100%',
    maxWidth: '400px',
    borderRadius: token.borderRadiusLG,
    boxShadow: token.boxShadowSecondary,
  },
  header: {
    textAlign: 'center' as const,
    marginBottom: '32px',
  },
  submitButton: {
    width: '100%',
    height: '40px',
  },
}));

export function LoginPage() {
  const { styles } = useStyles();
  const navigate = useNavigate();
  const [form] = Form.useForm<LoginFormValues>();
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: LoginFormValues) => {
    setLoading(true);
    try {
      await login(values.username, values.password);
      navigate('/', { replace: true });
    } catch {
      message.error('Invalid username or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <Card className={styles.card}>
        <div className={styles.header}>
          <Typography.Title level={3} style={{ margin: 0 }}>
            Unihub
          </Typography.Title>
        </div>

        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="username" rules={[{ required: true, message: 'Username is required' }]}>
            <Input
              size="large"
              prefix={<UserOutlined />}
              placeholder="Username"
              autoFocus
              autoComplete="username"
            />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: 'Password is required' }]}>
            <Input.Password
              size="large"
              prefix={<LockOutlined />}
              placeholder="Password"
              autoComplete="current-password"
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              className={styles.submitButton}
            >
              Sign In
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
