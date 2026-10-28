import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
  onAuthStateChanged,
  User,
  signOut
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  UserAccount,
  StudentSurveyData,
  CompleteExam,
  ExamSubmission,
  ReadingAttempt,
  WritingSubmissionRecord,
  LinkedGoogleDocMetadata
} from '../types';
import {
  getActiveAdminSignature,
  isVerifiedTeacherSession,
  fetchStudentStateFromServer,
  saveStudentStateToServer
} from './accountService';

// Chuẩn hóa cấu hình Firebase: ưu tiên biến môi trường VITE_FIREBASE_* (nếu cấu hình trên Vercel) và fallback về firebase-applet-config.json
const envMeta = (import.meta as any)?.env || {};
const effectiveFirebaseConfig = {
  ...firebaseConfig,
  apiKey: String(envMeta.VITE_FIREBASE_API_KEY || firebaseConfig.apiKey || '').trim(),
  authDomain: String(envMeta.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfig.authDomain || '').trim(),
  projectId: String(envMeta.VITE_FIREBASE_PROJECT_ID || firebaseConfig.projectId || '').trim(),
  appId: String(envMeta.VITE_FIREBASE_APP_ID || firebaseConfig.appId || '').trim(),
  storageBucket: String(
    envMeta.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfig.storageBucket || ''
  ).trim(),
  messagingSenderId: String(
    envMeta.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfig.messagingSenderId || ''
  ).trim(),
  firestoreDatabaseId: String(
    envMeta.VITE_FIREBASE_FIRESTORE_DATABASE_ID ||
      (firebaseConfig as any).firestoreDatabaseId ||
      ''
  ).trim()
};

// Initialize Firebase App & Firestore Database singleton
const app = getApps().length === 0 ? initializeApp(effectiveFirebaseConfig) : getApp();
export const db = effectiveFirebaseConfig.firestoreDatabaseId
  ? getFirestore(app, effectiveFirebaseConfig.firestoreDatabaseId)
  : getFirestore(app);
export const auth = getAuth(app);

export function getClientFirebaseProjectInfo(): {
  projectId: string;
  authDomain: string;
  currentHostname: string;
} {
  return {
    projectId: effectiveFirebaseConfig.projectId || 'unknown-project',
    authDomain: effectiveFirebaseConfig.authDomain || '',
    currentHostname: typeof window !== 'undefined' ? window.location.hostname : ''
  };
}

// ============================================================================
// FIREBASE PHONE AUTHENTICATION (REAL SMS OTP + RECAPTCHA LIFECYCLE VIA REF)
// ============================================================================
export interface PhoneRecaptchaLifecycleRefs {
  containerEl: HTMLElement | null;
  verifierRef: { current: RecaptchaVerifier | null };
  widgetIdRef?: { current: number | null };
}

let fallbackRecaptchaVerifier: RecaptchaVerifier | null = null;
let fallbackWidgetId: number | null = null;
let activeRecaptchaMountNode: HTMLElement | null = null;
let activeInFlightVerifier: RecaptchaVerifier | null = null;
let activeVerifierInitPromise: Promise<{
  verifier: RecaptchaVerifier | null;
  error?: string;
}> | null = null;
let recaptchaLifecycleGeneration = 0;
let recaptchaMountSeq = 0;
let activePhoneConfirmationResult: ConfirmationResult | null = null;
let lastPhoneOtpRequestAt = 0;
let isPhoneOtpDispatchInFlight = false;

export function normalizePhoneE164Client(rawPhone: string): string {
  const digits = String(rawPhone || '').replace(/[\s.\-()]/g, '');
  if (digits.startsWith('+84')) {
    return '+84' + digits.slice(3).replace(/^0+/, '');
  }
  if (digits.startsWith('84') && digits.length >= 10) {
    return '+84' + digits.slice(2).replace(/^0+/, '');
  }
  if (digits.startsWith('0')) {
    return '+84' + digits.slice(1);
  }
  return digits.startsWith('+') ? digits : `+${digits}`;
}

function isRecaptchaVerifierUsable(
  verifier: RecaptchaVerifier | null,
  containerEl: HTMLElement | null
): boolean {
  if (!verifier || !containerEl) return false;
  if (typeof document === 'undefined' || !document.body.contains(containerEl)) return false;
  if ((verifier as any).destroyed) return false;
  if (
    !activeRecaptchaMountNode ||
    !document.body.contains(activeRecaptchaMountNode) ||
    !containerEl.contains(activeRecaptchaMountNode)
  ) {
    return false;
  }
  return true;
}

/**
 * Dọn dẹp triệt để RecaptchaVerifier hiện tại và giải phóng phần tử DOM con
 * khi đóng biểu mẫu, chuyển tab hoặc đổi phương thức xác minh.
 */
export function cleanupPhoneRecaptchaVerifier(
  containerEl?: HTMLElement | null,
  verifierRef?: { current: RecaptchaVerifier | null },
  widgetIdRef?: { current: number | null }
): void {
  recaptchaLifecycleGeneration += 1;
  activeVerifierInitPromise = null;

  const targetVerifier = verifierRef ? verifierRef.current : fallbackRecaptchaVerifier;
  const verifiersToClear = new Set<RecaptchaVerifier>();
  if (targetVerifier) verifiersToClear.add(targetVerifier);
  if (activeInFlightVerifier) verifiersToClear.add(activeInFlightVerifier);
  if (fallbackRecaptchaVerifier) verifiersToClear.add(fallbackRecaptchaVerifier);

  verifiersToClear.forEach((v) => {
    try {
      v.clear();
    } catch {
      // ignore cleanup errors on detached DOM nodes
    }
  });

  activeInFlightVerifier = null;
  fallbackRecaptchaVerifier = null;
  if (verifierRef) {
    verifierRef.current = null;
  }

  fallbackWidgetId = null;
  if (widgetIdRef) {
    widgetIdRef.current = null;
  }

  if (activeRecaptchaMountNode) {
    try {
      activeRecaptchaMountNode.remove();
    } catch {
      // ignore
    }
    activeRecaptchaMountNode = null;
  }

  if (containerEl) {
    try {
      containerEl.innerHTML = '';
    } catch {
      // ignore
    }
  }
}

/**
 * Chỉ khởi tạo một RecaptchaVerifier duy nhất cho phần tử reCAPTCHA sau khi phần tử đã có trên trang.
 * Đồng bộ hóa mọi lời gọi song song qua activeVerifierInitPromise và khóa verifier.render()
 * sau khi render thành công để tránh lỗi widgetId === 0 trong @firebase/auth v13 gây ra
 * "reCAPTCHA has already been rendered in this element".
 */
export async function ensurePhoneRecaptchaVerifier(
  containerEl: HTMLElement | null,
  verifierRef: { current: RecaptchaVerifier | null },
  widgetIdRef?: { current: number | null }
): Promise<{ verifier: RecaptchaVerifier | null; error?: string }> {
  if (!containerEl || typeof document === 'undefined' || !document.body.contains(containerEl)) {
    return {
      verifier: null,
      error: 'Phần tử bảo mật reCAPTCHA chưa sẵn sàng trên trang. Vui lòng thử lại.'
    };
  }

  // Nếu đã có verifier hợp lệ và phần tử mountNode vẫn đang gắn trong containerEl thì tái sử dụng ngay
  if (isRecaptchaVerifierUsable(verifierRef.current, containerEl)) {
    return { verifier: verifierRef.current };
  }

  // Nếu đang có một tiến trình khởi tạo RecaptchaVerifier chạy dở trên trang, đợi đúng tiến trình đó
  // thay vì tạo thêm instance thứ hai gây xung đột "reCAPTCHA has already been rendered in this element"
  if (activeVerifierInitPromise) {
    const pendingResult = await activeVerifierInitPromise;
    if (isRecaptchaVerifierUsable(pendingResult.verifier, containerEl)) {
      verifierRef.current = pendingResult.verifier;
      return pendingResult;
    }
  }

  // Dọn sạch trạng thái cũ (nếu có) trước khi gắn vào nút DOM con hoàn toàn mới
  cleanupPhoneRecaptchaVerifier(containerEl, verifierRef, widgetIdRef);
  const currentGeneration = recaptchaLifecycleGeneration;

  let initTask: Promise<{
    verifier: RecaptchaVerifier | null;
    error?: string;
  }> | null = null;

  initTask = (async (): Promise<{
    verifier: RecaptchaVerifier | null;
    error?: string;
  }> => {
    try {
      if (!document.body.contains(containerEl)) {
        return {
          verifier: null,
          error: 'Phần tử bảo mật reCAPTCHA đã bị đóng trước khi khởi tạo xong.'
        };
      }

      containerEl.innerHTML = '';
      const mountNode = document.createElement('div');
      mountNode.id = `firebase-phone-recaptcha-node-${++recaptchaMountSeq}-${Date.now()}`;
      mountNode.className = 'firebase-recaptcha-mount-node';
      containerEl.appendChild(mountNode);
      activeRecaptchaMountNode = mountNode;

      const verifier = new RecaptchaVerifier(auth, mountNode, {
        size: 'invisible',
        'expired-callback': () => {
          const g = (window as any).grecaptcha;
          const wId = widgetIdRef ? widgetIdRef.current : fallbackWidgetId;
          if (g && typeof g.reset === 'function' && typeof wId === 'number') {
            try {
              g.reset(wId);
            } catch {
              // ignore
            }
          }
        }
      });

      activeInFlightVerifier = verifier;
      verifierRef.current = verifier;
      fallbackRecaptchaVerifier = verifier;

      const widgetId = await verifier.render();

      // Kiểm tra nếu form đã đóng hoặc chuyển tab trong lúc đang tải script reCAPTCHA
      if (
        currentGeneration !== recaptchaLifecycleGeneration ||
        !document.body.contains(mountNode)
      ) {
        try {
          verifier.clear();
        } catch {
          // ignore
        }
        return {
          verifier: null,
          error: 'Phiên khởi tạo reCAPTCHA đã được hủy do thay đổi giao diện.'
        };
      }

      const normalizedWidgetId = typeof widgetId === 'number' ? widgetId : 0;
      // Khóa hàm render() trên instance đã khởi tạo để @firebase/auth (makeRenderPromise kiểm tra !this.widgetId với widgetId === 0)
      // không bao giờ gọi lại grecaptcha.render() lần thứ hai trên cùng một phần tử
      const resolvedWidgetPromise = Promise.resolve(normalizedWidgetId);
      verifier.render = () => resolvedWidgetPromise;

      activeInFlightVerifier = null;
      verifierRef.current = verifier;
      fallbackRecaptchaVerifier = verifier;
      if (widgetIdRef) {
        widgetIdRef.current = normalizedWidgetId;
      }
      fallbackWidgetId = normalizedWidgetId;

      return { verifier };
    } catch (err: any) {
      cleanupPhoneRecaptchaVerifier(containerEl, verifierRef, widgetIdRef);
      return {
        verifier: null,
        error:
          err?.message ||
          'Không thể khởi tạo phiên bảo mật reCAPTCHA cho Firebase Phone Authentication.'
      };
    } finally {
      if (activeVerifierInitPromise === initTask) {
        activeVerifierInitPromise = null;
      }
    }
  })();

  activeVerifierInitPromise = initTask;
  return await initTask;
}

/**
 * Khi gửi OTP thất bại, reset hoặc tạo lại RecaptchaVerifier đúng một lần
 * trên phần tử DOM con mới để người dùng có thể bấm thử lại ngay mà không gặp lỗi.
 */
export async function resetOrRecreatePhoneRecaptchaVerifierOnce(
  containerEl: HTMLElement | null,
  verifierRef: { current: RecaptchaVerifier | null },
  widgetIdRef?: { current: number | null },
  lastError?: unknown
): Promise<void> {
  const rawErrorMsg = String((lastError as any)?.message || '');
  const errorCode = String((lastError as any)?.code || '');
  const mustRecreateFreshNode =
    rawErrorMsg.includes('already been rendered') ||
    rawErrorMsg.includes('client element has been removed') ||
    rawErrorMsg.includes('No reCAPTCHA clients exist') ||
    errorCode === 'auth/captcha-check-failed' ||
    errorCode === 'auth/internal-error';

  const g = (window as any).grecaptcha;
  const currentWidgetId = widgetIdRef ? widgetIdRef.current : fallbackWidgetId;
  let resetSucceeded = false;

  if (
    !mustRecreateFreshNode &&
    isRecaptchaVerifierUsable(verifierRef.current, containerEl) &&
    g &&
    typeof g.reset === 'function' &&
    typeof currentWidgetId === 'number'
  ) {
    try {
      g.reset(currentWidgetId);
      resetSucceeded = true;
    } catch {
      resetSucceeded = false;
    }
  }

  if (!resetSucceeded) {
    cleanupPhoneRecaptchaVerifier(containerEl, verifierRef, widgetIdRef);
    if (containerEl && typeof document !== 'undefined' && document.body.contains(containerEl)) {
      await ensurePhoneRecaptchaVerifier(containerEl, verifierRef, widgetIdRef);
    }
  }
}

function formatFirebasePhoneAuthError(err: any, e164Phone: string): string {
  const code = String(err?.code || '');
  const rawMessage = String(err?.message || '');
  const { projectId, currentHostname } = getClientFirebaseProjectInfo();

  if (rawMessage.includes('reCAPTCHA has already been rendered')) {
    return 'Phiên bảo mật reCAPTCHA vừa được tạo lại trên vùng chứa mới. Vui lòng bấm "Gửi mã OTP" một lần nữa.';
  }
  if (code === 'auth/operation-not-allowed') {
    return `Phương thức xác thực Số điện thoại (Phone) chưa được bật trên dự án Firebase (${projectId} → Authentication → Sign-in method → Phone). Hệ thống giữ xác minh thật, không dùng OTP giả; vui lòng bật Phone Auth hoặc chọn xác minh qua Mã Gmail.`;
  }
  if (code === 'auth/invalid-phone-number') {
    return `Số điện thoại (${e164Phone}) không hợp lệ theo chuẩn quốc tế E.164 của Firebase Auth.`;
  }
  if (code === 'auth/missing-phone-number') {
    return 'Thiếu số điện thoại nhận mã SMS OTP.';
  }
  if (code === 'auth/too-many-requests' || code === 'auth/quota-exceeded') {
    return 'Số điện thoại hoặc thiết bị đã yêu cầu gửi SMS OTP quá giới hạn cho phép của Firebase. Vui lòng đợi ít phút hoặc chọn xác minh qua Mã Gmail.';
  }
  if (code === 'auth/unauthorized-domain') {
    return `Tên miền hiện tại (${currentHostname}) chưa được thêm vào Authorized Domains của dự án Firebase (${projectId}). Vui lòng thêm "${currentHostname}" tại Firebase Console → Authentication → Settings → Authorized domains.`;
  }
  if (code === 'auth/captcha-check-failed') {
    return `Xác minh reCAPTCHA của Firebase Phone Auth không thành công trên tên miền (${currentHostname}). Hãy kiểm tra "${currentHostname}" đã có trong Authorized Domains của dự án Firebase (${projectId}) chưa, sau đó thử lại.`;
  }
  if (code === 'auth/billing-not-enabled') {
    return `Dự án Firebase (${projectId}) cần bật gói Blaze (Pay-as-you-go) để gửi SMS thật hoặc cấu hình số điện thoại kiểm thử trong Firebase Console (Authentication → Sign-in method → Phone). Bạn cũng có thể chuyển sang xác minh bằng Mã Gmail.`;
  }
  if (code === 'auth/app-not-authorized') {
    return `Ứng dụng web hiện tại trên tên miền (${currentHostname}) chưa được ủy quyền sử dụng Firebase Phone Authentication cho dự án (${projectId}).`;
  }
  if (code === 'auth/network-request-failed') {
    return 'Lỗi kết nối mạng khi liên hệ máy chủ Firebase Phone Authentication. Vui lòng kiểm tra kết nối Internet và thử lại.';
  }
  if (code === 'auth/internal-error') {
    return `Máy chủ Firebase Phone Authentication trả về lỗi nội bộ (auth/internal-error) trên dự án (${projectId}). Vui lòng kiểm tra cấu hình Phone Auth & Authorized Domains (${currentHostname}) trên Firebase Console hoặc chọn xác minh bằng Mã Gmail.`;
  }
  return rawMessage || 'Không thể gửi mã OTP qua Firebase Phone Authentication.';
}

export async function requestFirebasePhoneOtp(
  rawPhone: string,
  targetOrRefs: string | PhoneRecaptchaLifecycleRefs
): Promise<{ sent: boolean; e164Phone: string; error?: string }> {
  const e164Phone = normalizePhoneE164Client(rawPhone);
  if (!/^\+[1-9]\d{8,14}$/.test(e164Phone)) {
    return {
      sent: false,
      e164Phone,
      error: 'Định dạng số điện thoại không hợp lệ (VD: 0912345678 hoặc +84912345678).'
    };
  }

  if (isPhoneOtpDispatchInFlight) {
    return {
      sent: false,
      e164Phone,
      error: 'Đang xử lý yêu cầu gửi mã SMS OTP. Vui lòng đợi trong giây lát.'
    };
  }

  // Client-side rate-limit guard (only applies after a previous confirmed dispatch)
  const now = Date.now();
  if (lastPhoneOtpRequestAt > 0 && now - lastPhoneOtpRequestAt < 15000) {
    const waitSec = Math.ceil((15000 - (now - lastPhoneOtpRequestAt)) / 1000);
    return {
      sent: false,
      e164Phone,
      error: `Chống lạm dụng OTP: Vui lòng đợi ${waitSec} giây trước khi yêu cầu gửi lại mã SMS OTP.`
    };
  }

  const containerEl =
    typeof targetOrRefs === 'string'
      ? document.getElementById(targetOrRefs)
      : targetOrRefs.containerEl;
  const verifierRef =
    typeof targetOrRefs === 'string'
      ? {
          get current() {
            return fallbackRecaptchaVerifier;
          },
          set current(v: RecaptchaVerifier | null) {
            fallbackRecaptchaVerifier = v;
          }
        }
      : targetOrRefs.verifierRef;
  const widgetIdRef =
    typeof targetOrRefs === 'string'
      ? {
          get current() {
            return fallbackWidgetId;
          },
          set current(v: number | null) {
            fallbackWidgetId = v;
          }
        }
      : targetOrRefs.widgetIdRef;

  isPhoneOtpDispatchInFlight = true;
  try {
    const { verifier, error: initError } = await ensurePhoneRecaptchaVerifier(
      containerEl,
      verifierRef,
      widgetIdRef
    );
    if (!verifier) {
      return {
        sent: false,
        e164Phone,
        error:
          initError ||
          'Không tìm thấy hoặc không khởi tạo được vùng bảo mật reCAPTCHA trên trang.'
      };
    }

    let confirmationResult: ConfirmationResult;
    try {
      confirmationResult = await signInWithPhoneNumber(auth, e164Phone, verifier);
    } catch (firstErr: any) {
      const firstMsg = String(firstErr?.message || '');
      // Nếu vì bất kỳ lý do gì phiên reCAPTCHA cũ báo đã render hoặc phần tử bị tách,
      // dọn sạch, tạo lại verifier đúng 1 lần trên phần tử DOM con mới và gửi lại ngay
      if (
        firstMsg.includes('already been rendered') ||
        firstMsg.includes('client element has been removed') ||
        firstMsg.includes('No reCAPTCHA clients exist')
      ) {
        cleanupPhoneRecaptchaVerifier(containerEl, verifierRef, widgetIdRef);
        const recreated = await ensurePhoneRecaptchaVerifier(
          containerEl,
          verifierRef,
          widgetIdRef
        );
        if (!recreated.verifier) {
          throw firstErr;
        }
        confirmationResult = await signInWithPhoneNumber(
          auth,
          e164Phone,
          recreated.verifier
        );
      } else {
        throw firstErr;
      }
    }

    if (!confirmationResult || typeof confirmationResult.confirm !== 'function') {
      await resetOrRecreatePhoneRecaptchaVerifierOnce(containerEl, verifierRef, widgetIdRef);
      return {
        sent: false,
        e164Phone,
        error: 'Firebase chưa xác nhận gửi mã SMS OTP thành công. Vui lòng thử lại.'
      };
    }

    activePhoneConfirmationResult = confirmationResult;
    lastPhoneOtpRequestAt = Date.now();
    return { sent: true, e164Phone };
  } catch (err: any) {
    activePhoneConfirmationResult = null;
    await resetOrRecreatePhoneRecaptchaVerifierOnce(
      containerEl,
      verifierRef,
      widgetIdRef,
      err
    );

    return {
      sent: false,
      e164Phone,
      error: formatFirebasePhoneAuthError(err, e164Phone)
    };
  } finally {
    isPhoneOtpDispatchInFlight = false;
  }
}

export async function confirmFirebasePhoneOtpCode(
  otpCode: string
): Promise<{ verified: boolean; idToken?: string; phoneNumber?: string; error?: string }> {
  if (!activePhoneConfirmationResult) {
    return {
      verified: false,
      error: 'Chưa có phiên yêu cầu SMS OTP đang chờ. Vui lòng bấm "Gửi mã OTP" trước.'
    };
  }
  const cleanCode = String(otpCode || '').trim();
  if (!/^\d{6}$/.test(cleanCode)) {
    return {
      verified: false,
      error: 'Mã OTP phải gồm đúng 6 chữ số.'
    };
  }
  try {
    const credential = await activePhoneConfirmationResult.confirm(cleanCode);
    const idToken = await credential.user.getIdToken(true);
    return {
      verified: true,
      idToken,
      phoneNumber: credential.user.phoneNumber || undefined
    };
  } catch (err: any) {
    const code = String(err?.code || '');
    if (code === 'auth/invalid-verification-code') {
      return { verified: false, error: 'Mã OTP 6 chữ số không chính xác.' };
    }
    if (code === 'auth/code-expired') {
      return { verified: false, error: 'Mã OTP đã hết hạn. Vui lòng yêu cầu gửi mã mới.' };
    }
    return {
      verified: false,
      error: err?.message || 'Xác thực mã OTP trên Firebase Phone Auth thất bại.'
    };
  }
}

// ============================================================================
// FIRESTORE CONNECTION TEST & ERROR HANDLER (REQUIRED BY FIREBASE SKILL)
// ============================================================================
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write'
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email
        })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export function isFirebaseCloudConnected(): boolean {
  return Boolean(auth.currentUser && auth.currentUser.emailVerified);
}

// ============================================================================
// GOOGLE AUTHENTICATION & MINIMAL WORKSPACE OAUTH SCOPES (LEAST PRIVILEGE)
// ============================================================================
export const SCOPES = [
  'https://www.googleapis.com/auth/drive.file'
];

const provider = new GoogleAuthProvider();
SCOPES.forEach((scope) => {
  provider.addScope(scope);
});
provider.setCustomParameters({
  prompt: 'consent'
});

let isSigningIn = false;
let cachedAccessToken: string | null = null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string | null) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        if (onAuthSuccess) onAuthSuccess(user, null);
      }
    } else if (!isSigningIn) {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error(
        'Không nhận được mã truy cập OAuth (accessToken) từ Google. Vui lòng chấp thuận quyền truy cập tệp ứng dụng (drive.file) khi đăng nhập.'
      );
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Google Sign in error:', error);
    const code = String(error?.code || '');
    if (code === 'auth/popup-blocked') {
      throw new Error(
        'Trình duyệt đã chặn cửa sổ bật lên (Popup). Vui lòng cho phép Popup trên trình duyệt để đăng nhập Google.'
      );
    }
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      throw new Error('Bạn đã đóng cửa sổ đăng nhập Google trước khi hoàn tất cấp quyền.');
    }
    if (code === 'auth/unauthorized-domain') {
      throw new Error(
        'Tên miền hiện tại chưa được thêm vào danh sách Authorized Domains trong Firebase Authentication / Google Cloud OAuth.'
      );
    }
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const clearExpiredAccessToken = (): void => {
  cachedAccessToken = null;
};

export const getGoogleConnectedProfile = (): {
  uid: string;
  email: string;
  displayName: string;
  hasValidToken: boolean;
} | null => {
  const user = auth.currentUser;
  if (!user) return null;
  return {
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || user.email || 'Học sinh',
    hasValidToken: Boolean(cachedAccessToken)
  };
};

export const getCurrentFirebaseIdToken = async (
  forceRefresh = false
): Promise<string | null> => {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken(forceRefresh);
  } catch (err) {
    console.warn('Không lấy được Firebase ID Token:', err);
    return null;
  }
};

export const googleSignOut = async () => {
  await signOut(auth);
  cachedAccessToken = null;
};

// ============================================================================
// FIRESTORE REAL DATA PERSISTENCE HELPERS (STRICTLY BOUNDED BY BLUEPRINT)
// ============================================================================
function sanitizeId(rawId: string): string {
  return rawId.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 120) || 'doc-1';
}

export async function syncUserProfileToFirestore(
  userAccount: UserAccount,
  survey: StudentSurveyData
): Promise<void> {
  const fbUser = auth.currentUser;
  if (!fbUser || !fbUser.emailVerified) return;

  const uid = sanitizeId(fbUser.uid);
  const userPath = `users/${uid}`;

  try {
    let role: 'student' | 'teacher' | 'admin' =
      userAccount.role === 'admin'
        ? 'admin'
        : userAccount.role === 'teacher'
        ? 'teacher'
        : 'student';

    // Kiểm tra xem hồ sơ /admins/{uid} đã được Firebase Admin SDK phía máy chủ khởi tạo chưa
    if (role === 'admin' || role === 'teacher') {
      const adminSnap = await getDoc(doc(db, 'admins', uid));
      if (!adminSnap.exists()) {
        // Không tự tạo /admins/{uid} từ trình duyệt; chỉ khi máy chủ đã ghi /admins/{uid} mới đồng bộ role đặc quyền lên Firestore
        return;
      }
    }

    const existingSnap = await getDoc(doc(db, 'users', uid));

    const payload = {
      uid,
      username: (userAccount.username || 'HS-12').slice(0, 64),
      fullName: (userAccount.fullName || fbUser.displayName || 'Người dùng VănAI 12').slice(0, 120),
      role,
      className: (userAccount.className || '12A1').slice(0, 100),
      status: 'active' as const,
      surveyCompleted: Boolean(survey.isCompleted),
      targetScore: Math.min(10, Math.max(0, Number(survey.targetScore ?? 0))),
      quickFocusArea: (survey.quickFocusArea || 'unknown').slice(0, 64),
      quickDailyTime: (survey.quickDailyTime || '10_15_mins').slice(0, 64),
      updatedAt: serverTimestamp()
    };

    if (!existingSnap.exists()) {
      await setDoc(doc(db, 'users', uid), {
        ...payload,
        createdAt: serverTimestamp()
      });
    } else {
      await updateDoc(doc(db, 'users', uid), {
        fullName: payload.fullName,
        surveyCompleted: payload.surveyCompleted,
        targetScore: payload.targetScore,
        quickFocusArea: payload.quickFocusArea,
        quickDailyTime: payload.quickDailyTime,
        updatedAt: serverTimestamp()
      });
    }

    // Sync isolated PII (/users/{uid}/private/info)
    if (fbUser.email) {
      const piiSnap = await getDoc(doc(db, 'users', uid, 'private', 'info'));
      if (!piiSnap.exists()) {
        await setDoc(doc(db, 'users', uid, 'private', 'info'), {
          uid,
          email: fbUser.email.slice(0, 254),
          updatedAt: serverTimestamp()
        });
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, userPath);
  }
}

export async function saveExamToFirestore(exam: CompleteExam): Promise<void> {
  if (!isVerifiedTeacherSession()) {
    throw new Error('Từ chối truy cập (403): Chỉ Giáo viên mới có quyền lưu đề thi lên Cloud Firestore.');
  }
  const fbUser = auth.currentUser;
  if (!fbUser || !fbUser.emailVerified) return;

  const examId = sanitizeId(exam.id);
  const path = `exams/${examId}`;
  try {
    const existingSnap = await getDoc(doc(db, 'exams', examId));
    const docData = {
      id: examId,
      code: (exam.code || 'THPT-2026').slice(0, 64),
      title: (exam.title || 'Đề thi THPT').slice(0, 300),
      templateType: exam.templateType || 'custom',
      status: exam.status || 'draft',
      authorUid: sanitizeId(fbUser.uid),
      readingPassageContent: (exam.readingPassage.content || 'Ngữ liệu đọc hiểu').slice(0, 29000),
      paragraphPrompt: (exam.writingTasks.paragraphTask.promptText || 'Đoạn văn 200 chữ').slice(0, 4900),
      essayPrompt: (exam.writingTasks.essayTask.promptText || 'Bài văn 600 chữ').slice(0, 4900),
      totalScore: Math.min(10, Math.max(1, Number(exam.totalScore || 10))),
      durationMinutes: Math.min(300, Math.max(5, Number(exam.durationMinutes || 120))),
      updatedAt: serverTimestamp()
    };

    if (!existingSnap.exists()) {
      await setDoc(doc(db, 'exams', examId), {
        ...docData,
        createdAt: serverTimestamp()
      });
    } else {
      await setDoc(doc(db, 'exams', examId), {
        ...docData,
        authorUid: existingSnap.data().authorUid,
        createdAt: existingSnap.data().createdAt
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function savePracticeRecordToFirestore(
  recordType: 'reading' | 'writing',
  item: ReadingAttempt | WritingSubmissionRecord
): Promise<void> {
  const fbUser = auth.currentUser;
  if (!fbUser || !fbUser.emailVerified) return;

  const recId = sanitizeId(item.id);
  const path = `practice_records/${recId}`;

  const isReading = recordType === 'reading';
  const rItem = item as ReadingAttempt;
  const wItem = item as WritingSubmissionRecord;

  const title = (isReading ? rItem.passageTitle : wItem.promptTitle || 'Bài luyện').slice(0, 300);
  const content = (isReading ? rItem.originalAnswer : wItem.originalText || 'Nội dung').slice(0, 34000);
  const aiSuggestedScore = isReading
    ? Number(rItem.feedback?.aiSuggestedScore ?? 3.0)
    : Math.min(10, Math.max(0, Number(wItem.feedback?.aiSuggestedScore ?? 2.5)));

  try {
    await setDoc(doc(db, 'practice_records', recId), {
      id: recId,
      studentUid: sanitizeId(fbUser.uid),
      recordType,
      title: title || 'Bài luyện Ngữ văn 12',
      content: content || 'Bài làm',
      aiSuggestedScore,
      scoreStatus: 'ai_suggested',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function loadStudentPracticeRecordsFromFirestore(): Promise<{
  count: number;
}> {
  const fbUser = auth.currentUser;
  if (!fbUser) return { count: 0 };

  const path = 'practice_records';
  try {
    const q = query(
      collection(db, 'practice_records'),
      where('studentUid', '==', sanitizeId(fbUser.uid))
    );
    const snap = await getDocs(q);
    return { count: snap.size };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export function subscribeToAuthState(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

export async function firebaseSignOut(): Promise<void> {
  await googleSignOut();
}

export async function saveExamSubmissionToFirestore(submission: ExamSubmission): Promise<void> {
  const fbUser = auth.currentUser;
  if (!fbUser || !fbUser.emailVerified) return;

  const subId = sanitizeId(submission.id);
  const path = `exam_submissions/${subId}`;
  const readingScore = Object.values(submission.aiEvaluation?.readingScores || {}).reduce(
    (s, r) => s + Number(r.score || 0),
    0
  );
  const paragraphScore = Number(submission.aiEvaluation?.paragraphFeedback?.aiSuggestedScore || 0);
  const essayScore = Number(submission.aiEvaluation?.essayFeedback?.aiSuggestedScore || 0);
  const proposedTotal = Math.min(
    10,
    Math.max(0, Number(submission.aiEvaluation?.proposedTotal || readingScore + paragraphScore + essayScore))
  );

  try {
    await setDoc(doc(db, 'exam_submissions', subId), {
      id: subId,
      examId: sanitizeId(submission.examId || 'exam-1'),
      studentUid: sanitizeId(fbUser.uid),
      studentCode: (submission.studentId || 'HS-12').slice(0, 64),
      studentName: (submission.studentName || fbUser.displayName || 'Học sinh 12').slice(0, 120),
      className: (submission.className || '12A1').slice(0, 64),
      status: 'ai_evaluated',
      paragraphText: (submission.answers?.paragraphText || 'Đoạn văn').slice(0, 14000),
      essayText: (submission.answers?.essayText || 'Bài văn').slice(0, 34000),
      proposedTotal: Number(proposedTotal.toFixed(2)),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function loadExamsFromFirestore(): Promise<CompleteExam[]> {
  return [];
}

/**
 * Đọc trạng thái học tập gắn với UID ổn định (Kết hợp Backend xác thực & Cloud Firestore)
 */
export async function loadStudentLearningStateFromFirestore(
  uid: string
): Promise<{
  survey?: StudentSurveyData;
  readingAttempts?: ReadingAttempt[];
  writingRecords?: WritingSubmissionRecord[];
  linkedGoogleDocs?: Record<string, LinkedGoogleDocMetadata>;
} | null> {
  if (!uid) return null;
  const serverState = await fetchStudentStateFromServer(uid);
  if (serverState) return serverState;
  return null;
}

/**
 * Lưu trạng thái học tập gắn với UID ổn định (Đồng bộ lên Backend & Cloud Firestore nếu có phiên Firebase Auth)
 */
export async function saveStudentLearningStateToFirestore(
  uid: string,
  state: {
    survey: StudentSurveyData;
    readingAttempts: ReadingAttempt[];
    writingRecords: WritingSubmissionRecord[];
    linkedGoogleDocs?: Record<string, LinkedGoogleDocMetadata>;
  }
): Promise<{ syncedToBackend: boolean; syncedToFirestore: boolean }> {
  let syncedToBackend = false;
  let syncedToFirestore = false;

  if (uid) {
    syncedToBackend = await saveStudentStateToServer(uid, state);
  }

  const fbUser = auth.currentUser;
  if (fbUser && fbUser.emailVerified) {
    const fbUid = sanitizeId(fbUser.uid);
    try {
      const snap = await getDoc(doc(db, 'users', fbUid));
      if (snap.exists()) {
        await updateDoc(doc(db, 'users', fbUid), {
          surveyCompleted: Boolean(state.survey.isCompleted),
          targetScore: Math.min(10, Math.max(0, Number(state.survey.targetScore ?? 0))),
          quickFocusArea: (state.survey.quickFocusArea || 'unknown').slice(0, 64),
          quickDailyTime: (state.survey.quickDailyTime || '10_15_mins').slice(0, 64),
          updatedAt: serverTimestamp()
        });
        syncedToFirestore = true;
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${fbUid}`);
    }
  }

  return { syncedToBackend, syncedToFirestore };
}
