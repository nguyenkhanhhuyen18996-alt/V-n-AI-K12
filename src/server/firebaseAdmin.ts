import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getAuth, type UserRecord } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore, FieldValue } from 'firebase-admin/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

export interface FirebaseProjectConfig {
  projectId: string;
  apiKey: string;
  authDomain?: string;
  firestoreDatabaseId?: string;
}

export function loadFirebaseAppletConfig(): FirebaseProjectConfig {
  try {
    const configPath = path.join(ROOT_DIR, 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return {
        projectId: String(raw.projectId || process.env.FIREBASE_PROJECT_ID || ''),
        apiKey: String(raw.apiKey || process.env.FIREBASE_WEB_API_KEY || ''),
        authDomain: raw.authDomain,
        firestoreDatabaseId: raw.firestoreDatabaseId
      };
    }
  } catch (err) {
    console.warn('[FirebaseAdmin] Không đọc được firebase-applet-config.json:', err);
  }
  return {
    projectId: String(process.env.FIREBASE_PROJECT_ID || ''),
    apiKey: String(process.env.FIREBASE_WEB_API_KEY || ''),
    firestoreDatabaseId: process.env.FIRESTORE_DATABASE_ID
  };
}

export interface FirebaseAdminConfigStatus {
  projectId: string;
  firestoreDatabaseId: string;
  firstAdminUidConfigured: boolean;
  firstAdminUidMasked: string | null;
  serviceAccountConfigured: boolean;
  credentialSource: 'FIREBASE_SERVICE_ACCOUNT_JSON' | 'GOOGLE_APPLICATION_CREDENTIALS' | 'none';
  adminSdkInitialized: boolean;
  initializationError: string | null;
  missingEnvVars: string[];
}

let cachedAdminApp: App | null = null;
let adminInitAttempted = false;
let adminInitError: string | null = null;
let detectedCredentialSource: 'FIREBASE_SERVICE_ACCOUNT_JSON' | 'GOOGLE_APPLICATION_CREDENTIALS' | 'none' = 'none';

export function getConfiguredFirstAdminUid(): string {
  const raw = String(process.env.FIRST_ADMIN_UID || '').trim();
  // Loại bỏ dấu ngoặc kép hoặc ngoặc đơn bao ngoài nếu người dùng dán kèm trong biến môi trường
  return raw.replace(/^["']+|["']+$/g, '').trim();
}

export function maskUidForDisplay(uid: string): string | null {
  const clean = String(uid || '').trim();
  if (!clean) return null;
  if (clean.length <= 8) return `${clean.slice(0, 2)}***${clean.slice(-2)}`;
  return `${clean.slice(0, 4)}...${clean.slice(-4)}`;
}

function parseServiceAccountJsonEnv(rawInput: string): Record<string, any> {
  let cleaned = rawInput.trim();
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Dự phòng trường hợp chuỗi JSON bị escape dấu ngoặc kép hoặc mã hóa Base64
    try {
      const unescaped = cleaned.replace(/\\"/g, '"');
      parsed = JSON.parse(unescaped);
    } catch {
      const decodedBase64 = Buffer.from(cleaned, 'base64').toString('utf-8').trim();
      parsed = JSON.parse(decodedBase64);
    }
  }

  if (typeof parsed === 'string') {
    parsed = JSON.parse(parsed);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON không phải là đối tượng JSON hợp lệ.');
  }

  if (typeof parsed.private_key === 'string') {
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  }

  return parsed;
}

/**
 * Khởi tạo Firebase Admin SDK an toàn phía máy chủ và dùng lại instance (singleton)
 * khi serverless function được gọi nhiều lần.
 * Tuyệt đối không đưa Service Account vào mã trình duyệt.
 */
export function ensureFirebaseAdminInitialized(): App | null {
  if (cachedAdminApp) {
    return cachedAdminApp;
  }

  const existingApps = getApps();
  if (existingApps.length > 0 && existingApps[0]) {
    cachedAdminApp = existingApps[0];
    if (detectedCredentialSource === 'none') {
      detectedCredentialSource = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
        ? 'FIREBASE_SERVICE_ACCOUNT_JSON'
        : process.env.GOOGLE_APPLICATION_CREDENTIALS
        ? 'GOOGLE_APPLICATION_CREDENTIALS'
        : 'none';
    }
    return cachedAdminApp;
  }

  const appletConfig = loadFirebaseAppletConfig();
  const serviceAccountJsonRaw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  const googleCredsPath = String(process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim();

  try {
    if (serviceAccountJsonRaw) {
      const parsed = parseServiceAccountJsonEnv(serviceAccountJsonRaw);
      detectedCredentialSource = 'FIREBASE_SERVICE_ACCOUNT_JSON';
      adminInitAttempted = true;
      adminInitError = null;
      cachedAdminApp = initializeApp({
        credential: cert(parsed),
        projectId: parsed.project_id || appletConfig.projectId
      });
      return cachedAdminApp;
    }

    if (googleCredsPath) {
      const resolvedPath = path.isAbsolute(googleCredsPath)
        ? googleCredsPath
        : path.resolve(ROOT_DIR, googleCredsPath);
      if (!fs.existsSync(resolvedPath)) {
        adminInitAttempted = true;
        adminInitError = `Không tìm thấy tệp khóa dịch vụ tại GOOGLE_APPLICATION_CREDENTIALS.`;
        return null;
      }
      const parsed = parseServiceAccountJsonEnv(fs.readFileSync(resolvedPath, 'utf-8'));
      detectedCredentialSource = 'GOOGLE_APPLICATION_CREDENTIALS';
      adminInitAttempted = true;
      adminInitError = null;
      cachedAdminApp = initializeApp({
        credential: cert(parsed),
        projectId: parsed.project_id || appletConfig.projectId
      });
      return cachedAdminApp;
    }

    detectedCredentialSource = 'none';
    adminInitError = null;
    return null;
  } catch (err: any) {
    adminInitAttempted = true;
    adminInitError =
      err?.message || 'Lỗi khởi tạo Firebase Admin SDK từ biến môi trường máy chủ.';
    console.error('[FirebaseAdmin] Lỗi khởi tạo Firebase Admin SDK:', adminInitError);
    return null;
  }
}

export function getFirebaseAdminStatus(): FirebaseAdminConfigStatus {
  const appletConfig = loadFirebaseAppletConfig();
  const firstAdminUid = getConfiguredFirstAdminUid();
  const hasServiceAccountEnv = Boolean(
    String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim() ||
      String(process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim()
  );
  const app = ensureFirebaseAdminInitialized();
  const missingEnvVars: string[] = [];

  if (!firstAdminUid) {
    missingEnvVars.push('FIRST_ADMIN_UID');
  }
  if (!hasServiceAccountEnv) {
    missingEnvVars.push('FIREBASE_SERVICE_ACCOUNT_JSON');
  }

  return {
    projectId: appletConfig.projectId,
    firestoreDatabaseId: appletConfig.firestoreDatabaseId || '(default)',
    firstAdminUidConfigured: Boolean(firstAdminUid),
    firstAdminUidMasked: maskUidForDisplay(firstAdminUid),
    serviceAccountConfigured: Boolean(app),
    credentialSource: detectedCredentialSource,
    adminSdkInitialized: Boolean(app),
    initializationError: adminInitError,
    missingEnvVars
  };
}

/**
 * Decode payload JWT của Firebase ID Token (chỉ dùng sau khi đã xác thực token với Google Identity Toolkit
 * hoặc Firebase Admin SDK).
 */
function decodeJwtPayloadUnsafe(idToken: string): Record<string, any> | null {
  try {
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;
    const json = Buffer.from(parts[1], 'base64url').toString('utf-8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export interface VerifiedFirebaseTokenResult {
  valid: boolean;
  uid?: string;
  email?: string;
  emailVerified?: boolean;
  displayName?: string;
  phoneNumber?: string;
  isAdminClaim?: boolean;
  verifiedBy: 'firebase_admin_sdk' | 'identity_toolkit_api' | 'none';
  error?: string;
}

/**
 * Xác thực Firebase ID Token ở phía máy chủ:
 * 1. Ưu tiên dùng Firebase Admin SDK (`admin.auth().verifyIdToken(idToken, true)`) để kiểm tra chữ ký,
 *    thời hạn, trạng thái thu hồi và đọc trực tiếp custom claim `admin === true`.
 * 2. Nếu máy chủ chưa cấu hình Service Account, đối chiếu trực tiếp với Google Identity Toolkit API
 *    (`accounts:lookup`) kết hợp kiểm tra chữ ký/audience của token.
 */
export async function verifyFirebaseIdTokenOnServer(
  idToken: string
): Promise<VerifiedFirebaseTokenResult> {
  const cleanToken = String(idToken || '').trim();
  if (!cleanToken || cleanToken.length < 30) {
    return {
      valid: false,
      verifiedBy: 'none',
      error: 'Thiếu Firebase ID Token hợp lệ từ phiên đăng nhập.'
    };
  }

  const adminApp = ensureFirebaseAdminInitialized();
  if (adminApp) {
    try {
      const decoded = await getAuth(adminApp).verifyIdToken(cleanToken, true);
      return {
        valid: true,
        uid: decoded.uid,
        email: decoded.email,
        emailVerified: Boolean(decoded.email_verified),
        displayName: (decoded as any).name || undefined,
        phoneNumber: decoded.phone_number,
        isAdminClaim: decoded.admin === true || (decoded as any).role === 'admin',
        verifiedBy: 'firebase_admin_sdk'
      };
    } catch (err: any) {
      return {
        valid: false,
        verifiedBy: 'firebase_admin_sdk',
        error: `Xác thực Firebase ID Token bằng Firebase Admin SDK thất bại: ${err?.message || 'Token không hợp lệ hoặc đã hết hạn.'}`
      };
    }
  }

  // Fallback xác thực thật với máy chủ Google Identity Toolkit khi chưa có Service Account
  const appletConfig = loadFirebaseAppletConfig();
  if (!appletConfig.apiKey) {
    return {
      valid: false,
      verifiedBy: 'none',
      error: 'Máy chủ chưa có cấu hình Firebase API Key hoặc Firebase Admin Service Account.'
    };
  }

  try {
    const verifyRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(appletConfig.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: cleanToken })
      }
    );

    if (!verifyRes.ok) {
      const errData: any = await verifyRes.json().catch(() => ({}));
      return {
        valid: false,
        verifiedBy: 'identity_toolkit_api',
        error: `Token Firebase không hợp lệ (${errData?.error?.message || verifyRes.statusText}).`
      };
    }

    const lookupData: any = await verifyRes.json();
    const fbUser = lookupData?.users?.[0];
    if (!fbUser || !fbUser.localId) {
      return {
        valid: false,
        verifiedBy: 'identity_toolkit_api',
        error: 'Không tìm thấy người dùng Firebase tương ứng với ID Token.'
      };
    }

    if (fbUser.disabled) {
      return {
        valid: false,
        verifiedBy: 'identity_toolkit_api',
        error: 'Tài khoản Firebase này đã bị vô hiệu hóa.'
      };
    }

    const jwtPayload = decodeJwtPayloadUnsafe(cleanToken) || {};
    let customAttrs: Record<string, any> = {};
    if (typeof fbUser.customAttributes === 'string') {
      try {
        customAttrs = JSON.parse(fbUser.customAttributes);
      } catch {
        customAttrs = {};
      }
    }

    const isAdminClaim =
      jwtPayload.admin === true ||
      jwtPayload.role === 'admin' ||
      customAttrs.admin === true ||
      customAttrs.role === 'admin';

    return {
      valid: true,
      uid: String(fbUser.localId),
      email: fbUser.email ? String(fbUser.email).toLowerCase() : jwtPayload.email,
      emailVerified: Boolean(fbUser.emailVerified),
      displayName: fbUser.displayName || jwtPayload.name,
      phoneNumber: fbUser.phoneNumber || jwtPayload.phone_number,
      isAdminClaim,
      verifiedBy: 'identity_toolkit_api'
    };
  } catch (err: any) {
    return {
      valid: false,
      verifiedBy: 'identity_toolkit_api',
      error: `Lỗi kết nối khi xác thực Firebase ID Token: ${err?.message || ''}`
    };
  }
}

export interface BootstrapAdminExecutionResult {
  success: boolean;
  uid: string;
  email?: string;
  displayName?: string;
  customClaimSet: boolean;
  firestoreAdminDocSynced: boolean;
  firestoreError?: string;
  message: string;
}

/**
 * Quy trình khởi tạo Quản trị viên đầu tiên một lần bằng Firebase Admin SDK:
 * - Đọc UID từ cấu hình bảo mật phía máy chủ (`FIRST_ADMIN_UID`).
 * - Cấp custom claim `admin = true` trên Firebase Authentication.
 * - Đồng bộ hồ sơ `/admins/{uid}` và `/users/{uid}` vào Cloud Firestore bằng quyền Admin SDK.
 */
export async function executeServerAdminBootstrap(
  explicitUid?: string
): Promise<BootstrapAdminExecutionResult> {
  const targetUid = String(explicitUid || getConfiguredFirstAdminUid()).trim();
  if (!targetUid) {
    throw new Error(
      'Chưa cấu hình biến môi trường FIRST_ADMIN_UID trong tệp .env phía máy chủ. Vui lòng đăng nhập Firebase Authentication, lấy UID của bạn và đặt FIRST_ADMIN_UID=<UID_CỦA_BẠN>.'
    );
  }

  const configuredUid = getConfiguredFirstAdminUid();
  if (configuredUid && targetUid !== configuredUid) {
    throw new Error(
      'Từ chối khởi tạo: UID yêu cầu không khớp với FIRST_ADMIN_UID trong cấu hình bảo mật của máy chủ.'
    );
  }

  const adminApp = ensureFirebaseAdminInitialized();
  if (!adminApp) {
    const status = getFirebaseAdminStatus();
    throw new Error(
      `Chưa cấu hình khóa dịch vụ Firebase Admin SDK phía máy chủ (${status.missingEnvVars.join(
        ', '
      )}). Không thể cấp custom claim admin=true nếu chưa cấu hình FIREBASE_SERVICE_ACCOUNT_JSON hoặc GOOGLE_APPLICATION_CREDENTIALS.`
    );
  }

  const adminAuth = getAuth(adminApp);
  let userRecord: UserRecord;
  try {
    userRecord = await adminAuth.getUser(targetUid);
  } catch (err: any) {
    throw new Error(
      `Không tìm thấy tài khoản có UID "${targetUid}" trong Firebase Authentication của dự án (${err?.message || 'user-not-found'}). Hãy đăng nhập ứng dụng bằng Google/Firebase Auth ít nhất một lần trước khi chạy lệnh khởi tạo.`
    );
  }

  const existingClaims = userRecord.customClaims || {};
  await adminAuth.setCustomUserClaims(targetUid, {
    ...existingClaims,
    admin: true,
    role: 'admin'
  });

  // Đồng bộ vào Cloud Firestore (/admins/{uid} và /users/{uid}) để Firestore Security Rules nhận diện
  const appletConfig = loadFirebaseAppletConfig();
  let firestoreAdminDocSynced = false;
  let firestoreError: string | undefined;

  try {
    const db = appletConfig.firestoreDatabaseId
      ? getAdminFirestore(adminApp, appletConfig.firestoreDatabaseId)
      : getAdminFirestore(adminApp);

    const now = FieldValue.serverTimestamp();
    await db
      .collection('admins')
      .doc(targetUid)
      .set(
        {
          uid: targetUid,
          role: 'admin',
          approvalSignature: `firebase-admin-sdk-claim-${Date.now()}`,
          bootstrappedBy: 'firebase-admin-sdk',
          createdAt: now,
          updatedAt: now
        },
        { merge: true }
      );

    await db
      .collection('users')
      .doc(targetUid)
      .set(
        {
          uid: targetUid,
          username: `ADMIN-${targetUid.slice(0, 6).toUpperCase()}`,
          fullName: userRecord.displayName || userRecord.email || 'Quản trị viên Hệ thống',
          role: 'admin',
          className: 'Hệ thống',
          status: 'active',
          surveyCompleted: true,
          targetScore: 9.0,
          quickFocusArea: 'balanced',
          quickDailyTime: '30_mins',
          createdAt: now,
          updatedAt: now
        },
        { merge: true }
      );

    firestoreAdminDocSynced = true;
  } catch (err: any) {
    firestoreError = err?.message || String(err);
    console.warn(
      '[FirebaseAdmin] Đã cấp custom claim admin=true nhưng chưa ghi được vào Firestore:',
      firestoreError
    );
  }

  return {
    success: true,
    uid: targetUid,
    email: userRecord.email || undefined,
    displayName: userRecord.displayName || undefined,
    customClaimSet: true,
    firestoreAdminDocSynced,
    firestoreError,
    message: `Đã cấp custom claim { admin: true } trên Firebase Authentication cho UID "${targetUid}" (${
      userRecord.email || 'không có email'
    }).`
  };
}

/**
 * Đồng bộ trạng thái Giáo viên được duyệt hoặc thu hồi quyền trên Cloud Firestore (/admins/{teacherUid})
 * bằng Firebase Admin SDK (vì client không được phép tự ghi vào collection /admins).
 */
export async function syncTeacherRoleInFirestoreAdminSdk(params: {
  teacherUid: string;
  approved: boolean;
  reviewedByUid: string;
}): Promise<boolean> {
  const adminApp = ensureFirebaseAdminInitialized();
  if (!adminApp) return false;

  try {
    const appletConfig = loadFirebaseAppletConfig();
    const db = appletConfig.firestoreDatabaseId
      ? getAdminFirestore(adminApp, appletConfig.firestoreDatabaseId)
      : getAdminFirestore(adminApp);

    const docRef = db.collection('admins').doc(params.teacherUid);
    if (params.approved) {
      await docRef.set(
        {
          uid: params.teacherUid,
          role: 'teacher',
          approvedByUid: params.reviewedByUid,
          approvalSignature: `approved-by-${params.reviewedByUid}-${Date.now()}`,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    } else {
      await docRef.delete();
    }
    return true;
  } catch (err) {
    console.warn('[FirebaseAdmin] Không đồng bộ được /admins/{teacherUid} trên Firestore:', err);
    return false;
  }
}
