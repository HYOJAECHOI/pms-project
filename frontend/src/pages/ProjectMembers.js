import React, { useEffect, useMemo, useState } from 'react';
import {
  Button, Table, Select, Card, Typography, Popconfirm, message, Tag, Space,
  Modal, Tree, Input, List, Row, Col, Empty,
} from 'antd';
import { ArrowLeftOutlined, UserAddOutlined, SearchOutlined, BankOutlined } from '@ant-design/icons';
import api from '../api/axios';
import { useParams, useNavigate, useLocation } from 'react-router-dom';

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
  const location = useLocation();
  const [members, setMembers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [projectOrgId, setProjectOrgId] = useState(null);
  const [projectPmId, setProjectPmId] = useState(null);

  const currentUserId = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}').id; } catch { return null; }
  }, []);

  // 멤버 추가 모달 상태
  const [addOpen, setAddOpen] = useState(false);
  const [selectedOrgKey, setSelectedOrgKey] = useState(null);
  const [search, setSearch] = useState('');
  const [pickedUserId, setPickedUserId] = useState(null);
  const [pickedRole, setPickedRole] = useState('Member');

  useEffect(() => {
    fetchMembers();
    fetchProject();
    api.get('/users').then((res) => setAllUsers(res.data)).catch(() => {});
    api.get('/organizations').then((res) => setOrgs(res.data)).catch(() => {});
  }, [id]);

  const fetchProject = () => {
    api.get(`/projects/${id}`)
      .then((res) => {
        setProjectOrgId(res.data.organization_id ?? null);
        setProjectPmId(res.data.pm_id ?? null);
      })
      .catch(() => {});
  };

  const currentPmMember = members.find((m) => m.user_id === projectPmId)
    || members.find((m) => m.project_role === 'PM')
    || members.find((m) => m.is_pm);

  // pm_id만 업데이트 (project_role은 별도로 변경해야 함)
  const syncPmId = (newPmUserId) =>
    api.put(`/projects/${id}`, null, {
      params: { pm_id: newPmUserId, user_id: currentUserId },
    });

  // syncPmId 성공 후, 기존 PM의 ProjectMember 행이 있으면 'Member'로 자동 강등
  const demoteOldPmIfNeeded = (newPmUserId) => {
    const oldPm = members.find((m) => m.user_id === projectPmId);
    if (!oldPm) return Promise.resolve(null);
    if (oldPm.user_id === newPmUserId) return Promise.resolve(null);
    // member_id가 null이면 ProjectMember 행이 없어 건드릴 수 없음 → 스킵
    if (!oldPm.member_id) return Promise.resolve(null);
    return api.put(`/projects/${id}/members/${oldPm.user_id}`, null, {
      params: { project_role: 'Member' },
    });
  };

  const fetchMembers = () => {
    api.get(`/projects/${id}/members`).then((res) => setMembers(res.data));
  };

  // 트리 데이터 (parent_id 기반)
  const orgTreeData = useMemo(() => {
    const map = new Map();
    orgs.forEach((o) => map.set(o.id, {
      key: String(o.id),
      title: o.name,
      icon: <BankOutlined />,
      children: [],
    }));
    const roots = [];
    orgs.forEach((o) => {
      const node = map.get(o.id);
      if (o.parent_id && map.has(o.parent_id)) {
        map.get(o.parent_id).children.push(node);
      } else {
        roots.push(node);
      }
    });
    return roots;
  }, [orgs]);

  // 모달 열 때 기본 선택: 프로젝트 소속 조직
  useEffect(() => {
    if (addOpen && projectOrgId != null && selectedOrgKey == null) {
      setSelectedOrgKey(String(projectOrgId));
    }
  }, [addOpen, projectOrgId, selectedOrgKey]);

  // 우측 유저 목록: 검색 중이면 전체 유저 대상, 아니면 선택된 조직 소속
  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q) {
      return allUsers.filter((u) =>
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q)
      );
    }
    if (selectedOrgKey == null) return [];
    const orgId = Number(selectedOrgKey);
    return allUsers.filter((u) => u.organization_id === orgId);
  }, [allUsers, selectedOrgKey, search]);

  const isAlreadyMember = (userId) => members.some((m) => m.user_id === userId);

  const resetAddState = () => {
    setAddOpen(false);
    setSearch('');
    setPickedUserId(null);
    setPickedRole('Member');
    setSelectedOrgKey(null);
  };

  // 실제 멤버 추가 API 호출 + (PM이면 pm_id도 동기화)
  const doAddMember = (userId, role) => {
    const params = { user_id: userId };
    if (role) params.project_role = role;
    const finalize = () => { fetchMembers(); fetchProject(); resetAddState(); };
    return api.post(`/projects/${id}/members`, null, { params })
      .then(() => {
        if (role !== 'PM') {
          message.success('멤버가 추가됐어요!');
          finalize();
          return;
        }
        return syncPmId(userId)
          .then(() =>
            demoteOldPmIfNeeded(userId).catch(() => {
              message.warning('기존 PM 역할 정리에 실패했어요. 멤버 목록에서 직접 변경해주세요.');
            }),
          )
          .then(() => { message.success('멤버가 추가됐어요!'); finalize(); })
          .catch(() => {
            message.error('PM 지정에 실패했어요. 개요탭에서 직접 수정해주세요');
            finalize();
          });
      })
      .catch((err) => message.error(err?.response?.data?.detail || '추가에 실패했어요.'));
  };

  const handleAddMember = () => {
    if (!pickedUserId) { message.warning('추가할 멤버를 선택해주세요!'); return; }
    if (pickedRole !== 'PM' || !currentPmMember || currentPmMember.user_id === pickedUserId) {
      doAddMember(pickedUserId, pickedRole);
      return;
    }
    const newName = allUsers.find((u) => u.id === pickedUserId)?.name || `User #${pickedUserId}`;
    Modal.confirm({
      title: 'PM 변경',
      content: `현재 PM: ${currentPmMember.name || currentPmMember.user_name || '-'} 을(를) ${newName} 으로 변경할까요?`,
      okText: '변경',
      cancelText: '취소',
      onOk: () => doAddMember(pickedUserId, pickedRole),
    });
  };

  const doChangeRole = (userId, newRole, extra = {}) => {
    const finalize = () => { fetchMembers(); fetchProject(); };
    return api.put(`/projects/${id}/members/${userId}`, null, {
      params: { project_role: newRole, ...extra },
    })
      .then(() => {
        if (newRole !== 'PM') {
          message.success('역할을 변경했어요.');
          finalize();
          return;
        }
        return syncPmId(userId)
          .then(() =>
            demoteOldPmIfNeeded(userId).catch(() => {
              message.warning('기존 PM 역할 정리에 실패했어요. 멤버 목록에서 직접 변경해주세요.');
            }),
          )
          .then(() => { message.success('역할을 변경했어요.'); finalize(); })
          .catch(() => {
            message.error('PM 지정에 실패했어요. 개요탭에서 직접 수정해주세요');
            finalize();
          });
      })
      .catch((err) => message.error(err?.response?.data?.detail || '변경에 실패했어요.'));
  };

  const handleRoleChange = (record, newRole) => {
    // 이미 해당 역할이면 동작 없음 (onChange가 동일 값으로 재호출되는 케이스 대비)
    if ((record.project_role || null) === (newRole || null)) return;
    // PM 강등: 현재 PM을 PM 외 역할로 내리면 pm_id를 건드리지 않고 경고만 표시 (값은 controlled로 자동 원복)
    if (newRole !== 'PM' && record.user_id === projectPmId) {
      message.warning('PM을 다른 멤버로 재지정해주세요. (개요탭에서 변경할 수 있어요.)');
      return;
    }
    if (newRole !== 'PM' || !currentPmMember || currentPmMember.user_id === record.user_id) {
      doChangeRole(record.user_id, newRole);
      return;
    }
    Modal.confirm({
      title: 'PM 변경',
      content: `현재 PM: ${currentPmMember.name || currentPmMember.user_name || '-'} 을(를) ${record.name || `User #${record.user_id}`} 으로 변경할까요?`,
      okText: '변경',
      cancelText: '취소',
      onOk: () => doChangeRole(record.user_id, newRole),
    });
  };

  const handleRemoveMember = (userId) => {
    if (userId === projectPmId) {
      message.warning('PM을 다른 멤버로 재지정해주세요. (개요탭에서 변경할 수 있어요.)');
      return;
    }
    api.delete(`/projects/${id}/members/${userId}`)
      .then(() => {
        message.success('멤버가 제거됐어요!');
        fetchMembers();
        fetchProject();
      })
      .catch((err) => message.error(err?.response?.data?.detail || '제거에 실패했어요.'));
  };

  const columns = [
    {
      title: '이름', dataIndex: 'name', key: 'name',
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
      title: '프로젝트 역할', dataIndex: 'project_role', key: 'project_role', width: 160,
      render: (val, record) => (
        // controlled value — onChange에서 차단 시 members state는 그대로라 자동으로 이전 값 유지
        <Select
          size="small"
          style={{ width: 130 }}
          value={val || undefined}
          placeholder="선택"
          options={PROJECT_ROLES}
          onChange={(v) => handleRoleChange(record, v)}
        />
      ),
    },
    {
      title: '관리', key: 'action', width: 110,
      render: (_, record) => (
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

  const pickedUser = allUsers.find((u) => u.id === pickedUserId);

  return (
    <>
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate(`/projects/${id}`, { state: { from: location.state?.from } })}
        style={{ marginBottom: 16 }}
      >
        프로젝트로 돌아가기
      </Button>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Title level={4} style={{ margin: 0 }}>멤버 관리</Title>
          <Button type="primary" icon={<UserAddOutlined />} onClick={() => setAddOpen(true)}>
            멤버 추가
          </Button>
        </div>
        <Table dataSource={members} columns={columns} rowKey="user_id" size="small" />
      </Card>

      <Modal
        open={addOpen}
        onCancel={resetAddState}
        title="멤버 추가"
        width={820}
        footer={
          <Space>
            {pickedUser && (
              <Text type="secondary">
                선택: <strong>{pickedUser.name}</strong> ({pickedUser.email})
              </Text>
            )}
            <Select
              value={pickedRole}
              onChange={setPickedRole}
              options={PROJECT_ROLES}
              style={{ width: 120 }}
            />
            <Button onClick={resetAddState}>취소</Button>
            <Button
              type="primary"
              icon={<UserAddOutlined />}
              onClick={handleAddMember}
              disabled={!pickedUserId}
            >
              추가
            </Button>
          </Space>
        }
      >
        <Input
          placeholder="이름 · 이메일 검색 (입력 시 전체 조직에서 검색)"
          prefix={<SearchOutlined />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          style={{ marginBottom: 12 }}
        />
        <Row gutter={12}>
          <Col span={10}>
            <Card size="small" title="조직" styles={{ body: { padding: 8, maxHeight: 380, overflow: 'auto' } }}>
              {orgTreeData.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="조직이 없어요" />
              ) : (
                <Tree
                  treeData={orgTreeData}
                  showIcon
                  defaultExpandAll
                  selectedKeys={selectedOrgKey ? [selectedOrgKey] : []}
                  onSelect={(keys) => {
                    setSelectedOrgKey(keys.length ? keys[0] : null);
                    setPickedUserId(null);
                  }}
                  blockNode
                />
              )}
            </Card>
          </Col>
          <Col span={14}>
            <Card
              size="small"
              title={
                search.trim()
                  ? `검색 결과 (${filteredUsers.length}명)`
                  : selectedOrgKey
                    ? `${orgs.find((o) => String(o.id) === selectedOrgKey)?.name || '선택된 조직'} 소속 (${filteredUsers.length}명)`
                    : '조직을 선택해주세요'
              }
              styles={{ body: { padding: 0, maxHeight: 380, overflow: 'auto' } }}
            >
              {filteredUsers.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={search.trim() ? '검색 결과가 없어요' : '표시할 멤버가 없어요'}
                  style={{ margin: 32 }}
                />
              ) : (
                <List
                  size="small"
                  dataSource={filteredUsers}
                  renderItem={(u) => {
                    const already = isAlreadyMember(u.id);
                    const picked = pickedUserId === u.id;
                    return (
                      <List.Item
                        style={{
                          cursor: already ? 'not-allowed' : 'pointer',
                          opacity: already ? 0.5 : 1,
                          background: picked ? '#e6f4ff' : undefined,
                          padding: '8px 12px',
                        }}
                        onClick={() => { if (!already) setPickedUserId(u.id); }}
                      >
                        <Space size={6} style={{ width: '100%', justifyContent: 'space-between' }}>
                          <span>
                            <strong>{u.name}</strong>
                            <Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>
                              {u.email}
                            </Text>
                            {u.position && (
                              <Tag style={{ marginLeft: 6 }} color="default">{u.position}</Tag>
                            )}
                            {u.organization_name && (
                              <Text type="secondary" style={{ marginLeft: 6, fontSize: 11 }}>
                                · {u.organization_name}
                              </Text>
                            )}
                          </span>
                          {already && <Tag color="default">이미 멤버</Tag>}
                        </Space>
                      </List.Item>
                    );
                  }}
                />
              )}
            </Card>
          </Col>
        </Row>
      </Modal>
    </>
  );
}
