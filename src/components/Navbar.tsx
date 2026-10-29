import React from 'react';
import { NavigationTab, UserRole, UserAccount } from '../types';
import {
  BookOpen,
  PenTool,
  Award,
  Home,
  HelpCircle,
  GraduationCap,
  ClipboardList,
  Sparkles,
  LogIn,
  Layers,
  FlaskConical,
  Cloud,
  Server,
  ShieldAlert
} from 'lucide-react';

interface NavbarProps {
  currentTab: NavigationTab;
  userRole: UserRole;
  currentUser: UserAccount | null;
  isDemoMode?: boolean;
  isCloudSynced?: boolean;
  onSelectTab: (tab: NavigationTab) => void;
  onOpenGuide: () => void;
  onOpenSurvey: () => void;
  onToggleDemoMode?: () => void;
  onOpenAuth: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  currentUser,
  isDemoMode = false,
  isCloudSynced = false,
  onSelectTab,
  onOpenGuide,
  onOpenSurvey,
  onToggleDemoMode,
  onOpenAuth
}) => {
  const navItems: { id: NavigationTab; label: string; icon: React.ReactNode }[] = [
    { id: 'home', label: 'Trang chủ', icon: <Home className="w-4 h-4" /> },
    { id: 'exam', label: 'Luyện đề 10đ', icon: <Layers className="w-4 h-4 text-purple-600" /> },
    { id: 'knowledge', label: 'Góc tri thức', icon: <Sparkles className="w-4 h-4 text-emerald-600" /> },
    { id: 'reading', label: 'Luyện đọc hiểu', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'writing', label: 'Huấn luyện viết', icon: <PenTool className="w-4 h-4" /> },
    { id: 'portfolio', label: 'Hồ sơ học tập', icon: <Award className="w-4 h-4" /> }
  ];

  // Chỉ tài khoản đã đăng nhập và được quản trị viên duyệt mới mở được khu vực giáo viên
  const isVerifiedTeacher = Boolean(
    currentUser &&
      currentUser.status === 'active' &&
      (currentUser.role === 'admin' ||
        (currentUser.role === 'teacher' && currentUser.teacherApprovalStatus === 'approved'))
  );
  const isVerifiedAdmin = Boolean(
    currentUser && currentUser.role === 'admin' && currentUser.status === 'active'
  );

  if (isVerifiedTeacher) {
    navItems.push({
      id: 'teacher',
      label: 'Khu vực Giáo viên',
      icon: <GraduationCap className="w-4 h-4 text-blue-600" />
    });
  }

  if (isVerifiedAdmin) {
    navItems.push({
      id: 'admin',
      label: 'Quản trị viên',
      icon: <ShieldAlert className="w-4 h-4 text-purple-700" />
    });
  }

  return (
    <header className="sticky top-0 z-40 bg-[#FAF7F2]/95 backdrop-blur-md border-b border-stone-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 h-16">
          {/* Zone 1: Wordmark */}
          <button
            onClick={() => onSelectTab('home')}
            className="flex items-center gap-2.5 text-left group focus:outline-none cursor-pointer"
          >
            <div className="w-9 h-9 rounded-lg bg-[#0F172A] text-[#FAF7F2] flex items-center justify-center font-serif-literary font-bold text-lg shadow-xs group-hover:bg-[#1E293B] transition-colors">
              V
            </div>
            <div className="leading-tight">
              <div className="flex items-center gap-1.5">
                <span className="text-lg font-bold tracking-tight text-[#0F172A] whitespace-nowrap">
                  VănAI 12
                </span>
                {isDemoMode && (
                  <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-amber-200 text-amber-950 rounded border border-amber-400">
                    Dữ liệu minh họa
                  </span>
                )}
              </div>
              <span className="text-[11px] text-stone-500 font-normal whitespace-nowrap hidden sm:block">
                Trợ lý đọc hiểu & viết THPT
              </span>
            </div>
          </button>

          {/* Zone 2: Navigation Links */}
          <nav className="flex items-center gap-1 sm:gap-3 text-sm font-medium overflow-x-auto py-1">
            {navItems.map((item) => {
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectTab(item.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-md transition-colors whitespace-nowrap shrink-0 text-xs sm:text-sm cursor-pointer ${
                    isActive
                      ? 'text-[#0F172A] font-semibold bg-stone-200/70 shadow-2xs'
                      : 'text-stone-600 hover:text-[#0F172A] hover:bg-stone-100/60'
                  }`}
                >
                  <span className="hidden md:inline-block">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Actions & Real Auth Status */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Nút Khảo sát năng lực */}
            <button
              onClick={onOpenSurvey}
              className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              title="Khảo sát năng lực & Mục tiêu điểm thi"
            >
              <ClipboardList className="w-3.5 h-3.5 text-emerald-700" />
              <span>Khảo sát</span>
            </button>

            {/* Tài khoản Người dùng & Trạng thái đồng bộ thật */}
            {currentUser ? (
              <button
                onClick={onOpenAuth}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-stone-300 hover:border-stone-400 text-stone-800 text-xs font-semibold transition-colors cursor-pointer shadow-2xs group"
                title={`UID: ${currentUser.id} — Bấm để quản lý tài khoản hoặc đăng xuất`}
              >
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${
                    currentUser.role === 'admin'
                      ? 'bg-purple-700'
                      : currentUser.role === 'teacher'
                      ? 'bg-blue-700'
                      : 'bg-emerald-700'
                  }`}
                >
                  {currentUser.fullName.charAt(0)}
                </div>
                <div className="text-left leading-tight hidden sm:block">
                  <div className="text-[11px] font-bold text-stone-900 truncate max-w-[120px] flex items-center gap-1">
                    <span>{currentUser.fullName}</span>
                  </div>
                  <div className="text-[9px] text-stone-500 font-mono flex items-center gap-1">
                    <span>
                      {currentUser.username} ·{' '}
                      {currentUser.role === 'admin'
                        ? 'Quản trị viên'
                        : currentUser.role === 'teacher'
                        ? 'Giáo viên'
                        : currentUser.className || 'HS'}
                    </span>
                    {isCloudSynced ? (
                      <span className="text-emerald-700 inline-flex items-center gap-0.5" title="Đã kết nối Firebase Auth & Cloud Firestore">
                        <Cloud className="w-2.5 h-2.5" /> Cloud
                      </span>
                    ) : (
                      <span className="text-blue-700 inline-flex items-center gap-0.5" title="Lưu theo UID trên máy chủ nội bộ (Chưa kết nối phiên Firebase Auth)">
                        <Server className="w-2.5 h-2.5" /> UID
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ) : (
              <button
                onClick={onOpenAuth}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                title="Đăng nhập tài khoản thật hoặc Kích hoạt mã 1 lần"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Đăng nhập</span>
              </button>
            )}

            <button
              onClick={onOpenGuide}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#0F172A] bg-stone-100 hover:bg-stone-200 border border-stone-300 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              title="Hướng dẫn phương pháp ôn thi THPT"
            >
              <HelpCircle className="w-3.5 h-3.5 text-stone-600" />
              <span className="hidden lg:inline">Quy chuẩn</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
