// 프로젝트 파이프라인 단계 정의 (단일 출처)

// 단계 순서 (전체)
export const STAGES = [
  '공고전', '사전공고', '본공고', '재공고',
  '제안계획', '제안진행', '제안제출', '평가',
  '수주', '기술협상', '계약', '수행중',
  '완료',
  '실주', '제안포기',
];

// 그룹 정의 (5개 섹션)
export const STAGE_GROUPS = [
  {
    key: 'review',
    label: '검토',
    icon: '🔍',
    color: '#1677ff',
    stages: ['공고전', '사전공고', '본공고', '재공고'],
  },
  {
    key: 'proposal',
    label: '제안',
    icon: '📋',
    color: '#faad14',
    stages: ['제안계획', '제안진행', '제안제출', '평가'],
  },
  {
    key: 'running',
    label: '수행',
    icon: '🔨',
    color: '#52c41a',
    stages: ['수주', '기술협상', '계약', '수행중'],
  },
  {
    key: 'done',
    label: '완료',
    icon: '✅',
    color: '#13c2c2',
    stages: ['완료'],
  },
  {
    key: 'history',
    label: '이력',
    icon: '📦',
    color: '#bfbfbf',
    stages: ['실주', '제안포기'],
  },
];

// 그룹별 단계 배열 ({ review: [...], proposal: [...], ... })
export const BUCKET_STAGES = STAGE_GROUPS.reduce(
  (acc, g) => ({ ...acc, [g.key]: g.stages }), {},
);

// antd Tag 색상
export const STAGE_COLOR = {
  '공고전':   'default',
  '사전공고': 'cyan',
  '본공고':   'blue',
  '재공고':   'geekblue',
  '제안계획': 'gold',
  '제안진행': 'orange',
  '제안제출': 'volcano',
  '평가':     'gold',
  '수주':     'green',
  '기술협상': 'lime',
  '계약':     'cyan',
  '수행중':   'green',
  '완료':     'success',
  '실주':       'default',
  '제안포기':   'default',
};

// DnD 드롭 시 이동할 기본 대표 단계
export const SECTION_TARGET_STAGE = {
  review:   '본공고',
  proposal: '제안계획',
  running:  '수주',
  done:     '완료',
  history:  '실주',
};

// 이전 단계 복원 매핑
export const STAGE_PREV_MAP = {
  // 검토 그룹 내
  '사전공고': '공고전',
  '본공고':   '사전공고',
  '재공고':   '본공고',
  // 제안 그룹 내
  '제안진행': '제안계획',
  '제안제출': '제안진행',
  '평가':     '제안제출',
  // 수행 그룹 내
  '기술협상': '수주',
  '계약':     '기술협상',
  '수행중':   '계약',
  // 완료 → 수행중
  '완료':     '수행중',
  // 이력 → 직전 활성 단계로 복원
  '실주':     '평가',
  '제안포기': '제안계획',
};

// 기본값
export const DEFAULT_STAGE = '공고전';

// 단계 → 그룹 key 역매핑
const STAGE_TO_GROUP = STAGE_GROUPS.reduce((acc, g) => {
  g.stages.forEach((s) => { acc[s] = g.key; });
  return acc;
}, {});

export const stageGroupKey = (stage) => STAGE_TO_GROUP[stage] || null;

// OptGroup용 options (antd Select에 바로 사용 가능)
export const STAGE_OPTGROUPS = STAGE_GROUPS.map((g) => ({
  label: g.label,
  options: g.stages.map((s) => ({ value: s, label: s })),
}));

// 자주 쓰는 stage 집합
export const REVIEW_STAGES   = BUCKET_STAGES.review;
export const PROPOSAL_STAGES = BUCKET_STAGES.proposal;
export const RUNNING_STAGES  = BUCKET_STAGES.running;  // 수행중까지 (완료 제외)
export const DONE_STAGES     = BUCKET_STAGES.done;
export const HISTORY_STAGES  = BUCKET_STAGES.history;

// 활성(완료/이력 제외) 단계 — 지연/주의 계산에 사용
export const ACTIVE_STAGES = [
  ...REVIEW_STAGES, ...PROPOSAL_STAGES, ...RUNNING_STAGES,
];

// 입찰(의견) 마감일 기준 단계
export const DEADLINE_STAGES = [...REVIEW_STAGES, ...PROPOSAL_STAGES];

// 수주여부 판정용
export const WON_STAGES  = [...RUNNING_STAGES, ...DONE_STAGES];
export const LOST_STAGES = [...HISTORY_STAGES];
