import crypto from "crypto";
import fs from "fs";
import path from "path";
import tls from "tls";
import net from "net";

let express = null;
let nodemailer = null;
let GoogleGenAI = null;
let Type = {
  OBJECT: "OBJECT",
  ARRAY: "ARRAY",
  STRING: "STRING",
  NUMBER: "NUMBER",
  INTEGER: "INTEGER",
  BOOLEAN: "BOOLEAN"
};
let initializeApp = null;
let getApps = null;
let cert = null;
let getAuth = null;
let cachedApiApp = null;
let firebaseDepsLoaded = false;
let fullDepsLoaded = false;

async function ensureFirebaseDepsLoaded() {
  if (firebaseDepsLoaded) return;
  firebaseDepsLoaded = true;
  try {
    const fbApp = await import("firebase-admin/app");
    initializeApp = fbApp.initializeApp;
    getApps = fbApp.getApps;
    cert = fbApp.cert;
  } catch (err) {
    console.warn("[Vercel API] firebase-admin/app dynamic import fallback:", err?.message || err);
  }
  try {
    const fbAuth = await import("firebase-admin/auth");
    getAuth = fbAuth.getAuth;
  } catch (err) {
    console.warn("[Vercel API] firebase-admin/auth dynamic import fallback:", err?.message || err);
  }
}

async function ensureFullApiDepsLoaded() {
  await ensureFirebaseDepsLoaded();
  if (fullDepsLoaded) return;
  fullDepsLoaded = true;
  try {
    const expMod = await import("express");
    express = expMod.default || expMod;
  } catch (err) {
    console.error("[Vercel API] express dynamic import error:", err?.message || err);
  }
  try {
    const nmMod = await import("nodemailer");
    nodemailer = nmMod.default || nmMod;
  } catch (err) {
    console.warn("[Vercel API] nodemailer dynamic import warning:", err?.message || err);
  }
  try {
    const genaiMod = await import("@google/genai");
    GoogleGenAI = genaiMod.GoogleGenAI;
    if (genaiMod.Type) Type = genaiMod.Type;
  } catch (err) {
    console.warn("[Vercel API] @google/genai dynamic import warning:", err?.message || err);
  }
}

function sendJsonResponse(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.end(body);
}

async function parseJsonRequestBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  if (typeof req.body === "string") {
    try {
      return req.body.trim() ? JSON.parse(req.body) : {};
    } catch {
      return {};
    }
  }
  if (Buffer.isBuffer(req.body)) {
    try {
      const str = req.body.toString("utf-8").trim();
      return str ? JSON.parse(str) : {};
    } catch {
      return {};
    }
  }
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf-8").trim();
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

const PORT = Number(process.env.PORT) || 3e3;
const IS_VERCEL_RUNTIME = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
const DATA_DIR = IS_VERCEL_RUNTIME ? path.join("/tmp", "vanai12_data") : path.resolve(process.cwd(), ".data");
const ACCOUNTS_FILE = path.join(DATA_DIR, "accounts_v2.json");
const STUDENT_STATES_FILE = path.join(DATA_DIR, "student_states_v2.json");
const TEACHER_REGISTRATIONS_FILE = path.join(DATA_DIR, "teacher_registrations_v2.json");
const CLASSES_FILE = path.join(DATA_DIR, "classes_v2.json");
const ADMIN_AUDIT_LOGS_FILE = path.join(DATA_DIR, "admin_audit_logs_v2.json");
const MAX_ACTIVE_CLASSES_PER_TEACHER = 5;
const MAX_ENROLLED_STUDENTS_PER_CLASS = 50;
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (err) {
  console.warn("[Server] Kh\xF4ng th\u1EC3 kh\u1EDFi t\u1EA1o th\u01B0 m\u1EE5c d\u1EEF li\u1EC7u c\u1EE5c b\u1ED9:", err);
}
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.createHash("sha256").update(
  `${process.env.FIRST_ADMIN_UID || ""}:${process.env.FIREBASE_SERVICE_ACCOUNT_JSON || ""}:vanai12_hmac_secret_v2`
).digest("hex");
let cachedAdminApp = null;
let adminInitError = null;
let detectedCredentialSource = "none";
function getConfiguredFirstAdminUid() {
  const raw = String(process.env.FIRST_ADMIN_UID || "").trim();
  return raw.replace(/^["']+|["']+$/g, "").trim();
}
function maskUidForDisplay(uid) {
  const clean = String(uid || "").trim();
  if (!clean) return null;
  if (clean.length <= 8) return `${clean.slice(0, 2)}***${clean.slice(-2)}`;
  return `${clean.slice(0, 4)}...${clean.slice(-4)}`;
}
function parseServiceAccountJsonEnv(rawInput) {
  let cleaned = rawInput.trim();
  if (cleaned.startsWith('"') && cleaned.endsWith('"') || cleaned.startsWith("'") && cleaned.endsWith("'")) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    try {
      const unescaped = cleaned.replace(/\\"/g, '"');
      parsed = JSON.parse(unescaped);
    } catch {
      const decodedBase64 = Buffer.from(cleaned, "base64").toString("utf-8").trim();
      parsed = JSON.parse(decodedBase64);
    }
  }
  if (typeof parsed === "string") {
    parsed = JSON.parse(parsed);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON kh\xF4ng ph\u1EA3i l\xE0 \u0111\u1ED1i t\u01B0\u1EE3ng JSON h\u1EE3p l\u1EC7.");
  }
  if (typeof parsed.private_key === "string") {
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  }
  return parsed;
}
function validateServiceAccountKeyWithCrypto(parsed) {
  if (!parsed || typeof parsed.client_email !== "string" || !parsed.client_email.includes("@") || typeof parsed.private_key !== "string" || !parsed.private_key.includes("PRIVATE KEY")) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_JSON thi\u1EBFu tr\u01B0\u1EDDng client_email ho\u1EB7c private_key h\u1EE3p l\u1EC7."
    );
  }
  crypto.createPrivateKey(parsed.private_key);
}
function ensureFirebaseAdminInitialized() {
  if (cachedAdminApp) {
    return cachedAdminApp;
  }
  try {
    if (typeof getApps === "function") {
      const existingApps = getApps();
      if (existingApps.length > 0 && existingApps[0]) {
        cachedAdminApp = existingApps[0];
        if (detectedCredentialSource === "none") {
          detectedCredentialSource = process.env.FIREBASE_SERVICE_ACCOUNT_JSON ? "FIREBASE_SERVICE_ACCOUNT_JSON" : process.env.GOOGLE_APPLICATION_CREDENTIALS ? "GOOGLE_APPLICATION_CREDENTIALS" : "none";
        }
        return cachedAdminApp;
      }
    }
  } catch {
  }
  const appletConfig = getFirebaseProjectConfig();
  const serviceAccountJsonRaw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
  const googleCredsPath = String(process.env.GOOGLE_APPLICATION_CREDENTIALS || "").trim();
  try {
    if (serviceAccountJsonRaw) {
      const parsed = parseServiceAccountJsonEnv(serviceAccountJsonRaw);
      validateServiceAccountKeyWithCrypto(parsed);
      detectedCredentialSource = "FIREBASE_SERVICE_ACCOUNT_JSON";
      adminInitError = null;
      if (typeof initializeApp === "function" && typeof cert === "function") {
        try {
          cachedAdminApp = initializeApp({
            credential: cert(parsed),
            projectId: parsed.project_id || appletConfig.projectId
          });
          return cachedAdminApp;
        } catch (sdkErr) {
          console.warn(
            "[FirebaseAdmin] Kh\u1EDFi t\u1EA1o qua firebase-admin/app g\u1EB7p c\u1EA3nh b\xE1o, d\xF9ng ch\u1EBF \u0111\u1ED9 Service Account REST tr\u1EF1c ti\u1EBFp:",
            sdkErr?.message || sdkErr
          );
        }
      }
      cachedAdminApp = {
        name: "[DEFAULT]",
        options: { projectId: parsed.project_id || appletConfig.projectId },
        __isRestFallback: true
      };
      return cachedAdminApp;
    }
    if (googleCredsPath) {
      const resolvedPath = path.isAbsolute(googleCredsPath) ? googleCredsPath : path.resolve(process.cwd(), googleCredsPath);
      if (!fs.existsSync(resolvedPath)) {
        adminInitError = "Kh\xF4ng t\xECm th\u1EA5y t\u1EC7p kh\xF3a d\u1ECBch v\u1EE5 t\u1EA1i GOOGLE_APPLICATION_CREDENTIALS.";
        return null;
      }
      const parsed = parseServiceAccountJsonEnv(fs.readFileSync(resolvedPath, "utf-8"));
      validateServiceAccountKeyWithCrypto(parsed);
      detectedCredentialSource = "GOOGLE_APPLICATION_CREDENTIALS";
      adminInitError = null;
      if (typeof initializeApp === "function" && typeof cert === "function") {
        try {
          cachedAdminApp = initializeApp({
            credential: cert(parsed),
            projectId: parsed.project_id || appletConfig.projectId
          });
          return cachedAdminApp;
        } catch (sdkErr) {
          console.warn(
            "[FirebaseAdmin] Kh\u1EDFi t\u1EA1o qua firebase-admin/app g\u1EB7p c\u1EA3nh b\xE1o, d\xF9ng ch\u1EBF \u0111\u1ED9 Service Account REST tr\u1EF1c ti\u1EBFp:",
            sdkErr?.message || sdkErr
          );
        }
      }
      cachedAdminApp = {
        name: "[DEFAULT]",
        options: { projectId: parsed.project_id || appletConfig.projectId },
        __isRestFallback: true
      };
      return cachedAdminApp;
    }
    detectedCredentialSource = "none";
    adminInitError = null;
    return null;
  } catch (err) {
    adminInitError = err?.message || "L\u1ED7i kh\u1EDFi t\u1EA1o Firebase Admin SDK t\u1EEB bi\u1EBFn m\xF4i tr\u01B0\u1EDDng m\xE1y ch\u1EE7.";
    console.error("[FirebaseAdmin] L\u1ED7i kh\u1EDFi t\u1EA1o Firebase Admin SDK:", adminInitError);
    return null;
  }
}
function getFirebaseAdminStatus() {
  const appletConfig = getFirebaseProjectConfig();
  const firstAdminUid = getConfiguredFirstAdminUid();
  const hasServiceAccountEnv = Boolean(
    String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim() || String(process.env.GOOGLE_APPLICATION_CREDENTIALS || "").trim()
  );
  const app = ensureFirebaseAdminInitialized();
  const missingEnvVars = [];
  if (!firstAdminUid) {
    missingEnvVars.push("FIRST_ADMIN_UID");
  }
  if (!hasServiceAccountEnv) {
    missingEnvVars.push("FIREBASE_SERVICE_ACCOUNT_JSON");
  }
  return {
    projectId: String(
      app?.options?.projectId || process.env.FIREBASE_PROJECT_ID || appletConfig.projectId || ""
    ),
    firestoreDatabaseId: String(
      process.env.FIRESTORE_DATABASE_ID || appletConfig.firestoreDatabaseId || "(default)"
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
function decodeJwtPayloadUnsafe(idToken) {
  try {
    const parts = idToken.split(".");
    if (parts.length !== 3) return null;
    const json = Buffer.from(parts[1], "base64url").toString("utf-8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}
async function verifyFirebaseIdTokenOnServer(idToken) {
  const cleanToken = String(idToken || "").trim();
  if (!cleanToken || cleanToken.length < 30) {
    return {
      valid: false,
      verifiedBy: "none",
      error: "Thi\u1EBFu Firebase ID Token h\u1EE3p l\u1EC7 t\u1EEB phi\xEAn \u0111\u0103ng nh\u1EADp."
    };
  }
  let adminSdkError = null;
  const adminApp = ensureFirebaseAdminInitialized();
  if (adminApp && !adminApp.__isRestFallback && typeof getAuth === "function") {
    try {
      const decoded = await getAuth(adminApp).verifyIdToken(cleanToken);
      return {
        valid: true,
        uid: decoded.uid,
        email: decoded.email,
        emailVerified: Boolean(decoded.email_verified),
        displayName: decoded.name || void 0,
        phoneNumber: decoded.phone_number,
        isAdminClaim: decoded.admin === true || decoded.role === "admin",
        verifiedBy: "firebase_admin_sdk"
      };
    } catch (err) {
      adminSdkError = err?.message || "Token kh\xF4ng h\u1EE3p l\u1EC7 ho\u1EB7c \u0111\xE3 h\u1EBFt h\u1EA1n.";
      console.warn(
        "[FirebaseAdmin] verifyIdToken qua Admin SDK g\u1EB7p l\u1ED7i, chuy\u1EC3n sang x\xE1c th\u1EF1c d\u1EF1 ph\xF2ng qua Identity Toolkit API:",
        adminSdkError
      );
    }
  }
  try {
    const parsedSa = getParsedServiceAccountFromEnv();
    if (parsedSa) {
      const accessToken = await getServiceAccountAccessToken(parsedSa);
      const saProjectId = parsedSa.project_id || process.env.FIREBASE_PROJECT_ID || getFirebaseProjectConfig().projectId;
      const saVerifyRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(
          String(saProjectId)
        )}/accounts:lookup`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ idToken: cleanToken })
        }
      );
      if (saVerifyRes.ok) {
        const saLookupData = await saVerifyRes.json();
        const fbUser = saLookupData?.users?.[0];
        if (fbUser && fbUser.localId && !fbUser.disabled) {
          const jwtPayload = decodeJwtPayloadUnsafe(cleanToken) || {};
          let customAttrs = {};
          if (typeof fbUser.customAttributes === "string") {
            try {
              customAttrs = JSON.parse(fbUser.customAttributes);
            } catch {
              customAttrs = {};
            }
          }
          const isAdminClaim = jwtPayload.admin === true || jwtPayload.role === "admin" || customAttrs.admin === true || customAttrs.role === "admin";
          return {
            valid: true,
            uid: String(fbUser.localId),
            email: fbUser.email ? String(fbUser.email).toLowerCase() : jwtPayload.email,
            emailVerified: Boolean(fbUser.emailVerified),
            displayName: fbUser.displayName || jwtPayload.name,
            phoneNumber: fbUser.phoneNumber || jwtPayload.phone_number,
            isAdminClaim,
            verifiedBy: "firebase_admin_sdk"
          };
        }
      }
    }
  } catch (saRestErr) {
    console.warn(
      "[FirebaseAdmin] X\xE1c th\u1EF1c token qua Service Account OAuth2 g\u1EB7p c\u1EA3nh b\xE1o, th\u1EED ti\u1EBFp Web API Key:",
      saRestErr?.message || saRestErr
    );
  }
  const appletConfig = getFirebaseProjectConfig();
  const webApiKey = String(
    process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_API_KEY || appletConfig.apiKey || ""
  ).trim();
  if (!webApiKey) {
    return {
      valid: false,
      verifiedBy: adminSdkError ? "firebase_admin_sdk" : "none",
      error: adminSdkError ? `X\xE1c th\u1EF1c Firebase ID Token b\u1EB1ng Firebase Admin SDK th\u1EA5t b\u1EA1i: ${adminSdkError}` : "M\xE1y ch\u1EE7 ch\u01B0a c\xF3 c\u1EA5u h\xECnh Firebase API Key ho\u1EB7c Firebase Admin Service Account."
    };
  }
  try {
    const verifyRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(
        webApiKey
      )}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: cleanToken })
      }
    );
    if (!verifyRes.ok) {
      const errData = await verifyRes.json().catch(() => ({}));
      return {
        valid: false,
        verifiedBy: "identity_toolkit_api",
        error: `Token Firebase kh\xF4ng h\u1EE3p l\u1EC7 (${errData?.error?.message || verifyRes.statusText}).`
      };
    }
    const lookupData = await verifyRes.json();
    const fbUser = lookupData?.users?.[0];
    if (!fbUser || !fbUser.localId) {
      return {
        valid: false,
        verifiedBy: "identity_toolkit_api",
        error: "Kh\xF4ng t\xECm th\u1EA5y ng\u01B0\u1EDDi d\xF9ng Firebase t\u01B0\u01A1ng \u1EE9ng v\u1EDBi ID Token."
      };
    }
    if (fbUser.disabled) {
      return {
        valid: false,
        verifiedBy: "identity_toolkit_api",
        error: "T\xE0i kho\u1EA3n Firebase n\xE0y \u0111\xE3 b\u1ECB v\xF4 hi\u1EC7u h\xF3a."
      };
    }
    const jwtPayload = decodeJwtPayloadUnsafe(cleanToken) || {};
    let customAttrs = {};
    if (typeof fbUser.customAttributes === "string") {
      try {
        customAttrs = JSON.parse(fbUser.customAttributes);
      } catch {
        customAttrs = {};
      }
    }
    const isAdminClaim = jwtPayload.admin === true || jwtPayload.role === "admin" || customAttrs.admin === true || customAttrs.role === "admin";
    return {
      valid: true,
      uid: String(fbUser.localId),
      email: fbUser.email ? String(fbUser.email).toLowerCase() : jwtPayload.email,
      emailVerified: Boolean(fbUser.emailVerified),
      displayName: fbUser.displayName || jwtPayload.name,
      phoneNumber: fbUser.phoneNumber || jwtPayload.phone_number,
      isAdminClaim,
      verifiedBy: "identity_toolkit_api"
    };
  } catch (err) {
    return {
      valid: false,
      verifiedBy: "identity_toolkit_api",
      error: `L\u1ED7i k\u1EBFt n\u1ED1i khi x\xE1c th\u1EF1c Firebase ID Token: ${err?.message || ""}`
    };
  }
}
function getParsedServiceAccountFromEnv() {
  const serviceAccountJsonRaw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
  const googleCredsPath = String(process.env.GOOGLE_APPLICATION_CREDENTIALS || "").trim();
  if (serviceAccountJsonRaw) {
    return parseServiceAccountJsonEnv(serviceAccountJsonRaw);
  }
  if (googleCredsPath) {
    const resolvedPath = path.isAbsolute(googleCredsPath) ? googleCredsPath : path.resolve(process.cwd(), googleCredsPath);
    if (fs.existsSync(resolvedPath)) {
      return parseServiceAccountJsonEnv(fs.readFileSync(resolvedPath, "utf-8"));
    }
  }
  return null;
}
async function getServiceAccountAccessToken(sa) {
  const nowSec = Math.floor(Date.now() / 1e3);
  const headerB64 = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString(
    "base64url"
  );
  const tokenUri = sa.token_uri || "https://oauth2.googleapis.com/token";
  const payloadB64 = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      sub: sa.client_email,
      aud: tokenUri,
      iat: nowSec,
      exp: nowSec + 3600,
      scope: [
        "https://www.googleapis.com/auth/identitytoolkit",
        "https://www.googleapis.com/auth/firebase",
        "https://www.googleapis.com/auth/datastore",
        "https://www.googleapis.com/auth/cloud-platform"
      ].join(" ")
    })
  ).toString("base64url");
  const signingInput = `${headerB64}.${payloadB64}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signatureB64 = signer.sign(sa.private_key, "base64url");
  const assertion = `${signingInput}.${signatureB64}`;
  const tokenRes = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    }).toString()
  });
  if (!tokenRes.ok) {
    const errText = await tokenRes.text().catch(() => "");
    throw new Error(
      `Kh\xF4ng l\u1EA5y \u0111\u01B0\u1EE3c Google OAuth2 Access Token t\u1EEB Service Account (${tokenRes.status}): ${errText}`
    );
  }
  const tokenData = await tokenRes.json();
  return String(tokenData.access_token || "");
}
async function executeServerAdminBootstrap(explicitUid) {
  const targetUid = String(explicitUid || getConfiguredFirstAdminUid()).trim();
  if (!targetUid) {
    throw new Error("Ch\u01B0a c\u1EA5u h\xECnh bi\u1EBFn m\xF4i tr\u01B0\u1EDDng FIRST_ADMIN_UID \u1EDF ph\xEDa m\xE1y ch\u1EE7.");
  }
  const configuredUid = getConfiguredFirstAdminUid();
  if (configuredUid && targetUid !== configuredUid) {
    throw new Error(
      "T\u1EEB ch\u1ED1i kh\u1EDFi t\u1EA1o: UID y\xEAu c\u1EA7u kh\xF4ng kh\u1EDBp v\u1EDBi FIRST_ADMIN_UID trong c\u1EA5u h\xECnh b\u1EA3o m\u1EADt c\u1EE7a m\xE1y ch\u1EE7."
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
      status.initializationError || `Ch\u01B0a c\u1EA5u h\xECnh kh\xF3a d\u1ECBch v\u1EE5 Firebase Admin SDK ph\xEDa m\xE1y ch\u1EE7 (${status.missingEnvVars.join(
        ", "
      )}).`
    );
  }
  let userEmail;
  let userDisplayName;
  let customClaimSet = false;
  if (adminApp) {
    try {
      const adminAuth = getAuth(adminApp);
      const userRecord = await adminAuth.getUser(targetUid);
      userEmail = userRecord.email || void 0;
      userDisplayName = userRecord.displayName || void 0;
      const existingClaims = userRecord.customClaims || {};
      await adminAuth.setCustomUserClaims(targetUid, {
        ...existingClaims,
        admin: true,
        role: "admin"
      });
      customClaimSet = true;
    } catch (adminSdkErr) {
      if (!parsedSa) {
        throw new Error(
          `Kh\xF4ng th\u1EC3 c\u1EA5p custom claim qua Firebase Admin SDK cho UID "${targetUid}": ${adminSdkErr?.message || "user-not-found"}`
        );
      }
      console.warn(
        "[FirebaseAdmin] Chuy\u1EC3n sang Google Identity Toolkit Admin REST API \u0111\u1EC3 c\u1EA5p custom claim:",
        adminSdkErr?.message || adminSdkErr
      );
    }
  }
  if (!customClaimSet && parsedSa) {
    const accessToken = await getServiceAccountAccessToken(parsedSa);
    const projectId = parsedSa.project_id || process.env.FIREBASE_PROJECT_ID || getFirebaseProjectConfig().projectId;
    const lookupRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(
        String(projectId)
      )}/accounts:lookup`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ localId: [targetUid] })
      }
    );
    if (lookupRes.ok) {
      const lookupData = await lookupRes.json().catch(() => ({}));
      const fbUser = lookupData?.users?.[0];
      if (fbUser) {
        userEmail = fbUser.email || void 0;
        userDisplayName = fbUser.displayName || void 0;
      }
    }
    const updateRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(
        String(projectId)
      )}/accounts:update`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          localId: targetUid,
          customAttributes: JSON.stringify({ admin: true, role: "admin" })
        })
      }
    );
    if (!updateRes.ok) {
      const errText = await updateRes.text().catch(() => "");
      throw new Error(
        `Kh\xF4ng th\u1EC3 c\u1EA5p custom claim admin=true cho UID "${targetUid}" (${updateRes.status}): ${errText}`
      );
    }
    customClaimSet = true;
  }
  const appletConfig = getFirebaseProjectConfig();
  let firestoreAdminDocSynced = false;
  let firestoreError;
  try {
    if (!adminApp) {
      throw new Error("Admin App instance not initialized for Firestore SDK");
    }
    const { getFirestore: getAdminFirestore, FieldValue } = await import("firebase-admin/firestore");
    const writeAdminDocs = async (dbInstance) => {
      const now = FieldValue.serverTimestamp();
      await dbInstance.collection("admins").doc(targetUid).set(
        {
          uid: targetUid,
          role: "admin",
          approvalSignature: `firebase-admin-sdk-claim-${Date.now()}`,
          bootstrappedBy: "firebase-admin-sdk",
          createdAt: now,
          updatedAt: now
        },
        { merge: true }
      );
      await dbInstance.collection("users").doc(targetUid).set(
        {
          uid: targetUid,
          username: `ADMIN-${targetUid.slice(0, 6).toUpperCase()}`,
          fullName: userDisplayName || userEmail || "Qu\u1EA3n tr\u1ECB vi\xEAn H\u1EC7 th\u1ED1ng",
          role: "admin",
          className: "H\u1EC7 th\u1ED1ng",
          status: "active",
          surveyCompleted: true,
          targetScore: 9,
          quickFocusArea: "balanced",
          quickDailyTime: "30_mins",
          createdAt: now,
          updatedAt: now
        },
        { merge: true }
      );
    };
    const dbId = process.env.FIRESTORE_DATABASE_ID || appletConfig.firestoreDatabaseId;
    try {
      const db = dbId && dbId !== "(default)" ? getAdminFirestore(adminApp, dbId) : getAdminFirestore(adminApp);
      await writeAdminDocs(db);
      firestoreAdminDocSynced = true;
    } catch (primaryDbErr) {
      if (dbId && dbId !== "(default)") {
        const defaultDb = getAdminFirestore(adminApp);
        await writeAdminDocs(defaultDb);
        firestoreAdminDocSynced = true;
      } else {
        throw primaryDbErr;
      }
    }
  } catch (err) {
    firestoreError = err?.message || String(err);
    console.warn(
      "[FirebaseAdmin] \u0110\xE3 c\u1EA5p custom claim admin=true nh\u01B0ng ch\u01B0a ghi \u0111\u01B0\u1EE3c v\xE0o Firestore:",
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
    message: `\u0110\xE3 c\u1EA5p custom claim { admin: true } tr\xEAn Firebase Authentication cho UID "${targetUid}" (${userEmail || "kh\xF4ng c\xF3 email"}).`
  };
}
async function syncTeacherRoleInFirestoreAdminSdk(params) {
  const adminApp = ensureFirebaseAdminInitialized();
  if (!adminApp) return false;
  try {
    const { getFirestore: getAdminFirestore, FieldValue } = await import("firebase-admin/firestore");
    const appletConfig = getFirebaseProjectConfig();
    const dbId = process.env.FIRESTORE_DATABASE_ID || appletConfig.firestoreDatabaseId;
    const writeTeacherDoc = async (dbInstance) => {
      const docRef = dbInstance.collection("admins").doc(params.teacherUid);
      if (params.approved) {
        await docRef.set(
          {
            uid: params.teacherUid,
            role: "teacher",
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
      const db = dbId && dbId !== "(default)" ? getAdminFirestore(adminApp, dbId) : getAdminFirestore(adminApp);
      await writeTeacherDoc(db);
    } catch (primaryErr) {
      if (dbId && dbId !== "(default)") {
        const defaultDb = getAdminFirestore(adminApp);
        await writeTeacherDoc(defaultDb);
      } else {
        throw primaryErr;
      }
    }
    return true;
  } catch (err) {
    console.warn("[FirebaseAdmin] Kh\xF4ng \u0111\u1ED3ng b\u1ED9 \u0111\u01B0\u1EE3c /admins/{teacherUid} tr\xEAn Firestore:", err);
    return false;
  }
}
function getFirebaseProjectConfig() {
  const fallbackDefaults = {
    projectId: "gen-lang-client-0603655480",
    apiKey: "AIzaSyBlFIxGZ1uDyJTMhZN4WTlLgGaglec0wlg",
    firestoreDatabaseId: "ai-studio-vnai12trlchiuvvi-e4c6bf2e-9e42-4138-9e4c-b13f1a9b5f69"
  };
  try {
    const cfgPath = path.resolve(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(cfgPath)) {
      return {
        ...fallbackDefaults,
        ...JSON.parse(fs.readFileSync(cfgPath, "utf-8"))
      };
    }
  } catch {
  }
  return fallbackDefaults;
}
let quotaMutexChain = Promise.resolve();
function withQuotaLock(task) {
  const next = quotaMutexChain.then(() => task(), () => task());
  quotaMutexChain = next.then(
    () => void 0,
    () => void 0
  );
  return next;
}
function getResolvedGeminiApiKey() {
  return (process.env.GEMINI_API_KEY || process.env.GEMINI_API_kEY || process.env.API_KEY || "").trim();
}
function getGeminiClient() {
  const apiKey = getResolvedGeminiApiKey();
  if (!apiKey) {
    throw new Error("M\xE1y ch\u1EE7 ch\u01B0a \u0111\u01B0\u1EE3c c\u1EA5u h\xECnh GEMINI_API_KEY.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
}
function hashPasswordServer(password, salt) {
  return crypto.pbkdf2Sync(password, `${salt}:vanai12_prod_pepper`, 1e4, 32, "sha256").toString("hex");
}
function hashOtpCodeServer(otpCode, salt) {
  return crypto.pbkdf2Sync(otpCode.trim(), `${salt}:${SESSION_SECRET}:otp_pepper`, 1e4, 32, "sha256").toString("hex");
}
function generateSaltServer() {
  return crypto.randomBytes(16).toString("hex");
}
function generateActivationCodeServer() {
  return crypto.randomInt(1e5, 999999).toString();
}
function getExpiryDateServer(days = 7) {
  const date = /* @__PURE__ */ new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}
function normalizePhoneE164(rawPhone) {
  const digits = String(rawPhone || "").replace(/[\s.\-()]/g, "");
  if (digits.startsWith("+84")) {
    return "+84" + digits.slice(3).replace(/^0+/, "");
  }
  if (digits.startsWith("84") && digits.length >= 10) {
    return "+84" + digits.slice(2).replace(/^0+/, "");
  }
  if (digits.startsWith("0")) {
    return "+84" + digits.slice(1);
  }
  return digits.startsWith("+") ? digits : `+${digits}`;
}
function isValidPhoneFormat(rawPhone) {
  const norm = normalizePhoneE164(rawPhone);
  return /^\+[1-9]\d{8,14}$/.test(norm);
}
function isValidGmailFormat(rawEmail) {
  const email = String(rawEmail || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function signSessionToken(payload) {
  const fullPayload = {
    ...payload,
    exp: Date.now() + 12 * 3600 * 1e3
    // 12 hours
  };
  const dataB64 = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(dataB64).digest("base64url");
  return `${dataB64}.${sig}`;
}
function verifySessionToken(token) {
  if (!token || !token.includes(".")) return null;
  const [dataB64, sig] = token.split(".");
  if (!dataB64 || !sig) return null;
  const expectedSig = crypto.createHmac("sha256", SESSION_SECRET).update(dataB64).digest("base64url");
  if (sig !== expectedSig) return null;
  try {
    const payload = JSON.parse(Buffer.from(dataB64, "base64url").toString("utf-8"));
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
function generateAdminApprovalSignature(uid) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(`teacher_admin:${uid}`).digest("hex");
}
function extractBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  return void 0;
}
function loadServerAccounts() {
  try {
    if (fs.existsSync(ACCOUNTS_FILE)) {
      const raw = fs.readFileSync(ACCOUNTS_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn("Error reading server accounts file:", err);
  }
  return [];
}
function saveServerAccounts(accounts) {
  try {
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving server accounts:", err);
  }
}
function loadTeacherRegistrations() {
  try {
    if (fs.existsSync(TEACHER_REGISTRATIONS_FILE)) {
      const raw = fs.readFileSync(TEACHER_REGISTRATIONS_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn("Error reading teacher registrations file:", err);
  }
  return [];
}
function saveTeacherRegistrations(list) {
  try {
    fs.writeFileSync(TEACHER_REGISTRATIONS_FILE, JSON.stringify(list, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving teacher registrations:", err);
  }
}
function loadServerClasses() {
  try {
    if (fs.existsSync(CLASSES_FILE)) {
      const raw = fs.readFileSync(CLASSES_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn("Error reading classes file:", err);
  }
  return [];
}
function saveServerClasses(list) {
  try {
    fs.writeFileSync(CLASSES_FILE, JSON.stringify(list, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving classes:", err);
  }
}
function loadAdminAuditLogs() {
  try {
    if (fs.existsSync(ADMIN_AUDIT_LOGS_FILE)) {
      const raw = fs.readFileSync(ADMIN_AUDIT_LOGS_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn("Error reading audit logs file:", err);
  }
  return [];
}
function saveAdminAuditLogs(logs) {
  try {
    fs.writeFileSync(ADMIN_AUDIT_LOGS_FILE, JSON.stringify(logs, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving audit logs:", err);
  }
}
function loadServerStudentStates() {
  try {
    if (fs.existsSync(STUDENT_STATES_FILE)) {
      const raw = fs.readFileSync(STUDENT_STATES_FILE, "utf-8");
      return JSON.parse(raw) || {};
    }
  } catch (err) {
    console.warn("Error reading student states file:", err);
  }
  return {};
}
function saveServerStudentStates(states) {
  try {
    fs.writeFileSync(STUDENT_STATES_FILE, JSON.stringify(states, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving student states file:", err);
  }
}
function isAuthorizedAdminUid(uid) {
  const cleanUid = String(uid || "").trim();
  if (!cleanUid) return false;
  const configuredFirstAdminUid = getConfiguredFirstAdminUid();
  if (configuredFirstAdminUid) {
    return cleanUid === configuredFirstAdminUid;
  }
  return false;
}
function stripEnvQuotes(val) {
  if (val === undefined || val === null) return "";
  let s = String(val).trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  if (s === "undefined" || s === "null" || s.startsWith("MY_")) {
    return "";
  }
  return s;
}

function resolveSmtpAndEmailEnv() {
  const resendKey = stripEnvQuotes(process.env.RESEND_API_KEY);
  let smtpHost = stripEnvQuotes(
    process.env.SMTP_HOST || process.env.MAIL_HOST || process.env.EMAIL_HOST
  );
  const smtpUser = stripEnvQuotes(
    process.env.SMTP_USER || process.env.MAIL_USER || process.env.EMAIL_USER || process.env.GMAIL_USER
  );
  let smtpPass = stripEnvQuotes(
    process.env.SMTP_PASS ||
      process.env.SMTP_PASSWORD ||
      process.env.MAIL_PASS ||
      process.env.EMAIL_PASS ||
      process.env.GMAIL_APP_PASSWORD
  );

  if (!smtpHost && smtpUser && /@(gmail\.com|googlemail\.com)$/i.test(smtpUser)) {
    smtpHost = "smtp.gmail.com";
  }

  if (
    (smtpHost && smtpHost.toLowerCase().includes("gmail.com")) ||
    /^[a-z0-9]{4}(\s+[a-z0-9]{4}){3}$/i.test(smtpPass)
  ) {
    smtpPass = smtpPass.replace(/\s+/g, "");
  }

  const rawPort = Number(
    stripEnvQuotes(process.env.SMTP_PORT || process.env.MAIL_PORT || process.env.EMAIL_PORT) || 465
  );
  const smtpPort = Number.isFinite(rawPort) && rawPort > 0 ? rawPort : 465;
  const rawSecure = stripEnvQuotes(process.env.SMTP_SECURE || process.env.MAIL_SECURE);
  const smtpSecure =
    smtpPort === 465
      ? true
      : smtpPort === 587 || smtpPort === 2525 || smtpPort === 25
      ? false
      : rawSecure !== ""
      ? rawSecure.toLowerCase() === "true" || rawSecure === "1"
      : false;
  const rawFrom = stripEnvQuotes(
    process.env.EMAIL_FROM ||
      process.env.OTP_EMAIL_FROM ||
      process.env.SMTP_FROM ||
      process.env.MAIL_FROM
  );
  const emailFrom = rawFrom.includes("no-reply@yourdomain.com") ? "" : rawFrom;
  const rawWebhook = stripEnvQuotes(process.env.EMAIL_OTP_WEBHOOK_URL);
  const webhookUrl = /^https?:\/\/.+/i.test(rawWebhook) ? rawWebhook : "";
  const testOutboxFile = stripEnvQuotes(process.env.SMTP_TEST_OUTBOX_FILE);

  return {
    resendKey,
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpUser,
    smtpPass,
    emailFrom,
    webhookUrl,
    testOutboxFile
  };
}

function formatSafeSmtpError(err, smtpHost, smtpPort) {
  const code = String(err?.code || "");
  const responseCode = Number(err?.responseCode || 0);
  const rawMsg = String(err?.message || "Lỗi không xác định từ máy chủ SMTP")
    .replace(/\b\d{6}\b/g, "[REDACTED_OTP]")
    .slice(0, 260);

  if (code === "EAUTH" || responseCode === 535 || /invalid login|username and password not accepted|authentication failed/i.test(rawMsg)) {
    return `Máy chủ SMTP (${smtpHost}:${smtpPort}) từ chối xác thực tài khoản gửi mail (Mã lỗi ${responseCode || code || "EAUTH"}). Nếu dùng Gmail SMTP, vui lòng kiểm tra biến SMTP_USER và đảm bảo SMTP_PASS là Mật khẩu ứng dụng Google (App Password 16 ký tự), không dùng mật khẩu đăng nhập Gmail thông thường.`;
  }
  if (code === "ESOCKET" || code === "ECONNECTION" || code === "ETIMEDOUT" || code === "ECONNREFUSED") {
    return `Không thể kết nối tới máy chủ SMTP (${smtpHost}:${smtpPort} - ${code}). Vui lòng kiểm tra lại SMTP_HOST, SMTP_PORT (465 cho SSL hoặc 587 cho STARTTLS) và kết nối mạng của máy chủ.`;
  }
  if (code === "EENVELOPE" || responseCode === 550 || responseCode === 553) {
    return `Máy chủ SMTP từ chối địa chỉ người gửi hoặc người nhận (Mã lỗi ${responseCode || code}). Vui lòng kiểm tra biến EMAIL_FROM / SMTP_USER và địa chỉ Gmail nhận mã.`;
  }
  return `Lỗi gửi mã qua máy chủ SMTP (${smtpHost}:${smtpPort}): ${rawMsg}`;
}

function getEmailProviderStatus() {
  const env = resolveSmtpAndEmailEnv();
  if (env.resendKey) {
    return {
      configured: true,
      mode: "resend",
      providerName: "Resend Email API",
      missingEnvVars: []
    };
  }
  if (env.smtpHost && env.smtpUser && env.smtpPass) {
    return {
      configured: true,
      mode: "smtp",
      providerName: `SMTP (${env.smtpHost}:${env.smtpPort})`,
      missingEnvVars: []
    };
  }
  if (env.webhookUrl) {
    return {
      configured: true,
      mode: "webhook",
      providerName: "Custom Email Webhook",
      missingEnvVars: []
    };
  }
  if (env.testOutboxFile) {
    return {
      configured: true,
      mode: "test_outbox",
      providerName: "Server Test Mail Transport",
      missingEnvVars: []
    };
  }

  const missing = [];
  if (!env.smtpHost) missing.push("SMTP_HOST");
  if (!env.smtpUser) missing.push("SMTP_USER");
  if (!env.smtpPass) missing.push("SMTP_PASS");
  missing.push("hoặc RESEND_API_KEY");
  return {
    configured: false,
    mode: "unconfigured",
    providerName: "Chưa cấu hình dịch vụ gửi mail phía máy chủ",
    missingEnvVars: missing
  };
}

function extractEmailAddressOnly(addrStr) {
  const m = String(addrStr || "").match(/<([^>]+)>/);
  return (m ? m[1] : String(addrStr || "")).trim();
}

function executeNativeSmtpSession(env, mailOptions = null) {
  return new Promise((resolve, reject) => {
    let socket = null;
    let settled = false;
    let buffer = "";
    let step = "GREETING";
    const timeoutMs = 12000;

    const finish = (err, resVal) => {
      if (settled) return;
      settled = true;
      try {
        if (socket && !socket.destroyed) {
          socket.end();
          socket.destroy();
        }
      } catch {}
      if (err) reject(err);
      else resolve(resVal);
    };

    const timer = setTimeout(() => {
      const err = new Error(`Hết thời gian chờ kết nối tới máy chủ SMTP (${env.smtpHost}:${env.smtpPort}).`);
      err.code = "ETIMEDOUT";
      finish(err);
    }, timeoutMs);

    const clearTimerAndFinish = (err, resVal) => {
      clearTimeout(timer);
      finish(err, resVal);
    };

    const sendLine = (line) => {
      socket.write(line + "\r\n");
    };

    const handleResponse = (code, fullText) => {
      if (code >= 400) {
        const err = new Error(fullText.trim());
        err.responseCode = code;
        if (code === 535 || code === 534 || step.startsWith("AUTH")) {
          err.code = "EAUTH";
        } else if (code === 550 || code === 553) {
          err.code = "EENVELOPE";
        }
        clearTimerAndFinish(err);
        return;
      }

      if (step === "GREETING") {
        step = "EHLO";
        sendLine("EHLO vanai12.local");
      } else if (step === "EHLO") {
        if (!env.smtpSecure && (env.smtpPort === 587 || fullText.includes("STARTTLS"))) {
          step = "STARTTLS";
          sendLine("STARTTLS");
        } else {
          step = "AUTH_INIT";
          sendLine("AUTH LOGIN");
        }
      } else if (step === "STARTTLS") {
        socket.removeAllListeners("data");
        const tlsSocket = tls.connect(
          {
            socket,
            servername: env.smtpHost,
            rejectUnauthorized: false
          },
          () => {
            socket = tlsSocket;
            attachListeners(socket);
            step = "EHLO_TLS";
            sendLine("EHLO vanai12.local");
          }
        );
        tlsSocket.on("error", (err) => clearTimerAndFinish(err));
      } else if (step === "EHLO_TLS") {
        step = "AUTH_INIT";
        sendLine("AUTH LOGIN");
      } else if (step === "AUTH_INIT") {
        step = "AUTH_USER";
        sendLine(Buffer.from(env.smtpUser, "utf-8").toString("base64"));
      } else if (step === "AUTH_USER") {
        step = "AUTH_PASS";
        sendLine(Buffer.from(env.smtpPass, "utf-8").toString("base64"));
      } else if (step === "AUTH_PASS") {
        if (!mailOptions) {
          step = "QUIT";
          sendLine("QUIT");
          clearTimerAndFinish(null, { verified: true });
          return;
        }
        step = "MAIL_FROM";
        const fromEmail = extractEmailAddressOnly(mailOptions.from || env.smtpUser);
        sendLine(`MAIL FROM:<${fromEmail}>`);
      } else if (step === "MAIL_FROM") {
        step = "RCPT_TO";
        const toEmail = extractEmailAddressOnly(mailOptions.to);
        sendLine(`RCPT TO:<${toEmail}>`);
      } else if (step === "RCPT_TO") {
        step = "DATA_INIT";
        sendLine("DATA");
      } else if (step === "DATA_INIT") {
        step = "DATA_BODY";
        const subjB64 = Buffer.from(mailOptions.subject || "", "utf-8").toString("base64");
        const bodyB64 = Buffer.from(mailOptions.text || "", "utf-8")
          .toString("base64")
          .replace(/(.{76})/g, "$1\r\n");
        const mimeMsg = [
          `From: ${mailOptions.from}`,
          `To: <${extractEmailAddressOnly(mailOptions.to)}>`,
          `Subject: =?UTF-8?B?${subjB64}?=`,
          `Date: ${new Date().toUTCString()}`,
          `MIME-Version: 1.0`,
          `Content-Type: text/plain; charset=UTF-8`,
          `Content-Transfer-Encoding: base64`,
          ``,
          bodyB64,
          `.`
        ].join("\r\n");
        sendLine(mimeMsg);
      } else if (step === "DATA_BODY") {
        step = "QUIT";
        sendLine("QUIT");
        clearTimerAndFinish(null, { sent: true });
      }
    };

    const attachListeners = (sock) => {
      sock.on("data", (chunk) => {
        buffer += chunk.toString("utf-8");
        const lines = buffer.split("\r\n");
        buffer = lines.pop() || "";
        let collected = [];
        for (const line of lines) {
          if (!line) continue;
          collected.push(line);
          if (/^\d{3}\s/.test(line)) {
            const code = Number(line.slice(0, 3));
            const fullText = collected.join("\n");
            collected = [];
            handleResponse(code, fullText);
          }
        }
      });
      sock.on("error", (err) => clearTimerAndFinish(err));
      sock.on("close", () => {
        if (!settled) {
          const err = new Error("Kết nối SMTP bị đóng đột ngột trước khi hoàn tất.");
          err.code = "ECONNECTION";
          clearTimerAndFinish(err);
        }
      });
    };

    try {
      if (env.smtpSecure) {
        socket = tls.connect({
          host: env.smtpHost,
          port: env.smtpPort,
          servername: env.smtpHost
        });
      } else {
        socket = net.connect({
          host: env.smtpHost,
          port: env.smtpPort
        });
      }
      attachListeners(socket);
    } catch (err) {
      clearTimerAndFinish(err);
    }
  });
}

async function verifyEmailProviderConnectionOnServer() {
  const status = getEmailProviderStatus();
  const env = resolveSmtpAndEmailEnv();
  if (!status.configured) {
    return {
      ready: false,
      mode: status.mode,
      providerName: status.providerName,
      missingEnvVars: status.missingEnvVars,
      error: `Máy chủ chưa cấu hình dịch vụ gửi email (Thiếu biến môi trường: ${status.missingEnvVars.join(", ")}).`
    };
  }

  if (status.mode === "resend") {
    if (!env.resendKey.startsWith("re_") || env.resendKey.length < 10) {
      return {
        ready: false,
        mode: "resend",
        providerName: status.providerName,
        missingEnvVars: [],
        error: 'Biến môi trường RESEND_API_KEY không đúng định dạng chuẩn (phải bắt đầu bằng "re_").'
      };
    }
    return {
      ready: true,
      mode: "resend",
      providerName: status.providerName,
      missingEnvVars: []
    };
  }

  if (status.mode === "smtp") {
    try {
      if (!nodemailer) await ensureFullApiDepsLoaded();
      if (nodemailer && typeof nodemailer.createTransport === "function") {
        const transporter = nodemailer.createTransport({
          host: env.smtpHost,
          port: env.smtpPort,
          secure: env.smtpSecure,
          requireTLS: !env.smtpSecure && env.smtpPort === 587,
          auth: {
            user: env.smtpUser,
            pass: env.smtpPass
          },
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 12000
        });
        await transporter.verify();
      } else {
        await executeNativeSmtpSession(env, null);
      }
      return {
        ready: true,
        mode: "smtp",
        providerName: status.providerName,
        missingEnvVars: []
      };
    } catch (err) {
      return {
        ready: false,
        mode: "smtp",
        providerName: status.providerName,
        missingEnvVars: [],
        error: formatSafeSmtpError(err, env.smtpHost, env.smtpPort)
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

async function sendGmailVerificationCodeViaServer(recipientGmail, fullName, otpCode) {
  const status = getEmailProviderStatus();
  const env = resolveSmtpAndEmailEnv();
  if (!status.configured) {
    return {
      sent: false,
      error: `Máy chủ chưa được cấu hình dịch vụ gửi mã xác minh Gmail (thiếu biến môi trường: ${status.missingEnvVars.join(", ")}). Hệ thống không giả lập xác minh.`
    };
  }

  const subject = "[VănAI 12] Mã xác minh tài khoản Giáo viên";
  const textBody = `Xin chào thầy/cô ${fullName},\n\nMã xác minh đăng ký tài khoản Giáo viên VănAI 12 của thầy/cô là: ${otpCode}\nMã có hiệu lực trong 10 phút.\n\nTrân trọng,\nHệ thống Quản trị VănAI 12`;

  if (status.mode === "resend") {
    if (!env.resendKey.startsWith("re_")) {
      return {
        sent: false,
        error: 'Cấu hình RESEND_API_KEY không hợp lệ (Khóa Resend phải bắt đầu bằng "re_").'
      };
    }
    try {
      const fromAddr = env.emailFrom || "VanAI 12 <onboarding@resend.dev>";
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.resendKey}`,
          "Content-Type": "application/json"
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
        const safeErrBody = String(errBody || "")
          .replace(/\b\d{6}\b/g, "[REDACTED_OTP]")
          .slice(0, 240);
        return { sent: false, error: `Lỗi từ dịch vụ Resend API (${resp.status}): ${safeErrBody}` };
      }
      return { sent: true };
    } catch (err) {
      return { sent: false, error: `Không thể kết nối Resend API: ${err.message}` };
    }
  }

  if (status.mode === "smtp") {
    const fromAddr = env.emailFrom || `VanAI 12 <${env.smtpUser}>`;
    try {
      if (!nodemailer) await ensureFullApiDepsLoaded();
      if (nodemailer && typeof nodemailer.createTransport === "function") {
        const transporter = nodemailer.createTransport({
          host: env.smtpHost,
          port: env.smtpPort,
          secure: env.smtpSecure,
          requireTLS: !env.smtpSecure && env.smtpPort === 587,
          auth: {
            user: env.smtpUser,
            pass: env.smtpPass
          },
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 12000
        });
        await transporter.sendMail({
          from: fromAddr,
          to: recipientGmail,
          subject,
          text: textBody
        });
      } else {
        await executeNativeSmtpSession(env, {
          from: fromAddr,
          to: recipientGmail,
          subject,
          text: textBody
        });
      }
      return { sent: true };
    } catch (err) {
      return {
        sent: false,
        error: formatSafeSmtpError(err, env.smtpHost, env.smtpPort)
      };
    }
  }

  if (status.mode === "webhook" && env.webhookUrl) {
    try {
      const resp = await fetch(env.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: recipientGmail, fullName, otpCode })
      });
      if (!resp.ok) {
        return { sent: false, error: `Dịch vụ Email Webhook trả về mã lỗi ${resp.status}.` };
      }
      return { sent: true };
    } catch (err) {
      return { sent: false, error: `Lỗi gọi Email Webhook: ${err.message}` };
    }
  }

  if (status.mode === "test_outbox" && env.testOutboxFile) {
    try {
      const outboxPath = path.resolve(process.cwd(), env.testOutboxFile);
      let currentOutbox = [];
      if (fs.existsSync(outboxPath)) {
        currentOutbox = JSON.parse(fs.readFileSync(outboxPath, "utf-8") || "[]");
      }
      currentOutbox.push({
        to: recipientGmail,
        fullName,
        otpCode,
        sentAt: new Date().toISOString()
      });
      fs.writeFileSync(outboxPath, JSON.stringify(currentOutbox, null, 2), "utf-8");
      return { sent: true };
    } catch (err) {
      return { sent: false, error: `Lỗi ghi test outbox: ${err.message}` };
    }
  }

  return {
    sent: false,
    error: "Chưa cấu hình dịch vụ gửi email hợp lệ (RESEND_API_KEY hoặc SMTP_HOST/SMTP_USER/SMTP_PASS)."
  };
}
async function verifyFirebasePhoneIdTokenOnServer(firebaseIdToken, expectedPhone) {
  if (!firebaseIdToken || typeof firebaseIdToken !== "string") {
    return { verified: false, error: "Thi\u1EBFu m\xE3 x\xE1c th\u1EF1c Firebase Phone Auth (firebaseIdToken)." };
  }
  const normalizedExpected = normalizePhoneE164(expectedPhone);
  if (firebaseIdToken.startsWith("SERVER_PHONE_PROOF.")) {
    const parts = firebaseIdToken.split(".");
    if (parts.length === 3) {
      const [, payloadB64, sig] = parts;
      const expectedSig = crypto.createHmac("sha256", SESSION_SECRET).update(`firebase_phone_proof:${payloadB64}`).digest("base64url");
      if (sig === expectedSig) {
        try {
          const parsed = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
          if (parsed.phone && normalizePhoneE164(parsed.phone) === normalizedExpected && parsed.exp > Date.now()) {
            return {
              verified: true,
              phoneNumber: normalizedExpected,
              firebaseUid: parsed.uid || "fb-phone-verified"
            };
          }
        } catch {
        }
      }
    }
    return { verified: false, error: "Ch\u1EEF k\xFD x\xE1c th\u1EF1c s\u1ED1 \u0111i\u1EC7n tho\u1EA1i kh\xF4ng h\u1EE3p l\u1EC7 ho\u1EB7c \u0111\xE3 h\u1EBFt h\u1EA1n." };
  }
  const fbConfig = getFirebaseProjectConfig();
  if (!fbConfig.apiKey) {
    return {
      verified: false,
      error: "Kh\xF4ng t\xECm th\u1EA5y kh\xF3a c\u1EA5u h\xECnh Firebase (firebase-applet-config.json) \u0111\u1EC3 ki\u1EC3m tra token S\u0110T."
    };
  }
  try {
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(fbConfig.apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: firebaseIdToken })
      }
    );
    const data = await resp.json();
    if (!resp.ok || !Array.isArray(data?.users) || data.users.length === 0) {
      return {
        verified: false,
        error: data?.error?.message || "Token Firebase Phone Authentication kh\xF4ng h\u1EE3p l\u1EC7 ho\u1EB7c \u0111\xE3 h\u1EBFt h\u1EA1n."
      };
    }
    const fbUser = data.users[0];
    const verifiedPhone = fbUser.phoneNumber ? normalizePhoneE164(fbUser.phoneNumber) : "";
    if (!verifiedPhone) {
      return {
        verified: false,
        error: "T\xE0i kho\u1EA3n Firebase n\xE0y ch\u01B0a x\xE1c th\u1EF1c s\u1ED1 \u0111i\u1EC7n tho\u1EA1i qua SMS OTP."
      };
    }
    if (verifiedPhone !== normalizedExpected) {
      return {
        verified: false,
        error: `S\u1ED1 \u0111i\u1EC7n tho\u1EA1i x\xE1c th\u1EF1c tr\xEAn Firebase (${verifiedPhone}) kh\xF4ng kh\u1EDBp v\u1EDBi s\u1ED1 \u0111i\u1EC7n tho\u1EA1i \u0111\u0103ng k\xFD (${normalizedExpected}).`
      };
    }
    return {
      verified: true,
      phoneNumber: verifiedPhone,
      firebaseUid: fbUser.localId
    };
  } catch (err) {
    return {
      verified: false,
      error: `L\u1ED7i k\u1EBFt n\u1ED1i t\u1EDBi Firebase Identity Toolkit khi ki\u1EC3m tra OTP S\u0110T: ${err.message}`
    };
  }
}
function resolveOrHydrateVerifiedSessionUser(verified) {
  const accounts = loadServerAccounts();
  let dbUser = accounts.find((a) => a.id === verified.uid);
  const configuredFirstAdminUid = getConfiguredFirstAdminUid();
  if (!dbUser && verified.role === "admin" && (!configuredFirstAdminUid || verified.uid === configuredFirstAdminUid)) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const salt = generateSaltServer();
    dbUser = {
      id: verified.uid,
      username: verified.username || `ADMIN-${verified.uid.slice(0, 6).toUpperCase()}`,
      fullName: "Qu\u1EA3n tr\u1ECB vi\xEAn H\u1EC7 th\u1ED1ng",
      role: "admin",
      isActivated: true,
      passwordSalt: salt,
      passwordHash: hashPasswordServer(crypto.randomBytes(24).toString("hex"), salt),
      createdAt: now,
      lastLoginAt: now,
      status: "active",
      notes: "Qu\u1EA3n tr\u1ECB vi\xEAn x\xE1c th\u1EF1c qua Firebase Auth (custom claim admin=true)"
    };
    accounts.unshift(dbUser);
    saveServerAccounts(accounts);
  }
  return dbUser;
}
function requireAuth(req, res, next) {
  const token = extractBearerToken(req);
  const verified = verifySessionToken(token);
  if (!verified) {
    res.status(401).json({
      error: "Phi\xEAn \u0111\u0103ng nh\u1EADp kh\xF4ng h\u1EE3p l\u1EC7 ho\u1EB7c \u0111\xE3 h\u1EBFt h\u1EA1n. Vui l\xF2ng \u0111\u0103ng nh\u1EADp l\u1EA1i."
    });
    return;
  }
  const dbUser = resolveOrHydrateVerifiedSessionUser(verified);
  if (!dbUser || dbUser.status === "locked") {
    res.status(403).json({
      error: "T\xE0i kho\u1EA3n kh\xF4ng t\u1ED3n t\u1EA1i ho\u1EB7c \u0111\xE3 b\u1ECB kh\xF3a."
    });
    return;
  }
  req.authSession = verified;
  req.authUser = dbUser;
  next();
}
function requireAdminAuth(req, res, next) {
  const token = extractBearerToken(req);
  const verified = verifySessionToken(token);
  if (!verified) {
    res.status(401).json({
      error: "Y\xEAu c\u1EA7u \u0111\u0103ng nh\u1EADp: Ch\u1EC9 Qu\u1EA3n tr\u1ECB vi\xEAn m\u1EDBi \u0111\u01B0\u1EE3c ph\xE9p truy c\u1EADp."
    });
    return;
  }
  if (verified.role !== "admin") {
    res.status(403).json({
      error: "T\u1EEB ch\u1ED1i truy c\u1EADp (403): Ch\u1EE9c n\u0103ng n\xE0y ch\u1EC9 d\xE0nh cho Qu\u1EA3n tr\u1ECB vi\xEAn h\u1EC7 th\u1ED1ng."
    });
    return;
  }
  const configuredFirstAdminUid = getConfiguredFirstAdminUid();
  if (configuredFirstAdminUid && verified.uid !== configuredFirstAdminUid) {
    res.status(403).json({
      error: "T\u1EEB ch\u1ED1i truy c\u1EADp (403): Ch\u1EC9 t\xE0i kho\u1EA3n c\xF3 UID kh\u1EDBp v\u1EDBi FIRST_ADMIN_UID \u0111\u01B0\u1EE3c c\u1EA5p custom claim admin=true m\u1EDBi c\xF3 quy\u1EC1n Qu\u1EA3n tr\u1ECB vi\xEAn."
    });
    return;
  }
  const dbUser = resolveOrHydrateVerifiedSessionUser(verified);
  if (!dbUser || dbUser.role !== "admin" || dbUser.status !== "active") {
    res.status(403).json({
      error: "T\u1EEB ch\u1ED1i truy c\u1EADp (403): T\xE0i kho\u1EA3n Qu\u1EA3n tr\u1ECB vi\xEAn kh\xF4ng h\u1EE3p l\u1EC7 ho\u1EB7c \u0111\xE3 b\u1ECB kh\xF3a."
    });
    return;
  }
  req.authSession = verified;
  req.authUser = dbUser;
  next();
}
function requireTeacherAuth(req, res, next) {
  const token = extractBearerToken(req);
  const verified = verifySessionToken(token);
  if (!verified) {
    res.status(401).json({
      error: "Y\xEAu c\u1EA7u \u0111\u0103ng nh\u1EADp: Ch\u1EC9 t\xE0i kho\u1EA3n Gi\xE1o vi\xEAn \u0111\xE3 \u0111\u01B0\u1EE3c Qu\u1EA3n tr\u1ECB vi\xEAn duy\u1EC7t m\u1EDBi \u0111\u01B0\u1EE3c ph\xE9p truy c\u1EADp."
    });
    return;
  }
  if (verified.role !== "teacher" && verified.role !== "admin") {
    res.status(403).json({
      error: "T\u1EEB ch\u1ED1i truy c\u1EADp (403): T\xE0i kho\u1EA3n H\u1ECDc sinh kh\xF4ng c\xF3 quy\u1EC1n \u0111\u1ECDc/ghi d\u1EEF li\u1EC7u khu v\u1EF1c Gi\xE1o vi\xEAn."
    });
    return;
  }
  const dbUser = resolveOrHydrateVerifiedSessionUser(verified);
  if (!dbUser || dbUser.status !== "active") {
    res.status(403).json({
      error: "T\u1EEB ch\u1ED1i truy c\u1EADp (403): T\xE0i kho\u1EA3n kh\xF4ng h\u1EE3p l\u1EC7 ho\u1EB7c \u0111ang b\u1ECB t\u1EA1m kh\xF3a."
    });
    return;
  }
  if (dbUser.role === "teacher" && dbUser.teacherApprovalStatus !== "approved") {
    res.status(403).json({
      error: "T\u1EEB ch\u1ED1i truy c\u1EADp (403): T\xE0i kho\u1EA3n Gi\xE1o vi\xEAn ch\u01B0a \u0111\u01B0\u1EE3c Qu\u1EA3n tr\u1ECB vi\xEAn ph\xEA duy\u1EC7t. Ch\u1EC9 gi\xE1o vi\xEAn \u0111\xE3 x\xE1c minh OTP v\xE0 \u0111\u01B0\u1EE3c Qu\u1EA3n tr\u1ECB vi\xEAn duy\u1EC7t m\u1EDBi \u0111\u01B0\u1EE3c s\u1EED d\u1EE5ng khu v\u1EF1c gi\xE1o vi\xEAn."
    });
    return;
  }
  req.authSession = verified;
  req.authUser = dbUser;
  next();
}
function sanitizeAccountForClient(acc, includeActivationCode = false) {
  const { passwordHash, passwordSalt, activationCode, activationCodeExpiresAt, ...safe } = acc;
  if (includeActivationCode) {
    return { ...safe, activationCode, activationCodeExpiresAt };
  }
  return safe;
}
function enrichClassroomForClient(cls, accounts) {
  const enrolledCount = accounts.filter(
    (a) => a.role === "student" && (a.classId === cls.id || a.teacherUid === cls.teacherUid && a.className === cls.name)
  ).length;
  return {
    ...cls,
    enrolledCount,
    maxCapacity: MAX_ENROLLED_STUDENTS_PER_CLASS,
    remainingSeats: Math.max(0, MAX_ENROLLED_STUDENTS_PER_CLASS - enrolledCount)
  };
}
function encodeTeacherRegistrationStateToken(reg, acc) {
  try {
    const key = crypto.createHash("sha256").update(`treg_state:${SESSION_SECRET}`).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const payload = JSON.stringify({
      reg,
      acc: acc || null,
      exp: Date.now() + 24 * 60 * 60 * 1000
    });
    const encrypted = Buffer.concat([cipher.update(payload, "utf-8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString("base64url")}.${authTag.toString("base64url")}.${encrypted.toString("base64url")}`;
  } catch {
    return "";
  }
}

function hydrateTeacherRegistrationFromStateToken(token, registrations, accounts) {
  if (!token || typeof token !== "string") return undefined;
  try {
    const parts = token.trim().split(".");
    if (parts.length !== 3) return undefined;
    const [ivB64, tagB64, dataB64] = parts;
    const key = crypto.createHash("sha256").update(`treg_state:${SESSION_SECRET}`).digest();
    const iv = Buffer.from(ivB64, "base64url");
    const authTag = Buffer.from(tagB64, "base64url");
    const encrypted = Buffer.from(dataB64, "base64url");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf-8");
    const parsed = JSON.parse(decrypted);
    if (!parsed || !parsed.reg || !parsed.exp || Date.now() > Number(parsed.exp)) {
      return undefined;
    }
    const tokenReg = parsed.reg;
    let existingReg = registrations.find(
      (r) => r.id === tokenReg.id || r.teacherUid === tokenReg.teacherUid
    );
    if (!existingReg) {
      existingReg = tokenReg;
      registrations.unshift(existingReg);
      saveTeacherRegistrations(registrations);
    } else if (
      tokenReg.gmailOtpHash &&
      (!existingReg.gmailOtpHash ||
        new Date(tokenReg.updatedAt || 0).getTime() >= new Date(existingReg.updatedAt || 0).getTime())
    ) {
      existingReg.gmailOtpHash = tokenReg.gmailOtpHash;
      existingReg.gmailOtpSalt = tokenReg.gmailOtpSalt;
      existingReg.gmailOtpExpiresAt = tokenReg.gmailOtpExpiresAt;
      existingReg.gmailOtpAttempts = tokenReg.gmailOtpAttempts;
      existingReg.lastOtpSentAt = tokenReg.lastOtpSentAt;
    }
    if (parsed.acc && !accounts.some((a) => a.id === parsed.acc.id)) {
      accounts.push(parsed.acc);
      saveServerAccounts(accounts);
    }
    return existingReg;
  } catch {
    return undefined;
  }
}

function sanitizeRegistrationForClient(reg, classes, accounts) {
  const { gmailOtpHash, gmailOtpSalt, ...safe } = reg;
  const teacherClasses = classes
    .filter((c) => c.teacherUid === reg.teacherUid)
    .map((c) => enrichClassroomForClient(c, accounts));
  const activeClassesCount = teacherClasses.filter((c) => c.status === "active").length;
  const totalEnrolledStudentsCount = accounts.filter(
    (a) => a.role === "student" && a.teacherUid === reg.teacherUid
  ).length;
  const linkedAccount = accounts.find((a) => a.id === reg.teacherUid);
  const registrationStateToken = encodeTeacherRegistrationStateToken(reg, linkedAccount);

  return {
    ...safe,
    registrationStateToken,
    activeClassesCount,
    remainingClassesQuota: Math.max(0, MAX_ACTIVE_CLASSES_PER_TEACHER - activeClassesCount),
    totalEnrolledStudentsCount,
    classes: teacherClasses
  };
}
function createApiApp() {
  const app = express();
  app.use(express.json({ limit: "25mb" }));
  app.get("/api/health", (_req, res) => {
    const accounts = loadServerAccounts();
    const configuredUid = getConfiguredFirstAdminUid();
    const hasAdminAccount = accounts.some(
      (a) => a.role === "admin" && a.status === "active" && (!configuredUid || a.id === configuredUid)
    );
    const hasTeacherAccount = accounts.some(
      (a) => a.role === "teacher" && a.status === "active" && a.teacherApprovalStatus === "approved"
    );
    res.status(200).json({
      status: "ok",
      geminiConfigured: Boolean(getResolvedGeminiApiKey()),
      emailProviderStatus: getEmailProviderStatus(),
      firebaseAdminStatus: getFirebaseAdminStatus(),
      hasAdminAccount,
      hasTeacherAccount,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  const handleBootstrapStatus = (_req, res) => {
    const accounts = loadServerAccounts();
    const configuredUid = getConfiguredFirstAdminUid();
    const adminStatus = getFirebaseAdminStatus();
    const hasAdminAccount = accounts.some(
      (a) => a.role === "admin" && a.status === "active" && (!configuredUid || a.id === configuredUid)
    );
    const hasTeacherAccount = accounts.some(
      (a) => a.role === "teacher" && a.status === "active" && a.teacherApprovalStatus === "approved"
    );
    res.status(200).json({
      status: "ok",
      needsAdminBootstrap: !hasAdminAccount,
      needsTeacherBootstrap: !hasTeacherAccount,
      emailProviderStatus: getEmailProviderStatus(),
      firebaseAdminStatus: adminStatus,
      totalAccounts: accounts.length,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  };
  app.get("/api/auth/bootstrap-status", handleBootstrapStatus);
  app.get("/api/admin/config-status", handleBootstrapStatus);
  app.post("/api/auth/bootstrap-admin", async (req, res) => {
    const { firebaseIdToken } = req.body || {};
    if (!firebaseIdToken) {
      res.status(403).json({
        success: false,
        errorCategory: "PERMISSION_ERROR",
        code: "MISSING_FIREBASE_ID_TOKEN",
        message: "T\u1EEB ch\u1ED1i truy c\u1EADp (403): H\u1EC7 th\u1ED1ng kh\xF4ng cho ph\xE9p t\u1EF1 \u0111\u0103ng k\xFD ho\u1EB7c t\u1EF1 n\xE2ng quy\u1EC1n Qu\u1EA3n tr\u1ECB vi\xEAn qua giao di\u1EC7n. Qu\u1EA3n tr\u1ECB vi\xEAn \u0111\u1EA7u ti\xEAn ph\u1EA3i \u0111\u01B0\u1EE3c x\xE1c th\u1EF1c b\u1EB1ng Firebase ID Token kh\u1EDBp v\u1EDBi FIRST_ADMIN_UID \u1EDF ph\xEDa m\xE1y ch\u1EE7."
      });
      return;
    }
    const adminStatus = getFirebaseAdminStatus();
    const configuredUid = getConfiguredFirstAdminUid();
    if (!configuredUid) {
      res.status(503).json({
        success: false,
        errorCategory: "CONFIG_ERROR",
        code: "FIRST_ADMIN_UID_NOT_CONFIGURED",
        message: "L\u1ED7i c\u1EA5u h\xECnh m\xE1y ch\u1EE7 (503): M\xE1y ch\u1EE7 ch\u01B0a \u0111\u1ECDc \u0111\u01B0\u1EE3c bi\u1EBFn m\xF4i tr\u01B0\u1EDDng FIRST_ADMIN_UID. H\xE3y ki\u1EC3m tra bi\u1EBFn FIRST_ADMIN_UID tr\xEAn m\xF4i tr\u01B0\u1EDDng m\xE1y ch\u1EE7 (ho\u1EB7c Redeploy tr\xEAn Vercel sau khi l\u01B0u Environment Variables)."
      });
      return;
    }
    if (!adminStatus.serviceAccountConfigured) {
      res.status(503).json({
        success: false,
        errorCategory: "CONFIG_ERROR",
        code: "ADMIN_SDK_NOT_CONFIGURED",
        message: adminStatus.initializationError ? `L\u1ED7i c\u1EA5u h\xECnh FIREBASE_SERVICE_ACCOUNT_JSON tr\xEAn m\xE1y ch\u1EE7: ${adminStatus.initializationError}` : "L\u1ED7i c\u1EA5u h\xECnh m\xE1y ch\u1EE7 (503): M\xE1y ch\u1EE7 ch\u01B0a \u0111\u1ECDc \u0111\u01B0\u1EE3c bi\u1EBFn m\xF4i tr\u01B0\u1EDDng FIREBASE_SERVICE_ACCOUNT_JSON."
      });
      return;
    }
    const verifiedToken = await verifyFirebaseIdTokenOnServer(String(firebaseIdToken));
    if (!verifiedToken.valid || !verifiedToken.uid) {
      res.status(401).json({
        success: false,
        errorCategory: "TOKEN_ERROR",
        code: "INVALID_FIREBASE_TOKEN",
        message: verifiedToken.error || "Firebase ID Token kh\xF4ng h\u1EE3p l\u1EC7 ho\u1EB7c \u0111\xE3 h\u1EBFt h\u1EA1n."
      });
      return;
    }
    if (verifiedToken.uid !== configuredUid) {
      res.status(403).json({
        success: false,
        errorCategory: "PERMISSION_ERROR",
        code: "ADMIN_UID_MISMATCH",
        message: `T\u1EEB ch\u1ED1i quy\u1EC1n Qu\u1EA3n tr\u1ECB vi\xEAn (403): UID t\xE0i kho\u1EA3n hi\u1EC7n t\u1EA1i (${verifiedToken.uid}) kh\xF4ng kh\u1EDBp v\u1EDBi FIRST_ADMIN_UID \u0111\u01B0\u1EE3c c\u1EA5u h\xECnh tr\xEAn m\xE1y ch\u1EE7.`
      });
      return;
    }
    try {
      const execResult = await executeServerAdminBootstrap(configuredUid);
      const accounts = loadServerAccounts().filter(
        (a) => !(a.role === "admin" && a.id !== configuredUid)
      );
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const salt = generateSaltServer();
      let adminAcc = accounts.find((a) => a.id === configuredUid);
      if (!adminAcc) {
        adminAcc = {
          id: configuredUid,
          username: `ADMIN-${configuredUid.slice(0, 6).toUpperCase()}`,
          fullName: execResult.displayName || execResult.email || "Qu\u1EA3n tr\u1ECB vi\xEAn H\u1EC7 th\u1ED1ng",
          role: "admin",
          email: execResult.email ? execResult.email.toLowerCase() : void 0,
          isActivated: true,
          passwordSalt: salt,
          passwordHash: hashPasswordServer(crypto.randomBytes(24).toString("hex"), salt),
          createdAt: now,
          lastLoginAt: now,
          status: "active",
          notes: "Kh\u1EDFi t\u1EA1o qua Firebase Admin SDK (custom claim admin=true)"
        };
        accounts.unshift(adminAcc);
      } else {
        adminAcc.role = "admin";
        adminAcc.status = "active";
        adminAcc.isActivated = true;
        adminAcc.lastLoginAt = now;
      }
      saveServerAccounts(accounts);
      res.status(200).json({
        success: true,
        customClaimGranted: true,
        firestoreAdminDocSynced: execResult.firestoreAdminDocSynced,
        message: execResult.message + " Phi\xEAn Qu\u1EA3n tr\u1ECB vi\xEAn \u0111\xE3 \u0111\u01B0\u1EE3c k\xEDch ho\u1EA1t."
      });
    } catch (err) {
      res.status(400).json({
        success: false,
        errorCategory: "CONFIG_ERROR",
        message: err?.message || "L\u1ED7i khi ch\u1EA1y quy tr\xECnh Firebase Admin SDK tr\xEAn m\xE1y ch\u1EE7."
      });
    }
  });
  app.post("/api/auth/bootstrap-teacher", (_req, res) => {
    res.status(403).json({
      success: false,
      message: "Gi\xE1o vi\xEAn kh\xF4ng th\u1EC3 t\u1EF1 c\u1EA5p quy\u1EC1n tr\u1EF1c ti\u1EBFp. Vui l\xF2ng g\u1EEDi y\xEAu c\u1EA7u \u0111\u0103ng k\xFD Gi\xE1o vi\xEAn, x\xE1c minh m\xE3 OTP (S\u1ED1 \u0111i\u1EC7n tho\u1EA1i ho\u1EB7c Gmail) v\xE0 ch\u1EDD Qu\u1EA3n tr\u1ECB vi\xEAn ph\xEA duy\u1EC7t."
    });
  });
  app.post("/api/teacher-registration/submit", (req, res) => {
    const { username, fullName, phone, gmail, password, verificationMethod } = req.body || {};
    if (!fullName || !phone || !gmail || !password) {
      res.status(400).json({
        success: false,
        message: "Vui l\xF2ng nh\u1EADp \u0111\u1EA7y \u0111\u1EE7 H\u1ECD t\xEAn, S\u1ED1 \u0111i\u1EC7n tho\u1EA1i, \u0111\u1ECBa ch\u1EC9 Gmail v\xE0 M\u1EADt kh\u1EA9u t\xE0i kho\u1EA3n."
      });
      return;
    }
    if (String(password).length < 6) {
      res.status(400).json({
        success: false,
        message: "M\u1EADt kh\u1EA9u t\xE0i kho\u1EA3n ph\u1EA3i c\xF3 t\u1ED1i thi\u1EC3u 6 k\xFD t\u1EF1."
      });
      return;
    }
    if (!isValidPhoneFormat(String(phone))) {
      res.status(400).json({
        success: false,
        message: "S\u1ED1 \u0111i\u1EC7n tho\u1EA1i kh\xF4ng h\u1EE3p l\u1EC7 (VD: 0912345678 ho\u1EB7c +84912345678)."
      });
      return;
    }
    const normalizedGmail = String(gmail).trim().toLowerCase();
    if (!isValidGmailFormat(normalizedGmail)) {
      res.status(400).json({
        success: false,
        message: "\u0110\u1ECBa ch\u1EC9 Gmail kh\xF4ng h\u1EE3p l\u1EC7."
      });
      return;
    }
    const normalizedPhone = normalizePhoneE164(String(phone));
    const method = verificationMethod === "gmail_otp" ? "gmail_otp" : "phone_otp";
    const accounts = loadServerAccounts();
    const registrations = loadTeacherRegistrations();
    const classes = loadServerClasses();
    const desiredUsername = username ? String(username).trim().toUpperCase() : `GV-${normalizedPhone.slice(-6)}`;
    const existingReg = registrations.find(
      (r) => r.gmail.toLowerCase() === normalizedGmail || normalizePhoneE164(r.phone) === normalizedPhone || r.username.toUpperCase() === desiredUsername
    );
    if (existingReg) {
      if (existingReg.approvalStatus === "approved") {
        res.status(409).json({
          success: false,
          message: "Gi\xE1o vi\xEAn v\u1EDBi s\u1ED1 \u0111i\u1EC7n tho\u1EA1i, Gmail ho\u1EB7c m\xE3 t\xE0i kho\u1EA3n n\xE0y \u0111\xE3 \u0111\u01B0\u1EE3c duy\u1EC7t. Vui l\xF2ng \u0111\u0103ng nh\u1EADp."
        });
        return;
      }
      existingReg.fullName = String(fullName).trim();
      existingReg.phone = normalizedPhone;
      existingReg.gmail = normalizedGmail;
      existingReg.verificationMethod = method;
      existingReg.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      const linkedAcc = accounts.find((a) => a.id === existingReg.teacherUid);
      if (linkedAcc) {
        const salt2 = generateSaltServer();
        linkedAcc.fullName = existingReg.fullName;
        linkedAcc.phone = normalizedPhone;
        linkedAcc.email = normalizedGmail;
        linkedAcc.verificationMethod = method;
        linkedAcc.passwordSalt = salt2;
        linkedAcc.passwordHash = hashPasswordServer(String(password), salt2);
        saveServerAccounts(accounts);
      }
      saveTeacherRegistrations(registrations);
      res.json({
        success: true,
        registration: sanitizeRegistrationForClient(existingReg, classes, accounts),
        emailProviderStatus: getEmailProviderStatus(),
        message: existingReg.isOwnershipVerified ? "Y\xEAu c\u1EA7u c\u1EE7a b\u1EA1n \u0111\xE3 x\xE1c minh quy\u1EC1n s\u1EDF h\u1EEFu v\xE0 \u0111ang ch\u1EDD Qu\u1EA3n tr\u1ECB vi\xEAn duy\u1EC7t." : "\u0110\xE3 c\u1EADp nh\u1EADt th\xF4ng tin \u0111\u0103ng k\xFD. Vui l\xF2ng ho\xE0n t\u1EA5t b\u01B0\u1EDBc x\xE1c minh m\xE3 OTP."
      });
      return;
    }
    if (accounts.some((a) => a.username.toUpperCase() === desiredUsername)) {
      res.status(409).json({
        success: false,
        message: `M\xE3 t\xE0i kho\u1EA3n "${desiredUsername}" \u0111\xE3 t\u1ED3n t\u1EA1i trong h\u1EC7 th\u1ED1ng.`
      });
      return;
    }
    const salt = generateSaltServer();
    const teacherUid = `teacher-${crypto.randomUUID()}`;
    const registrationId = `treg-${crypto.randomUUID()}`;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const newTeacherAccount = {
      id: teacherUid,
      username: desiredUsername,
      fullName: String(fullName).trim(),
      role: "teacher",
      email: normalizedGmail,
      phone: normalizedPhone,
      verificationMethod: method,
      phoneVerified: false,
      gmailVerified: false,
      teacherApprovalStatus: "pending_verification",
      isActivated: true,
      passwordSalt: salt,
      passwordHash: hashPasswordServer(String(password), salt),
      createdAt: now,
      status: "pending_activation",
      notes: "\u0110\u0103ng k\xFD Gi\xE1o vi\xEAn \u2014 Ch\u1EDD x\xE1c minh OTP v\xE0 Qu\u1EA3n tr\u1ECB vi\xEAn duy\u1EC7t"
    };
    const newRegistration = {
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
      approvalStatus: "pending_verification",
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
      message: "\u0110\xE3 ghi nh\u1EADn h\u1ED3 s\u01A1 \u0111\u0103ng k\xFD Gi\xE1o vi\xEAn. Vui l\xF2ng x\xE1c minh quy\u1EC1n s\u1EDF h\u1EEFu S\u1ED1 \u0111i\u1EC7n tho\u1EA1i ho\u1EB7c Gmail \u0111\u1EC3 chuy\u1EC3n sang danh s\xE1ch ch\u1EDD Qu\u1EA3n tr\u1ECB vi\xEAn duy\u1EC7t."
    });
  });
  app.get("/api/teacher-registration/email-config-check", async (_req, res) => {
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
      message: `D\u1ECBch v\u1EE5 g\u1EEDi m\xE3 OTP Gmail (${check.providerName}) \u0111\xE3 s\u1EB5n s\xE0ng.`
    });
  });
  app.post("/api/teacher-registration/send-gmail-otp", async (req, res) => {
    const { registrationId, registrationStateToken } = req.body || {};
    if (!registrationId) {
      res.status(400).json({ success: false, message: "Thiếu mã hồ sơ đăng ký (registrationId)." });
      return;
    }

    const registrations = loadTeacherRegistrations();
    const accounts = loadServerAccounts();
    let reg = registrations.find((r) => r.id === registrationId || r.teacherUid === registrationId);
    if (!reg && registrationStateToken) {
      reg = hydrateTeacherRegistrationFromStateToken(
        String(registrationStateToken),
        registrations,
        accounts
      );
    }
    if (!reg) {
      res.status(404).json({
        success: false,
        message: "Không tìm thấy hồ sơ đăng ký giáo viên. Vui lòng gửi lại biểu mẫu đăng ký."
      });
      return;
    }

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
        message: `Chưa thể gửi mã xác minh đến Gmail (${reg.gmail}) vì máy chủ thiếu cấu hình dịch vụ gửi email (${providerStatus.missingEnvVars.join(", ")}). Hệ thống không tạo mã giả lập và không tự động xác minh. Vui lòng cấu hình biến môi trường gửi mail trên máy chủ hoặc chọn xác minh qua OTP Số điện thoại (Firebase Phone Auth).`
      });
      return;
    }

    const otpCode = crypto.randomInt(100000, 999999).toString();
    const otpSalt = generateSaltServer();
    const otpHash = hashOtpCodeServer(otpCode, otpSalt);

    const delivery = await sendGmailVerificationCodeViaServer(reg.gmail, reg.fullName, otpCode);
    if (!delivery.sent) {
      res.status(503).json({
        success: false,
        providerConfigured: false,
        message: delivery.error || "Không thể gửi email xác minh qua dịch vụ máy chủ."
      });
      return;
    }

    reg.verificationMethod = "gmail_otp";
    reg.gmailOtpSalt = otpSalt;
    reg.gmailOtpHash = otpHash;
    reg.gmailOtpExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    reg.gmailOtpAttempts = 0;
    reg.lastOtpSentAt = new Date().toISOString();
    reg.updatedAt = new Date().toISOString();
    saveTeacherRegistrations(registrations);

    const linkedAccount = accounts.find((a) => a.id === reg.teacherUid);
    const updatedStateToken = encodeTeacherRegistrationStateToken(reg, linkedAccount);

    res.json({
      success: true,
      providerConfigured: true,
      providerName: providerStatus.providerName,
      expiresAt: reg.gmailOtpExpiresAt,
      registrationStateToken: updatedStateToken,
      message: `Đã gửi mã xác minh 6 chữ số tới địa chỉ Gmail ${reg.gmail}. Mã có hiệu lực trong 10 phút.`
    });
  });

  app.post("/api/teacher-registration/verify-gmail-otp", (req, res) => {
    const { registrationId, otpCode, registrationStateToken } = req.body || {};
    if (!registrationId || !otpCode) {
      res.status(400).json({
        success: false,
        message: "Vui lòng nhập đầy đủ mã hồ sơ đăng ký và mã xác minh Gmail 6 chữ số."
      });
      return;
    }

    const registrations = loadTeacherRegistrations();
    const accounts = loadServerAccounts();
    const classes = loadServerClasses();
    if (registrationStateToken) {
      hydrateTeacherRegistrationFromStateToken(
        String(registrationStateToken),
        registrations,
        accounts
      );
    }
    const reg = registrations.find((r) => r.id === registrationId || r.teacherUid === registrationId);
    if (!reg) {
      res.status(404).json({
        success: false,
        message: "Không tìm thấy hồ sơ đăng ký giáo viên. Vui lòng gửi lại biểu mẫu đăng ký."
      });
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
        message: "Bạn đã nhập sai mã xác minh quá 5 lần. Vui lòng yêu cầu gửi lại mã mới."
      });
      return;
    }

    if (Date.now() > new Date(reg.gmailOtpExpiresAt).getTime()) {
      res.status(401).json({
        success: false,
        message: "Mã xác minh Gmail đã hết hạn. Vui lòng yêu cầu gửi lại mã mới."
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
      const linkedAccount = accounts.find((a) => a.id === reg.teacherUid);
      res.status(401).json({
        success: false,
        remainingAttempts: Math.max(0, 5 - reg.gmailOtpAttempts),
        registrationStateToken: encodeTeacherRegistrationStateToken(reg, linkedAccount),
        message: `Mã xác minh Gmail không chính xác. Còn ${Math.max(0, 5 - reg.gmailOtpAttempts)} lần thử.`
      });
      return;
    }

    const now = new Date().toISOString();
    reg.gmailVerified = true;
    reg.gmailVerifiedAt = now;
    reg.isOwnershipVerified = true;
    reg.verificationMethod = "gmail_otp";
    reg.gmailOtpHash = undefined;
    reg.gmailOtpSalt = undefined;
    reg.gmailOtpExpiresAt = undefined;
    reg.gmailOtpAttempts = 0;
    if (reg.approvalStatus === "pending_verification") {
      reg.approvalStatus = "pending_admin_approval";
    }
    reg.updatedAt = now;

    const teacherAcc = accounts.find((a) => a.id === reg.teacherUid);
    if (teacherAcc) {
      teacherAcc.gmailVerified = true;
      teacherAcc.verificationMethod = "gmail_otp";
      if (teacherAcc.teacherApprovalStatus === "pending_verification") {
        teacherAcc.teacherApprovalStatus = "pending_admin_approval";
      }
      saveServerAccounts(accounts);
    }
    saveTeacherRegistrations(registrations);

    res.json({
      success: true,
      registration: sanitizeRegistrationForClient(reg, classes, accounts),
      message: 'Xác minh quyền sở hữu Gmail thành công! Yêu cầu đăng ký của bạn đã chuyển sang trạng thái "Chờ quản trị viên duyệt".'
    });
  });

  app.post("/api/teacher-registration/verify-phone-otp", async (req, res) => {
    const { registrationId, firebaseIdToken, registrationStateToken } = req.body || {};
    if (!registrationId || !firebaseIdToken) {
      res.status(400).json({
        success: false,
        message: "Thiếu mã hồ sơ đăng ký hoặc token xác thực Firebase Phone Authentication."
      });
      return;
    }

    const registrations = loadTeacherRegistrations();
    const accounts = loadServerAccounts();
    const classes = loadServerClasses();
    if (registrationStateToken) {
      hydrateTeacherRegistrationFromStateToken(
        String(registrationStateToken),
        registrations,
        accounts
      );
    }
    const reg = registrations.find((r) => r.id === registrationId || r.teacherUid === registrationId);
    if (!reg) {
      res.status(404).json({
        success: false,
        message: "Không tìm thấy hồ sơ đăng ký giáo viên. Vui lòng gửi lại biểu mẫu đăng ký."
      });
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
          "Xác minh OTP Số điện thoại không thành công. Hệ thống không chấp nhận xác minh giả lập."
      });
      return;
    }

    const now = new Date().toISOString();
    reg.phoneVerified = true;
    reg.phoneVerifiedAt = now;
    reg.isOwnershipVerified = true;
    reg.verificationMethod = "phone_otp";
    if (reg.approvalStatus === "pending_verification") {
      reg.approvalStatus = "pending_admin_approval";
    }
    reg.updatedAt = now;

    const teacherAcc = accounts.find((a) => a.id === reg.teacherUid);
    if (teacherAcc) {
      teacherAcc.phoneVerified = true;
      teacherAcc.verificationMethod = "phone_otp";
      if (teacherAcc.teacherApprovalStatus === "pending_verification") {
        teacherAcc.teacherApprovalStatus = "pending_admin_approval";
      }
      saveServerAccounts(accounts);
    }
    saveTeacherRegistrations(registrations);

    res.json({
      success: true,
      registration: sanitizeRegistrationForClient(reg, classes, accounts),
      message: 'Xác minh OTP Số điện thoại qua Firebase Phone Auth thành công! Yêu cầu của bạn đã chuyển sang trạng thái "Chờ quản trị viên duyệt".'
    });
  });

  app.get("/api/teacher-registration/status/:identifier", (req, res) => {
    const identifier = String(req.params.identifier || "").trim().toLowerCase();
    const stateToken = String(req.query?.stateToken || "").trim();
    const registrations = loadTeacherRegistrations();
    const classes = loadServerClasses();
    const accounts = loadServerAccounts();
    if (stateToken) {
      hydrateTeacherRegistrationFromStateToken(stateToken, registrations, accounts);
    }
    const reg = registrations.find(
      (r) =>
        r.id.toLowerCase() === identifier ||
        r.teacherUid.toLowerCase() === identifier ||
        r.username.toLowerCase() === identifier ||
        r.gmail.toLowerCase() === identifier ||
        normalizePhoneE164(r.phone).toLowerCase() === normalizePhoneE164(identifier).toLowerCase()
    );
    if (!reg) {
      res.status(404).json({ found: false, message: "Không tìm thấy hồ sơ đăng ký giáo viên." });
      return;
    }
    res.json({
      found: true,
      registration: sanitizeRegistrationForClient(reg, classes, accounts),
      emailProviderStatus: getEmailProviderStatus()
    });
  });
  app.get("/api/admin/overview", requireAdminAuth, (_req, res) => {
    const registrations = loadTeacherRegistrations();
    const accounts = loadServerAccounts();
    const classes = loadServerClasses();
    const auditLogs = loadAdminAuditLogs();
    const regMap = /* @__PURE__ */ new Map();
    for (const r of registrations) {
      regMap.set(r.teacherUid, r);
    }
    for (const acc of accounts) {
      if (acc.role === "teacher" && !regMap.has(acc.id)) {
        regMap.set(acc.id, {
          id: `treg-${acc.id}`,
          teacherUid: acc.id,
          username: acc.username,
          fullName: acc.fullName,
          phone: acc.phone || "Ch\u01B0a c\u1EADp nh\u1EADt",
          gmail: acc.email || "Ch\u01B0a c\u1EADp nh\u1EADt",
          verificationMethod: acc.verificationMethod || "phone_otp",
          phoneVerified: Boolean(acc.phoneVerified),
          gmailVerified: Boolean(acc.gmailVerified),
          isOwnershipVerified: Boolean(acc.phoneVerified || acc.gmailVerified),
          approvalStatus: acc.teacherApprovalStatus || "pending_verification",
          rejectionReason: acc.rejectionReason,
          reviewedByUid: acc.reviewedByUid,
          reviewedByName: acc.reviewedByName,
          reviewedAt: acc.reviewedAt,
          createdAt: acc.createdAt,
          updatedAt: acc.createdAt
        });
      }
    }
    const enrichedRegistrations = Array.from(regMap.values()).map(
      (r) => sanitizeRegistrationForClient(r, classes, accounts)
    );
    const enrichedClasses = classes.map((c) => enrichClassroomForClient(c, accounts));
    res.json({
      registrations: enrichedRegistrations,
      classes: enrichedClasses,
      auditLogs,
      summary: {
        totalTeachers: enrichedRegistrations.length,
        pendingVerificationCount: enrichedRegistrations.filter(
          (r) => r.approvalStatus === "pending_verification"
        ).length,
        pendingApprovalCount: enrichedRegistrations.filter(
          (r) => r.approvalStatus === "pending_admin_approval"
        ).length,
        approvedTeachersCount: enrichedRegistrations.filter((r) => r.approvalStatus === "approved").length,
        rejectedTeachersCount: enrichedRegistrations.filter((r) => r.approvalStatus === "rejected").length,
        suspendedTeachersCount: enrichedRegistrations.filter(
          (r) => r.approvalStatus === "suspended"
        ).length,
        totalActiveClasses: enrichedClasses.filter((c) => c.status === "active").length,
        totalEnrolledStudents: accounts.filter((a) => a.role === "student").length
      },
      emailProviderStatus: getEmailProviderStatus()
    });
  });
  app.post("/api/admin/teacher-review", requireAdminAuth, (req, res) => {
    const adminUser = req.authUser;
    const { teacherUid, registrationId, action, reason } = req.body || {};
    if (!action || !["approve", "reject", "suspend", "reactivate"].includes(action)) {
      res.status(400).json({
        success: false,
        message: "H\xE0nh \u0111\u1ED9ng x\xE9t duy\u1EC7t kh\xF4ng h\u1EE3p l\u1EC7 (approve | reject | suspend | reactivate)."
      });
      return;
    }
    const registrations = loadTeacherRegistrations();
    const accounts = loadServerAccounts();
    const classes = loadServerClasses();
    const auditLogs = loadAdminAuditLogs();
    const reg = registrations.find(
      (r) => teacherUid && r.teacherUid === teacherUid || registrationId && r.id === registrationId
    );
    if (!reg) {
      res.status(404).json({
        success: false,
        message: "Kh\xF4ng t\xECm th\u1EA5y h\u1ED3 s\u01A1 \u0111\u0103ng k\xFD c\u1EE7a gi\xE1o vi\xEAn n\xE0y."
      });
      return;
    }
    const teacherAcc = accounts.find((a) => a.id === reg.teacherUid && a.role === "teacher");
    if (!teacherAcc) {
      res.status(404).json({
        success: false,
        message: "Kh\xF4ng t\xECm th\u1EA5y t\xE0i kho\u1EA3n gi\xE1o vi\xEAn li\xEAn k\u1EBFt."
      });
      return;
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    if (action === "approve" || action === "reactivate") {
      if (!reg.isOwnershipVerified || !reg.phoneVerified && !reg.gmailVerified) {
        res.status(400).json({
          success: false,
          message: "Kh\xF4ng th\u1EC3 duy\u1EC7t: Gi\xE1o vi\xEAn n\xE0y ch\u01B0a ho\xE0n t\u1EA5t x\xE1c minh m\xE3 OTP (S\u1ED1 \u0111i\u1EC7n tho\u1EA1i ho\u1EB7c Gmail). Gi\xE1o vi\xEAn ph\u1EA3i x\xE1c minh quy\u1EC1n s\u1EDF h\u1EEFu tr\u01B0\u1EDBc khi Qu\u1EA3n tr\u1ECB vi\xEAn ph\xEA duy\u1EC7t."
        });
        return;
      }
      reg.approvalStatus = "approved";
      reg.rejectionReason = void 0;
      reg.suspensionReason = void 0;
      reg.reviewedByUid = adminUser.id;
      reg.reviewedByName = adminUser.fullName;
      reg.reviewedAt = now;
      reg.updatedAt = now;
      teacherAcc.teacherApprovalStatus = "approved";
      teacherAcc.status = "active";
      teacherAcc.isActivated = true;
      teacherAcc.rejectionReason = void 0;
      teacherAcc.reviewedByUid = adminUser.id;
      teacherAcc.reviewedByName = adminUser.fullName;
      teacherAcc.reviewedAt = now;
    } else if (action === "reject") {
      const trimmedReason = String(reason || "").trim();
      if (!trimmedReason) {
        res.status(400).json({
          success: false,
          message: "Vui l\xF2ng nh\u1EADp l\xED do t\u1EEB ch\u1ED1i h\u1ED3 s\u01A1 gi\xE1o vi\xEAn."
        });
        return;
      }
      reg.approvalStatus = "rejected";
      reg.rejectionReason = trimmedReason;
      reg.reviewedByUid = adminUser.id;
      reg.reviewedByName = adminUser.fullName;
      reg.reviewedAt = now;
      reg.updatedAt = now;
      teacherAcc.teacherApprovalStatus = "rejected";
      teacherAcc.rejectionReason = trimmedReason;
      teacherAcc.status = "locked";
      teacherAcc.reviewedByUid = adminUser.id;
      teacherAcc.reviewedByName = adminUser.fullName;
      teacherAcc.reviewedAt = now;
    } else if (action === "suspend") {
      const trimmedReason = String(reason || "T\u1EA1m kh\xF3a b\u1EDFi Qu\u1EA3n tr\u1ECB vi\xEAn").trim();
      reg.approvalStatus = "suspended";
      reg.suspensionReason = trimmedReason;
      reg.reviewedByUid = adminUser.id;
      reg.reviewedByName = adminUser.fullName;
      reg.reviewedAt = now;
      reg.updatedAt = now;
      teacherAcc.teacherApprovalStatus = "suspended";
      teacherAcc.rejectionReason = trimmedReason;
      teacherAcc.status = "locked";
      teacherAcc.reviewedByUid = adminUser.id;
      teacherAcc.reviewedByName = adminUser.fullName;
      teacherAcc.reviewedAt = now;
    }
    const auditEntry = {
      id: `audit-${crypto.randomUUID()}`,
      action: action === "approve" ? "approve_teacher" : action === "reject" ? "reject_teacher" : action === "suspend" ? "suspend_teacher" : "reactivate_teacher",
      targetTeacherUid: reg.teacherUid,
      targetTeacherName: reg.fullName,
      reason: reason ? String(reason).trim() : void 0,
      performedByUid: adminUser.id,
      performedByName: adminUser.fullName,
      performedAt: now
    };
    auditLogs.unshift(auditEntry);
    saveTeacherRegistrations(registrations);
    saveServerAccounts(accounts);
    saveAdminAuditLogs(auditLogs);
    syncTeacherRoleInFirestoreAdminSdk({
      teacherUid: reg.teacherUid,
      approved: action === "approve" || action === "reactivate",
      reviewedByUid: adminUser.id
    }).catch(() => {
    });
    res.json({
      success: true,
      registration: sanitizeRegistrationForClient(reg, classes, accounts),
      auditLog: auditEntry,
      message: action === "approve" ? `\u0110\xE3 ph\xEA duy\u1EC7t t\xE0i kho\u1EA3n Gi\xE1o vi\xEAn ${reg.fullName}.` : action === "reject" ? `\u0110\xE3 t\u1EEB ch\u1ED1i y\xEAu c\u1EA7u c\u1EE7a Gi\xE1o vi\xEAn ${reg.fullName}.` : action === "suspend" ? `\u0110\xE3 t\u1EA1m kh\xF3a t\xE0i kho\u1EA3n Gi\xE1o vi\xEAn ${reg.fullName}.` : `\u0110\xE3 m\u1EDF kh\xF3a l\u1EA1i t\xE0i kho\u1EA3n Gi\xE1o vi\xEAn ${reg.fullName}.`
    });
  });
  app.get(["/api/accounts", "/api/teacher/accounts"], requireTeacherAuth, (req, res) => {
    const session = req.authSession;
    const accounts = loadServerAccounts();
    const scopedAccounts = session.role === "admin" ? accounts : accounts.filter(
      (acc) => acc.id === session.uid || acc.role === "student" && acc.teacherUid === session.uid
    );
    res.json({
      accounts: scopedAccounts.map((acc) => sanitizeAccountForClient(acc, true))
    });
  });
  app.get("/api/auth/me", requireAuth, (req, res) => {
    const session = req.authSession;
    const accounts = loadServerAccounts();
    const user = accounts.find((a) => a.id === session.uid);
    if (!user || user.status === "locked") {
      res.status(401).json({ authenticated: false });
      return;
    }
    if (user.role === "teacher" && user.teacherApprovalStatus !== "approved") {
      res.status(403).json({
        authenticated: false,
        error: "T\xE0i kho\u1EA3n gi\xE1o vi\xEAn ch\u01B0a \u0111\u01B0\u1EE3c Qu\u1EA3n tr\u1ECB vi\xEAn ph\xEA duy\u1EC7t ho\u1EB7c \u0111\xE3 b\u1ECB t\u1EA1m kh\xF3a."
      });
      return;
    }
    res.json({
      authenticated: true,
      user: sanitizeAccountForClient(user),
      adminApprovalSignature: user.role === "teacher" || user.role === "admin" ? generateAdminApprovalSignature(user.id) : void 0
    });
  });
  app.post("/api/auth/login", (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      res.status(400).json({
        success: false,
        message: "Vui l\xF2ng nh\u1EADp \u0111\u1EA7y \u0111\u1EE7 M\xE3 t\xE0i kho\u1EA3n (ho\u1EB7c Gmail) v\xE0 M\u1EADt kh\u1EA9u."
      });
      return;
    }
    const accounts = loadServerAccounts();
    const trimmedInput = String(username).trim();
    const normalizedUsername = trimmedInput.toUpperCase();
    const normalizedEmail = trimmedInput.toLowerCase();
    const user = accounts.find(
      (a) => a.username.toUpperCase() === normalizedUsername || a.email && a.email.toLowerCase() === normalizedEmail
    );
    if (!user) {
      res.status(404).json({
        success: false,
        message: `Kh\xF4ng t\xECm th\u1EA5y t\xE0i kho\u1EA3n "${username}".`
      });
      return;
    }
    if (!user.passwordHash || !user.passwordSalt) {
      res.status(403).json({
        success: false,
        message: 'T\xE0i kho\u1EA3n n\xE0y ch\u01B0a \u0111\u01B0\u1EE3c k\xEDch ho\u1EA1t. Vui l\xF2ng chuy\u1EC3n sang tab "K\xEDch ho\u1EA1t m\xE3 1 l\u1EA7n" v\xE0 nh\u1EADp m\xE3 6 ch\u1EEF s\u1ED1 do gi\xE1o vi\xEAn c\u1EA5p.'
      });
      return;
    }
    const computedHash = hashPasswordServer(String(password), user.passwordSalt);
    if (computedHash !== user.passwordHash) {
      res.status(401).json({
        success: false,
        message: "M\u1EADt kh\u1EA9u kh\xF4ng ch\xEDnh x\xE1c."
      });
      return;
    }
    if (user.role === "admin") {
      res.status(403).json({
        success: false,
        code: "ADMIN_MUST_USE_FIREBASE_AUTH",
        message: "T\xE0i kho\u1EA3n Qu\u1EA3n tr\u1ECB vi\xEAn ch\u1EC9 \u0111\u01B0\u1EE3c ph\xE9p x\xE1c th\u1EF1c qua Firebase Authentication (Google Sign-In) v\u1EDBi UID \u0111\xE3 \u0111\u01B0\u1EE3c c\u1EA5p custom claim admin=true b\u1EB1ng Firebase Admin SDK."
      });
      return;
    }
    if (user.role === "teacher") {
      const registrations = loadTeacherRegistrations();
      const reg = registrations.find((r) => r.teacherUid === user.id);
      if (user.teacherApprovalStatus === "pending_verification") {
        res.status(403).json({
          success: false,
          code: "TEACHER_PENDING_VERIFICATION",
          registrationId: reg?.id,
          message: "T\xE0i kho\u1EA3n Gi\xE1o vi\xEAn ch\u01B0a x\xE1c minh m\xE3 OTP (S\u1ED1 \u0111i\u1EC7n tho\u1EA1i ho\u1EB7c Gmail). Vui l\xF2ng ho\xE0n t\u1EA5t x\xE1c minh quy\u1EC1n s\u1EDF h\u1EEFu tr\u01B0\u1EDBc khi ch\u1EDD Qu\u1EA3n tr\u1ECB vi\xEAn duy\u1EC7t."
        });
        return;
      }
      if (user.teacherApprovalStatus === "pending_admin_approval") {
        res.status(403).json({
          success: false,
          code: "TEACHER_PENDING_APPROVAL",
          registrationId: reg?.id,
          message: 'H\u1ED3 s\u01A1 Gi\xE1o vi\xEAn c\u1EE7a b\u1EA1n \u0111\xE3 x\xE1c minh OTP th\xE0nh c\xF4ng v\xE0 \u0111ang \u1EDF tr\u1EA1ng th\xE1i "Ch\u1EDD qu\u1EA3n tr\u1ECB vi\xEAn duy\u1EC7t". B\u1EA1n s\u1EBD \u0111\u0103ng nh\u1EADp \u0111\u01B0\u1EE3c ngay sau khi Qu\u1EA3n tr\u1ECB vi\xEAn ph\xEA duy\u1EC7t.'
        });
        return;
      }
      if (user.teacherApprovalStatus === "rejected") {
        res.status(403).json({
          success: false,
          code: "TEACHER_REJECTED",
          registrationId: reg?.id,
          rejectionReason: user.rejectionReason || reg?.rejectionReason,
          message: `Y\xEAu c\u1EA7u tham gia Gi\xE1o vi\xEAn \u0111\xE3 b\u1ECB Qu\u1EA3n tr\u1ECB vi\xEAn t\u1EEB ch\u1ED1i. L\xED do: ${user.rejectionReason || reg?.rejectionReason || "Kh\xF4ng \u0111\u1EA1t y\xEAu c\u1EA7u x\xE1c th\u1EF1c"}`
        });
        return;
      }
      if (user.teacherApprovalStatus === "suspended" || user.status === "locked") {
        res.status(403).json({
          success: false,
          code: "TEACHER_SUSPENDED",
          message: `T\xE0i kho\u1EA3n Gi\xE1o vi\xEAn \u0111ang b\u1ECB Qu\u1EA3n tr\u1ECB vi\xEAn t\u1EA1m kh\xF3a.${user.rejectionReason ? " L\xED do: " + user.rejectionReason : ""}`
        });
        return;
      }
    }
    if (user.status === "locked") {
      res.status(403).json({
        success: false,
        message: "T\xE0i kho\u1EA3n n\xE0y \u0111ang b\u1ECB t\u1EA1m kh\xF3a. Vui l\xF2ng li\xEAn h\u1EC7 gi\xE1o vi\xEAn ho\u1EB7c qu\u1EA3n tr\u1ECB vi\xEAn."
      });
      return;
    }
    if (!user.isActivated) {
      res.status(403).json({
        success: false,
        message: "T\xE0i kho\u1EA3n h\u1ECDc sinh ch\u01B0a k\xEDch ho\u1EA1t m\u1EADt kh\u1EA9u l\u1EA7n \u0111\u1EA7u. Vui l\xF2ng d\xF9ng m\xE3 k\xEDch ho\u1EA1t 6 ch\u1EEF s\u1ED1."
      });
      return;
    }
    user.lastLoginAt = (/* @__PURE__ */ new Date()).toISOString();
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
      adminApprovalSignature: user.role === "teacher" ? generateAdminApprovalSignature(user.id) : void 0
    });
  });
  app.post("/api/auth/activate", (req, res) => {
    const { username, activationCode, newPassword } = req.body || {};
    if (!username || !activationCode || !newPassword) {
      res.status(400).json({
        success: false,
        message: "Vui l\xF2ng nh\u1EADp \u0111\u1EA7y \u0111\u1EE7 M\xE3 t\xE0i kho\u1EA3n, M\xE3 k\xEDch ho\u1EA1t 6 s\u1ED1 v\xE0 M\u1EADt kh\u1EA9u m\u1EDBi."
      });
      return;
    }
    if (String(newPassword).length < 6) {
      res.status(400).json({
        success: false,
        message: "M\u1EADt kh\u1EA9u m\u1EDBi ph\u1EA3i c\xF3 t\u1ED1i thi\u1EC3u 6 k\xFD t\u1EF1."
      });
      return;
    }
    const accounts = loadServerAccounts();
    const normalizedUsername = String(username).trim().toUpperCase();
    const trimmedCode = String(activationCode).trim();
    const user = accounts.find(
      (a) => a.role === "student" && a.username.toUpperCase() === normalizedUsername
    );
    if (!user) {
      res.status(404).json({
        success: false,
        message: `Kh\xF4ng t\xECm th\u1EA5y m\xE3 h\u1ECDc sinh "${username}" trong danh s\xE1ch l\u1EDBp.`
      });
      return;
    }
    if (user.status === "locked") {
      res.status(403).json({
        success: false,
        message: "T\xE0i kho\u1EA3n \u0111ang b\u1ECB kh\xF3a. Vui l\xF2ng li\xEAn h\u1EC7 gi\xE1o vi\xEAn."
      });
      return;
    }
    if (!user.activationCode || user.activationCode !== trimmedCode) {
      res.status(401).json({
        success: false,
        message: "M\xE3 k\xEDch ho\u1EA1t 6 ch\u1EEF s\u1ED1 kh\xF4ng \u0111\xFAng ho\u1EB7c \u0111\xE3 \u0111\u01B0\u1EE3c s\u1EED d\u1EE5ng."
      });
      return;
    }
    if (user.activationCodeExpiresAt) {
      const expiry = new Date(user.activationCodeExpiresAt).getTime();
      if (Date.now() > expiry) {
        res.status(401).json({
          success: false,
          message: "M\xE3 k\xEDch ho\u1EA1t \u0111\xE3 h\u1EBFt h\u1EA1n. Vui l\xF2ng nh\u1EDD gi\xE1o vi\xEAn c\u1EA5p l\u1EA1i m\xE3 m\u1EDBi."
        });
        return;
      }
    }
    const salt = generateSaltServer();
    user.passwordSalt = salt;
    user.passwordHash = hashPasswordServer(String(newPassword), salt);
    user.isActivated = true;
    user.activationCode = void 0;
    user.activationCodeExpiresAt = void 0;
    user.status = "active";
    user.lastLoginAt = (/* @__PURE__ */ new Date()).toISOString();
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
      message: "K\xEDch ho\u1EA1t t\xE0i kho\u1EA3n v\xE0 thi\u1EBFt l\u1EADp m\u1EADt kh\u1EA9u th\xE0nh c\xF4ng!"
    });
  });
  app.post("/api/auth/google-match", async (req, res) => {
    const { firebaseIdToken, displayName: clientDisplayName } = req.body || {};
    if (!firebaseIdToken || typeof firebaseIdToken !== "string") {
      res.status(401).json({
        matched: false,
        message: "Thi\u1EBFu Firebase ID Token x\xE1c th\u1EF1c. H\u1EC7 th\u1ED1ng kh\xF4ng ch\u1EA5p nh\u1EADn email ho\u1EB7c UID do tr\xECnh duy\u1EC7t t\u1EF1 g\u1EEDi n\u1EBFu kh\xF4ng k\xE8m ID Token \u0111\xE3 k\xFD t\u1EEB Firebase Authentication."
      });
      return;
    }
    let verifiedUid = "";
    let verifiedEmail = "";
    let verifiedDisplayName = clientDisplayName ? String(clientDisplayName).trim() : "";
    let isAdminClaim = false;
    if (firebaseIdToken.startsWith("SERVER_ADMIN_CLAIM_PROOF.")) {
      const parts = firebaseIdToken.split(".");
      if (parts.length === 3) {
        const [, payloadB64, sig] = parts;
        const expectedSig = crypto.createHmac("sha256", SESSION_SECRET).update(`firebase_admin_claim_proof:${payloadB64}`).digest("base64url");
        if (sig === expectedSig) {
          try {
            const parsed = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
            if (parsed.uid && parsed.exp > Date.now()) {
              verifiedUid = String(parsed.uid);
              verifiedEmail = parsed.email ? String(parsed.email).toLowerCase() : "";
              verifiedDisplayName = parsed.displayName || "Qu\u1EA3n tr\u1ECB vi\xEAn H\u1EC7 th\u1ED1ng";
              isAdminClaim = parsed.admin === true;
            }
          } catch {
          }
        }
      }
      if (!verifiedUid) {
        res.status(401).json({
          matched: false,
          errorCategory: "TOKEN_ERROR",
          code: "INVALID_PROOF_TOKEN",
          message: "Ch\u1EEF k\xFD ki\u1EC3m th\u1EED Qu\u1EA3n tr\u1ECB vi\xEAn kh\xF4ng h\u1EE3p l\u1EC7 ho\u1EB7c \u0111\xE3 h\u1EBFt h\u1EA1n."
        });
        return;
      }
    } else {
      const tokenCheck = await verifyFirebaseIdTokenOnServer(firebaseIdToken);
      if (!tokenCheck.valid || !tokenCheck.uid) {
        res.status(401).json({
          matched: false,
          errorCategory: "TOKEN_ERROR",
          code: "INVALID_FIREBASE_TOKEN",
          message: tokenCheck.error || "Kh\xF4ng th\u1EC3 x\xE1c th\u1EF1c Firebase ID Token tr\xEAn m\xE1y ch\u1EE7."
        });
        return;
      }
      verifiedUid = tokenCheck.uid;
      verifiedEmail = (tokenCheck.email || "").trim().toLowerCase();
      verifiedDisplayName = tokenCheck.displayName || verifiedDisplayName;
      isAdminClaim = Boolean(tokenCheck.isAdminClaim);
    }
    const configuredFirstAdminUid = getConfiguredFirstAdminUid();
    const adminStatus = getFirebaseAdminStatus();
    const accounts = loadServerAccounts();
    if (configuredFirstAdminUid && verifiedUid === configuredFirstAdminUid && !isAdminClaim) {
      if (adminStatus.serviceAccountConfigured) {
        try {
          await executeServerAdminBootstrap(configuredFirstAdminUid);
          isAdminClaim = true;
        } catch (bootErr) {
          console.warn(
            "[FirebaseAdmin] C\u1EA3nh b\xE1o khi t\u1EF1 \u0111\u1ED9ng \u0111\u1ED3ng b\u1ED9 custom claim cho FIRST_ADMIN_UID:",
            bootErr?.message || bootErr
          );
          isAdminClaim = true;
        }
      } else {
        res.status(503).json({
          matched: false,
          errorCategory: "CONFIG_ERROR",
          code: "ADMIN_SDK_NOT_CONFIGURED",
          firebaseUid: verifiedUid,
          email: verifiedEmail,
          message: adminStatus.initializationError ? `T\xE0i kho\u1EA3n c\u1EE7a b\u1EA1n (UID: ${verifiedUid}) \u0111\xE3 kh\u1EDBp v\u1EDBi FIRST_ADMIN_UID, nh\u01B0ng bi\u1EBFn m\xF4i tr\u01B0\u1EDDng FIREBASE_SERVICE_ACCOUNT_JSON tr\xEAn m\xE1y ch\u1EE7 g\u1EB7p l\u1ED7i \u0111\u1ECBnh d\u1EA1ng: ${adminStatus.initializationError}` : `T\xE0i kho\u1EA3n c\u1EE7a b\u1EA1n (UID: ${verifiedUid}) \u0111\xE3 kh\u1EDBp v\u1EDBi FIRST_ADMIN_UID, nh\u01B0ng m\xE1y ch\u1EE7 ch\u01B0a \u0111\u1ECDc \u0111\u01B0\u1EE3c bi\u1EBFn m\xF4i tr\u01B0\u1EDDng FIREBASE_SERVICE_ACCOUNT_JSON \u0111\u1EC3 kh\u1EDFi t\u1EA1o Firebase Admin SDK.`
        });
        return;
      }
    }
    const isAuthorizedAdmin = isAdminClaim && (!configuredFirstAdminUid || verifiedUid === configuredFirstAdminUid);
    if (isAuthorizedAdmin) {
      const cleanedAccounts = accounts.filter(
        (a) => !(a.role === "admin" && a.id !== verifiedUid)
      );
      let adminUser = cleanedAccounts.find((a) => a.id === verifiedUid);
      const now = (/* @__PURE__ */ new Date()).toISOString();
      if (!adminUser) {
        const salt = generateSaltServer();
        adminUser = {
          id: verifiedUid,
          username: `ADMIN-${verifiedUid.slice(0, 6).toUpperCase()}`,
          fullName: verifiedDisplayName || "Qu\u1EA3n tr\u1ECB vi\xEAn H\u1EC7 th\u1ED1ng",
          role: "admin",
          email: verifiedEmail || void 0,
          isActivated: true,
          passwordSalt: salt,
          passwordHash: hashPasswordServer(crypto.randomBytes(24).toString("hex"), salt),
          createdAt: now,
          lastLoginAt: now,
          status: "active",
          notes: "Qu\u1EA3n tr\u1ECB vi\xEAn x\xE1c th\u1EF1c qua Firebase Auth (custom claim admin=true)"
        };
        cleanedAccounts.unshift(adminUser);
      } else {
        adminUser.role = "admin";
        adminUser.status = "active";
        adminUser.isActivated = true;
        adminUser.email = verifiedEmail || adminUser.email;
        adminUser.lastLoginAt = now;
      }
      saveServerAccounts(cleanedAccounts);
      const sessionToken2 = signSessionToken({
        uid: adminUser.id,
        username: adminUser.username,
        role: "admin"
      });
      res.status(200).json({
        matched: true,
        firebaseUid: verifiedUid,
        isAdminClaim: true,
        user: sanitizeAccountForClient(adminUser),
        sessionToken: sessionToken2,
        adminApprovalSignature: generateAdminApprovalSignature(verifiedUid)
      });
      return;
    }
    const user = accounts.find(
      (a) => a.role !== "admin" && (a.id === verifiedUid || verifiedEmail && a.email && a.email.toLowerCase() === verifiedEmail)
    );
    if (!user) {
      if (!configuredFirstAdminUid) {
        res.status(403).json({
          matched: false,
          errorCategory: "CONFIG_ERROR",
          code: "FIRST_ADMIN_UID_NOT_CONFIGURED",
          firebaseUid: verifiedUid,
          email: verifiedEmail,
          message: `T\xE0i kho\u1EA3n Firebase (${verifiedEmail || verifiedUid}, UID: ${verifiedUid}) ch\u01B0a c\xF3 trong danh s\xE1ch Gi\xE1o vi\xEAn/H\u1ECDc sinh, v\xE0 m\xE1y ch\u1EE7 hi\u1EC7n ch\u01B0a \u0111\u1ECDc \u0111\u01B0\u1EE3c bi\u1EBFn m\xF4i tr\u01B0\u1EDDng FIRST_ADMIN_UID.`
        });
        return;
      }
      res.status(403).json({
        matched: false,
        errorCategory: "PERMISSION_ERROR",
        code: "ADMIN_UID_MISMATCH",
        firebaseUid: verifiedUid,
        email: verifiedEmail,
        message: `T\u1EEB ch\u1ED1i quy\u1EC1n truy c\u1EADp (403): T\xE0i kho\u1EA3n Firebase (${verifiedEmail || verifiedUid}, UID: ${verifiedUid}) kh\xF4ng kh\u1EDBp v\u1EDBi FIRST_ADMIN_UID \u0111\xE3 c\u1EA5u h\xECnh tr\xEAn m\xE1y ch\u1EE7 v\xE0 ch\u01B0a c\xF3 h\u1ED3 s\u01A1 Gi\xE1o vi\xEAn/H\u1ECDc sinh \u0111\u01B0\u1EE3c duy\u1EC7t.`
      });
      return;
    }
    if (user.role === "teacher" && user.teacherApprovalStatus !== "approved") {
      res.status(403).json({
        matched: false,
        firebaseUid: verifiedUid,
        message: user.teacherApprovalStatus === "pending_verification" ? "T\xE0i kho\u1EA3n Gi\xE1o vi\xEAn g\u1EAFn v\u1EDBi Gmail n\xE0y ch\u01B0a x\xE1c minh OTP. Vui l\xF2ng ho\xE0n t\u1EA5t x\xE1c minh tr\u01B0\u1EDBc." : user.teacherApprovalStatus === "pending_admin_approval" ? 'T\xE0i kho\u1EA3n Gi\xE1o vi\xEAn g\u1EAFn v\u1EDBi Gmail n\xE0y \u0111ang \u1EDF tr\u1EA1ng th\xE1i "Ch\u1EDD qu\u1EA3n tr\u1ECB vi\xEAn duy\u1EC7t".' : `T\xE0i kho\u1EA3n Gi\xE1o vi\xEAn g\u1EAFn v\u1EDBi Gmail n\xE0y kh\xF4ng \u0111\u01B0\u1EE3c ph\xE9p truy c\u1EADp (${user.rejectionReason || "\u0110\xE3 t\u1EEB ch\u1ED1i/T\u1EA1m kh\xF3a"}).`
      });
      return;
    }
    if (user.status === "locked") {
      res.status(403).json({
        matched: false,
        firebaseUid: verifiedUid,
        message: "T\xE0i kho\u1EA3n g\u1EAFn v\u1EDBi email n\xE0y \u0111ang b\u1ECB t\u1EA1m kh\xF3a."
      });
      return;
    }
    user.isActivated = true;
    user.status = "active";
    user.lastLoginAt = (/* @__PURE__ */ new Date()).toISOString();
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
      adminApprovalSignature: user.role === "teacher" ? generateAdminApprovalSignature(user.id) : void 0
    });
  });
  app.post("/api/auth/change-password", requireAuth, (req, res) => {
    const session = req.authSession;
    const { userId, oldPass, newPass } = req.body || {};
    if (!userId || !oldPass || !newPass || String(newPass).length < 6) {
      res.status(400).json({
        success: false,
        message: "Vui l\xF2ng nh\u1EADp m\u1EADt kh\u1EA9u hi\u1EC7n t\u1EA1i v\xE0 m\u1EADt kh\u1EA9u m\u1EDBi (t\u1ED1i thi\u1EC3u 6 k\xFD t\u1EF1)."
      });
      return;
    }
    if (session.uid !== userId && session.role !== "admin") {
      res.status(403).json({
        success: false,
        message: "T\u1EEB ch\u1ED1i truy c\u1EADp: B\u1EA1n ch\u1EC9 c\xF3 th\u1EC3 \u0111\u1ED5i m\u1EADt kh\u1EA9u cho ch\xEDnh t\xE0i kho\u1EA3n c\u1EE7a m\xECnh."
      });
      return;
    }
    const accounts = loadServerAccounts();
    const user = accounts.find((a) => a.id === userId);
    if (!user || !user.passwordSalt || !user.passwordHash) {
      res.status(404).json({ success: false, message: "Kh\xF4ng t\xECm th\u1EA5y t\xE0i kho\u1EA3n." });
      return;
    }
    const checkOld = hashPasswordServer(String(oldPass), user.passwordSalt);
    if (checkOld !== user.passwordHash) {
      res.status(401).json({ success: false, message: "M\u1EADt kh\u1EA9u hi\u1EC7n t\u1EA1i kh\xF4ng ch\xEDnh x\xE1c." });
      return;
    }
    const newSalt = generateSaltServer();
    user.passwordSalt = newSalt;
    user.passwordHash = hashPasswordServer(String(newPass), newSalt);
    saveServerAccounts(accounts);
    res.json({ success: true, message: "\u0110\u1ED5i m\u1EADt kh\u1EA9u th\xE0nh c\xF4ng!" });
  });
  app.get("/api/classes", requireTeacherAuth, (req, res) => {
    const session = req.authSession;
    const classes = loadServerClasses();
    const accounts = loadServerAccounts();
    const scopedClasses = session.role === "admin" ? classes : classes.filter((c) => c.teacherUid === session.uid);
    const enriched = scopedClasses.map((c) => enrichClassroomForClient(c, accounts));
    const activeClassesCount = enriched.filter((c) => c.status === "active").length;
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
  app.get("/api/my-class", requireAuth, (req, res) => {
    const authUser = req.authUser;
    const classes = loadServerClasses();
    const accounts = loadServerAccounts();
    if (authUser.role === "student") {
      const myClass = classes.find(
        (c) => c.id === authUser.classId || authUser.teacherUid && c.teacherUid === authUser.teacherUid && c.name === authUser.className || c.name === authUser.className
      );
      res.json({
        classroom: myClass ? enrichClassroomForClient(myClass, accounts) : null
      });
      return;
    }
    const myClasses = classes.filter((c) => c.teacherUid === authUser.id).map((c) => enrichClassroomForClient(c, accounts));
    res.json({ classrooms: myClasses });
  });
  app.post("/api/classes", requireTeacherAuth, async (req, res) => {
    const session = req.authSession;
    const authUser = req.authUser;
    if (session.role !== "teacher") {
      res.status(403).json({
        error: "Ch\u1EC9 t\xE0i kho\u1EA3n Gi\xE1o vi\xEAn \u0111\xE3 \u0111\u01B0\u1EE3c Qu\u1EA3n tr\u1ECB vi\xEAn ph\xEA duy\u1EC7t m\u1EDBi c\xF3 th\u1EC3 t\u1EA1o l\u1EDBp h\u1ECDc ph\u1EE5 tr\xE1ch."
      });
      return;
    }
    const rawName = String(req.body?.name || "").trim();
    if (!rawName) {
      res.status(400).json({ error: "Vui l\xF2ng nh\u1EADp t\xEAn l\u1EDBp h\u1ECDc (VD: 12A1)." });
      return;
    }
    const normalizedName = rawName.toUpperCase();
    await withQuotaLock(async () => {
      const classes = loadServerClasses();
      const accounts = loadServerAccounts();
      const teacherActiveClasses = classes.filter(
        (c) => c.teacherUid === session.uid && c.status === "active"
      );
      if (teacherActiveClasses.some((c) => c.name.trim().toUpperCase() === normalizedName)) {
        res.status(409).json({
          error: `L\u1EDBp "${normalizedName}" \u0111\xE3 t\u1ED3n t\u1EA1i trong danh s\xE1ch l\u1EDBp \u0111ang ho\u1EA1t \u0111\u1ED9ng c\u1EE7a b\u1EA1n.`
        });
        return;
      }
      if (teacherActiveClasses.length >= MAX_ACTIVE_CLASSES_PER_TEACHER) {
        res.status(403).json({
          error: `Gi\u1EDBi h\u1EA1n c\u1EA5p l\u1EDBp: M\u1ED7i gi\xE1o vi\xEAn ch\u1EC9 \u0111\u01B0\u1EE3c qu\u1EA3n l\xED t\u1ED1i \u0111a ${MAX_ACTIVE_CLASSES_PER_TEACHER} l\u1EDBp \u0111ang ho\u1EA1t \u0111\u1ED9ng (Hi\u1EC7n t\u1EA1i: ${teacherActiveClasses.length}/${MAX_ACTIVE_CLASSES_PER_TEACHER} l\u1EDBp, c\xF2n t\u1EA1o \u0111\u01B0\u1EE3c 0 l\u1EDBp). Kh\xF4ng cho ph\xE9p t\u1EA1o l\u1EDBp th\u1EE9 ${MAX_ACTIVE_CLASSES_PER_TEACHER + 1}.`,
          code: "MAX_CLASSES_QUOTA_EXCEEDED",
          quota: {
            activeClassesCount: teacherActiveClasses.length,
            maxActiveClasses: MAX_ACTIVE_CLASSES_PER_TEACHER,
            remainingClassesQuota: 0
          }
        });
        return;
      }
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const newClass = {
        id: `cls-${crypto.randomUUID()}`,
        name: normalizedName,
        teacherUid: session.uid,
        teacherName: authUser.fullName,
        status: "active",
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
        message: `\u0110\xE3 t\u1EA1o l\u1EDBp ${normalizedName} th\xE0nh c\xF4ng! B\u1EA1n \u0111\xE3 d\xF9ng ${newActiveCount}/${MAX_ACTIVE_CLASSES_PER_TEACHER} l\u1EDBp (c\xF2n t\u1EA1o \u0111\u01B0\u1EE3c ${Math.max(
          0,
          MAX_ACTIVE_CLASSES_PER_TEACHER - newActiveCount
        )} l\u1EDBp).`
      });
    });
  });
  app.post("/api/accounts/student", requireTeacherAuth, async (req, res) => {
    const session = req.authSession;
    const authUser = req.authUser;
    const { username, fullName, className, classId, email, notes } = req.body || {};
    if (!username || !fullName || !className && !classId) {
      res.status(400).json({ error: "Vui l\xF2ng nh\u1EADp \u0111\u1EE7 M\xE3 h\u1ECDc sinh, H\u1ECD t\xEAn v\xE0 L\u1EDBp." });
      return;
    }
    await withQuotaLock(async () => {
      const accounts = loadServerAccounts();
      const classes = loadServerClasses();
      const normalizedUsername = String(username).trim().toUpperCase();
      const normalizedFullName = String(fullName).trim();
      const normalizedEmail = email ? String(email).trim().toLowerCase() : void 0;
      const targetClassName = String(className || "").trim().toUpperCase();
      let targetClass = classes.find(
        (c) => classId && c.id === classId || c.teacherUid === session.uid && c.name.toUpperCase() === targetClassName
      );
      if (targetClass && targetClass.teacherUid !== session.uid && session.role !== "admin") {
        res.status(403).json({
          error: "T\u1EEB ch\u1ED1i truy c\u1EADp (403): B\u1EA1n ch\u1EC9 \u0111\u01B0\u1EE3c ph\xE9p qu\u1EA3n l\xED v\xE0 ghi danh h\u1ECDc sinh v\xE0o l\u1EDBp thu\u1ED9c ph\u1EA1m vi ph\u1EE5 tr\xE1ch c\u1EE7a m\xECnh."
        });
        return;
      }
      if (!targetClass && classId) {
        res.status(404).json({ error: "Kh\xF4ng t\xECm th\u1EA5y l\u1EDBp h\u1ECDc \u0111\u01B0\u1EE3c ch\u1EC9 \u0111\u1ECBnh." });
        return;
      }
      if (!targetClass) {
        const teacherActiveClasses = classes.filter(
          (c) => c.teacherUid === session.uid && c.status === "active"
        );
        if (teacherActiveClasses.length >= MAX_ACTIVE_CLASSES_PER_TEACHER) {
          res.status(403).json({
            error: `Kh\xF4ng th\u1EC3 ghi danh v\xE0o l\u1EDBp m\u1EDBi "${targetClassName}": B\u1EA1n \u0111\xE3 \u0111\u1EA1t gi\u1EDBi h\u1EA1n t\u1ED1i \u0111a ${MAX_ACTIVE_CLASSES_PER_TEACHER} l\u1EDBp \u0111ang ho\u1EA1t \u0111\u1ED9ng (5/5 l\u1EDBp). Kh\xF4ng \u0111\u01B0\u1EE3c t\u1EA1o l\u1EDBp th\u1EE9 6.`,
            code: "MAX_CLASSES_QUOTA_EXCEEDED"
          });
          return;
        }
        const now = (/* @__PURE__ */ new Date()).toISOString();
        targetClass = {
          id: `cls-${crypto.randomUUID()}`,
          name: targetClassName,
          teacherUid: session.uid,
          teacherName: authUser.fullName,
          status: "active",
          enrolledCount: 0,
          maxCapacity: MAX_ENROLLED_STUDENTS_PER_CLASS,
          createdAt: now,
          updatedAt: now
        };
        classes.push(targetClass);
      }
      if (targetClass.status !== "active") {
        res.status(400).json({ error: `L\u1EDBp ${targetClass.name} hi\u1EC7n kh\xF4ng \u1EDF tr\u1EA1ng th\xE1i ho\u1EA1t \u0111\u1ED9ng.` });
        return;
      }
      const duplicateByCode = accounts.find(
        (a) => a.username.toUpperCase() === normalizedUsername
      );
      if (duplicateByCode) {
        res.status(409).json({
          error: `Ch\u1ED1ng ghi danh tr\xF9ng: M\xE3 h\u1ECDc sinh "${normalizedUsername}" \u0111\xE3 t\u1ED3n t\u1EA1i trong danh s\xE1ch.`
        });
        return;
      }
      const enrolledInClass = accounts.filter(
        (a) => a.role === "student" && (a.classId === targetClass.id || a.teacherUid === targetClass.teacherUid && (a.className || "").toUpperCase() === targetClass.name.toUpperCase())
      );
      if (normalizedEmail && enrolledInClass.some((a) => a.email && a.email.toLowerCase() === normalizedEmail)) {
        res.status(409).json({
          error: `Ch\u1ED1ng ghi danh tr\xF9ng: H\u1ECDc sinh v\u1EDBi email "${normalizedEmail}" \u0111\xE3 \u0111\u01B0\u1EE3c ghi danh trong l\u1EDBp ${targetClass.name}.`
        });
        return;
      }
      if (enrolledInClass.length >= MAX_ENROLLED_STUDENTS_PER_CLASS) {
        res.status(403).json({
          error: `Gi\u1EDBi h\u1EA1n s\u0129 s\u1ED1 l\u1EDBp: L\u1EDBp ${targetClass.name} \u0111\xE3 \u0111\u1EA1t t\u1ED1i \u0111a ${MAX_ENROLLED_STUDENTS_PER_CLASS}/${MAX_ENROLLED_STUDENTS_PER_CLASS} h\u1ECDc sinh (c\xF2n tr\u1ED1ng 0 ch\u1ED7). Kh\xF4ng cho ph\xE9p ghi danh h\u1ECDc sinh th\u1EE9 ${MAX_ENROLLED_STUDENTS_PER_CLASS + 1}.`,
          code: "MAX_STUDENTS_QUOTA_EXCEEDED",
          classroom: enrichClassroomForClient(targetClass, accounts)
        });
        return;
      }
      const newAccount = {
        id: `uid-hs-${crypto.randomUUID()}`,
        username: normalizedUsername,
        fullName: normalizedFullName,
        role: "student",
        className: targetClass.name,
        classId: targetClass.id,
        teacherUid: targetClass.teacherUid,
        email: normalizedEmail,
        isActivated: false,
        activationCode: generateActivationCodeServer(),
        activationCodeExpiresAt: getExpiryDateServer(14),
        status: "pending_activation",
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        notes: notes ? String(notes).trim() : void 0
      };
      accounts.unshift(newAccount);
      targetClass.enrolledCount = enrolledInClass.length + 1;
      targetClass.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      saveServerAccounts(accounts);
      saveServerClasses(classes);
      res.json({
        account: sanitizeAccountForClient(newAccount, true),
        classroom: enrichClassroomForClient(targetClass, accounts)
      });
    });
  });
  app.post("/api/accounts/batch", requireTeacherAuth, async (req, res) => {
    const session = req.authSession;
    const authUser = req.authUser;
    const { rows } = req.body || {};
    if (!Array.isArray(rows)) {
      res.status(400).json({ error: "D\u1EEF li\u1EC7u danh s\xE1ch kh\xF4ng h\u1EE3p l\u1EC7." });
      return;
    }
    await withQuotaLock(async () => {
      const accounts = loadServerAccounts();
      const classes = loadServerClasses();
      const existingSet = new Set(accounts.map((a) => a.username.toUpperCase()));
      const newAccounts = [];
      let skippedCount = 0;
      let quotaRejectedCount = 0;
      for (const row of rows) {
        const uname = String(row.username || "").trim().toUpperCase();
        const cname = String(row.className || "12A1").trim().toUpperCase();
        if (!uname || existingSet.has(uname)) {
          skippedCount++;
          continue;
        }
        let targetClass = classes.find(
          (c) => c.teacherUid === session.uid && c.name.toUpperCase() === cname
        );
        if (!targetClass) {
          const teacherActiveCount = classes.filter(
            (c) => c.teacherUid === session.uid && c.status === "active"
          ).length;
          if (teacherActiveCount >= MAX_ACTIVE_CLASSES_PER_TEACHER) {
            quotaRejectedCount++;
            continue;
          }
          const now = (/* @__PURE__ */ new Date()).toISOString();
          targetClass = {
            id: `cls-${crypto.randomUUID()}`,
            name: cname,
            teacherUid: session.uid,
            teacherName: authUser.fullName,
            status: "active",
            enrolledCount: 0,
            maxCapacity: MAX_ENROLLED_STUDENTS_PER_CLASS,
            createdAt: now,
            updatedAt: now
          };
          classes.push(targetClass);
        }
        const currentClassCount = accounts.filter(
          (a) => a.role === "student" && (a.classId === targetClass.id || a.teacherUid === session.uid && (a.className || "").toUpperCase() === cname)
        ).length + newAccounts.filter((a) => a.classId === targetClass.id).length;
        if (currentClassCount >= MAX_ENROLLED_STUDENTS_PER_CLASS) {
          quotaRejectedCount++;
          continue;
        }
        const acc = {
          id: `uid-hs-${crypto.randomUUID()}`,
          username: uname,
          fullName: String(row.fullName || `H\u1ECDc sinh ${uname}`).trim(),
          role: "student",
          className: targetClass.name,
          classId: targetClass.id,
          teacherUid: session.uid,
          email: row.email ? String(row.email).trim().toLowerCase() : void 0,
          isActivated: false,
          activationCode: generateActivationCodeServer(),
          activationCodeExpiresAt: getExpiryDateServer(14),
          status: "pending_activation",
          createdAt: (/* @__PURE__ */ new Date()).toISOString(),
          notes: row.notes ? String(row.notes).trim() : void 0
        };
        existingSet.add(uname);
        newAccounts.push(acc);
        targetClass.enrolledCount = currentClassCount + 1;
        targetClass.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      }
      if (newAccounts.length === 0 && quotaRejectedCount > 0) {
        res.status(403).json({
          error: `Kh\xF4ng th\u1EC3 ghi danh: \u0110\xE3 v\u01B0\u1EE3t gi\u1EDBi h\u1EA1n t\u1ED1i \u0111a (${MAX_ACTIVE_CLASSES_PER_TEACHER} l\u1EDBp/gi\xE1o vi\xEAn ho\u1EB7c ${MAX_ENROLLED_STUDENTS_PER_CLASS} h\u1ECDc sinh/l\u1EDBp).`
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
  app.post("/api/accounts/reset-code", requireTeacherAuth, (req, res) => {
    const session = req.authSession;
    const { studentId } = req.body || {};
    const accounts = loadServerAccounts();
    const user = accounts.find((a) => a.id === studentId && a.role === "student");
    if (!user) {
      res.status(404).json({ error: "Kh\xF4ng t\xECm th\u1EA5y h\u1ECDc sinh." });
      return;
    }
    if (session.role !== "admin" && user.teacherUid !== session.uid) {
      res.status(403).json({
        error: "T\u1EEB ch\u1ED1i truy c\u1EADp (403): Gi\xE1o vi\xEAn ch\u1EC9 \u0111\u01B0\u1EE3c qu\u1EA3n l\xED h\u1ECDc sinh thu\u1ED9c l\u1EDBp m\xECnh ph\u1EE5 tr\xE1ch."
      });
      return;
    }
    const newCode = generateActivationCodeServer();
    const expiresAt = getExpiryDateServer(14);
    user.activationCode = newCode;
    user.activationCodeExpiresAt = expiresAt;
    user.status = "pending_activation";
    user.isActivated = false;
    saveServerAccounts(accounts);
    res.json({
      success: true,
      newCode,
      expiresAt,
      account: sanitizeAccountForClient(user, true)
    });
  });
  app.post("/api/accounts/toggle-lock", requireTeacherAuth, (req, res) => {
    const session = req.authSession;
    const { studentId } = req.body || {};
    const accounts = loadServerAccounts();
    const user = accounts.find((a) => a.id === studentId && a.role === "student");
    if (!user) {
      res.status(404).json({ error: "Kh\xF4ng t\xECm th\u1EA5y h\u1ECDc sinh." });
      return;
    }
    if (session.role !== "admin" && user.teacherUid !== session.uid) {
      res.status(403).json({
        error: "T\u1EEB ch\u1ED1i truy c\u1EADp (403): Gi\xE1o vi\xEAn ch\u1EC9 \u0111\u01B0\u1EE3c kh\xF3a/m\u1EDF kh\xF3a h\u1ECDc sinh thu\u1ED9c l\u1EDBp m\xECnh ph\u1EE5 tr\xE1ch."
      });
      return;
    }
    user.status = user.status === "locked" ? user.isActivated ? "active" : "pending_activation" : "locked";
    saveServerAccounts(accounts);
    res.json({ account: sanitizeAccountForClient(user, true) });
  });
  function canAccessStudentRecord(session, targetUid) {
    if (session.role === "admin") return true;
    if (session.role === "student") return session.uid === targetUid;
    if (session.role === "teacher") {
      if (session.uid === targetUid) return true;
      const accounts = loadServerAccounts();
      const student = accounts.find((a) => a.id === targetUid && a.role === "student");
      return Boolean(student && student.teacherUid === session.uid);
    }
    return false;
  }
  app.get("/api/student-state/:uid", requireAuth, (req, res) => {
    const session = req.authSession;
    const targetUid = String(req.params.uid || "").trim();
    if (!canAccessStudentRecord(session, targetUid)) {
      res.status(403).json({
        error: "T\u1EEB ch\u1ED1i truy c\u1EADp (403): B\u1EA1n ch\u1EC9 \u0111\u01B0\u1EE3c ph\xE9p \u0111\u1ECDc d\u1EEF li\u1EC7u h\u1ECDc t\u1EADp trong ph\u1EA1m vi t\xE0i kho\u1EA3n ho\u1EB7c l\u1EDBp h\u1ECDc \u0111\u01B0\u1EE3c ph\xE2n quy\u1EC1n."
      });
      return;
    }
    const allStates = loadServerStudentStates();
    res.json({
      uid: targetUid,
      state: allStates[targetUid] || null
    });
  });
  app.put("/api/student-state/:uid", requireAuth, (req, res) => {
    const session = req.authSession;
    const targetUid = String(req.params.uid || "").trim();
    if (!canAccessStudentRecord(session, targetUid)) {
      res.status(403).json({
        error: "T\u1EEB ch\u1ED1i truy c\u1EADp (403): B\u1EA1n ch\u1EC9 \u0111\u01B0\u1EE3c ph\xE9p c\u1EADp nh\u1EADt d\u1EEF li\u1EC7u h\u1ECDc t\u1EADp trong ph\u1EA1m vi t\xE0i kho\u1EA3n ho\u1EB7c l\u1EDBp h\u1ECDc \u0111\u01B0\u1EE3c ph\xE2n quy\u1EC1n."
      });
      return;
    }
    const { survey, readingAttempts, writingRecords, linkedGoogleDocs } = req.body || {};
    const allStates = loadServerStudentStates();
    const prev = allStates[targetUid] || {};
    allStates[targetUid] = {
      uid: targetUid,
      survey: survey !== void 0 ? survey : prev.survey || null,
      readingAttempts: Array.isArray(readingAttempts) ? readingAttempts : prev.readingAttempts || [],
      writingRecords: Array.isArray(writingRecords) ? writingRecords : prev.writingRecords || [],
      linkedGoogleDocs: linkedGoogleDocs && typeof linkedGoogleDocs === "object" ? { ...prev.linkedGoogleDocs || {}, ...linkedGoogleDocs } : prev.linkedGoogleDocs || {},
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    saveServerStudentStates(allStates);
    res.json({
      success: true,
      uid: targetUid,
      updatedAt: allStates[targetUid].updatedAt
    });
  });
  app.get("/api/student-state/:uid/google-docs", requireAuth, (req, res) => {
    const session = req.authSession;
    const targetUid = String(req.params.uid || "").trim();
    if (!canAccessStudentRecord(session, targetUid)) {
      res.status(403).json({
        error: "T\u1EEB ch\u1ED1i truy c\u1EADp (403): Kh\xF4ng c\xF3 quy\u1EC1n truy c\u1EADp li\xEAn k\u1EBFt Google Docs ngo\xE0i ph\u1EA1m vi ph\xE2n quy\u1EC1n."
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
  app.put("/api/student-state/:uid/google-docs/:taskId", requireAuth, (req, res) => {
    const session = req.authSession;
    const targetUid = String(req.params.uid || "").trim();
    const taskId = String(req.params.taskId || "").trim();
    if (!canAccessStudentRecord(session, targetUid)) {
      res.status(403).json({
        error: "T\u1EEB ch\u1ED1i truy c\u1EADp (403): Kh\xF4ng c\xF3 quy\u1EC1n l\u01B0u li\xEAn k\u1EBFt Google Docs ngo\xE0i ph\u1EA1m vi ph\xE2n quy\u1EC1n."
      });
      return;
    }
    const incomingDoc = req.body?.linkedGoogleDoc;
    if (!incomingDoc || !incomingDoc.docId || !taskId) {
      res.status(400).json({
        error: "Thi\u1EBFu th\xF4ng tin docId ho\u1EB7c m\xE3 nhi\u1EC7m v\u1EE5 (taskId) khi l\u01B0u li\xEAn k\u1EBFt Google Docs."
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
      ...prev.linkedGoogleDocs || {},
      [taskId]: {
        ...incomingDoc,
        studentUid: targetUid,
        taskId,
        savedToProfileAt: (/* @__PURE__ */ new Date()).toISOString()
      }
    };
    allStates[targetUid] = {
      ...prev,
      uid: targetUid,
      linkedGoogleDocs: nextDocs,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    saveServerStudentStates(allStates);
    res.json({
      success: true,
      uid: targetUid,
      taskId,
      linkedGoogleDoc: nextDocs[taskId]
    });
  });
  app.get("/api/teacher/student-states", requireTeacherAuth, (req, res) => {
    const session = req.authSession;
    const allStates = loadServerStudentStates();
    if (session.role === "admin") {
      res.json({ states: allStates });
      return;
    }
    const accounts = loadServerAccounts();
    const myStudentUids = new Set(
      accounts.filter((a) => a.role === "student" && a.teacherUid === session.uid).map((a) => a.id)
    );
    const scopedStates = {};
    for (const [uid, st] of Object.entries(allStates)) {
      if (myStudentUids.has(uid) || uid === session.uid) {
        scopedStates[uid] = st;
      }
    }
    res.json({ states: scopedStates });
  });
  const DRAFTS_FILE = path.join(DATA_DIR, "writing_drafts_v2.json");
  const EXAM_SESSIONS_FILE = path.join(DATA_DIR, "exam_sessions_v2.json");
  function loadKeyValueStore(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") return parsed;
      }
    } catch (err) {
      console.warn("Error reading store:", filePath, err);
    }
    return {};
  }
  function saveKeyValueStore(filePath, data) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
      console.error("Error writing store:", filePath, err);
    }
  }
  app.get("/api/drafts/:uid/:taskId", requireAuth, (req, res) => {
    const session = req.authSession;
    const targetUid = String(req.params.uid || "").trim();
    const taskId = String(req.params.taskId || "").trim();
    if (!canAccessStudentRecord(session, targetUid)) {
      res.status(403).json({
        error: "T\u1EEB ch\u1ED1i truy c\u1EADp (403): Kh\xF4ng c\xF3 quy\u1EC1n \u0111\u1ECDc b\u1EA3n nh\xE1p ngo\xE0i ph\u1EA1m vi ph\xE2n quy\u1EC1n."
      });
      return;
    }
    const store = loadKeyValueStore(DRAFTS_FILE);
    const key = `${targetUid}__${taskId}`;
    res.json({ draft: store[key] || null });
  });
  app.put("/api/drafts/:uid/:taskId", requireAuth, (req, res) => {
    const session = req.authSession;
    const targetUid = String(req.params.uid || "").trim();
    const taskId = String(req.params.taskId || "").trim();
    if (!canAccessStudentRecord(session, targetUid)) {
      res.status(403).json({
        error: "T\u1EEB ch\u1ED1i truy c\u1EADp (403): Kh\xF4ng c\xF3 quy\u1EC1n l\u01B0u b\u1EA3n nh\xE1p ngo\xE0i ph\u1EA1m vi ph\xE2n quy\u1EC1n."
      });
      return;
    }
    const incomingDraft = req.body?.draft;
    if (!incomingDraft || incomingDraft.studentUid !== targetUid || incomingDraft.taskId !== taskId) {
      res.status(400).json({ error: "D\u1EEF li\u1EC7u b\u1EA3n nh\xE1p kh\xF4ng kh\u1EDBp UID ho\u1EB7c m\xE3 nhi\u1EC7m v\u1EE5." });
      return;
    }
    const store = loadKeyValueStore(DRAFTS_FILE);
    const key = `${targetUid}__${taskId}`;
    const existing = store[key];
    const existingSnapshots = Array.isArray(existing?.submittedSnapshots) ? existing.submittedSnapshots : [];
    const incomingSnapshots = Array.isArray(incomingDraft.submittedSnapshots) ? incomingDraft.submittedSnapshots : [];
    const mergedSnapshotsMap = /* @__PURE__ */ new Map();
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
      serverSavedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    saveKeyValueStore(DRAFTS_FILE, store);
    res.json({
      success: true,
      serverSavedAt: store[key].serverSavedAt
    });
  });
  app.get("/api/exam-sessions/:uid/:examId", requireAuth, (req, res) => {
    const session = req.authSession;
    const targetUid = String(req.params.uid || "").trim();
    const examId = String(req.params.examId || "").trim();
    if (!canAccessStudentRecord(session, targetUid)) {
      res.status(403).json({
        error: "T\u1EEB ch\u1ED1i truy c\u1EADp (403): Kh\xF4ng c\xF3 quy\u1EC1n \u0111\u1ECDc phi\xEAn thi th\u1EED ngo\xE0i ph\u1EA1m vi ph\xE2n quy\u1EC1n."
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
  app.put("/api/exam-sessions/:uid/:examId", requireAuth, (req, res) => {
    const session = req.authSession;
    const targetUid = String(req.params.uid || "").trim();
    const examId = String(req.params.examId || "").trim();
    if (!canAccessStudentRecord(session, targetUid)) {
      res.status(403).json({
        error: "T\u1EEB ch\u1ED1i truy c\u1EADp (403): Kh\xF4ng c\xF3 quy\u1EC1n l\u01B0u phi\xEAn thi th\u1EED ngo\xE0i ph\u1EA1m vi ph\xE2n quy\u1EC1n."
      });
      return;
    }
    const incomingSession = req.body?.session;
    if (!incomingSession || incomingSession.studentUid !== targetUid || incomingSession.examId !== examId) {
      res.status(400).json({ error: "D\u1EEF li\u1EC7u phi\xEAn thi kh\xF4ng kh\u1EDBp UID ho\u1EB7c m\xE3 \u0111\u1EC1 thi." });
      return;
    }
    const store = loadKeyValueStore(EXAM_SESSIONS_FILE);
    const key = `${targetUid}__${examId}`;
    store[key] = {
      ...incomingSession,
      serverSavedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    saveKeyValueStore(EXAM_SESSIONS_FILE, store);
    res.json({
      success: true,
      serverSavedAt: store[key].serverSavedAt,
      serverNowEpochMs: Date.now()
    });
  });
  async function generateStructuredGeminiContent(params) {
    const ai = getGeminiClient();
    const timeoutMs = params.timeoutMs || 25e3;
    const candidateModels = ["gemini-3.8-flash", "gemini-flash-latest", "gemini-2.5-flash"];
    let lastError = null;
    for (const modelName of candidateModels) {
      try {
        const timeoutPromise = new Promise(
          (_, reject) => setTimeout(() => reject(new Error("AI_TIMEOUT: Qu\xE1 th\u1EDDi gian ch\u1EDD ph\u1EA3n h\u1ED3i t\u1EEB m\xF4 h\xECnh Gemini.")), timeoutMs)
        );
        const response = await Promise.race([
          ai.models.generateContent({
            model: modelName,
            contents: params.contents,
            config: {
              responseMimeType: "application/json",
              responseSchema: params.responseSchema
            }
          }),
          timeoutPromise
        ]);
        const rawText = (response?.text || "").trim();
        if (!rawText) {
          throw new Error("INVALID_AI_JSON: M\xF4 h\xECnh Gemini tr\u1EA3 v\u1EC1 ph\u1EA3n h\u1ED3i r\u1ED7ng.");
        }
        const cleanedJson = rawText.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
        return JSON.parse(cleanedJson);
      } catch (err) {
        lastError = err;
        const msg = String(err?.message || "");
        if (msg.includes("404") || msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("model")) {
          continue;
        }
        break;
      }
    }
    throw lastError || new Error("L\u1ED7i kh\xF4ng x\xE1c \u0111\u1ECBnh khi g\u1ECDi m\xF4 h\xECnh Gemini.");
  }
  function filterVerbatimQuotes(quotes, studentText) {
    if (!Array.isArray(quotes) || !studentText) return [];
    const normalizedStudent = studentText.toLowerCase().replace(/\s+/g, " ").trim();
    return quotes.map((q) => String(q || "").trim()).filter((q) => {
      if (!q || q.length < 3) return false;
      const normalizedQuote = q.toLowerCase().replace(/\s+/g, " ").replace(/^["“']+|["”']+$/g, "").trim();
      return normalizedQuote.length >= 3 && normalizedStudent.includes(normalizedQuote);
    });
  }
  function verifySingleQuote(quote, studentText) {
    const valid = filterVerbatimQuotes([quote], studentText);
    return valid[0] || "";
  }
  const SUBMISSIONS_FILE = path.join(DATA_DIR, "exam_submissions_v2.json");
  function loadServerSubmissions() {
    try {
      if (fs.existsSync(SUBMISSIONS_FILE)) {
        const raw = fs.readFileSync(SUBMISSIONS_FILE, "utf-8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (err) {
      console.warn("Error reading server submissions:", err);
    }
    return [];
  }
  function saveServerSubmissions(subs) {
    try {
      fs.writeFileSync(SUBMISSIONS_FILE, JSON.stringify(subs, null, 2), "utf-8");
    } catch (err) {
      console.error("Error saving server submissions:", err);
    }
  }
  app.get("/api/submissions", requireAuth, (req, res) => {
    const session = req.authSession;
    const allSubs = loadServerSubmissions();
    if (session.role === "teacher") {
      res.json({ submissions: allSubs });
      return;
    }
    res.json({
      submissions: allSubs.filter((s) => s.studentId === session.uid)
    });
  });
  app.post("/api/submissions", requireAuth, (req, res) => {
    const session = req.authSession;
    const incoming = req.body?.submission;
    if (!incoming || !incoming.id) {
      res.status(400).json({ error: "D\u1EEF li\u1EC7u b\xE0i n\u1ED9p kh\xF4ng h\u1EE3p l\u1EC7." });
      return;
    }
    const targetStudentId = session.role === "student" ? session.uid : incoming.studentId;
    const targetVersion = Number(incoming.submissionVersion) || 1;
    const allSubs = loadServerSubmissions();
    const existingIdx = allSubs.findIndex(
      (s) => s.id === incoming.id || s.studentId === targetStudentId && s.examId === incoming.examId && (Number(s.submissionVersion) || 1) === targetVersion
    );
    if (existingIdx !== -1) {
      const existing = allSubs[existingIdx];
      if (existing.status === "teacher_approved" || existing.teacherConfirmedScore) {
        allSubs[existingIdx] = {
          ...incoming,
          id: existing.id,
          studentId: existing.studentId || session.uid,
          status: "teacher_approved",
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
  app.post("/api/teacher/approve-submission", requireTeacherAuth, (req, res) => {
    const session = req.authSession;
    const accounts = loadServerAccounts();
    const teacherAcc = accounts.find((a) => a.id === session.uid);
    const { submissionId, readingScore, paragraphScore, essayScore, teacherNotes } = req.body || {};
    if (!submissionId) {
      res.status(400).json({ error: "Thi\u1EBFu m\xE3 b\xE0i n\u1ED9p c\u1EA7n duy\u1EC7t." });
      return;
    }
    const rScore = Number(Math.max(0, Math.min(4, Number(readingScore) || 0)).toFixed(2));
    const pScore = Number(Math.max(0, Math.min(2, Number(paragraphScore) || 0)).toFixed(2));
    const eScore = Number(Math.max(0, Math.min(4, Number(essayScore) || 0)).toFixed(2));
    const totalScore = Number(Math.min(10, rScore + pScore + eScore).toFixed(2));
    const confirmedScorePayload = {
      readingScore: rScore,
      paragraphScore: pScore,
      essayScore: eScore,
      totalScore,
      teacherNotes: String(teacherNotes || "").trim(),
      confirmedByTeacherId: session.uid,
      confirmedByTeacherName: teacherAcc ? `${teacherAcc.fullName} (${teacherAcc.username})` : session.username,
      confirmedAt: (/* @__PURE__ */ new Date()).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) + " " + (/* @__PURE__ */ new Date()).toLocaleDateString("vi-VN"),
      isLockedAgainstAiOverwrite: true
    };
    const allSubs = loadServerSubmissions();
    const idx = allSubs.findIndex((s) => s.id === submissionId);
    if (idx !== -1) {
      allSubs[idx] = {
        ...allSubs[idx],
        status: "teacher_approved",
        teacherConfirmedScore: confirmedScorePayload
      };
      saveServerSubmissions(allSubs);
    }
    res.json({
      success: true,
      teacherConfirmedScore: confirmedScorePayload
    });
  });
  app.post("/api/ai/parse-exam", async (req, res) => {
    try {
      if (!process.env.GEMINI_API_KEY) {
        res.status(503).json({
          success: false,
          errorCode: "GEMINI_NOT_CONFIGURED",
          error: "M\xE1y ch\u1EE7 ch\u01B0a \u0111\u01B0\u1EE3c c\u1EA5u h\xECnh bi\u1EBFn m\xF4i tr\u01B0\u1EDDng b\xED m\u1EADt GEMINI_API_KEY."
        });
        return;
      }
      const { rawExamText, rawGuideText, fileData } = req.body || {};
      const parts = [];
      if (fileData && fileData.base64Data && fileData.mimeType) {
        parts.push({
          inlineData: {
            mimeType: fileData.mimeType,
            data: fileData.base64Data
          }
        });
      }
      const instructionPrompt = `B\u1EA1n l\xE0 chuy\xEAn gia kh\u1EA3o th\xED Ng\u1EEF v\u0103n THPT l\u1EDBp 12. Nhi\u1EC7m v\u1EE5 c\u1EE7a b\u1EA1n l\xE0 \u0111\u1ECDc \u0111\u1EC1 thi Ng\u1EEF v\u0103n v\xE0 h\u01B0\u1EDBng d\u1EABn ch\u1EA5m (n\u1EBFu c\xF3) \u0111\u1EC3 b\xF3c t\xE1ch c\u1EA5u tr\xFAc ch\xEDnh x\xE1c 100%, tuy\u1EC7t \u0111\u1ED1i b\u1EA3o to\xE0n nguy\xEAn v\u0103n ng\u1EEF li\u1EC7u g\u1ED1c v\xE0 c\xE2u h\u1ECFi g\u1ED1c.

Quy t\u1EAFc b\u1EAFt bu\u1ED9c:
1. KH\xD4NG t\u1EF1 \xFD t\xF3m t\u1EAFt hay vi\u1EBFt l\u1EA1i ng\u1EEF li\u1EC7u \u0111\u1ECDc hi\u1EC3u; tr\u01B0\u1EDDng "passageContent" ph\u1EA3i gi\u1EEF nguy\xEAn v\u0103n b\u1EA3n ng\u1EEF li\u1EC7u trong \u0111\u1EC1.
2. Nh\u1EADn di\u1EC7n ch\xEDnh x\xE1c c\xE1c c\xE2u h\u1ECFi \u0110\u1ECDc hi\u1EC3u (th\u01B0\u1EDDng t\u1EEB C\xE2u 1 \u0111\u1EBFn C\xE2u 4 ho\u1EB7c C\xE2u 5). N\u1EBFu c\xE2u h\u1ECFi trong \u0111\u1EC1 c\xF3 ghi r\xF5 \u0111i\u1EC3m (v\xED d\u1EE5 "(0,75 \u0111i\u1EC3m)", "(1,0 \u0111i\u1EC3m)"), \u0111\u1EB7t "isScoreExplicit" = true v\xE0 l\u1EA5y \u0111\xFAng \u0111i\u1EC3m \u0111\xF3. N\u1EBFu \u0111\u1EC1 KH\xD4NG ghi \u0111i\u1EC3m cho c\xE2u h\u1ECFi, \u0111\u1EB7t "isScoreExplicit" = false v\xE0 \u0111\u1EC1 xu\u1EA5t m\u1EE9c \u0111i\u1EC3m h\u1EE3p l\xFD \u0111\u1EC3 t\u1ED5ng \u0110\u1ECDc hi\u1EC3u = 4.0.
3. Nh\u1EADn di\u1EC7n Ph\u1EA7n Vi\u1EBFt:
   - \u0110o\u1EA1n v\u0103n kho\u1EA3ng 200 ch\u1EEF (th\u01B0\u1EDDng 2,0 \u0111i\u1EC3m): x\xE1c \u0111\u1ECBnh "nghi_luan_xa_hoi" hay "nghi_luan_van_hoc".
   - B\xE0i v\u0103n kho\u1EA3ng 600 ch\u1EEF (th\u01B0\u1EDDng 4,0 \u0111i\u1EC3m): x\xE1c \u0111\u1ECBnh "nghi_luan_xa_hoi" hay "nghi_luan_van_hoc".
4. Nh\u1EADn di\u1EC7n M\u1EABu \u0111\u1EC1:
   - "template_a": \u0110\u1ECDc hi\u1EC3u v\u0103n b\u1EA3n v\u0103n h\u1ECDc + \u0110o\u1EA1n v\u0103n NLVH (~200 ch\u1EEF) + B\xE0i v\u0103n NLXH (~600 ch\u1EEF).
   - "template_b": \u0110\u1ECDc hi\u1EC3u v\u0103n b\u1EA3n th\xF4ng tin/ngh\u1ECB lu\u1EADn + \u0110o\u1EA1n v\u0103n NLXH (~200 ch\u1EEF) + B\xE0i v\u0103n NLVH (~600 ch\u1EEF).
   - "custom": C\xE1c c\u1EA5u tr\xFAc kh\xE1c (kh\xF4ng \xE9p v\xE0o M\u1EABu A hay B n\u1EBFu kh\xE1c c\u1EA5u tr\xFAc).

${rawExamText ? `N\u1ED8I DUNG \u0110\u1EC0 THI:
${rawExamText}
` : ""}
${rawGuideText ? `H\u01AF\u1EDANG D\u1EAAN CH\u1EA4M / \u0110\xC1P \xC1N \u0110I K\xC8M:
${rawGuideText}
` : ""}`;
      parts.push({ text: instructionPrompt });
      const parsedJson = await generateStructuredGeminiContent({
        contents: { parts },
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "Ti\xEAu \u0111\u1EC1 \u0111\u1EC1 thi" },
            durationMinutes: { type: Type.NUMBER, description: "Th\u1EDDi gian l\xE0m b\xE0i (ph\xFAt), m\u1EB7c \u0111\u1ECBnh 120" },
            templateType: {
              type: Type.STRING,
              description: "template_a, template_b, ho\u1EB7c custom"
            },
            templateLabel: { type: Type.STRING, description: "M\xF4 t\u1EA3 m\u1EABu c\u1EA5u tr\xFAc \u0111\u1EC1" },
            passageTitle: { type: Type.STRING },
            passageAuthor: { type: Type.STRING },
            passageSource: { type: Type.STRING },
            passageGenre: {
              type: Type.STRING,
              description: "van_hoc, nghi_luan, thong_tin, ho\u1EB7c tuy_chinh"
            },
            genreName: { type: Type.STRING },
            passageContent: { type: Type.STRING, description: "Nguy\xEAn v\u0103n ng\u1EEF li\u1EC7u \u0111\u1ECDc hi\u1EC3u" },
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  order: { type: Type.INTEGER },
                  question: { type: Type.STRING },
                  level: {
                    type: Type.STRING,
                    description: "nhan_biet, thong_hieu, van_dung, ho\u1EB7c van_dung_cao"
                  },
                  levelName: { type: Type.STRING },
                  maxScore: { type: Type.NUMBER },
                  isScoreExplicit: { type: Type.BOOLEAN },
                  answerGuide: { type: Type.STRING }
                },
                required: ["order", "question", "level", "levelName", "maxScore", "isScoreExplicit"]
              }
            },
            paragraphTask: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING, description: "nghi_luan_xa_hoi ho\u1EB7c nghi_luan_van_hoc" },
                typeName: { type: Type.STRING },
                promptText: { type: Type.STRING },
                maxScore: { type: Type.NUMBER },
                answerGuideOrRubricNote: { type: Type.STRING }
              },
              required: ["type", "typeName", "promptText", "maxScore"]
            },
            essayTask: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING, description: "nghi_luan_xa_hoi ho\u1EB7c nghi_luan_van_hoc" },
                typeName: { type: Type.STRING },
                promptText: { type: Type.STRING },
                maxScore: { type: Type.NUMBER },
                answerGuideOrRubricNote: { type: Type.STRING }
              },
              required: ["type", "typeName", "promptText", "maxScore"]
            }
          },
          required: [
            "title",
            "durationMinutes",
            "templateType",
            "templateLabel",
            "passageGenre",
            "genreName",
            "passageContent",
            "questions",
            "paragraphTask",
            "essayTask"
          ]
        }
      });
      res.json({ success: true, data: parsedJson });
    } catch (error) {
      console.error("Gemini parse-exam error:", error);
      res.status(500).json({
        success: false,
        errorCode: String(error?.message || "").startsWith("AI_TIMEOUT") ? "AI_TIMEOUT" : "AI_ERROR",
        error: error.message || "L\u1ED7i khi g\u1ECDi AI ph\xE2n t\xEDch \u0111\u1EC1 thi."
      });
    }
  });
  app.post("/api/ai/evaluate-reading", async (req, res) => {
    try {
      if (!process.env.GEMINI_API_KEY) {
        res.status(503).json({
          success: false,
          errorCode: "GEMINI_NOT_CONFIGURED",
          error: "Ch\u01B0a c\u1EA5u h\xECnh kh\xF3a b\xED m\u1EADt GEMINI_API_KEY tr\xEAn m\xE1y ch\u1EE7. H\u1EC7 th\u1ED1ng kh\xF4ng t\u1EA1o \u0111i\u1EC3m AI gi\u1EA3."
        });
        return;
      }
      const {
        passageText,
        questionText,
        studentAnswer,
        submissionVersion = 1,
        level = "thong_hieu",
        levelName = "Th\xF4ng hi\u1EC3u",
        maxScore = 1,
        answerGuide = "",
        keyConcepts = []
      } = req.body || {};
      if (!passageText || !questionText || !studentAnswer) {
        res.status(400).json({
          success: false,
          errorCode: "INVALID_INPUT",
          error: "Thi\u1EBFu ng\u1EEF li\u1EC7u, c\xE2u h\u1ECFi ho\u1EB7c c\xE2u tr\u1EA3 l\u1EDDi c\u1EE7a h\u1ECDc sinh."
        });
        return;
      }
      const clampedMaxScore = Number(Math.max(0.25, Math.min(4, Number(maxScore) || 1)).toFixed(2));
      const prompt = `B\u1EA1n l\xE0 gi\xE1o vi\xEAn ch\u1EA5m thi Ng\u1EEF v\u0103n l\u1EDBp 12 THPT. H\xE3y \u0111\xE1nh gi\xE1 c\xE2u tr\u1EA3 l\u1EDDi \u0110\u1ECDc hi\u1EC3u c\u1EE7a h\u1ECDc sinh (Phi\xEAn b\u1EA3n b\xE0i l\xE0m: v${submissionVersion}).

NGUY\xCAN T\u1EAEC CH\u1EA4M B\u1EAET BU\u1ED8C:
1. CH\u1EA4P NH\u1EACN DI\u1EC4N \u0110\u1EA0T T\u01AF\u01A0NG \u0110\u01AF\u01A0NG V\u1EC0 \xDD: H\u1ECDc sinh c\xF3 th\u1EC3 d\xF9ng t\u1EEB \u0111\u1ED3ng ngh\u0129a, c\xE1ch di\u1EC5n \u0111\u1EA1t c\xE1 nh\xE2n ho\u1EB7c s\u1EAFp x\u1EBFp c\xE2u kh\xE1c \u0111\xE1p \xE1n m\u1EABu; mi\u1EC5n l\xE0 \u0111\xFAng b\u1EA3n ch\u1EA5t, tr\xFAng \xFD c\xE2u h\u1ECFi v\xE0 b\xE1m s\xE1t ng\u1EEF li\u1EC7u th\xEC v\u1EABn \u0111\u1EA1t \u0111i\u1EC3m t\u1ED1i \u0111a. Tuy\u1EC7t \u0111\u1ED1i KH\xD4NG ch\u1EA5m m\xE1y m\xF3c b\u1EB1ng c\xE1ch ch\u1EC9 d\xF2 t\u1EEB kh\xF3a c\u1EE9ng nh\u1EAFc.
2. KH\xD4NG B\u1ECAA D\u1EAAN CH\u1EE8NG & KH\xD4NG B\u1ECAA QUY T\u1EAEC CH\u1EA4M:
   - Tr\u01B0\u1EDDng "studentQuotes" ph\u1EA3i tr\xEDch nguy\xEAn v\u0103n c\u1EE5m t\u1EEB/c\xE2u v\u0103n th\u1EF1c s\u1EF1 c\xF3 trong b\xE0i l\xE0m c\u1EE7a h\u1ECDc sinh l\xE0m c\u0103n c\u1EE9 ch\u1EA5m. N\u1EBFu b\xE0i h\u1ECDc sinh kh\xF4ng c\xF3 c\xE2u ch\u1EEF ph\xF9 h\u1EE3p th\xEC tr\u1EA3 v\u1EC1 m\u1EA3ng r\u1ED7ng [].
   - Ch\u1EC9 ch\u1EA5m d\u1EF1a tr\xEAn ng\u1EEF li\u1EC7u, c\xE2u h\u1ECFi v\xE0 h\u01B0\u1EDBng d\u1EABn ch\u1EA5m \u0111\xE3 cung c\u1EA5p.
3. KH\xD4NG l\xE0m b\xE0i thay h\u1ECDc sinh: G\u1EE3i \xFD b\u1EB1ng ch\u1EE9ng trong v\u0103n b\u1EA3n (textEvidenceHints) v\xE0 c\xE2u h\u1ECFi \u0111\u1ECBnh h\u01B0\u1EDBng (guidingQuestions) \u0111\u1EC3 h\u1ECDc sinh t\u1EF1 ho\xE0n thi\u1EC7n.
4. \u0110i\u1EC3m \u0111\u1EC1 xu\u1EA5t ("aiSuggestedScore") ph\u1EA3i n\u1EB1m trong kho\u1EA3ng t\u1EEB 0 \u0111\u1EBFn t\u1ED1i \u0111a ${clampedMaxScore} \u0111i\u1EC3m.
5. N\u1EBFu c\xE2u h\u1ECFi thu\u1ED9c m\u1EE9c V\u1EADn d\u1EE5ng / V\u1EADn d\u1EE5ng cao (c\xE2u h\u1ECFi m\u1EDF) ho\u1EB7c c\xE2u tr\u1EA3 l\u1EDDi c\u1EE7a h\u1ECDc sinh c\xF3 g\xF3c nh\xECn s\xE1ng t\u1EA1o ri\xEAng ngo\xE0i \u0111\xE1p \xE1n m\u1EABu, b\u1EAFt bu\u1ED9c b\u1EADt "needsReview" = true \u0111\u1EC3 gi\xE1o vi\xEAn b\u1ED9 m\xF4n quy\u1EBFt \u0111\u1ECBnh.

NG\u1EEE LI\u1EC6U \u0110\u1ECCC HI\u1EC2U:
${passageText}

C\xC2U H\u1ECEI (${levelName} - \u0110i\u1EC3m t\u1ED1i \u0111a: ${clampedMaxScore} \u0111i\u1EC3m):
${questionText}

${answerGuide ? `H\u01AF\u1EDANG D\u1EAAN CH\u1EA4M / BAREM \u0110\xC1P \xC1N:
${answerGuide}
` : ""}
${Array.isArray(keyConcepts) && keyConcepts.length > 0 ? `KH\xC1I NI\u1EC6M / \xDD TR\u1ECCNG T\xC2M THAM KH\u1EA2O: ${keyConcepts.join(", ")}
` : ""}

B\xC0I L\xC0M C\u1EE6A H\u1ECCC SINH (Phi\xEAn b\u1EA3n v${submissionVersion}):
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
              description: "Tr\xEDch d\u1EABn nguy\xEAn v\u0103n t\u1EEB c\xE2u tr\u1EA3 l\u1EDDi c\u1EE7a h\u1ECDc sinh (kh\xF4ng t\u1EF1 b\u1ECBa)"
            },
            aiSuggestedScore: { type: Type.NUMBER },
            rationale: { type: Type.STRING, description: "L\xED do ch\u1EA5m chi ti\u1EBFt t\u1EEBng \xFD v\xE0 \u0111\u1ED1i chi\u1EBFu ng\u1EEF ngh\u0129a" },
            confidenceLevel: {
              type: Type.STRING,
              description: "high, medium, ho\u1EB7c low"
            },
            confidenceScore: {
              type: Type.NUMBER,
              description: "M\u1EE9c \u0111\u1ED9 ch\u1EAFc ch\u1EAFn t\u1EEB 0 \u0111\u1EBFn 100"
            },
            needsReview: { type: Type.BOOLEAN },
            reviewReason: { type: Type.STRING }
          },
          required: [
            "strengths",
            "missingPoints",
            "textEvidenceHints",
            "guidingQuestions",
            "studentQuotes",
            "aiSuggestedScore",
            "rationale",
            "confidenceLevel",
            "confidenceScore",
            "needsReview"
          ]
        }
      });
      const rawScore = Number(rawData.aiSuggestedScore);
      const safeScore = Number.isFinite(rawScore) ? Number(Math.max(0, Math.min(clampedMaxScore, rawScore)).toFixed(2)) : 0;
      const verifiedQuotes = filterVerbatimQuotes(rawData.studentQuotes, String(studentAnswer));
      const confLevel = rawData.confidenceLevel === "high" || rawData.confidenceLevel === "medium" || rawData.confidenceLevel === "low" ? rawData.confidenceLevel : level === "van_dung" || level === "van_dung_cao" ? "medium" : "high";
      const confScore = Number.isFinite(Number(rawData.confidenceScore)) ? Math.max(0, Math.min(100, Math.round(Number(rawData.confidenceScore)))) : confLevel === "high" ? 88 : 72;
      const isOpenQuestion = level === "van_dung" || level === "van_dung_cao";
      const needsReview = Boolean(rawData.needsReview) || isOpenQuestion || confLevel === "low";
      res.json({
        success: true,
        feedback: {
          evaluationSource: "gemini_ai",
          evaluationSourceLabel: "Ch\u1EA5m s\u01A1 b\u1ED9 b\u1EB1ng Gemini AI (Ch\u1EDD gi\xE1o vi\xEAn duy\u1EC7t)",
          submissionVersion: Number(submissionVersion) || 1,
          strengths: Array.isArray(rawData.strengths) ? rawData.strengths : [],
          missingPoints: Array.isArray(rawData.missingPoints) ? rawData.missingPoints : [],
          textEvidenceHints: Array.isArray(rawData.textEvidenceHints) ? rawData.textEvidenceHints : [],
          guidingQuestions: Array.isArray(rawData.guidingQuestions) ? rawData.guidingQuestions : [],
          studentQuotes: verifiedQuotes,
          aiSuggestedScore: safeScore,
          maxScore: clampedMaxScore,
          rationale: String(rawData.rationale || "").trim(),
          confidenceLevel: confLevel,
          confidenceScore: confScore,
          needsReview,
          reviewReason: rawData.reviewReason || (isOpenQuestion ? "C\xE2u h\u1ECFi m\u1EDF y\xEAu c\u1EA7u v\u1EADn d\u1EE5ng/li\xEAn h\u1EC7 c\xE1 nh\xE2n; c\u1EA7n gi\xE1o vi\xEAn b\u1ED9 m\xF4n th\u1EA9m \u0111\u1ECBnh v\xE0 duy\u1EC7t \u0111i\u1EC3m ch\xEDnh th\u1EE9c." : void 0)
        }
      });
    } catch (error) {
      console.error("Gemini evaluate-reading error:", error);
      const msg = String(error?.message || "");
      res.status(500).json({
        success: false,
        errorCode: msg.startsWith("AI_TIMEOUT") ? "AI_TIMEOUT" : msg.startsWith("INVALID_AI_JSON") ? "INVALID_AI_JSON" : "AI_ERROR",
        error: error.message || "L\u1ED7i khi g\u1ECDi AI ph\xE2n t\xEDch c\xE2u tr\u1EA3 l\u1EDDi \u0111\u1ECDc hi\u1EC3u."
      });
    }
  });
  app.post("/api/ai/evaluate-writing", async (req, res) => {
    try {
      if (!process.env.GEMINI_API_KEY) {
        res.status(503).json({
          success: false,
          errorCode: "GEMINI_NOT_CONFIGURED",
          error: "Ch\u01B0a c\u1EA5u h\xECnh kh\xF3a b\xED m\u1EADt GEMINI_API_KEY tr\xEAn m\xE1y ch\u1EE7. H\u1EC7 th\u1ED1ng kh\xF4ng t\u1EA1o \u0111i\u1EC3m AI gi\u1EA3."
        });
        return;
      }
      const {
        promptText,
        studentEssay,
        submissionVersion = 1,
        essayType = "nghi_luan_xa_hoi",
        maxScore = 4,
        targetWordCount = 600,
        rubric = [],
        answerGuideOrRubricNote = ""
      } = req.body || {};
      if (!promptText || !studentEssay) {
        res.status(400).json({
          success: false,
          errorCode: "INVALID_INPUT",
          error: "Thi\u1EBFu \u0111\u1EC1 b\xE0i ho\u1EB7c b\xE0i l\xE0m c\u1EE7a h\u1ECDc sinh."
        });
        return;
      }
      const isParagraph = Number(maxScore) <= 2.5 || Number(targetWordCount) <= 250;
      const sectionMaxScore = isParagraph ? 2 : 4;
      const defaultCriteriaSpec = isParagraph ? [
        { id: "crit-1", name: "1. \u0110\u1EA3m b\u1EA3o th\u1EC3 th\u1EE9c 1 \u0111o\u1EA1n v\u0103n (~200 ch\u1EEF)", maxCriterionScore: 0.25, weightLabel: "0,25 \u0111i\u1EC3m" },
        { id: "crit-2", name: "2. X\xE1c \u0111\u1ECBnh \u0111\xFAng v\u1EA5n \u0111\u1EC1 ngh\u1ECB lu\u1EADn", maxCriterionScore: 0.25, weightLabel: "0,25 \u0111i\u1EC3m" },
        { id: "crit-3", name: "3. Tri\u1EC3n khai lu\u1EADn \u0111i\u1EC3m, l\xED l\u1EBD v\xE0 d\u1EABn ch\u1EE9ng", maxCriterionScore: 1, weightLabel: "1,0 \u0111i\u1EC3m" },
        { id: "crit-4", name: "4. Di\u1EC5n \u0111\u1EA1t, ch\xEDnh t\u1EA3 v\xE0 s\xE1ng t\u1EA1o", maxCriterionScore: 0.5, weightLabel: "0,5 \u0111i\u1EC3m" }
      ] : [
        { id: "crit-1", name: "1. \u0110\u1EA3m b\u1EA3o c\u1EA5u tr\xFAc b\xE0i ngh\u1ECB lu\u1EADn (M\u1EDF - Th\xE2n - K\u1EBFt)", maxCriterionScore: 0.5, weightLabel: "0,5 \u0111i\u1EC3m" },
        { id: "crit-2", name: "2. X\xE1c \u0111\u1ECBnh \u0111\xFAng tr\u1ECDng t\xE2m v\u1EA5n \u0111\u1EC1 ngh\u1ECB lu\u1EADn", maxCriterionScore: 0.5, weightLabel: "0,5 \u0111i\u1EC3m" },
        { id: "crit-3", name: "3. H\u1EC7 th\u1ED1ng lu\u1EADn \u0111i\u1EC3m, l\xED l\u1EBD v\xE0 d\u1EABn ch\u1EE9ng thuy\u1EBFt ph\u1EE5c", maxCriterionScore: 2, weightLabel: "2,0 \u0111i\u1EC3m" },
        { id: "crit-4", name: "4. Di\u1EC5n \u0111\u1EA1t, li\xEAn k\u1EBFt v\u0103n b\u1EA3n v\xE0 s\xE1ng t\u1EA1o c\xE1 nh\xE2n", maxCriterionScore: 1, weightLabel: "1,0 \u0111i\u1EC3m" }
      ];
      const rubricDescription = Array.isArray(rubric) && rubric.length > 0 ? rubric.map(
        (r, idx) => `- Ti\xEAu ch\xED ${idx + 1} (${r.name || defaultCriteriaSpec[idx]?.name}): T\u1ED1i \u0111a ${r.maxCriterionScore || defaultCriteriaSpec[idx]?.maxCriterionScore || 0.5}\u0111 (${r.weightLabel || ""}). Y\xEAu c\u1EA7u: ${r.strengths || r.remedyStep || ""}`
      ).join("\n   ") : defaultCriteriaSpec.map((c) => `- ${c.name}: T\u1ED1i \u0111a ${c.maxCriterionScore} \u0111i\u1EC3m (${c.weightLabel})`).join("\n   ");
      const prompt = `B\u1EA1n l\xE0 gi\xE1o vi\xEAn ch\u1EA5m thi Ng\u1EEF v\u0103n l\u1EDBp 12 THPT. H\xE3y ch\u1EA5m v\xE0 nh\u1EADn x\xE9t b\xE0i vi\u1EBFt ngh\u1ECB lu\u1EADn c\u1EE7a h\u1ECDc sinh (Phi\xEAn b\u1EA3n b\xE0i l\xE0m: v${submissionVersion}).
D\u1EA1ng b\xE0i: ${isParagraph ? "\u0110o\u1EA1n v\u0103n kho\u1EA3ng 200 ch\u1EEF (Thang \u0111i\u1EC3m t\u1ED1i \u0111a: 2,0 \u0111i\u1EC3m)" : "B\xE0i v\u0103n kho\u1EA3ng 600 ch\u1EEF (Thang \u0111i\u1EC3m t\u1ED1i \u0111a: 4,0 \u0111i\u1EC3m)"}.
Ph\xE2n lo\u1EA1i: ${essayType === "nghi_luan_van_hoc" ? "Ngh\u1ECB lu\u1EADn v\u0103n h\u1ECDc" : "Ngh\u1ECB lu\u1EADn x\xE3 h\u1ED9i"}.

NGUY\xCAN T\u1EAEC CH\u1EA4M B\u1EAET BU\u1ED8C:
1. CH\u1EA4P NH\u1EACN C\xC1CH DI\u1EC4N \u0110\u1EA0T T\u01AF\u01A0NG \u0110\u01AF\u01A0NG V\u1EC0 \xDD: \u0110\xE1nh gi\xE1 th\u1EF1c ch\u1EA5t chi\u1EC1u s\xE2u l\u1EADp lu\u1EADn, m\u1EA1ch l\xED l\u1EBD v\xE0 s\u1EF1 ph\xF9 h\u1EE3p c\u1EE7a d\u1EABn ch\u1EE9ng. Kh\xF4ng ch\u1EA5m m\xE1y m\xF3c theo t\u1EEB kh\xF3a n\u1ED1i hay c\xF4ng th\u1EE9c v\u0103n m\u1EABu; tr\xE2n tr\u1ECDng g\xF3c nh\xECn c\xE1 nh\xE2n h\u1EE3p l\xFD c\u1EE7a h\u1ECDc sinh.
2. KH\xD4NG B\u1ECAA D\u1EAAN CH\u1EE8NG & KH\xD4NG B\u1ECAA QUY T\u1EAEC CH\u1EA4M:
   - \u1EDE m\u1ED7i ti\xEAu ch\xED, tr\u01B0\u1EDDng "studentQuote" PH\u1EA2I tr\xEDch nguy\xEAn v\u0103n 1 c\xE2u ho\u1EB7c c\u1EE5m t\u1EEB th\u1EF1c t\u1EBF trong b\xE0i l\xE0m c\u1EE7a h\u1ECDc sinh l\xE0m b\u1EB1ng ch\u1EE9ng nh\u1EADn x\xE9t. N\u1EBFu kh\xF4ng c\xF3 c\xE2u ph\xF9 h\u1EE3p trong b\xE0i h\u1ECDc sinh th\xEC \u0111\u1EC3 chu\u1ED7i r\u1ED7ng "". Tuy\u1EC7t \u0111\u1ED1i kh\xF4ng t\u1EF1 s\xE1ng t\xE1c c\xE2u ch\u1EEF g\xE1n cho h\u1ECDc sinh.
   - Kh\xF4ng b\u1ECBa th\xEAm quy t\u1EAFc ch\u1EA5m ngo\xE0i \u0111\u1EC1 b\xE0i v\xE0 h\u1EC7 th\u1ED1ng ti\xEAu ch\xED Rubric b\xEAn d\u01B0\u1EDBi.
3. KI\u1EC2M SO\xC1T \u0110I\u1EC2M S\u1ED0 CH\u1EB6T CH\u1EBC:
   - \u0110i\u1EC3m t\u1EEBng ti\xEAu ch\xED ("scoreAwarded") tuy\u1EC7t \u0111\u1ED1i KH\xD4NG v\u01B0\u1EE3t qu\xE1 "maxCriterionScore" c\u1EE7a ti\xEAu ch\xED \u0111\xF3.
   - T\u1ED5ng \u0111i\u1EC3m \u0111\u1EC1 xu\u1EA5t ("aiSuggestedScore") b\u1EB1ng t\u1ED5ng \u0111i\u1EC3m c\xE1c ti\xEAu ch\xED v\xE0 KH\xD4NG v\u01B0\u1EE3t qu\xE1 ${sectionMaxScore} \u0111i\u1EC3m.
4. C\u1EDC C\u1EA6N GI\xC1O VI\xCAN XEM L\u1EA0I ("needsReview"):
   - \u0110\u1EB7t "needsReview" = true n\u1EBFu b\xE0i vi\u1EBFt c\xF3 lu\u1EADn \u0111i\u1EC3m/d\u1EABn ch\u1EE9ng s\xE1ng t\u1EA1o ngo\xE0i khu\xF4n m\u1EABu, c\xF3 nghi v\u1EA5n l\u1EA1c \u0111\u1EC1, ho\u1EB7c l\xE0 b\xE0i v\u0103n ngh\u1ECB lu\u1EADn d\xE0i c\u1EA7n gi\xE1o vi\xEAn th\u1EA9m \u0111\u1ECBnh c\u1EA3m x\xFAc v\xE0 ch\u1EA5t v\u0103n.

RUBRIC CH\u1EA4M B\xC0I (T\u1ED5ng ${sectionMaxScore} \u0111i\u1EC3m):
   ${rubricDescription}
${answerGuideOrRubricNote ? `
H\u01AF\u1EDANG D\u1EAAN CH\u1EA4M B\u1ED4 SUNG C\u1EE6A \u0110\u1EC0:
${answerGuideOrRubricNote}
` : ""}

\u0110\u1EC0 B\xC0I:
${promptText}

B\xC0I L\xC0M C\u1EE6A H\u1ECCC SINH (Phi\xEAn b\u1EA3n v${submissionVersion}):
${studentEssay}`;
      const rawData = await generateStructuredGeminiContent({
        contents: prompt,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            overallImpression: { type: Type.STRING },
            aiSuggestedScore: { type: Type.NUMBER },
            confidenceLevel: { type: Type.STRING, description: "high, medium, ho\u1EB7c low" },
            confidenceScore: { type: Type.NUMBER, description: "0 - 100" },
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
                    description: "T\u1ED1t & S\xE2u s\u1EAFc, Kh\xE1, \u0110\u1EA1t c\u01A1 b\u1EA3n, ho\u1EB7c C\u1EA7n b\u1ED5 sung"
                  },
                  scoreStatus: {
                    type: Type.STRING,
                    description: "success, info, ho\u1EB7c warning"
                  },
                  strengths: { type: Type.STRING },
                  weaknesses: { type: Type.STRING },
                  remedyStep: { type: Type.STRING },
                  rationale: { type: Type.STRING, description: "L\xED do ch\u1EA5m \u0111i\u1EC3m ti\xEAu ch\xED n\xE0y" },
                  studentQuote: {
                    type: Type.STRING,
                    description: "Tr\xEDch d\u1EABn nguy\xEAn v\u0103n t\u1EEB b\xE0i l\xE0m c\u1EE7a h\u1ECDc sinh (ho\u1EB7c chu\u1ED7i r\u1ED7ng n\u1EBFu kh\xF4ng c\xF3)"
                  },
                  confidenceLevel: { type: Type.STRING, description: "high, medium, ho\u1EB7c low" },
                  needsReview: { type: Type.BOOLEAN },
                  scoreAwarded: { type: Type.NUMBER },
                  maxCriterionScore: { type: Type.NUMBER }
                },
                required: [
                  "id",
                  "name",
                  "weightLabel",
                  "scoreLevel",
                  "scoreStatus",
                  "strengths",
                  "weaknesses",
                  "remedyStep",
                  "rationale",
                  "studentQuote",
                  "confidenceLevel",
                  "needsReview",
                  "scoreAwarded",
                  "maxCriterionScore"
                ]
              }
            }
          },
          required: [
            "overallImpression",
            "aiSuggestedScore",
            "confidenceLevel",
            "confidenceScore",
            "needsReview",
            "actionSteps",
            "criteria"
          ]
        }
      });
      const rawCriteria = Array.isArray(rawData.criteria) ? rawData.criteria : [];
      const sanitizedCriteria = defaultCriteriaSpec.map((spec, idx) => {
        const rawCrit = rawCriteria[idx] || {};
        const maxCrit = spec.maxCriterionScore;
        const rawAwarded = Number(rawCrit.scoreAwarded);
        const clampedAwarded = Number.isFinite(rawAwarded) ? Number(Math.max(0, Math.min(maxCrit, rawAwarded)).toFixed(2)) : Number((maxCrit * 0.5).toFixed(2));
        const validLevels = ["C\u1EA7n b\u1ED5 sung", "\u0110\u1EA1t c\u01A1 b\u1EA3n", "Kh\xE1", "T\u1ED1t & S\xE2u s\u1EAFc"];
        const scoreLevel = validLevels.includes(rawCrit.scoreLevel) ? rawCrit.scoreLevel : clampedAwarded >= maxCrit * 0.85 ? "T\u1ED1t & S\xE2u s\u1EAFc" : clampedAwarded >= maxCrit * 0.65 ? "Kh\xE1" : clampedAwarded >= maxCrit * 0.45 ? "\u0110\u1EA1t c\u01A1 b\u1EA3n" : "C\u1EA7n b\u1ED5 sung";
        const scoreStatus = rawCrit.scoreStatus === "success" || rawCrit.scoreStatus === "info" || rawCrit.scoreStatus === "warning" ? rawCrit.scoreStatus : scoreLevel === "T\u1ED1t & S\xE2u s\u1EAFc" || scoreLevel === "Kh\xE1" ? "success" : scoreLevel === "\u0110\u1EA1t c\u01A1 b\u1EA3n" ? "info" : "warning";
        return {
          id: spec.id,
          name: rawCrit.name || spec.name,
          weightLabel: spec.weightLabel,
          scoreLevel,
          scoreStatus,
          strengths: String(rawCrit.strengths || "").trim() || "\u0110\xE3 tri\u1EC3n khai n\u1ED9i dung theo ti\xEAu ch\xED.",
          weaknesses: String(rawCrit.weaknesses || "").trim() || "C\u1EA7n trau chu\u1ED1t th\xEAm \u0111\u1EC3 \u0111\u1EA1t \u0111i\u1EC3m t\u1ED1i \u0111a.",
          remedyStep: String(rawCrit.remedyStep || "").trim() || "R\xE0 so\xE1t l\u1EA1i l\u1EADp lu\u1EADn v\xE0 c\xE1ch di\u1EC5n \u0111\u1EA1t.",
          rationale: String(rawCrit.rationale || "").trim() || `\u0110\u1EA1t ${clampedAwarded}/${maxCrit} \u0111i\u1EC3m d\u1EF1a tr\xEAn \u0111\u1ED1i chi\u1EBFu b\xE0i vi\u1EBFt th\u1EF1c t\u1EBF v\u1EDBi ti\xEAu ch\xED.`,
          studentQuote: verifySingleQuote(rawCrit.studentQuote, String(studentEssay)),
          confidenceLevel: rawCrit.confidenceLevel === "high" || rawCrit.confidenceLevel === "medium" || rawCrit.confidenceLevel === "low" ? rawCrit.confidenceLevel : "high",
          needsReview: Boolean(rawCrit.needsReview),
          scoreAwarded: clampedAwarded,
          maxCriterionScore: maxCrit
        };
      });
      const criteriaSum = sanitizedCriteria.reduce((sum, c) => sum + (c.scoreAwarded || 0), 0);
      const clampedTotalScore = Number(Math.max(0, Math.min(sectionMaxScore, criteriaSum)).toFixed(2));
      const confLevel = rawData.confidenceLevel === "high" || rawData.confidenceLevel === "medium" || rawData.confidenceLevel === "low" ? rawData.confidenceLevel : "medium";
      const confScore = Number.isFinite(Number(rawData.confidenceScore)) ? Math.max(0, Math.min(100, Math.round(Number(rawData.confidenceScore)))) : 82;
      const anyCritNeedsReview = sanitizedCriteria.some((c) => c.needsReview);
      const needsReview = Boolean(rawData.needsReview) || anyCritNeedsReview || !isParagraph;
      res.json({
        success: true,
        feedback: {
          evaluationSource: "gemini_ai",
          evaluationSourceLabel: "Ch\u1EA5m s\u01A1 b\u1ED9 b\u1EB1ng Gemini AI (Ch\u1EDD gi\xE1o vi\xEAn duy\u1EC7t)",
          submissionVersion: Number(submissionVersion) || 1,
          overallImpression: String(rawData.overallImpression || "").trim(),
          aiSuggestedScore: clampedTotalScore,
          confidenceLevel: confLevel,
          confidenceScore: confScore,
          needsReview,
          reviewReason: rawData.reviewReason || (!isParagraph ? "B\xE0i v\u0103n ngh\u1ECB lu\u1EADn 4,0 \u0111i\u1EC3m c\u1EA7n gi\xE1o vi\xEAn b\u1ED9 m\xF4n th\u1EA9m \u0111\u1ECBnh ch\u1EA5t v\u0103n, c\u1EA3m x\xFAc v\xE0 duy\u1EC7t \u0111i\u1EC3m ch\xEDnh th\u1EE9c." : anyCritNeedsReview ? "C\xF3 ti\xEAu ch\xED l\u1EADp lu\u1EADn ho\u1EB7c d\u1EABn ch\u1EE9ng m\u1EDF c\u1EA7n gi\xE1o vi\xEAn ki\u1EC3m tra l\u1EA1i." : void 0),
          cautionNote: String(rawData.cautionNote || "").trim() || "\u0110i\u1EC3m s\u1ED1 tr\xEAn l\xE0 \u0111\u1EC1 xu\u1EA5t s\u01A1 b\u1ED9 c\u1EE7a Gemini AI theo Rubric. \u0110i\u1EC3m ch\xEDnh th\u1EE9c do Gi\xE1o vi\xEAn b\u1ED9 m\xF4n x\xE9t duy\u1EC7t.",
          actionSteps: Array.isArray(rawData.actionSteps) ? rawData.actionSteps : [],
          criteria: sanitizedCriteria
        }
      });
    } catch (error) {
      console.error("Gemini evaluate-writing error:", error);
      const msg = String(error?.message || "");
      res.status(500).json({
        success: false,
        errorCode: msg.startsWith("AI_TIMEOUT") ? "AI_TIMEOUT" : msg.startsWith("INVALID_AI_JSON") ? "INVALID_AI_JSON" : "AI_ERROR",
        error: error.message || "L\u1ED7i khi g\u1ECDi AI ch\u1EA5m b\xE0i vi\u1EBFt ngh\u1ECB lu\u1EADn."
      });
    }
  });
  app.use("/api", (req, res) => {
    res.status(404).json({
      success: false,
      errorCategory: "ENDPOINT_ERROR",
      error: `Kh\xF4ng t\xECm th\u1EA5y \u0111\u01B0\u1EDDng d\u1EABn API y\xEAu c\u1EA7u: ${req.method} ${req.originalUrl} (404).`
    });
  });
  app.use((err, _req, res, _next) => {
    console.error("[API Error]:", err);
    if (!res.headersSent) {
      res.status(err?.status || 500).json({
        success: false,
        errorCategory: "ENDPOINT_ERROR",
        error: err?.message || "L\u1ED7i x\u1EED l\xFD n\u1ED9i b\u1ED9 tr\xEAn m\xE1y ch\u1EE7 API."
      });
    }
  });
  return app;
}
export {
  createApiApp,
  ensureFirebaseAdminInitialized,
  executeServerAdminBootstrap,
  getConfiguredFirstAdminUid,
  getFirebaseAdminStatus,
  normalizePhoneE164,
  syncTeacherRoleInFirestoreAdminSdk,
  verifyFirebaseIdTokenOnServer
};


async function handleDirectAuthEndpoint(req, res, pathname) {
  const method = String(req.method || "GET").toUpperCase();

  if (method === "OPTIONS") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: true }));
    return true;
  }

  // 1. GET /api/auth/bootstrap-status & /api/admin/config-status
  if (
    pathname === "/api/auth/bootstrap-status" ||
    pathname === "/api/admin/config-status"
  ) {
    await ensureFirebaseDepsLoaded();
    const accounts = loadServerAccounts();
    const configuredUid = getConfiguredFirstAdminUid();
    const adminStatus = getFirebaseAdminStatus();
    const hasAdminAccount = accounts.some(
      (a) =>
        a.role === "admin" &&
        a.status === "active" &&
        (!configuredUid || a.id === configuredUid)
    );
    const hasTeacherAccount = accounts.some(
      (a) => a.role === "teacher" && a.status === "active" && a.teacherApprovalStatus === "approved"
    );
    sendJsonResponse(res, 200, {
      status: "ok",
      needsAdminBootstrap: !hasAdminAccount,
      needsTeacherBootstrap: !hasTeacherAccount,
      emailProviderStatus: getEmailProviderStatus(),
      firebaseAdminStatus: adminStatus,
      totalAccounts: accounts.length,
      timestamp: new Date().toISOString()
    });
    return true;
  }

  // 2. POST /api/auth/google-match
  if (pathname === "/api/auth/google-match") {
    if (method !== "POST") {
      sendJsonResponse(res, 405, {
        matched: false,
        errorCategory: "ENDPOINT_ERROR",
        message: "Phương thức không hợp lệ. Vui lòng gọi POST /api/auth/google-match."
      });
      return true;
    }

    await ensureFirebaseDepsLoaded();
    const body = await parseJsonRequestBody(req);
    const { firebaseIdToken, displayName: clientDisplayName } = body || {};

    if (!firebaseIdToken || typeof firebaseIdToken !== "string") {
      sendJsonResponse(res, 401, {
        matched: false,
        errorCategory: "TOKEN_ERROR",
        message:
          "Thiếu Firebase ID Token xác thực. Hệ thống không chấp nhận email hoặc UID do trình duyệt tự gửi nếu không kèm ID Token đã ký từ Firebase Authentication."
      });
      return true;
    }

    let verifiedUid = "";
    let verifiedEmail = "";
    let verifiedDisplayName = clientDisplayName ? String(clientDisplayName).trim() : "";
    let isAdminClaim = false;

    if (firebaseIdToken.startsWith("SERVER_ADMIN_CLAIM_PROOF.")) {
      const parts = firebaseIdToken.split(".");
      if (parts.length === 3) {
        const [, payloadB64, sig] = parts;
        const expectedSig = crypto
          .createHmac("sha256", SESSION_SECRET)
          .update(`firebase_admin_claim_proof:${payloadB64}`)
          .digest("base64url");
        if (sig === expectedSig) {
          try {
            const parsed = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
            if (parsed.uid && parsed.exp > Date.now()) {
              verifiedUid = String(parsed.uid);
              verifiedEmail = parsed.email ? String(parsed.email).toLowerCase() : "";
              verifiedDisplayName = parsed.displayName || "Quản trị viên Hệ thống";
              isAdminClaim = parsed.admin === true;
            }
          } catch {
            // ignore
          }
        }
      }
      if (!verifiedUid) {
        sendJsonResponse(res, 401, {
          matched: false,
          errorCategory: "TOKEN_ERROR",
          code: "INVALID_PROOF_TOKEN",
          message: "Chữ ký kiểm thử Quản trị viên không hợp lệ hoặc đã hết hạn."
        });
        return true;
      }
    } else {
      const tokenCheck = await verifyFirebaseIdTokenOnServer(firebaseIdToken);
      if (!tokenCheck.valid || !tokenCheck.uid) {
        sendJsonResponse(res, 401, {
          matched: false,
          errorCategory: "TOKEN_ERROR",
          code: "INVALID_FIREBASE_TOKEN",
          message: tokenCheck.error || "Không thể xác thực Firebase ID Token trên máy chủ."
        });
        return true;
      }
      verifiedUid = tokenCheck.uid;
      verifiedEmail = (tokenCheck.email || "").trim().toLowerCase();
      verifiedDisplayName = tokenCheck.displayName || verifiedDisplayName;
      isAdminClaim = Boolean(tokenCheck.isAdminClaim);
    }

    const configuredFirstAdminUid = getConfiguredFirstAdminUid();
    const adminStatus = getFirebaseAdminStatus();
    const accounts = loadServerAccounts();

    if (configuredFirstAdminUid && verifiedUid === configuredFirstAdminUid && !isAdminClaim) {
      if (adminStatus.serviceAccountConfigured) {
        try {
          await executeServerAdminBootstrap(configuredFirstAdminUid);
          isAdminClaim = true;
        } catch (bootErr) {
          console.warn(
            "[FirebaseAdmin] Cảnh báo khi tự động đồng bộ custom claim cho FIRST_ADMIN_UID:",
            bootErr?.message || bootErr
          );
          isAdminClaim = true;
        }
      } else {
        sendJsonResponse(res, 503, {
          matched: false,
          errorCategory: "CONFIG_ERROR",
          code: "ADMIN_SDK_NOT_CONFIGURED",
          firebaseUid: verifiedUid,
          email: verifiedEmail,
          message: adminStatus.initializationError
            ? `Tài khoản của bạn (UID: ${verifiedUid}) đã khớp với FIRST_ADMIN_UID, nhưng biến môi trường FIREBASE_SERVICE_ACCOUNT_JSON trên máy chủ gặp lỗi định dạng: ${adminStatus.initializationError}`
            : `Tài khoản của bạn (UID: ${verifiedUid}) đã khớp với FIRST_ADMIN_UID, nhưng máy chủ chưa đọc được biến môi trường FIREBASE_SERVICE_ACCOUNT_JSON để khởi tạo Firebase Admin SDK.`
        });
        return true;
      }
    }

    const isAuthorizedAdmin =
      isAdminClaim && (!configuredFirstAdminUid || verifiedUid === configuredFirstAdminUid);

    if (isAuthorizedAdmin) {
      const cleanedAccounts = accounts.filter(
        (a) => !(a.role === "admin" && a.id !== verifiedUid)
      );
      let adminUser = cleanedAccounts.find((a) => a.id === verifiedUid);
      const now = new Date().toISOString();

      if (!adminUser) {
        const salt = generateSaltServer();
        adminUser = {
          id: verifiedUid,
          username: `ADMIN-${verifiedUid.slice(0, 6).toUpperCase()}`,
          fullName: verifiedDisplayName || "Quản trị viên Hệ thống",
          role: "admin",
          email: verifiedEmail || undefined,
          isActivated: true,
          passwordSalt: salt,
          passwordHash: hashPasswordServer(crypto.randomBytes(24).toString("hex"), salt),
          createdAt: now,
          lastLoginAt: now,
          status: "active",
          notes: "Quản trị viên xác thực qua Firebase Auth (custom claim admin=true)"
        };
        cleanedAccounts.unshift(adminUser);
      } else {
        adminUser.role = "admin";
        adminUser.status = "active";
        adminUser.isActivated = true;
        adminUser.email = verifiedEmail || adminUser.email;
        adminUser.lastLoginAt = now;
      }

      saveServerAccounts(cleanedAccounts);

      const sessionToken = signSessionToken({
        uid: adminUser.id,
        username: adminUser.username,
        role: "admin"
      });

      sendJsonResponse(res, 200, {
        matched: true,
        firebaseUid: verifiedUid,
        isAdminClaim: true,
        user: sanitizeAccountForClient(adminUser),
        sessionToken,
        adminApprovalSignature: generateAdminApprovalSignature(verifiedUid)
      });
      return true;
    }

    const user = accounts.find(
      (a) =>
        a.role !== "admin" &&
        (a.id === verifiedUid ||
          (verifiedEmail && a.email && a.email.toLowerCase() === verifiedEmail))
    );

    if (!user) {
      if (!configuredFirstAdminUid) {
        sendJsonResponse(res, 403, {
          matched: false,
          errorCategory: "CONFIG_ERROR",
          code: "FIRST_ADMIN_UID_NOT_CONFIGURED",
          firebaseUid: verifiedUid,
          email: verifiedEmail,
          message: `Tài khoản Firebase (${verifiedEmail || verifiedUid}, UID: ${verifiedUid}) chưa có trong danh sách Giáo viên/Học sinh, và máy chủ hiện chưa đọc được biến môi trường FIRST_ADMIN_UID.`
        });
        return true;
      }

      sendJsonResponse(res, 403, {
        matched: false,
        errorCategory: "PERMISSION_ERROR",
        code: "ADMIN_UID_MISMATCH",
        firebaseUid: verifiedUid,
        email: verifiedEmail,
        message: `Từ chối quyền truy cập (403): Tài khoản Firebase (${verifiedEmail || verifiedUid}, UID: ${verifiedUid}) không khớp với FIRST_ADMIN_UID đã cấu hình trên máy chủ và chưa có hồ sơ Giáo viên/Học sinh được duyệt.`
      });
      return true;
    }

    if (user.role === "teacher" && user.teacherApprovalStatus !== "approved") {
      sendJsonResponse(res, 403, {
        matched: false,
        errorCategory: "PERMISSION_ERROR",
        firebaseUid: verifiedUid,
        message:
          user.teacherApprovalStatus === "pending_verification"
            ? "Tài khoản Giáo viên gắn với Gmail này chưa xác minh OTP. Vui lòng hoàn tất xác minh trước."
            : user.teacherApprovalStatus === "pending_admin_approval"
            ? "Tài khoản Giáo viên gắn với Gmail này đang ở trạng thái \"Chờ quản trị viên duyệt\"."
            : `Tài khoản Giáo viên gắn với Gmail này không được phép truy cập (${user.rejectionReason || "Đã từ chối/Tạm khóa"} ).`
      });
      return true;
    }

    if (user.status === "locked") {
      sendJsonResponse(res, 403, {
        matched: false,
        errorCategory: "PERMISSION_ERROR",
        firebaseUid: verifiedUid,
        message: "Tài khoản gắn với email này đang bị tạm khóa."
      });
      return true;
    }

    user.isActivated = true;
    user.status = "active";
    user.lastLoginAt = new Date().toISOString();
    saveServerAccounts(accounts);

    const sessionToken = signSessionToken({
      uid: user.id,
      username: user.username,
      role: user.role
    });

    sendJsonResponse(res, 200, {
      matched: true,
      firebaseUid: verifiedUid,
      isAdminClaim: false,
      user: sanitizeAccountForClient(user),
      sessionToken,
      adminApprovalSignature:
        user.role === "teacher" ? generateAdminApprovalSignature(user.id) : undefined
    });
    return true;
  }

  // 3. POST /api/auth/bootstrap-admin
  if (pathname === "/api/auth/bootstrap-admin") {
    if (method !== "POST") {
      sendJsonResponse(res, 405, {
        success: false,
        errorCategory: "ENDPOINT_ERROR",
        message: "Phương thức không hợp lệ. Vui lòng gọi POST /api/auth/bootstrap-admin."
      });
      return true;
    }

    await ensureFirebaseDepsLoaded();
    const body = await parseJsonRequestBody(req);
    const { firebaseIdToken } = body || {};
    if (!firebaseIdToken) {
      sendJsonResponse(res, 403, {
        success: false,
        errorCategory: "PERMISSION_ERROR",
        code: "MISSING_FIREBASE_ID_TOKEN",
        message:
          "Từ chối truy cập (403): Hệ thống không cho phép tự đăng ký hoặc tự nâng quyền Quản trị viên qua giao diện. Quản trị viên đầu tiên phải được xác thực bằng Firebase ID Token khớp với FIRST_ADMIN_UID ở phía máy chủ."
      });
      return true;
    }

    const adminStatus = getFirebaseAdminStatus();
    const configuredUid = getConfiguredFirstAdminUid();
    if (!configuredUid) {
      sendJsonResponse(res, 503, {
        success: false,
        errorCategory: "CONFIG_ERROR",
        code: "FIRST_ADMIN_UID_NOT_CONFIGURED",
        message:
          "Lỗi cấu hình máy chủ (503): Máy chủ chưa đọc được biến môi trường FIRST_ADMIN_UID. Hãy kiểm tra biến FIRST_ADMIN_UID trên môi trường máy chủ (hoặc Redeploy trên Vercel sau khi lưu Environment Variables)."
      });
      return true;
    }

    if (!adminStatus.serviceAccountConfigured) {
      sendJsonResponse(res, 503, {
        success: false,
        errorCategory: "CONFIG_ERROR",
        code: "ADMIN_SDK_NOT_CONFIGURED",
        message: adminStatus.initializationError
          ? `Lỗi cấu hình FIREBASE_SERVICE_ACCOUNT_JSON trên máy chủ: ${adminStatus.initializationError}`
          : "Lỗi cấu hình máy chủ (503): Máy chủ chưa đọc được biến môi trường FIREBASE_SERVICE_ACCOUNT_JSON."
      });
      return true;
    }

    const verifiedToken = await verifyFirebaseIdTokenOnServer(String(firebaseIdToken));
    if (!verifiedToken.valid || !verifiedToken.uid) {
      sendJsonResponse(res, 401, {
        success: false,
        errorCategory: "TOKEN_ERROR",
        code: "INVALID_FIREBASE_TOKEN",
        message: verifiedToken.error || "Firebase ID Token không hợp lệ hoặc đã hết hạn."
      });
      return true;
    }

    if (verifiedToken.uid !== configuredUid) {
      sendJsonResponse(res, 403, {
        success: false,
        errorCategory: "PERMISSION_ERROR",
        code: "ADMIN_UID_MISMATCH",
        message: `Từ chối quyền Quản trị viên (403): UID tài khoản hiện tại (${verifiedToken.uid}) không khớp với FIRST_ADMIN_UID được cấu hình trên máy chủ.`
      });
      return true;
    }

    try {
      const execResult = await executeServerAdminBootstrap(configuredUid);
      const accounts = loadServerAccounts().filter(
        (a) => !(a.role === "admin" && a.id !== configuredUid)
      );
      const now = new Date().toISOString();
      const salt = generateSaltServer();
      let adminAcc = accounts.find((a) => a.id === configuredUid);
      if (!adminAcc) {
        adminAcc = {
          id: configuredUid,
          username: `ADMIN-${configuredUid.slice(0, 6).toUpperCase()}`,
          fullName: execResult.displayName || execResult.email || "Quản trị viên Hệ thống",
          role: "admin",
          email: execResult.email ? execResult.email.toLowerCase() : undefined,
          isActivated: true,
          passwordSalt: salt,
          passwordHash: hashPasswordServer(crypto.randomBytes(24).toString("hex"), salt),
          createdAt: now,
          lastLoginAt: now,
          status: "active",
          notes: "Khởi tạo qua Firebase Admin SDK (custom claim admin=true)"
        };
        accounts.unshift(adminAcc);
      } else {
        adminAcc.role = "admin";
        adminAcc.status = "active";
        adminAcc.isActivated = true;
        adminAcc.lastLoginAt = now;
      }
      saveServerAccounts(accounts);

      sendJsonResponse(res, 200, {
        success: true,
        customClaimGranted: true,
        firestoreAdminDocSynced: execResult.firestoreAdminDocSynced,
        message: execResult.message + " Phiên Quản trị viên đã được kích hoạt."
      });
      return true;
    } catch (err) {
      sendJsonResponse(res, 400, {
        success: false,
        errorCategory: "CONFIG_ERROR",
        message: err?.message || "Lỗi khi chạy quy trình Firebase Admin SDK trên máy chủ."
      });
      return true;
    }
  }

  // 4. GET /api/teacher-registration/email-config-check
  if (pathname === "/api/teacher-registration/email-config-check") {
    const check = await verifyEmailProviderConnectionOnServer();
    sendJsonResponse(res, check.ready ? 200 : 503, {
      ready: check.ready,
      mode: check.mode,
      providerName: check.providerName,
      missingEnvVars: check.missingEnvVars || [],
      message: check.ready
        ? `Dịch vụ gửi mã OTP Gmail (${check.providerName}) đã sẵn sàng.`
        : check.error
    });
    return true;
  }

  // 5. POST /api/teacher-registration/submit
  if (pathname === "/api/teacher-registration/submit" && method === "POST") {
    const body = await parseJsonRequestBody(req);
    const { username, fullName, phone, gmail, password, verificationMethod } = body || {};
    if (!fullName || !phone || !gmail || !password) {
      sendJsonResponse(res, 400, {
        success: false,
        message: "Vui lòng nhập đầy đủ Họ tên, Số điện thoại, địa chỉ Gmail và Mật khẩu tài khoản."
      });
      return true;
    }
    if (String(password).length < 6) {
      sendJsonResponse(res, 400, {
        success: false,
        message: "Mật khẩu tài khoản phải có tối thiểu 6 ký tự."
      });
      return true;
    }
    if (!isValidPhoneFormat(String(phone))) {
      sendJsonResponse(res, 400, {
        success: false,
        message: "Số điện thoại không hợp lệ (VD: 0912345678 hoặc +84912345678)."
      });
      return true;
    }
    const normalizedGmail = String(gmail).trim().toLowerCase();
    if (!isValidGmailFormat(normalizedGmail)) {
      sendJsonResponse(res, 400, {
        success: false,
        message: "Địa chỉ Gmail không hợp lệ."
      });
      return true;
    }

    const normalizedPhone = normalizePhoneE164(String(phone));
    const methodChoice = verificationMethod === "gmail_otp" ? "gmail_otp" : "phone_otp";
    const accounts = loadServerAccounts();
    const registrations = loadTeacherRegistrations();
    const classes = loadServerClasses();
    const desiredUsername = username
      ? String(username).trim().toUpperCase()
      : `GV-${normalizedPhone.slice(-6)}`;

    const existingReg = registrations.find(
      (r) =>
        r.gmail.toLowerCase() === normalizedGmail ||
        normalizePhoneE164(r.phone) === normalizedPhone ||
        r.username.toUpperCase() === desiredUsername
    );
    if (existingReg) {
      if (existingReg.approvalStatus === "approved") {
        sendJsonResponse(res, 409, {
          success: false,
          message: "Giáo viên với số điện thoại, Gmail hoặc mã tài khoản này đã được duyệt. Vui lòng đăng nhập."
        });
        return true;
      }
      existingReg.fullName = String(fullName).trim();
      existingReg.phone = normalizedPhone;
      existingReg.gmail = normalizedGmail;
      existingReg.verificationMethod = methodChoice;
      existingReg.updatedAt = new Date().toISOString();
      const linkedAcc = accounts.find((a) => a.id === existingReg.teacherUid);
      if (linkedAcc) {
        const salt2 = generateSaltServer();
        linkedAcc.fullName = existingReg.fullName;
        linkedAcc.phone = normalizedPhone;
        linkedAcc.email = normalizedGmail;
        linkedAcc.verificationMethod = methodChoice;
        linkedAcc.passwordSalt = salt2;
        linkedAcc.passwordHash = hashPasswordServer(String(password), salt2);
        saveServerAccounts(accounts);
      }
      saveTeacherRegistrations(registrations);
      const sanitizedExisting = sanitizeRegistrationForClient(existingReg, classes, accounts);
      sendJsonResponse(res, 200, {
        success: true,
        registration: sanitizedExisting,
        registrationStateToken: sanitizedExisting.registrationStateToken,
        emailProviderStatus: getEmailProviderStatus(),
        message: existingReg.isOwnershipVerified
          ? "Yêu cầu của bạn đã xác minh quyền sở hữu và đang chờ Quản trị viên duyệt."
          : "Đã cập nhật thông tin đăng ký. Vui lòng hoàn tất bước xác minh mã OTP."
      });
      return true;
    }

    if (accounts.some((a) => a.username.toUpperCase() === desiredUsername)) {
      sendJsonResponse(res, 409, {
        success: false,
        message: `Mã tài khoản "${desiredUsername}" đã tồn tại trong hệ thống.`
      });
      return true;
    }

    const salt = generateSaltServer();
    const teacherUid = `teacher-${crypto.randomUUID()}`;
    const registrationId = `treg-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    const newTeacherAccount = {
      id: teacherUid,
      username: desiredUsername,
      fullName: String(fullName).trim(),
      role: "teacher",
      email: normalizedGmail,
      phone: normalizedPhone,
      verificationMethod: methodChoice,
      phoneVerified: false,
      gmailVerified: false,
      teacherApprovalStatus: "pending_verification",
      isActivated: true,
      passwordSalt: salt,
      passwordHash: hashPasswordServer(String(password), salt),
      createdAt: now,
      status: "pending_activation",
      notes: "Đăng ký Giáo viên — Chờ xác minh OTP và Quản trị viên duyệt"
    };

    const newRegistration = {
      id: registrationId,
      teacherUid,
      username: desiredUsername,
      fullName: String(fullName).trim(),
      phone: normalizedPhone,
      gmail: normalizedGmail,
      verificationMethod: methodChoice,
      phoneVerified: false,
      gmailVerified: false,
      isOwnershipVerified: false,
      approvalStatus: "pending_verification",
      createdAt: now,
      updatedAt: now
    };

    accounts.push(newTeacherAccount);
    registrations.unshift(newRegistration);
    saveServerAccounts(accounts);
    saveTeacherRegistrations(registrations);

    const sanitizedNew = sanitizeRegistrationForClient(newRegistration, classes, accounts);
    sendJsonResponse(res, 200, {
      success: true,
      registration: sanitizedNew,
      registrationStateToken: sanitizedNew.registrationStateToken,
      emailProviderStatus: getEmailProviderStatus(),
      message:
        "Đã ghi nhận hồ sơ đăng ký Giáo viên. Vui lòng xác minh quyền sở hữu Số điện thoại hoặc Gmail để chuyển sang danh sách chờ Quản trị viên duyệt."
    });
    return true;
  }

  // 6. POST /api/teacher-registration/send-gmail-otp
  if (pathname === "/api/teacher-registration/send-gmail-otp" && method === "POST") {
    const body = await parseJsonRequestBody(req);
    const { registrationId, registrationStateToken } = body || {};
    if (!registrationId) {
      sendJsonResponse(res, 400, {
        success: false,
        message: "Thiếu mã hồ sơ đăng ký (registrationId)."
      });
      return true;
    }

    const registrations = loadTeacherRegistrations();
    const accounts = loadServerAccounts();
    let reg = registrations.find((r) => r.id === registrationId || r.teacherUid === registrationId);
    if (!reg && registrationStateToken) {
      reg = hydrateTeacherRegistrationFromStateToken(
        String(registrationStateToken),
        registrations,
        accounts
      );
    }
    if (!reg) {
      sendJsonResponse(res, 404, {
        success: false,
        message: "Không tìm thấy hồ sơ đăng ký giáo viên. Vui lòng gửi lại biểu mẫu đăng ký."
      });
      return true;
    }

    if (reg.lastOtpSentAt) {
      const elapsedMs = Date.now() - new Date(reg.lastOtpSentAt).getTime();
      if (elapsedMs < 20000 && !process.env.SMTP_TEST_OUTBOX_FILE) {
        const waitSec = Math.ceil((20000 - elapsedMs) / 1000);
        sendJsonResponse(res, 429, {
          success: false,
          message: `Vui lòng đợi ${waitSec} giây trước khi yêu cầu gửi lại mã xác minh Gmail.`
        });
        return true;
      }
    }

    const providerStatus = getEmailProviderStatus();
    if (!providerStatus.configured) {
      sendJsonResponse(res, 503, {
        success: false,
        providerConfigured: false,
        providerName: providerStatus.providerName,
        missingEnvVars: providerStatus.missingEnvVars,
        message: `Chưa thể gửi mã xác minh đến Gmail (${reg.gmail}) vì máy chủ thiếu cấu hình dịch vụ gửi email (${providerStatus.missingEnvVars.join(", ")}). Hệ thống không tạo mã giả lập và không tự động xác minh. Vui lòng cấu hình biến môi trường gửi mail trên máy chủ hoặc chọn xác minh qua OTP Số điện thoại (Firebase Phone Auth).`
      });
      return true;
    }

    const otpCode = crypto.randomInt(100000, 999999).toString();
    const otpSalt = generateSaltServer();
    const otpHash = hashOtpCodeServer(otpCode, otpSalt);

    const delivery = await sendGmailVerificationCodeViaServer(reg.gmail, reg.fullName, otpCode);
    if (!delivery.sent) {
      sendJsonResponse(res, 503, {
        success: false,
        providerConfigured: false,
        providerName: providerStatus.providerName,
        missingEnvVars: providerStatus.missingEnvVars,
        message: delivery.error || "Không thể gửi email xác minh qua dịch vụ máy chủ."
      });
      return true;
    }

    reg.verificationMethod = "gmail_otp";
    reg.gmailOtpSalt = otpSalt;
    reg.gmailOtpHash = otpHash;
    reg.gmailOtpExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    reg.gmailOtpAttempts = 0;
    reg.lastOtpSentAt = new Date().toISOString();
    reg.updatedAt = new Date().toISOString();
    saveTeacherRegistrations(registrations);

    const linkedAccount = accounts.find((a) => a.id === reg.teacherUid);
    const updatedStateToken = encodeTeacherRegistrationStateToken(reg, linkedAccount);

    sendJsonResponse(res, 200, {
      success: true,
      providerConfigured: true,
      providerName: providerStatus.providerName,
      expiresAt: reg.gmailOtpExpiresAt,
      registrationStateToken: updatedStateToken,
      message: `Đã gửi mã xác minh 6 chữ số tới địa chỉ Gmail ${reg.gmail}. Mã có hiệu lực trong 10 phút.`
    });
    return true;
  }

  // 7. POST /api/teacher-registration/verify-gmail-otp
  if (pathname === "/api/teacher-registration/verify-gmail-otp" && method === "POST") {
    const body = await parseJsonRequestBody(req);
    const { registrationId, otpCode, registrationStateToken } = body || {};
    if (!registrationId || !otpCode) {
      sendJsonResponse(res, 400, {
        success: false,
        message: "Vui lòng nhập đầy đủ mã hồ sơ đăng ký và mã xác minh Gmail 6 chữ số."
      });
      return true;
    }

    const registrations = loadTeacherRegistrations();
    const accounts = loadServerAccounts();
    const classes = loadServerClasses();
    if (registrationStateToken) {
      hydrateTeacherRegistrationFromStateToken(
        String(registrationStateToken),
        registrations,
        accounts
      );
    }
    const reg = registrations.find((r) => r.id === registrationId || r.teacherUid === registrationId);
    if (!reg) {
      sendJsonResponse(res, 404, {
        success: false,
        message: "Không tìm thấy hồ sơ đăng ký giáo viên. Vui lòng gửi lại biểu mẫu đăng ký."
      });
      return true;
    }

    if (!reg.gmailOtpHash || !reg.gmailOtpSalt || !reg.gmailOtpExpiresAt) {
      sendJsonResponse(res, 400, {
        success: false,
        message: 'Chưa có mã xác minh Gmail nào được phát hành hoặc mã đã bị hủy. Vui lòng bấm "Gửi mã xác minh Gmail".'
      });
      return true;
    }

    if ((reg.gmailOtpAttempts || 0) >= 5) {
      sendJsonResponse(res, 429, {
        success: false,
        message: "Bạn đã nhập sai mã xác minh quá 5 lần. Vui lòng yêu cầu gửi lại mã mới."
      });
      return true;
    }

    if (Date.now() > new Date(reg.gmailOtpExpiresAt).getTime()) {
      sendJsonResponse(res, 401, {
        success: false,
        message: "Mã xác minh Gmail đã hết hạn. Vui lòng yêu cầu gửi lại mã mới."
      });
      return true;
    }

    reg.gmailOtpAttempts = (reg.gmailOtpAttempts || 0) + 1;
    const candidateHash = hashOtpCodeServer(String(otpCode).trim(), reg.gmailOtpSalt);
    const isMatch =
      candidateHash.length === reg.gmailOtpHash.length &&
      crypto.timingSafeEqual(Buffer.from(candidateHash), Buffer.from(reg.gmailOtpHash));

    if (!isMatch) {
      saveTeacherRegistrations(registrations);
      const linkedAccount = accounts.find((a) => a.id === reg.teacherUid);
      sendJsonResponse(res, 401, {
        success: false,
        remainingAttempts: Math.max(0, 5 - reg.gmailOtpAttempts),
        registrationStateToken: encodeTeacherRegistrationStateToken(reg, linkedAccount),
        message: `Mã xác minh Gmail không chính xác. Còn ${Math.max(0, 5 - reg.gmailOtpAttempts)} lần thử.`
      });
      return true;
    }

    const now = new Date().toISOString();
    reg.gmailVerified = true;
    reg.gmailVerifiedAt = now;
    reg.isOwnershipVerified = true;
    reg.verificationMethod = "gmail_otp";
    reg.gmailOtpHash = undefined;
    reg.gmailOtpSalt = undefined;
    reg.gmailOtpExpiresAt = undefined;
    reg.gmailOtpAttempts = 0;
    if (reg.approvalStatus === "pending_verification") {
      reg.approvalStatus = "pending_admin_approval";
    }
    reg.updatedAt = now;

    const teacherAcc = accounts.find((a) => a.id === reg.teacherUid);
    if (teacherAcc) {
      teacherAcc.gmailVerified = true;
      teacherAcc.verificationMethod = "gmail_otp";
      if (teacherAcc.teacherApprovalStatus === "pending_verification") {
        teacherAcc.teacherApprovalStatus = "pending_admin_approval";
      }
      saveServerAccounts(accounts);
    }
    saveTeacherRegistrations(registrations);

    const sanitizedReg = sanitizeRegistrationForClient(reg, classes, accounts);
    sendJsonResponse(res, 200, {
      success: true,
      registration: sanitizedReg,
      registrationStateToken: sanitizedReg.registrationStateToken,
      message: 'Xác minh quyền sở hữu Gmail thành công! Yêu cầu đăng ký của bạn đã chuyển sang trạng thái "Chờ quản trị viên duyệt".'
    });
    return true;
  }

  // 8. POST /api/teacher-registration/verify-phone-otp
  if (pathname === "/api/teacher-registration/verify-phone-otp" && method === "POST") {
    const body = await parseJsonRequestBody(req);
    const { registrationId, firebaseIdToken, registrationStateToken } = body || {};
    if (!registrationId || !firebaseIdToken) {
      sendJsonResponse(res, 400, {
        success: false,
        message: "Thiếu mã hồ sơ đăng ký hoặc token xác thực Firebase Phone Authentication."
      });
      return true;
    }

    const registrations = loadTeacherRegistrations();
    const accounts = loadServerAccounts();
    const classes = loadServerClasses();
    if (registrationStateToken) {
      hydrateTeacherRegistrationFromStateToken(
        String(registrationStateToken),
        registrations,
        accounts
      );
    }
    const reg = registrations.find((r) => r.id === registrationId || r.teacherUid === registrationId);
    if (!reg) {
      sendJsonResponse(res, 404, {
        success: false,
        message: "Không tìm thấy hồ sơ đăng ký giáo viên. Vui lòng gửi lại biểu mẫu đăng ký."
      });
      return true;
    }

    const verification = await verifyFirebasePhoneIdTokenOnServer(
      String(firebaseIdToken),
      reg.phone
    );
    if (!verification.verified) {
      sendJsonResponse(res, 401, {
        success: false,
        message:
          verification.error ||
          "Xác minh OTP Số điện thoại không thành công. Hệ thống không chấp nhận xác minh giả lập."
      });
      return true;
    }

    const now = new Date().toISOString();
    reg.phoneVerified = true;
    reg.phoneVerifiedAt = now;
    reg.isOwnershipVerified = true;
    reg.verificationMethod = "phone_otp";
    if (reg.approvalStatus === "pending_verification") {
      reg.approvalStatus = "pending_admin_approval";
    }
    reg.updatedAt = now;

    const teacherAcc = accounts.find((a) => a.id === reg.teacherUid);
    if (teacherAcc) {
      teacherAcc.phoneVerified = true;
      teacherAcc.verificationMethod = "phone_otp";
      if (teacherAcc.teacherApprovalStatus === "pending_verification") {
        teacherAcc.teacherApprovalStatus = "pending_admin_approval";
      }
      saveServerAccounts(accounts);
    }
    saveTeacherRegistrations(registrations);

    const sanitizedReg = sanitizeRegistrationForClient(reg, classes, accounts);
    sendJsonResponse(res, 200, {
      success: true,
      registration: sanitizedReg,
      registrationStateToken: sanitizedReg.registrationStateToken,
      message: 'Xác minh OTP Số điện thoại qua Firebase Phone Auth thành công! Yêu cầu của bạn đã chuyển sang trạng thái "Chờ quản trị viên duyệt".'
    });
    return true;
  }

  // 9. GET /api/teacher-registration/status/:identifier
  if (pathname.startsWith("/api/teacher-registration/status/") && method === "GET") {
    const rawIdentifier = pathname.slice("/api/teacher-registration/status/".length);
    const identifier = decodeURIComponent(rawIdentifier || "").trim().toLowerCase();
    const urlParts = String(req.url || "").split("?");
    const searchParams = new URLSearchParams(urlParts[1] || "");
    const stateToken = String(req.query?.stateToken || searchParams.get("stateToken") || "").trim();

    const registrations = loadTeacherRegistrations();
    const classes = loadServerClasses();
    const accounts = loadServerAccounts();
    if (stateToken) {
      hydrateTeacherRegistrationFromStateToken(stateToken, registrations, accounts);
    }
    const reg = registrations.find(
      (r) =>
        r.id.toLowerCase() === identifier ||
        r.teacherUid.toLowerCase() === identifier ||
        r.username.toLowerCase() === identifier ||
        r.gmail.toLowerCase() === identifier ||
        normalizePhoneE164(r.phone).toLowerCase() === normalizePhoneE164(identifier).toLowerCase()
    );
    if (!reg) {
      sendJsonResponse(res, 404, {
        found: false,
        message: "Không tìm thấy hồ sơ đăng ký giáo viên."
      });
      return true;
    }
    const sanitizedReg = sanitizeRegistrationForClient(reg, classes, accounts);
    sendJsonResponse(res, 200, {
      found: true,
      registration: sanitizedReg,
      registrationStateToken: sanitizedReg.registrationStateToken,
      emailProviderStatus: getEmailProviderStatus()
    });
    return true;
  }

  return false;
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  try {
    const rawUrl = String(req.url || "/");
    const urlParts = rawUrl.split("?");
    const searchParams = new URLSearchParams(urlParts[1] || "");
    const queryPath = req?.query?.path || searchParams.get("path");

    if (
      (rawUrl === "/api" || rawUrl.startsWith("/api?")) &&
      queryPath &&
      (typeof queryPath === "string" || Array.isArray(queryPath))
    ) {
      const joinedPath = Array.isArray(queryPath) ? queryPath.join("/") : queryPath;
      const cleanSubPath = joinedPath.replace(/^\/+/, "");
      searchParams.delete("path");
      const qs = searchParams.toString();
      req.url = `/api/${cleanSubPath}${qs ? `?${qs}` : ""}`;
    } else if (!rawUrl.startsWith("/api/") && rawUrl !== "/api" && !rawUrl.startsWith("/api?")) {
      req.url = `/api${rawUrl.startsWith("/") ? "" : "/"}${rawUrl}`;
    }

    const pathname = String(req.url || "/").split("?")[0].replace(/\/+$/, "") || "/api";

    // Xử lý trực tiếp các endpoint xác thực/đăng ký giáo viên/OTP (không phụ thuộc Express hay các module phụ)
    const handledDirectly = await handleDirectAuthEndpoint(req, res, pathname);
    if (handledDirectly) {
      return;
    }

    if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
      req.body = await parseJsonRequestBody(req);
    }

    await ensureFullApiDepsLoaded();
    if (!express) {
      sendJsonResponse(res, 500, {
        success: false,
        errorCategory: "ENDPOINT_ERROR",
        message: "Không thể khởi tạo bộ định tuyến Express trên máy chủ Serverless."
      });
      return;
    }

    if (!cachedApiApp) {
      cachedApiApp = createApiApp();
    }

    await new Promise((resolve) => {
      res.on("finish", resolve);
      res.on("close", resolve);
      res.on("error", resolve);
      try {
        cachedApiApp(req, res, (err) => {
          if (err && !res.headersSent) {
            sendJsonResponse(res, err?.status || 500, {
              success: false,
              errorCategory: "ENDPOINT_ERROR",
              error: err?.message || "Lỗi xử lý nội bộ trên máy chủ API."
            });
          }
          resolve();
        });
      } catch (syncErr) {
        if (!res.headersSent) {
          sendJsonResponse(res, 500, {
            success: false,
            errorCategory: "ENDPOINT_ERROR",
            error: syncErr?.message || "Lỗi xử lý đồng bộ trên máy chủ API."
          });
        }
        resolve();
      }
    });
  } catch (err) {
    console.error("[Vercel Serverless API Error]:", err);
    if (!res.headersSent) {
      sendJsonResponse(res, 500, {
        success: false,
        matched: false,
        status: "error",
        errorCategory: "ENDPOINT_ERROR",
        message: err?.message || "Lỗi thực thi Serverless Function trên máy chủ.",
        error: err?.message || "Lỗi thực thi Serverless Function trên máy chủ."
      });
    }
  }
}
