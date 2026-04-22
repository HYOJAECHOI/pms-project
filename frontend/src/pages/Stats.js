import React, { useEffect, useState } from 'react';
import { Typography, Card, Row, Col, Table, Progress, Statistic, Tag, Empty, message } from 'antd';
import {
  ProjectOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  PauseCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import api from '../api/axios';

const { Title, Text } = Typography;

const STATUS_COLORS = {
  '완료': '#52c41a',
  '진행중': '#1677ff',
  '대기': '#d9d9d9',
  '지연': '#ff4d4f',
};

export default function Stats() {
  const [projects, setProjects] = useState([]);
  const [allWbs, setAllWbs] = useState([]); // { ...item, project_name }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get('/projects')
      .then(async (res) => {
        const projs = res.data;
        if (cancelled) return;
        setProjects(projs);
        const results = await Promise.all(
          projs.map((p) =>
            api
              .get(`/projects/${p.id}/wbs`)
              .then((r) => r.data.map((it) => ({ ...it, project_id: p.id, project_name: p.name })))
              .catch(() => [])
          )
        );
        if (cancelled) return;
        setAllWbs(results.flat());
      })
      .catch(() => {
        if (!cancelled) message.error('통계 데이터를 불러오지 못했어요');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const isDelayed = (it) =>
    it.status !== '완료' && it.plan_end_date && new Date(it.plan_end_date) < today;

  // 1. 프로젝트별 진척률
  const projectProgress = projects.map((p) => {
    const items = allWbs.filter((it) => it.project_id === p.id);
    if (items.length === 0) {
      return { ...p, avg: 0, count: 0, delayed: 0 };
    }
    const avg = items.reduce((s, i) => s + (i.actual_progress || 0), 0) / items.length;
    return {
      ...p,
      avg: Math.round(avg * 100),
      count: items.length,
      delayed: items.filter(isDelayed).length,
    };
  });

  // 2. 담당자별 업무 현황
  const assigneeMap = {};
  allWbs.forEach((it) => {
    if (!it.assignee_id) return;
    const key = it.assignee_id;
    if (!assigneeMap[key]) {
      assigneeMap[key] = {
        assignee_id: it.assignee_id,
        assignee_name: it.assignee_name || '알 수 없음',
        total: 0,
        완료: 0,
        진행중: 0,
        대기: 0,
        지연: 0,
      };
    }
    assigneeMap[key].total += 1;
    if (assigneeMap[key][it.status] !== undefined) assigneeMap[key][it.status] += 1;
    if (isDelayed(it)) assigneeMap[key].지연 += 1;
  });
  const assigneeRows = Object.values(assigneeMap).sort((a, b) => b.total - a.total);

  // 3. 전체 WBS 상태 집계
  const total = allWbs.length;
  const counts = {
    완료: allWbs.filter((it) => it.status === '완료').length,
    진행중: allWbs.filter((it) => it.status === '진행중').length,
    대기: allWbs.filter((it) => it.status === '대기').length,
    지연: allWbs.filter(isDelayed).length,
  };
  const pct = (n) => (total === 0 ? 0 : Math.round((n / total) * 100));

  // 4. 월별 완료 예정 업무 수 (plan_end_date 기준, 향후 6개월 + 지난 3개월)
  const monthlyMap = {};
  allWbs.forEach((it) => {
    if (!it.plan_end_date) return;
    const d = new Date(it.plan_end_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!monthlyMap[key]) monthlyMap[key] = { month: key, planned: 0, done: 0 };
    monthlyMap[key].planned += 1;
    if (it.status === '완료') monthlyMap[key].done += 1;
  });
  const monthly = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month));
  const monthlyMax = monthly.reduce((m, r) => Math.max(m, r.planned), 0);

  const projectColumns = [
    { title: '프로젝트명', dataIndex: 'name', key: 'name', render: (t) => <Text strong>{t}</Text> },
    { title: 'WBS 수', dataIndex: 'count', key: 'count', width: 90, align: 'center' },
    {
      title: '지연',
      dataIndex: 'delayed',
      key: 'delayed',
      width: 90,
      align: 'center',
      render: (v) => (v > 0 ? <Tag color="red">{v}건</Tag> : <Tag color="green">정상</Tag>),
    },
    {
      title: '평균 진척률',
      dataIndex: 'avg',
      key: 'avg',
      render: (v, r) => (
        <Progress
          percent={v}
          size="small"
          status={v === 100 ? 'success' : r.delayed > 0 ? 'exception' : 'active'}
        />
      ),
    },
  ];

  const assigneeColumns = [
    { title: '담당자', dataIndex: 'assignee_name', key: 'assignee_name', render: (t) => <Text strong>{t}</Text> },
    { title: '전체', dataIndex: 'total', key: 'total', width: 70, align: 'center' },
    { title: '완료', dataIndex: '완료', key: '완료', width: 70, align: 'center', render: (v) => <Tag color="green">{v}</Tag> },
    { title: '진행중', dataIndex: '진행중', key: '진행중', width: 70, align: 'center', render: (v) => <Tag color="blue">{v}</Tag> },
    { title: '대기', dataIndex: '대기', key: '대기', width: 70, align: 'center', render: (v) => <Tag>{v}</Tag> },
    { title: '지연', dataIndex: '지연', key: '지연', width: 70, align: 'center', render: (v) => (v > 0 ? <Tag color="red">{v}</Tag> : <Tag color="default">0</Tag>) },
    {
      title: '완료율',
      key: 'rate',
      render: (_, r) => (
        <Progress
          percent={r.total === 0 ? 0 : Math.round((r.완료 / r.total) * 100)}
          size="small"
          status={r.지연 > 0 ? 'exception' : 'normal'}
        />
      ),
    },
  ];

  return (
    <>
      <Title level={4} style={{ marginBottom: 16 }}>📈 통계</Title>

      {/* 요약 카드 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic title="전체 프로젝트" value={projects.length} prefix={<ProjectOutlined />} valueStyle={{ color: '#1677ff' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="전체 WBS" value={total} prefix={<ClockCircleOutlined />} valueStyle={{ color: '#722ed1' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="완료 WBS" value={counts.완료} suffix={`/ ${total}`} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="지연 WBS" value={counts.지연} prefix={<WarningOutlined />} valueStyle={{ color: '#ff4d4f' }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        {/* 3. 전체 WBS 상태 파이 차트 */}
        <Col span={10}>
          <Card title="🧭 전체 WBS 상태 분포" loading={loading}>
            {total === 0 ? (
              <Empty description="WBS 데이터 없음" />
            ) : (
              <>
                <Row gutter={16} justify="space-around" style={{ marginBottom: 16 }}>
                  {['완료', '진행중', '대기', '지연'].map((k) => (
                    <Col key={k} style={{ textAlign: 'center' }}>
                      <Progress
                        type="circle"
                        size={90}
                        percent={pct(counts[k])}
                        strokeColor={STATUS_COLORS[k]}
                        format={() => (
                          <div>
                            <div style={{ fontSize: 16, fontWeight: 'bold', color: STATUS_COLORS[k] }}>{counts[k]}</div>
                            <div style={{ fontSize: 11, color: '#888' }}>{k}</div>
                          </div>
                        )}
                      />
                    </Col>
                  ))}
                </Row>
                <div style={{ display: 'flex', height: 18, borderRadius: 4, overflow: 'hidden', border: '1px solid #eee' }}>
                  {['완료', '진행중', '대기', '지연'].map((k) =>
                    counts[k] === 0 ? null : (
                      <div
                        key={k}
                        style={{
                          width: `${pct(counts[k])}%`,
                          background: STATUS_COLORS[k],
                          color: 'white',
                          fontSize: 11,
                          textAlign: 'center',
                          lineHeight: '18px',
                        }}
                        title={`${k} ${counts[k]}건`}
                      >
                        {pct(counts[k]) >= 8 ? `${pct(counts[k])}%` : ''}
                      </div>
                    )
                  )}
                </div>
                <Row gutter={8} style={{ marginTop: 12 }}>
                  {['완료', '진행중', '대기', '지연'].map((k) => (
                    <Col key={k} span={6} style={{ fontSize: 12 }}>
                      <span style={{ display: 'inline-block', width: 10, height: 10, background: STATUS_COLORS[k], marginRight: 6, borderRadius: 2 }} />
                      {k} {counts[k]}건
                    </Col>
                  ))}
                </Row>
              </>
            )}
          </Card>
        </Col>

        {/* 4. 월별 완료 예정 업무 수 */}
        <Col span={14}>
          <Card title="📅 월별 완료 예정 업무" loading={loading}>
            {monthly.length === 0 ? (
              <Empty description="계획 종료일이 설정된 WBS가 없음" />
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-end', height: 220, gap: 12, padding: '8px 4px' }}>
                {monthly.map((m) => {
                  const h = monthlyMax === 0 ? 0 : (m.planned / monthlyMax) * 180;
                  const doneH = m.planned === 0 ? 0 : (m.done / m.planned) * h;
                  return (
                    <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <Text style={{ fontSize: 11, marginBottom: 4 }}>{m.planned}</Text>
                      <div
                        style={{
                          width: '100%',
                          maxWidth: 48,
                          height: h,
                          background: '#e6f4ff',
                          borderRadius: 4,
                          position: 'relative',
                          overflow: 'hidden',
                          border: '1px solid #bae0ff',
                        }}
                        title={`예정 ${m.planned}건 / 완료 ${m.done}건`}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            height: doneH,
                            background: '#52c41a',
                          }}
                        />
                      </div>
                      <Text style={{ fontSize: 11, marginTop: 6 }}>{m.month}</Text>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ marginTop: 8, fontSize: 12, color: '#888' }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, background: '#52c41a', marginRight: 4 }} />
              완료
              <span style={{ display: 'inline-block', width: 10, height: 10, background: '#bae0ff', marginLeft: 12, marginRight: 4 }} />
              예정
            </div>
          </Card>
        </Col>
      </Row>

      {/* 1. 프로젝트별 진척률 */}
      <Card title="📊 프로젝트별 진척률" style={{ marginBottom: 24 }} loading={loading}>
        <Table dataSource={projectProgress} columns={projectColumns} rowKey="id" size="small" pagination={false} />
      </Card>

      {/* 2. 담당자별 업무 현황 */}
      <Card title="👥 담당자별 업무 현황" loading={loading}>
        {assigneeRows.length === 0 ? (
          <Empty description="담당자가 지정된 WBS가 없음" />
        ) : (
          <Table dataSource={assigneeRows} columns={assigneeColumns} rowKey="assignee_id" size="small" pagination={{ pageSize: 10 }} />
        )}
      </Card>
    </>
  );
}
