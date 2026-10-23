import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SAMPLE_WRITING_PROMPTS } from '../data/sampleData';
import {
  WritingFeedback,
  WritingSubmissionRecord,
  DraftingMethod,
  TaskSubmissionStatus,
  DraftVersion,
  UserAccount,
  LinkedGoogleDocMetadata,
  WritingPrompt
} from '../types';
import { evaluateWritingEssayWithAI } from '../services/pedagogicalEngine';
import { classifyWritingPromptItem } from '../services/recommendationEngine';
import {
  savePracticeRecordToFirestore,
  initAuth,
  googleSignIn,
  getGoogleConnectedProfile,
  SCOPES
} from '../services/firebaseAuth';
import { createWritingGoogleDoc, importLatestFromGoogleDoc } from '../services/googleDocsService';
import { GoogleWorkspaceApiError } from '../services/googleDriveService';
import { parseUploadedFile } from '../services/fileImportService';
import {
  SubmittedWritingSnapshot,
  PersistentWritingDraftState,
  resolveActiveStudentUid,
  loadWritingDraftState,
  fetchWritingDraftFromServer,
  saveWritingDraftState,
  normalizeLinkedGoogleDoc,
  loadLinkedGoogleDocForTaskFromProfile,
  loadStudentLinkedGoogleDocsProfile,
  saveLinkedGoogleDocToStudentProfile,
  fetchStudentLinkedGoogleDocsFromServer,
  setSimulateQuotaExceeded,
  getSimulateQuotaExceeded
} from '../services/draftStorageService';
import { DraftHistoryModal } from './DraftHistoryModal';
import { ImportPreviewModal } from './ImportPreviewModal';
import { SubmissionConfirmModal } from './SubmissionConfirmModal';
import { FocusModeBar } from './FocusModeBar';
import { GentleTypewriterText } from './GentleTypewriterText';
import {
  PenTool,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  ArrowRight,
  PlusCircle,
  Save,
  SplitSquareVertical,
  HelpCircle,
  Compass,
  Cloud,
  FileText,
  Upload,
  ClipboardPaste,
  ExternalLink,
  History,
  Send,
  Wifi,
  WifiOff,
  Sparkles,
  Lock,
  Unlock,
  HardDrive,
  ShieldCheck
} from 'lucide-react';

interface WritingCoachProps {
  currentUser?: UserAccount | null;
  isDemoMode?: boolean;
  initialPromptId?: string | null;
  onSaveSubmission: (record: WritingSubmissionRecord) => void;
  isFocusMode?: boolean;
  onToggleFocusMode?: (nextValue: boolean) => void;
}

const PUBLISHED_WRITING_PROMPTS: WritingPrompt[] = SAMPLE_WRITING_PROMPTS.filter(
  (p) => classifyWritingPromptItem(p).isReadyForStudent
);

function formatVersionCode(versionNumber: number): string {
  return `VER-${String(Math.max(1, versionNumber)).padStart(3, '0')}`;
}

export const WritingCoach: React.FC<WritingCoachProps> = ({
  currentUser = null,
  isDemoMode = false,
  initialPromptId = null,
  onSaveSubmission,
  isFocusMode,
  onToggleFocusMode
}) => {
  const [localFocusMode, setLocalFocusMode] = useState<boolean>(false);
  const effectiveFocusMode = isFocusMode ?? localFocusMode;
  const handleToggleFocus = (nextVal: boolean) => {
    setLocalFocusMode(nextVal);
    onToggleFocusMode?.(nextVal);
  };
  // Trạng thái chọn đề ngân hàng GV đã xuất bản hoặc tự nhập
  const [selectedPromptId, setSelectedPromptId] = useState<string>(
    () =>
      (initialPromptId && PUBLISHED_WRITING_PROMPTS.some((p) => p.id === initialPromptId)
        ? initialPromptId
        : PUBLISHED_WRITING_PROMPTS[0]?.id) || SAMPLE_WRITING_PROMPTS[0].id
  );
  const [isCustomPrompt, setIsCustomPrompt] = useState<boolean>(false);

  // Đề tự nhập
  const [customTitle, setCustomTitle] = useState<string>('');
  const [customPromptText, setCustomPromptText] = useState<string>('');
  const [customType, setCustomType] = useState<'nghi_luan_xa_hoi' | 'nghi_luan_van_hoc'>('nghi_luan_xa_hoi');

  // Phương thức soạn bài được chọn
  const [activeMethod, setActiveMethod] = useState<DraftingMethod>('direct');

  // Xác định UID ổn định của học sinh và Mã nhiệm vụ (taskId)
  const activeStudentUid = resolveActiveStudentUid(currentUser?.id, isDemoMode);
  const activeTaskId = isCustomPrompt ? `custom_${customType}` : `prompt_${selectedPromptId}`;

  // Bài viết, Phiên bản & Trạng thái khóa bất biến sau khi nộp
  const [studentEssay, setStudentEssay] = useState<string>('');
  const [taskStatus, setTaskStatus] = useState<TaskSubmissionStatus>('dang_soan_nhap');
  const [currentVersionNumber, setCurrentVersionNumber] = useState<number>(1);
  const [isEditorLockedAfterSubmit, setIsEditorLockedAfterSubmit] = useState<boolean>(false);
  const [versions, setVersions] = useState<DraftVersion[]>([]);
  const [submittedSnapshots, setSubmittedSnapshots] = useState<SubmittedWritingSnapshot[]>([]);

  // Trạng thái lưu bền vững & cảnh báo lỗi lưu
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [storageScopeLabel, setStorageScopeLabel] = useState<string>(
    'Chỉ lưu trên thiết bị này (localStorage)'
  );
  const [autoSaveStatus, setAutoSaveStatus] = useState<'saved' | 'saving' | 'error' | 'idle'>('idle');
  const [autoSaveToastInfo, setAutoSaveToastInfo] = useState<{
    savedAt: string;
    wordCount: number;
    versionCode: string;
  } | null>(null);
  const autoSaveToastTimerRef = useRef<number | null>(null);
  const [storageErrorMessage, setStorageErrorMessage] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [restoredBannerInfo, setRestoredBannerInfo] = useState<string | null>(null);

  // Google Docs tích hợp (lưu bền vững docId, liên kết, chủ sở hữu và mã nhiệm vụ vào hồ sơ đúng học sinh)
  const [linkedGoogleDoc, setLinkedGoogleDoc] = useState<LinkedGoogleDocMetadata | null>(null);
  const [studentProfileDocs, setStudentProfileDocs] = useState<Record<string, LinkedGoogleDocMetadata>>({});
  const [isCreatingDoc, setIsCreatingDoc] = useState<boolean>(false);
  const [isSyncingDoc, setIsSyncingDoc] = useState<boolean>(false);
  const [docsApiError, setDocsApiError] = useState<string | null>(null);
  const [docsApiErrorCode, setDocsApiErrorCode] = useState<string | null>(null);
  const [docsSyncSuccessBanner, setDocsSyncSuccessBanner] = useState<string | null>(null);
  const [pendingDocsImportMeta, setPendingDocsImportMeta] = useState<{
    docId: string;
    docName: string;
    docUrl: string;
    ownerAccount: string;
  } | null>(null);

  // Trạng thái kết nối Google OAuth (phạm vi tối thiểu drive.file)
  const [googleConnectedEmail, setGoogleConnectedEmail] = useState<string | null>(
    () => getGoogleConnectedProfile()?.email || null
  );
  const [hasValidGoogleToken, setHasValidGoogleToken] = useState<boolean>(
    () => Boolean(getGoogleConnectedProfile()?.hasValidToken)
  );
  const [isConnectingGoogleOAuth, setIsConnectingGoogleOAuth] = useState<boolean>(false);

  // Dán nội dung & Tải tệp tạm
  const [pasteDraftInput, setPasteDraftInput] = useState<string>('');
  const [fileParsingError, setFileParsingError] = useState<string | null>(null);
  const [isParsingFile, setIsParsingFile] = useState<boolean>(false);

  // Modals
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState<boolean>(false);
  const [incomingImportText, setIncomingImportText] = useState<string>('');
  const [incomingSourceTitle, setIncomingSourceTitle] = useState<string>('');
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState<boolean>(false);
  const [isSubmitConfirmOpen, setIsSubmitConfirmOpen] = useState<boolean>(false);

  // Phản hồi & Tự chỉnh sửa
  const [feedback, setFeedback] = useState<WritingFeedback | null>(null);
  const [revisedEssay, setRevisedEssay] = useState<string>('');
  const [reflectionNote, setReflectionNote] = useState<string>('');
  const [savedNotification, setSavedNotification] = useState<boolean>(false);
  const [validationWarning, setValidationWarning] = useState<string | null>(null);
  const [activeDiffView, setActiveDiffView] = useState<'edit' | 'compare'>('edit');
  const [isEvaluatingAI, setIsEvaluatingAI] = useState<boolean>(false);

  // Khóa chống nộp trùng (Anti-duplicate submission lock)
  const isSubmittingLockRef = useRef<boolean>(false);
  const [isSubmittingFinal, setIsSubmittingFinal] = useState<boolean>(false);

  // Cờ đánh dấu đang khôi phục dữ liệu từ bộ nhớ bền vững để không ghi đè rỗng
  const isHydratingDraftRef = useRef<boolean>(false);

  // Công cụ kiểm thử độ bền dành cho Giáo viên / Kiểm định
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false);
  const [quotaSimulated, setQuotaSimulated] = useState<boolean>(getSimulateQuotaExceeded());

  // Thông tin đề hiện tại (chỉ lấy từ danh sách đề ngân hàng đã được giáo viên xuất bản và có Rubric chuẩn)
  const currentSample =
    PUBLISHED_WRITING_PROMPTS.find((p) => p.id === selectedPromptId) ||
    PUBLISHED_WRITING_PROMPTS[0] ||
    SAMPLE_WRITING_PROMPTS[0];
  const activePromptTitle = isCustomPrompt ? (customTitle || 'Đề nghị luận tự chọn') : currentSample.title;
  const activePromptText = isCustomPrompt ? customPromptText : currentSample.promptText;
  const activeType = isCustomPrompt ? customType : currentSample.type;
  const activeSectionType: 'paragraph_200w' | 'essay_600w' = isCustomPrompt
    ? customType === 'nghi_luan_xa_hoi'
      ? 'paragraph_200w'
      : 'essay_600w'
    : currentSample.sectionType || (currentSample.maxScore === 2.0 ? 'paragraph_200w' : 'essay_600w');
  const targetWordCount =
    !isCustomPrompt && typeof currentSample.targetWordCount === 'number'
      ? currentSample.targetWordCount
      : activeSectionType === 'paragraph_200w'
      ? 200
      : 600;
  const activeMaxScore =
    !isCustomPrompt && typeof currentSample.maxScore === 'number'
      ? currentSample.maxScore
      : activeSectionType === 'paragraph_200w'
      ? 2.0
      : 4.0;
  const activeRubric = !isCustomPrompt ? currentSample.rubric : undefined;
  const activeRubricId = !isCustomPrompt ? currentSample.rubricId : undefined;

  useEffect(() => {
    if (initialPromptId && PUBLISHED_WRITING_PROMPTS.some((p) => p.id === initialPromptId)) {
      setIsCustomPrompt(false);
      setSelectedPromptId(initialPromptId);
      setValidationWarning(null);
      setSavedNotification(false);
    }
  }, [initialPromptId]);

  // Thống kê nhanh
  const wordCount = studentEssay.trim() ? studentEssay.trim().split(/\s+/).length : 0;
  const paragraphCount = studentEssay.trim() ? studentEssay.trim().split(/\n+/).filter(Boolean).length : 0;

  // Theo dõi trạng thái xác thực Google OAuth (token trong bộ nhớ)
  useEffect(() => {
    const unsub = initAuth(
      (user, token) => {
        setGoogleConnectedEmail(user.email || user.displayName || null);
        setHasValidGoogleToken(Boolean(token));
      },
      () => {
        setGoogleConnectedEmail(null);
        setHasValidGoogleToken(false);
      }
    );
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  // Hàm áp dụng trạng thái khôi phục từ bộ nhớ vào React state
  const applyRestoredDraftState = useCallback(
    (saved: PersistentWritingDraftState) => {
      isHydratingDraftRef.current = true;
      setStudentEssay(saved.currentContent || '');
      setRevisedEssay(saved.revisedContent || '');
      setReflectionNote(saved.reflectionNote || '');
      setTaskStatus(saved.taskStatus || 'dang_soan_nhap');
      setCurrentVersionNumber(Math.max(1, Number(saved.currentVersionNumber) || 1));
      setIsEditorLockedAfterSubmit(Boolean(saved.isEditorLockedAfterSubmit));
      setLastSavedTime(saved.lastSavedAt || null);
      setStorageScopeLabel(saved.storageScopeLabel || 'Chỉ lưu trên thiết bị này (localStorage)');

      const restoredDoc =
        normalizeLinkedGoogleDoc(saved.linkedGoogleDoc, activeStudentUid, activeTaskId) ||
        loadLinkedGoogleDocForTaskFromProfile(activeStudentUid, activeTaskId);
      setLinkedGoogleDoc(restoredDoc);

      setVersions(Array.isArray(saved.versions) ? saved.versions : []);
      setSubmittedSnapshots(Array.isArray(saved.submittedSnapshots) ? saved.submittedSnapshots : []);
      setFeedback(saved.latestFeedback || null);
      if (saved.taskId.startsWith('custom_')) {
        setCustomTitle(saved.promptTitle || '');
        setCustomPromptText(saved.promptText || '');
      }
      setAutoSaveStatus(saved.lastSavedAt ? 'saved' : 'idle');
      setStorageErrorMessage(null);
      if (
        saved.currentContent?.trim() ||
        (saved.versions && saved.versions.length > 0) ||
        restoredDoc
      ) {
        setRestoredBannerInfo(
          `Đã tự động phục hồi bản nháp v${saved.currentVersionNumber || 1} (${
            saved.currentContent?.trim() ? saved.currentContent.trim().split(/\s+/).length : 0
          } từ)${restoredDoc ? ` và tài liệu Google Docs đã liên kết (${restoredDoc.name})` : ''} của tài khoản [${
            currentUser?.username || activeStudentUid
          }] — Lưu lần cuối lúc ${saved.lastSavedAt || 'trước đó'}.`
        );
      } else {
        setRestoredBannerInfo(null);
      }
      setTimeout(() => {
        isHydratingDraftRef.current = false;
      }, 60);
    },
    [activeStudentUid, activeTaskId, currentUser?.username]
  );

  // YÊU CẦU 1 & 2: Tự động phục hồi bản nháp và liên kết Google Docs đúng UID học sinh, đúng mã nhiệm vụ khi tải lại trang / đổi đề / đổi tài khoản
  useEffect(() => {
    isHydratingDraftRef.current = true;
    setValidationWarning(null);
    setStorageErrorMessage(null);
    setDocsApiError(null);
    setDocsApiErrorCode(null);
    setDocsSyncSuccessBanner(null);
    setPendingDocsImportMeta(null);

    const localProfileDocs = loadStudentLinkedGoogleDocsProfile(activeStudentUid);
    setStudentProfileDocs(localProfileDocs);

    const localSaved = loadWritingDraftState(activeStudentUid, activeTaskId);
    const profileLinkedDoc = loadLinkedGoogleDocForTaskFromProfile(activeStudentUid, activeTaskId);

    if (localSaved) {
      applyRestoredDraftState(localSaved);
    } else {
      // Nếu học sinh mới hoặc nhiệm vụ mới chưa có bản nháp -> Khởi tạo rỗng, nhưng nếu trong hồ sơ học sinh đã có tài liệu Google Docs liên kết cho nhiệm vụ này thì cho phép mở lại
      setStudentEssay('');
      setRevisedEssay('');
      setReflectionNote('');
      setTaskStatus('dang_soan_nhap');
      setCurrentVersionNumber(1);
      setIsEditorLockedAfterSubmit(false);
      setLastSavedTime(null);
      setStorageScopeLabel('Chỉ lưu trên thiết bị này (localStorage)');
      setAutoSaveStatus('idle');
      setLinkedGoogleDoc(profileLinkedDoc || null);
      setVersions([]);
      setSubmittedSnapshots([]);
      setFeedback(null);
      setRestoredBannerInfo(
        profileLinkedDoc
          ? `Đã tìm thấy tài liệu Google Docs đã liên kết (${profileLinkedDoc.name}) trong hồ sơ của học sinh [${
              currentUser?.username || activeStudentUid
            }]. Bạn có thể mở lại tài liệu hoặc nhập nội dung mới nhất.`
          : null
      );
      setTimeout(() => {
        isHydratingDraftRef.current = false;
      }, 60);
    }

    // Đồng bộ bản nháp và danh sách liên kết Google Docs từ máy chủ trung tâm (nếu học sinh đã đăng nhập)
    fetchWritingDraftFromServer(activeStudentUid, activeTaskId).then((serverDraft) => {
      if (!serverDraft) return;
      const localIso = localSaved?.lastSavedIso || '';
      const serverIso = serverDraft.lastSavedIso || '';
      if (
        !localSaved ||
        serverIso > localIso ||
        (serverDraft.submittedSnapshots?.length || 0) > (localSaved.submittedSnapshots?.length || 0)
      ) {
        applyRestoredDraftState(serverDraft);
      }
    });

    fetchStudentLinkedGoogleDocsFromServer(activeStudentUid).then((mergedDocs) => {
      setStudentProfileDocs(mergedDocs);
      const docForTask = mergedDocs[activeTaskId];
      if (docForTask && docForTask.studentUid === activeStudentUid && docForTask.taskId === activeTaskId) {
        setLinkedGoogleDoc((prev) => prev || docForTask);
      }
    });
  }, [activeStudentUid, activeTaskId, applyRestoredDraftState, currentUser?.username]);

  // Hàm lưu bền vững trạng thái hiện tại và kiểm tra lỗi ghi (không báo lưu thành công nếu ghi thất bại)
  const persistCurrentStateNow = useCallback(
    async (overrides?: Partial<PersistentWritingDraftState>): Promise<boolean> => {
      const payload: PersistentWritingDraftState = {
        studentUid: activeStudentUid,
        taskId: activeTaskId,
        promptTitle: activePromptTitle,
        promptText: activePromptText,
        promptType: activeType,
        currentContent: studentEssay,
        revisedContent: revisedEssay,
        reflectionNote,
        taskStatus,
        currentVersionNumber,
        isEditorLockedAfterSubmit,
        lastSavedAt: lastSavedTime,
        lastSavedIso: new Date().toISOString(),
        storageScopeLabel,
        linkedGoogleDoc,
        versions,
        submittedSnapshots,
        latestFeedback: feedback,
        ...overrides
      };

      const res = await saveWritingDraftState(payload);
      if (!res.success) {
        setAutoSaveStatus('error');
        setStorageErrorMessage(
          res.errorMessage ||
            'Không thể lưu bản nháp! Vui lòng kiểm tra dung lượng trình duyệt hoặc sao chép bài viết ra ngoài.'
        );
        return false;
      }

      setLastSavedTime(res.savedAt);
      setStorageScopeLabel(res.storageScopeLabel);
      setAutoSaveStatus('saved');
      if (res.errorMessage) {
        // Trường hợp lưu được lên server nhưng localStorage đầy
        setStorageErrorMessage(res.errorMessage);
      } else {
        setStorageErrorMessage(null);
      }
      return true;
    },
    [
      activeStudentUid,
      activeTaskId,
      activePromptTitle,
      activePromptText,
      activeType,
      studentEssay,
      revisedEssay,
      reflectionNote,
      taskStatus,
      currentVersionNumber,
      isEditorLockedAfterSubmit,
      lastSavedTime,
      storageScopeLabel,
      linkedGoogleDoc,
      versions,
      submittedSnapshots,
      feedback
    ]
  );

  // Giám sát kết nối mạng và tự động đồng bộ lại khi có mạng
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (studentEssay.trim() || versions.length > 0 || linkedGoogleDoc) {
        persistCurrentStateNow();
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
      setStorageScopeLabel((prev) =>
        prev.includes('Mất mạng')
          ? prev
          : `Mất mạng — Chỉ lưu trên thiết bị này (localStorage)${lastSavedTime ? ` lúc ${lastSavedTime}` : ''}`
      );
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [studentEssay, versions.length, linkedGoogleDoc, lastSavedTime, persistCurrentStateNow]);

  // Tự động lưu bản nháp bền vững sau 1.5s người dùng dừng gõ
  const autoSaveTimerRef = useRef<any>(null);
  useEffect(() => {
    if (isHydratingDraftRef.current) return;
    if (isEditorLockedAfterSubmit) return;
    if (!studentEssay.trim() && versions.length === 0 && !linkedGoogleDoc) return;

    setAutoSaveStatus('saving');
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    autoSaveTimerRef.current = setTimeout(async () => {
      const nowStr = new Date().toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      let updatedVersions = versions;
      if (studentEssay.trim()) {
        const lastVer = versions[0];
        if (!lastVer || lastVer.content !== studentEssay) {
          const newVer: DraftVersion = {
            id: `ver-auto-${Date.now()}`,
            versionNumber: currentVersionNumber,
            versionCode: formatVersionCode(currentVersionNumber),
            content: studentEssay,
            wordCount: studentEssay.trim().split(/\s+/).length,
            source: 'auto_save',
            sourceLabel: `Tự động lưu v${currentVersionNumber} (${nowStr})`,
            savedAt: nowStr
          };
          updatedVersions = [newVer, ...versions.slice(0, 24)];
          setVersions(updatedVersions);
        }
      }

      const nextStatus: TaskSubmissionStatus =
        taskStatus === 'da_nop_chinh_thuc' ? 'da_nop_chinh_thuc' : 'da_luu_nhap';

      const ok = await persistCurrentStateNow({
        currentContent: studentEssay,
        taskStatus: nextStatus,
        versions: updatedVersions
      });
      if (ok) {
        if (taskStatus !== 'da_nop_chinh_thuc') {
          setTaskStatus('da_luu_nhap');
        }
        const currentWords = studentEssay.trim() ? studentEssay.trim().split(/\s+/).length : 0;
        setAutoSaveToastInfo({
          savedAt: nowStr,
          wordCount: currentWords,
          versionCode: formatVersionCode(currentVersionNumber)
        });
        if (autoSaveToastTimerRef.current) {
          window.clearTimeout(autoSaveToastTimerRef.current);
        }
        autoSaveToastTimerRef.current = window.setTimeout(() => {
          setAutoSaveToastInfo(null);
        }, 3200);
      }
    }, 1500);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [studentEssay, revisedEssay, reflectionNote, customTitle, customPromptText]);

  // Đổi đề bài mẫu (Sẽ tự động nạp bản nháp riêng của đề đó qua useEffect [activeStudentUid, activeTaskId])
  const handleSelectSample = (id: string) => {
    setIsCustomPrompt(false);
    setSelectedPromptId(id);
  };

  const handleSwitchCustom = () => {
    setIsCustomPrompt(true);
  };

  // Lưu bản nháp thủ công (Kiểm tra kết quả ghi thật sự trước khi báo thành công)
  const handleManualSaveDraft = async () => {
    if (!studentEssay.trim()) {
      setValidationWarning('Bài viết chưa có nội dung để lưu bản nháp.');
      return;
    }
    const nowStr = new Date().toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const newVer: DraftVersion = {
      id: `ver-manual-${Date.now()}`,
      versionNumber: currentVersionNumber,
      versionCode: formatVersionCode(currentVersionNumber),
      content: studentEssay,
      wordCount,
      source: 'manual_save',
      sourceLabel: `Bản nháp thủ công v${currentVersionNumber} (${nowStr})`,
      savedAt: nowStr
    };
    const nextVersions = [newVer, ...versions.slice(0, 24)];
    const nextStatus: TaskSubmissionStatus = isEditorLockedAfterSubmit ? 'da_nop_chinh_thuc' : 'da_luu_nhap';

    const ok = await persistCurrentStateNow({
      currentContent: studentEssay,
      taskStatus: nextStatus,
      versions: nextVersions
    });

    // Tuyệt đối không báo lưu thành công nếu ghi thất bại
    if (ok) {
      setVersions(nextVersions);
      setTaskStatus(nextStatus);
      setSavedNotification(true);
      setTimeout(() => setSavedNotification(false), 2500);
    }
  };

  // Khôi phục bản nháp từ Lịch sử phiên bản -> Tạo phiên bản mới v{N+1}, bảo toàn bản cũ
  const handleRestoreVersion = async (ver: DraftVersion) => {
    const nowStr = new Date().toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    const nextVerNum = currentVersionNumber + 1;
    let updatedVersions = [...versions];

    if (studentEssay.trim() && studentEssay !== ver.content && !isEditorLockedAfterSubmit) {
      const backupVer: DraftVersion = {
        id: `backup-${Date.now()}`,
        versionNumber: currentVersionNumber,
        versionCode: formatVersionCode(currentVersionNumber),
        content: studentEssay,
        wordCount,
        source: 'direct_edit',
        sourceLabel: `Bản lưu tự động trước khi khôi phục (${nowStr})`,
        savedAt: nowStr
      };
      updatedVersions = [backupVer, ...updatedVersions];
    }

    const restoredVer: DraftVersion = {
      id: `restore-${Date.now() + 1}`,
      versionNumber: nextVerNum,
      versionCode: formatVersionCode(nextVerNum),
      content: ver.content,
      wordCount: ver.wordCount,
      source: 'manual_save',
      sourceLabel: `Khôi phục từ [${ver.versionCode || 'Bản cũ'}] thành v${nextVerNum} (${nowStr})`,
      savedAt: nowStr
    };
    updatedVersions = [restoredVer, ...updatedVersions.slice(0, 24)];

    setStudentEssay(ver.content);
    setCurrentVersionNumber(nextVerNum);
    setIsEditorLockedAfterSubmit(false);
    setTaskStatus('da_luu_nhap');
    setVersions(updatedVersions);
    setValidationWarning(null);

    await persistCurrentStateNow({
      currentContent: ver.content,
      currentVersionNumber: nextVerNum,
      isEditorLockedAfterSubmit: false,
      taskStatus: 'da_luu_nhap',
      versions: updatedVersions
    });
  };

  // ==========================================
  // XỬ LÝ GOOGLE DOCS THẬT (PHẠM VI TỐI THIỂU drive.file, LƯU HỒ SƠ ĐÚNG HỌC SINH, XEM TRƯỚC & XÁC NHẬN)
  // ==========================================
  const handleConnectOrRefreshGoogleOAuth = async () => {
    setIsConnectingGoogleOAuth(true);
    setDocsApiError(null);
    setDocsApiErrorCode(null);
    setValidationWarning(null);
    try {
      const res = await googleSignIn();
      if (res) {
        setGoogleConnectedEmail(res.user.email || res.user.displayName || null);
        setHasValidGoogleToken(Boolean(res.accessToken));
      }
    } catch (err: any) {
      setDocsApiError(err.message || 'Không thể kết nối tài khoản Google OAuth.');
      setDocsApiErrorCode('AUTH_FAILED');
    } finally {
      setIsConnectingGoogleOAuth(false);
    }
  };

  const handleCreateGoogleDoc = async () => {
    setIsCreatingDoc(true);
    setValidationWarning(null);
    setDocsApiError(null);
    setDocsApiErrorCode(null);
    setDocsSyncSuccessBanner(null);

    try {
      const result = await createWritingGoogleDoc(
        activeTaskId,
        activePromptTitle,
        activePromptText,
        activeSectionType === 'paragraph_200w' ? 'Đoạn văn 200 chữ' : 'Bài văn 600 chữ',
        studentEssay,
        activeStudentUid
      );

      const docMeta: LinkedGoogleDocMetadata = {
        docId: result.docId,
        id: result.docId,
        docUrl: result.docUrl,
        url: result.docUrl,
        name: result.name,
        taskId: activeTaskId,
        studentUid: activeStudentUid,
        ownerAccount: result.ownerAccount,
        ownerGoogleUid: result.ownerGoogleUid,
        ownerDisplayName: result.ownerDisplayName,
        createdAt: result.createdAt,
        lastSyncedAt: null,
        lastSyncedVersionCode: null
      };

      // Lưu bền vững vào trạng thái nhiệm vụ VÀ hồ sơ của đúng học sinh
      const draftSavedOk = await persistCurrentStateNow({
        linkedGoogleDoc: docMeta
      });
      const profileSaveRes = await saveLinkedGoogleDocToStudentProfile(activeStudentUid, docMeta);

      if (!draftSavedOk && !profileSaveRes.success) {
        setDocsApiError(
          profileSaveRes.errorMessage ||
            'Đã tạo tài liệu trên Google Docs nhưng KHÔNG THỂ LƯU liên kết vào hồ sơ học sinh do bộ nhớ đầy hoặc bị khóa.'
        );
        setDocsApiErrorCode('STORAGE_ERROR');
        return;
      }

      setLinkedGoogleDoc(docMeta);
      setStudentProfileDocs(loadStudentLinkedGoogleDocsProfile(activeStudentUid));
      setDocsSyncSuccessBanner(
        `Đã tạo và lưu liên kết tài liệu Google Docs (Mã Doc: ${docMeta.docId} · Chủ sở hữu: ${docMeta.ownerAccount}) vào hồ sơ học sinh [${activeStudentUid}] cho nhiệm vụ [${activeTaskId}].`
      );
    } catch (err: any) {
      if (err instanceof GoogleWorkspaceApiError) {
        setDocsApiError(err.message);
        setDocsApiErrorCode(err.code);
        if (err.code === 'TOKEN_EXPIRED' || err.code === 'NOT_AUTHENTICATED') {
          setHasValidGoogleToken(false);
        }
      } else {
        setDocsApiError(err.message || 'Không thể tạo tài liệu Google Docs.');
        setDocsApiErrorCode('API_ERROR');
      }
    } finally {
      setIsCreatingDoc(false);
    }
  };

  const handleSyncLatestFromDocs = async () => {
    if (!linkedGoogleDoc) return;
    setIsSyncingDoc(true);
    setValidationWarning(null);
    setDocsApiError(null);
    setDocsApiErrorCode(null);
    // Tuyệt đối không báo "đã đồng bộ" khi mới bắt đầu đọc hoặc đang xem trước
    setDocsSyncSuccessBanner(null);

    try {
      const targetDocId = linkedGoogleDoc.docId || linkedGoogleDoc.id;
      const importResult = await importLatestFromGoogleDoc(
        targetDocId,
        linkedGoogleDoc.ownerAccount
      );

      if (!importResult.content.trim()) {
        setDocsApiError(
          'Tài liệu Google Docs hiện chưa có nội dung bài làm của học sinh (sau phần tiêu đề hướng dẫn). Vui lòng gõ bài làm trong Google Docs và đợi Google lưu xong trước khi đồng bộ.'
        );
        setDocsApiErrorCode('EMPTY_CONTENT');
        return;
      }

      // Lưu thông tin tạm để khi học sinh bấm Xác nhận trong hộp thoại xem trước mới ghi nhận đồng bộ
      setPendingDocsImportMeta({
        docId: importResult.docId,
        docName: importResult.docName || linkedGoogleDoc.name,
        docUrl: importResult.docUrl || linkedGoogleDoc.docUrl || linkedGoogleDoc.url,
        ownerAccount: importResult.ownerAccount || linkedGoogleDoc.ownerAccount
      });
      setIncomingImportText(importResult.content);
      setIncomingSourceTitle(
        `Google Docs: "${importResult.docName || linkedGoogleDoc.name}" (Mã: ${importResult.docId.slice(
          0,
          12
        )}... · Chủ sở hữu: ${importResult.ownerAccount || linkedGoogleDoc.ownerAccount})`
      );
      setIsPreviewModalOpen(true);
    } catch (err: any) {
      if (err instanceof GoogleWorkspaceApiError) {
        setDocsApiError(err.message);
        setDocsApiErrorCode(err.code);
        if (err.code === 'TOKEN_EXPIRED' || err.code === 'NOT_AUTHENTICATED') {
          setHasValidGoogleToken(false);
        }
      } else {
        setDocsApiError(err.message || 'Lỗi đồng bộ từ Google Docs.');
        setDocsApiErrorCode('API_ERROR');
      }
    } finally {
      setIsSyncingDoc(false);
    }
  };

  // ==========================================
  // XỬ LÝ TẢI TỆP (.DOCX, .TXT) -> YÊU CẦU XÁC NHẬN & TẠO PHIÊN BẢN MỚI
  // ==========================================
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsingFile(true);
    setFileParsingError(null);
    const parseResult = await parseUploadedFile(file);
    setIsParsingFile(false);

    if (!parseResult.success) {
      setFileParsingError(parseResult.errorMessage || 'Không thể đọc tệp tin.');
      return;
    }

    setIncomingImportText(parseResult.text || '');
    setIncomingSourceTitle(`Tệp tin tải lên: ${parseResult.fileName} (${parseResult.fileSizeFormatted})`);
    setIsPreviewModalOpen(true);
    e.target.value = '';
  };

  // ==========================================
  // XỬ LÝ DÁN NỘI DUNG TỪ BÊN NGOÀI HOẶC DÁN ĐÈ TRỰC TIẾP TRONG Ô SOẠN THẢO
  // ==========================================
  const handleReviewPastedContent = () => {
    if (!pasteDraftInput.trim()) {
      setValidationWarning('Vui lòng dán văn bản bài làm vào ô trước khi kiểm tra.');
      return;
    }
    setIncomingImportText(pasteDraftInput.trim());
    setIncomingSourceTitle('Nội dung dán từ ứng dụng ngoài (Word / Docs / Ghi chú)');
    setIsPreviewModalOpen(true);
  };

  // Chặn ghi đè âm thầm khi học sinh dán (Ctrl+V) một đoạn dài vào ô soạn thảo đang có bản nháp
  const handleTextareaPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (isEditorLockedAfterSubmit) {
      e.preventDefault();
      return;
    }
    const pastedText = e.clipboardData?.getData('text/plain') || '';
    const pastedWords = pastedText.trim() ? pastedText.trim().split(/\s+/).length : 0;
    // Nếu đang có bản nháp (>= 15 từ) và người dùng dán khối văn bản lớn (>= 25 từ), mở hộp thoại xác nhận & tạo phiên bản mới
    if (wordCount >= 15 && pastedWords >= 25) {
      e.preventDefault();
      setIncomingImportText(pastedText.trim());
      setIncomingSourceTitle('Dán trực tiếp (Clipboard) khi đang có bản nháp');
      setIsPreviewModalOpen(true);
    }
  };

  // ==========================================
  // YÊU CẦU 3: XÁC NHẬN NHẬP NỘI DUNG -> TẠO PHIÊN BẢN MỚI & KIỂM TRA LƯU THÀNH CÔNG TRƯỚC KHI BÁO "ĐÃ ĐỒNG BỘ"
  // ==========================================
  const handleConfirmReplace = async (newText: string) => {
    const nowStr = new Date().toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    const nextVerNum = currentVersionNumber + 1;
    const nextVerCode = formatVersionCode(nextVerNum);
    let updatedVersions = [...versions];

    if (studentEssay.trim() && studentEssay.trim() !== newText.trim()) {
      const backupVer: DraftVersion = {
        id: `pre-import-${Date.now()}`,
        versionNumber: currentVersionNumber,
        versionCode: formatVersionCode(currentVersionNumber),
        content: studentEssay,
        wordCount,
        source: 'manual_save',
        sourceLabel: `Bản lưu v${currentVersionNumber} trước khi nhập mới (${nowStr})`,
        savedAt: nowStr
      };
      updatedVersions = [backupVer, ...updatedVersions];
    }

    const isFromGoogleDocs = Boolean(pendingDocsImportMeta) || activeMethod === 'google_docs';
    const importedVer: DraftVersion = {
      id: `import-${Date.now() + 1}`,
      versionNumber: nextVerNum,
      versionCode: nextVerCode,
      content: newText,
      wordCount: newText.trim() ? newText.trim().split(/\s+/).length : 0,
      source: isFromGoogleDocs
        ? 'google_docs_sync'
        : activeMethod === 'upload_file'
        ? 'file_upload'
        : 'paste_import',
      sourceLabel: `Phiên bản mới v${nextVerNum} — Nhập từ ${incomingSourceTitle.slice(0, 32)} (${nowStr})`,
      savedAt: nowStr
    };
    updatedVersions = [importedVer, ...updatedVersions.slice(0, 24)];

    let updatedDocMeta = linkedGoogleDoc;
    if (isFromGoogleDocs && (linkedGoogleDoc || pendingDocsImportMeta)) {
      const baseDoc = linkedGoogleDoc || {
        docId: pendingDocsImportMeta!.docId,
        id: pendingDocsImportMeta!.docId,
        docUrl: pendingDocsImportMeta!.docUrl,
        url: pendingDocsImportMeta!.docUrl,
        name: pendingDocsImportMeta!.docName,
        taskId: activeTaskId,
        studentUid: activeStudentUid,
        ownerAccount: pendingDocsImportMeta!.ownerAccount,
        createdAt: nowStr
      };
      updatedDocMeta = {
        ...baseDoc,
        ownerAccount: pendingDocsImportMeta?.ownerAccount || baseDoc.ownerAccount,
        lastSyncedAt: nowStr,
        lastSyncedVersionCode: nextVerCode
      };
    }

    // Ghi bền vững phiên bản mới trước khi được phép báo "Đã đồng bộ"
    const savedOk = await persistCurrentStateNow({
      currentContent: newText,
      currentVersionNumber: nextVerNum,
      isEditorLockedAfterSubmit: false,
      taskStatus: 'da_nhap_tu_ngoai',
      linkedGoogleDoc: updatedDocMeta,
      versions: updatedVersions
    });

    if (!savedOk) {
      // Tuyệt đối không báo "đã đồng bộ" nếu chưa lưu được phiên bản thành công!
      setDocsSyncSuccessBanner(null);
      if (isFromGoogleDocs) {
        setDocsApiError(
          'Đã đọc được nội dung từ Google Docs nhưng LƯU PHIÊN BẢN MỚI THẤT BẠI (Bộ nhớ đầy hoặc lỗi ghi). Hệ thống KHÔNG ghi nhận trạng thái "Đã đồng bộ".'
        );
        setDocsApiErrorCode('STORAGE_ERROR');
      }
      setPendingDocsImportMeta(null);
      return;
    }

    setStudentEssay(newText);
    setCurrentVersionNumber(nextVerNum);
    setIsEditorLockedAfterSubmit(false);
    setTaskStatus('da_nhap_tu_ngoai');
    setPasteDraftInput('');
    setVersions(updatedVersions);

    if (isFromGoogleDocs && updatedDocMeta) {
      setLinkedGoogleDoc(updatedDocMeta);
      await saveLinkedGoogleDocToStudentProfile(activeStudentUid, updatedDocMeta);
      setStudentProfileDocs(loadStudentLinkedGoogleDocsProfile(activeStudentUid));
      setDocsApiError(null);
      setDocsApiErrorCode(null);
      setDocsSyncSuccessBanner(
        `Đã đồng bộ và lưu thành công Phiên bản ${nextVerCode} (v${nextVerNum}) từ Google Docs lúc ${nowStr}.`
      );
    }
    setPendingDocsImportMeta(null);
  };

  const handleConfirmAppend = async (newText: string) => {
    const combined = studentEssay.trim()
      ? `${studentEssay.trim()}\n\n${newText.trim()}`
      : newText.trim();
    await handleConfirmReplace(combined);
  };

  const handleConfirmSaveAsVersionOnly = async (newText: string) => {
    const nowStr = new Date().toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    const nextVerNum = currentVersionNumber + 1;
    const nextVerCode = formatVersionCode(nextVerNum);
    const isFromGoogleDocs = Boolean(pendingDocsImportMeta) || activeMethod === 'google_docs';
    const savedVer: DraftVersion = {
      id: `ver-side-${Date.now()}`,
      versionNumber: nextVerNum,
      versionCode: nextVerCode,
      content: newText,
      wordCount: newText.trim() ? newText.trim().split(/\s+/).length : 0,
      source: isFromGoogleDocs
        ? 'google_docs_sync'
        : activeMethod === 'upload_file'
        ? 'file_upload'
        : 'paste_import',
      sourceLabel: `Phiên bản phụ v${nextVerNum} — ${incomingSourceTitle.slice(0, 30)} (${nowStr})`,
      savedAt: nowStr
    };
    const updatedVersions = [savedVer, ...versions.slice(0, 24)];

    let updatedDocMeta = linkedGoogleDoc;
    if (isFromGoogleDocs && linkedGoogleDoc) {
      updatedDocMeta = {
        ...linkedGoogleDoc,
        lastSyncedAt: nowStr,
        lastSyncedVersionCode: nextVerCode
      };
    }

    const savedOk = await persistCurrentStateNow({
      linkedGoogleDoc: updatedDocMeta,
      versions: updatedVersions
    });

    if (!savedOk) {
      setDocsSyncSuccessBanner(null);
      if (isFromGoogleDocs) {
        setDocsApiError(
          'Đã đọc nội dung từ Google Docs nhưng không thể lưu phiên bản phụ vào bộ nhớ. Chưa ghi nhận đồng bộ.'
        );
        setDocsApiErrorCode('STORAGE_ERROR');
      }
      setPendingDocsImportMeta(null);
      return;
    }

    setVersions(updatedVersions);
    setPasteDraftInput('');
    if (isFromGoogleDocs && updatedDocMeta) {
      setLinkedGoogleDoc(updatedDocMeta);
      await saveLinkedGoogleDocToStudentProfile(activeStudentUid, updatedDocMeta);
      setStudentProfileDocs(loadStudentLinkedGoogleDocsProfile(activeStudentUid));
      setDocsSyncSuccessBanner(
        `Đã đồng bộ và lưu thành công Phiên bản phụ ${nextVerCode} vào Lịch sử phiên bản lúc ${nowStr}.`
      );
    }
    setPendingDocsImportMeta(null);
  };

  // ==========================================
  // YÊU CẦU 4 & 7: NỘP BÀI CHÍNH THỨC (CÓ XÁC NHẬN, LƯU MÃ PHIÊN BẢN & THỜI ĐIỂM, KHÓA BẤT BIẾN, CHỐNG NỘP TRÙNG)
  // ==========================================
  const handleConfirmFinalSubmission = async () => {
    // Chống nộp trùng khi nhấn nhiều lần
    if (isSubmittingLockRef.current || isSubmittingFinal) return;
    if (!studentEssay.trim()) {
      setValidationWarning('Vui lòng nhập nội dung bài viết trước khi nộp chính thức.');
      return;
    }

    isSubmittingLockRef.current = true;
    setIsSubmittingFinal(true);
    setIsEvaluatingAI(true);
    setValidationWarning(null);

    const submittedAtDisplay = new Date().toLocaleString('vi-VN', {
      dateStyle: 'short',
      timeStyle: 'medium'
    });
    const submittedAtIso = new Date().toISOString();
    const submittedVerNum = currentVersionNumber;
    const submittedVerCode = formatVersionCode(submittedVerNum);
    const immutableContent = studentEssay;
    const immutableWordCount = immutableContent.trim().split(/\s+/).length;

    try {
      const maxScore = activeMaxScore;
      const result = await evaluateWritingEssayWithAI(
        activePromptText,
        immutableContent,
        activeType,
        maxScore,
        targetWordCount,
        {
          submissionVersion: submittedVerNum,
          answerGuideOrRubricNote: !isCustomPrompt
            ? `${currentSample.focusGuide}${activeRubricId ? ` [Mã Rubric: ${activeRubricId}]` : ''}`
            : '',
          existingApprovedFeedback: feedback || undefined,
          rubric: activeRubric
        }
      );

      // Tạo bản chụp bài nộp bất biến (Immutable Submitted Snapshot)
      const snapshot: SubmittedWritingSnapshot = {
        snapshotId: `snap-${activeStudentUid}-${activeTaskId}-v${submittedVerNum}-${Date.now()}`,
        versionNumber: submittedVerNum,
        versionCode: submittedVerCode,
        content: immutableContent,
        wordCount: immutableWordCount,
        submittedAt: submittedAtDisplay,
        submittedAtIso,
        studentUid: activeStudentUid,
        taskId: activeTaskId,
        promptTitle: activePromptTitle,
        isImmutable: true,
        feedback: result
      };

      const submittedHistoryVer: DraftVersion = {
        id: snapshot.snapshotId,
        versionNumber: submittedVerNum,
        versionCode: submittedVerCode,
        content: immutableContent,
        wordCount: immutableWordCount,
        source: 'final_submission',
        sourceLabel: `Bản nộp chính thức ${submittedVerCode} (v${submittedVerNum}) — Lúc ${submittedAtDisplay}`,
        savedAt: submittedAtDisplay,
        isSubmittedSnapshot: true,
        immutable: true
      };

      const nextVersions = [submittedHistoryVer, ...versions.slice(0, 24)];
      const nextSnapshots = [snapshot, ...submittedSnapshots];

      // Lưu bền vững bản đã nộp bất biến và khóa trình soạn thảo của phiên bản này
      const savedOk = await persistCurrentStateNow({
        currentContent: immutableContent,
        revisedContent: immutableContent,
        taskStatus: 'da_nop_chinh_thuc',
        currentVersionNumber: submittedVerNum,
        isEditorLockedAfterSubmit: true,
        versions: nextVersions,
        submittedSnapshots: nextSnapshots,
        latestFeedback: result
      });

      setFeedback(result);
      setRevisedEssay(immutableContent);
      setVersions(nextVersions);
      setSubmittedSnapshots(nextSnapshots);
      setTaskStatus('da_nop_chinh_thuc');
      setIsEditorLockedAfterSubmit(true);
      setIsSubmitConfirmOpen(false);

      const record: WritingSubmissionRecord = {
        id: `writing-sub-${activeStudentUid}-${activeTaskId}-v${submittedVerNum}`,
        promptTitle: `${activePromptTitle} [${submittedVerCode}]`,
        promptText: activePromptText,
        type: activeType,
        sectionType: activeSectionType,
        maxScore: activeMaxScore,
        rubricId: activeRubricId,
        originalText: immutableContent,
        wordCount: immutableWordCount,
        feedback: result,
        revisions: [],
        createdAt: submittedAtDisplay,
        submissionVersion: submittedVerNum,
        scoreStatus:
          typeof result.teacherConfirmedScore === 'number'
            ? 'teacher_approved'
            : result.evaluationSource === 'gemini_ai'
            ? 'ai_proposed'
            : 'rule_based_suggested'
      };

      onSaveSubmission(record);
      savePracticeRecordToFirestore('writing', record).catch(() => {});

      if (savedOk) {
        setSavedNotification(true);
        setTimeout(() => setSavedNotification(false), 3000);
      }
    } finally {
      isSubmittingLockRef.current = false;
      setIsSubmittingFinal(false);
      setIsEvaluatingAI(false);
    }
  };

  // YÊU CẦU 4: Sau khi đã nộp bản bất biến, muốn chỉnh sửa phải tạo Phiên bản mới (v{N+1}) theo quy tắc bài
  const handleStartNewEditableVersionAfterSubmit = async () => {
    const nextVerNum = currentVersionNumber + 1;
    const nowStr = new Date().toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    const newDraftVer: DraftVersion = {
      id: `ver-new-branch-${Date.now()}`,
      versionNumber: nextVerNum,
      versionCode: formatVersionCode(nextVerNum),
      content: studentEssay,
      wordCount,
      source: 'direct_edit',
      sourceLabel: `Khởi tạo Phiên bản chỉnh sửa mới v${nextVerNum} từ bản đã nộp v${currentVersionNumber} (${nowStr})`,
      savedAt: nowStr
    };
    const nextVersions = [newDraftVer, ...versions.slice(0, 24)];

    setCurrentVersionNumber(nextVerNum);
    setIsEditorLockedAfterSubmit(false);
    setTaskStatus('dang_soan_nhap');
    setVersions(nextVersions);

    await persistCurrentStateNow({
      currentVersionNumber: nextVerNum,
      isEditorLockedAfterSubmit: false,
      taskStatus: 'dang_soan_nhap',
      versions: nextVersions
    });
  };

  // Lưu Bản chỉnh sửa ở Khu vực Tự chỉnh sửa thành Phiên bản mới v{N+1}
  const handlePromoteRevisionToNewVersion = async () => {
    if (!revisedEssay.trim()) {
      setValidationWarning('Vui lòng nhập nội dung ở ô Bản viết đã chỉnh sửa trước khi tạo phiên bản mới.');
      return;
    }
    const nextVerNum = currentVersionNumber + 1;
    const nowStr = new Date().toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    const revWordCount = revisedEssay.trim().split(/\s+/).length;
    const newRevVersion: DraftVersion = {
      id: `ver-revision-${Date.now()}`,
      versionNumber: nextVerNum,
      versionCode: formatVersionCode(nextVerNum),
      content: revisedEssay,
      wordCount: revWordCount,
      source: 'manual_save',
      sourceLabel: `Phiên bản tự chỉnh sửa v${nextVerNum} (${nowStr})${
        reflectionNote.trim() ? ` — Ghi chú: ${reflectionNote.trim().slice(0, 40)}` : ''
      }`,
      savedAt: nowStr,
      notes: reflectionNote.trim()
    };

    const nextVersions = [newRevVersion, ...versions.slice(0, 24)];
    setStudentEssay(revisedEssay);
    setCurrentVersionNumber(nextVerNum);
    setIsEditorLockedAfterSubmit(false);
    setTaskStatus('da_luu_nhap');
    setVersions(nextVersions);

    const ok = await persistCurrentStateNow({
      currentContent: revisedEssay,
      revisedContent: revisedEssay,
      reflectionNote,
      currentVersionNumber: nextVerNum,
      isEditorLockedAfterSubmit: false,
      taskStatus: 'da_luu_nhap',
      versions: nextVersions
    });

    if (ok) {
      setSavedNotification(true);
      setTimeout(() => setSavedNotification(false), 2500);
    }
  };

  // Yêu cầu phản hồi sư phạm gợi mở trong lúc viết qua Gemini AI Server-Side
  const handleRequestFeedback = async () => {
    setValidationWarning(null);
    if (!studentEssay.trim()) {
      setValidationWarning('Bạn chưa nhập nội dung bài viết. Hãy dán hoặc tự viết bài làm trước khi yêu cầu phản hồi sư phạm.');
      return;
    }
    if (wordCount < 40) {
      setValidationWarning('Bài viết quá ngắn (dưới 40 từ). Vui lòng phát triển bài viết đầy đủ hơn để nhận được phản hồi chính xác.');
      return;
    }

    setIsEvaluatingAI(true);
    try {
      const maxScore = activeMaxScore;
      const result = await evaluateWritingEssayWithAI(
        activePromptText,
        studentEssay,
        activeType,
        maxScore,
        targetWordCount,
        {
          submissionVersion: currentVersionNumber,
          answerGuideOrRubricNote: !isCustomPrompt
            ? `${currentSample.focusGuide}${activeRubricId ? ` [Mã Rubric: ${activeRubricId}]` : ''}`
            : '',
          existingApprovedFeedback: feedback || undefined,
          rubric: activeRubric
        }
      );
      setFeedback(result);
      setRevisedEssay(studentEssay);
      await persistCurrentStateNow({
        latestFeedback: result,
        revisedContent: studentEssay
      });
    } finally {
      setIsEvaluatingAI(false);
    }
  };

  const latestSubmittedSnapshot = submittedSnapshots[0] || null;

  return (
    <div className="space-y-6 pb-16">
      {/* Thanh Chế độ Tập trung (Focus Mode) & Đồng hồ đếm ngược */}
      <FocusModeBar
        isFocusMode={effectiveFocusMode}
        onToggleFocusMode={handleToggleFocus}
        modeTitle={`Viết nghị luận: ${activePromptTitle}`}
        taskSubtitle={`${
          activeSectionType === 'paragraph_200w' ? 'Đoạn văn ~200 chữ (2,0đ)' : 'Bài văn ~600 chữ (4,0đ)'
        } · ${activeType === 'nghi_luan_xa_hoi' ? '2.1. Nghị luận xã hội' : '2.2. Nghị luận văn học'}`}
        defaultMinutes={activeSectionType === 'paragraph_200w' ? 30 : 60}
        presetMinutes={[15, 25, 30, 45, 60]}
        extraStatusBadge={
          <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 border border-white/15 text-[11px] font-mono text-emerald-200 shrink-0">
            <span>{wordCount} từ</span>
            <span>·</span>
            <span>{formatVersionCode(currentVersionNumber)}</span>
          </span>
        }
      />

      {/* Header khu vực (Ẩn khi bật Focus Mode để tránh xao nhãng) */}
      {!effectiveFocusMode && (
        <div className="space-y-2 border-b border-stone-200 pb-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-xs font-semibold mb-1 border border-emerald-200">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                <span>
                  Mô-đun Soạn thảo & Lưu trữ bền vững theo UID ({currentUser ? `${currentUser.fullName} - ${currentUser.username}` : `Thiết bị cục bộ: ${activeStudentUid}`})
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-serif-literary font-bold text-[#0F172A]">
                Huấn luyện Viết nghị luận & Quản lý Phiên bản
              </h1>
              <p className="text-sm text-stone-600 mt-1">
                Tự động lưu bản nháp, lịch sử phiên bản và liên kết Google Docs theo từng học sinh và từng mã nhiệm vụ ({activeTaskId}).
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowDiagnostics((v) => !v)}
                className="px-2.5 py-1.5 text-[11px] font-semibold rounded-md border border-stone-300 bg-white text-stone-700 hover:bg-stone-100 cursor-pointer"
                title="Bật bảng kiểm thử mất mạng, hết dung lượng lưu trữ và kiểm tra khóa phiên bản"
              >
                {showDiagnostics ? 'Ẩn hộp kiểm thử lưu trữ' : 'Kiểm thử độ bền lưu trữ'}
              </button>
              <span className="text-xs text-stone-500 font-medium">Chọn dạng đề:</span>
              <button
                onClick={() => handleSelectSample(SAMPLE_WRITING_PROMPTS[0].id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  !isCustomPrompt ? 'bg-[#0F172A] text-white' : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
                }`}
              >
                Đề thi thử THPT
              </button>
              <button
                onClick={handleSwitchCustom}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  isCustomPrompt ? 'bg-[#0F172A] text-white' : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
                }`}
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Tự nhập đề riêng</span>
              </button>
            </div>
          </div>

          {/* HỘP KIỂM THỬ ĐỘ BỀN DỮ LIỆU (Dành cho Giáo viên kiểm tra các tình huống đóng/mở, hết dung lượng, mất mạng) */}
          {showDiagnostics && (
            <div className="mt-3 p-4 rounded-xl bg-stone-100 border border-stone-300 text-xs space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-bold text-stone-900 flex items-center gap-1.5">
                  <HardDrive className="w-4 h-4 text-stone-700" />
                  <span>Bảng Kiểm thử Độ bền Lưu trữ (UID: {activeStudentUid} · Mã nhiệm vụ: {activeTaskId})</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const next = !quotaSimulated;
                      setQuotaSimulated(next);
                      setSimulateQuotaExceeded(next);
                      if (next) {
                        persistCurrentStateNow();
                      } else {
                        setStorageErrorMessage(null);
                        persistCurrentStateNow();
                      }
                    }}
                    className={`px-3 py-1 rounded-lg font-bold cursor-pointer border ${
                      quotaSimulated
                        ? 'bg-red-700 text-white border-red-800'
                        : 'bg-white text-stone-800 border-stone-300 hover:bg-stone-50'
                    }`}
                  >
                    {quotaSimulated ? 'Đang giả lập: Đầy bộ nhớ (QuotaExceededError) — Nhấn để tắt' : 'Giả lập lỗi đầy bộ nhớ (QuotaExceeded)'}
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-stone-600">
                • Bạn có thể gõ nội dung, tải lại trang (F5) để kiểm tra tự động phục hồi đúng học sinh & nhiệm vụ; hoặc bật nút "Giả lập lỗi đầy bộ nhớ" để kiểm tra hệ thống chặn báo lưu thành công giả và hiển thị cảnh báo lỗi thật.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Thông báo tự động phục hồi bản nháp đúng học sinh & nhiệm vụ */}
      {restoredBannerInfo && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{restoredBannerInfo}</span>
          </div>
          <button
            type="button"
            onClick={() => setRestoredBannerInfo(null)}
            className="text-emerald-800 hover:underline font-semibold text-[11px] cursor-pointer shrink-0"
          >
            Đã hiểu
          </button>
        </div>
      )}

      {/* Danh sách đề ngân hàng đã được Giáo viên xuất bản (Ẩn khi bật Focus Mode để tránh xao nhãng) */}
      {!effectiveFocusMode && !isCustomPrompt && (
        <div className="flex flex-wrap items-center gap-2 p-3 bg-stone-100/70 rounded-xl border border-stone-200 text-xs">
          <span className="font-semibold text-stone-700 mr-2">Chọn đề ngân hàng GV xuất bản (Mỗi đề có bản nháp & Rubric riêng):</span>
          {PUBLISHED_WRITING_PROMPTS.map((p, idx) => {
            const cls = classifyWritingPromptItem(p);
            return (
              <button
                key={p.id}
                onClick={() => handleSelectSample(p.id)}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all text-xs cursor-pointer ${
                  selectedPromptId === p.id
                    ? 'bg-white text-[#0F172A] shadow-xs border border-stone-300 font-bold'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/50'
                }`}
              >
                Đề {idx + 1}: {p.title} ({cls.sectionType === 'paragraph_200w' ? '200 chữ' : '600 chữ'} · {cls.writingArgumentTypeLabel})
              </button>
            );
          })}
        </div>
      )}

      {/* Khung làm việc 2 cột */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* CỘT TRÁI: ĐỀ BÀI, HƯỚNG DẪN & BẢN ĐÃ NỘP BẤT BIẾN (5/12 cột) */}
        <div className="lg:col-span-5 space-y-4">
          <div
            className={`p-5 sm:p-6 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-4 sticky ${
              effectiveFocusMode ? 'top-24' : 'top-20'
            }`}
          >
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-stone-700">
                Đề bài nghị luận ({activeTaskId})
              </span>
              <span className="text-xs font-medium text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded">
                {activeSectionType === 'paragraph_200w' ? 'Đoạn 200 chữ (2,0đ)' : 'Bài văn 600 chữ (4,0đ)'} ·{' '}
                {activeType === 'nghi_luan_xa_hoi' ? '2.1. NLXH' : '2.2. NLVH'}
              </span>
            </div>

            {isCustomPrompt ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Thể loại đề:
                  </label>
                  <select
                    value={customType}
                    onChange={(e) => setCustomType(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-600"
                  >
                    <option value="nghi_luan_xa_hoi">Nghị luận xã hội (Đoạn 200 chữ - 2.0đ)</option>
                    <option value="nghi_luan_van_hoc">Nghị luận văn học (Bài văn - 4.0đ)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Tên chủ đề / đề bài:
                  </label>
                  <input
                    type="text"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="Ví dụ: Về lòng kiên trì của giới trẻ..."
                    className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Nội dung yêu cầu của đề:
                  </label>
                  <textarea
                    rows={4}
                    value={customPromptText}
                    onChange={(e) => setCustomPromptText(e.target.value)}
                    placeholder="Nhập yêu cầu đề bài chi tiết..."
                    className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-600"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <h3 className="text-base font-serif-literary font-bold text-[#0F172A] leading-snug">
                  {currentSample.title}
                </h3>
                <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200 text-sm font-medium text-stone-800 leading-relaxed">
                  <GentleTypewriterText
                    text={currentSample.promptText}
                    triggerKey={`prompt_text_${currentSample.id}`}
                    autoStart={true}
                    intervalMs={16}
                    maxDurationMs={1800}
                    streamingLabel="AI đang hiển thị trực tiếp yêu cầu đề bài..."
                    className="text-sm font-medium text-stone-800 leading-relaxed"
                  />
                </div>

                <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200/80 text-xs text-blue-950 space-y-1.5">
                  <div className="font-semibold flex items-center gap-1.5 text-blue-900">
                    <Compass className="w-4 h-4 text-blue-700" />
                    <span>Định hướng trọng tâm & Gợi ý viết trực tiếp:</span>
                  </div>
                  <GentleTypewriterText
                    text={currentSample.focusGuide}
                    triggerKey={`prompt_guide_${currentSample.id}`}
                    autoStart={true}
                    intervalMs={16}
                    maxDurationMs={2400}
                    streamingLabel="AI đang gõ gợi ý triển khai dàn ý & luận điểm..."
                    className="leading-relaxed text-blue-900"
                  />
                </div>

                <div className="text-xs text-stone-600 space-y-1 pt-1">
                  <span className="font-semibold text-stone-700 block">
                    Quy chuẩn phòng thi THPT {activeRubricId ? `· Mã Rubric: ${activeRubricId}` : ''}:
                  </span>
                  <p>• {currentSample.wordLimit}</p>
                  {activeSectionType === 'paragraph_200w' && (
                    <p className="text-amber-800 font-medium">
                      • Tuyệt đối KHÔNG xuống dòng thành nhiều đoạn (chỉ viết 1 đoạn duy nhất).
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* DANH SÁCH BẢN ĐÃ NỘP BẤT BIẾN (IMMUTABLE SNAPSHOTS) */}
            {submittedSnapshots.length > 0 && (
              <div className="pt-3 border-t border-stone-200 space-y-2">
                <div className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Các phiên bản đã nộp chính thức ({submittedSnapshots.length} bản bất biến):</span>
                </div>
                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                  {submittedSnapshots.map((snap) => (
                    <div
                      key={snap.snapshotId}
                      className="p-2.5 rounded-xl bg-emerald-50/80 border border-emerald-200 text-[11px] space-y-0.5"
                    >
                      <div className="flex items-center justify-between font-bold text-emerald-950">
                        <span>
                          [{snap.versionCode}] Phiên bản v{snap.versionNumber}
                        </span>
                        <span className="font-mono">{snap.wordCount} từ</span>
                      </div>
                      <div className="text-stone-600 flex items-center justify-between">
                        <span>Nộp lúc: {snap.submittedAt}</span>
                        <span className="text-emerald-800 font-semibold">🔒 Bất biến</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* CỘT PHẢI: SOẠN THẢO LINH HOẠT & BẢN NHÁP (7/12 cột) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="p-5 sm:p-6 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-5">
            {/* THANH TRẠNG THÁI, MÃ PHIÊN BẢN & PHẠM VI LƯU TRỮ MINH BẠCH */}
            <div className="space-y-3 border-b border-stone-100 pb-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-stone-700">
                    Phiên bản hiện tại:
                  </span>
                  <span className="px-2.5 py-0.5 rounded-md bg-[#0F172A] text-white font-mono text-xs font-bold">
                    v{currentVersionNumber} ({formatVersionCode(currentVersionNumber)})
                  </span>
                  {/* Trạng thái nhiệm vụ */}
                  <span
                    className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                      isEditorLockedAfterSubmit
                        ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                        : autoSaveStatus === 'error'
                        ? 'bg-red-100 text-red-900 border border-red-300'
                        : taskStatus === 'da_luu_nhap'
                        ? 'bg-blue-50 text-blue-900 border border-blue-200'
                        : 'bg-stone-100 text-stone-700'
                    }`}
                  >
                    {isEditorLockedAfterSubmit
                      ? `🔒 Đã nộp chính thức (${formatVersionCode(currentVersionNumber)} - Khóa bất biến)`
                      : autoSaveStatus === 'error'
                      ? '⚠ Lỗi lưu bản nháp (Chưa lưu được)'
                      : autoSaveStatus === 'saving'
                      ? 'Đang lưu bản nháp...'
                      : taskStatus === 'da_luu_nhap'
                      ? '● Đã lưu bản nháp'
                      : taskStatus === 'da_nhap_tu_ngoai'
                      ? '● Đã nhập thành phiên bản mới'
                      : 'Đang soạn thảo'}
                  </span>
                </div>

                {/* Kết nối mạng & Phạm vi lưu (Ghi rõ "Chỉ lưu trên thiết bị này" nếu chưa có DB/Server) */}
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-600">
                  {isOnline ? (
                    <span className="flex items-center gap-1 text-emerald-700 font-medium" title="Đang có kết nối mạng">
                      <Wifi className="w-3.5 h-3.5" /> Trực tuyến
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-red-600 font-bold" title="Mất kết nối mạng">
                      <WifiOff className="w-3.5 h-3.5" /> Mất mạng
                    </span>
                  )}
                  <span className="text-stone-300">|</span>
                  <span
                    className={`font-medium ${
                      autoSaveStatus === 'error'
                        ? 'text-red-700 font-bold'
                        : storageScopeLabel.includes('Máy chủ')
                        ? 'text-emerald-800'
                        : 'text-amber-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200'
                    }`}
                  >
                    {autoSaveStatus === 'error'
                      ? 'Chưa lưu được dữ liệu!'
                      : storageScopeLabel}
                  </span>
                </div>
              </div>

              {/* Cảnh báo lỗi lưu trữ thật (QuotaExceededError / Storage disabled) */}
              {storageErrorMessage && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-300 text-xs text-red-950 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="font-bold">Cảnh báo lỗi lưu trữ dữ liệu:</div>
                    <p>{storageErrorMessage}</p>
                  </div>
                </div>
              )}

              {/* Hộp thông báo Bản đã nộp bất biến & Nút tạo phiên bản mới để sửa */}
              {isEditorLockedAfterSubmit && (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-xs text-emerald-950 flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1 max-w-xl">
                    <div className="font-bold flex items-center gap-1.5 text-emerald-900">
                      <Lock className="w-4 h-4 text-emerald-700" />
                      <span>
                        Phiên bản {formatVersionCode(currentVersionNumber)} (v{currentVersionNumber}) đã được nộp chính thức và khóa bất biến
                        {latestSubmittedSnapshot ? ` lúc ${latestSubmittedSnapshot.submittedAt}` : ''}.
                      </span>
                    </div>
                    <p className="text-stone-700 leading-relaxed">
                      Theo quy tắc bảo toàn bài nộp, bản đã gửi chấm không thể sửa đè trực tiếp. Để chỉnh sửa hoặc làm lại, hãy khởi tạo <strong>Phiên bản mới v{currentVersionNumber + 1}</strong>.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleStartNewEditableVersionAfterSubmit}
                    className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs shrink-0"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Tạo Phiên bản mới (v{currentVersionNumber + 1}) để sửa</span>
                  </button>
                </div>
              )}

              {/* 4 Tabs lựa chọn cách soạn bài */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-stone-100 rounded-xl text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setActiveMethod('direct')}
                  className={`py-2 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    activeMethod === 'direct'
                      ? 'bg-white text-[#0F172A] font-bold shadow-xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <PenTool className="w-3.5 h-3.5" />
                  <span className="truncate">Soạn trực tiếp</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveMethod('google_docs')}
                  className={`py-2 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    activeMethod === 'google_docs'
                      ? 'bg-white text-blue-900 font-bold shadow-xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 text-blue-600" />
                  <span className="truncate">Google Docs</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveMethod('upload_file')}
                  className={`py-2 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    activeMethod === 'upload_file'
                      ? 'bg-white text-[#0F172A] font-bold shadow-xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span className="truncate">Tải từ tệp</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveMethod('paste_content')}
                  className={`py-2 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    activeMethod === 'paste_content'
                      ? 'bg-white text-[#0F172A] font-bold shadow-xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <ClipboardPaste className="w-3.5 h-3.5" />
                  <span className="truncate">Dán nội dung</span>
                </button>
              </div>
            </div>

            {/* KHỐI 1: SOẠN TRÊN GOOGLE DOCS THẬT (PHẠM VI TỐI THIỂU drive.file, LƯU HỒ SƠ ĐÚNG HỌC SINH, MỞ LẠI KHI TẢI LẠI & XEM TRƯỚC TRƯỚC KHI ĐỒNG BỘ) */}
            {activeMethod === 'google_docs' && (
              <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 text-xs text-blue-950 space-y-3.5 animate-fadeIn">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-200/70 pb-2.5">
                  <div className="flex items-center gap-2 font-bold text-blue-900">
                    <FileText className="w-4 h-4 text-blue-700" />
                    <span>Google Docs cá nhân — Gắn với Hồ sơ Học sinh & Nhiệm vụ ({activeTaskId})</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-900 border border-blue-300 font-mono text-[10px] font-semibold">
                    Phạm vi OAuth tối thiểu: {SCOPES[0].replace('https://www.googleapis.com/auth/', '')} (Riêng tư)
                  </span>
                </div>

                {/* Trạng thái tài khoản Google OAuth hiện tại */}
                <div className="p-2.5 rounded-lg bg-white/90 border border-blue-200 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[11px] text-stone-700 space-y-0.5">
                    {googleConnectedEmail && hasValidGoogleToken ? (
                      <div className="flex items-center gap-1.5 text-emerald-900 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>
                          Đã kết nối Google OAuth: <strong>{googleConnectedEmail}</strong> (Có quyền tạo & đọc tệp ứng dụng)
                        </span>
                      </div>
                    ) : googleConnectedEmail && !hasValidGoogleToken ? (
                      <div className="flex items-center gap-1.5 text-amber-900 font-semibold">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>
                          Tài khoản <strong>{googleConnectedEmail}</strong> cần cấp lại mã truy cập OAuth (Token trong bộ nhớ đã hết hạn sau khi tải lại trang).
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-stone-700">
                        <ShieldCheck className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                        <span>
                          Chưa kết nối phiên Google OAuth. Chỉ yêu cầu quyền tối thiểu <code>drive.file</code> (không truy cập toàn bộ Drive, không yêu cầu chia sẻ công khai).
                        </span>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleConnectOrRefreshGoogleOAuth}
                    disabled={isConnectingGoogleOAuth}
                    className="px-3 py-1.5 bg-blue-800 hover:bg-blue-900 text-white font-bold rounded-lg text-[11px] transition-colors cursor-pointer disabled:opacity-60 shrink-0"
                  >
                    {isConnectingGoogleOAuth
                      ? 'Đang xác thực Google...'
                      : hasValidGoogleToken
                      ? 'Đổi tài khoản / Làm mới OAuth'
                      : 'Kết nối / Cấp lại quyền Google Docs'}
                  </button>
                </div>

                {/* Thông báo lỗi rõ ràng khi token hết hạn (401), thiếu quyền (403), sai chủ sở hữu hoặc lỗi API */}
                {docsApiError && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-300 text-xs text-red-950 space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <div className="font-bold text-red-900">
                          {docsApiErrorCode === 'TOKEN_EXPIRED'
                            ? 'Phiên Google OAuth đã hết hạn (401):'
                            : docsApiErrorCode === 'INSUFFICIENT_PERMISSION'
                            ? 'Thiếu quyền OAuth drive.file (403):'
                            : docsApiErrorCode === 'OWNER_MISMATCH'
                            ? 'Không khớp tài khoản Google chủ sở hữu:'
                            : docsApiErrorCode === 'STORAGE_ERROR'
                            ? 'Lỗi lưu phiên bản (Chưa đồng bộ):'
                            : 'Thông báo lỗi Google Docs API:'}
                        </div>
                        <p className="leading-relaxed">{docsApiError}</p>
                      </div>
                    </div>
                    {(docsApiErrorCode === 'TOKEN_EXPIRED' ||
                      docsApiErrorCode === 'NOT_AUTHENTICATED' ||
                      docsApiErrorCode === 'INSUFFICIENT_PERMISSION' ||
                      docsApiErrorCode === 'OWNER_MISMATCH') && (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={handleConnectOrRefreshGoogleOAuth}
                          disabled={isConnectingGoogleOAuth}
                          className="px-3 py-1 bg-red-800 hover:bg-red-900 text-white font-bold rounded-md text-[11px] cursor-pointer"
                        >
                          Đăng nhập / Cấp lại quyền Google ngay
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Thông báo ĐÃ ĐỒNG BỘ — chỉ hiển thị sau khi ĐỌC THÀNH CÔNG nội dung VÀ LƯU PHIÊN BẢN MỚI THÀNH CÔNG */}
                {docsSyncSuccessBanner && !docsApiError && (
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-300 text-xs text-emerald-950 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <div className="font-bold text-emerald-900">Xác nhận đã đọc & lưu phiên bản thành công:</div>
                      <p>{docsSyncSuccessBanner}</p>
                    </div>
                  </div>
                )}

                {linkedGoogleDoc ? (
                  <div className="p-3.5 bg-white rounded-xl border border-blue-200 space-y-3 shadow-2xs">
                    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-stone-100 pb-2.5">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold">
                            Đã liên kết trong hồ sơ học sinh
                          </span>
                          <strong className="text-stone-900 truncate text-xs sm:text-sm">
                            {linkedGoogleDoc.name}
                          </strong>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-stone-600 pt-1">
                          <div>
                            • <strong>Mã tài liệu (docId):</strong>{' '}
                            <code className="bg-stone-100 px-1 py-0.5 rounded text-stone-800">
                              {linkedGoogleDoc.docId || linkedGoogleDoc.id}
                            </code>
                          </div>
                          <div>
                            • <strong>Mã nhiệm vụ (taskId):</strong>{' '}
                            <code className="bg-stone-100 px-1 py-0.5 rounded text-stone-800">
                              {linkedGoogleDoc.taskId || activeTaskId}
                            </code>
                          </div>
                          <div>
                            • <strong>Tài khoản chủ sở hữu:</strong>{' '}
                            <span className="font-semibold text-blue-900">
                              {linkedGoogleDoc.ownerAccount || 'Tài khoản Google của học sinh'}
                            </span>
                          </div>
                          <div>
                            • <strong>Hồ sơ Học sinh (UID):</strong>{' '}
                            <code className="bg-stone-100 px-1 py-0.5 rounded text-stone-800">
                              {linkedGoogleDoc.studentUid || activeStudentUid}
                            </code>
                          </div>
                        </div>
                        {linkedGoogleDoc.lastSyncedAt && (
                          <div className="text-[11px] text-emerald-800 font-medium pt-0.5">
                            ✓ Lần đồng bộ & lưu phiên bản thành công gần nhất:{' '}
                            <strong>{linkedGoogleDoc.lastSyncedVersionCode || 'Phiên bản mới'}</strong> lúc{' '}
                            {linkedGoogleDoc.lastSyncedAt}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <a
                          href={linkedGoogleDoc.docUrl || linkedGoogleDoc.url}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1.5 bg-blue-50 text-blue-900 border border-blue-300 rounded-lg font-semibold hover:bg-blue-100 flex items-center gap-1.5 cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Mở lại tài liệu đã liên kết</span>
                        </a>
                        <button
                          type="button"
                          onClick={handleSyncLatestFromDocs}
                          disabled={isSyncingDoc}
                          className="px-3.5 py-1.5 bg-[#0F172A] text-white rounded-lg font-bold hover:bg-[#1E293B] flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                        >
                          <Cloud className={`w-3.5 h-3.5 ${isSyncingDoc ? 'animate-spin' : ''}`} />
                          <span>
                            {isSyncingDoc
                              ? 'Đang đọc từ Google Docs...'
                              : 'Nhập nội dung mới nhất từ Docs (Xem trước)'}
                          </span>
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-500">
                      <span>
                        Khi nhấn <strong>"Nhập nội dung mới nhất từ Docs"</strong>, hệ thống luôn mở hộp thoại xem trước và yêu cầu xác nhận trước khi thay thế bản nháp.
                      </span>
                      <button
                        type="button"
                        onClick={handleCreateGoogleDoc}
                        disabled={isCreatingDoc}
                        className="text-blue-800 hover:underline font-semibold cursor-pointer disabled:opacity-50"
                      >
                        {isCreatingDoc ? 'Đang tạo...' : '+ Tạo tài liệu Google Docs mới cho nhiệm vụ này'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5 pt-1">
                    <p className="leading-relaxed text-stone-700">
                      Tạo một tài liệu Google Docs riêng tư trên Google Drive của chính bạn cho nhiệm vụ <strong>{activeTaskId}</strong>. Hệ thống sẽ lưu <code>docId</code>, liên kết, tài khoản chủ sở hữu và mã nhiệm vụ vào đúng hồ sơ học sinh để bạn mở lại bất cứ lúc nào.
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={handleCreateGoogleDoc}
                        disabled={isCreatingDoc}
                        className="px-4 py-2 bg-blue-800 hover:bg-blue-900 text-white font-bold rounded-lg transition-colors flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-60"
                      >
                        <FileText className="w-4 h-4" />
                        <span>
                          {isCreatingDoc
                            ? 'Đang tạo tài liệu trên Google Docs...'
                            : 'Tạo tài liệu Google Docs cho nhiệm vụ này'}
                        </span>
                      </button>
                      <span className="text-[11px] text-stone-600">
                        Không yêu cầu chia sẻ công khai · Lưu vào hồ sơ UID [{activeStudentUid}]
                      </span>
                    </div>
                  </div>
                )}

                {/* Danh sách các tài liệu Google Docs đã liên kết trong hồ sơ của học sinh này */}
                {Object.keys(studentProfileDocs).length > 1 && (
                  <div className="pt-2 border-t border-blue-200/60 space-y-1.5">
                    <div className="text-[11px] font-bold text-blue-950">
                      Tài liệu Google Docs đã lưu trong hồ sơ học sinh [{activeStudentUid}] ({Object.keys(studentProfileDocs).length} nhiệm vụ):
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {Object.values(studentProfileDocs).map((docItem) => (
                        <div
                          key={`${docItem.taskId}-${docItem.docId}`}
                          className={`p-2 rounded-lg border text-[11px] flex items-center justify-between gap-2 ${
                            docItem.taskId === activeTaskId
                              ? 'bg-blue-100/70 border-blue-300 font-semibold'
                              : 'bg-white/80 border-stone-200'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="truncate text-stone-900">{docItem.name}</div>
                            <div className="text-[10px] text-stone-500 truncate">
                              Nhiệm vụ: {docItem.taskId} · Chủ sở hữu: {docItem.ownerAccount}
                            </div>
                          </div>
                          <a
                            href={docItem.docUrl || docItem.url}
                            target="_blank"
                            rel="noreferrer"
                            className="px-2 py-1 bg-white border border-blue-200 rounded text-blue-800 hover:bg-blue-50 shrink-0 font-semibold"
                          >
                            Mở lại
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* KHỐI 2: TẢI BÀI TỪ THIẾT BỊ (.DOCX, .TXT) */}
            {activeMethod === 'upload_file' && (
              <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-800 space-y-3 animate-fadeIn">
                <div className="flex items-center gap-2 font-bold text-stone-900">
                  <Upload className="w-4 h-4 text-emerald-700" />
                  <span>Tải tệp bài làm (.docx, .txt) — Xem trước & Tạo phiên bản mới:</span>
                </div>
                <p className="text-stone-600 leading-relaxed">
                  Khi tải tệp lên, hệ thống luôn yêu cầu bạn <strong>xác nhận trước khi ghi đè</strong> và tự động tạo phiên bản mới để bảo vệ bản nháp hiện tại.
                </p>

                <div className="flex items-center gap-3">
                  <label className="px-4 py-2 bg-white hover:bg-stone-100 text-stone-800 border border-stone-300 rounded-lg font-bold transition-colors flex items-center gap-2 cursor-pointer shadow-2xs">
                    <Upload className="w-4 h-4 text-emerald-700" />
                    <span>{isParsingFile ? 'Đang đọc tệp tin...' : 'Chọn tệp .docx hoặc .txt'}</span>
                    <input
                      type="file"
                      accept=".docx,.txt"
                      onChange={handleFileUpload}
                      className="hidden"
                      disabled={isParsingFile}
                    />
                  </label>
                  <span className="text-[11px] text-stone-500">Hỗ trợ tối đa 10MB</span>
                </div>

                {fileParsingError && (
                  <div className="p-2.5 bg-red-50 border border-red-200 text-xs text-red-800 rounded-lg flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                    <span>{fileParsingError}</span>
                  </div>
                )}
              </div>
            )}

            {/* KHỐI 3: DÁN NỘI DUNG TỪ ỨNG DỤNG KHÁC */}
            {activeMethod === 'paste_content' && (
              <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-800 space-y-3 animate-fadeIn">
                <div className="flex items-center gap-2 font-bold text-stone-900">
                  <ClipboardPaste className="w-4 h-4 text-emerald-700" />
                  <span>Dán nội dung từ ứng dụng ngoài (Yêu cầu xác nhận & Tạo phiên bản mới):</span>
                </div>
                <textarea
                  rows={4}
                  value={pasteDraftInput}
                  onChange={(e) => setPasteDraftInput(e.target.value)}
                  placeholder="Dán nội dung bài viết bạn đã soạn thảo ở ứng dụng khác vào đây..."
                  className="w-full p-3 text-xs bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-700 leading-relaxed font-serif-literary"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleReviewPastedContent}
                    className="px-4 py-1.5 bg-emerald-800 hover:bg-emerald-900 text-white font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Xem trước & Xác nhận tạo phiên bản mới</span>
                  </button>
                </div>
              </div>
            )}

            {/* KHU VỰC SOẠN THẢO CHÍNH CỦA VĂNAI 12 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-stone-600">
                <span className="font-semibold text-stone-800 flex items-center gap-1.5">
                  <PenTool className="w-3.5 h-3.5 text-stone-500" />
                  <span>
                    Văn bản bài làm — Phiên bản v{currentVersionNumber} ({formatVersionCode(currentVersionNumber)}):
                  </span>
                </span>
                <div className="flex items-center gap-3 tabular-nums">
                  <span
                    className={`font-bold ${
                      activeType === 'nghi_luan_xa_hoi' && (wordCount < 160 || wordCount > 260) && wordCount > 0
                        ? 'text-amber-800'
                        : 'text-stone-800'
                    }`}
                  >
                    {wordCount} / {targetWordCount} từ
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className={activeType === 'nghi_luan_xa_hoi' && paragraphCount > 1 ? 'text-red-700 font-bold' : ''}>
                    {paragraphCount} đoạn
                  </span>
                </div>
              </div>

              <textarea
                rows={13}
                value={studentEssay}
                readOnly={isEditorLockedAfterSubmit}
                disabled={isEditorLockedAfterSubmit}
                onPaste={handleTextareaPaste}
                onChange={(e) => {
                  if (isEditorLockedAfterSubmit) return;
                  setStudentEssay(e.target.value);
                }}
                onBlur={() => {
                  if (!isEditorLockedAfterSubmit && studentEssay.trim()) {
                    persistCurrentStateNow();
                  }
                }}
                placeholder="Bắt đầu soạn thảo bài văn hoặc hoàn thiện nội dung đã nhập vào đây..."
                className={`w-full p-4 text-sm font-serif-literary border rounded-xl focus:outline-none leading-relaxed ${
                  isEditorLockedAfterSubmit
                    ? 'bg-emerald-50/40 border-emerald-300 text-stone-700 cursor-not-allowed'
                    : 'bg-stone-50/60 border-stone-300 focus:ring-2 focus:ring-[#0F172A] focus:border-transparent'
                }`}
              />

              {/* Cảnh báo quy cách 200 chữ */}
              {activeType === 'nghi_luan_xa_hoi' && paragraphCount > 1 && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>Cảnh báo thể thức:</strong> Đề thi yêu cầu viết ĐOẠN VĂN (~200 chữ), bạn đang ngắt thành {paragraphCount} đoạn. Quy chế chấm thi THPT sẽ trừ 0.25 điểm hình thức đoạn. Hãy gộp thành 1 đoạn duy nhất.
                  </span>
                </div>
              )}

              {/* THANH CÔNG CỤ: LƯU BẢN NHÁP - LỊCH SỬ PHIÊN BẢN - NỘP BÀI CHÍNH THỨC */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-stone-100">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Nút Lịch sử phiên bản */}
                  <button
                    type="button"
                    onClick={() => setIsHistoryModalOpen(true)}
                    className="px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-100 border border-stone-300 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Xem lịch sử các phiên bản và bản đã nộp bất biến"
                  >
                    <History className="w-3.5 h-3.5 text-stone-500" />
                    <span>Lịch sử phiên bản ({versions.length})</span>
                  </button>

                  {/* Nút Lưu bản nháp thủ công */}
                  {!isEditorLockedAfterSubmit && (
                    <button
                      type="button"
                      onClick={handleManualSaveDraft}
                      className="px-3 py-1.5 text-xs font-semibold text-stone-800 hover:bg-stone-100 border border-stone-300 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5 text-stone-600" />
                      <span>
                        {savedNotification && autoSaveStatus !== 'error'
                          ? 'Đã lưu bền vững!'
                          : `Lưu nháp v${currentVersionNumber}`}
                      </span>
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Nút Yêu cầu phản hồi sư phạm AI (Formative) */}
                  <button
                    type="button"
                    onClick={handleRequestFeedback}
                    disabled={isEvaluatingAI}
                    className="px-3.5 py-1.5 text-xs font-semibold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    title="Góp ý sư phạm trong quá trình viết mà không khóa phiên bản"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
                    <span>{isEvaluatingAI ? 'Đang phân tích...' : 'Góp ý thử sức AI'}</span>
                  </button>

                  {/* Nút Nộp bài chính thức (Summative) hoặc Tạo phiên bản mới nếu bản hiện tại đã nộp */}
                  {isEditorLockedAfterSubmit ? (
                    <button
                      type="button"
                      onClick={handleStartNewEditableVersionAfterSubmit}
                      className="px-4 py-2 text-xs font-bold text-white bg-blue-800 hover:bg-blue-900 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      <span>Tạo Phiên bản v{currentVersionNumber + 1} để sửa / nộp lại</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isSubmittingFinal || isEvaluatingAI}
                      onClick={() => {
                        if (!studentEssay.trim()) {
                          setValidationWarning('Vui lòng soạn bài trước khi nộp chính thức.');
                          return;
                        }
                        setIsSubmitConfirmOpen(true);
                      }}
                      className="px-4 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Nộp bài chính thức (v{currentVersionNumber})</span>
                    </button>
                  )}
                </div>
              </div>

              {validationWarning && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <span>{validationWarning}</span>
                </div>
              )}
            </div>
          </div>

          {/* KHU VỰC PHẢN HỒI THEO RUBRIC BỘ GD&ĐT */}
          {feedback && (
            <div className="p-5 sm:p-6 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-3">
                <div className="flex items-center gap-2 text-[#0F172A]">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <h3 className="text-base font-serif-literary font-bold">
                    {taskStatus === 'da_nop_chinh_thuc'
                      ? `Kết quả thẩm định theo tiêu chí Rubric (Bản nộp ${formatVersionCode(currentVersionNumber)})`
                      : `Phản hồi gợi mở theo tiêu chí Rubric (Bản nháp v${currentVersionNumber})`}
                  </h3>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                      feedback.evaluationSource === 'gemini_ai'
                        ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                        : 'bg-amber-100 text-amber-950 border-amber-300'
                    }`}
                  >
                    {feedback.evaluationSourceLabel ||
                      (feedback.evaluationSource === 'gemini_ai'
                        ? 'Chấm sơ bộ bằng Gemini AI (Chờ giáo viên duyệt)'
                        : 'Gợi ý theo quy tắc — chưa phải chấm AI')}
                  </span>
                  <span className="text-xs text-stone-500">Lúc {feedback.evaluatedAt}</span>
                </div>
              </div>

              {feedback.apiWarningMessage && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-950 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-bold">Lưu ý trạng thái chấm: </strong>
                    <span>{feedback.apiWarningMessage}</span>
                  </div>
                </div>
              )}

              {/* Nhận xét tổng quan & Độ chắc chắn */}
              <div className="p-4 rounded-xl bg-stone-100 border border-stone-200 text-xs sm:text-sm text-stone-800 leading-relaxed space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-stone-900">Đánh giá chung:</span>
                  <div className="flex items-center gap-2 text-xs">
                    {typeof feedback.aiSuggestedScore === 'number' && (
                      <span className="px-2 py-0.5 rounded bg-white border border-stone-300 font-mono font-bold text-stone-800">
                        {feedback.evaluationSource === 'gemini_ai' ? 'Đề xuất AI' : 'Ước tính quy tắc'}:{' '}
                        {feedback.aiSuggestedScore}/{targetWordCount <= 250 ? '2,0' : '4,0'}đ (Chưa duyệt chính thức)
                      </span>
                    )}
                    {feedback.needsReview && (
                      <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold text-[11px]">
                        ⚑ Cần giáo viên xem lại
                      </span>
                    )}
                  </div>
                </div>
                <p>{feedback.overallImpression}</p>
              </div>

              {/* Danh sách Tiêu chí Rubric */}
              <div className="space-y-3">
                {feedback.criteria.map((crit) => {
                  const isSuccess = crit.scoreStatus === 'success';
                  const isWarning = crit.scoreStatus === 'warning';

                  return (
                    <div
                      key={crit.id}
                      className={`p-4 rounded-xl border text-xs space-y-2 transition-all ${
                        isWarning
                          ? 'bg-amber-50/60 border-amber-200'
                          : isSuccess
                          ? 'bg-emerald-50/50 border-emerald-200'
                          : 'bg-stone-50 border-stone-200'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-stone-900 text-sm">{crit.name}</span>
                        <div className="flex items-center gap-2">
                          {typeof crit.scoreAwarded === 'number' && typeof crit.maxCriterionScore === 'number' ? (
                            <span className="font-mono font-bold text-stone-800 bg-white/80 px-2 py-0.5 rounded border border-stone-300 text-[11px]">
                              {crit.scoreAwarded}/{crit.maxCriterionScore}đ
                            </span>
                          ) : (
                            <span className="text-stone-500 text-[11px] font-medium">
                              {crit.weightLabel}
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                              isWarning
                                ? 'bg-amber-200 text-amber-900'
                                : isSuccess
                                ? 'bg-emerald-200 text-emerald-900'
                                : 'bg-stone-200 text-stone-800'
                            }`}
                          >
                            {crit.scoreLevel}
                          </span>
                        </div>
                      </div>

                      {crit.rationale && (
                        <div className="text-[11px] text-stone-600 bg-white/70 p-2 rounded border border-stone-200/80">
                          <strong>Lí do chấm:</strong> {crit.rationale}
                        </div>
                      )}

                      {crit.studentQuote && (
                        <div className="text-[11px] text-stone-700 bg-white/70 p-2 rounded border border-stone-200/80">
                          <strong>Dẫn chứng trích từ bài học sinh:</strong>{' '}
                          <span className="italic font-serif">"{crit.studentQuote}"</span>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1 text-stone-700">
                        <div>
                          <strong className="text-emerald-800 block">Ưu điểm:</strong>
                          <span>{crit.strengths}</span>
                        </div>
                        <div>
                          <strong className="text-amber-800 block">Cần lưu ý:</strong>
                          <span>{crit.weaknesses}</span>
                        </div>
                      </div>

                      <div className="pt-1 border-t border-stone-200/60 text-stone-800 flex items-start gap-1.5">
                        <Lightbulb className="w-3.5 h-3.5 text-stone-500 shrink-0 mt-0.5" />
                        <span>
                          <strong>Gợi ý khắc phục:</strong> {crit.remedyStep}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 3 Bước hành động cụ thể */}
              <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 space-y-2.5">
                <div className="font-semibold text-blue-950 text-xs uppercase tracking-wide flex items-center gap-1.5">
                  <ArrowRight className="w-4 h-4 text-blue-700" />
                  <span>3 Bước chỉnh sửa tiếp theo (Hành động cụ thể):</span>
                </div>
                <div className="space-y-1.5 text-xs text-blue-950 pl-2">
                  {feedback.actionSteps.map((step, idx) => (
                    <p key={idx} className="leading-relaxed font-medium">
                      • {step}
                    </p>
                  ))}
                </div>
              </div>

              {/* KHU VỰC HỌC SINH NHẬP BẢN CHỈNH SỬA & LƯU THÀNH PHIÊN BẢN MỚI */}
              <div className="pt-6 border-t border-stone-200 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-[#0F172A] flex items-center gap-1.5">
                      <PenTool className="w-4 h-4 text-emerald-700" />
                      <span>Khu vực Tự chỉnh sửa & Tạo Phiên bản mới (v{currentVersionNumber + 1})</span>
                    </h4>
                    <p className="text-xs text-stone-500 mt-0.5">
                      Bản gốc v{currentVersionNumber} được giữ nguyên; bản chỉnh sửa bên dưới sẽ được lưu thành Phiên bản v{currentVersionNumber + 1}.
                    </p>
                  </div>
                  <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setActiveDiffView('edit')}
                      className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                        activeDiffView === 'edit'
                          ? 'bg-white text-stone-900 shadow-xs'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      Bản chỉnh sửa
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveDiffView('compare')}
                      className={`px-2.5 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1 cursor-pointer ${
                        activeDiffView === 'compare'
                          ? 'bg-white text-stone-900 shadow-xs'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      <SplitSquareVertical className="w-3.5 h-3.5" />
                      <span>Đối chiếu 2 bản</span>
                    </button>
                  </div>
                </div>

                {activeDiffView === 'edit' ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-stone-700 mb-1">
                        Nội dung bản chỉnh sửa mới (Sẽ lưu thành v{currentVersionNumber + 1}):
                      </label>
                      <textarea
                        rows={10}
                        value={revisedEssay}
                        onChange={(e) => setRevisedEssay(e.target.value)}
                        placeholder="Thực hiện sửa đổi theo 3 bước hướng dẫn ở trên..."
                        className="w-full p-3.5 text-sm font-serif-literary bg-stone-50 border border-emerald-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-700 leading-relaxed"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-stone-700 mb-1 flex items-center gap-1.5">
                        <HelpCircle className="w-3.5 h-3.5 text-emerald-700" />
                        <span>Tự giải thích những thay đổi bạn đã thực hiện:</span>
                      </label>
                      <textarea
                        rows={3}
                        value={reflectionNote}
                        onChange={(e) => setReflectionNote(e.target.value)}
                        placeholder="Ví dụ: Tôi đã gộp bài về 1 đoạn duy nhất 210 chữ, bổ sung dẫn chứng thực tế..."
                        className="w-full p-3 text-xs bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-600 leading-relaxed"
                      />
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handlePromoteRevisionToNewVersion}
                        className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>Lưu thành Phiên bản mới (v{currentVersionNumber + 1})</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-serif-literary">
                    <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-2">
                      <span className="font-sans font-bold text-stone-700 block">
                        Bản v{currentVersionNumber} ({wordCount} từ):
                      </span>
                      <p className="whitespace-pre-line text-stone-700 leading-relaxed">
                        {studentEssay}
                      </p>
                    </div>
                    <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-200 space-y-2">
                      <span className="font-sans font-bold text-emerald-900 block">
                        Bản chỉnh sửa v{currentVersionNumber + 1} ({revisedEssay.trim() ? revisedEssay.trim().split(/\s+/).length : 0} từ):
                      </span>
                      <p className="whitespace-pre-line text-emerald-950 leading-relaxed">
                        {revisedEssay || 'Chưa có nội dung chỉnh sửa.'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CÁC MODAL HỖ TRỢ */}
      {isHistoryModalOpen && (
        <DraftHistoryModal
          isOpen={isHistoryModalOpen}
          versions={versions}
          currentText={studentEssay}
          onClose={() => setIsHistoryModalOpen(false)}
          onRestoreVersion={handleRestoreVersion}
        />
      )}

      {isPreviewModalOpen && (
        <ImportPreviewModal
          isOpen={isPreviewModalOpen}
          incomingText={incomingImportText}
          incomingSourceTitle={incomingSourceTitle}
          currentText={studentEssay}
          currentVersionNumber={currentVersionNumber}
          onClose={() => setIsPreviewModalOpen(false)}
          onConfirmReplace={handleConfirmReplace}
          onConfirmAppend={handleConfirmAppend}
          onConfirmSaveAsVersionOnly={handleConfirmSaveAsVersionOnly}
        />
      )}

      {isSubmitConfirmOpen && (
        <SubmissionConfirmModal
          isOpen={isSubmitConfirmOpen}
          promptTitle={activePromptTitle}
          taskId={activeTaskId}
          versionNumber={currentVersionNumber}
          versionCode={formatVersionCode(currentVersionNumber)}
          studentIdentityLabel={
            currentUser ? `${currentUser.fullName} (${currentUser.username})` : activeStudentUid
          }
          wordCount={wordCount}
          targetWordCount={targetWordCount}
          typeLabel={activeType === 'nghi_luan_xa_hoi' ? 'Nghị luận xã hội 200 chữ' : 'Bài văn 600 chữ'}
          isSubmitting={isSubmittingFinal}
          onClose={() => {
            if (!isSubmittingFinal) setIsSubmitConfirmOpen(false);
          }}
          onConfirmSubmit={handleConfirmFinalSubmission}
        />
      )}

      {/* TOAST NHỎ GÓC PHẢI MÀN HÌNH KHI HỆ THỐNG TỰ ĐỘNG LƯU BẢN NHÁP */}
      {autoSaveToastInfo && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 max-w-xs bg-[#0F172A]/95 backdrop-blur-md text-white px-4 py-3 rounded-xl shadow-lg border border-emerald-500/40 flex items-center gap-3 transition-all duration-200"
        >
          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-emerald-300 leading-tight">
              Đã tự động lưu bản nháp
            </div>
            <div className="text-[11px] font-mono text-stone-300 truncate mt-0.5">
              {autoSaveToastInfo.versionCode} · {autoSaveToastInfo.wordCount} từ · {autoSaveToastInfo.savedAt}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAutoSaveToastInfo(null)}
            className="text-stone-400 hover:text-white text-xs font-bold px-1.5 py-0.5 rounded cursor-pointer"
            aria-label="Đóng thông báo tự động lưu"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};
