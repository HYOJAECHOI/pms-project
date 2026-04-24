import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal, Tabs, Tag, Progress, Button, Input, Select,
  Timeline, Space, Spin, message, Empty, Divider, List, Alert, Popconfirm,
} from 'antd';
import {
  DeleteOutlined, DownloadOutlined, FileOutlined, UploadOutlined, UnorderedListOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../api/axios';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/ko';

dayjs.extend(relativeTime);
dayjs.locale('ko');

const { TextArea } = Input;

const priorityColors = { low: 'default', normal: 'blue', high: 'orange', urgent: 'red' };
const priorityLabels = { low: '낮음', normal: '보통', high: '높음', urgent: '긴급' };
const receiptStatusLabels = {
  open: '미확인', acknowledged: '확인', in_progress: '진행중',
  completed: '완료', cancelled: '취소',
};
const receiptStatusColors = {
  open: 'default', acknowledged: 'blue', in_progress: 'orange',
  completed: 'green', cancelled: 'default',
};
const memoCategories = [
  { key: 'daily_work', label: '오늘한일', color: 'blue' },
  { key: 'issue', label: '이슈', color: 'red' },
  { key: 'next_action', label: '다음액션', color: 'orange' },
  { key: 'reference', label: '참고', color: 'default' },
];
const memoCategoryMap = Object.fromEntries(memoCategories.map(c => [c.key, c]));

const activityMeta = {
  wbs_status_changed: { icon: '🔄', color: 'blue', label: '상태 변경' },
  progress_updated: { icon: '📊', color: 'green', label: '진척률 변경' },
  comment_added: { icon: '💬', color: 'gray', label: '메모 작성' },
  instruction_created: { icon: '📢', color: 'orange', label: '지시 생성' },
  instruction_updated: { icon: '📢', color: 'orange', label: '지시 수정' },
  instruction_deleted: { icon: '📢', color: 'gray', label: '지시 삭제' },
  instruction_status_changed: { icon: '✅', color: 'green', label: '지시 상태 변경' },
};

// GanttChart/ProjectDetail과 통일된 판정 규칙.
// 우선순위: actual_end_date(<=today) → 실적시작·진척 여부 → 플랜 기준
const getDisplayStatus = (item) => {
  const {
    plan_start_date: planStart,
    plan_end_date: planEnd,
    actual_start_date: actualStart,
    actual_end_date: actualEnd,
    actual_progress: actualProgress,
  } = item || {};
  const today = dayjs().format('YYYY-MM-DD');
  const days = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000);

  // 0) actual_end_date가 오늘 이전이면 무조건 완료 계열
  if (actualEnd && actualEnd <= today) {
    if (planEnd && actualEnd > planEnd) return { text: `완료 (${days(actualEnd, planEnd)}일 초과)`, color: 'orange' };
    if (planEnd && actualEnd < planEnd) return { text: `완료 (${days(planEnd, actualEnd)}일 조기)`, color: 'green' };
    if (planEnd && actualEnd === planEnd) return { text: '완료 (정시)', color: 'green' };
    return { text: '완료', color: 'green' };
  }

  // 1) 실적이 아직 없으면 플랜 기준 (대기 vs 시작 지연)
  if (!actualStart && (!actualProgress || Number(actualProgress) === 0)) {
    if (planStart && planStart > today) return { text: '대기', color: 'default' };
    if (planStart && planStart <= today) return { text: '진행중 (시작 지연)', color: 'orange' };
    return { text: '대기', color: 'default' };
  }

  // 2) 진행 중 파생 라벨
  if (actualEnd && planEnd && actualEnd > planEnd) {
    return { text: `진행중 (${days(actualEnd, planEnd)}일 초과)`, color: 'red' };
  }
  if (!actualEnd && planEnd && planEnd < today) {
    return { text: `진행중 (${days(today, planEnd)}일 지연)`, color: 'red' };
  }
  return { text: '진행중', color: 'blue' };
};

const formatRelative = (iso) => {
  if (!iso) return '-';
  try { return dayjs(iso).fromNow(); } catch { return iso; }
};

const describeActivity = (log) => {
  const meta = activityMeta[log.action_type] || { icon: '•', color: 'gray', label: log.action_type };
  const actor = log.actor_name || '시스템';
  let detail = meta.label;
  try {
    const after = log.after_json ? JSON.parse(log.after_json) : null;
    const before = log.before_json ? JSON.parse(log.before_json) : null;
    if (log.action_type === 'wbs_status_changed' && after) {
      detail = `상태를 ${after.status}(으)로 변경`;
      if (before?.status) detail = `상태를 ${before.status} → ${after.status}(으)로 변경`;
    } else if (log.action_type === 'progress_updated' && after) {
      const pct = Math.round((after.actual_progress || 0) * 100);
      detail = `진척률을 ${pct}%로 변경`;
    } else if (log.action_type === 'comment_added') {
      detail = '메모 작성';
    } else if (log.action_type === 'instruction_created' && after) {
      detail = `지시 생성: ${after.title || ''}`;
    } else if (log.action_type === 'instruction_status_changed' && after) {
      detail = `지시 상태를 ${receiptStatusLabels[after.status] || after.status}(으)로 변경`;
    }
  } catch { /* noop */ }
  return { meta, actor, detail };
};

const TAB_KEYS = ['기본정보', '메모', '지시사항', '활동이력'];

export default function WBSDetailModal({
  visible, wbsItem, project, currentUser, members = [],
  onClose, onUpdate, defaultTab = '기본정보',
}) {
  const wbsId = wbsItem?.id;
  const navigate = useNavigate();
  const location = useLocation();

  const [activeTab, setActiveTab] = useState(defaultTab);
  const [loading, setLoading] = useState(false);
  const [fetchedWbs, setFetchedWbs] = useState(null);

  // Basic tab
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Memo tab
  const [comments, setComments] = useState([]);
  const [memoCategory, setMemoCategory] = useState('daily_work');
  const [memoInput, setMemoInput] = useState('');

  // Instruction tab
  const [instructions, setInstructions] = useState([]);
  const [insTitle, setInsTitle] = useState('');
  const [insContent, setInsContent] = useState('');
  const [insPriority, setInsPriority] = useState('normal');
  const [pendingCompletion, setPendingCompletion] = useState(null);
  const [completionText, setCompletionText] = useState('');

  // Activity tab
  const [activities, setActivities] = useState([]);

  const currentMember = useMemo(
    () => members.find(m => m.user_id === currentUser?.id),
    [members, currentUser]
  );
  const canWriteInstruction = !!currentMember && ['PM', 'PL'].includes(currentMember.project_role);

  useEffect(() => {
    if (!visible || !wbsId) {
      setFetchedWbs(null);
      return;
    }
    setActiveTab(TAB_KEYS.includes(defaultTab) ? defaultTab : '기본정보');
    setFetchedWbs(null);
    setMemoInput('');
    setInsTitle(''); setInsContent(''); setInsPriority('normal');
    setPendingCompletion(null); setCompletionText('');
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, wbsId, defaultTab]);

  const fetchAll = async () => {
    if (!wbsId) return;
    setLoading(true);
    try {
      const [wRes, fRes, cRes, iRes, aRes] = await Promise.all([
        api.get(`/wbs/${wbsId}`),
        api.get(`/wbs/${wbsId}/files`),
        api.get(`/wbs/${wbsId}/comments`),
        api.get(`/wbs/${wbsId}/instructions`),
        api.get(`/wbs/${wbsId}/activities`),
      ]);
      setFetchedWbs(wRes.data || null);
      setFiles(fRes.data || []);
      setComments((cRes.data || []).filter(c => c.comment_type !== 'auto'));
      setInstructions(iRes.data || []);
      setActivities(aRes.data || []);
    } catch {
      message.error('데이터를 불러오지 못했어요');
    } finally {
      setLoading(false);
    }
  };

  // ===== Basic tab actions =====
  const handleFileDownload = async (f) => {
    try {
      const res = await api.get(`/wbs/files/${f.id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = f.filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch {
      message.error('다운로드 실패');
    }
  };

  const handleFilePick = () => fileInputRef.current?.click();

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await api.post(`/wbs/${wbsId}/files`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      message.success('업로드됐어요');
      await fetchAll();
      onUpdate?.();
    } catch {
      message.error('업로드 실패');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileDelete = async (fileId) => {
    try {
      await api.delete(`/wbs/files/${fileId}`);
      await fetchAll();
      onUpdate?.();
    } catch {
      message.error('삭제 실패');
    }
  };

  // ===== Memo tab actions =====
  const handleMemoSubmit = async () => {
    if (!memoInput.trim()) {
      message.warning('내용을 입력해 주세요');
      return;
    }
    try {
      await api.post(`/wbs/${wbsId}/comments`, null, {
        params: {
          content: memoInput,
          comment_type: 'memo',
          memo_category: memoCategory,
        },
      });
      setMemoInput('');
      fetchAll();
    } catch {
      message.error('등록 실패');
    }
  };

  const handleMemoDelete = async (cid) => {
    try {
      await api.delete(`/wbs/comments/${cid}`);
      fetchAll();
    } catch {
      message.error('삭제 실패');
    }
  };

  // ===== Instruction tab actions =====
  const handleInstructionSubmit = async () => {
    if (!insTitle.trim()) {
      message.warning('제목을 입력해 주세요');
      return;
    }
    try {
      await api.post(`/wbs/${wbsId}/instructions`, null, {
        params: { title: insTitle, content: insContent, priority: insPriority },
      });
      setInsTitle(''); setInsContent(''); setInsPriority('normal');
      fetchAll();
    } catch {
      message.error('등록 실패');
    }
  };

  const handleReceiptChange = async (instructionId, targetUserId, newStatus, note) => {
    try {
      const params = { status: newStatus };
      if (note && note.trim()) params.completion_note = note;
      await api.put(
        `/wbs/instructions/${instructionId}/receipts/${targetUserId}`,
        null,
        { params }
      );
      setPendingCompletion(null);
      setCompletionText('');
      fetchAll();
    } catch {
      message.error('상태 변경 실패');
    }
  };

  // ===== Render =====
  // 표시 데이터는 fetchedWbs 우선, 로딩 전엔 prop(wbsItem)으로 폴백
  const displayItem = fetchedWbs || wbsItem;
  const ds = useMemo(() => getDisplayStatus(displayItem), [displayItem]);
  const progressPct = Math.round((displayItem?.actual_progress || 0) * 100);

  const renderBasicTab = () => (
    <div>
      <Alert
        type="info" showIcon style={{ marginBottom: 12 }}
        message="진척률과 상태는 간트차트에서 실적 바를 통해 업데이트됩니다"
      />

      <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 110px 1fr', gap: '8px 12px', marginBottom: 16 }}>
        <div style={{ color: '#888' }}>담당자</div>
        <div>{displayItem?.assignee_name || displayItem?.assignees?.map(a => a.name).join(', ') || '-'}</div>
        <div style={{ color: '#888' }}>상태</div>
        <div><Tag color={ds.color}>{ds.text}</Tag></div>

        <div style={{ color: '#888' }}>계획 기간</div>
        <div>{displayItem?.plan_start_date || '-'} ~ {displayItem?.plan_end_date || '-'}</div>
        <div style={{ color: '#888' }}>실적 기간</div>
        <div>{displayItem?.actual_start_date || '-'} ~ {displayItem?.actual_end_date || '-'}</div>

        <div style={{ color: '#888' }}>진척률</div>
        <div style={{ gridColumn: 'span 3' }}>
          <Progress percent={progressPct} size="small" status={progressPct >= 100 ? 'success' : 'active'} />
        </div>
      </div>

      <Divider style={{ margin: '12px 0' }}>산출물 파일</Divider>

      <input
        ref={fileInputRef} type="file" style={{ display: 'none' }}
        onChange={handleFileUpload}
      />
      <Space style={{ marginBottom: 12 }}>
        <Button icon={<UploadOutlined />} loading={uploading} onClick={handleFilePick}>
          파일 업로드
        </Button>
      </Space>

      {files.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="등록된 파일이 없어요" />
      ) : (
        <List
          size="small"
          dataSource={files}
          renderItem={(f) => (
            <List.Item
              actions={[
                <Button
                  key="dl" type="link" size="small" icon={<DownloadOutlined />}
                  onClick={() => handleFileDownload(f)}
                >다운로드</Button>,
                <Popconfirm
                  key="del" title="이 파일을 삭제할까요?"
                  onConfirm={() => handleFileDelete(f.id)}
                  okText="삭제" cancelText="취소"
                >
                  <Button type="link" size="small" danger icon={<DeleteOutlined />}>삭제</Button>
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                avatar={<FileOutlined />}
                title={<span style={{ cursor: 'pointer' }} onClick={() => handleFileDownload(f)}>{f.filename}</span>}
                description={
                  <span style={{ fontSize: 11, color: '#888' }}>
                    {f.uploaded_by_name || '-'} · {f.filesize ? `${Math.round(f.filesize / 1024)} KB` : ''} · {formatRelative(f.created_at)}
                  </span>
                }
              />
            </List.Item>
          )}
        />
      )}
    </div>
  );

  const renderMemoTab = () => (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Space wrap>
          {memoCategories.map(c => (
            <Button
              key={c.key} size="small"
              type={memoCategory === c.key ? 'primary' : 'default'}
              onClick={() => setMemoCategory(c.key)}
            >{c.label}</Button>
          ))}
        </Space>
      </div>
      <TextArea
        rows={3}
        placeholder={`${memoCategoryMap[memoCategory]?.label || ''} 내용을 입력하세요`}
        value={memoInput}
        onChange={(e) => setMemoInput(e.target.value)}
        style={{ marginBottom: 8 }}
      />
      <Button type="primary" onClick={handleMemoSubmit}>등록</Button>

      <Divider style={{ margin: '16px 0 12px' }}>메모 목록</Divider>
      {comments.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="메모가 없어요" />
      ) : (
        <List
          size="small"
          dataSource={[...comments].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))}
          renderItem={(c) => {
            const cat = memoCategoryMap[c.memo_category];
            const isMine = c.user_id === currentUser?.id;
            return (
              <List.Item
                actions={isMine ? [
                  <Button
                    key="del" type="text" size="small" danger icon={<DeleteOutlined />}
                    onClick={() => handleMemoDelete(c.id)}
                  />
                ] : []}
              >
                <div style={{ flex: 1 }}>
                  <Space size={6} style={{ marginBottom: 4 }}>
                    {cat && <Tag color={cat.color} style={{ fontSize: 10 }}>{cat.label}</Tag>}
                    <strong style={{ fontSize: 13 }}>{c.user_name || '-'}</strong>
                    <span style={{ fontSize: 11, color: '#888' }}>{formatRelative(c.created_at)}</span>
                  </Space>
                  <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{c.content}</div>
                </div>
              </List.Item>
            );
          }}
        />
      )}
    </div>
  );

  const renderInstructionTab = () => (
    <div>
      {canWriteInstruction ? (
        <div style={{ marginBottom: 12, padding: 12, background: '#fafafa', borderRadius: 6 }}>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>
            새 지시사항 ({currentMember?.project_role} 권한) · 수신자는 이 WBS 담당자 전체
          </div>
          <Input
            placeholder="제목" value={insTitle} onChange={(e) => setInsTitle(e.target.value)}
            style={{ marginBottom: 8 }}
          />
          <TextArea
            rows={2} placeholder="내용" value={insContent} onChange={(e) => setInsContent(e.target.value)}
            style={{ marginBottom: 8 }}
          />
          <Space>
            <Select size="small" value={insPriority} onChange={setInsPriority} style={{ width: 110 }}>
              <Select.Option value="low">낮음</Select.Option>
              <Select.Option value="normal">보통</Select.Option>
              <Select.Option value="high">높음</Select.Option>
              <Select.Option value="urgent">긴급</Select.Option>
            </Select>
            <Button type="primary" onClick={handleInstructionSubmit}>지시 등록</Button>
          </Space>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>
          지시사항은 PM/PL만 작성할 수 있어요.
        </div>
      )}

      <Divider style={{ margin: '12px 0' }}>지시사항 목록</Divider>
      {instructions.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="지시사항이 없어요" />
      ) : (
        <List
          size="small"
          dataSource={instructions}
          renderItem={(ins) => (
            <List.Item>
              <div style={{ flex: 1 }}>
                <Space size={6} style={{ marginBottom: 4 }}>
                  <Tag color={priorityColors[ins.priority] || 'default'}>
                    {priorityLabels[ins.priority] || ins.priority}
                  </Tag>
                  <strong style={{ fontSize: 13 }}>{ins.title}</strong>
                  <span style={{ fontSize: 11, color: '#888' }}>
                    {ins.author_name || '-'} · {formatRelative(ins.created_at)}
                  </span>
                </Space>
                {ins.content && (
                  <div style={{ fontSize: 12, color: '#444', whiteSpace: 'pre-wrap', marginBottom: 6 }}>
                    {ins.content}
                  </div>
                )}
                <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>수신:</div>
                <div>
                  {ins.receipts?.map(r => {
                    const isMe = r.target_user_id === currentUser?.id;
                    const pending = pendingCompletion
                      && pendingCompletion.instructionId === ins.id
                      && pendingCompletion.targetUserId === r.target_user_id;
                    return (
                      <div key={r.id} style={{ marginTop: 4, paddingLeft: 4, fontSize: 12 }}>
                        <Space size={6} wrap>
                          <span>{r.target_name || `#${r.target_user_id}`}</span>
                          <Tag color={receiptStatusColors[r.status] || 'default'}>
                            {receiptStatusLabels[r.status] || r.status}
                          </Tag>
                          {r.completion_note && (
                            <span style={{ fontSize: 11, color: '#888' }}>메모: {r.completion_note}</span>
                          )}
                          {isMe && !pending && (
                            <Space size={4}>
                              {r.status === 'open' && (
                                <Button size="small" onClick={() =>
                                  handleReceiptChange(ins.id, r.target_user_id, 'acknowledged')
                                }>확인하기</Button>
                              )}
                              {r.status === 'acknowledged' && (
                                <>
                                  <Button size="small" onClick={() =>
                                    handleReceiptChange(ins.id, r.target_user_id, 'in_progress')
                                  }>진행중</Button>
                                  <Button size="small" type="primary" onClick={() => {
                                    setPendingCompletion({ instructionId: ins.id, targetUserId: r.target_user_id });
                                    setCompletionText('');
                                  }}>완료</Button>
                                </>
                              )}
                              {r.status === 'in_progress' && (
                                <Button size="small" type="primary" onClick={() => {
                                  setPendingCompletion({ instructionId: ins.id, targetUserId: r.target_user_id });
                                  setCompletionText('');
                                }}>완료</Button>
                              )}
                            </Space>
                          )}
                        </Space>
                        {isMe && pending && (
                          <div style={{ marginTop: 6, paddingLeft: 6 }}>
                            <TextArea
                              rows={2} placeholder="완료 메모 (선택)"
                              value={completionText} onChange={(e) => setCompletionText(e.target.value)}
                              style={{ marginBottom: 6 }}
                            />
                            <Space>
                              <Button size="small" type="primary" onClick={() =>
                                handleReceiptChange(ins.id, r.target_user_id, 'completed', completionText)
                              }>완료 확정</Button>
                              <Button size="small" onClick={() => { setPendingCompletion(null); setCompletionText(''); }}>취소</Button>
                            </Space>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </List.Item>
          )}
        />
      )}
    </div>
  );

  const renderActivityTab = () => (
    activities.length === 0 ? (
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="활동 이력이 없어요" />
    ) : (
      <Timeline
        items={activities.map((log) => {
          const { meta, actor, detail } = describeActivity(log);
          return {
            color: meta.color,
            dot: <span style={{ fontSize: 16 }}>{meta.icon}</span>,
            children: (
              <div>
                <div style={{ fontSize: 13 }}>
                  <strong>{actor}</strong>님이 {detail}
                </div>
                <div style={{ fontSize: 11, color: '#888' }}>{formatRelative(log.created_at)}</div>
              </div>
            ),
          };
        })}
      />
    )
  );

  return (
    <Modal
      open={visible}
      onCancel={onClose}
      title={
        <Space size={6} wrap>
          <Tag color="purple">{displayItem?.level ? `${displayItem.level}L` : ''}</Tag>
          <span style={{ color: '#888', fontSize: 12 }}>{displayItem?.wbs_number}</span>
          <strong>{displayItem?.title}</strong>
          {project?.name && <span style={{ fontSize: 11, color: '#888' }}>· {project.name}</span>}
        </Space>
      }
      footer={[
        <Button
          key="gantt"
          icon={<BarChartOutlined />}
          disabled={!(project?.id || displayItem?.project_id)}
          onClick={() => {
            const projectId = project?.id || displayItem?.project_id;
            if (!projectId) return;
            navigate(`/projects/${projectId}`, {
              state: { tab: 'wbs', focusWbsId: displayItem?.id, from: location.pathname },
            });
            onClose();
          }}
        >
          간트차트에서 보기
        </Button>,
        <Button key="close" onClick={onClose}>닫기</Button>,
      ]}
      width={800}
      destroyOnClose
    >
      <Spin spinning={loading}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            { key: '기본정보', label: '기본정보', children: renderBasicTab() },
            { key: '메모', label: `메모 (${comments.length})`, children: renderMemoTab() },
            { key: '지시사항', label: `지시사항 (${instructions.length})`, children: renderInstructionTab() },
            { key: '활동이력', label: `활동이력 (${activities.length})`, children: renderActivityTab() },
          ]}
        />
      </Spin>
    </Modal>
  );
}
