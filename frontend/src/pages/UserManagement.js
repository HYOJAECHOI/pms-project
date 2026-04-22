import React, { useEffect, useState } from 'react';
import {
  Typography, Button, Table, Tag, Space, Modal, Form, Input, Select, Switch,
  Popconfirm, message, Result,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import api from '../api/axios';

const { Title } = Typography;

// system role: admin / manager / user 3가지
const ROLES = [
  { value: 'admin', label: '관리자', color: 'red' },
  { value: 'manager', label: '매니저', color: 'blue' },
  { value: 'user', label: '일반', color: 'default' },
];
const roleColor = Object.fromEntries(ROLES.map((r) => [r.value, r.color]));
const roleLabel = Object.fromEntries(ROLES.map((r) => [r.value, r.label]));

const POSITIONS = ['사장', '부사장', '본부장', '이사', '수석', '책임', '대리', '사원', '연구원']
  .map((p) => ({ value: p, label: p }));

export default function UserManagement({ user }) {
  const [users, setUsers] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();

  const isAdmin = user?.role === 'admin';

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get('/users').then((r) => r.data).catch(() => []),
      api.get('/organizations').then((r) => r.data).catch(() => []),
    ])
      .then(([u, o]) => {
        setUsers(u);
        setOrgs(o);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <Result
        status="403"
        title="접근 권한이 없어요."
        subTitle="유저 관리는 admin 역할만 이용할 수 있어요."
      />
    );
  }

  const orgName = (id) => orgs.find((o) => o.id === id)?.name || '-';

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      const params = {};
      Object.entries(values).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') params[k] = v;
      });
      await api.post('/users', null, { params });
      message.success('유저를 추가했어요.');
      setCreateOpen(false);
      createForm.resetFields();
      load();
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.detail || '유저 추가에 실패했어요.');
    }
  };

  const handleEdit = async () => {
    try {
      const values = await editForm.validateFields();
      const params = {};
      if (values.name) params.name = values.name;
      if (values.role) params.role = values.role;
      if (values.position) params.position = values.position;
      if (values.organization_id != null) params.organization_id = values.organization_id;
      params.is_org_admin = !!values.is_org_admin;
      await api.put(`/users/${editTarget.id}`, null, { params });
      message.success('유저 정보를 수정했어요.');
      setEditTarget(null);
      load();
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.detail || '수정에 실패했어요.');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/users/${id}`);
      message.success('유저를 삭제했어요.');
      load();
    } catch (err) {
      message.error(err?.response?.data?.detail || '유저 삭제에 실패했어요.');
    }
  };

  const columns = [
    { title: '이름', dataIndex: 'name', key: 'name', render: (t) => <strong>{t}</strong> },
    { title: '이메일', dataIndex: 'email', key: 'email' },
    {
      title: 'system 역할',
      dataIndex: 'role',
      key: 'role',
      width: 110,
      render: (r) => <Tag color={roleColor[r] || 'default'}>{roleLabel[r] || r}</Tag>,
    },
    {
      title: '직위',
      dataIndex: 'position',
      key: 'position',
      width: 90,
      render: (p) => p || '-',
    },
    {
      title: '조직',
      dataIndex: 'organization_id',
      key: 'organization_id',
      width: 140,
      render: (id, r) => r.organization_name || orgName(id),
    },
    {
      title: '조직관리',
      dataIndex: 'is_org_admin',
      key: 'is_org_admin',
      width: 90,
      align: 'center',
      render: (v) => (v ? <Tag icon={<SafetyCertificateOutlined />} color="gold">권한</Tag> : '-'),
    },
    {
      title: '관리',
      key: 'action',
      width: 180,
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setEditTarget(record);
              editForm.setFieldsValue({
                name: record.name,
                role: record.role,
                position: record.position,
                organization_id: record.organization_id ?? null,
                is_org_admin: !!record.is_org_admin,
              });
            }}
          >
            수정
          </Button>
          <Popconfirm
            title="이 유저를 삭제할까요?"
            description={`${record.name} (${record.email})`}
            okText="삭제"
            cancelText="취소"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(record.id)}
            disabled={record.id === user?.id}
          >
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={record.id === user?.id}
            >
              삭제
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>👥 유저 관리</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          유저 추가
        </Button>
      </div>

      <Table dataSource={users} columns={columns} rowKey="id" loading={loading} size="small" />

      <Modal
        title="유저 추가"
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => {
          setCreateOpen(false);
          createForm.resetFields();
        }}
        okText="추가"
        cancelText="취소"
        destroyOnClose
        width={520}
      >
        <Form form={createForm} layout="vertical" initialValues={{ role: 'user' }}>
          <Form.Item
            label="이름"
            name="name"
            rules={[{ required: true, message: '이름을 입력해주세요.' }]}
          >
            <Input placeholder="홍길동" />
          </Form.Item>
          <Form.Item
            label="이메일"
            name="email"
            rules={[
              { required: true, message: '이메일을 입력해주세요.' },
              { type: 'email', message: '이메일 형식이 올바르지 않아요.' },
            ]}
          >
            <Input placeholder="user@example.com" />
          </Form.Item>
          <Form.Item
            label="비밀번호"
            name="password"
            rules={[
              { required: true, message: '비밀번호를 입력해주세요.' },
              { min: 4, message: '4자 이상 입력해주세요.' },
            ]}
          >
            <Input.Password />
          </Form.Item>
          <div style={{ display: 'flex', gap: 8 }}>
            <Form.Item
              label="system 역할"
              name="role"
              style={{ flex: 1 }}
              rules={[{ required: true, message: 'system 역할을 선택해주세요.' }]}
            >
              <Select options={ROLES} />
            </Form.Item>
            <Form.Item label="직위" name="position" style={{ flex: 1 }}>
              <Select options={POSITIONS} placeholder="선택" allowClear />
            </Form.Item>
          </div>
          <Form.Item label="조직" name="organization_id">
            <Select
              options={orgs.map((o) => ({ value: o.id, label: o.name }))}
              placeholder="선택"
              allowClear
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editTarget ? `${editTarget.name} 수정` : '유저 수정'}
        open={!!editTarget}
        onOk={handleEdit}
        onCancel={() => setEditTarget(null)}
        okText="저장"
        cancelText="취소"
        destroyOnClose
        width={520}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item label="이름" name="name" rules={[{ required: true, message: '이름을 입력해주세요.' }]}>
            <Input />
          </Form.Item>
          <div style={{ display: 'flex', gap: 8 }}>
            <Form.Item
              label="system 역할"
              name="role"
              style={{ flex: 1 }}
              rules={[{ required: true, message: 'system 역할을 선택해주세요.' }]}
            >
              <Select options={ROLES} />
            </Form.Item>
            <Form.Item label="직위" name="position" style={{ flex: 1 }}>
              <Select options={POSITIONS} placeholder="선택" allowClear />
            </Form.Item>
          </div>
          <Form.Item label="조직" name="organization_id">
            <Select
              options={orgs.map((o) => ({ value: o.id, label: o.name }))}
              placeholder="선택"
              allowClear
            />
          </Form.Item>
          <Form.Item
            label="조직 관리 권한 (is_org_admin)"
            name="is_org_admin"
            valuePropName="checked"
            extra="켜면 admin이 아니어도 조직 관리 기능을 이용할 수 있어요."
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
