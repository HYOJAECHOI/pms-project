import React, { useEffect, useMemo, useState } from 'react';
import {
  Button, Table, Tag, Typography, Card, Progress, Row, Col, Statistic, Tabs,
  Descriptions, Upload, Input, InputNumber, Select, DatePicker, Switch, Divider,
  List, Avatar, Empty, Space, Tooltip, Popconfirm, message, Modal, Spin,
} from 'antd';
import {
  ArrowLeftOutlined, EditOutlined, TeamOutlined, UploadOutlined,
  DeleteOutlined, FileOutlined, SendOutlined, RobotOutlined, UserOutlined,
  SaveOutlined, CloseOutlined, LinkOutlined,
} from '@ant-design/icons';
import api from '../api/axios';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  STAGE_COLOR, DEFAULT_STAGE, WON_STAGES, LOST_STAGES,
  STAGE_GROUPS, stageGroupKey, STAGE_PREV_MAP,
} from '../constants/stages';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { RangePicker } = DatePicker;

const levelColors = { 1: 'purple', 2: 'blue', 3: 'cyan', 4: 'green' };
const statusColors = { '대기': 'default', '진행중': 'orange', '완료': 'green' };

// Select 옵션 상수
const PROJECT_TYPES        = ['PMC', 'ISP', 'BPR', '컨설팅', '감리', '구축', '기타'];
const DIVISIONS            = ['ODA', '국내공공', '민간'];
const CONTRACT_METHODS     = ['협상', '제한경쟁', '일반경쟁'];
const PARTICIPATION_LIMITS = ['중소기업', '중견기업', '대기업가능', '무제한'];
const EVALUATION_METHODS   = ['서면', '발표', '복합'];
const ALL_STATUSES         = ['제안', '수행', '종료'];

// 섹션 이동 버튼 정의
const SECTION_TRANSITIONS = {
  review: [
    { key: 'to-proposal', label: '제안 진행 →', kind: 'primary', target: '제안계획',
      confirmTitle: '제안 단계로 이동', confirmDesc: '검토를 마치고 제안 단계로 진입할까요?' },
    { key: 'to-history-cancel', label: '제안 취소', kind: 'danger', target: '제안포기',
      confirmTitle: '제안 취소', confirmDesc: '이 프로젝트를 제안 취소(이력)로 처리할까요?' },
  ],
  proposal: [
    { key: 'to-running', label: '수주 확정 →', kind: 'primary', target: '수주',
      confirmTitle: '수주 확정', confirmDesc: '수주 확정하고 수행 단계로 이동할까요?' },
    { key: 'to-history-lost', label: '실주 처리', kind: 'danger', target: '실주',
      confirmTitle: '실주 처리', confirmDesc: '이 프로젝트를 실주(이력)로 처리할까요?' },
  ],
  running: [
    { key: 'to-done', label: '사업 완료 →', kind: 'primary', target: '완료',
      confirmTitle: '사업 완료', confirmDesc: '이 사업을 완료 처리할까요?' },
  ],
  done: [],
  history: [],
};

const formatBudget = (b) => {
  if (b == null) return '-';
  const n = Number(b);
  if (!isFinite(n) || n <= 0) return '-';
  if (n >= 1e8) return `${(n / 1e8).toFixed(n >= 1e10 ? 0 : 1)}억`;
  if (n >= 1e4) return `${Math.round(n / 1e4).toLocaleString()}만`;
  return n.toLocaleString();
};

const winLabel = (stage) => {
  if (WON_STAGES.includes(stage)) return { text: '수주', color: 'green' };
  if (LOST_STAGES.includes(stage)) return { text: '미수주', color: 'red' };
  return { text: '진행중', color: 'gold' };
};

const formatBytes = (n) => {
  if (!n) return '-';
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
};

// project → draft (dayjs 객체로 변환)
const projectToDraft = (p) => ({
  ...p,
  start_date:          p.start_date ? dayjs(p.start_date) : null,
  end_date:            p.end_date ? dayjs(p.end_date) : null,
  bid_deadline:        p.bid_deadline ? dayjs(p.bid_deadline) : null,
  announcement_date:   p.announcement_date ? dayjs(p.announcement_date) : null,
  submission_deadline: p.submission_deadline ? dayjs(p.submission_deadline) : null,
  bidding_deadline:    p.bidding_deadline ? dayjs(p.bidding_deadline) : null,
  evaluation_date:     p.evaluation_date ? dayjs(p.evaluation_date) : null,
  joint_performance:   !!p.joint_performance,
  subcontract_allowed: !!p.subcontract_allowed,
});

// draft → PUT params
const buildUpdateParams = (d) => {
  const params = {};
  const strings = [
    'name', 'description', 'status', 'client', 'country', 'proposal_writer',
    'announcement_number', 'project_type', 'division',
    'contract_method', 'participation_limit', 'consortium_members',
    'evaluation_method', 'evaluation_agency', 'negotiation_threshold',
    'overview', 'deliverables', 'pm_requirements', 'language_requirements',
    'special_notes', 'announcement_url',
  ];
  strings.forEach((k) => {
    if (d[k] !== undefined && d[k] !== null) params[k] = d[k];
    else if (d[k] === '') params[k] = '';
  });
  const ints = ['budget', 'win_amount', 'tech_score_ratio', 'price_score_ratio', 'organization_id'];
  ints.forEach((k) => { if (d[k] != null && d[k] !== '') params[k] = d[k]; });
  // booleans (always send)
  params.joint_performance   = !!d.joint_performance;
  params.subcontract_allowed = !!d.subcontract_allowed;
  // dates
  if (d.start_date)        params.start_date        = dayjs(d.start_date).format('YYYY-MM-DD');
  if (d.end_date)          params.end_date          = dayjs(d.end_date).format('YYYY-MM-DD');
  if (d.announcement_date) params.announcement_date = dayjs(d.announcement_date).format('YYYY-MM-DD');
  if (d.evaluation_date)   params.evaluation_date   = dayjs(d.evaluation_date).format('YYYY-MM-DD');
  // datetimes
  if (d.bid_deadline)        params.bid_deadline        = dayjs(d.bid_deadline).format('YYYY-MM-DDTHH:mm:ss');
  if (d.submission_deadline) params.submission_deadline = dayjs(d.submission_deadline).format('YYYY-MM-DDTHH:mm:ss');
  if (d.bidding_deadline)    params.bidding_deadline    = dayjs(d.bidding_deadline).format('YYYY-MM-DDTHH:mm:ss');
  return params;
};

// 보기/편집 토글 헬퍼 — 값 표시 또는 Input 렌더
const fmtText  = (v) => (v == null || v === '' ? '-' : v);
const fmtDate  = (v) => (v ? dayjs(v).format('YYYY-MM-DD') : '-');
const fmtDT    = (v) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-');
const fmtMoney = (v) => {
  if (v == null || v === '') return '-';
  return `${Number(v).toLocaleString()}원`;
};

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const me = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
  }, []);
  const userId = me?.id;

  const [project, setProject] = useState(null);
  const [wbsItems, setWbsItems] = useState([]);
  const [members, setMembers] = useState([]);
  const [files, setFiles] = useState([]);
  const [comments, setComments] = useState([]);
  const [commentInput, setCommentInput] = useState('');
  const [posting, setPosting] = useState(false);

  // 탭 제어 — 초기값은 navigate state.tab로 복귀 가능
  const [activeTab, setActiveTab] = useState(() => location.state?.tab || 'overview');

  // 편집 모드
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  // 유저 프로필 모달
  const [viewingUserId, setViewingUserId] = useState(null);

  // 수주 확정 시 PM 재지정 Modal
  const [pmPickerOpen, setPmPickerOpen] = useState(false);
  const [pickedPmId, setPickedPmId] = useState(null);

  const fetchProject  = () => api.get(`/projects/${id}`)
    .then((r) => setProject(r.data))
    .catch(() => message.error('프로젝트 정보를 불러오지 못했어요'));
  const fetchWbs      = () => api.get(`/projects/${id}/wbs`).then((r) => setWbsItems(r.data)).catch(() => setWbsItems([]));
  const fetchFiles    = () => api.get(`/projects/${id}/files`).then((r) => setFiles(r.data)).catch(() => setFiles([]));
  const fetchComments = () => api.get(`/projects/${id}/comments`).then((r) => setComments(r.data)).catch(() => setComments([]));

  useEffect(() => {
    fetchProject();
    fetchWbs();
    api.get(`/projects/${id}/members`).then((r) => setMembers(r.data)).catch(() => setMembers([]));
    fetchFiles();
    fetchComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // navigate state.tab 변화에 따라 활성 탭 동기화 + 해당 탭 재fetch
  useEffect(() => {
    const t = location.state?.tab;
    if (!t) return;
    setActiveTab(t);
    if (t === 'wbs') fetchWbs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const overallProgress = wbsItems.length > 0
    ? wbsItems.reduce((acc, i) => acc + (i.actual_progress || 0), 0) / wbsItems.length
    : 0;
  const completedCount = wbsItems.filter((i) => i.status === '완료').length;
  const inProgressCount = wbsItems.filter((i) => i.status === '진행중').length;
  const pendingCount = wbsItems.filter((i) => i.status === '대기').length;

  // 단일 필드 변경 (파이프라인 단계 버튼용)
  const updateField = (params) => {
    api.put(`/projects/${id}`, null, { params: { ...params, user_id: userId } })
      .then(() => Promise.all([fetchProject(), fetchComments()]))
      .then(() => message.success('변경되었어요'))
      .catch(() => message.error('변경에 실패했어요'));
  };

  const startEdit = () => {
    setDraft(projectToDraft(project));
    setEditMode(true);
  };
  const cancelEdit = () => {
    setDraft(null);
    setEditMode(false);
  };
  const setField = (key, val) => setDraft((prev) => ({ ...prev, [key]: val }));
  const saveEdit = () => {
    setSaving(true);
    const params = buildUpdateParams(draft);
    api.put(`/projects/${id}`, null, { params: { ...params, user_id: userId } })
      .then(() => Promise.all([fetchProject(), fetchComments()]))
      .then(() => {
        setEditMode(false);
        setDraft(null);
        message.success('저장되었어요');
      })
      .catch(() => message.error('저장에 실패했어요'))
      .finally(() => setSaving(false));
  };

  const submitComment = () => {
    const content = commentInput.trim();
    if (!content) return;
    setPosting(true);
    api.post(`/projects/${id}/comments`, null, {
      params: { content, user_id: userId, comment_type: 'manual' },
    })
      .then(() => { setCommentInput(''); return fetchComments(); })
      .then(() => message.success('댓글이 등록됐어요'))
      .catch(() => message.error('등록에 실패했어요'))
      .finally(() => setPosting(false));
  };

  const deleteFile = (fileId) => {
    api.delete(`/projects/files/${fileId}`)
      .then(() => fetchFiles())
      .then(() => message.success('삭제됐어요'))
      .catch(() => message.error('삭제에 실패했어요'));
  };

  const handleGoBack = () => {
    const from = location.state?.from;
    if (from) navigate(from);
    else navigate('/projects');
  };

  const wbsColumns = [
    { title: 'WBS 번호', dataIndex: 'wbs_number', key: 'wbs_number', width: 100 },
    {
      title: '레벨', dataIndex: 'level', key: 'level', width: 80,
      render: (level) => <Tag color={levelColors[level]}>{level}Lv</Tag>,
    },
    {
      title: '작업명', dataIndex: 'title', key: 'title',
      render: (text, record) => (
        <span style={{ paddingLeft: (record.level - 1) * 20, fontWeight: record.level === 1 ? 'bold' : 'normal' }}>
          {text}
        </span>
      ),
    },
    { title: '담당자', dataIndex: 'assignee_name', key: 'assignee_name', width: 100 },
    {
      title: '상태', dataIndex: 'status', key: 'status', width: 90,
      render: (status) => <Tag color={statusColors[status]}>{status}</Tag>,
    },
    { title: '계획 시작일', dataIndex: 'plan_start_date', key: 'plan_start_date', width: 110 },
    { title: '계획 완료일', dataIndex: 'plan_end_date', key: 'plan_end_date', width: 110 },
    {
      title: '계획진척률', dataIndex: 'plan_progress', key: 'plan_progress', width: 130,
      render: (val) => <Progress percent={Math.round((val || 0) * 100)} size="small" />,
    },
    {
      title: '실적진척률', dataIndex: 'actual_progress', key: 'actual_progress', width: 130,
      render: (val) => <Progress percent={Math.round((val || 0) * 100)} size="small" status={(val || 0) >= 1 ? 'success' : 'active'} />,
    },
    { title: '산출물', dataIndex: 'deliverable', key: 'deliverable' },
  ];

  if (!project) return <p>로딩 중...</p>;

  const currentStage = project.pipeline_stage || DEFAULT_STAGE;
  const currentGroupKey = stageGroupKey(currentStage);
  const currentGroup = STAGE_GROUPS.find((g) => g.key === currentGroupKey);
  const transitions = SECTION_TRANSITIONS[currentGroupKey] || [];
  const prevStage = STAGE_PREV_MAP[currentStage] || null;

  // ─── 편집 모드용 공용 렌더러 ───
  const viewOrInput = (field, viewNode, inputNode) => (editMode ? inputNode : viewNode);

  // ─── 상태 섹션 ───
  const pipelineStageCard = (
    <Card size="small" title="🎯 상태">
      <div style={{ marginBottom: 12 }}>
        <Text type="secondary" style={{ fontSize: 12, marginRight: 6 }}>현재 섹션</Text>
        {currentGroup && (
          <Tag color="blue" style={{ marginRight: 6 }}>
            {currentGroup.icon} {currentGroup.label}
          </Tag>
        )}
        <Text type="secondary" style={{ fontSize: 12, marginRight: 6 }}>현재 단계</Text>
        <Tag color={STAGE_COLOR[currentStage] || 'default'}>{currentStage}</Tag>
      </div>

      <Row align="stretch">
        {/* 좌측: 현재 섹션 단계 버튼들 */}
        <Col span={11}>
          {currentGroup && (
            <>
              <Text style={{ fontSize: 12, color: '#8c8c8c', display: 'block', marginBottom: 6 }}>
                {currentGroup.label} 단계 선택
              </Text>
              <Space wrap size={6}>
                {currentGroup.stages.map((s) => (
                  <Button
                    key={s}
                    size="small"
                    type={s === currentStage ? 'primary' : 'default'}
                    onClick={() => {
                      if (s !== currentStage) updateField({ pipeline_stage: s });
                    }}
                  >
                    {s}
                  </Button>
                ))}
              </Space>
            </>
          )}
        </Col>

        {/* 중앙: 세로 구분선 */}
        <Col span={2} style={{ display: 'flex', justifyContent: 'center' }}>
          <Divider type="vertical" style={{ height: '100%', minHeight: 60 }} />
        </Col>

        {/* 우측: 섹션 이동 + 이전 단계로 */}
        <Col span={11}>
          {(prevStage || transitions.length > 0) ? (
            <>
              <Text style={{ fontSize: 12, color: '#8c8c8c', display: 'block', marginBottom: 6 }}>
                단계 이동
              </Text>
              <Space wrap size={6}>
                {prevStage && (
                  <Popconfirm
                    title="이전 단계로 복원"
                    description={`'${currentStage}' → '${prevStage}' 로 되돌릴까요?`}
                    onConfirm={() => updateField({ pipeline_stage: prevStage })}
                    okText="확인"
                    cancelText="취소"
                  >
                    <Button size="small">← 이전 단계로 ({prevStage})</Button>
                  </Popconfirm>
                )}
                {transitions.map((t) => {
                  // 수주 확정(proposal → running) 시에는 Popconfirm 대신 PM 선택 Modal을 띄움
                  if (t.target === '수주') {
                    return (
                      <Button
                        key={t.key}
                        type="primary"
                        size="small"
                        onClick={() => {
                          setPickedPmId(project.pm_id || null);
                          setPmPickerOpen(true);
                        }}
                      >
                        {t.label}
                      </Button>
                    );
                  }
                  return (
                  <Popconfirm
                    key={t.key}
                    title={t.confirmTitle}
                    description={t.confirmDesc}
                    onConfirm={() => updateField({ pipeline_stage: t.target })}
                    okText="확인"
                    cancelText="취소"
                  >
                    {t.kind === 'danger' ? (
                      <Button danger size="small">{t.label}</Button>
                    ) : (
                      <Button
                        type="primary"
                        size="small"
                        style={{ background: '#52c41a', borderColor: '#52c41a' }}
                      >
                        {t.label}
                      </Button>
                    )}
                  </Popconfirm>
                  );
                })}
              </Space>
            </>
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>
              이동 가능한 단계가 없어요.
            </Text>
          )}
        </Col>
      </Row>
    </Card>
  );

  // ─── 편집 모드 툴바 ───
  const editToolbar = (
    <Card size="small" styles={{ body: { padding: 10 } }}>
      <Space>
        {!editMode ? (
          <Button type="primary" icon={<EditOutlined />} onClick={startEdit}>
            수정하기
          </Button>
        ) : (
          <>
            <Button
              type="primary" icon={<SaveOutlined />}
              loading={saving} onClick={saveEdit}
            >
              저장
            </Button>
            <Button icon={<CloseOutlined />} onClick={cancelEdit}>취소</Button>
            <Text type="secondary" style={{ fontSize: 12 }}>
              모든 필드를 수정한 후 저장을 눌러주세요.
            </Text>
          </>
        )}
      </Space>
    </Card>
  );

  // ─── 섹션1: 기본 정보 ───
  const basicInfoCard = (
    <Card size="small" title="📋 기본 정보">
      <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered labelStyle={{ width: 140 }}>
        <Descriptions.Item label="사업명" span={2}>
          {viewOrInput('name',
            fmtText(project.name),
            <Input value={draft?.name || ''} onChange={(e) => setField('name', e.target.value)} />,
          )}
        </Descriptions.Item>
        <Descriptions.Item label="공고번호">
          {viewOrInput('announcement_number',
            fmtText(project.announcement_number),
            <Input value={draft?.announcement_number || ''} onChange={(e) => setField('announcement_number', e.target.value)} />,
          )}
        </Descriptions.Item>
        <Descriptions.Item label="연도">
          {project.start_date ? dayjs(project.start_date).year() : '-'}
        </Descriptions.Item>
        <Descriptions.Item label="사업유형">
          {viewOrInput('project_type',
            fmtText(project.project_type),
            <Select
              allowClear
              value={draft?.project_type || undefined}
              style={{ width: '100%' }}
              onChange={(v) => setField('project_type', v || '')}
              options={PROJECT_TYPES.map((s) => ({ value: s, label: s }))}
            />,
          )}
        </Descriptions.Item>
        <Descriptions.Item label="구분">
          {viewOrInput('division',
            fmtText(project.division),
            <Select
              allowClear
              value={draft?.division || undefined}
              style={{ width: '100%' }}
              onChange={(v) => setField('division', v || '')}
              options={DIVISIONS.map((s) => ({ value: s, label: s }))}
            />,
          )}
        </Descriptions.Item>
        <Descriptions.Item label="국가/지역">
          {viewOrInput('country',
            fmtText(project.country),
            <Input value={draft?.country || ''} onChange={(e) => setField('country', e.target.value)} />,
          )}
        </Descriptions.Item>
        <Descriptions.Item label="발주기관">
          {viewOrInput('client',
            fmtText(project.client),
            <Input value={draft?.client || ''} onChange={(e) => setField('client', e.target.value)} />,
          )}
        </Descriptions.Item>
        <Descriptions.Item label="사업예산(추정)">
          {viewOrInput('budget',
            <Space>
              <Tooltip title={project.budget ? `${Number(project.budget).toLocaleString()}원` : ''}>
                <Text strong style={{ color: '#1677ff' }}>{formatBudget(project.budget)}</Text>
              </Tooltip>
              {(() => { const w = winLabel(project.pipeline_stage); return <Tag color={w.color}>{w.text}</Tag>; })()}
            </Space>,
            <InputNumber
              value={draft?.budget ?? null}
              style={{ width: '100%' }}
              min={0} step={1000000}
              formatter={(v) => (v == null || v === '' ? '' : `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ','))}
              parser={(v) => (v ? v.replace(/,/g, '') : '')}
              onChange={(v) => setField('budget', v)}
            />,
          )}
        </Descriptions.Item>
        <Descriptions.Item label="수주금액">
          {viewOrInput('win_amount',
            fmtMoney(project.win_amount),
            <InputNumber
              value={draft?.win_amount ?? null}
              style={{ width: '100%' }}
              min={0} step={1000000}
              formatter={(v) => (v == null || v === '' ? '' : `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ','))}
              parser={(v) => (v ? v.replace(/,/g, '') : '')}
              onChange={(v) => setField('win_amount', v)}
            />,
          )}
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );

  // ─── 섹션2: 일정 정보 ───
  const scheduleCard = (
    <Card size="small" title="📅 일정 정보">
      <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered labelStyle={{ width: 140 }}>
        <Descriptions.Item label="공고일">
          {viewOrInput('announcement_date',
            fmtDate(project.announcement_date),
            <DatePicker
              value={draft?.announcement_date || null}
              style={{ width: '100%' }}
              onChange={(v) => setField('announcement_date', v)}
            />,
          )}
        </Descriptions.Item>
        <Descriptions.Item label="제안서 제출 마감">
          {viewOrInput('submission_deadline',
            fmtDT(project.submission_deadline),
            <DatePicker
              value={draft?.submission_deadline || null}
              showTime format="YYYY-MM-DD HH:mm"
              style={{ width: '100%' }}
              onChange={(v) => setField('submission_deadline', v)}
            />,
          )}
        </Descriptions.Item>
        <Descriptions.Item label="투찰 마감일시">
          {viewOrInput('bidding_deadline',
            fmtDT(project.bidding_deadline),
            <DatePicker
              value={draft?.bidding_deadline || null}
              showTime format="YYYY-MM-DD HH:mm"
              style={{ width: '100%' }}
              onChange={(v) => setField('bidding_deadline', v)}
            />,
          )}
        </Descriptions.Item>
        <Descriptions.Item label="평가 예정일">
          {viewOrInput('evaluation_date',
            fmtDate(project.evaluation_date),
            <DatePicker
              value={draft?.evaluation_date || null}
              style={{ width: '100%' }}
              onChange={(v) => setField('evaluation_date', v)}
            />,
          )}
        </Descriptions.Item>
        <Descriptions.Item label="사업기간" span={2}>
          {viewOrInput('period',
            (project.start_date && project.end_date)
              ? (
                <Space direction="vertical" size={2}>
                  <span>{project.start_date} ~ {project.end_date}</span>
                  {(() => {
                    const os = project.original_start_date;
                    const oe = project.original_end_date;
                    if (!os || !oe) return null;
                    if (os === project.start_date && oe === project.end_date) return null;
                    const origDays = dayjs(oe).diff(dayjs(os), 'day');
                    const curDays  = dayjs(project.end_date).diff(dayjs(project.start_date), 'day');
                    const delta = curDays - origDays;
                    return (
                      <Space size={6}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          원래 계획: {os} ~ {oe}
                        </Text>
                        {delta > 0 && <Tag color="red">{delta}일 연장</Tag>}
                        {delta < 0 && <Tag color="green">{-delta}일 단축</Tag>}
                        {delta === 0 && <Tag>일정 이동</Tag>}
                      </Space>
                    );
                  })()}
                </Space>
              )
              : '-',
            <RangePicker
              value={draft?.start_date && draft?.end_date ? [draft.start_date, draft.end_date] : null}
              style={{ width: '100%' }}
              onChange={(range) => {
                setField('start_date', range ? range[0] : null);
                setField('end_date',   range ? range[1] : null);
              }}
            />,
          )}
        </Descriptions.Item>
        <Descriptions.Item label="입찰마감일(legacy)" span={2}>
          {viewOrInput('bid_deadline',
            fmtDT(project.bid_deadline),
            <DatePicker
              value={draft?.bid_deadline || null}
              showTime format="YYYY-MM-DD HH:mm"
              style={{ width: '100%' }}
              onChange={(v) => setField('bid_deadline', v)}
            />,
          )}
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );

  // ─── 섹션3: 계약/인력 정보 ───
  const contractCard = (
    <Card size="small" title="👥 계약/인력 정보">
      <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered labelStyle={{ width: 140 }}>
        <Descriptions.Item label="계약방법">
          {viewOrInput('contract_method',
            fmtText(project.contract_method),
            <Select
              allowClear
              value={draft?.contract_method || undefined}
              style={{ width: '100%' }}
              onChange={(v) => setField('contract_method', v || '')}
              options={CONTRACT_METHODS.map((s) => ({ value: s, label: s }))}
            />,
          )}
        </Descriptions.Item>
        <Descriptions.Item label="참가자격제한">
          {viewOrInput('participation_limit',
            fmtText(project.participation_limit),
            <Select
              allowClear
              value={draft?.participation_limit || undefined}
              style={{ width: '100%' }}
              onChange={(v) => setField('participation_limit', v || '')}
              options={PARTICIPATION_LIMITS.map((s) => ({ value: s, label: s }))}
            />,
          )}
        </Descriptions.Item>
        <Descriptions.Item label="공동이행">
          {viewOrInput('joint_performance',
            <Tag color={project.joint_performance ? 'green' : 'default'}>
              {project.joint_performance ? '가능' : '불가'}
            </Tag>,
            <Switch
              checked={!!draft?.joint_performance}
              onChange={(v) => setField('joint_performance', v)}
              checkedChildren="가능" unCheckedChildren="불가"
            />,
          )}
        </Descriptions.Item>
        <Descriptions.Item label="하도급 가능">
          {viewOrInput('subcontract_allowed',
            <Tag color={project.subcontract_allowed ? 'green' : 'default'}>
              {project.subcontract_allowed ? '가능' : '불가'}
            </Tag>,
            <Switch
              checked={!!draft?.subcontract_allowed}
              onChange={(v) => setField('subcontract_allowed', v)}
              checkedChildren="가능" unCheckedChildren="불가"
            />,
          )}
        </Descriptions.Item>
        <Descriptions.Item label="참여업체" span={2}>
          {viewOrInput('consortium_members',
            fmtText(project.consortium_members),
            <Input
              value={draft?.consortium_members || ''}
              placeholder="예: 컨소시엄A(주관)/하도급B"
              onChange={(e) => setField('consortium_members', e.target.value)}
            />,
          )}
        </Descriptions.Item>
        <Descriptions.Item label="PM">
          {fmtText(project.pm_name)}
        </Descriptions.Item>
        <Descriptions.Item
          label={
            stageGroupKey(project.pipeline_stage) === 'proposal'
              ? <span style={{ color: '#faad14', fontWeight: 700 }}>⭐ 제안작성자</span>
              : '제안작성자'
          }
        >
          {viewOrInput('proposal_writer',
            <span style={stageGroupKey(project.pipeline_stage) === 'proposal'
              ? { fontWeight: 700, color: '#d48806' }
              : {}}>
              {fmtText(project.proposal_writer)}
            </span>,
            <Input value={draft?.proposal_writer || ''} onChange={(e) => setField('proposal_writer', e.target.value)} />,
          )}
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );

  // ─── 섹션4: 평가 정보 ───
  const evalCard = (
    <Card size="small" title="📊 평가 정보">
      <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered labelStyle={{ width: 140 }}>
        <Descriptions.Item label="평가방식">
          {viewOrInput('evaluation_method',
            fmtText(project.evaluation_method),
            <Select
              allowClear
              value={draft?.evaluation_method || undefined}
              style={{ width: '100%' }}
              onChange={(v) => setField('evaluation_method', v || '')}
              options={EVALUATION_METHODS.map((s) => ({ value: s, label: s }))}
            />,
          )}
        </Descriptions.Item>
        <Descriptions.Item label="평가기관">
          {viewOrInput('evaluation_agency',
            fmtText(project.evaluation_agency),
            <Input value={draft?.evaluation_agency || ''} onChange={(e) => setField('evaluation_agency', e.target.value)} />,
          )}
        </Descriptions.Item>
        <Descriptions.Item label="기술점수 비중">
          {viewOrInput('tech_score_ratio',
            project.tech_score_ratio != null ? `${project.tech_score_ratio}%` : '-',
            <InputNumber
              value={draft?.tech_score_ratio ?? null}
              style={{ width: '100%' }}
              min={0} max={100}
              formatter={(v) => (v == null || v === '' ? '' : `${v}%`)}
              parser={(v) => (v ? v.replace(/%/g, '') : '')}
              onChange={(v) => setField('tech_score_ratio', v)}
            />,
          )}
        </Descriptions.Item>
        <Descriptions.Item label="가격점수 비중">
          {viewOrInput('price_score_ratio',
            project.price_score_ratio != null ? `${project.price_score_ratio}%` : '-',
            <InputNumber
              value={draft?.price_score_ratio ?? null}
              style={{ width: '100%' }}
              min={0} max={100}
              formatter={(v) => (v == null || v === '' ? '' : `${v}%`)}
              parser={(v) => (v ? v.replace(/%/g, '') : '')}
              onChange={(v) => setField('price_score_ratio', v)}
            />,
          )}
        </Descriptions.Item>
        <Descriptions.Item label="협상적격 기준" span={2}>
          {viewOrInput('negotiation_threshold',
            fmtText(project.negotiation_threshold),
            <Input
              value={draft?.negotiation_threshold || ''}
              placeholder="예: 85점 이상"
              onChange={(e) => setField('negotiation_threshold', e.target.value)}
            />,
          )}
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );

  // ─── 섹션5: 내용 정보 ───
  const contentCard = (
    <Card size="small" title="📝 내용 정보">
      <Descriptions column={1} size="small" bordered labelStyle={{ width: 140 }}>
        <Descriptions.Item label="사업 개요">
          {viewOrInput('overview',
            <span style={{ whiteSpace: 'pre-wrap' }}>{fmtText(project.overview)}</span>,
            <TextArea
              value={draft?.overview || ''}
              autoSize={{ minRows: 3, maxRows: 8 }}
              onChange={(e) => setField('overview', e.target.value)}
            />,
          )}
        </Descriptions.Item>
        <Descriptions.Item label="주요 산출물">
          {viewOrInput('deliverables',
            <span style={{ whiteSpace: 'pre-wrap' }}>{fmtText(project.deliverables)}</span>,
            <TextArea
              value={draft?.deliverables || ''}
              autoSize={{ minRows: 2, maxRows: 6 }}
              onChange={(e) => setField('deliverables', e.target.value)}
            />,
          )}
        </Descriptions.Item>
        <Descriptions.Item label="PM 자격요건">
          {viewOrInput('pm_requirements',
            <span style={{ whiteSpace: 'pre-wrap' }}>{fmtText(project.pm_requirements)}</span>,
            <TextArea
              value={draft?.pm_requirements || ''}
              autoSize={{ minRows: 2, maxRows: 6 }}
              onChange={(e) => setField('pm_requirements', e.target.value)}
            />,
          )}
        </Descriptions.Item>
        <Descriptions.Item label="언어 요건">
          {viewOrInput('language_requirements',
            fmtText(project.language_requirements),
            <Input
              value={draft?.language_requirements || ''}
              placeholder="예: 영어 업무 가능자"
              onChange={(e) => setField('language_requirements', e.target.value)}
            />,
          )}
        </Descriptions.Item>
        <Descriptions.Item label="특이사항">
          {viewOrInput('special_notes',
            <span style={{ whiteSpace: 'pre-wrap' }}>{fmtText(project.special_notes)}</span>,
            <TextArea
              value={draft?.special_notes || ''}
              autoSize={{ minRows: 2, maxRows: 6 }}
              onChange={(e) => setField('special_notes', e.target.value)}
            />,
          )}
        </Descriptions.Item>
        <Descriptions.Item label="공고문 URL">
          {viewOrInput('announcement_url',
            project.announcement_url ? (
              <a href={project.announcement_url} target="_blank" rel="noopener noreferrer">
                <LinkOutlined /> {project.announcement_url}
              </a>
            ) : '-',
            <Input
              value={draft?.announcement_url || ''}
              placeholder="https://..."
              onChange={(e) => setField('announcement_url', e.target.value)}
            />,
          )}
        </Descriptions.Item>
        <Descriptions.Item label="설명(내부 메모)">
          {viewOrInput('description',
            <span style={{ whiteSpace: 'pre-wrap' }}>{fmtText(project.description)}</span>,
            <TextArea
              value={draft?.description || ''}
              autoSize={{ minRows: 2, maxRows: 6 }}
              onChange={(e) => setField('description', e.target.value)}
            />,
          )}
        </Descriptions.Item>
        <Descriptions.Item label="상태">
          {viewOrInput('status',
            <Tag color={{ 제안: 'blue', 수행: 'green', 종료: 'gray' }[project.status]}>{project.status}</Tag>,
            <Select
              value={draft?.status}
              style={{ width: 140 }}
              onChange={(v) => setField('status', v)}
              options={ALL_STATUSES.map((s) => ({ value: s, label: s }))}
            />,
          )}
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );

  // ─── 파일 첨부 ───
  const filesCard = (
    <Card title="📎 파일 첨부" size="small">
      <Upload
        customRequest={async ({ file, onSuccess, onError }) => {
          const fd = new FormData();
          fd.append('file', file);
          try {
            const res = await api.post(
              `/projects/${id}/files`, fd,
              { params: { uploaded_by: userId },
                headers: { 'Content-Type': 'multipart/form-data' } },
            );
            onSuccess(res.data, file);
            fetchFiles();
            message.success('업로드 완료');
          } catch (err) {
            onError(err);
            message.error('업로드 실패');
          }
        }}
        showUploadList={false}
      >
        <Button icon={<UploadOutlined />}>파일 선택</Button>
      </Upload>

      <List
        size="small"
        style={{ marginTop: 12 }}
        dataSource={files}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="첨부 파일이 없어요." /> }}
        renderItem={(f) => (
          <List.Item
            actions={[
              <Button
                key="del"
                danger size="small" type="text" icon={<DeleteOutlined />}
                onClick={() => deleteFile(f.id)}
              />,
            ]}
          >
            <Space size={8} style={{ width: '100%' }}>
              <FileOutlined />
              <div style={{ flex: 1, minWidth: 0 }}>
                <Text strong style={{ fontSize: 13 }}>{f.filename}</Text>
                <div style={{ fontSize: 11, color: '#999' }}>
                  {formatBytes(f.filesize)} · {f.uploaded_by_name || '-'} · {f.created_at ? dayjs(f.created_at).format('YYYY-MM-DD HH:mm') : '-'}
                </div>
              </div>
            </Space>
          </List.Item>
        )}
      />
    </Card>
  );

  // ─── 변경이력 / 댓글 ───
  const commentsCard = (
    <Card title="💬 변경이력 / 댓글" size="small">
      <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
        <TextArea
          value={commentInput}
          onChange={(e) => setCommentInput(e.target.value)}
          placeholder="댓글을 입력하세요..."
          autoSize={{ minRows: 1, maxRows: 4 }}
        />
        <Button
          type="primary" icon={<SendOutlined />}
          loading={posting} onClick={submitComment}
          disabled={!commentInput.trim()}
        >
          등록
        </Button>
      </Space.Compact>

      <List
        size="small"
        dataSource={comments}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="아직 댓글이 없어요." /> }}
        renderItem={(c) => {
          const isAuto = c.comment_type === 'auto';
          return (
            <List.Item style={{ borderBottom: '1px solid #f5f5f5', padding: '10px 0' }}>
              <List.Item.Meta
                avatar={
                  <Avatar
                    size="small"
                    icon={isAuto ? <RobotOutlined /> : <UserOutlined />}
                    style={{ background: isAuto ? '#bfbfbf' : '#1677ff' }}
                  />
                }
                title={
                  <Space size={6}>
                    <Text strong style={{ fontSize: 12, color: isAuto ? '#999' : undefined }}>
                      {c.user_name || (isAuto ? '시스템' : '익명')}
                    </Text>
                    {isAuto && <Tag color="default" style={{ marginRight: 0, fontSize: 10 }}>자동</Tag>}
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {c.created_at ? dayjs(c.created_at).format('YYYY-MM-DD HH:mm') : ''}
                    </Text>
                  </Space>
                }
                description={
                  <span style={{
                    color: isAuto ? '#999' : '#333',
                    fontStyle: isAuto ? 'italic' : 'normal',
                    fontSize: 13,
                  }}>
                    {c.content}
                  </span>
                }
              />
            </List.Item>
          );
        }}
      />
    </Card>
  );

  // ─── 개요 탭용: 프로젝트 멤버 카드 ───
  const membersOverviewCard = (
    <Card
      size="small"
      title={<Space><TeamOutlined /><Text strong>👥 프로젝트 멤버 ({members.length}명)</Text></Space>}
      extra={
        <Button
          size="small"
          icon={<TeamOutlined />}
          onClick={() => navigate(`/projects/${id}/members`, { state: { from: location.state?.from } })}
        >
          멤버 관리
        </Button>
      }
    >
      {members.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="등록된 멤버가 없어요." />
      ) : (
        <Space wrap size={[8, 8]}>
          {members.map((m) => {
            const badge = m.project_role === 'PM' ? '👑 ' : m.project_role === 'PL' ? '⭐ ' : '';
            const color = m.project_role === 'PM' ? 'gold'
              : m.project_role === 'PL' ? 'blue'
              : m.project_role === 'PAO' ? 'cyan' : 'default';
            return (
              <Tag
                key={m.user_id}
                color={color}
                style={{ cursor: 'pointer', padding: '4px 10px', margin: 0 }}
                onClick={() => setViewingUserId(m.user_id)}
              >
                <strong>{badge}{m.user_name || m.name || `#${m.user_id}`}</strong>
                {m.project_role && (
                  <span style={{ marginLeft: 4, opacity: 0.75 }}>· {m.project_role}</span>
                )}
              </Tag>
            );
          })}
        </Space>
      )}
    </Card>
  );

  // ─── 탭1: 개요 ───
  const overviewTab = (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      {pipelineStageCard}
      {editToolbar}
      {basicInfoCard}
      {membersOverviewCard}
      {scheduleCard}
      {contractCard}
      {evalCard}
      {contentCard}
      {filesCard}
      {commentsCard}
    </Space>
  );

  // ─── 탭2: WBS/간트 ───
  const wbsTab = (
    <>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title="전체 진척률" value={Math.round(overallProgress * 100)} suffix="%" />
            <Progress percent={Math.round(overallProgress * 100)} style={{ marginTop: 8 }} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Row gutter={8}>
              <Col span={8}><Statistic title="완료" value={completedCount} valueStyle={{ color: '#52c41a' }} /></Col>
              <Col span={8}><Statistic title="진행중" value={inProgressCount} valueStyle={{ color: '#fa8c16' }} /></Col>
              <Col span={8}><Statistic title="대기" value={pendingCount} valueStyle={{ color: '#8c8c8c' }} /></Col>
            </Row>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title="전체 WBS 항목" value={wbsItems.length} suffix="개" />
            <Button type="primary" style={{ marginTop: 8 }} block onClick={() => navigate(`/projects/${id}/gantt`, { state: { from: location.state?.from } })}>
              간트차트 열기
            </Button>
          </Card>
        </Col>
      </Row>
      <Card>
        <Title level={5} style={{ marginBottom: 16 }}>WBS 현황</Title>
        <Table dataSource={wbsItems} columns={wbsColumns} rowKey="id" scroll={{ x: 1200 }} size="small" pagination={false} />
      </Card>
    </>
  );

  // ─── 탭3: 멤버 ───
  const memberTab = (
    <Card
      size="small"
      title={<Space><TeamOutlined /><Text strong>참여 멤버 ({members.length}명)</Text></Space>}
      extra={
        <Button icon={<TeamOutlined />} onClick={() => navigate(`/projects/${id}/members`, { state: { from: location.state?.from } })}>
          멤버 관리
        </Button>
      }
    >
      <List
        dataSource={members}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="등록된 멤버가 없어요." /> }}
        renderItem={(m) => (
          <List.Item>
            <List.Item.Meta
              avatar={<Avatar icon={<UserOutlined />} />}
              title={
                <Space>
                  <Text strong>{m.user_name || m.name || `User #${m.user_id}`}</Text>
                  {m.project_role && <Tag color="blue" style={{ marginRight: 0 }}>{m.project_role}</Tag>}
                  {m.position && <Tag style={{ marginRight: 0 }}>{m.position}</Tag>}
                </Space>
              }
              description={m.email || ''}
            />
          </List.Item>
        )}
      />
    </Card>
  );

  // ─── 탭4: 업무보고 ───
  const reportTab = (
    <Card size="small" title="📊 업무보고">
      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        <Text type="secondary">이 프로젝트의 진척/일정조정/완료 보고를 작성하거나 검토할 수 있어요.</Text>
        <Space wrap>
          <Button type="primary" onClick={() => navigate('/reports')}>보고 요청 작성</Button>
          <Button onClick={() => navigate('/reports/review')}>보고 검토</Button>
        </Space>
      </Space>
    </Card>
  );

  return (
    <>
      <Button icon={<ArrowLeftOutlined />} onClick={handleGoBack} style={{ marginBottom: 16 }}>
        목록으로
      </Button>

      <Card style={{ marginBottom: 16 }} styles={{ body: { padding: 16 } }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          gap: 8, flexWrap: 'wrap',
        }}>
          <div>
            <Space size={8} wrap>
              <Title level={4} style={{ margin: 0 }}>{project.name}</Title>
              <Tag color={STAGE_COLOR[project.pipeline_stage] || 'default'}>
                {project.pipeline_stage || DEFAULT_STAGE}
              </Tag>
              <Tag color={{ 제안: 'blue', 수행: 'green', 종료: 'gray' }[project.status]}>
                {project.status}
              </Tag>
            </Space>
            <div style={{ marginTop: 4 }}>
              <Text type="secondary">
                사업기간: {project.start_date && project.end_date ? `${project.start_date} ~ ${project.end_date}` : '미설정'}
                {project.client && <> · 발주기관: {project.client}</>}
                {project.pm_name && <> · PM: {project.pm_name}</>}
              </Text>
            </div>
          </div>
          <Popconfirm
            title="프로젝트 삭제"
            description={`'${project.name}' 및 모든 WBS/댓글/파일을 삭제합니다. 되돌릴 수 없어요.`}
            okText="삭제"
            okButtonProps={{ danger: true }}
            cancelText="취소"
            onConfirm={() => {
              api.delete(`/projects/${id}`)
                .then(() => {
                  message.success('프로젝트가 삭제됐어요');
                  navigate(location.state?.from || '/projects');
                })
                .catch(() => message.error('삭제에 실패했어요'));
            }}
          >
            <Button danger icon={<DeleteOutlined />}>삭제</Button>
          </Popconfirm>
        </div>
      </Card>

      <Tabs
        activeKey={activeTab}
        onChange={(key) => {
          setActiveTab(key);
          if (key === 'wbs') fetchWbs();
        }}
        items={[
          { key: 'overview', label: '개요',     children: overviewTab },
          { key: 'wbs',      label: 'WBS/간트', children: wbsTab },
          { key: 'members',  label: '멤버',     children: memberTab },
          { key: 'reports',  label: '업무보고',  children: reportTab },
        ]}
      />

      <UserProfileModal
        userId={viewingUserId}
        onClose={() => setViewingUserId(null)}
        currentUserRole={me?.role}
      />

      <Modal
        open={pmPickerOpen}
        title="수행 PM을 지정해주세요"
        onCancel={() => setPmPickerOpen(false)}
        okText="확인하고 수주 확정"
        cancelText="닫기"
        onOk={() => {
          if (!pickedPmId) {
            message.warning('PM을 선택해주세요. (건너뛰기로 진행할 수 있어요.)');
            return;
          }
          updateField({ pipeline_stage: '수주', pm_id: pickedPmId });
          setPmPickerOpen(false);
        }}
        footer={[
          <Button
            key="skip"
            onClick={() => {
              updateField({ pipeline_stage: '수주' });
              setPmPickerOpen(false);
            }}
          >
            건너뛰기 (나중에 지정)
          </Button>,
          <Button key="cancel" onClick={() => setPmPickerOpen(false)}>닫기</Button>,
          <Button
            key="ok"
            type="primary"
            disabled={!pickedPmId}
            onClick={() => {
              updateField({ pipeline_stage: '수주', pm_id: pickedPmId });
              setPmPickerOpen(false);
            }}
          >
            확인하고 수주 확정
          </Button>,
        ]}
      >
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
          수행 단계로 진입하기 전에 PM을 확정해주세요.
        </Text>
        <Select
          style={{ width: '100%' }}
          value={pickedPmId}
          onChange={setPickedPmId}
          placeholder="멤버에서 선택"
          options={members.map((m) => ({
            value: m.user_id,
            label: `${m.user_name || m.name || `User #${m.user_id}`}${m.project_role ? ` · ${m.project_role}` : ''}`,
          }))}
          notFoundContent="등록된 멤버가 없어요. 멤버를 먼저 추가해주세요."
        />
      </Modal>
    </>
  );
}

// ─── 유저 프로필 모달 ───
function UserProfileModal({ userId, onClose, currentUserRole }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) { setUser(null); return; }
    setLoading(true);
    api.get(`/users/${userId}`)
      .then((res) => setUser(res.data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [userId]);

  const canViewDetail = currentUserRole === 'admin' || currentUserRole === 'manager';
  const roleLabel = { admin: '관리자', manager: '매니저', user: '일반' };

  return (
    <Modal
      open={userId != null}
      onCancel={onClose}
      footer={null}
      title={user ? `${user.name} 정보` : '유저 정보'}
      width={480}
      destroyOnClose
    >
      <Spin spinning={loading}>
        {user ? (
          <>
            <Descriptions column={1} size="small" bordered labelStyle={{ width: 100 }}>
              <Descriptions.Item label="소속 본부">{user.organization_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="직위">{user.position || '-'}</Descriptions.Item>
              <Descriptions.Item label="이메일">{user.email}</Descriptions.Item>
            </Descriptions>

            <Divider orientation="left" style={{ marginTop: 16, marginBottom: 8, fontSize: 13 }}>
              상세 정보
            </Divider>
            {canViewDetail ? (
              <Descriptions column={1} size="small" bordered labelStyle={{ width: 100 }}>
                <Descriptions.Item label="system 역할">
                  <Tag color={currentUserRole === 'admin' ? 'red' : 'blue'}>
                    {roleLabel[user.role] || user.role}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="프로젝트 역할">{user.project_role || '-'}</Descriptions.Item>
                <Descriptions.Item label="본부 관리자">
                  <Tag color={user.is_org_admin ? 'gold' : 'default'}>
                    {user.is_org_admin ? '예' : '아니오'}
                  </Tag>
                </Descriptions.Item>
              </Descriptions>
            ) : (
              <div style={{
                padding: '16px', textAlign: 'center', color: '#999',
                background: '#fafafa', borderRadius: 4, fontSize: 13,
              }}>
                🔒 열람 권한이 없습니다
              </div>
            )}
          </>
        ) : !loading && (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="유저 정보를 불러오지 못했어요" />
        )}
      </Spin>
    </Modal>
  );
}
