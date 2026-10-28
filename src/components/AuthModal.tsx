import React, { useState, useEffect, useRef } from 'react';
import { RecaptchaVerifier } from 'firebase/auth';
import {
  UserAccount,
  TeacherRegistrationRecord,
  TeacherVerificationMethod
} from '../types';
import {
  authenticateWithCredentials,
  activateStudentAccount,
  matchAccountByGoogleEmail,
  changeUserPassword,
  checkTeacherBootstrapStatus,
  triggerServerAdminClaimBootstrap,
  ServerFirebaseAdminStatus,
  AuthErrorCategory,
  submitTeacherRegistration,
  sendTeacherGmailOtp,
  verifyTeacherGmailOtp,
  verifyTeacherPhoneOtp,
  fetchTeacherRegistrationStatus,
  checkTeacherEmailConfigOnServer
} from '../services/accountService';
import {
  auth,
  googleSignIn,
  getCurrentFirebaseIdToken,
  isFirebaseCloudConnected,
  ensurePhoneRecaptchaVerifier,
  cleanupPhoneRecaptchaVerifier,
  requestFirebasePhoneOtp,
  confirmFirebasePhoneOtpCode
} from '../services/firebaseAuth';
import {
  X,
  Lock,
  User,
  KeyRound,
  ShieldCheck,
  AlertCircle,
  CheckCircle,
  Sparkles,
  LogIn,
  Eye,
  EyeOff,
  GraduationCap,
  Cloud,
  Server,
  Phone,
  Mail,
  Clock,
  Copy,
  RefreshCw
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  currentUser: UserAccount | null;
  onClose: () => void;
  onLoginSuccess: (user: UserAccount) => void;
  onLogout: () => void;
  initialTab?: 'login' | 'activate' | 'teacher_register' | 'change_password';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  currentUser,
  onClose,
  onLoginSuccess,
  onLogout,
  initialTab = 'login'
}) => {
  const [activeTab, setActiveTab] = useState<
    'login' | 'activate' | 'teacher_register' | 'change_password'
  >(currentUser ? 'change_password' : initialTab);
  const [serverAdminStatus, setServerAdminStatus] = useState<ServerFirebaseAdminStatus | null>(
    null
  );
  const [statusCheckState, setStatusCheckState] = useState<'loading' | 'ready' | 'endpoint_error'>(
    'loading'
  );
  const [statusEndpointError, setStatusEndpointError] = useState<string | null>(null);
  const [detectedFirebaseUid, setDetectedFirebaseUid] = useState<string | null>(
    auth.currentUser?.uid || null
  );
  const [detectedFirebaseEmail, setDetectedFirebaseEmail] = useState<string | null>(
    auth.currentUser?.email || null
  );
  const [copiedUid, setCopiedUid] = useState(false);

  // Form đăng nhập
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Form kích hoạt tài khoản học sinh
  const [activateUsername, setActivateUsername] = useState('');
  const [activateCode, setActivateCode] = useState('');
  const [activatePassword, setActivatePassword] = useState('');
  const [activateConfirmPassword, setActivateConfirmPassword] = useState('');
  const [showActivatePassword, setShowActivatePassword] = useState(false);

  // Form đăng ký Giáo viên & Xác minh OTP (SĐT hoặc Gmail)
  const [teacherUsername, setTeacherUsername] = useState('');
  const [teacherFullName, setTeacherFullName] = useState('');
  const [teacherPhone, setTeacherPhone] = useState('');
  const [teacherGmail, setTeacherGmail] = useState('');
  const [teacherPassword, setTeacherPassword] = useState('');
  const [verificationMethod, setVerificationMethod] =
    useState<TeacherVerificationMethod>('phone_otp');
  const [activeRegistration, setActiveRegistration] =
    useState<TeacherRegistrationRecord | null>(null);
  const [otpInputCode, setOtpInputCode] = useState('');
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [gmailOtpSent, setGmailOtpSent] = useState(false);
  const [lookupIdentifier, setLookupIdentifier] = useState('');
  const [emailProviderStatus, setEmailProviderStatus] = useState<{
    configured: boolean;
    providerName: string;
    missingEnvVars: string[];
  } | null>(null);

  // Quản lý vòng đời RecaptchaVerifier bằng ref (không tạo lại khi component render hay bấm nút)
  const recaptchaContainerRef = useRef<HTMLDivElement | null>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);
  const recaptchaWidgetIdRef = useRef<number | null>(null);
  const isOtpSubmittingRef = useRef<boolean>(false);

  // Form đổi mật khẩu
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // Trạng thái xử lý
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCategory, setErrorCategory] = useState<AuthErrorCategory | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const refreshServerConfigStatus = async () => {
    setStatusCheckState('loading');
    setStatusEndpointError(null);
    const status = await checkTeacherBootstrapStatus();
    if (status.emailProviderStatus) {
      setEmailProviderStatus(status.emailProviderStatus);
    }
    if (status.endpointReachable && status.firebaseAdminStatus) {
      setServerAdminStatus(status.firebaseAdminStatus);
      setStatusCheckState('ready');
    } else {
      setServerAdminStatus(null);
      setStatusCheckState('endpoint_error');
      setStatusEndpointError(
        status.endpointError ||
          `Không nhận được phản hồi JSON hợp lệ từ /api/auth/bootstrap-status (HTTP ${status.httpStatus}).`
      );
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    if (auth.currentUser) {
      setDetectedFirebaseUid(auth.currentUser.uid);
      setDetectedFirebaseEmail(auth.currentUser.email);
    }
    refreshServerConfigStatus();
  }, [isOpen]);

  // Chỉ khởi tạo RecaptchaVerifier một lần sau khi phần tử reCAPTCHA đã có trên trang,
  // và dọn dẹp đúng cách khi đóng form, đổi tab hoặc chuyển sang phương thức Gmail OTP.
  const isPhoneOtpViewActive = Boolean(
    isOpen &&
      !currentUser &&
      activeTab === 'teacher_register' &&
      activeRegistration &&
      !activeRegistration.isOwnershipVerified &&
      verificationMethod === 'phone_otp'
  );

  useEffect(() => {
    let cancelled = false;
    const mountedContainerEl = recaptchaContainerRef.current;

    if (!isPhoneOtpViewActive) {
      cleanupPhoneRecaptchaVerifier(
        mountedContainerEl,
        recaptchaVerifierRef,
        recaptchaWidgetIdRef
      );
      return;
    }

    const timer = window.setTimeout(() => {
      const targetEl = recaptchaContainerRef.current;
      if (cancelled || !targetEl || !document.body.contains(targetEl)) return;
      ensurePhoneRecaptchaVerifier(
        targetEl,
        recaptchaVerifierRef,
        recaptchaWidgetIdRef
      ).catch(() => {});
    }, 30);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      cleanupPhoneRecaptchaVerifier(
        recaptchaContainerRef.current || mountedContainerEl,
        recaptchaVerifierRef,
        recaptchaWidgetIdRef
      );
    };
  }, [isPhoneOtpViewActive, activeRegistration?.id]);

  if (!isOpen) return null;

  // Xử lý đăng nhập bằng mã tài khoản + mật khẩu
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!loginUsername.trim() || !loginPassword) {
      setErrorMessage('Vui lòng nhập đầy đủ Mã tài khoản (hoặc Gmail) và Mật khẩu.');
      return;
    }

    setIsLoading(true);
    try {
      const result = await authenticateWithCredentials(loginUsername, loginPassword);
      if (result.success && result.user) {
        setSuccessMessage(`Đăng nhập thành công! Chào mừng ${result.user.fullName}.`);
        setTimeout(() => {
          onLoginSuccess(result.user!);
          onClose();
        }, 500);
      } else {
        setErrorMessage(result.message || 'Đăng nhập không thành công.');
        // Nếu giáo viên chưa xác minh OTP, hỗ trợ mở lại hồ sơ xác minh
        if (result.code === 'TEACHER_PENDING_VERIFICATION' && result.registrationId) {
          const statusRes = await fetchTeacherRegistrationStatus(result.registrationId);
          if (statusRes.found && statusRes.registration) {
            setActiveRegistration(statusRes.registration);
            setVerificationMethod(statusRes.registration.verificationMethod);
            setActiveTab('teacher_register');
          }
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Đã có lỗi xảy ra khi xác thực.');
    } finally {
      setIsLoading(false);
    }
  };

  // Xử lý kích hoạt tài khoản học sinh lần đầu bằng mã dùng 1 lần
  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!activateUsername.trim() || !activateCode.trim() || !activatePassword) {
      setErrorMessage('Vui lòng điền đầy đủ Mã học sinh, Mã kích hoạt 6 số và Mật khẩu mới.');
      return;
    }

    if (activatePassword.length < 6) {
      setErrorMessage('Mật khẩu mới phải có tối thiểu 6 ký tự để bảo đảm an toàn.');
      return;
    }

    if (activatePassword !== activateConfirmPassword) {
      setErrorMessage('Mật khẩu xác nhận không khớp với mật khẩu mới.');
      return;
    }

    setIsLoading(true);
    try {
      const result = await activateStudentAccount(
        activateUsername,
        activateCode,
        activatePassword
      );
      if (result.success && result.user) {
        setSuccessMessage('Kích hoạt tài khoản thành công! Đang chuyển vào ứng dụng...');
        setTimeout(() => {
          onLoginSuccess(result.user!);
          onClose();
        }, 700);
      } else {
        setErrorMessage(result.message || 'Kích hoạt không thành công.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi xử lý kích hoạt tài khoản.');
    } finally {
      setIsLoading(false);
    }
  };

  // Gửi yêu cầu đăng ký tham gia Giáo viên
  const handleTeacherRegistrationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!teacherFullName.trim() || !teacherPhone.trim() || !teacherGmail.trim() || !teacherPassword) {
      setErrorMessage('Vui lòng nhập đầy đủ Họ tên, Số điện thoại, Gmail và Mật khẩu.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await submitTeacherRegistration({
        username: teacherUsername.trim() || undefined,
        fullName: teacherFullName.trim(),
        phone: teacherPhone.trim(),
        gmail: teacherGmail.trim(),
        password: teacherPassword,
        verificationMethod
      });
      if (res. emailProviderStatus) {
        setEmailProviderStatus(res.emailProviderStatus);
      }
      if (res.success && res.registration) {
        setActiveRegistration(res.registration);
        setPhoneOtpSent(false);
        setGmailOtpSent(false);
        setOtpInputCode('');
        setSuccessMessage(res.message);
      } else {
        setErrorMessage(res.message);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi gửi yêu cầu đăng ký giáo viên.');
    } finally {
      setIsLoading(false);
    }
  };

  // Gửi mã OTP qua Firebase Phone Authentication (tái sử dụng verifier quản lý bằng ref)
  const handleSendPhoneOtp = async () => {
    if (!activeRegistration || isLoading || isOtpSubmittingRef.current) return;
    isOtpSubmittingRef.current = true;
    setErrorMessage(null);
    setErrorCategory(null);
    setSuccessMessage(null);
    setIsLoading(true);
    try {
      const res = await requestFirebasePhoneOtp(activeRegistration.phone, {
        containerEl: recaptchaContainerRef.current,
        verifierRef: recaptchaVerifierRef,
        widgetIdRef: recaptchaWidgetIdRef
      });
      if (res.sent) {
        setPhoneOtpSent(true);
        setSuccessMessage(
          `Đã gửi mã SMS OTP 6 chữ số qua Firebase Phone Auth đến số ${res.e164Phone}.`
        );
      } else {
        setPhoneOtpSent(false);
        setErrorMessage(res.error || 'Không thể gửi mã SMS OTP qua Firebase Phone Authentication.');
      }
    } catch (err: any) {
      setPhoneOtpSent(false);
      setErrorMessage(err.message || 'Lỗi gửi SMS OTP qua Firebase Phone Authentication.');
    } finally {
      isOtpSubmittingRef.current = false;
      setIsLoading(false);
    }
  };

  // Xác nhận mã SMS OTP và gửi token xác thực lên máy chủ
  const handleConfirmPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRegistration || isLoading || isOtpSubmittingRef.current) return;
    isOtpSubmittingRef.current = true;
    setErrorMessage(null);
    setErrorCategory(null);
    setSuccessMessage(null);
    setIsLoading(true);
    try {
      const confirmRes = await confirmFirebasePhoneOtpCode(otpInputCode);
      if (!confirmRes.verified || !confirmRes.idToken) {
        setErrorMessage(confirmRes.error || 'Mã OTP không hợp lệ.');
        return;
      }
      const serverRes = await verifyTeacherPhoneOtp(
        activeRegistration.id,
        confirmRes.idToken,
        activeRegistration.registrationStateToken
      );
      if (serverRes.success && serverRes.registration) {
        setActiveRegistration(serverRes.registration);
        setOtpInputCode('');
        setSuccessMessage(serverRes.message);
      } else {
        setErrorMessage(serverRes.message);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi xác minh OTP số điện thoại.');
    } finally {
      isOtpSubmittingRef.current = false;
      setIsLoading(false);
    }
  };

  // Gửi mã xác minh đến Gmail qua dịch vụ SMTP/Email phía máy chủ
  const handleSendGmailOtp = async () => {
    if (!activeRegistration || isLoading || isOtpSubmittingRef.current) return;
    isOtpSubmittingRef.current = true;
    setErrorMessage(null);
    setErrorCategory(null);
    setSuccessMessage(null);
    setIsLoading(true);
    try {
      const res = await sendTeacherGmailOtp(
        activeRegistration.id,
        activeRegistration.registrationStateToken
      );
      if (res.success) {
        setGmailOtpSent(true);
        if (res.providerName) {
          setEmailProviderStatus({
            configured: true,
            providerName: res.providerName,
            missingEnvVars: []
          });
        }
        setSuccessMessage(res.message);
      } else {
        setGmailOtpSent(false);
        if (res.providerConfigured === false && Array.isArray(res.missingEnvVars)) {
          setEmailProviderStatus({
            configured: false,
            providerName: res.providerName || 'Chưa cấu hình dịch vụ gửi mail phía máy chủ',
            missingEnvVars: res.missingEnvVars
          });
        }
        setErrorMessage(res.message);
      }
    } catch (err: any) {
      setGmailOtpSent(false);
      setErrorMessage(err.message || 'Lỗi kết nối dịch vụ gửi mã Gmail.');
    } finally {
      isOtpSubmittingRef.current = false;
      setIsLoading(false);
    }
  };

  // Xác minh mã Gmail 6 số trên máy chủ
  const handleConfirmGmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRegistration || isLoading || isOtpSubmittingRef.current) return;
    isOtpSubmittingRef.current = true;
    setErrorMessage(null);
    setErrorCategory(null);
    setSuccessMessage(null);
    setIsLoading(true);
    try {
      const res = await verifyTeacherGmailOtp(
        activeRegistration.id,
        otpInputCode,
        activeRegistration.registrationStateToken
      );
      if (res.success && res.registration) {
        setActiveRegistration(res.registration);
        setOtpInputCode('');
        setSuccessMessage(res.message);
      } else {
        setErrorMessage(res.message);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi xác minh mã Gmail.');
    } finally {
      isOtpSubmittingRef.current = false;
      setIsLoading(false);
    }
  };

  // Tra cứu trạng thái hồ sơ giáo viên
  const handleLookupRegistration = async () => {
    if (!lookupIdentifier.trim() || isLoading) return;
    setErrorMessage(null);
    setErrorCategory(null);
    setSuccessMessage(null);
    setIsLoading(true);
    try {
      const res = await fetchTeacherRegistrationStatus(lookupIdentifier);
      if (res.emailProviderStatus) {
        setEmailProviderStatus(res.emailProviderStatus);
      }
      if (res.found && res.registration) {
        setActiveRegistration(res.registration);
        setVerificationMethod(res.registration.verificationMethod);
      } else {
        setErrorMessage(res.message || 'Không tìm thấy hồ sơ đăng ký với thông tin này.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi tra cứu hồ sơ.');
    } finally {
      setIsLoading(false);
    }
  };

  // Đăng nhập qua Firebase Google Sign-In (Xác thực bằng Firebase ID Token & Custom Claim admin=true trên máy chủ)
  const handleGoogleLogin = async () => {
    setErrorMessage(null);
    setErrorCategory(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      const res = await googleSignIn();
      if (!res?.user) {
        setErrorCategory('TOKEN_ERROR');
        setErrorMessage('Không nhận diện được phiên đăng nhập từ Google Firebase Authentication.');
        return;
      }

      setDetectedFirebaseUid(res.user.uid);
      setDetectedFirebaseEmail(res.user.email || null);

      // Bắt buộc lấy Firebase ID Token mới nhất (forceRefresh = true) để nhận custom claim admin=true
      const idToken = await res.user.getIdToken(true);
      const matchRes = await matchAccountByGoogleEmail(
        idToken,
        res.user.displayName || undefined
      );

      await refreshServerConfigStatus();

      if (matchRes.matched && matchRes.user) {
        setSuccessMessage(
          `Xác thực Firebase (${res.user.email || res.user.uid}) thành công! Chào mừng ${matchRes.user.fullName}.`
        );
        setTimeout(() => {
          onLoginSuccess(matchRes.user!);
          onClose();
        }, 600);
      } else {
        if (matchRes.firebaseUid) {
          setDetectedFirebaseUid(matchRes.firebaseUid);
        }
        setErrorCategory(matchRes.errorCategory || null);
        setErrorMessage(
          matchRes.message ||
            `Tài khoản Firebase (${res.user.email || res.user.uid}) chưa được cấp quyền trong hệ thống.`
        );
      }
    } catch (err: any) {
      setErrorCategory('TOKEN_ERROR');
      setErrorMessage(err.message || 'Lỗi kết nối dịch vụ Google Sign-In.');
    } finally {
      setIsLoading(false);
    }
  };

  // Làm mới Firebase ID Token (getIdToken(true)) sau khi đã cấp custom claim admin=true trên máy chủ
  const handleRefreshFirebaseAdminToken = async () => {
    setErrorMessage(null);
    setErrorCategory(null);
    setSuccessMessage(null);
    setIsLoading(true);
    try {
      await refreshServerConfigStatus();
      const freshToken = await getCurrentFirebaseIdToken(true);
      if (!freshToken) {
        setErrorCategory('TOKEN_ERROR');
        setErrorMessage('Chưa có phiên Firebase Authentication. Vui lòng bấm "Đăng nhập với Google" trước.');
        return;
      }
      const matchRes = await matchAccountByGoogleEmail(
        freshToken,
        auth.currentUser?.displayName || undefined
      );
      if (matchRes.matched && matchRes.user) {
        setSuccessMessage(
          `Đã nhận custom claim & xác thực thành công với vai trò ${
            matchRes.user.role === 'admin' ? 'Quản trị viên' : matchRes.user.role
          }!`
        );
        setTimeout(() => {
          onLoginSuccess(matchRes.user!);
          onClose();
        }, 500);
      } else {
        setErrorCategory(matchRes.errorCategory || null);
        setErrorMessage(
          matchRes.message ||
            'Không thể xác thực quyền Quản trị viên với ID Token hiện tại.'
        );
      }
    } catch (err: any) {
      setErrorCategory('TOKEN_ERROR');
      setErrorMessage(err.message || 'Lỗi khi làm mới Firebase ID Token.');
    } finally {
      setIsLoading(false);
    }
  };

  // Kích hoạt quy trình cấp custom claim admin=true trên máy chủ (chỉ hoạt động nếu UID khớp FIRST_ADMIN_UID)
  const handleTriggerServerAdminBootstrap = async () => {
    setErrorMessage(null);
    setErrorCategory(null);
    setSuccessMessage(null);
    setIsLoading(true);
    try {
      const idToken = await getCurrentFirebaseIdToken(true);
      if (!idToken) {
        setErrorCategory('TOKEN_ERROR');
        setErrorMessage('Vui lòng đăng nhập bằng Google (Firebase Auth) trước khi thực hiện.');
        return;
      }
      const bootRes = await triggerServerAdminClaimBootstrap(idToken);
      await refreshServerConfigStatus();
      if (!bootRes.success) {
        setErrorCategory(bootRes.errorCategory || null);
        setErrorMessage(bootRes.message);
        return;
      }
      // Ngay sau khi máy chủ cấp custom claim admin=true, gọi getIdToken(true) để nhận token mới
      const refreshedToken = await getCurrentFirebaseIdToken(true);
      if (refreshedToken) {
        const matchRes = await matchAccountByGoogleEmail(
          refreshedToken,
          auth.currentUser?.displayName || undefined
        );
        if (matchRes.matched && matchRes.user) {
          setSuccessMessage(
            'Đã cấp custom claim admin=true qua Firebase Admin SDK và đăng nhập Quản trị viên thành công!'
          );
          setTimeout(() => {
            onLoginSuccess(matchRes.user!);
            onClose();
          }, 600);
          return;
        }
      }
      setSuccessMessage(bootRes.message);
    } catch (err: any) {
      setErrorCategory('ENDPOINT_ERROR');
      setErrorMessage(err.message || 'Lỗi khi gọi quy trình Firebase Admin SDK trên máy chủ.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyUid = () => {
    if (!detectedFirebaseUid) return;
    navigator.clipboard?.writeText(detectedFirebaseUid).catch(() => {});
    setCopiedUid(true);
    setTimeout(() => setCopiedUid(false), 2000);
  };

  // Đổi mật khẩu
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!oldPassword || !newPassword) {
      setErrorMessage('Vui lòng nhập đầy đủ mật khẩu cũ và mật khẩu mới.');
      return;
    }

    if (newPassword.length < 6) {
      setErrorMessage('Mật khẩu mới phải có tối thiểu 6 ký tự.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setErrorMessage('Xác nhận mật khẩu mới không trùng khớp.');
      return;
    }

    setIsLoading(true);
    try {
      const result = await changeUserPassword(currentUser.id, oldPassword, newPassword);
      if (result.success) {
        setSuccessMessage('Đổi mật khẩu thành công! Mật khẩu mới đã được mã hóa PBKDF2 trên máy chủ.');
        setOldPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
      } else {
        setErrorMessage(result.message);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi khi đổi mật khẩu.');
    } finally {
      setIsLoading(false);
    }
  };

  const cloudActive = isFirebaseCloudConnected();
  const roleLabel =
    currentUser?.role === 'admin'
      ? 'Quản trị viên'
      : currentUser?.role === 'teacher'
      ? 'Giáo viên'
      : 'Học sinh';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-5 bg-[#0F172A] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-200">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Xác thực Tài khoản VănAI 12</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/30 text-emerald-200 border border-emerald-400/30">
                  3 Vai trò RBAC
                </span>
              </h2>
              <p className="text-xs text-stone-300">
                {currentUser
                  ? `Đang đăng nhập: ${currentUser.fullName} (${roleLabel})`
                  : 'Đăng nhập, Kích hoạt mã học sinh hoặc Đăng ký Giáo viên (Xác minh OTP)'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-white rounded-lg hover:bg-stone-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-stone-200 bg-stone-50 px-4 pt-2 gap-2 text-xs font-semibold overflow-x-auto">
          {!currentUser ? (
            <>
              <button
                onClick={() => {
                  setActiveTab('login');
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className={`pb-2.5 px-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'login'
                    ? 'border-blue-700 text-blue-900 font-bold'
                    : 'border-transparent text-stone-500 hover:text-stone-800'
                }`}
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Đăng nhập</span>
              </button>
              <button
                onClick={() => {
                  setActiveTab('activate');
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className={`pb-2.5 px-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'activate'
                    ? 'border-emerald-600 text-emerald-900 font-bold'
                    : 'border-transparent text-stone-500 hover:text-stone-800'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                <span>Kích hoạt HS</span>
              </button>
              <button
                onClick={() => {
                  setActiveTab('teacher_register');
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className={`pb-2.5 px-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'teacher_register'
                    ? 'border-blue-700 text-blue-900 font-bold'
                    : 'border-transparent text-stone-500 hover:text-stone-800'
                }`}
              >
                <GraduationCap className="w-3.5 h-3.5 text-blue-700" />
                <span>Đăng ký Giáo viên (OTP)</span>
              </button>
            </>
          ) : (
            <button
              onClick={() => setActiveTab('change_password')}
              className="pb-2.5 px-3 border-b-2 border-blue-700 text-blue-900 font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5 text-blue-600" />
              <span>Quản lý & Đổi mật khẩu</span>
            </button>
          )}
        </div>

        {/* Thông báo lỗi / thành công */}
        {errorMessage && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed space-y-1">
              {errorCategory && (
                <div>
                  <span className="inline-block px-2 py-0.5 rounded-md bg-rose-200/80 text-rose-950 font-bold text-[10px]">
                    {errorCategory === 'ENDPOINT_ERROR'
                      ? 'LỖI ENDPOINT API MÁY CHỦ'
                      : errorCategory === 'CONFIG_ERROR'
                      ? 'LỖI CẤU HÌNH MÁY CHỦ'
                      : errorCategory === 'TOKEN_ERROR'
                      ? 'LỖI FIREBASE ID TOKEN'
                      : 'LỖI QUYỀN QUẢN TRỊ / PHÂN QUYỀN'}
                  </span>
                </div>
              )}
              <div>{errorMessage}</div>
            </div>
          </div>
        )}

        {successMessage && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium leading-relaxed">{successMessage}</div>
          </div>
        )}

        {/* Body content */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* TAB 1: ĐĂNG NHẬP */}
          {activeTab === 'login' && !currentUser && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isLoading}
                className="w-full py-2.5 px-4 bg-white border-2 border-blue-600 hover:bg-blue-50/60 rounded-xl text-xs font-bold text-blue-950 transition-colors flex items-center justify-center gap-2.5 cursor-pointer shadow-2xs disabled:opacity-50"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Đăng nhập với Google (Firebase Auth & Xác thực Claim Admin)</span>
              </button>

              {/* Hộp hiển thị UID Firebase Auth & trạng thái khởi tạo Quản trị viên phía máy chủ */}
              {detectedFirebaseUid && (
                <div className="p-3.5 rounded-xl bg-purple-50/90 border border-purple-200 text-xs text-purple-950 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-purple-700 shrink-0" />
                      <span>Thông tin UID Firebase Authentication của bạn</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyUid}
                      className="px-2 py-1 rounded-md bg-white hover:bg-purple-100 border border-purple-300 text-[11px] font-bold text-purple-900 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>{copiedUid ? 'Đã sao chép UID!' : 'Sao chép UID'}</span>
                    </button>
                  </div>

                  <div className="p-2 rounded-lg bg-white border border-purple-200 font-mono text-[11px] break-all select-all text-stone-900">
                    UID: <strong>{detectedFirebaseUid}</strong>
                    {detectedFirebaseEmail ? ` (${detectedFirebaseEmail})` : ''}
                  </div>

                  {statusCheckState === 'loading' && (
                    <div className="text-[11px] text-purple-800 italic">
                      Đang kiểm tra trạng thái cấu hình từ API máy chủ (/api/auth/bootstrap-status)...
                    </div>
                  )}

                  {statusCheckState === 'endpoint_error' && (
                    <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-[11px] text-amber-950 space-y-1">
                      <div className="font-bold">
                        Không kết nối được API kiểm tra cấu hình máy chủ (Không phải lỗi thiếu biến .env):
                      </div>
                      <div>{statusEndpointError}</div>
                    </div>
                  )}

                  {statusCheckState === 'ready' && serverAdminStatus && (
                    <div className="text-[11px] text-purple-900 space-y-1 leading-relaxed">
                      <div>
                        • Trạng thái <code>FIRST_ADMIN_UID</code> trên máy chủ:{' '}
                        <strong>
                          {serverAdminStatus.firstAdminUidConfigured
                            ? `Đã cấu hình trên máy chủ (${serverAdminStatus.firstAdminUidMasked})`
                            : 'Chưa nhận được biến FIRST_ADMIN_UID trên máy chủ'}
                        </strong>
                      </div>
                      <div>
                        • Khóa dịch vụ Firebase Admin SDK:{' '}
                        <strong>
                          {serverAdminStatus.serviceAccountConfigured
                            ? `Đã kết nối (${serverAdminStatus.credentialSource})`
                            : serverAdminStatus.initializationError
                            ? `Lỗi định dạng JSON (${serverAdminStatus.initializationError})`
                            : 'Chưa nhận được biến FIREBASE_SERVICE_ACCOUNT_JSON trên máy chủ'}
                        </strong>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleRefreshFirebaseAdminToken}
                      disabled={isLoading}
                      className="flex-1 py-2 px-3 rounded-lg bg-purple-700 hover:bg-purple-800 text-white text-[11px] font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Làm mới Token & Kiểm tra Quyền Admin</span>
                    </button>
                    {serverAdminStatus?.firstAdminUidConfigured &&
                      serverAdminStatus?.serviceAccountConfigured && (
                        <button
                          type="button"
                          onClick={handleTriggerServerAdminBootstrap}
                          disabled={isLoading}
                          className="py-2 px-3 rounded-lg bg-[#0F172A] hover:bg-stone-800 text-white text-[11px] font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Cấp Claim Admin=true (Nếu khớp UID)</span>
                        </button>
                      )}
                  </div>
                </div>
              )}

              <div className="relative my-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-stone-200"></div>
                </div>
                <div className="relative flex justify-center text-[10px] uppercase">
                  <span className="bg-white px-2 text-stone-400 font-semibold">
                    Hoặc đăng nhập Giáo viên / Học sinh bằng Mã tài khoản
                  </span>
                </div>
              </div>

              <form onSubmit={handleLogin} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    Mã tài khoản hoặc địa chỉ Gmail
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      value={loginUsername}
                      onChange={(e) => setLoginUsername(e.target.value)}
                      placeholder="VD: 12A1-01, GV-NGUVAN hoặc gmail..."
                      className="w-full pl-9 pr-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-stone-700">Mật khẩu</label>
                    <button
                      type="button"
                      onClick={() => setActiveTab('activate')}
                      className="text-[11px] text-blue-700 hover:underline cursor-pointer"
                    >
                      Học sinh nhận mã kích hoạt 1 lần?
                    </button>
                  </div>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                    <input
                      type={showLoginPassword ? 'text' : 'password'}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Nhập mật khẩu của bạn"
                      className="w-full pl-9 pr-9 py-2 text-xs bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                      className="absolute right-3 top-2.5 text-stone-400 hover:text-stone-600 cursor-pointer"
                    >
                      {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 px-4 bg-[#0F172A] hover:bg-stone-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs disabled:opacity-50"
                >
                  {isLoading ? 'Đang xác thực trên máy chủ...' : 'Đăng nhập Hệ thống'}
                </button>
              </form>
            </div>
          )}

          {/* TAB 2: KÍCH HOẠT TÀI KHOẢN HỌC SINH */}
          {activeTab === 'activate' && !currentUser && (
            <form onSubmit={handleActivate} className="space-y-4">
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  <span>Kích hoạt tài khoản học sinh mới:</span>
                </div>
                <p className="text-[11px] leading-relaxed text-emerald-800">
                  Nhập Mã học sinh và Mã 6 chữ số dùng một lần do giáo viên cấp trong lớp của bạn.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Mã học sinh được cấp
                </label>
                <input
                  type="text"
                  value={activateUsername}
                  onChange={(e) => setActivateUsername(e.target.value)}
                  placeholder="Nhập mã học sinh do giáo viên cấp"
                  className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-600 uppercase font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Mã kích hoạt 6 chữ số (Dùng 1 lần)
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={activateCode}
                  onChange={(e) => setActivateCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="Nhập 6 chữ số"
                  className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-600 font-mono tracking-widest font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Tự đặt mật khẩu mới (Tối thiểu 6 ký tự)
                </label>
                <div className="relative">
                  <input
                    type={showActivatePassword ? 'text' : 'password'}
                    value={activatePassword}
                    onChange={(e) => setActivatePassword(e.target.value)}
                    placeholder="Nhập mật khẩu cá nhân của bạn"
                    className="w-full px-3 py-2 pr-9 text-xs bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowActivatePassword(!showActivatePassword)}
                    className="absolute right-3 top-2.5 text-stone-400 hover:text-stone-600 cursor-pointer"
                  >
                    {showActivatePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Xác nhận lại mật khẩu
                </label>
                <input
                  type="password"
                  value={activateConfirmPassword}
                  onChange={(e) => setActivateConfirmPassword(e.target.value)}
                  placeholder="Nhập lại mật khẩu vừa đặt"
                  className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-600"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs disabled:opacity-50"
              >
                {isLoading ? 'Đang kích hoạt...' : 'Kích hoạt tài khoản & Bắt đầu học'}
              </button>
            </form>
          )}

          {/* TAB 3: ĐĂNG KÝ GIÁO VIÊN & XÁC MINH OTP SĐT / GMAIL */}
          {activeTab === 'teacher_register' && !currentUser && (
            <div className="space-y-4">
              <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 text-xs text-blue-950 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <GraduationCap className="w-4 h-4 text-blue-700" />
                  <span>Quy trình Đăng ký & Xét duyệt Giáo viên (3 bước bảo mật)</span>
                </div>
                <p className="text-[11px] text-blue-900 leading-relaxed">
                  1. Điền Họ tên, Số điện thoại và Gmail → 2. Xác minh quyền sở hữu bằng mã OTP (Số điện thoại hoặc Gmail) → 3. Chuyển sang trạng thái <strong>"Chờ quản trị viên duyệt"</strong>. Chỉ sau khi Quản trị viên duyệt mới được vào khu vực giáo viên.
                </p>
              </div>

              {!activeRegistration ? (
                <>
                  <form onSubmit={handleTeacherRegistrationSubmit} className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1">
                        Họ và tên Giáo viên *
                      </label>
                      <input
                        type="text"
                        required
                        value={teacherFullName}
                        onChange={(e) => setTeacherFullName(e.target.value)}
                        placeholder="VD: Nguyễn Thị Minh Châu"
                        className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-lg"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-stone-700 mb-1">
                          Số điện thoại di động *
                        </label>
                        <input
                          type="tel"
                          required
                          value={teacherPhone}
                          onChange={(e) => setTeacherPhone(e.target.value)}
                          placeholder="0912345678 / +84..."
                          className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-lg font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-stone-700 mb-1">
                          Địa chỉ Gmail *
                        </label>
                        <input
                          type="email"
                          required
                          value={teacherGmail}
                          onChange={(e) => setTeacherGmail(e.target.value)}
                          placeholder="giaovien@gmail.com"
                          className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-lg"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-stone-700 mb-1">
                          Mã tài khoản Giáo viên (Tùy chọn)
                        </label>
                        <input
                          type="text"
                          value={teacherUsername}
                          onChange={(e) => setTeacherUsername(e.target.value)}
                          placeholder="VD: GV-VAN01"
                          className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-lg uppercase font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-stone-700 mb-1">
                          Mật khẩu đăng nhập (&ge; 6 ký tự) *
                        </label>
                        <input
                          type="password"
                          required
                          value={teacherPassword}
                          onChange={(e) => setTeacherPassword(e.target.value)}
                          placeholder="Tối thiểu 6 ký tự"
                          className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-lg"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1.5">
                        Chọn phương thức xác minh quyền sở hữu *
                      </label>
                      <div className="grid grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          onClick={() => setVerificationMethod('phone_otp')}
                          className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer flex items-center gap-2 ${
                            verificationMethod === 'phone_otp'
                              ? 'border-blue-600 bg-blue-50/70 text-blue-950 font-bold'
                              : 'border-stone-200 bg-stone-50 text-stone-600'
                          }`}
                        >
                          <Phone className="w-4 h-4 text-blue-600 shrink-0" />
                          <div>
                            <div>OTP Số điện thoại</div>
                            <div className="text-[10px] font-normal text-stone-500">
                              Firebase Phone Auth
                            </div>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setVerificationMethod('gmail_otp')}
                          className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer flex items-center gap-2 ${
                            verificationMethod === 'gmail_otp'
                              ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950 font-bold'
                              : 'border-stone-200 bg-stone-50 text-stone-600'
                          }`}
                        >
                          <Mail className="w-4 h-4 text-emerald-600 shrink-0" />
                          <div>
                            <div>Mã xác minh Gmail</div>
                            <div className="text-[10px] font-normal text-stone-500">
                              Dịch vụ Mail Máy chủ
                            </div>
                          </div>
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full py-2.5 px-4 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                    >
                      {isLoading
                        ? 'Đang tạo hồ sơ đăng ký...'
                        : 'Gửi yêu cầu & Tiếp tục Xác minh OTP'}
                    </button>
                  </form>

                  {/* Tra cứu hồ sơ đã gửi */}
                  <div className="pt-3 border-t border-stone-200 space-y-2">
                    <div className="text-[11px] font-bold text-stone-600">
                      Đã gửi yêu cầu trước đó? Tra cứu trạng thái duyệt hoặc xác minh tiếp:
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={lookupIdentifier}
                        onChange={(e) => setLookupIdentifier(e.target.value)}
                        placeholder="Nhập Gmail, Số điện thoại hoặc Mã GV..."
                        className="flex-1 px-3 py-1.5 text-xs bg-stone-50 border border-stone-300 rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={handleLookupRegistration}
                        disabled={isLoading}
                        className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-900 text-white text-xs font-bold cursor-pointer"
                      >
                        Tra cứu
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  {/* Thẻ trạng thái hồ sơ hiện tại */}
                  <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-stone-900">
                        {activeRegistration.fullName} ({activeRegistration.username})
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          activeRegistration.approvalStatus === 'approved'
                            ? 'bg-emerald-100 text-emerald-900'
                            : activeRegistration.approvalStatus === 'pending_admin_approval'
                            ? 'bg-amber-100 text-amber-900'
                            : activeRegistration.approvalStatus === 'rejected'
                            ? 'bg-rose-100 text-rose-900'
                            : 'bg-stone-200 text-stone-800'
                        }`}
                      >
                        {activeRegistration.approvalStatus === 'pending_verification'
                          ? 'Chờ xác minh OTP'
                          : activeRegistration.approvalStatus === 'pending_admin_approval'
                          ? 'Chờ quản trị viên duyệt'
                          : activeRegistration.approvalStatus === 'approved'
                          ? 'Đã được Quản trị viên duyệt'
                          : activeRegistration.approvalStatus === 'rejected'
                          ? 'Đã bị từ chối'
                          : 'Đang tạm khóa'}
                      </span>
                    </div>
                    <div className="text-[11px] text-stone-600 space-y-0.5">
                      <div>
                        Số điện thoại: <strong>{activeRegistration.phone}</strong> (
                        {activeRegistration.phoneVerified ? 'Đã xác minh OTP' : 'Chưa xác minh'})
                      </div>
                      <div>
                        Gmail: <strong>{activeRegistration.gmail}</strong> (
                        {activeRegistration.gmailVerified ? 'Đã xác minh mã' : 'Chưa xác minh'})
                      </div>
                    </div>

                    {activeRegistration.rejectionReason && (
                      <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 text-[11px]">
                        <strong>Lí do từ chối:</strong> {activeRegistration.rejectionReason}
                      </div>
                    )}
                  </div>

                  {/* Nếu chưa xác minh quyền sở hữu: hiển thị giao diện xác minh OTP */}
                  {!activeRegistration.isOwnershipVerified ? (
                    <div className="p-4 rounded-xl border border-blue-200 bg-white space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#0F172A]">
                          Bước 2: Chọn phương thức nhận & xác minh mã
                        </span>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            disabled={isLoading}
                            onClick={() => {
                              setVerificationMethod('phone_otp');
                              setErrorMessage(null);
                              setSuccessMessage(null);
                            }}
                            className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer disabled:opacity-50 ${
                              verificationMethod === 'phone_otp'
                                ? 'bg-blue-700 text-white'
                                : 'bg-stone-100 text-stone-600'
                            }`}
                          >
                            OTP Điện thoại
                          </button>
                          <button
                            type="button"
                            disabled={isLoading}
                            onClick={() => {
                              setVerificationMethod('gmail_otp');
                              setErrorMessage(null);
                              setSuccessMessage(null);
                              checkTeacherEmailConfigOnServer()
                                .then((cfg) => {
                                  setEmailProviderStatus({
                                    configured: cfg.ready,
                                    providerName: cfg.providerName,
                                    missingEnvVars: cfg.missingEnvVars || []
                                  });
                                })
                                .catch(() => {});
                            }}
                            className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer disabled:opacity-50 ${
                              verificationMethod === 'gmail_otp'
                                ? 'bg-emerald-700 text-white'
                                : 'bg-stone-100 text-stone-600'
                            }`}
                          >
                            Mã Gmail
                          </button>
                        </div>
                      </div>

                      {verificationMethod === 'phone_otp' ? (
                        <div className="space-y-3">
                          <p className="text-[11px] text-stone-600">
                            Sử dụng <strong>Firebase Phone Authentication</strong> kèm reCAPTCHA chống lạm dụng để gửi mã SMS OTP thật đến số{' '}
                            <strong>{activeRegistration.phone}</strong>.
                          </p>
                          {/* Vùng chứa reCAPTCHA quản lý bằng ref, chỉ gắn khi đang ở chế độ OTP Điện thoại */}
                          <div
                            ref={recaptchaContainerRef}
                            id="firebase-phone-recaptcha-container"
                          />
                          <button
                            type="button"
                            onClick={handleSendPhoneOtp}
                            disabled={isLoading}
                            className="w-full py-2 px-3 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isLoading
                              ? 'Đang gửi yêu cầu tới Firebase Phone Auth...'
                              : phoneOtpSent
                              ? 'Gửi lại mã SMS OTP'
                              : `Gửi mã OTP đến ${activeRegistration.phone}`}
                          </button>

                          {phoneOtpSent && (
                            <form onSubmit={handleConfirmPhoneOtp} className="space-y-2.5 pt-2">
                              <input
                                type="text"
                                maxLength={6}
                                value={otpInputCode}
                                onChange={(e) => setOtpInputCode(e.target.value.replace(/\D/g, ''))}
                                placeholder="Nhập 6 chữ số SMS OTP"
                                className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-300 rounded-lg font-mono tracking-widest font-bold"
                              />
                              <button
                                type="submit"
                                disabled={isLoading || otpInputCode.length !== 6}
                                className="w-full py-2 px-3 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                              >
                                {isLoading ? 'Đang xác minh...' : 'Xác nhận Mã SMS OTP'}
                              </button>
                            </form>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <p className="text-[11px] text-stone-600">
                            Máy chủ sinh mã 6 chữ số bảo mật (lưu băm PBKDF2, không tạo ở trình duyệt) và gửi tới địa chỉ Gmail{' '}
                            <strong>{activeRegistration.gmail}</strong>.
                          </p>
                          {emailProviderStatus && !emailProviderStatus.configured && (
                            <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-950 leading-relaxed">
                              <strong>Lưu ý cấu hình máy chủ:</strong> Dịch vụ gửi email phía máy chủ hiện chưa được cấu hình (
                              <code>{emailProviderStatus.missingEnvVars.join(', ')}</code>). Nếu máy chủ chưa có cấu hình SMTP / Resend, vui lòng sử dụng phương thức <strong>OTP Điện thoại</strong> hoặc cấu hình biến môi trường SMTP trên máy chủ.
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={handleSendGmailOtp}
                            disabled={isLoading}
                            className="w-full py-2 px-3 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isLoading
                              ? 'Đang yêu cầu máy chủ gửi mã...'
                              : gmailOtpSent
                              ? 'Gửi lại mã xác minh Gmail'
                              : `Gửi mã xác minh đến ${activeRegistration.gmail}`}
                          </button>

                          {gmailOtpSent && (
                            <form onSubmit={handleConfirmGmailOtp} className="space-y-2.5 pt-2">
                              <input
                                type="text"
                                maxLength={6}
                                value={otpInputCode}
                                onChange={(e) => setOtpInputCode(e.target.value.replace(/\D/g, ''))}
                                placeholder="Nhập 6 chữ số nhận qua Gmail"
                                className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-300 rounded-lg font-mono tracking-widest font-bold"
                              />
                              <button
                                type="submit"
                                disabled={isLoading || otpInputCode.length !== 6}
                                className="w-full py-2 px-3 rounded-lg bg-[#0F172A] hover:bg-stone-800 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                              >
                                {isLoading ? 'Đang xác minh...' : 'Xác minh Mã Gmail'}
                              </button>
                            </form>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-950 space-y-2">
                      <div className="font-bold flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-amber-700" />
                        <span>
                          Trạng thái: {activeRegistration.approvalStatus === 'approved' ? 'Đã được Quản trị viên phê duyệt!' : 'Chờ quản trị viên duyệt'}
                        </span>
                      </div>
                      <p className="text-[11px] text-amber-900 leading-relaxed">
                        {activeRegistration.approvalStatus === 'approved'
                          ? 'Hồ sơ của bạn đã được Quản trị viên phê duyệt. Hãy chuyển sang tab Đăng nhập để truy cập khu vực Giáo viên.'
                          : 'Bạn đã hoàn tất xác minh quyền sở hữu thành công. Tài khoản của bạn sẽ mở quyền truy cập Khu vực Giáo viên ngay sau khi Quản trị viên phê duyệt.'}
                      </p>
                    </div>
                  )}

                  <div className="flex justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => setActiveRegistration(null)}
                      className="text-xs text-stone-500 hover:text-stone-800 underline cursor-pointer"
                    >
                      Quay lại biểu mẫu đăng ký
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('login')}
                      className="text-xs font-bold text-blue-700 hover:underline cursor-pointer"
                    >
                      Chuyển sang Đăng nhập &rarr;
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Đã xóa hoàn toàn biểu mẫu tự tạo Quản trị viên trên giao diện để bảo đảm an toàn */}

          {/* TAB QUẢN LÝ TÀI KHOẢN ĐANG ĐĂNG NHẬP */}
          {currentUser && (
            <div className="space-y-4">
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-stone-800">{currentUser.fullName}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      currentUser.role === 'admin'
                        ? 'bg-purple-100 text-purple-900'
                        : currentUser.role === 'teacher'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {currentUser.role === 'admin'
                      ? 'Quản trị viên Hệ thống'
                      : currentUser.role === 'teacher'
                      ? 'Giáo viên bộ môn (Đã duyệt)'
                      : `Học sinh lớp ${currentUser.className || '12'}`}
                  </span>
                </div>
                <div className="text-stone-600 space-y-1 text-[11px]">
                  <div>
                    Định danh ổn định (UID):{' '}
                    <code className="font-mono text-[10px] bg-stone-200/70 px-1.5 py-0.5 rounded">
                      {currentUser.id}
                    </code>
                  </div>
                  <div>
                    Mã tài khoản: <strong>{currentUser.username}</strong>
                  </div>
                  <div className="pt-1 border-t border-stone-200/70 flex items-center gap-1.5">
                    {cloudActive ? (
                      <>
                        <Cloud className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                        <span className="text-emerald-800 font-medium">
                          Đã đồng bộ Cloud Firestore & Máy chủ theo UID
                        </span>
                      </>
                    ) : (
                      <>
                        <Server className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                        <span className="text-blue-900 font-medium">
                          Đã lưu trên Máy chủ nội bộ theo UID
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <form onSubmit={handleChangePassword} className="space-y-3 pt-2">
                <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
                  Đổi mật khẩu tài khoản
                </h3>
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Mật khẩu hiện tại
                  </label>
                  <input
                    type="password"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    placeholder="Mật khẩu cũ"
                    className="w-full px-3 py-1.5 text-xs bg-stone-50 border border-stone-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Mật khẩu mới
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mật khẩu mới (tối thiểu 6 ký tự)"
                    className="w-full px-3 py-1.5 text-xs bg-stone-50 border border-stone-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Xác nhận mật khẩu mới
                  </label>
                  <input
                    type="password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="Nhập lại mật khẩu mới"
                    className="w-full px-3 py-1.5 text-xs bg-stone-50 border border-stone-300 rounded-lg"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2 px-3 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isLoading ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
                </button>
              </form>

              <div className="pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => {
                    onLogout();
                    onClose();
                  }}
                  className="w-full py-2 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-colors cursor-pointer text-center"
                >
                  Đăng xuất khỏi tài khoản
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
