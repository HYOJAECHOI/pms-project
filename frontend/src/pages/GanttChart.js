import React, { useEffect, useState, useRef } from 'react';
import { Layout, Typography, Button, Select, Card, Tag, message, Tooltip, Modal, Form, Input, InputNumber, DatePicker, Slider, Divider, Spin, Popover, List, Badge, Empty } from 'antd';
import { ArrowLeftOutlined, DownloadOutlined, UploadOutlined, PlusOutlined, PlusSquareOutlined, MinusSquareOutlined, WarningOutlined, PaperClipOutlined, DeleteOutlined, FileOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import api from '../api/axios';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import dayjs from 'dayjs';

const { Content } = Layout;
const { Title } = Typography;

const ROW_HEIGHT = 44;
const PLAN_BAR_TOP = 6;
const PLAN_BAR_H = 13;
const ACTUAL_BAR_TOP = 22;
const ACTUAL_BAR_H = 11;
const HIDDEN_COL_W = 16;
const HEADER_HEIGHT = 78;


const INIT_COLS = [
  { key: 'wbs_number', label: '구분', width: 60 },
  { key: 'title', label: '작업명', width: 200 },
  { key: 'assignee_name', label: '담당자', width: 70 },
  { key: 'plan_start_date', label: '시작일(계획)', width: 95 },
  { key: 'plan_end_date', label: '완료일(계획)', width: 95 },
  { key: 'days', label: '일수', width: 40 },
  { key: 'actual_progress', label: '진척률', width: 55 },
  { key: 'status', label: '상태', width: 65 },
  { key: 'deliverable_files', label: '산출물', width: 80 },
];

const levelColors = { 1: '#722ed1', 2: '#1677ff', 3: '#13c2c2', 4: '#52c41a' };
const statusColors = { '대기': '#d9d9d9', '진행중': '#faad14', '완료': '#52c41a', '지연': '#ff4d4f' };

const findParentByWbsNumber = (wbsNumber, allItems) => {
  if (!wbsNumber) return null;
  const parts = wbsNumber.split('.');
  if (parts.length <= 1) return null;
  const parentNumber = parts.slice(0, -1).join('.');
  return allItems.find(w => w.wbs_number === parentNumber) || null;
};

const getLevelFromWbsNumber = (wbsNumber) => {
  if (!wbsNumber) return 1;
  return wbsNumber.split('.').length;
};

export default function GanttChart() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const currentUserId = (() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}').id; } catch { return null; }
  })();

  // WBS별 파일 맵 — 행 Popover 열릴 때 lazy 로드
  const [wbsFileMap, setWbsFileMap] = useState({});     // { [wbs_id]: [file, ...] | undefined }
  // 업로드 대상 WBS id (hidden file input의 currentTarget 역할)
  const [uploadTargetWbsId, setUploadTargetWbsId] = useState(null);
  const wbsFileInputRef = useRef(null);

  const loadWbsFiles = async (wbsId) => {
    try {
      const res = await api.get(`/wbs/${wbsId}/files`);
      setWbsFileMap((prev) => ({ ...prev, [wbsId]: res.data || [] }));
    } catch {
      setWbsFileMap((prev) => ({ ...prev, [wbsId]: [] }));
    }
  };

  const uploadWbsFile = async (wbsId, file) => {
    const fd = new FormData();
    fd.append('file', file);
    try {
      await api.post(`/wbs/${wbsId}/files`, fd, {
        params: { uploaded_by: currentUserId },
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await loadWbsFiles(wbsId);
      message.success('업로드 완료');
    } catch {
      message.error('업로드 실패');
    }
  };

  const deleteWbsFile = async (wbsId, fileId) => {
    try {
      await api.delete(`/wbs/files/${fileId}`);
      await loadWbsFiles(wbsId);
      message.success('삭제됐어요');
    } catch {
      message.error('삭제에 실패했어요');
    }
  };

  const downloadWbsFile = async (fileRecord) => {
    try {
      const res = await api.get(`/wbs/files/${fileRecord.id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileRecord.filename || 'download';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      message.error('다운로드에 실패했어요');
    }
  };

  const handleWbsFilePicked = (e) => {
    const file = e.target.files?.[0];
    if (file && uploadTargetWbsId != null) {
      uploadWbsFile(uploadTargetWbsId, file);
    }
    // input 초기화 (같은 파일 다시 선택 가능하도록)
    e.target.value = '';
    setUploadTargetWbsId(null);
  };

  const triggerWbsFileUpload = (wbsId) => {
    setUploadTargetWbsId(wbsId);
    // state set 뒤에 바로 클릭하면 반영이 안 될 수 있어 micro-task에 밀어줌
    setTimeout(() => wbsFileInputRef.current?.click(), 0);
  };

  // 사업 시작일 범위 확장 확인
  const confirmExtendProjectStart = (wbsStart) => new Promise((resolve) => {
    if (!project?.start_date || !wbsStart || wbsStart >= project.start_date) { resolve(false); return; }
    const diffDays = dayjs(project.start_date).diff(dayjs(wbsStart), 'day');
    Modal.confirm({
      title: '사업 시작일 조정',
      content: `WBS가 사업 시작일보다 ${diffDays}일 앞서 시작해요. 사업 시작일을 ${wbsStart}로 당길까요?`,
      okText: '당기기',
      cancelText: '유지',
      onOk: async () => {
        try {
          await api.put(`/projects/${id}`, null, { params: { start_date: wbsStart, user_id: currentUserId } });
          setProject((prev) => (prev ? { ...prev, start_date: wbsStart } : prev));
          message.success(`사업 시작일이 ${wbsStart}로 조정됐어요.`);
          resolve(true);
        } catch {
          message.error('사업 시작일 조정에 실패했어요');
          resolve(false);
        }
      },
      onCancel: () => resolve(false),
    });
  });

  // 사업 종료일 범위 확장 확인
  const confirmExtendProjectEnd = (wbsEnd) => new Promise((resolve) => {
    if (!project?.end_date || !wbsEnd || wbsEnd <= project.end_date) { resolve(false); return; }
    const diffDays = dayjs(wbsEnd).diff(dayjs(project.end_date), 'day');
    Modal.confirm({
      title: '사업 종료일 조정',
      content: `WBS가 사업 종료일보다 ${diffDays}일 초과해요. 사업 종료일을 ${wbsEnd}로 연장할까요?`,
      okText: '연장',
      cancelText: '유지',
      onOk: async () => {
        try {
          await api.put(`/projects/${id}`, null, { params: { end_date: wbsEnd, user_id: currentUserId } });
          setProject((prev) => (prev ? { ...prev, end_date: wbsEnd } : prev));
          message.success(`사업 종료일이 ${wbsEnd}로 조정됐어요.`);
          resolve(true);
        } catch {
          message.error('사업 종료일 조정에 실패했어요');
          resolve(false);
        }
      },
      onCancel: () => resolve(false),
    });
  });

  // WBS 변경 후 project 범위 초과 확인 (plan + actual 모두)
  const checkProjectRangeOverflow = async ({ planStart, planEnd, actualStart, actualEnd } = {}) => {
    const starts = [planStart, actualStart].filter(Boolean).sort();
    const ends   = [planEnd, actualEnd].filter(Boolean).sort();
    const minStart = starts[0];
    const maxEnd   = ends[ends.length - 1];
    if (minStart) await confirmExtendProjectStart(minStart);
    if (maxEnd)   await confirmExtendProjectEnd(maxEnd);
  };

  const [project, setProject] = useState(null);
  const [wbsItems, setWbsItems] = useState([]);
  const [members, setMembers] = useState([]);
  const [dates, setDates] = useState([]);
  const [cellWidth, setCellWidth] = useState(18);
  const [colWidths, setColWidths] = useState(
    INIT_COLS.reduce((acc, col) => ({ ...acc, [col.key]: col.width }), {})
  );
  const [stickyKeys, setStickyKeys] = useState(['wbs_number', 'title', 'assignee_name']);
  const [hiddenCols, setHiddenCols] = useState([]);
  const [collapsedIds, setCollapsedIds] = useState(new Set());
  const [contextMenu, setContextMenu] = useState(null);
  const [ganttContextMenu, setGanttContextMenu] = useState(null);
  const [editingCell, setEditingCell] = useState(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [parentForAdd, setParentForAdd] = useState(null);
  const [addForm] = Form.useForm();
  const scrollRef = useRef(null);
  const headerRef = useRef(null);
  const [editForm] = Form.useForm();

  useEffect(() => { fetchAll(); }, [id]);

  useEffect(() => {
  const body = scrollRef.current;
  const header = headerRef.current;
  if (!body || !header) return;
  const syncHeader = () => { header.scrollLeft = body.scrollLeft; };
  body.addEventListener('scroll', syncHeader);
  return () => body.removeEventListener('scroll', syncHeader);
}, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [projRes, wbsRes, memberRes] = await Promise.all([
        api.get(`/projects/${id}`),
        api.get(`/projects/${id}/wbs`),
        api.get(`/projects/${id}/members`),
      ]);
      setProject(projRes.data);
      setWbsItems(wbsRes.data);
      setMembers(memberRes.data);
      return wbsRes.data; // 최신 데이터 반환
    } catch (err) {
      message.error('데이터를 불러오지 못했어요');
      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!project?.start_date || !project?.end_date) return;
    const days = [];
    const cur = new Date(project.start_date);
    const end = new Date(project.end_date);
    while (cur <= end) { days.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
    setDates(days);
  }, [project]);

  const getColWidth = (col) => hiddenCols.includes(col.key) ? HIDDEN_COL_W : colWidths[col.key];
  const leftTotalWidth = INIT_COLS.reduce((acc, col) => acc + getColWidth(col), 0);
  const totalWidth = leftTotalWidth + dates.length * cellWidth;

  const hasChildren = (item) => wbsItems.some(w => w.parent_id === item.id);

  const getVisibleItems = () => {
    return wbsItems.filter(item => {
      let cur = item;
      while (cur.parent_id) {
        const parent = wbsItems.find(w => w.id === cur.parent_id);
        if (!parent) break;
        if (collapsedIds.has(parent.id)) return false;
        cur = parent;
      }
      return true;
    });
  };

  const toggleCollapse = (itemId) => {
    setCollapsedIds(prev => {
      const next = new Set(prev);
      next.has(itemId) ? next.delete(itemId) : next.add(itemId);
      return next;
    });
  };

  const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6;

  const dateToIndex = (dateStr) => {
    if (!dateStr || !project?.start_date) return -1;
    return Math.floor((new Date(dateStr) - new Date(project.start_date)) / 86400000);
  };

  const indexToDate = (index) => {
    if (!project?.start_date) return null;
    return dayjs(project.start_date).add(index, 'day').format('YYYY-MM-DD');
  };

  const getDaysDiff = (s, e) => {
    if (!s || !e) return 0;
    return Math.floor((new Date(e) - new Date(s)) / 86400000) + 1;
  };

  // 실적 진척률 계산 (0~1 클램프, 음수/NaN 방지)
  const calcActualProgress = (actualStart, actualEnd) => {
    if (!actualStart || !actualEnd) return 0;
    const totalDays = getDaysDiff(actualStart, actualEnd);
    if (totalDays <= 0) return 0;
    const today = dayjs().format('YYYY-MM-DD');
    const cap = today > actualEnd ? actualEnd : today;
    const doneDays = getDaysDiff(actualStart, cap);
    const p = doneDays / totalDays;
    if (!Number.isFinite(p)) return 0;
    return Math.max(0, Math.min(p, 1));
  };

  // DB 저장용 상태는 대기/진행중/완료 3가지만. 지연 여부는 getDisplayStatus에서만 계산.
  const calcActualStatus = (actualEnd /* , planEnd */) => {
    if (!actualEnd) return '진행중';
    const today = dayjs().format('YYYY-MM-DD');
    if (today < actualEnd) return '진행중';
    return '완료';
  };

  // 화면 표시용 상태 라벨·색상 계산 (DB 저장값은 건드리지 않음)
  const getDisplayStatus = (item) => {
    const { status, plan_end_date: planEnd, actual_end_date: actualEnd } = item || {};
    const today = dayjs().format('YYYY-MM-DD');
    const daysBetween = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000);

    if (status === '대기') {
      return { text: '대기', color: statusColors['대기'] };
    }
    if (status === '진행중') {
      if (!actualEnd && planEnd && today > planEnd) {
        return { text: `진행중 (${daysBetween(today, planEnd)}일 지연)`, color: '#ff4d4f' };
      }
      if (actualEnd && planEnd && actualEnd > planEnd) {
        return { text: `진행중 (${daysBetween(actualEnd, planEnd)}일 초과)`, color: '#ff4d4f' };
      }
      return { text: '진행중', color: statusColors['진행중'] };
    }
    if (status === '완료') {
      if (!actualEnd || !planEnd) {
        return { text: '완료', color: statusColors['완료'] };
      }
      if (actualEnd < planEnd) {
        return { text: `완료 (${daysBetween(planEnd, actualEnd)}일 조기)`, color: '#52c41a' };
      }
      if (actualEnd > planEnd) {
        return { text: `완료 (${daysBetween(actualEnd, planEnd)}일 초과)`, color: '#fa8c16' };
      }
      return { text: '완료 (정시)', color: '#52c41a' };
    }
    return { text: status || '-', color: statusColors[status] || '#d9d9d9' };
  };

  const todayIndex = dateToIndex(dayjs().format('YYYY-MM-DD'));

  const getMonthGroups = () => {
    const groups = [];
    let cur = null;
    dates.forEach(d => {
      const label = `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
      if (!cur || cur.label !== label) { cur = { label, count: 1 }; groups.push(cur); }
      else cur.count++;
    });
    return groups;
  };

  const getWeekGroups = () => {
    const groups = [];
    let cur = null;
    dates.forEach((d, i) => {
      const label = `W${Math.floor(i / 7) + 1}`;
      if (!cur || cur.label !== label) { cur = { label, count: 1 }; groups.push(cur); }
      else cur.count++;
    });
    return groups;
  };

  // 실적 종료일 vs 계획 종료일 비교 (상태와 무관하게 날짜로만 판정)
  const getDelayInfo = (item) => {
    if (!item.plan_end_date) return null;
    const planEnd = item.plan_end_date;
    // 실적 종료일이 있으면 계획 종료일과 직접 비교
    if (item.actual_end_date) {
      const diffMs = new Date(item.actual_end_date) - new Date(planEnd);
      const diff = Math.round(diffMs / 86400000);
      if (diff > 0)  return { text: `${diff}일 초과`,      color: '#ff4d4f', overdue: true };
      if (diff < 0)  return { text: `${-diff}일 전 완료`,  color: '#52c41a', overdue: false };
      return              { text: '정시완료',              color: '#52c41a', overdue: false };
    }
    // 실적 종료일이 없고 오늘이 계획 종료일을 지났으면 지연중
    const today = dayjs().format('YYYY-MM-DD');
    if (today > planEnd) {
      const diff = Math.round((new Date(today) - new Date(planEnd)) / 86400000);
      if (diff > 0) return { text: `${diff}일 지연중`, color: '#ff4d4f', overdue: true };
    }
    return null;
  };

  const confirmExpand = () => new Promise((resolve) => {
    Modal.confirm({
      title: '상위 일정 확장 확인',
      content: '상위 레벨 업무 일정을 조정해야 합니다. 진행하시겠습니까?',
      okText: '진행',
      cancelText: '취소',
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });

  const expandParentRange = async (item, newStart, newEnd, latestItems, confirmed = false) => {
    if (!item.parent_id) return;
    const items = latestItems || wbsItems;
    const parent = items.find(w => w.id === item.parent_id);
    if (!parent) return;
    let parentStart = parent.plan_start_date;
    let parentEnd = parent.plan_end_date;
    let changed = false;
    if (newStart && (!parentStart || newStart < parentStart)) { parentStart = newStart; changed = true; }
    if (newEnd && (!parentEnd || newEnd > parentEnd)) { parentEnd = newEnd; changed = true; }
    if (!changed) return;
    if (!confirmed) {
      const ok = await confirmExpand();
      if (!ok) return;
    }
    const params = new URLSearchParams();
    if (parentStart) params.append('plan_start_date', parentStart);
    if (parentEnd) params.append('plan_end_date', parentEnd);
    await api.put(`/wbs/${parent.id}?${params.toString()}`);
    message.warning(`"${parent.title}" 일정이 자동 확장됐어요!`);
    if (parent.parent_id) await expandParentRange({ ...parent, plan_start_date: parentStart, plan_end_date: parentEnd }, parentStart, parentEnd, items, true);
  };

// 부모의 실적 범위·진척률·상태를 자식들 기준으로 재계산 (합집합 의미)
// - actual_start_date = min(자식들 actual_start_date)
// - actual_end_date   = max(자식들 actual_end_date)
// - actual_progress   = mean(자식들 actual_progress)
// - status            = calcActualStatus(부모 end, 부모 plan_end)
// 조상 체인을 따라 재귀 갱신. latestItems를 받아 stale state 이슈 회피.
const recomputeParentActualRange = async (childItem, latestItems) => {
  if (!childItem?.parent_id) return;
  const items = latestItems || wbsItems;
  const parent = items.find(w => w.id === childItem.parent_id);
  if (!parent) return;

  const siblings = items.filter(w => w.parent_id === parent.id);
  const starts = siblings.map(s => s.actual_start_date).filter(Boolean);
  const ends   = siblings.map(s => s.actual_end_date).filter(Boolean);
  const newStart = starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : null;
  const newEnd   = ends.length   ? ends.reduce((a, b) => (a > b ? a : b))   : null;
  const progs = siblings.map(s => Number(s.actual_progress) || 0);
  const avgProg = progs.length ? progs.reduce((a, b) => a + b, 0) / progs.length : 0;
  const newProg = parseFloat(avgProg.toFixed(2));
  const newStatus = calcActualStatus(newEnd, parent.plan_end_date);

  // 변경 사항 없으면 skip
  if (parent.actual_start_date === newStart
    && parent.actual_end_date === newEnd
    && Math.abs((parent.actual_progress || 0) - newProg) < 0.005
    && parent.status === newStatus) return;

  const params = new URLSearchParams();
  if (newStart) params.append('actual_start_date', newStart);
  if (newEnd)   params.append('actual_end_date',   newEnd);
  params.append('actual_progress', newProg);
  params.append('status', newStatus);
  await api.put(`/wbs/${parent.id}?${params.toString()}`);

  const updatedParent = {
    ...parent,
    actual_start_date: newStart,
    actual_end_date:   newEnd,
    actual_progress:   newProg,
    status:            newStatus,
  };
  setWbsItems(prev => prev.map(w => w.id === parent.id ? updatedParent : w));

  if (parent.parent_id) {
    const updatedItems = items.map(w => w.id === parent.id ? updatedParent : w);
    await recomputeParentActualRange(parent, updatedItems);
  }
};

// 부모의 계획 범위를 자식들 기준으로 재계산 (합집합 의미)
// - plan_start_date = min(자식들 plan_start_date)
// - plan_end_date   = max(자식들 plan_end_date)
// 조상 체인을 따라 재귀 갱신. latestItems를 받아 stale state 이슈 회피.
const recomputeParentPlanRange = async (childItem, latestItems) => {
  if (!childItem?.parent_id) return;
  const items = latestItems || wbsItems;
  const parent = items.find(w => w.id === childItem.parent_id);
  if (!parent) return;

  const siblings = items.filter(w => w.parent_id === parent.id);
  const starts = siblings.map(s => s.plan_start_date).filter(Boolean);
  const ends   = siblings.map(s => s.plan_end_date).filter(Boolean);
  const newStart = starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : null;
  const newEnd   = ends.length   ? ends.reduce((a, b) => (a > b ? a : b))   : null;

  // 변경 사항 없으면 skip
  if (parent.plan_start_date === newStart && parent.plan_end_date === newEnd) return;

  const params = new URLSearchParams();
  if (newStart) params.append('plan_start_date', newStart);
  if (newEnd)   params.append('plan_end_date',   newEnd);
  await api.put(`/wbs/${parent.id}?${params.toString()}`);

  const updatedParent = {
    ...parent,
    plan_start_date: newStart,
    plan_end_date:   newEnd,
  };
  setWbsItems(prev => prev.map(w => w.id === parent.id ? updatedParent : w));

  if (parent.parent_id) {
    const updatedItems = items.map(w => w.id === parent.id ? updatedParent : w);
    await recomputeParentPlanRange(parent, updatedItems);
  }
};

const countDescendants = (item, items) => {
  const src = items || wbsItems;
  const children = src.filter(w => w.parent_id === item.id);
  let n = children.length;
  for (const c of children) n += countDescendants(c, src);
  return n;
};

const confirmAddToDescendants = (n) => new Promise((resolve) => {
  Modal.confirm({
    title: '하위 항목 담당자 추가',
    content: `하위 항목 ${n}개에도 담당자를 추가할까요?`,
    okText: '추가',
    cancelText: '상위만 추가',
    onOk: () => resolve(true),
    onCancel: () => resolve(false),
  });
});

const propagateAssigneesDownAdd = async (item, addedIds, latestItems) => {
  if (!addedIds || addedIds.length === 0) return;
  const items = latestItems || wbsItems;
  const children = items.filter(w => w.parent_id === item.id);
  for (const child of children) {
    const childIds = (child.assignees || []).map(a => a.user_id);
    const toAdd = addedIds.filter(uid => !childIds.includes(uid));
    if (toAdd.length > 0) {
      const merged = [...childIds, ...toAdd];
      const params = new URLSearchParams();
      params.append('assignee_ids', merged.join(','));
      await api.put(`/wbs/${child.id}?${params.toString()}`);
      const newAssignees = merged.map(uid => {
        const existing = (child.assignees || []).find(a => a.user_id === uid);
        if (existing) return existing;
        const m = members.find(mm => mm.user_id === uid);
        return { user_id: uid, name: m?.name || '' };
      });
      const updatedChild = { ...child, assignees: newAssignees };
      await propagateAssigneesDownAdd(updatedChild, addedIds, items);
    } else {
      await propagateAssigneesDownAdd(child, addedIds, items);
    }
  }
};

const propagateAssigneesDown = async (item, removedIds, latestItems) => {
  if (!removedIds || removedIds.length === 0) return;
  const items = latestItems || wbsItems;
  const children = items.filter(w => w.parent_id === item.id);
  for (const child of children) {
    const childIds = (child.assignees || []).map(a => a.user_id);
    const filtered = childIds.filter(uid => !removedIds.includes(uid));
    if (filtered.length !== childIds.length) {
      const params = new URLSearchParams();
      params.append('assignee_ids', filtered.join(','));
      await api.put(`/wbs/${child.id}?${params.toString()}`);
      const updatedChild = { ...child, assignees: (child.assignees || []).filter(a => !removedIds.includes(a.user_id)) };
      await propagateAssigneesDown(updatedChild, removedIds, items);
    } else {
      // child 본인엔 영향 없지만 손자에게 있을 수 있으니 계속 재귀
      await propagateAssigneesDown(child, removedIds, items);
    }
  }
};

const propagateAssigneesUp = async (childItem, addedIds = [], removedIds = [], latestItems) => {
  if (!childItem?.parent_id) return;
  const items = latestItems || wbsItems;
  const parent = items.find(w => w.id === childItem.parent_id);
  if (!parent) return;
  const parentIds = (parent.assignees || []).map(a => a.user_id);

  // 추가: parent에 아직 없는 것만
  const toAdd = (addedIds || []).filter(id => !parentIds.includes(id));

  // 제거: childItem의 형제 중 아무도 가지고 있지 않은 경우에만 parent에서 제거
  const siblings = items.filter(w => w.parent_id === parent.id && w.id !== childItem.id);
  const toRemove = (removedIds || []).filter(id => {
    if (!parentIds.includes(id)) return false;
    return !siblings.some(s => (s.assignees || []).some(a => a.user_id === id));
  });

  if (toAdd.length === 0 && toRemove.length === 0) return;

  const newParentIds = [...parentIds.filter(id => !toRemove.includes(id)), ...toAdd];
  const params = new URLSearchParams();
  params.append('assignee_ids', newParentIds.join(','));
  await api.put(`/wbs/${parent.id}?${params.toString()}`);

  const newParentAssignees = newParentIds.map(uid => {
    const existing = (parent.assignees || []).find(a => a.user_id === uid);
    if (existing) return existing;
    const m = members.find(mm => mm.user_id === uid);
    return { user_id: uid, name: m?.name || '' };
  });
  const updatedParent = { ...parent, assignees: newParentAssignees };
  const updatedItems = items.map(w => w.id === parent.id ? updatedParent : w);

  if (parent.parent_id) {
    await propagateAssigneesUp(updatedParent, toAdd, toRemove, updatedItems);
  }
};

const checkAndExpandParent = async (item, planStart, planEnd, confirmed = false) => {
  if (!item.parent_id) return;
  const parent = wbsItems.find(w => w.id === item.parent_id);
  if (!parent) return;

  // 부모 날짜가 없으면 자식 날짜로 바로 설정
  if (!parent.plan_start_date && !parent.plan_end_date) {
    if (!confirmed) {
      const ok = await confirmExpand();
      if (!ok) return;
      confirmed = true;
    }
    const params = new URLSearchParams();
    if (planStart) params.append('plan_start_date', planStart);
    if (planEnd) params.append('plan_end_date', planEnd);
    await api.put(`/wbs/${parent.id}?${params.toString()}`);
    message.info(`"${parent.title}" 일정이 자동 설정됐어요!`);
    // 부모의 부모도 확인
    if (parent.parent_id) await checkAndExpandParent({ ...parent, plan_start_date: planStart, plan_end_date: planEnd }, planStart, planEnd, true);
    return;
  }

  const needExpand =
    (planStart && parent.plan_start_date && planStart < parent.plan_start_date) ||
    (planEnd && parent.plan_end_date && planEnd > parent.plan_end_date) ||
    (planStart && !parent.plan_start_date) ||
    (planEnd && !parent.plan_end_date);

  if (needExpand) {
    if (!confirmed) {
      const ok = await confirmExpand();
      if (!ok) return;
      confirmed = true;
    }
    message.warning(`"${parent.title}" 범위 초과! 상위 일정을 자동 확장할게요.`);
    await expandParentRange(item, planStart, planEnd, wbsItems, true);
  }
};

  const saveItem = (item) => {
    const params = new URLSearchParams();
    ['title', 'status', 'plan_start_date', 'plan_end_date',
      'actual_start_date', 'actual_end_date', 'plan_progress', 'actual_progress',
      'deliverable', 'wbs_number', 'level'].forEach(f => {
      if (item[f] !== undefined && item[f] !== null) params.append(f, item[f]);
    });
    if (Array.isArray(item.assignee_ids)) {
      params.append('assignee_ids', item.assignee_ids.join(','));
    }
    if (item.parent_id) params.append('parent_id', item.parent_id);
    return api.put(`/wbs/${item.id}?${params.toString()}`);
  };

  const handleCellSave = async (item, field, value) => {
    if (value === undefined || value === null) return;
    setEditingCell(null);
    let updated = { ...item, [field]: value };

    if (field === 'assignee_ids') {
      const newIds = Array.isArray(value) ? value : [];
      const oldIds = (item.assignees || []).map(a => a.user_id);
      const addedIds = newIds.filter(uid => !oldIds.includes(uid));
      const removedIds = oldIds.filter(uid => !newIds.includes(uid));
      const newAssignees = newIds.map(uid => {
        const existing = (item.assignees || []).find(a => a.user_id === uid);
        if (existing) return existing;
        const m = members.find(mm => mm.user_id === uid);
        return { user_id: uid, name: m?.name || '' };
      });
      updated = { ...item, assignee_ids: newIds, assignees: newAssignees, assignee_id: newIds[0] || null, assignee_name: newAssignees[0]?.name || null };
      setWbsItems(prev => prev.map(w => w.id === item.id ? updated : w));
      await saveItem(updated);
      if (removedIds.length > 0) await propagateAssigneesDown(updated, removedIds);
      if (addedIds.length > 0) {
        const descCount = countDescendants(updated, wbsItems);
        if (descCount > 0) {
          const ok = await confirmAddToDescendants(descCount);
          if (ok) await propagateAssigneesDownAdd(updated, addedIds);
        }
      }
      if (addedIds.length > 0 || removedIds.length > 0) {
        await propagateAssigneesUp(updated, addedIds, removedIds);
      }
      fetchAll();
      return;
    }

if (field === 'wbs_number') {
  const oldWbsNumber = item.wbs_number;
  const newWbsNumber = value;

  // 중복 체크
  const duplicate = wbsItems.find(w => w.wbs_number === newWbsNumber && w.id !== item.id);
  if (duplicate) {
    message.error(`WBS 번호 "${newWbsNumber}"이 이미 존재해요! 다른 번호를 사용해주세요.`);
    return;
  }
      const newLevel = getLevelFromWbsNumber(newWbsNumber);
      const newParent = findParentByWbsNumber(newWbsNumber, wbsItems);

      if (newWbsNumber.includes('.') && !newParent) {
        message.error(`부모 항목(${newWbsNumber.split('.').slice(0, -1).join('.')})이 없어요! 먼저 부모 항목을 만들어주세요.`);
        return;
      }

      updated = { ...updated, level: newLevel, parent_id: newParent ? newParent.id : null };

      // 현재 항목 먼저 저장
      await saveItem(updated);

      // 최신 데이터 가져오기
      const latestItems = await fetchAll();

      // 자식 항목들 재귀적으로 업데이트
      const updateChildren = async (oldPrefix, newPrefix, items) => {
        const children = items.filter(w => w.wbs_number && w.wbs_number.startsWith(oldPrefix + '.') &&
          w.wbs_number.split('.').length === oldPrefix.split('.').length + 1);

        for (const child of children) {
          const newChildWbs = newPrefix + child.wbs_number.slice(oldPrefix.length);
          const newChildLevel = getLevelFromWbsNumber(newChildWbs);
          const freshItems = await api.get(`/projects/${id}/wbs`).then(r => r.data);
          const newChildParent = freshItems.find(w => w.wbs_number === newPrefix);

          const childParams = new URLSearchParams();
          childParams.append('wbs_number', newChildWbs);
          childParams.append('level', newChildLevel);
          if (newChildParent) childParams.append('parent_id', newChildParent.id);
          await api.put(`/wbs/${child.id}?${childParams.toString()}`);

          // 손자도 재귀 업데이트
          await updateChildren(child.wbs_number, newChildWbs, freshItems);
        }
      };

      await updateChildren(oldWbsNumber, newWbsNumber, latestItems);
      const totalChildren = (latestItems || []).filter(w => w.wbs_number && w.wbs_number.startsWith(oldWbsNumber + '.')).length;
      if (totalChildren > 0) message.info(`하위 ${totalChildren}개 항목도 자동으로 변경됐어요!`);
      await fetchAll();
      return;
    }

    if (field === 'actual_start_date' || field === 'actual_end_date') {
      const actualStart = field === 'actual_start_date' ? value : item.actual_start_date;
      const actualEnd   = field === 'actual_end_date'   ? value : item.actual_end_date;
      if (actualStart && actualEnd) {
        const progress = calcActualProgress(actualStart, actualEnd);
        const status = calcActualStatus(actualEnd, item.plan_end_date);
        updated = { ...updated, actual_progress: parseFloat(progress.toFixed(2)), status };
      }
    }

    if (field === 'plan_start_date' || field === 'plan_end_date') {
      const planStart = field === 'plan_start_date' ? value : item.plan_start_date;
      const planEnd = field === 'plan_end_date' ? value : item.plan_end_date;
      await checkAndExpandParent(item, planStart, planEnd);
      await checkProjectRangeOverflow({ planStart, planEnd });
      const latestItems = await fetchAll();
      await recomputeParentPlanRange({ ...item, plan_start_date: planStart, plan_end_date: planEnd }, latestItems);
    }
    if (field === 'actual_start_date' || field === 'actual_end_date') {
      const actualStart = field === 'actual_start_date' ? value : item.actual_start_date;
      const actualEnd   = field === 'actual_end_date'   ? value : item.actual_end_date;
      await checkProjectRangeOverflow({ actualStart, actualEnd });
    }

    setWbsItems(prev => prev.map(w => w.id === item.id ? updated : w));
    await saveItem(updated);

    // 실적/진척률/상태 변경 시 부모 재계산 (자식들 기준 합집합)
    if (field === 'actual_start_date' || field === 'actual_end_date'
      || field === 'actual_progress' || field === 'status') {
      const latestItems = await fetchAll();
      await recomputeParentActualRange(updated, latestItems);
    }

    fetchAll();
  };

  const handleMouseDown = (e, item, type) => {
    e.preventDefault();
    const startX = e.clientX;
    const origStart = item.plan_start_date;
    const origEnd = item.plan_end_date;
    let currentItem = { ...item };
    const onMove = (me) => {
      const delta = Math.round((me.clientX - startX) / cellWidth);
      let ns = origStart, ne = origEnd;
      if (type === 'move') { ns = indexToDate(dateToIndex(origStart) + delta); ne = indexToDate(dateToIndex(origEnd) + delta); }
      else if (type === 'left') { ns = indexToDate(Math.min(dateToIndex(origStart) + delta, dateToIndex(origEnd))); ne = origEnd; }
      else if (type === 'right') { ns = origStart; ne = indexToDate(Math.max(dateToIndex(origEnd) + delta, dateToIndex(origStart))); }
      currentItem = { ...item, plan_start_date: ns, plan_end_date: ne };
      setWbsItems(prev => prev.map(w => w.id === item.id ? currentItem : w));
    };
    const onUp = async () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (!currentItem.plan_start_date || !currentItem.plan_end_date) return;
      const params = new URLSearchParams();
      params.append('plan_start_date', currentItem.plan_start_date);
      params.append('plan_end_date',   currentItem.plan_end_date);
      await api.put(`/wbs/${item.id}?${params.toString()}`);
      await checkAndExpandParent(currentItem, currentItem.plan_start_date, currentItem.plan_end_date);
      await checkProjectRangeOverflow({
        planStart: currentItem.plan_start_date,
        planEnd: currentItem.plan_end_date,
      });
      const latestItems = await fetchAll();
      await recomputeParentPlanRange(currentItem, latestItems);
      message.success('일정 수정됐어요!');
      fetchAll();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleActualMouseDown = (e, item, type) => {
  e.preventDefault();
  const startX = e.clientX;
  const origStart = item.actual_start_date;
  const origEnd = item.actual_end_date;
  let currentItem = { ...item };
  const onMove = (me) => {
    const delta = Math.round((me.clientX - startX) / cellWidth);
    let ns = origStart, ne = origEnd;
    if (type === 'move') { ns = indexToDate(dateToIndex(origStart) + delta); ne = indexToDate(dateToIndex(origEnd) + delta); }
    else if (type === 'left') { ns = indexToDate(Math.min(dateToIndex(origStart) + delta, dateToIndex(origEnd))); ne = origEnd; }
    else if (type === 'right') { ns = origStart; ne = indexToDate(Math.max(dateToIndex(origEnd) + delta, dateToIndex(origStart))); }
    currentItem = { ...item, actual_start_date: ns, actual_end_date: ne };
    setWbsItems(prev => prev.map(w => w.id === item.id ? currentItem : w));
  };
  const onUp = async () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    const progress = calcActualProgress(currentItem.actual_start_date, currentItem.actual_end_date);
    const status = calcActualStatus(currentItem.actual_end_date, currentItem.plan_end_date);
    const params = new URLSearchParams();
    if (currentItem.actual_start_date) params.append('actual_start_date', currentItem.actual_start_date);
    if (currentItem.actual_end_date)   params.append('actual_end_date',   currentItem.actual_end_date);
    params.append('actual_progress', parseFloat(progress.toFixed(2)));
    params.append('status', status);
    await api.put(`/wbs/${item.id}?${params.toString()}`);
    const latestItems = await fetchAll();
    await recomputeParentActualRange(currentItem, latestItems);
    await checkProjectRangeOverflow({
      actualStart: currentItem.actual_start_date,
      actualEnd: currentItem.actual_end_date,
    });
    message.success(`진척률: ${Math.round(progress * 100)}% / 상태: ${status}`);
    fetchAll();
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
};

  const handleColResize = (key, e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = colWidths[key];
    const onMove = (me) => setColWidths(prev => ({ ...prev, [key]: Math.max(40, startWidth + (me.clientX - startX)) }));
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleColHeaderRightClick = (e, key) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, type: 'col', key });
  };

  const handleRowRightClick = (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, type: 'row', item });
  };

  const handleGanttRightClick = (e, item, dateIndex) => {
    e.preventDefault();
    e.stopPropagation();
    setGanttContextMenu({ x: e.clientX, y: e.clientY, item, clickedDate: indexToDate(dateIndex) });
  };

  const toggleSticky = (key) => {
    setStickyKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
    setContextMenu(null);
  };

  const toggleHideCol = (key) => {
    setHiddenCols(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
    setContextMenu(null);
  };

  const getStickyLeft = (colKey) => {
    let left = 0;
    for (const col of INIT_COLS) {
      if (col.key === colKey) break;
      if (stickyKeys.includes(col.key)) left += getColWidth(col);
    }
    return left;
  };

  const openAddChildModal = (parentItem) => {
    setParentForAdd(parentItem);
    const siblings = wbsItems.filter(w => w.parent_id === parentItem.id);
    const newWbsNumber = `${parentItem.wbs_number}.${siblings.length + 1}`;
    addForm.resetFields();
    addForm.setFieldsValue({ wbs_number: newWbsNumber, level: parentItem.level + 1 });
    setAddModalOpen(true);
    setContextMenu(null);
  };

  const openAddModal = () => {
    setParentForAdd(null);
    addForm.resetFields();
    const topLevel = wbsItems.filter(w => !w.parent_id);
    addForm.setFieldsValue({ wbs_number: String(topLevel.length + 1), level: 1 });
    setAddModalOpen(true);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    editForm.setFieldsValue({
      ...item,
      assignee_ids: (item.assignees || []).map(a => a.user_id),
      plan_start_date: item.plan_start_date ? dayjs(item.plan_start_date) : null,
      plan_end_date: item.plan_end_date ? dayjs(item.plan_end_date) : null,
      actual_start_date: item.actual_start_date ? dayjs(item.actual_start_date) : null,
      actual_end_date: item.actual_end_date ? dayjs(item.actual_end_date) : null,
    });
    setEditModalOpen(true);
    setContextMenu(null);
  };

  const handleEditSubmit = (values) => {
    const assigneeIds = Array.isArray(values.assignee_ids) ? values.assignee_ids : [];
    const updated = {
      ...editingItem, ...values,
      assignee_ids: assigneeIds,
      plan_start_date: values.plan_start_date?.format('YYYY-MM-DD') || null,
      plan_end_date: values.plan_end_date?.format('YYYY-MM-DD') || null,
      actual_start_date: values.actual_start_date?.format('YYYY-MM-DD') || null,
      actual_end_date: values.actual_end_date?.format('YYYY-MM-DD') || null,
    };
    const oldAssigneeIds = (editingItem.assignees || []).map(a => a.user_id);
    const addedIds = assigneeIds.filter(uid => !oldAssigneeIds.includes(uid));
    const removedIds = oldAssigneeIds.filter(uid => !assigneeIds.includes(uid));
    saveItem(updated).then(async () => {
      await checkAndExpandParent(updated, updated.plan_start_date, updated.plan_end_date);
      if (removedIds.length > 0) await propagateAssigneesDown(updated, removedIds);
      if (addedIds.length > 0) {
        const descCount = countDescendants(updated, wbsItems);
        if (descCount > 0) {
          const ok = await confirmAddToDescendants(descCount);
          if (ok) await propagateAssigneesDownAdd(updated, addedIds);
        }
      }
      if (addedIds.length > 0 || removedIds.length > 0) {
        await propagateAssigneesUp(updated, addedIds, removedIds);
      }
      message.success('수정됐어요!'); fetchAll(); setEditModalOpen(false);
    });
  };

const handleAdd = async (values) => {
  const wbsNumber = values.wbs_number;
  const level = getLevelFromWbsNumber(wbsNumber);

  // 4레벨 초과 막기
  if (level > 4) {
    message.error('최대 4레벨까지만 생성할 수 있어요!');
    return;
  }

  // 부모 존재 여부 체크
  if (wbsNumber.includes('.')) {
    const parent = findParentByWbsNumber(wbsNumber, wbsItems);
    if (!parent) {
      message.error(`부모 항목(${wbsNumber.split('.').slice(0, -1).join('.')})이 없어요! 먼저 부모 항목을 만들어주세요.`);
      return;
    }
  }

  // 중복 체크
  const duplicate = wbsItems.find(w => w.wbs_number === wbsNumber);
  if (duplicate) {
    message.error(`WBS 번호 "${wbsNumber}"이 이미 존재해요!`);
    return;
  }

  const parent = parentForAdd || findParentByWbsNumber(wbsNumber, wbsItems);
  const formAssigneeIds = Array.isArray(values.assignee_ids) ? values.assignee_ids : [];
  const parentAssigneeIds = parent ? (parent.assignees || []).map(a => a.user_id) : [];
  const mergedAssigneeIds = Array.from(new Set([...formAssigneeIds, ...parentAssigneeIds]));

  const params = new URLSearchParams();
  Object.entries(values).forEach(([k, v]) => {
    if (k === 'assignee_ids') return; // 아래에서 합산값으로 별도 추가
    if (v !== undefined && v !== null && v !== '')
      params.append(k, dayjs.isDayjs(v) ? v.format('YYYY-MM-DD') : v);
  });
  if (parent) params.append('parent_id', parent.id);
  if (mergedAssigneeIds.length > 0) params.set('assignee_ids', mergedAssigneeIds.join(','));
  params.set('level', level);
  const planStart = values.plan_start_date ? values.plan_start_date.format('YYYY-MM-DD') : null;
  const planEnd = values.plan_end_date ? values.plan_end_date.format('YYYY-MM-DD') : null;
  await api.post(`/projects/${id}/wbs?${params.toString()}`);
  if (parent && (planStart || planEnd)) await checkAndExpandParent({ parent_id: parent.id }, planStart, planEnd);
  if (parent && mergedAssigneeIds.length > 0) {
    await propagateAssigneesUp({ parent_id: parent.id }, mergedAssigneeIds);
  }
  if (parent) {
    const latestItems = await fetchAll();
    await recomputeParentPlanRange({ parent_id: parent.id }, latestItems);
  }
  fetchAll(); setAddModalOpen(false); addForm.resetFields(); setParentForAdd(null); message.success('추가됐어요!');
};

  const handleDelete = async (itemId) => {
    const target = wbsItems.find(w => w.id === itemId);
    await api.delete(`/wbs/${itemId}`);
    const latestItems = await fetchAll();
    if (target?.parent_id) {
      await recomputeParentActualRange(target, latestItems);
      await recomputeParentPlanRange(target, latestItems);
      await fetchAll();
    }
    message.success('삭제됐어요!');
    setContextMenu(null);
  };

const handleSetGanttDate = async (item, dateType, dateStr) => {
  const params = new URLSearchParams();
  params.append(dateType, dateStr);
  if (dateType === 'actual_start_date' || dateType === 'actual_end_date') {
    const actualStart = dateType === 'actual_start_date' ? dateStr : item.actual_start_date;
    const actualEnd   = dateType === 'actual_end_date'   ? dateStr : item.actual_end_date;
    if (actualStart && actualEnd) {
      const progress = calcActualProgress(actualStart, actualEnd);
      const status = calcActualStatus(actualEnd, item.plan_end_date);
      params.append('actual_progress', parseFloat(progress.toFixed(2)));
      params.append('status', status);
    }
  }
  await api.put(`/wbs/${item.id}?${params.toString()}`);
  if (dateType === 'plan_start_date' || dateType === 'plan_end_date') {
    const planStart = dateType === 'plan_start_date' ? dateStr : item.plan_start_date;
    const planEnd = dateType === 'plan_end_date' ? dateStr : item.plan_end_date;
    await checkAndExpandParent(item, planStart, planEnd);
    await checkProjectRangeOverflow({ planStart, planEnd });
    const latestItems = await fetchAll();
    await recomputeParentPlanRange({ ...item, plan_start_date: planStart, plan_end_date: planEnd }, latestItems);
  }
  if (dateType === 'actual_start_date' || dateType === 'actual_end_date') {
    const latestItems = await fetchAll();
    await recomputeParentActualRange(item, latestItems);
    const actualStart = dateType === 'actual_start_date' ? dateStr : item.actual_start_date;
    const actualEnd   = dateType === 'actual_end_date'   ? dateStr : item.actual_end_date;
    await checkProjectRangeOverflow({ actualStart, actualEnd });
  }
  message.success('날짜가 설정됐어요!');
  fetchAll();
  setGanttContextMenu(null);
};

  const handleExcelDownload = () => {
    const data = wbsItems.map(item => ({
      'WBS 번호': item.wbs_number || '', '레벨': `${item.level}Lv`, '작업명': item.title,
      '담당자': (item.assignees || []).map(a => a.name).join(', '), '상태': item.status,
      '계획 시작일': item.plan_start_date || '', '계획 완료일': item.plan_end_date || '',
      '작업일수': getDaysDiff(item.plan_start_date, item.plan_end_date),
      '실제 시작일': item.actual_start_date || '', '실제 완료일': item.actual_end_date || '',
      '계획진척률': `${Math.round((item.plan_progress || 0) * 100)}%`,
      '실적진척률': `${Math.round((item.actual_progress || 0) * 100)}%`,
      '산출물': item.deliverable || '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'WBS');
    saveAs(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/octet-stream' }), `${project?.name}_WBS.xlsx`);
    message.success('다운로드 완료!');
  };

  const handleExcelUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const wb = XLSX.read(evt.target.result, { type: 'binary' });
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      for (const row of data) {
        const found = wbsItems.find(w => w.wbs_number === row['WBS 번호']);
        if (found) {
          const params = new URLSearchParams();
          if (row['작업명']) params.append('title', row['작업명']);
          if (row['상태']) params.append('status', row['상태']);
          if (row['계획 시작일']) params.append('plan_start_date', row['계획 시작일']);
          if (row['계획 완료일']) params.append('plan_end_date', row['계획 완료일']);
          await api.put(`/wbs/${found.id}?${params.toString()}`);
        }
      }
      message.success('업로드 완료!'); fetchAll();
    };
    reader.readAsBinaryString(file);
  };

  const renderCell = (item, col) => {
    const isEditing = editingCell?.id === item.id && editingCell?.field === col.key;

if (col.key === 'wbs_number') return isEditing ? (
  <Input size="small" defaultValue={item.wbs_number} autoFocus style={{ width: '100%', fontSize: 10 }}
    onBlur={(e) => handleCellSave(item, 'wbs_number', e.target.value)}
    onPressEnter={(e) => handleCellSave(item, 'wbs_number', e.target.value)} />
) : (
  <span style={{ fontSize: 10, width: '100%', display: 'flex', alignItems: 'center', gap: 2 }}>
    {hasChildren(item) ? (
      <span onClick={() => toggleCollapse(item.id)} style={{ cursor: 'pointer', color: '#1677ff', flexShrink: 0, fontSize: 14, lineHeight: 1 }}>
        {collapsedIds.has(item.id) ? <PlusSquareOutlined /> : <MinusSquareOutlined />}
      </span>
    ) : <span style={{ width: 14, flexShrink: 0 }} />}
    <span onClick={() => setEditingCell({ id: item.id, field: 'wbs_number' })} style={{ cursor: 'text', flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
      {item.wbs_number || '-'}
    </span>
  </span>
);
    if (col.key === 'title') {
      const hasChild = hasChildren(item);
      const isCollapsed = collapsedIds.has(item.id);
      return isEditing ? (
        <Input size="small" defaultValue={item.title} autoFocus style={{ width: '100%', fontSize: 11 }}
          onBlur={(e) => handleCellSave(item, 'title', e.target.value)}
          onPressEnter={(e) => handleCellSave(item, 'title', e.target.value)} />
      ) : (
        <span style={{ paddingLeft: (item.level - 1) * 12, fontWeight: item.level === 1 ? 'bold' : 'normal', fontSize: 11, width: '100%', display: 'flex', alignItems: 'center', gap: 4 }}>
         
          <Tag color={levelColors[item.level]} style={{ fontSize: 9, padding: '0 3px', flexShrink: 0 }}>{item.level}L</Tag>
          <span onClick={() => setEditingCell({ id: item.id, field: 'title' })} style={{ cursor: 'text', flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
            {item.wbs_number} {item.title}
          </span>
        </span>
      );
    }

    if (col.key === 'assignee_name') {
      const assignees = item.assignees || [];
      const mainName = assignees[0]?.name || '';
      const restNames = assignees.slice(1).map(a => a.name).join(', ');
      const fullNames = assignees.map(a => a.name).join(', ');
      return isEditing ? (
        <Select size="small" mode="multiple" defaultValue={assignees.map(a => a.user_id)} autoFocus style={{ width: '100%' }}
          placeholder="담당자 선택"
          onChange={(val) => handleCellSave(item, 'assignee_ids', val)}
          onBlur={() => setEditingCell(null)}
          optionLabelProp="label">
          {members.map(m => (
            <Select.Option key={m.user_id} value={m.user_id} label={m.name}>
              {m.name} <span style={{ color: '#888', fontSize: 10 }}>({m.role})</span>
            </Select.Option>
          ))}
        </Select>
      ) : (
        <span onClick={() => setEditingCell({ id: item.id, field: 'assignee_name' })} style={{ cursor: 'pointer', fontSize: 11, width: '100%', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Tooltip title={fullNames || '담당자 지정이 필요해요'}>
            <span style={{ flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
              {assignees.length === 0 ? '-' : (
                <>
                  <span style={{ fontWeight: 'bold', color: '#1677ff' }}>{mainName}</span>
                  {restNames && <span style={{ color: '#999' }}>{', ' + restNames}</span>}
                </>
              )}
            </span>
          </Tooltip>
          {assignees.length === 0 && (
            <Tooltip title="담당자 지정이 필요해요">
              <WarningOutlined style={{ color: '#faad14', fontSize: 12, flexShrink: 0 }} />
            </Tooltip>
          )}
        </span>
      );
    }

    if (col.key === 'plan_start_date' || col.key === 'plan_end_date') return isEditing ? (
      <DatePicker size="small" autoFocus defaultValue={item[col.key] ? dayjs(item[col.key]) : null} style={{ width: '100%' }}
        onChange={(val) => { if (val) handleCellSave(item, col.key, val.format('YYYY-MM-DD')); else setEditingCell(null); }} />
    ) : <span onClick={() => setEditingCell({ id: item.id, field: col.key })} style={{ cursor: 'pointer', fontSize: 10, width: '100%', display: 'block' }}>{item[col.key] || '-'}</span>;

    if (col.key === 'days') return <span style={{ fontSize: 11, color: '#1677ff', width: '100%', display: 'block', textAlign: 'center' }}>{getDaysDiff(item.plan_start_date, item.plan_end_date) || '-'}</span>;

    if (col.key === 'actual_progress') return isEditing ? (
      <InputNumber size="small" min={0} max={1} step={0.1} defaultValue={item.actual_progress} autoFocus style={{ width: '100%' }}
        onBlur={(e) => handleCellSave(item, 'actual_progress', parseFloat(e.target.value) || 0)}
        onPressEnter={(e) => handleCellSave(item, 'actual_progress', parseFloat(e.target.value) || 0)} />
    ) : <span onClick={() => setEditingCell({ id: item.id, field: 'actual_progress' })} style={{ cursor: 'pointer', fontSize: 11, color: '#52c41a', width: '100%', display: 'block', textAlign: 'center' }}>{Math.round((item.actual_progress || 0) * 100)}%</span>;

    if (col.key === 'status') {
      if (isEditing) {
        return (
          <Select size="small" defaultValue={item.status} autoFocus style={{ width: '100%' }}
            onChange={(val) => handleCellSave(item, 'status', val)} onBlur={() => setEditingCell(null)}>
            <Select.Option value="대기">대기</Select.Option>
            <Select.Option value="진행중">진행중</Select.Option>
            <Select.Option value="완료">완료</Select.Option>
          </Select>
        );
      }
      const ds = getDisplayStatus(item);
      return (
        <Tag
          color={ds.color}
          style={{ cursor: 'pointer', fontSize: 10 }}
          onClick={() => setEditingCell({ id: item.id, field: 'status' })}
        >
          {ds.text}
        </Tag>
      );
    }

    if (col.key === 'deliverable_files') {
      const files = wbsFileMap[item.id];
      const hasFiles = Array.isArray(files) && files.length > 0;
      const count = Array.isArray(files) ? files.length : null;
      const popoverContent = (
        <div style={{ minWidth: 240, maxWidth: 320 }}>
          {hasFiles ? (
            <List
              size="small"
              dataSource={files}
              renderItem={(f) => (
                <List.Item
                  style={{ padding: '6px 0' }}
                  actions={[
                    <Button
                      key="del"
                      size="small" type="text" danger
                      icon={<DeleteOutlined />}
                      onClick={() => deleteWbsFile(item.id, f.id)}
                    />,
                  ]}
                >
                  <a
                    onClick={() => downloadWbsFile(f)}
                    style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={f.filename}
                  >
                    <FileOutlined /> {f.filename}
                  </a>
                </List.Item>
              )}
            />
          ) : Array.isArray(files) ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="파일 없음" style={{ margin: '8px 0' }} />
          ) : (
            <div style={{ fontSize: 12, color: '#888', textAlign: 'center', padding: 8 }}>로딩 중...</div>
          )}
          <Button
            size="small" block icon={<UploadOutlined />}
            style={{ marginTop: 8 }}
            onClick={() => triggerWbsFileUpload(item.id)}
          >
            파일 업로드
          </Button>
        </div>
      );
      return (
        <Popover
          content={popoverContent}
          title={`산출물 · ${item.wbs_number} ${item.title}`}
          trigger="click"
          placement="bottomRight"
          onOpenChange={(open) => { if (open && files === undefined) loadWbsFiles(item.id); }}
        >
          <Button
            type="text" size="small"
            style={{ width: '100%', padding: 0, fontSize: 12 }}
            icon={<PaperClipOutlined />}
          >
            {count == null ? '' : count === 0 ? '+' : (
              <Badge count={count} size="small" style={{ backgroundColor: '#1677ff', marginLeft: 2 }} />
            )}
          </Button>
        </Popover>
      );
    }

    return null;
  };

  const wbsForm = (form, onFinish, isChild = false, actualLocked = false) => (
    <Form form={form} layout="vertical" onFinish={onFinish}>
      <div style={{ display: 'flex', gap: 8 }}>
        <Form.Item label="WBS 번호" name="wbs_number" style={{ flex: 1 }} extra="예: 1 / 1.1 / 1.1.2">
          <Input placeholder="WBS 번호" />
        </Form.Item>
        <Form.Item label="레벨" name="level" initialValue={1} style={{ flex: 1 }}>
          <Select disabled={isChild}>
            <Select.Option value={1}>1Lv</Select.Option>
            <Select.Option value={2}>2Lv</Select.Option>
            <Select.Option value={3}>3Lv</Select.Option>
            <Select.Option value={4}>4Lv</Select.Option>
          </Select>
        </Form.Item>
      </div>
      <Form.Item label="작업명" name="title" rules={[{ required: true, message: '작업명 필수!' }]}><Input /></Form.Item>
      <div style={{ display: 'flex', gap: 8 }}>
        <Form.Item label="담당자" name="assignee_ids" style={{ flex: 1 }} extra="메인 담당자는 역할 우선순위(pm > director > executive > admin > member)로 자동 지정돼요.">
          <Select mode="multiple" placeholder="선택" allowClear optionLabelProp="label">
            {members.map(m => (
              <Select.Option key={m.user_id} value={m.user_id} label={m.name}>
                {m.name} <span style={{ color: '#888', fontSize: 10 }}>({m.role})</span>
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item label="상태" name="status" initialValue="대기" style={{ flex: 1 }}>
          <Select>
            <Select.Option value="대기">대기</Select.Option>
            <Select.Option value="진행중">진행중</Select.Option>
            <Select.Option value="완료">완료</Select.Option>
          </Select>
        </Form.Item>
      </div>
      <Divider orientation="left" style={{ fontSize: 12 }}>계획 일정</Divider>
      <div style={{ display: 'flex', gap: 8 }}>
        <Form.Item label="계획 시작일" name="plan_start_date" style={{ flex: 1 }}><DatePicker style={{ width: '100%' }} /></Form.Item>
        <Form.Item label="계획 완료일" name="plan_end_date" style={{ flex: 1 }}><DatePicker style={{ width: '100%' }} /></Form.Item>
      </div>
      <Divider orientation="left" style={{ fontSize: 12 }}>
        실적 일정{actualLocked && <span style={{ fontSize: 10, color: '#bfbfbf', marginLeft: 8 }}>🔒 자식 있음 — 자동 계산</span>}
      </Divider>
      <div style={{ display: 'flex', gap: 8 }}>
        <Form.Item label="실제 시작일" name="actual_start_date" style={{ flex: 1 }}>
          <DatePicker style={{ width: '100%' }} disabled={actualLocked} />
        </Form.Item>
        <Form.Item label="실제 완료일" name="actual_end_date" style={{ flex: 1 }}>
          <DatePicker style={{ width: '100%' }} disabled={actualLocked} />
        </Form.Item>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Form.Item label="계획진척률 (0~1)" name="plan_progress" initialValue={0} style={{ flex: 1 }}>
          <InputNumber min={0} max={1} step={0.1} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="실적진척률 (0~1)" name="actual_progress" initialValue={0} style={{ flex: 1 }}>
          <InputNumber min={0} max={1} step={0.1} style={{ width: '100%' }} disabled={actualLocked} />
        </Form.Item>
      </div>
      <Form.Item label="산출물" name="deliverable"><Input /></Form.Item>
    </Form>
  );

  const visibleItems = getVisibleItems();

  // sticky 컬럼 헤더 렌더링
  const renderStickyColHeaders = () => (
    INIT_COLS.map(col => {
      const isSticky = stickyKeys.includes(col.key);
      const isHidden = hiddenCols.includes(col.key);
      const w = getColWidth(col);
      if (!isSticky) return null;
      return (
        <div key={col.key}
          style={{ width: w, minWidth: w, flexShrink: 0, height: HEADER_HEIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid #e8e8e8', borderBottom: '2px solid #d9d9d9', background: isHidden ? '#fff7e6' : '#e6f4ff', userSelect: 'none', fontSize: isHidden ? 10 : 11, fontWeight: 'bold', color: isHidden ? '#fa8c16' : 'inherit', position: 'relative' }}
          onContextMenu={!isHidden ? (e) => handleColHeaderRightClick(e, col.key) : undefined}
          onClick={isHidden ? () => toggleHideCol(col.key) : undefined}>
          {isHidden ? '▶' : col.label}
          {!isHidden && <span style={{ fontSize: 8, marginLeft: 2 }}>📌</span>}
          {!isHidden && <div style={{ position: 'absolute', right: 0, top: 0, width: 4, height: '100%', cursor: 'col-resize', zIndex: 10 }}
            onMouseDown={(e) => { e.stopPropagation(); handleColResize(col.key, e); }} />}
        </div>
      );
    })
  );

return (
  <div onClick={() => { setContextMenu(null); setGanttContextMenu(null); }} style={{ padding: '0' }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/projects/${id}`, { state: { tab: 'wbs', from: location.state?.from, refresh: true } })} style={{ marginBottom: 16 }}>
          프로젝트로 돌아가기
        </Button>

        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <Title level={4} style={{ margin: 0 }}>{project?.name}</Title>
              <div style={{ fontSize: 12, color: '#888' }}>
                <span>현재 기간: {project?.start_date} ~ {project?.end_date}</span>
                {project?.original_start_date && project?.original_end_date
                  && (project.original_start_date !== project.start_date
                    || project.original_end_date !== project.end_date) && (
                  <span style={{ marginLeft: 12, color: '#bfbfbf' }}>
                    (원래 기간: {project.original_start_date} ~ {project.original_end_date})
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12 }}>간트 셀 너비:</span>
              <Slider min={10} max={40} value={cellWidth} onChange={setCellWidth} style={{ width: 100 }} />
              <Button type="primary" icon={<PlusOutlined />} onClick={openAddModal}>항목 추가</Button>
              <Button icon={<DownloadOutlined />} onClick={handleExcelDownload}>엑셀 다운</Button>
              <Button icon={<UploadOutlined />} onClick={() => fileInputRef.current.click()}>엑셀 업로드</Button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleExcelUpload} />
              {/* WBS 산출물 파일 업로드용 hidden input */}
              <input ref={wbsFileInputRef} type="file" style={{ display: 'none' }} onChange={handleWbsFilePicked} />
            </div>
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 12, fontSize: 11, flexWrap: 'wrap', alignItems: 'center' }}>
            <span>범례:</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 20, height: 8, background: '#4096ff', borderRadius: 2 }} /> 계획</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 20, height: 8, background: '#52c41a', borderRadius: 2 }} /> 실적(완료)</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 20, height: 8, background: '#faad14', borderRadius: 2 }} /> 실적(진행중)</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 20, height: 8, background: '#ff4d4f', borderRadius: 2 }} /> 지연</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 2, height: 12, background: '#ff4d4f' }} /> 오늘</span>
            <span style={{ color: '#888' }}>💡 행 우클릭: 자식추가/수정/삭제 | 간트 우클릭: 날짜설정 | 컬럼헤더 우클릭: 고정/숨기기</span>
          </div>
        </Card>

<Spin spinning={loading}>
<div style={{ height: 'calc(100vh - 280px)', border: '1px solid #d9d9d9', borderRadius: 8, overflow: 'auto', background: 'white' }}>
  <div style={{ width: totalWidth, position: 'relative' }}>

    {/* 헤더 (sticky top) */}
    <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 30, background: '#fafafa' }}>
      {INIT_COLS.map(col => {
        const isSticky = stickyKeys.includes(col.key);
        const isHidden = hiddenCols.includes(col.key);
        const w = getColWidth(col);
        return (
          <div key={col.key}
            style={{ width: w, minWidth: w, flexShrink: 0, height: HEADER_HEIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid #e8e8e8', borderBottom: '2px solid #d9d9d9', background: isHidden ? '#fff7e6' : isSticky ? '#e6f4ff' : '#fafafa', userSelect: 'none', cursor: isHidden ? 'pointer' : 'default', fontSize: isHidden ? 10 : 11, fontWeight: 'bold', color: isHidden ? '#fa8c16' : 'inherit', position: isSticky ? 'sticky' : 'relative', left: isSticky ? getStickyLeft(col.key) : 'auto', zIndex: isSticky ? 40 : 30 }}
            onContextMenu={!isHidden ? (e) => handleColHeaderRightClick(e, col.key) : undefined}
            onClick={isHidden ? () => toggleHideCol(col.key) : undefined}>
            {isHidden ? '▶' : col.label}
            {!isHidden && isSticky && <span style={{ fontSize: 8, marginLeft: 2 }}>📌</span>}
            {!isHidden && <div style={{ position: 'absolute', right: 0, top: 0, width: 4, height: '100%', cursor: 'col-resize', zIndex: 10 }}
              onMouseDown={(e) => { e.stopPropagation(); handleColResize(col.key, e); }} />}
          </div>
        );
      })}
      {/* 월/주/일 헤더 */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ display: 'flex', height: 30, borderBottom: '1px solid #e8e8e8' }}>
          {getMonthGroups().map((g, i) => (
            <div key={i} style={{ width: g.count * cellWidth, minWidth: g.count * cellWidth, flexShrink: 0, fontSize: 12, fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid #e8e8e8', overflow: 'hidden' }}>
              {g.label}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', height: 24, borderBottom: '1px solid #e8e8e8' }}>
          {getWeekGroups().map((g, i) => (
            <div key={i} style={{ width: g.count * cellWidth, minWidth: g.count * cellWidth, flexShrink: 0, fontSize: 11, color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid #e8e8e8', overflow: 'hidden' }}>
              {g.label}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', height: 24, borderBottom: '2px solid #d9d9d9' }}>
          {dates.map((date, i) => (
            <div key={i} style={{ width: cellWidth, minWidth: cellWidth, flexShrink: 0, fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', color: isWeekend(date) ? '#ff4d4f' : '#888', background: isWeekend(date) ? '#fff1f0' : 'transparent', borderRight: '1px solid #f5f5f5' }}>
              {date.getDate()}
            </div>
          ))}
        </div>
      </div>
    </div>

    {/* 데이터 행 */}
    {visibleItems.map(item => {
      const delay = getDelayInfo(item);
      const ps = dateToIndex(item.plan_start_date);
      const pe = dateToIndex(item.plan_end_date);
      const asRaw = dateToIndex(item.actual_start_date);
      const ae = dateToIndex(item.actual_end_date);
      // 계획 바 — 둘 다 설정되어 있을 때만
      const pw = item.plan_start_date && item.plan_end_date && pe >= ps
        ? (pe - ps + 1) * cellWidth
        : 0;
      // 실적 바 — 시작일은 필수. 종료일이 없으면 오늘(todayIndex), 오늘이 프로젝트 범위 밖이면 pe로 폴백.
      // actual_start_date가 프로젝트 시작 이전이면 렌더링은 0에서 시작(left 음수 방지).
      let aw = 0;
      let asRender = asRaw;
      if (item.actual_start_date) {
        let endIdx;
        if (item.actual_end_date) {
          endIdx = ae;
        } else if (todayIndex >= 0 && todayIndex < dates.length) {
          endIdx = todayIndex;
        } else if (pe >= 0) {
          endIdx = pe;
        } else {
          endIdx = asRaw;
        }
        if (asRender < 0) asRender = 0;
        if (endIdx < asRender) endIdx = asRender;
        aw = (endIdx - asRender + 1) * cellWidth;
      }
      const as = asRender;
      const rowBg = delay?.overdue
        ? '#fff1f0'
        : (item.level === 1 ? '#f9f0ff' : item.level === 2 ? '#f0f7ff' : 'white');

      return (
        <div key={item.id} style={{ display: 'flex', height: ROW_HEIGHT, borderBottom: '1px solid #f0f0f0', position: 'relative' }}
          onContextMenu={(e) => handleRowRightClick(e, item)}>
          {INIT_COLS.map(col => {
            const isSticky = stickyKeys.includes(col.key);
            const isHidden = hiddenCols.includes(col.key);
            const w = getColWidth(col);
            return (
              <div key={col.key} style={{ width: w, minWidth: w, flexShrink: 0, height: '100%', display: 'flex', alignItems: 'center', paddingLeft: isHidden ? 0 : 4, paddingRight: isHidden ? 0 : 2, borderRight: '1px solid #f0f0f0', overflow: 'hidden', position: isSticky ? 'sticky' : 'relative', left: isSticky ? getStickyLeft(col.key) : 'auto', zIndex: isSticky ? 20 : 1, background: isHidden ? '#fff7e6' : rowBg, justifyContent: isHidden ? 'center' : 'flex-start' }}>
                {!isHidden && renderCell(item, col)}
                {!isHidden && col.key === 'title' && delay && (
                  <Tag color={delay.color} style={{ marginLeft: 4, fontSize: 9, padding: '0 3px', flexShrink: 0 }}>{delay.text}</Tag>
                )}
              </div>
            );
          })}
          <div style={{ position: 'relative', width: dates.length * cellWidth, flexShrink: 0, background: rowBg }}>
            {dates.map((date, i) => (
              <div key={i} style={{ position: 'absolute', left: i * cellWidth, top: 0, width: cellWidth, height: ROW_HEIGHT, background: isWeekend(date) ? '#fff1f0' : 'transparent', opacity: isWeekend(date) ? 0.5 : 1 }}
                onContextMenu={(e) => handleGanttRightClick(e, item, i)} />
            ))}
            {todayIndex >= 0 && todayIndex < dates.length && (
              <div style={{ position: 'absolute', left: todayIndex * cellWidth + cellWidth / 2, top: 0, width: 2, height: ROW_HEIGHT, background: '#ff4d4f', zIndex: 10, opacity: 0.8, pointerEvents: 'none' }} />
            )}
            {pw > 0 && (() => {
              const isPlanParent = hasChildren(item);
              const planTooltip = `계획: ${item.plan_start_date} ~ ${item.plan_end_date} (${getDaysDiff(item.plan_start_date, item.plan_end_date)}일)${delay ? ' | ⚠ ' + delay.text : ''}${isPlanParent ? ' | 자식 기준 자동 계산' : ''}`;
              const planLabel = delay ? delay.text : (item.assignees?.[0]?.name || '');
              return (
              <Tooltip title={planTooltip}>
                <div style={{ position: 'absolute', left: ps * cellWidth, top: PLAN_BAR_TOP, height: PLAN_BAR_H, width: pw, background: delay?.overdue ? '#ff7875' : '#4096ff', borderRadius: 3, cursor: isPlanParent ? 'not-allowed' : 'grab', zIndex: 5, opacity: isPlanParent ? 0.7 : 1, display: 'flex', alignItems: 'center', userSelect: 'none' }}
                  onMouseDown={isPlanParent ? undefined : (e) => handleMouseDown(e, item, 'move')}>
                  {!isPlanParent && (
                    <div style={{ width: 5, height: '100%', cursor: 'ew-resize', background: 'rgba(0,0,0,0.2)', borderRadius: '3px 0 0 3px', flexShrink: 0 }}
                      onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, item, 'left'); }} />
                  )}
                  <div style={{ flex: 1, fontSize: 9, color: 'white', overflow: 'hidden', whiteSpace: 'nowrap', textAlign: 'center' }}>
                    {isPlanParent ? `🔒 ${planLabel}` : planLabel}
                  </div>
                  {!isPlanParent && (
                    <div style={{ width: 5, height: '100%', cursor: 'ew-resize', background: 'rgba(0,0,0,0.2)', borderRadius: '0 3px 3px 0', flexShrink: 0 }}
                      onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, item, 'right'); }} />
                  )}
                </div>
              </Tooltip>
              );
            })()}
            {aw > 0 && (() => {
              const progressPct = Math.round((item.actual_progress || 0) * 100);
              const ds = getDisplayStatus(item);
              const actualBg = delay?.overdue
                ? '#ff7875'
                : (item.actual_end_date ? '#52c41a' : '#faad14');
              const barLabel = `${progressPct}% · ${ds.text}`;
              const isParent = hasChildren(item);
              const tooltipTitle = `실적: ${item.actual_start_date} ~ ${item.actual_end_date || '진행중'} | ${progressPct}% | ${ds.text}${isParent ? ' | 자식 기준 자동 계산' : ''}`;
              return (
              <Tooltip title={tooltipTitle}>
                <div style={{ position: 'absolute', left: as * cellWidth, top: ACTUAL_BAR_TOP, height: ACTUAL_BAR_H, width: aw, background: actualBg, borderRadius: 3, zIndex: 6, opacity: isParent ? 0.7 : 0.9, cursor: isParent ? 'not-allowed' : 'grab', display: 'flex', alignItems: 'center', userSelect: 'none' }}
                  onMouseDown={isParent ? undefined : (e) => handleActualMouseDown(e, item, 'move')}>
                  {!isParent && (
                    <div style={{ width: 5, height: '100%', cursor: 'ew-resize', background: 'rgba(0,0,0,0.2)', borderRadius: '3px 0 0 3px', flexShrink: 0 }}
                      onMouseDown={(e) => { e.stopPropagation(); handleActualMouseDown(e, item, 'left'); }} />
                  )}
                  <div style={{ flex: 1, fontSize: 9, color: 'white', overflow: 'hidden', whiteSpace: 'nowrap', textAlign: 'center' }}>
                    {isParent ? `🔒 ${barLabel}` : barLabel}
                  </div>
                  {!isParent && (
                    <div style={{ width: 5, height: '100%', cursor: 'ew-resize', background: 'rgba(0,0,0,0.2)', borderRadius: '0 3px 3px 0', flexShrink: 0 }}
                      onMouseDown={(e) => { e.stopPropagation(); handleActualMouseDown(e, item, 'right'); }} />
                  )}
                </div>
              </Tooltip>
              );
            })()}
          </div>
        </div>
      );
    })}
  </div>
</div>
</Spin>

        {/* 행 우클릭 메뉴 */}
        {contextMenu && (
          <div style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, background: 'white', border: '1px solid #d9d9d9', borderRadius: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.15)', zIndex: 1000, padding: '4px 0', minWidth: 150 }}
            onClick={(e) => e.stopPropagation()}>
            {contextMenu.type === 'col' && <>
              <div style={{ padding: '6px 16px', cursor: 'pointer', fontSize: 12 }} onClick={() => toggleSticky(contextMenu.key)}>
                {stickyKeys.includes(contextMenu.key) ? '📌 고정 해제' : '📌 고정'}
              </div>
              <div style={{ padding: '6px 16px', cursor: 'pointer', fontSize: 12 }} onClick={() => toggleHideCol(contextMenu.key)}>
                🙈 숨기기
              </div>
            </>}
            {contextMenu.type === 'row' && <>
              <div style={{ padding: '6px 16px', cursor: 'pointer', fontSize: 12, color: '#1677ff' }} onClick={() => openAddChildModal(contextMenu.item)}>
                ➕ 자식 항목 추가
              </div>
              <div style={{ padding: '6px 16px', cursor: 'pointer', fontSize: 12 }} onClick={() => openEditModal(contextMenu.item)}>
                ✏️ 수정
              </div>
              <div style={{ padding: '6px 16px', cursor: 'pointer', fontSize: 12, color: '#ff4d4f' }} onClick={() => handleDelete(contextMenu.item.id)}>
                🗑️ 삭제
              </div>
            </>}
          </div>
        )}

        {/* 간트 우클릭 메뉴 */}
        {ganttContextMenu && (
          <div style={{ position: 'fixed', top: ganttContextMenu.y, left: ganttContextMenu.x, background: 'white', border: '1px solid #d9d9d9', borderRadius: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.15)', zIndex: 1000, padding: '4px 0', minWidth: 180 }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '4px 16px', fontSize: 11, color: '#888', borderBottom: '1px solid #f0f0f0' }}>📅 {ganttContextMenu.clickedDate}</div>
            <div style={{ padding: '6px 16px', cursor: 'pointer', fontSize: 12, color: '#4096ff' }} onClick={() => handleSetGanttDate(ganttContextMenu.item, 'plan_start_date', ganttContextMenu.clickedDate)}>📌 계획 시작일로 설정</div>
            <div style={{ padding: '6px 16px', cursor: 'pointer', fontSize: 12, color: '#4096ff' }} onClick={() => handleSetGanttDate(ganttContextMenu.item, 'plan_end_date', ganttContextMenu.clickedDate)}>📌 계획 완료일로 설정</div>
            <div style={{ padding: '4px 16px', fontSize: 11, color: '#888', borderTop: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0' }}>실적</div>
            {hasChildren(ganttContextMenu.item) ? (
              <div style={{ padding: '6px 16px', fontSize: 11, color: '#bfbfbf', fontStyle: 'italic' }}>🔒 자식 있는 항목은 자동 계산</div>
            ) : (
              <>
                <div style={{ padding: '6px 16px', cursor: 'pointer', fontSize: 12, color: '#52c41a' }} onClick={() => handleSetGanttDate(ganttContextMenu.item, 'actual_start_date', ganttContextMenu.clickedDate)}>✅ 실제 시작일로 설정</div>
                <div style={{ padding: '6px 16px', cursor: 'pointer', fontSize: 12, color: '#52c41a' }} onClick={() => handleSetGanttDate(ganttContextMenu.item, 'actual_end_date', ganttContextMenu.clickedDate)}>✅ 실제 완료일로 설정</div>
              </>
            )}
          </div>
        )}

        <Modal
          title={parentForAdd ? `자식 항목 추가 (상위: ${parentForAdd.wbs_number} ${parentForAdd.title})` : 'WBS 항목 추가'}
          open={addModalOpen} onCancel={() => { setAddModalOpen(false); setParentForAdd(null); }} onOk={() => addForm.submit()} width={560}>
          {wbsForm(addForm, handleAdd, !!parentForAdd)}
        </Modal>
        <Modal title="WBS 항목 수정" open={editModalOpen} onCancel={() => setEditModalOpen(false)} onOk={() => editForm.submit()} width={560}>
          {wbsForm(editForm, handleEditSubmit, false, editingItem ? hasChildren(editingItem) : false)}
        </Modal>
  </div>
  );
}