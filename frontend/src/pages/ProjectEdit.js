import React, { useEffect, useState } from 'react';
import { Form, Input, InputNumber, Select, Button, Typography, Card, DatePicker, Tag, Spin, message } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import api from '../api/axios';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import dayjs from 'dayjs';
import { STAGE_GROUPS, STAGE_COLOR, DEFAULT_STAGE } from '../constants/stages';

const { Title } = Typography;
const { RangePicker } = DatePicker;

// 상태 → 표시할 단계 그룹 키 (ProjectCreate.js와 동일 규칙)
const STATUS_GROUP_KEYS = {
  '제안': ['review', 'proposal'],
  '수행': ['running', 'done'],
  '종료': ['done', 'history'],
};

const getVisibleGroups = (status) => {
  const keys = STATUS_GROUP_KEYS[status];
  if (!keys) return STAGE_GROUPS;
  return STAGE_GROUPS.filter((g) => keys.includes(g.key));
};

export default function ProjectEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [form] = Form.useForm();
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const currentStatus = Form.useWatch('status', form);
  const visibleGroups = getVisibleGroups(currentStatus);

  const handleValuesChange = (changed) => {
    if (changed.status) {
      const groups = getVisibleGroups(changed.status);
      const firstStage = groups[0]?.stages[0];
      if (firstStage) form.setFieldValue('pipeline_stage', firstStage);
    }
  };

  useEffect(() => {
    api.get('/organizations').then((res) => setOrgs(res.data)).catch(() => {});
    setLoading(true);
    api.get(`/projects/${id}`)
      .then(res => {
        form.setFieldsValue({
          name: res.data.name,
          description: res.data.description || '',
          status: res.data.status,
          department_id: res.data.department_id ?? null,
          pipeline_stage: res.data.pipeline_stage || DEFAULT_STAGE,
          client: res.data.client || '',
          country: res.data.country || '',
          budget: res.data.budget ?? null,
          bid_deadline: res.data.bid_deadline ? dayjs(res.data.bid_deadline) : null,
          period: res.data.start_date && res.data.end_date
            ? [dayjs(res.data.start_date), dayjs(res.data.end_date)]
            : null,
        });
      })
      .catch(() => message.error('프로젝트 정보를 불러오지 못했어요'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = (values) => {
    if (saving) return;
    const params = new URLSearchParams();
    params.append('name', values.name);
    params.append('description', values.description || '');
    params.append('status', values.status);
    if (values.pipeline_stage) params.append('pipeline_stage', values.pipeline_stage);
    if (values.department_id != null) params.append('department_id', values.department_id);
    if (values.client != null) params.append('client', values.client);
    if (values.country != null) params.append('country', values.country);
    if (values.budget != null && values.budget !== '') params.append('budget', values.budget);
    if (values.bid_deadline) params.append('bid_deadline', values.bid_deadline.format('YYYY-MM-DDTHH:mm:ss'));
    if (values.period) {
      params.append('start_date', values.period[0].format('YYYY-MM-DD'));
      params.append('end_date', values.period[1].format('YYYY-MM-DD'));
    }
    setSaving(true);
    api.put(`/projects/${id}?${params.toString()}`)
      .then(() => {
        const from = location.state?.from;
        navigate(from || `/projects/${id}`);
      })
      .catch(() => {
        message.error('저장에 실패했어요');
        setSaving(false);
      });
  };

  const handleDelete = () => {
    if (deleting) return;
    if (window.confirm('정말 삭제할까요?')) {
      setDeleting(true);
      api.delete(`/projects/${id}`)
        .then(() => navigate(location.state?.from || '/projects'))
        .catch(() => {
          message.error('삭제에 실패했어요');
          setDeleting(false);
        });
    }
  };

  return (
    <>
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(location.state?.from || `/projects/${id}`)} style={{ marginBottom: 16 }}>
        돌아가기
      </Button>
      <Card style={{ maxWidth: 600, margin: '0 auto' }}>
        <Title level={4}>프로젝트 수정</Title>
        <Spin spinning={loading}>
        <Form form={form} layout="vertical" onFinish={handleSubmit} onValuesChange={handleValuesChange}>
          <Form.Item label="프로젝트 이름" name="name" rules={[{ required: true, message: '프로젝트 이름을 입력해주세요!' }]}>
            <Input placeholder="프로젝트 이름 입력" />
          </Form.Item>
          <Form.Item label="사업 기간" name="period" rules={[{ required: true, message: '사업 기간을 선택해주세요!' }]}>
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="설명" name="description">
            <Input.TextArea placeholder="프로젝트 설명 입력" rows={4} />
          </Form.Item>
          <Form.Item label="상태" name="status">
            <Select>
              <Select.Option value="제안">제안</Select.Option>
              <Select.Option value="수행">수행</Select.Option>
              <Select.Option value="종료">종료</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item label="단계" name="pipeline_stage">
            <Select optionLabelProp="label">
              {visibleGroups.map((g) => (
                <Select.OptGroup
                  key={g.key}
                  label={
                    <span style={{ color: g.color, fontWeight: 600 }}>
                      {g.icon} {g.label}
                    </span>
                  }
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
          <Form.Item label="소속 본부" name="department_id" extra="프로젝트를 수행할 본부">
            <Select
              options={orgs
                .filter((o) => o.parent_id != null)
                .map((o) => ({ value: o.id, label: o.name }))}
              placeholder="프로젝트를 수행할 본부 선택"
              allowClear
            />
          </Form.Item>
          <div style={{ display: 'flex', gap: 8 }}>
            <Form.Item label="발주기관" name="client" style={{ flex: 1 }}>
              <Input placeholder="예: 한국전자통신연구원" />
            </Form.Item>
            <Form.Item label="국가/지역" name="country" style={{ flex: 1 }}>
              <Input placeholder="예: 대한민국" />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Form.Item label="사업금액 (원)" name="budget" style={{ flex: 1 }}>
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                step={1000000}
                formatter={(v) => (v == null || v === '' ? '' : `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ','))}
                parser={(v) => (v ? v.replace(/,/g, '') : '')}
              />
            </Form.Item>
            <Form.Item label="입찰마감일" name="bid_deadline" style={{ flex: 1 }}>
              <DatePicker style={{ width: '100%' }} showTime format="YYYY-MM-DD HH:mm" />
            </Form.Item>
          </div>
          <Form.Item>
            <Button type="primary" htmlType="submit" style={{ marginRight: 8 }} loading={saving} disabled={saving || deleting}>수정하기</Button>
            <Button onClick={() => navigate(location.state?.from || `/projects/${id}`)} style={{ marginRight: 8 }} disabled={saving || deleting}>취소</Button>
            <Button danger onClick={handleDelete} loading={deleting} disabled={saving || deleting}>삭제하기</Button>
          </Form.Item>
        </Form>
        </Spin>
      </Card>
    </>
  );
}