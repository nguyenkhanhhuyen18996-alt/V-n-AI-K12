import React, { useState, useRef } from 'react';
import {
  StudentSurveyData,
  ReadingAttempt,
  WritingSubmissionRecord,
  PersonalizedRecommendation,
  NavigationTab,
  ReadingTextType,
  CompleteExam,
  UserAccount
} from '../types';
import {
  analyzeStudentCompetency,
  SectionProgressDetail
} from '../services/competencyAnalytics';
import {
  getStructuredPracticeRecommendations,
  pickPriorityRandomQuickExercise,
  QuickPracticeSkillFocus
} from '../services/recommendationEngine';
import { formatVNDecimal } from '../services/examParserEngine';
import { filterPortfolioHistoryRecords } from '../services/reviewCadenceService';
import { SAMPLE_READING_PASSAGES, SAMPLE_WRITING_PROMPTS } from '../data/sampleData';
import { GentleTypewriterText } from './GentleTypewriterText';
import {
  Target,
  Sparkles,
  BookOpen,
  PenTool,
  ClipboardCheck,
  Clock,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Award,
  Layers,
  ShieldCheck,
  Play,
  BarChart3,
  FileCheck2,
  Compass,
  Info,
  Zap,
  Shuffle,
  BellRing,
  Calendar,
  X
} from 'lucide-react';

interface StudentDashboardProps {
  currentUser?: UserAccount | null;
  isDemoMode?: boolean;
  survey: StudentSurveyData;
  readingAttempts: ReadingAttempt[];
  writingRecords: WritingSubmissionRecord[];
  recommendations: PersonalizedRecommendation[];
  onOpenSurvey: () => void;
  onStartExercise: (rec: PersonalizedRecommendation) => void;
  onDismissExercise: (recId: string) => void;
  onNavigateTab: (tab: NavigationTab) => void;
  onSelectExam?: (exam: CompleteExam) => void;
}

export const StudentDashboard: React.FC<StudentDashboardProps> = ({
  currentUser,
  isDemoMode = false,
  survey,
  readingAttempts,
  writingRecords,
  onOpenSurvey,
  onStartExercise,
  onNavigateTab,
  onSelectExam
}) => {
  // Bộ lọc cho khu vực 1: "Bài luyện phù hợp với bạn" (A: Đọc hiểu, B: Đoạn văn 200 chữ, C: Bài văn 600 chữ)
  const [selectedReadingTextType, setSelectedReadingTextType] = useState<ReadingTextType>('van_hoc');
  const [selectedParagraphArgType, setSelectedParagraphArgType] = useState<
    'nghi_luan_xa_hoi' | 'nghi_luan_van_hoc'
  >('nghi_luan_xa_hoi');
  const [selectedEssayArgType, setSelectedEssayArgType] = useState<
    'nghi_luan_xa_hoi' | 'nghi_luan_van_hoc'
  >('nghi_luan_van_hoc');

  // State cho tính năng "Luyện tập nhanh" (Chọn nhanh kỹ năng Đọc hiểu hoặc Viết -> Bắt đầu bài ngẫu nhiên theo độ ưu tiên)
  const [quickSkillFocus, setQuickSkillFocus] = useState<QuickPracticeSkillFocus>('reading');
  const [quickWritingSubFocus, setQuickWritingSubFocus] = useState<
    'writing' | 'writing_paragraph' | 'writing_essay'
  >('writing');
  const [lastQuickExerciseId, setLastQuickExerciseId] = useState<string | undefined>(undefined);
  const [quickShuffleVersion, setQuickShuffleVersion] = useState<number>(0);

  // State ẩn/hiện thông báo tiến độ mục tiêu hàng tuần trong phiên
  const [isWeeklyGoalBannerDismissed, setIsWeeklyGoalBannerDismissed] = useState<boolean>(false);

  // State lưu ID thẻ gợi ý đang được nhấn để phát hiệu ứng gõ phím trực tiếp nội dung bài đọc / gợi ý viết
  const [activeTypingRecId, setActiveTypingRecId] = useState<string | null>(null);
  const [activeTypingClickSeq, setActiveTypingClickSeq] = useState<number>(0);

  const resolveRecStreamingContent = (rec: PersonalizedRecommendation) => {
    if (rec.type === 'reading' || rec.sectionType === 'reading') {
      const passage =
        SAMPLE_READING_PASSAGES.find((p) => p.id === rec.passageId) || SAMPLE_READING_PASSAGES[0];
      const firstQuestion = passage?.questions?.[0]?.question || '';
      return {
        headerLabel: 'Trích đoạn bài đọc & Gợi mở câu hỏi từ AI',
        streamText: passage
          ? `📖 VĂN BẢN: "${passage.title}" (${passage.author})\n\n${passage.content}\n\n💡 CÂU HỎI TRỌNG TÂM: ${firstQuestion}\n• Gợi ý đọc hiểu: Chú ý xác định từ khóa biểu cảm, biện pháp tu từ và mạch lập luận chính trong ngữ liệu trước khi đặt bút trả lời.`
          : rec.reason
      };
    } else {
      const prompt =
        SAMPLE_WRITING_PROMPTS.find((p) => p.id === rec.promptId) || SAMPLE_WRITING_PROMPTS[0];
      return {
        headerLabel: 'Đề bài & Gợi ý triển khai viết nghị luận từ AI',
        streamText: prompt
          ? `✍️ YÊU CẦU ĐỀ BÀI:\n${prompt.promptText}\n\n🧭 GỢI Ý VIẾT & LẬP DÀN Ý TRỰC TIẾP:\n${prompt.focusGuide}${
              prompt.coreConcepts?.length
                ? `\n• Từ khóa trọng tâm cần làm rõ: ${prompt.coreConcepts.join(' · ')}`
                : ''
            }`
          : rec.reason
      };
    }
  };

  // Refs để cuộn nhanh từ thanh thao tác hologram
  const practiceSectionRef = useRef<HTMLDivElement>(null);
  const resultsSectionRef = useRef<HTMLDivElement>(null);

  // Phân tích năng lực & sơ đồ kết quả 3 phần (Đọc hiểu /4,0 - Đoạn văn /2,0 - Bài văn /4,0)
  const analytics = analyzeStudentCompetency(survey, readingAttempts, writingRecords);

  // Tính toán tiến độ mục tiêu hàng tuần (So sánh Điểm hiện tại vs Mục tiêu khảo sát + Số bài luyện trong tuần)
  const weeklyGoalProgress = React.useMemo(() => {
    const targetScore = Number.isFinite(Number(survey.targetScore)) && Number(survey.targetScore) > 0
      ? Number(survey.targetScore)
      : 8.0;

    let currentScore: number | null = null;
    let scoreSourceLabel = 'Chưa có điểm đối chiếu';
    let isOfficialScore = false;

    if (analytics.actualOverallScore !== null) {
      currentScore = analytics.actualOverallScore;
      scoreSourceLabel = `Điểm chính thức GV duyệt (${analytics.teacherApprovedCount} bài)`;
      isOfficialScore = true;
    } else if (analytics.suggestedOverallScore !== null) {
      currentScore = analytics.suggestedOverallScore;
      scoreSourceLabel = 'Điểm bài luyện AI tham khảo (chờ GV duyệt)';
    } else if (analytics.selfReportedLatestScore !== null) {
      currentScore = analytics.selfReportedLatestScore;
      scoreSourceLabel = 'Điểm tự đánh giá trong khảo sát ban đầu';
    }

    const rawGap =
      currentScore !== null
        ? Math.round((targetScore - currentScore) * 100) / 100
        : null;
    const scoreGap = rawGap !== null ? Math.max(0, rawGap) : null;
    const isTargetReached = rawGap !== null && rawGap <= 0;

    const progressPct =
      currentScore !== null && targetScore > 0
        ? Math.min(100, Math.max(6, Math.round((currentScore / targetScore) * 100)))
        : 0;

    // Đếm số bài luyện trong 7 ngày gần nhất
    const weeklyHistory = filterPortfolioHistoryRecords(
      readingAttempts,
      writingRecords,
      'all',
      'week'
    );
    const weeklyReadingCount = weeklyHistory.filteredReadingAttempts.length;
    const weeklyWritingCount = weeklyHistory.filteredWritingRecords.length;
    const weeklyTotalCount = weeklyHistory.totalFilteredCount;

    // Mục tiêu số bài rèn luyện mỗi tuần dựa theo thời gian cam kết trong khảo sát
    const weeklySessionGoal =
      survey.quickDailyTime === 'full_exam' || survey.practiceTimeAvailability === '45_phut_ngay'
        ? 5
        : survey.quickDailyTime === '20_30_mins' || survey.practiceTimeAvailability === '30_phut_ngay'
        ? 4
        : 3;

    const weeklySessionPct = Math.min(
      100,
      Math.round((weeklyTotalCount / weeklySessionGoal) * 100)
    );

    // Xác định phần kỹ năng cần ưu tiên bù đắp nhất trong tuần để rút ngắn khoảng cách điểm
    const topPrioritySkill = analytics.prioritySkillsToImprove[0];
    const focusAdvice = topPrioritySkill
      ? `Ưu tiên tuần này: Rèn "${topPrioritySkill.label}" để thu hẹp khoảng cách nhanh nhất.`
      : 'Ưu tiên tuần này: Duy trì đều đặn cả Đọc hiểu (4,0đ) và Viết nghị luận (6,0đ).';

    return {
      targetScore,
      currentScore,
      scoreSourceLabel,
      isOfficialScore,
      scoreGap,
      isTargetReached,
      progressPct,
      weeklyReadingCount,
      weeklyWritingCount,
      weeklyTotalCount,
      weeklySessionGoal,
      weeklySessionPct,
      focusAdvice
    };
  }, [survey, analytics, readingAttempts, writingRecords]);

  // Lấy gợi ý bài luyện chia rõ 3 nhóm A, B, C (chỉ lấy đề ngân hàng Giáo viên đã xuất bản có Rubric hợp lệ)
  const structuredRecs = getStructuredPracticeRecommendations(
    survey,
    readingAttempts,
    writingRecords,
    {
      readingTextType: selectedReadingTextType,
      paragraphArgumentType: selectedParagraphArgType,
      essayArgumentType: selectedEssayArgType
    }
  );

  // Tính bài tập ngẫu nhiên theo mức độ ưu tiên cho khu vực "Luyện tập nhanh"
  const activeQuickFocus: QuickPracticeSkillFocus =
    quickSkillFocus === 'reading' ? 'reading' : quickWritingSubFocus;

  const quickPracticePreview = React.useMemo(() => {
    void quickShuffleVersion;
    return pickPriorityRandomQuickExercise(
      activeQuickFocus,
      survey,
      readingAttempts,
      writingRecords,
      lastQuickExerciseId
    );
  }, [activeQuickFocus, survey, readingAttempts, writingRecords, lastQuickExerciseId, quickShuffleVersion]);

  // Bắt đầu ngay 1 chạm với kỹ năng chọn nhanh (không cần qua nhiều bước)
  const handleInstantQuickStart = (focusOverride?: QuickPracticeSkillFocus) => {
    const targetFocus = focusOverride || activeQuickFocus;
    if (!focusOverride && quickPracticePreview?.selectedExercise) {
      setLastQuickExerciseId(quickPracticePreview.selectedExercise.id);
      onStartExercise(quickPracticePreview.selectedExercise);
      return;
    }
    const picked = pickPriorityRandomQuickExercise(
      targetFocus,
      survey,
      readingAttempts,
      writingRecords,
      lastQuickExerciseId
    );
    if (picked?.selectedExercise) {
      setLastQuickExerciseId(picked.selectedExercise.id);
      onStartExercise(picked.selectedExercise);
    } else {
      onNavigateTab(targetFocus === 'reading' ? 'reading' : 'writing');
    }
  };

  const handleReshuffleQuickExercise = () => {
    if (quickPracticePreview?.selectedExercise) {
      setLastQuickExerciseId(quickPracticePreview.selectedExercise.id);
    }
    setQuickShuffleVersion((v) => v + 1);
  };

  // Tìm bài luyện đầu tiên phù hợp để nút "Làm bài" mở nhanh
  const primaryRecommendedExercise =
    structuredRecs.readingRecommendations[0] ||
    structuredRecs.paragraphRecommendations[0] ||
    structuredRecs.essayRecommendations[0] ||
    null;

  // Kiểm tra xem học sinh có bài đang làm hoặc mới làm gần đây không để nút "Tiếp tục bài đang làm" điều hướng thông minh
  const hasRecentWriting = writingRecords.length > 0;
  const hasRecentReading = readingAttempts.length > 0;

  const handleQuickStartPractice = () => {
    if (practiceSectionRef.current) {
      practiceSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (primaryRecommendedExercise) {
      onStartExercise(primaryRecommendedExercise);
    } else {
      onNavigateTab('reading');
    }
  };

  const handleContinueWorking = () => {
    if (hasRecentWriting) {
      onNavigateTab('writing');
    } else if (hasRecentReading) {
      onNavigateTab('reading');
    } else if (primaryRecommendedExercise) {
      onStartExercise(primaryRecommendedExercise);
    } else {
      onNavigateTab('writing');
    }
  };

  const handleViewResults = () => {
    if (resultsSectionRef.current) {
      resultsSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      onNavigateTab('portfolio');
    }
  };

  // Hàm render từng thanh tiến độ trong khu vực "Kết quả luyện tập của bạn" (Yêu cầu 3)
  const renderSectionMasteryCard = (detail: SectionProgressDetail, stepLabel: string) => {
    const { officialMastery, aiReferenceMastery } = detail;

    // Màu sắc trạng thái theo đúng yêu cầu:
    // - Tốt: xanh ngọc / xanh lá (emerald/teal)
    // - Khá: vàng / cam (amber/orange)
    // - Trung bình/cần củng cố: đỏ san hô / hồng đậm (rose/coral)
    const badgeColorClass =
      officialMastery.colorState === 'emerald'
        ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
        : officialMastery.colorState === 'amber'
        ? 'bg-amber-100 text-amber-900 border-amber-300'
        : officialMastery.colorState === 'coral'
        ? 'bg-rose-100 text-rose-900 border-rose-300'
        : 'bg-stone-100 text-stone-600 border-stone-200';

    const barGradientClass =
      officialMastery.colorState === 'emerald'
        ? 'bg-gradient-to-r from-teal-500 to-emerald-500'
        : officialMastery.colorState === 'amber'
        ? 'bg-gradient-to-r from-amber-400 to-orange-500'
        : officialMastery.colorState === 'coral'
        ? 'bg-gradient-to-r from-rose-500 to-pink-600'
        : 'bg-stone-200';

    const cardBorderClass =
      officialMastery.colorState === 'emerald'
        ? 'border-emerald-200/90 bg-emerald-50/20'
        : officialMastery.colorState === 'amber'
        ? 'border-amber-200/90 bg-amber-50/20'
        : officialMastery.colorState === 'coral'
        ? 'border-rose-200/90 bg-rose-50/20'
        : 'border-stone-200 bg-white';

    const maxLabel = detail.maxScore === 2.0 ? '2,0' : '4,0';
    const thresholdsText =
      detail.maxScore === 2.0
        ? 'Trung bình/cần củng cố: 0–1,0đ (0–59%) · Khá: Trên 1,0–1,5đ (60–79%) · Tốt: Trên 1,5–2,0đ (80–100%)'
        : 'Trung bình/cần củng cố: 0–2,0đ (0–59%) · Khá: Trên 2,0–3,0đ (60–79%) · Tốt: Trên 3,0–4,0đ (80–100%)';

    return (
      <div
        key={detail.section}
        className={`p-4 sm:p-5 rounded-2xl border shadow-2xs flex flex-col justify-between space-y-3.5 transition-all ${cardBorderClass}`}
      >
        <div className="space-y-2.5">
          {/* Tiêu đề phần & Nhãn xếp loại */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500 block">
                {stepLabel} · Tối đa {maxLabel} điểm
              </span>
              <h4 className="text-base font-serif-literary font-bold text-[#0F172A]">
                {detail.sectionTitle}
              </h4>
            </div>
            <span
              className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${badgeColorClass}`}
            >
              {officialMastery.tierLabel}
            </span>
          </div>

          {/* Điểm gốc (Giáo viên duyệt) & Phần trăm quy đổi song song */}
          <div className="p-3 rounded-xl bg-white border border-stone-200/80 flex items-baseline justify-between gap-2">
            <div>
              <span className="text-[11px] text-stone-500 block">
                Điểm chính thức (GV đã duyệt):
              </span>
              <span className="text-lg sm:text-xl font-mono font-bold text-[#0F172A]">
                {officialMastery.formattedRawScore}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-stone-500 block">Quy đổi mức tiến bộ:</span>
              <span className="text-base sm:text-lg font-mono font-bold text-stone-800">
                {officialMastery.convertedPercentage !== null
                  ? `${officialMastery.convertedPercentage}%`
                  : 'Chưa có dữ liệu'}
              </span>
            </div>
          </div>

          {/* Thanh tiến độ ngang dễ đọc trên điện thoại */}
          <div className="space-y-1.5">
            <div
              className="w-full h-3.5 bg-stone-200/80 rounded-full overflow-hidden p-0.5"
              role="progressbar"
              aria-valuenow={officialMastery.convertedPercentage ?? 0}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Tiến độ ${detail.sectionTitle}`}
            >
              <div
                className={`h-full rounded-full transition-all duration-500 ${barGradientClass}`}
                style={{
                  width:
                    officialMastery.convertedPercentage !== null
                      ? `${Math.max(4, officialMastery.convertedPercentage)}%`
                      : '0%'
                }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-stone-500 font-mono">
              <span>0% (Cần củng cố)</span>
              <span>60% (Khá)</span>
              <span>80%–100% (Tốt)</span>
            </div>
          </div>

          {/* Thông tin số bài và thời điểm tính điểm chính thức */}
          <div className="text-[11px] text-stone-600 flex flex-wrap items-center justify-between gap-1 pt-0.5">
            {detail.approvedCount > 0 ? (
              <>
                <span className="font-semibold text-emerald-800 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Trung bình từ {detail.approvedCount} bài Giáo viên đã duyệt</span>
                </span>
                {detail.approvedTimeInfo && (
                  <span className="text-stone-500 font-mono text-[10px]">
                    {detail.approvedTimeInfo}
                  </span>
                )}
              </>
            ) : (
              <span className="text-stone-500 italic">
                Chưa có bài làm được giáo viên duyệt điểm chính thức ở phần này.
              </span>
            )}
          </div>
        </div>

        {/* Tách riêng Điểm AI tham khảo (nếu có) và Điểm tự đánh giá khảo sát (không trộn lẫn) */}
        <div className="pt-2.5 border-t border-stone-200/80 space-y-2">
          {detail.aiReferenceCount > 0 && (
            <div className="p-2.5 rounded-xl bg-amber-50/90 border border-amber-200/90 text-[11px] space-y-1">
              <div className="flex items-center justify-between gap-1 font-bold text-amber-950">
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>{detail.aiReferenceLabel}</span>
                </span>
                <span className="font-mono text-amber-900">
                  {aiReferenceMastery.formattedRawScore} (
                  {aiReferenceMastery.convertedPercentage !== null
                    ? `${aiReferenceMastery.convertedPercentage}% · ${aiReferenceMastery.tierLabel}`
                    : '—'}
                  )
                </span>
              </div>
              <div className="text-[10px] text-amber-800 flex items-center justify-between">
                <span>Từ {detail.aiReferenceCount} bài chờ giáo viên duyệt</span>
                {detail.aiReferenceTimeInfo && <span>{detail.aiReferenceTimeInfo}</span>}
              </div>
            </div>
          )}

          {detail.selfReportedScore !== null && (
            <div className="flex items-center justify-between text-[11px] text-stone-500 bg-stone-50 px-2.5 py-1.5 rounded-lg border border-stone-200/60">
              <span>Điểm tự đánh giá (Khảo sát ban đầu):</span>
              <span className="font-mono font-semibold text-stone-700">
                {formatVNDecimal(detail.selfReportedScore)}/{maxLabel} điểm
              </span>
            </div>
          )}

          <p className="text-[10px] text-stone-500 leading-relaxed">{thresholdsText}</p>
        </div>
      </div>
    );
  };

  // Hàm render thẻ đề gợi ý trong khu vực "Bài luyện phù hợp với bạn"
  const renderRecommendationCard = (rec: PersonalizedRecommendation, accentTone: 'emerald' | 'indigo' | 'purple') => {
    const levelBadgeColor =
      rec.level === 'Cơ bản'
        ? 'bg-stone-100 text-stone-700 border-stone-300'
        : rec.level === 'Thông hiểu'
        ? 'bg-blue-50 text-blue-800 border-blue-200'
        : rec.level === 'Vận dụng'
        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
        : 'bg-purple-50 text-purple-900 border-purple-200';

    const borderAccent =
      accentTone === 'emerald'
        ? 'hover:border-teal-400'
        : accentTone === 'indigo'
        ? 'hover:border-indigo-400'
        : 'hover:border-purple-400';

    const isCardTypingActive = activeTypingRecId === rec.id;
    const streamingData = isCardTypingActive ? resolveRecStreamingContent(rec) : null;

    const handleCardClick = () => {
      if (activeTypingRecId === rec.id) {
        setActiveTypingRecId(null);
      } else {
        setActiveTypingRecId(rec.id);
        setActiveTypingClickSeq((s) => s + 1);
      }
    };

    return (
      <div
        key={rec.id}
        onClick={handleCardClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleCardClick();
          }
        }}
        aria-expanded={isCardTypingActive}
        className={`p-4 sm:p-5 rounded-2xl bg-white border shadow-2xs transition-all flex flex-col justify-between space-y-4 cursor-pointer text-left ${
          isCardTypingActive
            ? 'border-indigo-500 ring-2 ring-indigo-200/80 bg-indigo-50/10'
            : `border-stone-200/90 ${borderAccent}`
        }`}
      >
        <div className="space-y-2.5">
          {/* Dòng nhãn trên cùng: Dạng bài, Mức độ, Thời gian dự kiến */}
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="px-2.5 py-0.5 rounded-md bg-stone-900 text-white text-[11px] font-bold">
                {rec.taskFormatLabel || (rec.type === 'reading' ? 'Đọc hiểu' : 'Viết nghị luận')}
              </span>
              <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${levelBadgeColor}`}>
                Mức độ: {rec.level}
              </span>
              {rec.examTemplate && (
                <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-900 border border-indigo-200 text-[10px] font-bold">
                  Đề mẫu {rec.examTemplate}
                </span>
              )}
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-stone-600 bg-stone-100 px-2 py-0.5 rounded-md">
              <Clock className="w-3.5 h-3.5 text-stone-500" />
              <span>{rec.estimatedMinutes} phút</span>
            </span>
          </div>

          {/* Tên đề */}
          <h4 className="text-base font-serif-literary font-bold text-[#0F172A] leading-snug">
            {rec.title}
          </h4>

          {/* Mục tiêu kĩ năng & Thang điểm chuẩn */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-stone-700">
            <span className="font-semibold text-teal-900 bg-teal-50/80 border border-teal-200 px-2.5 py-0.5 rounded-md">
              Kĩ năng mục tiêu: {rec.targetSkillName}
            </span>
            {typeof rec.maxScore === 'number' && (
              <span className="font-mono font-bold text-stone-700 bg-stone-100 px-2 py-0.5 rounded-md">
                Thang điểm: {formatVNDecimal(rec.maxScore)} điểm
              </span>
            )}
          </div>

          {/* Lí do được gợi ý */}
          <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/80 text-xs text-stone-700 leading-relaxed">
            <span className="font-bold text-stone-900">Lí do gợi ý: </span>
            <span>{rec.reason}</span>
          </div>

          {/* Khung hiệu ứng gõ phím nhẹ nhàng cho nội dung bài đọc hoặc gợi ý viết khi nhấn vào thẻ gợi ý */}
          {isCardTypingActive && streamingData ? (
            <div
              onClick={(e) => e.stopPropagation()}
              className="p-3.5 rounded-xl bg-gradient-to-br from-indigo-50/90 via-white to-cyan-50/60 border border-indigo-200/90 space-y-2 shadow-2xs"
            >
              <div className="flex items-center justify-between gap-2 border-b border-indigo-100 pb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-950">
                  {streamingData.headerLabel}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveTypingRecId(null);
                  }}
                  className="text-[11px] font-semibold text-stone-500 hover:text-stone-800 cursor-pointer"
                >
                  Đóng xem trước
                </button>
              </div>
              <GentleTypewriterText
                text={streamingData.streamText}
                triggerKey={`${rec.id}_${activeTypingClickSeq}`}
                autoStart={true}
                intervalMs={16}
                maxDurationMs={2800}
                streamingLabel={
                  rec.type === 'reading'
                    ? 'AI đang gõ trích đoạn bài đọc & câu hỏi gợi mở...'
                    : 'AI đang gõ đề bài & gợi ý hướng dẫn viết...'
                }
                className="font-serif-literary text-xs sm:text-sm text-stone-800 leading-relaxed whitespace-pre-line max-h-60 overflow-y-auto pr-1"
              />
            </div>
          ) : (
            <div className="flex items-center justify-between text-[11px] text-indigo-700 font-semibold pt-0.5">
              <span className="inline-flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>
                  {rec.type === 'reading'
                    ? 'Nhấn vào thẻ để AI gõ trực tiếp nội dung bài đọc & câu hỏi'
                    : 'Nhấn vào thẻ để AI gõ trực tiếp đề bài & gợi ý viết'}
                </span>
              </span>
            </div>
          )}
        </div>

        {/* Chân thẻ: Nhãn nguồn đề + Mã Rubric + Nút "Làm bài" phong cách Hologram */}
        <div className="pt-3 border-t border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>{rec.sourceBadge}</span>
            </div>
            {rec.isInitialSurveyBased && (
              <div className="text-[10px] text-amber-800 font-medium">
                • Gợi ý ban đầu dựa trên tự đánh giá
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onStartExercise(rec);
            }}
            className="min-h-[44px] px-5 py-2.5 rounded-xl font-bold text-xs text-white shadow-sm transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-600 via-indigo-600 to-purple-600 hover:from-cyan-500 hover:via-indigo-500 hover:to-purple-500 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 shrink-0"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Làm bài</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 pb-24 md:pb-12">
      {/* ===================================================================== */}
      {/* THANH ĐIỀU HƯỚNG & HÀNH ĐỘNG CHÍNH PHONG CÁCH HOLOGRAM NHẸ + NÚT MỞ GÓC TRI THỨC */}
      {/* ===================================================================== */}
      <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-[#0F172A] via-slate-900 to-indigo-950 text-white shadow-md border border-indigo-500/30 relative overflow-hidden">
        {/* Ánh sắc hologram nhẹ nhàng tinh tế ở nền */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-24 w-72 h-72 rounded-full bg-gradient-to-tr from-cyan-400/20 via-indigo-400/20 to-pink-400/20 blur-2xl"
        />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-gradient-to-r from-cyan-500/20 via-indigo-500/20 to-pink-500/20 text-cyan-200 border border-cyan-400/30">
                <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
                <span>Không gian Luyện tập Ngữ văn 12 · Cấu trúc Đề thi THPT 2025–2026</span>
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-white/10 text-stone-200 border border-white/15">
                {structuredRecs.basisBadgeLabel}
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl lg:text-3xl font-serif-literary font-bold text-white leading-tight">
              {currentUser?.fullName
                ? `Chào ${currentUser.fullName}, hôm nay bạn muốn rèn kĩ năng nào?`
                : 'Lộ trình Luyện Đọc hiểu & Viết Nghị luận cá nhân hóa'}
            </h1>

            <p className="text-xs sm:text-sm text-stone-300 leading-relaxed">
              {structuredRecs.basisExplanation}
            </p>
          </div>

          {/* Cụm nút hành động chính phong cách Hologram nhẹ + Liên kết gọn mở Góc tri thức */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleQuickStartPractice}
              className="min-h-[44px] px-4 py-2.5 rounded-xl font-bold text-xs text-white shadow-md transition-all duration-200 cursor-pointer flex items-center gap-2 bg-gradient-to-r from-cyan-500 via-indigo-500 to-purple-600 hover:from-cyan-400 hover:via-indigo-400 hover:to-purple-500 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-cyan-300 border border-white/25"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Làm bài ngay</span>
            </button>

            <button
              type="button"
              onClick={handleContinueWorking}
              className="min-h-[44px] px-4 py-2.5 rounded-xl font-bold text-xs text-cyan-100 bg-white/10 hover:bg-white/20 border border-cyan-300/40 transition-all duration-200 cursor-pointer flex items-center gap-2 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-cyan-300"
            >
              <PenTool className="w-4 h-4 text-cyan-300" />
              <span>Tiếp tục bài đang làm</span>
            </button>

            <button
              type="button"
              onClick={handleViewResults}
              className="min-h-[44px] px-4 py-2.5 rounded-xl font-bold text-xs text-pink-100 bg-white/10 hover:bg-white/20 border border-pink-300/40 transition-all duration-200 cursor-pointer flex items-center gap-2 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-pink-300"
            >
              <BarChart3 className="w-4 h-4 text-pink-300" />
              <span>Xem kết quả</span>
            </button>

            {/* Nút nhỏ gọn "Mở Góc tri thức" (Thay cho phần trình bày dài trên trang chủ) */}
            <button
              type="button"
              onClick={() => onNavigateTab('knowledge')}
              className="min-h-[44px] px-3.5 py-2.5 rounded-xl font-semibold text-xs text-emerald-200 bg-emerald-950/60 hover:bg-emerald-900/70 border border-emerald-400/30 transition-all cursor-pointer flex items-center gap-1.5 active:scale-[0.98]"
              title="Mở trang Góc tri thức Ngữ văn 12"
            >
              <BookOpen className="w-3.5 h-3.5 text-emerald-300" />
              <span>Mở Góc tri thức</span>
            </button>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* THÔNG BÁO TIẾN ĐỘ MỤC TIÊU HÀNG TUẦN (NHẮC NHỞ KHOẢNG CÁCH ĐIỂM HIỆN TẠI & MỤC TIÊU KHẢO SÁT) */}
      {/* ===================================================================== */}
      {!isWeeklyGoalBannerDismissed ? (
        <section
          role="region"
          aria-label="Thông báo tiến độ mục tiêu hàng tuần"
          className={`p-5 sm:p-6 rounded-2xl border shadow-xs transition-all relative overflow-hidden ${
            weeklyGoalProgress.isTargetReached
              ? 'bg-gradient-to-r from-emerald-50/90 via-teal-50/70 to-white border-emerald-300/90'
              : weeklyGoalProgress.currentScore !== null
              ? 'bg-gradient-to-r from-amber-50/90 via-orange-50/50 to-white border-amber-300/90'
              : 'bg-gradient-to-r from-indigo-50/90 via-cyan-50/50 to-white border-indigo-200/90'
          }`}
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            {/* Cột trái: Nội dung nhắc nhở khoảng cách điểm & lộ trình tuần */}
            <div className="space-y-2.5 max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border ${
                    weeklyGoalProgress.isTargetReached
                      ? 'bg-emerald-900 text-emerald-100 border-emerald-800'
                      : 'bg-[#0F172A] text-amber-300 border-slate-800'
                  }`}
                >
                  <BellRing className="w-3.5 h-3.5 shrink-0" />
                  <span>Thông báo tiến độ mục tiêu hàng tuần</span>
                </span>

                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-white/90 border border-stone-200 text-[11px] font-semibold text-stone-700">
                  <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                  <span>
                    Tuần này: <strong className="font-mono">{weeklyGoalProgress.weeklyTotalCount}/{weeklyGoalProgress.weeklySessionGoal}</strong> bài luyện ({weeklyGoalProgress.weeklyReadingCount} Đọc hiểu · {weeklyGoalProgress.weeklyWritingCount} Viết)
                  </span>
                </span>

                {!survey.isCompleted && (
                  <span className="px-2.5 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-bold">
                    Chưa hoàn tất khảo sát mục tiêu
                  </span>
                )}
              </div>

              {/* Tiêu đề chính báo rõ khoảng cách giữa điểm hiện tại và mục tiêu khảo sát */}
              <h2 className="text-base sm:text-lg font-serif-literary font-bold text-[#0F172A] leading-snug">
                {weeklyGoalProgress.currentScore === null ? (
                  <>
                    Mục tiêu khảo sát của bạn là{' '}
                    <span className="font-mono text-indigo-900">
                      {formatVNDecimal(weeklyGoalProgress.targetScore)}/10,0 điểm
                    </span>{' '}
                    — Hãy hoàn thành bài luyện đầu tiên trong tuần để đo khoảng cách điểm thực tế!
                  </>
                ) : weeklyGoalProgress.isTargetReached ? (
                  <>
                    Tuyệt vời! Điểm hiện tại của bạn (
                    <span className="font-mono text-emerald-800">
                      {formatVNDecimal(weeklyGoalProgress.currentScore)}/10,0
                    </span>
                    ) đã đạt mục tiêu khảo sát{' '}
                    <span className="font-mono text-emerald-900">
                      {formatVNDecimal(weeklyGoalProgress.targetScore)}/10,0 điểm
                    </span>
                    .
                  </>
                ) : (
                  <>
                    Nhắc nhở mục tiêu tuần: Bạn còn cách mục tiêu khảo sát{' '}
                    <span className="font-mono text-rose-700 underline decoration-rose-300 underline-offset-4">
                      +{formatVNDecimal(weeklyGoalProgress.scoreGap)} điểm
                    </span>{' '}
                    (Hiện tại:{' '}
                    <span className="font-mono text-stone-900">
                      {formatVNDecimal(weeklyGoalProgress.currentScore)}/10,0
                    </span>{' '}
                    → Mục tiêu:{' '}
                    <span className="font-mono text-indigo-900">
                      {formatVNDecimal(weeklyGoalProgress.targetScore)}/10,0 điểm
                    </span>
                    )
                  </>
                )}
              </h2>

              <p className="text-xs text-stone-700 leading-relaxed">
                <strong className="text-stone-900">Nguồn đối chiếu:</strong>{' '}
                {weeklyGoalProgress.scoreSourceLabel}. {weeklyGoalProgress.focusAdvice}
              </p>

              {/* Thanh đo trực quan khoảng cách điểm & tiến độ bài luyện tuần */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* Thanh 1: Tiến độ điểm số so với mục tiêu khảo sát */}
                <div className="p-3 rounded-xl bg-white/95 border border-stone-200/90 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-stone-700">
                      Tiến độ chạm mốc {formatVNDecimal(weeklyGoalProgress.targetScore)}/10,0đ:
                    </span>
                    <span className="font-mono font-bold text-[#0F172A]">
                      {weeklyGoalProgress.currentScore !== null
                        ? `${formatVNDecimal(weeklyGoalProgress.currentScore)} / ${formatVNDecimal(weeklyGoalProgress.targetScore)}đ (${weeklyGoalProgress.progressPct}%)`
                        : `— / ${formatVNDecimal(weeklyGoalProgress.targetScore)}đ`}
                    </span>
                  </div>
                  <div
                    className="w-full h-2.5 bg-stone-200 rounded-full overflow-hidden"
                    role="progressbar"
                    aria-valuenow={weeklyGoalProgress.progressPct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Tiến độ điểm hiện tại so với mục tiêu khảo sát"
                  >
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        weeklyGoalProgress.isTargetReached
                          ? 'bg-gradient-to-r from-teal-500 to-emerald-500'
                          : 'bg-gradient-to-r from-amber-500 via-orange-500 to-indigo-600'
                      }`}
                      style={{ width: `${weeklyGoalProgress.progressPct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-stone-500 font-mono">
                    <span>0,0đ</span>
                    <span>
                      {weeklyGoalProgress.scoreGap !== null && weeklyGoalProgress.scoreGap > 0
                        ? `Cần bù thêm +${formatVNDecimal(weeklyGoalProgress.scoreGap)}đ`
                        : weeklyGoalProgress.isTargetReached
                        ? 'Đã hoàn thành mục tiêu điểm'
                        : 'Chưa có bài chấm'}
                    </span>
                    <span>Mục tiêu {formatVNDecimal(weeklyGoalProgress.targetScore)}đ</span>
                  </div>
                </div>

                {/* Thanh 2: Tần suất luyện tập trong 7 ngày qua */}
                <div className="p-3 rounded-xl bg-white/95 border border-stone-200/90 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-stone-700">
                      Cam kết rèn luyện tuần này:
                    </span>
                    <span className="font-mono font-bold text-indigo-950">
                      {weeklyGoalProgress.weeklyTotalCount}/{weeklyGoalProgress.weeklySessionGoal} bài ({weeklyGoalProgress.weeklySessionPct}%)
                    </span>
                  </div>
                  <div
                    className="w-full h-2.5 bg-stone-200 rounded-full overflow-hidden"
                    role="progressbar"
                    aria-valuenow={weeklyGoalProgress.weeklySessionPct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Tiến độ số bài luyện tập trong tuần"
                  >
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-indigo-600 transition-all duration-500"
                      style={{ width: `${Math.max(4, weeklyGoalProgress.weeklySessionPct)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-stone-500">
                    <span>
                      {weeklyGoalProgress.weeklyTotalCount >= weeklyGoalProgress.weeklySessionGoal
                        ? 'Đã đạt định mức bài luyện tuần!'
                        : `Còn ${weeklyGoalProgress.weeklySessionGoal - weeklyGoalProgress.weeklyTotalCount} bài để đạt nhịp tuần`}
                    </span>
                    <span className="font-mono">7 ngày gần nhất</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Cột phải: Cụm nút hành động thu hẹp khoảng cách mục tiêu */}
            <div className="flex flex-wrap lg:flex-col items-stretch sm:items-center lg:items-end justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (primaryRecommendedExercise) {
                    onStartExercise(primaryRecommendedExercise);
                  } else {
                    handleInstantQuickStart();
                  }
                }}
                className="min-h-[42px] px-4 py-2.5 rounded-xl bg-[#0F172A] hover:bg-slate-800 text-white font-bold text-xs shadow-2xs transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <TrendingUp className="w-4 h-4 text-amber-300" />
                <span>
                  {weeklyGoalProgress.scoreGap !== null && weeklyGoalProgress.scoreGap > 0
                    ? `Luyện bài rút ngắn +${formatVNDecimal(weeklyGoalProgress.scoreGap)} điểm`
                    : 'Luyện bài trọng tâm tuần này'}
                </span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onOpenSurvey}
                  className="min-h-[38px] px-3.5 py-2 rounded-xl bg-white hover:bg-stone-100 text-stone-800 border border-stone-300 font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Target className="w-3.5 h-3.5 text-indigo-700" />
                  <span>
                    {survey.isCompleted ? 'Điều chỉnh mục tiêu khảo sát' : 'Thiết lập mục tiêu khảo sát'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsWeeklyGoalBannerDismissed(true)}
                  className="min-h-[38px] px-2.5 py-2 rounded-xl bg-white/80 hover:bg-stone-200/70 text-stone-500 hover:text-stone-800 border border-stone-200 text-xs transition-colors cursor-pointer flex items-center gap-1"
                  title="Thu gọn thông báo mục tiêu tuần trong phiên này"
                  aria-label="Thu gọn thông báo tiến độ mục tiêu hàng tuần"
                >
                  <X className="w-3.5 h-3.5" />
                  <span className="sr-only sm:not-sr-only">Thu gọn</span>
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-amber-50/70 border border-amber-200/80 text-xs text-stone-700">
          <div className="flex items-center gap-2">
            <BellRing className="w-3.5 h-3.5 text-amber-700" />
            <span>
              Mục tiêu khảo sát: <strong className="font-mono">{formatVNDecimal(weeklyGoalProgress.targetScore)}/10,0đ</strong>
              {weeklyGoalProgress.scoreGap !== null && weeklyGoalProgress.scoreGap > 0
                ? ` · Còn cách mục tiêu +${formatVNDecimal(weeklyGoalProgress.scoreGap)} điểm`
                : ''}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsWeeklyGoalBannerDismissed(false)}
            className="font-bold text-indigo-800 hover:underline cursor-pointer"
          >
            Mở lại thông báo tiến độ tuần
          </button>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TÍNH NĂNG "LUYỆN TẬP NHANH" (1 BƯỚC — CHỌN KỸ NĂNG & BẮT ĐẦU NGẪU NHIÊN THEO ƯU TIÊN) */}
      {/* ===================================================================== */}
      <section
        aria-label="Luyện tập nhanh theo mức độ ưu tiên"
        className="p-5 sm:p-6 bg-white rounded-2xl border-2 border-indigo-200/90 shadow-xs space-y-4 relative overflow-hidden"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-stone-100 pb-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-indigo-950 text-cyan-200 text-xs font-bold">
                <Zap className="w-3.5 h-3.5 text-amber-300 fill-current" />
                <span>Luyện tập nhanh · 1 chạm vào thẳng bài làm</span>
              </span>
              {quickPracticePreview && (
                <span className="px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-900 border border-emerald-200 text-[11px] font-bold">
                  {quickPracticePreview.priorityBadge} ({quickPracticePreview.matchingPoolCount} đề sẵn sàng)
                </span>
              )}
            </div>
            <h2 className="text-lg sm:text-xl font-serif-literary font-bold text-[#0F172A]">
              Chọn nhanh kỹ năng & Bắt đầu bài tập ngẫu nhiên theo độ ưu tiên
            </h2>
            <p className="text-xs text-stone-600">
              Hệ thống tự động rút ngẫu nhiên một đề đã xuất bản (kèm Rubric chuẩn) ưu tiên các kỹ năng bạn cần củng cố nhất mà không cần lọc qua nhiều bước.
            </p>
          </div>

          {/* Bộ nút Chọn nhanh kỹ năng (Đọc hiểu / Viết) + Nút Vào thẳng 1 chạm */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div
              role="group"
              aria-label="Chọn kỹ năng luyện tập nhanh"
              className="inline-flex items-center p-1 rounded-xl bg-stone-100 border border-stone-200"
            >
              <button
                type="button"
                onClick={() => setQuickSkillFocus('reading')}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  quickSkillFocus === 'reading'
                    ? 'bg-[#0F172A] text-white shadow-2xs'
                    : 'text-stone-700 hover:text-stone-950'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
                <span>Kỹ năng Đọc hiểu (4,0đ)</span>
              </button>

              <button
                type="button"
                onClick={() => setQuickSkillFocus('writing')}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  quickSkillFocus !== 'reading'
                    ? 'bg-[#0F172A] text-white shadow-2xs'
                    : 'text-stone-700 hover:text-stone-950'
                }`}
              >
                <PenTool className="w-3.5 h-3.5 text-emerald-400" />
                <span>Kỹ năng Viết (2,0đ / 4,0đ)</span>
              </button>
            </div>

            {quickSkillFocus !== 'reading' && (
              <div className="inline-flex items-center p-1 rounded-xl bg-stone-100 border border-stone-200 text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setQuickWritingSubFocus('writing')}
                  className={`px-2.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                    quickWritingSubFocus === 'writing'
                      ? 'bg-indigo-900 text-white'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  Ngẫu nhiên cả 2
                </button>
                <button
                  type="button"
                  onClick={() => setQuickWritingSubFocus('writing_paragraph')}
                  className={`px-2.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                    quickWritingSubFocus === 'writing_paragraph'
                      ? 'bg-indigo-900 text-white'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  Đoạn 200 chữ
                </button>
                <button
                  type="button"
                  onClick={() => setQuickWritingSubFocus('writing_essay')}
                  className={`px-2.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                    quickWritingSubFocus === 'writing_essay'
                      ? 'bg-indigo-900 text-white'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  Bài 600 chữ
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Khung xem nhanh bài ngẫu nhiên được hệ thống chọn + Các nút hành động 1 bước */}
        {quickPracticePreview ? (
          <div className="p-4 rounded-xl bg-gradient-to-r from-slate-50 via-indigo-50/40 to-cyan-50/40 border border-indigo-200/80 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1.5 max-w-3xl">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="px-2.5 py-0.5 rounded-md bg-stone-900 text-white font-bold text-[11px]">
                  {quickPracticePreview.selectedExercise.taskFormatLabel ||
                    (quickPracticePreview.selectedExercise.sectionType === 'reading'
                      ? 'Đọc hiểu văn bản'
                      : 'Viết nghị luận')}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-950 font-bold text-[11px]">
                  Mức độ: {quickPracticePreview.selectedExercise.level}
                </span>
                <span className="inline-flex items-center gap-1 text-stone-600 font-mono text-[11px]">
                  <Clock className="w-3 h-3" />
                  <span>{quickPracticePreview.selectedExercise.estimatedMinutes} phút</span>
                </span>
                <span className="text-emerald-800 font-semibold text-[11px] flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Mã Rubric: {quickPracticePreview.selectedExercise.rubricId}</span>
                </span>
              </div>

              <h3 className="text-base font-serif-literary font-bold text-[#0F172A]">
                {quickPracticePreview.selectedExercise.title}
              </h3>

              <p className="text-xs text-stone-700 leading-relaxed">
                <strong className="text-indigo-950">Lý do ưu tiên:</strong>{' '}
                {quickPracticePreview.selectedExercise.reason}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={handleReshuffleQuickExercise}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white hover:bg-stone-100 text-stone-800 border border-stone-300 font-semibold text-xs transition-all cursor-pointer flex items-center gap-1.5 active:scale-[0.98]"
                title="Đổi ngẫu nhiên một đề ưu tiên khác"
              >
                <Shuffle className="w-3.5 h-3.5 text-indigo-700" />
                <span>Đổi đề ngẫu nhiên</span>
              </button>

              <button
                type="button"
                onClick={() => handleInstantQuickStart()}
                className="min-h-[44px] px-5 py-2.5 rounded-xl font-bold text-xs text-white shadow-sm transition-all duration-200 cursor-pointer flex items-center gap-2 bg-gradient-to-r from-cyan-600 via-indigo-600 to-purple-600 hover:from-cyan-500 hover:via-indigo-500 hover:to-purple-500 active:scale-[0.98]"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>
                  Bắt đầu ngay ({quickSkillFocus === 'reading' ? 'Đọc hiểu' : 'Viết'})
                </span>
              </button>
            </div>
          </div>
        ) : null}

        {/* Hai nút tắt 1 chạm cực nhanh: Bấm vào là rút ngẫu nhiên và mở thẳng bài làm */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-stone-600">
          <span>
            Hoặc vào thẳng <strong>ngẫu nhiên 1 bước</strong> không cần xem trước:
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setQuickSkillFocus('reading');
                const picked = pickPriorityRandomQuickExercise(
                  'reading',
                  survey,
                  readingAttempts,
                  writingRecords,
                  lastQuickExerciseId
                );
                if (picked?.selectedExercise) {
                  setLastQuickExerciseId(picked.selectedExercise.id);
                  onStartExercise(picked.selectedExercise);
                }
              }}
              className="px-3 py-1.5 rounded-lg bg-cyan-50 hover:bg-cyan-100 text-cyan-950 border border-cyan-200 font-bold text-xs transition-colors cursor-pointer inline-flex items-center gap-1.5"
            >
              <Zap className="w-3.5 h-3.5 text-cyan-700" />
              <span>Bắt đầu ngẫu nhiên Đọc hiểu</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setQuickSkillFocus('writing');
                const picked = pickPriorityRandomQuickExercise(
                  'writing',
                  survey,
                  readingAttempts,
                  writingRecords,
                  lastQuickExerciseId
                );
                if (picked?.selectedExercise) {
                  setLastQuickExerciseId(picked.selectedExercise.id);
                  onStartExercise(picked.selectedExercise);
                }
              }}
              className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-950 border border-emerald-200 font-bold text-xs transition-colors cursor-pointer inline-flex items-center gap-1.5"
            >
              <Zap className="w-3.5 h-3.5 text-emerald-700" />
              <span>Bắt đầu ngẫu nhiên Viết nghị luận</span>
            </button>
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* KHU VỰC 1: SƠ ĐỒ "KẾT QUẢ LUYỆN TẬP CỦA BẠN" (3 CHỈ SỐ: 4,0 + 2,0 + 4,0) */}
      {/* ===================================================================== */}
      <section
        ref={resultsSectionRef}
        className="p-5 sm:p-6 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-5 scroll-mt-20"
      >
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-100 pb-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-900 border border-teal-200 text-xs font-bold">
              <Award className="w-3.5 h-3.5 text-teal-700" />
              <span>Chuẩn Thang điểm 10,0 THPT (4,0 + 2,0 + 4,0)</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-serif-literary font-bold text-[#0F172A]">
              Kết quả luyện tập của bạn
            </h2>
            <p className="text-xs text-stone-600">
              Chỉ dùng điểm Giáo viên đã duyệt làm kết quả chính thức. Lưu ý: Phần trăm hiển thị là{' '}
              <strong className="text-stone-900">“quy đổi theo mức tiến bộ”</strong> (Trung bình/cần củng cố: 0–59%, Khá: 60–79%, Tốt: 80–100%), không phải điểm thi gốc và không làm tròn điểm gốc để đẩy mức.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Tổng điểm chính thức (nếu có) */}
            <div className="px-3.5 py-2 rounded-xl bg-stone-50 border border-stone-200 text-right">
              <span className="text-[10px] uppercase tracking-wider text-stone-500 font-bold block">
                Tổng điểm chính thức (GV duyệt)
              </span>
              <span className="text-base font-mono font-bold text-emerald-800">
                {analytics.actualOverallScore !== null
                  ? `${formatVNDecimal(analytics.actualOverallScore)}/10,0 điểm (${analytics.teacherApprovedCount} bài)`
                  : 'Chưa có dữ liệu'}
              </span>
            </div>

            <button
              type="button"
              onClick={onOpenSurvey}
              className="min-h-[42px] px-3.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <ClipboardCheck className="w-4 h-4 text-stone-600" />
              <span>{survey.isCompleted ? 'Cập nhật khảo sát' : 'Khảo sát năng lực'}</span>
            </button>
          </div>
        </div>

        {/* Ba chỉ số riêng: Đọc hiểu (/4,0), Đoạn văn 200 chữ (/2,0), Bài văn 600 chữ (/4,0) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
          {renderSectionMasteryCard(analytics.sectionProgress.reading, 'Phần I · Đọc hiểu')}
          {renderSectionMasteryCard(analytics.sectionProgress.paragraph, 'Phần II.1 · Đoạn văn 200 chữ')}
          {renderSectionMasteryCard(analytics.sectionProgress.essay, 'Phần II.2 · Bài văn 600 chữ')}
        </div>

        {/* Bảng chú giải ngưỡng điểm khép kín & minh bạch nguồn điểm */}
        <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200/80 text-xs text-stone-600 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-bold text-stone-800 flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-stone-500" />
              <span>Màu trạng thái tiến độ:</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span>Tốt (80–100%)</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span>Khá (60–79%)</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              <span>Trung bình / cần củng cố (0–59%)</span>
            </span>
          </div>

          <button
            type="button"
            onClick={() => onNavigateTab('portfolio')}
            className="text-xs font-bold text-indigo-700 hover:text-indigo-900 flex items-center gap-1 cursor-pointer self-start sm:self-auto"
          >
            <span>Xem chi tiết Hồ sơ học tập</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* KHU VỰC 2: "BÀI LUYỆN PHÙ HỢP VỚI BẠN" (CHIA RÕ 3 NHÓM A, B, C)       */}
      {/* ===================================================================== */}
      <section
        ref={practiceSectionRef}
        className="space-y-6 scroll-mt-20"
      >
        <div className="p-5 sm:p-6 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-5">
          {/* Header khu vực gợi ý */}
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-100 pb-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-900 border border-indigo-200 text-xs font-bold">
                  <Target className="w-3.5 h-3.5 text-indigo-700" />
                  <span>Chỉ gợi ý đề Ngân hàng Giáo viên đã xuất bản</span>
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                    structuredRecs.isInitialSurveyBasis
                      ? 'bg-amber-50 text-amber-900 border-amber-300'
                      : 'bg-emerald-50 text-emerald-900 border-emerald-300'
                  }`}
                >
                  {structuredRecs.basisBadgeLabel}
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-serif-literary font-bold text-[#0F172A]">
                Bài luyện phù hợp với bạn
              </h2>
              <p className="text-xs text-stone-600">
                {structuredRecs.basisExplanation}
              </p>
            </div>

            <button
              type="button"
              onClick={() => onNavigateTab('knowledge')}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <BookOpen className="w-3.5 h-3.5 text-emerald-700" />
              <span>Mở Góc tri thức</span>
            </button>
          </div>

          {/* ----------------------------------------------------------------- */}
          {/* NHÓM A: ĐỌC HIỂU (CHỌN 3 LOẠI VĂN BẢN: VĂN HỌC / NGHỊ LUẬN / THÔNG TIN) */}
          {/* ----------------------------------------------------------------- */}
          <div className="p-4 sm:p-5 rounded-2xl bg-stone-50/70 border border-stone-200/90 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-md bg-teal-700 text-white text-xs font-bold">
                    Nhóm A · Đọc hiểu (4,0 điểm)
                  </span>
                  <span className="text-xs text-stone-500 font-medium">
                    Chọn loại văn bản muốn rèn luyện:
                  </span>
                </div>
                <p className="text-xs text-stone-600 mt-1">
                  Đề xuất ngữ liệu theo kết quả giáo viên xác nhận, các câu đọc hiểu thường mất điểm và mức tự đánh giá.
                </p>
              </div>

              {/* Bộ chọn 3 loại văn bản Đọc hiểu */}
              <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Chọn loại văn bản đọc hiểu">
                {(
                  [
                    { key: 'van_hoc', label: 'Văn bản văn học' },
                    { key: 'nghi_luan', label: 'Văn bản nghị luận' },
                    { key: 'thong_tin', label: 'Văn bản thông tin' }
                  ] as const
                ).map((tab) => {
                  const isActive = selectedReadingTextType === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setSelectedReadingTextType(tab.key)}
                      className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                        isActive
                          ? 'bg-gradient-to-r from-teal-600 to-indigo-600 text-white border-transparent shadow-xs'
                          : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-100'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {structuredRecs.readingRecommendations.map((rec) =>
                renderRecommendationCard(rec, 'emerald')
              )}
            </div>
          </div>

          {/* ----------------------------------------------------------------- */}
          {/* NHÓM B: ĐOẠN VĂN KHOẢNG 200 CHỮ (CHIA RIÊNG 2.1 NLXH & 2.2 NLVH)   */}
          {/* ----------------------------------------------------------------- */}
          <div className="p-4 sm:p-5 rounded-2xl bg-stone-50/70 border border-stone-200/90 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-md bg-indigo-700 text-white text-xs font-bold">
                    Nhóm B · Đoạn văn khoảng 200 chữ (2,0 điểm)
                  </span>
                  <span className="text-xs text-stone-500 font-medium">
                    Chọn đúng dạng đoạn văn:
                  </span>
                </div>
                <p className="text-xs text-stone-600 mt-1">
                  Chỉ gợi ý đề ngân hàng đúng dạng đã chọn (tuyệt đối không trộn đề Nghị luận xã hội vào mục Nghị luận văn học hoặc ngược lại).
                </p>
              </div>

              {/* Hai lựa chọn riêng: 2.1. Nghị luận xã hội & 2.2. Nghị luận văn học */}
              <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Chọn dạng đoạn văn 200 chữ">
                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedParagraphArgType === 'nghi_luan_xa_hoi'}
                  onClick={() => setSelectedParagraphArgType('nghi_luan_xa_hoi')}
                  className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                    selectedParagraphArgType === 'nghi_luan_xa_hoi'
                      ? 'bg-gradient-to-r from-cyan-600 via-indigo-600 to-purple-600 text-white border-transparent shadow-xs'
                      : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-100'
                  }`}
                >
                  2.1. Nghị luận xã hội (Đoạn 200 chữ)
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedParagraphArgType === 'nghi_luan_van_hoc'}
                  onClick={() => setSelectedParagraphArgType('nghi_luan_van_hoc')}
                  className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                    selectedParagraphArgType === 'nghi_luan_van_hoc'
                      ? 'bg-gradient-to-r from-cyan-600 via-indigo-600 to-purple-600 text-white border-transparent shadow-xs'
                      : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-100'
                  }`}
                >
                  2.2. Nghị luận văn học (Đoạn 200 chữ)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {structuredRecs.paragraphRecommendations.map((rec) =>
                renderRecommendationCard(rec, 'indigo')
              )}
            </div>
          </div>

          {/* ----------------------------------------------------------------- */}
          {/* NHÓM C: BÀI VĂN KHOẢNG 600 CHỮ (CHIA RIÊNG 2.1 NLXH & 2.2 NLVH)   */}
          {/* ----------------------------------------------------------------- */}
          <div className="p-4 sm:p-5 rounded-2xl bg-stone-50/70 border border-stone-200/90 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-md bg-purple-800 text-white text-xs font-bold">
                    Nhóm C · Bài văn khoảng 600 chữ (4,0 điểm)
                  </span>
                  <span className="text-xs text-stone-500 font-medium">
                    Chọn đúng dạng bài văn:
                  </span>
                </div>
                <p className="text-xs text-stone-600 mt-1">
                  Gợi ý đúng dạng bài (2.1 Nghị luận xã hội hoặc 2.2 Nghị luận văn học), độ khó và mục tiêu kĩ năng lập luận.
                </p>
              </div>

              {/* Hai lựa chọn riêng: 2.1. Nghị luận xã hội & 2.2. Nghị luận văn học */}
              <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Chọn dạng bài văn 600 chữ">
                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedEssayArgType === 'nghi_luan_xa_hoi'}
                  onClick={() => setSelectedEssayArgType('nghi_luan_xa_hoi')}
                  className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                    selectedEssayArgType === 'nghi_luan_xa_hoi'
                      ? 'bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white border-transparent shadow-xs'
                      : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-100'
                  }`}
                >
                  2.1. Nghị luận xã hội (Bài 600 chữ)
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedEssayArgType === 'nghi_luan_van_hoc'}
                  onClick={() => setSelectedEssayArgType('nghi_luan_van_hoc')}
                  className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                    selectedEssayArgType === 'nghi_luan_van_hoc'
                      ? 'bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white border-transparent shadow-xs'
                      : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-100'
                  }`}
                >
                  2.2. Nghị luận văn học (Bài 600 chữ)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {structuredRecs.essayRecommendations.map((rec) =>
                renderRecommendationCard(rec, 'purple')
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* THANH THAO TÁC NHANH TRÊN ĐIỆN THOẠI (DỄ BẤM BẰNG NGÓN CÁI - YÊU CẦU 5) */}
      {/* ===================================================================== */}
      <div
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-md border-t border-indigo-500/30 px-3 py-2 shadow-lg"
        role="navigation"
        aria-label="Thanh thao tác nhanh trên điện thoại"
      >
        <div className="grid grid-cols-3 gap-2 max-w-md mx-auto">
          <button
            type="button"
            onClick={handleQuickStartPractice}
            className="min-h-[46px] px-2 py-2 rounded-xl font-bold text-[11px] text-white bg-gradient-to-r from-cyan-500 via-indigo-500 to-purple-600 active:scale-[0.97] flex flex-col items-center justify-center gap-0.5 cursor-pointer shadow-xs"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Làm bài</span>
          </button>

          <button
            type="button"
            onClick={handleContinueWorking}
            className="min-h-[46px] px-2 py-2 rounded-xl font-bold text-[11px] text-cyan-100 bg-white/10 border border-cyan-400/30 active:scale-[0.97] flex flex-col items-center justify-center gap-0.5 cursor-pointer"
          >
            <PenTool className="w-4 h-4 text-cyan-300" />
            <span>Tiếp tục bài</span>
          </button>

          <button
            type="button"
            onClick={handleViewResults}
            className="min-h-[46px] px-2 py-2 rounded-xl font-bold text-[11px] text-pink-100 bg-white/10 border border-pink-400/30 active:scale-[0.97] flex flex-col items-center justify-center gap-0.5 cursor-pointer"
          >
            <BarChart3 className="w-4 h-4 text-pink-300" />
            <span>Xem kết quả</span>
          </button>
        </div>
      </div>
    </div>
  );
};
