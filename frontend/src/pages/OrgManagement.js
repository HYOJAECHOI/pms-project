import React, { useEffect, useMemo, useState } from 'react';
import {
  Typography, Tree, Button, Modal, Form, Input, Select, Tag, Space,
  Popconfirm, message, Result, Card, Empty, Drawer, Avatar, Switch, List,
} from 'antd';
import {
  BankOutlined, PlusOutlined, EditOutlined, DeleteOutlined, TeamOutlined,
  UserOutlined, UserAddOutlined, SafetyCertificateOutlined,
} from '@ant-design/icons';
import api from '../api/axios';

const { Title, Text } = Typography;

export default function OrgManagement({ user }) {
  const [orgs, setOrgs] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createParent, setCreateParent] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignUserId, setAssignUserId] = useState(null);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();

  const isAdmin = user?.role === 'admin';

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get('/organizations').then((r) => r.data).catch(() => []),
      api.get('/users').then((r) => r.data).catch(() => []),
    ])
      .then(([o, u]) => {
        setOrgs(o);
        setUsers(u);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  const { treeData, orgMap } = useMemo(() => {
    const map = new Map();
    orgs.forEach((o) => map.set(o.id, { ...o, title: o.name, key: String(o.id), children: [] }));
    const roots = [];
    orgs.forEach((o) => {
      const node = map.get(o.id);
      if (o.parent_id && map.has(o.parent_id)) {
        map.get(o.parent_id).children.push(node);
      } else {
        roots.push(node);
      }
    });
    return { treeData: roots, orgMap: map };
  }, [orgs]);

  const selectedOrg = selectedOrgId != null ? orgMap.get(selectedOrgId) : null;
  const orgUsers = selectedOrg ? users.filter((u) => u.organization_id === selectedOrg.id) : [];
  const unassignedUsers = users.filter((u) => u.organization_id == null || u.organization_id !== selectedOrg?.id);

  useEffect(() => {
    console.log('[OrgManagement] selectedOrgId changed →', selectedOrgId, '| selectedOrg:', selectedOrg?.name ?? '(none)', '| orgUsers:', orgUsers.length);
  }, [selectedOrgId, selectedOrg, orgUsers.length]);

  if (!isAdmin) {
    return (
      <Result
        status="403"
        title="접근 권한이 없어요."
        subTitle="조직 관리는 admin 역할만 이용할 수 있어요."
      />
    );
  }

  const userCountByOrg = users.reduce((acc, u) => {
    if (u.organization_id != null) {
      acc[u.organization_id] = (acc[u.organization_id] || 0) + 1;
    }
    return acc;
  }, {});

  const openCreate = (parentOrg = null) => {
    setCreateParent(parentOrg);
    createForm.resetFields();
    createForm.setFieldsValue({ parent_id: parentOrg?.id ?? null });
    setCreateOpen(true);
  };

  const openEdit = (org) => {
    setEditTarget(org);
    editForm.setFieldsValue({ name: org.name });
  };

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      const params = { name: values.name };
      if (values.parent_id != null) params.parent_id = values.parent_id;
      await api.post('/organizations', null, { params });
      message.success('조직을 추가했어요.');
      setCreateOpen(false);
      createForm.resetFields();
      setCreateParent(null);
      load();
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.detail || '조직 추가에 실패했어요.');
    }
  };

  const handleEdit = async () => {
    try {
      const values = await editForm.validateFields();
      await api.put(`/organizations/${editTarget.id}`, null, { params: { name: values.name } });
      message.success('조직 이름을 변경했어요.');
      setEditTarget(null);
      load();
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.detail || '조직 수정에 실패했어요.');
    }
  };

  const handleDelete = async (org) => {
    try {
      await api.delete(`/organizations/${org.id}`);
      message.success('조직을 삭제했어요.');
      if (selectedOrgId === org.id) setSelectedOrgId(null);
      load();
    } catch (err) {
      message.error(err?.response?.data?.detail || '조직 삭제에 실패했어요.');
    }
  };

  const handleAssignUser = async () => {
    if (!assignUserId || !selectedOrg) return;
    try {
      await api.put(`/users/${assignUserId}`, null, { params: { organization_id: selectedOrg.id } });
      message.success('유저를 조직에 배정했어요.');
      setAssignOpen(false);
      setAssignUserId(null);
      load();
    } catch (err) {
      message.error(err?.response?.data?.detail || '배정에 실패했어요.');
    }
  };

  const handleToggleOrgAdmin = async (targetUser, checked) => {
    try {
      await api.put(`/users/${targetUser.id}`, null, { params: { is_org_admin: checked } });
      message.success(checked ? '조직 관리자로 지정했어요.' : '조직 관리자 지정을 해제했어요.');
      load();
    } catch (err) {
      message.error(err?.response?.data?.detail || '변경에 실패했어요.');
    }
  };

  const handleUnassign = async (targetUser) => {
    try {
      // 백엔드는 organization_id=0을 NULL로 변환해 무소속 처리
      await api.put(`/users/${targetUser.id}`, null, { params: { organization_id: 0 } });
      message.success('유저를 조직에서 제외했어요.');
      load();
    } catch (err) {
      message.error(err?.response?.data?.detail || '변경에 실패했어요.');
    }
  };

  const titleRender = (node) => {
    const count = userCountByOrg[node.id] || 0;
    const hasChildren = (node.children || []).length > 0;
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
        <BankOutlined style={{ color: '#1677ff' }} />
        <Text strong>{node.name}</Text>
        <Tag icon={<TeamOutlined />} color="blue">{count}명</Tag>
        <Space size={4} onClick={(e) => e.stopPropagation()}>
          <Button size="small" icon={<PlusOutlined />} onClick={() => openCreate(node)}>하위 추가</Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(node)}>수정</Button>
          {hasChildren ? (
            <Button size="small" danger icon={<DeleteOutlined />} disabled title="하위 조직이 있어 삭제할 수 없어요.">
              삭제
            </Button>
          ) : (
            <Popconfirm
              title="이 조직을 삭제할까요?"
              description={`${node.name}${count > 0 ? ` (소속 인원 ${count}명은 무소속이 돼요)` : ''}`}
              okText="삭제" cancelText="취소" okButtonProps={{ danger: true }}
              onConfirm={() => handleDelete(node)}
            >
              <Button size="small" danger icon={<DeleteOutlined />}>삭제</Button>
            </Popconfirm>
          )}
        </Space>
      </span>
    );
  };

  const parentOptions = [
    { value: null, label: '(최상위)' },
    ...orgs.map((o) => ({ value: o.id, label: o.name })),
  ];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>🏢 조직 관리</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreate(null)}>
          최상위 조직 추가
        </Button>
      </div>

      <Card title="조직 트리" loading={loading}>
        {treeData.length === 0 ? (
          <Empty description="등록된 조직이 없어요." />
        ) : (
          <Tree
            treeData={treeData}
            titleRender={titleRender}
            defaultExpandAll
            selectable={true}
            selectedKeys={selectedOrgId != null ? [String(selectedOrgId)] : []}
            onSelect={(keys, info) => {
              console.log('[OrgManagement] Tree onSelect — keys:', keys, 'selected:', info?.selected, 'node:', info?.node?.name);
              const nextId = keys.length ? parseInt(keys[0], 10) : null;
              console.log('[OrgManagement] setting selectedOrgId →', nextId);
              setSelectedOrgId(nextId);
            }}
            showLine={{ showLeafIcon: false }}
            blockNode
          />
        )}
      </Card>

      <Drawer
        title={selectedOrg ? (
          <Space><BankOutlined />{selectedOrg.name} <Tag color="blue">{orgUsers.length}명</Tag></Space>
        ) : '조직 상세'}
        width={500}
        open={!!selectedOrg}
        onClose={() => setSelectedOrgId(null)}
        extra={selectedOrg && (
          <Button type="primary" icon={<UserAddOutlined />} onClick={() => { setAssignOpen(true); setAssignUserId(null); }}>
            유저 배정
          </Button>
        )}
      >
        {!selectedOrg ? null : orgUsers.length === 0 ? (
          <Empty description="소속 유저가 없어요." />
        ) : (
          <List
            dataSource={orgUsers}
            renderItem={(u) => (
              <List.Item
                actions={[
                  <Space size={4} key="admin">
                    <Text style={{ fontSize: 12 }}>관리자</Text>
                    <Switch
                      size="small"
                      checked={!!u.is_org_admin}
                      onChange={(checked) => handleToggleOrgAdmin(u, checked)}
                    />
                  </Space>,
                  <Popconfirm
                    key="unassign"
                    title="조직에서 제외할까요?"
                    onConfirm={() => handleUnassign(u)}
                    okText="제외"
                    cancelText="취소"
                  >
                    <Button size="small" type="text" danger>제외</Button>
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta
                  avatar={<Avatar icon={<UserOutlined />} style={{ background: u.is_org_admin ? '#faad14' : '#1677ff' }} />}
                  title={
                    <Space size={6}>
                      <Text strong>{u.name}</Text>
                      {u.is_org_admin && <Tag icon={<SafetyCertificateOutlined />} color="gold">조직 관리자</Tag>}
                    </Space>
                  }
                  description={
                    <Space size={8} style={{ fontSize: 12 }}>
                      <Text type="secondary">{u.position || '직위 없음'}</Text>
                      <Text type="secondary">·</Text>
                      <Tag color={u.role === 'admin' ? 'red' : u.role === 'manager' ? 'blue' : 'default'} style={{ marginRight: 0 }}>{u.role}</Tag>
                      <Text type="secondary">{u.email}</Text>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Drawer>

      <Modal
        title={createParent ? `하위 조직 추가 (상위: ${createParent.name})` : '최상위 조직 추가'}
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => { setCreateOpen(false); createForm.resetFields(); setCreateParent(null); }}
        okText="추가" cancelText="취소" destroyOnClose
      >
        <Form form={createForm} layout="vertical">
          <Form.Item label="조직명" name="name" rules={[{ required: true, message: '조직명을 입력해주세요.' }]}>
            <Input placeholder="예: 개발팀" />
          </Form.Item>
          <Form.Item label="상위 조직" name="parent_id">
            <Select options={parentOptions} placeholder="(최상위)" allowClear />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editTarget ? `조직 수정 - ${editTarget.name}` : '조직 수정'}
        open={!!editTarget}
        onOk={handleEdit}
        onCancel={() => setEditTarget(null)}
        okText="저장" cancelText="취소" destroyOnClose
      >
        <Form form={editForm} layout="vertical">
          <Form.Item label="조직명" name="name" rules={[{ required: true, message: '조직명을 입력해주세요.' }]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={selectedOrg ? `유저 배정 - ${selectedOrg.name}` : '유저 배정'}
        open={assignOpen}
        onOk={handleAssignUser}
        onCancel={() => { setAssignOpen(false); setAssignUserId(null); }}
        okText="배정"
        cancelText="취소"
        okButtonProps={{ disabled: !assignUserId }}
        destroyOnClose
      >
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
          다른 조직에 속한 유저를 선택하면 이 조직으로 이동됩니다.
        </Text>
        <Select
          showSearch
          style={{ width: '100%' }}
          placeholder="유저 선택"
          optionFilterProp="label"
          value={assignUserId}
          onChange={setAssignUserId}
          options={unassignedUsers.map((u) => ({
            value: u.id,
            label: `${u.name} (${u.email})${u.organization_name ? ` · 현재: ${u.organization_name}` : ''}`,
          }))}
        />
      </Modal>
    </>
  );
}
