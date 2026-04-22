import React, { useEffect, useMemo, useState } from 'react';
import {
  Typography, Card, Table, Tag, Select, Button, Space, Modal, Form, Input,
  Popconfirm, message, Alert, Empty, Descriptions,
} from 'antd';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../api/axios';

const { Title, Text } = Typography;

const reportStatusColor = { '대기': 'orange', '승인': 'green', '반려': 'red' };

export default function ReportReview({ user }) {
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [form] = Form.useForm();

  useEffect(() => {
    // admin은 모든 프로젝트 검토 가능, 그 외(manager)는 ProjectMember.project_role === 'PM' 인 프로젝트만
    api.get('/projects')
      .then(async (res) => {
        const allProjects = res.data || [];
        if (user?.role === 'admin') {
          setProjects(allProjects);
          if (allProjects.length > 0) setSelectedProjectId(allProjects[0].id);
          return;
        }
        const memberResults = await Promise.all(
          allProjects.map((p) =>
            api
              .get(`/projects/${p.id}/members`)
              .then((r) => ({ project: p, members: r.data || [] }))
              .catch(() => ({ project: p, members: [] }))
          )
        );
        const pmProjects = memberResults
          .filter(({ members }) =>
            members.some((m) => m.user_id === user?.id && m.project_role === 'PM')
          )
          .map(({ project }) => project);
        setProjects(pmProjects);
        if (pmProjects.length > 0) setSelectedProjectId(pmProjects[0].id);
      })
      .catch(() => message.error('프로젝트 목록을 불러오지 못했어요'));
  }, [user?.id, user?.role]);

  const loadReports = (projectId) => {
    if (!projectId) {
      setReports([]);
      return;
    }
    setLoading(true);
    api
      .get('/reports/pm', { params: { project_id: projectId } })
      .then((res) => setReports(res.data))
      .catch(() => setReports([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadReports(selectedProjectId);
  }, [selectedProjectId]);

  const counts = useMemo(() => {
    const c = { 대기: 0, 승인: 0, 반려: 0 };
    reports.forEach((r) => {
      if (c[r.status] != null) c[r.status] += 1;
    });
    return c;
  }, [reports]);

  const handleApprove = async (report) => {
    try {
      await api.put(`/reports/${report.id}/approve`);
      message.success('보고를 승인했어요. WBS가 자동 반영됐어요.');
      loadReports(selectedProjectId);
    } catch (err) {
      message.error(err?.response?.data?.detail || '승인에 실패했어요.');
    }
  };

  const openReject = (report) => {
    setRejectTarget(report);
    form.resetFields();
  };

  const handleReject = async () => {
    try {
      const { pm_comment } = await form.validateFields();
      await api.put(`/reports/${rejectTarget.id}/reject`, null, { params: { pm_comment } });
      message.success('보고를 반려했어요.');
      setRejectTarget(null);
      loadReports(selectedProjectId);
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.detail || '반려에 실패했어요.');
    }
  };

  const columns = [
    {
      title: '요청일시',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 140,
      render: (d) => (d ? <Text style={{ fontSize: 12 }}>{dayjs(d).format('MM-DD HH:mm')}</Text> : '-'),
    },
    { title: '요청자', dataIndex: 'requester_name', key: 'requester_name', width: 100 },
    {
      title: '유형',
      dataIndex: 'report_type',
      key: 'report_type',
      width: 90,
      render: (t) => <Tag color="blue">{t}</Tag>,
    },
    {
      title: 'WBS',
      key: 'wbs',
      render: (_, r) => (
        <span>
          {r.wbs_number && <Tag style={{ fontSize: 10 }}>{r.wbs_number}</Tag>}
          <strong>{r.wbs_title}</strong>
        </span>
      ),
    },
    {
      title: '진척률',
      key: 'progress',
      width: 120,
      render: (_, r) => {
        if (r.current_progress == null && r.requested_progress == null) return '-';
        const cur = r.current_progress != null ? `${Math.round(r.current_progress * 100)}%` : '-';
        const req = r.requested_progress != null ? `${Math.round(r.requested_progress * 100)}%` : '-';
        return <Text style={{ fontSize: 12 }}>{cur} → <strong>{req}</strong></Text>;
      },
    },
    {
      title: '완료일',
      key: 'end_date',
      width: 170,
      render: (_, r) => {
        if (!r.current_end_date && !r.requested_end_date) return '-';
        return (
          <Text style={{ fontSize: 11 }}>
            {r.current_end_date || '-'} → <strong>{r.requested_end_date || '-'}</strong>
          </Text>
        );
      },
    },
    {
      title: '메모',
      dataIndex: 'memo',
      key: 'memo',
      render: (m) => <Text style={{ fontSize: 12 }} type="secondary">{m || '-'}</Text>,
    },
    {
      title: '상태',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (s) => <Tag color={reportStatusColor[s]}>{s}</Tag>,
    },
    {
      title: '처리',
      key: 'action',
      width: 170,
      render: (_, r) => {
        if (r.status !== '대기') {
          return r.pm_comment ? (
            <Text type="secondary" style={{ fontSize: 11 }}>💬 {r.pm_comment}</Text>
          ) : (
            <Text type="secondary" style={{ fontSize: 11 }}>-</Text>
          );
        }
        return (
          <Space>
            <Popconfirm
              title="이 보고를 승인할까요?"
              description="승인하면 WBS에 자동으로 반영돼요."
              okText="승인"
              cancelText="취소"
              onConfirm={() => handleApprove(r)}
            >
              <Button size="small" type="primary" icon={<CheckOutlined />}>승인</Button>
            </Popconfirm>
            <Button size="small" danger icon={<CloseOutlined />} onClick={() => openReject(r)}>
              반려
            </Button>
          </Space>
        );
      },
    },
  ];

  return (
    <>
      <Title level={4} style={{ marginBottom: 16 }}>📨 보고 검토</Title>

      <Alert
        message="승인하면 보고 유형에 따라 WBS가 자동 반영돼요."
        description="진척보고 → 실적 진척률 반영 / 일정조정 → 계획 완료일 변경 / 완료보고 → 상태 완료 + 실적 진척률 100%."
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Card style={{ marginBottom: 16 }}>
        <Space size="large" wrap>
          <div>
            <Text type="secondary" style={{ marginRight: 8 }}>프로젝트</Text>
            <Select
              style={{ width: 280 }}
              placeholder={projects.length === 0 ? '관리 중인 프로젝트가 없어요.' : '프로젝트 선택'}
              value={selectedProjectId}
              onChange={setSelectedProjectId}
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
              disabled={projects.length === 0}
            />
          </div>
          <Descriptions column={3} size="small" style={{ marginBottom: 0 }}>
            <Descriptions.Item label="대기">
              <Tag color="orange">{counts.대기}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="승인">
              <Tag color="green">{counts.승인}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="반려">
              <Tag color="red">{counts.반려}</Tag>
            </Descriptions.Item>
          </Descriptions>
        </Space>
      </Card>

      <Card loading={loading}>
        {!selectedProjectId ? (
          <Empty description="프로젝트를 선택해주세요." />
        ) : reports.length === 0 ? (
          <Empty description="보고가 없어요." />
        ) : (
          <Table dataSource={reports} columns={columns} rowKey="id" size="small" pagination={{ pageSize: 10 }} />
        )}
      </Card>

      <Modal
        title={rejectTarget ? `반려 - ${rejectTarget.wbs_title}` : '반려'}
        open={!!rejectTarget}
        onOk={handleReject}
        onCancel={() => setRejectTarget(null)}
        okText="반려"
        cancelText="취소"
        okButtonProps={{ danger: true }}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label="반려 사유"
            name="pm_comment"
            rules={[{ required: true, message: '반려 사유를 입력해주세요.' }]}
          >
            <Input.TextArea rows={4} placeholder="요청자에게 전달할 반려 사유를 적어주세요." />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
