import React, { useEffect, useMemo, useState } from 'react';
import {
  Typography, Card, Table, Tag, Progress, Select, Row, Col, Statistic, Badge,
  Empty, message, Modal, Button, Space, Collapse,
} from 'antd';
import {
  ClockCircleOutlined, CheckCircleOutlined, WarningOutlined, FileTextOutlined,
  ProjectOutlined, ScheduleOutlined, ProfileOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import WBSDetailModal from '../components/WBSDetailModal';

const { Title, Text } = Typography;
const statusColors = { '대기': 'default', '진행중': 'blue', '완료': 'green' };
const levelColors = { 1: 'purple', 2: 'blue', 3: 'cyan', 4: 'green' };

export default function MyTasks({ user }) {
  const [allWbs, setAllWbs] = useState([]);
  const [projects, setProjects] = useState([]);  // 종료 제외된 활성 프로젝트만
  const [filterStatus, setFilterStatus] = useState(null);
  const [filterProject, setFilterProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [navTarget, setNavTarget] = useState(null); // 이동 팝업 대상 WBS
  const [wbsDetailTarget, setWbsDetailTarget] = useState(null); // 상세 모달 대상 WBS
  const [wbsDetailMembers, setWbsDetailMembers] = useState([]);
  const [wbsDetailTab, setWbsDetailTab] = useState('기본정보');
  const [myInstructions, setMyInstructions] = useState([]);
  const navigate = useNavigate();

  // 내 앞으로 온 활성 지시사항 조회 (user_id는 백엔드가 토큰에서 추출)
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    api.get('/my-instructions')
      .then(res => { if (!cancelled) setMyInstructions(res.data || []); })
      .catch(() => { if (!cancelled) setMyInstructions([]); });
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get('/projects')
      .then(res => {
        if (cancelled) return null;
        // 종료된 프로젝트는 WBS/필터 목록 모두에서 제외
        const activeProjects = (res.data || []).filter(p => p.status !== '종료');
        setProjects(activeProjects);
        const promises = activeProjects.map(p =>
          api.get(`/projects/${p.id}/wbs`).then(wbsRes =>
            wbsRes.data.map(w => ({
              ...w,
              project_name: p.name,
              project_id: p.id,
              project_status: p.status,
            }))
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

  // 화면 전용 상태 라벨/색상 (GanttChart/ProjectDetail의 getDisplayStatus와 동일 규칙)
  // actual_end_date가 오늘 이전이면 DB status 무관하게 완료 계열로 표시.
  const getDisplayStatus = (item) => {
    const {
      status,
      plan_start_date: planStart,
      plan_end_date: planEnd,
      actual_start_date: actualStart,
      actual_end_date: actualEnd,
    } = item || {};
    const todayStr = new Date().toISOString().split('T')[0];
    const days = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000);

    if (actualEnd && actualEnd <= todayStr) {
      if (planEnd && actualEnd > planEnd) return { text: `완료 (${days(actualEnd, planEnd)}일 초과)`, color: 'orange' };
      if (planEnd && actualEnd < planEnd) return { text: `완료 (${days(planEnd, actualEnd)}일 조기)`, color: 'green' };
      if (planEnd && actualEnd === planEnd) return { text: '완료 (정시)', color: 'green' };
      return { text: '완료', color: 'green' };
    }
    if (status === '완료') {
      return { text: '완료', color: 'green' };
    }
    if (status === '진행중') {
      if (actualEnd && planEnd && actualEnd > planEnd) {
        return { text: `진행중 (${days(actualEnd, planEnd)}일 초과)`, color: 'red' };
      }
      if (!actualEnd && planEnd && planEnd < todayStr) {
        return { text: `진행중 (${days(todayStr, planEnd)}일 지연)`, color: 'red' };
      }
      if (!actualStart && planStart && planStart < todayStr) {
        return { text: '진행중 (시작 지연)', color: 'orange' };
      }
      return { text: '진행중', color: 'blue' };
    }
    if (status === '대기') {
      if (planStart && planStart <= todayStr) {
        return { text: `대기 (시작 지연 ${days(todayStr, planStart)}일)`, color: 'orange' };
      }
      return { text: '대기', color: 'default' };
    }
    return { text: status || '-', color: 'default' };
  };

  // 메인 테이블은 완료 제외 (완료는 아래 접기 섹션에만 표시)
  const filtered = allWbs.filter(w => {
    if (w.status === '완료') return false;
    if (filterStatus && w.status !== filterStatus) return false;
    if (filterProject && w.project_id !== filterProject) return false;
    return true;
  });

  const today = new Date().toISOString().split('T')[0];
  // 지연: plan_end_date 지났고 status !== '완료' + actual_end_date 없어야 함
  // (상태가 미업데이트라도 실제 종료일이 있으면 제외)
  const delayed = useMemo(() =>
    allWbs.filter(w => w.plan_end_date && w.plan_end_date < today && w.status !== '완료' && !w.actual_end_date),
  [allWbs, today]);
  const upcoming = useMemo(() =>
    allWbs.filter(w => {
      if (!w.plan_end_date || w.status === '완료') return false;
      const diff = Math.floor((new Date(w.plan_end_date) - new Date()) / 86400000);
      return diff >= 0 && diff <= 7;
    }),
  [allWbs]);
  const inProgress = useMemo(() => allWbs.filter(w => w.status === '진행중'), [allWbs]);
  const completed  = useMemo(() => allWbs.filter(w => w.status === '완료'), [allWbs]);

  // 행 클릭 → 이동 팝업 대상 세팅
  const openNavModal = (record) => setNavTarget(record);
  const closeNavModal = () => setNavTarget(null);
  const goToProject = () => {
    if (!navTarget) return;
    navigate(`/projects/${navTarget.project_id}`, { state: { from: '/my-tasks' } });
    closeNavModal();
  };
  const goToGantt = () => {
    if (!navTarget) return;
    navigate(`/projects/${navTarget.project_id}/gantt`, { state: { from: '/my-tasks' } });
    closeNavModal();
  };
  const openWbsDetail = async () => {
    if (!navTarget) return;
    const target = navTarget;
    try {
      const res = await api.get(`/projects/${target.project_id}/members`);
      setWbsDetailMembers(res.data || []);
    } catch {
      setWbsDetailMembers([]);
    }
    setWbsDetailTab('기본정보');
    setWbsDetailTarget(target);
    closeNavModal();
  };

  // 지시사항 클릭 → 해당 WBS의 상세 모달을 지시사항 탭으로 오픈
  const openInstructionDetail = async (ins) => {
    const fromAll = allWbs.find(w => w.id === ins.wbs_id);
    const wbsItem = fromAll || {
      id: ins.wbs_id,
      title: ins.wbs_title,
      wbs_number: ins.wbs_number,
      level: ins.wbs_level,
      project_id: ins.project_id,
      project_name: ins.project_name,
    };
    try {
      const res = await api.get(`/projects/${ins.project_id}/members`);
      setWbsDetailMembers(res.data || []);
    } catch {
      setWbsDetailMembers([]);
    }
    setWbsDetailTab('지시사항');
    setWbsDetailTarget(wbsItem);
  };
  const wbsDetailProject = useMemo(
    () => projects.find(p => p.id === wbsDetailTarget?.project_id) || null,
    [projects, wbsDetailTarget]
  );
  const refreshAfterWbsUpdate = async () => {
    if (!wbsDetailTarget || !user?.id) return;
    try {
      const res = await api.get(`/projects/${wbsDetailTarget.project_id}/wbs`);
      setAllWbs(prev => {
        const others = prev.filter(w => w.project_id !== wbsDetailTarget.project_id);
        const refreshed = (res.data || [])
          .filter(w => w.assignee_id === user.id)
          .map(w => ({ ...w, project_name: wbsDetailProject?.name, project_id: wbsDetailTarget.project_id, project_status: wbsDetailProject?.status }));
        return [...others, ...refreshed];
      });
    } catch { /* ignore */ }
  };

  const columns = [
    { title: '프로젝트', dataIndex: 'project_name', key: 'project_name', width: 130,
      render: (text) => <Text style={{ fontSize: 12 }}>{text}</Text>,
    },
    { title: '구분', dataIndex: 'wbs_number', key: 'wbs_number', width: 70,
      render: (num, record) => (
        <span>
          <Tag color={levelColors[record.level]} style={{ fontSize: 9, padding: '0 3px', marginRight: 2 }}>{record.level}L</Tag>
          {num}
        </span>
      ),
    },
    { title: '작업명', dataIndex: 'title', key: 'title',
      render: (text, record) => (
        <span style={{ paddingLeft: (record.level - 1) * 12, fontWeight: record.level === 1 ? 'bold' : 'normal' }}>
          {text}
        </span>
      ),
    },
    { title: '상태', key: 'status', width: 140,
      render: (_, record) => {
        const ds = getDisplayStatus(record);
        return <Tag color={ds.color}>{ds.text}</Tag>;
      },
    },
    { title: '계획 시작일', dataIndex: 'plan_start_date', key: 'plan_start_date', width: 100,
      render: (d) => <Text style={{ fontSize: 11 }}>{d || '-'}</Text>,
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
      },
    },
    { title: '진척률', key: 'progress', width: 130,
      render: (_, record) => (
        <Progress
          percent={Math.round((record.actual_progress || 0) * 100)}
          size="small"
          status={record.actual_progress >= 1 ? 'success' : record.plan_end_date < today && record.status !== '완료' ? 'exception' : 'active'}
        />
      ),
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

      {/* 새 지시사항 (open/acknowledged/in_progress) */}
      {myInstructions.length > 0 && (
        <Card style={{ marginBottom: 16, borderColor: '#fa8c16', background: '#fff7e6' }}>
          <Title level={5} style={{ color: '#fa8c16', margin: 0, marginBottom: 8 }}>
            📢 새 지시사항 ({myInstructions.length}건)
          </Title>
          {myInstructions.map(ins => {
            const priColor = { low: 'default', normal: 'blue', high: 'orange', urgent: 'red' }[ins.priority] || 'default';
            const priLabel = { low: '낮음', normal: '보통', high: '높음', urgent: '긴급' }[ins.priority] || ins.priority;
            const statColor = { open: 'default', acknowledged: 'blue', in_progress: 'orange' }[ins.status] || 'default';
            const statLabel = { open: '미확인', acknowledged: '확인', in_progress: '진행중' }[ins.status] || ins.status;
            return (
              <div
                key={ins.receipt_id}
                style={{ fontSize: 12, marginBottom: 6, cursor: 'pointer' }}
                onClick={() => openInstructionDetail(ins)}
              >
                <Tag color={priColor}>{priLabel}</Tag>
                <Tag color={statColor}>{statLabel}</Tag>
                <Text type="secondary" style={{ fontSize: 11, marginRight: 6 }}>
                  [{ins.project_name}] {ins.wbs_number} {ins.wbs_title}
                </Text>
                <strong>{ins.title}</strong>
                {ins.author_name && (
                  <Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>
                    · {ins.author_name}
                  </Text>
                )}
              </div>
            );
          })}
        </Card>
      )}

      {/* 지연된 업무 (완료 제외) */}
      {delayed.length > 0 && (
        <Card style={{ marginBottom: 16, borderColor: '#ff4d4f', background: '#fff2f0' }}>
          <Title level={5} style={{ color: '#ff4d4f', margin: 0, marginBottom: 8 }}>⚠️ 지연된 업무 ({delayed.length}건)</Title>
          {delayed.map(w => {
            const ds = getDisplayStatus(w);
            return (
              <div
                key={w.id}
                style={{ fontSize: 12, marginBottom: 4, cursor: 'pointer' }}
                onClick={() => openNavModal(w)}
              >
                <Tag color="red">{w.project_name}</Tag>
                <Tag color={ds.color}>{ds.text}</Tag>
                <strong>{w.title}</strong> - 완료 예정: {w.plan_end_date}
              </div>
            );
          })}
        </Card>
      )}

      {/* 마감 임박 */}
      {upcoming.length > 0 && (
        <Card style={{ marginBottom: 16, borderColor: '#faad14', background: '#fffbe6' }}>
          <Title level={5} style={{ color: '#faad14', margin: 0, marginBottom: 8 }}>⏰ 마감 임박 업무 ({upcoming.length}건)</Title>
          {upcoming.map(w => (
            <div
              key={w.id}
              style={{ fontSize: 12, marginBottom: 4, cursor: 'pointer' }}
              onClick={() => openNavModal(w)}
            >
              <Tag color="orange">{w.project_name}</Tag>
              <strong>{w.title}</strong> - 완료 예정: {w.plan_end_date}
            </div>
          ))}
        </Card>
      )}

      {/* 완료된 업무 (접기/펼치기) */}
      {completed.length > 0 && (
        <Collapse
          style={{ marginBottom: 16 }}
          items={[{
            key: 'done',
            label: (
              <span style={{ color: '#52c41a' }}>
                ✅ 완료된 업무 ({completed.length}건)
              </span>
            ),
            children: (
              <div>
                {completed.map(w => (
                  <div
                    key={w.id}
                    style={{ fontSize: 12, marginBottom: 4, cursor: 'pointer' }}
                    onClick={() => openNavModal(w)}
                  >
                    <Tag color="green">{w.project_name}</Tag>
                    <strong>{w.title}</strong>
                    {w.actual_end_date && <Text type="secondary"> · 완료일: {w.actual_end_date}</Text>}
                  </div>
                ))}
              </div>
            ),
          }]}
        />
      )}

      {/* 필터 + 테이블 */}
      <Card>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <Select placeholder="상태 필터" style={{ width: 120 }} allowClear onChange={setFilterStatus}>
            <Select.Option value="대기">대기</Select.Option>
            <Select.Option value="진행중">진행중</Select.Option>
          </Select>
          <Select placeholder="프로젝트 필터" style={{ width: 200 }} allowClear onChange={setFilterProject}>
            {projects.map(p => <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>)}
          </Select>
          <Text type="secondary" style={{ lineHeight: '32px' }}>총 {filtered.length}건</Text>
          <Text type="secondary" style={{ lineHeight: '32px', marginLeft: 'auto', fontSize: 11 }}>
            💡 행을 클릭하면 이동할 화면을 선택할 수 있어요
          </Text>
        </div>
        <Table
          dataSource={filtered}
          columns={columns}
          rowKey="id"
          size="small"
          loading={loading}
          onRow={(record) => ({
            onClick: () => openNavModal(record),
            style: { cursor: 'pointer' },
          })}
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

      {/* 이동 팝업 */}
      <Modal
        open={!!navTarget}
        onCancel={closeNavModal}
        title="어디로 이동할까요?"
        footer={null}
        width={440}
        destroyOnClose
      >
        {navTarget && (
          <>
            <div style={{ marginBottom: 12, padding: '12px', background: '#fafafa', borderRadius: 6 }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>프로젝트</div>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>{navTarget.project_name}</div>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>WBS</div>
              <div>
                <Tag color={levelColors[navTarget.level]} style={{ fontSize: 10 }}>{navTarget.level}L</Tag>
                {navTarget.wbs_number && <Text type="secondary" style={{ marginRight: 6 }}>{navTarget.wbs_number}</Text>}
                <strong>{navTarget.title}</strong>
              </div>
            </div>
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              <Button
                type="primary"
                icon={<ProfileOutlined />}
                block
                onClick={openWbsDetail}
              >
                📋 업무 상세
              </Button>
              <Button
                icon={<ProjectOutlined />}
                block
                onClick={goToProject}
              >
                🗂 프로젝트 상세
              </Button>
              <Button
                icon={<ScheduleOutlined />}
                block
                onClick={goToGantt}
              >
                📅 간트차트
              </Button>
            </Space>
          </>
        )}
      </Modal>

      {/* WBS 상세 모달 */}
      <WBSDetailModal
        visible={!!wbsDetailTarget}
        wbsItem={wbsDetailTarget}
        project={wbsDetailProject}
        currentUser={user}
        members={wbsDetailMembers}
        defaultTab={wbsDetailTab}
        onClose={() => setWbsDetailTarget(null)}
        onUpdate={async () => {
          await refreshAfterWbsUpdate();
          if (user?.id) {
            try {
              const res = await api.get('/my-instructions');
              setMyInstructions(res.data || []);
            } catch { /* ignore */ }
          }
        }}
      />
    </>
  );
}
