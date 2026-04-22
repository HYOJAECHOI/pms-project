import React, { useEffect, useState } from 'react';
import { Button, Table, Select, Card, Typography, Popconfirm, message, Tag, Space } from 'antd';
import { ArrowLeftOutlined, UserAddOutlined } from '@ant-design/icons';
import api from '../api/axios';
import { useParams, useNavigate } from 'react-router-dom';

const { Title, Text } = Typography;

const PROJECT_ROLES = [
  { value: 'PM', label: 'PM' },
  { value: 'PL', label: 'PL' },
  { value: 'PAO', label: 'PAO' },
  { value: 'Member', label: 'Member' },
];
const projectRoleColor = { PM: 'gold', PL: 'blue', PAO: 'cyan', Member: 'default' };

export default function ProjectMembers() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedRole, setSelectedRole] = useState('Member');

  useEffect(() => {
    fetchMembers();
    api.get('/users').then(res => setAllUsers(res.data));
  }, [id]);

  const fetchMembers = () => {
    api.get(`/projects/${id}/members`).then(res => setMembers(res.data));
  };

  const handleAddMember = () => {
    if (!selectedUser) { message.warning('추가할 멤버를 선택해주세요!'); return; }
    const params = { user_id: selectedUser };
    if (selectedRole) params.project_role = selectedRole;
    api.post(`/projects/${id}/members`, null, { params })
      .then(() => {
        message.success('멤버가 추가됐어요!');
        setSelectedUser(null);
        setSelectedRole('Member');
        fetchMembers();
      })
      .catch((err) => message.error(err?.response?.data?.detail || '추가에 실패했어요.'));
  };

  const handleRoleChange = (record, newRole) => {
    if (record.is_pm && !record.member_id) {
      message.warning('PM(프로젝트 책임자)의 역할은 여기서 변경할 수 없어요.');
      return;
    }
    api.put(`/projects/${id}/members/${record.user_id}`, null, {
      params: { project_role: newRole },
    })
      .then(() => { message.success('역할을 변경했어요.'); fetchMembers(); })
      .catch((err) => message.error(err?.response?.data?.detail || '변경에 실패했어요.'));
  };

  const handleRemoveMember = (userId) => {
    api.delete(`/projects/${id}/members/${userId}`)
      .then(() => { message.success('멤버가 제거됐어요!'); fetchMembers(); })
      .catch((err) => message.error(err?.response?.data?.detail || '제거에 실패했어요.'));
  };

  const columns = [
    {
      title: '이름',
      dataIndex: 'name',
      key: 'name',
      render: (t, r) => (
        <Space size={6}>
          <strong>{t}</strong>
          {r.is_pm && <Tag color="gold">PM</Tag>}
        </Space>
      ),
    },
    { title: '이메일', dataIndex: 'email', key: 'email' },
    { title: 'system 역할', dataIndex: 'role', key: 'role', width: 110 },
    {
      title: '프로젝트 역할',
      dataIndex: 'project_role',
      key: 'project_role',
      width: 160,
      render: (val, record) => {
        if (record.is_pm && !record.member_id) {
          return <Tag color={projectRoleColor.PM}>PM (프로젝트 책임자)</Tag>;
        }
        return (
          <Select
            size="small"
            style={{ width: 130 }}
            value={val || undefined}
            placeholder="선택"
            options={PROJECT_ROLES}
            onChange={(v) => handleRoleChange(record, v)}
          />
        );
      },
    },
    {
      title: '관리',
      key: 'action',
      width: 110,
      render: (_, record) =>
        record.is_pm && !record.member_id ? (
          <Text type="secondary" style={{ fontSize: 12 }}>자동 포함</Text>
        ) : (
          <Popconfirm
            title="정말 제거할까요?"
            onConfirm={() => handleRemoveMember(record.user_id)}
            okText="제거"
            cancelText="취소"
          >
            <Button danger size="small">제거</Button>
          </Popconfirm>
        ),
    },
  ];

  const availableUsers = allUsers.filter(u => !members.some(m => m.user_id === u.id));

  return (
    <>
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/projects/${id}`)} style={{ marginBottom: 16 }}>
        프로젝트로 돌아가기
      </Button>
      <Card>
        <Title level={4}>멤버 관리</Title>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <Select
            placeholder="멤버 선택"
            style={{ width: 240 }}
            value={selectedUser}
            onChange={setSelectedUser}
            options={availableUsers.map(u => ({ value: u.id, label: `${u.name} (${u.email})` }))}
          />
          <Select
            placeholder="역할"
            style={{ width: 120 }}
            value={selectedRole}
            onChange={setSelectedRole}
            options={PROJECT_ROLES}
          />
          <Button type="primary" icon={<UserAddOutlined />} onClick={handleAddMember}>멤버 추가</Button>
        </div>
        <Table dataSource={members} columns={columns} rowKey="user_id" size="small" />
      </Card>
    </>
  );
}
