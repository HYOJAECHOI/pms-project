import React, { useEffect, useState } from 'react';
import {
  Form, Input, InputNumber, Select, Switch, Button, Typography, Card, DatePicker, Tag, Space,
} from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import api from '../api/axios';
import { useNavigate } from 'react-router-dom';
import { STAGE_GROUPS, STAGE_COLOR, DEFAULT_STAGE } from '../constants/stages';

const { Title } = Typography;
const { RangePicker } = DatePicker;
const { TextArea } = Input;

const PROJECT_TYPES        = ['PMC', 'ISP', 'BPR', '컨설팅', '감리', '구축', '기타'];
const DIVISIONS            = ['ODA', '국내공공', '민간'];
const CONTRACT_METHODS     = ['협상', '제한경쟁', '일반경쟁'];
const PARTICIPATION_LIMITS = ['중소기업', '중견기업', '대기업가능', '무제한'];
const EVALUATION_METHODS   = ['서면', '발표', '복합'];

const moneyFormatter = (v) => (v == null || v === '' ? '' : `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ','));
const moneyParser    = (v) => (v ? v.replace(/,/g, '') : '');
const pctFormatter   = (v) => (v == null || v === '' ? '' : `${v}%`);
const pctParser      = (v) => (v ? v.replace(/%/g, '') : '');

export default function ProjectCreate() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [orgs, setOrgs] = useState([]);

  useEffect(() => {
    api.get('/organizations').then((res) => setOrgs(res.data)).catch(() => {});
  }, []);

  const handleSubmit = (values) => {
    const params = new URLSearchParams();
    const addStr = (k, v) => { if (v != null && v !== '') params.append(k, v); };
    const addDate = (k, v, fmt) => { if (v) params.append(k, v.format(fmt)); };

    addStr('name', values.name);
    addStr('description', values.description || '');
    addStr('status', values.status);
    if (values.pipeline_stage) addStr('pipeline_stage', values.pipeline_stage);
    if (values.organization_id != null) addStr('organization_id', values.organization_id);

    // 기본
    addStr('client', values.client);
    addStr('country', values.country);
    addStr('proposal_writer', values.proposal_writer);
    addStr('announcement_number', values.announcement_number);
    addStr('project_type', values.project_type);
    addStr('division', values.division);
    if (values.budget != null) addStr('budget', values.budget);
    if (values.win_amount != null) addStr('win_amount', values.win_amount);

    // 일정
    if (values.period) {
      addDate('start_date', values.period[0], 'YYYY-MM-DD');
      addDate('end_date',   values.period[1], 'YYYY-MM-DD');
    }
    addDate('announcement_date',   values.announcement_date,   'YYYY-MM-DD');
    addDate('evaluation_date',     values.evaluation_date,     'YYYY-MM-DD');
    addDate('submission_deadline', values.submission_deadline, 'YYYY-MM-DDTHH:mm:ss');
    addDate('bidding_deadline',    values.bidding_deadline,    'YYYY-MM-DDTHH:mm:ss');
    addDate('bid_deadline',        values.bid_deadline,        'YYYY-MM-DDTHH:mm:ss');

    // 계약/인력
    addStr('contract_method', values.contract_method);
    addStr('participation_limit', values.participation_limit);
    params.append('joint_performance',   values.joint_performance   ? 'true' : 'false');
    params.append('subcontract_allowed', values.subcontract_allowed ? 'true' : 'false');
    addStr('consortium_members', values.consortium_members);

    // 평가
    addStr('evaluation_method', values.evaluation_method);
    if (values.tech_score_ratio != null) addStr('tech_score_ratio', values.tech_score_ratio);
    if (values.price_score_ratio != null) addStr('price_score_ratio', values.price_score_ratio);
    addStr('evaluation_agency', values.evaluation_agency);
    addStr('negotiation_threshold', values.negotiation_threshold);

    // 내용
    addStr('overview', values.overview);
    addStr('deliverables', values.deliverables);
    addStr('pm_requirements', values.pm_requirements);
    addStr('language_requirements', values.language_requirements);
    addStr('special_notes', values.special_notes);
    addStr('announcement_url', values.announcement_url);

    api.post(`/projects?${params.toString()}`).then(() => navigate('/projects'));
  };

  return (
    <>
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/projects')} style={{ marginBottom: 16 }}>
        목록으로
      </Button>
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          status: '제안',
          pipeline_stage: DEFAULT_STAGE,
          joint_performance: false,
          subcontract_allowed: false,
        }}
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {/* ─── 기본 정보 ─── */}
          <Card size="small" title="📋 기본 정보">
            <Form.Item label="사업명" name="name" rules={[{ required: true, message: '사업명을 입력해주세요.' }]}>
              <Input placeholder="사업명 입력" />
            </Form.Item>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Form.Item label="공고번호" name="announcement_number" style={{ flex: 1, minWidth: 200 }}>
                <Input placeholder="예: 2026-0123" />
              </Form.Item>
              <Form.Item label="사업유형" name="project_type" style={{ flex: 1, minWidth: 160 }}>
                <Select
                  allowClear placeholder="선택"
                  options={PROJECT_TYPES.map((s) => ({ value: s, label: s }))}
                />
              </Form.Item>
              <Form.Item label="구분" name="division" style={{ flex: 1, minWidth: 160 }}>
                <Select
                  allowClear placeholder="선택"
                  options={DIVISIONS.map((s) => ({ value: s, label: s }))}
                />
              </Form.Item>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Form.Item label="발주기관" name="client" style={{ flex: 1, minWidth: 200 }}>
                <Input placeholder="예: 한국전자통신연구원" />
              </Form.Item>
              <Form.Item label="국가/지역" name="country" style={{ flex: 1, minWidth: 160 }}>
                <Input placeholder="예: 대한민국" />
              </Form.Item>
              <Form.Item label="소속 본부 (조직)" name="organization_id" style={{ flex: 1, minWidth: 200 }}>
                <Select
                  options={orgs.map((o) => ({ value: o.id, label: o.name }))}
                  placeholder="선택"
                  allowClear
                />
              </Form.Item>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Form.Item label="사업예산(추정) (원)" name="budget" style={{ flex: 1, minWidth: 200 }}>
                <InputNumber
                  style={{ width: '100%' }} min={0} step={1000000}
                  formatter={moneyFormatter} parser={moneyParser}
                />
              </Form.Item>
              <Form.Item label="수주금액 (원)" name="win_amount" style={{ flex: 1, minWidth: 200 }}>
                <InputNumber
                  style={{ width: '100%' }} min={0} step={1000000}
                  formatter={moneyFormatter} parser={moneyParser}
                />
              </Form.Item>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Form.Item label="상태" name="status" style={{ flex: 1, minWidth: 120 }}>
                <Select>
                  <Select.Option value="제안">제안</Select.Option>
                  <Select.Option value="수행">수행</Select.Option>
                  <Select.Option value="종료">종료</Select.Option>
                </Select>
              </Form.Item>
              <Form.Item label="파이프라인 단계" name="pipeline_stage" style={{ flex: 1, minWidth: 180 }}>
                <Select optionLabelProp="label">
                  {STAGE_GROUPS.map((g) => (
                    <Select.OptGroup
                      key={g.key}
                      label={<span style={{ color: g.color, fontWeight: 600 }}>{g.icon} {g.label}</span>}
                    >
                      {g.stages.map((s) => (
                        <Select.Option key={s} value={s} label={s}>
                          <Tag color={STAGE_COLOR[s] || 'default'} style={{ marginRight: 0 }}>{s}</Tag>
                        </Select.Option>
                      ))}
                    </Select.OptGroup>
                  ))}
                </Select>
              </Form.Item>
            </div>
          </Card>

          {/* ─── 일정 정보 ─── */}
          <Card size="small" title="📅 일정 정보">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Form.Item label="공고일" name="announcement_date" style={{ flex: 1, minWidth: 160 }}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="제안서 제출 마감" name="submission_deadline" style={{ flex: 1, minWidth: 200 }}>
                <DatePicker style={{ width: '100%' }} showTime format="YYYY-MM-DD HH:mm" />
              </Form.Item>
              <Form.Item label="투찰 마감일시" name="bidding_deadline" style={{ flex: 1, minWidth: 200 }}>
                <DatePicker style={{ width: '100%' }} showTime format="YYYY-MM-DD HH:mm" />
              </Form.Item>
              <Form.Item label="평가 예정일" name="evaluation_date" style={{ flex: 1, minWidth: 160 }}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </div>
            <Form.Item label="사업기간" name="period" rules={[{ required: true, message: '사업기간을 선택해주세요.' }]}>
              <RangePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="입찰마감일(legacy)" name="bid_deadline" extra="기존 호환용 필드. 투찰 마감일시를 주로 사용하세요.">
              <DatePicker style={{ width: '100%' }} showTime format="YYYY-MM-DD HH:mm" />
            </Form.Item>
          </Card>

          {/* ─── 계약/인력 정보 ─── */}
          <Card size="small" title="👥 계약/인력 정보">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Form.Item label="계약방법" name="contract_method" style={{ flex: 1, minWidth: 160 }}>
                <Select
                  allowClear placeholder="선택"
                  options={CONTRACT_METHODS.map((s) => ({ value: s, label: s }))}
                />
              </Form.Item>
              <Form.Item label="참가자격제한" name="participation_limit" style={{ flex: 1, minWidth: 160 }}>
                <Select
                  allowClear placeholder="선택"
                  options={PARTICIPATION_LIMITS.map((s) => ({ value: s, label: s }))}
                />
              </Form.Item>
              <Form.Item label="공동이행" name="joint_performance" valuePropName="checked" style={{ minWidth: 120 }}>
                <Switch checkedChildren="가능" unCheckedChildren="불가" />
              </Form.Item>
              <Form.Item label="하도급 가능" name="subcontract_allowed" valuePropName="checked" style={{ minWidth: 120 }}>
                <Switch checkedChildren="가능" unCheckedChildren="불가" />
              </Form.Item>
            </div>
            <Form.Item label="참여업체 (컨소시엄/하도급)" name="consortium_members">
              <Input placeholder="예: 컨소시엄A(주관)/하도급B" />
            </Form.Item>
            <Form.Item label="제안작성자" name="proposal_writer">
              <Input placeholder="제안 작성 담당자 이름" />
            </Form.Item>
          </Card>

          {/* ─── 평가 정보 ─── */}
          <Card size="small" title="📊 평가 정보">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Form.Item label="평가방식" name="evaluation_method" style={{ flex: 1, minWidth: 160 }}>
                <Select
                  allowClear placeholder="선택"
                  options={EVALUATION_METHODS.map((s) => ({ value: s, label: s }))}
                />
              </Form.Item>
              <Form.Item label="기술점수 비중" name="tech_score_ratio" style={{ flex: 1, minWidth: 140 }}>
                <InputNumber
                  style={{ width: '100%' }} min={0} max={100}
                  formatter={pctFormatter} parser={pctParser}
                />
              </Form.Item>
              <Form.Item label="가격점수 비중" name="price_score_ratio" style={{ flex: 1, minWidth: 140 }}>
                <InputNumber
                  style={{ width: '100%' }} min={0} max={100}
                  formatter={pctFormatter} parser={pctParser}
                />
              </Form.Item>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Form.Item label="평가기관" name="evaluation_agency" style={{ flex: 1, minWidth: 200 }}>
                <Input placeholder="예: 조달청" />
              </Form.Item>
              <Form.Item label="협상적격 기준" name="negotiation_threshold" style={{ flex: 1, minWidth: 200 }}>
                <Input placeholder="예: 85점 이상" />
              </Form.Item>
            </div>
          </Card>

          {/* ─── 내용 정보 ─── */}
          <Card size="small" title="📝 내용 정보">
            <Form.Item label="사업 개요" name="overview">
              <TextArea autoSize={{ minRows: 3, maxRows: 8 }} placeholder="사업 배경, 목적, 범위 등" />
            </Form.Item>
            <Form.Item label="주요 산출물" name="deliverables">
              <TextArea autoSize={{ minRows: 2, maxRows: 6 }} placeholder="예: 요구사항정의서, 설계서, 결과보고서 등" />
            </Form.Item>
            <Form.Item label="PM 자격요건" name="pm_requirements">
              <TextArea autoSize={{ minRows: 2, maxRows: 6 }} placeholder="학력/경력/자격증 등" />
            </Form.Item>
            <Form.Item label="언어 요건" name="language_requirements">
              <Input placeholder="예: 영어 업무 가능자" />
            </Form.Item>
            <Form.Item label="특이사항" name="special_notes">
              <TextArea autoSize={{ minRows: 2, maxRows: 6 }} placeholder="유의할 특이 조건" />
            </Form.Item>
            <Form.Item label="공고문 URL" name="announcement_url">
              <Input placeholder="https://..." />
            </Form.Item>
            <Form.Item label="설명(내부 메모)" name="description">
              <TextArea placeholder="내부 공유용 메모" rows={3} />
            </Form.Item>
          </Card>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">생성하기</Button>
              <Button onClick={() => navigate('/projects')}>취소</Button>
            </Space>
          </Form.Item>
        </Space>
      </Form>
    </>
  );
}
