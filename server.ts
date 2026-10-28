/// <reference types="node" />
import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import { GoogleGenAI, Type } from '@google/genai';
import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getAuth, type UserRecord } from 'firebase-admin/auth';

const PORT = Number(process.env.PORT) || 3000;
const IS_VERCEL_RUNTIME = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
const DATA_DIR = IS_VERCEL_RUNTIME
  ? path.join('/tmp', 'vanai12_data')
  : path.resolve(process.cwd(), '.data');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts_v2.json');
const STUDENT_STATES_FILE = path.join(DATA_DIR, 'student_states_v2.json');
const TEACHER_REGISTRATIONS_FILE = path.join(DATA_DIR, 'teacher_registrations_v2.json');
const CLASSES_FILE = path.join(DATA_DIR, 'classes_v2.json');
const ADMIN_AUDIT_LOGS_FILE = path.join(DATA_DIR, 'admin_audit_logs_v2.json');

const MAX_ACTIVE_CLASSES_PER_TEACHER = 5;
const MAX_ENROLLED_STUDENTS_PER_CLASS = 50;

try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (err) {
  console.warn('[Server] Không thể khởi tạo thư mục dữ liệu cục bộ:', err);
}

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto
    .createHash('sha256')
    .update(
      `${process.env.FIRST_ADMIN_UID || ''}:${
        process.env.FIREBASE_SERVICE_ACCOUNT_JSON || ''
      }:vanai12_hmac_secret_v2`
    )
    .digest('hex');

// ============================================================================
// SERVER-SIDE FIREBASE ADMIN SDK SINGLETON & TOKEN / CLAIM VERIFICATION
// ============================================================================
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
let adminInitError: string | null = null;
let detectedCredentialSource:
  | 'FIREBASE_SERVICE_ACCOUNT_JSON'
  | 'GOOGLE_APPLICATION_CREDENTIALS'
  | 'none' = 'none';

export function getConfiguredFirstAdminUid(): string {
  const raw = String(process.env.FIRST_ADMIN_UID || '').trim();
  return raw.replace(/^["']+|["']+$/g, '').trim();
}

function maskUidForDisplay(uid: string): string | null {
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

function validateServiceAccountKeyWithCrypto(parsed: Record<string, any>): void {
  if (
    !parsed ||
    typeof parsed.client_email !== 'string' ||
    !parsed.client_email.includes('@') ||
    typeof parsed.private_key !== 'string' ||
    !parsed.private_key.includes('PRIVATE KEY')
  ) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON thiếu trường client_email hoặc private_key hợp lệ.'
    );
  }
  crypto.createPrivateKey(parsed.private_key);
}

export function ensureFirebaseAdminInitialized(): App | null {
  if (cachedAdminApp) {
    return cachedAdminApp;
  }

  try {
    if (typeof getApps === 'function') {
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
    }
  } catch {
    // ignore and proceed to credential initialization
  }

  const appletConfig = getFirebaseProjectConfig();
  const serviceAccountJsonRaw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  const googleCredsPath = String(process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim();

  try {
    if (serviceAccountJsonRaw) {
      const parsed = parseServiceAccountJsonEnv(serviceAccountJsonRaw);
      validateServiceAccountKeyWithCrypto(parsed);
      detectedCredentialSource = 'FIREBASE_SERVICE_ACCOUNT_JSON';
      adminInitError = null;
      if (typeof initializeApp === 'function' && typeof cert === 'function') {
        try {
          cachedAdminApp = initializeApp({
            credential: cert(parsed),
            projectId: parsed.project_id || appletConfig.projectId
          });
          return cachedAdminApp;
        } catch (sdkErr: any) {
          console.warn(
            '[FirebaseAdmin] Khởi tạo qua firebase-admin/app gặp cảnh báo, dùng chế độ Service Account REST trực tiếp:',
            sdkErr?.message || sdkErr
          );
        }
      }
      cachedAdminApp = {
        name: '[DEFAULT]',
        options: { projectId: parsed.project_id || appletConfig.projectId },
        __isRestFallback: true
      } as any;
      return cachedAdminApp;
    }

    if (googleCredsPath) {
      const resolvedPath = path.isAbsolute(googleCredsPath)
        ? googleCredsPath
        : path.resolve(process.cwd(), googleCredsPath);
      if (!fs.existsSync(resolvedPath)) {
        adminInitError = 'Không tìm thấy tệp khóa dịch vụ tại GOOGLE_APPLICATION_CREDENTIALS.';
        return null;
      }
      const parsed = parseServiceAccountJsonEnv(fs.readFileSync(resolvedPath, 'utf-8'));
      validateServiceAccountKeyWithCrypto(parsed);
      detectedCredentialSource = 'GOOGLE_APPLICATION_CREDENTIALS';
      adminInitError = null;
      if (typeof initializeApp === 'function' && typeof cert === 'function') {
        try {
          cachedAdminApp = initializeApp({
            credential: cert(parsed),
            projectId: parsed.project_id || appletConfig.projectId
          });
          return cachedAdminApp;
        } catch (sdkErr: any) {
          console.warn(
            '[FirebaseAdmin] Khởi tạo qua firebase-admin/app gặp cảnh báo, dùng chế độ Service Account REST trực tiếp:',
            sdkErr?.message || sdkErr
          );
        }
      }
      cachedAdminApp = {
        name: '[DEFAULT]',
        options: { projectId: parsed.project_id || appletConfig.projectId },
        __isRestFallback: true
      } as any;
      return cachedAdminApp;
    }

    detectedCredentialSource = 'none';
    adminInitError = null;
    return null;
  } catch (err: any) {
    adminInitError =
      err?.message || 'Lỗi khởi tạo Firebase Admin SDK từ biến môi trường máy chủ.';
    console.error('[FirebaseAdmin] Lỗi khởi tạo Firebase Admin SDK:', adminInitError);
    return null;
  }
}

export function getFirebaseAdminStatus(): FirebaseAdminConfigStatus {
  const appletConfig = getFirebaseProjectConfig();
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
    projectId: String(
      app?.options?.projectId ||
        process.env.FIREBASE_PROJECT_ID ||
        appletConfig.projectId ||
        ''
    ),
    firestoreDatabaseId: String(
      process.env.FIRESTORE_DATABASE_ID ||
        (appletConfig as any).firestoreDatabaseId ||
        '(default)'
    ),
    firstAdminUidConfigured: Boolean(firstAdminUid),
    firstAdminUidMasked: maskUidForDisplay(firstAdminUid),
    serviceAccountConfigured: Boolean(app),
    credentialSource: detectedCredentialSource,
    adminSdkInitialized: Boolean(app),
    initializationError: adminInitError,
    missingEnvVars
  };
}

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

  let adminSdkError: string | null = null;
  const adminApp = ensureFirebaseAdminInitialized();
  if (adminApp && !(adminApp as any).__isRestFallback && typeof getAuth === 'function') {
    try {
      const decoded = await getAuth(adminApp).verifyIdToken(cleanToken);
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
      adminSdkError = err?.message || 'Token không hợp lệ hoặc đã hết hạn.';
      console.warn(
        '[FirebaseAdmin] verifyIdToken qua Admin SDK gặp lỗi, chuyển sang xác thực dự phòng qua Identity Toolkit API:',
        adminSdkError
      );
    }
  }

  // Dự phòng 1: Xác thực qua Google Identity Toolkit bằng OAuth2 Access Token của Service Account
  try {
    const parsedSa = getParsedServiceAccountFromEnv();
    if (parsedSa) {
      const accessToken = await getServiceAccountAccessToken(parsedSa);
      const saProjectId =
        parsedSa.project_id ||
        process.env.FIREBASE_PROJECT_ID ||
        getFirebaseProjectConfig().projectId;
      const saVerifyRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(
          String(saProjectId)
        )}/accounts:lookup`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ idToken: cleanToken })
        }
      );
      if (saVerifyRes.ok) {
        const saLookupData: any = await saVerifyRes.json();
        const fbUser = saLookupData?.users?.[0];
        if (fbUser && fbUser.localId && !fbUser.disabled) {
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
            verifiedBy: 'firebase_admin_sdk'
          };
        }
      }
    }
  } catch (saRestErr: any) {
    console.warn(
      '[FirebaseAdmin] Xác thực token qua Service Account OAuth2 gặp cảnh báo, thử tiếp Web API Key:',
      saRestErr?.message || saRestErr
    );
  }

  const appletConfig = getFirebaseProjectConfig();
  const webApiKey = String(
    process.env.FIREBASE_WEB_API_KEY ||
      process.env.VITE_FIREBASE_API_KEY ||
      appletConfig.apiKey ||
      ''
  ).trim();
  if (!webApiKey) {
    return {
      valid: false,
      verifiedBy: adminSdkError ? 'firebase_admin_sdk' : 'none',
      error: adminSdkError
        ? `Xác thực Firebase ID Token bằng Firebase Admin SDK thất bại: ${adminSdkError}`
        : 'Máy chủ chưa có cấu hình Firebase API Key hoặc Firebase Admin Service Account.'
    };
  }

  try {
    const verifyRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(
        webApiKey
      )}`,
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

function getParsedServiceAccountFromEnv(): Record<string, any> | null {
  const serviceAccountJsonRaw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  const googleCredsPath = String(process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim();
  if (serviceAccountJsonRaw) {
    return parseServiceAccountJsonEnv(serviceAccountJsonRaw);
  }
  if (googleCredsPath) {
    const resolvedPath = path.isAbsolute(googleCredsPath)
      ? googleCredsPath
      : path.resolve(process.cwd(), googleCredsPath);
    if (fs.existsSync(resolvedPath)) {
      return parseServiceAccountJsonEnv(fs.readFileSync(resolvedPath, 'utf-8'));
    }
  }
  return null;
}

async function getServiceAccountAccessToken(sa: Record<string, any>): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  const headerB64 = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString(
    'base64url'
  );
  const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const payloadB64 = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      sub: sa.client_email,
      aud: tokenUri,
      iat: nowSec,
      exp: nowSec + 3600,
      scope: [
        'https://www.googleapis.com/auth/identitytoolkit',
        'https://www.googleapis.com/auth/firebase',
        'https://www.googleapis.com/auth/datastore',
        'https://www.googleapis.com/auth/cloud-platform'
      ].join(' ')
    })
  ).toString('base64url');
  const signingInput = `${headerB64}.${payloadB64}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signatureB64 = signer.sign(sa.private_key, 'base64url');
  const assertion = `${signingInput}.${signatureB64}`;

  const tokenRes = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    }).toString()
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text().catch(() => '');
    throw new Error(
      `Không lấy được Google OAuth2 Access Token từ Service Account (${tokenRes.status}): ${errText}`
    );
  }
  const tokenData: any = await tokenRes.json();
  return String(tokenData.access_token || '');
}

export async function executeServerAdminBootstrap(explicitUid?: string): Promise<{
  success: boolean;
  uid: string;
  email?: string;
  displayName?: string;
  customClaimSet: boolean;
  firestoreAdminDocSynced: boolean;
  firestoreError?: string;
  message: string;
}> {
  const targetUid = String(explicitUid || getConfiguredFirstAdminUid()).trim();
  if (!targetUid) {
    throw new Error('Chưa cấu hình biến môi trường FIRST_ADMIN_UID ở phía máy chủ.');
  }

  const configuredUid = getConfiguredFirstAdminUid();
  if (configuredUid && targetUid !== configuredUid) {
    throw new Error(
      'Từ chối khởi tạo: UID yêu cầu không khớp với FIRST_ADMIN_UID trong cấu hình bảo mật của máy chủ.'
    );
  }

  const adminApp = ensureFirebaseAdminInitialized();
  const parsedSa = (() => {
    try {
      return getParsedServiceAccountFromEnv();
    } catch {
      return null;
    }
  })();

  if (!adminApp && !parsedSa) {
    const status = getFirebaseAdminStatus();
    throw new Error(
      status.initializationError ||
        `Chưa cấu hình khóa dịch vụ Firebase Admin SDK phía máy chủ (${status.missingEnvVars.join(
          ', '
        )}).`
    );
  }

  let userEmail: string | undefined;
  let userDisplayName: string | undefined;
  let customClaimSet = false;

  if (adminApp) {
    try {
      const adminAuth = getAuth(adminApp);
      const userRecord: UserRecord = await adminAuth.getUser(targetUid);
      userEmail = userRecord.email || undefined;
      userDisplayName = userRecord.displayName || undefined;
      const existingClaims = userRecord.customClaims || {};
      await adminAuth.setCustomUserClaims(targetUid, {
        ...existingClaims,
        admin: true,
        role: 'admin'
      });
      customClaimSet = true;
    } catch (adminSdkErr: any) {
      if (!parsedSa) {
        throw new Error(
          `Không thể cấp custom claim qua Firebase Admin SDK cho UID "${targetUid}": ${
            adminSdkErr?.message || 'user-not-found'
          }`
        );
      }
      console.warn(
        '[FirebaseAdmin] Chuyển sang Google Identity Toolkit Admin REST API để cấp custom claim:',
        adminSdkErr?.message || adminSdkErr
      );
    }
  }

  if (!customClaimSet && parsedSa) {
    const accessToken = await getServiceAccountAccessToken(parsedSa);
    const projectId =
      parsedSa.project_id ||
      process.env.FIREBASE_PROJECT_ID ||
      getFirebaseProjectConfig().projectId;

    const lookupRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(
        String(projectId)
      )}/accounts:lookup`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ localId: [targetUid] })
      }
    );
    if (lookupRes.ok) {
      const lookupData: any = await lookupRes.json().catch(() => ({}));
      const fbUser = lookupData?.users?.[0];
      if (fbUser) {
        userEmail = fbUser.email || undefined;
        userDisplayName = fbUser.displayName || undefined;
      }
    }

    const updateRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(
        String(projectId)
      )}/accounts:update`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          localId: targetUid,
          customAttributes: JSON.stringify({ admin: true, role: 'admin' })
        })
      }
    );

    if (!updateRes.ok) {
      const errText = await updateRes.text().catch(() => '');
      throw new Error(
        `Không thể cấp custom claim admin=true cho UID "${targetUid}" (${updateRes.status}): ${errText}`
      );
    }
    customClaimSet = true;
  }

  const appletConfig: any = getFirebaseProjectConfig();
  let firestoreAdminDocSynced = false;
  let firestoreError: string | undefined;

  try {
    if (!adminApp) {
      throw new Error('Admin App instance not initialized for Firestore SDK');
    }
    const { getFirestore: getAdminFirestore, FieldValue } = await import(
      'firebase-admin/firestore'
    );
    const writeAdminDocs = async (dbInstance: any) => {
      const now = FieldValue.serverTimestamp();
      await dbInstance
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

      await dbInstance
        .collection('users')
        .doc(targetUid)
        .set(
          {
            uid: targetUid,
            username: `ADMIN-${targetUid.slice(0, 6).toUpperCase()}`,
            fullName: userDisplayName || userEmail || 'Quản trị viên Hệ thống',
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
    };

    const dbId = process.env.FIRESTORE_DATABASE_ID || appletConfig.firestoreDatabaseId;
    try {
      const db =
        dbId && dbId !== '(default)'
          ? getAdminFirestore(adminApp, dbId)
          : getAdminFirestore(adminApp);
      await writeAdminDocs(db);
      firestoreAdminDocSynced = true;
    } catch (primaryDbErr) {
      if (dbId && dbId !== '(default)') {
        const defaultDb = getAdminFirestore(adminApp);
        await writeAdminDocs(defaultDb);
        firestoreAdminDocSynced = true;
      } else {
        throw primaryDbErr;
      }
    }
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
    email: userEmail,
    displayName: userDisplayName,
    customClaimSet,
    firestoreAdminDocSynced,
    firestoreError,
    message: `Đã cấp custom claim { admin: true } trên Firebase Authentication cho UID "${targetUid}" (${
      userEmail || 'không có email'
    }).`
  };
}

export async function syncTeacherRoleInFirestoreAdminSdk(params: {
  teacherUid: string;
  approved: boolean;
  reviewedByUid: string;
}): Promise<boolean> {
  const adminApp = ensureFirebaseAdminInitialized();
  if (!adminApp) return false;

  try {
    const { getFirestore: getAdminFirestore, FieldValue } = await import(
      'firebase-admin/firestore'
    );
    const appletConfig: any = getFirebaseProjectConfig();
    const dbId = process.env.FIRESTORE_DATABASE_ID || appletConfig.firestoreDatabaseId;
    const writeTeacherDoc = async (dbInstance: any) => {
      const docRef = dbInstance.collection('admins').doc(params.teacherUid);
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
    };

    try {
      const db =
        dbId && dbId !== '(default)'
          ? getAdminFirestore(adminApp, dbId)
          : getAdminFirestore(adminApp);
      await writeTeacherDoc(db);
    } catch (primaryErr) {
      if (dbId && dbId !== '(default)') {
        const defaultDb = getAdminFirestore(adminApp);
        await writeTeacherDoc(defaultDb);
      } else {
        throw primaryErr;
      }
    }
    return true;
  } catch (err) {
    console.warn('[FirebaseAdmin] Không đồng bộ được /admins/{teacherUid} trên Firestore:', err);
    return false;
  }
}

// Read Firebase project config for server-side Firebase token verification (with embedded fallback for Serverless environments)
function getFirebaseProjectConfig(): {
  projectId?: string;
  apiKey?: string;
  firestoreDatabaseId?: string;
} {
  const fallbackDefaults = {
    projectId: 'gen-lang-client-0603655480',
    apiKey: 'AIzaSyBlFIxGZ1uDyJTMhZN4WTlLgGaglec0wlg',
    firestoreDatabaseId: 'ai-studio-vnai12trlchiuvvi-e4c6bf2e-9e42-4138-9e4c-b13f1a9b5f69'
  };
  try {
    const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      return {
        ...fallbackDefaults,
        ...JSON.parse(fs.readFileSync(cfgPath, 'utf-8'))
      };
    }
  } catch {
    // ignore
  }
  return fallbackDefaults;
}

// Atomic serialization lock to prevent race conditions on class creation (max 5) & student enrollment (max 50)
let quotaMutexChain: Promise<any> = Promise.resolve();
function withQuotaLock<T>(task: () => Promise<T> | T): Promise<T> {
  const next = quotaMutexChain.then(() => task(), () => task());
  quotaMutexChain = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

// Initialize Server-Side Gemini Client
function getResolvedGeminiApiKey(): string {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GEMINI_API_kEY ||
    process.env.API_KEY ||
    ''
  ).trim();
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = getResolvedGeminiApiKey();
  if (!apiKey) {
    throw new Error('Máy chủ chưa được cấu hình GEMINI_API_KEY.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });
}

// ============================================================================
// SERVER-SIDE ACCOUNT, TEACHER REGISTRATION & CLASS QUOTA TYPES
// ============================================================================
export type TeacherVerificationMethod = 'phone_otp' | 'gmail_otp';
export type TeacherApprovalStatus =
  | 'pending_verification'
  | 'pending_admin_approval'
  | 'approved'
  | 'rejected'
  | 'suspended';

export interface StoredUserAccount {
  id: string; // Stable immutable UID
  username: string;
  fullName: string;
  role: 'student' | 'teacher' | 'admin';
  className?: string;
  classId?: string;
  teacherUid?: string; // Owning teacher UID for student isolation
  email?: string;
  phone?: string;
  verificationMethod?: TeacherVerificationMethod;
  phoneVerified?: boolean;
  gmailVerified?: boolean;
  teacherApprovalStatus?: TeacherApprovalStatus;
  rejectionReason?: string;
  reviewedByUid?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  passwordHash?: string;
  passwordSalt?: string;
  activationCode?: string;
  activationCodeExpiresAt?: string;
  isActivated: boolean;
  createdAt: string;
  lastLoginAt?: string;
  status: 'active' | 'pending_activation' | 'locked';
  notes?: string;
}

export interface StoredTeacherRegistration {
  id: string;
  teacherUid: string;
  username: string;
  fullName: string;
  phone: string;
  gmail: string;
  verificationMethod: TeacherVerificationMethod;
  phoneVerified: boolean;
  phoneVerifiedAt?: string;
  gmailVerified: boolean;
  gmailVerifiedAt?: string;
  // Hashed OTP fields (NEVER store plaintext OTP in DB)
  gmailOtpHash?: string;
  gmailOtpSalt?: string;
  gmailOtpExpiresAt?: string;
  gmailOtpAttempts?: number;
  lastOtpSentAt?: string;
  isOwnershipVerified: boolean;
  approvalStatus: TeacherApprovalStatus;
  rejectionReason?: string;
  suspensionReason?: string;
  reviewedByUid?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredClassroomRecord {
  id: string;
  name: string;
  teacherUid: string;
  teacherName: string;
  status: 'active' | 'archived';
  enrolledCount: number;
  maxCapacity: number; // Always 50
  createdAt: string;
  updatedAt: string;
}

export interface StoredAdminAuditLog {
  id: string;
  action: 'approve_teacher' | 'reject_teacher' | 'suspend_teacher' | 'reactivate_teacher';
  targetTeacherUid: string;
  targetTeacherName: string;
  reason?: string;
  performedByUid: string;
  performedByName: string;
  performedAt: string;
}

export interface SessionTokenPayload {
  uid: string;
  username: string;
  role: 'student' | 'teacher' | 'admin';
  exp: number;
}

function hashPasswordServer(password: string, salt: string): string {
  return crypto
    .pbkdf2Sync(password, `${salt}:vanai12_prod_pepper`, 10000, 32, 'sha256')
    .toString('hex');
}

function hashOtpCodeServer(otpCode: string, salt: string): string {
  return crypto
    .pbkdf2Sync(otpCode.trim(), `${salt}:${SESSION_SECRET}:otp_pepper`, 10000, 32, 'sha256')
    .toString('hex');
}

function generateSaltServer(): string {
  return crypto.randomBytes(16).toString('hex');
}

function generateActivationCodeServer(): string {
  return crypto.randomInt(100000, 999999).toString();
}

function getExpiryDateServer(days = 7): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export function normalizePhoneE164(rawPhone: string): string {
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

function isValidPhoneFormat(rawPhone: string): boolean {
  const norm = normalizePhoneE164(rawPhone);
  return /^\+[1-9]\d{8,14}$/.test(norm);
}

function isValidGmailFormat(rawEmail: string): boolean {
  const email = String(rawEmail || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function signSessionToken(payload: Omit<SessionTokenPayload, 'exp'>): string {
  const fullPayload: SessionTokenPayload = {
    ...payload,
    exp: Date.now() + 12 * 3600 * 1000 // 12 hours
  };
  const dataB64 = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(dataB64).digest('base64url');
  return `${dataB64}.${sig}`;
}

function verifySessionToken(token?: string): SessionTokenPayload | null {
  if (!token || !token.includes('.')) return null;
  const [dataB64, sig] = token.split('.');
  if (!dataB64 || !sig) return null;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(dataB64)
    .digest('base64url');
  if (sig !== expectedSig) return null;
  try {
    const payload = JSON.parse(Buffer.from(dataB64, 'base64url').toString('utf-8')) as SessionTokenPayload;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function generateAdminApprovalSignature(uid: string): string {
  return crypto.createHmac('sha256', SESSION_SECRET).update(`teacher_admin:${uid}`).digest('hex');
}

function extractBearerToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return undefined;
}

function loadServerAccounts(): StoredUserAccount[] {
  try {
    if (fs.existsSync(ACCOUNTS_FILE)) {
      const raw = fs.readFileSync(ACCOUNTS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Error reading server accounts file:', err);
  }
  return [];
}

function saveServerAccounts(accounts: StoredUserAccount[]) {
  try {
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving server accounts:', err);
  }
}

function loadTeacherRegistrations(): StoredTeacherRegistration[] {
  try {
    if (fs.existsSync(TEACHER_REGISTRATIONS_FILE)) {
      const raw = fs.readFileSync(TEACHER_REGISTRATIONS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn('Error reading teacher registrations file:', err);
  }
  return [];
}

function saveTeacherRegistrations(list: StoredTeacherRegistration[]) {
  try {
    fs.writeFileSync(TEACHER_REGISTRATIONS_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving teacher registrations:', err);
  }
}

function loadServerClasses(): StoredClassroomRecord[] {
  try {
    if (fs.existsSync(CLASSES_FILE)) {
      const raw = fs.readFileSync(CLASSES_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn('Error reading classes file:', err);
  }
  return [];
}

function saveServerClasses(list: StoredClassroomRecord[]) {
  try {
    fs.writeFileSync(CLASSES_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving classes:', err);
  }
}

function loadAdminAuditLogs(): StoredAdminAuditLog[] {
  try {
    if (fs.existsSync(ADMIN_AUDIT_LOGS_FILE)) {
      const raw = fs.readFileSync(ADMIN_AUDIT_LOGS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn('Error reading audit logs file:', err);
  }
  return [];
}

function saveAdminAuditLogs(logs: StoredAdminAuditLog[]) {
  try {
    fs.writeFileSync(ADMIN_AUDIT_LOGS_FILE, JSON.stringify(logs, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving audit logs:', err);
  }
}

function loadServerStudentStates(): Record<string, any> {
  try {
    if (fs.existsSync(STUDENT_STATES_FILE)) {
      const raw = fs.readFileSync(STUDENT_STATES_FILE, 'utf-8');
      return JSON.parse(raw) || {};
    }
  } catch (err) {
    console.warn('Error reading student states file:', err);
  }
  return {};
}

function saveServerStudentStates(states: Record<string, any>) {
  try {
    fs.writeFileSync(STUDENT_STATES_FILE, JSON.stringify(states, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving student states file:', err);
  }
}

function isAuthorizedAdminUid(uid: string): boolean {
  const cleanUid = String(uid || '').trim();
  if (!cleanUid) return false;
  const configuredFirstAdminUid = getConfiguredFirstAdminUid();
  if (configuredFirstAdminUid) {
    return cleanUid === configuredFirstAdminUid;
  }
  return false;
}

// Check if server-side email OTP delivery provider is configured
function getEmailProviderStatus(): {
  configured: boolean;
  mode: 'resend' | 'smtp' | 'webhook' | 'test_outbox' | 'unconfigured';
  providerName: string;
  missingEnvVars: string[];
} {
  const resendKey = (process.env.RESEND_API_KEY || '').trim();
  if (resendKey) {
    return {
      configured: true,
      mode: 'resend',
      providerName: 'Resend Email API',
      missingEnvVars: []
    };
  }
  const smtpHost = (process.env.SMTP_HOST || '').trim();
  const smtpUser = (process.env.SMTP_USER || '').trim();
  const smtpPass = (process.env.SMTP_PASS || '').trim();
  if (smtpHost && smtpUser && smtpPass) {
    const smtpPort = Number(process.env.SMTP_PORT || 465);
    return {
      configured: true,
      mode: 'smtp',
      providerName: `SMTP (${smtpHost}:${smtpPort})`,
      missingEnvVars: []
    };
  }
  if ((process.env.EMAIL_OTP_WEBHOOK_URL || '').trim()) {
    return {
      configured: true,
      mode: 'webhook',
      providerName: 'Custom Email Webhook',
      missingEnvVars: []
    };
  }
  if ((process.env.SMTP_TEST_OUTBOX_FILE || '').trim()) {
    return {
      configured: true,
      mode: 'test_outbox',
      providerName: 'Server Test Mail Transport',
      missingEnvVars: []
    };
  }
  const missing: string[] = [];
  if (!smtpHost) missing.push('SMTP_HOST');
  if (!smtpUser) missing.push('SMTP_USER');
  if (!smtpPass) missing.push('SMTP_PASS');
  missing.push('hoặc RESEND_API_KEY');
  return {
    configured: false,
    mode: 'unconfigured',
    providerName: 'Chưa cấu hình dịch vụ gửi mail phía máy chủ',
    missingEnvVars: missing
  };
}

// Verify live server configuration & connection readiness before allowing Gmail OTP authentication
async function verifyEmailProviderConnectionOnServer(): Promise<{
  ready: boolean;
  mode: string;
  providerName: string;
  missingEnvVars: string[];
  error?: string;
}> {
  const status = getEmailProviderStatus();
  if (!status.configured) {
    return {
      ready: false,
      mode: status.mode,
      providerName: status.providerName,
      missingEnvVars: status.missingEnvVars,
      error: `Máy chủ chưa cấu hình dịch vụ gửi email (Thiếu biến môi trường: ${status.missingEnvVars.join(', ')}).`
    };
  }

  if (status.mode === 'resend') {
    const resendKey = (process.env.RESEND_API_KEY || '').trim();
    if (!resendKey.startsWith('re_') || resendKey.length < 10) {
      return {
        ready: false,
        mode: 'resend',
        providerName: status.providerName,
        missingEnvVars: [],
        error: 'Biến môi trường RESEND_API_KEY không đúng định dạng chuẩn (phải bắt đầu bằng "re_").'
      };
    }
    return {
      ready: true,
      mode: 'resend',
      providerName: status.providerName,
      missingEnvVars: []
    };
  }

  if (status.mode === 'smtp') {
    const smtpHost = (process.env.SMTP_HOST || '').trim();
    const smtpPort = Number(process.env.SMTP_PORT || 465);
    const smtpSecure =
      process.env.SMTP_SECURE !== undefined
        ? String(process.env.SMTP_SECURE).toLowerCase() === 'true'
        : smtpPort === 465;
    const smtpUser = (process.env.SMTP_USER || '').trim();
    const smtpPass = (process.env.SMTP_PASS || '').trim();

    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: {
          user: smtpUser,
          pass: smtpPass
        },
        connectionTimeout: 8000
      });
      await transporter.verify();
      return {
        ready: true,
        mode: 'smtp',
        providerName: status.providerName,
        missingEnvVars: []
      };
    } catch (err: any) {
      return {
        ready: false,
        mode: 'smtp',
        providerName: status.providerName,
        missingEnvVars: [],
        error: `Kiểm tra kết nối SMTP (${smtpHost}:${smtpPort}) thất bại: ${err.message}`
      };
    }
  }

  return {
    ready: true,
    mode: status.mode,
    providerName: status.providerName,
    missingEnvVars: []
  };
}

async function sendGmailVerificationCodeViaServer(
  recipientGmail: string,
  fullName: string,
  otpCode: string
): Promise<{ sent: boolean; error?: string }> {
  const status = getEmailProviderStatus();
  if (!status.configured) {
    return {
      sent: false,
      error: `Máy chủ chưa được cấu hình dịch vụ gửi mã xác minh Gmail (thiếu biến môi trường: ${status.missingEnvVars.join(', ')}). Hệ thống không giả lập xác minh.`
    };
  }

  const subject = '[VănAI 12] Mã xác minh tài khoản Giáo viên';
  const textBody = `Xin chào thầy/cô ${fullName},\n\nMã xác minh đăng ký tài khoản Giáo viên VănAI 12 của thầy/cô là: ${otpCode}\nMã có hiệu lực trong 10 phút.\n\nTrân trọng,\nHệ thống Quản trị VănAI 12`;

  // 1. Resend REST API
  if (status.mode === 'resend') {
    const resendKey = (process.env.RESEND_API_KEY || '').trim();
    if (!resendKey.startsWith('re_')) {
      return {
        sent: false,
        error: 'Cấu hình RESEND_API_KEY không hợp lệ (Khóa Resend phải bắt đầu bằng "re_").'
      };
    }
    try {
      const fromAddr = process.env.EMAIL_FROM || 'VanAI 12 <onboarding@resend.dev>';
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: fromAddr,
          to: [recipientGmail],
          subject,
          text: textBody
        })
      });
      if (!resp.ok) {
        const errBody = await resp.text();
        return { sent: false, error: `Lỗi từ dịch vụ Resend API (${resp.status}): ${errBody}` };
      }
      return { sent: true };
    } catch (err: any) {
      return { sent: false, error: `Không thể kết nối Resend API: ${err.message}` };
    }
  }

  // 2. Real SMTP via Nodemailer (e.g., smtp.gmail.com with 16-char App Password)
  if (status.mode === 'smtp') {
    const smtpHost = (process.env.SMTP_HOST || '').trim();
    const smtpPort = Number(process.env.SMTP_PORT || 465);
    const smtpSecure =
      process.env.SMTP_SECURE !== undefined
        ? String(process.env.SMTP_SECURE).toLowerCase() === 'true'
        : smtpPort === 465;
    const smtpUser = (process.env.SMTP_USER || '').trim();
    const smtpPass = (process.env.SMTP_PASS || '').trim();
    const fromAddr = process.env.EMAIL_FROM || `VanAI 12 <${smtpUser}>`;

    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: {
          user: smtpUser,
          pass: smtpPass
        },
        connectionTimeout: 8000
      });
      // Pre-check SMTP connection & credentials before sending
      await transporter.verify();
      await transporter.sendMail({
        from: fromAddr,
        to: recipientGmail,
        subject,
        text: textBody
      });
      return { sent: true };
    } catch (err: any) {
      return {
        sent: false,
        error: `Lỗi gửi mã qua máy chủ SMTP (${smtpHost}:${smtpPort}): ${err.message}`
      };
    }
  }

  // 3. Custom Email Webhook
  if (status.mode === 'webhook' && process.env.EMAIL_OTP_WEBHOOK_URL) {
    try {
      const resp = await fetch(process.env.EMAIL_OTP_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: recipientGmail, fullName, otpCode })
      });
      if (!resp.ok) {
        return { sent: false, error: `Dịch vụ Email Webhook trả về mã lỗi ${resp.status}.` };
      }
      return { sent: true };
    } catch (err: any) {
      return { sent: false, error: `Lỗi gọi Email Webhook: ${err.message}` };
    }
  }

  // 4. Server Test Mail Transport (strictly when SMTP_TEST_OUTBOX_FILE is explicitly set by local test runner)
  if (status.mode === 'test_outbox' && process.env.SMTP_TEST_OUTBOX_FILE) {
    try {
      const outboxPath = path.resolve(process.cwd(), process.env.SMTP_TEST_OUTBOX_FILE);
      let currentOutbox: any[] = [];
      if (fs.existsSync(outboxPath)) {
        currentOutbox = JSON.parse(fs.readFileSync(outboxPath, 'utf-8') || '[]');
      }
      currentOutbox.push({
        to: recipientGmail,
        fullName,
        otpCode,
        sentAt: new Date().toISOString()
      });
      fs.writeFileSync(outboxPath, JSON.stringify(currentOutbox, null, 2), 'utf-8');
      return { sent: true };
    } catch (err: any) {
      return { sent: false, error: `Lỗi ghi test outbox: ${err.message}` };
    }
  }

  return {
    sent: false,
    error: 'Chưa cấu hình dịch vụ gửi email hợp lệ (RESEND_API_KEY hoặc SMTP_HOST/SMTP_USER/SMTP_PASS).'
  };
}

// Verify Firebase Phone Auth ID Token against Google Identity Toolkit API
async function verifyFirebasePhoneIdTokenOnServer(
  firebaseIdToken: string,
  expectedPhone: string
): Promise<{ verified: boolean; phoneNumber?: string; firebaseUid?: string; error?: string }> {
  if (!firebaseIdToken || typeof firebaseIdToken !== 'string') {
    return { verified: false, error: 'Thiếu mã xác thực Firebase Phone Auth (firebaseIdToken).' };
  }

  const normalizedExpected = normalizePhoneE164(expectedPhone);

  // Support HMAC-signed server test token strictly for automated server test suite verification
  if (firebaseIdToken.startsWith('SERVER_PHONE_PROOF.')) {
    const parts = firebaseIdToken.split('.');
    if (parts.length === 3) {
      const [, payloadB64, sig] = parts;
      const expectedSig = crypto
        .createHmac('sha256', SESSION_SECRET)
        .update(`firebase_phone_proof:${payloadB64}`)
        .digest('base64url');
      if (sig === expectedSig) {
        try {
          const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
          if (
            parsed.phone &&
            normalizePhoneE164(parsed.phone) === normalizedExpected &&
            parsed.exp > Date.now()
          ) {
            return {
              verified: true,
              phoneNumber: normalizedExpected,
              firebaseUid: parsed.uid || 'fb-phone-verified'
            };
          }
        } catch {
          // fall through
        }
      }
    }
    return { verified: false, error: 'Chữ ký xác thực số điện thoại không hợp lệ hoặc đã hết hạn.' };
  }

  // Real verification via Google Identity Toolkit accounts:lookup
  const fbConfig = getFirebaseProjectConfig();
  if (!fbConfig.apiKey) {
    return {
      verified: false,
      error: 'Không tìm thấy khóa cấu hình Firebase (firebase-applet-config.json) để kiểm tra token SĐT.'
    };
  }

  try {
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(fbConfig.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: firebaseIdToken })
      }
    );
    const data = (await resp.json()) as any;
    if (!resp.ok || !Array.isArray(data?.users) || data.users.length === 0) {
      return {
        verified: false,
        error:
          data?.error?.message ||
          'Token Firebase Phone Authentication không hợp lệ hoặc đã hết hạn.'
      };
    }

    const fbUser = data.users[0];
    const verifiedPhone = fbUser.phoneNumber ? normalizePhoneE164(fbUser.phoneNumber) : '';
    if (!verifiedPhone) {
      return {
        verified: false,
        error: 'Tài khoản Firebase này chưa xác thực số điện thoại qua SMS OTP.'
      };
    }
    if (verifiedPhone !== normalizedExpected) {
      return {
        verified: false,
        error: `Số điện thoại xác thực trên Firebase (${verifiedPhone}) không khớp với số điện thoại đăng ký (${normalizedExpected}).`
      };
    }

    return {
      verified: true,
      phoneNumber: verifiedPhone,
      firebaseUid: fbUser.localId
    };
  } catch (err: any) {
    return {
      verified: false,
      error: `Lỗi kết nối tới Firebase Identity Toolkit khi kiểm tra OTP SĐT: ${err.message}`
    };
  }
}

function resolveOrHydrateVerifiedSessionUser(
  verified: SessionTokenPayload
): StoredUserAccount | undefined {
  const accounts = loadServerAccounts();
  let dbUser = accounts.find((a) => a.id === verified.uid);
  const configuredFirstAdminUid = getConfiguredFirstAdminUid();
  if (
    !dbUser &&
    verified.role === 'admin' &&
    (!configuredFirstAdminUid || verified.uid === configuredFirstAdminUid)
  ) {
    const now = new Date().toISOString();
    const salt = generateSaltServer();
    dbUser = {
      id: verified.uid,
      username: verified.username || `ADMIN-${verified.uid.slice(0, 6).toUpperCase()}`,
      fullName: 'Quản trị viên Hệ thống',
      role: 'admin',
      isActivated: true,
      passwordSalt: salt,
      passwordHash: hashPasswordServer(crypto.randomBytes(24).toString('hex'), salt),
      createdAt: now,
      lastLoginAt: now,
      status: 'active',
      notes: 'Quản trị viên xác thực qua Firebase Auth (custom claim admin=true)'
    };
    accounts.unshift(dbUser);
    saveServerAccounts(accounts);
  }
  return dbUser;
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  const verified = verifySessionToken(token);
  if (!verified) {
    res.status(401).json({
      error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.'
    });
    return;
  }
  const dbUser = resolveOrHydrateVerifiedSessionUser(verified);
  if (!dbUser || dbUser.status === 'locked') {
    res.status(403).json({
      error: 'Tài khoản không tồn tại hoặc đã bị khóa.'
    });
    return;
  }
  (req as any).authSession = verified;
  (req as any).authUser = dbUser;
  next();
}

function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  const verified = verifySessionToken(token);
  if (!verified) {
    res.status(401).json({
      error: 'Yêu cầu đăng nhập: Chỉ Quản trị viên mới được phép truy cập.'
    });
    return;
  }
  if (verified.role !== 'admin') {
    res.status(403).json({
      error: 'Từ chối truy cập (403): Chức năng này chỉ dành cho Quản trị viên hệ thống.'
    });
    return;
  }
  const configuredFirstAdminUid = getConfiguredFirstAdminUid();
  if (configuredFirstAdminUid && verified.uid !== configuredFirstAdminUid) {
    res.status(403).json({
      error:
        'Từ chối truy cập (403): Chỉ tài khoản có UID khớp với FIRST_ADMIN_UID được cấp custom claim admin=true mới có quyền Quản trị viên.'
    });
    return;
  }
  const dbUser = resolveOrHydrateVerifiedSessionUser(verified);
  if (!dbUser || dbUser.role !== 'admin' || dbUser.status !== 'active') {
    res.status(403).json({
      error: 'Từ chối truy cập (403): Tài khoản Quản trị viên không hợp lệ hoặc đã bị khóa.'
    });
    return;
  }
  (req as any).authSession = verified;
  (req as any).authUser = dbUser;
  next();
}

function requireTeacherAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  const verified = verifySessionToken(token);
  if (!verified) {
    res.status(401).json({
      error: 'Yêu cầu đăng nhập: Chỉ tài khoản Giáo viên đã được Quản trị viên duyệt mới được phép truy cập.'
    });
    return;
  }
  if (verified.role !== 'teacher' && verified.role !== 'admin') {
    res.status(403).json({
      error: 'Từ chối truy cập (403): Tài khoản Học sinh không có quyền đọc/ghi dữ liệu khu vực Giáo viên.'
    });
    return;
  }

  const dbUser = resolveOrHydrateVerifiedSessionUser(verified);
  if (!dbUser || dbUser.status !== 'active') {
    res.status(403).json({
      error: 'Từ chối truy cập (403): Tài khoản không hợp lệ hoặc đang bị tạm khóa.'
    });
    return;
  }

  if (dbUser.role === 'teacher' && dbUser.teacherApprovalStatus !== 'approved') {
    res.status(403).json({
      error:
        'Từ chối truy cập (403): Tài khoản Giáo viên chưa được Quản trị viên phê duyệt. Chỉ giáo viên đã xác minh OTP và được Quản trị viên duyệt mới được sử dụng khu vực giáo viên.'
    });
    return;
  }

  (req as any).authSession = verified;
  (req as any).authUser = dbUser;
  next();
}

function sanitizeAccountForClient(acc: StoredUserAccount, includeActivationCode = false) {
  const { passwordHash, passwordSalt, activationCode, activationCodeExpiresAt, ...safe } = acc;
  if (includeActivationCode) {
    return { ...safe, activationCode, activationCodeExpiresAt };
  }
  return safe;
}

function enrichClassroomForClient(
  cls: StoredClassroomRecord,
  accounts: StoredUserAccount[]
): StoredClassroomRecord & { remainingSeats: number } {
  const enrolledCount = accounts.filter(
    (a) =>
      a.role === 'student' &&
      (a.classId === cls.id || (a.teacherUid === cls.teacherUid && a.className === cls.name))
  ).length;
  return {
    ...cls,
    enrolledCount,
    maxCapacity: MAX_ENROLLED_STUDENTS_PER_CLASS,
    remainingSeats: Math.max(0, MAX_ENROLLED_STUDENTS_PER_CLASS - enrolledCount)
  };
}

function sanitizeRegistrationForClient(
  reg: StoredTeacherRegistration,
  classes: StoredClassroomRecord[],
  accounts: StoredUserAccount[]
) {
  const { gmailOtpHash, gmailOtpSalt, ...safe } = reg;
  const teacherClasses = classes
    .filter((c) => c.teacherUid === reg.teacherUid)
    .map((c) => enrichClassroomForClient(c, accounts));
  const activeClassesCount = teacherClasses.filter((c) => c.status === 'active').length;
  const totalEnrolledStudentsCount = accounts.filter(
    (a) => a.role === 'student' && a.teacherUid === reg.teacherUid
  ).length;

  return {
    ...safe,
    activeClassesCount,
    remainingClassesQuota: Math.max(0, MAX_ACTIVE_CLASSES_PER_TEACHER - activeClassesCount),
    totalEnrolledStudentsCount,
    classes: teacherClasses
  };
}

export function createApiApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  // ==========================================================================
  // 1. HEALTH & BOOTSTRAP STATUS ENDPOINT
  // ==========================================================================
  app.get('/api/health', (_req, res) => {
    const accounts = loadServerAccounts();
    const configuredUid = getConfiguredFirstAdminUid();
    const hasAdminAccount = accounts.some(
      (a) =>
        a.role === 'admin' &&
        a.status === 'active' &&
        (!configuredUid || a.id === configuredUid)
    );
    const hasTeacherAccount = accounts.some(
      (a) => a.role === 'teacher' && a.status === 'active' && a.teacherApprovalStatus === 'approved'
    );
    res.status(200).json({
      status: 'ok',
      geminiConfigured: Boolean(getResolvedGeminiApiKey()),
      emailProviderStatus: getEmailProviderStatus(),
      firebaseAdminStatus: getFirebaseAdminStatus(),
      hasAdminAccount,
      hasTeacherAccount,
      timestamp: new Date().toISOString()
    });
  });

  const handleBootstrapStatus = (_req: Request, res: Response) => {
    const accounts = loadServerAccounts();
    const configuredUid = getConfiguredFirstAdminUid();
    const adminStatus = getFirebaseAdminStatus();
    const hasAdminAccount = accounts.some(
      (a) =>
        a.role === 'admin' &&
        a.status === 'active' &&
        (!configuredUid || a.id === configuredUid)
    );
    const hasTeacherAccount = accounts.some(
      (a) => a.role === 'teacher' && a.status === 'active' && a.teacherApprovalStatus === 'approved'
    );
    res.status(200).json({
      status: 'ok',
      needsAdminBootstrap: !hasAdminAccount,
      needsTeacherBootstrap: !hasTeacherAccount,
      emailProviderStatus: getEmailProviderStatus(),
      firebaseAdminStatus: adminStatus,
      totalAccounts: accounts.length,
      timestamp: new Date().toISOString()
    });
  };

  app.get('/api/auth/bootstrap-status', handleBootstrapStatus);
  app.get('/api/admin/config-status', handleBootstrapStatus);

  // Khoá hoàn toàn việc tự tạo hoặc tự nâng quyền Quản trị viên qua biểu mẫu giao diện.
  // Chỉ cho phép kích hoạt quy trình Firebase Admin SDK nếu người gọi cung cấp Firebase ID Token hợp lệ
  // trùng khớp với FIRST_ADMIN_UID đã được cấu hình ở phía máy chủ.
  app.post('/api/auth/bootstrap-admin', async (req, res) => {
    const { firebaseIdToken } = req.body || {};
    if (!firebaseIdToken) {
      res.status(403).json({
        success: false,
        errorCategory: 'PERMISSION_ERROR',
        code: 'MISSING_FIREBASE_ID_TOKEN',
        message:
          'Từ chối truy cập (403): Hệ thống không cho phép tự đăng ký hoặc tự nâng quyền Quản trị viên qua giao diện. Quản trị viên đầu tiên phải được xác thực bằng Firebase ID Token khớp với FIRST_ADMIN_UID ở phía máy chủ.'
      });
      return;
    }

    const adminStatus = getFirebaseAdminStatus();
    const configuredUid = getConfiguredFirstAdminUid();
    if (!configuredUid) {
      res.status(503).json({
        success: false,
        errorCategory: 'CONFIG_ERROR',
        code: 'FIRST_ADMIN_UID_NOT_CONFIGURED',
        message:
          'Lỗi cấu hình máy chủ (503): Máy chủ chưa đọc được biến môi trường FIRST_ADMIN_UID. Hãy kiểm tra biến FIRST_ADMIN_UID trên môi trường máy chủ (hoặc Redeploy trên Vercel sau khi lưu Environment Variables).'
      });
      return;
    }

    if (!adminStatus.serviceAccountConfigured) {
      res.status(503).json({
        success: false,
        errorCategory: 'CONFIG_ERROR',
        code: 'ADMIN_SDK_NOT_CONFIGURED',
        message:
          adminStatus.initializationError
            ? `Lỗi cấu hình FIREBASE_SERVICE_ACCOUNT_JSON trên máy chủ: ${adminStatus.initializationError}`
            : 'Lỗi cấu hình máy chủ (503): Máy chủ chưa đọc được biến môi trường FIREBASE_SERVICE_ACCOUNT_JSON.'
      });
      return;
    }

    const verifiedToken = await verifyFirebaseIdTokenOnServer(String(firebaseIdToken));
    if (!verifiedToken.valid || !verifiedToken.uid) {
      res.status(401).json({
        success: false,
        errorCategory: 'TOKEN_ERROR',
        code: 'INVALID_FIREBASE_TOKEN',
        message: verifiedToken.error || 'Firebase ID Token không hợp lệ hoặc đã hết hạn.'
      });
      return;
    }

    if (verifiedToken.uid !== configuredUid) {
      res.status(403).json({
        success: false,
        errorCategory: 'PERMISSION_ERROR',
        code: 'ADMIN_UID_MISMATCH',
        message: `Từ chối quyền Quản trị viên (403): UID tài khoản hiện tại (${verifiedToken.uid}) không khớp với FIRST_ADMIN_UID được cấu hình trên máy chủ.`
      });
      return;
    }

    try {
      const execResult = await executeServerAdminBootstrap(configuredUid);
      const accounts = loadServerAccounts().filter(
        (a) => !(a.role === 'admin' && a.id !== configuredUid)
      );
      const now = new Date().toISOString();
      const salt = generateSaltServer();
      let adminAcc = accounts.find((a) => a.id === configuredUid);
      if (!adminAcc) {
        adminAcc = {
          id: configuredUid,
          username: `ADMIN-${configuredUid.slice(0, 6).toUpperCase()}`,
          fullName: execResult.displayName || execResult.email || 'Quản trị viên Hệ thống',
          role: 'admin',
          email: execResult.email ? execResult.email.toLowerCase() : undefined,
          isActivated: true,
          passwordSalt: salt,
          passwordHash: hashPasswordServer(crypto.randomBytes(24).toString('hex'), salt),
          createdAt: now,
          lastLoginAt: now,
          status: 'active',
          notes: 'Khởi tạo qua Firebase Admin SDK (custom claim admin=true)'
        };
        accounts.unshift(adminAcc);
      } else {
        adminAcc.role = 'admin';
        adminAcc.status = 'active';
        adminAcc.isActivated = true;
        adminAcc.lastLoginAt = now;
      }
      saveServerAccounts(accounts);

      res.status(200).json({
        success: true,
        customClaimGranted: true,
        firestoreAdminDocSynced: execResult.firestoreAdminDocSynced,
        message:
          execResult.message +
          ' Phiên Quản trị viên đã được kích hoạt.'
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        errorCategory: 'CONFIG_ERROR',
        message: err?.message || 'Lỗi khi chạy quy trình Firebase Admin SDK trên máy chủ.'
      });
    }
  });

  // Disable direct self-approval teacher bootstrap: Teachers MUST verify OTP and be approved by Admin
  app.post('/api/auth/bootstrap-teacher', (_req, res) => {
    res.status(403).json({
      success: false,
      message:
        'Giáo viên không thể tự cấp quyền trực tiếp. Vui lòng gửi yêu cầu đăng ký Giáo viên, xác minh mã OTP (Số điện thoại hoặc Gmail) và chờ Quản trị viên phê duyệt.'
    });
  });

  // ==========================================================================
  // 1B. TEACHER REGISTRATION & OWNERSHIP VERIFICATION (PHONE OTP / GMAIL OTP)
  // ==========================================================================
  app.post('/api/teacher-registration/submit', (req, res) => {
    const { username, fullName, phone, gmail, password, verificationMethod } = req.body || {};

    if (!fullName || !phone || !gmail || !password) {
      res.status(400).json({
        success: false,
        message: 'Vui lòng nhập đầy đủ Họ tên, Số điện thoại, địa chỉ Gmail và Mật khẩu tài khoản.'
      });
      return;
    }

    if (String(password).length < 6) {
      res.status(400).json({
        success: false,
        message: 'Mật khẩu tài khoản phải có tối thiểu 6 ký tự.'
      });
      return;
    }

    if (!isValidPhoneFormat(String(phone))) {
      res.status(400).json({
        success: false,
        message: 'Số điện thoại không hợp lệ (VD: 0912345678 hoặc +84912345678).'
      });
      return;
    }

    const normalizedGmail = String(gmail).trim().toLowerCase();
    if (!isValidGmailFormat(normalizedGmail)) {
      res.status(400).json({
        success: false,
        message: 'Địa chỉ Gmail không hợp lệ.'
      });
      return;
    }

    const normalizedPhone = normalizePhoneE164(String(phone));
    const method: TeacherVerificationMethod =
      verificationMethod === 'gmail_otp' ? 'gmail_otp' : 'phone_otp';

    const accounts = loadServerAccounts();
    const registrations = loadTeacherRegistrations();
    const classes = loadServerClasses();

    const desiredUsername = username
      ? String(username).trim().toUpperCase()
      : `GV-${normalizedPhone.slice(-6)}`;

    // Check if an existing registration for this phone or gmail is still pending verification
    const existingReg = registrations.find(
      (r) =>
        r.gmail.toLowerCase() === normalizedGmail ||
        normalizePhoneE164(r.phone) === normalizedPhone ||
        r.username.toUpperCase() === desiredUsername
    );

    if (existingReg) {
      if (existingReg.approvalStatus === 'approved') {
        res.status(409).json({
          success: false,
          message: 'Giáo viên với số điện thoại, Gmail hoặc mã tài khoản này đã được duyệt. Vui lòng đăng nhập.'
        });
        return;
      }
      // Update pending registration details if not approved yet
      existingReg.fullName = String(fullName).trim();
      existingReg.phone = normalizedPhone;
      existingReg.gmail = normalizedGmail;
      existingReg.verificationMethod = method;
      existingReg.updatedAt = new Date().toISOString();

      const linkedAcc = accounts.find((a) => a.id === existingReg.teacherUid);
      if (linkedAcc) {
        const salt = generateSaltServer();
        linkedAcc.fullName = existingReg.fullName;
        linkedAcc.phone = normalizedPhone;
        linkedAcc.email = normalizedGmail;
        linkedAcc.verificationMethod = method;
        linkedAcc.passwordSalt = salt;
        linkedAcc.passwordHash = hashPasswordServer(String(password), salt);
        saveServerAccounts(accounts);
      }
      saveTeacherRegistrations(registrations);

      res.json({
        success: true,
        registration: sanitizeRegistrationForClient(existingReg, classes, accounts),
        emailProviderStatus: getEmailProviderStatus(),
        message: existingReg.isOwnershipVerified
          ? 'Yêu cầu của bạn đã xác minh quyền sở hữu và đang chờ Quản trị viên duyệt.'
          : 'Đã cập nhật thông tin đăng ký. Vui lòng hoàn tất bước xác minh mã OTP.'
      });
      return;
    }

    if (accounts.some((a) => a.username.toUpperCase() === desiredUsername)) {
      res.status(409).json({
        success: false,
        message: `Mã tài khoản "${desiredUsername}" đã tồn tại trong hệ thống.`
      });
      return;
    }

    const salt = generateSaltServer();
    const teacherUid = `teacher-${crypto.randomUUID()}`;
    const registrationId = `treg-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    const newTeacherAccount: StoredUserAccount = {
      id: teacherUid,
      username: desiredUsername,
      fullName: String(fullName).trim(),
      role: 'teacher',
      email: normalizedGmail,
      phone: normalizedPhone,
      verificationMethod: method,
      phoneVerified: false,
      gmailVerified: false,
      teacherApprovalStatus: 'pending_verification',
      isActivated: true,
      passwordSalt: salt,
      passwordHash: hashPasswordServer(String(password), salt),
      createdAt: now,
      status: 'pending_activation',
      notes: 'Đăng ký Giáo viên — Chờ xác minh OTP và Quản trị viên duyệt'
    };

    const newRegistration: StoredTeacherRegistration = {
      id: registrationId,
      teacherUid,
      username: desiredUsername,
      fullName: String(fullName).trim(),
      phone: normalizedPhone,
      gmail: normalizedGmail,
      verificationMethod: method,
      phoneVerified: false,
      gmailVerified: false,
      isOwnershipVerified: false,
      approvalStatus: 'pending_verification',
      createdAt: now,
      updatedAt: now
    };

    accounts.push(newTeacherAccount);
    registrations.unshift(newRegistration);
    saveServerAccounts(accounts);
    saveTeacherRegistrations(registrations);

    res.json({
      success: true,
      registration: sanitizeRegistrationForClient(newRegistration, classes, accounts),
      emailProviderStatus: getEmailProviderStatus(),
      message:
        'Đã ghi nhận hồ sơ đăng ký Giáo viên. Vui lòng xác minh quyền sở hữu Số điện thoại hoặc Gmail để chuyển sang danh sách chờ Quản trị viên duyệt.'
    });
  });

  // Pre-flight check endpoint for server-side Gmail OTP configuration & live connection readiness
  app.get('/api/teacher-registration/email-config-check', async (_req, res) => {
    const check = await verifyEmailProviderConnectionOnServer();
    if (!check.ready) {
      res.status(503).json({
        ready: false,
        mode: check.mode,
        providerName: check.providerName,
        missingEnvVars: check.missingEnvVars,
        message: check.error
      });
      return;
    }
    res.json({
      ready: true,
      mode: check.mode,
      providerName: check.providerName,
      missingEnvVars: [],
      message: `Dịch vụ gửi mã OTP Gmail (${check.providerName}) đã sẵn sàng.`
    });
  });

  // Send Gmail OTP (Generated on Server, hashed with PBKDF2, NEVER stored in plaintext or returned to client)
  app.post('/api/teacher-registration/send-gmail-otp', async (req, res) => {
    const { registrationId } = req.body || {};
    if (!registrationId) {
      res.status(400).json({ success: false, message: 'Thiếu mã hồ sơ đăng ký (registrationId).' });
      return;
    }

    const registrations = loadTeacherRegistrations();
    const reg = registrations.find((r) => r.id === registrationId || r.teacherUid === registrationId);
    if (!reg) {
      res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ đăng ký giáo viên.' });
      return;
    }

    // Anti-abuse cooldown check (20 seconds between OTP sends unless expired)
    if (reg.lastOtpSentAt) {
      const elapsedMs = Date.now() - new Date(reg.lastOtpSentAt).getTime();
      if (elapsedMs < 20000 && !process.env.SMTP_TEST_OUTBOX_FILE) {
        const waitSec = Math.ceil((20000 - elapsedMs) / 1000);
        res.status(429).json({
          success: false,
          message: `Vui lòng đợi ${waitSec} giây trước khi yêu cầu gửi lại mã xác minh Gmail.`
        });
        return;
      }
    }

    const providerStatus = getEmailProviderStatus();
    if (!providerStatus.configured) {
      res.status(503).json({
        success: false,
        providerConfigured: false,
        missingEnvVars: providerStatus.missingEnvVars,
        message: `Chưa thể gửi mã xác minh đến Gmail (${reg.gmail}) vì máy chủ thiếu cấu hình dịch vụ gửi email (${providerStatus.missingEnvVars.join(', ')}). Hệ thống không tạo mã giả lập và không tự động xác minh. Vui lòng bật dịch vụ gửi mail trên máy chủ hoặc chọn xác minh qua OTP Số điện thoại (Firebase Phone Auth).`
      });
      return;
    }

    // Generate 6-digit OTP on the server only
    const otpCode = crypto.randomInt(100000, 999999).toString();
    const otpSalt = generateSaltServer();
    const otpHash = hashOtpCodeServer(otpCode, otpSalt);

    const delivery = await sendGmailVerificationCodeViaServer(reg.gmail, reg.fullName, otpCode);
    if (!delivery.sent) {
      res.status(503).json({
        success: false,
        providerConfigured: false,
        message: delivery.error || 'Không thể gửi email xác minh qua dịch vụ máy chủ.'
      });
      return;
    }

    // Store ONLY the salted hash in the database, never the plaintext OTP
    reg.verificationMethod = 'gmail_otp';
    reg.gmailOtpSalt = otpSalt;
    reg.gmailOtpHash = otpHash;
    reg.gmailOtpExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    reg.gmailOtpAttempts = 0;
    reg.lastOtpSentAt = new Date().toISOString();
    reg.updatedAt = new Date().toISOString();
    saveTeacherRegistrations(registrations);

    res.json({
      success: true,
      providerConfigured: true,
      providerName: providerStatus.providerName,
      expiresAt: reg.gmailOtpExpiresAt,
      message: `Đã gửi mã xác minh 6 chữ số tới địa chỉ Gmail ${reg.gmail}. Mã có hiệu lực trong 10 phút.`
    });
  });

  // Verify Gmail OTP against server-side salted PBKDF2 hash
  app.post('/api/teacher-registration/verify-gmail-otp', (req, res) => {
    const { registrationId, otpCode } = req.body || {};
    if (!registrationId || !otpCode) {
      res.status(400).json({
        success: false,
        message: 'Vui lòng nhập đầy đủ mã hồ sơ đăng ký và mã xác minh Gmail 6 chữ số.'
      });
      return;
    }

    const registrations = loadTeacherRegistrations();
    const accounts = loadServerAccounts();
    const classes = loadServerClasses();
    const reg = registrations.find((r) => r.id === registrationId || r.teacherUid === registrationId);

    if (!reg) {
      res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ đăng ký giáo viên.' });
      return;
    }

    if (!reg.gmailOtpHash || !reg.gmailOtpSalt || !reg.gmailOtpExpiresAt) {
      res.status(400).json({
        success: false,
        message: 'Chưa có mã xác minh Gmail nào được phát hành hoặc mã đã bị hủy. Vui lòng bấm "Gửi mã xác minh Gmail".'
      });
      return;
    }

    if ((reg.gmailOtpAttempts || 0) >= 5) {
      res.status(429).json({
        success: false,
        message: 'Bạn đã nhập sai mã xác minh quá 5 lần. Vui lòng yêu cầu gửi lại mã mới.'
      });
      return;
    }

    if (Date.now() > new Date(reg.gmailOtpExpiresAt).getTime()) {
      res.status(401).json({
        success: false,
        message: 'Mã xác minh Gmail đã hết hạn. Vui lòng yêu cầu gửi lại mã mới.'
      });
      return;
    }

    reg.gmailOtpAttempts = (reg.gmailOtpAttempts || 0) + 1;
    const candidateHash = hashOtpCodeServer(String(otpCode).trim(), reg.gmailOtpSalt);
    const isMatch =
      candidateHash.length === reg.gmailOtpHash.length &&
      crypto.timingSafeEqual(Buffer.from(candidateHash), Buffer.from(reg.gmailOtpHash));

    if (!isMatch) {
      saveTeacherRegistrations(registrations);
      res.status(401).json({
        success: false,
        remainingAttempts: Math.max(0, 5 - reg.gmailOtpAttempts),
        message: `Mã xác minh Gmail không chính xác. Còn ${Math.max(0, 5 - reg.gmailOtpAttempts)} lần thử.`
      });
      return;
    }

    const now = new Date().toISOString();
    reg.gmailVerified = true;
    reg.gmailVerifiedAt = now;
    reg.isOwnershipVerified = true;
    reg.verificationMethod = 'gmail_otp';
    reg.gmailOtpHash = undefined;
    reg.gmailOtpSalt = undefined;
    reg.gmailOtpExpiresAt = undefined;
    reg.gmailOtpAttempts = 0;
    if (reg.approvalStatus === 'pending_verification') {
      reg.approvalStatus = 'pending_admin_approval';
    }
    reg.updatedAt = now;

    const teacherAcc = accounts.find((a) => a.id === reg.teacherUid);
    if (teacherAcc) {
      teacherAcc.gmailVerified = true;
      teacherAcc.verificationMethod = 'gmail_otp';
      if (teacherAcc.teacherApprovalStatus === 'pending_verification') {
        teacherAcc.teacherApprovalStatus = 'pending_admin_approval';
      }
      saveServerAccounts(accounts);
    }
    saveTeacherRegistrations(registrations);

    res.json({
      success: true,
      registration: sanitizeRegistrationForClient(reg, classes, accounts),
      message:
        'Xác minh quyền sở hữu Gmail thành công! Yêu cầu đăng ký của bạn đã chuyển sang trạng thái "Chờ quản trị viên duyệt".'
    });
  });

  // Verify Phone OTP via Real Firebase Phone Authentication Token
  app.post('/api/teacher-registration/verify-phone-otp', async (req, res) => {
    const { registrationId, firebaseIdToken } = req.body || {};
    if (!registrationId || !firebaseIdToken) {
      res.status(400).json({
        success: false,
        message: 'Thiếu mã hồ sơ đăng ký hoặc token xác thực Firebase Phone Authentication.'
      });
      return;
    }

    const registrations = loadTeacherRegistrations();
    const accounts = loadServerAccounts();
    const classes = loadServerClasses();
    const reg = registrations.find((r) => r.id === registrationId || r.teacherUid === registrationId);

    if (!reg) {
      res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ đăng ký giáo viên.' });
      return;
    }

    const verification = await verifyFirebasePhoneIdTokenOnServer(
      String(firebaseIdToken),
      reg.phone
    );
    if (!verification.verified) {
      res.status(401).json({
        success: false,
        message:
          verification.error ||
          'Xác minh OTP Số điện thoại không thành công. Hệ thống không chấp nhận xác minh giả lập.'
      });
      return;
    }

    const now = new Date().toISOString();
    reg.phoneVerified = true;
    reg.phoneVerifiedAt = now;
    reg.isOwnershipVerified = true;
    reg.verificationMethod = 'phone_otp';
    if (reg.approvalStatus === 'pending_verification') {
      reg.approvalStatus = 'pending_admin_approval';
    }
    reg.updatedAt = now;

    const teacherAcc = accounts.find((a) => a.id === reg.teacherUid);
    if (teacherAcc) {
      teacherAcc.phoneVerified = true;
      teacherAcc.verificationMethod = 'phone_otp';
      if (teacherAcc.teacherApprovalStatus === 'pending_verification') {
        teacherAcc.teacherApprovalStatus = 'pending_admin_approval';
      }
      saveServerAccounts(accounts);
    }
    saveTeacherRegistrations(registrations);

    res.json({
      success: true,
      registration: sanitizeRegistrationForClient(reg, classes, accounts),
      message:
        'Xác minh OTP Số điện thoại qua Firebase Phone Auth thành công! Yêu cầu của bạn đã chuyển sang trạng thái "Chờ quản trị viên duyệt".'
    });
  });

  app.get('/api/teacher-registration/status/:identifier', (req, res) => {
    const identifier = String(req.params.identifier || '').trim().toLowerCase();
    const registrations = loadTeacherRegistrations();
    const classes = loadServerClasses();
    const accounts = loadServerAccounts();

    const reg = registrations.find(
      (r) =>
        r.id.toLowerCase() === identifier ||
        r.teacherUid.toLowerCase() === identifier ||
        r.username.toLowerCase() === identifier ||
        r.gmail.toLowerCase() === identifier ||
        normalizePhoneE164(r.phone).toLowerCase() === normalizePhoneE164(identifier).toLowerCase()
    );

    if (!reg) {
      res.status(404).json({ found: false, message: 'Không tìm thấy hồ sơ đăng ký giáo viên.' });
      return;
    }

    res.json({
      found: true,
      registration: sanitizeRegistrationForClient(reg, classes, accounts),
      emailProviderStatus: getEmailProviderStatus()
    });
  });

  // ==========================================================================
  // 1C. ADMINISTRATOR PORTAL ENDPOINTS (PROTECTED BY requireAdminAuth)
  // ==========================================================================
  app.get('/api/admin/overview', requireAdminAuth, (_req, res) => {
    const registrations = loadTeacherRegistrations();
    const accounts = loadServerAccounts();
    const classes = loadServerClasses();
    const auditLogs = loadAdminAuditLogs();

    // Ensure any teacher in accounts has a registration entry for complete visibility
    const regMap = new Map<string, StoredTeacherRegistration>();
    for (const r of registrations) {
      regMap.set(r.teacherUid, r);
    }
    for (const acc of accounts) {
      if (acc.role === 'teacher' && !regMap.has(acc.id)) {
        regMap.set(acc.id, {
          id: `treg-${acc.id}`,
          teacherUid: acc.id,
          username: acc.username,
          fullName: acc.fullName,
          phone: acc.phone || 'Chưa cập nhật',
          gmail: acc.email || 'Chưa cập nhật',
          verificationMethod: acc.verificationMethod || 'phone_otp',
          phoneVerified: Boolean(acc.phoneVerified),
          gmailVerified: Boolean(acc.gmailVerified),
          isOwnershipVerified: Boolean(acc.phoneVerified || acc.gmailVerified),
          approvalStatus: acc.teacherApprovalStatus || 'pending_verification',
          rejectionReason: acc.rejectionReason,
          reviewedByUid: acc.reviewedByUid,
          reviewedByName: acc.reviewedByName,
          reviewedAt: acc.reviewedAt,
          createdAt: acc.createdAt,
          updatedAt: acc.createdAt
        });
      }
    }

    const enrichedRegistrations = Array.from(regMap.values()).map((r) =>
      sanitizeRegistrationForClient(r, classes, accounts)
    );
    const enrichedClasses = classes.map((c) => enrichClassroomForClient(c, accounts));

    res.json({
      registrations: enrichedRegistrations,
      classes: enrichedClasses,
      auditLogs,
      summary: {
        totalTeachers: enrichedRegistrations.length,
        pendingVerificationCount: enrichedRegistrations.filter(
          (r) => r.approvalStatus === 'pending_verification'
        ).length,
        pendingApprovalCount: enrichedRegistrations.filter(
          (r) => r.approvalStatus === 'pending_admin_approval'
        ).length,
        approvedTeachersCount: enrichedRegistrations.filter((r) => r.approvalStatus === 'approved')
          .length,
        rejectedTeachersCount: enrichedRegistrations.filter((r) => r.approvalStatus === 'rejected')
          .length,
        suspendedTeachersCount: enrichedRegistrations.filter(
          (r) => r.approvalStatus === 'suspended'
        ).length,
        totalActiveClasses: enrichedClasses.filter((c) => c.status === 'active').length,
        totalEnrolledStudents: accounts.filter((a) => a.role === 'student').length
      },
      emailProviderStatus: getEmailProviderStatus()
    });
  });

  app.post('/api/admin/teacher-review', requireAdminAuth, (req, res) => {
    const adminUser = (req as any).authUser as StoredUserAccount;
    const { teacherUid, registrationId, action, reason } = req.body || {};

    if (!action || !['approve', 'reject', 'suspend', 'reactivate'].includes(action)) {
      res.status(400).json({
        success: false,
        message: 'Hành động xét duyệt không hợp lệ (approve | reject | suspend | reactivate).'
      });
      return;
    }

    const registrations = loadTeacherRegistrations();
    const accounts = loadServerAccounts();
    const classes = loadServerClasses();
    const auditLogs = loadAdminAuditLogs();

    const reg = registrations.find(
      (r) =>
        (teacherUid && r.teacherUid === teacherUid) ||
        (registrationId && r.id === registrationId)
    );

    if (!reg) {
      res.status(404).json({
        success: false,
        message: 'Không tìm thấy hồ sơ đăng ký của giáo viên này.'
      });
      return;
    }

    const teacherAcc = accounts.find((a) => a.id === reg.teacherUid && a.role === 'teacher');
    if (!teacherAcc) {
      res.status(404).json({
        success: false,
        message: 'Không tìm thấy tài khoản giáo viên liên kết.'
      });
      return;
    }

    const now = new Date().toISOString();

    if (action === 'approve' || action === 'reactivate') {
      // Strictly enforce ownership verification before admin approval
      if (!reg.isOwnershipVerified || (!reg.phoneVerified && !reg.gmailVerified)) {
        res.status(400).json({
          success: false,
          message:
            'Không thể duyệt: Giáo viên này chưa hoàn tất xác minh mã OTP (Số điện thoại hoặc Gmail). Giáo viên phải xác minh quyền sở hữu trước khi Quản trị viên phê duyệt.'
        });
        return;
      }

      reg.approvalStatus = 'approved';
      reg.rejectionReason = undefined;
      reg.suspensionReason = undefined;
      reg.reviewedByUid = adminUser.id;
      reg.reviewedByName = adminUser.fullName;
      reg.reviewedAt = now;
      reg.updatedAt = now;

      teacherAcc.teacherApprovalStatus = 'approved';
      teacherAcc.status = 'active';
      teacherAcc.isActivated = true;
      teacherAcc.rejectionReason = undefined;
      teacherAcc.reviewedByUid = adminUser.id;
      teacherAcc.reviewedByName = adminUser.fullName;
      teacherAcc.reviewedAt = now;
    } else if (action === 'reject') {
      const trimmedReason = String(reason || '').trim();
      if (!trimmedReason) {
        res.status(400).json({
          success: false,
          message: 'Vui lòng nhập lí do từ chối hồ sơ giáo viên.'
        });
        return;
      }

      reg.approvalStatus = 'rejected';
      reg.rejectionReason = trimmedReason;
      reg.reviewedByUid = adminUser.id;
      reg.reviewedByName = adminUser.fullName;
      reg.reviewedAt = now;
      reg.updatedAt = now;

      teacherAcc.teacherApprovalStatus = 'rejected';
      teacherAcc.rejectionReason = trimmedReason;
      teacherAcc.status = 'locked';
      teacherAcc.reviewedByUid = adminUser.id;
      teacherAcc.reviewedByName = adminUser.fullName;
      teacherAcc.reviewedAt = now;
    } else if (action === 'suspend') {
      const trimmedReason = String(reason || 'Tạm khóa bởi Quản trị viên').trim();
      reg.approvalStatus = 'suspended';
      reg.suspensionReason = trimmedReason;
      reg.reviewedByUid = adminUser.id;
      reg.reviewedByName = adminUser.fullName;
      reg.reviewedAt = now;
      reg.updatedAt = now;

      teacherAcc.teacherApprovalStatus = 'suspended';
      teacherAcc.rejectionReason = trimmedReason;
      teacherAcc.status = 'locked';
      teacherAcc.reviewedByUid = adminUser.id;
      teacherAcc.reviewedByName = adminUser.fullName;
      teacherAcc.reviewedAt = now;
    }

    const auditEntry: StoredAdminAuditLog = {
      id: `audit-${crypto.randomUUID()}`,
      action:
        action === 'approve'
          ? 'approve_teacher'
          : action === 'reject'
          ? 'reject_teacher'
          : action === 'suspend'
          ? 'suspend_teacher'
          : 'reactivate_teacher',
      targetTeacherUid: reg.teacherUid,
      targetTeacherName: reg.fullName,
      reason: reason ? String(reason).trim() : undefined,
      performedByUid: adminUser.id,
      performedByName: adminUser.fullName,
      performedAt: now
    };

    auditLogs.unshift(auditEntry);
    saveTeacherRegistrations(registrations);
    saveServerAccounts(accounts);
    saveAdminAuditLogs(auditLogs);

    // Đồng bộ quyền Giáo viên vào Cloud Firestore (/admins/{teacherUid}) qua Firebase Admin SDK (nếu đã cấu hình)
    syncTeacherRoleInFirestoreAdminSdk({
      teacherUid: reg.teacherUid,
      approved: action === 'approve' || action === 'reactivate',
      reviewedByUid: adminUser.id
    }).catch(() => {});

    res.json({
      success: true,
      registration: sanitizeRegistrationForClient(reg, classes, accounts),
      auditLog: auditEntry,
      message:
        action === 'approve'
          ? `Đã phê duyệt tài khoản Giáo viên ${reg.fullName}.`
          : action === 'reject'
          ? `Đã từ chối yêu cầu của Giáo viên ${reg.fullName}.`
          : action === 'suspend'
          ? `Đã tạm khóa tài khoản Giáo viên ${reg.fullName}.`
          : `Đã mở khóa lại tài khoản Giáo viên ${reg.fullName}.`
    });
  });

  // ==========================================================================
  // 2. AUTHENTICATION & ROSTER ENDPOINTS (REAL BACKEND VERIFICATION + RBAC)
  // ==========================================================================
  app.get(['/api/accounts', '/api/teacher/accounts'], requireTeacherAuth, (req, res) => {
    const session = (req as any).authSession as SessionTokenPayload;
    const accounts = loadServerAccounts();

    // Admin sees all accounts; Approved Teacher sees ONLY their own account + students in their scope
    const scopedAccounts =
      session.role === 'admin'
        ? accounts
        : accounts.filter(
            (acc) =>
              acc.id === session.uid ||
              (acc.role === 'student' && acc.teacherUid === session.uid)
          );

    res.json({
      accounts: scopedAccounts.map((acc) => sanitizeAccountForClient(acc, true))
    });
  });

  app.get('/api/auth/me', requireAuth, (req, res) => {
    const session = (req as any).authSession as SessionTokenPayload;
    const accounts = loadServerAccounts();
    const user = accounts.find((a) => a.id === session.uid);
    if (!user || user.status === 'locked') {
      res.status(401).json({ authenticated: false });
      return;
    }
    if (user.role === 'teacher' && user.teacherApprovalStatus !== 'approved') {
      res.status(403).json({
        authenticated: false,
        error: 'Tài khoản giáo viên chưa được Quản trị viên phê duyệt hoặc đã bị tạm khóa.'
      });
      return;
    }
    res.json({
      authenticated: true,
      user: sanitizeAccountForClient(user),
      adminApprovalSignature:
        user.role === 'teacher' || user.role === 'admin'
          ? generateAdminApprovalSignature(user.id)
          : undefined
    });
  });

  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      res.status(400).json({
        success: false,
        message: 'Vui lòng nhập đầy đủ Mã tài khoản (hoặc Gmail) và Mật khẩu.'
      });
      return;
    }

    const accounts = loadServerAccounts();
    const trimmedInput = String(username).trim();
    const normalizedUsername = trimmedInput.toUpperCase();
    const normalizedEmail = trimmedInput.toLowerCase();

    const user = accounts.find(
      (a) =>
        a.username.toUpperCase() === normalizedUsername ||
        (a.email && a.email.toLowerCase() === normalizedEmail)
    );

    if (!user) {
      res.status(404).json({
        success: false,
        message: `Không tìm thấy tài khoản "${username}".`
      });
      return;
    }

    if (!user.passwordHash || !user.passwordSalt) {
      res.status(403).json({
        success: false,
        message:
          'Tài khoản này chưa được kích hoạt. Vui lòng chuyển sang tab "Kích hoạt mã 1 lần" và nhập mã 6 chữ số do giáo viên cấp.'
      });
      return;
    }

    const computedHash = hashPasswordServer(String(password), user.passwordSalt);
    if (computedHash !== user.passwordHash) {
      res.status(401).json({
        success: false,
        message: 'Mật khẩu không chính xác.'
      });
      return;
    }

    // Quản trị viên bắt buộc phải đăng nhập qua Firebase Authentication (với UID được cấp custom claim admin=true)
    if (user.role === 'admin') {
      res.status(403).json({
        success: false,
        code: 'ADMIN_MUST_USE_FIREBASE_AUTH',
        message:
          'Tài khoản Quản trị viên chỉ được phép xác thực qua Firebase Authentication (Google Sign-In) với UID đã được cấp custom claim admin=true bằng Firebase Admin SDK.'
      });
      return;
    }

    // Teacher approval & verification gate: unapproved teachers cannot log into Teacher Portal
    if (user.role === 'teacher') {
      const registrations = loadTeacherRegistrations();
      const reg = registrations.find((r) => r.teacherUid === user.id);

      if (user.teacherApprovalStatus === 'pending_verification') {
        res.status(403).json({
          success: false,
          code: 'TEACHER_PENDING_VERIFICATION',
          registrationId: reg?.id,
          message:
            'Tài khoản Giáo viên chưa xác minh mã OTP (Số điện thoại hoặc Gmail). Vui lòng hoàn tất xác minh quyền sở hữu trước khi chờ Quản trị viên duyệt.'
        });
        return;
      }
      if (user.teacherApprovalStatus === 'pending_admin_approval') {
        res.status(403).json({
          success: false,
          code: 'TEACHER_PENDING_APPROVAL',
          registrationId: reg?.id,
          message:
            'Hồ sơ Giáo viên của bạn đã xác minh OTP thành công và đang ở trạng thái "Chờ quản trị viên duyệt". Bạn sẽ đăng nhập được ngay sau khi Quản trị viên phê duyệt.'
        });
        return;
      }
      if (user.teacherApprovalStatus === 'rejected') {
        res.status(403).json({
          success: false,
          code: 'TEACHER_REJECTED',
          registrationId: reg?.id,
          rejectionReason: user.rejectionReason || reg?.rejectionReason,
          message: `Yêu cầu tham gia Giáo viên đã bị Quản trị viên từ chối. Lí do: ${
            user.rejectionReason || reg?.rejectionReason || 'Không đạt yêu cầu xác thực'
          }`
        });
        return;
      }
      if (user.teacherApprovalStatus === 'suspended' || user.status === 'locked') {
        res.status(403).json({
          success: false,
          code: 'TEACHER_SUSPENDED',
          message: `Tài khoản Giáo viên đang bị Quản trị viên tạm khóa.${
            user.rejectionReason ? ' Lí do: ' + user.rejectionReason : ''
          }`
        });
        return;
      }
    }

    if (user.status === 'locked') {
      res.status(403).json({
        success: false,
        message: 'Tài khoản này đang bị tạm khóa. Vui lòng liên hệ giáo viên hoặc quản trị viên.'
      });
      return;
    }

    if (!user.isActivated) {
      res.status(403).json({
        success: false,
        message:
          'Tài khoản học sinh chưa kích hoạt mật khẩu lần đầu. Vui lòng dùng mã kích hoạt 6 chữ số.'
      });
      return;
    }

    user.lastLoginAt = new Date().toISOString();
    saveServerAccounts(accounts);

    const sessionToken = signSessionToken({
      uid: user.id,
      username: user.username,
      role: user.role
    });

    res.json({
      success: true,
      user: sanitizeAccountForClient(user),
      sessionToken,
      adminApprovalSignature:
        user.role === 'teacher'
          ? generateAdminApprovalSignature(user.id)
          : undefined
    });
  });

  app.post('/api/auth/activate', (req, res) => {
    const { username, activationCode, newPassword } = req.body || {};
    if (!username || !activationCode || !newPassword) {
      res.status(400).json({
        success: false,
        message: 'Vui lòng nhập đầy đủ Mã tài khoản, Mã kích hoạt 6 số và Mật khẩu mới.'
      });
      return;
    }

    if (String(newPassword).length < 6) {
      res.status(400).json({
        success: false,
        message: 'Mật khẩu mới phải có tối thiểu 6 ký tự.'
      });
      return;
    }

    const accounts = loadServerAccounts();
    const normalizedUsername = String(username).trim().toUpperCase();
    const trimmedCode = String(activationCode).trim();
    const user = accounts.find(
      (a) => a.role === 'student' && a.username.toUpperCase() === normalizedUsername
    );

    if (!user) {
      res.status(404).json({
        success: false,
        message: `Không tìm thấy mã học sinh "${username}" trong danh sách lớp.`
      });
      return;
    }

    if (user.status === 'locked') {
      res.status(403).json({
        success: false,
        message: 'Tài khoản đang bị khóa. Vui lòng liên hệ giáo viên.'
      });
      return;
    }

    if (!user.activationCode || user.activationCode !== trimmedCode) {
      res.status(401).json({
        success: false,
        message: 'Mã kích hoạt 6 chữ số không đúng hoặc đã được sử dụng.'
      });
      return;
    }

    if (user.activationCodeExpiresAt) {
      const expiry = new Date(user.activationCodeExpiresAt).getTime();
      if (Date.now() > expiry) {
        res.status(401).json({
          success: false,
          message: 'Mã kích hoạt đã hết hạn. Vui lòng nhờ giáo viên cấp lại mã mới.'
        });
        return;
      }
    }

    const salt = generateSaltServer();
    user.passwordSalt = salt;
    user.passwordHash = hashPasswordServer(String(newPassword), salt);
    user.isActivated = true;
    user.activationCode = undefined;
    user.activationCodeExpiresAt = undefined;
    user.status = 'active';
    user.lastLoginAt = new Date().toISOString();

    saveServerAccounts(accounts);

    const sessionToken = signSessionToken({
      uid: user.id,
      username: user.username,
      role: user.role
    });

    res.json({
      success: true,
      user: sanitizeAccountForClient(user),
      sessionToken,
      message: 'Kích hoạt tài khoản và thiết lập mật khẩu thành công!'
    });
  });

  app.post('/api/auth/google-match', async (req, res) => {
    const { firebaseIdToken, displayName: clientDisplayName } = req.body || {};

    if (!firebaseIdToken || typeof firebaseIdToken !== 'string') {
      res.status(401).json({
        matched: false,
        message:
          'Thiếu Firebase ID Token xác thực. Hệ thống không chấp nhận email hoặc UID do trình duyệt tự gửi nếu không kèm ID Token đã ký từ Firebase Authentication.'
      });
      return;
    }

    // Hỗ trợ token kiểm thử nội bộ có chữ ký HMAC-SHA256 của máy chủ (chỉ dùng cho kịch bản kiểm thử tự động phía server)
    let verifiedUid = '';
    let verifiedEmail = '';
    let verifiedDisplayName = clientDisplayName ? String(clientDisplayName).trim() : '';
    let isAdminClaim = false;

    if (firebaseIdToken.startsWith('SERVER_ADMIN_CLAIM_PROOF.')) {
      const parts = firebaseIdToken.split('.');
      if (parts.length === 3) {
        const [, payloadB64, sig] = parts;
        const expectedSig = crypto
          .createHmac('sha256', SESSION_SECRET)
          .update(`firebase_admin_claim_proof:${payloadB64}`)
          .digest('base64url');
        if (sig === expectedSig) {
          try {
            const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
            if (parsed.uid && parsed.exp > Date.now()) {
              verifiedUid = String(parsed.uid);
              verifiedEmail = parsed.email ? String(parsed.email).toLowerCase() : '';
              verifiedDisplayName = parsed.displayName || 'Quản trị viên Hệ thống';
              isAdminClaim = parsed.admin === true;
            }
          } catch {
            // fall through
          }
        }
      }
      if (!verifiedUid) {
        res.status(401).json({
          matched: false,
          errorCategory: 'TOKEN_ERROR',
          code: 'INVALID_PROOF_TOKEN',
          message: 'Chữ ký kiểm thử Quản trị viên không hợp lệ hoặc đã hết hạn.'
        });
        return;
      }
    } else {
      const tokenCheck = await verifyFirebaseIdTokenOnServer(firebaseIdToken);
      if (!tokenCheck.valid || !tokenCheck.uid) {
        res.status(401).json({
          matched: false,
          errorCategory: 'TOKEN_ERROR',
          code: 'INVALID_FIREBASE_TOKEN',
          message: tokenCheck.error || 'Không thể xác thực Firebase ID Token trên máy chủ.'
        });
        return;
      }
      verifiedUid = tokenCheck.uid;
      verifiedEmail = (tokenCheck.email || '').trim().toLowerCase();
      verifiedDisplayName = tokenCheck.displayName || verifiedDisplayName;
      isAdminClaim = Boolean(tokenCheck.isAdminClaim);
    }

    const configuredFirstAdminUid = getConfiguredFirstAdminUid();
    const adminStatus = getFirebaseAdminStatus();
    const accounts = loadServerAccounts();

    // Nếu UID đã xác thực trên máy chủ trùng khớp với process.env.FIRST_ADMIN_UID:
    // Tự động đồng bộ custom claim admin=true và hồ sơ /admins/{uid} qua Firebase Admin SDK nếu đã cấu hình Service Account
    if (configuredFirstAdminUid && verifiedUid === configuredFirstAdminUid && !isAdminClaim) {
      if (adminStatus.serviceAccountConfigured) {
        try {
          await executeServerAdminBootstrap(configuredFirstAdminUid);
          isAdminClaim = true;
        } catch (bootErr: any) {
          console.warn(
            '[FirebaseAdmin] Cảnh báo khi tự động đồng bộ custom claim cho FIRST_ADMIN_UID:',
            bootErr?.message || bootErr
          );
          // Vẫn cấp phiên Admin phía máy chủ vì UID trong Firebase ID Token đã được xác minh khớp FIRST_ADMIN_UID
          isAdminClaim = true;
        }
      } else {
        res.status(503).json({
          matched: false,
          errorCategory: 'CONFIG_ERROR',
          code: 'ADMIN_SDK_NOT_CONFIGURED',
          firebaseUid: verifiedUid,
          email: verifiedEmail,
          message: adminStatus.initializationError
            ? `Tài khoản của bạn (UID: ${verifiedUid}) đã khớp với FIRST_ADMIN_UID, nhưng biến môi trường FIREBASE_SERVICE_ACCOUNT_JSON trên máy chủ gặp lỗi định dạng: ${adminStatus.initializationError}`
            : `Tài khoản của bạn (UID: ${verifiedUid}) đã khớp với FIRST_ADMIN_UID, nhưng máy chủ chưa đọc được biến môi trường FIREBASE_SERVICE_ACCOUNT_JSON để khởi tạo Firebase Admin SDK.`
        });
        return;
      }
    }

    // 1. Kiểm tra quyền Quản trị viên:
    //    Bắt buộc phải có custom claim `admin === true` (hoặc vừa được đồng bộ vì khớp FIRST_ADMIN_UID)
    //    và nếu máy chủ có cấu hình FIRST_ADMIN_UID thì UID phải trùng khớp với FIRST_ADMIN_UID.
    const isAuthorizedAdmin =
      isAdminClaim && (!configuredFirstAdminUid || verifiedUid === configuredFirstAdminUid);

    if (isAuthorizedAdmin) {
      // Đảm bảo chỉ UID được uỷ quyền mới có vai trò admin trong kho tài khoản máy chủ
      const cleanedAccounts = accounts.filter(
        (a) => !(a.role === 'admin' && a.id !== verifiedUid)
      );
      let adminUser = cleanedAccounts.find((a) => a.id === verifiedUid);
      const now = new Date().toISOString();

      if (!adminUser) {
        const salt = generateSaltServer();
        adminUser = {
          id: verifiedUid,
          username: `ADMIN-${verifiedUid.slice(0, 6).toUpperCase()}`,
          fullName: verifiedDisplayName || 'Quản trị viên Hệ thống',
          role: 'admin',
          email: verifiedEmail || undefined,
          isActivated: true,
          passwordSalt: salt,
          passwordHash: hashPasswordServer(crypto.randomBytes(24).toString('hex'), salt),
          createdAt: now,
          lastLoginAt: now,
          status: 'active',
          notes: 'Quản trị viên xác thực qua Firebase Auth (custom claim admin=true)'
        };
        cleanedAccounts.unshift(adminUser);
      } else {
        adminUser.role = 'admin';
        adminUser.status = 'active';
        adminUser.isActivated = true;
        adminUser.email = verifiedEmail || adminUser.email;
        adminUser.lastLoginAt = now;
      }

      saveServerAccounts(cleanedAccounts);

      const sessionToken = signSessionToken({
        uid: adminUser.id,
        username: adminUser.username,
        role: 'admin'
      });

      res.status(200).json({
        matched: true,
        firebaseUid: verifiedUid,
        isAdminClaim: true,
        user: sanitizeAccountForClient(adminUser),
        sessionToken,
        adminApprovalSignature: generateAdminApprovalSignature(verifiedUid)
      });
      return;
    }

    // 2. Đối chiếu tài khoản Giáo viên hoặc Học sinh (Không bao giờ cho phép khớp vào vai trò 'admin' nếu không có claim)
    const user = accounts.find(
      (a) =>
        a.role !== 'admin' &&
        (a.id === verifiedUid ||
          (verifiedEmail && a.email && a.email.toLowerCase() === verifiedEmail))
    );

    if (!user) {
      if (!configuredFirstAdminUid) {
        res.status(403).json({
          matched: false,
          errorCategory: 'CONFIG_ERROR',
          code: 'FIRST_ADMIN_UID_NOT_CONFIGURED',
          firebaseUid: verifiedUid,
          email: verifiedEmail,
          message: `Tài khoản Firebase (${verifiedEmail || verifiedUid}, UID: ${verifiedUid}) chưa có trong danh sách Giáo viên/Học sinh, và máy chủ hiện chưa đọc được biến môi trường FIRST_ADMIN_UID.`
        });
        return;
      }

      res.status(403).json({
        matched: false,
        errorCategory: 'PERMISSION_ERROR',
        code: 'ADMIN_UID_MISMATCH',
        firebaseUid: verifiedUid,
        email: verifiedEmail,
        message: `Từ chối quyền truy cập (403): Tài khoản Firebase (${verifiedEmail || verifiedUid}, UID: ${verifiedUid}) không khớp với FIRST_ADMIN_UID đã cấu hình trên máy chủ và chưa có hồ sơ Giáo viên/Học sinh được duyệt.`
      });
      return;
    }

    if (user.role === 'teacher' && user.teacherApprovalStatus !== 'approved') {
      res.status(403).json({
        matched: false,
        firebaseUid: verifiedUid,
        message:
          user.teacherApprovalStatus === 'pending_verification'
            ? 'Tài khoản Giáo viên gắn với Gmail này chưa xác minh OTP. Vui lòng hoàn tất xác minh trước.'
            : user.teacherApprovalStatus === 'pending_admin_approval'
            ? 'Tài khoản Giáo viên gắn với Gmail này đang ở trạng thái "Chờ quản trị viên duyệt".'
            : `Tài khoản Giáo viên gắn với Gmail này không được phép truy cập (${user.rejectionReason || 'Đã từ chối/Tạm khóa'}).`
      });
      return;
    }

    if (user.status === 'locked') {
      res.status(403).json({
        matched: false,
        firebaseUid: verifiedUid,
        message: 'Tài khoản gắn với email này đang bị tạm khóa.'
      });
      return;
    }

    user.isActivated = true;
    user.status = 'active';
    user.lastLoginAt = new Date().toISOString();
    saveServerAccounts(accounts);

    const sessionToken = signSessionToken({
      uid: user.id,
      username: user.username,
      role: user.role
    });

    res.json({
      matched: true,
      firebaseUid: verifiedUid,
      isAdminClaim: false,
      user: sanitizeAccountForClient(user),
      sessionToken,
      adminApprovalSignature:
        user.role === 'teacher' ? generateAdminApprovalSignature(user.id) : undefined
    });
  });

  app.post('/api/auth/change-password', requireAuth, (req, res) => {
    const session = (req as any).authSession as SessionTokenPayload;
    const { userId, oldPass, newPass } = req.body || {};
    if (!userId || !oldPass || !newPass || String(newPass).length < 6) {
      res.status(400).json({
        success: false,
        message: 'Vui lòng nhập mật khẩu hiện tại và mật khẩu mới (tối thiểu 6 ký tự).'
      });
      return;
    }

    if (session.uid !== userId && session.role !== 'admin') {
      res.status(403).json({
        success: false,
        message: 'Từ chối truy cập: Bạn chỉ có thể đổi mật khẩu cho chính tài khoản của mình.'
      });
      return;
    }

    const accounts = loadServerAccounts();
    const user = accounts.find((a) => a.id === userId);
    if (!user || !user.passwordSalt || !user.passwordHash) {
      res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản.' });
      return;
    }

    const checkOld = hashPasswordServer(String(oldPass), user.passwordSalt);
    if (checkOld !== user.passwordHash) {
      res.status(401).json({ success: false, message: 'Mật khẩu hiện tại không chính xác.' });
      return;
    }

    const newSalt = generateSaltServer();
    user.passwordSalt = newSalt;
    user.passwordHash = hashPasswordServer(String(newPass), newSalt);
    saveServerAccounts(accounts);

    res.json({ success: true, message: 'Đổi mật khẩu thành công!' });
  });

  // ==========================================================================
  // 2B. TEACHER CLASS & STUDENT QUOTA MANAGEMENT (5 CLASSES x 50 STUDENTS)
  // ==========================================================================
  app.get('/api/classes', requireTeacherAuth, (req, res) => {
    const session = (req as any).authSession as SessionTokenPayload;
    const classes = loadServerClasses();
    const accounts = loadServerAccounts();

    const scopedClasses =
      session.role === 'admin'
        ? classes
        : classes.filter((c) => c.teacherUid === session.uid);

    const enriched = scopedClasses.map((c) => enrichClassroomForClient(c, accounts));
    const activeClassesCount = enriched.filter((c) => c.status === 'active').length;

    res.json({
      classes: enriched,
      quota: {
        activeClassesCount,
        maxActiveClasses: MAX_ACTIVE_CLASSES_PER_TEACHER,
        remainingClassesQuota: Math.max(0, MAX_ACTIVE_CLASSES_PER_TEACHER - activeClassesCount),
        maxStudentsPerClass: MAX_ENROLLED_STUDENTS_PER_CLASS
      }
    });
  });

  // Student endpoint to view their own enrolled class info
  app.get('/api/my-class', requireAuth, (req, res) => {
    const authUser = (req as any).authUser as StoredUserAccount;
    const classes = loadServerClasses();
    const accounts = loadServerAccounts();

    if (authUser.role === 'student') {
      const myClass = classes.find(
        (c) =>
          c.id === authUser.classId ||
          (authUser.teacherUid && c.teacherUid === authUser.teacherUid && c.name === authUser.className) ||
          c.name === authUser.className
      );
      res.json({
        classroom: myClass ? enrichClassroomForClient(myClass, accounts) : null
      });
      return;
    }

    const myClasses = classes
      .filter((c) => c.teacherUid === authUser.id)
      .map((c) => enrichClassroomForClient(c, accounts));
    res.json({ classrooms: myClasses });
  });

  // Create a new Classroom (Enforces max 5 active classes per teacher atomically)
  app.post('/api/classes', requireTeacherAuth, async (req, res) => {
    const session = (req as any).authSession as SessionTokenPayload;
    const authUser = (req as any).authUser as StoredUserAccount;

    if (session.role !== 'teacher') {
      res.status(403).json({
        error: 'Chỉ tài khoản Giáo viên đã được Quản trị viên phê duyệt mới có thể tạo lớp học phụ trách.'
      });
      return;
    }

    const rawName = String(req.body?.name || '').trim();
    if (!rawName) {
      res.status(400).json({ error: 'Vui lòng nhập tên lớp học (VD: 12A1).' });
      return;
    }

    const normalizedName = rawName.toUpperCase();

    await withQuotaLock(async () => {
      const classes = loadServerClasses();
      const accounts = loadServerAccounts();

      const teacherActiveClasses = classes.filter(
        (c) => c.teacherUid === session.uid && c.status === 'active'
      );

      if (
        teacherActiveClasses.some((c) => c.name.trim().toUpperCase() === normalizedName)
      ) {
        res.status(409).json({
          error: `Lớp "${normalizedName}" đã tồn tại trong danh sách lớp đang hoạt động của bạn.`
        });
        return;
      }

      if (teacherActiveClasses.length >= MAX_ACTIVE_CLASSES_PER_TEACHER) {
        res.status(403).json({
          error: `Giới hạn cấp lớp: Mỗi giáo viên chỉ được quản lí tối đa ${MAX_ACTIVE_CLASSES_PER_TEACHER} lớp đang hoạt động (Hiện tại: ${teacherActiveClasses.length}/${MAX_ACTIVE_CLASSES_PER_TEACHER} lớp, còn tạo được 0 lớp). Không cho phép tạo lớp thứ ${
            MAX_ACTIVE_CLASSES_PER_TEACHER + 1
          }.`,
          code: 'MAX_CLASSES_QUOTA_EXCEEDED',
          quota: {
            activeClassesCount: teacherActiveClasses.length,
            maxActiveClasses: MAX_ACTIVE_CLASSES_PER_TEACHER,
            remainingClassesQuota: 0
          }
        });
        return;
      }

      const now = new Date().toISOString();
      const newClass: StoredClassroomRecord = {
        id: `cls-${crypto.randomUUID()}`,
        name: normalizedName,
        teacherUid: session.uid,
        teacherName: authUser.fullName,
        status: 'active',
        enrolledCount: 0,
        maxCapacity: MAX_ENROLLED_STUDENTS_PER_CLASS,
        createdAt: now,
        updatedAt: now
      };

      classes.push(newClass);
      saveServerClasses(classes);

      const newActiveCount = teacherActiveClasses.length + 1;
      res.json({
        success: true,
        classroom: enrichClassroomForClient(newClass, accounts),
        quota: {
          activeClassesCount: newActiveCount,
          maxActiveClasses: MAX_ACTIVE_CLASSES_PER_TEACHER,
          remainingClassesQuota: Math.max(0, MAX_ACTIVE_CLASSES_PER_TEACHER - newActiveCount)
        },
        message: `Đã tạo lớp ${normalizedName} thành công! Bạn đã dùng ${newActiveCount}/${MAX_ACTIVE_CLASSES_PER_TEACHER} lớp (còn tạo được ${Math.max(
          0,
          MAX_ACTIVE_CLASSES_PER_TEACHER - newActiveCount
        )} lớp).`
      });
    });
  });

  // Enroll a Student into a Teacher's Class (Enforces max 50 students/class, anti-duplicate, cross-teacher RBAC, and concurrency lock)
  app.post('/api/accounts/student', requireTeacherAuth, async (req, res) => {
    const session = (req as any).authSession as SessionTokenPayload;
    const authUser = (req as any).authUser as StoredUserAccount;
    const { username, fullName, className, classId, email, notes } = req.body || {};

    if (!username || !fullName || (!className && !classId)) {
      res.status(400).json({ error: 'Vui lòng nhập đủ Mã học sinh, Họ tên và Lớp.' });
      return;
    }

    await withQuotaLock(async () => {
      const accounts = loadServerAccounts();
      const classes = loadServerClasses();

      const normalizedUsername = String(username).trim().toUpperCase();
      const normalizedFullName = String(fullName).trim();
      const normalizedEmail = email ? String(email).trim().toLowerCase() : undefined;
      const targetClassName = String(className || '').trim().toUpperCase();

      // 1. Resolve target class and verify teacher ownership (Cross-Teacher Isolation)
      let targetClass = classes.find(
        (c) =>
          (classId && c.id === classId) ||
          (c.teacherUid === session.uid && c.name.toUpperCase() === targetClassName)
      );

      // If classId was specified and belongs to another teacher -> 403 Forbidden
      if (targetClass && targetClass.teacherUid !== session.uid && session.role !== 'admin') {
        res.status(403).json({
          error:
            'Từ chối truy cập (403): Bạn chỉ được phép quản lí và ghi danh học sinh vào lớp thuộc phạm vi phụ trách của mình.'
        });
        return;
      }

      // Check if className belongs to another teacher when no class exists for current teacher
      if (!targetClass && classId) {
        res.status(404).json({ error: 'Không tìm thấy lớp học được chỉ định.' });
        return;
      }

      // If teacher does not have this class yet, auto-create ONLY if within 5-class quota
      if (!targetClass) {
        const teacherActiveClasses = classes.filter(
          (c) => c.teacherUid === session.uid && c.status === 'active'
        );
        if (teacherActiveClasses.length >= MAX_ACTIVE_CLASSES_PER_TEACHER) {
          res.status(403).json({
            error: `Không thể ghi danh vào lớp mới "${targetClassName}": Bạn đã đạt giới hạn tối đa ${MAX_ACTIVE_CLASSES_PER_TEACHER} lớp đang hoạt động (5/5 lớp). Không được tạo lớp thứ 6.`,
            code: 'MAX_CLASSES_QUOTA_EXCEEDED'
          });
          return;
        }
        const now = new Date().toISOString();
        targetClass = {
          id: `cls-${crypto.randomUUID()}`,
          name: targetClassName,
          teacherUid: session.uid,
          teacherName: authUser.fullName,
          status: 'active',
          enrolledCount: 0,
          maxCapacity: MAX_ENROLLED_STUDENTS_PER_CLASS,
          createdAt: now,
          updatedAt: now
        };
        classes.push(targetClass);
      }

      if (targetClass.status !== 'active') {
        res.status(400).json({ error: `Lớp ${targetClass.name} hiện không ở trạng thái hoạt động.` });
        return;
      }

      // 2. Anti-duplicate check (Prevent duplicate student code or duplicate email in class)
      const duplicateByCode = accounts.find(
        (a) => a.username.toUpperCase() === normalizedUsername
      );
      if (duplicateByCode) {
        res.status(409).json({
          error: `Chống ghi danh trùng: Mã học sinh "${normalizedUsername}" đã tồn tại trong danh sách.`
        });
        return;
      }

      const enrolledInClass = accounts.filter(
        (a) =>
          a.role === 'student' &&
          (a.classId === targetClass!.id ||
            (a.teacherUid === targetClass!.teacherUid &&
              (a.className || '').toUpperCase() === targetClass!.name.toUpperCase()))
      );

      if (
        normalizedEmail &&
        enrolledInClass.some((a) => a.email && a.email.toLowerCase() === normalizedEmail)
      ) {
        res.status(409).json({
          error: `Chống ghi danh trùng: Học sinh với email "${normalizedEmail}" đã được ghi danh trong lớp ${targetClass.name}.`
        });
        return;
      }

      // 3. Enforce max 50 students per class quota
      if (enrolledInClass.length >= MAX_ENROLLED_STUDENTS_PER_CLASS) {
        res.status(403).json({
          error: `Giới hạn sĩ số lớp: Lớp ${targetClass.name} đã đạt tối đa ${MAX_ENROLLED_STUDENTS_PER_CLASS}/${MAX_ENROLLED_STUDENTS_PER_CLASS} học sinh (còn trống 0 chỗ). Không cho phép ghi danh học sinh thứ ${
            MAX_ENROLLED_STUDENTS_PER_CLASS + 1
          }.`,
          code: 'MAX_STUDENTS_QUOTA_EXCEEDED',
          classroom: enrichClassroomForClient(targetClass, accounts)
        });
        return;
      }

      const newAccount: StoredUserAccount = {
        id: `uid-hs-${crypto.randomUUID()}`,
        username: normalizedUsername,
        fullName: normalizedFullName,
        role: 'student',
        className: targetClass.name,
        classId: targetClass.id,
        teacherUid: targetClass.teacherUid,
        email: normalizedEmail,
        isActivated: false,
        activationCode: generateActivationCodeServer(),
        activationCodeExpiresAt: getExpiryDateServer(14),
        status: 'pending_activation',
        createdAt: new Date().toISOString(),
        notes: notes ? String(notes).trim() : undefined
      };

      accounts.unshift(newAccount);
      targetClass.enrolledCount = enrolledInClass.length + 1;
      targetClass.updatedAt = new Date().toISOString();

      saveServerAccounts(accounts);
      saveServerClasses(classes);

      res.json({
        account: sanitizeAccountForClient(newAccount, true),
        classroom: enrichClassroomForClient(targetClass, accounts)
      });
    });
  });

  app.post('/api/accounts/batch', requireTeacherAuth, async (req, res) => {
    const session = (req as any).authSession as SessionTokenPayload;
    const authUser = (req as any).authUser as StoredUserAccount;
    const { rows } = req.body || {};
    if (!Array.isArray(rows)) {
      res.status(400).json({ error: 'Dữ liệu danh sách không hợp lệ.' });
      return;
    }

    await withQuotaLock(async () => {
      const accounts = loadServerAccounts();
      const classes = loadServerClasses();
      const existingSet = new Set(accounts.map((a) => a.username.toUpperCase()));
      const newAccounts: StoredUserAccount[] = [];
      let skippedCount = 0;
      let quotaRejectedCount = 0;

      for (const row of rows) {
        const uname = String(row.username || '').trim().toUpperCase();
        const cname = String(row.className || '12A1').trim().toUpperCase();
        if (!uname || existingSet.has(uname)) {
          skippedCount++;
          continue;
        }

        let targetClass = classes.find(
          (c) => c.teacherUid === session.uid && c.name.toUpperCase() === cname
        );

        if (!targetClass) {
          const teacherActiveCount = classes.filter(
            (c) => c.teacherUid === session.uid && c.status === 'active'
          ).length;
          if (teacherActiveCount >= MAX_ACTIVE_CLASSES_PER_TEACHER) {
            quotaRejectedCount++;
            continue;
          }
          const now = new Date().toISOString();
          targetClass = {
            id: `cls-${crypto.randomUUID()}`,
            name: cname,
            teacherUid: session.uid,
            teacherName: authUser.fullName,
            status: 'active',
            enrolledCount: 0,
            maxCapacity: MAX_ENROLLED_STUDENTS_PER_CLASS,
            createdAt: now,
            updatedAt: now
          };
          classes.push(targetClass);
        }

        const currentClassCount =
          accounts.filter(
            (a) =>
              a.role === 'student' &&
              (a.classId === targetClass!.id ||
                (a.teacherUid === session.uid && (a.className || '').toUpperCase() === cname))
          ).length +
          newAccounts.filter((a) => a.classId === targetClass!.id).length;

        if (currentClassCount >= MAX_ENROLLED_STUDENTS_PER_CLASS) {
          quotaRejectedCount++;
          continue;
        }

        const acc: StoredUserAccount = {
          id: `uid-hs-${crypto.randomUUID()}`,
          username: uname,
          fullName: String(row.fullName || `Học sinh ${uname}`).trim(),
          role: 'student',
          className: targetClass.name,
          classId: targetClass.id,
          teacherUid: session.uid,
          email: row.email ? String(row.email).trim().toLowerCase() : undefined,
          isActivated: false,
          activationCode: generateActivationCodeServer(),
          activationCodeExpiresAt: getExpiryDateServer(14),
          status: 'pending_activation',
          createdAt: new Date().toISOString(),
          notes: row.notes ? String(row.notes).trim() : undefined
        };

        existingSet.add(uname);
        newAccounts.push(acc);
        targetClass.enrolledCount = currentClassCount + 1;
        targetClass.updatedAt = new Date().toISOString();
      }

      if (newAccounts.length === 0 && quotaRejectedCount > 0) {
        res.status(403).json({
          error: `Không thể ghi danh: Đã vượt giới hạn tối đa (${MAX_ACTIVE_CLASSES_PER_TEACHER} lớp/giáo viên hoặc ${MAX_ENROLLED_STUDENTS_PER_CLASS} học sinh/lớp).`
        });
        return;
      }

      const merged = [...newAccounts, ...accounts];
      saveServerAccounts(merged);
      saveServerClasses(classes);

      res.json({
        addedCount: newAccounts.length,
        skippedCount,
        quotaRejectedCount,
        newAccounts: newAccounts.map((a) => sanitizeAccountForClient(a, true))
      });
    });
  });

  app.post('/api/accounts/reset-code', requireTeacherAuth, (req, res) => {
    const session = (req as any).authSession as SessionTokenPayload;
    const { studentId } = req.body || {};
    const accounts = loadServerAccounts();
    const user = accounts.find((a) => a.id === studentId && a.role === 'student');
    if (!user) {
      res.status(404).json({ error: 'Không tìm thấy học sinh.' });
      return;
    }

    if (session.role !== 'admin' && user.teacherUid !== session.uid) {
      res.status(403).json({
        error: 'Từ chối truy cập (403): Giáo viên chỉ được quản lí học sinh thuộc lớp mình phụ trách.'
      });
      return;
    }

    const newCode = generateActivationCodeServer();
    const expiresAt = getExpiryDateServer(14);
    user.activationCode = newCode;
    user.activationCodeExpiresAt = expiresAt;
    user.status = 'pending_activation';
    user.isActivated = false;
    saveServerAccounts(accounts);

    res.json({
      success: true,
      newCode,
      expiresAt,
      account: sanitizeAccountForClient(user, true)
    });
  });

  app.post('/api/accounts/toggle-lock', requireTeacherAuth, (req, res) => {
    const session = (req as any).authSession as SessionTokenPayload;
    const { studentId } = req.body || {};
    const accounts = loadServerAccounts();
    const user = accounts.find((a) => a.id === studentId && a.role === 'student');
    if (!user) {
      res.status(404).json({ error: 'Không tìm thấy học sinh.' });
      return;
    }

    if (session.role !== 'admin' && user.teacherUid !== session.uid) {
      res.status(403).json({
        error: 'Từ chối truy cập (403): Giáo viên chỉ được khóa/mở khóa học sinh thuộc lớp mình phụ trách.'
      });
      return;
    }

    user.status =
      user.status === 'locked'
        ? user.isActivated
          ? 'active'
          : 'pending_activation'
        : 'locked';
    saveServerAccounts(accounts);

    res.json({ account: sanitizeAccountForClient(user, true) });
  });

  // ==========================================================================
  // 2C. UID-SCOPED STUDENT LEARNING STATE ENDPOINTS (PROTECTED BY RBAC)
  // ==========================================================================
  function canAccessStudentRecord(session: SessionTokenPayload, targetUid: string): boolean {
    if (session.role === 'admin') return true;
    if (session.role === 'student') return session.uid === targetUid;
    if (session.role === 'teacher') {
      if (session.uid === targetUid) return true;
      const accounts = loadServerAccounts();
      const student = accounts.find((a) => a.id === targetUid && a.role === 'student');
      return Boolean(student && student.teacherUid === session.uid);
    }
    return false;
  }

  app.get('/api/student-state/:uid', requireAuth, (req, res) => {
    const session = (req as any).authSession as SessionTokenPayload;
    const targetUid = String(req.params.uid || '').trim();

    if (!canAccessStudentRecord(session, targetUid)) {
      res.status(403).json({
        error:
          'Từ chối truy cập (403): Bạn chỉ được phép đọc dữ liệu học tập trong phạm vi tài khoản hoặc lớp học được phân quyền.'
      });
      return;
    }

    const allStates = loadServerStudentStates();
    res.json({
      uid: targetUid,
      state: allStates[targetUid] || null
    });
  });

  app.put('/api/student-state/:uid', requireAuth, (req, res) => {
    const session = (req as any).authSession as SessionTokenPayload;
    const targetUid = String(req.params.uid || '').trim();

    if (!canAccessStudentRecord(session, targetUid)) {
      res.status(403).json({
        error:
          'Từ chối truy cập (403): Bạn chỉ được phép cập nhật dữ liệu học tập trong phạm vi tài khoản hoặc lớp học được phân quyền.'
      });
      return;
    }

    const { survey, readingAttempts, writingRecords, linkedGoogleDocs } = req.body || {};
    const allStates = loadServerStudentStates();
    const prev = allStates[targetUid] || {};
    allStates[targetUid] = {
      uid: targetUid,
      survey: survey !== undefined ? survey : prev.survey || null,
      readingAttempts: Array.isArray(readingAttempts)
        ? readingAttempts
        : prev.readingAttempts || [],
      writingRecords: Array.isArray(writingRecords)
        ? writingRecords
        : prev.writingRecords || [],
      linkedGoogleDocs:
        linkedGoogleDocs && typeof linkedGoogleDocs === 'object'
          ? { ...(prev.linkedGoogleDocs || {}), ...linkedGoogleDocs }
          : prev.linkedGoogleDocs || {},
      updatedAt: new Date().toISOString()
    };
    saveServerStudentStates(allStates);

    res.json({
      success: true,
      uid: targetUid,
      updatedAt: allStates[targetUid].updatedAt
    });
  });

  app.get('/api/student-state/:uid/google-docs', requireAuth, (req, res) => {
    const session = (req as any).authSession as SessionTokenPayload;
    const targetUid = String(req.params.uid || '').trim();

    if (!canAccessStudentRecord(session, targetUid)) {
      res.status(403).json({
        error: 'Từ chối truy cập (403): Không có quyền truy cập liên kết Google Docs ngoài phạm vi phân quyền.'
      });
      return;
    }

    const allStates = loadServerStudentStates();
    const userState = allStates[targetUid] || {};
    res.json({
      uid: targetUid,
      linkedGoogleDocs: userState.linkedGoogleDocs || {}
    });
  });

  app.put('/api/student-state/:uid/google-docs/:taskId', requireAuth, (req, res) => {
    const session = (req as any).authSession as SessionTokenPayload;
    const targetUid = String(req.params.uid || '').trim();
    const taskId = String(req.params.taskId || '').trim();

    if (!canAccessStudentRecord(session, targetUid)) {
      res.status(403).json({
        error: 'Từ chối truy cập (403): Không có quyền lưu liên kết Google Docs ngoài phạm vi phân quyền.'
      });
      return;
    }

    const incomingDoc = req.body?.linkedGoogleDoc;
    if (!incomingDoc || !incomingDoc.docId || !taskId) {
      res.status(400).json({
        error: 'Thiếu thông tin docId hoặc mã nhiệm vụ (taskId) khi lưu liên kết Google Docs.'
      });
      return;
    }

    const allStates = loadServerStudentStates();
    const prev = allStates[targetUid] || {
      uid: targetUid,
      survey: null,
      readingAttempts: [],
      writingRecords: [],
      linkedGoogleDocs: {}
    };
    const nextDocs = {
      ...(prev.linkedGoogleDocs || {}),
      [taskId]: {
        ...incomingDoc,
        studentUid: targetUid,
        taskId,
        savedToProfileAt: new Date().toISOString()
      }
    };
    allStates[targetUid] = {
      ...prev,
      uid: targetUid,
      linkedGoogleDocs: nextDocs,
      updatedAt: new Date().toISOString()
    };
    saveServerStudentStates(allStates);

    res.json({
      success: true,
      uid: targetUid,
      taskId,
      linkedGoogleDoc: nextDocs[taskId]
    });
  });

  app.get('/api/teacher/student-states', requireTeacherAuth, (req, res) => {
    const session = (req as any).authSession as SessionTokenPayload;
    const allStates = loadServerStudentStates();
    if (session.role === 'admin') {
      res.json({ states: allStates });
      return;
    }
    const accounts = loadServerAccounts();
    const myStudentUids = new Set(
      accounts
        .filter((a) => a.role === 'student' && a.teacherUid === session.uid)
        .map((a) => a.id)
    );
    const scopedStates: Record<string, any> = {};
    for (const [uid, st] of Object.entries(allStates)) {
      if (myStudentUids.has(uid) || uid === session.uid) {
        scopedStates[uid] = st;
      }
    }
    res.json({ states: scopedStates });
  });

  // ==========================================================================
  // 2D. UID + TASK-SCOPED PERSISTENT DRAFTS & EXAM RUNNER SESSIONS
  // ==========================================================================
  const DRAFTS_FILE = path.join(DATA_DIR, 'writing_drafts_v2.json');
  const EXAM_SESSIONS_FILE = path.join(DATA_DIR, 'exam_sessions_v2.json');

  function loadKeyValueStore(filePath: string): Record<string, any> {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch (err) {
      console.warn('Error reading store:', filePath, err);
    }
    return {};
  }

  function saveKeyValueStore(filePath: string, data: Record<string, any>): void {
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error writing store:', filePath, err);
    }
  }

  app.get('/api/drafts/:uid/:taskId', requireAuth, (req, res) => {
    const session = (req as any).authSession as SessionTokenPayload;
    const targetUid = String(req.params.uid || '').trim();
    const taskId = String(req.params.taskId || '').trim();

    if (!canAccessStudentRecord(session, targetUid)) {
      res.status(403).json({
        error: 'Từ chối truy cập (403): Không có quyền đọc bản nháp ngoài phạm vi phân quyền.'
      });
      return;
    }

    const store = loadKeyValueStore(DRAFTS_FILE);
    const key = `${targetUid}__${taskId}`;
    res.json({ draft: store[key] || null });
  });

  app.put('/api/drafts/:uid/:taskId', requireAuth, (req, res) => {
    const session = (req as any).authSession as SessionTokenPayload;
    const targetUid = String(req.params.uid || '').trim();
    const taskId = String(req.params.taskId || '').trim();

    if (!canAccessStudentRecord(session, targetUid)) {
      res.status(403).json({
        error: 'Từ chối truy cập (403): Không có quyền lưu bản nháp ngoài phạm vi phân quyền.'
      });
      return;
    }

    const incomingDraft = req.body?.draft;
    if (!incomingDraft || incomingDraft.studentUid !== targetUid || incomingDraft.taskId !== taskId) {
      res.status(400).json({ error: 'Dữ liệu bản nháp không khớp UID hoặc mã nhiệm vụ.' });
      return;
    }

    const store = loadKeyValueStore(DRAFTS_FILE);
    const key = `${targetUid}__${taskId}`;
    const existing = store[key];

    // Bảo vệ các bản đã nộp bất biến (submittedSnapshots) đã lưu trước đó
    const existingSnapshots = Array.isArray(existing?.submittedSnapshots)
      ? existing.submittedSnapshots
      : [];
    const incomingSnapshots = Array.isArray(incomingDraft.submittedSnapshots)
      ? incomingDraft.submittedSnapshots
      : [];
    const mergedSnapshotsMap = new Map<string, any>();
    for (const snap of existingSnapshots) {
      if (snap && snap.snapshotId) mergedSnapshotsMap.set(snap.snapshotId, snap);
    }
    for (const snap of incomingSnapshots) {
      if (snap && snap.snapshotId && !mergedSnapshotsMap.has(snap.snapshotId)) {
        mergedSnapshotsMap.set(snap.snapshotId, { ...snap, isImmutable: true });
      }
    }

    store[key] = {
      ...incomingDraft,
      submittedSnapshots: Array.from(mergedSnapshotsMap.values()),
      serverSavedAt: new Date().toISOString()
    };
    saveKeyValueStore(DRAFTS_FILE, store);

    res.json({
      success: true,
      serverSavedAt: store[key].serverSavedAt
    });
  });

  app.get('/api/exam-sessions/:uid/:examId', requireAuth, (req, res) => {
    const session = (req as any).authSession as SessionTokenPayload;
    const targetUid = String(req.params.uid || '').trim();
    const examId = String(req.params.examId || '').trim();

    if (!canAccessStudentRecord(session, targetUid)) {
      res.status(403).json({
        error: 'Từ chối truy cập (403): Không có quyền đọc phiên thi thử ngoài phạm vi phân quyền.'
      });
      return;
    }

    const store = loadKeyValueStore(EXAM_SESSIONS_FILE);
    const key = `${targetUid}__${examId}`;
    res.json({
      session: store[key] || null,
      serverNowEpochMs: Date.now()
    });
  });

  app.put('/api/exam-sessions/:uid/:examId', requireAuth, (req, res) => {
    const session = (req as any).authSession as SessionTokenPayload;
    const targetUid = String(req.params.uid || '').trim();
    const examId = String(req.params.examId || '').trim();

    if (!canAccessStudentRecord(session, targetUid)) {
      res.status(403).json({
        error: 'Từ chối truy cập (403): Không có quyền lưu phiên thi thử ngoài phạm vi phân quyền.'
      });
      return;
    }

    const incomingSession = req.body?.session;
    if (!incomingSession || incomingSession.studentUid !== targetUid || incomingSession.examId !== examId) {
      res.status(400).json({ error: 'Dữ liệu phiên thi không khớp UID hoặc mã đề thi.' });
      return;
    }

    const store = loadKeyValueStore(EXAM_SESSIONS_FILE);
    const key = `${targetUid}__${examId}`;
    store[key] = {
      ...incomingSession,
      serverSavedAt: new Date().toISOString()
    };
    saveKeyValueStore(EXAM_SESSIONS_FILE, store);

    res.json({
      success: true,
      serverSavedAt: store[key].serverSavedAt,
      serverNowEpochMs: Date.now()
    });
  });

  // Helper to call Gemini with model fallback and timeout protection
  async function generateStructuredGeminiContent(params: {
    contents: any;
    responseSchema: any;
    timeoutMs?: number;
  }): Promise<any> {
    const ai = getGeminiClient();
    const timeoutMs = params.timeoutMs || 25000;
    const candidateModels = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-2.5-flash'];
    let lastError: any = null;

    for (const modelName of candidateModels) {
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('AI_TIMEOUT: Quá thời gian chờ phản hồi từ mô hình Gemini.')), timeoutMs)
        );
        const response: any = await Promise.race([
          ai.models.generateContent({
            model: modelName,
            contents: params.contents,
            config: {
              responseMimeType: 'application/json',
              responseSchema: params.responseSchema
            }
          }),
          timeoutPromise
        ]);

        const rawText = (response?.text || '').trim();
        if (!rawText) {
          throw new Error('INVALID_AI_JSON: Mô hình Gemini trả về phản hồi rỗng.');
        }
        const cleanedJson = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
        return JSON.parse(cleanedJson);
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message || '');
        // Only try next model alias if model name wasn't found (404 / not found)
        if (msg.includes('404') || msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('model')) {
          continue;
        }
        break;
      }
    }
    throw lastError || new Error('Lỗi không xác định khi gọi mô hình Gemini.');
  }

  // Helper to verify that a quote actually exists in the student's submission (prevents hallucinated evidence)
  function filterVerbatimQuotes(quotes: unknown, studentText: string): string[] {
    if (!Array.isArray(quotes) || !studentText) return [];
    const normalizedStudent = studentText.toLowerCase().replace(/\s+/g, ' ').trim();
    return quotes
      .map((q) => String(q || '').trim())
      .filter((q) => {
        if (!q || q.length < 3) return false;
        const normalizedQuote = q.toLowerCase().replace(/\s+/g, ' ').replace(/^["“']+|["”']+$/g, '').trim();
        return normalizedQuote.length >= 3 && normalizedStudent.includes(normalizedQuote);
      });
  }

  function verifySingleQuote(quote: unknown, studentText: string): string {
    const valid = filterVerbatimQuotes([quote], studentText);
    return valid[0] || '';
  }

  // ==========================================================================
  // 2B. SERVER-SIDE EXAM SUBMISSIONS & IMMUTABLE TEACHER APPROVAL
  // ==========================================================================
  const SUBMISSIONS_FILE = path.join(DATA_DIR, 'exam_submissions_v2.json');

  function loadServerSubmissions(): any[] {
    try {
      if (fs.existsSync(SUBMISSIONS_FILE)) {
        const raw = fs.readFileSync(SUBMISSIONS_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (err) {
      console.warn('Error reading server submissions:', err);
    }
    return [];
  }

  function saveServerSubmissions(subs: any[]) {
    try {
      fs.writeFileSync(SUBMISSIONS_FILE, JSON.stringify(subs, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error saving server submissions:', err);
    }
  }

  app.get('/api/submissions', requireAuth, (req, res) => {
    const session = (req as any).authSession as SessionTokenPayload;
    const allSubs = loadServerSubmissions();
    if (session.role === 'teacher') {
      res.json({ submissions: allSubs });
      return;
    }
    res.json({
      submissions: allSubs.filter((s) => s.studentId === session.uid)
    });
  });

  app.post('/api/submissions', requireAuth, (req, res) => {
    const session = (req as any).authSession as SessionTokenPayload;
    const incoming = req.body?.submission;
    if (!incoming || !incoming.id) {
      res.status(400).json({ error: 'Dữ liệu bài nộp không hợp lệ.' });
      return;
    }

    const targetStudentId = session.role === 'student' ? session.uid : incoming.studentId;
    const targetVersion = Number(incoming.submissionVersion) || 1;
    const allSubs = loadServerSubmissions();
    const existingIdx = allSubs.findIndex(
      (s) =>
        s.id === incoming.id ||
        (s.studentId === targetStudentId &&
          s.examId === incoming.examId &&
          (Number(s.submissionVersion) || 1) === targetVersion)
    );

    if (existingIdx !== -1) {
      const existing = allSubs[existingIdx];
      // CRITICAL REQUIREMENT 7: Never allow subsequent AI evaluation to overwrite teacherConfirmedScore
      if (existing.status === 'teacher_approved' || existing.teacherConfirmedScore) {
        allSubs[existingIdx] = {
          ...incoming,
          id: existing.id,
          studentId: existing.studentId || session.uid,
          status: 'teacher_approved',
          teacherConfirmedScore: existing.teacherConfirmedScore
        };
      } else {
        allSubs[existingIdx] = {
          ...incoming,
          id: existing.id,
          studentId: targetStudentId
        };
      }
    } else {
      allSubs.unshift({
        ...incoming,
        studentId: targetStudentId,
        submissionVersion: targetVersion
      });
    }

    saveServerSubmissions(allSubs);
    res.json({ success: true, deduplicated: existingIdx !== -1 });
  });

  app.post('/api/teacher/approve-submission', requireTeacherAuth, (req, res) => {
    const session = (req as any).authSession as SessionTokenPayload;
    const accounts = loadServerAccounts();
    const teacherAcc = accounts.find((a) => a.id === session.uid);
    const { submissionId, readingScore, paragraphScore, essayScore, teacherNotes } = req.body || {};

    if (!submissionId) {
      res.status(400).json({ error: 'Thiếu mã bài nộp cần duyệt.' });
      return;
    }

    // Clamp & validate 4.0 + 2.0 + 4.0 = 10.0 scale
    const rScore = Number(Math.max(0, Math.min(4.0, Number(readingScore) || 0)).toFixed(2));
    const pScore = Number(Math.max(0, Math.min(2.0, Number(paragraphScore) || 0)).toFixed(2));
    const eScore = Number(Math.max(0, Math.min(4.0, Number(essayScore) || 0)).toFixed(2));
    const totalScore = Number(Math.min(10.0, rScore + pScore + eScore).toFixed(2));

    const confirmedScorePayload = {
      readingScore: rScore,
      paragraphScore: pScore,
      essayScore: eScore,
      totalScore,
      teacherNotes: String(teacherNotes || '').trim(),
      confirmedByTeacherId: session.uid,
      confirmedByTeacherName: teacherAcc ? `${teacherAcc.fullName} (${teacherAcc.username})` : session.username,
      confirmedAt:
        new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) +
        ' ' +
        new Date().toLocaleDateString('vi-VN'),
      isLockedAgainstAiOverwrite: true
    };

    const allSubs = loadServerSubmissions();
    const idx = allSubs.findIndex((s) => s.id === submissionId);
    if (idx !== -1) {
      allSubs[idx] = {
        ...allSubs[idx],
        status: 'teacher_approved',
        teacherConfirmedScore: confirmedScorePayload
      };
      saveServerSubmissions(allSubs);
    }

    res.json({
      success: true,
      teacherConfirmedScore: confirmedScorePayload
    });
  });

  // ==========================================================================
  // 3. SERVER-SIDE GEMINI API: PARSE COMPLETE EXAM (TEXT, DOCX, PDF, SCAN IMAGE)
  // ==========================================================================
  app.post('/api/ai/parse-exam', async (req, res) => {
    try {
      if (!process.env.GEMINI_API_KEY) {
        res.status(503).json({
          success: false,
          errorCode: 'GEMINI_NOT_CONFIGURED',
          error: 'Máy chủ chưa được cấu hình biến môi trường bí mật GEMINI_API_KEY.'
        });
        return;
      }

      const { rawExamText, rawGuideText, fileData } = req.body || {};
      const parts: any[] = [];
      if (fileData && fileData.base64Data && fileData.mimeType) {
        parts.push({
          inlineData: {
            mimeType: fileData.mimeType,
            data: fileData.base64Data
          }
        });
      }

      const instructionPrompt = `Bạn là chuyên gia khảo thí Ngữ văn THPT lớp 12. Nhiệm vụ của bạn là đọc đề thi Ngữ văn và hướng dẫn chấm (nếu có) để bóc tách cấu trúc chính xác 100%, tuyệt đối bảo toàn nguyên văn ngữ liệu gốc và câu hỏi gốc.

Quy tắc bắt buộc:
1. KHÔNG tự ý tóm tắt hay viết lại ngữ liệu đọc hiểu; trường "passageContent" phải giữ nguyên văn bản ngữ liệu trong đề.
2. Nhận diện chính xác các câu hỏi Đọc hiểu (thường từ Câu 1 đến Câu 4 hoặc Câu 5). Nếu câu hỏi trong đề có ghi rõ điểm (ví dụ "(0,75 điểm)", "(1,0 điểm)"), đặt "isScoreExplicit" = true và lấy đúng điểm đó. Nếu đề KHÔNG ghi điểm cho câu hỏi, đặt "isScoreExplicit" = false và đề xuất mức điểm hợp lý để tổng Đọc hiểu = 4.0.
3. Nhận diện Phần Viết:
   - Đoạn văn khoảng 200 chữ (thường 2,0 điểm): xác định "nghi_luan_xa_hoi" hay "nghi_luan_van_hoc".
   - Bài văn khoảng 600 chữ (thường 4,0 điểm): xác định "nghi_luan_xa_hoi" hay "nghi_luan_van_hoc".
4. Nhận diện Mẫu đề:
   - "template_a": Đọc hiểu văn bản văn học + Đoạn văn NLVH (~200 chữ) + Bài văn NLXH (~600 chữ).
   - "template_b": Đọc hiểu văn bản thông tin/nghị luận + Đoạn văn NLXH (~200 chữ) + Bài văn NLVH (~600 chữ).
   - "custom": Các cấu trúc khác (không ép vào Mẫu A hay B nếu khác cấu trúc).

${rawExamText ? `NỘI DUNG ĐỀ THI:\n${rawExamText}\n` : ''}
${rawGuideText ? `HƯỚNG DẪN CHẤM / ĐÁP ÁN ĐI KÈM:\n${rawGuideText}\n` : ''}`;

      parts.push({ text: instructionPrompt });

      const parsedJson = await generateStructuredGeminiContent({
        contents: { parts },
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: 'Tiêu đề đề thi' },
            durationMinutes: { type: Type.NUMBER, description: 'Thời gian làm bài (phút), mặc định 120' },
            templateType: {
              type: Type.STRING,
              description: 'template_a, template_b, hoặc custom'
            },
            templateLabel: { type: Type.STRING, description: 'Mô tả mẫu cấu trúc đề' },
            passageTitle: { type: Type.STRING },
            passageAuthor: { type: Type.STRING },
            passageSource: { type: Type.STRING },
            passageGenre: {
              type: Type.STRING,
              description: 'van_hoc, nghi_luan, thong_tin, hoặc tuy_chinh'
            },
            genreName: { type: Type.STRING },
            passageContent: { type: Type.STRING, description: 'Nguyên văn ngữ liệu đọc hiểu' },
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  order: { type: Type.INTEGER },
                  question: { type: Type.STRING },
                  level: {
                    type: Type.STRING,
                    description: 'nhan_biet, thong_hieu, van_dung, hoặc van_dung_cao'
                  },
                  levelName: { type: Type.STRING },
                  maxScore: { type: Type.NUMBER },
                  isScoreExplicit: { type: Type.BOOLEAN },
                  answerGuide: { type: Type.STRING }
                },
                required: ['order', 'question', 'level', 'levelName', 'maxScore', 'isScoreExplicit']
              }
            },
            paragraphTask: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING, description: 'nghi_luan_xa_hoi hoặc nghi_luan_van_hoc' },
                typeName: { type: Type.STRING },
                promptText: { type: Type.STRING },
                maxScore: { type: Type.NUMBER },
                answerGuideOrRubricNote: { type: Type.STRING }
              },
              required: ['type', 'typeName', 'promptText', 'maxScore']
            },
            essayTask: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING, description: 'nghi_luan_xa_hoi hoặc nghi_luan_van_hoc' },
                typeName: { type: Type.STRING },
                promptText: { type: Type.STRING },
                maxScore: { type: Type.NUMBER },
                answerGuideOrRubricNote: { type: Type.STRING }
              },
              required: ['type', 'typeName', 'promptText', 'maxScore']
            }
          },
          required: [
            'title',
            'durationMinutes',
            'templateType',
            'templateLabel',
            'passageGenre',
            'genreName',
            'passageContent',
            'questions',
            'paragraphTask',
            'essayTask'
          ]
        }
      });

      res.json({ success: true, data: parsedJson });
    } catch (error: any) {
      console.error('Gemini parse-exam error:', error);
      res.status(500).json({
        success: false,
        errorCode: String(error?.message || '').startsWith('AI_TIMEOUT') ? 'AI_TIMEOUT' : 'AI_ERROR',
        error: error.message || 'Lỗi khi gọi AI phân tích đề thi.'
      });
    }
  });

  // ==========================================================================
  // 4. SERVER-SIDE GEMINI API: EVALUATE READING COMPREHENSION ANSWER
  // ==========================================================================
  app.post('/api/ai/evaluate-reading', async (req, res) => {
    try {
      if (!process.env.GEMINI_API_KEY) {
        res.status(503).json({
          success: false,
          errorCode: 'GEMINI_NOT_CONFIGURED',
          error: 'Chưa cấu hình khóa bí mật GEMINI_API_KEY trên máy chủ. Hệ thống không tạo điểm AI giả.'
        });
        return;
      }

      const {
        passageText,
        questionText,
        studentAnswer,
        submissionVersion = 1,
        level = 'thong_hieu',
        levelName = 'Thông hiểu',
        maxScore = 1.0,
        answerGuide = '',
        keyConcepts = []
      } = req.body || {};

      if (!passageText || !questionText || !studentAnswer) {
        res.status(400).json({
          success: false,
          errorCode: 'INVALID_INPUT',
          error: 'Thiếu ngữ liệu, câu hỏi hoặc câu trả lời của học sinh.'
        });
        return;
      }

      const clampedMaxScore = Number(Math.max(0.25, Math.min(4.0, Number(maxScore) || 1.0)).toFixed(2));

      const prompt = `Bạn là giáo viên chấm thi Ngữ văn lớp 12 THPT. Hãy đánh giá câu trả lời Đọc hiểu của học sinh (Phiên bản bài làm: v${submissionVersion}).

NGUYÊN TẮC CHẤM BẮT BUỘC:
1. CHẤP NHẬN DIỄN ĐẠT TƯƠNG ĐƯƠNG VỀ Ý: Học sinh có thể dùng từ đồng nghĩa, cách diễn đạt cá nhân hoặc sắp xếp câu khác đáp án mẫu; miễn là đúng bản chất, trúng ý câu hỏi và bám sát ngữ liệu thì vẫn đạt điểm tối đa. Tuyệt đối KHÔNG chấm máy móc bằng cách chỉ dò từ khóa cứng nhắc.
2. KHÔNG BỊA DẪN CHỨNG & KHÔNG BỊA QUY TẮC CHẤM:
   - Trường "studentQuotes" phải trích nguyên văn cụm từ/câu văn thực sự có trong bài làm của học sinh làm căn cứ chấm. Nếu bài học sinh không có câu chữ phù hợp thì trả về mảng rỗng [].
   - Chỉ chấm dựa trên ngữ liệu, câu hỏi và hướng dẫn chấm đã cung cấp.
3. KHÔNG làm bài thay học sinh: Gợi ý bằng chứng trong văn bản (textEvidenceHints) và câu hỏi định hướng (guidingQuestions) để học sinh tự hoàn thiện.
4. Điểm đề xuất ("aiSuggestedScore") phải nằm trong khoảng từ 0 đến tối đa ${clampedMaxScore} điểm.
5. Nếu câu hỏi thuộc mức Vận dụng / Vận dụng cao (câu hỏi mở) hoặc câu trả lời của học sinh có góc nhìn sáng tạo riêng ngoài đáp án mẫu, bắt buộc bật "needsReview" = true để giáo viên bộ môn quyết định.

NGỮ LIỆU ĐỌC HIỂU:
${passageText}

CÂU HỎI (${levelName} - Điểm tối đa: ${clampedMaxScore} điểm):
${questionText}

${answerGuide ? `HƯỚNG DẪN CHẤM / BAREM ĐÁP ÁN:\n${answerGuide}\n` : ''}
${Array.isArray(keyConcepts) && keyConcepts.length > 0 ? `KHÁI NIỆM / Ý TRỌNG TÂM THAM KHẢO: ${keyConcepts.join(', ')}\n` : ''}

BÀI LÀM CỦA HỌC SINH (Phiên bản v${submissionVersion}):
${studentAnswer}`;

      const rawData = await generateStructuredGeminiContent({
        contents: prompt,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
            missingPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
            textEvidenceHints: { type: Type.ARRAY, items: { type: Type.STRING } },
            guidingQuestions: { type: Type.ARRAY, items: { type: Type.STRING } },
            studentQuotes: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Trích dẫn nguyên văn từ câu trả lời của học sinh (không tự bịa)'
            },
            aiSuggestedScore: { type: Type.NUMBER },
            rationale: { type: Type.STRING, description: 'Lí do chấm chi tiết từng ý và đối chiếu ngữ nghĩa' },
            confidenceLevel: {
              type: Type.STRING,
              description: 'high, medium, hoặc low'
            },
            confidenceScore: {
              type: Type.NUMBER,
              description: 'Mức độ chắc chắn từ 0 đến 100'
            },
            needsReview: { type: Type.BOOLEAN },
            reviewReason: { type: Type.STRING }
          },
          required: [
            'strengths',
            'missingPoints',
            'textEvidenceHints',
            'guidingQuestions',
            'studentQuotes',
            'aiSuggestedScore',
            'rationale',
            'confidenceLevel',
            'confidenceScore',
            'needsReview'
          ]
        }
      });

      // Validate & clamp score to [0, clampedMaxScore]
      const rawScore = Number(rawData.aiSuggestedScore);
      const safeScore = Number.isFinite(rawScore)
        ? Number(Math.max(0, Math.min(clampedMaxScore, rawScore)).toFixed(2))
        : 0;

      // Filter quotes to guarantee 0 hallucinated quotes
      const verifiedQuotes = filterVerbatimQuotes(rawData.studentQuotes, String(studentAnswer));

      const confLevel =
        rawData.confidenceLevel === 'high' || rawData.confidenceLevel === 'medium' || rawData.confidenceLevel === 'low'
          ? rawData.confidenceLevel
          : level === 'van_dung' || level === 'van_dung_cao'
          ? 'medium'
          : 'high';

      const confScore = Number.isFinite(Number(rawData.confidenceScore))
        ? Math.max(0, Math.min(100, Math.round(Number(rawData.confidenceScore))))
        : confLevel === 'high'
        ? 88
        : 72;

      const isOpenQuestion = level === 'van_dung' || level === 'van_dung_cao';
      const needsReview = Boolean(rawData.needsReview) || isOpenQuestion || confLevel === 'low';

      res.json({
        success: true,
        feedback: {
          evaluationSource: 'gemini_ai',
          evaluationSourceLabel: 'Chấm sơ bộ bằng Gemini AI (Chờ giáo viên duyệt)',
          submissionVersion: Number(submissionVersion) || 1,
          strengths: Array.isArray(rawData.strengths) ? rawData.strengths : [],
          missingPoints: Array.isArray(rawData.missingPoints) ? rawData.missingPoints : [],
          textEvidenceHints: Array.isArray(rawData.textEvidenceHints) ? rawData.textEvidenceHints : [],
          guidingQuestions: Array.isArray(rawData.guidingQuestions) ? rawData.guidingQuestions : [],
          studentQuotes: verifiedQuotes,
          aiSuggestedScore: safeScore,
          maxScore: clampedMaxScore,
          rationale: String(rawData.rationale || '').trim(),
          confidenceLevel: confLevel,
          confidenceScore: confScore,
          needsReview,
          reviewReason:
            rawData.reviewReason ||
            (isOpenQuestion
              ? 'Câu hỏi mở yêu cầu vận dụng/liên hệ cá nhân; cần giáo viên bộ môn thẩm định và duyệt điểm chính thức.'
              : undefined)
        }
      });
    } catch (error: any) {
      console.error('Gemini evaluate-reading error:', error);
      const msg = String(error?.message || '');
      res.status(500).json({
        success: false,
        errorCode: msg.startsWith('AI_TIMEOUT')
          ? 'AI_TIMEOUT'
          : msg.startsWith('INVALID_AI_JSON')
          ? 'INVALID_AI_JSON'
          : 'AI_ERROR',
        error: error.message || 'Lỗi khi gọi AI phân tích câu trả lời đọc hiểu.'
      });
    }
  });

  // ==========================================================================
  // 5. SERVER-SIDE GEMINI API: EVALUATE WRITING (200W PARAGRAPH / 600W ESSAY)
  // ==========================================================================
  app.post('/api/ai/evaluate-writing', async (req, res) => {
    try {
      if (!process.env.GEMINI_API_KEY) {
        res.status(503).json({
          success: false,
          errorCode: 'GEMINI_NOT_CONFIGURED',
          error: 'Chưa cấu hình khóa bí mật GEMINI_API_KEY trên máy chủ. Hệ thống không tạo điểm AI giả.'
        });
        return;
      }

      const {
        promptText,
        studentEssay,
        submissionVersion = 1,
        essayType = 'nghi_luan_xa_hoi',
        maxScore = 4.0,
        targetWordCount = 600,
        rubric = [],
        answerGuideOrRubricNote = ''
      } = req.body || {};

      if (!promptText || !studentEssay) {
        res.status(400).json({
          success: false,
          errorCode: 'INVALID_INPUT',
          error: 'Thiếu đề bài hoặc bài làm của học sinh.'
        });
        return;
      }

      const isParagraph = Number(maxScore) <= 2.5 || Number(targetWordCount) <= 250;
      const sectionMaxScore = isParagraph ? 2.0 : 4.0;

      // Default official rubric weights (4 criteria summing to 2.0 or 4.0)
      const defaultCriteriaSpec = isParagraph
        ? [
            { id: 'crit-1', name: '1. Đảm bảo thể thức 1 đoạn văn (~200 chữ)', maxCriterionScore: 0.25, weightLabel: '0,25 điểm' },
            { id: 'crit-2', name: '2. Xác định đúng vấn đề nghị luận', maxCriterionScore: 0.25, weightLabel: '0,25 điểm' },
            { id: 'crit-3', name: '3. Triển khai luận điểm, lí lẽ và dẫn chứng', maxCriterionScore: 1.0, weightLabel: '1,0 điểm' },
            { id: 'crit-4', name: '4. Diễn đạt, chính tả và sáng tạo', maxCriterionScore: 0.5, weightLabel: '0,5 điểm' }
          ]
        : [
            { id: 'crit-1', name: '1. Đảm bảo cấu trúc bài nghị luận (Mở - Thân - Kết)', maxCriterionScore: 0.5, weightLabel: '0,5 điểm' },
            { id: 'crit-2', name: '2. Xác định đúng trọng tâm vấn đề nghị luận', maxCriterionScore: 0.5, weightLabel: '0,5 điểm' },
            { id: 'crit-3', name: '3. Hệ thống luận điểm, lí lẽ và dẫn chứng thuyết phục', maxCriterionScore: 2.0, weightLabel: '2,0 điểm' },
            { id: 'crit-4', name: '4. Diễn đạt, liên kết văn bản và sáng tạo cá nhân', maxCriterionScore: 1.0, weightLabel: '1,0 điểm' }
          ];

      const rubricDescription =
        Array.isArray(rubric) && rubric.length > 0
          ? rubric
              .map(
                (r: any, idx: number) =>
                  `- Tiêu chí ${idx + 1} (${r.name || defaultCriteriaSpec[idx]?.name}): Tối đa ${
                    r.maxCriterionScore || defaultCriteriaSpec[idx]?.maxCriterionScore || 0.5
                  }đ (${r.weightLabel || ''}). Yêu cầu: ${r.strengths || r.remedyStep || ''}`
              )
              .join('\n   ')
          : defaultCriteriaSpec
              .map((c) => `- ${c.name}: Tối đa ${c.maxCriterionScore} điểm (${c.weightLabel})`)
              .join('\n   ');

      const prompt = `Bạn là giáo viên chấm thi Ngữ văn lớp 12 THPT. Hãy chấm và nhận xét bài viết nghị luận của học sinh (Phiên bản bài làm: v${submissionVersion}).
Dạng bài: ${isParagraph ? 'Đoạn văn khoảng 200 chữ (Thang điểm tối đa: 2,0 điểm)' : 'Bài văn khoảng 600 chữ (Thang điểm tối đa: 4,0 điểm)'}.
Phân loại: ${essayType === 'nghi_luan_van_hoc' ? 'Nghị luận văn học' : 'Nghị luận xã hội'}.

NGUYÊN TẮC CHẤM BẮT BUỘC:
1. CHẤP NHẬN CÁCH DIỄN ĐẠT TƯƠNG ĐƯƠNG VỀ Ý: Đánh giá thực chất chiều sâu lập luận, mạch lí lẽ và sự phù hợp của dẫn chứng. Không chấm máy móc theo từ khóa nối hay công thức văn mẫu; trân trọng góc nhìn cá nhân hợp lý của học sinh.
2. KHÔNG BỊA DẪN CHỨNG & KHÔNG BỊA QUY TẮC CHẤM:
   - Ở mỗi tiêu chí, trường "studentQuote" PHẢI trích nguyên văn 1 câu hoặc cụm từ thực tế trong bài làm của học sinh làm bằng chứng nhận xét. Nếu không có câu phù hợp trong bài học sinh thì để chuỗi rỗng "". Tuyệt đối không tự sáng tác câu chữ gán cho học sinh.
   - Không bịa thêm quy tắc chấm ngoài đề bài và hệ thống tiêu chí Rubric bên dưới.
3. KIỂM SOÁT ĐIỂM SỐ CHẶT CHẼ:
   - Điểm từng tiêu chí ("scoreAwarded") tuyệt đối KHÔNG vượt quá "maxCriterionScore" của tiêu chí đó.
   - Tổng điểm đề xuất ("aiSuggestedScore") bằng tổng điểm các tiêu chí và KHÔNG vượt quá ${sectionMaxScore} điểm.
4. CỜ CẦN GIÁO VIÊN XEM LẠI ("needsReview"):
   - Đặt "needsReview" = true nếu bài viết có luận điểm/dẫn chứng sáng tạo ngoài khuôn mẫu, có nghi vấn lạc đề, hoặc là bài văn nghị luận dài cần giáo viên thẩm định cảm xúc và chất văn.

RUBRIC CHẤM BÀI (Tổng ${sectionMaxScore} điểm):
   ${rubricDescription}
${answerGuideOrRubricNote ? `\nHƯỚNG DẪN CHẤM BỔ SUNG CỦA ĐỀ:\n${answerGuideOrRubricNote}\n` : ''}

ĐỀ BÀI:
${promptText}

BÀI LÀM CỦA HỌC SINH (Phiên bản v${submissionVersion}):
${studentEssay}`;

      const rawData = await generateStructuredGeminiContent({
        contents: prompt,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            overallImpression: { type: Type.STRING },
            aiSuggestedScore: { type: Type.NUMBER },
            confidenceLevel: { type: Type.STRING, description: 'high, medium, hoặc low' },
            confidenceScore: { type: Type.NUMBER, description: '0 - 100' },
            needsReview: { type: Type.BOOLEAN },
            reviewReason: { type: Type.STRING },
            cautionNote: { type: Type.STRING },
            actionSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
            criteria: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  name: { type: Type.STRING },
                  weightLabel: { type: Type.STRING },
                  scoreLevel: {
                    type: Type.STRING,
                    description: 'Tốt & Sâu sắc, Khá, Đạt cơ bản, hoặc Cần bổ sung'
                  },
                  scoreStatus: {
                    type: Type.STRING,
                    description: 'success, info, hoặc warning'
                  },
                  strengths: { type: Type.STRING },
                  weaknesses: { type: Type.STRING },
                  remedyStep: { type: Type.STRING },
                  rationale: { type: Type.STRING, description: 'Lí do chấm điểm tiêu chí này' },
                  studentQuote: {
                    type: Type.STRING,
                    description: 'Trích dẫn nguyên văn từ bài làm của học sinh (hoặc chuỗi rỗng nếu không có)'
                  },
                  confidenceLevel: { type: Type.STRING, description: 'high, medium, hoặc low' },
                  needsReview: { type: Type.BOOLEAN },
                  scoreAwarded: { type: Type.NUMBER },
                  maxCriterionScore: { type: Type.NUMBER }
                },
                required: [
                  'id',
                  'name',
                  'weightLabel',
                  'scoreLevel',
                  'scoreStatus',
                  'strengths',
                  'weaknesses',
                  'remedyStep',
                  'rationale',
                  'studentQuote',
                  'confidenceLevel',
                  'needsReview',
                  'scoreAwarded',
                  'maxCriterionScore'
                ]
              }
            }
          },
          required: [
            'overallImpression',
            'aiSuggestedScore',
            'confidenceLevel',
            'confidenceScore',
            'needsReview',
            'actionSteps',
            'criteria'
          ]
        }
      });

      // Validate & clamp each criterion score so it never exceeds maxCriterionScore
      const rawCriteria = Array.isArray(rawData.criteria) ? rawData.criteria : [];
      const sanitizedCriteria = defaultCriteriaSpec.map((spec, idx) => {
        const rawCrit = rawCriteria[idx] || {};
        const maxCrit = spec.maxCriterionScore;
        const rawAwarded = Number(rawCrit.scoreAwarded);
        const clampedAwarded = Number.isFinite(rawAwarded)
          ? Number(Math.max(0, Math.min(maxCrit, rawAwarded)).toFixed(2))
          : Number((maxCrit * 0.5).toFixed(2));

        const validLevels = ['Cần bổ sung', 'Đạt cơ bản', 'Khá', 'Tốt & Sâu sắc'];
        const scoreLevel = validLevels.includes(rawCrit.scoreLevel)
          ? rawCrit.scoreLevel
          : clampedAwarded >= maxCrit * 0.85
          ? 'Tốt & Sâu sắc'
          : clampedAwarded >= maxCrit * 0.65
          ? 'Khá'
          : clampedAwarded >= maxCrit * 0.45
          ? 'Đạt cơ bản'
          : 'Cần bổ sung';

        const scoreStatus =
          rawCrit.scoreStatus === 'success' || rawCrit.scoreStatus === 'info' || rawCrit.scoreStatus === 'warning'
            ? rawCrit.scoreStatus
            : scoreLevel === 'Tốt & Sâu sắc' || scoreLevel === 'Khá'
            ? 'success'
            : scoreLevel === 'Đạt cơ bản'
            ? 'info'
            : 'warning';

        return {
          id: spec.id,
          name: rawCrit.name || spec.name,
          weightLabel: spec.weightLabel,
          scoreLevel,
          scoreStatus,
          strengths: String(rawCrit.strengths || '').trim() || 'Đã triển khai nội dung theo tiêu chí.',
          weaknesses: String(rawCrit.weaknesses || '').trim() || 'Cần trau chuốt thêm để đạt điểm tối đa.',
          remedyStep: String(rawCrit.remedyStep || '').trim() || 'Rà soát lại lập luận và cách diễn đạt.',
          rationale:
            String(rawCrit.rationale || '').trim() ||
            `Đạt ${clampedAwarded}/${maxCrit} điểm dựa trên đối chiếu bài viết thực tế với tiêu chí.`,
          studentQuote: verifySingleQuote(rawCrit.studentQuote, String(studentEssay)),
          confidenceLevel:
            rawCrit.confidenceLevel === 'high' || rawCrit.confidenceLevel === 'medium' || rawCrit.confidenceLevel === 'low'
              ? rawCrit.confidenceLevel
              : 'high',
          needsReview: Boolean(rawCrit.needsReview),
          scoreAwarded: clampedAwarded,
          maxCriterionScore: maxCrit
        };
      });

      const criteriaSum = sanitizedCriteria.reduce((sum, c) => sum + (c.scoreAwarded || 0), 0);
      const clampedTotalScore = Number(Math.max(0, Math.min(sectionMaxScore, criteriaSum)).toFixed(2));

      const confLevel =
        rawData.confidenceLevel === 'high' || rawData.confidenceLevel === 'medium' || rawData.confidenceLevel === 'low'
          ? rawData.confidenceLevel
          : 'medium';
      const confScore = Number.isFinite(Number(rawData.confidenceScore))
        ? Math.max(0, Math.min(100, Math.round(Number(rawData.confidenceScore))))
        : 82;

      const anyCritNeedsReview = sanitizedCriteria.some((c) => c.needsReview);
      const needsReview = Boolean(rawData.needsReview) || anyCritNeedsReview || !isParagraph;

      res.json({
        success: true,
        feedback: {
          evaluationSource: 'gemini_ai',
          evaluationSourceLabel: 'Chấm sơ bộ bằng Gemini AI (Chờ giáo viên duyệt)',
          submissionVersion: Number(submissionVersion) || 1,
          overallImpression: String(rawData.overallImpression || '').trim(),
          aiSuggestedScore: clampedTotalScore,
          confidenceLevel: confLevel,
          confidenceScore: confScore,
          needsReview,
          reviewReason:
            rawData.reviewReason ||
            (!isParagraph
              ? 'Bài văn nghị luận 4,0 điểm cần giáo viên bộ môn thẩm định chất văn, cảm xúc và duyệt điểm chính thức.'
              : anyCritNeedsReview
              ? 'Có tiêu chí lập luận hoặc dẫn chứng mở cần giáo viên kiểm tra lại.'
              : undefined),
          cautionNote:
            String(rawData.cautionNote || '').trim() ||
            'Điểm số trên là đề xuất sơ bộ của Gemini AI theo Rubric. Điểm chính thức do Giáo viên bộ môn xét duyệt.',
          actionSteps: Array.isArray(rawData.actionSteps) ? rawData.actionSteps : [],
          criteria: sanitizedCriteria
        }
      });
    } catch (error: any) {
      console.error('Gemini evaluate-writing error:', error);
      const msg = String(error?.message || '');
      res.status(500).json({
        success: false,
        errorCode: msg.startsWith('AI_TIMEOUT')
          ? 'AI_TIMEOUT'
          : msg.startsWith('INVALID_AI_JSON')
          ? 'INVALID_AI_JSON'
          : 'AI_ERROR',
        error: error.message || 'Lỗi khi gọi AI chấm bài viết nghị luận.'
      });
    }
  });

  // Catch-all for unknown /api/* routes so they never fall through to Vite SPA HTML
  app.use('/api', (req, res) => {
    res.status(404).json({
      success: false,
      errorCategory: 'ENDPOINT_ERROR',
      error: `Không tìm thấy đường dẫn API yêu cầu: ${req.method} ${req.originalUrl} (404).`
    });
  });

  // Global JSON error handler for /api/* routes so API never returns empty body or HTML on error
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[API Error]:', err);
    if (!res.headersSent) {
      res.status(err?.status || 500).json({
        success: false,
        errorCategory: 'ENDPOINT_ERROR',
        error: err?.message || 'Lỗi xử lý nội bộ trên máy chủ API.'
      });
    }
  });

  return app;
}

export const apiApp = createApiApp();
export default apiApp;

async function startServer() {
  const app = apiApp;

  // ==========================================================================
  // 6. Vite Middleware (Dev) or Static Assets (Prod)
  // ==========================================================================
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get(/.*/, (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Nếu máy chủ đã cấu hình cả FIRST_ADMIN_UID và khóa dịch vụ Firebase Admin SDK trong .env,
  // tự động đồng bộ custom claim admin=true và hồ sơ /admins/{uid} khi khởi động.
  const startupAdminUid = getConfiguredFirstAdminUid();
  const startupAdminStatus = getFirebaseAdminStatus();
  if (startupAdminUid && startupAdminStatus.serviceAccountConfigured) {
    executeServerAdminBootstrap(startupAdminUid)
      .then((res) => {
        console.log(`[FirebaseAdmin] Đã đồng bộ quyền Quản trị viên đầu tiên cho UID: ${res.uid}`);
      })
      .catch((err) => {
        console.warn('[FirebaseAdmin] Chưa thể tự động đồng bộ FIRST_ADMIN_UID khi khởi động:', err?.message || err);
      });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VănAI 12 Full-Stack Server listening on http://0.0.0.0:${PORT}`);
  });
}

const isMainServerEntry = Boolean(
  process.argv[1] && /server\.(ts|js|mjs|cjs)$/i.test(process.argv[1])
);

if (!IS_VERCEL_RUNTIME && isMainServerEntry) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

