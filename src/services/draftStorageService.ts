import {
  DraftVersion,
  TaskSubmissionStatus,
  WritingFeedback,
  ExamSubmissionAnswer,
  ExamSubmission,
  LinkedGoogleDocMetadata
} from '../types';
import { getActiveSessionToken, getSavedSessionUser } from './accountService';

/**
 * Bản chụp bài nộp bất biến (Immutable Submitted Snapshot)
 * Lưu trữ cố định mỗi lần học sinh nộp bài chính thức, không thể bị sửa đổi trực tiếp.
 */
export interface SubmittedWritingSnapshot {
  snapshotId: string;
  versionNumber: number;
  versionCode: string; // Ví dụ: "VER-001"
  content: string;
  wordCount: number;
  submittedAt: string;
  submittedAtIso: string;
  studentUid: string;
  taskId: string;
  promptTitle: string;
  isImmutable: true;
  feedback?: WritingFeedback | null;
}

/**
 * Dữ liệu bền vững của một nhiệm vụ viết theo (studentUid, taskId)
 */
export interface PersistentWritingDraftState {
  studentUid: string;
  taskId: string;
  promptTitle: string;
  promptText: string;
  promptType: 'nghi_luan_xa_hoi' | 'nghi_luan_van_hoc';
  currentContent: string;
  revisedContent: string;
  reflectionNote: string;
  taskStatus: TaskSubmissionStatus;
  currentVersionNumber: number;
  isEditorLockedAfterSubmit: boolean; // Khi đã nộp chính thức, khóa bản nộp; muốn sửa phải bấm "Tạo phiên bản mới"
  lastSavedAt: string | null;
  lastSavedIso: string | null;
  storageScopeLabel: string; // "Chỉ lưu trên thiết bị này (localStorage)" hoặc "Đã đồng bộ máy chủ + thiết bị này"
  linkedGoogleDoc: LinkedGoogleDocMetadata | null;
  versions: DraftVersion[];
  submittedSnapshots: SubmittedWritingSnapshot[];
  latestFeedback: WritingFeedback | null;
}

/**
 * Dữ liệu bền vững của phiên làm bài thi thử theo (studentUid, examId)
 */
export interface PersistentExamRunnerState {
  studentUid: string;
  examId: string;
  examTitle: string;
  activeStage: 1 | 2 | 3;
  answers: ExamSubmissionAnswer;
  startedAtEpochMs: number;
  deadlineEpochMs: number;
  durationMinutes: number;
  isTimeExpired: boolean;
  isSubmitted: boolean;
  submissionVersion: number;
  submittedAt: string | null;
  submittedResult: ExamSubmission | null;
  lastSavedAt: string | null;
  lastSavedIso: string | null;
  storageScopeLabel: string;
  versionHistory: {
    versionNumber: number;
    savedAt: string;
    reason: string;
    readingAnsweredCount: number;
    paragraphWordCount: number;
    essayWordCount: number;
  }[];
}

export interface StorageSaveResult {
  success: boolean;
  savedLocal: boolean;
  savedServer: boolean;
  storageScopeLabel: string;
  savedAt: string;
  errorType?: 'quota_exceeded' | 'storage_disabled' | 'network_error';
  errorMessage?: string;
}

// Cờ mô phỏng đầy bộ nhớ (phục vụ giáo viên kiểm thử tình huống QuotaExceededError trực tiếp trên giao diện)
let simulateQuotaExceededFlag = false;

export function setSimulateQuotaExceeded(enabled: boolean): void {
  simulateQuotaExceededFlag = enabled;
}

export function getSimulateQuotaExceeded(): boolean {
  return simulateQuotaExceededFlag;
}

/**
 * Xác định UID ổn định của học sinh hiện tại.
 * Tuyệt đối tách biệt dữ liệu giữa các tài khoản học sinh và khách chưa đăng nhập.
 */
export function resolveActiveStudentUid(explicitUserId?: string | null, isDemoMode?: boolean): string {
  if (isDemoMode) {
    return 'DEMO_MODE_ISOLATED_UID';
  }
  if (explicitUserId && explicitUserId.trim()) {
    return explicitUserId.trim();
  }
  const sessionUser = getSavedSessionUser();
  if (sessionUser && sessionUser.id) {
    return sessionUser.id.trim();
  }
  // Nếu chưa đăng nhập, tạo/lấy mã phiên thiết bị cục bộ riêng cho khách (không trộn với bất kỳ tài khoản học sinh nào)
  try {
    let guestId = sessionStorage.getItem('vanai12_isolated_guest_device_uid');
    if (!guestId) {
      guestId = `GUEST_LOCAL_${Date.now().toString(36)}`;
      sessionStorage.setItem('vanai12_isolated_guest_device_uid', guestId);
    }
    return guestId;
  } catch {
    return 'GUEST_LOCAL_FALLBACK';
  }
}

function getWritingDraftStorageKey(studentUid: string, taskId: string): string {
  const safeUid = studentUid.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeTask = taskId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `vanai12_writing_draft_v2__uid_${safeUid}__task_${safeTask}`;
}

function getExamRunnerStorageKey(studentUid: string, examId: string): string {
  const safeUid = studentUid.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeExam = examId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `vanai12_exam_runner_v2__uid_${safeUid}__exam_${safeExam}`;
}

function getStudentGoogleDocsProfileKey(studentUid: string): string {
  const safeUid = studentUid.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `vanai12_student_google_docs_profile_v1__uid_${safeUid}`;
}

/**
 * Chuẩn hóa thông tin tài liệu Google Docs đã liên kết để đảm bảo luôn có đủ
 * docId, liên kết (docUrl), tài khoản chủ sở hữu (ownerAccount), mã nhiệm vụ (taskId) và UID học sinh.
 */
export function normalizeLinkedGoogleDoc(
  raw: any,
  fallbackStudentUid: string,
  fallbackTaskId: string
): LinkedGoogleDocMetadata | null {
  if (!raw || typeof raw !== 'object') return null;
  const docId = String(raw.docId || raw.id || '').trim();
  if (!docId) return null;
  const docUrl =
    String(raw.docUrl || raw.url || '').trim() ||
    `https://docs.google.com/document/d/${docId}/edit`;
  const taskId = String(raw.taskId || fallbackTaskId || '').trim();
  const studentUid = String(raw.studentUid || fallbackStudentUid || '').trim();
  const ownerAccount =
    String(raw.ownerAccount || raw.ownerEmail || '').trim() ||
    'Tài khoản Google chủ sở hữu của học sinh';

  return {
    docId,
    id: docId,
    docUrl,
    url: docUrl,
    name: String(raw.name || `VănAI 12 - [${taskId}]`).trim(),
    taskId,
    studentUid,
    ownerAccount,
    ownerGoogleUid: raw.ownerGoogleUid ? String(raw.ownerGoogleUid) : undefined,
    ownerDisplayName: raw.ownerDisplayName ? String(raw.ownerDisplayName) : undefined,
    createdAt: String(raw.createdAt || ''),
    lastSyncedAt: raw.lastSyncedAt ? String(raw.lastSyncedAt) : null,
    lastSyncedVersionCode: raw.lastSyncedVersionCode ? String(raw.lastSyncedVersionCode) : null
  };
}

/**
 * Đọc danh sách toàn bộ tài liệu Google Docs đã liên kết trong hồ sơ của đúng học sinh (theo UID)
 */
export function loadStudentLinkedGoogleDocsProfile(
  studentUid: string
): Record<string, LinkedGoogleDocMetadata> {
  if (!studentUid) return {};
  const key = getStudentGoogleDocsProfileKey(studentUid);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || parsed.studentUid !== studentUid) {
      return {};
    }
    const docsMap: Record<string, LinkedGoogleDocMetadata> = {};
    const rawDocs = parsed.docsByTask || {};
    for (const [tId, item] of Object.entries(rawDocs)) {
      const norm = normalizeLinkedGoogleDoc(item, studentUid, tId);
      if (norm && norm.studentUid === studentUid) {
        docsMap[tId] = norm;
      }
    }
    return docsMap;
  } catch {
    return {};
  }
}

/**
 * Lấy tài liệu Google Docs đã liên kết của học sinh cho một nhiệm vụ cụ thể từ hồ sơ học sinh
 */
export function loadLinkedGoogleDocForTaskFromProfile(
  studentUid: string,
  taskId: string
): LinkedGoogleDocMetadata | null {
  if (!studentUid || !taskId) return null;
  const map = loadStudentLinkedGoogleDocsProfile(studentUid);
  const found = map[taskId];
  if (found && found.studentUid === studentUid && found.taskId === taskId) {
    return found;
  }
  return null;
}

/**
 * Lưu docId, liên kết, tài khoản chủ sở hữu và mã nhiệm vụ vào hồ sơ đúng học sinh sau khi tạo/đồng bộ thành công
 */
export async function saveLinkedGoogleDocToStudentProfile(
  studentUid: string,
  docMeta: LinkedGoogleDocMetadata
): Promise<{
  success: boolean;
  savedLocal: boolean;
  savedServer: boolean;
  errorMessage?: string;
}> {
  if (!studentUid || !docMeta?.docId || !docMeta?.taskId) {
    return {
      success: false,
      savedLocal: false,
      savedServer: false,
      errorMessage: 'Thiếu thông tin UID học sinh, mã nhiệm vụ (taskId) hoặc mã tài liệu (docId).'
    };
  }

  const normalized = normalizeLinkedGoogleDoc(docMeta, studentUid, docMeta.taskId);
  if (!normalized) {
    return {
      success: false,
      savedLocal: false,
      savedServer: false,
      errorMessage: 'Thông tin liên kết Google Docs không hợp lệ.'
    };
  }

  const key = getStudentGoogleDocsProfileKey(studentUid);
  let savedLocal = false;
  let savedServer = false;
  let errorMessage: string | undefined;

  try {
    if (simulateQuotaExceededFlag) {
      throw new DOMException('Simulated QuotaExceededError', 'QuotaExceededError');
    }
    const existingDocs = loadStudentLinkedGoogleDocsProfile(studentUid);
    const updatedDocs = {
      ...existingDocs,
      [normalized.taskId]: normalized
    };
    const payload = JSON.stringify({
      studentUid,
      updatedAt: new Date().toISOString(),
      docsByTask: updatedDocs
    });
    localStorage.setItem(key, payload);
    if (localStorage.getItem(key) === payload) {
      savedLocal = true;
    }
  } catch (err) {
    savedLocal = false;
    errorMessage = isQuotaExceededError(err)
      ? 'Bộ nhớ trình duyệt đã đầy (QuotaExceededError) khi lưu liên kết Google Docs vào hồ sơ học sinh.'
      : 'Không thể ghi liên kết Google Docs vào bộ nhớ trình duyệt.';
  }

  const token = getActiveSessionToken();
  const isAuthenticatedUser =
    Boolean(token) &&
    !studentUid.startsWith('GUEST_') &&
    studentUid !== 'DEMO_MODE_ISOLATED_UID';

  if (isAuthenticatedUser && navigator.onLine) {
    try {
      const res = await fetch(
        `/api/student-state/${encodeURIComponent(studentUid)}/google-docs/${encodeURIComponent(
          normalized.taskId
        )}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ linkedGoogleDoc: normalized })
        }
      );
      if (res.ok) {
        savedServer = true;
      }
    } catch {
      savedServer = false;
    }
  }

  return {
    success: savedLocal || savedServer,
    savedLocal,
    savedServer,
    errorMessage: !savedLocal && !savedServer ? errorMessage : undefined
  };
}

/**
 * Đồng bộ danh sách liên kết Google Docs trong hồ sơ học sinh từ máy chủ về thiết bị
 */
export async function fetchStudentLinkedGoogleDocsFromServer(
  studentUid: string
): Promise<Record<string, LinkedGoogleDocMetadata>> {
  const token = getActiveSessionToken();
  if (
    !token ||
    !studentUid ||
    studentUid.startsWith('GUEST_') ||
    studentUid === 'DEMO_MODE_ISOLATED_UID'
  ) {
    return loadStudentLinkedGoogleDocsProfile(studentUid);
  }

  try {
    const res = await fetch(
      `/api/student-state/${encodeURIComponent(studentUid)}/google-docs`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );
    if (res.ok) {
      const data = await res.json();
      const serverDocs = data?.linkedGoogleDocs || {};
      const localDocs = loadStudentLinkedGoogleDocsProfile(studentUid);
      const merged: Record<string, LinkedGoogleDocMetadata> = { ...localDocs };
      for (const [tId, rawDoc] of Object.entries(serverDocs)) {
        const norm = normalizeLinkedGoogleDoc(rawDoc, studentUid, tId);
        if (norm && norm.studentUid === studentUid) {
          merged[tId] = norm;
        }
      }
      try {
        const key = getStudentGoogleDocsProfileKey(studentUid);
        localStorage.setItem(
          key,
          JSON.stringify({
            studentUid,
            updatedAt: new Date().toISOString(),
            docsByTask: merged
          })
        );
      } catch {
        // ignore quota error on sync
      }
      return merged;
    }
  } catch {
    // fallback to local profile
  }
  return loadStudentLinkedGoogleDocsProfile(studentUid);
}

function isQuotaExceededError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof DOMException) {
    return (
      err.code === 22 ||
      err.code === 1014 ||
      err.name === 'QuotaExceededError' ||
      err.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    );
  }
  const msg = err instanceof Error ? err.message : String(err);
  return msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('exceeded');
}

/**
 * Đọc bản nháp bài viết từ bộ nhớ theo đúng (studentUid, taskId)
 */
export function loadWritingDraftState(
  studentUid: string,
  taskId: string
): PersistentWritingDraftState | null {
  if (!studentUid || !taskId) return null;
  const key = getWritingDraftStorageKey(studentUid, taskId);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistentWritingDraftState;
    // Kiểm tra đúng UID và đúng mã nhiệm vụ để tuyệt đối không lộ dữ liệu người dùng trước
    if (parsed.studentUid !== studentUid || parsed.taskId !== taskId) {
      return null;
    }
    parsed.linkedGoogleDoc =
      normalizeLinkedGoogleDoc(parsed.linkedGoogleDoc, studentUid, taskId) ||
      loadLinkedGoogleDocForTaskFromProfile(studentUid, taskId);
    return parsed;
  } catch (err) {
    console.warn('Không thể đọc bản nháp bài viết từ localStorage:', err);
    return null;
  }
}

/**
 * Tải bản nháp từ máy chủ trung tâm (nếu học sinh đã đăng nhập)
 */
export async function fetchWritingDraftFromServer(
  studentUid: string,
  taskId: string
): Promise<PersistentWritingDraftState | null> {
  const token = getActiveSessionToken();
  if (!token || !studentUid || studentUid.startsWith('GUEST_') || studentUid === 'DEMO_MODE_ISOLATED_UID') {
    return null;
  }
  try {
    const res = await fetch(
      `/api/drafts/${encodeURIComponent(studentUid)}/${encodeURIComponent(taskId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.draft && data.draft.studentUid === studentUid && data.draft.taskId === taskId) {
      // Đồng bộ về localStorage nếu bản trên máy chủ mới hơn
      try {
        const key = getWritingDraftStorageKey(studentUid, taskId);
        localStorage.setItem(key, JSON.stringify(data.draft));
      } catch {
        // Bỏ qua nếu localStorage đầy
      }
      return data.draft as PersistentWritingDraftState;
    }
  } catch {
    // Mất mạng thì dùng bản localStorage
  }
  return null;
}

/**
 * Lưu bền vững bản nháp bài viết theo (studentUid, taskId).
 * - Kiểm tra lỗi ghi thật sự (bao gồm hết dung lượng QuotaExceededError).
 * - Không bao giờ báo lưu thành công nếu ghi thất bại.
 * - Ghi rõ phạm vi lưu ("Chỉ lưu trên thiết bị này" vs "Đã lưu trên thiết bị này & đồng bộ máy chủ").
 */
export async function saveWritingDraftState(
  state: PersistentWritingDraftState
): Promise<StorageSaveResult> {
  const nowStr = new Date().toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const nowIso = new Date().toISOString();
  const key = getWritingDraftStorageKey(state.studentUid, state.taskId);

  let savedLocal = false;
  let savedServer = false;
  let localErrorType: 'quota_exceeded' | 'storage_disabled' | undefined;
  let localErrorMessage: string | undefined;

  const updatedState: PersistentWritingDraftState = {
    ...state,
    lastSavedAt: nowStr,
    lastSavedIso: nowIso,
    storageScopeLabel: 'Chỉ lưu trên thiết bị này (localStorage)'
  };

  // 1. Ghi vào localStorage và kiểm tra đọc lại để xác nhận ghi thật sự thành công
  try {
    if (simulateQuotaExceededFlag) {
      throw new DOMException('Simulated QuotaExceededError', 'QuotaExceededError');
    }
    const serialized = JSON.stringify(updatedState);
    localStorage.setItem(key, serialized);
    const verifyRead = localStorage.getItem(key);
    if (verifyRead === serialized) {
      savedLocal = true;
    } else {
      localErrorType = 'storage_disabled';
      localErrorMessage = 'Trình duyệt không lưu giữ được dữ liệu vào bộ nhớ cục bộ.';
    }
  } catch (err) {
    savedLocal = false;
    if (isQuotaExceededError(err)) {
      localErrorType = 'quota_exceeded';
      localErrorMessage =
        'Không thể lưu bản nháp: Bộ nhớ trình duyệt trên thiết bị này đã đầy (QuotaExceededError). Vui lòng sao chép văn bản ra ngoài hoặc xóa bớt dữ liệu cũ.';
    } else {
      localErrorType = 'storage_disabled';
      localErrorMessage =
        'Không thể lưu bản nháp vào trình duyệt (Bộ nhớ cục bộ bị tắt hoặc chặn quyền ghi).';
    }
  }

  // 2. Đồng bộ lên máy chủ trung tâm nếu học sinh đã đăng nhập và có mạng
  const token = getActiveSessionToken();
  const isAuthenticatedUser =
    Boolean(token) &&
    Boolean(state.studentUid) &&
    !state.studentUid.startsWith('GUEST_') &&
    state.studentUid !== 'DEMO_MODE_ISOLATED_UID';

  if (isAuthenticatedUser && navigator.onLine) {
    try {
      const res = await fetch(
        `/api/drafts/${encodeURIComponent(state.studentUid)}/${encodeURIComponent(state.taskId)}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ draft: updatedState })
        }
      );
      if (res.ok) {
        savedServer = true;
      }
    } catch {
      savedServer = false;
    }
  }

  // Nếu cả localStorage và máy chủ đều thất bại -> Báo lỗi thật, tuyệt đối không báo lưu thành công
  if (!savedLocal && !savedServer) {
    return {
      success: false,
      savedLocal: false,
      savedServer: false,
      storageScopeLabel: 'Chưa lưu được dữ liệu',
      savedAt: nowStr,
      errorType: localErrorType || 'storage_disabled',
      errorMessage:
        localErrorMessage ||
        'Lưu bản nháp thất bại! Dữ liệu hiện chỉ nằm tạm trên màn hình, chưa được ghi vào thiết bị hay máy chủ.'
    };
  }

  const scopeLabel =
    savedLocal && savedServer
      ? `Đã lưu bền vững (Thiết bị này + Máy chủ theo UID) lúc ${nowStr}`
      : savedServer && !savedLocal
      ? `Đã lưu trên máy chủ lúc ${nowStr} (Bộ nhớ trình duyệt đầy)`
      : !navigator.onLine
      ? `Mất mạng — Chỉ lưu trên thiết bị này (localStorage) lúc ${nowStr}`
      : `Chỉ lưu trên thiết bị này (localStorage) lúc ${nowStr}`;

  if (savedLocal) {
    try {
      updatedState.storageScopeLabel = scopeLabel;
      localStorage.setItem(key, JSON.stringify(updatedState));
    } catch {
      // ignore secondary update
    }
  }

  return {
    success: true,
    savedLocal,
    savedServer,
    storageScopeLabel: scopeLabel,
    savedAt: nowStr,
    errorType: !savedLocal ? localErrorType : undefined,
    errorMessage: !savedLocal ? localErrorMessage : undefined
  };
}

// ============================================================================
// LƯU TRỮ & PHỤC HỒI PHIÊN THI THỬ (CompleteExamRunner) THEO UID + EXAM ID
// ============================================================================

export function loadExamRunnerState(
  studentUid: string,
  examId: string
): PersistentExamRunnerState | null {
  if (!studentUid || !examId) return null;
  const key = getExamRunnerStorageKey(studentUid, examId);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistentExamRunnerState;
    if (parsed.studentUid !== studentUid || parsed.examId !== examId) {
      return null;
    }
    return parsed;
  } catch (err) {
    console.warn('Không thể đọc phiên thi thử từ localStorage:', err);
    return null;
  }
}

export async function fetchExamRunnerStateFromServer(
  studentUid: string,
  examId: string
): Promise<PersistentExamRunnerState | null> {
  const token = getActiveSessionToken();
  if (!token || !studentUid || studentUid.startsWith('GUEST_') || studentUid === 'DEMO_MODE_ISOLATED_UID') {
    return null;
  }
  try {
    const res = await fetch(
      `/api/exam-sessions/${encodeURIComponent(studentUid)}/${encodeURIComponent(examId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (
      data &&
      data.session &&
      data.session.studentUid === studentUid &&
      data.session.examId === examId
    ) {
      try {
        const key = getExamRunnerStorageKey(studentUid, examId);
        localStorage.setItem(key, JSON.stringify(data.session));
      } catch {
        // ignore
      }
      return data.session as PersistentExamRunnerState;
    }
  } catch {
    // offline fallback
  }
  return null;
}

export async function saveExamRunnerState(
  state: PersistentExamRunnerState
): Promise<StorageSaveResult> {
  const nowStr = new Date().toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const nowIso = new Date().toISOString();
  const key = getExamRunnerStorageKey(state.studentUid, state.examId);

  let savedLocal = false;
  let savedServer = false;
  let localErrorType: 'quota_exceeded' | 'storage_disabled' | undefined;
  let localErrorMessage: string | undefined;

  const updatedState: PersistentExamRunnerState = {
    ...state,
    lastSavedAt: nowStr,
    lastSavedIso: nowIso,
    storageScopeLabel: 'Chỉ lưu trên thiết bị này (localStorage)'
  };

  try {
    if (simulateQuotaExceededFlag) {
      throw new DOMException('Simulated QuotaExceededError', 'QuotaExceededError');
    }
    const serialized = JSON.stringify(updatedState);
    localStorage.setItem(key, serialized);
    const verifyRead = localStorage.getItem(key);
    if (verifyRead === serialized) {
      savedLocal = true;
    } else {
      localErrorType = 'storage_disabled';
      localErrorMessage = 'Trình duyệt không ghi được câu trả lời vào bộ nhớ cục bộ.';
    }
  } catch (err) {
    savedLocal = false;
    if (isQuotaExceededError(err)) {
      localErrorType = 'quota_exceeded';
      localErrorMessage =
        'Lỗi lưu câu trả lời: Bộ nhớ trình duyệt đã đầy (QuotaExceededError). Chưa lưu được câu trả lời mới!';
    } else {
      localErrorType = 'storage_disabled';
      localErrorMessage =
        'Lỗi lưu câu trả lời: Bộ nhớ trình duyệt bị tắt hoặc từ chối quyền ghi.';
    }
  }

  const token = getActiveSessionToken();
  const isAuthenticatedUser =
    Boolean(token) &&
    Boolean(state.studentUid) &&
    !state.studentUid.startsWith('GUEST_') &&
    state.studentUid !== 'DEMO_MODE_ISOLATED_UID';

  if (isAuthenticatedUser && navigator.onLine) {
    try {
      const res = await fetch(
        `/api/exam-sessions/${encodeURIComponent(state.studentUid)}/${encodeURIComponent(state.examId)}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ session: updatedState })
        }
      );
      if (res.ok) {
        savedServer = true;
      }
    } catch {
      savedServer = false;
    }
  }

  if (!savedLocal && !savedServer) {
    return {
      success: false,
      savedLocal: false,
      savedServer: false,
      storageScopeLabel: 'LỖI: Chưa lưu được câu trả lời',
      savedAt: nowStr,
      errorType: localErrorType || 'storage_disabled',
      errorMessage:
        localErrorMessage ||
        'Không thể lưu câu trả lời bài thi! Vui lòng kiểm tra dung lượng trình duyệt hoặc kết nối mạng.'
    };
  }

  const scopeLabel =
    savedLocal && savedServer
      ? `Đã lưu câu trả lời (Thiết bị này + Máy chủ) lúc ${nowStr}`
      : savedServer && !savedLocal
      ? `Đã lưu trên máy chủ lúc ${nowStr} (Bộ nhớ trình duyệt đầy)`
      : !navigator.onLine
      ? `Mất mạng — Chỉ lưu trên thiết bị này (localStorage) lúc ${nowStr}`
      : `Chỉ lưu trên thiết bị này (localStorage) lúc ${nowStr}`;

  if (savedLocal) {
    try {
      updatedState.storageScopeLabel = scopeLabel;
      localStorage.setItem(key, JSON.stringify(updatedState));
    } catch {
      // ignore
    }
  }

  return {
    success: true,
    savedLocal,
    savedServer,
    storageScopeLabel: scopeLabel,
    savedAt: nowStr,
    errorType: !savedLocal ? localErrorType : undefined,
    errorMessage: !savedLocal ? localErrorMessage : undefined
  };
}

/**
 * Xóa phiên làm bài thi thử để học sinh bắt đầu lượt thi thử mới (Tạo phiên bản làm bài mới v{N+1})
 */
export function startNewExamAttemptVersion(
  studentUid: string,
  examId: string,
  examTitle: string,
  durationMinutes: number,
  previousVersionNumber: number
): PersistentExamRunnerState {
  const nowMs = Date.now();
  const nextVersion = previousVersionNumber + 1;
  const freshState: PersistentExamRunnerState = {
    studentUid,
    examId,
    examTitle,
    activeStage: 1,
    answers: {
      readingAnswers: {},
      paragraphText: '',
      essayText: ''
    },
    startedAtEpochMs: nowMs,
    deadlineEpochMs: nowMs + durationMinutes * 60 * 1000,
    durationMinutes,
    isTimeExpired: false,
    isSubmitted: false,
    submissionVersion: nextVersion,
    submittedAt: null,
    submittedResult: null,
    lastSavedAt: null,
    lastSavedIso: null,
    storageScopeLabel: 'Chỉ lưu trên thiết bị này (localStorage)',
    versionHistory: []
  };
  saveExamRunnerState(freshState).catch(() => {});
  return freshState;
}
