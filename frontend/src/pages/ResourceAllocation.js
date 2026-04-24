import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Typography, Card, Button, Select, Spin, Empty, Tooltip, Tag, Space, message,
} from 'antd';
import {
  LeftOutlined, RightOutlined, CalendarOutlined,
} from '@ant-design/icons';
import api from '../api/axios';
import WBSDetailModal from '../components/WBSDetailModal';

const { Title, Text } = Typography;

// ===== 상수 =====
const DAY_WIDTH = 30;
const CARD_WIDTH = 200;
const ROW_HEIGHT = 36;
const MIN_USER_HEIGHT = 80;

const BAR_COLORS = {
  proposal:         { bg: '#bfbfbf', text: '#262626', border: '#8c8c8c' }, // 검토/제안 회색
  execution_active: { bg: '#1677ff', text: '#ffffff', border: '#0958d9' }, // 수행 파랑
  execution_done:   { bg: '#52c41a', text: '#ffffff', border: '#389e0d' }, // 완료(종료) 초록
};

// ===== 날짜 유틸 =====
const isWeekend = (d) => { const w = d.getDay(); return w === 0 || w === 6; };
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const todayISO = () => ymd(new Date());
const parseISO = (s) => new Date(s + 'T00:00:00');

const getYearDays = (year) => {
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  const days = [];
  const d = new Date(start);
  while (d <= end) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
};

const dateToOffset = (dateObj, yearStart) =>
  Math.floor((dateObj - yearStart) / (1000 * 60 * 60 * 24));

// 바 겹침 배치: 시작일 기준 정렬, 빈 행 찾기 (없으면 새 행 추가)
const layoutBars = (bars) => {
  const sorted = [...bars].sort((a, b) => parseISO(a.start_date) - parseISO(b.start_date));
  const rows = [];
  sorted.forEach((bar) => {
    const barStart = parseISO(bar.start_date);
    let placed = false;
    for (const row of rows) {
      const lastBar = row[row.length - 1];
      const lastEnd = parseISO(lastBar.end_date);
      if (barStart > lastEnd) {
        row.push(bar);
        placed = true;
        break;
      }
    }
    if (!placed) rows.push([bar]);
  });
  return rows;
};

const getBarColor = (bar) => {
  if (bar.group === 'proposal') return BAR_COLORS.proposal;
  if (bar.status === '종료') return BAR_COLORS.execution_done;
  return BAR_COLORS.execution_active;
};

// ===== 컴포넌트 =====
export default function ResourceAllocation({ user }) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState({ users: [], workdays: 0 });
  const [departmentId, setDepartmentId] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(false);

  const [wbsTarget, setWbsTarget] = useState(null);
  const [wbsProject, setWbsProject] = useState(null);
  const [wbsMembers, setWbsMembers] = useState([]);

  const scrollRef = useRef(null);
  const isAdmin = user?.role === 'admin';

  // ===== API =====
  const fetchOrgs = useCallback(async () => {
    try {
      const res = await api.get('/organizations');
      setOrgs(res.data || []);
    } catch { setOrgs([]); }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { year };
      if (departmentId) params.department_id = departmentId;
      const res = await api.get('/resource-allocation', { params });
      setData(res.data || { users: [], workdays: 0 });
    } catch (e) {
      message.error(e?.response?.data?.detail || '조회에 실패했어요');
      setData({ users: [], workdays: 0 });
    } finally {
      setLoading(false);
    }
  }, [year, departmentId]);

  useEffect(() => { fetchOrgs(); }, [fetchOrgs]);
  useEffect(() => { fetchData(); }, [fetchData]);

  // ===== 파생 =====
  const days = useMemo(() => getYearDays(year), [year]);
  const yearStart = useMemo(() => new Date(year, 0, 1), [year]);
  const totalWidth = days.length * DAY_WIDTH;

  const todayStr = todayISO();
  const todayOffsetDays = useMemo(() => {
    const now = new Date();
    if (now.getFullYear() !== year) return -1;
    return dateToOffset(now, yearStart);
  }, [year, yearStart]);

  const months = useMemo(() => {
    const arr = [];
    for (let m = 0; m < 12; m++) {
      const last = new Date(year, m + 1, 0);
      arr.push({ index: m, name: `${m + 1}월`, days: last.getDate(), width: last.getDate() * DAY_WIDTH });
    }
    return arr;
  }, [year]);

  const deptOptions = useMemo(
    () => orgs.filter((o) => o.parent_id != null && !o.project_id)
              .map((o) => ({ value: o.id, label: o.name })),
    [orgs],
  );

  // 유저별 레이아웃 (바 배치 + 행 수 계산)
  const usersLayout = useMemo(() => {
    return (data.users || []).map((u) => {
      const bars = u.project_bars || [];
      const proposalBars = bars.filter((b) => b.group === 'proposal');
      const executionBars = bars.filter((b) => b.group !== 'proposal');
      const proposalRows = layoutBars(proposalBars);
      const executionRows = layoutBars(executionBars);
      const totalRows = proposalRows.length + executionRows.length;
      const rowHeight = Math.max(totalRows * ROW_HEIGHT + 16, MIN_USER_HEIGHT);
      return { user: u, proposalRows, executionRows, rowHeight };
    });
  }, [data]);

  // ===== 네비게이션 =====
  const goPrev = () => setYear(year - 1);
  const goNext = () => setYear(year + 1);
  const goToday = () => setYear(currentYear);

  // ===== 오늘로 자동 스크롤 =====
  useEffect(() => {
    if (!scrollRef.current) return;
    if (todayOffsetDays < 0) {
      scrollRef.current.scrollLeft = 0;
      return;
    }
    const targetLeft = todayOffsetDays * DAY_WIDTH;
    scrollRef.current.scrollLeft = Math.max(0, targetLeft - 300);
  }, [year, todayOffsetDays, data]);

  // ===== 바 클릭 → 모달 =====
  const openBar = async (bar) => {
    try {
      const [pRes, mRes] = await Promise.all([
        api.get(`/projects/${bar.project_id}`),
        api.get(`/projects/${bar.project_id}/members`),
      ]);
      setWbsProject(pRes.data || null);
      setWbsMembers(mRes.data || []);
    } catch {
      setWbsProject(null);
      setWbsMembers([]);
    }
    setWbsTarget({
      id: bar.wbs_id,
      title: bar.wbs_title,
      wbs_number: bar.wbs_number,
      project_id: bar.project_id,
      project_name: bar.project_name,
    });
  };

  const onModalUpdate = async () => { await fetchData(); };

  // ===== 바 렌더 =====
  const renderBar = (bar, rowIdx, sectionOffsetRows) => {
    const barStart = parseISO(bar.start_date);
    const barEnd = parseISO(bar.end_date);
    const startOffset = dateToOffset(barStart, yearStart);
    const endOffset = dateToOffset(barEnd, yearStart);
    const width = Math.max((endOffset - startOffset + 1) * DAY_WIDTH - 2, DAY_WIDTH - 2);
    const left = startOffset * DAY_WIDTH + 1;
    const top = (sectionOffsetRows + rowIdx) * ROW_HEIGHT + 4;
    const color = getBarColor(bar);
    return (
      <Tooltip
        key={`${bar.wbs_id}-${bar.project_id}-${bar.start_date}`}
        title={
          <div style={{ fontSize: 12 }}>
            <div style={{ fontWeight: 600 }}>{bar.project_name}</div>
            <div>{bar.wbs_number ? `${bar.wbs_number} · ` : ''}{bar.wbs_title}</div>
            <div style={{ fontSize: 11, opacity: 0.85 }}>
              {bar.start_date} ~ {bar.end_date} · {bar.md_days}MD · {bar.status}
              {bar.pipeline_stage ? ` / ${bar.pipeline_stage}` : ''}
            </div>
          </div>
        }
      >
        <div
          onClick={() => openBar(bar)}
          style={{
            position: 'absolute', left, top, width, height: ROW_HEIGHT - 8,
            background: color.bg, color: color.text,
            border: `1px solid ${color.border}`,
            borderRadius: 4,
            padding: '2px 6px',
            fontSize: 11, lineHeight: 1.4,
            cursor: 'pointer',
            overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
            zIndex: 1,
          }}
        >
          <span style={{ fontWeight: 600 }}>{bar.project_name}</span>
          <span> / {bar.wbs_title}</span>
          <span style={{ opacity: 0.85 }}> · {bar.md_days}MD</span>
        </div>
      </Tooltip>
    );
  };

  // ===== 렌더 =====
  return (
    <>
      {/* 툴바 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <Title level={4} style={{ margin: 0 }}>👥 인력 운용 현황</Title>
        <Space>
          <Button icon={<LeftOutlined />} onClick={goPrev} />
          <span style={{ fontSize: 16, fontWeight: 600, minWidth: 70, textAlign: 'center' }}>{year}년</span>
          <Button icon={<RightOutlined />} onClick={goNext} />
          <Button icon={<CalendarOutlined />} onClick={goToday}>오늘</Button>
        </Space>
        {isAdmin && (
          <Select
            allowClear placeholder="전체 본부"
            style={{ width: 220 }}
            value={departmentId}
            onChange={(v) => setDepartmentId(v ?? null)}
            options={deptOptions}
          />
        )}
        <Space size={10} style={{ marginLeft: 'auto', fontSize: 12 }}>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, background: BAR_COLORS.proposal.bg, marginRight: 4, verticalAlign: 'middle' }} />검토/제안</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, background: BAR_COLORS.execution_active.bg, marginRight: 4, verticalAlign: 'middle' }} />수행</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, background: BAR_COLORS.execution_done.bg, marginRight: 4, verticalAlign: 'middle' }} />완료</span>
          <span style={{ color: '#ff4d4f' }}><span style={{ display: 'inline-block', width: 2, height: 12, background: '#ff4d4f', marginRight: 4, verticalAlign: 'middle' }} />오늘</span>
        </Space>
      </div>

      <Card size="small" styles={{ body: { padding: 0 } }}>
        <Spin spinning={loading}>
          {(!data.users || data.users.length === 0) ? (
            <Empty description="조회할 인력이 없어요." style={{ padding: 40 }} />
          ) : (
            <div
              ref={scrollRef}
              style={{ overflow: 'auto', maxHeight: 'calc(100vh - 180px)', position: 'relative' }}
            >
              {/* 헤더 (sticky top) */}
              <div style={{
                display: 'flex',
                position: 'sticky', top: 0, zIndex: 3,
                background: '#fff', borderBottom: '1px solid #d9d9d9',
              }}>
                <div style={{
                  position: 'sticky', left: 0, zIndex: 4,
                  width: CARD_WIDTH, minWidth: CARD_WIDTH,
                  background: '#fafafa',
                  borderRight: '1px solid #d9d9d9',
                  padding: '8px 12px', fontWeight: 600, fontSize: 13,
                  display: 'flex', alignItems: 'center',
                }}>
                  이름
                </div>
                <div style={{ width: totalWidth, flexShrink: 0 }}>
                  {/* 월 */}
                  <div style={{ display: 'flex', borderBottom: '1px solid #f0f0f0' }}>
                    {months.map((m) => (
                      <div
                        key={m.index}
                        style={{
                          width: m.width, textAlign: 'center',
                          padding: '4px 0',
                          borderRight: '1px solid #e8e8e8',
                          fontSize: 12, fontWeight: 600, background: '#fff',
                        }}
                      >
                        {m.name}
                      </div>
                    ))}
                  </div>
                  {/* 일 */}
                  <div style={{ display: 'flex' }}>
                    {days.map((d, idx) => {
                      const weekend = isWeekend(d);
                      const today = ymd(d) === todayStr;
                      return (
                        <div
                          key={idx}
                          style={{
                            width: DAY_WIDTH, minWidth: DAY_WIDTH,
                            textAlign: 'center', padding: '2px 0',
                            fontSize: 10,
                            background: today ? '#fffbe6' : weekend ? '#fafafa' : '#fff',
                            color: d.getDay() === 0 ? '#cf1322' : d.getDay() === 6 ? '#1677ff' : '#595959',
                            borderRight: d.getDate() === 1 ? '1px solid #e8e8e8' : '1px solid #f5f5f5',
                          }}
                        >
                          {d.getDate()}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 본문 */}
              <div style={{ position: 'relative' }}>
                {/* 오늘 세로선 (본문 높이 전체) */}
                {todayOffsetDays >= 0 && (
                  <div style={{
                    position: 'absolute',
                    left: CARD_WIDTH + todayOffsetDays * DAY_WIDTH,
                    top: 0, bottom: 0,
                    width: 2, background: '#ff4d4f',
                    zIndex: 5, pointerEvents: 'none',
                  }} />
                )}

                {usersLayout.map(({ user: u, proposalRows, executionRows, rowHeight }) => (
                  <div
                    key={u.user_id}
                    style={{
                      display: 'flex',
                      borderBottom: '1px solid #f0f0f0',
                      minHeight: rowHeight,
                    }}
                  >
                    {/* 명함 */}
                    <div style={{
                      position: 'sticky', left: 0, zIndex: 2,
                      width: CARD_WIDTH, minWidth: CARD_WIDTH,
                      background: '#fff',
                      borderRight: '1px solid #d9d9d9',
                      padding: '12px 14px',
                      display: 'flex', flexDirection: 'column', justifyContent: 'center',
                    }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: '#262626' }}>
                        {u.name}
                        {u.is_external && (
                          <Tag color="orange" style={{ marginLeft: 6, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>
                            외부 인원
                          </Tag>
                        )}
                      </div>
                      {u.position && (
                        <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 2 }}>{u.position}</div>
                      )}
                      <div style={{
                        fontSize: 12, color: '#8c8c8c', marginTop: 2,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {u.organization_name || '-'}
                      </div>
                    </div>

                    {/* 타임라인 영역 */}
                    <div style={{
                      position: 'relative',
                      width: totalWidth, flexShrink: 0,
                      minHeight: rowHeight,
                      padding: '4px 0',
                    }}>
                      {/* 상단: 검토/제안 */}
                      {proposalRows.map((row, rowIdx) =>
                        row.map((bar) => renderBar(bar, rowIdx, 0))
                      )}
                      {/* 구분선 */}
                      {proposalRows.length > 0 && executionRows.length > 0 && (
                        <div style={{
                          position: 'absolute',
                          left: 0, right: 0,
                          top: proposalRows.length * ROW_HEIGHT + 4,
                          height: 0,
                          borderTop: '1px dashed #d9d9d9',
                        }} />
                      )}
                      {/* 하단: 수행/완료 */}
                      {executionRows.map((row, rowIdx) =>
                        row.map((bar) => renderBar(bar, rowIdx, proposalRows.length))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Spin>
      </Card>

      {/* WBS 상세 모달 */}
      <WBSDetailModal
        visible={!!wbsTarget}
        wbsItem={wbsTarget}
        project={wbsProject}
        currentUser={user}
        members={wbsMembers}
        defaultTab="기본정보"
        onClose={() => setWbsTarget(null)}
        onUpdate={onModalUpdate}
      />
    </>
  );
}
