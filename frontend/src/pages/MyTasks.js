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

// 상대시간: 방금 / N시간 전 / 어제 / N일 전 / N주 전 / M월 D일
const relativeTime = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - date) / (1000 * 60 * 60 * 24));
  if (diff === 0) {
    const hours = Math.floor((now - date) / (1000 * 60 * 60));
    if (hours === 0) return '방금';
    return `${hours}시간 전`;
  }
  if (diff === 1) return '어제';
  if (diff < 7) return `${diff}일 전`;
  if (diff < 30) return `${Math.floor(diff / 7)}주 전`;
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
};

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
  { key: '수행완료', bg: '#f6ffed', border: '#b7eb8f' },
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

  const [finishTarget, setFinishTarget] = useState(null); // 수행완료 이동 대기중인 plan
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
      const res = await api.get('/my-instructions', { params: { include_completed: true } });
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
  // 자동 등록 대상: 백엔드 /my-instructions가 active로 간주하는 open/acknowledged/in_progress
  const activeInstructions = useMemo(
    () => myInstructions.filter(
      i => ['open', 'acknowledged', 'in_progress'].includes(i.status) && i.wbs_id
    ),
    [myInstructions]
  );

  const wbsById = useMemo(() => {
    const m = {};
    myWbs.forEach(w => { m[w.id] = w; });
    return m;
  }, [myWbs]);

  // 카드 렌더용 맵: 상태 불문하고 포함 (completed/cancelled가 로컬 state에 남아있는 동안 카드 레이아웃 유지)
  const instructionByWbsId = useMemo(() => {
    const m = {};
    myInstructions.forEach(i => { if (i.wbs_id && !m[i.wbs_id]) m[i.wbs_id] = i; });
    return m;
  }, [myInstructions]);

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
    const map = { '할일': [], '수행예정': [], '수행완료': [], '완료보고': [] };
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

  // '할일' 컬럼 3섹션 분리: 지시사항 / 할일 / 오늘 안할 것(skipped)
  // 각 섹션 내부는 D-day 빠른순 (plan_end_date 오름차순, 없으면 맨 뒤).
  const todoSections = useMemo(() => {
    const plans = plansByColumn['할일'] || [];
    const skipped = plans.filter(p => p.status === 'skipped');
    const active = plans.filter(p => p.status !== 'skipped');
    const instructions = active.filter(p => instructionByWbsId[p.wbs_id]);
    const todos = active.filter(p => !instructionByWbsId[p.wbs_id]);

    const sorter = (a, b) => {
      const aEnd = wbsById[a.wbs_id]?.plan_end_date;
      const bEnd = wbsById[b.wbs_id]?.plan_end_date;
      if (!aEnd && !bEnd) return (a.id || 0) - (b.id || 0);
      if (!aEnd) return 1;
      if (!bEnd) return -1;
      return aEnd.localeCompare(bEnd);
    };
    instructions.sort(sorter);
    todos.sort(sorter);
    skipped.sort(sorter);
    return { instructions, todos, skipped };
  }, [plansByColumn, instructionByWbsId, wbsById]);

  // ===== 자동 동기화: 미등록 WBS/지시사항을 '할일' 컬럼에 POST (초기 1회) =====
  useEffect(() => {
    if (!user?.id || loading || initialSyncRef.current) return;

    // eslint-disable-next-line no-console
    console.log('auto-register check:', {
      myWbs: myWbs.length,
      myInstructions: myInstructions.length,
      workPlans: workPlans.length,
      instructionsWithWbs: myInstructions.filter(i => i.wbs_id).length,
    });

    const missingWbsIds = new Set();

    // WBS 자동 등록: 미완료이고 workPlans에 없는 것
    myWbs
      .filter(w => w.status !== '완료')
      .forEach(w => {
        if (!workPlans.some(p => p.wbs_id === w.id)) {
          missingWbsIds.add(w.id);
        }
      });

    // 지시사항 자동 등록: open/acknowledged이고 wbs_id가 있고 workPlans에 없는 것
    activeInstructions.forEach(ins => {
      if (!workPlans.some(p => p.wbs_id === ins.wbs_id)) {
        missingWbsIds.add(ins.wbs_id);
      }
    });

    // eslint-disable-next-line no-console
    console.log('missing wbs_ids to register:', Array.from(missingWbsIds));

    initialSyncRef.current = true; // 첫 동기화 1회만 (이후 재진입 방지)
    if (missingWbsIds.size === 0) return;

    (async () => {
      for (const wbsId of missingWbsIds) {
        try {
          await api.post('/work-plans', null, {
            params: { wbs_id: wbsId, plan_date: todayISO(), column: '할일' },
          });
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('auto-register failed:', wbsId, e.response?.data);
        }
      }
      await fetchWorkPlans();
    })();
  }, [user, loading, myWbs, myInstructions, activeInstructions, workPlans, fetchWorkPlans]);

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

  // 컬럼 이동 시 지시사항 receipt status 매핑.
  // 완료보고는 WBS 전용이라 지시사항 이동 대상 아님 (handleDragEnd에서 차단).
  const instructionStatusFor = (targetCol) => {
    if (targetCol === '수행예정') return 'in_progress';
    if (targetCol === '수행완료') return 'completed';
    if (targetCol === '할일')     return 'acknowledged';
    return null;
  };

  // 성공 시 재조회까지 완료. 실패 시 에러를 throw — 호출측에서 처리.
  const moveToColumn = async (plan, targetCol, memo) => {
    // 1) 지시사항 카드면 receipt status를 먼저 동기화
    const instruction = instructionByWbsId[plan.wbs_id];
    let newReceiptStatus = null;
    if (instruction && user?.id) {
      newReceiptStatus = instructionStatusFor(targetCol);
      if (newReceiptStatus) {
        const url = `/wbs/instructions/${instruction.instruction_id}/receipts/${user.id}`;
        // eslint-disable-next-line no-console
        console.log('[moveToColumn] receipt PUT', {
          instruction,
          url,
          params: { status: newReceiptStatus },
          userId: user.id,
        });
        try {
          await api.put(url, null, { params: { status: newReceiptStatus } });
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('[moveToColumn] receipt PUT failed', {
            status: e.response?.status,
            data: e.response?.data,
            url,
          });
          throw e;
        }
      }
    }

    // 2) work_plan column 업데이트
    const params = { column: targetCol };
    if (memo !== undefined) params.memo = memo;
    // skipped 카드가 '할일' 외 컬럼으로 나가면 status 모순 제거
    if (plan.status === 'skipped' && targetCol !== '할일') {
      params.status = 'planned';
    }
    try {
      await api.put(`/work-plans/${plan.id}`, null, { params });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[moveToColumn] work_plan PUT failed', {
        status: e.response?.status,
        data: e.response?.data,
        planId: plan.id,
        params,
      });
      throw e;
    }

    // 3) work_plans 재조회 + 지시사항 상태 로컬 반영
    //    백엔드에서 include_completed=true로 받으므로 refresh 호출해도 카드 유지 가능.
    //    다만 로컬 patch를 먼저 적용해 UX 지연을 줄임.
    if (instruction && newReceiptStatus) {
      setMyInstructions(prev => prev.map(i =>
        i.instruction_id === instruction.instruction_id
          ? { ...i, status: newReceiptStatus }
          : i
      ));
    }
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
    const next = plan.status === 'skipped' ? 'planned' : 'skipped';
    const instruction = instructionByWbsId[plan.wbs_id];
    try {
      // 지시사항이면 receipt status도 맞춰서 work_plan status와 일관성 유지.
      //  - skipped 처리 → receipt를 acknowledged로 (수행 중단 = '확인함'으로 되돌림)
      //  - 복구 → 기존 receipt status 유지
      if (instruction && user?.id) {
        const receiptStatus = next === 'skipped' ? 'acknowledged' : instruction.status;
        await api.put(
          `/wbs/instructions/${instruction.instruction_id}/receipts/${user.id}`,
          null,
          { params: { status: receiptStatus } }
        );
        setMyInstructions(prev => prev.map(i =>
          i.instruction_id === instruction.instruction_id
            ? { ...i, status: receiptStatus }
            : i
        ));
      }

      await api.put(`/work-plans/${plan.id}`, null, { params: { status: next } });
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

    // 지시사항은 '수행완료'가 종착점. 완료보고 컬럼으로는 이동 차단.
    if (targetCol === '완료보고' && instructionByWbsId[plan.wbs_id]) {
      message.info('지시사항은 수행완료로 끝납니다');
      return;
    }

    if (targetCol === '수행완료') {
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
      await moveToColumn(finishTarget, '수행완료', memo || undefined);
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
              todoSections={col.key === '할일' ? todoSections : null}
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

      {/* 수행완료 이동 메모 Modal */}
      <Modal
        title="수행완료 처리"
        open={!!finishTarget}
        onOk={handleFinishOk}
        onCancel={handleFinishCancel}
        okText="수행완료"
        cancelText="취소"
      >
        <div style={{ marginBottom: 8 }}>
          <Text type="secondary">
            "{finishTarget?.wbs_title}" 작업을 '수행완료' 컬럼으로 옮깁니다. 마무리 메모는 선택입니다.
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
  col, plans, todoSections, wbsById, instructionByWbsId, getDisplayStatus,
  onOpenDetail, onCheckV, onCheckX, onMoveToReport, loading,
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${col.key}` });

  const renderCard = (plan) => (
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
  );

  // 할일 컬럼: 지시사항 / 할일 / 오늘 안할 것 3섹션 Collapse
  const isTodoColumn = col.key === '할일' && todoSections;
  const collapseItems = isTodoColumn ? [
    {
      key: 'instructions',
      label: <span>📬 지시사항 ({todoSections.instructions.length})</span>,
      children: todoSections.instructions.length === 0
        ? <Text type="secondary" style={{ fontSize: 12 }}>없음</Text>
        : <div>{todoSections.instructions.map(renderCard)}</div>,
    },
    {
      key: 'todos',
      label: <span>📋 할일 ({todoSections.todos.length})</span>,
      children: todoSections.todos.length === 0
        ? <Text type="secondary" style={{ fontSize: 12 }}>없음</Text>
        : <div>{todoSections.todos.map(renderCard)}</div>,
    },
    {
      key: 'skipped',
      label: <span>💤 오늘 안할 것 ({todoSections.skipped.length})</span>,
      children: todoSections.skipped.length === 0
        ? <Text type="secondary" style={{ fontSize: 12 }}>없음</Text>
        : <div>{todoSections.skipped.map(renderCard)}</div>,
    },
  ] : null;

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

      {isTodoColumn ? (
        <Collapse
          defaultActiveKey={['instructions', 'todos']}
          ghost
          size="small"
          items={collapseItems}
        />
      ) : (
        <>
          {plans.length === 0 && !loading && (
            <div style={{ padding: 16, textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>비어있어요</Text>
            </div>
          )}
          {plans.map(renderCard)}
        </>
      )}
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
  const isInstruction = !!instruction;
  const isInstructionDone = isInstruction && columnKey === '수행완료';

  const cardStyle = {
    marginBottom: 8,
    cursor: 'grab',
    backgroundColor: isSkipped ? '#f5f5f5' : '#fff',
    opacity: isSkipped ? 0.6 : 1,
    border: isInstructionDone ? '1.5px solid #52c41a' : undefined,
  };

  const stop = (e) => e.stopPropagation();

  // 지시사항 receipt status → 라벨 + 색상
  const RECEIPT_STATUS_META = {
    open:          { label: '확인하기', color: 'red' },
    acknowledged:  { label: '확인함',   color: 'blue' },
    in_progress:   { label: '진행중',   color: 'orange' },
    completed:     { label: '완료',     color: 'green' },
    cancelled:     { label: '취소',     color: 'default' },
  };
  const receiptMeta = isInstruction
    ? (RECEIPT_STATUS_META[instruction.status] || { label: instruction.status, color: 'default' })
    : null;

  return (
    <div ref={setNodeRef} style={dragStyle} {...attributes} {...listeners}>
      <Card
        size="small"
        style={cardStyle}
        onClick={() => onOpenDetail(plan)}
      >
        {isInstruction ? (
          // ===== 지시사항 카드 =====
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <span style={{ fontSize: 14, lineHeight: '20px' }}>📬</span>
              <div
                style={{
                  flex: 1, minWidth: 0,
                  fontWeight: 600, fontSize: 14, lineHeight: 1.35,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  wordBreak: 'break-word',
                  color: isSkipped ? '#bbb' : undefined,
                  textDecoration: isSkipped ? 'line-through' : 'none',
                }}
                title={instruction.title}
              >
                {instruction.title}
              </div>
            </div>
            <div style={{ marginTop: 6 }}>
              <Tag color={receiptMeta.color} style={{ fontSize: 11, margin: 0 }}>
                {receiptMeta.label}
              </Tag>
            </div>
            <div
              style={{
                marginTop: 6, fontSize: 11, color: '#888',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
              title={`${instruction.project_name || ''} / ${instruction.wbs_title || ''}`}
            >
              {instruction.project_name}
              {instruction.wbs_title ? ` / ${instruction.wbs_title}` : ''}
            </div>
            <div style={{ marginTop: 2, fontSize: 11, color: '#999' }}>
              {instruction.author_name ? `${instruction.author_name} · ` : ''}
              {relativeTime(instruction.created_at)}
            </div>
          </>
        ) : (
          // ===== WBS 카드 (기존 방식) =====
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <span style={{ fontSize: 14, lineHeight: '20px' }}>📋</span>
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
        )}

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

        {columnKey === '수행완료' && !isInstruction && (
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
