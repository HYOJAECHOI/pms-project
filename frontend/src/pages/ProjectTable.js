import React, { useMemo, useState, useCallback } from 'react';
import {
  Table, Button, Input, Tag, Select, Dropdown, message, Space, Typography, Tooltip,
} from 'antd';
import { ArrowLeftOutlined, SearchOutlined, PlusOutlined } from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import dayjs from 'dayjs';
import api from '../api/axios';
import {
  STAGES, STAGE_GROUPS, STAGE_COLOR, STAGE_OPTGROUPS, DEFAULT_STAGE,
  STAGE_PREV_MAP,
} from '../constants/stages';

const { Title, Text } = Typography;

// 단계 변경용 메뉴 items (그룹별 + 구분선). prev는 현재 단계에 따라 달라지므로 런타임에 추가.
const buildStageMenuItems = (currentStage) => {
  const items = [];
  const prev = STAGE_PREV_MAP[currentStage];
  if (prev) {
    items.push({
      key: `__prev__${prev}`,
      label: <span style={{ fontSize: 12 }}>← 이전 단계로 ({prev})</span>,
    });
    items.push({ key: '__prev_div__', type: 'divider' });
  }
  STAGE_GROUPS.forEach((g, idx) => {
    items.push({
      key: `grp-${g.key}`,
      type: 'group',
      label: (
        <span style={{ fontSize: 11, color: g.color, fontWeight: 600 }}>
          {g.icon} {g.label}
        </span>
      ),
      children: g.stages.map((s) => ({
        key: s,
        label: <Tag color={STAGE_COLOR[s] || 'default'} style={{ marginRight: 0 }}>{s}</Tag>,
      })),
    });
    if (idx < STAGE_GROUPS.length - 1) {
      items.push({ key: `div-${idx}`, type: 'divider' });
    }
  });
  return items;
};

const formatBudget = (b) => {
  if (b == null) return '-';
  const n = Number(b);
  if (!isFinite(n) || n <= 0) return '-';
  if (n >= 1e8) return `${(n / 1e8).toFixed(n >= 1e10 ? 0 : 1)}억`;
  if (n >= 1e4) return `${Math.round(n / 1e4).toLocaleString()}만`;
  return n.toLocaleString();
};

function StageCell({ record, editing, onStartEdit, onChange }) {
  const stage = record.pipeline_stage || DEFAULT_STAGE;

  if (editing) {
    return (
      <Select
        autoFocus
        defaultOpen
        value={stage}
        size="small"
        style={{ width: 150 }}
        onChange={(v) => { onChange(v); onStartEdit(false); }}
        onBlur={() => onStartEdit(false)}
        options={STAGE_OPTGROUPS}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <Dropdown
      trigger={['contextMenu']}
      menu={{
        items: buildStageMenuItems(stage),
        onClick: ({ key, domEvent }) => {
          domEvent?.stopPropagation();
          if (key.startsWith('__prev__')) {
            const target = key.replace('__prev__', '');
            if (target && target !== stage) onChange(target);
            return;
          }
          if (STAGES.includes(key) && key !== stage) onChange(key);
        },
      }}
    >
      <Tag
        color={STAGE_COLOR[stage] || 'default'}
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={(e) => { e.stopPropagation(); onStartEdit(true); }}
      >
        {stage} ▾
      </Tag>
    </Dropdown>
  );
}

// ─── resizable header cell ─────────────────────────────────────────────────
function ResizableHeaderCell({ onResize, width, style, children, ...rest }) {
  if (width == null) {
    return <th {...rest} style={style}>{children}</th>;
  }
  const onMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = width;
    const onMove = (me) => onResize(Math.max(60, startWidth + (me.clientX - startX)));
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };
  return (
    <th {...rest} style={{ ...style, position: 'relative' }}>
      {children}
      <span
        onMouseDown={onMouseDown}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute', right: 0, top: 0, bottom: 0, width: 6,
          cursor: 'col-resize', userSelect: 'none', zIndex: 1,
        }}
      />
    </th>
  );
}

const TABLE_COMPONENTS = { header: { cell: ResizableHeaderCell } };

// 기본 컬럼 메타데이터 (한 곳에서 관리 — 숨김/너비용)
const COL_META = [
  { key: 'no',              title: 'No',                width: 56,  fixed: true },
  { key: 'pipeline_stage',  title: '단계',              width: 150 },
  { key: 'client',          title: '발주기관',          width: 180 },
  { key: 'name',            title: '사업명',            width: 260 },
  { key: 'budget',          title: '사업금액(추정)',    width: 130 },
  { key: 'proposal_writer', title: '제안작성',          width: 110 },
  { key: 'bid_deadline',    title: '입찰(의견)마감일',  width: 170 },
  { key: 'member_count',    title: '참여인력',          width: 90 },
  { key: 'description',     title: '비고',              width: 220 },
];

export default function ProjectTable({ section, projects, user, onBack, onProjectUpdated, onCreate }) {
  const navigate = useNavigate();
  const location = useLocation();
  const fromPath = location.pathname + (location.search || '');
  const openDetail = useCallback(
    (pid) => navigate(`/projects/${pid}`, { state: { from: fromPath } }),
    [navigate, fromPath],
  );
  const [search, setSearch] = useState('');
  const [editingStageId, setEditingStageId] = useState(null);

  const [hiddenCols, setHiddenCols] = useState([]);
  const [colWidths, setColWidths] = useState(
    () => COL_META.reduce((acc, c) => ({ ...acc, [c.key]: c.width }), {}),
  );

  const toggleCol = useCallback((key) => {
    setHiddenCols((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }, []);

  const resizeCol = useCallback((key, w) => {
    setColWidths((prev) => ({ ...prev, [key]: w }));
  }, []);

  // 컬럼 헤더 우클릭 메뉴 (숨기기/다시 보이기 토글)
  const colVisibilityMenu = useMemo(() => ({
    items: COL_META
      .filter((c) => !c.fixed)
      .map((c) => ({
        key: c.key,
        label: (
          <span style={{ fontSize: 12 }}>
            {hiddenCols.includes(c.key) ? '☐' : '☑'}  {c.title}
          </span>
        ),
      })),
    onClick: ({ key, domEvent }) => {
      domEvent?.stopPropagation();
      toggleCol(key);
    },
  }), [hiddenCols, toggleCol]);

  const wrapTitle = (key, label) => (
    <Dropdown menu={colVisibilityMenu} trigger={['contextMenu']}>
      <span style={{ userSelect: 'none' }}>{label}</span>
    </Dropdown>
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return projects;
    const q = search.toLowerCase();
    return projects.filter((p) =>
      (p.name || '').toLowerCase().includes(q)
      || (p.client || '').toLowerCase().includes(q)
      || (p.pm_name || '').toLowerCase().includes(q)
      || (p.proposal_writer || '').toLowerCase().includes(q),
    );
  }, [projects, search]);

  const stageFilters = useMemo(() => (
    Array.from(new Set(projects.map((p) => p.pipeline_stage || DEFAULT_STAGE)))
      .map((s) => ({ text: s, value: s }))
  ), [projects]);

  const clientFilters = useMemo(() => (
    Array.from(new Set(projects.map((p) => p.client).filter(Boolean)))
      .map((c) => ({ text: c, value: c }))
  ), [projects]);

  const updateStage = (project, newStage) => {
    const prev = project.pipeline_stage;
    onProjectUpdated && onProjectUpdated(project.id, { pipeline_stage: newStage });
    api.put(`/projects/${project.id}`, null, {
      params: { pipeline_stage: newStage, user_id: user?.id },
    })
      .then(() => message.success(`'${project.name}' → ${newStage}`))
      .catch(() => {
        onProjectUpdated && onProjectUpdated(project.id, { pipeline_stage: prev });
        message.error('단계 변경에 실패했어요');
      });
  };

  const allColumns = [
    {
      key: 'no', title: wrapTitle('no', 'No'), align: 'center',
      render: (_, __, idx) => idx + 1,
    },
    {
      key: 'pipeline_stage', dataIndex: 'pipeline_stage',
      title: wrapTitle('pipeline_stage', '단계'),
      filters: stageFilters,
      onFilter: (v, r) => (r.pipeline_stage || DEFAULT_STAGE) === v,
      sorter: (a, b) => (a.pipeline_stage || '').localeCompare(b.pipeline_stage || ''),
      render: (_, record) => (
        <StageCell
          record={record}
          editing={editingStageId === record.id}
          onStartEdit={(on) => setEditingStageId(on ? record.id : null)}
          onChange={(v) => updateStage(record, v)}
        />
      ),
    },
    {
      key: 'client', dataIndex: 'client',
      title: wrapTitle('client', '발주기관'),
      filters: clientFilters,
      onFilter: (v, r) => r.client === v,
      sorter: (a, b) => (a.client || '').localeCompare(b.client || ''),
      render: (c) => c || '-',
    },
    {
      key: 'name', dataIndex: 'name',
      title: wrapTitle('name', '사업명'),
      ellipsis: true,
      sorter: (a, b) => (a.name || '').localeCompare(b.name || ''),
      render: (n, record) => (
        <Tooltip title={n}>
          <a
            onClick={(e) => { e.stopPropagation(); openDetail(record.id); }}
            style={{ color: '#1677ff' }}
          >
            {n}
          </a>
        </Tooltip>
      ),
    },
    {
      key: 'budget', dataIndex: 'budget',
      title: wrapTitle('budget', '사업금액(추정)'),
      align: 'right',
      sorter: (a, b) => (Number(a.budget) || 0) - (Number(b.budget) || 0),
      render: (b) => (
        <Tooltip title={b ? `${Number(b).toLocaleString()}원` : ''}>
          <span style={{ color: '#1677ff' }}>{formatBudget(b)}</span>
        </Tooltip>
      ),
    },
    {
      key: 'proposal_writer', dataIndex: 'proposal_writer',
      title: wrapTitle('proposal_writer', '제안작성'),
      sorter: (a, b) => (a.proposal_writer || '').localeCompare(b.proposal_writer || ''),
      render: (v) => v || '-',
    },
    {
      key: 'bid_deadline', dataIndex: 'bid_deadline',
      title: wrapTitle('bid_deadline', '입찰(의견)마감일'),
      sorter: (a, b) => {
        const at = a.bid_deadline ? new Date(a.bid_deadline).getTime() : 0;
        const bt = b.bid_deadline ? new Date(b.bid_deadline).getTime() : 0;
        return at - bt;
      },
      render: (d) => (d ? dayjs(d).format('YYYY-MM-DD HH:mm') : '-'),
    },
    {
      key: 'member_count',
      title: wrapTitle('member_count', '참여인력'),
      align: 'center',
      render: () => <Text type="secondary">-</Text>,
    },
    {
      key: 'description', dataIndex: 'description',
      title: wrapTitle('description', '비고'),
      ellipsis: true,
      render: (v) => v || '-',
    },
  ];

  // 숨김 컬럼 제거 + width/onHeaderCell 주입
  const columns = allColumns
    .filter((c) => !hiddenCols.includes(c.key))
    .map((c) => {
      const width = colWidths[c.key];
      return {
        ...c,
        width,
        onHeaderCell: () => ({
          width,
          onResize: (w) => resizeCol(c.key, w),
        }),
      };
    });

  const totalWidth = columns.reduce((acc, c) => acc + (c.width || 120), 0);

  return (
    <>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 16, gap: 8, flexWrap: 'wrap',
      }}>
        <Space size={8} wrap>
          <Button icon={<ArrowLeftOutlined />} onClick={onBack}>뒤로</Button>
          <Title level={4} style={{ margin: 0, color: section?.color }}>
            <span style={{ marginRight: 6 }}>{section?.icon}</span>
            {section?.label}
          </Title>
          <Tag color="blue" style={{ marginRight: 0 }}>{filtered.length}건</Tag>
          {hiddenCols.length > 0 && (
            <Tooltip title={`숨긴 컬럼: ${hiddenCols.map((k) => COL_META.find((c) => c.key === k)?.title).join(', ')}`}>
              <Tag
                color="orange"
                style={{ marginRight: 0, cursor: 'pointer' }}
                onClick={() => setHiddenCols([])}
              >
                숨긴 컬럼 {hiddenCols.length}개 · 모두 보이기
              </Tag>
            </Tooltip>
          )}
        </Space>
        <Space size={8} wrap>
          <Input
            placeholder="사업명 · 발주기관 · PM · 제안작성자 검색"
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            style={{ maxWidth: 320, width: '100%' }}
          />
          {onCreate && (
            <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
              프로젝트 생성
            </Button>
          )}
        </Space>
      </div>

      <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
        💡 컬럼 헤더 우클릭: 표시/숨김 · 헤더 우측 끝 드래그: 너비 조절
      </Text>

      <Table
        size="small"
        rowKey="id"
        dataSource={filtered}
        columns={columns}
        components={TABLE_COMPONENTS}
        pagination={{ pageSize: 20, showSizeChanger: false }}
        scroll={{ x: totalWidth }}
        onRow={(record) => ({
          onClick: () => openDetail(record.id),
          style: { cursor: 'pointer' },
        })}
      />
    </>
  );
}
