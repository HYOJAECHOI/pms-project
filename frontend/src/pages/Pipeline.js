import React, { useEffect, useMemo, useState } from 'react';
import {
  Typography, Card, Select, Tag, Empty, Dropdown, Space, message, Tooltip,
} from 'antd';
import { UserOutlined, BankOutlined, CalendarOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
  DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import dayjs from 'dayjs';
import api from '../api/axios';
import {
  STAGES as STAGE_NAMES, STAGE_COLOR, HISTORY_STAGES, DEFAULT_STAGE,
} from '../constants/stages';

const { Title, Text } = Typography;

// 단계별 시각 정보 (배경/muted 여부)
const STAGE_BG = {
  '공고전':   '#fafafa',
  '사전공고': '#e6fffb',
  '본공고':   '#e6f4ff',
  '재공고':   '#f0f5ff',
  '제안계획': '#fffbe6',
  '제안진행': '#fff7e6',
  '제안제출': '#fff1f0',
  '평가':     '#fffbe6',
  '수주':     '#f6ffed',
  '기술협상': '#fcffe6',
  '계약':     '#e6fffb',
  '수행중':   '#f6ffed',
  '완료':     '#f6ffed',
  '실주':     '#f5f5f5',
  '제안포기': '#f5f5f5',
};

const STAGES = STAGE_NAMES.map((s) => ({
  value: s,
  color: STAGE_COLOR[s] || 'default',
  bg: STAGE_BG[s] || '#fafafa',
  muted: HISTORY_STAGES.includes(s),
}));

const formatBudget = (b) => {
  if (b == null) return null;
  const n = Number(b);
  if (!isFinite(n)) return null;
  if (n >= 1e8) return `${(n / 1e8).toFixed(n >= 1e10 ? 0 : 1)}억`;
  if (n >= 1e4) return `${Math.round(n / 1e4).toLocaleString()}만`;
  return n.toLocaleString();
};

const dDayInfo = (deadline) => {
  if (!deadline) return null;
  const d = dayjs(deadline).startOf('day');
  const today = dayjs().startOf('day');
  const diff = d.diff(today, 'day');
  if (diff > 0) return { label: `D-${diff}`, color: diff <= 7 ? '#ff4d4f' : diff <= 30 ? '#fa8c16' : '#1677ff' };
  if (diff === 0) return { label: 'D-DAY', color: '#ff4d4f' };
  return { label: `마감 +${Math.abs(diff)}일`, color: '#999' };
};

function DraggableCard({ project, children }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: String(project.id) });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ opacity: isDragging ? 0.4 : 1, cursor: 'grab', marginBottom: 8 }}
    >
      {children}
    </div>
  );
}

function DroppableColumn({ stage, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.value });
  return (
    <div
      ref={setNodeRef}
      style={{
        flex: '0 0 260px',
        background: isOver ? '#bae0ff' : stage.bg,
        border: isOver ? '2px dashed #1677ff' : '1px solid #e8e8e8',
        borderRadius: 6,
        padding: 8,
        minHeight: 200,
        opacity: stage.muted ? 0.7 : 1,
        filter: stage.muted ? 'grayscale(35%)' : 'none',
        transition: 'background 0.15s',
      }}
    >
      {children}
    </div>
  );
}

function ProjectCard({ project, muted, onClick }) {
  const dd = dDayInfo(project.bid_deadline);
  const budget = formatBudget(project.budget);
  return (
    <Card
      size="small"
      hoverable
      onClick={onClick}
      styles={{ body: { padding: 10 } }}
      style={{ background: muted ? '#fafafa' : 'white' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6, marginBottom: 6 }}>
        <Text strong style={{ fontSize: 13, color: muted ? '#8c8c8c' : 'inherit', lineHeight: 1.3 }}>
          {project.name}
        </Text>
        {dd && (
          <Tag color={dd.color} style={{ marginRight: 0, fontSize: 10, padding: '0 5px', flexShrink: 0 }}>
            {dd.label}
          </Tag>
        )}
      </div>
      {project.client && (
        <div style={{ fontSize: 11, color: '#666', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
          <BankOutlined style={{ fontSize: 10 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.client}</span>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#555' }}>
        <Space size={4}>
          <UserOutlined style={{ fontSize: 10 }} />
          <span>{project.pm_name || '-'}</span>
        </Space>
        {budget && (
          <Tooltip title={`${Number(project.budget).toLocaleString()}원`}>
            <Text strong style={{ fontSize: 12, color: '#1677ff' }}>{budget}</Text>
          </Tooltip>
        )}
      </div>
      {project.bid_deadline && (
        <div style={{ fontSize: 10, color: '#999', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
          <CalendarOutlined style={{ fontSize: 9 }} />
          {dayjs(project.bid_deadline).format('YYYY-MM-DD HH:mm')}
        </div>
      )}
    </Card>
  );
}

export default function Pipeline() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [orgFilter, setOrgFilter] = useState(null);
  const [activeDragId, setActiveDragId] = useState(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const load = () => {
    Promise.all([
      api.get('/projects').then((r) => r.data).catch(() => []),
      api.get('/organizations').then((r) => r.data).catch(() => []),
    ]).then(([p, o]) => {
      setProjects(p);
      setOrgs(o);
    });
  };

  useEffect(() => { load(); }, []);

  const updateStage = async (pid, newStage) => {
    try {
      await api.put(`/projects/${pid}`, null, { params: { pipeline_stage: newStage } });
      message.success(`단계 변경: ${newStage}`);
      load();
    } catch (err) {
      message.error(err?.response?.data?.detail || '변경에 실패했어요.');
    }
  };

  const filtered = orgFilter ? projects.filter((p) => p.organization_id === orgFilter) : projects;

  const byStage = useMemo(() => {
    return STAGES.map((s) => {
      const items = filtered.filter((p) => (p.pipeline_stage || DEFAULT_STAGE) === s.value);
      const totalBudget = items.reduce((sum, p) => sum + (Number(p.budget) || 0), 0);
      return { ...s, items, totalBudget };
    });
  }, [filtered]);

  const activeProject = activeDragId
    ? projects.find((p) => p.id === parseInt(activeDragId, 10))
    : null;

  const handleDragEnd = ({ active, over }) => {
    setActiveDragId(null);
    if (!over) return;
    const pid = parseInt(active.id, 10);
    const newStage = over.id;
    const p = projects.find((x) => x.id === pid);
    if (!p || (p.pipeline_stage || DEFAULT_STAGE) === newStage) return;
    updateStage(pid, newStage);
  };

  const stageMenuItems = (current) =>
    STAGES
      .filter((s) => s.value !== current)
      .map((s) => ({
        key: s.value,
        label: <Tag color={s.color} style={{ marginRight: 0 }}>{s.value}</Tag>,
      }));

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Title level={4} style={{ margin: 0 }}>📊 파이프라인</Title>
        <Space>
          <Text type="secondary" style={{ fontSize: 12 }}>본부 필터</Text>
          <Select
            style={{ width: 220 }}
            placeholder="전체"
            value={orgFilter}
            onChange={setOrgFilter}
            options={orgs.map((o) => ({ value: o.id, label: o.name }))}
            allowClear
          />
          <Text type="secondary" style={{ fontSize: 11 }}>
            💡 카드 드래그 또는 우클릭으로 단계 변경 · 클릭으로 상세 이동
          </Text>
        </Space>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={({ active }) => setActiveDragId(active.id)}
        onDragCancel={() => setActiveDragId(null)}
        onDragEnd={handleDragEnd}
      >
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12, alignItems: 'flex-start' }}>
          {byStage.map((s) => (
            <DroppableColumn key={s.value} stage={s}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, padding: '0 2px' }}>
                <Space size={4}>
                  <Tag color={s.color} style={{ marginRight: 0 }}>{s.value}</Tag>
                  <Text strong style={{ fontSize: 12 }}>{s.items.length}</Text>
                </Space>
                {s.totalBudget > 0 && (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {formatBudget(s.totalBudget)}
                  </Text>
                )}
              </div>
              {s.items.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#bfbfbf', fontSize: 11, padding: 16 }}>
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={null} />
                </div>
              ) : (
                s.items.map((p) => (
                  <DraggableCard key={p.id} project={p}>
                    <Dropdown
                      menu={{
                        items: stageMenuItems(s.value),
                        onClick: (e) => {
                          e.domEvent?.stopPropagation?.();
                          updateStage(p.id, e.key);
                        },
                      }}
                      trigger={['contextMenu']}
                    >
                      <div>
                        <ProjectCard
                          project={p}
                          muted={s.muted}
                          onClick={() => navigate(`/projects/${p.id}`)}
                        />
                      </div>
                    </Dropdown>
                  </DraggableCard>
                ))
              )}
            </DroppableColumn>
          ))}
        </div>

        <DragOverlay>
          {activeProject ? (
            <div style={{ width: 244, cursor: 'grabbing' }}>
              <ProjectCard project={activeProject} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </>
  );
}
