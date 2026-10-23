import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const API_BASE = 'http://127.0.0.1:3000';
const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_FILES = [
  'accounts_v2.json',
  'teacher_registrations_v2.json',
  'classes_v2.json',
  'admin_audit_logs_v2.json',
  'student_states_v2.json'
];

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto.createHash('sha256').update(`${process.cwd()}:vanai12_hmac_secret_v2`).digest('hex');

function hashOtpCodeForTest(otpCode: string, salt: string): string {
  return crypto
    .pbkdf2Sync(otpCode.trim(), `${salt}:${SESSION_SECRET}:otp_pepper`, 10000, 32, 'sha256')
    .toString('hex');
}

function createSignedPhoneProofToken(phone: string, uid: string): string {
  const payloadB64 = Buffer.from(
    JSON.stringify({
      phone,
      uid,
      exp: Date.now() + 5 * 60 * 1000
    })
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(`firebase_phone_proof:${payloadB64}`)
    .digest('base64url');
  return `SERVER_PHONE_PROOF.${payloadB64}.${sig}`;
}

function createSignedAdminClaimProofToken(params: {
  uid: string;
  email: string;
  admin: boolean;
}): string {
  const payloadB64 = Buffer.from(
    JSON.stringify({
      uid: params.uid,
      email: params.email,
      displayName: 'Quản trị viên Đầu tiên',
      admin: params.admin,
      exp: Date.now() + 5 * 60 * 1000
    })
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(`firebase_admin_claim_proof:${payloadB64}`)
    .digest('base64url');
  return `SERVER_ADMIN_CLAIM_PROOF.${payloadB64}.${sig}`;
}

async function apiRequest(
  endpoint: string,
  method: 'GET' | 'POST' = 'GET',
  body?: any,
  token?: string
): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

function assertCondition(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
  console.log(`  ✅ PASS: ${message}`);
}

async function runTests() {
  console.log('================================================================');
  console.log('BẮT ĐẦU KIỂM THỬ HỆ THỐNG QUẢN TRỊ VIÊN, OTP GIÁO VIÊN & QUOTA LỚP');
  console.log('================================================================');

  // Backup existing data files so we restore clean state after running the suite
  const backups: Record<string, string | null> = {};
  for (const file of DB_FILES) {
    const fullPath = path.join(DATA_DIR, file);
    backups[file] = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf-8') : null;
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }

  try {
    // ----------------------------------------------------------------
    // 1. KIỂM THỬ KHỞI TẠO QUẢN TRỊ VIÊN AN TOÀN & CHỐNG TỰ NÂNG QUYỀN
    // ----------------------------------------------------------------
    console.log('\n[1] Kiểm thử Quản trị viên (Chỉ nhận Custom Claim admin=true & Chống tự nâng quyền):');
    const uiSelfBootstrapAttempt = await apiRequest('/api/auth/bootstrap-admin', 'POST', {
      username: 'ADMIN-HACK',
      fullName: 'Người dùng tự nâng quyền qua UI',
      email: 'attacker@gmail.com',
      password: 'AttackerPassword123!'
    });
    assertCondition(
      uiSelfBootstrapAttempt.status === 403,
      'Chặn hoàn toàn (403) người dùng tự tạo Quản trị viên bằng biểu mẫu giao diện / mật khẩu / email'
    );

    const nonClaimToken = createSignedAdminClaimProofToken({
      uid: 'uid-regular-user-999',
      email: 'user999@gmail.com',
      admin: false
    });
    const nonClaimAttempt = await apiRequest('/api/auth/google-match', 'POST', {
      firebaseIdToken: nonClaimToken
    });
    assertCondition(
      nonClaimAttempt.status === 403 && nonClaimAttempt.data?.matched === false,
      'Chặn (403) tài khoản Firebase Auth không có custom claim admin=true tự nhận quyền Quản trị viên'
    );

    const validAdminClaimToken = createSignedAdminClaimProofToken({
      uid: process.env.FIRST_ADMIN_UID || 'uid-first-admin-vanai12',
      email: 'first.admin@school.edu.vn',
      admin: true
    });
    const adminAuthRes = await apiRequest('/api/auth/google-match', 'POST', {
      firebaseIdToken: validAdminClaimToken
    });
    assertCondition(
      adminAuthRes.status === 200 &&
        adminAuthRes.data?.matched === true &&
        adminAuthRes.data?.user?.role === 'admin' &&
        Boolean(adminAuthRes.data?.sessionToken),
      'Xác thực thành công Quản trị viên đầu tiên khi Firebase ID Token có custom claim admin=true'
    );
    const adminToken = adminAuthRes.data.sessionToken as string;

    // ----------------------------------------------------------------
    // 2. KIỂM THỬ ĐĂNG KÝ GIÁO VIÊN & XÁC MINH MÃ GMAIL / OTP ĐIỆN THOẠI
    // ----------------------------------------------------------------
    console.log('\n[2] Kiểm thử Đăng ký Giáo viên & Xác minh OTP (Điện thoại & Gmail):');
    const regTeacher1 = await apiRequest('/api/teacher-registration/submit', 'POST', {
      username: 'GV-CHAU01',
      fullName: 'Cô Nguyễn Thị Minh Châu',
      phone: '0912345678',
      gmail: 'minhchau.gv@gmail.com',
      password: 'TeacherPassword123!',
      verificationMethod: 'gmail_otp'
    });
    assertCondition(
      regTeacher1.status === 200 &&
        regTeacher1.data.registration?.approvalStatus === 'pending_verification',
      'Giáo viên 1 gửi yêu cầu đăng ký -> Trạng thái ban đầu là pending_verification'
    );
    const reg1Id = regTeacher1.data.registration.id as string;

    // Giáo viên 1 thử đăng nhập khi chưa xác minh & chưa duyệt -> Bị chặn 403
    const loginUnverified = await apiRequest('/api/auth/login', 'POST', {
      username: 'minhchau.gv@gmail.com',
      password: 'TeacherPassword123!'
    });
    assertCondition(
      loginUnverified.status === 403 &&
        loginUnverified.data?.code === 'TEACHER_PENDING_VERIFICATION',
      'Giáo viên chưa xác minh OTP không thể đăng nhập vào khu vực giáo viên (403 TEACHER_PENDING_VERIFICATION)'
    );

    // Kiểm thử gửi mã Gmail khi chưa cấu hình dịch vụ gửi email (Báo rõ dịch vụ thiếu, không giả lập)
    const sendGmailNoProvider = await apiRequest('/api/teacher-registration/send-gmail-otp', 'POST', {
      registrationId: reg1Id
    });
    assertCondition(
      sendGmailNoProvider.status === 503 && sendGmailNoProvider.data?.providerConfigured === false,
      'Khi chưa cấu hình SMTP/Resend/Webhook, API trả lỗi 503 kèm danh sách biến môi trường thiếu và tuyệt đối không giả lập xác minh'
    );

    // Đăng ký Giáo viên 2 (Xác minh qua OTP Điện thoại) để kiểm thử OTP SĐT + luồng từ chối của Quản trị viên
    const regTeacher2 = await apiRequest('/api/teacher-registration/submit', 'POST', {
      username: 'GV-HUNG02',
      fullName: 'Thầy Trần Văn Hùng',
      phone: '0987654321',
      gmail: 'vanhung.gv@gmail.com',
      password: 'Teacher2Password123!',
      verificationMethod: 'phone_otp'
    });
    const reg2Id = regTeacher2.data.registration.id as string;

    // Kiểm thử xác minh Phone OTP với token giả mạo -> Bị từ chối 401
    const fakePhoneVerify = await apiRequest('/api/teacher-registration/verify-phone-otp', 'POST', {
      registrationId: reg2Id,
      firebaseIdToken: 'invalid.fake.jwt.token'
    });
    assertCondition(
      fakePhoneVerify.status === 401,
      'Từ chối (401) token Firebase Phone Auth không hợp lệ hoặc giả mạo'
    );

    // Kiểm thử xác minh Phone OTP hợp lệ (chữ ký xác thực số điện thoại khớp +84987654321)
    const validPhoneProof = createSignedPhoneProofToken('+84987654321', 'fb-uid-teacher2');
    const validPhoneVerify = await apiRequest('/api/teacher-registration/verify-phone-otp', 'POST', {
      registrationId: reg2Id,
      firebaseIdToken: validPhoneProof
    });
    assertCondition(
      validPhoneVerify.status === 200 &&
        validPhoneVerify.data.registration?.phoneVerified === true &&
        validPhoneVerify.data.registration?.approvalStatus === 'pending_admin_approval',
      'Xác minh OTP Số điện thoại thành công -> Hồ sơ chuyển sang trạng thái "Chờ quản trị viên duyệt" (pending_admin_approval)'
    );

    // Đăng ký Giáo viên 3 để kiểm thử phân quyền chéo giữa các giáo viên
    const regTeacher3 = await apiRequest('/api/teacher-registration/submit', 'POST', {
      username: 'GV-HA03',
      fullName: 'Cô Lê Thu Hà',
      phone: '0933445566',
      gmail: 'thuha.gv@gmail.com',
      password: 'Teacher3Password123!',
      verificationMethod: 'gmail_otp'
    });
    const reg3Id = regTeacher3.data.registration.id as string;

    // Kiểm thử luồng băm mã OTP Gmail bằng PBKDF2 trên máy chủ và xác minh mã
    const regsPath = path.join(DATA_DIR, 'teacher_registrations_v2.json');
    const accountsPath = path.join(DATA_DIR, 'accounts_v2.json');
    const regsList = JSON.parse(fs.readFileSync(regsPath, 'utf-8'));
    const testOtpCode = '849206';
    const otpSalt = crypto.randomBytes(16).toString('hex');
    const otpHash = hashOtpCodeForTest(testOtpCode, otpSalt);

    for (const r of regsList) {
      if (r.id === reg1Id || r.id === reg3Id) {
        r.gmailOtpSalt = otpSalt;
        r.gmailOtpHash = otpHash;
        r.gmailOtpExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        r.gmailOtpAttempts = 0;
      }
    }
    fs.writeFileSync(regsPath, JSON.stringify(regsList, null, 2), 'utf-8');

    // Kiểm tra trong cơ sở dữ liệu không lưu OTP hoặc mật khẩu dạng văn bản thuần
    const rawRegsText = fs.readFileSync(regsPath, 'utf-8');
    const rawAccountsText = fs.readFileSync(accountsPath, 'utf-8');
    assertCondition(
      !rawRegsText.includes(testOtpCode) &&
        !rawAccountsText.includes('TeacherPassword123!') &&
        !rawAccountsText.includes('AdminSecretPassword123!'),
      'Cơ sở dữ liệu chỉ lưu mã băm PBKDF2 kèm salt, tuyệt đối không lưu OTP hoặc mật khẩu dạng văn bản (plain-text)'
    );

    // Nhập sai mã OTP Gmail -> Bị từ chối 401
    const wrongOtpRes = await apiRequest('/api/teacher-registration/verify-gmail-otp', 'POST', {
      registrationId: reg1Id,
      otpCode: '111111'
    });
    assertCondition(
      wrongOtpRes.status === 401,
      'Nhập sai mã xác minh Gmail bị máy chủ từ chối (401)'
    );

    // Nhập đúng mã OTP Gmail -> Chuyển sang trạng thái pending_admin_approval ("Chờ quản trị viên duyệt")
    const correctOtp1 = await apiRequest('/api/teacher-registration/verify-gmail-otp', 'POST', {
      registrationId: reg1Id,
      otpCode: testOtpCode
    });
    assertCondition(
      correctOtp1.status === 200 &&
        correctOtp1.data.registration?.gmailVerified === true &&
        correctOtp1.data.registration?.approvalStatus === 'pending_admin_approval',
      'Xác minh đúng mã OTP Gmail -> Yêu cầu chuyển sang trạng thái "Chờ quản trị viên duyệt" (pending_admin_approval)'
    );

    await apiRequest('/api/teacher-registration/verify-gmail-otp', 'POST', {
      registrationId: reg3Id,
      otpCode: testOtpCode
    });

    // ----------------------------------------------------------------
    // 3. GIÁO VIÊN ĐÃ XÁC MINH OTP NHƯNG CHƯA ĐƯỢC DUYỆT VẪN BỊ CHẶN
    // ----------------------------------------------------------------
    console.log('\n[3] Kiểm thử Giáo viên chờ duyệt không vào được khu vực Giáo viên:');
    const loginPendingApproval = await apiRequest('/api/auth/login', 'POST', {
      username: 'minhchau.gv@gmail.com',
      password: 'TeacherPassword123!'
    });
    assertCondition(
      loginPendingApproval.status === 403 &&
        loginPendingApproval.data?.code === 'TEACHER_PENDING_APPROVAL',
      'Giáo viên đã xác minh OTP nhưng chưa được Quản trị viên duyệt vẫn bị chặn đăng nhập (403 TEACHER_PENDING_APPROVAL)'
    );

    // ----------------------------------------------------------------
    // 4. QUẢN TRỊ VIÊN DUYỆT VÀ TỪ CHỐI GIÁO VIÊN (CÓ LƯU NHẬT KÝ AUDIT)
    // ----------------------------------------------------------------
    console.log('\n[4] Kiểm thử Quản trị viên duyệt và từ chối Giáo viên:');
    const adminOverview1 = await apiRequest('/api/admin/overview', 'GET', undefined, adminToken);
    assertCondition(
      adminOverview1.status === 200 && adminOverview1.data.registrations.length === 3,
      'Quản trị viên xem được danh sách yêu cầu đăng ký giáo viên, trạng thái xác minh và số liệu tổng hợp'
    );

    // Duyệt Giáo viên 1
    const approveT1 = await apiRequest(
      '/api/admin/teacher-review',
      'POST',
      { registrationId: reg1Id, action: 'approve' },
      adminToken
    );
    assertCondition(
      approveT1.status === 200 &&
        approveT1.data.registration?.approvalStatus === 'approved' &&
        Boolean(approveT1.data.registration?.reviewedByUid) &&
        Boolean(approveT1.data.registration?.reviewedAt),
      'Quản trị viên duyệt Giáo viên 1 thành công, ghi nhận người duyệt và thời điểm duyệt'
    );

    // Từ chối Giáo viên 2 kèm lí do
    const rejectT2 = await apiRequest(
      '/api/admin/teacher-review',
      'POST',
      {
        registrationId: reg2Id,
        action: 'reject',
        reason: 'Chưa xác nhận công tác tại tổ Ngữ văn nhà trường'
      },
      adminToken
    );
    assertCondition(
      rejectT2.status === 200 &&
        rejectT2.data.registration?.approvalStatus === 'rejected' &&
        rejectT2.data.registration?.rejectionReason ===
          'Chưa xác nhận công tác tại tổ Ngữ văn nhà trường',
      'Quản trị viên từ chối Giáo viên 2 kèm lí do thành công'
    );

    // Giáo viên 2 bị từ chối thử đăng nhập -> Bị chặn 403 kèm lí do
    const loginRejectedT2 = await apiRequest('/api/auth/login', 'POST', {
      username: 'vanhung.gv@gmail.com',
      password: 'Teacher2Password123!'
    });
    assertCondition(
      loginRejectedT2.status === 403 &&
        loginRejectedT2.data?.code === 'TEACHER_REJECTED' &&
        String(loginRejectedT2.data?.message || '').includes('Chưa xác nhận công tác'),
      'Giáo viên bị từ chối không thể đăng nhập và nhận thông báo rõ lí do từ chối (403 TEACHER_REJECTED)'
    );

    // Duyệt Giáo viên 3 để kiểm thử phân quyền giữa các giáo viên
    await apiRequest(
      '/api/admin/teacher-review',
      'POST',
      { registrationId: reg3Id, action: 'approve' },
      adminToken
    );

    // Giáo viên 1 đăng nhập sau khi được duyệt -> Thành công
    const loginApprovedT1 = await apiRequest('/api/auth/login', 'POST', {
      username: 'minhchau.gv@gmail.com',
      password: 'TeacherPassword123!'
    });
    assertCondition(
      loginApprovedT1.status === 200 &&
        loginApprovedT1.data.user?.role === 'teacher' &&
        Boolean(loginApprovedT1.data.sessionToken),
      'Giáo viên 1 sau khi được Quản trị viên duyệt đăng nhập thành công vào khu vực Giáo viên'
    );
    const teacher1Token = loginApprovedT1.data.sessionToken as string;

    const loginApprovedT3 = await apiRequest('/api/auth/login', 'POST', {
      username: 'thuha.gv@gmail.com',
      password: 'Teacher3Password123!'
    });
    const teacher3Token = loginApprovedT3.data.sessionToken as string;

    // ----------------------------------------------------------------
    // 5. KIỂM THỬ GIỚI HẠN TỐI ĐA 5 LỚP / GIÁO VIÊN (TẠO LỚP THỨ 5 VÀ THỨ 6)
    // ----------------------------------------------------------------
    console.log('\n[5] Kiểm thử giới hạn tạo lớp thứ 5 và chặn lớp thứ 6:');
    for (let i = 1; i <= 5; i++) {
      const createCls = await apiRequest(
        '/api/classes',
        'POST',
        { name: `12A${i}` },
        teacher1Token
      );
      assertCondition(
        createCls.status === 200 && createCls.data.quota?.remainingClassesQuota === 5 - i,
        `Giáo viên 1 tạo lớp thứ ${i} (12A${i}) thành công — Còn tạo được ${5 - i}/5 lớp`
      );
    }

    // Thử tạo lớp thứ 6 (12A6) -> Phải bị chặn 403 MAX_CLASSES_QUOTA_EXCEEDED
    const create6thClass = await apiRequest(
      '/api/classes',
      'POST',
      { name: '12A6' },
      teacher1Token
    );
    assertCondition(
      create6thClass.status === 403 &&
        create6thClass.data?.code === 'MAX_CLASSES_QUOTA_EXCEEDED',
      'Chặn tạo lớp thứ 6 (403 MAX_CLASSES_QUOTA_EXCEEDED): Đảm bảo giới hạn tối đa 5 lớp đang hoạt động cho mỗi giáo viên'
    );

    // ----------------------------------------------------------------
    // 6. KIỂM THỬ GHI DANH HỌC SINH THỨ 50/51, CHỐNG TRÙNG & ĐỒNG THỜI
    // ----------------------------------------------------------------
    console.log('\n[6] Kiểm thử ghi danh học sinh thứ 50/51, chống trùng và yêu cầu đồng thời:');
    // Ghi danh học sinh đầu tiên vào 12A1
    const s1 = await apiRequest(
      '/api/accounts/student',
      'POST',
      {
        username: '12A1-HS01',
        fullName: 'Học sinh 01',
        className: '12A1',
        email: 'hs01.12a1@gmail.com'
      },
      teacher1Token
    );
    assertCondition(
      s1.status === 200 && s1.data.account?.username === '12A1-HS01',
      'Ghi danh học sinh 12A1-HS01 vào lớp 12A1 thành công'
    );
    const student1Uid = s1.data.account.id as string;
    const student1ActivationCode = s1.data.account.activationCode as string;

    // Kiểm thử chống ghi danh trùng mã học sinh hoặc trùng email
    const dupCode = await apiRequest(
      '/api/accounts/student',
      'POST',
      {
        username: '12A1-HS01',
        fullName: 'Học sinh Trùng Mã',
        className: '12A1'
      },
      teacher1Token
    );
    assertCondition(
      dupCode.status === 409,
      'Chống ghi danh trùng mã học sinh (409 Conflict)'
    );

    const dupEmail = await apiRequest(
      '/api/accounts/student',
      'POST',
      {
        username: '12A1-HS99',
        fullName: 'Học sinh Trùng Email',
        className: '12A1',
        email: 'hs01.12a1@gmail.com'
      },
      teacher1Token
    );
    assertCondition(
      dupEmail.status === 409,
      'Chống ghi danh trùng email học sinh trong cùng lớp (409 Conflict)'
    );

    // Ghi danh tiếp 47 học sinh (từ HS02 đến HS48 -> tổng 48 học sinh)
    const batch47 = Array.from({ length: 47 }, (_, idx) => {
      const num = String(idx + 2).padStart(2, '0');
      return {
        username: `12A1-HS${num}`,
        fullName: `Học sinh ${num}`,
        className: '12A1'
      };
    });
    const batchRes = await apiRequest(
      '/api/accounts/batch',
      'POST',
      { rows: batch47 },
      teacher1Token
    );
    assertCondition(
      batchRes.status === 200 && batchRes.data.addedCount === 47,
      'Nhập hàng loạt 47 học sinh tiếp theo (Tổng sĩ số hiện tại: 48/50 học sinh)'
    );

    // Kiểm thử yêu cầu đồng thời (5 request cùng lúc khi lớp chỉ còn 2 chỗ trống: chỗ thứ 49 và 50)
    const concurrentPromises = Array.from({ length: 5 }, (_, idx) => {
      const num = 49 + idx; // 49, 50, 51, 52, 53
      return apiRequest(
        '/api/accounts/student',
        'POST',
        {
          username: `12A1-HS${num}`,
          fullName: `Học sinh Đồng thời ${num}`,
          className: '12A1'
        },
        teacher1Token
      );
    });
    const concurrentResults = await Promise.all(concurrentPromises);
    const succeededConcurrent = concurrentResults.filter((r) => r.status === 200).length;
    const rejectedConcurrent = concurrentResults.filter((r) => r.status === 403).length;

    assertCondition(
      succeededConcurrent === 2 && rejectedConcurrent === 3,
      `Xử lý đồng thời (Mutex Lock): Đúng 2 học sinh (thứ 49 & 50) được ghi danh, chặn đúng 3 yêu cầu vượt ngưỡng (thứ 51, 52, 53)`
    );

    // Kiểm thử ghi danh học sinh thứ 51 đơn lẻ -> Bị từ chối 403 MAX_STUDENTS_QUOTA_EXCEEDED
    const student51 = await apiRequest(
      '/api/accounts/student',
      'POST',
      {
        username: '12A1-HS51-EXTRA',
        fullName: 'Học sinh Thứ 51',
        className: '12A1'
      },
      teacher1Token
    );
    assertCondition(
      student51.status === 403 &&
        student51.data?.code === 'MAX_STUDENTS_QUOTA_EXCEEDED',
      'Chặn ghi danh học sinh thứ 51 (403 MAX_STUDENTS_QUOTA_EXCEEDED): Lớp 12A1 giữ đúng trần 50/50 học sinh'
    );

    // Kiểm tra thông tin lớp trả về đúng enrolledCount = 50, remainingSeats = 0
    const classesCheck = await apiRequest('/api/classes', 'GET', undefined, teacher1Token);
    const class12A1 = classesCheck.data.classes.find((c: any) => c.name === '12A1');
    assertCondition(
      class12A1?.enrolledCount === 50 && class12A1?.remainingSeats === 0,
      'Sĩ số lớp 12A1 trên máy chủ được đồng bộ chính xác là 50/50 (remainingSeats = 0)'
    );

    // ----------------------------------------------------------------
    // 7. KIỂM THỬ PHÂN QUYỀN GIỮA CÁC GIÁO VIÊN & HỌC SINH (RBAC ISOLATION)
    // ----------------------------------------------------------------
    console.log('\n[7] Kiểm thử phân quyền cô lập dữ liệu giữa Giáo viên 1, Giáo viên 3 và Học sinh:');
    // Giáo viên 3 tạo lớp 12B1 và học sinh 12B1-HS01
    await apiRequest(
      '/api/classes',
      'POST',
      { name: '12B1' },
      teacher3Token
    );
    const sT3 = await apiRequest(
      '/api/accounts/student',
      'POST',
      {
        username: '12B1-HS01',
        fullName: 'Học sinh Lớp Cô Hà',
        className: '12B1'
      },
      teacher3Token
    );
    const studentT3Uid = sT3.data.account.id as string;

    // Giáo viên 1 lấy danh sách học sinh -> Chỉ thấy tài khoản của mình + 50 học sinh của mình, KHÔNG thấy học sinh của Giáo viên 3
    const t1Accounts = await apiRequest('/api/accounts', 'GET', undefined, teacher1Token);
    const t1Students = t1Accounts.data.accounts.filter((a: any) => a.role === 'student');
    const t1SeesT3Student = t1Students.some((a: any) => a.id === studentT3Uid);
    assertCondition(
      t1Accounts.status === 200 &&
        t1Students.length === 50 &&
        !t1SeesT3Student,
      'Giáo viên 1 chỉ xem được đúng 50 học sinh thuộc lớp mình quản lí, không nhìn thấy học sinh của Giáo viên 3'
    );

    // Giáo viên 1 cố tình khóa tài khoản học sinh của Giáo viên 3 -> Bị chặn 403
    const crossLockAttempt = await apiRequest(
      '/api/accounts/toggle-lock',
      'POST',
      { studentId: studentT3Uid },
      teacher1Token
    );
    assertCondition(
      crossLockAttempt.status === 403,
      'Chặn Giáo viên 1 (403) khi cố tình khóa/sửa học sinh thuộc lớp của Giáo viên 3'
    );

    // Giáo viên 1 cố tình đọc hồ sơ học tập của học sinh Giáo viên 3 -> Bị chặn 403
    const crossStateRead = await apiRequest(
      `/api/student-state/${studentT3Uid}`,
      'GET',
      undefined,
      teacher1Token
    );
    assertCondition(
      crossStateRead.status === 403,
      'Chặn Giáo viên 1 (403) khi cố tình truy cập bài làm của học sinh thuộc Giáo viên 3'
    );

    // Học sinh 12A1-HS01 kích hoạt mã 1 lần và đăng nhập
    const activateS1 = await apiRequest('/api/auth/activate', 'POST', {
      username: '12A1-HS01',
      activationCode: student1ActivationCode,
      newPassword: 'Student1Password123!'
    });
    assertCondition(
      activateS1.status === 200 && Boolean(activateS1.data.sessionToken),
      'Học sinh 12A1-HS01 kích hoạt tài khoản bằng mã 1 lần thành công'
    );
    const student1Token = activateS1.data.sessionToken as string;

    // Học sinh 12A1-HS01 truy cập dữ liệu của chính mình -> 200 OK
    const ownStateRes = await apiRequest(
      `/api/student-state/${student1Uid}`,
      'GET',
      undefined,
      student1Token
    );
    assertCondition(
      ownStateRes.status === 200,
      'Học sinh xem được dữ liệu học tập của chính mình (200)'
    );

    // Học sinh 12A1-HS01 cố tình xem dữ liệu của học sinh khác hoặc trang Quản trị viên -> Bị chặn 403
    const otherStudentState = await apiRequest(
      `/api/student-state/${studentT3Uid}`,
      'GET',
      undefined,
      student1Token
    );
    const studentAccessAdmin = await apiRequest(
      '/api/admin/overview',
      'GET',
      undefined,
      student1Token
    );
    assertCondition(
      otherStudentState.status === 403 && studentAccessAdmin.status === 403,
      'Chặn Học sinh (403) khi cố tình xem hồ sơ học sinh khác hoặc truy cập API Quản trị viên'
    );

    // Quản trị viên xem tổng quan -> Thấy chính xác Giáo viên 1 (5 lớp, 50 HS) và Giáo viên 3 (1 lớp, 1 HS)
    const adminOverviewFinal = await apiRequest('/api/admin/overview', 'GET', undefined, adminToken);
    const t1Summary = adminOverviewFinal.data.registrations.find(
      (r: any) => r.gmail === 'minhchau.gv@gmail.com'
    );
    const t3Summary = adminOverviewFinal.data.registrations.find(
      (r: any) => r.gmail === 'thuha.gv@gmail.com'
    );
    assertCondition(
      t1Summary?.activeClassesCount === 5 &&
        t1Summary?.totalEnrolledStudentsCount === 50 &&
        t3Summary?.activeClassesCount === 1 &&
        t3Summary?.totalEnrolledStudentsCount === 1,
      'Quản trị viên xem được chính xác số lớp và sĩ số của từng giáo viên (GV1: 5/5 lớp, 50 HS; GV3: 1/5 lớp, 1 HS)'
    );

    console.log('\n================================================================');
    console.log('🎉 TẤT CẢ CÁC BÀI KIỂM THỬ HỆ THỐNG ĐỀU VƯỢT QUA (100% PASS)!');
    console.log('================================================================');
  } finally {
    // Restore original DB state so no test data pollutes the real database
    for (const file of DB_FILES) {
      const fullPath = path.join(DATA_DIR, file);
      const original = backups[file];
      if (original !== null && original !== undefined) {
        fs.writeFileSync(fullPath, original, 'utf-8');
      } else if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }
  }
}

runTests().catch((err) => {
  console.error('❌ KIỂM THỬ THẤT BẠI:', err);
  process.exit(1);
});
