import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Typography, Card, Tag, Progress, Row, Col, Empty, message, Modal, Button,
  Space, Collapse, Checkbox, Slider, Input, Tooltip,
} from 'antd';
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

const todayISO = () => new Date().toISOString().split('T')[0];
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
  const [progressEdit, setProgressEdit] = useState({});   // { wbs_id: 0~100 }

  const instructionRef = useRef(null);
  const todayRef = useRef(null);
  const projectRef = useRef(null);
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

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([refreshMyWbs(), refreshMyInstructions()])
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ===== 파생 =====
  const today = todayISO();

  const todoList = useMemo(() => {
    // 오늘 마감 + 이번 주 (0~7일) + 지연된(<오늘) 모든 활성 업무
    return myWbs
      .filter(w => {
        if (w.status === '완료' || w.actual_end_date) return false;
        if (!w.plan_end_date) return false;
        const diff = daysBetween(w.plan_end_date, today);
        return diff <= 7; // 지나간 것도 포함 (diff < 0)
      })
      .sort((a, b) => (a.plan_end_date || '').localeCompare(b.plan_end_date || ''));
  }, [myWbs, today]);

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

  const handleProgressChange = (wbsId, v) => {
    setProgressEdit(prev => ({ ...prev, [wbsId]: v }));
  };

  const handleProgressCommit = (w) => {
    const newPct = progressEdit[w.id];
    const oldPct = Math.round((w.actual_progress || 0) * 100);
    if (newPct === undefined || newPct === oldPct) return;
    Modal.confirm({
      title: 'PM에게 보고할까요?',
      content: `진척률 ${oldPct}% → ${newPct}%로 업데이트돼요.`,
      okText: '보고',
      cancelText: '취소',
      onOk: async () => {
        const params = { actual_progress: newPct / 100 };
        // 진척률이 0보다 크고 현재 status가 '대기'이면 진행중으로 전환 + 실제 시작일 기록
        if (newPct > 0 && w.status === '대기') {
          params.status = '진행중';
          if (!w.actual_start_date) params.actual_start_date = today;
        }
        try {
          await api.put(`/wbs/${w.id}`, null, { params });
          message.success('진척률이 업데이트됐어요');
          setProgressEdit(prev => { const n = { ...prev }; delete n[w.id]; return n; });
          await refreshMyWbs();
        } catch {
          message.error('업데이트 실패');
        }
      },
      onCancel: () => {
        setProgressEdit(prev => { const n = { ...prev }; delete n[w.id]; return n; });
      },
    });
  };

  const handleComplete = (w) => {
    Modal.confirm({
      title: '이 작업을 완료 처리할까요?',
      content: `"${w.title}" 작업이 완료 상태로 변경돼요.`,
      okText: '완료 처리',
      cancelText: '취소',
      onOk: async () => {
        const params = {
          actual_progress: 1.0,
          actual_end_date: today,
          status: '완료',
        };
        // 실제 시작일이 없으면 오늘로 기록 (시작도 안 찍힌 채 완료되는 케이스 방지)
        if (!w.actual_start_date) params.actual_start_date = today;
        try {
          await api.put(`/wbs/${w.id}`, null, { params });
          message.success('완료 처리됐어요');
          setCheckedItems(prev => { const n = { ...prev }; delete n[w.id]; return n; });
          if (memoOpen === w.id) { setMemoOpen(null); setMemoText(''); }
          await refreshMyWbs();
        } catch {
          message.error('완료 실패');
        }
      },
    });
  };

  const wbsDetailProject = useMemo(
    () => projects.find(p => p.id === wbsDetailTarget?.project_id) || null,
    [projects, wbsDetailTarget]
  );

  const onModalUpdate = async () => {
    await refreshMyWbs();
    await refreshMyInstructions();
  };

  // ===== 렌더 =====
  const renderTodoItem = (w) => {
    const dday = dDayInfo(w.plan_end_date);
    const isChecked = !!checkedItems[w.id];
    const pct = progressEdit[w.id] ?? Math.round((w.actual_progress || 0) * 100);
    return (
      <div key={w.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px' }}>
          <Checkbox checked={isChecked} onChange={(e) => handleCheck(w.id, e.target.checked)} />
          <div
            style={{ flex: 1, cursor: 'pointer', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}
            onClick={() => openWbsDetailForItem(w)}
            title="클릭: 상세 모달"
          >
            <strong style={{ fontSize: 13 }}>{w.title}</strong>
            <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>· {w.project_name}</Text>
          </div>
          {dday && (
            <Tag style={{ color: dday.color, background: dday.background, borderColor: dday.color, fontWeight: 600 }}>
              {dday.text}
            </Tag>
          )}
          <div style={{ width: 140 }}>
            <Tooltip title={`진척률 ${pct}% (드래그 후 놓으면 PM 보고)`}>
              <Slider
                min={0} max={100} step={5}
                value={pct}
                onChange={(v) => handleProgressChange(w.id, v)}
                onChangeComplete={() => handleProgressCommit(w)}
                tooltip={{ formatter: (v) => `${v}%` }}
              />
            </Tooltip>
          </div>
          <Button size="small" type="primary" onClick={() => handleComplete(w)}>완료</Button>
        </div>
        {memoOpen === w.id && (
          <div style={{ padding: '4px 4px 12px 32px', background: '#fafafa' }}>
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
      </div>
    );
  };

  const summaryCardStyle = { cursor: 'pointer' };
  const summaryCards = [
    { key: 'today', title: '🔴 오늘 마감', value: todayDueCount, color: '#ff4d4f', targetRef: todayRef },
    { key: 'week',  title: '🟡 이번 주 마감', value: weekDueCount, color: '#fa8c16', targetRef: todayRef },
    { key: 'ins',   title: '📬 새 지시사항', value: activeInstructions.length, color: '#1677ff', targetRef: instructionRef },
    { key: 'delay', title: '⚠️ 지연 중', value: delayedCount, color: '#a8071a', targetRef: todayRef },
  ];

  return (
    <>
      <Title level={4} style={{ marginBottom: 16 }}>📌 내 업무</Title>

      {/* 1. 요약 카드 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        {summaryCards.map(c => (
          <Col span={6} key={c.key}>
            <Card hoverable style={summaryCardStyle} onClick={() => scrollToRef(c.targetRef)}>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>{c.title}</div>
              <div style={{ fontSize: 28, fontWeight: 600, color: c.color }}>{c.value}</div>
            </Card>
          </Col>
        ))}
      </Row>

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
                    <Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>· {ins.author_name}</Text>
                  )}
                </div>
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
                        return (
                          <div
                            key={w.id}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 12,
                              padding: '8px 4px', borderBottom: '1px solid #f5f5f5', cursor: 'pointer',
                            }}
                            onClick={() => openWbsDetailForItem(w)}
                          >
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
                            <div style={{ width: 100 }}>
                              <Progress percent={Math.round((w.actual_progress || 0) * 100)} size="small" />
                            </div>
                          </div>
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
                {completedThisMonth.map(w => (
                  <div
                    key={w.id}
                    style={{ fontSize: 12, marginBottom: 4, cursor: 'pointer' }}
                    onClick={() => openWbsDetailForItem(w)}
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
