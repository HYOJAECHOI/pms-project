import React, { useEffect, useState } from 'react';
import {
  Typography, Card, Table, Tag, Progress, Button, Modal, Form, Select,
  InputNumber, DatePicker, Input, message, Empty,
} from 'antd';
import { FileDoneOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../api/axios';

const { Title, Text } = Typography;

const REPORT_TYPES = [
  { value: '진척보고', label: '진척보고' },
  { value: '일정조정', label: '일정조정' },
  { value: '완료보고', label: '완료보고' },
];
const wbsStatusColor = { '대기': 'default', '진행중': 'blue', '완료': 'green' };
const reportStatusColor = { '대기': 'orange', '승인': 'green', '반려': 'red' };

export default function ReportRequest({ user }) {
  const [myTasks, setMyTasks] = useState([]);
  const [myReports, setMyReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalTarget, setModalTarget] = useState(null);
  const [form] = Form.useForm();
  const [reportType, setReportType] = useState('진척보고');

  const loadTasks = async () => {
    const res = await api.get('/projects');
    const projs = res.data;
    const results = await Promise.all(
      projs.map((p) =>
        api
          .get(`/projects/${p.id}/wbs`)
          .then((r) => r.data.map((w) => ({ ...w, project_id: p.id, project_name: p.name })))
          .catch(() => [])
      )
    );
    setMyTasks(results.flat().filter((w) => w.assignee_id === user?.id));
  };

  const loadReports = async () => {
    const res = await api.get('/reports/my', { params: { user_id: user.id } });
    setMyReports(res.data);
  };

  const load = () => {
    if (!user?.id) return;
    setLoading(true);
    Promise.all([loadTasks(), loadReports()])
      .catch(() => message.error('데이터를 불러오지 못했어요'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const openModal = (task) => {
    setModalTarget(task);
    setReportType('진척보고');
    form.setFieldsValue({
      report_type: '진척보고',
      current_progress: Math.round((task.actual_progress || 0) * 100),
      requested_progress: Math.round((task.actual_progress || 0) * 100),
      current_end_date: task.plan_end_date ? dayjs(task.plan_end_date) : null,
      requested_end_date: task.plan_end_date ? dayjs(task.plan_end_date) : null,
      memo: '',
    });
  };

  const closeModal = () => {
    setModalTarget(null);
    form.resetFields();
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const params = {
        wbs_id: modalTarget.id,
        requester_id: user.id,
        project_id: modalTarget.project_id,
        report_type: values.report_type,
        memo: values.memo || '',
      };
      if (values.report_type === '진척보고' || values.report_type === '완료보고') {
        if (values.current_progress != null) params.current_progress = values.current_progress / 100;
        if (values.requested_progress != null) params.requested_progress = values.requested_progress / 100;
      }
      if (values.report_type === '일정조정' || values.report_type === '완료보고') {
        if (values.current_end_date) params.current_end_date = values.current_end_date.format('YYYY-MM-DD');
        if (values.requested_end_date) params.requested_end_date = values.requested_end_date.format('YYYY-MM-DD');
      }
      await api.post('/reports', null, { params });
      message.success('보고를 제출했어요.');
      closeModal();
      loadReports();
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.detail || '보고 제출에 실패했어요.');
    }
  };

  const taskColumns = [
    { title: '프로젝트', dataIndex: 'project_name', key: 'project_name', width: 160 },
    {
      title: '구분',
      dataIndex: 'wbs_number',
      key: 'wbs_number',
      width: 80,
      render: (n) => n || '-',
    },
    { title: '작업명', dataIndex: 'title', key: 'title', render: (t) => <strong>{t}</strong> },
    {
      title: '상태',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (s) => <Tag color={wbsStatusColor[s]}>{s}</Tag>,
    },
    {
      title: '계획 완료일',
      dataIndex: 'plan_end_date',
      key: 'plan_end_date',
      width: 110,
      render: (d) => <Text style={{ fontSize: 12 }}>{d || '-'}</Text>,
    },
    {
      title: '진척률',
      key: 'progress',
      width: 140,
      render: (_, r) => (
        <Progress percent={Math.round((r.actual_progress || 0) * 100)} size="small" />
      ),
    },
    {
      title: '',
      key: 'action',
      width: 110,
      render: (_, r) => (
        <Button size="small" type="primary" icon={<FileDoneOutlined />} onClick={() => openModal(r)}>
          보고하기
        </Button>
      ),
    },
  ];

  const reportColumns = [
    {
      title: '요청일시',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (d) => (d ? <Text style={{ fontSize: 12 }}>{dayjs(d).format('YYYY-MM-DD HH:mm')}</Text> : '-'),
    },
    {
      title: '유형',
      dataIndex: 'report_type',
      key: 'report_type',
      width: 100,
      render: (t) => <Tag color="blue">{t}</Tag>,
    },
    { title: '프로젝트', dataIndex: 'project_name', key: 'project_name', width: 140 },
    {
      title: 'WBS',
      key: 'wbs',
      render: (_, r) => (
        <span>
          {r.wbs_number && <Tag style={{ fontSize: 10 }}>{r.wbs_number}</Tag>}
          {r.wbs_title}
        </span>
      ),
    },
    {
      title: '요청 진척률',
      dataIndex: 'requested_progress',
      key: 'requested_progress',
      width: 110,
      render: (v) => (v != null ? `${Math.round(v * 100)}%` : '-'),
    },
    {
      title: '요청 완료일',
      dataIndex: 'requested_end_date',
      key: 'requested_end_date',
      width: 110,
      render: (d) => d || '-',
    },
    {
      title: '상태',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (s) => <Tag color={reportStatusColor[s]}>{s}</Tag>,
    },
    {
      title: 'PM 코멘트',
      dataIndex: 'pm_comment',
      key: 'pm_comment',
      render: (c) => <Text type="secondary" style={{ fontSize: 12 }}>{c || '-'}</Text>,
    },
  ];

  return (
    <>
      <Title level={4} style={{ marginBottom: 16 }}>📝 업무 보고</Title>

      <Card title="📌 내 업무" style={{ marginBottom: 24 }} loading={loading}>
        {myTasks.length === 0 ? (
          <Empty description="할당된 업무가 없어요." />
        ) : (
          <Table dataSource={myTasks} columns={taskColumns} rowKey="id" size="small" pagination={{ pageSize: 8 }} />
        )}
      </Card>

      <Card title="📬 내가 보낸 보고" loading={loading}>
        {myReports.length === 0 ? (
          <Empty description="보낸 보고가 없어요." />
        ) : (
          <Table dataSource={myReports} columns={reportColumns} rowKey="id" size="small" pagination={{ pageSize: 10 }} />
        )}
      </Card>

      <Modal
        title={modalTarget ? `보고하기 - ${modalTarget.title}` : '보고하기'}
        open={!!modalTarget}
        onOk={handleSubmit}
        onCancel={closeModal}
        okText="제출"
        cancelText="취소"
        destroyOnClose
        width={540}
      >
        <Form form={form} layout="vertical" onValuesChange={(c) => c.report_type && setReportType(c.report_type)}>
          <Form.Item
            label="보고 유형"
            name="report_type"
            rules={[{ required: true, message: '보고 유형을 선택해주세요.' }]}
          >
            <Select options={REPORT_TYPES} />
          </Form.Item>

          {(reportType === '진척보고' || reportType === '완료보고') && (
            <>
              <Form.Item label="현재 진척률 (%)" name="current_progress">
                <InputNumber min={0} max={100} style={{ width: '100%' }} disabled />
              </Form.Item>
              <Form.Item
                label="요청 진척률 (%)"
                name="requested_progress"
                rules={[{ required: true, message: '요청 진척률을 입력해주세요.' }]}
              >
                <InputNumber min={0} max={100} style={{ width: '100%' }} />
              </Form.Item>
            </>
          )}

          {(reportType === '일정조정' || reportType === '완료보고') && (
            <>
              <Form.Item label="현재 계획 완료일" name="current_end_date">
                <DatePicker style={{ width: '100%' }} disabled />
              </Form.Item>
              <Form.Item
                label="요청 완료일"
                name="requested_end_date"
                rules={[{ required: true, message: '요청 완료일을 선택해주세요.' }]}
              >
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </>
          )}

          <Form.Item label="메모" name="memo">
            <Input.TextArea rows={3} placeholder="PM에게 전달할 내용을 적어주세요." />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
