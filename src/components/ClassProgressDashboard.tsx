import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  UserAccount,
  StudentSurveyProgressStatus,
  StudentSurveyData,
  ReadingAttempt,
  WritingSubmissionRecord,
  ClassroomRecord,
  ClassJoinRequestRecord,
  ExcelImportPreviewRow,
  BatchImportRowError,
  MAX_ACTIVE_CLASSES_PER_TEACHER,
  MAX_ENROLLED_STUDENTS_PER_CLASS
} from '../types';
import {
  resetActivationCodeForStudent,
  toggleAccountLock,
  addNewStudent,
  importBatchStudents,
  fetchTeacherClasses,
  createTeacherClassroom,
  manageClassroomJoinCode,
  fetchTeacherClassJoinRequests,
  reviewClassJoinRequest,
  downloadStudentImportTemplateXlsx,
  downloadStudentImportTemplateCsv,
  exportStudentCredentialsXlsx,
  parseStudentRosterExcelOrCsvFile
} from '../services/accountService';
import { TEST_SCENARIOS_PROFILES } from '../data/mockProfiles';
import { analyzeStudentCompetency } from '../services/competencyAnalytics';
import {
  Users,
  Search,
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
  TrendingUp,
  Award,
  AlertCircle,
  Sparkles,
  RefreshCw,
  Eye,
  X,
  PlusCircle,
  Layers,
  Download,
  Upload,
  Trash2,
  UserCheck,
  UserX,
  QrCode,
  FileText
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
  const [newClassGradeInput, setNewClassGradeInput] = useState<string>('12');
  const [newClassSchoolYear, setNewClassSchoolYear] = useState<string>('2025-2026');
  const [newClassDescription, setNewClassDescription] = useState<string>('');
  const [newClassAllowJoinCode, setNewClassAllowJoinCode] = useState<boolean>(true);
  const [isSubmittingClass, setIsSubmittingClass] = useState<boolean>(false);

  // Yêu cầu tham gia lớp bằng mã chờ Giáo viên duyệt
  const [joinRequests, setJoinRequests] = useState<ClassJoinRequestRecord[]>([]);
  const [isProcessingJoinReqId, setIsProcessingJoinReqId] = useState<string | null>(null);
  const [copiedJoinCodeClassId, setCopiedJoinCodeClassId] = useState<string | null>(null);

  // Modals state
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [isImportCsvOpen, setIsImportCsvOpen] = useState(false);
  const [isExportPrintOpen, setIsExportPrintOpen] = useState(false);
  const [exportPrintMode, setExportPrintMode] = useState<'slips' | 'table'>('slips');
  const [copiedCodeStudentId, setCopiedCodeStudentId] = useState<string | null>(null);
  const [actionSuccessNotice, setActionSuccessNotice] = useState<string | null>(null);
  const [actionErrorNotice, setActionErrorNotice] = useState<string | null>(null);

  // Form Thêm 1 học sinh
  const [newStudentCode, setNewStudentCode] = useState('');
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentClass, setNewStudentClass] = useState('');
  const [newStudentEmail, setNewStudentEmail] = useState('');
  const [newStudentNotes, setNewStudentNotes] = useState('');
  const [isSubmittingSingleStudent, setIsSubmittingSingleStudent] = useState(false);

  // Form Nhập danh sách Excel (.xlsx / .csv) có Bảng xem trước (Preview Table)
  const [importTargetClass, setImportTargetClass] = useState<string>('');
  const [importFileName, setImportFileName] = useState<string>('');
  const [importParseError, setImportParseError] = useState<string | null>(null);
  const [importDraftRows, setImportDraftRows] = useState<
    {
      rowId: string;
      rowNumber: number;
      fullName: string;
      studentCode: string;
      className: string;
      notes?: string;
    }[]
  >([]);
  const [pasteQuickText, setPasteQuickText] = useState<string>('');
  const [showPasteBox, setShowPasteBox] = useState<boolean>(false);
  const [isSubmittingBatch, setIsSubmittingBatch] = useState<boolean>(false);
  const [lastBatchResult, setLastBatchResult] = useState<{
    addedCount: number;
    skippedCount: number;
    quotaRejectedCount: number;
    newAccounts: UserAccount[];
    failedRows: BatchImportRowError[];
  } | null>(null);

  const loadTeacherClassesAndRequests = useCallback(async () => {
    if (isDemoMode) return;
    try {
      const [classData, reqList] = await Promise.all([
        fetchTeacherClasses(),
        fetchTeacherClassJoinRequests()
      ]);
      setTeacherClasses(classData.classes);
      setActiveClassesCount(classData.quota.activeClassesCount);
      setRemainingClassesQuota(classData.quota.remainingClassesQuota);
      setJoinRequests(reqList);
      if (classData.classes.length > 0) {
        setNewStudentClass((prev) => prev || classData.classes[0].name);
        setImportTargetClass((prev) => prev || classData.classes[0].name);
      }
    } catch {
      // ignore if not logged in
    }
  }, [isDemoMode]);

  useEffect(() => {
    loadTeacherClassesAndRequests();
  }, [loadTeacherClassesAndRequests, accounts.length]);

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
          `Đã cấp mã kích hoạt 6 số mới (${res.newCode}) cho học sinh ${studentName}.`
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
    const cleanName = newClassNameInput.trim().toUpperCase();
    if (!cleanName) {
      setActionErrorNotice('Vui lòng nhập tên lớp học (Ví dụ: 12A1).');
      return;
    }

    setIsSubmittingClass(true);
    try {
      const res = await createTeacherClassroom(cleanName, {
        grade: newClassGradeInput,
        schoolYear: newClassSchoolYear.trim() || '2025-2026',
        description: newClassDescription.trim() || undefined,
        allowJoinByCode: newClassAllowJoinCode
      });
      if (!res.success || !res.classroom) {
        setActionErrorNotice(res.message || 'Không thể tạo lớp mới.');
        return;
      }
      await loadTeacherClassesAndRequests();
      onRefreshAccounts();
      setSelectedClass(res.classroom.name);
      setNewStudentClass(res.classroom.name);
      setImportTargetClass(res.classroom.name);
      setNewClassNameInput('');
      setNewClassDescription('');
      setIsCreateClassOpen(false);
      setActionSuccessNotice(res.message);
      setTimeout(() => setActionSuccessNotice(null), 6000);
    } catch (err: any) {
      setActionErrorNotice(err.message || 'Không thể tạo lớp mới.');
    } finally {
      setIsSubmittingClass(false);
    }
  };

  // Quản lý mã tham gia lớp (Bật/tắt, đổi mã mới, thu hồi mã)
  const handleManageJoinCode = async (
    cls: ClassroomRecord,
    action: 'toggle' | 'regenerate' | 'revoke'
  ) => {
    setActionErrorNotice(null);
    try {
      const res = await manageClassroomJoinCode(
        cls.id,
        action,
        action === 'toggle' ? !cls.allowJoinByCode : undefined
      );
      if (!res.success) {
        setActionErrorNotice(res.message);
        return;
      }
      await loadTeacherClassesAndRequests();
      setActionSuccessNotice(res.message);
      setTimeout(() => setActionSuccessNotice(null), 4500);
    } catch (err: any) {
      setActionErrorNotice(err.message || 'Không thể cập nhật mã tham gia lớp.');
    }
  };

  // Duyệt hoặc từ chối yêu cầu học sinh tham gia lớp bằng mã
  const handleReviewJoinRequest = async (
    reqItem: ClassJoinRequestRecord,
    action: 'approve' | 'reject'
  ) => {
    setActionErrorNotice(null);
    setIsProcessingJoinReqId(reqItem.id);
    try {
      const res = await reviewClassJoinRequest(reqItem.id, { action });
      if (!res.success) {
        setActionErrorNotice(res.message);
        return;
      }
      await loadTeacherClassesAndRequests();
      onRefreshAccounts();
      setActionSuccessNotice(res.message);
      setTimeout(() => setActionSuccessNotice(null), 6000);
    } catch (err: any) {
      setActionErrorNotice(err.message || 'Lỗi xử lý yêu cầu tham gia lớp.');
    } finally {
      setIsProcessingJoinReqId(null);
    }
  };

  // Xử lý thêm 1 học sinh mới (Mã học sinh và Email đều tùy chọn, hệ thống tự sinh mã nếu bỏ trống)
  const handleAddNewStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionErrorNotice(null);
    if (!newStudentName.trim()) {
      setActionErrorNotice('Vui lòng nhập Họ và tên học sinh.');
      return;
    }
    const targetClass =
      newStudentClass || (selectedClass !== 'all' ? selectedClass : teacherClasses[0]?.name || '');
    if (!targetClass) {
      setActionErrorNotice('Vui lòng tạo lớp học trước khi ghi danh học sinh.');
      return;
    }

    setIsSubmittingSingleStudent(true);
    try {
      const created = await addNewStudent({
        username: newStudentCode.trim() || undefined,
        fullName: newStudentName.trim(),
        className: targetClass,
        email: newStudentEmail.trim() || undefined,
        notes: newStudentNotes.trim() || undefined
      });
      await loadTeacherClassesAndRequests();
      onRefreshAccounts();
      setIsAddStudentOpen(false);
      setNewStudentCode('');
      setNewStudentName('');
      setNewStudentEmail('');
      setNewStudentNotes('');
      setActionSuccessNotice(
        `Đã ghi danh học sinh ${created.fullName} vào lớp ${created.className} (Mã HS: ${created.username} — Mã kích hoạt 6 số: ${created.activationCode}).`
      );
      setTimeout(() => setActionSuccessNotice(null), 6000);
    } catch (err: any) {
      setActionErrorNotice(err.message || 'Lỗi thêm học sinh mới.');
    } finally {
      setIsSubmittingSingleStudent(false);
    }
  };

  // ============================================================================
  // LOGIC BẢNG XEM TRƯỚC (PREVIEW TABLE) KHI NHẬP EXCEL (.XLSX / .CSV)
  // ============================================================================
  const effectiveDefaultImportClass =
    importTargetClass ||
    (selectedClass !== 'all' ? selectedClass : teacherClasses[0]?.name || '12A1');

  const openExcelImportModal = () => {
    setActionErrorNotice(null);
    setImportParseError(null);
    setLastBatchResult(null);
    const defaultCls = selectedClass !== 'all' ? selectedClass : teacherClasses[0]?.name || '12A1';
    setImportTargetClass(defaultCls);
    if (importDraftRows.length === 0) {
      setImportDraftRows([
        {
          rowId: 'row-init-1',
          rowNumber: 1,
          fullName: '',
          studentCode: '',
          className: defaultCls
        }
      ]);
    }
    setIsImportCsvOpen(true);
  };

  const handleExcelFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportParseError(null);
    setLastBatchResult(null);
    setImportFileName(file.name);

    const parsed = await parseStudentRosterExcelOrCsvFile(file, effectiveDefaultImportClass);
    if (parsed.error) {
      setImportParseError(parsed.error);
      setImportDraftRows([]);
      return;
    }

    setImportDraftRows(
      parsed.rows.map((r, idx) => ({
        rowId: `file-row-${Date.now()}-${idx}`,
        rowNumber: r.rowNumber,
        fullName: r.fullName,
        studentCode: r.studentCode,
        className: r.className || effectiveDefaultImportClass,
        notes: r.notes
      }))
    );
  };

  const handleParseQuickPasteText = () => {
    setImportParseError(null);
    setLastBatchResult(null);
    const lines = pasteQuickText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      setImportParseError('Vui lòng dán ít nhất 1 dòng dữ liệu học sinh.');
      return;
    }
    const nextRows = lines.map((line, idx) => {
      const parts = line.split(/[,;\t]/).map((p) => p.trim());
      if (parts.length === 1) {
        return {
          rowId: `paste-${Date.now()}-${idx}`,
          rowNumber: idx + 1,
          fullName: parts[0],
          studentCode: '',
          className: effectiveDefaultImportClass
        };
      }
      // Hỗ trợ cả "Họ và tên, Mã HS, Lớp" hoặc "Mã HS, Họ và tên, Lớp"
      const firstLooksLikeCode =
        /^[A-Za-z0-9_-]{3,20}$/.test(parts[0]) && !parts[0].includes(' ') && parts[1]?.includes(' ');
      const fullName = firstLooksLikeCode ? parts[1] : parts[0];
      const studentCode = (firstLooksLikeCode ? parts[0] : parts[1] || '').toUpperCase();
      const className = (parts[2] || effectiveDefaultImportClass).toUpperCase();
      return {
        rowId: `paste-${Date.now()}-${idx}`,
        rowNumber: idx + 1,
        fullName,
        studentCode,
        className
      };
    });
    setImportDraftRows(nextRows);
    setShowPasteBox(false);
    setPasteQuickText('');
  };

  // Tính toán trạng thái kiểm tra từng dòng trong Bảng xem trước (Preview Table)
  const previewValidation = useMemo(() => {
    const existingSystemUsernames = new Set(
      accounts.map((a) => a.username.trim().toUpperCase())
    );
    const existingClassStudentsMap = new Map<string, Set<string>>();
    const existingClassCountMap = new Map<string, number>();

    for (const cls of teacherClasses) {
      const cName = cls.name.toUpperCase();
      existingClassCountMap.set(cName, cls.enrolledCount);
      existingClassStudentsMap.set(cName, new Set());
    }
    for (const acc of studentAccounts) {
      const cName = (acc.className || '').toUpperCase();
      if (!existingClassStudentsMap.has(cName)) {
        existingClassStudentsMap.set(cName, new Set());
      }
      existingClassStudentsMap.get(cName)!.add(acc.username.trim().toUpperCase());
      if (!existingClassCountMap.has(cName)) {
        existingClassCountMap.set(cName, 0);
      }
    }

    const seenCodesInFile = new Map<string, number>();
    for (const r of importDraftRows) {
      const code = r.studentCode.trim().toUpperCase();
      if (code) {
        seenCodesInFile.set(code, (seenCodesInFile.get(code) || 0) + 1);
      }
    }

    const acceptedCountPerClass = new Map<string, number>();
    const autoSeqCounterPerClass = new Map<string, number>();

    const getNextAutoCodePreview = (cName: string) => {
      const prefix = cName.replace(/[^A-Z0-9]/g, '') || '12A1';
      let seq = (autoSeqCounterPerClass.get(prefix) || 0) + 1;
      while (seq <= 999) {
        const candidate = `${prefix}-HS${seq < 10 ? `0${seq}` : seq}`;
        if (!existingSystemUsernames.has(candidate) && !seenCodesInFile.has(candidate)) {
          autoSeqCounterPerClass.set(prefix, seq);
          return candidate;
        }
        seq++;
      }
      return `${prefix}-HS${seq}`;
    };

    const evaluatedRows: ExcelImportPreviewRow[] = importDraftRows.map((row, idx) => {
      const cleanName = row.fullName.trim();
      const cleanCode = row.studentCode.trim().toUpperCase();
      const cleanClass = (row.className || effectiveDefaultImportClass || '12A1')
        .trim()
        .toUpperCase();

      const currentEnrolled = existingClassCountMap.get(cleanClass) ?? 0;
      const addedSoFar = acceptedCountPerClass.get(cleanClass) ?? 0;
      const inClassSet = existingClassStudentsMap.get(cleanClass) || new Set<string>();

      if (!cleanName) {
        return {
          rowId: row.rowId,
          rowNumber: row.rowNumber || idx + 1,
          fullName: row.fullName,
          studentCode: row.studentCode,
          className: cleanClass,
          notes: row.notes,
          status: 'missing_name',
          statusMessage: 'Thiếu Họ và tên học sinh'
        };
      }

      if (cleanCode && inClassSet.has(cleanCode)) {
        return {
          rowId: row.rowId,
          rowNumber: row.rowNumber || idx + 1,
          fullName: row.fullName,
          studentCode: row.studentCode,
          className: cleanClass,
          notes: row.notes,
          status: 'already_in_class',
          statusMessage: `Học sinh mã ${cleanCode} đã có trong lớp ${cleanClass}`
        };
      }

      if (cleanCode && (seenCodesInFile.get(cleanCode) || 0) > 1) {
        return {
          rowId: row.rowId,
          rowNumber: row.rowNumber || idx + 1,
          fullName: row.fullName,
          studentCode: row.studentCode,
          className: cleanClass,
          notes: row.notes,
          status: 'duplicate_in_file',
          statusMessage: `Mã "${cleanCode}" bị trùng lặp trong danh sách đang nhập`
        };
      }

      if (cleanCode && existingSystemUsernames.has(cleanCode)) {
        return {
          rowId: row.rowId,
          rowNumber: row.rowNumber || idx + 1,
          fullName: row.fullName,
          studentCode: row.studentCode,
          className: cleanClass,
          notes: row.notes,
          status: 'already_in_system',
          statusMessage: `Mã "${cleanCode}" đã tồn tại ở lớp khác trên hệ thống`
        };
      }

      if (currentEnrolled + addedSoFar >= MAX_ENROLLED_STUDENTS_PER_CLASS) {
        return {
          rowId: row.rowId,
          rowNumber: row.rowNumber || idx + 1,
          fullName: row.fullName,
          studentCode: row.studentCode,
          className: cleanClass,
          notes: row.notes,
          status: 'exceeds_capacity',
          statusMessage: `Vượt giới hạn ${MAX_ENROLLED_STUDENTS_PER_CLASS} học sinh/lớp (${cleanClass} đã đầy)`
        };
      }

      acceptedCountPerClass.set(cleanClass, addedSoFar + 1);
      const previewCode = cleanCode || getNextAutoCodePreview(cleanClass);

      return {
        rowId: row.rowId,
        rowNumber: row.rowNumber || idx + 1,
        fullName: row.fullName,
        studentCode: row.studentCode,
        className: cleanClass,
        notes: row.notes,
        status: 'valid',
        statusMessage: cleanCode
          ? `Hợp lệ (Mã: ${cleanCode})`
          : `Hợp lệ — Tự sinh mã dự kiến: ${previewCode}`
      };
    });

    const targetClsRecord = teacherClasses.find(
      (c) => c.name.toUpperCase() === effectiveDefaultImportClass.toUpperCase()
    );
    const currentEnrolledInTarget = targetClsRecord ? targetClsRecord.enrolledCount : 0;
    const validInTarget = evaluatedRows.filter(
      (r) =>
        r.status === 'valid' &&
        r.className.toUpperCase() === effectiveDefaultImportClass.toUpperCase()
    ).length;
    const remainingSeatsBeforeImport = Math.max(
      0,
      MAX_ENROLLED_STUDENTS_PER_CLASS - currentEnrolledInTarget
    );
    const remainingSeatsAfterImport = Math.max(
      0,
      MAX_ENROLLED_STUDENTS_PER_CLASS - currentEnrolledInTarget - validInTarget
    );

    return {
      rows: evaluatedRows,
      validCount: evaluatedRows.filter((r) => r.status === 'valid').length,
      missingNameCount: evaluatedRows.filter((r) => r.status === 'missing_name').length,
      duplicateCodeCount: evaluatedRows.filter(
        (r) => r.status === 'duplicate_in_file' || r.status === 'already_in_system'
      ).length,
      alreadyInClassCount: evaluatedRows.filter((r) => r.status === 'already_in_class').length,
      exceedsCapacityCount: evaluatedRows.filter((r) => r.status === 'exceeds_capacity').length,
      remainingSeatsBeforeImport,
      remainingSeatsAfterImport
    };
  }, [importDraftRows, accounts, studentAccounts, teacherClasses, effectiveDefaultImportClass]);

  const handleUpdatePreviewRow = (
    rowId: string,
    field: 'fullName' | 'studentCode' | 'className',
    value: string
  ) => {
    setImportDraftRows((prev) =>
      prev.map((r) =>
        r.rowId === rowId
          ? {
              ...r,
              [field]: field === 'studentCode' || field === 'className' ? value.toUpperCase() : value
            }
          : r
      )
    );
  };

  const handleRemovePreviewRow = (rowId: string) => {
    setImportDraftRows((prev) => prev.filter((r) => r.rowId !== rowId));
  };

  const handleRemoveAllErrorRows = () => {
    const validRowIds = new Set(
      previewValidation.rows.filter((r) => r.status === 'valid').map((r) => r.rowId)
    );
    setImportDraftRows((prev) => prev.filter((r) => validRowIds.has(r.rowId)));
  };

  const handleAddBlankPreviewRow = () => {
    setImportDraftRows((prev) => [
      ...prev,
      {
        rowId: `manual-${Date.now()}-${prev.length + 1}`,
        rowNumber: prev.length + 1,
        fullName: '',
        studentCode: '',
        className: effectiveDefaultImportClass
      }
    ]);
  };

  const handleBatchImportSubmit = async () => {
    setActionErrorNotice(null);
    setImportParseError(null);

    const validRows = previewValidation.rows.filter((r) => r.status === 'valid');
    if (validRows.length === 0) {
      setImportParseError(
        'Không có dòng học sinh hợp lệ nào để lưu. Vui lòng sửa hoặc xóa các dòng đang báo lỗi trong bảng xem trước.'
      );
      return;
    }

    setIsSubmittingBatch(true);
    try {
      const payloadRows = validRows.map((r) => ({
        rowNumber: r.rowNumber,
        username: r.studentCode.trim() || undefined,
        fullName: r.fullName.trim(),
        className: r.className.trim().toUpperCase(),
        notes: r.notes
      }));

      const result = await importBatchStudents(payloadRows);
      await loadTeacherClassesAndRequests();
      onRefreshAccounts();
      setLastBatchResult(result);

      // Giữ lại các dòng bị từ chối (nếu có) để giáo viên xem rõ
      if (result.failedRows && result.failedRows.length > 0) {
        const failedRowNums = new Set(result.failedRows.map((f) => f.rowNumber));
        setImportDraftRows((prev) => prev.filter((r) => failedRowNums.has(r.rowNumber)));
      } else {
        setImportDraftRows([]);
      }

      setActionSuccessNotice(
        `Đã lưu thành công ${result.addedCount} học sinh vào cơ sở dữ liệu và cấp Mã kích hoạt 6 chữ số riêng cho từng em!`
      );
      setTimeout(() => setActionSuccessNotice(null), 6000);
    } catch (err: any) {
      setImportParseError('Lỗi lưu danh sách học sinh: ' + (err.message || 'Vui lòng thử lại.'));
    } finally {
      setIsSubmittingBatch(false);
    }
  };

  // Sao chép mã kích hoạt vào clipboard
  const handleCopyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeStudentId(id);
    setTimeout(() => setCopiedCodeStudentId(null), 2000);
  };

  const handleCopyClassJoinCode = (code: string, classId: string) => {
    navigator.clipboard.writeText(code);
    setCopiedJoinCodeClassId(classId);
    setTimeout(() => setCopiedJoinCodeClassId(null), 2000);
  };

  const activeClassRecord = teacherClasses.find((c) => c.name === selectedClass);
  const pendingJoinRequests = joinRequests.filter(
    (r) =>
      r.status === 'pending_teacher_approval' &&
      (selectedClass === 'all' || r.className === selectedClass)
  );

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

      {/* THANH QUẢN LÝ LỚP HỌC, HẠN MỨC & MÃ THAM GIA LỚP (TỐI ĐA 5 LỚP / GV, 50 HS / LỚP) */}
      {!isDemoMode && (
        <div className="p-4 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <Layers className="w-4 h-4 text-blue-700" />
                <h3 className="text-xs font-bold text-[#0F172A] uppercase tracking-wider">
                  Quản lý Lớp học, Mã tham gia lớp & Sĩ số (Kiểm soát tại Máy chủ)
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
                Tối đa {MAX_ACTIVE_CLASSES_PER_TEACHER} lớp đang hoạt động/giáo viên, tối đa {MAX_ENROLLED_STUDENTS_PER_CLASS} học sinh/lớp. Không yêu cầu Gmail học sinh khi tạo tài khoản hoặc nhập Excel.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  downloadStudentImportTemplateXlsx(
                    selectedClass !== 'all' ? selectedClass : teacherClasses[0]?.name || '12A1'
                  )
                }
                className="px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-emerald-700" />
                <span>Tải mẫu Excel (.xlsx)</span>
              </button>

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
          </div>

          {teacherClasses.length === 0 ? (
            <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2">
              <span>
                Bạn chưa tạo lớp học nào. Hãy bấm <strong>“Tạo lớp mới”</strong> để nhận Mã tham gia lớp riêng hoặc nhập danh sách học sinh từ tệp Excel (.xlsx / .csv).
              </span>
              <button
                type="button"
                onClick={() => setIsCreateClassOpen(true)}
                className="px-3 py-1.5 bg-amber-800 hover:bg-amber-900 text-white rounded-lg font-bold text-xs cursor-pointer"
              >
                + Tạo lớp đầu tiên
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5 pt-1">
              {teacherClasses.map((cls) => {
                const remainingSeats = Math.max(0, cls.maxCapacity - cls.enrolledCount);
                const isSelected = selectedClass === cls.name;
                const isFull = remainingSeats === 0;
                const pendingCount = cls.pendingJoinCount || 0;
                return (
                  <div
                    key={cls.id}
                    onClick={() => setSelectedClass(isSelected ? 'all' : cls.name)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'bg-blue-50/90 border-blue-600 ring-1 ring-blue-500'
                        : 'bg-stone-50/70 hover:bg-stone-100 border-stone-200'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1">
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
                      <div className="mt-0.5 text-[10px] text-stone-500 flex items-center justify-between">
                        <span>Khối {cls.grade || '12'} · {cls.schoolYear || '2025-2026'}</span>
                        <span>Trống: <strong>{remainingSeats}</strong></span>
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
                    </div>

                    <div className="mt-2 pt-2 border-t border-stone-200/80 flex items-center justify-between gap-1 text-[10px]">
                      {cls.joinCode && cls.allowJoinByCode !== false ? (
                        <div className="flex items-center gap-1">
                          <QrCode className="w-3 h-3 text-blue-700 shrink-0" />
                          <span className="font-mono font-bold text-blue-900">{cls.joinCode}</span>
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              handleCopyClassJoinCode(cls.joinCode!, cls.id);
                            }}
                            title="Sao chép mã tham gia lớp"
                            className="p-0.5 text-stone-500 hover:text-blue-800 cursor-pointer"
                          >
                            {copiedJoinCodeClassId === cls.id ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="text-stone-400 italic">Đã tắt mã tham gia</span>
                      )}

                      {pendingCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold border border-amber-300">
                          +{pendingCount} chờ duyệt
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* HỘP ĐIỀU KHIỂN MÃ THAM GIA LỚP KHI CHỌN 1 LỚP CỤ THỂ */}
          {activeClassRecord && (
            <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <QrCode className="w-4 h-4 text-blue-700" />
                  <span className="font-bold text-blue-950">
                    Mã tham gia Lớp {activeClassRecord.name} (Khối {activeClassRecord.grade || '12'} · {activeClassRecord.schoolYear || '2025-2026'}):
                  </span>
                  {activeClassRecord.joinCode && activeClassRecord.allowJoinByCode !== false ? (
                    <span className="px-2.5 py-0.5 bg-white border border-blue-400 rounded-lg font-mono font-bold text-sm text-blue-900">
                      {activeClassRecord.joinCode}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-stone-200 text-stone-700 rounded-md font-semibold text-[11px]">
                      Đang tắt / Đã thu hồi
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-blue-900">
                  Học sinh nhập mã này trong mục <strong>Đăng nhập → Kích hoạt HS → Tham gia lớp bằng mã</strong> và cần Giáo viên duyệt mới trở thành thành viên chính thức.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {activeClassRecord.joinCode && activeClassRecord.allowJoinByCode !== false && (
                  <button
                    type="button"
                    onClick={() =>
                      handleCopyClassJoinCode(activeClassRecord.joinCode!, activeClassRecord.id)
                    }
                    className="px-2.5 py-1.5 bg-white hover:bg-blue-100 text-blue-900 border border-blue-300 rounded-lg font-semibold text-[11px] flex items-center gap-1 cursor-pointer"
                  >
                    {copiedJoinCodeClassId === activeClassRecord.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Đã chép mã</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Sao chép mã</span>
                      </>
                    )}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleManageJoinCode(activeClassRecord, 'toggle')}
                  className="px-2.5 py-1.5 bg-white hover:bg-stone-100 text-stone-800 border border-stone-300 rounded-lg font-semibold text-[11px] cursor-pointer"
                >
                  {activeClassRecord.allowJoinByCode !== false && activeClassRecord.joinCode
                    ? 'Tạm tắt mã'
                    : 'Bật mã tham gia'}
                </button>

                <button
                  type="button"
                  onClick={() => handleManageJoinCode(activeClassRecord, 'regenerate')}
                  className="px-2.5 py-1.5 bg-white hover:bg-amber-50 text-amber-900 border border-amber-300 rounded-lg font-semibold text-[11px] flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Đổi mã mới</span>
                </button>

                {activeClassRecord.joinCode && (
                  <button
                    type="button"
                    onClick={() => handleManageJoinCode(activeClassRecord, 'revoke')}
                    className="px-2.5 py-1.5 bg-white hover:bg-rose-50 text-rose-800 border border-rose-300 rounded-lg font-semibold text-[11px] cursor-pointer"
                  >
                    Thu hồi mã
                  </button>
                )}
              </div>
            </div>
          )}

          {/* DANH SÁCH HỌC SINH XIN THAM GIA LỚP BẰNG MÃ ĐANG CHỜ GIÁO VIÊN DUYỆT */}
          {pendingJoinRequests.length > 0 && (
            <div className="p-3.5 bg-amber-50/90 border border-amber-300 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-800" />
                  <h4 className="text-xs font-bold text-amber-950">
                    Yêu cầu tham gia lớp bằng mã đang chờ Giáo viên duyệt ({pendingJoinRequests.length} học sinh)
                  </h4>
                </div>
                <span className="text-[11px] text-amber-800">
                  Khi duyệt, hệ thống sẽ tạo tài khoản và cấp Mã kích hoạt 6 chữ số cho học sinh
                </span>
              </div>

              <div className="divide-y divide-amber-200/80 bg-white rounded-lg border border-amber-200 overflow-hidden">
                {pendingJoinRequests.map((reqItem) => (
                  <div
                    key={reqItem.id}
                    className="p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-stone-900">{reqItem.fullName}</span>
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-900 border border-blue-200 rounded font-mono font-bold text-[10px]">
                          Lớp {reqItem.className}
                        </span>
                        {reqItem.requestedStudentCode ? (
                          <span className="text-[11px] font-mono text-stone-600">
                            Mã HS tự khai: <strong>{reqItem.requestedStudentCode}</strong>
                          </span>
                        ) : (
                          <span className="text-[11px] text-stone-500 italic">
                            (Sẽ tự sinh mã {reqItem.className}-HSxx khi duyệt)
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-stone-500">
                        Mã lớp đã dùng: <code className="font-mono font-bold">{reqItem.joinCodeUsed}</code> · Gửi lúc {new Date(reqItem.createdAt).toLocaleString('vi-VN')}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={isProcessingJoinReqId === reqItem.id}
                        onClick={() => handleReviewJoinRequest(reqItem, 'approve')}
                        className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-bold text-[11px] flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Duyệt & Cấp mã 6 số</span>
                      </button>
                      <button
                        type="button"
                        disabled={isProcessingJoinReqId === reqItem.id}
                        onClick={() => handleReviewJoinRequest(reqItem, 'reject')}
                        className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 rounded-lg font-semibold text-[11px] flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <UserX className="w-3.5 h-3.5" />
                        <span>Từ chối</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
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

          {/* Các nút hành động: Thêm học sinh, Nhập Excel (.xlsx/.csv), Xuất Phiếu Tài khoản */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              onClick={() => setIsAddStudentOpen(true)}
              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 rounded-lg font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5 text-blue-700" />
              <span>Thêm 1 học sinh</span>
            </button>

            <button
              onClick={openExcelImportModal}
              className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-900 border border-stone-300 rounded-lg font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
              <span>Nhập Excel (.xlsx / .csv)</span>
            </button>

            <button
              onClick={() => setIsExportPrintOpen(true)}
              className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-lg font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-emerald-700" />
              <span>Phiếu Tài khoản & Mã kích hoạt (In / Tải)</span>
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
        <div className="p-4 border-b border-stone-200 bg-stone-50/70 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-700" />
            <h3 className="font-bold text-sm text-[#0F172A]">
              Danh sách Học sinh & Tiến độ Rèn luyện ({finalDisplayList.length} em)
            </h3>
          </div>
          <span className="text-[11px] text-stone-500">
            Mật khẩu do học sinh tự đặt sau khi kích hoạt (Giáo viên không xem hoặc lưu mật khẩu)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-stone-100/80 text-stone-600 font-bold border-b border-stone-200 text-[11px] uppercase tracking-wider">
                <th className="py-3 px-4">Mã học sinh</th>
                <th className="py-3 px-4">Họ và tên</th>
                <th className="py-3 px-3">Lớp</th>
                <th className="py-3 px-3">Tài khoản & Mã kích hoạt 6 số</th>
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
                      {account.notes && (
                        <div className="text-[10px] text-stone-500">{account.notes}</div>
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
                                title="Sao chép mã kích hoạt 6 số"
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
                        <button
                          onClick={() => handleResetCode(account.id, account.fullName)}
                          title="Cấp lại mã kích hoạt dùng 1 lần (Khi học sinh quên mật khẩu)"
                          className="p-1.5 text-stone-500 hover:text-amber-800 hover:bg-amber-50 rounded-md transition-colors cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>

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

      {/* MODAL 1: THÊM 1 HỌC SINH MỚI (KHÔNG YÊU CẦU GMAIL, MÃ HS TÙY CHỌN) */}
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
                  Họ và tên học sinh <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  placeholder="Ví dụ: Nguyễn Văn An"
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">
                  Mã học sinh (Tùy chọn — Bỏ trống hệ thống sẽ tự sinh mã không trùng)
                </label>
                <input
                  type="text"
                  value={newStudentCode}
                  onChange={(e) => setNewStudentCode(e.target.value.toUpperCase())}
                  placeholder="Bỏ trống để tự tạo (VD: 12A1-HS01)"
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg uppercase font-mono focus:outline-none focus:ring-1 focus:ring-blue-600"
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
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg focus:outline-none cursor-pointer"
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
                <label className="block font-bold text-stone-700 mb-1">Ghi chú sư phạm (Tùy chọn)</label>
                <input
                  type="text"
                  value={newStudentNotes}
                  onChange={(e) => setNewStudentNotes(e.target.value)}
                  placeholder="Ví dụ: Cần rèn luyện nghị luận văn học"
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>

              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-[11px] text-emerald-900 leading-relaxed">
                ✓ <strong>Không cần Gmail của học sinh.</strong> Hệ thống tự sinh <strong>Mã kích hoạt 6 chữ số dùng 1 lần</strong> để học sinh đăng nhập lần đầu và tự đặt mật khẩu riêng.
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
                  disabled={isSubmittingSingleStudent}
                  className="px-4 py-1.5 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-lg cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingSingleStudent ? 'Đang lưu...' : 'Tạo tài khoản & Cấp mã 6 số'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: NHẬP DANH SÁCH EXCEL (.XLSX / .CSV) VỚI BẢNG XEM TRƯỚC TRƯỚC KHI LƯU */}
      {isImportCsvOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[92vh]">
            <div className="p-4 bg-[#0F172A] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold">
                  Nhập danh sách Học sinh từ Excel (.xlsx / .csv) & Kiểm tra trước khi lưu
                </h3>
              </div>
              <button
                onClick={() => setIsImportCsvOpen(false)}
                className="text-stone-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1">
              {/* Bước 1: Chọn lớp đích + Tải mẫu Excel + Tải tệp lên */}
              <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-xl space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-stone-800">Lớp ghi danh mặc định:</span>
                    <select
                      value={effectiveDefaultImportClass}
                      onChange={(e) => {
                        const nextCls = e.target.value;
                        setImportTargetClass(nextCls);
                        setImportDraftRows((prev) =>
                          prev.map((r) => ({ ...r, className: nextCls }))
                        );
                      }}
                      className="px-3 py-1.5 bg-white border border-stone-300 rounded-lg font-bold text-stone-900 cursor-pointer"
                    >
                      {teacherClasses.length > 0 ? (
                        teacherClasses.map((cls) => (
                          <option key={cls.id} value={cls.name}>
                            Lớp {cls.name} ({cls.enrolledCount}/{cls.maxCapacity} HS — Còn {Math.max(0, cls.maxCapacity - cls.enrolledCount)} chỗ)
                          </option>
                        ))
                      ) : (
                        <option value="12A1">Lớp 12A1</option>
                      )}
                    </select>
                  </div>

                  {/* Nút tải tệp mẫu .xlsx và .csv */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => downloadStudentImportTemplateXlsx(effectiveDefaultImportClass)}
                      className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Tải mẫu Excel (.xlsx)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadStudentImportTemplateCsv(effectiveDefaultImportClass)}
                      className="px-2.5 py-1.5 bg-white hover:bg-stone-100 text-stone-700 border border-stone-300 rounded-lg font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5 text-stone-600" />
                      <span>Tải mẫu .csv</span>
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-stone-200/80">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="px-3.5 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-xl font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Chọn tệp Excel (.xlsx) hoặc CSV (.csv) từ máy tính</span>
                      <input
                        type="file"
                        accept=".xlsx,.csv,.xls"
                        className="hidden"
                        onChange={handleExcelFileUpload}
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() => setShowPasteBox(!showPasteBox)}
                      className="px-3 py-2 bg-white hover:bg-stone-100 text-stone-800 border border-stone-300 rounded-xl font-semibold cursor-pointer"
                    >
                      {showPasteBox ? 'Ẩn khung dán nhanh' : 'Hoặc dán nhanh danh sách tên'}
                    </button>

                    <button
                      type="button"
                      onClick={handleAddBlankPreviewRow}
                      className="px-3 py-2 bg-white hover:bg-stone-100 text-blue-800 border border-blue-200 rounded-xl font-semibold cursor-pointer"
                    >
                      + Thêm 1 dòng trống
                    </button>
                  </div>

                  {importFileName && (
                    <span className="text-[11px] font-mono text-stone-600 bg-white px-2.5 py-1 rounded border border-stone-200">
                      Tệp đã chọn: <strong>{importFileName}</strong>
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-stone-600">
                  Cột bắt buộc duy nhất: <strong>Họ và tên</strong>. Cột <strong>Mã học sinh</strong> là tùy chọn (nếu để trống, hệ thống tự động tạo mã không trùng như <code>{effectiveDefaultImportClass}-HS01</code>). Không cần Gmail hay Số điện thoại của học sinh.
                </div>

                {showPasteBox && (
                  <div className="p-3 bg-white border border-stone-300 rounded-xl space-y-2">
                    <div className="text-[11px] font-semibold text-stone-700">
                      Dán danh sách học sinh (Mỗi dòng 1 học sinh: <code>Họ và tên</code> hoặc <code>Họ và tên, Mã học sinh</code>):
                    </div>
                    <textarea
                      rows={4}
                      value={pasteQuickText}
                      onChange={(e) => setPasteQuickText(e.target.value)}
                      placeholder={'Nguyễn Văn An\nTrần Thị Bích Ngọc, 12A1-HS02\nLê Hoàng Nam'}
                      className="w-full p-2.5 font-mono text-xs bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleParseQuickPasteText}
                        className="px-3 py-1.5 bg-[#0F172A] text-white rounded-lg font-bold text-xs cursor-pointer"
                      >
                        Đưa vào Bảng xem trước
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Thông báo lỗi đọc file */}
              {importParseError && (
                <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-900 flex items-center gap-2 font-semibold">
                  <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
                  <span>{importParseError}</span>
                </div>
              )}

              {/* THỐNG KÊ KIỂM TRA TRƯỚC KHI LƯU (SUMMARY STATS) */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                <div className="p-2.5 bg-emerald-50 border border-emerald-300 rounded-xl">
                  <div className="text-[10px] font-bold text-emerald-800 uppercase">Số dòng hợp lệ</div>
                  <div className="text-lg font-bold text-emerald-950">{previewValidation.validCount}</div>
                </div>
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl">
                  <div className="text-[10px] font-bold text-rose-800 uppercase">Dòng thiếu tên</div>
                  <div className="text-lg font-bold text-rose-950">{previewValidation.missingNameCount}</div>
                </div>
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="text-[10px] font-bold text-amber-900 uppercase">Mã bị trùng</div>
                  <div className="text-lg font-bold text-amber-950">{previewValidation.duplicateCodeCount}</div>
                </div>
                <div className="p-2.5 bg-purple-50 border border-purple-200 rounded-xl">
                  <div className="text-[10px] font-bold text-purple-900 uppercase">Đã có trong lớp</div>
                  <div className="text-lg font-bold text-purple-950">{previewValidation.alreadyInClassCount}</div>
                </div>
                <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl">
                  <div className="text-[10px] font-bold text-blue-900 uppercase">
                    Chỗ còn lại ({effectiveDefaultImportClass})
                  </div>
                  <div className="text-lg font-bold text-blue-950">
                    {previewValidation.remainingSeatsBeforeImport} → {previewValidation.remainingSeatsAfterImport}
                  </div>
                </div>
              </div>

              {/* Thanh công cụ lọc nhanh dòng lỗi */}
              {(previewValidation.missingNameCount > 0 ||
                previewValidation.duplicateCodeCount > 0 ||
                previewValidation.alreadyInClassCount > 0 ||
                previewValidation.exceedsCapacityCount > 0) && (
                <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-xl flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-amber-950">
                    Phát hiện dòng dữ liệu lỗi hoặc vượt sĩ số. Bạn có thể sửa trực tiếp ngay trong bảng bên dưới hoặc bấm nút loại bỏ các dòng lỗi trước khi lưu.
                  </span>
                  <button
                    type="button"
                    onClick={handleRemoveAllErrorRows}
                    className="px-3 py-1 bg-amber-800 hover:bg-amber-900 text-white rounded-lg font-bold text-[11px] cursor-pointer"
                  >
                    Loại bỏ tất cả dòng lỗi
                  </button>
                </div>
              )}

              {/* BẢNG XEM TRƯỚC CHO PHÉP SỬA TRỰC TIẾP HOẶC XÓA DÒNG LỖI */}
              <div className="border border-stone-300 rounded-xl overflow-hidden">
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-stone-100 border-b border-stone-300 z-10">
                      <tr className="text-[11px] font-bold text-stone-700">
                        <th className="p-2.5 w-12">Dòng</th>
                        <th className="p-2.5">Họ và tên học sinh *</th>
                        <th className="p-2.5 w-44">Mã học sinh (Tùy chọn)</th>
                        <th className="p-2.5 w-28">Lớp</th>
                        <th className="p-2.5">Trạng thái kiểm tra</th>
                        <th className="p-2.5 w-14 text-center">Xóa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200 bg-white">
                      {previewValidation.rows.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-stone-500">
                            Chưa có dòng dữ liệu nào. Hãy tải tệp Excel (.xlsx / .csv) hoặc bấm “+ Thêm 1 dòng trống”.
                          </td>
                        </tr>
                      ) : (
                        previewValidation.rows.map((row) => {
                          const isError = row.status !== 'valid';
                          return (
                            <tr
                              key={row.rowId}
                              className={isError ? 'bg-rose-50/60' : 'hover:bg-stone-50'}
                            >
                              <td className="p-2 font-mono text-stone-500 font-semibold">
                                #{row.rowNumber}
                              </td>
                              <td className="p-2">
                                <input
                                  type="text"
                                  value={row.fullName}
                                  onChange={(e) =>
                                    handleUpdatePreviewRow(row.rowId, 'fullName', e.target.value)
                                  }
                                  placeholder="Nhập Họ và tên..."
                                  className={`w-full px-2.5 py-1 rounded border text-xs ${
                                    row.status === 'missing_name'
                                      ? 'border-rose-400 bg-white focus:ring-rose-500'
                                      : 'border-stone-300 bg-stone-50/60 focus:bg-white'
                                  }`}
                                />
                              </td>
                              <td className="p-2">
                                <input
                                  type="text"
                                  value={row.studentCode}
                                  onChange={(e) =>
                                    handleUpdatePreviewRow(row.rowId, 'studentCode', e.target.value)
                                  }
                                  placeholder="Tự sinh nếu trống"
                                  className={`w-full px-2.5 py-1 rounded border font-mono text-xs uppercase ${
                                    row.status === 'duplicate_in_file' ||
                                    row.status === 'already_in_system' ||
                                    row.status === 'already_in_class'
                                      ? 'border-rose-400 bg-white'
                                      : 'border-stone-300 bg-stone-50/60 focus:bg-white'
                                  }`}
                                />
                              </td>
                              <td className="p-2">
                                <input
                                  type="text"
                                  value={row.className}
                                  onChange={(e) =>
                                    handleUpdatePreviewRow(row.rowId, 'className', e.target.value)
                                  }
                                  className="w-full px-2 py-1 rounded border border-stone-300 font-mono text-xs uppercase bg-stone-50/60"
                                />
                              </td>
                              <td className="p-2">
                                {row.status === 'valid' ? (
                                  <span className="inline-flex items-center gap-1 text-emerald-800 font-semibold text-[11px]">
                                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                    <span>{row.statusMessage}</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-rose-800 font-bold text-[11px]">
                                    <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                    <span>{row.statusMessage}</span>
                                  </span>
                                )}
                              </td>
                              <td className="p-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemovePreviewRow(row.rowId)}
                                  title="Xóa dòng này"
                                  className="p-1 text-stone-400 hover:text-rose-700 rounded cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* KẾT QUẢ CHI TIẾT SAU KHI LƯU HÀNG LOẠT */}
              {lastBatchResult && (
                <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-bold text-emerald-950 flex items-center gap-1.5">
                      <CheckCircle className="w-4 h-4 text-emerald-700" />
                      <span>
                        Kết quả lưu danh sách: Đã thêm thành công {lastBatchResult.addedCount} học sinh (Từ chối/bỏ qua: {lastBatchResult.skippedCount + lastBatchResult.quotaRejectedCount} dòng)
                      </span>
                    </div>
                    {lastBatchResult.newAccounts.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsImportCsvOpen(false);
                          setExportPrintMode('slips');
                          setIsExportPrintOpen(true);
                        }}
                        className="px-3 py-1.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-lg font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>In / Tải Phiếu tài khoản vừa tạo</span>
                      </button>
                    )}
                  </div>

                  {lastBatchResult.failedRows.length > 0 && (
                    <div className="p-2.5 bg-white border border-rose-200 rounded-lg space-y-1 text-[11px] text-rose-900">
                      <div className="font-bold">Các dòng bị từ chối rõ ràng:</div>
                      {lastBatchResult.failedRows.map((fr, idx) => (
                        <div key={idx}>• {fr.message}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-stone-200 bg-stone-50 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-stone-600 font-semibold">
                Sẵn sàng lưu: <strong>{previewValidation.validCount}</strong> học sinh hợp lệ
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsImportCsvOpen(false)}
                  className="px-3.5 py-2 text-stone-600 hover:bg-stone-200 rounded-xl font-semibold cursor-pointer"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  disabled={isSubmittingBatch || previewValidation.validCount === 0}
                  onClick={handleBatchImportSubmit}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:bg-stone-300 text-white font-bold rounded-xl cursor-pointer shadow-2xs"
                >
                  {isSubmittingBatch
                    ? 'Đang lưu vào cơ sở dữ liệu...'
                    : `Xác nhận lưu ${previewValidation.validCount} học sinh hợp lệ`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: PHIẾU TÀI KHOẢN RIÊNG CHO TỪNG HỌC SINH & BẢNG MÃ KÍCH HOẠT */}
      {isExportPrintOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[92vh]">
            <div className="p-4 bg-[#0F172A] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Printer className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold">
                  Phiếu Tài khoản & Mã Kích hoạt 1 lần – {selectedClass === 'all' ? 'Tất cả lớp' : `Lớp ${selectedClass}`} ({filteredByClass.length} học sinh)
                </h3>
              </div>
              <button
                onClick={() => setIsExportPrintOpen(false)}
                className="text-stone-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1">
              <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="font-bold text-blue-950">
                    Chế độ xuất phiếu tài khoản an toàn (Không lưu / không xuất mật khẩu)
                  </div>
                  <p className="text-[11px] text-blue-900">
                    Mỗi phiếu chỉ chứa <strong>Mã học sinh</strong> và <strong>Mã kích hoạt 6 chữ số dùng 1 lần</strong>. Học sinh dùng mã này để tự đặt mật khẩu riêng trong lần đăng nhập đầu tiên.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex rounded-lg border border-blue-300 bg-white p-0.5">
                    <button
                      type="button"
                      onClick={() => setExportPrintMode('slips')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer ${
                        exportPrintMode === 'slips'
                          ? 'bg-[#0F172A] text-white'
                          : 'text-stone-700 hover:bg-stone-100'
                      }`}
                    >
                      Phiếu rời từng học sinh
                    </button>
                    <button
                      type="button"
                      onClick={() => setExportPrintMode('table')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer ${
                        exportPrintMode === 'table'
                          ? 'bg-[#0F172A] text-white'
                          : 'text-stone-700 hover:bg-stone-100'
                      }`}
                    >
                      Bảng tổng hợp
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      exportStudentCredentialsXlsx(
                        filteredByClass,
                        selectedClass === 'all' ? 'TatCaLop' : selectedClass
                      )
                    }
                    className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg cursor-pointer flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Tải Excel (.xlsx)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-lg cursor-pointer flex items-center gap-1.5"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>In phiếu</span>
                  </button>
                </div>
              </div>

              {exportPrintMode === 'slips' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredByClass.map((acc, idx) => (
                    <div
                      key={acc.id}
                      className="p-4 rounded-xl border-2 border-dashed border-stone-300 bg-white space-y-2.5 break-inside-avoid"
                    >
                      <div className="flex items-center justify-between border-b border-stone-200 pb-2">
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                            PHIẾU TÀI KHOẢN HỌC SINH — VĂNAI 12 (#{idx + 1})
                          </div>
                          <div className="text-sm font-bold text-[#0F172A]">{acc.fullName}</div>
                        </div>
                        <span className="px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 font-mono font-bold text-xs text-blue-900">
                          Lớp {acc.className}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-200">
                          <div className="text-[10px] text-stone-500 font-semibold">
                            Mã đăng nhập (Mã học sinh)
                          </div>
                          <div className="font-mono font-bold text-sm text-stone-900 mt-0.5">
                            {acc.username}
                          </div>
                        </div>

                        <div className="p-2.5 rounded-lg bg-amber-50/90 border border-amber-300">
                          <div className="text-[10px] text-amber-900 font-semibold">
                            Mã kích hoạt 1 lần (6 số)
                          </div>
                          <div className="font-mono font-bold text-sm text-amber-950 mt-0.5">
                            {acc.isActivated ? (
                              <span className="text-xs text-emerald-800">Đã kích hoạt</span>
                            ) : (
                              acc.activationCode || '—'
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-[10px] text-stone-600 leading-relaxed pt-1 border-t border-stone-100">
                        <strong>Hướng dẫn đăng nhập lần đầu:</strong> Mở ứng dụng VănAI 12 → Bấm <strong>Đăng nhập</strong> → Chọn tab <strong>Kích hoạt HS</strong> → Nhập Mã học sinh <code>{acc.username}</code> + Mã kích hoạt 6 số → Tự đặt mật khẩu cá nhân (Giáo viên không biết mật khẩu của em).
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
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
                            {acc.isActivated ? (
                              <span className="text-stone-400 font-normal italic">
                                (Đã kích hoạt — mật khẩu riêng)
                              </span>
                            ) : (
                              acc.activationCode
                            )}
                          </td>
                          <td className="p-2.5">
                            {acc.isActivated ? (
                              <span className="text-emerald-700 font-semibold">Đã tự đặt mật khẩu</span>
                            ) : (
                              <span className="text-amber-700 font-semibold">Chờ kích hoạt</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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

      {/* MODAL 4: TẠO LỚP HỌC MỚI (TÊN LỚP, KHỐI, NĂM HỌC, MÃ THAM GIA LỚP) */}
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
                Mỗi giáo viên được quản lý tối đa <strong>{MAX_ACTIVE_CLASSES_PER_TEACHER} lớp đang hoạt động</strong>, mỗi lớp tối đa <strong>{MAX_ENROLLED_STUDENTS_PER_CLASS} học sinh</strong>. Chỉ báo tạo thành công sau khi dữ liệu đã lưu vào cơ sở dữ liệu thật.
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div className="col-span-2">
                  <label className="block font-bold text-stone-700 mb-1">
                    Tên lớp học <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newClassNameInput}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase();
                      setNewClassNameInput(val);
                      if (val.startsWith('10')) setNewClassGradeInput('10');
                      else if (val.startsWith('11')) setNewClassGradeInput('11');
                      else if (val.startsWith('12')) setNewClassGradeInput('12');
                    }}
                    placeholder="VD: 12A1, 12D1..."
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg uppercase font-mono font-bold focus:outline-none focus:ring-1 focus:ring-blue-600"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">Khối</label>
                  <select
                    value={newClassGradeInput}
                    onChange={(e) => setNewClassGradeInput(e.target.value)}
                    className="w-full px-2.5 py-2 bg-stone-50 border border-stone-300 rounded-lg font-bold text-stone-800 cursor-pointer"
                  >
                    <option value="12">Khối 12</option>
                    <option value="11">Khối 11</option>
                    <option value="10">Khối 10</option>
                  </select>
                </div>
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

              <div>
                <label className="block font-bold text-stone-700 mb-1">
                  Thông tin / Ghi chú lớp học (Tùy chọn)
                </label>
                <input
                  type="text"
                  value={newClassDescription}
                  onChange={(e) => setNewClassDescription(e.target.value)}
                  placeholder="VD: Lớp ôn thi Tốt nghiệp THPT môn Ngữ văn"
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>

              <label className="flex items-start gap-2 p-2.5 rounded-xl bg-stone-50 border border-stone-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newClassAllowJoinCode}
                  onChange={(e) => setNewClassAllowJoinCode(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-[11px] text-stone-700 leading-relaxed">
                  <strong>Tạo mã tham gia lớp riêng:</strong> Cho phép học sinh nhập mã lớp để gửi yêu cầu tham gia (cần Giáo viên duyệt mới vào lớp).
                </span>
              </label>

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
                  disabled={remainingClassesQuota <= 0 || isSubmittingClass}
                  className="px-4 py-1.5 bg-[#0F172A] hover:bg-stone-800 disabled:bg-stone-300 text-white font-bold rounded-lg cursor-pointer"
                >
                  {isSubmittingClass ? 'Đang lưu lớp học...' : 'Xác nhận tạo lớp'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

