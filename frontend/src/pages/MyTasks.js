import React, { useEffect, useState } from 'react';
import { Typography, Card, Table, Tag, Progress, Select, Row, Col, Statistic, Badge, Empty, message } from 'antd';
import { ClockCircleOutlined, CheckCircleOutlined, WarningOutlined, FileTextOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

const { Title, Text } = Typography;
const statusColors = { '대기': 'default', '진행중': 'blue', '완료': 'green' };
const levelColors = { 1: 'purple', 2: 'blue', 3: 'cyan', 4: 'green' };

export default function MyTasks({ user }) {
  const [allWbs, setAllWbs] = useState([]);
  const [projects, setProjects] = useState([]);
  const [filterStatus, setFilterStatus] = useState(null);
  const [filterProject, setFilterProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get('/projects')
      .then(res => {
        if (cancelled) return null;
        setProjects(res.data);
        const promises = res.data.map(p =>
          api.get(`/projects/${p.id}/wbs`).then(wbsRes =>
            wbsRes.data.map(w => ({ ...w, project_name: p.name, project_id: p.id }))
          )
        );
        return Promise.all(promises);
      })
      .then(results => {
        if (cancelled || !results) return;
        const all = results.flat();
        const mine = all.filter(w => w.assignee_id === user?.id);
        setAllWbs(mine);
      })
      .catch(() => {
        if (!cancelled) message.error('데이터를 불러오지 못했어요');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [user]);

  const filtered = allWbs.filter(w => {
    if (filterStatus && w.status !== filterStatus) return false;
    if (filterProject && w.project_id !== filterProject) return false;
    return true;
  });

  const today = new Date().toISOString().split('T')[0];
  const delayed = allWbs.filter(w => w.plan_end_date && w.plan_end_date < today && w.status !== '완료');
  const upcoming = allWbs.filter(w => {
    if (!w.plan_end_date || w.status === '완료') return false;
    const diff = Math.floor((new Date(w.plan_end_date) - new Date()) / 86400000);
    return diff >= 0 && diff <= 7;
  });
  const inProgress = allWbs.filter(w => w.status === '진행중');
  const completed = allWbs.filter(w => w.status === '완료');

  const columns = [
    { title: '프로젝트', dataIndex: 'project_name', key: 'project_name', width: 130,
      render: (text, record) => (
        <a onClick={() => navigate(`/projects/${record.project_id}`, { state: { from: '/my-tasks' } })} style={{ fontSize: 12 }}>{text}</a>
      )
    },
    { title: '구분', dataIndex: 'wbs_number', key: 'wbs_number', width: 70,
      render: (num, record) => (
        <span>
          <Tag color={levelColors[record.level]} style={{ fontSize: 9, padding: '0 3px', marginRight: 2 }}>{record.level}L</Tag>
          {num}
        </span>
      )
    },
    { title: '작업명', dataIndex: 'title', key: 'title',
      render: (text, record) => (
        <span style={{ paddingLeft: (record.level - 1) * 12, fontWeight: record.level === 1 ? 'bold' : 'normal' }}>
          {text}
        </span>
      )
    },
    { title: '상태', dataIndex: 'status', key: 'status', width: 80,
      render: (s) => <Tag color={statusColors[s]}>{s}</Tag>
    },
    { title: '계획 시작일', dataIndex: 'plan_start_date', key: 'plan_start_date', width: 100,
      render: (d) => <Text style={{ fontSize: 11 }}>{d || '-'}</Text>
    },
    { title: '계획 완료일', dataIndex: 'plan_end_date', key: 'plan_end_date', width: 100,
      render: (d, record) => {
        if (!d) return <Text style={{ fontSize: 11 }}>-</Text>;
        const isDelayed = d < today && record.status !== '완료';
        const isUpcoming = !isDelayed && Math.floor((new Date(d) - new Date()) / 86400000) <= 7 && record.status !== '완료';
        return (
          <Text style={{ fontSize: 11, color: isDelayed ? '#ff4d4f' : isUpcoming ? '#faad14' : 'inherit', fontWeight: isDelayed || isUpcoming ? 'bold' : 'normal' }}>
            {d} {isDelayed ? '⚠' : isUpcoming ? '⏰' : ''}
          </Text>
        );
      }
    },
    { title: '진척률', key: 'progress', width: 130,
      render: (_, record) => (
        <Progress
          percent={Math.round((record.actual_progress || 0) * 100)}
          size="small"
          status={record.actual_progress >= 1 ? 'success' : record.plan_end_date < today && record.status !== '완료' ? 'exception' : 'active'}
        />
      )
    },
    { title: '바로가기', key: 'action', width: 80,
      render: (_, record) => (
        <a onClick={() => navigate(`/projects/${record.project_id}/gantt`, { state: { from: '/my-tasks' } })} style={{ fontSize: 12 }}>간트차트 →</a>
      )
    },
  ];

  return (
    <>
      <Title level={4} style={{ marginBottom: 16 }}>📌 내 업무</Title>

      {/* 통계 카드 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic title="전체 할당 업무" value={allWbs.length} prefix={<FileTextOutlined />} valueStyle={{ color: '#1677ff' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="진행중" value={inProgress.length} prefix={<ClockCircleOutlined />} valueStyle={{ color: '#faad14' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Badge count={upcoming.length} offset={[8, 0]}>
              <Statistic title="마감 임박 (7일)" value={upcoming.length} prefix={<WarningOutlined />} valueStyle={{ color: '#fa8c16' }} />
            </Badge>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="지연" value={delayed.length} prefix={<WarningOutlined />} valueStyle={{ color: '#ff4d4f' }} />
          </Card>
        </Col>
      </Row>

      {/* 지연/임박 알림 */}
      {delayed.length > 0 && (
        <Card style={{ marginBottom: 16, borderColor: '#ff4d4f', background: '#fff2f0' }}>
          <Title level={5} style={{ color: '#ff4d4f', margin: 0, marginBottom: 8 }}>⚠️ 지연된 업무 ({delayed.length}건)</Title>
          {delayed.map(w => (
            <div key={w.id} style={{ fontSize: 12, marginBottom: 4 }}>
              <Tag color="red">{w.project_name}</Tag>
              <strong>{w.title}</strong> - 완료 예정: {w.plan_end_date}
            </div>
          ))}
        </Card>
      )}

      {upcoming.length > 0 && (
        <Card style={{ marginBottom: 16, borderColor: '#faad14', background: '#fffbe6' }}>
          <Title level={5} style={{ color: '#faad14', margin: 0, marginBottom: 8 }}>⏰ 마감 임박 업무 ({upcoming.length}건)</Title>
          {upcoming.map(w => (
            <div key={w.id} style={{ fontSize: 12, marginBottom: 4 }}>
              <Tag color="orange">{w.project_name}</Tag>
              <strong>{w.title}</strong> - 완료 예정: {w.plan_end_date}
            </div>
          ))}
        </Card>
      )}

      {/* 필터 + 테이블 */}
      <Card>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <Select placeholder="상태 필터" style={{ width: 120 }} allowClear onChange={setFilterStatus}>
            <Select.Option value="대기">대기</Select.Option>
            <Select.Option value="진행중">진행중</Select.Option>
            <Select.Option value="완료">완료</Select.Option>
          </Select>
          <Select placeholder="프로젝트 필터" style={{ width: 200 }} allowClear onChange={setFilterProject}>
            {projects.map(p => <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>)}
          </Select>
          <Text type="secondary" style={{ lineHeight: '32px' }}>총 {filtered.length}건</Text>
        </div>
        <Table dataSource={filtered} columns={columns} rowKey="id" size="small"
          loading={loading}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  allWbs.length === 0
                    ? '아직 할당된 업무가 없어요'
                    : '조건에 맞는 업무가 없어요'
                }
              />
            ),
          }}
          rowClassName={(record) => {
            if (record.plan_end_date && record.plan_end_date < today && record.status !== '완료') return 'delayed-row';
            return '';
          }}
        />
      </Card>
    </>
  );
}