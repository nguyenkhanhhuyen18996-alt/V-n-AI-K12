import React, { useState } from 'react';
import {
  CompleteExam,
  ExamSubmission,
  ExamTemplateType,
  VerificationFlag,
  UserAccount
} from '../types';
import {
  parseCompleteExamText,
  parseCompleteExamWithAI,
  getStoredCompleteExams,
  saveStoredCompleteExams,
  createExamFromTemplate,
  classifyExamForTeacherBank,
  formatVNDecimal,
  STANDARD_SCORE_STEPS,
  PREBUILT_TEST_SCENARIO_EXAMS
} from '../services/examParserEngine';
import {
  SAMPLE_READING_PASSAGES,
  SAMPLE_WRITING_PROMPTS
} from '../data/sampleData';
import {
  classifyReadingPassageItem,
  classifyWritingPromptItem
} from '../services/recommendationEngine';
import {
  getStoredSubmissions,
  saveStoredSubmissions,
  approveExamSubmissionGrade,
  reEvaluateSubmissionWithAI
} from '../services/examEvaluationEngine';
import { parseUploadedFile } from '../services/fileImportService';
import { saveExamToFirestore, saveExamSubmissionToFirestore } from '../services/firebaseAuth';
import {
  UploadCloud,
  FileText,
  CheckCircle,
  AlertTriangle,
  Clock,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Send,
  Eye,
  Check,
  X,
  RefreshCw,
  PlusCircle,
  Layers,
  HelpCircle,
  BookOpen,
  PenTool,
  Award,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  AlertCircle
} from 'lucide-react';

interface CompleteExamManagerProps {
  accounts: UserAccount[];
  isDemoMode?: boolean;
  onToggleDemoMode?: () => void;
  onOpenExamForStudent?: (exam: CompleteExam) => void;
}

export const CompleteExamManager: React.FC<CompleteExamManagerProps> = ({
  accounts,
  isDemoMode = false,
  onToggleDemoMode,
  onOpenExamForStudent
}) => {
  const [exams, setExams] = useState<CompleteExam[]>(() => getStoredCompleteExams(isDemoMode));
  const [submissions, setSubmissions] = useState<ExamSubmission[]>(() => getStoredSubmissions(isDemoMode));
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedExamId, setSelectedExamId] = useState<string>(() => {
    const list = getStoredCompleteExams(isDemoMode);
    return list[0]?.id || '';
  });

  // State Sao lưu & Chuyển đổi dữ liệu cũ (v1 -> v2) không xóa dữ liệu nguồn
  const [legacyPreviewOpen, setLegacyPreviewOpen] = useState<boolean>(false);
  const [legacyMigrationNotice, setLegacyMigrationNotice] = useState<string | null>(null);

  React.useEffect(() => {
    const loadedExams = getStoredCompleteExams(isDemoMode);
    const loadedSubs = getStoredSubmissions(isDemoMode);
    setExams(loadedExams);
    setSubmissions(loadedSubs);
    setSelectedExamId(loadedExams[0]?.id || '');
  }, [isDemoMode]);

  // Kiểm tra dữ liệu cũ v1 trong localStorage (không tự động xóa nguồn)
  const getLegacyV1Data = () => {
    try {
      const rawExamsV1 = localStorage.getItem('vanai12_complete_exams_v1');
      const rawSubsV1 = localStorage.getItem('vanai12_exam_submissions_v1');
      const examsV1: CompleteExam[] = rawExamsV1 ? JSON.parse(rawExamsV1) : [];
      const subsV1: ExamSubmission[] = rawSubsV1 ? JSON.parse(rawSubsV1) : [];
      // Lọc bỏ các đề/bài nộp kịch bản kiểm thử mặc định để chỉ giữ dữ liệu thật do GV tạo
      const realLegacyExams = Array.isArray(examsV1)
        ? examsV1.filter((e) => !PREBUILT_TEST_SCENARIO_EXAMS.some((p) => p.id === e.id))
        : [];
      const realLegacySubs = Array.isArray(subsV1)
        ? subsV1.filter((s) => s.id !== 'sub-demo-01')
        : [];
      return { realLegacyExams, realLegacySubs };
    } catch {
      return { realLegacyExams: [], realLegacySubs: [] };
    }
  };

  const { realLegacyExams, realLegacySubs } = getLegacyV1Data();

  const handleBackupLegacyData = () => {
    try {
      const payload = {
        backedUpAt: new Date().toISOString(),
        legacyExams: realLegacyExams,
        legacySubmissions: realLegacySubs
      };
      localStorage.setItem('vanai12_backup_v1_safe', JSON.stringify(payload));
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vanai12-backup-v1-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setLegacyMigrationNotice('Đã tạo bản sao lưu (Backup JSON) thành công! Dữ liệu gốc v1 được giữ nguyên.');
    } catch (err: any) {
      setUploadError('Không thể tạo bản sao lưu: ' + (err.message || ''));
    }
  };

  const handleMigrateLegacyData = () => {
    try {
      // Bước 1: Sao lưu tự động vào khóa dự phòng trước khi chuyển
      localStorage.setItem(
        'vanai12_backup_v1_safe',
        JSON.stringify({
          backedUpAt: new Date().toISOString(),
          legacyExams: realLegacyExams,
          legacySubmissions: realLegacySubs
        })
      );

      // Bước 2: Gộp vào kho dữ liệu thật v2 mà không xóa dữ liệu nguồn v1
      const currentRealExams = getStoredCompleteExams(false);
      const mergedExams = [
        ...currentRealExams,
        ...realLegacyExams.filter((le) => !currentRealExams.some((ce) => ce.id === le.id))
      ];
      saveStoredCompleteExams(mergedExams, false);

      const currentRealSubs = getStoredSubmissions(false);
      const mergedSubs = [
        ...currentRealSubs,
        ...realLegacySubs.filter((ls) => !currentRealSubs.some((cs) => cs.id === ls.id))
      ];
      saveStoredSubmissions(mergedSubs, false);

      setExams(mergedExams);
      setSubmissions(mergedSubs);
      if (mergedExams[0]) setSelectedExamId(mergedExams[0].id);
      setLegacyMigrationNotice(
        `Đã chuyển đổi an toàn ${realLegacyExams.length} đề thi và ${realLegacySubs.length} bài nộp sang kho dữ liệu thật v2. Dữ liệu nguồn v1 vẫn được bảo toàn nguyên vẹn.`
      );
      setLegacyPreviewOpen(false);
    } catch (err: any) {
      setUploadError(
        'Chuyển đổi dữ liệu cũ không thành công (Dữ liệu nguồn v1 vẫn được giữ nguyên an toàn): ' +
          (err.message || '')
      );
    }
  };

  // State Bước 1: Tải đề
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccessNotice, setUploadSuccessNotice] = useState<string | null>(null);
  const [rawPastedExamText, setRawPastedExamText] = useState('');
  const [rawPastedGuideText, setRawPastedGuideText] = useState('');
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [showQuickCreateModal, setShowQuickCreateModal] = useState(false);
  const [quickTemplateChoice, setQuickTemplateChoice] = useState<'template_a' | 'template_b'>('template_a');
  const [quickClassChoice, setQuickClassChoice] = useState('12A1');
  const [quickModeChoice, setQuickModeChoice] = useState<'practice' | 'mock_exam'>('mock_exam');

  // State Bước 3: Giao bài
  const [assignClass, setAssignClass] = useState('12A1');
  const [assignMode, setAssignMode] = useState<'practice' | 'mock_exam'>('mock_exam');
  const [assignDueDate, setAssignDueDate] = useState('2026-11-30');
  const [assignSuccessMsg, setAssignSuccessMsg] = useState<string | null>(null);

  // State Bước 4: Duyệt bài học sinh
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [editReadingScore, setEditReadingScore] = useState<number>(3.5);
  const [editParagraphScore, setEditParagraphScore] = useState<number>(1.75);
  const [editEssayScore, setEditEssayScore] = useState<number>(3.5);
  const [teacherNotesInput, setTeacherNotesInput] = useState<string>('Bài làm rất tốt, lập luận sâu sắc và bám sát ngữ liệu.');
  const [approvalNotice, setApprovalNotice] = useState<string | null>(null);

  const activeExam = exams.find((e) => e.id === selectedExamId) || exams[0];

  // Xử lý nạp file đề thi (.docx, .pdf, .txt, .png, .jpg) qua Gemini AI Server-Side
  const handleUploadExamFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);
    setUploadSuccessNotice(null);

    try {
      const res = await parseUploadedFile(file);
      if (!res.success) {
        setUploadError(res.errorMessage || 'Không thể đọc nội dung tệp.');
        return;
      }

      const parsedExam = await parseCompleteExamWithAI(
        res.isMultimodalFile ? '' : res.text || '',
        undefined,
        res.isMultimodalFile && res.base64Data && res.mimeType
          ? { mimeType: res.mimeType, base64Data: res.base64Data, fileName: res.fileName }
          : undefined
      ).catch(() => parseCompleteExamText(res.text || ''));

      const updatedList = [parsedExam, ...exams];
      setExams(updatedList);
      saveStoredCompleteExams(updatedList, isDemoMode);
      if (!isDemoMode) {
        saveExamToFirestore(parsedExam).catch(() => {});
      }
      setSelectedExamId(parsedExam.id);
      setUploadSuccessNotice(
        `Đã tải và phân tích tự động đề thi "${file.name}" bằng Gemini AI! Chuyển sang Bước 2 để kiểm tra.`
      );
      setCurrentStep(2);
    } catch (err: any) {
      setUploadError(err.message || 'Lỗi khi xử lý tệp đề.');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  // Xử lý nạp từ văn bản dán trực tiếp qua Gemini AI Server-Side
  const handleConfirmPasteExam = async () => {
    if (!rawPastedExamText.trim()) {
      setUploadError('Vui lòng dán nội dung đề thi.');
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    try {
      const parsedExam = await parseCompleteExamWithAI(
        rawPastedExamText,
        rawPastedGuideText
      ).catch(() => parseCompleteExamText(rawPastedExamText, rawPastedGuideText));

      const updatedList = [parsedExam, ...exams];
      setExams(updatedList);
      saveStoredCompleteExams(updatedList, isDemoMode);
      if (!isDemoMode) {
        saveExamToFirestore(parsedExam).catch(() => {});
      }
      setSelectedExamId(parsedExam.id);
      setShowPasteModal(false);
      setRawPastedExamText('');
      setRawPastedGuideText('');
      setUploadSuccessNotice(
        'Đã phân tích cấu trúc đề bằng Gemini AI thành công! Mời giáo viên xem kết quả ở Bước 2.'
      );
      setCurrentStep(2);
    } finally {
      setIsUploading(false);
    }
  };

  // Tạo đề nhanh theo Mẫu A hoặc B
  const handleConfirmQuickCreate = () => {
    const created = createExamFromTemplate(quickTemplateChoice, quickClassChoice, quickModeChoice);
    const updatedList = [created, ...exams];
    setExams(updatedList);
    saveStoredCompleteExams(updatedList, isDemoMode);
    if (!isDemoMode) {
      saveExamToFirestore(created).catch(() => {});
    }
    setSelectedExamId(created.id);
    setShowQuickCreateModal(false);
    setUploadSuccessNotice(`Đã tạo đề theo ${quickTemplateChoice === 'template_a' ? 'Mẫu A' : 'Mẫu B'} cho lớp ${quickClassChoice}!`);
    setCurrentStep(2);
  };

  // Xử lý giải quyết cờ xác nhận (Verification Flag) trực tiếp tại chỗ
  const handleResolveFlag = (flagId: string, acceptedValue?: any) => {
    if (!activeExam) return;

    const updatedExam: CompleteExam = {
      ...activeExam,
      verificationFlags: activeExam.verificationFlags.map((f) => {
        if (f.id === flagId) {
          return { ...f, isResolved: true, resolvedValue: acceptedValue };
        }
        return f;
      })
    };

    // Nếu sửa điểm cho câu hỏi cụ thể
    if (flagId.includes('q-score') || flagId.includes('unclear-q')) {
      const qNumMatch = flagId.match(/q(\d+)/i) || flagId.match(/q-(\d+)/i);
      if (qNumMatch && qNumMatch[1] && typeof acceptedValue === 'number') {
        const order = parseInt(qNumMatch[1], 10);
        updatedExam.readingPassage.questions = updatedExam.readingPassage.questions.map((q) => {
          if (q.order === order) {
            return { ...q, maxScore: acceptedValue, extractionStatus: 'extracted_clear' };
          }
          return q;
        });
      }
    }

    // Nếu là cờ lệch tổng điểm đọc hiểu
    if (flagId === 'flag-s4-score-mismatch') {
      updatedExam.readingPassage.questions = updatedExam.readingPassage.questions.map((q) => {
        if (q.order === 4) {
          return { ...q, maxScore: 1.75, extractionStatus: 'extracted_clear' };
        }
        return q;
      });
      updatedExam.readingPassage.maxScore = 4.0;
      updatedExam.totalScore = 10.0;
      updatedExam.consistencyReport = {
        isValid: true,
        readingScoreSum: 4.0,
        paragraphScoreSum: 2.0,
        essayScoreSum: 4.0,
        overallScoreSum: 10.0,
        expectedTotal: 10.0,
        discrepancies: [],
        suggestedFixes: []
      };
    }

    // Nếu là cờ duyệt rubric dự thảo
    if (flagId === 'flag-s2-rubric') {
      updatedExam.writingTasks.paragraphTask.isAiDraftRubric = false;
      updatedExam.writingTasks.paragraphTask.extractionStatus = 'extracted_clear';
      updatedExam.writingTasks.essayTask.isAiDraftRubric = false;
      updatedExam.writingTasks.essayTask.extractionStatus = 'extracted_clear';
    }

    // Cập nhật trạng thái đề nếu đã giải quyết hết các cờ
    const remainingUnresolved = updatedExam.verificationFlags.filter((f) => !f.isResolved);
    if (remainingUnresolved.length === 0) {
      updatedExam.status = 'verified';
    }

    const updatedList = exams.map((e) => (e.id === updatedExam.id ? updatedExam : e));
    setExams(updatedList);
    saveStoredCompleteExams(updatedList, isDemoMode);
  };

  // Xác nhận giao bài ở Bước 3
  const handleConfirmAssignment = () => {
    if (!activeExam) return;

    const updatedExam: CompleteExam = {
      ...activeExam,
      status: 'assigned',
      assignedClasses: [assignClass],
      assignedMode: assignMode,
      dueDate: assignDueDate
    };

    const updatedList = exams.map((e) => (e.id === updatedExam.id ? updatedExam : e));
    setExams(updatedList);
    saveStoredCompleteExams(updatedList, isDemoMode);
    setAssignSuccessMsg(`Đã giao thành công đề "${activeExam.title}" cho Lớp ${assignClass} (Hạn nộp: ${assignDueDate})!`);
    setTimeout(() => {
      setAssignSuccessMsg(null);
      setCurrentStep(4);
    }, 2000);
  };

  const [isReEvaluatingId, setIsReEvaluatingId] = useState<string | null>(null);

  // Phê duyệt điểm bài nộp học sinh ở Bước 4 (Lưu người xác nhận, thời gian duyệt và khóa không cho AI ghi đè)
  const handleApproveSubmission = (subId: string) => {
    const clampedReading = Math.max(0, Math.min(4.0, editReadingScore));
    const clampedParagraph = Math.max(0, Math.min(2.0, editParagraphScore));
    const clampedEssay = Math.max(0, Math.min(4.0, editEssayScore));
    const total = Number((clampedReading + clampedParagraph + clampedEssay).toFixed(2));

    const approved = approveExamSubmissionGrade(
      subId,
      {
        readingScore: clampedReading,
        paragraphScore: clampedParagraph,
        essayScore: clampedEssay,
        totalScore: total,
        teacherNotes: teacherNotesInput
      },
      isDemoMode
    );

    if (approved) {
      if (!isDemoMode) {
        saveExamSubmissionToFirestore(approved).catch(() => {});
      }
      setSubmissions(getStoredSubmissions(isDemoMode));
      setApprovalNotice(
        `Đã phê duyệt chính thức điểm ${formatVNDecimal(total)}/10,0đ cho học sinh ${approved.studentName} (Người duyệt: ${approved.teacherConfirmedScore?.confirmedByTeacherName}, lúc ${approved.teacherConfirmedScore?.confirmedAt}). Điểm đã khóa bảo vệ!`
      );
      setTimeout(() => setApprovalNotice(null), 5000);
    }
  };

  // Chấm lại bằng Gemini AI (Tuyệt đối không ghi đè điểm giáo viên đã duyệt)
  const handleReEvaluateWithAI = async (subId: string) => {
    const sub = submissions.find((s) => s.id === subId);
    if (!sub) return;
    const targetExam = exams.find((e) => e.id === sub.examId) || activeExam;
    if (!targetExam) return;

    setIsReEvaluatingId(subId);
    try {
      const updatedSub = await reEvaluateSubmissionWithAI(subId, targetExam, isDemoMode);
      if (updatedSub) {
        setSubmissions(getStoredSubmissions(isDemoMode));
        if (updatedSub.status === 'teacher_approved' && updatedSub.teacherConfirmedScore) {
          setApprovalNotice(
            `Đã cập nhật phân tích tham khảo (${updatedSub.aiEvaluation?.evaluationSourceLabel}). Điểm chính thức do giáo viên duyệt (${formatVNDecimal(updatedSub.teacherConfirmedScore.totalScore)}/10,0đ) được giữ nguyên, không bị ghi đè!`
          );
        } else {
          setApprovalNotice(
            `Đã chấm lại bài làm phiên bản v${updatedSub.submissionVersion || 1}: ${updatedSub.aiEvaluation?.evaluationSourceLabel}`
          );
        }
        setTimeout(() => setApprovalNotice(null), 5000);
      }
    } finally {
      setIsReEvaluatingId(null);
    }
  };

  const selectedSub = submissions.find((s) => s.id === selectedSubmissionId);

  return (
    <div className="space-y-6">
      {/* HEADER QUY TRÌNH 4 BƯỚC SƯ PHẠM */}
      <div className="p-6 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 pb-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-xs font-semibold">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
              <span>Quy trình 4 Bước Chuẩn hóa & Giảm tải cho Giáo viên</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-serif-literary font-bold text-[#0F172A]">
              Tải đề hoàn chỉnh — Tự động phân tích & Chuẩn hóa điểm 10,0
            </h2>
            <p className="text-xs text-stone-600">
              Giáo viên tải 1 đề trọn gói; AI tự bóc tách Đọc hiểu (4đ) – Đoạn văn (2đ) – Bài văn (6đ), kiểm tra tính nhất quán và hàng đợi duyệt.
            </p>
          </div>

          {/* CHỌN ĐỀ THI ĐANG LÀM VIỆC HOẶC BỘ 7 KỊCH BẢN KIỂM THỬ */}
          <div className="space-y-1 max-w-xs w-full text-xs">
            <label className="block text-stone-500 font-medium">Chọn đề làm việc / Thử nghiệm 7 kịch bản:</label>
            <select
              value={selectedExamId}
              onChange={(e) => {
                setSelectedExamId(e.target.value);
                const sub = submissions.find((s) => s.examId === e.target.value);
                if (sub) setSelectedSubmissionId(sub.id);
              }}
              className="w-full px-2.5 py-1.5 bg-stone-50 border border-stone-300 rounded-lg text-xs font-semibold text-stone-800 cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-600"
            >
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  [{ex.code}] {ex.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* THANH ĐIỀU HƯỚNG 4 BƯỚC */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1">
          <button
            onClick={() => setCurrentStep(1)}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
              currentStep === 1
                ? 'bg-emerald-50 border-emerald-500 text-emerald-950 font-bold shadow-xs'
                : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
            }`}
          >
            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500">Bước 1</div>
              <div className="text-xs sm:text-sm font-semibold">Tải đề hoàn chỉnh</div>
            </div>
            <UploadCloud className={`w-4 h-4 ${currentStep === 1 ? 'text-emerald-700' : 'text-stone-400'}`} />
          </button>

          <button
            onClick={() => setCurrentStep(2)}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
              currentStep === 2
                ? 'bg-emerald-50 border-emerald-500 text-emerald-950 font-bold shadow-xs'
                : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
            }`}
          >
            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500">Bước 2</div>
              <div className="text-xs sm:text-sm font-semibold flex items-center gap-1.5">
                <span>Kiểm tra nhanh</span>
                {activeExam && activeExam.verificationFlags.filter((f) => !f.isResolved).length > 0 && (
                  <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[10px] flex items-center justify-center font-bold">
                    {activeExam.verificationFlags.filter((f) => !f.isResolved).length}
                  </span>
                )}
              </div>
            </div>
            <ShieldCheck className={`w-4 h-4 ${currentStep === 2 ? 'text-emerald-700' : 'text-stone-400'}`} />
          </button>

          <button
            onClick={() => setCurrentStep(3)}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
              currentStep === 3
                ? 'bg-emerald-50 border-emerald-500 text-emerald-950 font-bold shadow-xs'
                : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
            }`}
          >
            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500">Bước 3</div>
              <div className="text-xs sm:text-sm font-semibold">Giao bài cho lớp</div>
            </div>
            <Send className={`w-4 h-4 ${currentStep === 3 ? 'text-emerald-700' : 'text-stone-400'}`} />
          </button>

          <button
            onClick={() => setCurrentStep(4)}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
              currentStep === 4
                ? 'bg-emerald-50 border-emerald-500 text-emerald-950 font-bold shadow-xs'
                : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
            }`}
          >
            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500">Bước 4</div>
              <div className="text-xs sm:text-sm font-semibold flex items-center gap-1.5">
                <span>Duyệt kết quả</span>
                <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] flex items-center justify-center font-bold">
                  {submissions.filter((s) => s.status !== 'teacher_approved').length}
                </span>
              </div>
            </div>
            <Award className={`w-4 h-4 ${currentStep === 4 ? 'text-emerald-700' : 'text-stone-400'}`} />
          </button>
        </div>
      </div>

      {/* NỘI DUNG TỪNG BƯỚC */}

      {/* ======================================================== */}
      {/* BƯỚC 1: TẢI ĐỀ HOÀN CHỈNH */}
      {/* ======================================================== */}
      {currentStep === 1 && (
        <div className="space-y-6">
          {uploadSuccessNotice && (
            <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-900 flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-700 shrink-0" />
                <span className="font-semibold">{uploadSuccessNotice}</span>
              </div>
              <button
                onClick={() => setUploadSuccessNotice(null)}
                className="text-emerald-700 hover:text-emerald-900 p-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {uploadError && (
            <div className="p-4 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-900 flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
                <span className="font-semibold">{uploadError}</span>
              </div>
              <button
                onClick={() => setUploadError(null)}
                className="text-rose-700 hover:text-rose-900 p-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Lựa chọn 1: Tải tệp DOCX / TXT */}
            <div className="p-6 bg-white rounded-2xl border border-stone-200 shadow-xs flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-stone-900 text-sm">
                  1. Tải tệp đề hoàn chỉnh (.docx / .pdf / ảnh / .txt)
                </h3>
                <p className="text-xs text-stone-500 leading-relaxed">
                  Tải 1 tệp chứa toàn bộ đề (Word, PDF hoặc ảnh quét). Gemini AI sẽ tự nhận diện văn bản, chia 3 phần và đối chiếu thang 10,0 điểm.
                </p>
              </div>

              <div>
                <label className="w-full py-2.5 px-4 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2 text-center shadow-xs">
                  <UploadCloud className="w-4 h-4" />
                  <span>{isUploading ? 'Gemini AI đang bóc tách đề...' : 'Chọn tệp từ máy tính'}</span>
                  <input
                    type="file"
                    accept=".docx,.pdf,.txt,.png,.jpg,.jpeg,.webp"
                    onChange={handleUploadExamFile}
                    disabled={isUploading}
                    className="hidden"
                  />
                </label>
                <div className="text-[10px] text-stone-400 text-center mt-2">
                  Hỗ trợ Word (.docx), PDF (.pdf), ảnh chụp đề (.png, .jpg) và văn bản (.txt)
                </div>
              </div>
            </div>

            {/* Lựa chọn 2: Dán nội dung đề trực tiếp */}
            <div className="p-6 bg-white rounded-2xl border border-stone-200 shadow-xs flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
                  <FileText className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-stone-900 text-sm">
                  2. Dán trực tiếp nội dung đề bài
                </h3>
                <p className="text-xs text-stone-500 leading-relaxed">
                  Sao chép và dán nhanh nội dung đề từ Zalo, Word hoặc trang web. Cho phép dán thêm tệp đáp án/hướng dẫn chấm riêng nếu có.
                </p>
              </div>

              <div>
                <button
                  onClick={() => setShowPasteModal(true)}
                  className="w-full py-2.5 px-4 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs"
                >
                  <FileText className="w-4 h-4" />
                  <span>Mở khung dán đề bài</span>
                </button>
                <div className="text-[10px] text-stone-400 text-center mt-2">Phù hợp khi không có sẵn tệp tài liệu</div>
              </div>
            </div>

            {/* Lựa chọn 3: Tạo đề nhanh theo Mẫu A hoặc Mẫu B */}
            <div className="p-6 bg-white rounded-2xl border border-stone-200 shadow-xs flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-stone-900 text-sm">
                  3. Tạo đề chuẩn Mẫu A hoặc Mẫu B
                </h3>
                <p className="text-xs text-stone-500 leading-relaxed">
                  Tạo nhanh đề thi từ kho ngữ liệu đã kiểm duyệt. Tự động thiết lập cấu trúc 10,0đ, rubric chuẩn và phân bổ thời gian 120 phút.
                </p>
              </div>

              <div>
                <button
                  onClick={() => setShowQuickCreateModal(true)}
                  className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Tạo đề theo mẫu ngay</span>
                </button>
                <div className="text-[10px] text-stone-400 text-center mt-2">Tiết kiệm 100% thời gian soạn đề</div>
              </div>
            </div>
          </div>

          {/* CÔNG CỤ SAO LƯU, XEM TRƯỚC & CHUYỂN ĐỔI DỮ LIỆU CŨ (V1 -> V2 AN TOÀN) */}
          {!isDemoMode && (realLegacyExams.length > 0 || realLegacySubs.length > 0 || legacyMigrationNotice) && (
            <div className="p-5 bg-amber-50 rounded-2xl border border-amber-300 space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="font-bold text-amber-950 flex items-center gap-2 text-sm">
                    <ShieldCheck className="w-4 h-4 text-amber-700" />
                    <span>Chuyển đổi dữ liệu phiên bản cũ (v1) sang kho dữ liệu thật (v2)</span>
                  </div>
                  <p className="text-amber-900">
                    Phát hiện <strong>{realLegacyExams.length} đề thi</strong> và{' '}
                    <strong>{realLegacySubs.length} bài nộp</strong> từ bộ nhớ phiên bản cũ. Hệ thống hỗ trợ Sao lưu (JSON), Xem trước và Chuyển đổi mà <strong>không xóa dữ liệu nguồn</strong>.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleBackupLegacyData}
                    className="px-3 py-1.5 bg-white hover:bg-amber-100 text-amber-950 border border-amber-400 rounded-lg font-bold cursor-pointer transition-colors"
                  >
                    1. Tải bản Sao lưu (.json)
                  </button>
                  <button
                    type="button"
                    onClick={() => setLegacyPreviewOpen((prev) => !prev)}
                    className="px-3 py-1.5 bg-white hover:bg-amber-100 text-amber-950 border border-amber-400 rounded-lg font-bold cursor-pointer transition-colors"
                  >
                    {legacyPreviewOpen ? 'Ẩn Xem trước' : '2. Xem trước dữ liệu'}
                  </button>
                  <button
                    type="button"
                    onClick={handleMigrateLegacyData}
                    className="px-3.5 py-1.5 bg-amber-800 hover:bg-amber-900 text-white rounded-lg font-bold cursor-pointer transition-colors"
                  >
                    3. Chuyển sang kho v2 (Giữ nguyên nguồn)
                  </button>
                </div>
              </div>

              {legacyMigrationNotice && (
                <div className="p-2.5 bg-emerald-100 border border-emerald-300 text-emerald-950 rounded-lg font-semibold">
                  {legacyMigrationNotice}
                </div>
              )}

              {legacyPreviewOpen && (
                <div className="p-3 bg-white rounded-xl border border-amber-200 space-y-2 max-h-52 overflow-y-auto">
                  <div className="font-bold text-stone-800">
                    Danh sách Xem trước ({realLegacyExams.length} đề, {realLegacySubs.length} bài nộp):
                  </div>
                  {realLegacyExams.map((le) => (
                    <div key={le.id} className="text-[11px] text-stone-700 border-b border-stone-100 pb-1">
                      • [Đề thi] <strong>{le.code}</strong> — {le.title} ({le.createdAt})
                    </div>
                  ))}
                  {realLegacySubs.map((ls) => (
                    <div key={ls.id} className="text-[11px] text-stone-700 border-b border-stone-100 pb-1">
                      • [Bài nộp] <strong>{ls.studentName}</strong> — {ls.examTitle} ({ls.submittedAt})
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* BẢNG DANH MỤC CÁC ĐỀ ĐANG QUẢN LÝ */}
          <div className="p-6 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-3">
              <h3 className="font-serif-literary font-bold text-base text-[#0F172A] flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-700" />
                <span>
                  Danh sách đề thi hoàn chỉnh {isDemoMode ? '[Chế độ Dữ liệu Minh họa]' : 'thực tế'} ({exams.length} đề)
                </span>
              </h3>
              <span className="text-xs text-stone-500">Đã kiểm tra tính nhất quán 10,0 điểm</span>
            </div>

            {exams.length === 0 ? (
              <div className="p-8 text-center rounded-xl bg-stone-50 border border-dashed border-stone-200 space-y-3">
                <p className="text-xs font-semibold text-stone-700">
                  Kho đề thi thực tế đang trống (Hệ thống không tự động trộn đề mẫu kiểm thử vào dữ liệu thật).
                </p>
                <p className="text-[11px] text-stone-500 max-w-lg mx-auto">
                  Thầy/Cô có thể tải tệp đề (.docx, .pdf, ảnh), dán văn bản đề, tạo nhanh đề chuẩn Mẫu A/B, hoặc bật chế độ Dữ liệu minh họa để xem 7 kịch bản mẫu.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowQuickCreateModal(true)}
                    className="px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold cursor-pointer"
                  >
                    + Tạo đề chuẩn Mẫu A / Mẫu B
                  </button>
                  {onToggleDemoMode && (
                    <button
                      type="button"
                      onClick={onToggleDemoMode}
                      className="px-3.5 py-2 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 text-xs font-bold cursor-pointer"
                    >
                      Xem 7 kịch bản Dữ liệu minh họa
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="divide-y divide-stone-100 text-xs">
                {exams.map((ex) => {
                  const unresolvedCount = ex.verificationFlags.filter((f) => !f.isResolved).length;
                  return (
                    <div
                      key={ex.id}
                      className={`py-3.5 px-3 rounded-xl flex flex-wrap items-center justify-between gap-3 transition-colors ${
                        ex.id === selectedExamId ? 'bg-emerald-50/60 border border-emerald-300' : 'hover:bg-stone-50'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-stone-800 bg-stone-100 px-2 py-0.5 rounded text-[11px]">
                            {ex.code}
                          </span>
                          <span className="font-bold text-stone-900 text-sm">{ex.title}</span>
                          {isDemoMode && (
                            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold">
                              Dữ liệu minh họa
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                            {ex.templateType === 'template_a'
                              ? 'Mẫu A'
                              : ex.templateType === 'template_b'
                              ? 'Mẫu B'
                              : 'Tùy chỉnh'}
                          </span>
                        </div>
                        <div className="text-stone-500 text-[11px] flex items-center gap-4">
                          <span>Đọc hiểu: {formatVNDecimal(ex.readingPassage.maxScore)}đ ({ex.readingPassage.questions.length} câu)</span>
                          <span>· Đoạn văn: 2,0đ</span>
                          <span>· Bài văn: 4,0đ</span>
                          <span>· Tổng: <strong>{formatVNDecimal(ex.totalScore)}đ</strong></span>
                          <span>· Thời gian: {ex.durationMinutes} phút</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {unresolvedCount > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 font-bold text-[11px]">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>{unresolvedCount} mục cần xác nhận</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px]">
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span>Chuẩn hóa 100%</span>
                          </span>
                        )}

                        <button
                          onClick={() => {
                            setSelectedExamId(ex.id);
                            setCurrentStep(2);
                          }}
                          className="px-3 py-1.5 bg-[#0F172A] hover:bg-stone-800 text-white rounded-lg font-bold text-xs transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <span>Kiểm tra & Giao</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* BẢNG NHẬN DIỆN & PHÂN LOẠI NGÂN HÀNG ĐỀ LUYỆN TẬP (YÊU CẦU 2) */}
          <div className="p-6 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-3">
              <div>
                <h3 className="font-serif-literary font-bold text-base text-[#0F172A] flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-indigo-700" />
                  <span>
                    Nhận diện & Phân loại Ngân hàng Đề luyện tập (Đọc hiểu · Đoạn văn 200 chữ · Bài văn 600 chữ)
                  </span>
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  Tự động kiểm tra nhãn phân loại và Mã Rubric chuẩn. Các đề thiếu Rubric hoặc chưa xác định dạng bài được gắn nhãn{' '}
                  <strong className="text-amber-800">“Chờ giáo viên kiểm tra”</strong> và tự động chặn không hiển thị cho học sinh.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50 text-stone-600 font-bold">
                    <th className="py-2.5 px-3">Tên đề trong ngân hàng</th>
                    <th className="py-2.5 px-3">Phần</th>
                    <th className="py-2.5 px-3">Loại văn bản / Dạng nghị luận</th>
                    <th className="py-2.5 px-3">Mức độ & Kĩ năng</th>
                    <th className="py-2.5 px-3">Mẫu đề</th>
                    <th className="py-2.5 px-3">Mã Rubric</th>
                    <th className="py-2.5 px-3">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {[
                    ...SAMPLE_READING_PASSAGES.map(classifyReadingPassageItem),
                    ...SAMPLE_WRITING_PROMPTS.map(classifyWritingPromptItem)
                  ].map((item) => (
                    <tr key={item.itemId} className="hover:bg-stone-50/80">
                      <td className="py-2.5 px-3 font-semibold text-stone-900">
                        <div>{item.title}</div>
                        {item.reviewReason && (
                          <div className="text-[11px] text-amber-800 font-normal mt-0.5">
                            • {item.reviewReason}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-stone-700">{item.sectionLabel}</td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded bg-stone-100 text-stone-800 font-semibold text-[11px]">
                          {item.readingTextTypeLabel || item.writingArgumentTypeLabel}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-stone-600">
                        <span className="font-bold text-stone-800">{item.level}</span> · {item.targetSkillName}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-indigo-800">
                        Mẫu {item.examTemplate}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px]">
                        {item.rubricId ? (
                          <span className="text-emerald-800 font-bold">{item.rubricId}</span>
                        ) : (
                          <span className="text-rose-700 font-bold">Chưa gắn Rubric</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                            item.isReadyForStudent
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-amber-50 text-amber-900 border-amber-300'
                          }`}
                        >
                          {item.statusBadge}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* BƯỚC 2: KIỂM TRA NHANH & GIẢI QUYẾT CỜ XÁC NHẬN */}
      {/* ======================================================== */}
      {currentStep === 2 && activeExam && (
        <div className="space-y-6">
          {/* TỔNG QUAN ĐỀ THI ĐÃ PHÂN TÍCH */}
          <div className="p-6 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-stone-700 bg-stone-100 px-2 py-0.5 rounded text-xs">
                    {activeExam.code}
                  </span>
                  <h3 className="font-serif-literary font-bold text-lg text-[#0F172A]">
                    {activeExam.title}
                  </h3>
                </div>
                <div className="text-xs text-stone-500 mt-1 flex flex-wrap items-center gap-2">
                  <span>
                    Cấu trúc: <strong>{activeExam.templateLabel}</strong>
                  </span>
                  {(() => {
                    const cls = classifyExamForTeacherBank(activeExam);
                    return (
                      <>
                        <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-900 border border-indigo-200 font-mono text-[11px] font-bold">
                          Mã Rubric: {cls.rubricCode}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                            cls.isPublishedAndReady
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-amber-50 text-amber-900 border-amber-300'
                          }`}
                        >
                          {cls.statusBadge}
                        </span>
                      </>
                    );
                  })()}
                </div>

                {/* Bộ chỉnh sửa nhanh phân loại đề dành cho Giáo viên (Yêu cầu 2) */}
                <div className="mt-3 p-3 rounded-xl bg-stone-50 border border-stone-200 flex flex-wrap items-center gap-3 text-xs">
                  <span className="font-bold text-stone-700">Chỉnh phân loại đề:</span>
                  <label className="flex items-center gap-1.5">
                    <span className="text-stone-500">Mẫu đề:</span>
                    <select
                      value={activeExam.templateType}
                      onChange={(e) => {
                        const nextTpl = e.target.value as ExamTemplateType;
                        const updated: CompleteExam = {
                          ...activeExam,
                          templateType: nextTpl,
                          templateLabel:
                            nextTpl === 'template_a'
                              ? 'Mẫu A (Đọc hiểu văn học — Đoạn NLVH 200 chữ — Bài NLXH 600 chữ)'
                              : nextTpl === 'template_b'
                              ? 'Mẫu B (Đọc hiểu nghị luận/thông tin — Đoạn NLXH 200 chữ — Bài NLVH 600 chữ)'
                              : 'Cấu trúc tùy chỉnh'
                        };
                        const nextList = exams.map((ex) => (ex.id === updated.id ? updated : ex));
                        setExams(nextList);
                        saveStoredCompleteExams(nextList, isDemoMode);
                      }}
                      className="px-2 py-1 rounded border border-stone-300 bg-white font-semibold text-stone-800"
                    >
                      <option value="template_a">Mẫu A</option>
                      <option value="template_b">Mẫu B</option>
                      <option value="custom">Tùy chỉnh</option>
                    </select>
                  </label>

                  <label className="flex items-center gap-1.5">
                    <span className="text-stone-500">Loại VB Đọc hiểu:</span>
                    <select
                      value={activeExam.readingPassage.genre}
                      onChange={(e) => {
                        const nextGenre = e.target.value as any;
                        const genreName =
                          nextGenre === 'van_hoc'
                            ? 'Văn bản văn học'
                            : nextGenre === 'nghi_luan'
                            ? 'Văn bản nghị luận'
                            : 'Văn bản thông tin';
                        const updated: CompleteExam = {
                          ...activeExam,
                          readingPassage: {
                            ...activeExam.readingPassage,
                            genre: nextGenre,
                            genreName
                          }
                        };
                        const nextList = exams.map((ex) => (ex.id === updated.id ? updated : ex));
                        setExams(nextList);
                        saveStoredCompleteExams(nextList, isDemoMode);
                      }}
                      className="px-2 py-1 rounded border border-stone-300 bg-white font-semibold text-stone-800"
                    >
                      <option value="van_hoc">Văn bản văn học</option>
                      <option value="nghi_luan">Văn bản nghị luận</option>
                      <option value="thong_tin">Văn bản thông tin</option>
                    </select>
                  </label>

                  <label className="flex items-center gap-1.5">
                    <span className="text-stone-500">Đoạn 200 chữ:</span>
                    <select
                      value={activeExam.writingTasks.paragraphTask.type}
                      onChange={(e) => {
                        const nextType = e.target.value as 'nghi_luan_xa_hoi' | 'nghi_luan_van_hoc';
                        const updated: CompleteExam = {
                          ...activeExam,
                          writingTasks: {
                            ...activeExam.writingTasks,
                            paragraphTask: {
                              ...activeExam.writingTasks.paragraphTask,
                              type: nextType,
                              typeName:
                                nextType === 'nghi_luan_xa_hoi'
                                  ? '2.1. Nghị luận xã hội'
                                  : '2.2. Nghị luận văn học'
                            }
                          }
                        };
                        const nextList = exams.map((ex) => (ex.id === updated.id ? updated : ex));
                        setExams(nextList);
                        saveStoredCompleteExams(nextList, isDemoMode);
                      }}
                      className="px-2 py-1 rounded border border-stone-300 bg-white font-semibold text-stone-800"
                    >
                      <option value="nghi_luan_xa_hoi">2.1. Nghị luận xã hội</option>
                      <option value="nghi_luan_van_hoc">2.2. Nghị luận văn học</option>
                    </select>
                  </label>

                  <label className="flex items-center gap-1.5">
                    <span className="text-stone-500">Bài 600 chữ:</span>
                    <select
                      value={activeExam.writingTasks.essayTask.type}
                      onChange={(e) => {
                        const nextType = e.target.value as 'nghi_luan_xa_hoi' | 'nghi_luan_van_hoc';
                        const updated: CompleteExam = {
                          ...activeExam,
                          writingTasks: {
                            ...activeExam.writingTasks,
                            essayTask: {
                              ...activeExam.writingTasks.essayTask,
                              type: nextType,
                              typeName:
                                nextType === 'nghi_luan_xa_hoi'
                                  ? '2.1. Nghị luận xã hội'
                                  : '2.2. Nghị luận văn học'
                            }
                          }
                        };
                        const nextList = exams.map((ex) => (ex.id === updated.id ? updated : ex));
                        setExams(nextList);
                        saveStoredCompleteExams(nextList, isDemoMode);
                      }}
                      className="px-2 py-1 rounded border border-stone-300 bg-white font-semibold text-stone-800"
                    >
                      <option value="nghi_luan_xa_hoi">2.1. Nghị luận xã hội</option>
                      <option value="nghi_luan_van_hoc">2.2. Nghị luận văn học</option>
                    </select>
                  </label>
                </div>
              </div>

              {/* BẢNG ĐIỂM CHUẨN HÓA */}
              <div className="flex items-center gap-2 text-xs">
                <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-center">
                  <div className="text-[10px] text-blue-700 font-semibold">Đọc hiểu</div>
                  <div className="text-base font-bold text-blue-900 font-mono">
                    {formatVNDecimal(activeExam.readingPassage.maxScore)}đ
                  </div>
                </div>
                <div className="text-stone-300 font-bold">+</div>
                <div className="p-2.5 bg-purple-50 border border-purple-200 rounded-xl text-center">
                  <div className="text-[10px] text-purple-700 font-semibold">Đoạn 200 chữ</div>
                  <div className="text-base font-bold text-purple-900 font-mono">
                    {formatVNDecimal(activeExam.writingTasks.paragraphTask.maxScore)}đ
                  </div>
                </div>
                <div className="text-stone-300 font-bold">+</div>
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
                  <div className="text-[10px] text-emerald-700 font-semibold">Bài 600 chữ</div>
                  <div className="text-base font-bold text-emerald-900 font-mono">
                    {formatVNDecimal(activeExam.writingTasks.essayTask.maxScore)}đ
                  </div>
                </div>
                <div className="text-stone-300 font-bold">=</div>
                <div className={`p-2.5 rounded-xl text-center border ${
                  activeExam.totalScore === 10.0
                    ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                    : 'bg-amber-100 text-amber-900 border-amber-300'
                }`}>
                  <div className="text-[10px] font-semibold">Tổng điểm</div>
                  <div className="text-base font-bold font-mono">
                    {formatVNDecimal(activeExam.totalScore)}/10,0đ
                  </div>
                </div>
              </div>
            </div>

            {/* THÔNG BÁO TÍNH NHẤT QUÁN */}
            {!activeExam.consistencyReport.isValid && (
              <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-950 space-y-2">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-700" />
                  <span>Phát hiện mâu thuẫn điểm giữa các phần!</span>
                </div>
                <ul className="list-disc pl-5 space-y-1 text-stone-700">
                  {activeExam.consistencyReport.discrepancies.map((d, idx) => (
                    <li key={idx}>{d}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* DANH SÁCH MỤC CẦN XÁC MINH (VERIFICATION QUEUE) */}
          {activeExam.verificationFlags.length > 0 && (
            <div className="p-6 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                <h4 className="font-bold text-stone-900 text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>
                    Các mục AI cần giáo viên xác nhận ({activeExam.verificationFlags.filter((f) => !f.isResolved).length} mục chờ duyệt)
                  </span>
                </h4>
                <span className="text-[11px] text-stone-500">Chỉ can thiệp vào nội dung chưa chắc chắn</span>
              </div>

              <div className="space-y-3 text-xs">
                {activeExam.verificationFlags.map((flag) => (
                  <div
                    key={flag.id}
                    className={`p-4 rounded-xl border transition-all ${
                      flag.isResolved
                        ? 'bg-stone-50/70 border-stone-200 opacity-60'
                        : 'bg-amber-50/60 border-amber-300'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1.5 max-w-2xl">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            flag.status === 'needs_teacher_confirm'
                              ? 'bg-amber-200 text-amber-900'
                              : flag.status === 'missing_data'
                              ? 'bg-rose-200 text-rose-900'
                              : 'bg-blue-200 text-blue-900'
                          }`}>
                            {flag.status === 'needs_teacher_confirm'
                              ? 'Cần xác nhận'
                              : flag.status === 'missing_data'
                              ? 'Thiếu dữ liệu'
                              : 'Không đọc được'}
                          </span>
                          <span className="font-bold text-stone-900 text-sm">{flag.fieldLabel}</span>
                        </div>

                        <div className="text-stone-700 text-xs">
                          <strong>Lí do:</strong> {flag.reason}
                        </div>

                        <div className="p-2.5 bg-white/80 rounded-lg border border-stone-200 text-stone-600 font-mono text-[11px]">
                          <strong>Đoạn trích từ tệp:</strong> "{flag.originalSnippet}"
                        </div>

                        <div className="text-emerald-900 font-medium">
                          <strong>Đề xuất xử lý:</strong> {flag.suggestedResolution}
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        {flag.isResolved ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-xs bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                            <Check className="w-4 h-4" />
                            <span>Đã xác nhận</span>
                          </span>
                        ) : (
                          <button
                            onClick={() => handleResolveFlag(flag.id, flag.resolvedValue)}
                            className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Đồng ý đề xuất</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CHI TIẾT 3 PHẦN CỦA ĐỀ ĐÃ BÓC TÁCH */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* CỘT TRÁI: NGỮ LIỆU & CÂU HỎI ĐỌC HIỂU (7/12 CỘT) */}
            <div className="lg:col-span-7 space-y-4">
              <div className="p-6 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                  <h4 className="font-serif-literary font-bold text-base text-[#0F172A] flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-blue-700" />
                    <span>Phần I. Đọc hiểu — {formatVNDecimal(activeExam.readingPassage.maxScore)} điểm</span>
                  </h4>
                  <span className="text-[11px] text-stone-500 font-semibold">{activeExam.readingPassage.genreName}</span>
                </div>

                {/* Văn bản ngữ liệu */}
                <div className="p-4 bg-stone-50 rounded-xl border border-stone-200 space-y-2 text-xs">
                  <div className="font-bold text-stone-900 text-sm">{activeExam.readingPassage.title}</div>
                  <div className="text-stone-500 text-[11px] italic">
                    Tác giả: {activeExam.readingPassage.author} ({activeExam.readingPassage.source})
                  </div>
                  <p className="whitespace-pre-line text-stone-700 leading-relaxed font-serif text-[13px] pt-2 border-t border-stone-200">
                    {activeExam.readingPassage.content}
                  </p>
                </div>

                {/* Danh sách câu hỏi đọc hiểu */}
                <div className="space-y-3 pt-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-stone-700 block">
                    Hệ thống câu hỏi đọc hiểu ({activeExam.readingPassage.questions.length} câu):
                  </span>
                  {activeExam.readingPassage.questions.map((q) => (
                    <div key={q.id} className="p-3.5 bg-stone-50/70 rounded-xl border border-stone-200 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between text-stone-800">
                        <span className="font-bold text-blue-900">
                          Câu {q.order} ({q.levelName}) — {formatVNDecimal(q.maxScore)}đ
                        </span>
                        <span className="text-[10px] text-stone-400">
                          {q.extractionStatus === 'extracted_clear' ? '✓ Đã trích xuất rõ' : '⚠ Cần xác nhận'}
                        </span>
                      </div>
                      <p className="text-stone-800 font-medium">{q.question}</p>
                      {q.answerGuide && (
                        <div className="text-[11px] text-stone-600 bg-white p-2 rounded border border-stone-200">
                          <strong>Hướng dẫn chấm:</strong> {q.answerGuide}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* CỘT PHẢI: PHẦN VIẾT & RUBRIC (5/12 CỘT) */}
            <div className="lg:col-span-5 space-y-4">
              {/* Câu 1: Đoạn văn ~200 chữ */}
              <div className="p-5 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-3 text-xs">
                <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                  <div className="flex items-center gap-1.5 text-purple-900 font-bold">
                    <PenTool className="w-4 h-4 text-purple-700" />
                    <span>Phần II. Câu 1: Đoạn văn ~200 chữ ({formatVNDecimal(activeExam.writingTasks.paragraphTask.maxScore)}đ)</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 font-bold text-[10px]">
                    {activeExam.writingTasks.paragraphTask.typeName}
                  </span>
                </div>
                <p className="text-stone-800 leading-relaxed font-medium">
                  {activeExam.writingTasks.paragraphTask.promptText}
                </p>

                {/* Barem Rubric 4 tiêu chí */}
                <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-2">
                  <div className="text-[11px] font-bold text-stone-700 flex items-center justify-between">
                    <span>Rubric chấm chuẩn (4 tiêu chí):</span>
                    {activeExam.writingTasks.paragraphTask.isAiDraftRubric && (
                      <span className="text-[10px] text-amber-700 font-bold">AI dự thảo</span>
                    )}
                  </div>
                  {activeExam.writingTasks.paragraphTask.rubric.map((crit) => (
                    <div key={crit.id} className="text-[11px] flex items-center justify-between text-stone-600 border-b border-stone-100 pb-1">
                      <span>{crit.name}</span>
                      <span className="font-mono font-bold text-stone-800">{crit.weightLabel}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Câu 2: Bài văn ~600 chữ */}
              <div className="p-5 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-3 text-xs">
                <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                  <div className="flex items-center gap-1.5 text-emerald-900 font-bold">
                    <PenTool className="w-4 h-4 text-emerald-700" />
                    <span>Phần II. Câu 2: Bài văn ~600 chữ ({formatVNDecimal(activeExam.writingTasks.essayTask.maxScore)}đ)</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold text-[10px]">
                    {activeExam.writingTasks.essayTask.typeName}
                  </span>
                </div>
                <p className="text-stone-800 leading-relaxed font-medium">
                  {activeExam.writingTasks.essayTask.promptText}
                </p>

                {/* Barem Rubric 4 tiêu chí */}
                <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-2">
                  <div className="text-[11px] font-bold text-stone-700 flex items-center justify-between">
                    <span>Rubric chấm chuẩn (4 tiêu chí):</span>
                    {activeExam.writingTasks.essayTask.isAiDraftRubric && (
                      <span className="text-[10px] text-amber-700 font-bold">AI dự thảo</span>
                    )}
                  </div>
                  {activeExam.writingTasks.essayTask.rubric.map((crit) => (
                    <div key={crit.id} className="text-[11px] flex items-center justify-between text-stone-600 border-b border-stone-100 pb-1">
                      <span>{crit.name}</span>
                      <span className="font-mono font-bold text-stone-800">{crit.weightLabel}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* HÀNH ĐỘNG TIẾP THEO: TIẾN VÀO BƯỚC 3 */}
              <div className="p-5 bg-[#0F172A] text-white rounded-2xl space-y-3 shadow-md">
                <div className="space-y-1">
                  <div className="text-sm font-bold flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span>Đề thi đã sẵn sàng để phát hành</span>
                  </div>
                  <p className="text-xs text-stone-300">
                    Toàn bộ cấu trúc điểm 10,0 và các câu hỏi đã được kiểm định. Chuyển sang Bước 3 để giao cho học sinh.
                  </p>
                </div>
                <button
                  onClick={() => setCurrentStep(3)}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-sm"
                >
                  <span>Tiếp tục: Bước 3 — Giao bài cho lớp</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* BƯỚC 3: GIAO BÀI CHO LỚP */}
      {/* ======================================================== */}
      {currentStep === 3 && activeExam && (
        <div className="max-w-2xl mx-auto space-y-6">
          {assignSuccessMsg && (
            <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-900 flex items-center gap-2 shadow-xs">
              <CheckCircle className="w-4 h-4 text-emerald-700 shrink-0" />
              <span className="font-semibold">{assignSuccessMsg}</span>
            </div>
          )}

          <div className="p-6 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-5 text-xs">
            <div className="border-b border-stone-100 pb-3">
              <h3 className="font-serif-literary font-bold text-lg text-[#0F172A]">
                Bước 3: Phát hành đề thi cho học sinh
              </h3>
              <p className="text-stone-500 text-xs mt-0.5">
                Thiết lập lớp nhận đề, hình thức tổ chức và thời hạn hoàn thành.
              </p>
            </div>

            <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-stone-700">
              <div className="font-bold text-sm text-stone-900">[{activeExam.code}] {activeExam.title}</div>
              <div className="text-[11px] text-stone-500 mt-1">
                Cấu trúc: {activeExam.templateLabel} — Thời gian: {activeExam.durationMinutes} phút
              </div>
            </div>

            <div className="space-y-4">
              {/* Chọn lớp */}
              <div>
                <label className="block font-bold text-stone-800 mb-1.5">
                  1. Lớp học sinh được giao đề:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {['12A1', '12A2', 'Tất cả lớp'].map((cl) => (
                    <button
                      key={cl}
                      type="button"
                      onClick={() => setAssignClass(cl)}
                      className={`py-2 px-3 rounded-lg border font-bold text-xs transition-colors cursor-pointer ${
                        assignClass === cl
                          ? 'bg-blue-50 border-blue-600 text-blue-900'
                          : 'bg-white border-stone-300 text-stone-700 hover:bg-stone-50'
                      }`}
                    >
                      Lớp {cl}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chọn hình thức */}
              <div>
                <label className="block font-bold text-stone-800 mb-1.5">
                  2. Hình thức làm bài:
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div
                    onClick={() => setAssignMode('mock_exam')}
                    className={`p-3 rounded-xl border cursor-pointer transition-colors space-y-1 ${
                      assignMode === 'mock_exam'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-950'
                        : 'bg-white border-stone-300 text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    <div className="font-bold flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-emerald-700" />
                      <span>Thi thử nghiêm túc (120 phút)</span>
                    </div>
                    <p className="text-[11px] text-stone-500">
                      Bấm giờ liên tục 120 phút, không hiển thị gợi ý đáp án trước khi nộp.
                    </p>
                  </div>

                  <div
                    onClick={() => setAssignMode('practice')}
                    className={`p-3 rounded-xl border cursor-pointer transition-colors space-y-1 ${
                      assignMode === 'practice'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-950'
                        : 'bg-white border-stone-300 text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    <div className="font-bold flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4 text-emerald-700" />
                      <span>Luyện tập tự do</span>
                    </div>
                    <p className="text-[11px] text-stone-500">
                      Học sinh làm từng phần, lưu nháp linh hoạt, có câu hỏi định hướng sư phạm.
                    </p>
                  </div>
                </div>
              </div>

              {/* Hạn nộp bài */}
              <div>
                <label className="block font-bold text-stone-800 mb-1.5">
                  3. Thời hạn nộp bài:
                </label>
                <input
                  type="date"
                  value={assignDueDate}
                  onChange={(e) => setAssignDueDate(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-600"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-stone-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                className="px-4 py-2 text-stone-600 hover:bg-stone-100 rounded-lg cursor-pointer"
              >
                Quay lại kiểm tra
              </button>

              <button
                type="button"
                onClick={handleConfirmAssignment}
                className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-2 shadow-xs"
              >
                <Send className="w-4 h-4" />
                <span>Xác nhận phát hành đề thi</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* BƯỚC 4: DUYỆT KẾT QUẢ & HÀNG ĐỢI XÁC MINH AI */}
      {/* ======================================================== */}
      {currentStep === 4 && (
        <div className="space-y-6">
          {approvalNotice && (
            <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-900 flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-700 shrink-0" />
                <span className="font-semibold">{approvalNotice}</span>
              </div>
              <button
                onClick={() => setApprovalNotice(null)}
                className="text-emerald-700 hover:text-emerald-900 p-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* CỘT TRÁI: DANH SÁCH BÀI NỘP CỦA HỌC SINH (4/12 CỘT) */}
            <div className="lg:col-span-4 space-y-4">
              <div className="p-5 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                  <h4 className="font-bold text-stone-900 text-sm flex items-center gap-2">
                    <Award className="w-4 h-4 text-purple-700" />
                    <span>Hàng đợi bài nộp ({submissions.length} bài)</span>
                  </h4>
                  <span className="text-[11px] text-stone-500">Lớp 12A1</span>
                </div>

                <div className="space-y-2 text-xs">
                  {submissions.map((sub) => (
                    <div
                      key={sub.id}
                      onClick={() => {
                        setSelectedSubmissionId(sub.id);
                        if (sub.aiEvaluation) {
                          const rScore = Object.values(sub.aiEvaluation.readingScores).reduce((a, b) => a + b.score, 0);
                          setEditReadingScore(Number(rScore.toFixed(2)));
                          setEditParagraphScore(sub.aiEvaluation.paragraphFeedback.aiSuggestedScore || 1.75);
                          setEditEssayScore(sub.aiEvaluation.essayFeedback.aiSuggestedScore || 3.5);
                        }
                      }}
                      className={`p-3 rounded-xl border cursor-pointer transition-colors space-y-1 ${
                        sub.id === selectedSubmissionId
                          ? 'bg-blue-50 border-blue-500 shadow-2xs'
                          : 'bg-stone-50 border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-stone-900">{sub.studentName}</span>
                        <span className="font-mono text-[11px] text-stone-500">{sub.studentId}</span>
                      </div>
                        <div className="flex items-center justify-between">
                          <span>Nộp lúc: {sub.submittedAt} (v{sub.submissionVersion || 1})</span>
                          {sub.status === 'teacher_approved' ? (
                            <span className="text-emerald-700 font-bold">
                              ✓ GV đã duyệt ({formatVNDecimal(sub.teacherConfirmedScore?.totalScore)}đ)
                            </span>
                          ) : sub.aiEvaluation?.evaluationSource === 'gemini_ai' ? (
                            <span className="text-blue-700 font-bold">
                              AI đề xuất: {formatVNDecimal(sub.aiEvaluation?.proposedTotal)}đ
                            </span>
                          ) : (
                            <span className="text-amber-800 font-bold">
                              Gợi ý quy tắc: {formatVNDecimal(sub.aiEvaluation?.proposedTotal)}đ
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* CỘT PHẢI: CHI TIẾT BÀI LÀM & PANEL THẨM ĐỊNH ĐIỂM (8/12 CỘT) */}
              <div className="lg:col-span-8 space-y-4">
                {selectedSub ? (
                  <div className="p-6 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-5 text-xs">
                    {/* Header bài nộp */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 pb-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-stone-900 text-base">{selectedSub.studentName}</span>
                          <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 font-mono text-[11px]">
                            Lớp {selectedSub.className} · Phiên bản v{selectedSub.submissionVersion || 1}
                          </span>
                          {selectedSub.status === 'teacher_approved' ? (
                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                              ✓ Đã duyệt chính thức (Khóa bảo vệ)
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold text-[10px]">
                              Chờ giáo viên duyệt điểm
                            </span>
                          )}
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                              selectedSub.aiEvaluation?.evaluationSource === 'gemini_ai'
                                ? 'bg-blue-50 text-blue-900 border-blue-300'
                                : 'bg-amber-50 text-amber-950 border-amber-300'
                            }`}
                          >
                            {selectedSub.aiEvaluation?.evaluationSourceLabel ||
                              (selectedSub.aiEvaluation?.evaluationSource === 'gemini_ai'
                                ? 'Chấm sơ bộ bằng Gemini AI (Chờ giáo viên duyệt)'
                                : 'Gợi ý theo quy tắc — chưa phải chấm AI')}
                          </span>
                        </div>
                        <div className="text-stone-500 text-[11px] mt-0.5">
                          Đề thi: {selectedSub.examTitle} · Thời gian làm: {Math.round(selectedSub.durationSeconds / 60)} phút
                        </div>
                      </div>

                      {/* So sánh điểm Gợi ý/AI vs Điểm duyệt + Nút chấm lại AI */}
                      <div className="flex flex-wrap items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => handleReEvaluateWithAI(selectedSub.id)}
                          disabled={isReEvaluatingId === selectedSub.id}
                          className="px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 font-semibold text-[11px] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isReEvaluatingId === selectedSub.id ? 'animate-spin' : ''}`} />
                          <span>{isReEvaluatingId === selectedSub.id ? 'Đang gọi Gemini...' : 'Chấm tham khảo lại với AI'}</span>
                        </button>

                        <div className="p-2 bg-blue-50 border border-blue-200 rounded-xl text-center">
                          <div className="text-[10px] text-blue-700 font-semibold">
                            {selectedSub.aiEvaluation?.evaluationSource === 'gemini_ai'
                              ? 'AI Đề xuất (Tham khảo)'
                              : 'Gợi ý quy tắc (Chưa phải AI)'}
                          </div>
                          <div className="text-base font-bold text-blue-900 font-mono">
                            {formatVNDecimal(selectedSub.aiEvaluation?.proposedTotal)}/10,0đ
                          </div>
                        </div>

                        {selectedSub.teacherConfirmedScore && (
                          <div className="p-2 bg-emerald-100 border border-emerald-300 rounded-xl text-center">
                            <div className="text-[10px] text-emerald-800 font-semibold">Điểm Chính thức (Đã khóa)</div>
                            <div className="text-base font-bold text-emerald-950 font-mono">
                              {formatVNDecimal(selectedSub.teacherConfirmedScore.totalScore)}/10,0đ
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Hộp thông tin trạng thái xác nhận của Giáo viên */}
                    {selectedSub.teacherConfirmedScore && (
                      <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-950 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <strong>Trạng thái điểm chính thức:</strong> Đã được xác nhận bởi{' '}
                          <span className="font-bold">{selectedSub.teacherConfirmedScore.confirmedByTeacherName || 'Giáo viên bộ môn'}</span>{' '}
                          vào lúc <span className="font-mono">{selectedSub.teacherConfirmedScore.confirmedAt}</span>.
                        </div>
                        <span className="px-2 py-0.5 rounded bg-emerald-200/80 text-emerald-950 font-bold text-[10px]">
                          🔒 Không bị ghi đè bởi lần chấm AI tiếp theo
                        </span>
                      </div>
                    )}

                    {/* Cảnh báo nếu chưa cấu hình GEMINI_API_KEY hoặc lỗi mạng */}
                    {selectedSub.aiEvaluation?.apiWarningMessage && (
                      <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-950 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                        <div>
                          <strong className="font-bold">Lưu ý nguồn chấm: </strong>
                          <span>{selectedSub.aiEvaluation.apiWarningMessage}</span>
                        </div>
                      </div>
                    )}

                    {/* DANH SÁCH MỤC CẦN GIÁO VIÊN XEM LẠI */}
                    {selectedSub.aiEvaluation?.itemsNeedingTeacherReview &&
                      selectedSub.aiEvaluation.itemsNeedingTeacherReview.length > 0 && (
                        <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl space-y-2">
                          <div className="font-bold text-amber-950 flex items-center gap-1.5 text-xs">
                            <AlertTriangle className="w-4 h-4 text-amber-700" />
                            <span>Cờ cần giáo viên xem lại ({selectedSub.aiEvaluation.itemsNeedingTeacherReview.length} nội dung):</span>
                          </div>
                          <div className="space-y-1.5 text-[11px]">
                            {selectedSub.aiEvaluation.itemsNeedingTeacherReview.map((item) => (
                              <div key={item.id} className="p-2 bg-white rounded border border-amber-200 space-y-0.5">
                                <div className="font-bold text-stone-900">{item.title}</div>
                                <div className="text-stone-600">{item.reason}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    {/* NỘI DUNG BÀI LÀM: ĐỌC HIỂU */}
                    <div className="space-y-3 pt-2">
                      <h5 className="font-bold text-blue-900 text-sm border-b border-stone-100 pb-1 flex items-center gap-1.5">
                        <BookOpen className="w-4 h-4" />
                        <span>Phần I: Câu trả lời Đọc hiểu của học sinh (Thang 4,0 điểm)</span>
                      </h5>
                      {Object.entries(selectedSub.answers.readingAnswers).map(([qId, ans], idx) => {
                        const qScoreObj = selectedSub.aiEvaluation?.readingScores[qId];
                        return (
                          <div key={qId} className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-1.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-bold text-stone-800">Câu {idx + 1}</span>
                              {qScoreObj && (
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] px-2 py-0.5 rounded bg-stone-200 text-stone-700">
                                    Độ chắc chắn: {qScoreObj.confidenceLevel === 'high' ? 'Cao' : qScoreObj.confidenceLevel === 'medium' ? 'Trung bình' : 'Thấp (Quy tắc)'}
                                  </span>
                                  <span className="font-mono text-blue-900 font-bold text-[11px]">
                                    Đề xuất: {formatVNDecimal(qScoreObj.score)}/{formatVNDecimal(qScoreObj.maxScore)}đ
                                  </span>
                                </div>
                              )}
                            </div>
                            <p className="p-2.5 bg-white rounded border border-stone-200 font-serif text-[12px] text-stone-800">
                              {ans}
                            </p>
                            {qScoreObj && (
                              <div className="text-[11px] text-stone-600 space-y-1">
                                <div>
                                  <strong>Lí do:</strong> {qScoreObj.rationale}
                                </div>
                                {qScoreObj.studentQuotes && qScoreObj.studentQuotes.length > 0 && (
                                  <div className="text-stone-700">
                                    <strong>Dẫn chứng trích từ bài học sinh:</strong>{' '}
                                    <span className="italic font-serif">"{qScoreObj.studentQuotes.join('"; "')}"</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                  {/* NỘI DUNG BÀI LÀM: ĐOẠN VĂN ~200 CHỮ */}
                  <div className="space-y-2 pt-2">
                    <h5 className="font-bold text-purple-900 text-sm border-b border-stone-100 pb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <PenTool className="w-4 h-4" />
                        <span>Phần II. Câu 1: Đoạn văn ~200 chữ</span>
                      </span>
                      <span className="font-mono text-[11px]">
                        AI đề xuất: {formatVNDecimal(selectedSub.aiEvaluation?.paragraphFeedback.aiSuggestedScore)}/2,0đ
                      </span>
                    </h5>
                    <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 font-serif text-[12px] text-stone-800 whitespace-pre-line leading-relaxed">
                      {selectedSub.answers.paragraphText}
                    </div>
                  </div>

                  {/* NỘI DUNG BÀI LÀM: BÀI VĂN ~600 CHỮ */}
                  <div className="space-y-2 pt-2">
                    <h5 className="font-bold text-emerald-900 text-sm border-b border-stone-100 pb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <PenTool className="w-4 h-4" />
                        <span>Phần II. Câu 2: Bài văn ~600 chữ</span>
                      </span>
                      <span className="font-mono text-[11px]">
                        AI đề xuất: {formatVNDecimal(selectedSub.aiEvaluation?.essayFeedback.aiSuggestedScore)}/4,0đ
                      </span>
                    </h5>
                    <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 font-serif text-[12px] text-stone-800 whitespace-pre-line leading-relaxed max-h-60 overflow-y-auto">
                      {selectedSub.answers.essayText}
                    </div>
                  </div>

                  {/* PANEL DUYỆT ĐIỂM TẠI CHỖ CỦA GIÁO VIÊN */}
                  <div className="p-5 bg-stone-100 rounded-2xl border border-stone-300 space-y-3 mt-4">
                    <h5 className="font-bold text-stone-900 text-sm flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-700" />
                      <span>Bảng điều chỉnh và phê duyệt điểm chính thức của Giáo viên</span>
                    </h5>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-stone-600 font-semibold mb-1">
                          1. Điểm Đọc hiểu (tối đa 4,0đ):
                        </label>
                        <select
                          value={editReadingScore}
                          onChange={(e) => setEditReadingScore(parseFloat(e.target.value))}
                          className="w-full p-2 bg-white border border-stone-300 rounded-lg font-mono font-bold text-xs"
                        >
                          {[1.0, 1.5, 2.0, 2.5, 3.0, 3.25, 3.5, 3.75, 4.0].map((v) => (
                            <option key={v} value={v}>
                              {formatVNDecimal(v)} điểm
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-stone-600 font-semibold mb-1">
                          2. Đoạn văn ~200 chữ (tối đa 2,0đ):
                        </label>
                        <select
                          value={editParagraphScore}
                          onChange={(e) => setEditParagraphScore(parseFloat(e.target.value))}
                          className="w-full p-2 bg-white border border-stone-300 rounded-lg font-mono font-bold text-xs"
                        >
                          {[0.5, 0.8, 1.0, 1.25, 1.5, 1.75, 2.0].map((v) => (
                            <option key={v} value={v}>
                              {formatVNDecimal(v)} điểm
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-stone-600 font-semibold mb-1">
                          3. Bài văn ~600 chữ (tối đa 4,0đ):
                        </label>
                        <select
                          value={editEssayScore}
                          onChange={(e) => setEditEssayScore(parseFloat(e.target.value))}
                          className="w-full p-2 bg-white border border-stone-300 rounded-lg font-mono font-bold text-xs"
                        >
                          {[1.5, 2.0, 2.5, 2.8, 3.0, 3.25, 3.5, 3.75, 4.0].map((v) => (
                            <option key={v} value={v}>
                              {formatVNDecimal(v)} điểm
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-stone-600 font-semibold mb-1">
                        Lời nhận xét sư phạm của giáo viên:
                      </label>
                      <input
                        type="text"
                        value={teacherNotesInput}
                        onChange={(e) => setTeacherNotesInput(e.target.value)}
                        className="w-full p-2 bg-white border border-stone-300 rounded-lg text-xs"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-stone-200">
                      <div className="text-stone-800 font-bold">
                        Tổng điểm chính thức: <strong className="text-emerald-700 text-sm font-mono">{formatVNDecimal(editReadingScore + editParagraphScore + editEssayScore)}/10,0đ</strong>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleApproveSubmission(selectedSub.id)}
                        className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                      >
                        <Check className="w-4 h-4" />
                        <span>Xác nhận phê duyệt điểm chính thức</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-12 text-center rounded-2xl bg-white border border-stone-200 text-xs text-stone-500">
                  Vui lòng chọn một bài nộp ở danh sách bên trái để kiểm tra và duyệt điểm.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL DÁN ĐỀ TRỰC TIẾP */}
      {/* ======================================================== */}
      {showPasteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 bg-[#0F172A] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-bold">Dán trực tiếp nội dung đề bài & Đáp án</h3>
              </div>
              <button
                onClick={() => setShowPasteModal(false)}
                className="text-stone-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div>
                <label className="block font-bold text-stone-800 mb-1">
                  Nội dung đề thi hoàn chỉnh (Bao gồm ngữ liệu, câu hỏi đọc hiểu, câu viết):
                </label>
                <textarea
                  rows={8}
                  value={rawPastedExamText}
                  onChange={(e) => setRawPastedExamText(e.target.value)}
                  placeholder="Dán toàn bộ đề thi vào đây... (Ví dụ: PHẦN I. ĐỌC HIỂU... PHẦN II. LÀM VĂN...)"
                  className="w-full p-2.5 font-mono text-xs bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-600"
                />
              </div>

              <div>
                <label className="block font-bold text-stone-800 mb-1">
                  Nội dung đáp án / Hướng dẫn chấm (Tùy chọn nếu có):
                </label>
                <textarea
                  rows={4}
                  value={rawPastedGuideText}
                  onChange={(e) => setRawPastedGuideText(e.target.value)}
                  placeholder="Dán hướng dẫn chấm hoặc barem điểm nếu có..."
                  className="w-full p-2.5 font-mono text-xs bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-600"
                />
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-[11px]">
                💡 AI sẽ tự động phân loại cấu trúc Mẫu A, Mẫu B hoặc Cấu trúc tùy chỉnh, bóc tách câu hỏi và kiểm tra tổng điểm 10,0 điểm.
              </div>
            </div>

            <div className="p-4 border-t border-stone-200 bg-stone-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPasteModal(false)}
                className="px-4 py-2 text-stone-600 hover:bg-stone-200 rounded-lg text-xs cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmPasteExam}
                className="px-5 py-2 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Xác nhận phân tích đề
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL TẠO ĐỀ NHANH THEO MẪU A HOẶC MẪU B */}
      {/* ======================================================== */}
      {showQuickCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-stone-200 overflow-hidden">
            <div className="p-4 bg-[#0F172A] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold">Tạo đề thi mới theo Mẫu A hoặc Mẫu B</h3>
              </div>
              <button
                onClick={() => setShowQuickCreateModal(false)}
                className="text-stone-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-stone-800 mb-1.5">1. Chọn mẫu cấu trúc đề:</label>
                <div className="space-y-2">
                  <div
                    onClick={() => setQuickTemplateChoice('template_a')}
                    className={`p-3 rounded-xl border cursor-pointer transition-colors ${
                      quickTemplateChoice === 'template_a'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-950 font-bold'
                        : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    <div>MẪU A: Đọc hiểu văn học (4đ) – Đoạn NLVH (2đ) – Bài NLXH (4đ)</div>
                    <div className="text-[10px] text-stone-500 font-normal mt-0.5">
                      Ngữ liệu thơ/truyện văn học nghệ thuật sâu sắc
                    </div>
                  </div>

                  <div
                    onClick={() => setQuickTemplateChoice('template_b')}
                    className={`p-3 rounded-xl border cursor-pointer transition-colors ${
                      quickTemplateChoice === 'template_b'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-950 font-bold'
                        : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    <div>MẪU B: Đọc hiểu thông tin (4đ) – Đoạn NLXH (2đ) – Bài NLVH (4đ)</div>
                    <div className="text-[10px] text-stone-500 font-normal mt-0.5">
                      Ngữ liệu thời sự, chuyển đổi số, môi trường & tư duy phản biện
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-bold text-stone-800 mb-1">2. Chọn lớp giao đề:</label>
                <select
                  value={quickClassChoice}
                  onChange={(e) => setQuickClassChoice(e.target.value)}
                  className="w-full p-2 bg-stone-50 border border-stone-300 rounded-lg text-xs"
                >
                  <option value="12A1">Lớp 12A1</option>
                  <option value="12A2">Lớp 12A2</option>
                  <option value="12A3">Lớp 12A3</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-stone-800 mb-1">3. Chế độ:</label>
                <select
                  value={quickModeChoice}
                  onChange={(e) => setQuickModeChoice(e.target.value as any)}
                  className="w-full p-2 bg-stone-50 border border-stone-300 rounded-lg text-xs"
                >
                  <option value="mock_exam">Thi thử nghiêm túc (120 phút)</option>
                  <option value="practice">Luyện tập tự do</option>
                </select>
              </div>
            </div>

            <div className="p-4 border-t border-stone-200 bg-stone-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowQuickCreateModal(false)}
                className="px-4 py-2 text-stone-600 hover:bg-stone-200 rounded-lg text-xs cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmQuickCreate}
                className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Tạo đề ngay
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
