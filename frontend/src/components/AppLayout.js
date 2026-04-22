import React, { useState, useEffect } from 'react';
import { Layout, Typography, Menu, Input, Avatar, Button, AutoComplete, Tag, Tooltip, message } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import { DashboardOutlined, UnorderedListOutlined, BarChartOutlined, SearchOutlined, UserOutlined, LogoutOutlined, MenuFoldOutlined, MenuUnfoldOutlined, CheckCircleOutlined, TeamOutlined, FileDoneOutlined, AuditOutlined, BankOutlined } from '@ant-design/icons';
import api from '../api/axios';

const statusColor = { '진행중': 'blue', '완료': 'green', '대기': 'default', '제안': 'geekblue', '수행': 'blue', '종료': 'green', '취소': 'red' };

const { Header, Content, Sider } = Layout;
const { Title, Text } = Typography;

export default function AppLayout({ user, onLogout, children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [allProjects, setAllProjects] = useState([]);
  const [searchValue, setSearchValue] = useState('');
  const [searchOptions, setSearchOptions] = useState([]);

  useEffect(() => {
    api.get('/projects').then((res) => setAllProjects(res.data)).catch(() => {});
  }, []);

  const handleSearch = (text) => {
    setSearchValue(text);
    const q = (text || '').trim().toLowerCase();
    if (!q) {
      setSearchOptions([]);
      return;
    }
    const filtered = allProjects
      .filter((p) =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.pm_name || '').toLowerCase().includes(q)
      )
      .slice(0, 8);
    if (filtered.length === 0) {
      setSearchOptions([{
        value: '__none__',
        disabled: true,
        label: <span style={{ color: '#999' }}>검색 결과가 없어요.</span>,
      }]);
      return;
    }
    setSearchOptions(
      filtered.map((p) => ({
        value: String(p.id),
        label: (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <strong>{p.name}</strong>
              {p.pm_name && <span style={{ color: '#888', marginLeft: 6, fontSize: 12 }}>· PM {p.pm_name}</span>}
            </span>
            {p.status && <Tag color={statusColor[p.status] || 'default'} style={{ marginRight: 0 }}>{p.status}</Tag>}
          </div>
        ),
      }))
    );
  };

  const handleSelect = (value) => {
    if (value === '__none__') return;
    setSearchValue('');
    setSearchOptions([]);
    navigate(`/projects/${value}`, { state: { from: location.pathname + (location.search || '') } });
  };

  // system_role 기준: admin은 모든 권한, manager는 검토 권한, user는 일반 권한
  const canReview = ['admin', 'manager'].includes(user?.role);
  const menuItems = [
    { key: '/', icon: <DashboardOutlined />, label: '대시보드' },
    { key: '/projects', icon: <UnorderedListOutlined />, label: '프로젝트' },
    { key: '/my-tasks', icon: <CheckCircleOutlined />, label: '내 업무' },
    { key: '/reports', icon: <FileDoneOutlined />, label: '업무 보고' },
    ...(canReview
      ? [{ key: '/reports/review', icon: <AuditOutlined />, label: '보고 검토' }]
      : []),
    { key: '/stats', icon: <BarChartOutlined />, label: '통계' },
    ...(user?.role === 'admin'
      ? [
          { key: '/users', icon: <TeamOutlined />, label: '유저 관리' },
          { key: '/org-management', icon: <BankOutlined />, label: '조직 관리' },
        ]
      : []),
  ];

  const siderWidth = collapsed ? 80 : 220;

  const isDev = process.env.NODE_ENV === 'development';
  const testAccounts = [
    { label: '사장',   emoji: '👑', email: 'admin@pms.com' },
    { label: '본부장', emoji: '🏢', email: 'manager@pms.com' },
    { label: 'PM',     emoji: '📋', email: 'pm@pms.com' },
    { label: '사원',   emoji: '👤', email: 'user@pms.com' },
  ];
  const loginAs = async (email) => {
    try {
      const params = new URLSearchParams();
      params.append('email', email);
      params.append('password', '1234');
      const res = await api.post(`/auth/login?${params.toString()}`);
      localStorage.setItem('token', res.data.access_token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      window.location.reload();
    } catch (err) {
      message.error(err.response?.data?.detail || '계정 전환에 실패했어요');
    }
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        width={220}
        collapsedWidth={80}
        collapsed={collapsed}
        style={{ background: '#001529', position: 'fixed', height: '100vh', left: 0, top: 0, zIndex: 100 }}
      >
        <div style={{ padding: collapsed ? '20px 8px' : '20px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: collapsed ? 'center' : 'left' }}>
          <Title level={4} style={{ color: 'white', margin: 0 }}>🗂{!collapsed && ' PMS'}</Title>
          {!collapsed && <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>프로젝트 관리 시스템</Text>}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ marginTop: 8 }}
        />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px', borderTop: '1px solid rgba(255,255,255,0.1)', background: '#001529' }}>
          {!collapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Avatar icon={<UserOutlined />} size="small" style={{ background: '#1677ff', flexShrink: 0 }} />
              <div>
                <Text style={{ color: 'white', fontSize: 12, display: 'block' }}>{user?.name}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>{user?.role}</Text>
              </div>
            </div>
          )}
          {isDev && (
            <div style={{ marginBottom: 8, padding: '8px', background: 'rgba(255,255,255,0.04)', borderRadius: 6 }}>
              {!collapsed && (
                <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, display: 'block', marginBottom: 6 }}>
                  🧪 테스트 계정
                </Text>
              )}
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: collapsed ? 'center' : 'flex-start' }}>
                {testAccounts.map((acc) => (
                  <Tooltip key={acc.email} title={`${acc.label} (${acc.email})`} placement="right">
                    <Button
                      size="small"
                      onClick={() => loginAs(acc.email)}
                      style={{ padding: '0 6px', minWidth: collapsed ? 28 : 'auto', fontSize: 12 }}
                    >
                      {acc.emoji}
                    </Button>
                  </Tooltip>
                ))}
              </div>
            </div>
          )}
          {collapsed ? (
            <Button icon={<LogoutOutlined />} onClick={onLogout} size="small" block />
          ) : (
            <Button icon={<LogoutOutlined />} onClick={onLogout} size="small" block>로그아웃</Button>
          )}
        </div>
      </Sider>

      <Layout style={{ marginLeft: siderWidth, transition: 'margin-left 0.2s' }}>
        <Header style={{ background: 'white', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', position: 'sticky', top: 0, zIndex: 99 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
            />
            <AutoComplete
              value={searchValue}
              options={searchOptions}
              onSearch={handleSearch}
              onSelect={handleSelect}
              onChange={setSearchValue}
              style={{ width: 320 }}
              popupMatchSelectWidth={380}
              notFoundContent={null}
            >
              <Input
                placeholder="프로젝트, PM 검색..."
                prefix={<SearchOutlined />}
                allowClear
              />
            </AutoComplete>
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>오늘: {new Date().toLocaleDateString('ko-KR')}</Text>
        </Header>
        <Content style={{ padding: '24px', background: '#f5f6fa', minHeight: 'calc(100vh - 64px)' }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}