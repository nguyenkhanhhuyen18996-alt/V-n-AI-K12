import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import {
  executeServerAdminBootstrap,
  getConfiguredFirstAdminUid,
  getFirebaseAdminStatus
} from '../src/server/firebaseAdmin.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, '.data');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts_v2.json');

function syncLocalServerAdminAccount(params: {
  uid: string;
  email?: string;
  displayName?: string;
}) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  let accounts: any[] = [];
  if (fs.existsSync(ACCOUNTS_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf-8'));
      if (Array.isArray(parsed)) accounts = parsed;
    } catch {
      accounts = [];
    }
  }

  // Đảm bảo chỉ duy nhất UID được cấu hình trong FIRST_ADMIN_UID giữ vai trò 'admin'
  accounts = accounts.filter((a) => !(a.role === 'admin' && a.id !== params.uid));

  const now = new Date().toISOString();
  const existingIdx = accounts.findIndex((a) => a.id === params.uid);
  const salt = crypto.randomBytes(16).toString('hex');
  const randomSecret = crypto.randomBytes(24).toString('hex');
  const passwordHash = crypto
    .pbkdf2Sync(randomSecret, salt, 10000, 64, 'sha512')
    .toString('hex');

  const adminRecord = {
    id: params.uid,
    username: `ADMIN-${params.uid.slice(0, 6).toUpperCase()}`,
    fullName: params.displayName || params.email || 'Quản trị viên Hệ thống Đầu tiên',
    role: 'admin',
    email: params.email ? params.email.toLowerCase() : undefined,
    isActivated: true,
    passwordSalt: existingIdx >= 0 ? accounts[existingIdx].passwordSalt || salt : salt,
    passwordHash: existingIdx >= 0 ? accounts[existingIdx].passwordHash || passwordHash : passwordHash,
    createdAt: existingIdx >= 0 ? accounts[existingIdx].createdAt || now : now,
    lastLoginAt: now,
    status: 'active',
    notes: 'Khởi tạo một lần qua Firebase Admin SDK (custom claim admin=true)'
  };

  if (existingIdx >= 0) {
    accounts[existingIdx] = { ...accounts[existingIdx], ...adminRecord };
  } else {
    accounts.unshift(adminRecord);
  }

  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), 'utf-8');
}

async function main() {
  console.log('====================================================================');
  console.log(' VĂN AI 12 — KHỞI TẠO QUẢN TRỊ VIÊN ĐẦU TIÊN (FIREBASE ADMIN SDK)');
  console.log('====================================================================');

  const status = getFirebaseAdminStatus();
  const targetUid = process.argv[2]?.trim() || getConfiguredFirstAdminUid();

  console.log(`- Firebase Project ID       : ${status.projectId || '(chưa có)'}`);
  console.log(`- Firestore Database ID     : ${status.firestoreDatabaseId}`);
  console.log(`- FIRST_ADMIN_UID           : ${targetUid || '(CHƯA CẤU HÌNH)'}`);
  console.log(`- Nguồn khóa Admin SDK      : ${status.credentialSource}`);

  if (!targetUid) {
    console.error(
      '\n[LỖI CẤU HÌNH] Chưa có FIRST_ADMIN_UID trong tệp .env (hoặc tham số dòng lệnh).'
    );
    console.error(
      'Hướng dẫn: Mở tệp .env ở thư mục gốc máy chủ và thêm dòng:\n  FIRST_ADMIN_UID=<UID_FIREBASE_AUTH_CỦA_BẠN>'
    );
    process.exit(1);
  }

  if (!status.serviceAccountConfigured) {
    console.error(
      '\n[LỖI CẤU HÌNH] Chưa cấu hình khóa dịch vụ Firebase Admin SDK (FIREBASE_SERVICE_ACCOUNT_JSON hoặc GOOGLE_APPLICATION_CREDENTIALS).'
    );
    if (status.initializationError) {
      console.error(`Chi tiết: ${status.initializationError}`);
    }
    console.error(
      'Hệ thống KHÔNG giả lập quyền quản trị. Vui lòng tạo Service Account Key từ Firebase Console -> Project Settings -> Service accounts và cấu hình vào .env phía máy chủ.'
    );
    process.exit(1);
  }

  try {
    const result = await executeServerAdminBootstrap(targetUid);
    syncLocalServerAdminAccount({
      uid: result.uid,
      email: result.email,
      displayName: result.displayName
    });

    console.log('\n[THÀNH CÔNG] Đã khởi tạo Quản trị viên đầu tiên:');
    console.log(`  + UID                     : ${result.uid}`);
    console.log(`  + Email Firebase Auth     : ${result.email || '(không có)'}`);
    console.log(`  + Custom Claim            : { admin: true, role: "admin" }`);
    console.log(
      `  + Đồng bộ Cloud Firestore : ${
        result.firestoreAdminDocSynced
          ? 'Đã ghi /admins/' + result.uid + ' và /users/' + result.uid
          : 'Chưa ghi được (' + (result.firestoreError || 'kiểm tra kết nối Firestore') + ')'
      }`
    );
    console.log(
      '\nBƯỚC TIẾP THEO: Hãy đăng xuất và đăng nhập lại (hoặc bấm nút "Làm mới Phiên & Kiểm tra Quyền Admin" trong cửa sổ Tài khoản) để trình duyệt nhận ID Token mới có custom claim admin=true.'
    );
  } catch (err: any) {
    console.error('\n[THẤT BẠI] Không thể khởi tạo Quản trị viên:', err?.message || err);
    process.exit(1);
  }
}

main();
