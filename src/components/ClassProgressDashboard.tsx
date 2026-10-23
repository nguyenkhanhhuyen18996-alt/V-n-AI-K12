import React, { useState, useEffect, useCallback } from 'react';
import {
  UserAccount,
  StudentProfile,
  StudentSurveyProgressStatus,
  StudentSurveyData,
  ReadingAttempt,
  WritingSubmissionRecord,
  ClassroomRecord,
  MAX_ACTIVE_CLASSES_PER_TEACHER,
  MAX_ENROLLED_STUDENTS_PER_CLASS
} from '../types';
import {
  resetActivationCodeForStudent,
  toggleAccountLock,
  addNewStudent,
  importBatchStudents,
  fetchTeacherClasses,
  createTeacherClassroom
} from '../services/accountService';
import { TEST_SCENARIOS_PROFILES } from '../data/mockProfiles';
import { analyzeStudentCompetency } from '../services/competencyAnalytics';
import {
  Users,
  Search,
  Filter,
  CheckCircle,
  AlertTriangle,
  Clock,
  KeyRound,
  Lock,
  Unlock,
  UserPlus,
  FileSpreadsheet,
  Printer,
  Copy,
  Check,
  ChevronRight,
  TrendingUp,
  Award,
  AlertCircle,
  Sparkles,
  RefreshCw,
  Eye,
  X,
  PlusCircle,
  Layers
} from 'lucide-react';

interface ClassProgressDashboardProps {
  accounts: UserAccount[];
  isDemoMode?: boolean;
  studentStatesMap?: Record<
    string,
    {
      survey: StudentSurveyData;
      readingAttempts: ReadingAttempt[];
      writingRecords: WritingSubmissionRecord[];
    }
  >;
  onRefreshAccounts: () => void;
  onSelectStudentProfile: (studentId: string) => void;
}

const DEMO_STUDENT_ACCOUNTS: UserAccount[] = Object.values(TEST_SCENARIOS_PROFILES).map((p, idx) => ({
  id: p.id,
  username: p.studentCode,
  fullName: p.fullName,
  role: 'student',
  className: p.className,
  isActivated: idx < 4,
  createdAt: '2026-10-01',
  status: idx < 4 ? 'active' : 'pending_activation'
}));

export const ClassProgressDashboard: React.FC<ClassProgressDashboardProps> = ({
  accounts,
  isDemoMode = false,
  studentStatesMap = {},
  onRefreshAccounts,
  onSelectStudentProfile
}) => {
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<
    'all' | 'actual_data_ready' | 'quick_surveyed' | 'not_surveyed' | 'needs_attention' | 'pending_activation' | 'high_achiever'
  >('all');
  const [searchKeyword, setSearchKeyword] = useState<string>('');

  // Danh sách lớp học thật của Giáo viên & hạn mức cấp lớp (Tối đa 5 lớp / GV, 50 HS / lớp)
  const [teacherClasses, setTeacherClasses] = useState<ClassroomRecord[]>([]);
  const [activeClassesCount, setActiveClassesCount] = useState<number>(0);
  const [remainingClassesQuota, setRemainingClassesQuota] = useState<number>(MAX_ACTIVE_CLASSES_PER_TEACHER);
  const [isCreateClassOpen, setIsCreateClassOpen] = useState<boolean>(false);
  const [newClassNameInput, setNewClassNameInput] = useState<string>('');
  const [newClassSchoolYear, setNewClassSchoolYear] = useState<string>('2025-2026');

  // Modals state
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [isImportCsvOpen, setIsImportCsvOpen] = useState(false);
  const [isExportPrintOpen, setIsExportPrintOpen] = useState(false);
  const [copiedCodeStudentId, setCopiedCodeStudentId] = useState<string | null>(null);
  const [actionSuccessNotice, setActionSuccessNotice] = useState<string | null>(null);
  const [actionErrorNotice, setActionErrorNotice] = useState<string | null>(null);

  // Form Thêm học sinh
  const [newStudentCode, setNewStudentCode] = useState('');
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentClass, setNewStudentClass] = useState('');
  const [newStudentEmail, setNewStudentEmail] = useState('');
  const [newStudentNotes, setNewStudentNotes] = useState('');

  // Form Nhập hàng loạt (Không chứa thông tin cá nhân thật)
  const [batchRawText, setBatchRawText] = useState(
    '12A1-01, Học sinh Lớp 12 (Mẫu 01), 12A1, hs01@truong.edu.vn\n12A1-02, Học sinh Lớp 12 (Mẫu 02), 12A1,'
  );

  const loadTeacherClasses = useCallback(async () => {
    if (isDemoMode) return;
    try {
      const data = await fetchTeacherClasses();
      setTeacherClasses(data.classes);
      setActiveClassesCount(data.quota.activeClassesCount);
      setRemainingClassesQuota(data.quota.remainingClassesQuota);
      if (data.classes.length > 0 && !newStudentClass) {
        setNewStudentClass(data.classes[0].name);
      }
    } catch {
      // ignore if not logged in
    }
  }, [isDemoMode, newStudentClass]);

  useEffect(() => {
    loadTeacherClasses();
  }, [loadTeacherClasses, accounts.length]);

  // Lọc danh sách học sinh: Tách biệt hoàn toàn chế độ thật và chế độ Dữ liệu minh họa
  const studentAccounts = isDemoMode
    ? DEMO_STUDENT_ACCOUNTS
    : accounts.filter((a) => a.role === 'student');

  const filteredByClass = studentAccounts.filter((a) => {
    if (selectedClass === 'all') return true;
    return a.className === selectedClass;
  });

  const allDemoProfiles = Object.values(TEST_SCENARIOS_PROFILES);

  const getStudentStats = (acc: UserAccount) => {
    // Trong chế độ thật: Chỉ lấy dữ liệu gắn đúng theo UID ổn định (acc.id), tuyệt đối không lấy từ TEST_SCENARIOS_PROFILES
    const realState = !isDemoMode ? studentStatesMap[acc.id] : undefined;
    const demoProfile = isDemoMode
      ? allDemoProfiles.find((p) => p.id === acc.id || p.studentCode === acc.username)
      : undefined;

    const readingAttempts = isDemoMode
      ? demoProfile?.readingAttempts || []
      : realState?.readingAttempts || [];
    const writingRecords = isDemoMode
      ? demoProfile?.writingRecords || []
      : realState?.writingRecords || [];
    const survey = isDemoMode ? demoProfile?.survey : realState?.survey;

    const readingCount = readingAttempts.length;
    const writingCount = writingRecords.length;
    const hasActualData = readingCount > 0 || writingCount > 0;
    const surveyCompleted = Boolean(survey?.isCompleted);

    let surveyStatus: StudentSurveyProgressStatus = 'not_surveyed';
    if (hasActualData) {
      surveyStatus = 'actual_data_ready';
    } else if (surveyCompleted) {
      surveyStatus = 'quick_surveyed';
    } else {
      surveyStatus = 'not_surveyed';
    }

    // Tuyệt đối không gán điểm trung bình 7.0 giả khi học sinh chưa có bài làm thực tế
    type AlertTagType =
      | 'overconfident_risk'
      | 'underconfident_strength'
      | 'weak_rubric'
      | 'good_progress'
      | 'normal';
    let avgScore: number | null = null;
    let alertTag: AlertTagType = 'normal';
    let alertText = '';

    if (hasActualData && survey) {
      const comp = analyzeStudentCompetency(survey, readingAttempts, writingRecords);
      avgScore = comp.actualOverallScore;
      if (comp.gapAnalysisList.some((g) => g.gapStatus === 'overconfident_risk')) {
        alertTag = 'overconfident_risk';
        alertText = 'Tự đánh giá cao hơn kết quả thực tế';
      } else if (comp.gapAnalysisList.some((g) => g.gapStatus === 'underconfident_strength')) {
        alertTag = 'underconfident_strength';
        alertText = 'Bài làm thực tế tốt hơn mức tự đánh giá';
      } else if (comp.recurringMistakes.length > 0) {
        alertTag = 'weak_rubric';
        alertText = comp.recurringMistakes[0].title;
      } else if (comp.progressTrend === 'improving') {
        alertTag = 'good_progress';
        alertText = 'Tiến bộ rõ rệt qua các bài luyện';
      }
    }

    return {
      surveyCompleted,
      surveyStatus,
      readingCount,
      writingCount,
      avgScore,
      alertTag,
      alertText,
      targetScore: survey?.targetScore ?? null
    };
  };

  const studentsWithStats = filteredByClass.map((acc) => ({
    account: acc,
    stats: getStudentStats(acc)
  }));

  // Áp dụng bộ lọc trạng thái & từ khóa
  const finalDisplayList = studentsWithStats.filter(({ account, stats }) => {
    const matchSearch =
      account.fullName.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      account.username.toLowerCase().includes(searchKeyword.toLowerCase());

    if (!matchSearch) return false;

    if (filterStatus === 'all') return true;
    if (filterStatus === 'actual_data_ready') {
      return stats.surveyStatus === 'actual_data_ready';
    }
    if (filterStatus === 'quick_surveyed') {
      return stats.surveyStatus === 'quick_surveyed';
    }
    if (filterStatus === 'not_surveyed') {
      return stats.surveyStatus === 'not_surveyed';
    }
    if (filterStatus === 'needs_attention') {
      return (
        stats.alertTag === 'overconfident_risk' ||
        stats.alertTag === 'weak_rubric' ||
        account.status === 'locked'
      );
    }
    if (filterStatus === 'pending_activation') {
      return !account.isActivated;
    }
    if (filterStatus === 'high_achiever') {
      return stats.avgScore !== null && stats.avgScore >= 8.0;
    }
    return true;
  });

  // Tính toán số liệu tổng hợp lớp
  const totalInClass = filteredByClass.length;
  const activatedCount = filteredByClass.filter((a) => a.isActivated).length;
  const activatedPct = totalInClass > 0 ? Math.round((activatedCount / totalInClass) * 100) : 0;

  // Đếm 3 trạng thái
  const actualDataCount = studentsWithStats.filter((s) => s.stats.surveyStatus === 'actual_data_ready').length;
  const quickSurveyedCount = studentsWithStats.filter((s) => s.stats.surveyStatus === 'quick_surveyed').length;
  const notSurveyedCount = studentsWithStats.filter((s) => s.stats.surveyStatus === 'not_surveyed').length;

  const totalReadingAttempts = studentsWithStats.reduce((sum, s) => sum + s.stats.readingCount, 0);
  const totalWritingRecords = studentsWithStats.reduce((sum, s) => sum + s.stats.writingCount, 0);

  const studentsWithActualScore = studentsWithStats.filter((s) => s.stats.avgScore !== null);
  const avgClassScore =
    studentsWithActualScore.length > 0
      ? (
          studentsWithActualScore.reduce((sum, s) => sum + (s.stats.avgScore || 0), 0) /
          studentsWithActualScore.length
        ).toFixed(1)
      : '—';

  const needsSupportCount = studentsWithStats.filter(
    (s) =>
      s.stats.alertTag === 'overconfident_risk' ||
      s.stats.alertTag === 'weak_rubric'
  ).length;

  // Xử lý cấp lại mã kích hoạt cho học sinh
  const handleResetCode = async (studentId: string, studentName: string) => {
    setActionErrorNotice(null);
    try {
      const res = await resetActivationCodeForStudent(studentId);
      if (res.success) {
        onRefreshAccounts();
        setActionSuccessNotice(
          `Đã cấp mã kích hoạt mới (${res.newCode}) cho học sinh ${studentName}. Hạn dùng 7 ngày.`
        );
        setTimeout(() => setActionSuccessNotice(null), 4000);
      }
    } catch (err: any) {
      setActionErrorNotice('Lỗi cấp lại mã kích hoạt: ' + err.message);
    }
  };

  // Xử lý khóa / mở khóa tài khoản
  const handleToggleLock = async (studentId: string, studentName: string) => {
    setActionErrorNotice(null);
    try {
      const updated = await toggleAccountLock(studentId);
      if (updated) {
        onRefreshAccounts();
        const actionText = updated.status === 'locked' ? 'Khóa' : 'Mở khóa';
        setActionSuccessNotice(`Đã ${actionText} tài khoản của học sinh ${studentName}.`);
        setTimeout(() => setActionSuccessNotice(null), 3000);
      }
    } catch (err: any) {
      setActionErrorNotice('Lỗi đổi trạng thái tài khoản: ' + err.message);
    }
  };

  // Xử lý tạo lớp học mới (Tối đa 5 lớp hoạt động / giáo viên)
  const handleCreateClassSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionErrorNotice(null);
    if (!newClassNameInput.trim()) {
      setActionErrorNotice('Vui lòng nhập tên lớp học (Ví dụ: 12A1).');
      return;
    }

    try {
      const res = await createTeacherClassroom(newClassNameInput.trim());
      if (!res.success || !res.classroom) {
        setActionErrorNotice(res.message || 'Không thể tạo lớp mới.');
        return;
      }
      await loadTeacherClasses();
      onRefreshAccounts();
      setSelectedClass(res.classroom.name);
      setNewStudentClass(res.classroom.name);
      setNewClassNameInput('');
      setIsCreateClassOpen(false);
      const rem = res.quota?.remainingClassesQuota ?? Math.max(0, MAX_ACTIVE_CLASSES_PER_TEACHER - (activeClassesCount + 1));
      setActionSuccessNotice(
        `Đã tạo lớp ${res.classroom.name} thành công! Còn có thể tạo thêm ${rem}/${MAX_ACTIVE_CLASSES_PER_TEACHER} lớp.`
      );
      setTimeout(() => setActionSuccessNotice(null), 5000);
    } catch (err: any) {
      setActionErrorNotice(err.message || 'Không thể tạo lớp mới.');
    }
  };

  // Xử lý thêm 1 học sinh mới
  const handleAddNewStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionErrorNotice(null);
    if (!newStudentCode.trim() || !newStudentName.trim()) {
      setActionErrorNotice('Vui lòng nhập Mã học sinh và Họ tên.');
      return;
    }
    const targetClass = newStudentClass || (selectedClass !== 'all' ? selectedClass : teacherClasses[0]?.name || '');
    if (!targetClass) {
      setActionErrorNotice('Vui lòng tạo lớp học trước khi ghi danh học sinh.');
      return;
    }

    try {
      const created = await addNewStudent({
        username: newStudentCode,
        fullName: newStudentName,
        className: targetClass,
        email: newStudentEmail,
        notes: newStudentNotes
      });
      await loadTeacherClasses();
      onRefreshAccounts();
      setIsAddStudentOpen(false);
      setNewStudentCode('');
      setNewStudentName('');
      setNewStudentEmail('');
      setNewStudentNotes('');
      setActionSuccessNotice(
        `Đã ghi danh học sinh ${created.fullName} vào lớp ${created.className} với mã kích hoạt 1 lần: ${created.activationCode}`
      );
      setTimeout(() => setActionSuccessNotice(null), 5000);
    } catch (err: any) {
      setActionErrorNotice(err.message || 'Lỗi thêm học sinh mới.');
    }
  };

  // Xử lý nhập hàng loạt
  const parseBatchText = (text: string) => {
    const lines = text.split('\n');
    const defaultClass = selectedClass !== 'all' ? selectedClass : teacherClasses[0]?.name || '12A1';
    const parsed: { username: string; fullName: string; className: string; email?: string }[] = [];
    for (const line of lines) {
      const parts = line.split(/[,;\t]/).map((p) => p.trim());
      if (parts.length >= 2 && parts[0] && parts[1]) {
        parsed.push({
          username: parts[0],
          fullName: parts[1],
          className: parts[2] || defaultClass,
          email: parts[3] || undefined
        });
      }
    }
    return parsed;
  };

  const handleBatchImportSubmit = async () => {
    setActionErrorNotice(null);
    const list = parseBatchText(batchRawText);
    if (list.length === 0) {
      setActionErrorNotice('Không tìm thấy dòng dữ liệu hợp lệ. Vui lòng kiểm tra định dạng.');
      return;
    }

    try {
      const result = await importBatchStudents(list);
      await loadTeacherClasses();
      onRefreshAccounts();
      setIsImportCsvOpen(false);
      setActionSuccessNotice(
        `Đã nhập thành công ${result.addedCount} học sinh mới và tự động sinh mã kích hoạt dùng 1 lần (Bỏ qua ${result.skippedCount} mã trùng/vượt giới hạn).`
      );
      setTimeout(() => setActionSuccessNotice(null), 5000);
    } catch (err: any) {
      setActionErrorNotice('Lỗi nhập dữ liệu: ' + err.message);
    }
  };

  // Sao chép mã kích hoạt vào clipboard
  const handleCopyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeStudentId(id);
    setTimeout(() => setCopiedCodeStudentId(null), 2000);
  };

  const activeClassRecord = teacherClasses.find((c) => c.name === selectedClass);

  return (
    <div className="space-y-6">
      {/* Thông báo thao tác lỗi */}
      {actionErrorNotice && (
        <div className="p-3.5 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-900 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
            <span className="font-semibold">{actionErrorNotice}</span>
          </div>
          <button
            onClick={() => setActionErrorNotice(null)}
            className="text-rose-700 hover:text-rose-950 p-1 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Thông báo thao tác thành công */}
      {actionSuccessNotice && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-900 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-700 shrink-0" />
            <span className="font-semibold">{actionSuccessNotice}</span>
          </div>
          <button
            onClick={() => setActionSuccessNotice(null)}
            className="text-emerald-700 hover:text-emerald-950 p-1 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* THANH QUẢN LÝ HẠN MỨC CẤP LỚP (TỐI ĐA 5 LỚP / GV, TỐI ĐA 50 HỌC SINH / LỚP) */}
      {!isDemoMode && (
        <div className="p-4 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-700" />
                <h3 className="text-xs font-bold text-[#0F172A] uppercase tracking-wider">
                  Quản lý Lớp học & Giới hạn Sĩ số (Kiểm soát tại Máy chủ)
                </h3>
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                    remainingClassesQuota > 0
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : 'bg-rose-50 text-rose-800 border-rose-300'
                  }`}
                >
                  Đang hoạt động: {activeClassesCount}/{MAX_ACTIVE_CLASSES_PER_TEACHER} lớp (Còn tạo được {remainingClassesQuota} lớp)
                </span>
              </div>
              <p className="text-[11px] text-stone-500">
                Mỗi giáo viên được tạo tối đa {MAX_ACTIVE_CLASSES_PER_TEACHER} lớp đang hoạt động, mỗi lớp tối đa {MAX_ENROLLED_STUDENTS_PER_CLASS} học sinh được ghi danh.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsCreateClassOpen(true)}
              disabled={remainingClassesQuota <= 0}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                remainingClassesQuota > 0
                  ? 'bg-[#0F172A] hover:bg-stone-800 text-white shadow-2xs'
                  : 'bg-stone-200 text-stone-500 cursor-not-allowed'
              }`}
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>
                {remainingClassesQuota > 0
                  ? `Tạo lớp mới (Còn ${remainingClassesQuota} lớp)`
                  : 'Đã đạt tối đa 5/5 lớp'}
              </span>
            </button>
          </div>

          {teacherClasses.length === 0 ? (
            <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center justify-between">
              <span>
                Bạn chưa tạo lớp học nào. Hãy bấm <strong>“Tạo lớp mới”</strong> trước khi ghi danh học sinh (tối đa 50 học sinh/lớp).
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5 pt-1">
              {teacherClasses.map((cls) => {
                const remainingSeats = Math.max(0, cls.maxCapacity - cls.enrolledCount);
                const isSelected = selectedClass === cls.name;
                const isFull = remainingSeats === 0;
                return (
                  <button
                    key={cls.id}
                    type="button"
                    onClick={() => setSelectedClass(isSelected ? 'all' : cls.name)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50/90 border-blue-500 ring-1 ring-blue-500'
                        : 'bg-stone-50/70 hover:bg-stone-100 border-stone-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-xs text-[#0F172A]">
                        Lớp {cls.name}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          isFull
                            ? 'bg-rose-100 text-rose-800'
                            : remainingSeats <= 5
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {cls.enrolledCount}/{cls.maxCapacity} HS
                      </span>
                    </div>
                    <div className="mt-1.5 w-full h-1.5 bg-stone-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          isFull ? 'bg-rose-600' : remainingSeats <= 5 ? 'bg-amber-500' : 'bg-emerald-600'
                        }`}
                        style={{
                          width: `${Math.min(100, Math.round((cls.enrolledCount / cls.maxCapacity) * 100))}%`
                        }}
                      />
                    </div>
                    <div className="mt-1 text-[10px] text-stone-600 flex items-center justify-between">
                      <span>Còn trống: <strong>{remainingSeats}</strong> chỗ</span>
                      <span>Đang hoạt động</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* THANH TỔNG QUAN TIẾN ĐỘ THEO LỚP (PROGRESS METRICS CARDS) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 bg-white rounded-xl border border-stone-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-stone-500 text-[11px] font-semibold">
            <span>Sĩ số lớp</span>
            <Users className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <div className="text-xl font-bold text-[#0F172A]">
            {totalInClass}
            {activeClassRecord && (
              <span className="text-xs font-normal text-stone-500">
                /{activeClassRecord.maxCapacity}
              </span>
            )}
          </div>
          <div className="text-[10px] text-stone-500">
            {selectedClass === 'all'
              ? `Tất cả (${teacherClasses.length} lớp)`
              : activeClassRecord
              ? `Lớp ${selectedClass} · Còn ${Math.max(0, activeClassRecord.maxCapacity - activeClassRecord.enrolledCount)} chỗ`
              : `Lớp ${selectedClass}`}
          </div>
        </div>

        <div className="p-3.5 bg-white rounded-xl border border-stone-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-stone-500 text-[11px] font-semibold">
            <span>Đã kích hoạt</span>
            <KeyRound className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="text-xl font-bold text-emerald-800">
            {activatedCount} <span className="text-xs font-normal text-stone-500">({activatedPct}%)</span>
          </div>
          <div className="text-[10px] text-stone-500">
            {totalInClass - activatedCount} em chờ kích hoạt
          </div>
        </div>

        <div className="p-3.5 bg-white rounded-xl border border-stone-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-stone-500 text-[11px] font-semibold">
            <span>Tiến độ khảo sát & Bài làm</span>
            <CheckCircle className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <div className="text-xl font-bold text-blue-900">
            {actualDataCount + quickSurveyedCount} <span className="text-xs font-normal text-stone-500">/ {totalInClass}</span>
          </div>
          <div className="text-[10px] text-stone-500 flex items-center gap-1 flex-wrap">
            <span className="text-emerald-700 font-bold">{actualDataCount} có bài</span>
            <span>·</span>
            <span className="text-blue-700 font-medium">{quickSurveyedCount} khảo sát</span>
            <span>·</span>
            <span className="text-stone-500">{notSurveyedCount} chưa làm</span>
          </div>
        </div>

        <div className="p-3.5 bg-white rounded-xl border border-stone-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-stone-500 text-[11px] font-semibold">
            <span>Bài đọc & viết</span>
            <Award className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <div className="text-xl font-bold text-stone-800">
            {totalReadingAttempts + totalWritingRecords}
          </div>
          <div className="text-[10px] text-stone-500">
            {totalReadingAttempts} đọc + {totalWritingRecords} viết
          </div>
        </div>

        <div className="p-3.5 bg-white rounded-xl border border-stone-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-stone-500 text-[11px] font-semibold">
            <span>Điểm TB chính thức</span>
            <TrendingUp className="w-3.5 h-3.5 text-purple-600" />
          </div>
          <div className="text-lg font-bold text-purple-900">
            {studentsWithActualScore.length > 0 ? `${avgClassScore} / 10` : 'Chưa có dữ liệu'}
          </div>
          <div className="text-[10px] text-stone-500">
            {studentsWithActualScore.length > 0
              ? `Tính từ ${studentsWithActualScore.length} HS đã được GV duyệt`
              : 'Chỉ tính bài Giáo viên đã duyệt'}
          </div>
        </div>

        <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-300 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-amber-800 text-[11px] font-semibold">
            <span>Cần hỗ trợ sớm</span>
            <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
          </div>
          <div className="text-xl font-bold text-amber-950">{needsSupportCount}</div>
          <div className="text-[10px] text-amber-800 font-medium">Học sinh cần lưu ý</div>
        </div>
      </div>

      {/* THANH ĐIỀU HƯỚNG & HÀNH ĐỘNG NÂNG CAO */}
      <div className="p-4 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Chọn lớp phụ trách & tìm kiếm */}
          <div className="flex flex-wrap items-center gap-2 flex-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-700">
              <span>Lớp:</span>
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="px-2.5 py-1.5 bg-stone-50 border border-stone-300 rounded-lg text-xs font-bold text-stone-800 cursor-pointer focus:outline-none"
              >
                <option value="all">Tất cả các lớp ({studentAccounts.length} HS)</option>
                {isDemoMode ? (
                  <>
                    <option value="12A1">12A1 (Minh họa)</option>
                    <option value="12A2">12A2 (Minh họa)</option>
                    <option value="12D1">12D1 (Minh họa)</option>
                  </>
                ) : (
                  teacherClasses.map((cls) => (
                    <option key={cls.id} value={cls.name}>
                      {cls.name} ({cls.enrolledCount}/{cls.maxCapacity} HS — Còn {Math.max(0, cls.maxCapacity - cls.enrolledCount)} chỗ)
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Tìm kiếm */}
            <div className="relative min-w-[200px] flex-1 max-w-xs">
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="Tìm mã hoặc tên học sinh..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>
          </div>

          {/* Các nút hành động: Thêm học sinh, Nhập CSV, Xuất mã kích hoạt */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              onClick={() => setIsAddStudentOpen(true)}
              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 rounded-lg font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5 text-blue-700" />
              <span>Thêm học sinh</span>
            </button>

            <button
              onClick={() => setIsImportCsvOpen(true)}
              className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-300 rounded-lg font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-stone-600" />
              <span>Nhập danh sách (CSV / Bảng)</span>
            </button>

            <button
              onClick={() => setIsExportPrintOpen(true)}
              className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-lg font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-emerald-700" />
              <span>Xuất mã kích hoạt (In / Gửi)</span>
            </button>
          </div>
        </div>

        {/* Bộ lọc trạng thái */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-stone-100 text-xs">
          <span className="text-[11px] font-bold text-stone-500 uppercase mr-1">Bộ lọc:</span>
          {[
            { id: 'all', label: `Tất cả (${totalInClass})` },
            { id: 'actual_data_ready', label: `Đã có bài thực tế (${actualDataCount})` },
            { id: 'quick_surveyed', label: `Đã khảo sát nhanh (${quickSurveyedCount})` },
            { id: 'not_surveyed', label: `Chưa khảo sát (${notSurveyedCount})` },
            { id: 'needs_attention', label: `Cần hỗ trợ chuyên môn (${needsSupportCount})` },
            { id: 'pending_activation', label: `Chưa kích hoạt (${totalInClass - activatedCount})` },
            { id: 'high_achiever', label: 'Khá / Giỏi (≥ 8.0)' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterStatus(tab.id as any)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                filterStatus === tab.id
                  ? 'bg-[#0F172A] text-white font-semibold shadow-2xs'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200 hover:text-stone-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* BẢNG THEO DÕI TIẾN ĐỘ VÀ QUẢN LÝ TÀI KHOẢN CHI TIẾT */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-stone-200 bg-stone-50/70 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-700" />
            <h3 className="font-bold text-sm text-[#0F172A]">
              Danh sách Học sinh & Tiến độ Rèn luyện ({finalDisplayList.length} em)
            </h3>
          </div>
          <span className="text-[11px] text-stone-500">
            Mật khẩu được băm bảo mật SHA-256 (Giáo viên không lưu plain-text)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-stone-100/80 text-stone-600 font-bold border-b border-stone-200 text-[11px] uppercase tracking-wider">
                <th className="py-3 px-4">Mã số</th>
                <th className="py-3 px-4">Họ và tên</th>
                <th className="py-3 px-3">Lớp</th>
                <th className="py-3 px-3">Tài khoản & Mã 1 lần</th>
                <th className="py-3 px-3 text-center">Tiến độ & Dữ liệu</th>
                <th className="py-3 px-3 text-center">Bài đã nộp</th>
                <th className="py-3 px-3 text-center">Điểm TB (Dự phóng)</th>
                <th className="py-3 px-4">Cảnh báo sư phạm</th>
                <th className="py-3 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-stone-700">
              {finalDisplayList.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-stone-500">
                    Không tìm thấy học sinh nào phù hợp với bộ lọc hiện tại.
                  </td>
                </tr>
              ) : (
                finalDisplayList.map(({ account, stats }) => (
                  <tr
                    key={account.id}
                    className="hover:bg-blue-50/40 transition-colors group"
                  >
                    {/* Mã số */}
                    <td className="py-3 px-4 font-mono font-bold text-stone-900">
                      {account.username}
                    </td>

                    {/* Họ tên */}
                    <td className="py-3 px-4">
                      <div className="font-bold text-stone-900">{account.fullName}</div>
                      {account.email && (
                        <div className="text-[10px] text-stone-500">{account.email}</div>
                      )}
                    </td>

                    {/* Lớp */}
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 font-semibold text-[11px]">
                        {account.className}
                      </span>
                    </td>

                    {/* Trạng thái tài khoản & Mã kích hoạt */}
                    <td className="py-3 px-3">
                      {account.status === 'locked' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold">
                          <Lock className="w-3 h-3" />
                          <span>Đang khóa</span>
                        </span>
                      ) : account.isActivated ? (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                            <CheckCircle className="w-3 h-3" />
                            <span>Đã kích hoạt</span>
                          </span>
                          <div className="text-[10px] text-stone-500">Mật khẩu riêng tư</div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-bold">
                            <Clock className="w-3 h-3" />
                            <span>Chờ kích hoạt</span>
                          </span>
                          {account.activationCode && (
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-amber-900 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-300 text-[11px]">
                                {account.activationCode}
                              </span>
                              <button
                                onClick={() =>
                                  handleCopyCode(account.activationCode!, account.id)
                                }
                                title="Sao chép mã"
                                className="text-stone-400 hover:text-stone-700 p-0.5 cursor-pointer"
                              >
                                {copiedCodeStudentId === account.id ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Tiến độ Khảo sát & Bài làm */}
                    <td className="py-3 px-3 text-center">
                      {stats.surveyStatus === 'actual_data_ready' ? (
                        <span className="inline-block px-2.5 py-1 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full text-[10px] font-bold shadow-2xs">
                          Đã có bài thực tế
                        </span>
                      ) : stats.surveyStatus === 'quick_surveyed' ? (
                        <span className="inline-block px-2.5 py-1 bg-blue-100 text-blue-800 border border-blue-300 rounded-full text-[10px] font-bold">
                          Đã khảo sát nhanh
                        </span>
                      ) : (
                        <span className="inline-block px-2.5 py-1 bg-stone-100 text-stone-600 border border-stone-200 rounded-full text-[10px] font-medium">
                          Chưa khảo sát
                        </span>
                      )}
                    </td>

                    {/* Bài đã nộp */}
                    <td className="py-3 px-3 text-center font-semibold">
                      <div className="text-stone-900">
                        {stats.readingCount + stats.writingCount} bài
                      </div>
                      <div className="text-[10px] text-stone-500 font-normal">
                        ({stats.readingCount} đọc / {stats.writingCount} viết)
                      </div>
                    </td>

                    {/* Điểm TB (Dự phóng tốt nghiệp) */}
                    <td className="py-3 px-3 text-center">
                      {stats.avgScore !== null ? (
                        <span
                          className={`inline-block px-2.5 py-1 rounded-lg font-bold tabular-nums text-xs ${
                            stats.avgScore >= 8.0
                              ? 'bg-purple-100 text-purple-900'
                              : stats.avgScore >= 6.5
                              ? 'bg-blue-100 text-blue-900'
                              : 'bg-amber-100 text-amber-900'
                          }`}
                        >
                          {stats.avgScore.toFixed(2)}
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded bg-stone-100 text-stone-500 text-[10px] font-medium">
                          Chưa có điểm
                        </span>
                      )}
                      <div className="text-[10px] text-stone-500">
                        Mục tiêu: {stats.targetScore ?? 'Chưa đặt'}
                      </div>
                    </td>

                    {/* Cảnh báo sư phạm */}
                    <td className="py-3 px-4 max-w-[220px]">
                      {stats.alertTag === 'overconfident_risk' && (
                        <div className="p-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 text-[11px]">
                          <strong className="block font-bold flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-rose-600" />
                            Nguy cơ chủ quan
                          </strong>
                          <span>{stats.alertText}</span>
                        </div>
                      )}
                      {stats.alertTag === 'underconfident_strength' && (
                        <div className="p-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-[11px]">
                          <strong className="block font-bold flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-emerald-600" />
                            Tiềm năng lớn (Tự ti)
                          </strong>
                          <span>{stats.alertText}</span>
                        </div>
                      )}
                      {stats.alertTag === 'weak_rubric' && (
                        <div className="p-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px]">
                          <strong className="block font-bold flex items-center gap-1">
                            <AlertCircle className="w-3 h-3 text-amber-600" />
                            Lỗi Rubric
                          </strong>
                          <span>{stats.alertText}</span>
                        </div>
                      )}
                      {stats.alertTag === 'good_progress' && (
                        <div className="p-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-[11px]">
                          <strong className="block font-bold flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-emerald-600" />
                            Tiến bộ tích cực
                          </strong>
                          <span>{stats.alertText}</span>
                        </div>
                      )}
                      {stats.alertTag === 'normal' && (
                        <span className="text-[11px] text-emerald-700 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          Tiến độ bình thường
                        </span>
                      )}
                    </td>

                    {/* Thao tác */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Cấp lại mã kích hoạt khi quên mật khẩu */}
                        <button
                          onClick={() => handleResetCode(account.id, account.fullName)}
                          title="Cấp lại mã kích hoạt dùng 1 lần (7 ngày)"
                          className="p-1.5 text-stone-500 hover:text-amber-800 hover:bg-amber-50 rounded-md transition-colors cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>

                        {/* Khóa / Mở khóa */}
                        <button
                          onClick={() => handleToggleLock(account.id, account.fullName)}
                          title={account.status === 'locked' ? 'Mở khóa tài khoản' : 'Tạm khóa tài khoản'}
                          className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                            account.status === 'locked'
                              ? 'text-rose-600 hover:bg-rose-50'
                              : 'text-stone-400 hover:text-stone-700 hover:bg-stone-100'
                          }`}
                        >
                          {account.status === 'locked' ? (
                            <Unlock className="w-3.5 h-3.5" />
                          ) : (
                            <Lock className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {/* Xem hồ sơ & Duyệt điểm */}
                        <button
                          onClick={() => onSelectStudentProfile(account.id)}
                          className="px-2.5 py-1 bg-stone-100 hover:bg-blue-700 hover:text-white text-stone-700 rounded-md font-semibold text-[11px] transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Hồ sơ</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: THÊM HỌC SINH MỚI THỦ CÔNG */}
      {isAddStudentOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-stone-200 overflow-hidden">
            <div className="p-4 bg-[#0F172A] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-bold">Thêm học sinh mới vào lớp</h3>
              </div>
              <button
                onClick={() => setIsAddStudentOpen(false)}
                className="text-stone-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddNewStudentSubmit} className="p-5 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-stone-700 mb-1">
                  Mã học sinh nội bộ <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={newStudentCode}
                  onChange={(e) => setNewStudentCode(e.target.value)}
                  placeholder="Ví dụ: 12A1-38"
                  className="w-full px-3 py-1.5 bg-stone-50 border border-stone-300 rounded-lg uppercase font-mono focus:outline-none focus:ring-1 focus:ring-blue-600"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">
                  Họ và tên học sinh <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  placeholder="Ví dụ: Nguyễn Văn An"
                  className="w-full px-3 py-1.5 bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">
                  Lớp học ghi danh (Tối đa {MAX_ENROLLED_STUDENTS_PER_CLASS} HS/lớp)
                </label>
                {!isDemoMode && teacherClasses.length === 0 ? (
                  <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-lg text-[11px] text-amber-900 flex items-center justify-between">
                    <span>Chưa có lớp nào. Hãy tạo lớp trước.</span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddStudentOpen(false);
                        setIsCreateClassOpen(true);
                      }}
                      className="px-2.5 py-1 bg-amber-800 text-white rounded font-bold cursor-pointer"
                    >
                      + Tạo lớp
                    </button>
                  </div>
                ) : (
                  <select
                    value={newStudentClass}
                    onChange={(e) => setNewStudentClass(e.target.value)}
                    className="w-full px-3 py-1.5 bg-stone-50 border border-stone-300 rounded-lg focus:outline-none cursor-pointer"
                  >
                    {isDemoMode ? (
                      <>
                        <option value="12A1">12A1</option>
                        <option value="12A2">12A2</option>
                        <option value="12D1">12D1</option>
                      </>
                    ) : (
                      teacherClasses.map((cls) => {
                        const rem = Math.max(0, cls.maxCapacity - cls.enrolledCount);
                        return (
                          <option key={cls.id} value={cls.name} disabled={rem <= 0}>
                            {cls.name} — Đã ghi danh {cls.enrolledCount}/{cls.maxCapacity} (Còn {rem} chỗ)
                          </option>
                        );
                      })
                    )}
                  </select>
                )}
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">
                  Email (Tùy chọn – dùng nếu đăng nhập Google)
                </label>
                <input
                  type="email"
                  value={newStudentEmail}
                  onChange={(e) => setNewStudentEmail(e.target.value)}
                  placeholder="an.12a1@thpt.edu.vn"
                  className="w-full px-3 py-1.5 bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Ghi chú sư phạm</label>
                <input
                  type="text"
                  value={newStudentNotes}
                  onChange={(e) => setNewStudentNotes(e.target.value)}
                  placeholder="Ví dụ: Cần rèn luyện đoạn văn 200 chữ"
                  className="w-full px-3 py-1.5 bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-900">
                ⚡ Hệ thống sẽ tự động sinh <strong>Mã kích hoạt dùng 1 lần (6 chữ số)</strong> có thời hạn 7 ngày để gửi cho học sinh đặt mật khẩu.
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddStudentOpen(false)}
                  className="px-3 py-1.5 text-stone-600 hover:bg-stone-100 rounded-lg cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-lg cursor-pointer"
                >
                  Tạo tài khoản học sinh
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: NHẬP DANH SÁCH TỪ CSV HOẶC BẢNG EXCEL */}
      {isImportCsvOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-stone-200 overflow-hidden">
            <div className="p-4 bg-[#0F172A] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold">Nhập danh sách học sinh (CSV / Copy Bảng)</h3>
              </div>
              <button
                onClick={() => setIsImportCsvOpen(false)}
                className="text-stone-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs">
              <p className="text-stone-600 text-[11px]">
                Dán danh sách từ Excel, Google Sheets hoặc file CSV theo định dạng:
                <br />
                <code className="text-blue-700 font-mono">
                  Mã học sinh, Họ và tên, Lớp, Email (tùy chọn)
                </code>
              </p>

              <div>
                <textarea
                  rows={6}
                  value={batchRawText}
                  onChange={(e) => setBatchRawText(e.target.value)}
                  placeholder="12A1-35, Hoàng Minh Trí, 12A1, tri@thpt.edu.vn"
                  className="w-full p-2.5 font-mono text-xs bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>

              {/* Tải file CSV từ máy */}
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-blue-700 font-semibold cursor-pointer hover:underline">
                  📁 Hoặc tải lên file .csv từ máy tính
                  <input
                    type="file"
                    accept=".csv,.txt"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          const text = event.target?.result as string;
                          if (text) setBatchRawText(text);
                        };
                        reader.readAsText(file);
                      }
                    }}
                  />
                </label>
              </div>

              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-[11px] text-emerald-900">
                ✓ Hệ thống sẽ tạo tài khoản hàng loạt và <strong>tự sinh mã kích hoạt 6 chữ số riêng biệt</strong> cho từng em.
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-[11px] text-stone-500 font-semibold">
                  Ước tính: {parseBatchText(batchRawText).length} học sinh
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsImportCsvOpen(false)}
                    className="px-3 py-1.5 text-stone-600 hover:bg-stone-100 rounded-lg cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={handleBatchImportSubmit}
                    className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg cursor-pointer"
                  >
                    Xác nhận nhập danh sách
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: XUẤT DANH SÁCH MÃ KÍCH HOẠT (IN / GỬI ZALO / SỔ LIÊN LẠC) */}
      {isExportPrintOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 bg-[#0F172A] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Printer className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold">Danh sách Tài khoản & Mã Kích hoạt – Lớp {selectedClass}</h3>
              </div>
              <button
                onClick={() => setIsExportPrintOpen(false)}
                className="text-stone-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-900 flex items-center justify-between">
                <span>
                  💡 Giáo viên có thể in danh sách này để phát tại lớp, hoặc sao chép để gửi thông báo cho phụ huynh.
                </span>
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1 bg-blue-700 text-white font-bold rounded-md hover:bg-blue-800 cursor-pointer flex items-center gap-1 shrink-0 ml-2"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>In bảng này</span>
                </button>
              </div>

              <div className="border border-stone-300 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-stone-100 font-bold border-b border-stone-300 text-[11px]">
                      <th className="p-2.5">STT</th>
                      <th className="p-2.5">Mã học sinh</th>
                      <th className="p-2.5">Họ và tên</th>
                      <th className="p-2.5">Lớp</th>
                      <th className="p-2.5">Mã kích hoạt dùng 1 lần</th>
                      <th className="p-2.5">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    {filteredByClass.map((acc, index) => (
                      <tr key={acc.id} className="hover:bg-stone-50">
                        <td className="p-2.5 text-stone-500 font-medium">{index + 1}</td>
                        <td className="p-2.5 font-mono font-bold">{acc.username}</td>
                        <td className="p-2.5 font-bold text-stone-900">{acc.fullName}</td>
                        <td className="p-2.5 text-stone-600">{acc.className}</td>
                        <td className="p-2.5 font-mono font-bold text-blue-900">
                          {acc.activationCode || (
                            <span className="text-stone-400 font-normal italic">
                              (Đã kích hoạt)
                            </span>
                          )}
                        </td>
                        <td className="p-2.5">
                          {acc.isActivated ? (
                            <span className="text-emerald-700 font-semibold">Đã có mật khẩu</span>
                          ) : (
                            <span className="text-amber-700 font-semibold">Chờ kích hoạt</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-4 border-t border-stone-200 bg-stone-50 flex justify-end">
              <button
                onClick={() => setIsExportPrintOpen(false)}
                className="px-4 py-1.5 bg-stone-200 hover:bg-stone-300 text-stone-800 font-semibold rounded-lg text-xs cursor-pointer"
              >
                Đóng lại
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: TẠO LỚP HỌC MỚI (TỐI ĐA 5 LỚP / GIÁO VIÊN) */}
      {isCreateClassOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-stone-200 overflow-hidden">
            <div className="p-4 bg-[#0F172A] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PlusCircle className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold">
                  Tạo lớp học mới ({activeClassesCount}/{MAX_ACTIVE_CLASSES_PER_TEACHER} lớp)
                </h3>
              </div>
              <button
                onClick={() => setIsCreateClassOpen(false)}
                className="text-stone-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateClassSubmit} className="p-5 space-y-3.5 text-xs">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-900">
                Mỗi giáo viên được tạo tối đa <strong>{MAX_ACTIVE_CLASSES_PER_TEACHER} lớp đang hoạt động</strong>, mỗi lớp tối đa <strong>{MAX_ENROLLED_STUDENTS_PER_CLASS} học sinh</strong>. Bạn còn có thể tạo <strong>{remainingClassesQuota} lớp</strong>.
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">
                  Tên lớp học <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={newClassNameInput}
                  onChange={(e) => setNewClassNameInput(e.target.value.toUpperCase())}
                  placeholder="Ví dụ: 12A1, 12A2, 12D1..."
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg uppercase font-mono font-bold focus:outline-none focus:ring-1 focus:ring-blue-600"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Năm học</label>
                <input
                  type="text"
                  value={newClassSchoolYear}
                  onChange={(e) => setNewClassSchoolYear(e.target.value)}
                  placeholder="2025-2026"
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateClassOpen(false)}
                  className="px-3 py-1.5 text-stone-600 hover:bg-stone-100 rounded-lg cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={remainingClassesQuota <= 0}
                  className="px-4 py-1.5 bg-[#0F172A] hover:bg-stone-800 disabled:bg-stone-300 text-white font-bold rounded-lg cursor-pointer"
                >
                  Xác nhận tạo lớp
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
