import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Typography, Card, Tag, Progress, Row, Col, Empty, message, Button,
  Space, Collapse, Checkbox, Input,
} from 'antd';
import { PlusOutlined, CheckCircleOutlined, MinusCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import WBSDetailModal from '../components/WBSDetailModal';

const { Title, Text } = Typography;
const { TextArea } = Input;

// WBSAssignee에 내가 포함돼 있으면 내 업무로 간주. 배열이 비어있으면 legacy assignee_id로 판정.
const isMineWbs = (w, userId) => {
  if (!userId) return false;
  if (Array.isArray(w.assignees) && w.assignees.length > 0) {
    return w.assignees.some(a => a.user_id === userId);
  }
  return w.assignee_id === userId;
};

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const daysBetween = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000);

// D-N 태그: D-0 빨강 / D-1~3 주황 / D-4~7 노랑 / D+ 진한빨강
const dDayInfo = (planEnd) => {
  if (!planEnd) return null;
  const diff = daysBetween(planEnd, todayISO());
  if (diff < 0) return { text: `D+${-diff}`, color: '#a8071a', background: '#fff1f0' };
  if (diff === 0) return { text: 'D-0', color: '#ff4d4f', background: '#fff1f0' };
  if (diff <= 3) return { text: `D-${diff}`, color: '#fa8c16', background: '#fff7e6' };
  if (diff <= 7) return { text: `D-${diff}`, color: '#d4b106', background: '#fffbe6' };
  return { text: `D-${diff}`, color: '#595959', background: '#fafafa' };
};

export default function MyTasks({ user }) {
  const [myWbs, setMyWbs] = useState([]);
  const [projects, setProjects] = useState([]); // 종료 제외된 활성 프로젝트
  const [myInstructions, setMyInstructions] = useState([]);
  const [loading, setLoading] = useState(true);

  const [wbsDetailTarget, setWbsDetailTarget] = useState(null);
  const [wbsDetailMembers, setWbsDetailMembers] = useState([]);
  const [wbsDetailTab, setWbsDetailTab] = useState('기본정보');

  const [checkedItems, setCheckedItems] = useState({});  // { wbs_id: bool }
  const [memoOpen, setMemoOpen] = useState(null);         // wbs_id or null
  const [memoText, setMemoText] = useState('');
  const [hoveredId, setHoveredId] = useState(null);       // 전체 카드 hover (prefix 키 사용)

  const [workPlans, setWorkPlans] = useState([]);          // 오늘의 계획 목록
  const [addingPlan, setAddingPlan] = useState(null);      // 계획 추가 중인 wbs_id (로딩 상태)

  const instructionRef = useRef(null);
  const todayRef = useRef(null);
  const projectRef = useRef(null);
  const planRef = useRef(null);
  const navigate = useNavigate();

  // ===== getDisplayStatus (기존 로직 유지) =====
  const getDisplayStatus = (item) => {
    const {
      status,
      plan_start_date: planStart,
      plan_end_date: planEnd,
      actual_start_date: actualStart,
      actual_end_date: actualEnd,
    } = item || {};
    const t = todayISO();
    if (actualEnd && actualEnd <= t) {
      if (planEnd && actualEnd > planEnd) return { text: `완료 (${daysBetween(actualEnd, planEnd)}일 초과)`, color: 'orange' };
      if (planEnd && actualEnd < planEnd) return { text: `완료 (${daysBetween(planEnd, actualEnd)}일 조기)`, color: 'green' };
      if (planEnd && actualEnd === planEnd) return { text: '완료 (정시)', color: 'green' };
      return { text: '완료', color: 'green' };
    }
    if (status === '완료') return { text: '완료', color: 'green' };
    if (status === '진행중') {
      if (actualEnd && planEnd && actualEnd > planEnd) return { text: `진행중 (${daysBetween(actualEnd, planEnd)}일 초과)`, color: 'red' };
      if (!actualEnd && planEnd && planEnd < t) return { text: `진행중 (${daysBetween(t, planEnd)}일 지연)`, color: 'red' };
      if (!actualStart && planStart && planStart < t) return { text: '진행중 (시작 지연)', color: 'orange' };
      return { text: '진행중', color: 'blue' };
    }
    if (status === '대기') {
      if (planStart && planStart <= t) return { text: `대기 (시작 지연 ${daysBetween(t, planStart)}일)`, color: 'orange' };
      return { text: '대기', color: 'default' };
    }
    return { text: status || '-', color: 'default' };
  };

  // ===== 데이터 로딩 =====
  const refreshMyWbs = async () => {
    try {
      const res = await api.get('/projects');
      const activeProjects = (res.data || []).filter(p => p.status !== '종료');
      setProjects(activeProjects);
      const promises = activeProjects.map(p =>
        api.get(`/projects/${p.id}/wbs`).then(wbsRes =>
          (wbsRes.data || []).map(w => ({
            ...w, project_name: p.name, project_id: p.id, project_status: p.status,
          }))
        ).catch(() => [])
      );
      const results = await Promise.all(promises);
      const all = results.flat();
      const mine = all.filter(w => isMineWbs(w, user?.id));
      setMyWbs(mine);
    } catch {
      message.error('데이터를 불러오지 못했어요');
    }
  };

  const refreshMyInstructions = async () => {
    try {
      const res = await api.get('/my-instructions');
      setMyInstructions(res.data || []);
    } catch {
      setMyInstructions([]);
    }
  };

  const fetchWorkPlans = async () => {
    try {
      const res = await api.get('/work-plans', { params: { date: todayISO() } });
      setWorkPlans(res.data || []);
    } catch {
      setWorkPlans([]);
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([refreshMyWbs(), refreshMyInstructions(), fetchWorkPlans()])
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ===== 파생 =====
  const today = todayISO();

  const todoList = useMemo(() => {
    // 미완료 내 WBS 전부 포함. plan_end_date 오름차순 (지연→오늘→미래), 날짜 없으면 맨 뒤.
    return myWbs
      .filter(w => w.status !== '완료')
      .sort((a, b) => {
        if (!a.plan_end_date && !b.plan_end_date) return 0;
        if (!a.plan_end_date) return 1;
        if (!b.plan_end_date) return -1;
        return a.plan_end_date.localeCompare(b.plan_end_date);
      });
  }, [myWbs]);

  const todayDueCount = useMemo(
    () => myWbs.filter(w => w.plan_end_date === today && w.status !== '완료' && !w.actual_end_date).length,
    [myWbs, today]
  );
  const weekDueCount = useMemo(
    () => myWbs.filter(w => {
      if (w.status === '완료' || w.actual_end_date || !w.plan_end_date) return false;
      const diff = daysBetween(w.plan_end_date, today);
      return diff >= 0 && diff <= 7;
    }).length,
    [myWbs, today]
  );
  const delayedCount = useMemo(
    () => myWbs.filter(w => w.plan_end_date && w.plan_end_date < today && w.status !== '완료' && !w.actual_end_date).length,
    [myWbs, today]
  );
  // open/acknowledged만 활성 지시로 간주. 카드 카운트와 섹션 목록 공용.
  const activeInstructions = useMemo(
    () => myInstructions.filter(i => ['open', 'acknowledged'].includes(i.status)),
    [myInstructions]
  );

  // 내 참여 프로젝트: 내 WBS가 있거나 내가 PM인 프로젝트 (완료/종료 제외)
  const myProjectList = useMemo(() => {
    if (!user?.id) return [];
    const projectIdsFromWbs = new Set(myWbs.map(w => w.project_id));
    return projects.filter(p =>
      p.status !== '완료' && p.status !== '종료' &&
      (projectIdsFromWbs.has(p.id) || p.pm_id === user.id)
    );
  }, [projects, myWbs, user]);

  const wbsByProject = useMemo(() => {
    const map = {};
    myWbs.forEach(w => {
      (map[w.project_id] = map[w.project_id] || []).push(w);
    });
    return map;
  }, [myWbs]);

  const projectAvgProgress = (projectId) => {
    const list = wbsByProject[projectId] || [];
    if (list.length === 0) return 0;
    return Math.round(list.reduce((s, w) => s + (w.actual_progress || 0), 0) / list.length * 100);
  };

  const completedThisMonth = useMemo(() => {
    const now = new Date();
    const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    return myWbs
      .filter(w => (w.status === '완료' || w.actual_end_date) && w.actual_end_date && w.actual_end_date >= startOfMonth)
      .sort((a, b) => (b.actual_end_date || '').localeCompare(a.actual_end_date || ''));
  }, [myWbs]);

  // ===== 상호작용 핸들러 =====
  const scrollToRef = (ref) => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const openWbsDetailForItem = async (wbs, tab = '기본정보') => {
    try {
      const res = await api.get(`/projects/${wbs.project_id}/members`);
      setWbsDetailMembers(res.data || []);
    } catch {
      setWbsDetailMembers([]);
    }
    setWbsDetailTab(tab);
    setWbsDetailTarget(wbs);
  };

  const openInstructionDetail = async (ins) => {
    const fromAll = myWbs.find(w => w.id === ins.wbs_id);
    const wbsItem = fromAll || {
      id: ins.wbs_id, title: ins.wbs_title, wbs_number: ins.wbs_number,
      level: ins.wbs_level, project_id: ins.project_id, project_name: ins.project_name,
    };
    openWbsDetailForItem(wbsItem, '지시사항');
  };

  const handleCheck = (wbsId, checked) => {
    setCheckedItems(prev => ({ ...prev, [wbsId]: checked }));
    if (checked) {
      setMemoOpen(wbsId);
      setMemoText('');
    } else if (memoOpen === wbsId) {
      setMemoOpen(null);
      setMemoText('');
    }
  };

  const handleSaveMemo = async (w) => {
    if (!memoText.trim()) {
      message.warning('메모를 입력해 주세요');
      return;
    }
    try {
      await api.post(`/wbs/${w.id}/comments`, null, {
        params: { content: memoText, comment_type: 'memo', memo_category: 'daily_work' },
      });
      message.success('메모가 저장됐어요');
      setMemoOpen(null);
      setMemoText('');
    } catch {
      message.error('메모 저장 실패');
    }
  };

  // ===== work_plans 핸들러 =====
  const handleAddPlan = async (w) => {
    if (workPlans.some(p => p.wbs_id === w.id)) {
      message.info('이미 오늘 계획에 있어요');
      return;
    }
    setAddingPlan(w.id);
    try {
      await api.post('/work-plans', null, {
        params: { wbs_id: w.id, plan_date: todayISO() },
      });
      message.success('오늘의 계획에 추가됐어요');
      await fetchWorkPlans();
    } catch {
      message.error('계획 추가 실패');
    } finally {
      setAddingPlan(null);
    }
  };

  const handlePlanDone = async (plan) => {
    // '완료' ↔ '완료취소' 토글: done이면 planned로 되돌림
    const next = plan.status === 'done' ? 'planned' : 'done';
    try {
      await api.put(`/work-plans/${plan.id}`, null, { params: { status: next } });
      await fetchWorkPlans();
    } catch {
      message.error('상태 변경 실패');
    }
  };

  const handlePlanSkip = async (plan) => {
    // '건너뛰기' ↔ '건너뛰기취소' 토글
    const next = plan.status === 'skipped' ? 'planned' : 'skipped';
    try {
      await api.put(`/work-plans/${plan.id}`, null, { params: { status: next } });
      await fetchWorkPlans();
    } catch {
      message.error('상태 변경 실패');
    }
  };

  const handlePlanMemo = async (plan, memo) => {
    try {
      await api.put(`/work-plans/${plan.id}`, null, { params: { memo } });
      await fetchWorkPlans();
    } catch {
      message.error('메모 저장 실패');
    }
  };

  const handleRemovePlan = async (plan) => {
    try {
      await api.delete(`/work-plans/${plan.id}`);
      await fetchWorkPlans();
    } catch {
      message.error('제거 실패');
    }
  };

  const wbsDetailProject = useMemo(
    () => projects.find(p => p.id === wbsDetailTarget?.project_id) || null,
    [projects, wbsDetailTarget]
  );

  const onModalUpdate = async () => {
    await refreshMyWbs();
    await refreshMyInstructions();
    await fetchWorkPlans();
  };

  // ===== 렌더 =====
  // 공통 hover 카드 스타일 (checked 옵션 지원)
  const getCardStyle = (hoverKey, checked = false) => {
    const isHovered = hoveredId === hoverKey;
    const base = {
      marginBottom: 8,
      cursor: 'pointer',
      transition: 'background-color 0.15s, border-color 0.15s',
    };
    if (checked) return { ...base, backgroundColor: '#e6f4ff', border: '1px solid #1677ff' };
    if (isHovered) return { ...base, backgroundColor: '#f0f7ff' };
    return base;
  };

  const renderTodoItem = (w) => {
    const dday = dDayInfo(w.plan_end_date);
    const isChecked = !!checkedItems[w.id];
    const hoverKey = `todo-${w.id}`;
    const isPlanned = workPlans.some(p => p.wbs_id === w.id);
    const stop = (e) => e.stopPropagation();

    return (
      <Card
        key={w.id}
        size="small"
        style={getCardStyle(hoverKey, isChecked)}
        onMouseEnter={() => setHoveredId(hoverKey)}
        onMouseLeave={() => setHoveredId(null)}
        onClick={() => openWbsDetailForItem(w)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span onClick={stop}>
            <Checkbox checked={isChecked} onChange={(e) => handleCheck(w.id, e.target.checked)} />
          </span>
          <div style={{ flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
            <strong style={{ fontSize: 13 }}>{w.title}</strong>
            <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>· {w.project_name}</Text>
          </div>
          {dday && (
            <Tag style={{ color: dday.color, background: dday.background, borderColor: dday.color, fontWeight: 600 }}>
              {dday.text}
            </Tag>
          )}
          <Progress percent={Math.round((w.actual_progress || 0) * 100)} size="small" style={{ width: 80 }} />
          <span onClick={stop}>
            <Button
              size="small"
              type={isPlanned ? 'primary' : 'default'}
              icon={<PlusOutlined />}
              loading={addingPlan === w.id}
              onClick={(e) => { e.stopPropagation(); handleAddPlan(w); }}
            >
              {isPlanned ? '계획됨' : '오늘 계획'}
            </Button>
          </span>
        </div>
        {memoOpen === w.id && (
          <div
            style={{ padding: '8px 4px 4px 32px', marginTop: 8, background: '#fafafa', borderRadius: 4 }}
            onClick={stop}
          >
            <TextArea
              rows={1} autoSize={{ minRows: 1, maxRows: 3 }}
              placeholder={`"${w.title}" 오늘 무슨 일을 했나요?`}
              value={memoText}
              onChange={(e) => setMemoText(e.target.value)}
              style={{ marginBottom: 6 }}
            />
            <Space>
              <Button size="small" type="primary" onClick={() => handleSaveMemo(w)}>저장</Button>
              <Button size="small" onClick={() => { setMemoOpen(null); setMemoText(''); }}>닫기</Button>
            </Space>
          </div>
        )}
      </Card>
    );
  };

  const summaryCardStyle = { cursor: 'pointer' };
  const summaryCards = [
    { key: 'today', title: '🔴 오늘 마감', value: todayDueCount, color: '#ff4d4f', targetRef: todayRef },
    { key: 'week',  title: '🟡 이번 주 마감', value: weekDueCount, color: '#fa8c16', targetRef: todayRef },
    { key: 'plan',  title: '📋 오늘의 계획', value: workPlans.length, color: '#13c2c2', targetRef: planRef },
    { key: 'ins',   title: '📬 새 지시사항', value: activeInstructions.length, color: '#1677ff', targetRef: instructionRef },
    { key: 'delay', title: '⚠️ 지연 중', value: delayedCount, color: '#a8071a', targetRef: todayRef },
  ];

  return (
    <>
      <Title level={4} style={{ marginBottom: 16 }}>📌 내 업무</Title>

      {/* 1. 요약 카드 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        {summaryCards.map(c => (
          <Col flex="1 1 0" key={c.key} style={{ minWidth: 0 }}>
            <Card hoverable style={summaryCardStyle} onClick={() => scrollToRef(c.targetRef)}>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>{c.title}</div>
              <div style={{ fontSize: 28, fontWeight: 600, color: c.color }}>{c.value}</div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* 1.5 오늘의 계획 */}
      <div ref={planRef}>
        <Card title={<span>📋 오늘의 계획 ({workPlans.length}건)</span>} style={{ marginBottom: 16 }}>
          {workPlans.length === 0 ? (
            <Text type="secondary">오늘의 할일에서 작업을 선택해주세요</Text>
          ) : (
            workPlans.map(plan => (
              <Card
                size="small"
                key={plan.id}
                style={{
                  marginBottom: 8,
                  backgroundColor:
                    plan.status === 'done' ? '#f6ffed' :
                    plan.status === 'skipped' ? '#f5f5f5' : '#fff',
                  border: plan.status === 'done' ? '1px solid #b7eb8f' :
                          plan.status === 'skipped' ? '1px solid #d9d9d9' :
                          '1px solid #d9d9d9',
                }}
              >
                <Row align="middle" justify="space-between" gutter={8}>
                  <Col flex="auto" style={{ minWidth: 0 }}>
                    <Space>
                      {plan.status === 'done' && <CheckCircleOutlined style={{ color: '#52c41a' }} />}
                      {plan.status === 'skipped' && <MinusCircleOutlined style={{ color: '#bbb' }} />}
                      <Text
                        strong
                        ellipsis
                        delete={plan.status === 'skipped'}
                        style={{
                          maxWidth: 200,
                          color: plan.status === 'done' ? '#52c41a'
                            : plan.status === 'skipped' ? '#bbb' : undefined,
                        }}
                      >
                        {plan.wbs_title}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>{plan.project_name}</Text>
                    </Space>
                  </Col>
                  <Col>
                    <Space>
                      {plan.status === 'planned' && (
                        <>
                          <Button size="small" type="primary" onClick={() => handlePlanDone(plan)}>완료</Button>
                          <Button size="small" onClick={() => handlePlanSkip(plan)}>건너뛰기</Button>
                        </>
                      )}
                      {plan.status === 'done' && (
                        <Button size="small" onClick={() => handlePlanDone(plan)}>완료취소</Button>
                      )}
                      {plan.status === 'skipped' && (
                        <Button size="small" onClick={() => handlePlanSkip(plan)}>건너뛰기취소</Button>
                      )}
                      <Button size="small" danger onClick={() => handleRemovePlan(plan)}>제거</Button>
                    </Space>
                  </Col>
                </Row>
                <Row style={{ marginTop: 8 }}>
                  <Col flex="auto">
                    <Input.TextArea
                      placeholder="메모 남기기 (선택)"
                      size="small"
                      autoSize
                      defaultValue={plan.memo || ''}
                      onBlur={(e) => {
                        if (e.target.value !== (plan.memo || '')) {
                          handlePlanMemo(plan, e.target.value);
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </Col>
                </Row>
              </Card>
            ))
          )}
        </Card>
      </div>

      {/* 2. 새 지시사항 */}
      <div ref={instructionRef}>
        {activeInstructions.length > 0 && (
          <Card style={{ marginBottom: 16, borderColor: '#1677ff' }}>
            <Title level={5} style={{ color: '#1677ff', margin: 0, marginBottom: 8 }}>
              📬 새 지시사항 ({activeInstructions.length}건)
            </Title>
            {activeInstructions.map(ins => {
              const priColor = { low: 'default', normal: 'blue', high: 'orange', urgent: 'red' }[ins.priority] || 'default';
              const priLabel = { low: '낮음', normal: '보통', high: '높음', urgent: '긴급' }[ins.priority] || ins.priority;
              const statColor = { open: 'default', acknowledged: 'blue', in_progress: 'orange' }[ins.status] || 'default';
              const statLabel = { open: '미확인', acknowledged: '확인', in_progress: '진행중' }[ins.status] || ins.status;
              const hoverKey = `ins-${ins.receipt_id}`;
              return (
                <Card
                  key={ins.receipt_id}
                  size="small"
                  style={getCardStyle(hoverKey)}
                  onMouseEnter={() => setHoveredId(hoverKey)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => openInstructionDetail(ins)}
                >
                  <div style={{ fontSize: 12 }}>
                    <Tag color={priColor}>{priLabel}</Tag>
                    <Tag color={statColor}>{statLabel}</Tag>
                    <Text type="secondary" style={{ fontSize: 11, marginRight: 6 }}>
                      [{ins.project_name}] {ins.wbs_number} {ins.wbs_title}
                    </Text>
                    <strong>{ins.title}</strong>
                    {ins.author_name && (
                      <Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>· {ins.author_name}</Text>
                    )}
                  </div>
                </Card>
              );
            })}
          </Card>
        )}
      </div>

      {/* 3. 오늘의 할일 */}
      <div ref={todayRef}>
        <Card
          title={<span>🎯 오늘의 할일 ({todoList.length}건)</span>}
          style={{ marginBottom: 16 }}
          loading={loading && myWbs.length === 0}
        >
          {todoList.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="오늘 할 일이 없어요" />
          ) : (
            todoList.map(renderTodoItem)
          )}
        </Card>
      </div>

      {/* 4. 내 프로젝트 현황 */}
      <div ref={projectRef}>
        <Card
          title={<span>🗂 내 프로젝트 현황 ({myProjectList.length}개)</span>}
          style={{ marginBottom: 16 }}
        >
          {myProjectList.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="참여 중인 프로젝트가 없어요" />
          ) : (
            <Collapse
              items={myProjectList.map(p => {
                const wbsList = wbsByProject[p.id] || [];
                const avg = projectAvgProgress(p.id);
                return {
                  key: String(p.id),
                  label: (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
                      <strong
                        style={{ cursor: 'pointer', color: '#1677ff' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/projects/${p.id}`, { state: { from: '/my-tasks' } });
                        }}
                      >
                        {p.name}
                      </strong>
                      {p.pipeline_stage && <Tag color="blue">{p.pipeline_stage}</Tag>}
                      <Text type="secondary" style={{ fontSize: 12 }}>내 작업 {wbsList.length}개</Text>
                      <div style={{ flex: 1, minWidth: 120, maxWidth: 240 }}>
                        <Progress percent={avg} size="small" />
                      </div>
                    </div>
                  ),
                  children: wbsList.length === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="할당된 WBS가 없어요" />
                  ) : (
                    <div>
                      {wbsList.map(w => {
                        const ds = getDisplayStatus(w);
                        const dday = dDayInfo(w.plan_end_date);
                        const hoverKey = `proj-${w.id}`;
                        return (
                          <Card
                            key={w.id}
                            size="small"
                            style={getCardStyle(hoverKey)}
                            onMouseEnter={() => setHoveredId(hoverKey)}
                            onMouseLeave={() => setHoveredId(null)}
                            onClick={() => openWbsDetailForItem(w)}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <span style={{ flex: 1, fontSize: 13 }}>
                                <strong>{w.title}</strong>
                                {w.wbs_number && <Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>{w.wbs_number}</Text>}
                              </span>
                              <Tag color={ds.color}>{ds.text}</Tag>
                              {dday && (
                                <Tag style={{ color: dday.color, background: dday.background, borderColor: dday.color }}>
                                  {dday.text}
                                </Tag>
                              )}
                              <Progress percent={Math.round((w.actual_progress || 0) * 100)} size="small" style={{ width: 80 }} />
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  ),
                };
              })}
            />
          )}
        </Card>
      </div>

      {/* 5. 완료된 할일 (이번 달) */}
      {completedThisMonth.length > 0 && (
        <Collapse
          style={{ marginBottom: 16 }}
          items={[{
            key: 'done',
            label: (
              <span style={{ color: '#52c41a' }}>
                ✅ 이번 달 완료된 할일 ({completedThisMonth.length}건)
              </span>
            ),
            children: (
              <div>
                {completedThisMonth.map(w => {
                  const hoverKey = `done-${w.id}`;
                  return (
                    <Card
                      key={w.id}
                      size="small"
                      style={getCardStyle(hoverKey)}
                      onMouseEnter={() => setHoveredId(hoverKey)}
                      onMouseLeave={() => setHoveredId(null)}
                      onClick={() => openWbsDetailForItem(w)}
                    >
                      <div style={{ fontSize: 12 }}>
                        <Tag color="green">{w.project_name}</Tag>
                        <strong>{w.title}</strong>
                        {w.actual_end_date && <Text type="secondary"> · 완료일: {w.actual_end_date}</Text>}
                      </div>
                    </Card>
                  );
                })}
              </div>
            ),
          }]}
        />
      )}

      {/* WBS 상세 모달 */}
      <WBSDetailModal
        visible={!!wbsDetailTarget}
        wbsItem={wbsDetailTarget}
        project={wbsDetailProject}
        currentUser={user}
        members={wbsDetailMembers}
        defaultTab={wbsDetailTab}
        onClose={() => setWbsDetailTarget(null)}
        onUpdate={onModalUpdate}
      />
    </>
  );
}
