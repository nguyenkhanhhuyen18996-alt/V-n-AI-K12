import React, { useState, useEffect } from 'react';
import {
  AdminOverviewData,
  TeacherRegistrationRecord,
  MAX_ACTIVE_CLASSES_PER_TEACHER,
  MAX_ENROLLED_STUDENTS_PER_CLASS
} from '../types';
import {
  fetchAdminOverview,
  reviewTeacherRegistrationByAdmin
} from '../services/accountService';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';
import {
  ShieldCheck,
  Users,
  CheckCircle,
  XCircle,
  Lock,
  Unlock,
  Clock,
  Phone,
  Mail,
  Layers,
  AlertTriangle,
  RefreshCw,
  FileCheck,
  History,
  Search,
  PieChart as PieChartIcon,
  BarChart3,
  GraduationCap
} from 'lucide-react';

export const AdminPortal: React.FC = () => {
  const [overview, setOverview] = useState<AdminOverviewData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeAdminTab, setActiveAdminTab] = useState<'management' | 'statistics'>('management');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // State cho hộp thoại Từ chối / Tạm khóa kèm lí do
  const [reviewModalTarget, setReviewModalTarget] = useState<{
    teacher: TeacherRegistrationRecord;
    action: 'reject' | 'suspend';
  } | null>(null);
  const [reasonInput, setReasonInput] = useState<string>('');
  const [isSubmittingReview, setIsSubmittingReview] = useState<boolean>(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await fetchAdminOverview();
      setOverview(data);
    } catch (err: any) {
      setActionNotice({
        type: 'error',
        text: err.message || 'Không thể tải dữ liệu Quản trị viên.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleQuickReview = async (
    teacher: TeacherRegistrationRecord,
    action: 'approve' | 'reactivate'
  ) => {
    setActionNotice(null);
    setIsSubmittingReview(true);
    try {
      const res = await reviewTeacherRegistrationByAdmin({
        teacherUid: teacher.teacherUid,
        registrationId: teacher.id,
        action
      });
      if (res.success) {
        setActionNotice({ type: 'success', text: res.message });
        await loadData();
      } else {
        setActionNotice({ type: 'error', text: res.message });
      }
    } catch (err: any) {
      setActionNotice({ type: 'error', text: err.message || 'Lỗi khi duyệt giáo viên.' });
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleSubmitReasonModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewModalTarget) return;
    if (!reasonInput.trim()) {
      setActionNotice({
        type: 'error',
        text: 'Vui lòng nhập rõ lí do từ chối hoặc tạm khóa giáo viên.'
      });
      return;
    }

    setIsSubmittingReview(true);
    setActionNotice(null);
    try {
      const res = await reviewTeacherRegistrationByAdmin({
        teacherUid: reviewModalTarget.teacher.teacherUid,
        registrationId: reviewModalTarget.teacher.id,
        action: reviewModalTarget.action,
        reason: reasonInput.trim()
      });
      if (res.success) {
        setActionNotice({ type: 'success', text: res.message });
        setReviewModalTarget(null);
        setReasonInput('');
        await loadData();
      } else {
        setActionNotice({ type: 'error', text: res.message });
      }
    } catch (err: any) {
      setActionNotice({ type: 'error', text: err.message || 'Lỗi xử lý xét duyệt.' });
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const registrations = overview?.registrations || [];
  const filteredRegistrations = registrations.filter((reg) => {
    const matchStatus = filterStatus === 'all' || reg.approvalStatus === filterStatus;
    const kw = searchKeyword.trim().toLowerCase();
    const matchSearch =
      !kw ||
      reg.fullName.toLowerCase().includes(kw) ||
      reg.username.toLowerCase().includes(kw) ||
      reg.phone.toLowerCase().includes(kw) ||
      reg.gmail.toLowerCase().includes(kw);
    return matchStatus && matchSearch;
  });

  // Dữ liệu thống kê cho tab 'Tổng quan thống kê'
  const totalTeachersCount = overview?.summary.totalTeachers ?? 0;
  const approvedTeachersCount = overview?.summary.approvedTeachersCount ?? 0;
  const totalStudentsCount = overview?.summary.totalEnrolledStudents ?? 0;
  const totalActiveClassesCount = overview?.summary.totalActiveClasses ?? 0;
  const totalUsersCount = totalTeachersCount + totalStudentsCount;

  const roleDistributionData = [
    {
      name: 'Giáo viên',
      value: totalTeachersCount,
      approved: approvedTeachersCount,
      color: '#1D4ED8' // Blue-700
    },
    {
      name: 'Học sinh',
      value: totalStudentsCount,
      color: '#047857' // Emerald-700
    }
  ];

  const systemScaleBarData = [
    {
      category: 'Giáo viên đã duyệt',
      count: approvedTeachersCount,
      fill: '#1D4ED8'
    },
    {
      category: 'Lớp đang hoạt động',
      count: totalActiveClassesCount,
      fill: '#6D28D9'
    },
    {
      category: 'Học sinh đang ghi danh',
      count: totalStudentsCount,
      fill: '#047857'
    }
  ];

  const teacherQuotaChartData = registrations.map((reg) => ({
    teacherName:
      reg.fullName.length > 18 ? `${reg.fullName.slice(0, 16)}…` : reg.fullName,
    activeClasses: reg.activeClassesCount ?? 0,
    enrolledStudents: reg.totalEnrolledStudentsCount ?? 0
  }));

  const renderApprovalBadge = (reg: TeacherRegistrationRecord) => {
    switch (reg.approvalStatus) {
      case 'pending_verification':
        return (
          <span className="inline-flex items-center gap-1 text-stone-600 text-[11px] font-semibold">
            <Clock className="w-3 h-3 text-stone-500" />
            <span>Chưa xác minh OTP</span>
          </span>
        );
      case 'pending_admin_approval':
        return (
          <span className="inline-flex items-center gap-1 text-amber-800 text-[11px] font-bold">
            <Clock className="w-3 h-3 text-amber-700" />
            <span>Chờ quản trị viên duyệt</span>
          </span>
        );
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 text-emerald-800 text-[11px] font-bold">
            <CheckCircle className="w-3 h-3 text-emerald-700" />
            <span>Đã duyệt (Hoạt động)</span>
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 text-rose-800 text-[11px] font-bold">
            <XCircle className="w-3 h-3 text-rose-700" />
            <span>Đã từ chối</span>
          </span>
        );
      case 'suspended':
        return (
          <span className="inline-flex items-center gap-1 text-purple-900 text-[11px] font-bold">
            <Lock className="w-3 h-3 text-purple-700" />
            <span>Đang tạm khóa</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Header Quản trị viên */}
      <div className="p-6 bg-white rounded-2xl border border-stone-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-stone-600">
            <ShieldCheck className="w-4 h-4 text-[#0F172A]" />
            <span>Phân hệ Quản trị viên Hệ thống</span>
            <span aria-hidden="true">·</span>
            <span>Kiểm soát quyền truy cập tại máy chủ</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif-literary font-bold text-[#0F172A]">
            Quản lý Giáo viên, Xác minh OTP & Giới hạn Cấp lớp
          </h1>
          <p className="text-xs sm:text-sm text-stone-600 max-w-3xl">
            Kiểm tra trạng thái xác minh quyền sở hữu (Firebase Phone OTP / Gmail OTP), xét duyệt hoặc từ chối hồ sơ giáo viên, và giám sát hạn mức tối đa {MAX_ACTIVE_CLASSES_PER_TEACHER} lớp/giáo viên × {MAX_ENROLLED_STUDENTS_PER_CLASS} học sinh/lớp.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Thanh chuyển đổi Tab: Quản lý xét duyệt vs Tổng quan thống kê */}
          <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-xl border border-stone-200">
            <button
              type="button"
              onClick={() => setActiveAdminTab('management')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeAdminTab === 'management'
                  ? 'bg-[#0F172A] text-white shadow-2xs'
                  : 'text-stone-600 hover:text-[#0F172A]'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Xét duyệt & Quản lý Giáo viên</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveAdminTab('statistics')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeAdminTab === 'statistics'
                  ? 'bg-[#0F172A] text-white shadow-2xs'
                  : 'text-stone-600 hover:text-[#0F172A]'
              }`}
            >
              <PieChartIcon className="w-3.5 h-3.5" />
              <span>Tổng quan thống kê</span>
            </button>
          </div>

          <button
            type="button"
            onClick={loadData}
            disabled={isLoading}
            className="px-4 py-2 rounded-xl bg-white hover:bg-stone-100 text-[#0F172A] border border-stone-300 text-xs font-bold flex items-center gap-2 cursor-pointer shadow-2xs disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      {/* Trạng thái cấu hình dịch vụ xác minh OTP trên máy chủ */}
      {overview && (
        <div
          className={`p-4 rounded-2xl border text-xs flex flex-wrap items-center justify-between gap-3 ${
            overview.emailProviderStatus.configured
              ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
              : 'bg-amber-50 border-amber-300 text-amber-950'
          }`}
        >
          <div className="space-y-1">
            <div className="font-bold flex items-center gap-2">
              <Mail className="w-4 h-4 shrink-0" />
              <span>
                Trạng thái Dịch vụ Gửi mã OTP: Firebase Phone Auth ( Đã tích hợp SDK ) · Dịch vụ Gmail OTP phía máy chủ:{' '}
                {overview.emailProviderStatus.configured
                  ? `Đang bật (${overview.emailProviderStatus.providerName})`
                  : 'Chưa cấu hình biến môi trường SMTP/Resend'}
              </span>
            </div>
            {!overview.emailProviderStatus.configured && (
              <p className="text-[11px] text-amber-900">
                Lưu ý: Để gửi mã xác minh 6 chữ số đến Gmail thật, cần cấu hình{' '}
                <code className="font-mono font-bold bg-amber-100 px-1.5 py-0.5 rounded">
                  {overview.emailProviderStatus.missingEnvVars.join(', ')}
                </code>{' '}
                trên máy chủ. Khi chưa cấu hình, hệ thống báo rõ dịch vụ còn thiếu và tuyệt đối không giả lập xác minh.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Thông báo kết quả thao tác */}
      {actionNotice && (
        <div
          className={`p-4 rounded-xl border text-xs font-semibold flex items-center justify-between ${
            actionNotice.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-rose-50 border-rose-300 text-rose-900'
          }`}
        >
          <span>{actionNotice.text}</span>
          <button
            type="button"
            onClick={() => setActionNotice(null)}
            className="text-xs underline ml-4 cursor-pointer"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Thẻ số liệu tổng hợp */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-4 bg-white rounded-xl border border-stone-200 shadow-2xs space-y-1">
          <div className="text-[11px] font-semibold text-stone-500">Tổng giáo viên đăng ký</div>
          <div className="text-2xl font-bold tabular-nums text-[#0F172A]">
            {overview?.summary.totalTeachers ?? 0}
          </div>
          <div className="text-[10px] text-stone-500">Hồ sơ trong hệ thống</div>
        </div>

        <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 shadow-2xs space-y-1">
          <div className="text-[11px] font-semibold text-amber-900">Chờ QTV duyệt</div>
          <div className="text-2xl font-bold tabular-nums text-amber-950">
            {overview?.summary.pendingApprovalCount ?? 0}
          </div>
          <div className="text-[10px] text-amber-800">Đã xác minh OTP thành công</div>
        </div>

        <div className="p-4 bg-stone-50 rounded-xl border border-stone-200 shadow-2xs space-y-1">
          <div className="text-[11px] font-semibold text-stone-600">Chờ xác minh OTP</div>
          <div className="text-2xl font-bold tabular-nums text-stone-800">
            {overview?.summary.pendingVerificationCount ?? 0}
          </div>
          <div className="text-[10px] text-stone-500">Chưa hoàn tất SĐT/Gmail</div>
        </div>

        <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 shadow-2xs space-y-1">
          <div className="text-[11px] font-semibold text-emerald-900">Giáo viên đã duyệt</div>
          <div className="text-2xl font-bold tabular-nums text-emerald-950">
            {overview?.summary.approvedTeachersCount ?? 0}
          </div>
          <div className="text-[10px] text-emerald-800">Được vào khu vực giáo viên</div>
        </div>

        <div className="p-4 bg-blue-50 rounded-xl border border-blue-200 shadow-2xs space-y-1">
          <div className="text-[11px] font-semibold text-blue-900">Tổng lớp hoạt động</div>
          <div className="text-2xl font-bold tabular-nums text-blue-950">
            {overview?.summary.totalActiveClasses ?? 0}
          </div>
          <div className="text-[10px] text-blue-800">Tối đa 5 lớp / giáo viên</div>
        </div>

        <div className="p-4 bg-purple-50 rounded-xl border border-purple-200 shadow-2xs space-y-1">
          <div className="text-[11px] font-semibold text-purple-900">Tổng học sinh đã cấp</div>
          <div className="text-2xl font-bold tabular-nums text-purple-950">
            {overview?.summary.totalEnrolledStudents ?? 0}
          </div>
          <div className="text-[10px] text-purple-800">Tối đa 50 HS / lớp</div>
        </div>
      </div>

      {/* TAB 2: TỔNG QUAN THỐNG KÊ (BIỂU ĐỒ RECHARTS) */}
      {activeAdminTab === 'statistics' && (
        <div className="space-y-6">
          {/* Hàng 1: Biểu đồ tròn tỷ lệ phân bổ vai trò (Giáo viên / Học sinh) & Thống kê Lớp / Học sinh */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Biểu đồ tròn: Tỷ lệ phân bổ vai trò người dùng (Giáo viên / Học sinh) */}
            <div className="p-6 bg-white rounded-2xl border border-stone-200 shadow-xs flex flex-col justify-between space-y-4">
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
                    <PieChartIcon className="w-4 h-4 text-blue-700" />
                    <span>Tỷ lệ Phân bổ Vai trò Người dùng (Giáo viên / Học sinh)</span>
                  </h2>
                  <span className="text-xs font-mono text-stone-500">
                    Tổng: {totalUsersCount} tài khoản
                  </span>
                </div>
                <p className="text-xs text-stone-500">
                  Biểu đồ trực quan hóa cơ cấu tài khoản Giáo viên và Học sinh hiện có trong hệ thống thực tế.
                </p>
              </div>

              {totalUsersCount === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center bg-stone-50 rounded-xl border border-stone-200/80 p-6 text-center space-y-2">
                  <Users className="w-7 h-7 text-stone-400" />
                  <p className="text-xs font-semibold text-stone-700">
                    Chưa có dữ liệu tài khoản Giáo viên hoặc Học sinh
                  </p>
                  <p className="text-[11px] text-stone-500 max-w-xs">
                    Biểu đồ tròn sẽ tự động hiển thị tỷ lệ ngay khi có giáo viên đăng ký hoặc học sinh được ghi danh vào lớp.
                  </p>
                </div>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={roleDistributionData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={88}
                        paddingAngle={3}
                        dataKey="value"
                        nameKey="name"
                        label={({ name, percent }) =>
                          `${name}: ${((percent || 0) * 100).toFixed(1)}%`
                        }
                      >
                        {roleDistributionData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: any, name: any) => [
                          `${value} tài khoản (${
                            totalUsersCount > 0
                              ? ((Number(value) / totalUsersCount) * 100).toFixed(1)
                              : '0.0'
                          }%)`,
                          name
                        ]}
                        contentStyle={{
                          borderRadius: '12px',
                          borderColor: '#E7E5E4',
                          fontSize: '12px'
                        }}
                      />
                      <Legend verticalAlign="bottom" height={32} iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Chi tiết tỷ lệ Giáo viên / Học sinh */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-stone-100 text-xs">
                <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200/80 space-y-1">
                  <div className="flex items-center justify-between text-blue-900 font-semibold">
                    <span>Giáo viên</span>
                    <span className="font-mono font-bold tabular-nums">
                      {totalUsersCount > 0
                        ? `${((totalTeachersCount / totalUsersCount) * 100).toFixed(1)}%`
                        : '0%'}
                    </span>
                  </div>
                  <div className="text-lg font-bold tabular-nums text-[#0F172A]">
                    {totalTeachersCount} giáo viên
                  </div>
                  <div className="text-[11px] text-stone-600">
                    Đã duyệt: <strong>{approvedTeachersCount}</strong> · Chờ duyệt:{' '}
                    <strong>{overview?.summary.pendingApprovalCount ?? 0}</strong>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/80 space-y-1">
                  <div className="flex items-center justify-between text-emerald-900 font-semibold">
                    <span>Học sinh</span>
                    <span className="font-mono font-bold tabular-nums">
                      {totalUsersCount > 0
                        ? `${((totalStudentsCount / totalUsersCount) * 100).toFixed(1)}%`
                        : '0%'}
                    </span>
                  </div>
                  <div className="text-lg font-bold tabular-nums text-[#0F172A]">
                    {totalStudentsCount} học sinh
                  </div>
                  <div className="text-[11px] text-stone-600">
                    Trung bình:{' '}
                    <strong>
                      {totalActiveClassesCount > 0
                        ? (totalStudentsCount / totalActiveClassesCount).toFixed(1)
                        : '0'}
                    </strong>{' '}
                    HS / lớp
                  </div>
                </div>
              </div>
            </div>

            {/* Biểu đồ cột: Tổng số lượng Lớp học & Học sinh hiện có trong hệ thống */}
            <div className="p-6 bg-white rounded-2xl border border-stone-200 shadow-xs flex flex-col justify-between space-y-4">
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-emerald-700" />
                    <span>Quy mô Lớp học & Học sinh Toàn Hệ thống</span>
                  </h2>
                  <span className="text-xs font-mono text-stone-500">
                    {totalActiveClassesCount} lớp · {totalStudentsCount} HS
                  </span>
                </div>
                <p className="text-xs text-stone-500">
                  Tổng số lượng giáo viên đã duyệt, số lớp đang hoạt động và tổng số học sinh đã được cấp tài khoản.
                </p>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={systemScaleBarData}
                    margin={{ top: 12, right: 16, left: 0, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                    <XAxis dataKey="category" tick={{ fontSize: 11, fill: '#44403C' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#57534E' }} />
                    <Tooltip
                      formatter={(value: any) => [`${value}`, 'Số lượng']}
                      contentStyle={{
                        borderRadius: '12px',
                        borderColor: '#E7E5E4',
                        fontSize: '12px'
                      }}
                    />
                    <Bar dataKey="count" name="Số lượng hiện có" radius={[8, 8, 0, 0]}>
                      {systemScaleBarData.map((entry, idx) => (
                        <Cell key={`bar-cell-${idx}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Chỉ số sử dụng hạn mức toàn hệ thống */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-stone-100 text-xs">
                <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-1">
                  <div className="text-stone-500 font-semibold">Tổng số lớp đang hoạt động</div>
                  <div className="text-lg font-bold tabular-nums text-[#0F172A]">
                    {totalActiveClassesCount}{' '}
                    <span className="text-xs font-normal text-stone-500">
                      / {approvedTeachersCount * MAX_ACTIVE_CLASSES_PER_TEACHER} lớp tối đa
                    </span>
                  </div>
                  <div className="text-[11px] text-stone-500">
                    Hạn mức: {MAX_ACTIVE_CLASSES_PER_TEACHER} lớp / giáo viên đã duyệt
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-1">
                  <div className="text-stone-500 font-semibold">Tổng sức chứa học sinh các lớp</div>
                  <div className="text-lg font-bold tabular-nums text-[#0F172A]">
                    {totalStudentsCount}{' '}
                    <span className="text-xs font-normal text-stone-500">
                      / {totalActiveClassesCount * MAX_ENROLLED_STUDENTS_PER_CLASS} chỗ
                    </span>
                  </div>
                  <div className="text-[11px] text-stone-500">
                    Còn trống:{' '}
                    <strong>
                      {Math.max(
                        0,
                        totalActiveClassesCount * MAX_ENROLLED_STUDENTS_PER_CLASS -
                          totalStudentsCount
                      )}
                    </strong>{' '}
                    chỗ trong các lớp đã mở
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Hàng 2: Biểu đồ phân bổ Số lớp & Sĩ số theo từng Giáo viên */}
          {teacherQuotaChartData.length > 0 && (
            <div className="p-6 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                    <GraduationCap className="w-4 h-4 text-purple-700" />
                    <span>Thống kê Số lớp (tối đa 5) & Sĩ số Học sinh theo từng Giáo viên</span>
                  </h3>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Giúp Quản trị viên giám sát trực quan việc sử dụng hạn mức cấp lớp và sĩ số của mỗi giáo viên.
                  </p>
                </div>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={teacherQuotaChartData}
                    margin={{ top: 10, right: 20, left: 0, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                    <XAxis dataKey="teacherName" tick={{ fontSize: 11, fill: '#44403C' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#57534E' }} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '12px',
                        borderColor: '#E7E5E4',
                        fontSize: '12px'
                      }}
                    />
                    <Legend verticalAlign="top" height={30} />
                    <Bar
                      dataKey="activeClasses"
                      name="Số lớp đang hoạt động (Tối đa 5)"
                      fill="#1D4ED8"
                      radius={[6, 6, 0, 0]}
                    />
                    <Bar
                      dataKey="enrolledStudents"
                      name="Tổng học sinh đã ghi danh"
                      fill="#047857"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 1: XÉT DUYỆT & QUẢN LÝ GIÁO VIÊN */}
      {activeAdminTab === 'management' && (
        <>
          {/* Bộ lọc & Tìm kiếm Giáo viên */}
          <div className="p-4 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {[
              { id: 'all', label: `Tất cả (${registrations.length})` },
              {
                id: 'pending_admin_approval',
                label: `Chờ quản trị viên duyệt (${overview?.summary.pendingApprovalCount ?? 0})`
              },
              {
                id: 'pending_verification',
                label: `Chưa xác minh OTP (${overview?.summary.pendingVerificationCount ?? 0})`
              },
              {
                id: 'approved',
                label: `Đã duyệt (${overview?.summary.approvedTeachersCount ?? 0})`
              },
              {
                id: 'rejected',
                label: `Đã từ chối (${overview?.summary.rejectedTeachersCount ?? 0})`
              },
              {
                id: 'suspended',
                label: `Tạm khóa (${overview?.summary.suspendedTeachersCount ?? 0})`
              }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterStatus(tab.id)}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                  filterStatus === tab.id
                    ? 'bg-[#0F172A] text-white'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative min-w-[240px]">
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="Tìm tên, SĐT, Gmail, mã GV..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600"
            />
          </div>
        </div>
      </div>

      {/* Bảng Danh sách Giáo viên đăng ký & Quản lý Hạn mức Lớp */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-stone-200 bg-stone-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-700" />
            <h2 className="font-bold text-sm text-[#0F172A]">
              Danh sách Giáo viên Đăng ký & Thống kê Lớp / Học sinh ({filteredRegistrations.length})
            </h2>
          </div>
          <span className="text-[11px] text-stone-500">
            Chỉ hồ sơ đã xác minh SĐT hoặc Gmail mới có thể được phê duyệt
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-stone-100/80 text-stone-600 font-bold border-b border-stone-200 text-[11px] uppercase tracking-wider">
                <th className="py-3 px-4">Giáo viên & Mã TK</th>
                <th className="py-3 px-4">Số điện thoại & Gmail</th>
                <th className="py-3 px-4">Phương thức & Xác minh OTP</th>
                <th className="py-3 px-4">Trạng thái duyệt & Kiểm toán</th>
                <th className="py-3 px-4">Số lớp quản lí & Sĩ số (/50)</th>
                <th className="py-3 px-4 text-right">Thao tác Quản trị</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-stone-700">
              {filteredRegistrations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-stone-500">
                    Chưa có hồ sơ đăng ký giáo viên nào trong danh mục này.
                  </td>
                </tr>
              ) : (
                filteredRegistrations.map((reg) => {
                  const activeClasses = reg.activeClassesCount ?? 0;
                  const remainingClasses =
                    reg.remainingClassesQuota ??
                    Math.max(0, MAX_ACTIVE_CLASSES_PER_TEACHER - activeClasses);
                  const totalStudents = reg.totalEnrolledStudentsCount ?? 0;
                  const teacherClasses = reg.classes || [];

                  return (
                    <tr key={reg.id} className="hover:bg-stone-50/80 align-top">
                      {/* Giáo viên */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-stone-900 text-xs">{reg.fullName}</div>
                        <div className="font-mono text-[11px] text-stone-500 mt-0.5">
                          Mã: <strong className="text-stone-700">{reg.username}</strong>
                        </div>
                        <div className="text-[10px] text-stone-400 mt-0.5">
                          ĐK: {new Date(reg.createdAt).toLocaleString('vi-VN')}
                        </div>
                      </td>

                      {/* SĐT & Gmail */}
                      <td className="py-3.5 px-4 space-y-1">
                        <div className="flex items-center gap-1.5 text-stone-800 font-mono text-[11px]">
                          <Phone className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span>{reg.phone}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-stone-700 text-[11px]">
                          <Mail className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span className="break-all">{reg.gmail}</span>
                        </div>
                      </td>

                      {/* Phương thức & Trạng thái xác minh */}
                      <td className="py-3.5 px-4 space-y-1.5">
                        <div className="text-[11px] font-semibold text-stone-700">
                          Phương thức chọn:{' '}
                          <span className="text-[#0F172A] font-bold">
                            {reg.verificationMethod === 'phone_otp'
                              ? 'OTP Số điện thoại'
                              : 'Mã xác minh Gmail'}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                              reg.phoneVerified
                                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                : 'bg-stone-100 text-stone-500 border border-stone-200'
                            }`}
                          >
                            <Phone className="w-2.5 h-2.5" />
                            <span>SĐT: {reg.phoneVerified ? 'Đã xác minh' : 'Chưa XM'}</span>
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                              reg.gmailVerified
                                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                : 'bg-stone-100 text-stone-500 border border-stone-200'
                            }`}
                          >
                            <Mail className="w-2.5 h-2.5" />
                            <span>Gmail: {reg.gmailVerified ? 'Đã xác minh' : 'Chưa XM'}</span>
                          </span>
                        </div>
                      </td>

                      {/* Trạng thái duyệt & Audit */}
                      <td className="py-3.5 px-4 space-y-1.5">
                        <div>{renderApprovalBadge(reg)}</div>
                        {reg.rejectionReason && (
                          <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-[11px] text-rose-900">
                            <strong>Lí do:</strong> {reg.rejectionReason}
                          </div>
                        )}
                        {reg.suspensionReason && reg.approvalStatus === 'suspended' && (
                          <div className="p-2 rounded-lg bg-purple-50 border border-purple-200 text-[11px] text-purple-900">
                            <strong>Lí do khóa:</strong> {reg.suspensionReason}
                          </div>
                        )}
                        {reg.reviewedByName && reg.reviewedAt && (
                          <div className="text-[10px] text-stone-500">
                            Thực hiện bởi: <strong>{reg.reviewedByName}</strong>
                            <br />
                            Lúc: {new Date(reg.reviewedAt).toLocaleString('vi-VN')}
                          </div>
                        )}
                      </td>

                      {/* Số lớp & Sĩ số */}
                      <td className="py-3.5 px-4 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-900 border border-blue-200 font-bold text-[11px]">
                            {activeClasses}/{MAX_ACTIVE_CLASSES_PER_TEACHER} lớp hoạt động
                          </span>
                          <span className="text-[11px] text-stone-500">
                            (Còn tạo được <strong>{remainingClasses}</strong> lớp)
                          </span>
                        </div>
                        <div className="text-[11px] text-stone-700">
                          Tổng học sinh/tài khoản đã cấp: <strong>{totalStudents}</strong> học sinh
                        </div>
                        {teacherClasses.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {teacherClasses.map((cls) => (
                              <span
                                key={cls.id}
                                className="px-2 py-0.5 rounded bg-stone-100 border border-stone-300 text-[10px] font-mono text-stone-800"
                                title={`Còn trống ${cls.remainingSeats} chỗ`}
                              >
                                {cls.name}: {cls.enrolledCount}/{MAX_ENROLLED_STUDENTS_PER_CLASS} HS (trống{' '}
                                {cls.remainingSeats})
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Thao tác */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {(reg.approvalStatus === 'pending_admin_approval' ||
                            reg.approvalStatus === 'rejected') && (
                            <button
                              type="button"
                              disabled={!reg.isOwnershipVerified || isSubmittingReview}
                              onClick={() => handleQuickReview(reg, 'approve')}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-40"
                              title={
                                reg.isOwnershipVerified
                                  ? 'Phê duyệt cho phép sử dụng khu vực Giáo viên'
                                  : 'Giáo viên phải xác minh OTP trước khi duyệt'
                              }
                            >
                              <FileCheck className="w-3.5 h-3.5" />
                              <span>Duyệt</span>
                            </button>
                          )}

                          {reg.approvalStatus !== 'rejected' && (
                            <button
                              type="button"
                              disabled={isSubmittingReview}
                              onClick={() => {
                                setReviewModalTarget({ teacher: reg, action: 'reject' });
                                setReasonInput(reg.rejectionReason || '');
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Từ chối</span>
                            </button>
                          )}

                          {reg.approvalStatus === 'approved' && (
                            <button
                              type="button"
                              disabled={isSubmittingReview}
                              onClick={() => {
                                setReviewModalTarget({ teacher: reg, action: 'suspend' });
                                setReasonInput('');
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-300 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Lock className="w-3.5 h-3.5" />
                              <span>Tạm khóa</span>
                            </button>
                          )}

                          {reg.approvalStatus === 'suspended' && (
                            <button
                              type="button"
                              disabled={isSubmittingReview}
                              onClick={() => handleQuickReview(reg, 'reactivate')}
                              className="px-2.5 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Unlock className="w-3.5 h-3.5" />
                              <span>Mở khóa</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}

      {/* Nhật ký Kiểm toán Quản trị viên (Audit Trail) */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-stone-200 bg-stone-50 flex items-center gap-2">
          <History className="w-4 h-4 text-purple-700" />
          <h3 className="font-bold text-sm text-[#0F172A]">
            Nhật ký Phê duyệt & Thao tác Quản trị viên ({overview?.auditLogs.length ?? 0})
          </h3>
        </div>
        <div className="p-4">
          {!overview?.auditLogs || overview.auditLogs.length === 0 ? (
            <p className="text-xs text-stone-500 text-center py-4">
              Chưa có lịch sử xét duyệt nào được ghi nhận.
            </p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {overview.auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-3 rounded-xl bg-stone-50 border border-stone-200 text-xs flex flex-wrap items-center justify-between gap-2"
                >
                  <div>
                    <span className="font-bold text-[#0F172A]">{log.performedByName}</span>{' '}
                    <span>
                      đã{' '}
                      {log.action === 'approve_teacher'
                        ? 'phê duyệt'
                        : log.action === 'reject_teacher'
                        ? 'từ chối'
                        : log.action === 'suspend_teacher'
                        ? 'tạm khóa'
                        : 'mở khóa lại'}{' '}
                      giáo viên <strong>{log.targetTeacherName}</strong>
                    </span>
                    {log.reason && (
                      <span className="text-rose-800 font-medium"> — Lí do: "{log.reason}"</span>
                    )}
                  </div>
                  <span className="text-[11px] text-stone-500 font-mono">
                    {new Date(log.performedAt).toLocaleString('vi-VN')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal nhập lí do Từ chối hoặc Tạm khóa */}
      {reviewModalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 border border-stone-200 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <h3 className="font-bold text-base text-[#0F172A]">
                {reviewModalTarget.action === 'reject'
                  ? `Từ chối hồ sơ Giáo viên: ${reviewModalTarget.teacher.fullName}`
                  : `Tạm khóa tài khoản Giáo viên: ${reviewModalTarget.teacher.fullName}`}
              </h3>
              <button
                type="button"
                onClick={() => setReviewModalTarget(null)}
                className="text-stone-400 hover:text-stone-700 text-xs font-bold cursor-pointer"
              >
                Đóng
              </button>
            </div>

            <form onSubmit={handleSubmitReasonModal} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1.5">
                  Lí do {reviewModalTarget.action === 'reject' ? 'từ chối' : 'tạm khóa'} (Bắt buộc)
                </label>
                <textarea
                  rows={3}
                  required
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                  placeholder="Nhập rõ lí do để thông báo minh bạch cho giáo viên..."
                  className="w-full p-3 text-xs bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReviewModalTarget(null)}
                  className="px-4 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReview}
                  className="px-4 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingReview
                    ? 'Đang lưu...'
                    : reviewModalTarget.action === 'reject'
                    ? 'Xác nhận Từ chối'
                    : 'Xác nhận Tạm khóa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
