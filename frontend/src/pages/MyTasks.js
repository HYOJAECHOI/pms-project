import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Typography, Card, Tag, Progress, Empty, message, Button, Modal, Input,
  Collapse, Badge,
} from 'antd';
import { CheckOutlined, CloseOutlined, DoubleRightOutlined } from '@ant-design/icons';
import {
  DndContext, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable, closestCorners,
} from '@dnd-kit/core';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import WBSDetailModal from '../components/WBSDetailModal';

const { Title, Text } = Typography;

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

const KANBAN_COLUMNS = [
  { key: '할일',     bg: '#fafafa', border: '#d9d9d9' },
  { key: '수행예정', bg: '#e6f4ff', border: '#91caff' },
  { key: '종료',     bg: '#f6ffed', border: '#b7eb8f' },
  { key: '완료보고', bg: '#fff7e6', border: '#ffd591' },
];

export default function MyTasks({ user }) {
  const [myWbs, setMyWbs] = useState([]);
  const [projects, setProjects] = useState([]); // 종료 제외된 활성 프로젝트
  const [myInstructions, setMyInstructions] = useState([]);
  const [workPlans, setWorkPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  const [wbsDetailTarget, setWbsDetailTarget] = useState(null);
  const [wbsDetailMembers, setWbsDetailMembers] = useState([]);
  const [wbsDetailTab, setWbsDetailTab] = useState('기본정보');

  const [finishTarget, setFinishTarget] = useState(null); // 종료 이동 대기중인 plan
  const [finishMemo, setFinishMemo] = useState('');

  const [hoveredId, setHoveredId] = useState(null); // 프로젝트/완료 카드 hover

  const navigate = useNavigate();
  const initialSyncRef = useRef(false);

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
  const refreshMyWbs = useCallback(async () => {
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
  }, [user]);

  const refreshMyInstructions = useCallback(async () => {
    try {
      const res = await api.get('/my-instructions');
      setMyInstructions(res.data || []);
    } catch {
      setMyInstructions([]);
    }
  }, []);

  const fetchWorkPlans = useCallback(async () => {
    try {
      const res = await api.get('/work-plans', { params: { date: todayISO() } });
      setWorkPlans(res.data || []);
    } catch {
      setWorkPlans([]);
    }
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setLoading(true);
    initialSyncRef.current = false;
    Promise.all([refreshMyWbs(), refreshMyInstructions(), fetchWorkPlans()])
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user, refreshMyWbs, refreshMyInstructions, fetchWorkPlans]);

  // ===== 파생 =====
  const activeInstructions = useMemo(
    () => myInstructions.filter(i => ['open', 'acknowledged'].includes(i.status)),
    [myInstructions]
  );

  const wbsById = useMemo(() => {
    const m = {};
    myWbs.forEach(w => { m[w.id] = w; });
    return m;
  }, [myWbs]);

  const instructionByWbsId = useMemo(() => {
    const m = {};
    activeInstructions.forEach(i => { if (i.wbs_id && !m[i.wbs_id]) m[i.wbs_id] = i; });
    return m;
  }, [activeInstructions]);

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

  // 컬럼별 분류 + 정렬 ('할일'은 skipped를 맨 아래로)
  const plansByColumn = useMemo(() => {
    const map = { '할일': [], '수행예정': [], '종료': [], '완료보고': [] };
    workPlans.forEach(p => {
      const col = map[p.column] ? p.column : '할일';
      map[col].push(p);
    });
    Object.keys(map).forEach(k => {
      map[k].sort((a, b) => {
        if (k === '할일') {
          const aSkip = a.status === 'skipped' ? 1 : 0;
          const bSkip = b.status === 'skipped' ? 1 : 0;
          if (aSkip !== bSkip) return aSkip - bSkip;
        }
        return (a.id || 0) - (b.id || 0);
      });
    });
    return map;
  }, [workPlans]);

  // ===== 자동 동기화: 미등록 WBS/지시사항을 '할일' 컬럼에 POST =====
  useEffect(() => {
    if (!user?.id || loading || initialSyncRef.current) return;
    const existing = new Set(workPlans.map(p => p.wbs_id));
    const missing = [];
    myWbs.forEach(w => {
      if (w.status !== '완료' && !existing.has(w.id)) missing.push(w.id);
    });
    activeInstructions.forEach(i => {
      if (i.wbs_id && !existing.has(i.wbs_id) && !missing.includes(i.wbs_id)) {
        missing.push(i.wbs_id);
      }
    });

    initialSyncRef.current = true; // 첫 동기화 1회만
    if (missing.length === 0) return;

    (async () => {
      for (const wbs_id of missing) {
        try {
          await api.post('/work-plans', null, {
            params: { wbs_id, plan_date: todayISO(), column: '할일' },
          });
        } catch { /* 중복/권한 에러 등 무시 */ }
      }
      await fetchWorkPlans();
    })();
  }, [user, loading, myWbs, activeInstructions, workPlans, fetchWorkPlans]);

  // ===== 상호작용 핸들러 =====
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

  const openPlanDetail = (plan) => {
    const wbs = wbsById[plan.wbs_id];
    const ins = instructionByWbsId[plan.wbs_id];
    const wbsItem = wbs || {
      id: plan.wbs_id,
      title: plan.wbs_title,
      project_id: plan.project_id,
      project_name: plan.project_name,
    };
    openWbsDetailForItem(wbsItem, ins ? '지시사항' : '기본정보');
  };

  // 성공 시 재조회까지 완료. 실패 시 에러를 throw — 호출측에서 처리.
  const moveToColumn = async (plan, targetCol, memo) => {
    const params = { column: targetCol };
    if (memo !== undefined) params.memo = memo;
    // skipped 카드가 '할일' 외 컬럼으로 나가면 status 모순 제거
    if (plan.status === 'skipped' && targetCol !== '할일') {
      params.status = 'planned';
    }
    await api.put(`/work-plans/${plan.id}`, null, { params });
    await fetchWorkPlans();
  };

  const handleCheckV = async (plan) => {
    try {
      await moveToColumn(plan, '수행예정');
    } catch {
      message.error('이동 실패');
    }
  };

  const handleMoveToReport = async (plan) => {
    try {
      await moveToColumn(plan, '완료보고');
    } catch {
      message.error('이동 실패');
    }
  };

  const handleCheckX = async (plan) => {
    const nextStatus = plan.status === 'skipped' ? 'planned' : 'skipped';
    try {
      await api.put(`/work-plans/${plan.id}`, null, { params: { status: nextStatus } });
      await fetchWorkPlans();
    } catch {
      message.error('상태 변경 실패');
    }
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over) return;
    const planId = Number(String(active.id).replace('plan-', ''));
    const targetCol = String(over.id).replace('col-', '');
    const plan = workPlans.find(p => p.id === planId);
    if (!plan || !targetCol || plan.column === targetCol) return;

    if (targetCol === '종료') {
      setFinishTarget(plan);
      setFinishMemo(plan.memo || '');
      return;
    }
    moveToColumn(plan, targetCol).catch(() => message.error('이동 실패'));
  };

  const handleFinishOk = async () => {
    if (!finishTarget) return;
    const memo = finishMemo.trim();
    try {
      await moveToColumn(finishTarget, '종료', memo || undefined);
      setFinishTarget(null);
      setFinishMemo('');
    } catch {
      message.error('이동 실패');
      // 실패 시 모달 유지 — 재시도 가능
    }
  };

  const handleFinishCancel = () => {
    setFinishTarget(null);
    setFinishMemo('');
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

  // ===== 공통 hover 카드 스타일 (프로젝트/완료 섹션용) =====
  const getCardStyle = (hoverKey) => {
    const isHovered = hoveredId === hoverKey;
    const base = {
      marginBottom: 8,
      cursor: 'pointer',
      transition: 'background-color 0.15s, border-color 0.15s',
    };
    if (isHovered) return { ...base, backgroundColor: '#f0f7ff' };
    return base;
  };

  // ===== 드래그 센서 =====
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  return (
    <>
      <Title level={4} style={{ marginBottom: 16 }}>📌 내 업무</Title>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragEnd={handleDragEnd}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(220px, 1fr))',
            gap: 12,
            marginBottom: 24,
            overflowX: 'auto',
          }}
        >
          {KANBAN_COLUMNS.map(col => (
            <KanbanColumn
              key={col.key}
              col={col}
              plans={plansByColumn[col.key] || []}
              wbsById={wbsById}
              instructionByWbsId={instructionByWbsId}
              getDisplayStatus={getDisplayStatus}
              onOpenDetail={openPlanDetail}
              onCheckV={handleCheckV}
              onCheckX={handleCheckX}
              onMoveToReport={handleMoveToReport}
              loading={loading}
            />
          ))}
        </div>
      </DndContext>

      {/* 내 프로젝트 현황 */}
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

      {/* 이번 달 완료된 할일 */}
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

      {/* 종료 이동 메모 Modal */}
      <Modal
        title="종료 처리"
        open={!!finishTarget}
        onOk={handleFinishOk}
        onCancel={handleFinishCancel}
        okText="종료"
        cancelText="취소"
      >
        <div style={{ marginBottom: 8 }}>
          <Text type="secondary">
            "{finishTarget?.wbs_title}" 작업을 '종료' 컬럼으로 옮깁니다. 마무리 메모는 선택입니다.
          </Text>
        </div>
        <Input.TextArea
          value={finishMemo}
          onChange={(e) => setFinishMemo(e.target.value)}
          placeholder="마무리 메모 (선택)"
          autoSize={{ minRows: 3, maxRows: 6 }}
        />
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
        onUpdate={onModalUpdate}
      />
    </>
  );
}

// ===== 칸반 컬럼 =====
function KanbanColumn({
  col, plans, wbsById, instructionByWbsId, getDisplayStatus,
  onOpenDetail, onCheckV, onCheckX, onMoveToReport, loading,
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${col.key}` });
  return (
    <div
      ref={setNodeRef}
      style={{
        background: col.bg,
        border: `1px solid ${isOver ? '#1677ff' : col.border}`,
        borderRadius: 8,
        padding: 8,
        minHeight: 320,
        transition: 'border-color 0.15s',
      }}
    >
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '4px 6px 10px', fontWeight: 600,
        }}
      >
        <span>{col.key}</span>
        <Badge count={plans.length} showZero style={{ backgroundColor: '#8c8c8c' }} />
      </div>

      {plans.length === 0 && !loading && (
        <div style={{ padding: 16, textAlign: 'center' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>비어있어요</Text>
        </div>
      )}

      {plans.map(plan => (
        <KanbanCard
          key={plan.id}
          plan={plan}
          wbs={wbsById[plan.wbs_id]}
          instruction={instructionByWbsId[plan.wbs_id]}
          columnKey={col.key}
          getDisplayStatus={getDisplayStatus}
          onOpenDetail={onOpenDetail}
          onCheckV={onCheckV}
          onCheckX={onCheckX}
          onMoveToReport={onMoveToReport}
        />
      ))}
    </div>
  );
}

// ===== 칸반 카드 =====
function KanbanCard({
  plan, wbs, instruction, columnKey, getDisplayStatus,
  onOpenDetail, onCheckV, onCheckX, onMoveToReport,
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `plan-${plan.id}`,
  });
  const dragStyle = {
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
    opacity: isDragging ? 0.4 : 1,
  };

  const dday = wbs ? dDayInfo(wbs.plan_end_date) : null;
  const ds = wbs ? getDisplayStatus(wbs) : null;
  const isSkipped = plan.status === 'skipped';
  const icon = instruction ? '📬' : '📋';

  const cardStyle = {
    marginBottom: 8,
    cursor: 'grab',
    backgroundColor: isSkipped ? '#f5f5f5' : '#fff',
    opacity: isSkipped ? 0.6 : 1,
  };

  const stop = (e) => e.stopPropagation();

  return (
    <div ref={setNodeRef} style={dragStyle} {...attributes} {...listeners}>
      <Card
        size="small"
        style={cardStyle}
        onClick={() => onOpenDetail(plan)}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <span style={{ fontSize: 14, lineHeight: '20px' }}>{icon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontWeight: 600, fontSize: 13,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                color: isSkipped ? '#bbb' : undefined,
                textDecoration: isSkipped ? 'line-through' : 'none',
              }}
              title={plan.wbs_title}
            >
              {plan.wbs_title}
            </div>
            <div
              style={{
                fontSize: 11, color: '#888',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
              title={plan.project_name}
            >
              {plan.project_name}
            </div>
            <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {dday && (
                <Tag
                  style={{
                    color: dday.color, background: dday.background,
                    borderColor: dday.color, fontSize: 11, margin: 0,
                  }}
                >
                  {dday.text}
                </Tag>
              )}
              {ds && (
                <Tag color={ds.color} style={{ fontSize: 11, margin: 0 }}>{ds.text}</Tag>
              )}
            </div>
          </div>
        </div>

        {columnKey === '할일' && (
          <div
            style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end', gap: 6 }}
            onClick={stop}
            onPointerDown={stop}
          >
            <Button
              size="small"
              type="primary"
              icon={<CheckOutlined />}
              onClick={(e) => { e.stopPropagation(); onCheckV(plan); }}
              title="수행예정으로 이동"
            />
            <Button
              size="small"
              icon={<CloseOutlined />}
              onClick={(e) => { e.stopPropagation(); onCheckX(plan); }}
              title={isSkipped ? '건너뛰기 해제' : '건너뛰기'}
            />
          </div>
        )}

        {columnKey === '종료' && (
          <div
            style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end', gap: 6 }}
            onClick={stop}
            onPointerDown={stop}
          >
            <Button
              size="small"
              icon={<DoubleRightOutlined />}
              onClick={(e) => { e.stopPropagation(); onMoveToReport(plan); }}
              title="완료보고로 이동"
            >
              완료보고
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
