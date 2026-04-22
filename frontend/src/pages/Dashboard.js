import React, { useEffect, useMemo, useState } from 'react';
import { Typography, Card, Row, Col, Tag, Table, Progress, Button, Statistic } from 'antd';
import {
  ProjectOutlined, CheckCircleOutlined, WarningOutlined,
  ClockCircleOutlined, RiseOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import api from '../api/axios';

const { Title, Text } = Typography;
const statusColor = { '제안': 'blue', '수행': 'green', '종료': 'default' };

export default function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [wbsStats, setWbsStats] = useState({});
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // 페이지 진입(마운트) 시마다 새로 fetch
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setProjects([]);
    setWbsStats({});

    const today = dayjs().startOf('day');

    api.get('/projects')
      .then((res) => {
        if (cancelled) return;
        setProjects(res.data);
        return Promise.all(
          res.data.map((p) =>
            api.get(`/projects/${p.id}/wbs`)
              .then((r) => ({ pid: p.id, items: r.data || [] }))
              .catch(() => ({ pid: p.id, items: [] })),
          ),
        );
      })
      .then((results) => {
        if (cancelled || !results) return;
        const stats = {};
        results.forEach(({ pid, items }) => {
          const total = items.length;
          const avgProgress = total > 0
            ? items.reduce((sum, i) => sum + (i.actual_progress || 0), 0) / total
            : 0;
          const delayed = items.filter((i) => {
            if (!i.plan_end_date) return false;
            if (i.status === '완료') return false;
            return dayjs(i.plan_end_date).startOf('day').isBefore(today);
          }).length;
          stats[pid] = {
            total,
            avg: Math.round(avgProgress * 100),
            delayed,
          };
        });
        setWbsStats(stats);
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  const inProgress = projects.filter((p) => p.status === '수행').length;
  const completed  = projects.filter((p) => p.status === '종료').length;

  // 프로젝트별 소속 WBS 중 지연 항목이 1개 이상이면 해당 프로젝트를 지연 프로젝트로 카운트
  const delayedProjectCount = useMemo(() => (
    Object.values(wbsStats).filter((s) => s.delayed > 0).length
  ), [wbsStats]);

  // 전체 진척률 = 전체 WBS의 actual_progress 평균 (프로젝트 가중 없이 WBS 단위 균등 평균)
  const overallProgress = useMemo(() => {
    let sum = 0;
    let count = 0;
    Object.values(wbsStats).forEach((s) => {
      if (!s.total) return;
      // avg가 %단위이므로 다시 WBS 개수만큼 가중
      sum += (s.avg / 100) * s.total;
      count += s.total;
    });
    if (!count) return 0;
    return Math.round((sum / count) * 100);
  }, [wbsStats]);

  const columns = [
    { title: '프로젝트명', dataIndex: 'name', key: 'name', render: (text, record) => <a onClick={() => navigate(`/projects/${record.id}`, { state: { from: '/dashboard' } })} style={{ fontWeight: 'bold' }}>{text}</a> },
    { title: 'PM', dataIndex: 'pm_name', key: 'pm_name', width: 80 },
    { title: '상태', dataIndex: 'status', key: 'status', width: 80, render: (s) => <Tag color={statusColor[s]}>{s}</Tag> },
    { title: '기간', key: 'period', width: 180, render: (_, r) => <Text style={{ fontSize: 11 }}>{r.start_date} ~ {r.end_date}</Text> },
    {
      title: '진척률', key: 'progress', width: 130, render: (_, r) => {
        const stat = wbsStats[r.id];
        if (!stat) return <Text type="secondary">-</Text>;
        return <Progress percent={stat.avg} size="small" status={stat.avg === 100 ? 'success' : stat.delayed > 0 ? 'exception' : 'active'} />;
      },
    },
    {
      title: '지연', key: 'delayed', width: 70, render: (_, r) => {
        const stat = wbsStats[r.id];
        if (!stat || stat.delayed === 0) return <Tag color="green">정상</Tag>;
        return <Tag color="red">{stat.delayed}건</Tag>;
      },
    },
    {
      title: '바로가기', key: 'action', width: 90, render: (_, r) => (
        <Button size="small" type="primary" onClick={() => navigate(`/projects/${r.id}/gantt`, { state: { from: '/dashboard' } })}>간트차트</Button>
      ),
    },
  ];

  return (
    <>
      <Title level={4} style={{ marginBottom: 16 }}>📊 전사 현황 대시보드</Title>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={12} md={8} lg={5}><Card><Statistic title="전체 프로젝트" value={projects.length} prefix={<ProjectOutlined />} valueStyle={{ color: '#1677ff' }} /></Card></Col>
        <Col xs={12} md={8} lg={5}><Card><Statistic title="진행중" value={inProgress} prefix={<ClockCircleOutlined />} valueStyle={{ color: '#faad14' }} /></Card></Col>
        <Col xs={12} md={8} lg={5}><Card><Statistic title="완료" value={completed} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col xs={12} md={8} lg={5}><Card><Statistic title="지연 프로젝트" value={delayedProjectCount} prefix={<WarningOutlined />} valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
        <Col xs={24} md={16} lg={4}>
          <Card>
            <Statistic
              title="전체 진척률"
              value={overallProgress}
              suffix="%"
              prefix={<RiseOutlined />}
              valueStyle={{ color: '#13c2c2' }}
            />
            <Progress percent={overallProgress} size="small" style={{ marginTop: 4 }} />
          </Card>
        </Col>
      </Row>
      <Card title="📋 전체 프로젝트 현황">
        <Table dataSource={projects} columns={columns} rowKey="id" size="small" loading={loading} />
      </Card>
    </>
  );
}
