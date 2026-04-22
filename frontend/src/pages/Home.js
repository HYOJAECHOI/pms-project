import React, { useEffect, useMemo, useState } from 'react';
import {
  Typography, Card, Row, Col, Statistic, Tag, List, Empty, Space, Divider,
} from 'antd';
import {
  FileTextOutlined, ClockCircleOutlined, TeamOutlined, BellOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import api from '../api/axios';

dayjs.locale('ko');

const { Title, Text } = Typography;

const today = () => dayjs().startOf('day');
const formatToday = () => dayjs().format('YYYY년 M월 D일 (ddd)');
const projectStatusColor = { 제안: 'blue', 수행: 'green', 종료: 'default' };

export default function Home() {
  const navigate = useNavigate();

  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user'));
    } catch {
      return null;
    }
  }, []);

  const [myProjects, setMyProjects] = useState([]);
  const [myWbs, setMyWbs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return undefined; }
    let cancelled = false;
    setLoading(true);

    api.get('/projects')
      .then(async (res) => {
        if (cancelled) return null;
        const projects = res.data || [];
        const [wbsResults, memberResults] = await Promise.all([
          Promise.all(projects.map((p) =>
            api.get(`/projects/${p.id}/wbs`)
              .then((r) => (r.data || []).map((w) => ({ ...w, project_name: p.name, project_id: p.id })))
              .catch(() => [])
          )),
          Promise.all(projects.map((p) =>
            api.get(`/projects/${p.id}/members`)
              .then((r) => ({ project: p, members: r.data || [] }))
              .catch(() => ({ project: p, members: [] }))
          )),
        ]);
        if (cancelled) return null;
        const mine = wbsResults.flat().filter((w) => w.assignee_id === user.id);
        const joined = memberResults
          .filter(({ members }) => members.some((m) => m.user_id === user.id))
          .map(({ project }) => project);
        setMyWbs(mine);
        setMyProjects(joined);
        return null;
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [user?.id]);

  const t = today();

  const taskStats = useMemo(() => {
    const inProgress = myWbs.filter((w) => w.status === '진행중').length;
    const delayed = myWbs.filter((w) =>
      w.plan_end_date && w.status !== '완료' && dayjs(w.plan_end_date).startOf('day').isBefore(t)
    ).length;
    return { inProgress, delayed };
  }, [myWbs, t]);

  const upcoming = useMemo(() => (
    myWbs
      .filter((w) => {
        if (!w.plan_end_date || w.status === '완료') return false;
        const diff = dayjs(w.plan_end_date).startOf('day').diff(t, 'day');
        return diff >= 0 && diff <= 7;
      })
      .sort((a, b) => dayjs(a.plan_end_date).diff(dayjs(b.plan_end_date)))
      .slice(0, 3)
  ), [myWbs, t]);

  const projectPreview = myProjects.slice(0, 4);

  if (!user) return null;

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>안녕하세요 {user.name}님 👋</Title>
        <Text type="secondary">{formatToday()}</Text>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card loading={loading} title={<><TeamOutlined /> 내 참여 프로젝트</>}>
            {projectPreview.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="참여 중인 프로젝트가 없어요" />
            ) : (
              <List
                size="small"
                dataSource={projectPreview}
                renderItem={(p) => (
                  <List.Item
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/projects/${p.id}`, { state: { from: '/' } })}
                  >
                    <Space size={4} style={{ fontSize: 12, width: '100%', justifyContent: 'space-between' }}>
                      <strong>{p.name}</strong>
                      <Tag color={projectStatusColor[p.status] || 'default'}>{p.status}</Tag>
                    </Space>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card hoverable loading={loading} onClick={() => navigate('/my-tasks')} title={<><FileTextOutlined /> 내 업무</>}>
            <Row gutter={8}>
              <Col span={12}>
                <Statistic title="진행중" value={taskStats.inProgress} valueStyle={{ fontSize: 22, color: '#1677ff' }} />
              </Col>
              <Col span={12}>
                <Statistic title="지연" value={taskStats.delayed} valueStyle={{ fontSize: 22, color: '#ff4d4f' }} />
              </Col>
            </Row>
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card hoverable loading={loading} onClick={() => navigate('/my-tasks')} title={<><ClockCircleOutlined /> 마감 임박 (7일 이내)</>}>
            {upcoming.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="임박한 업무가 없어요" />
            ) : (
              <List
                size="small"
                dataSource={upcoming}
                renderItem={(w) => (
                  <List.Item>
                    <Space size={4} style={{ fontSize: 12, width: '100%', justifyContent: 'space-between' }}>
                      <span>
                        <Tag color="orange">{w.project_name}</Tag>
                        <strong>{w.title}</strong>
                      </span>
                      <Text type="secondary">{w.plan_end_date}</Text>
                    </Space>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card loading={loading} title={<><BellOutlined /> 보고 필요</>}>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="준비 중" />
          </Card>
        </Col>
      </Row>

      <Divider />
      <Card size="small" title="📢 최근 알림 / 지시사항">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="준비 중" />
      </Card>
    </>
  );
}
