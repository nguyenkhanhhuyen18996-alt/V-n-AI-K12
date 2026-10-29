import {
  UserAccount,
  StudentSurveyData,
  ReadingAttempt,
  WritingSubmissionRecord,
  TeacherRegistrationRecord,
  TeacherVerificationMethod,
  ClassroomRecord,
  AdminOverviewData
} from '../types';

const STORAGE_KEY_SESSION_USER = 'vanai12_active_session_user_v2';
const STORAGE_KEY_SESSION_TOKEN = 'vanai12_active_session_token_v2';
const STORAGE_KEY_ADMIN_SIG = 'vanai12_active_admin_sig_v2';

let cachedAccounts: UserAccount[] = [];
let cachedClasses: ClassroomRecord[] = [];

export function getActiveSessionToken(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY_SESSION_TOKEN);
  } catch {
    return null;
  }
}

export function getActiveAdminSignature(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY_ADMIN_SIG);
  } catch {
    return null;
  }
}

export function saveAuthSession(
  user: UserAccount | null,
  token?: string | null,
  adminSig?: string | null
): void {
  try {
    if (user && token) {
      sessionStorage.setItem(STORAGE_KEY_SESSION_USER, JSON.stringify(user));
      sessionStorage.setItem(STORAGE_KEY_SESSION_TOKEN, token);
      sessionStorage.setItem('vanai12_active_user_id_v2', user.id);
      if (adminSig) {
        sessionStorage.setItem(STORAGE_KEY_ADMIN_SIG, adminSig);
      } else {
        sessionStorage.removeItem(STORAGE_KEY_ADMIN_SIG);
      }
    } else {
      sessionStorage.removeItem(STORAGE_KEY_SESSION_USER);
      sessionStorage.removeItem(STORAGE_KEY_SESSION_TOKEN);
      sessionStorage.removeItem(STORAGE_KEY_ADMIN_SIG);
      sessionStorage.removeItem('vanai12_active_user_id_v2');
    }
  } catch (err) {
    console.warn('Lỗi lưu phiên đăng nhập:', err);
  }
}

export function getSavedSessionUser(): UserAccount | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY_SESSION_USER);
    const token = sessionStorage.getItem(STORAGE_KEY_SESSION_TOKEN);
    if (!raw || !token) return null;
    return JSON.parse(raw) as UserAccount;
  } catch {
    return null;
  }
}

/**
 * Kiểm tra quyền Quản trị viên từ phiên xác thực đáng tin cậy
 */
export function isVerifiedAdminSession(): boolean {
  const user = getSavedSessionUser();
  const token = getActiveSessionToken();
  return Boolean(user && user.role === 'admin' && user.status === 'active' && token);
}

/**
 * Kiểm tra quyền Giáo viên ĐÃ ĐƯỢC QUẢN TRỊ VIÊN DUYỆT từ phiên xác thực đáng tin cậy
 */
export function isVerifiedTeacherSession(): boolean {
  const user = getSavedSessionUser();
  const token = getActiveSessionToken();
  if (!user || !token || user.status !== 'active') return false;
  if (user.role === 'admin') return true;
  return Boolean(user.role === 'teacher' && user.teacherApprovalStatus === 'approved');
}

function getAuthHeaders(): Record<string, string> {
  const token = getActiveSessionToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Đồng bộ và xác minh lại phiên đăng nhập hiện tại với máy chủ (/api/auth/me)
 * để đảm bảo trạng thái duyệt Giáo viên (teacherApprovalStatus) và UID luôn khớp thực tế.
 */
export async function verifyActiveSessionWithServer(): Promise<{
  valid: boolean;
  user?: UserAccount;
  error?: string;
}> {
  const token = getActiveSessionToken();
  const savedUser = getSavedSessionUser();
  if (!token || !savedUser) {
    return { valid: false };
  }

  const result = await safeFetchJson<any>('/api/auth/me', {
    headers: getAuthHeaders()
  });

  if (result.ok && result.isJson && result.data?.authenticated && result.data?.user) {
    const serverUser = result.data.user as UserAccount;
    saveAuthSession(serverUser, token, result.data.adminApprovalSignature);
    return { valid: true, user: serverUser };
  }

  if (result.status === 401 || result.status === 403) {
    saveAuthSession(null, null, null);
    return {
      valid: false,
      error:
        result.data?.error ||
        result.errorMessage ||
        'Phiên đăng nhập không còn hợp lệ hoặc tài khoản chưa được Quản trị viên phê duyệt.'
    };
  }

  // Trường hợp lỗi mạng tạm thời: chỉ giữ phiên nếu trạng thái cục bộ hợp lệ rõ ràng
  if (savedUser.role === 'teacher' && savedUser.teacherApprovalStatus !== 'approved') {
    saveAuthSession(null, null, null);
    return {
      valid: false,
      error: 'Tài khoản Giáo viên chưa được Quản trị viên phê duyệt.'
    };
  }

  return { valid: true, user: savedUser };
}

/**
/**
 * Kiểm tra trạng thái khởi tạo hệ thống (Quản trị viên & cấu hình dịch vụ gửi email OTP)
 */
export type AuthErrorCategory =
  | 'CONFIG_ERROR'
  | 'ENDPOINT_ERROR'
  | 'TOKEN_ERROR'
  | 'PERMISSION_ERROR';

export interface SafeJsonResponse<T = any> {
  ok: boolean;
  status: number;
  isJson: boolean;
  data: T | null;
  errorCategory?: AuthErrorCategory;
  errorMessage?: string;
}

export async function safeFetchJson<T = any>(
  url: string,
  options?: RequestInit
): Promise<SafeJsonResponse<T>> {
  let res: Response;
  try {
    res = await fetch(url, options);
  } catch (networkErr: any) {
    return {
      ok: false,
      status: 0,
      isJson: false,
      data: null,
      errorCategory: 'ENDPOINT_ERROR',
      errorMessage: `Không thể kết nối tới API ${url} (${
        networkErr?.message || 'Lỗi mạng'
      }).`
    };
  }

  const status = res.status;
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  let rawText = '';
  try {
    rawText = await res.text();
  } catch (readErr: any) {
    return {
      ok: false,
      status,
      isJson: false,
      data: null,
      errorCategory: 'ENDPOINT_ERROR',
      errorMessage: `Lỗi đọc phản hồi từ ${url} (HTTP ${status}): ${
        readErr?.message || 'Không đọc được nội dung phản hồi'
      }.`
    };
  }

  const trimmed = rawText.trim();
  if (!trimmed) {
    return {
      ok: false,
      status,
      isJson: false,
      data: null,
      errorCategory: 'ENDPOINT_ERROR',
      errorMessage: `Endpoint ${url} trả về phản hồi rỗng (HTTP ${status} ${
        res.statusText || ''
      }). Vui lòng kiểm tra triển khai Serverless Function /api trên Vercel.`
    };
  }

  if (!contentType.includes('application/json') && trimmed.startsWith('<')) {
    return {
      ok: false,
      status,
      isJson: false,
      data: null,
      errorCategory: 'ENDPOINT_ERROR',
      errorMessage: `Endpoint ${url} trả về HTML thay vì JSON (HTTP ${status}, Content-Type: ${
        contentType || 'text/html'
      }). Đường dẫn /api đang bị rewrite về trang tĩnh hoặc Serverless Function chưa được triển khai.`
    };
  }

  try {
    const parsed = JSON.parse(trimmed) as T;
    const anyParsed = parsed as any;
    const categoryFromBody: AuthErrorCategory | undefined = anyParsed?.errorCategory;
    return {
      ok: res.ok,
      status,
      isJson: true,
      data: parsed,
      errorCategory:
        categoryFromBody ||
        (!res.ok
          ? status === 401
            ? 'TOKEN_ERROR'
            : status === 403
            ? 'PERMISSION_ERROR'
            : status === 503
            ? 'CONFIG_ERROR'
            : 'ENDPOINT_ERROR'
          : undefined),
      errorMessage: !res.ok
        ? anyParsed?.message ||
          anyParsed?.error ||
          `Máy chủ trả về mã lỗi HTTP ${status} tại ${url}.`
        : undefined
    };
  } catch {
    return {
      ok: false,
      status,
      isJson: false,
      data: null,
      errorCategory: 'ENDPOINT_ERROR',
      errorMessage: `Endpoint ${url} trả về dữ liệu không phải JSON hợp lệ (HTTP ${status}, Content-Type: ${
        contentType || 'không xác định'
      }).`
    };
  }
}

export interface ServerFirebaseAdminStatus {
  projectId: string;
  firestoreDatabaseId: string;
  firstAdminUidConfigured: boolean;
  firstAdminUidMasked: string | null;
  serviceAccountConfigured: boolean;
  credentialSource: string;
  adminSdkInitialized: boolean;
  initializationError: string | null;
  missingEnvVars: string[];
}

export async function checkTeacherBootstrapStatus(): Promise<{
  endpointReachable: boolean;
  httpStatus: number;
  endpointError?: string;
  needsAdminBootstrap: boolean;
  needsTeacherBootstrap: boolean;
  emailProviderStatus?: {
    configured: boolean;
    providerName: string;
    missingEnvVars: string[];
  };
  firebaseAdminStatus?: ServerFirebaseAdminStatus;
  totalAccounts: number;
}> {
  const result = await safeFetchJson<any>('/api/auth/bootstrap-status');
  if (result.ok && result.isJson && result.data) {
    return {
      endpointReachable: true,
      httpStatus: result.status,
      needsAdminBootstrap: Boolean(result.data.needsAdminBootstrap),
      needsTeacherBootstrap: Boolean(result.data.needsTeacherBootstrap),
      emailProviderStatus: result.data.emailProviderStatus,
      firebaseAdminStatus: result.data.firebaseAdminStatus,
      totalAccounts: Number(result.data.totalAccounts || 0)
    };
  }

  return {
    endpointReachable: false,
    httpStatus: result.status,
    endpointError:
      result.errorMessage ||
      `Không kết nối được API kiểm tra cấu hình (/api/auth/bootstrap-status - HTTP ${result.status}).`,
    needsAdminBootstrap: false,
    needsTeacherBootstrap: false,
    totalAccounts: 0
  };
}

/**
 * Kích hoạt quy trình cấp custom claim admin=true phía máy chủ bằng Firebase Admin SDK
 * (Chỉ hoạt động khi người gọi đang đăng nhập Firebase Auth với UID trùng khớp FIRST_ADMIN_UID
 * và máy chủ đã cấu hình FIREBASE_SERVICE_ACCOUNT_JSON / GOOGLE_APPLICATION_CREDENTIALS).
 */
export async function triggerServerAdminClaimBootstrap(
  firebaseIdToken: string
): Promise<{
  success: boolean;
  httpStatus?: number;
  errorCategory?: AuthErrorCategory;
  customClaimGranted?: boolean;
  firestoreAdminDocSynced?: boolean;
  message: string;
}> {
  const result = await safeFetchJson<any>('/api/auth/bootstrap-admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ firebaseIdToken })
  });

  if (!result.isJson || !result.data) {
    return {
      success: false,
      httpStatus: result.status,
      errorCategory: 'ENDPOINT_ERROR',
      message:
        result.errorMessage ||
        `Lỗi kết nối endpoint /api/auth/bootstrap-admin (HTTP ${result.status}).`
    };
  }

  const data = result.data;
  return {
    success: Boolean(result.ok && data.success),
    httpStatus: result.status,
    errorCategory: result.errorCategory,
    customClaimGranted: data.customClaimGranted,
    firestoreAdminDocSynced: data.firestoreAdminDocSynced,
    message:
      data.message ||
      result.errorMessage ||
      `Không thể chạy quy trình khởi tạo Quản trị viên trên máy chủ (HTTP ${result.status}).`
  };
}

// ============================================================================
// TEACHER REGISTRATION & OWNERSHIP VERIFICATION (PHONE OTP / GMAIL OTP)
// ============================================================================
const STORAGE_KEY_TEACHER_REG_STATE_TOKEN = 'vanai12_teacher_reg_state_token_v2';

function saveTeacherRegistrationStateToken(token?: string | null): void {
  try {
    if (token && typeof token === 'string') {
      sessionStorage.setItem(STORAGE_KEY_TEACHER_REG_STATE_TOKEN, token);
    }
  } catch {
    // ignore storage errors
  }
}

function getTeacherRegistrationStateToken(): string | undefined {
  try {
    return sessionStorage.getItem(STORAGE_KEY_TEACHER_REG_STATE_TOKEN) || undefined;
  } catch {
    return undefined;
  }
}

export async function checkTeacherEmailConfigOnServer(): Promise<{
  ready: boolean;
  mode: string;
  providerName: string;
  missingEnvVars: string[];
  message: string;
}> {
  const result = await safeFetchJson<any>('/api/teacher-registration/email-config-check');
  if (result.isJson && result.data) {
    return {
      ready: Boolean(result.ok && result.data.ready),
      mode: String(result.data.mode || 'unconfigured'),
      providerName: String(result.data.providerName || 'Chưa cấu hình'),
      missingEnvVars: Array.isArray(result.data.missingEnvVars) ? result.data.missingEnvVars : [],
      message:
        result.data.message ||
        result.errorMessage ||
        'Không thể kiểm tra cấu hình dịch vụ gửi email trên máy chủ.'
    };
  }
  return {
    ready: false,
    mode: 'unconfigured',
    providerName: 'Không kết nối được API kiểm tra email',
    missingEnvVars: [],
    message:
      result.errorMessage ||
      `Không thể kiểm tra trạng thái SMTP/Email trên máy chủ (HTTP ${result.status}).`
  };
}

export async function submitTeacherRegistration(payload: {
  username?: string;
  fullName: string;
  phone: string;
  gmail: string;
  password: string;
  verificationMethod: TeacherVerificationMethod;
}): Promise<{
  success: boolean;
  registration?: TeacherRegistrationRecord;
  emailProviderStatus?: {
    configured: boolean;
    mode?: string;
    providerName: string;
    missingEnvVars: string[];
  };
  message: string;
}> {
  const result = await safeFetchJson<any>('/api/teacher-registration/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!result.isJson || !result.data) {
    return {
      success: false,
      message:
        result.errorMessage ||
        `Lỗi kết nối máy chủ khi gửi hồ sơ đăng ký giáo viên (HTTP ${result.status}).`
    };
  }

  const data = result.data;
  const stateToken = data.registrationStateToken || data.registration?.registrationStateToken;
  if (stateToken) {
    saveTeacherRegistrationStateToken(stateToken);
  }

  return {
    success: Boolean(result.ok && data.success),
    registration: data.registration,
    emailProviderStatus: data.emailProviderStatus,
    message:
      data.message ||
      result.errorMessage ||
      (result.ok ? 'Gửi yêu cầu thành công.' : 'Lỗi gửi yêu cầu đăng ký.')
  };
}

export async function sendTeacherGmailOtp(
  registrationId: string,
  explicitStateToken?: string
): Promise<{
  success: boolean;
  providerConfigured?: boolean;
  providerName?: string;
  missingEnvVars?: string[];
  expiresAt?: string;
  message: string;
}> {
  const registrationStateToken = explicitStateToken || getTeacherRegistrationStateToken();
  const result = await safeFetchJson<any>('/api/teacher-registration/send-gmail-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ registrationId, registrationStateToken })
  });

  if (!result.isJson || !result.data) {
    return {
      success: false,
      providerConfigured: false,
      message:
        result.errorMessage ||
        `Không thể kết nối tới API gửi mã OTP email trên máy chủ (HTTP ${result.status}).`
    };
  }

  const data = result.data;
  const nextStateToken = data.registrationStateToken || data.registration?.registrationStateToken;
  if (nextStateToken) {
    saveTeacherRegistrationStateToken(nextStateToken);
  }

  return {
    success: Boolean(result.ok && data.success),
    providerConfigured: data.providerConfigured,
    providerName: data.providerName,
    missingEnvVars: data.missingEnvVars,
    expiresAt: data.expiresAt,
    message:
      data.message ||
      result.errorMessage ||
      'Không thể gửi mã xác minh Gmail từ máy chủ.'
  };
}

export async function verifyTeacherGmailOtp(
  registrationId: string,
  otpCode: string,
  explicitStateToken?: string
): Promise<{
  success: boolean;
  registration?: TeacherRegistrationRecord;
  message: string;
}> {
  const registrationStateToken = explicitStateToken || getTeacherRegistrationStateToken();
  const result = await safeFetchJson<any>('/api/teacher-registration/verify-gmail-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ registrationId, otpCode, registrationStateToken })
  });

  if (!result.isJson || !result.data) {
    return {
      success: false,
      message:
        result.errorMessage ||
        `Lỗi kết nối máy chủ khi xác minh mã Gmail (HTTP ${result.status}).`
    };
  }

  const data = result.data;
  const nextStateToken = data.registrationStateToken || data.registration?.registrationStateToken;
  if (nextStateToken) {
    saveTeacherRegistrationStateToken(nextStateToken);
  }

  return {
    success: Boolean(result.ok && data.success),
    registration: data.registration,
    message:
      data.message ||
      result.errorMessage ||
      'Xác minh mã Gmail không thành công.'
  };
}

export async function verifyTeacherPhoneOtp(
  registrationId: string,
  firebaseIdToken: string,
  explicitStateToken?: string
): Promise<{
  success: boolean;
  registration?: TeacherRegistrationRecord;
  message: string;
}> {
  const registrationStateToken = explicitStateToken || getTeacherRegistrationStateToken();
  const result = await safeFetchJson<any>('/api/teacher-registration/verify-phone-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ registrationId, firebaseIdToken, registrationStateToken })
  });

  if (!result.isJson || !result.data) {
    return {
      success: false,
      message:
        result.errorMessage ||
        `Lỗi kết nối máy chủ khi xác minh OTP Số điện thoại (HTTP ${result.status}).`
    };
  }

  const data = result.data;
  const nextStateToken = data.registrationStateToken || data.registration?.registrationStateToken;
  if (nextStateToken) {
    saveTeacherRegistrationStateToken(nextStateToken);
  }

  return {
    success: Boolean(result.ok && data.success),
    registration: data.registration,
    message:
      data.message ||
      result.errorMessage ||
      'Xác minh OTP Số điện thoại không thành công.'
  };
}

export async function fetchTeacherRegistrationStatus(identifier: string): Promise<{
  found: boolean;
  registration?: TeacherRegistrationRecord;
  emailProviderStatus?: {
    configured: boolean;
    mode?: string;
    providerName: string;
    missingEnvVars: string[];
  };
  message?: string;
}> {
  const stateToken = getTeacherRegistrationStateToken();
  const query = stateToken ? `?stateToken=${encodeURIComponent(stateToken)}` : '';
  const result = await safeFetchJson<any>(
    `/api/teacher-registration/status/${encodeURIComponent(identifier.trim())}${query}`
  );
  if (!result.isJson || !result.data) {
    return {
      found: false,
      message:
        result.errorMessage ||
        `Không thể tra cứu hồ sơ đăng ký giáo viên (HTTP ${result.status}).`
    };
  }
  const data = result.data;
  const nextStateToken = data.registrationStateToken || data.registration?.registrationStateToken;
  if (nextStateToken) {
    saveTeacherRegistrationStateToken(nextStateToken);
  }
  return {
    found: Boolean(result.ok && data.found),
    registration: data.registration,
    emailProviderStatus: data.emailProviderStatus,
    message: data.message || result.errorMessage
  };
}

// ============================================================================
// ADMIN OVERVIEW & TEACHER APPROVAL / REJECTION / SUSPENSION
// ============================================================================
export async function fetchAdminOverview(): Promise<AdminOverviewData | null> {
  if (!isVerifiedAdminSession()) return null;
  const result = await safeFetchJson<AdminOverviewData>('/api/admin/overview', {
    headers: getAuthHeaders()
  });
  if (!result.ok || !result.isJson || !result.data) {
    throw new Error(
      result.errorMessage ||
        `Không thể tải dữ liệu Quản trị viên (HTTP ${result.status}).`
    );
  }
  return result.data;
}

export async function reviewTeacherRegistrationByAdmin(payload: {
  teacherUid?: string;
  registrationId?: string;
  action: 'approve' | 'reject' | 'suspend' | 'reactivate';
  reason?: string;
}): Promise<{
  success: boolean;
  registration?: TeacherRegistrationRecord;
  message: string;
}> {
  if (!isVerifiedAdminSession()) {
    throw new Error('Từ chối truy cập: Chỉ Quản trị viên mới có quyền duyệt giáo viên.');
  }
  const result = await safeFetchJson<any>('/api/admin/teacher-review', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload)
  });
  if (!result.isJson || !result.data) {
    return {
      success: false,
      message:
        result.errorMessage ||
        `Lỗi kết nối máy chủ khi xét duyệt giáo viên (HTTP ${result.status}).`
    };
  }
  const data = result.data;
  return {
    success: Boolean(result.ok && data.success),
    registration: data.registration,
    message:
      data.message ||
      result.errorMessage ||
      (result.ok ? 'Đã cập nhật trạng thái giáo viên.' : 'Lỗi xét duyệt.')
  };
}

// ============================================================================
// TEACHER CLASSROOM & QUOTA SERVICE (MAX 5 ACTIVE CLASSES, MAX 50 STUDENTS/CLASS)
// ============================================================================
export async function fetchTeacherClasses(): Promise<{
  classes: ClassroomRecord[];
  quota: {
    activeClassesCount: number;
    maxActiveClasses: number;
    remainingClassesQuota: number;
    maxStudentsPerClass: number;
  };
}> {
  if (!isVerifiedTeacherSession()) {
    return {
      classes: [],
      quota: {
        activeClassesCount: 0,
        maxActiveClasses: 5,
        remainingClassesQuota: 5,
        maxStudentsPerClass: 50
      }
    };
  }
  try {
    const result = await safeFetchJson<any>('/api/classes', {
      headers: getAuthHeaders()
    });
    if (result.ok && result.isJson && result.data) {
      const data = result.data;
      cachedClasses = data.classes || [];
      return {
        classes: cachedClasses,
        quota: data.quota || {
          activeClassesCount: cachedClasses.length,
          maxActiveClasses: 5,
          remainingClassesQuota: Math.max(0, 5 - cachedClasses.length),
          maxStudentsPerClass: 50
        }
      };
    }
  } catch (err) {
    console.warn('Lỗi tải danh sách lớp:', err);
  }
  return {
    classes: cachedClasses,
    quota: {
      activeClassesCount: cachedClasses.length,
      maxActiveClasses: 5,
      remainingClassesQuota: Math.max(0, 5 - cachedClasses.length),
      maxStudentsPerClass: 50
    }
  };
}

export async function createTeacherClassroom(name: string): Promise<{
  success: boolean;
  classroom?: ClassroomRecord;
  quota?: {
    activeClassesCount: number;
    maxActiveClasses: number;
    remainingClassesQuota: number;
  };
  message: string;
}> {
  if (!isVerifiedTeacherSession()) {
    throw new Error('Từ chối truy cập: Chỉ Giáo viên đã được Quản trị viên duyệt mới được tạo lớp học.');
  }
  const result = await safeFetchJson<any>('/api/classes', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ name })
  });
  if (!result.isJson || !result.data) {
    return {
      success: false,
      message:
        result.errorMessage ||
        `Không thể kết nối máy chủ khi tạo lớp (HTTP ${result.status}).`
    };
  }
  const data = result.data;
  if (!result.ok) {
    return {
      success: false,
      quota: data.quota,
      message: data.error || data.message || result.errorMessage || 'Không thể tạo lớp mới.'
    };
  }
  return {
    success: true,
    classroom: data.classroom,
    quota: data.quota,
    message: data.message || `Đã tạo lớp ${name} thành công!`
  };
}

/**
 * Tải danh sách tài khoản từ Backend thật (/api/accounts) — Yêu cầu quyền Giáo viên đã duyệt
 */
export async function initializeAccounts(): Promise<UserAccount[]> {
  try {
    const token = getActiveSessionToken();
    if (!token) {
      cachedAccounts = [];
      return [];
    }
    const res = await fetch('/api/accounts', {
      headers: getAuthHeaders()
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.accounts)) {
        cachedAccounts = data.accounts;
        return cachedAccounts;
      }
    }
  } catch (err) {
    console.warn('Không thể tải danh sách tài khoản từ máy chủ:', err);
  }
  return cachedAccounts;
}

export function getStoredAccountsSync(): UserAccount[] {
  return cachedAccounts;
}

/**
 * Xác thực đăng nhập bằng Mã tài khoản + Mật khẩu qua Backend bảo mật (/api/auth/login)
 */
export async function authenticateWithCredentials(
  username: string,
  plainPassword: string
): Promise<{
  success: boolean;
  user?: UserAccount;
  code?: string;
  registrationId?: string;
  message?: string;
}> {
  const result = await safeFetchJson<any>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: plainPassword })
  });

  if (!result.isJson || !result.data) {
    return {
      success: false,
      message:
        result.errorMessage ||
        `Lỗi kết nối endpoint xác thực /api/auth/login (HTTP ${result.status}).`
    };
  }

  const data = result.data;
  if (result.ok && data.success && data.user && data.sessionToken) {
    saveAuthSession(data.user, data.sessionToken, data.adminApprovalSignature);
    if (data.user.role === 'teacher' || data.user.role === 'admin') {
      await initializeAccounts();
    }
    return { success: true, user: data.user };
  }
  return {
    success: false,
    code: data.code,
    registrationId: data.registrationId,
    message:
      data.message ||
      `Đăng nhập không thành công (HTTP ${result.status}). Vui lòng kiểm tra lại thông tin.`
  };
}

/**
 * Kích hoạt tài khoản học sinh lần đầu bằng mã 6 chữ số qua Backend (/api/auth/activate)
 */
export async function activateStudentAccount(
  username: string,
  activationCode: string,
  newPassword: string
): Promise<{ success: boolean; user?: UserAccount; message?: string }> {
  const result = await safeFetchJson<any>('/api/auth/activate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, activationCode, newPassword })
  });

  if (!result.isJson || !result.data) {
    return {
      success: false,
      message:
        result.errorMessage ||
        `Lỗi kết nối endpoint kích hoạt /api/auth/activate (HTTP ${result.status}).`
    };
  }

  const data = result.data;
  if (result.ok && data.success && data.user && data.sessionToken) {
    saveAuthSession(data.user, data.sessionToken);
    return {
      success: true,
      user: data.user,
      message: data.message || 'Kích hoạt tài khoản thành công!'
    };
  }
  return {
    success: false,
    message: data.message || `Kích hoạt không thành công (HTTP ${result.status}).`
  };
}

/**
 * Xác thực phiên Firebase Authentication với máy chủ bằng Firebase ID Token đã ký (/api/auth/google-match).
 * Máy chủ tự giải mã & kiểm tra chữ ký ID Token, UID và custom claim `admin === true`.
 */
export async function matchAccountByGoogleEmail(
  firebaseIdToken: string,
  displayName?: string
): Promise<{
  matched: boolean;
  user?: UserAccount;
  firebaseUid?: string;
  code?: string;
  httpStatus?: number;
  errorCategory?: AuthErrorCategory;
  adminApprovalSignature?: string;
  message?: string;
}> {
  const result = await safeFetchJson<any>('/api/auth/google-match', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ firebaseIdToken, displayName })
  });

  if (!result.isJson || !result.data) {
    return {
      matched: false,
      httpStatus: result.status,
      errorCategory: 'ENDPOINT_ERROR',
      message:
        result.errorMessage ||
        `Lỗi kết nối endpoint xác thực /api/auth/google-match (HTTP ${result.status}).`
    };
  }

  const data = result.data;
  if (result.ok && data.matched && data.user && data.sessionToken) {
    saveAuthSession(data.user, data.sessionToken, data.adminApprovalSignature);
    if (data.user.role === 'teacher' || data.user.role === 'admin') {
      await initializeAccounts();
    }
    return {
      matched: true,
      httpStatus: result.status,
      user: data.user,
      firebaseUid: data.firebaseUid,
      adminApprovalSignature: data.adminApprovalSignature
    };
  }

  return {
    matched: false,
    httpStatus: result.status,
    errorCategory: data.errorCategory || result.errorCategory,
    firebaseUid: data.firebaseUid,
    code: data.code,
    message:
      data.message ||
      result.errorMessage ||
      `Tài khoản Firebase hiện tại chưa được cấp quyền truy cập trong hệ thống (HTTP ${result.status}).`
  };
}

/**
 * Đổi mật khẩu qua Backend (/api/auth/change-password)
 */
export async function changeUserPassword(
  userId: string,
  oldPass: string,
  newPass: string
): Promise<{ success: boolean; message: string }> {
  const result = await safeFetchJson<any>('/api/auth/change-password', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ userId, oldPass, newPass })
  });

  if (!result.isJson || !result.data) {
    return {
      success: false,
      message:
        result.errorMessage ||
        `Lỗi kết nối endpoint /api/auth/change-password (HTTP ${result.status}).`
    };
  }

  return {
    success: Boolean(result.ok && result.data.success),
    message:
      result.data.message ||
      (result.ok ? 'Đổi mật khẩu thành công!' : `Không thể đổi mật khẩu (HTTP ${result.status}).`)
  };
}

/**
 * Giáo viên cấp lại mã kích hoạt 6 số cho học sinh (/api/accounts/reset-code)
 */
export async function resetActivationCodeForStudent(
  studentId: string
): Promise<{ success: boolean; newCode: string; expiresAt: string }> {
  if (!isVerifiedTeacherSession()) {
    throw new Error('Từ chối truy cập: Chỉ Giáo viên đã đăng nhập mới có quyền cấp lại mã kích hoạt.');
  }
  const res = await fetch('/api/accounts/reset-code', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ studentId })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Không thể cấp lại mã kích hoạt.');
  }
  await initializeAccounts();
  return {
    success: true,
    newCode: data.newCode,
    expiresAt: data.expiresAt
  };
}

/**
 * Giáo viên khóa / mở khóa tài khoản học sinh (/api/accounts/toggle-lock)
 */
export async function toggleAccountLock(studentId: string): Promise<UserAccount | null> {
  if (!isVerifiedTeacherSession()) {
    throw new Error('Từ chối truy cập: Chỉ Giáo viên đã đăng nhập mới có quyền khóa/mở tài khoản.');
  }
  const res = await fetch('/api/accounts/toggle-lock', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ studentId })
  });
  const data = await res.json();
  if (!res.ok) return null;
  await initializeAccounts();
  return data.account || null;
}

/**
 * Giáo viên thêm học sinh mới vào danh sách lớp (/api/accounts/student)
 */
export async function addNewStudent(payload: {
  username: string;
  fullName: string;
  className: string;
  email?: string;
  notes?: string;
}): Promise<UserAccount> {
  if (!isVerifiedTeacherSession()) {
    throw new Error('Từ chối truy cập: Chỉ Giáo viên đã đăng nhập mới có quyền thêm học sinh.');
  }
  const res = await fetch('/api/accounts/student', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Không thể thêm học sinh.');
  }
  await initializeAccounts();
  return data.account;
}

/**
 * Giáo viên nhập danh sách học sinh hàng loạt (/api/accounts/batch)
 */
export async function importBatchStudents(
  rows: { username: string; fullName: string; className: string; email?: string; notes?: string }[]
): Promise<{ addedCount: number; skippedCount: number; newAccounts: UserAccount[] }> {
  if (!isVerifiedTeacherSession()) {
    throw new Error('Từ chối truy cập: Chỉ Giáo viên đã đăng nhập mới có quyền nhập danh sách lớp.');
  }
  const res = await fetch('/api/accounts/batch', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ rows })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Không thể nhập danh sách học sinh.');
  }
  await initializeAccounts();
  return {
    addedCount: data.addedCount || 0,
    skippedCount: data.skippedCount || 0,
    newAccounts: data.newAccounts || []
  };
}

/**
 * Đọc / Ghi hồ sơ học tập gắn theo UID ổn định trên máy chủ (/api/student-state/:uid)
 */
export async function fetchStudentStateFromServer(uid: string): Promise<{
  survey?: StudentSurveyData;
  readingAttempts?: ReadingAttempt[];
  writingRecords?: WritingSubmissionRecord[];
} | null> {
  const token = getActiveSessionToken();
  if (!token || !uid) return null;
  try {
    const res = await fetch(`/api/student-state/${encodeURIComponent(uid)}`, {
      headers: getAuthHeaders()
    });
    if (res.ok) {
      const data = await res.json();
      return data.state || null;
    }
  } catch (err) {
    console.warn('Không đọc được hồ sơ từ máy chủ:', err);
  }
  return null;
}

export async function saveStudentStateToServer(
  uid: string,
  state: {
    survey: StudentSurveyData;
    readingAttempts: ReadingAttempt[];
    writingRecords: WritingSubmissionRecord[];
  }
): Promise<boolean> {
  const token = getActiveSessionToken();
  if (!token || !uid) return false;
  try {
    const res = await fetch(`/api/student-state/${encodeURIComponent(uid)}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(state)
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchAllStudentStatesForTeacher(): Promise<
  Record<
    string,
    {
      uid: string;
      survey: StudentSurveyData | null;
      readingAttempts: ReadingAttempt[];
      writingRecords: WritingSubmissionRecord[];
      updatedAt: string;
    }
  >
> {
  if (!isVerifiedTeacherSession()) return {};
  try {
    const res = await fetch('/api/teacher/student-states', {
      headers: getAuthHeaders()
    });
    if (res.ok) {
      const data = await res.json();
      return data.states || {};
    }
  } catch (err) {
    console.warn('Không tải được dữ liệu học tập toàn lớp:', err);
  }
  return {};
}

export function saveSessionUser(user: UserAccount | null): void {
  if (!user) {
    saveAuthSession(null, null, null);
  }
}

export function getSavedCurrentUserId(): string | null {
  const user = getSavedSessionUser();
  return user?.id || null;
}

export function saveCurrentUserId(userId: string | null): void {
  if (!userId) {
    saveAuthSession(null, null, null);
  }
}
