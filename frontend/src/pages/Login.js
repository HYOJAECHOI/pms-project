import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import api from '../api/axios';

const { Title, Text } = Typography;

export default function Login({ onLogin }) {
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('email', values.email);
      params.append('password', values.password);
      const res = await api.post(`/auth/login?${params.toString()}`);
      localStorage.setItem('token', res.data.access_token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      message.success(`${res.data.user.name}님 환영해요!`);
      onLogin(res.data.user);
    } catch (err) {
      message.error(err.response?.data?.detail || '로그인 실패했어요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
      <Card style={{ width: 400, borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Title level={3} style={{ margin: 0, color: '#1677ff' }}>🗂 PMS</Title>
          <Text type="secondary">프로젝트 관리 시스템</Text>
        </div>
        <Form layout="vertical" onFinish={handleSubmit}>
          <Form.Item label="이메일" name="email" rules={[{ required: true, message: '이메일을 입력해주세요.' }]}>
            <Input prefix={<UserOutlined />} placeholder="이메일 입력" size="large" />
          </Form.Item>
          <Form.Item label="비밀번호" name="password" rules={[{ required: true, message: '비밀번호를 입력해주세요.' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="비밀번호 입력" size="large" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" size="large" block loading={loading}>
              로그인
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}