import React, { useState } from 'react';
import {
  StudentProfile,
  TestScenarioKey,
  WritingSubmissionRecord,
  ReadingAttempt,
  KnowledgeCard,
  UserAccount,
  StudentSurveyData
} from '../types';
import { DEFAULT_STUDENT_SURVEY, TEST_SCENARIOS_PROFILES } from '../data/mockProfiles';
import { HIGH_SCHOOL_SKILLS_CATALOG } from '../data/skillsCatalog';
import { analyzeStudentCompetency } from '../services/competencyAnalytics';
import { TeacherKnowledgeManager } from './TeacherKnowledgeManager';
import { ClassProgressDashboard } from './ClassProgressDashboard';
import { CompleteExamManager } from './CompleteExamManager';
import {
  Users,
  Search,
  Filter,
  CheckCircle,
  AlertTriangle,
  Award,
  ChevronRight,
  ShieldCheck,
  Check,
  TrendingUp,
  FileText,
  Clock,
  Sparkles,
  BarChart3,
  BookOpen,
  LayoutDashboard,
  UploadCloud,
  FlaskConical
} from 'lucide-react';

interface TeacherAnalyticsPortalProps {
  currentScenario: TestScenarioKey;
  isDemoMode?: boolean;
  onToggleDemoMode?: () => void;
  knowledgeCards?: KnowledgeCard[];
  accounts?: UserAccount[];
  studentStatesMap?: Record<
    string,
    {
      survey: StudentSurveyData;
      readingAttempts: ReadingAttempt[];
      writingRecords: WritingSubmissionRecord[];
    }
  >;
  onRefreshAccounts?: () => void;
  onSelectScenario: (scenario: TestScenarioKey) => void;
  onApproveGrade?: (studentId: string, submissionId: string, approvedScore: number, teacherNotes: string) => void;
  onSaveKnowledgeCard?: (card: KnowledgeCard) => void;
  onDeleteKnowledgeCard?: (cardId: string) => void;
  onToggleKnowledgeCardStatus?: (cardId: string) => void;
}

export const TeacherAnalyticsPortal: React.FC<TeacherAnalyticsPortalProps> = ({
  currentScenario,
  isDemoMode = false,
  onToggleDemoMode,
  knowledgeCards = [],
  accounts = [],
  studentStatesMap = {},
  onRefreshAccounts,
  onSelectScenario,
  onApproveGrade,
  onSaveKnowledgeCard,
  onDeleteKnowledgeCard,
  onToggleKnowledgeCardStatus
}) => {
  const [activeSection, setActiveSection] = useState<'exams' | 'progress' | 'analytics' | 'knowledge'>('exams');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [selectedSkillFilter, setSelectedSkillFilter] = useState<string>('all');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');

  // Danh sách hồ sơ: Tách biệt tuyệt đối dữ liệu thật (gắn theo UID acc.id) và chế độ Dữ liệu Minh họa
  const realStudentProfiles: StudentProfile[] = accounts
    .filter((a) => a.role === 'student')
    .map((acc) => {
      const state = studentStatesMap[acc.id];
      return {
        id: acc.id,
        fullName: acc.fullName,
        studentCode: acc.username,
        className: acc.className || '12A1',
        survey: state?.survey || { ...DEFAULT_STUDENT_SURVEY },
        readingAttempts: state?.readingAttempts || [],
        writingRecords: state?.writingRecords || []
      };
    });

  const allProfiles: StudentProfile[] = isDemoMode
    ? Object.values(TEST_SCENARIOS_PROFILES)
    : realStudentProfiles;

  // Lọc theo lớp và từ khóa
  const filteredStudents = allProfiles.filter((s) => {
    const matchClass = selectedClass === 'all' || s.className === selectedClass;
    const matchSearch =
      s.fullName.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      s.studentCode.toLowerCase().includes(searchKeyword.toLowerCase());
    return matchClass && matchSearch;
  });

  const fallbackEmptyStudent: StudentProfile = {
    id: 'empty-student',
    fullName: 'Chưa có học sinh trong lớp',
    studentCode: '—',
    className: '—',
    survey: { ...DEFAULT_STUDENT_SURVEY },
    readingAttempts: [],
    writingRecords: []
  };

  const activeStudent =
    filteredStudents.find((s) => s.id === selectedStudentId) ||
    filteredStudents[0] ||
    allProfiles[0] ||
    fallbackEmptyStudent;

  const studentAnalytics = analyzeStudentCompetency(
    activeStudent.survey,
    activeStudent.readingAttempts,
    activeStudent.writingRecords
  );

  // Thống kê toàn lớp về các lỗi rubric phổ biến (Tính từ dữ liệu thật khi !isDemoMode)
  const totalStudentsCount = allProfiles.length;
  const rubricClassStats = isDemoMode
    ? [
        { name: '1. Thể thức đoạn văn 200 chữ (Không xuống dòng)', difficultyCount: 14, total: 38, pct: 37 },
        { name: '2. Lựa chọn và phân tích dẫn chứng thực tế sống động', difficultyCount: 22, total: 38, pct: 58 },
        { name: '3. Bám sát căn cứ ngữ liệu đọc hiểu (không tự suy diễn)', difficultyCount: 11, total: 38, pct: 29 },
        { name: '4. Xây dựng phản đề và chiều sâu luận điểm', difficultyCount: 19, total: 38, pct: 50 },
        { name: '5. Diễn đạt, kiểm soát câu dài và từ nối chuyển mạch', difficultyCount: 9, total: 38, pct: 24 }
      ]
    : [
        {
          name: '1. Thể thức đoạn văn 200 chữ (Không xuống dòng)',
          difficultyCount: allProfiles.filter((p) => p.writingRecords.some((w) => w.feedback.paragraphCount > 1 && w.type === 'nghi_luan_xa_hoi')).length,
          total: totalStudentsCount,
          pct: totalStudentsCount > 0 ? Math.round((allProfiles.filter((p) => p.writingRecords.some((w) => w.feedback.paragraphCount > 1 && w.type === 'nghi_luan_xa_hoi')).length / totalStudentsCount) * 100) : 0
        },
        {
          name: '2. Lựa chọn và phân tích dẫn chứng thực tế sống động',
          difficultyCount: allProfiles.filter((p) => p.writingRecords.some((w) => w.feedback.actionSteps.length > 0)).length,
          total: totalStudentsCount,
          pct: totalStudentsCount > 0 ? Math.round((allProfiles.filter((p) => p.writingRecords.some((w) => w.feedback.actionSteps.length > 0)).length / totalStudentsCount) * 100) : 0
        },
        {
          name: '3. Bám sát căn cứ ngữ liệu đọc hiểu (không tự suy diễn)',
          difficultyCount: allProfiles.filter((p) => p.readingAttempts.some((r) => r.feedback.missingPoints.length > 0)).length,
          total: totalStudentsCount,
          pct: totalStudentsCount > 0 ? Math.round((allProfiles.filter((p) => p.readingAttempts.some((r) => r.feedback.missingPoints.length > 0)).length / totalStudentsCount) * 100) : 0
        }
      ];

  // State duyệt điểm tại chỗ
  const [editingScoreId, setEditingScoreId] = useState<string | null>(null);
  const [customScoreValue, setCustomScoreValue] = useState<number>(1.85);
  const [teacherNoteInput, setTeacherNoteInput] = useState<string>('');
  const [approvedNotification, setApprovedNotification] = useState<boolean>(false);

  const handleConfirmApproval = (submissionId: string) => {
    if (onApproveGrade) {
      onApproveGrade(activeStudent.id, submissionId, customScoreValue, teacherNoteInput);
    }
    setApprovedNotification(true);
    setTimeout(() => {
      setApprovedNotification(false);
      setEditingScoreId(null);
    }, 2000);
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Header khu vực giáo viên */}
      <div className="space-y-2 border-b border-stone-200 pb-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-900 text-xs font-semibold mb-1">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-700" />
              <span>
                Phân hệ Quản trị Sư phạm & Phân tích Năng lực THPT{' '}
                {isDemoMode ? '— [DỮ LIỆU MINH HỌA]' : '— [DỮ LIỆU THẬT THEO UID]'}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-serif-literary font-bold text-[#0F172A]">
              Bảng Phân tích của Giáo viên Ngữ văn
            </h1>
            <p className="text-sm text-stone-600 mt-1">
              Theo dõi tiến độ toàn lớp, đối chiếu tự đánh giá vs kết quả thực tế, và phê duyệt điểm bài làm.
            </p>
          </div>

          <div className="p-3 bg-stone-100 rounded-xl border border-stone-300 space-y-1 text-xs max-w-sm">
            <div className="font-bold text-stone-800 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-700" />
              <span>Dữ liệu Học sinh Thật ({realStudentProfiles.length} học sinh thuộc phạm vi lớp)</span>
            </div>
            <p className="text-[11px] text-stone-600">
              Hiển thị trực tiếp dữ liệu học sinh đã ghi danh trong các lớp thuộc quyền quản lí của giáo viên.
            </p>
          </div>
        </div>
      </div>

      {/* 4 PHÂN HỆ CHÍNH CỦA GIÁO VIÊN: TẢI ĐỀ HOÀN CHỈNH vs TIẾN ĐỘ THEO LỚP vs BÁO CÁO NĂNG LỰC vs QUẢN LÝ TRI THỨC */}
      <div className="flex flex-wrap items-center gap-1 border-b border-stone-200">
        <button
          onClick={() => setActiveSection('exams')}
          className={`py-3 px-4 text-xs sm:text-sm font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
            activeSection === 'exams'
              ? 'border-[#0F172A] text-[#0F172A] font-bold'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          <UploadCloud className="w-4 h-4 text-emerald-700" />
          <span>Tải đề hoàn chỉnh & Chuẩn hóa điểm 10,0</span>
        </button>

        <button
          onClick={() => setActiveSection('progress')}
          className={`py-3 px-4 text-xs sm:text-sm font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
            activeSection === 'progress'
              ? 'border-[#0F172A] text-[#0F172A] font-bold'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          <LayoutDashboard className="w-4 h-4 text-blue-700" />
          <span>Theo dõi Tiến độ Lớp & Quản lý Tài khoản</span>
        </button>

        <button
          onClick={() => setActiveSection('analytics')}
          className={`py-3 px-4 text-xs sm:text-sm font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
            activeSection === 'analytics'
              ? 'border-[#0F172A] text-[#0F172A] font-bold'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          <BarChart3 className="w-4 h-4 text-purple-600" />
          <span>Báo cáo Năng lực Cá nhân & Duyệt điểm</span>
        </button>

        <button
          onClick={() => setActiveSection('knowledge')}
          className={`py-3 px-4 text-xs sm:text-sm font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
            activeSection === 'knowledge'
              ? 'border-[#0F172A] text-[#0F172A] font-bold'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          <BookOpen className="w-4 h-4 text-emerald-600" />
          <span>Quản lý Thư viện Tri thức ({knowledgeCards.length} thẻ)</span>
        </button>
      </div>

      {activeSection === 'exams' ? (
        <CompleteExamManager
          accounts={accounts}
          isDemoMode={isDemoMode}
          onToggleDemoMode={onToggleDemoMode}
        />
      ) : activeSection === 'progress' ? (
        <ClassProgressDashboard
          accounts={accounts}
          isDemoMode={isDemoMode}
          studentStatesMap={studentStatesMap}
          onRefreshAccounts={onRefreshAccounts || (() => {})}
          onSelectStudentProfile={(studentId) => {
            setSelectedStudentId(studentId);
            setActiveSection('analytics');
          }}
        />
      ) : activeSection === 'knowledge' ? (
        <TeacherKnowledgeManager
          knowledgeCards={knowledgeCards}
          onSaveCard={onSaveKnowledgeCard || (() => {})}
          onDeleteCard={onDeleteKnowledgeCard || (() => {})}
          onToggleStatus={onToggleKnowledgeCardStatus || (() => {})}
        />
      ) : (
        <>
          {/* TỔNG HỢP NĂNG LỰC TOÀN LỚP (RUBRIC DIFFICULTIES) */}
          <div className="p-6 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-700" />
                <h3 className="font-serif-literary text-base font-bold text-[#0F172A]">
                  Thống kê những tiêu chí Rubric học sinh thường gặp khó khăn{' '}
                  {isDemoMode ? '[Dữ liệu minh họa]' : ''}
                </h3>
              </div>
              <span className="text-xs text-stone-500">Sĩ số: {totalStudentsCount} học sinh</span>
            </div>

            <div className="space-y-3">
              {rubricClassStats.map((stat, idx) => (
                <div key={idx} className="space-y-1 text-xs">
                  <div className="flex items-center justify-between text-stone-700 font-medium">
                    <span>{stat.name}</span>
                    <span className="tabular-nums">
                      <strong className="text-amber-800">{stat.difficultyCount} em</strong> ({stat.pct}%)
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-stone-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        stat.pct >= 50 ? 'bg-amber-600' : stat.pct >= 30 ? 'bg-amber-500' : 'bg-emerald-600'
                      }`}
                      style={{ width: `${stat.pct}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

      {/* DANH SÁCH HỌC SINH & CHI TIẾT HỒ SƠ 2 CỘT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* CỘT TRÁI: BỘ LỌC & DANH SÁCH HỌC SINH (4/12 cột) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="p-5 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-4">
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-stone-700">
                Bộ lọc danh sách lớp
              </span>
              <div className="flex items-center gap-2">
                <select
                  value={selectedClass}
                  onChange={(e) => setSelectedClass(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-stone-50 border border-stone-300 rounded-lg flex-1 cursor-pointer"
                >
                  <option value="12A1">Lớp 12A1 (38 học sinh)</option>
                  <option value="12A2">Lớp 12A2 (40 học sinh)</option>
                  <option value="12D1">Lớp 12D1 (35 học sinh)</option>
                  <option value="all">Tất cả các lớp</option>
                </select>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  placeholder="Tìm theo tên học sinh..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>
            </div>

            {/* Danh sách học sinh */}
            <div className="divide-y divide-stone-100 max-h-[480px] overflow-y-auto">
              {filteredStudents.map((st) => {
                const isSelected = selectedStudentId === st.id;
                const hasSurvey = st.survey.isCompleted;

                return (
                  <button
                    key={st.id}
                    onClick={() => setSelectedStudentId(st.id)}
                    className={`w-full text-left p-3 rounded-xl transition-all flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-[#0F172A] text-white shadow-xs'
                        : 'hover:bg-stone-50 text-stone-800'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="font-semibold text-xs flex items-center gap-1.5 flex-wrap">
                        <span>{st.fullName}</span>
                        {st.readingAttempts.length > 0 || st.writingRecords.length > 0 ? (
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                              isSelected ? 'bg-emerald-500 text-white' : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            Đã có bài thực tế
                          </span>
                        ) : st.survey.isCompleted ? (
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                              isSelected ? 'bg-blue-500 text-white' : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            Đã khảo sát
                          </span>
                        ) : (
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-normal ${
                              isSelected ? 'bg-stone-600 text-stone-200' : 'bg-stone-200 text-stone-700'
                            }`}
                          >
                            Chưa khảo sát
                          </span>
                        )}
                      </div>
                      <div className={`text-[11px] ${isSelected ? 'text-stone-300' : 'text-stone-500'}`}>
                        Mã: {st.studentCode} · Điểm gần nhất: {st.survey.selfReportedLatestScore ?? '—'}
                      </div>
                    </div>
                    <ChevronRight className={`w-4 h-4 ${isSelected ? 'text-white' : 'text-stone-400'}`} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* CỘT PHẢI: CHI TIẾT HỒ SƠ HỌC SINH ĐƯỢC CHỌN (8/12 cột) */}
        <div className="lg:col-span-8 space-y-6">
          <div className="p-6 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-6">
            {/* Header thông tin cá nhân */}
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-100 pb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-xl font-bold font-serif-literary text-[#0F172A]">
                    {activeStudent.fullName}
                  </h3>
                  <span className="text-xs font-semibold text-blue-800 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                    Lớp {activeStudent.className} · {activeStudent.studentCode}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-stone-500">
                  <span>Mục tiêu THPT: <strong className="text-emerald-800">{activeStudent.survey.targetScore || 8.0}đ</strong></span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Trạng thái: <strong className="text-stone-800">{activeStudent.readingAttempts.length > 0 || activeStudent.writingRecords.length > 0 ? 'Đã có dữ liệu từ bài làm thực tế' : activeStudent.survey.isCompleted ? 'Đã khảo sát nhanh' : 'Chưa khảo sát'}</strong>
                  </span>
                </div>
              </div>
            </div>

            {/* BA CỘT ĐIỂM MINH BẠCH: TỰ KHAI vs GỢI Ý SƠ BỘ vs GIÁO VIÊN DUYỆT CHÍNH THỨC */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-1">
                <span className="text-stone-500 block font-medium">1. Điểm Tự khai</span>
                <div className="text-xl font-bold text-stone-800 tabular-nums font-serif-literary">
                  {activeStudent.survey.selfReportedLatestScore ?? 'Chưa có dữ liệu'}
                </div>
                <p className="text-[11px] text-stone-500">Tự đánh giá ban đầu</p>
              </div>

              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 space-y-1">
                <span className="text-amber-800 block font-medium">
                  2. Điểm Gợi ý sơ bộ (Chưa duyệt)
                </span>
                <div className="text-xl font-bold text-amber-950 tabular-nums font-serif-literary">
                  {studentAnalytics.suggestedOverallScore !== null
                    ? `${studentAnalytics.suggestedOverallScore}`
                    : 'Chưa có dữ liệu'}
                </div>
                <p className="text-[11px] text-amber-800">
                  Gợi ý theo quy tắc / AI — Không tính vào điểm chính thức
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 space-y-1">
                <span className="text-emerald-800 block font-bold">
                  3. Điểm Chính thức (Giáo viên duyệt)
                </span>
                <div className="text-xl font-bold text-emerald-950 tabular-nums font-serif-literary">
                  {studentAnalytics.actualOverallScore !== null
                    ? `${studentAnalytics.actualOverallScore} / 10`
                    : 'Chưa có dữ liệu'}
                </div>
                <p className="text-[11px] text-emerald-800">
                  {studentAnalytics.teacherApprovedCount > 0
                    ? `Đã duyệt ${studentAnalytics.teacherApprovedCount}/${studentAnalytics.totalSubmissionsCount} bài`
                    : 'Chờ giáo viên xác nhận'}
                </p>
              </div>
            </div>

            {/* BÀI VIẾT VÀ QUY TRÌNH DUYỆT ĐIỂM CỦA GIÁO VIÊN */}
            <div className="space-y-4">
              <h4 className="font-bold text-sm text-[#0F172A] flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-700" />
                <span>Bài viết chờ giáo viên thẩm định & phê duyệt điểm</span>
              </h4>

              {activeStudent.writingRecords.length === 0 ? (
                <div className="p-6 text-center rounded-xl bg-stone-50 border border-dashed border-stone-200 text-xs text-stone-500">
                  Học sinh này chưa nộp bài viết nào trong hệ thống.
                </div>
              ) : (
                activeStudent.writingRecords.map((w) => (
                  <div
                    key={w.id}
                    className="p-5 bg-white rounded-xl border border-stone-200 shadow-2xs space-y-4 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-2">
                      <div>
                        <span className="font-bold text-stone-900 text-sm block">{w.promptTitle}</span>
                        <div className="text-[11px] text-stone-500 mt-0.5">
                          {w.type === 'nghi_luan_xa_hoi' ? 'Đoạn văn 200 chữ' : 'Bài văn NLVH'} · {w.wordCount} từ
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-purple-700 font-semibold bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                          AI đề xuất: {w.feedback.aiSuggestedScore ?? 1.5}/2.0đ
                        </span>
                        {w.feedback.teacherConfirmedScore ? (
                          <span className="text-emerald-800 font-bold bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300">
                            GV đã duyệt: {w.feedback.teacherConfirmedScore}đ
                          </span>
                        ) : (
                          <span className="text-amber-800 font-bold bg-amber-100 px-2 py-0.5 rounded">
                            Chờ duyệt
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Nội dung bài văn */}
                    <div className="p-3 bg-stone-50 rounded-lg border border-stone-200 font-serif-literary text-stone-800 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-line">
                      {w.originalText}
                    </div>

                    {/* Khung giáo viên duyệt điểm */}
                    <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-3">
                      <div className="font-bold text-emerald-950 flex items-center justify-between">
                        <span>Phê duyệt điểm & Nhận xét của Giáo viên:</span>
                        {approvedNotification && (
                          <span className="text-emerald-700 flex items-center gap-1 font-semibold text-xs">
                            <Check className="w-3.5 h-3.5" /> Đã lưu phê duyệt!
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-emerald-900 mb-1">
                            Điểm chính thức duyệt:
                          </label>
                          <input
                            type="number"
                            step="0.05"
                            min="0"
                            max="2.0"
                            value={customScoreValue}
                            onChange={(e) => setCustomScoreValue(parseFloat(e.target.value) || 0)}
                            className="w-full px-2.5 py-1.5 text-xs bg-white border border-emerald-300 rounded-md font-bold text-emerald-950"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-semibold text-emerald-900 mb-1">
                            Lời dặn dò sư phạm gửi học sinh:
                          </label>
                          <input
                            type="text"
                            value={teacherNoteInput}
                            onChange={(e) => setTeacherNoteInput(e.target.value)}
                            placeholder="Ví dụ: Bài viết sâu sắc, cần chú ý đưa 1 dẫn chứng thực tế rõ ràng hơn..."
                            className="w-full px-2.5 py-1.5 text-xs bg-white border border-emerald-300 rounded-md"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => handleConfirmApproval(w.id)}
                          className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <ShieldCheck className="w-4 h-4" />
                          <span>Xác nhận duyệt điểm chính thức</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
        </>
      )}
    </div>
  );
};
