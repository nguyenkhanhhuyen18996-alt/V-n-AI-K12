import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  CompleteExam,
  ExamSubmission,
  ExamSubmissionAnswer,
  UserAccount
} from '../types';
import { formatVNDecimal } from '../services/examParserEngine';
import {
  evaluateCompleteExamSubmissionWithAI,
  getStoredSubmissions,
  saveStoredSubmissions,
  syncSubmissionToServer
} from '../services/examEvaluationEngine';
import { saveExamSubmissionToFirestore } from '../services/firebaseAuth';
import {
  PersistentExamRunnerState,
  resolveActiveStudentUid,
  loadExamRunnerState,
  fetchExamRunnerStateFromServer,
  saveExamRunnerState,
  startNewExamAttemptVersion,
  setSimulateQuotaExceeded,
  getSimulateQuotaExceeded
} from '../services/draftStorageService';
import { ImportPreviewModal } from './ImportPreviewModal';
import {
  Clock,
  BookOpen,
  PenTool,
  Send,
  Save,
  CheckCircle,
  AlertTriangle,
  RotateCcw,
  ShieldCheck,
  ArrowRight,
  X,
  Lock,
  Wifi,
  WifiOff,
  HardDrive
} from 'lucide-react';

interface CompleteExamRunnerProps {
  exam: CompleteExam;
  currentUser: UserAccount | null;
  isDemoMode?: boolean;
  onFinish?: () => void;
  onBack?: () => void;
}

export const CompleteExamRunner: React.FC<CompleteExamRunnerProps> = ({
  exam,
  currentUser,
  isDemoMode = false,
  onFinish,
  onBack
}) => {
  // Xác định UID ổn định của học sinh (Tách biệt hoàn toàn dữ liệu giữa các học sinh)
  const activeStudentUid = resolveActiveStudentUid(currentUser?.id, isDemoMode);
  const durationSecondsTotal = Math.max(60, (Number(exam.durationMinutes) || 120) * 60);

  // 3 Chặng thi: 1 = Đọc hiểu (30p), 2 = Đoạn văn (30p), 3 = Bài văn (60p)
  const [activeStage, setActiveStage] = useState<1 | 2 | 3>(1);

  // Câu trả lời thực tế của học sinh
  const [readingAnswers, setReadingAnswers] = useState<Record<string, string>>({});
  const [paragraphText, setParagraphText] = useState<string>('');
  const [essayText, setEssayText] = useState<string>('');

  // Quản lý phiên bản bài thi & Mốc thời gian thực (StartedAt / Deadline)
  const [submissionVersion, setSubmissionVersion] = useState<number>(1);
  const [startedAtEpochMs, setStartedAtEpochMs] = useState<number>(() => Date.now());
  const [deadlineEpochMs, setDeadlineEpochMs] = useState<number>(
    () => Date.now() + durationSecondsTotal * 1000
  );
  const [remainingSeconds, setRemainingSeconds] = useState<number>(durationSecondsTotal);
  const [isTimeExpired, setIsTimeExpired] = useState<boolean>(false);

  // Trạng thái lưu câu trả lời thật & xử lý lỗi lưu
  const [saveStateStatus, setSaveStateStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [storageScopeLabel, setStorageScopeLabel] = useState<string>(
    'Chỉ lưu trên thiết bị này (localStorage)'
  );
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [restoredNotice, setRestoredNotice] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [versionHistory, setVersionHistory] = useState<PersistentExamRunnerState['versionHistory']>([]);

  // Xác nhận trước khi dán đè nội dung lớn vào Đoạn văn / Bài văn
  const [pasteConfirmTarget, setPasteConfirmTarget] = useState<'paragraph' | 'essay' | null>(null);
  const [incomingPasteText, setIncomingPasteText] = useState<string>('');

  // Trạng thái nộp bài và khóa chống nộp trùng (Anti-duplicate submission locks)
  const isSubmittingLockRef = useRef<boolean>(false);
  const hasSubmittedLockRef = useRef<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submittedResult, setSubmittedResult] = useState<ExamSubmission | null>(null);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState<boolean>(false);

  // Cờ đang khôi phục dữ liệu
  const isHydratingRef = useRef<boolean>(false);

  // Công cụ kiểm thử độ bền dành cho Giáo viên
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false);
  const [quotaSimulated, setQuotaSimulated] = useState<boolean>(getSimulateQuotaExceeded());

  // Phục hồi trạng thái bài thi theo đúng (activeStudentUid, exam.id)
  const applyRestoredSession = useCallback(
    (saved: PersistentExamRunnerState) => {
      isHydratingRef.current = true;
      setActiveStage(saved.activeStage || 1);
      setReadingAnswers(saved.answers?.readingAnswers || {});
      setParagraphText(saved.answers?.paragraphText || '');
      setEssayText(saved.answers?.essayText || '');
      setSubmissionVersion(Math.max(1, Number(saved.submissionVersion) || 1));
      setStartedAtEpochMs(saved.startedAtEpochMs || Date.now());
      const validDeadline =
        saved.deadlineEpochMs || (saved.startedAtEpochMs || Date.now()) + durationSecondsTotal * 1000;
      setDeadlineEpochMs(validDeadline);
      const rem = Math.max(0, Math.floor((validDeadline - Date.now()) / 1000));
      setRemainingSeconds(rem);
      setIsTimeExpired(Boolean(saved.isTimeExpired || rem <= 0));
      setStorageScopeLabel(saved.storageScopeLabel || 'Chỉ lưu trên thiết bị này (localStorage)');
      setVersionHistory(Array.isArray(saved.versionHistory) ? saved.versionHistory : []);

      if (saved.isSubmitted && saved.submittedResult) {
        hasSubmittedLockRef.current = true;
        setSubmittedResult(saved.submittedResult);
      } else {
        hasSubmittedLockRef.current = false;
        setSubmittedResult(null);
      }

      setSaveStateStatus(saved.lastSavedAt ? 'saved' : 'idle');
      setSaveErrorMessage(null);

      const answeredReadingCount = Object.values(saved.answers?.readingAnswers || {}).filter((v) =>
        Boolean(v && v.trim())
      ).length;
      const pWords = saved.answers?.paragraphText?.trim()
        ? saved.answers.paragraphText.trim().split(/\s+/).length
        : 0;
      const eWords = saved.answers?.essayText?.trim()
        ? saved.answers.essayText.trim().split(/\s+/).length
        : 0;

      if (answeredReadingCount > 0 || pWords > 0 || eWords > 0) {
        setRestoredNotice(
          `Đã tự động phục hồi bài làm đề [${exam.code}] (Phiên bản v${
            saved.submissionVersion || 1
          }: ${answeredReadingCount} câu đọc hiểu, đoạn văn ${pWords} từ, bài văn ${eWords} từ) của tài khoản [${
            currentUser?.username || activeStudentUid
          }].`
        );
      }
      setTimeout(() => {
        isHydratingRef.current = false;
      }, 60);
    },
    [activeStudentUid, currentUser?.username, durationSecondsTotal, exam.code]
  );

  // YÊU CẦU 1 & 2: Tự động nạp đúng câu trả lời của học sinh và đề thi này khi mở hoặc tải lại trang
  useEffect(() => {
    isHydratingRef.current = true;
    setSaveErrorMessage(null);

    const localSession = loadExamRunnerState(activeStudentUid, exam.id);
    if (localSession) {
      applyRestoredSession(localSession);
    } else {
      // Khởi tạo phiên mới hoàn toàn cho (activeStudentUid, exam.id), tuyệt đối không lấy dữ liệu người trước
      const nowMs = Date.now();
      const freshDeadline = nowMs + durationSecondsTotal * 1000;
      hasSubmittedLockRef.current = false;
      isSubmittingLockRef.current = false;
      setActiveStage(1);
      setReadingAnswers({});
      setParagraphText('');
      setEssayText('');
      setSubmissionVersion(1);
      setStartedAtEpochMs(nowMs);
      setDeadlineEpochMs(freshDeadline);
      setRemainingSeconds(durationSecondsTotal);
      setIsTimeExpired(false);
      setSubmittedResult(null);
      setVersionHistory([]);
      setSaveStateStatus('idle');
      setRestoredNotice(null);
      setTimeout(() => {
        isHydratingRef.current = false;
      }, 60);
    }

    // Kiểm tra bản đồng bộ trên máy chủ (nếu đã đăng nhập)
    fetchExamRunnerStateFromServer(activeStudentUid, exam.id).then((serverSession) => {
      if (!serverSession) return;
      const localIso = localSession?.lastSavedIso || '';
      const serverIso = serverSession.lastSavedIso || '';
      if (!localSession || serverIso > localIso || (serverSession.isSubmitted && !localSession.isSubmitted)) {
        applyRestoredSession(serverSession);
      }
    });
  }, [activeStudentUid, exam.id, durationSecondsTotal, applyRestoredSession]);

  // Hàm lưu bền vững câu trả lời thật của học sinh (Không bao giờ báo lưu thành công giả nếu ghi lỗi)
  const persistExamAnswersNow = useCallback(
    async (
      overrides?: Partial<PersistentExamRunnerState>,
      snapshotReason?: string
    ): Promise<boolean> => {
      const currentAnswers: ExamSubmissionAnswer = overrides?.answers || {
        readingAnswers,
        paragraphText,
        essayText
      };

      let nextHistory = overrides?.versionHistory || versionHistory;
      if (snapshotReason) {
        const nowTime = new Date().toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
        const rCount = Object.values(currentAnswers.readingAnswers || {}).filter((v) =>
          Boolean(v && v.trim())
        ).length;
        const pCount = currentAnswers.paragraphText.trim()
          ? currentAnswers.paragraphText.trim().split(/\s+/).length
          : 0;
        const eCount = currentAnswers.essayText.trim()
          ? currentAnswers.essayText.trim().split(/\s+/).length
          : 0;

        nextHistory = [
          {
            versionNumber: overrides?.submissionVersion || submissionVersion,
            savedAt: nowTime,
            reason: snapshotReason,
            readingAnsweredCount: rCount,
            paragraphWordCount: pCount,
            essayWordCount: eCount
          },
          ...nextHistory.slice(0, 19)
        ];
        setVersionHistory(nextHistory);
      }

      const payload: PersistentExamRunnerState = {
        studentUid: activeStudentUid,
        examId: exam.id,
        examTitle: exam.title,
        activeStage,
        answers: currentAnswers,
        startedAtEpochMs,
        deadlineEpochMs,
        durationMinutes: exam.durationMinutes,
        isTimeExpired,
        isSubmitted: Boolean(submittedResult),
        submissionVersion,
        submittedAt: submittedResult?.submittedAt || null,
        submittedResult,
        lastSavedAt: null,
        lastSavedIso: new Date().toISOString(),
        storageScopeLabel,
        versionHistory: nextHistory,
        ...overrides
      };

      const res = await saveExamRunnerState(payload);
      if (!res.success) {
        setSaveStateStatus('error');
        setSaveErrorMessage(
          res.errorMessage ||
            'Không thể lưu câu trả lời bài thi! Vui lòng kiểm tra dung lượng trình duyệt hoặc sao lưu văn bản.'
        );
        return false;
      }

      setStorageScopeLabel(res.storageScopeLabel);
      setSaveStateStatus('saved');
      if (res.errorMessage) {
        setSaveErrorMessage(res.errorMessage);
      } else {
        setSaveErrorMessage(null);
      }
      return true;
    },
    [
      activeStudentUid,
      exam.id,
      exam.title,
      exam.durationMinutes,
      activeStage,
      readingAnswers,
      paragraphText,
      essayText,
      startedAtEpochMs,
      deadlineEpochMs,
      isTimeExpired,
      submittedResult,
      submissionVersion,
      storageScopeLabel,
      versionHistory
    ]
  );

  // Giám sát kết nối mạng
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      persistExamAnswersNow();
    };
    const handleOffline = () => {
      setIsOnline(false);
      setStorageScopeLabel((prev) =>
        prev.includes('Mất mạng') ? prev : 'Mất mạng — Chỉ lưu trên thiết bị này (localStorage)'
      );
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [persistExamAnswersNow]);

  // Tự động lưu câu trả lời thật mỗi 1.5 giây sau khi học sinh nhập câu trả lời
  const autoSaveTimerRef = useRef<any>(null);
  useEffect(() => {
    if (isHydratingRef.current) return;
    if (submittedResult || hasSubmittedLockRef.current) return;

    const hasAnyInput =
      Object.values(readingAnswers).some((v) => Boolean(v && v.trim())) ||
      Boolean(paragraphText.trim()) ||
      Boolean(essayText.trim());
    if (!hasAnyInput) return;

    setSaveStateStatus('saving');
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    autoSaveTimerRef.current = setTimeout(() => {
      persistExamAnswersNow();
    }, 1500);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [readingAnswers, paragraphText, essayText, activeStage]);

  // YÊU CẦU 4, 5, 6, 7: Xử lý nộp bài chính thức & Chấm điểm (Chống nộp trùng tuyệt đối khi nhấn nhiều lần hoặc khi hết giờ)
  const handleFinalSubmit = useCallback(
    async (triggerSource: 'manual_confirm' | 'auto_timeout' = 'manual_confirm') => {
      // Khóa đồng bộ (Synchronous Ref Lock) chặn mọi lệnh gọi nộp trùng
      if (isSubmittingLockRef.current || hasSubmittedLockRef.current) {
        return;
      }
      isSubmittingLockRef.current = true;
      hasSubmittedLockRef.current = true;
      setIsSubmitting(true);
      setShowConfirmSubmit(false);

      if (triggerSource === 'auto_timeout') {
        setIsTimeExpired(true);
      }

      // Chụp bất biến câu trả lời tại thời điểm nộp
      const immutableAnswers: ExamSubmissionAnswer = {
        readingAnswers: { ...readingAnswers },
        paragraphText: String(paragraphText),
        essayText: String(essayText)
      };

      const submittedAtStr =
        new Date().toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        }) +
        ' ' +
        new Date().toLocaleDateString('vi-VN');

      const elapsedSeconds = Math.min(
        durationSecondsTotal,
        Math.max(1, Math.round((Date.now() - startedAtEpochMs) / 1000))
      );

      try {
        const aiEvaluation = await evaluateCompleteExamSubmissionWithAI(
          exam,
          immutableAnswers,
          submissionVersion
        );

        // Mã bài nộp định danh duy nhất theo (UID + ExamID + Phiên bản) để chống trùng lặp cả ở client & server
        const deterministicSubmissionId = `sub-${activeStudentUid}-${exam.id}-v${submissionVersion}`;

        const submission: ExamSubmission = {
          id: deterministicSubmissionId,
          examId: exam.id,
          examTitle: exam.title,
          templateType: exam.templateType,
          studentId: currentUser?.id || activeStudentUid,
          studentName: currentUser
            ? `${currentUser.fullName} (${currentUser.username})`
            : `Học sinh (${activeStudentUid})`,
          className: currentUser?.className || '12A1',
          submittedAt: submittedAtStr,
          durationSeconds: elapsedSeconds,
          submissionVersion,
          answers: immutableAnswers,
          status:
            aiEvaluation.evaluationSource === 'gemini_ai'
              ? 'ai_evaluated'
              : 'rule_based_suggested',
          aiEvaluation
        };

        // Lưu vào kho bài nộp thực tế (chống trùng lặp theo id), đồng bộ máy chủ & Cloud Firestore
        if (!isDemoMode) {
          const existing = getStoredSubmissions(false);
          const filtered = existing.filter((s) => s.id !== submission.id);
          const updated = [submission, ...filtered];
          saveStoredSubmissions(updated, false);
          syncSubmissionToServer(submission).catch(() => {});
          saveExamSubmissionToFirestore(submission).catch(() => {});
        }

        setSubmittedResult(submission);

        // Lưu trạng thái đã nộp bất biến vào phiên thi
        await persistExamAnswersNow(
          {
            answers: immutableAnswers,
            isSubmitted: true,
            isTimeExpired: triggerSource === 'auto_timeout' ? true : isTimeExpired,
            submittedAt: submittedAtStr,
            submittedResult: submission
          },
          triggerSource === 'auto_timeout'
            ? `Tự động nộp khi hết giờ (Phiên bản v${submissionVersion})`
            : `Nộp bài chính thức (Phiên bản v${submissionVersion})`
        );
      } catch (err) {
        // Nếu lỗi bất ngờ ngoài dự kiến, mở khóa để học sinh có thể thử nộp lại
        isSubmittingLockRef.current = false;
        hasSubmittedLockRef.current = false;
        setSaveErrorMessage('Có lỗi khi đóng gói bài nộp. Vui lòng nhấn nộp lại.');
      } finally {
        isSubmittingLockRef.current = false;
        setIsSubmitting(false);
      }
    },
    [
      readingAnswers,
      paragraphText,
      essayText,
      durationSecondsTotal,
      startedAtEpochMs,
      exam,
      submissionVersion,
      activeStudentUid,
      currentUser,
      isDemoMode,
      isTimeExpired,
      persistExamAnswersNow
    ]
  );

  // YÊU CẦU 6: Thực thi đúng giới hạn thời gian cấu hình dựa trên mốc deadlineEpochMs.
  // Khi hết giờ: khóa nhập/sửa ngay lập tức và tự động nộp 1 lần duy nhất.
  useEffect(() => {
    if (submittedResult || hasSubmittedLockRef.current) return;

    const tick = () => {
      const now = Date.now();
      const rem = Math.max(0, Math.floor((deadlineEpochMs - now) / 1000));
      setRemainingSeconds(rem);

      if (rem <= 0) {
        setIsTimeExpired(true);
        if (!isSubmittingLockRef.current && !hasSubmittedLockRef.current) {
          handleFinalSubmit('auto_timeout');
        }
      }
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [deadlineEpochMs, submittedResult, handleFinalSubmit]);

  // Kiểm tra khóa không cho nhập/sửa sau khi hết hạn hoặc sau khi đã nộp bài
  const isEditingLocked = Boolean(
    isTimeExpired ||
      remainingSeconds <= 0 ||
      Date.now() >= deadlineEpochMs ||
      isSubmitting ||
      submittedResult
  );

  // Cập nhật câu trả lời Đọc hiểu (Chặn sửa nếu đã hết giờ hoặc đã nộp)
  const handleReadingAnswerChange = (questionId: string, value: string) => {
    if (isEditingLocked) return;
    setReadingAnswers((prev) => ({
      ...prev,
      [questionId]: value
    }));
  };

  // Cập nhật Đoạn văn 200 chữ (Chặn sửa sau hạn)
  const handleParagraphChange = (value: string) => {
    if (isEditingLocked) return;
    setParagraphText(value);
  };

  // Cập nhật Bài văn 600 chữ (Chặn sửa sau hạn)
  const handleEssayChange = (value: string) => {
    if (isEditingLocked) return;
    setEssayText(value);
  };

  // YÊU CẦU 3: Yêu cầu xác nhận trước khi dán đè nội dung lớn vào Đoạn văn / Bài văn đang có nháp
  const handlePasteWithConfirmation = (
    target: 'paragraph' | 'essay',
    e: React.ClipboardEvent<HTMLTextAreaElement>
  ) => {
    if (isEditingLocked) {
      e.preventDefault();
      return;
    }
    const pasted = e.clipboardData?.getData('text/plain') || '';
    const pastedWords = pasted.trim() ? pasted.trim().split(/\s+/).length : 0;
    const currentText = target === 'paragraph' ? paragraphText : essayText;
    const currentWords = currentText.trim() ? currentText.trim().split(/\s+/).length : 0;

    if (currentWords >= 15 && pastedWords >= 25) {
      e.preventDefault();
      setPasteConfirmTarget(target);
      setIncomingPasteText(pasted.trim());
    }
  };

  const handleConfirmPasteReplace = async (newText: string) => {
    if (isEditingLocked || !pasteConfirmTarget) return;
    const nextVer = submissionVersion + 1;
    setSubmissionVersion(nextVer);
    if (pasteConfirmTarget === 'paragraph') {
      setParagraphText(newText);
      await persistExamAnswersNow(
        {
          submissionVersion: nextVer,
          answers: { readingAnswers, paragraphText: newText, essayText }
        },
        `Xác nhận thay thế Đoạn văn 200 chữ (Tạo v${nextVer})`
      );
    } else {
      setEssayText(newText);
      await persistExamAnswersNow(
        {
          submissionVersion: nextVer,
          answers: { readingAnswers, paragraphText, essayText: newText }
        },
        `Xác nhận thay thế Bài văn 600 chữ (Tạo v${nextVer})`
      );
    }
    setPasteConfirmTarget(null);
  };

  const handleConfirmPasteAppend = async (newText: string) => {
    if (isEditingLocked || !pasteConfirmTarget) return;
    const nextVer = submissionVersion + 1;
    setSubmissionVersion(nextVer);
    if (pasteConfirmTarget === 'paragraph') {
      const combined = paragraphText.trim()
        ? `${paragraphText.trim()}\n\n${newText.trim()}`
        : newText.trim();
      setParagraphText(combined);
      await persistExamAnswersNow(
        {
          submissionVersion: nextVer,
          answers: { readingAnswers, paragraphText: combined, essayText }
        },
        `Nối thêm vào Đoạn văn 200 chữ (Tạo v${nextVer})`
      );
    } else {
      const combined = essayText.trim() ? `${essayText.trim()}\n\n${newText.trim()}` : newText.trim();
      setEssayText(combined);
      await persistExamAnswersNow(
        {
          submissionVersion: nextVer,
          answers: { readingAnswers, paragraphText, essayText: combined }
        },
        `Nối thêm vào Bài văn 600 chữ (Tạo v${nextVer})`
      );
    }
    setPasteConfirmTarget(null);
  };

  // YÊU CẦU 4: Sau khi đã nộp bản bất biến, nếu muốn làm lại phải khởi tạo Phiên bản mới (v{N+1})
  const handleStartNewExamVersion = () => {
    const fresh = startNewExamAttemptVersion(
      activeStudentUid,
      exam.id,
      exam.title,
      exam.durationMinutes,
      submissionVersion
    );
    hasSubmittedLockRef.current = false;
    isSubmittingLockRef.current = false;
    applyRestoredSession(fresh);
  };

  const formatTimer = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours > 0 ? hours + ':' : ''}${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const answeredReadingCount = Object.values(readingAnswers).filter((v) => Boolean(v && v.trim())).length;
  const paragraphWordCount = paragraphText.trim() ? paragraphText.trim().split(/\s+/).length : 0;
  const essayWordCount = essayText.trim() ? essayText.trim().split(/\s+/).length : 0;

  return (
    <div className="space-y-6 pb-16">
      {/* THANH ĐIỀU KHIỂN, TRẠNG THÁI LƯU THẬT & ĐỒNG HỒ GIỚI HẠN THỜI GIAN */}
      <div className="p-4 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-3 sticky top-16 z-30">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono font-bold text-stone-700 bg-stone-100 px-2 py-0.5 rounded text-xs">
                {exam.code}
              </span>
              <span className="px-2 py-0.5 rounded bg-[#0F172A] text-white font-mono text-[11px] font-bold">
                Phiên bản v{submissionVersion}
              </span>
              <h2 className="font-serif-literary font-bold text-base text-[#0F172A] line-clamp-1">
                {exam.title}
              </h2>
            </div>

            {/* YÊU CẦU 1 & 5: Ghi rõ phạm vi lưu trữ thật và tính chất bộ đếm thời gian */}
            <div className="text-[11px] text-stone-600 flex flex-wrap items-center gap-2">
              {isOnline ? (
                <span className="flex items-center gap-1 text-emerald-700 font-medium">
                  <Wifi className="w-3 h-3" /> Trực tuyến
                </span>
              ) : (
                <span className="flex items-center gap-1 text-red-600 font-bold">
                  <WifiOff className="w-3 h-3" /> Mất mạng
                </span>
              )}
              <span>·</span>
              <span
                className={`font-semibold ${
                  saveStateStatus === 'error'
                    ? 'text-red-700 font-bold'
                    : storageScopeLabel.includes('Máy chủ')
                    ? 'text-emerald-800'
                    : 'text-amber-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200'
                }`}
              >
                {saveStateStatus === 'error'
                  ? '⚠ LỖI: Chưa lưu được câu trả lời!'
                  : saveStateStatus === 'saving'
                  ? 'Đang lưu câu trả lời thực tế...'
                  : storageScopeLabel}
              </span>
              <span>·</span>
              <span className="text-stone-500">
                Đồng hồ chỉ phục vụ luyện tập (tự khóa bài khi hết giờ, không phải bộ đếm giám sát phòng thi bảo mật)
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowDiagnostics((v) => !v)}
              className="px-2.5 py-1.5 rounded-lg border border-stone-300 bg-stone-50 hover:bg-stone-100 text-[11px] font-semibold text-stone-700 cursor-pointer"
            >
              {showDiagnostics ? 'Ẩn hộp kiểm thử' : 'Kiểm thử độ bền'}
            </button>

            {!submittedResult && !isTimeExpired && (
              <button
                type="button"
                onClick={() => persistExamAnswersNow(undefined, `Lưu nháp thủ công v${submissionVersion}`)}
                className="px-3 py-1.5 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-800 font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5 text-stone-600" />
                <span>Lưu câu trả lời</span>
              </button>
            )}

            {/* ĐỒNG HỒ ĐẾM NGƯỢC */}
            <div
              className={`px-3.5 py-1.5 rounded-xl border flex items-center gap-2 font-mono font-bold text-sm ${
                isTimeExpired || remainingSeconds <= 0
                  ? 'bg-red-100 border-red-400 text-red-900'
                  : remainingSeconds < 600
                  ? 'bg-rose-50 border-rose-400 text-rose-700 animate-pulse'
                  : 'bg-stone-50 border-stone-300 text-stone-800'
              }`}
              title="Bộ đếm thời gian phục vụ luyện tập theo thời lượng cấu hình"
            >
              <Clock className="w-4 h-4 text-emerald-700" />
              <span>
                {isTimeExpired || remainingSeconds <= 0
                  ? '00:00 (Hết giờ)'
                  : formatTimer(remainingSeconds)}
              </span>
            </div>

            {!submittedResult && (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setShowConfirmSubmit(true)}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSubmitting ? 'Đang nộp bài...' : `Nộp bài (v${submissionVersion})`}</span>
              </button>
            )}
          </div>
        </div>

        {/* HỘP KIỂM THỬ ĐỘ BỀN DÀNH CHO GIÁO VIÊN (Test hết giờ, đầy bộ nhớ, chống nộp trùng) */}
        {showDiagnostics && (
          <div className="p-3.5 rounded-xl bg-stone-100 border border-stone-300 text-xs space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-bold text-stone-900 flex items-center gap-1.5">
                <HardDrive className="w-4 h-4 text-stone-700" />
                <span>
                  Kiểm thử Độ bền Thi thử (UID: {activeStudentUid} · Đề: {exam.id} · Lịch sử lưu: {versionHistory.length} mốc)
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!submittedResult && (
                  <button
                    type="button"
                    onClick={() => {
                      const fiveSecDeadline = Date.now() + 5000;
                      setDeadlineEpochMs(fiveSecDeadline);
                      setRemainingSeconds(5);
                      persistExamAnswersNow({ deadlineEpochMs: fiveSecDeadline }, 'Tua đồng hồ còn 5 giây để kiểm thử hết giờ');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 font-bold cursor-pointer"
                  >
                    Tua đồng hồ còn 5 giây (Test tự nộp & khóa sửa)
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const next = !quotaSimulated;
                    setQuotaSimulated(next);
                    setSimulateQuotaExceeded(next);
                    persistExamAnswersNow();
                  }}
                  className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer border ${
                    quotaSimulated
                      ? 'bg-red-700 text-white border-red-800'
                      : 'bg-white text-stone-800 border-stone-300 hover:bg-stone-50'
                  }`}
                >
                  {quotaSimulated ? 'Đang giả lập: Đầy bộ nhớ (Nhấn để tắt)' : 'Giả lập đầy bộ nhớ (QuotaExceeded)'}
                </button>
              </div>
            </div>
            <p className="text-[11px] text-stone-600">
              • Gõ câu trả lời rồi tải lại trang (F5) để kiểm chứng câu trả lời và thời gian còn lại được giữ nguyên theo đúng UID học sinh.
            </p>
          </div>
        )}

        {/* Cảnh báo lỗi lưu trữ thật (Không báo lưu thành công nếu ghi thất bại) */}
        {saveErrorMessage && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-300 text-xs text-red-950 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
            <div>
              <strong>Lỗi lưu câu trả lời: </strong>
              <span>{saveErrorMessage}</span>
            </div>
          </div>
        )}

        {/* Thông báo đã tự phục hồi bài làm sau khi tải lại trang */}
        {restoredNotice && (
          <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 flex items-center justify-between gap-2">
            <span>✓ {restoredNotice}</span>
            <button
              type="button"
              onClick={() => setRestoredNotice(null)}
              className="text-emerald-800 font-semibold hover:underline text-[11px] cursor-pointer shrink-0"
            >
              Đóng
            </button>
          </div>
        )}
      </div>

      {/* KẾT QUẢ SAU KHI NỘP BÀI (BẢN ĐÃ NỘP BẤT BIẾN & NÚT TẠO PHIÊN BẢN MỚI) */}
      {submittedResult ? (
        <div className="max-w-3xl mx-auto p-8 bg-white rounded-2xl border border-stone-200 shadow-lg space-y-6 text-xs animate-fadeIn">
          <div className="text-center space-y-2 border-b border-stone-100 pb-5">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-900 font-bold text-[11px]">
              <Lock className="w-3.5 h-3.5" />
              <span>
                Đã cố định Phiên bản v{submittedResult.submissionVersion || submissionVersion} (Mã bài nộp: {submittedResult.id})
              </span>
            </div>
            <h3 className="font-serif-literary text-2xl font-bold text-[#0F172A]">
              Bài thi đã được nộp và khóa bất biến!
            </h3>
            <p className="text-stone-500">
              Thời điểm nộp: <strong>{submittedResult.submittedAt}</strong> · Tài khoản: <strong>{submittedResult.studentName}</strong>
            </p>
          </div>

          {/* BẢNG ĐIỂM THAM KHẢO SƠ BỘ (PHÂN BIỆT RÕ GEMINI AI VS QUY TẮC) */}
          <div className="p-5 bg-stone-50 rounded-2xl border border-stone-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-bold text-stone-900 text-sm">
                  {submittedResult.aiEvaluation?.evaluationSource === 'gemini_ai'
                    ? 'Điểm Gemini AI đề xuất sơ bộ:'
                    : 'Điểm ước tính theo quy tắc (Chưa phải chấm AI):'}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    submittedResult.aiEvaluation?.evaluationSource === 'gemini_ai'
                      ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                      : 'bg-amber-100 text-amber-950 border-amber-300'
                  }`}
                >
                  {submittedResult.aiEvaluation?.evaluationSourceLabel ||
                    'Gợi ý theo quy tắc — chưa phải chấm AI'}
                </span>
              </div>
              <span className="text-lg font-bold font-mono text-blue-900">
                {formatVNDecimal(submittedResult.aiEvaluation?.proposedTotal)}/10,0 điểm
              </span>
            </div>

            {submittedResult.aiEvaluation?.apiWarningMessage && (
              <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-xl text-[11px] text-amber-950">
                <strong>Cấu hình máy chủ:</strong> {submittedResult.aiEvaluation.apiWarningMessage}
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
              <div className="p-2.5 bg-white rounded-xl border border-stone-200">
                <div className="text-stone-500">Đọc hiểu (Thang 4,0đ)</div>
                <div className="font-bold text-stone-900 font-mono text-sm mt-0.5">
                  {formatVNDecimal(
                    Object.values(submittedResult.aiEvaluation?.readingScores || {}).reduce((a, b) => a + b.score, 0)
                  )}đ
                </div>
              </div>

              <div className="p-2.5 bg-white rounded-xl border border-stone-200">
                <div className="text-stone-500">Đoạn 200 chữ (Thang 2,0đ)</div>
                <div className="font-bold text-stone-900 font-mono text-sm mt-0.5">
                  {formatVNDecimal(submittedResult.aiEvaluation?.paragraphFeedback.aiSuggestedScore)}đ
                </div>
              </div>

              <div className="p-2.5 bg-white rounded-xl border border-stone-200">
                <div className="text-stone-500">Bài 600 chữ (Thang 4,0đ)</div>
                <div className="font-bold text-stone-900 font-mono text-sm mt-0.5">
                  {formatVNDecimal(submittedResult.aiEvaluation?.essayFeedback.aiSuggestedScore)}đ
                </div>
              </div>
            </div>
          </div>

          {/* XEM LẠI BẢN ĐÃ NỘP BẤT BIẾN */}
          <div className="p-4 bg-stone-50 rounded-xl border border-stone-200 space-y-2">
            <div className="font-bold text-stone-800 flex items-center justify-between">
              <span>Nội dung phiên bản v{submittedResult.submissionVersion || submissionVersion} đã nộp (Chỉ đọc - Không thể sửa đè):</span>
              <span className="text-[11px] text-emerald-800 font-semibold">🔒 Bản lưu bất biến</span>
            </div>
            <div className="text-[11px] text-stone-600 space-y-1">
              <div>
                • Đọc hiểu: Đã nộp {Object.values(submittedResult.answers.readingAnswers || {}).filter((v) => v.trim()).length}/{exam.readingPassage.questions.length} câu
              </div>
              <div>
                • Đoạn văn ~200 chữ: {submittedResult.answers.paragraphText.trim() ? submittedResult.answers.paragraphText.trim().split(/\s+/).length : 0} từ
              </div>
              <div>
                • Bài văn ~600 chữ: {submittedResult.answers.essayText.trim() ? submittedResult.answers.essayText.trim().split(/\s+/).length : 0} từ
              </div>
            </div>
          </div>

          <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl text-amber-950 space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-amber-700" />
              <span>Quy tắc bảo toàn bài nộp & điểm số:</span>
            </div>
            <p className="text-[11px] text-stone-700 leading-relaxed">
              • Điểm số trên chỉ mang tính tham khảo sơ bộ và <strong>KHÔNG được đưa vào thống kê điểm chính thức hay hồ sơ năng lực</strong> cho tới khi được <strong>Giáo viên bộ môn thẩm định và phê duyệt chính thức</strong>.
            </p>
            <p className="text-[11px] text-stone-700 leading-relaxed">
              • Phiên bản đã nộp được giữ nguyên bất biến. Nếu bạn muốn luyện tập lại đề này, hệ thống sẽ tạo một <strong>Phiên bản làm bài mới (v{(submittedResult.submissionVersion || submissionVersion) + 1})</strong>.
            </p>
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleStartNewExamVersion}
              className="px-5 py-2.5 bg-white hover:bg-stone-100 text-stone-800 border border-stone-300 font-bold rounded-xl text-xs transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Làm lại đề này (Tạo Phiên bản v{(submittedResult.submissionVersion || submissionVersion) + 1})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (onFinish) onFinish();
                else if (onBack) onBack();
              }}
              className="px-6 py-2.5 bg-[#0F172A] hover:bg-stone-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
            >
              Về hồ sơ học tập
            </button>
          </div>
        </div>
      ) : (
        /* GIAO DIỆN LÀM BÀI 3 CHẶNG */
        <div className="space-y-6">
          {/* Cảnh báo nếu đã hết giờ làm bài */}
          {isTimeExpired && (
            <div className="p-4 rounded-2xl bg-red-50 border border-red-300 text-xs text-red-950 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-bold">
                <Lock className="w-4 h-4 text-red-700 shrink-0" />
                <span>
                  Đã hết thời gian làm bài ({exam.durationMinutes} phút)! Toàn bộ ô nhập câu trả lời đã được khóa theo quy tắc thi.
                </span>
              </div>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleFinalSubmit('auto_timeout')}
                className="px-4 py-1.5 rounded-xl bg-red-700 hover:bg-red-800 text-white font-bold cursor-pointer shrink-0"
              >
                {isSubmitting ? 'Đang thu bài...' : 'Nộp bài ngay'}
              </button>
            </div>
          )}

          {/* TAB ĐIỀU HƯỚNG 3 CHẶNG THI */}
          <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 pb-2">
            <button
              type="button"
              onClick={() => setActiveStage(1)}
              className={`py-2 px-4 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center gap-2 ${
                activeStage === 1
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Chặng 1: Đọc hiểu (4,0đ — 30 phút)</span>
              {answeredReadingCount > 0 && (
                <span className="text-[10px] bg-white/20 px-1.5 py-0.2 rounded-full">
                  {answeredReadingCount}/{exam.readingPassage.questions.length} câu
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveStage(2)}
              className={`py-2 px-4 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center gap-2 ${
                activeStage === 2
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
              }`}
            >
              <PenTool className="w-4 h-4" />
              <span>Chặng 2: Đoạn văn ~200 chữ (2,0đ — 30 phút)</span>
              {paragraphWordCount > 0 && (
                <span className="text-[10px] bg-white/20 px-1.5 py-0.2 rounded-full">
                  {paragraphWordCount} từ
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveStage(3)}
              className={`py-2 px-4 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center gap-2 ${
                activeStage === 3
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
              }`}
            >
              <PenTool className="w-4 h-4" />
              <span>Chặng 3: Bài văn ~600 chữ (4,0đ — 60 phút)</span>
              {essayWordCount > 0 && (
                <span className="text-[10px] bg-white/20 px-1.5 py-0.2 rounded-full">
                  {essayWordCount} từ
                </span>
              )}
            </button>
          </div>

          {/* NỘI DUNG CHẶNG 1: ĐỌC HIỂU */}
          {activeStage === 1 && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Ngữ liệu đọc hiểu (5/12 cột) */}
              <div className="lg:col-span-5 p-6 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-3 sticky top-36">
                <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                  <span className="font-bold text-stone-900 text-sm">Văn bản Đọc hiểu</span>
                  <span className="text-[11px] text-stone-500 font-semibold">{exam.readingPassage.genreName}</span>
                </div>
                <div className="text-xs font-bold text-stone-800">{exam.readingPassage.title}</div>
                <div className="text-[11px] text-stone-500 italic">
                  {exam.readingPassage.author} ({exam.readingPassage.source})
                </div>
                <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-stone-700 font-serif text-[13px] leading-relaxed whitespace-pre-line max-h-[60vh] overflow-y-auto">
                  {exam.readingPassage.content}
                </div>
              </div>

              {/* Các câu hỏi đọc hiểu (7/12 cột) */}
              <div className="lg:col-span-7 space-y-4">
                {exam.readingPassage.questions.map((q) => (
                  <div key={q.id} className="p-5 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-blue-900 text-sm">
                        Câu {q.order} ({q.levelName}) — {formatVNDecimal(q.maxScore)} điểm
                      </span>
                      {readingAnswers[q.id]?.trim() && (
                        <span className="text-[10px] text-emerald-700 font-semibold">
                          ✓ Đã nhập ({readingAnswers[q.id].trim().split(/\s+/).length} từ)
                        </span>
                      )}
                    </div>
                    <p className="text-stone-800 font-medium">{q.question}</p>
                    <textarea
                      rows={4}
                      value={readingAnswers[q.id] || ''}
                      readOnly={isEditingLocked}
                      disabled={isEditingLocked}
                      onChange={(e) => handleReadingAnswerChange(q.id, e.target.value)}
                      onBlur={() => {
                        if (!isEditingLocked) persistExamAnswersNow();
                      }}
                      placeholder="Nhập câu trả lời của bạn vào đây (bám sát từ ngữ và chi tiết trong văn bản)..."
                      className={`w-full p-3 font-serif text-xs border rounded-xl focus:outline-none leading-relaxed ${
                        isEditingLocked
                          ? 'bg-stone-100 border-stone-300 text-stone-500 cursor-not-allowed'
                          : 'bg-stone-50 border-stone-300 focus:ring-1 focus:ring-blue-600'
                      }`}
                    />
                  </div>
                ))}

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      persistExamAnswersNow();
                      setActiveStage(2);
                    }}
                    className="px-5 py-2.5 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                  >
                    <span>Chuyển sang Chặng 2: Đoạn văn ~200 chữ</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* NỘI DUNG CHẶNG 2: ĐOẠN VĂN ~200 CHỮ */}
          {activeStage === 2 && (
            <div className="p-6 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-4 text-xs">
              <div className="border-b border-stone-100 pb-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-purple-900 text-sm">
                    Phần II. Câu 1: Đoạn văn khoảng 200 chữ ({formatVNDecimal(exam.writingTasks.paragraphTask.maxScore)} điểm)
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-800 font-bold text-[10px]">
                    {exam.writingTasks.paragraphTask.typeName}
                  </span>
                </div>
                <p className="text-stone-800 text-sm leading-relaxed font-medium">
                  {exam.writingTasks.paragraphTask.promptText}
                </p>
                <div className="text-[11px] text-stone-500">
                  Yêu cầu: Viết đúng <strong>1 đoạn văn duy nhất</strong> (không xuống dòng tùy tiện), dung lượng khoảng 180 - 250 từ.
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-stone-500 mb-1 text-[11px]">
                  <span>Khu vực viết đoạn văn:</span>
                  <span className={`font-mono font-bold ${
                    paragraphWordCount >= 180 && paragraphWordCount <= 260
                      ? 'text-emerald-700'
                      : 'text-amber-700'
                  }`}>
                    {paragraphWordCount} từ (Mục tiêu: ~200 chữ)
                  </span>
                </div>
                <textarea
                  rows={12}
                  value={paragraphText}
                  readOnly={isEditingLocked}
                  disabled={isEditingLocked}
                  onPaste={(e) => handlePasteWithConfirmation('paragraph', e)}
                  onChange={(e) => handleParagraphChange(e.target.value)}
                  onBlur={() => {
                    if (!isEditingLocked) persistExamAnswersNow();
                  }}
                  placeholder="Bắt đầu viết đoạn văn khoảng 200 chữ vào đây..."
                  className={`w-full p-4 font-serif text-sm border rounded-xl focus:outline-none leading-relaxed ${
                    isEditingLocked
                      ? 'bg-stone-100 border-stone-300 text-stone-500 cursor-not-allowed'
                      : 'bg-stone-50 border-stone-300 focus:ring-1 focus:ring-purple-600'
                  }`}
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => {
                    persistExamAnswersNow();
                    setActiveStage(1);
                  }}
                  className="px-4 py-2 text-stone-600 hover:bg-stone-100 rounded-lg text-xs cursor-pointer"
                >
                  Quay lại Đọc hiểu
                </button>

                <button
                  type="button"
                  onClick={() => {
                    persistExamAnswersNow();
                    setActiveStage(3);
                  }}
                  className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  <span>Chuyển sang Chặng 3: Bài văn ~600 chữ</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* NỘI DUNG CHẶNG 3: BÀI VĂN ~600 CHỮ */}
          {activeStage === 3 && (
            <div className="p-6 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-4 text-xs">
              <div className="border-b border-stone-100 pb-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-900 text-sm">
                    Phần II. Câu 2: Bài văn khoảng 600 chữ ({formatVNDecimal(exam.writingTasks.essayTask.maxScore)} điểm)
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 font-bold text-[10px]">
                    {exam.writingTasks.essayTask.typeName}
                  </span>
                </div>
                <p className="text-stone-800 text-sm leading-relaxed font-medium">
                  {exam.writingTasks.essayTask.promptText}
                </p>
                <div className="text-[11px] text-stone-500">
                  Yêu cầu: Bố cục 3 phần rõ ràng (Mở bài, Thân bài các luận điểm, Kết bài), dung lượng khoảng 500 - 700 từ.
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-stone-500 mb-1 text-[11px]">
                  <span>Khu vực viết bài văn:</span>
                  <span className={`font-mono font-bold ${
                    essayWordCount >= 450 && essayWordCount <= 750
                      ? 'text-emerald-700'
                      : 'text-amber-700'
                  }`}>
                    {essayWordCount} từ (Mục tiêu: ~600 chữ)
                  </span>
                </div>
                <textarea
                  rows={18}
                  value={essayText}
                  readOnly={isEditingLocked}
                  disabled={isEditingLocked}
                  onPaste={(e) => handlePasteWithConfirmation('essay', e)}
                  onChange={(e) => handleEssayChange(e.target.value)}
                  onBlur={() => {
                    if (!isEditingLocked) persistExamAnswersNow();
                  }}
                  placeholder="Bắt đầu viết bài văn khoảng 600 chữ vào đây..."
                  className={`w-full p-4 font-serif text-sm border rounded-xl focus:outline-none leading-relaxed ${
                    isEditingLocked
                      ? 'bg-stone-100 border-stone-300 text-stone-500 cursor-not-allowed'
                      : 'bg-stone-50 border-stone-300 focus:ring-1 focus:ring-emerald-600'
                  }`}
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => {
                    persistExamAnswersNow();
                    setActiveStage(2);
                  }}
                  className="px-4 py-2 text-stone-600 hover:bg-stone-100 rounded-lg text-xs cursor-pointer"
                >
                  Quay lại Đoạn văn
                </button>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setShowConfirmSubmit(true)}
                  className="px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>Hoàn thành & Nộp toàn bài (v{submissionVersion})</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL XÁC NHẬN TRƯỚC KHI DÁN ĐÈ NỘI DUNG LỚN */}
      {pasteConfirmTarget && (
        <ImportPreviewModal
          isOpen={Boolean(pasteConfirmTarget)}
          incomingText={incomingPasteText}
          incomingSourceTitle={
            pasteConfirmTarget === 'paragraph'
              ? 'Dán văn bản vào Đoạn văn 200 chữ'
              : 'Dán văn bản vào Bài văn 600 chữ'
          }
          currentText={pasteConfirmTarget === 'paragraph' ? paragraphText : essayText}
          currentVersionNumber={submissionVersion}
          onClose={() => setPasteConfirmTarget(null)}
          onConfirmReplace={handleConfirmPasteReplace}
          onConfirmAppend={handleConfirmPasteAppend}
        />
      )}

      {/* MODAL XÁC NHẬN NỘP BÀI THI (GHI RÕ MÃ PHIÊN BẢN, THỜI ĐIỂM & CHỐNG NỘP TRÙNG) */}
      {showConfirmSubmit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-stone-200 overflow-hidden">
            <div className="p-4 bg-[#0F172A] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold">
                  Xác nhận nộp bài thi hoàn chỉnh (Phiên bản v{submissionVersion})
                </h3>
              </div>
              <button
                onClick={() => {
                  if (!isSubmitting) setShowConfirmSubmit(false);
                }}
                disabled={isSubmitting}
                className="text-stone-400 hover:text-white p-1 cursor-pointer disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs text-stone-700">
              <p>
                Bạn đang xác nhận nộp chính thức đề <strong>"{exam.title}"</strong> với mã phiên bản{' '}
                <strong className="font-mono">v{submissionVersion}</strong>.
              </p>
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-1 text-[11px]">
                <div>
                  • Tài khoản học sinh:{' '}
                  <strong>{currentUser ? `${currentUser.fullName} (${currentUser.username})` : activeStudentUid}</strong>
                </div>
                <div>
                  • Số câu Đọc hiểu đã làm:{' '}
                  <strong>
                    {answeredReadingCount}/{exam.readingPassage.questions.length} câu
                  </strong>
                </div>
                <div>
                  • Đoạn văn ~200 chữ: <strong>{paragraphWordCount} từ</strong>
                </div>
                <div>
                  • Bài văn ~600 chữ: <strong>{essayWordCount} từ</strong>
                </div>
              </div>
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-950 space-y-1">
                <div className="font-bold flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5 text-blue-700" />
                  <span>Quy tắc cố định phiên bản nộp:</span>
                </div>
                <p>
                  Sau khi xác nhận nộp, phiên bản <strong>v{submissionVersion}</strong> sẽ được lưu bất biến kèm thời điểm nộp và chuyển tới giáo viên duyệt điểm. Nếu muốn làm lại sau đó, hệ thống sẽ tạo phiên bản mới <strong>v{submissionVersion + 1}</strong>.
                </p>
              </div>
            </div>

            <div className="p-4 border-t border-stone-200 bg-stone-50 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setShowConfirmSubmit(false)}
                className="px-4 py-2 text-stone-600 hover:bg-stone-200 rounded-lg text-xs cursor-pointer disabled:opacity-50"
              >
                Tiếp tục làm bài
              </button>
              <button
                type="button"
                onClick={() => handleFinalSubmit('manual_confirm')}
                disabled={isSubmitting}
                className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? 'Đang khóa phiên bản & nộp...' : `Xác nhận nộp Phiên bản v${submissionVersion}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
