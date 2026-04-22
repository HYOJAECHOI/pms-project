import React, { useEffect, useMemo, useState } from 'react';
import {
  Typography, Button, Card, Row, Col, Tag, Space, Empty, Tooltip, Modal, List,
  Input, Popover, message,
} from 'antd';
import {
  ArrowLeftOutlined, PlusOutlined, BankOutlined, UserOutlined,
  CalendarOutlined, TeamOutlined, WarningOutlined, ClockCircleOutlined,
  RiseOutlined, CheckCircleOutlined, ArrowUpOutlined, ArrowDownOutlined,
  CloseOutlined, SearchOutlined, FilterOutlined,
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  DndContext, useDraggable, useDroppable, DragOverlay,
  PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import api from '../api/axios';
import ProjectTable from './ProjectTable';
import {
  STAGE_GROUPS, STAGE_COLOR, SECTION_TARGET_STAGE, DEFAULT_STAGE,
  PROPOSAL_STAGES, RUNNING_STAGES, ACTIVE_STAGES, DEADLINE_STAGES,
} from '../constants/stages';

const { Title, Text } = Typography;

// BUCKETS/SECTIONS는 그룹 정의를 그대로 재사용
const BUCKETS = STAGE_GROUPS;
const SECTIONS = STAGE_GROUPS;

const formatBudget = (b) => {
  if (b == null) return null;
  const n = Number(b);
  if (!isFinite(n) || n <= 0) return null;
  if (n >= 1e8) return `${(n / 1e8).toFixed(n >= 1e10 ? 0 : 1)}억`;
  if (n >= 1e4) return `${Math.round(n / 1e4).toLocaleString()}만`;
  return n.toLocaleString();
};

const dDay = (iso) => {
  if (!iso) return null;
  const a = dayjs(iso).startOf('day');
  const b = dayjs().startOf('day');
  const diff = a.diff(b, 'day');
  if (diff > 0) return { label: `D-${diff}`, color: diff <= 7 ? 'red' : diff <= 30 ? 'orange' : 'blue' };
  if (diff === 0) return { label: 'D-DAY', color: 'red' };
  return { label: `마감 +${-diff}`, color: 'default' };
};

const stageOf = (p) => p.pipeline_stage || DEFAULT_STAGE;

const targetDate = (p) => {
  const s = stageOf(p);
  if (DEADLINE_STAGES.includes(s)) return p.bid_deadline;
  if (RUNNING_STAGES.includes(s)) return p.end_date;
  return null;
};

// 마감일 기반(레거시) — 정렬용으로 일부 유지
const isDeadlineDelayed = (p) => {
  if (!ACTIVE_STAGES.includes(stageOf(p))) return false;
  const t = targetDate(p);
  if (!t) return false;
  return dayjs(t).startOf('day').isBefore(dayjs().startOf('day'));
};

const isDueThisWeek = (p) => {
  if (!ACTIVE_STAGES.includes(stageOf(p))) return false;
  const t = targetDate(p);
  if (!t) return false;
  const d = dayjs(t).startOf('day');
  const today = dayjs().startOf('day');
  return !d.isBefore(today) && d.diff(today, 'day') <= 7;
};

const projectInYear = (p, year) => {
  if (year === 'all') return true;
  const sy = p.start_date ? dayjs(p.start_date).year() : null;
  const ey = p.end_date ? dayjs(p.end_date).year() : null;
  if (sy == null && ey == null) return false;
  if (sy != null && ey != null) return sy <= year && ey >= year;
  return (sy ?? ey) === year;
};

const makePrioritySort = (userId) => (a, b) => {
  const aMine = a.pm_id === userId ? 0 : 1;
  const bMine = b.pm_id === userId ? 0 : 1;
  if (aMine !== bMine) return aMine - bMine;

  const today = dayjs().startOf('day');
  const aT = targetDate(a);
  const bT = targetDate(b);
  const aDiff = aT ? dayjs(aT).startOf('day').diff(today, 'day') : null;
  const bDiff = bT ? dayjs(bT).startOf('day').diff(today, 'day') : null;
  const aSoon = aDiff != null && aDiff >= 0 && aDiff <= 30 ? aDiff : Infinity;
  const bSoon = bDiff != null && bDiff >= 0 && bDiff <= 30 ? bDiff : Infinity;
  if (aSoon !== bSoon) return aSoon - bSoon;

  return (Number(b.budget) || 0) - (Number(a.budget) || 0);
};

function StageBar({ counts, total }) {
  if (!total) {
    return <div style={{ height: 8, borderRadius: 4, background: '#f0f0f0' }} />;
  }
  return (
    <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#f0f0f0' }}>
      {BUCKETS.map((b) => {
        const c = counts[b.key] || 0;
        if (!c) return null;
        return (
          <Tooltip key={b.key} title={`${b.label} ${c}건`}>
            <div style={{ width: `${(c / total) * 100}%`, background: b.color }} />
          </Tooltip>
        );
      })}
    </div>
  );
}

function AlertBox({ icon, label, value, color, onClick, suffix }) {
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick && onClick(); }}
      style={{
        padding: '10px 12px',
        borderRadius: 6,
        background: '#fafafa',
        border: `1px solid ${color}33`,
        borderLeft: `3px solid ${color}`,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = '#f0f0f0'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = '#fafafa'; }}
    >
      <Space size={6}>
        <span style={{ color, fontSize: 14 }}>{icon}</span>
        <Text style={{ fontSize: 12, color: '#666' }}>{label}</Text>
      </Space>
      <Text strong style={{ fontSize: 14, color }}>{value}{suffix || ''}</Text>
    </div>
  );
}

function ProjectCard({ p, muted, onClick, isMine }) {
  const stage = stageOf(p);
  const t = targetDate(p);
  const dd = dDay(t);
  const budget = formatBudget(p.budget);
  return (
    <Card
      size="small"
      hoverable
      onClick={onClick}
      style={{
        background: muted ? '#fafafa' : 'white',
        opacity: muted ? 0.75 : 1,
        borderLeft: isMine ? '3px solid #1677ff' : undefined,
      }}
      styles={{ body: { padding: 12 } }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, marginBottom: 8 }}>
        <Space size={4}>
          {isMine && <Tag color="blue" style={{ marginRight: 0, fontSize: 10 }}>내 PM</Tag>}
          <Tag color={STAGE_COLOR[stage] || 'default'} style={{ marginRight: 0, fontSize: 11 }}>{stage}</Tag>
        </Space>
        {dd && <Tag color={dd.color} style={{ marginRight: 0, fontSize: 11 }}>{dd.label}</Tag>}
      </div>
      <Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8, lineHeight: 1.3 }}>
        {p.name}
      </Text>
      {p.client && (
        <div style={{ fontSize: 12, color: '#666', marginBottom: 4, display: 'flex', gap: 4, alignItems: 'center' }}>
          <BankOutlined style={{ fontSize: 11 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.client}</span>
        </div>
      )}
      <div style={{ fontSize: 12, color: '#666', marginBottom: 6, display: 'flex', gap: 4, alignItems: 'center' }}>
        <UserOutlined style={{ fontSize: 11 }} />
        <span>PM {p.pm_name || '-'}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {budget ? (
          <Tooltip title={`${Number(p.budget).toLocaleString()}원`}>
            <Text strong style={{ fontSize: 13, color: '#1677ff' }}>{budget}</Text>
          </Tooltip>
        ) : <span />}
        {t && (
          <span style={{ fontSize: 11, color: '#999', display: 'flex', gap: 4, alignItems: 'center' }}>
            <CalendarOutlined style={{ fontSize: 10 }} />
            {dayjs(t).format('YYYY-MM-DD')}
          </span>
        )}
      </div>
    </Card>
  );
}

function DraggableCard({ id, project, sectionKey, children }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { project, sectionKey },
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        marginBottom: 8,
        opacity: isDragging ? 0.4 : 1,
        cursor: 'grab',
        touchAction: 'none',
      }}
    >
      {children}
    </div>
  );
}

function SectionColumn({
  section, sorted, filter, onSetFilter, expanded, onToggleExpand,
  canDrag, onCardClick, userId, onOpenTable, compact,
}) {
  const { setNodeRef, isOver } = useDroppable({ id: section.key });
  // 완료·이력같은 보조 섹션은 기본 1건만 보여주고 나머지는 더보기로
  const initialVisible = compact ? 1 : 3;
  const visible = expanded ? sorted : sorted.slice(0, initialVisible);
  const more = sorted.length - visible.length;
  const filterActive = filter !== 'all';

  const popoverContent = (
    <Space wrap size={4} style={{ maxWidth: 260 }}>
      <Button
        size="small"
        type={filter === 'all' ? 'primary' : 'default'}
        onClick={() => onSetFilter('all')}
      >
        전체
      </Button>
      {section.stages.map((s) => (
        <Button
          key={s}
          size="small"
          type={filter === s ? 'primary' : 'default'}
          onClick={() => onSetFilter(s)}
        >
          {s}
        </Button>
      ))}
    </Space>
  );

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: compact ? 'auto' : 'calc(100vh - 280px)',
      maxHeight: compact ? 220 : undefined,
      minHeight: compact ? 140 : 320,
      background: 'white',
      border: '1px solid #f0f0f0',
      borderTop: `3px solid ${section.color}`,
      borderRadius: 6,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 12px',
        borderBottom: '1px solid #f0f0f0',
        background: '#fafafa',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8,
      }}>
        <Tooltip title="테이블 보기로 열기">
          <div
            onClick={onOpenTable}
            style={{ cursor: 'pointer', flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = 0.7; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = 1; }}
          >
            <Space size={4} wrap>
              <span>{section.icon}</span>
              <Text strong style={{ color: section.color }}>{section.label}</Text>
              <Tag style={{ marginRight: 0 }}>{sorted.length}건</Tag>
              {filterActive && (
                <Tag color="blue" style={{ marginRight: 0, fontSize: 10 }}>
                  {filter}
                </Tag>
              )}
            </Space>
          </div>
        </Tooltip>
        <Popover content={popoverContent} trigger="click" placement="bottomRight">
          <Button
            size="small"
            icon={<FilterOutlined />}
            type={filterActive ? 'primary' : 'text'}
          />
        </Popover>
      </div>

      <div
        ref={setNodeRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 8,
          background: isOver ? '#e6f7ff' : 'white',
          transition: 'background 0.15s',
        }}
      >
        {visible.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<span style={{ fontSize: 12, color: '#999' }}>해당 프로젝트가 없어요.</span>}
            style={{ marginTop: 24 }}
          />
        ) : (
          visible.map((p) => {
            const muted = section.key === 'history';
            const isMine = p.pm_id === userId;
            const card = (
              <ProjectCard
                p={p}
                muted={muted}
                isMine={isMine}
                onClick={() => onCardClick(p.id)}
              />
            );
            if (canDrag) {
              return (
                <DraggableCard key={p.id} id={`proj-${p.id}`} project={p} sectionKey={section.key}>
                  {card}
                </DraggableCard>
              );
            }
            return (
              <div key={p.id} style={{ marginBottom: 8 }}>{card}</div>
            );
          })
        )}
      </div>

      {sorted.length > 3 && (
        <div style={{ borderTop: '1px solid #f0f0f0', padding: 4, background: '#fafafa' }}>
          <Button block type="link" size="small" onClick={onToggleExpand}>
            {expanded ? '접기' : `더보기 ${more}건`}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function ProjectList({ user }) {
  const [projects, setProjects] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [users, setUsers] = useState([]);
  const [myOrgId, setMyOrgId] = useState(null);
  const [delayedOnly, setDelayedOnly] = useState(false);
  const [warnModalOrg, setWarnModalOrg] = useState(null);
  const [loading, setLoading] = useState(false);

  // Phase 2 전용
  const [search, setSearch] = useState('');
  const [sectionFilters, setSectionFilters] = useState({
    review: 'all', proposal: 'all', running: 'all', done: 'all', history: 'all',
  });
  const [expandedSections, setExpandedSections] = useState({
    review: false, proposal: false, running: false, done: false, history: false,
  });
  const [activeDragId, setActiveDragId] = useState(null);

  // ─── URL 쿼리파라미터로 관리되는 상태 ─────────────────────────────────────
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedOrgId = searchParams.get('org') ? Number(searchParams.get('org')) : null;
  const tableSectionKey = searchParams.get('section') || null;
  const selectedYear = searchParams.get('year')
    ? Number(searchParams.get('year'))
    : 'all';

  const updateParams = (patch) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      Object.entries(patch).forEach(([k, v]) => {
        if (v == null || v === '' || v === 'all') p.delete(k);
        else p.set(k, String(v));
      });
      return p;
    });
  };

  const setSelectedYear = (y) => updateParams({ year: y });

  const navigate = useNavigate();
  const isExecutive = ['admin', 'manager'].includes(user?.role);
  const canDrag = isExecutive;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  // 프로젝트별 지연 WBS 개수 맵 ({ [projectId]: count })
  const [wbsDelayMap, setWbsDelayMap] = useState({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setWbsDelayMap({});

    Promise.all([
      api.get('/projects').then((r) => r.data).catch(() => []),
      api.get('/organizations').then((r) => r.data).catch(() => []),
      api.get('/users').then((r) => r.data).catch(() => []),
    ])
      .then(([p, o, u]) => {
        if (cancelled) return null;
        setProjects(p);
        setOrgs(o);
        setUsers(u);
        const me = u.find((x) => x.id === user?.id);
        setMyOrgId(me?.organization_id ?? null);
        // 각 프로젝트의 WBS를 받아와 지연 개수 계산
        return Promise.all(
          p.map((proj) =>
            api.get(`/projects/${proj.id}/wbs`)
              .then((r) => ({ pid: proj.id, items: r.data || [] }))
              .catch(() => ({ pid: proj.id, items: [] })),
          ),
        );
      })
      .then((results) => {
        if (cancelled || !results) return;
        const today = dayjs().startOf('day');
        const map = {};
        results.forEach(({ pid, items }) => {
          const count = items.filter((i) => {
            if (!i.plan_end_date) return false;
            if (i.status === '완료') return false;
            return dayjs(i.plan_end_date).startOf('day').isBefore(today);
          }).length;
          map[pid] = count;
        });
        setWbsDelayMap(map);
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [user?.id]);

  // 프로젝트의 WBS 중 지연 항목이 1개라도 있으면 지연 프로젝트
  const isDelayed = (p) => (wbsDelayMap[p.id] || 0) > 0;

  const visibleOrgs = useMemo(() => {
    if (isExecutive) return orgs;
    return orgs.filter((o) => o.id === myOrgId);
  }, [isExecutive, orgs, myOrgId]);

  const availableYears = useMemo(() => {
    const visibleIds = new Set(visibleOrgs.map((o) => o.id));
    const set = new Set();
    projects.forEach((p) => {
      if (!visibleIds.has(p.organization_id)) return;
      if (p.start_date) set.add(dayjs(p.start_date).year());
      if (p.end_date) set.add(dayjs(p.end_date).year());
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [projects, visibleOrgs]);

  const orgSummary = useMemo(() => {
    const today = dayjs().startOf('day');
    const monthStart = dayjs().startOf('month');
    const monthEnd = dayjs().endOf('month');
    const lastMonthEnd = dayjs().subtract(1, 'month').endOf('month');

    const inMonth = (iso) => {
      if (!iso) return false;
      const d = dayjs(iso);
      return !d.isBefore(monthStart) && !d.isAfter(monthEnd);
    };

    const overlapsAt = (p, when) => {
      if (!RUNNING_STAGES.includes(stageOf(p))) return false;
      const s = p.start_date ? dayjs(p.start_date) : null;
      const e = p.end_date ? dayjs(p.end_date) : null;
      if (!s || !e) return false;
      return !s.isAfter(when) && !e.isBefore(when);
    };

    return visibleOrgs.map((org) => {
      const ps = projects.filter(
        (p) => p.organization_id === org.id && projectInYear(p, selectedYear),
      );
      const counts = {};
      BUCKETS.forEach((b) => {
        counts[b.key] = ps.filter((p) => b.stages.includes(stageOf(p))).length;
      });

      const headcount = users.filter((u) => u.organization_id === org.id).length;
      const delayedList = ps.filter(isDelayed);
      const warnedList = ps
        .filter(isDueThisWeek)
        .sort((a, b) => dayjs(targetDate(a)).diff(dayjs(targetDate(b))));

      const runningCount = counts.running || 0;
      const assigned = Math.min(headcount, Math.round(runningCount * 2.5));
      const utilization = headcount
        ? Math.min(100, Math.round((runningCount * 2.5 / headcount) * 100))
        : 0;
      const free = Math.max(0, headcount - assigned);
      const isOverloaded = utilization >= 100 || (headcount && runningCount > headcount * 0.7);
      const overload = isOverloaded
        ? Math.max(0, runningCount - Math.floor(headcount * 0.6))
        : 0;

      const newProposalThisMonth = ps.filter(
        (p) => PROPOSAL_STAGES.includes(stageOf(p)) && inMonth(p.start_date),
      ).length;
      const doneThisMonth = ps.filter(
        (p) => stageOf(p) === '완료' && inMonth(p.end_date),
      ).length;
      const runningNow = ps.filter((p) => overlapsAt(p, today)).length;
      const runningLastMonth = ps.filter((p) => overlapsAt(p, lastMonthEnd)).length;
      const runningDelta = runningNow - runningLastMonth;
      const newAnyThisMonth = ps.filter((p) => inMonth(p.start_date)).length;

      return {
        ...org,
        total: ps.length, counts,
        headcount, assigned, utilization, free, overload,
        delayed: delayedList.length, delayedList,
        dueThisWeek: warnedList.length, warnedList,
        newProposalThisMonth, doneThisMonth, runningDelta, newAnyThisMonth,
      };
    });
  }, [visibleOrgs, projects, users, selectedYear, wbsDelayMap]);

  const phase2Projects = useMemo(() => {
    if (selectedOrgId == null) return [];
    let list = projects.filter(
      (p) => p.organization_id === selectedOrgId && projectInYear(p, selectedYear),
    );
    if (delayedOnly) list = list.filter(isDelayed);
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, selectedOrgId, selectedYear, delayedOnly, wbsDelayMap]);

  const phase2Columns = useMemo(() => {
    const sortFn = makePrioritySort(user?.id);
    const q = search.trim().toLowerCase();
    return SECTIONS.map((section) => {
      let list = phase2Projects.filter((p) => section.stages.includes(stageOf(p)));
      const f = sectionFilters[section.key];
      if (f && f !== 'all') list = list.filter((p) => stageOf(p) === f);
      if (q) {
        list = list.filter((p) =>
          (p.name || '').toLowerCase().includes(q)
          || (p.client || '').toLowerCase().includes(q)
          || (p.pm_name || '').toLowerCase().includes(q)
        );
      }
      return { section, sorted: [...list].sort(sortFn) };
    });
  }, [phase2Projects, sectionFilters, search, user?.id]);

  const selectedOrg = selectedOrgId != null ? orgs.find((o) => o.id === selectedOrgId) : null;

  // Phase 2 → Phase 1: org 파라미터 제거 (year는 유지)
  const goBack = () => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.delete('org');
      p.delete('section');
      return p;
    });
    setDelayedOnly(false);
    setSearch('');
    setSectionFilters({ review: 'all', proposal: 'all', running: 'all', done: 'all', history: 'all' });
    setExpandedSections({ review: false, proposal: false, running: false, done: false, history: false });
  };

  // Phase 3 → Phase 2: section만 제거하고 org는 유지
  const closeTableSection = () => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.delete('section');
      return p;
    });
  };

  const tableSection = useMemo(
    () => (tableSectionKey ? SECTIONS.find((s) => s.key === tableSectionKey) : null),
    [tableSectionKey],
  );

  const tableProjects = useMemo(() => {
    if (!tableSection) return [];
    return phase2Projects.filter((p) => tableSection.stages.includes(stageOf(p)));
  }, [phase2Projects, tableSection]);

  const handleProjectUpdated = (projectId, fields) => {
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, ...fields } : p)));
  };

  const enterDetail = (orgId, opts = {}) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set('org', String(orgId));
      p.delete('section');
      return p;
    });
    setDelayedOnly(!!opts.delayedOnly);
    setSearch('');
    setSectionFilters({ review: 'all', proposal: 'all', running: 'all', done: 'all', history: 'all' });
    setExpandedSections({ review: false, proposal: false, running: false, done: false, history: false });
  };

  // ─── DnD ───
  const handleDragStart = (event) => setActiveDragId(event.active.id);
  const handleDragCancel = () => setActiveDragId(null);
  const handleDragEnd = (event) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;
    const data = active.data.current;
    if (!data) return;
    const fromSection = data.sectionKey;
    const toSection = over.id;
    if (!fromSection || fromSection === toSection) return;
    const project = data.project;
    const newStage = SECTION_TARGET_STAGE[toSection];
    if (!newStage) return;

    const prevStage = project.pipeline_stage;
    setProjects((prev) =>
      prev.map((p) => (p.id === project.id ? { ...p, pipeline_stage: newStage } : p)),
    );
    api.put(`/projects/${project.id}`, null, { params: { pipeline_stage: newStage } })
      .then(() => message.success(`'${project.name}' → ${newStage}`))
      .catch(() => {
        setProjects((prev) =>
          prev.map((p) => (p.id === project.id ? { ...p, pipeline_stage: prevStage } : p)),
        );
        message.error('단계 변경에 실패했어요');
      });
  };

  const activeDragProject = useMemo(() => {
    if (!activeDragId) return null;
    return projects.find((p) => `proj-${p.id}` === activeDragId) || null;
  }, [activeDragId, projects]);

  const YearTabs = () => (
    <Space wrap style={{ marginBottom: 16 }}>
      <Button
        size="small"
        type={selectedYear === 'all' ? 'primary' : 'default'}
        onClick={() => setSelectedYear('all')}
      >
        전체
      </Button>
      {availableYears.map((y) => (
        <Button
          key={y}
          size="small"
          type={selectedYear === y ? 'primary' : 'default'}
          onClick={() => setSelectedYear(y)}
        >
          {y}년
        </Button>
      ))}
    </Space>
  );

  // ─────────────── Phase 1 ───────────────
  if (selectedOrgId == null) {
    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Title level={4} style={{ margin: 0 }}>📂 프로젝트</Title>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/projects/create')}>
            프로젝트 생성
          </Button>
        </div>

        <YearTabs />

        {loading ? null : orgSummary.length === 0 ? (
          <Empty
            description={
              isExecutive
                ? '등록된 본부가 없어요. 조직 관리에서 먼저 본부를 만들어주세요.'
                : '소속 본부가 없어요. 관리자에게 본부 배정을 요청하세요.'
            }
          />
        ) : (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {orgSummary.map((o) => (
              <Card
                key={o.id}
                hoverable
                onClick={() => enterDetail(o.id)}
                styles={{ body: { padding: 16 } }}
              >
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginBottom: 12, flexWrap: 'wrap', gap: 8,
                }}>
                  <Space size={8} wrap>
                    <BankOutlined style={{ color: '#1677ff', fontSize: 18 }} />
                    <Text strong style={{ fontSize: 16 }}>{o.name}</Text>
                    <Tag color="blue" style={{ marginRight: 0 }}>전체 {o.total}건</Tag>
                  </Space>
                  <Space size={6} wrap>
                    {o.delayed > 0 && (
                      <Tag icon={<WarningOutlined />} color="red" style={{ marginRight: 0 }}>
                        지연 {o.delayed}건
                      </Tag>
                    )}
                    {o.dueThisWeek > 0 && (
                      <Tag icon={<ClockCircleOutlined />} color="orange" style={{ marginRight: 0 }}>
                        주의 {o.dueThisWeek}건
                      </Tag>
                    )}
                  </Space>
                </div>

                <Space size={[14, 6]} wrap style={{ marginBottom: 8 }}>
                  {BUCKETS.map((b) => (
                    <div key={b.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: 2, background: b.color, display: 'inline-block',
                      }} />
                      <Text style={{ fontSize: 12, color: '#666' }}>{b.label}</Text>
                      <Text strong style={{ fontSize: 14, color: b.color }}>{o.counts[b.key]}</Text>
                    </div>
                  ))}
                </Space>
                <div style={{ marginBottom: 14 }}>
                  <StageBar counts={o.counts} total={o.total} />
                </div>

                <Row gutter={[16, 12]}>
                  <Col xs={24} md={16}>
                    <div style={{ padding: 12, background: '#fafbfc', borderRadius: 6, marginBottom: 8 }}>
                      <Text strong style={{ fontSize: 12, color: '#8c8c8c', display: 'block', marginBottom: 8 }}>
                        👥 인력 현황
                      </Text>
                      <Row gutter={[8, 4]}>
                        <Col xs={12} sm={6}>
                          <Text style={{ fontSize: 11, color: '#999' }}>투입</Text>
                          <div><Text strong style={{ fontSize: 14 }}>{o.assigned}명</Text></div>
                        </Col>
                        <Col xs={12} sm={6}>
                          <Text style={{ fontSize: 11, color: '#999' }}>가동률</Text>
                          <div>
                            <Text strong style={{
                              fontSize: 14,
                              color: o.utilization >= 90 ? '#ff4d4f' : o.utilization >= 70 ? '#fa8c16' : '#52c41a',
                            }}>
                              {o.utilization}%
                            </Text>
                          </div>
                        </Col>
                        <Col xs={12} sm={6}>
                          <Text style={{ fontSize: 11, color: '#999' }}>여유</Text>
                          <div><Text strong style={{ fontSize: 14, color: '#52c41a' }}>{o.free}명</Text></div>
                        </Col>
                        <Col xs={12} sm={6}>
                          <Text style={{ fontSize: 11, color: '#999' }}>과부하</Text>
                          <div>
                            <Text strong style={{ fontSize: 14, color: o.overload > 0 ? '#ff4d4f' : '#bfbfbf' }}>
                              {o.overload}명
                            </Text>
                          </div>
                        </Col>
                      </Row>
                    </div>

                    <div style={{ padding: 12, background: '#fafbfc', borderRadius: 6 }}>
                      <Text strong style={{ fontSize: 12, color: '#8c8c8c', display: 'block', marginBottom: 8 }}>
                        📈 이번달 트렌드
                      </Text>
                      <Row gutter={[8, 4]}>
                        <Col xs={12} sm={8}>
                          <Text style={{ fontSize: 11, color: '#999' }}>신규 제안</Text>
                          <div>
                            <Text strong style={{ fontSize: 14, color: '#1677ff' }}>
                              <ArrowUpOutlined style={{ fontSize: 11, marginRight: 2 }} />
                              {o.newProposalThisMonth}건
                            </Text>
                          </div>
                        </Col>
                        <Col xs={12} sm={8}>
                          <Text style={{ fontSize: 11, color: '#999' }}>완료</Text>
                          <div>
                            <Text strong style={{ fontSize: 14, color: '#13c2c2' }}>
                              <CheckCircleOutlined style={{ fontSize: 11, marginRight: 2 }} />
                              {o.doneThisMonth}건
                            </Text>
                          </div>
                        </Col>
                        <Col xs={24} sm={8}>
                          <Text style={{ fontSize: 11, color: '#999' }}>전월 대비 수행중</Text>
                          <div>
                            <Text strong style={{
                              fontSize: 14,
                              color: o.runningDelta > 0 ? '#52c41a' : o.runningDelta < 0 ? '#ff4d4f' : '#999',
                            }}>
                              {o.runningDelta > 0 && <ArrowUpOutlined style={{ fontSize: 11, marginRight: 2 }} />}
                              {o.runningDelta < 0 && <ArrowDownOutlined style={{ fontSize: 11, marginRight: 2 }} />}
                              {o.runningDelta > 0 ? `+${o.runningDelta}` : o.runningDelta}
                            </Text>
                          </div>
                        </Col>
                      </Row>
                    </div>
                  </Col>

                  <Col xs={24} md={8}>
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      <AlertBox
                        icon={<WarningOutlined />}
                        label="지연" value={o.delayed} suffix="건"
                        color={o.delayed > 0 ? '#ff4d4f' : '#bfbfbf'}
                        onClick={() => enterDetail(o.id, { delayedOnly: true })}
                      />
                      <AlertBox
                        icon={<ClockCircleOutlined />}
                        label="주의" value={o.dueThisWeek} suffix="건"
                        color={o.dueThisWeek > 0 ? '#fa8c16' : '#bfbfbf'}
                        onClick={() => setWarnModalOrg(o)}
                      />
                      <AlertBox
                        icon={<TeamOutlined />}
                        label="인원" value={o.headcount} suffix="명"
                        color="#1677ff"
                        onClick={() => navigate('/org-management')}
                      />
                    </Space>
                  </Col>
                </Row>

                <div style={{
                  marginTop: 12, paddingTop: 10, borderTop: '1px solid #f0f0f0',
                  display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                }}>
                  <Space size={4}>
                    <CalendarOutlined style={{ color: o.dueThisWeek > 0 ? '#fa8c16' : '#bfbfbf', fontSize: 12 }} />
                    <Text style={{ fontSize: 12, color: '#666' }}>이번주 마감 임박</Text>
                    <Text strong style={{ fontSize: 12, color: o.dueThisWeek > 0 ? '#fa8c16' : '#999' }}>
                      {o.dueThisWeek}건
                    </Text>
                  </Space>
                  <Space size={4}>
                    <RiseOutlined style={{ color: '#1677ff', fontSize: 12 }} />
                    <Text style={{ fontSize: 12, color: '#666' }}>이번달 신규</Text>
                    <Text strong style={{ fontSize: 12, color: '#1677ff' }}>{o.newAnyThisMonth}건</Text>
                  </Space>
                  {o.delayed > 0 && (
                    <Space size={4}>
                      <WarningOutlined style={{ color: '#ff4d4f', fontSize: 12 }} />
                      <Text style={{ fontSize: 12, color: '#666' }}>지연</Text>
                      <Text strong style={{ fontSize: 12, color: '#ff4d4f' }}>{o.delayed}건</Text>
                    </Space>
                  )}
                  {o.overload > 0 && (
                    <Space size={4}>
                      <TeamOutlined style={{ color: '#ff4d4f', fontSize: 12 }} />
                      <Text style={{ fontSize: 12, color: '#666' }}>과부하 인원</Text>
                      <Text strong style={{ fontSize: 12, color: '#ff4d4f' }}>{o.overload}명</Text>
                    </Space>
                  )}
                </div>
              </Card>
            ))}
          </Space>
        )}

        <Modal
          open={!!warnModalOrg}
          onCancel={() => setWarnModalOrg(null)}
          title={`⚠️ 주의 프로젝트 - ${warnModalOrg?.name || ''}`}
          footer={null}
          width={640}
        >
          {warnModalOrg && (warnModalOrg.warnedList?.length ? (
            <List
              dataSource={warnModalOrg.warnedList}
              renderItem={(p) => {
                const t = targetDate(p);
                const dd = dDay(t);
                return (
                  <List.Item
                    style={{ cursor: 'pointer', padding: '12px 0' }}
                    onClick={() => { setWarnModalOrg(null); navigate(`/projects/${p.id}`); }}
                  >
                    <div style={{ width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <Text strong style={{ fontSize: 13 }}>{p.name}</Text>
                        {dd && <Tag color={dd.color} style={{ marginRight: 0 }}>{dd.label}</Tag>}
                      </div>
                      <Space size={8}>
                        <Tag color={STAGE_COLOR[stageOf(p)] || 'default'} style={{ marginRight: 0, fontSize: 11 }}>
                          {stageOf(p)}
                        </Tag>
                        {t && (
                          <Text style={{ fontSize: 12, color: '#666' }}>
                            <CalendarOutlined style={{ marginRight: 4 }} />
                            마감 {dayjs(t).format('YYYY-MM-DD HH:mm')}
                          </Text>
                        )}
                      </Space>
                    </div>
                  </List.Item>
                );
              }}
            />
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="이번주 마감 프로젝트가 없어요." />
          ))}
        </Modal>
      </>
    );
  }

  // ─────────────── Phase 3: 엑셀형 테이블 ───────────────
  if (tableSection) {
    return (
      <ProjectTable
        section={tableSection}
        projects={tableProjects}
        user={user}
        onBack={closeTableSection}
        onProjectUpdated={handleProjectUpdated}
      />
    );
  }

  // ─────────────── Phase 2: 칸반 ───────────────
  const activeFilterChips = [];
  if (selectedYear !== 'all') {
    activeFilterChips.push({
      key: 'year',
      label: `${selectedYear}년`,
      onClose: () => setSelectedYear('all'),
      color: 'default',
    });
  }
  if (delayedOnly) {
    activeFilterChips.push({
      key: 'delayed',
      label: '지연만',
      onClose: () => setDelayedOnly(false),
      color: 'red',
    });
  }
  Object.entries(sectionFilters).forEach(([k, v]) => {
    if (v !== 'all') {
      const sec = SECTIONS.find((s) => s.key === k);
      activeFilterChips.push({
        key: `sec-${k}`,
        label: `${sec?.label}: ${v}`,
        onClose: () => setSectionFilters((prev) => ({ ...prev, [k]: 'all' })),
        color: 'blue',
      });
    }
  });
  if (search.trim()) {
    activeFilterChips.push({
      key: 'search',
      label: `"${search.trim()}"`,
      onClose: () => setSearch(''),
      color: 'geekblue',
    });
  }

  return (
    <>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 16, gap: 8, flexWrap: 'wrap',
      }}>
        <Space size={8} wrap>
          <Button icon={<ArrowLeftOutlined />} onClick={goBack}>뒤로</Button>
          <Title level={4} style={{ margin: 0 }}>
            <BankOutlined style={{ color: '#1677ff', marginRight: 6 }} />
            {selectedOrg?.name || '-'}
          </Title>
          <Tag color="blue" style={{ marginRight: 0 }}>{phase2Projects.length}건</Tag>
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/projects/create')}>
          프로젝트 생성
        </Button>
      </div>

      <YearTabs />

      <div style={{
        display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
        marginBottom: 16,
      }}>
        <Input
          placeholder="사업명 · 발주기관 · PM 검색"
          prefix={<SearchOutlined />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          style={{ maxWidth: 360, width: '100%' }}
        />
        {activeFilterChips.length > 0 && (
          <Space size={4} wrap>
            <Text style={{ fontSize: 12, color: '#999' }}>적용 중:</Text>
            {activeFilterChips.map((c) => (
              <Tag
                key={c.key}
                color={c.color}
                closable
                closeIcon={<CloseOutlined />}
                onClose={c.onClose}
                style={{ marginRight: 0 }}
              >
                {c.label}
              </Tag>
            ))}
          </Space>
        )}
        {canDrag && (
          <Tooltip title="카드를 다른 섹션으로 끌어다 놓으면 단계가 변경돼요.">
            <Text style={{ fontSize: 11, color: '#999', marginLeft: 'auto' }}>
              💡 드래그하여 단계 변경 가능
            </Text>
          </Tooltip>
        )}
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {/* 상단: 활성 4개 섹션 (검토/제안/수행/완료) — 1280x720 기준 한 화면 */}
        <div style={{
          display: 'flex',
          gap: 12,
          overflowX: 'auto',
          paddingBottom: 8,
          alignItems: 'stretch',
          marginBottom: 12,
        }}>
          {phase2Columns
            .filter(({ section }) => section.key !== 'history')
            .map(({ section, sorted }) => (
              <div key={section.key} style={{ flex: '1 1 0', minWidth: 220 }}>
                <SectionColumn
                  section={section}
                  sorted={sorted}
                  filter={sectionFilters[section.key]}
                  onSetFilter={(v) =>
                    setSectionFilters((prev) => ({ ...prev, [section.key]: v }))
                  }
                  expanded={expandedSections[section.key]}
                  onToggleExpand={() =>
                    setExpandedSections((prev) => ({
                      ...prev, [section.key]: !prev[section.key],
                    }))
                  }
                  canDrag={canDrag}
                  onCardClick={(pid) => navigate(`/projects/${pid}`, { state: { from: '/projects' } })}
                  userId={user?.id}
                  onOpenTable={() => setSearchParams((prev) => {
                  const p = new URLSearchParams(prev);
                  p.set('section', section.key);
                  return p;
                })}
                />
              </div>
            ))}
        </div>

        {/* 하단: 이력 섹션 (compact) */}
        {phase2Columns
          .filter(({ section }) => section.key === 'history')
          .map(({ section, sorted }) => (
            <div key={section.key}>
              <SectionColumn
                section={section}
                sorted={sorted}
                filter={sectionFilters[section.key]}
                onSetFilter={(v) =>
                  setSectionFilters((prev) => ({ ...prev, [section.key]: v }))
                }
                expanded={expandedSections[section.key]}
                onToggleExpand={() =>
                  setExpandedSections((prev) => ({
                    ...prev, [section.key]: !prev[section.key],
                  }))
                }
                canDrag={canDrag}
                onCardClick={(pid) => navigate(`/projects/${pid}`, { state: { from: '/projects' } })}
                userId={user?.id}
                onOpenTable={() => setSearchParams((prev) => {
                  const p = new URLSearchParams(prev);
                  p.set('section', section.key);
                  return p;
                })}
                compact
              />
            </div>
          ))}

        <DragOverlay>
          {activeDragProject && (
            <div style={{ width: 240, opacity: 0.95, cursor: 'grabbing' }}>
              <ProjectCard
                p={activeDragProject}
                isMine={activeDragProject.pm_id === user?.id}
                onClick={() => {}}
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </>
  );
}
