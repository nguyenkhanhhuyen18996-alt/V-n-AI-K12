import React, { useState, useRef, useMemo } from 'react';
import { ReadingAttempt, WritingSubmissionRecord } from '../types';
import {
  Award,
  BookOpen,
  PenTool,
  Clock,
  AlertTriangle,
  Copy,
  Check,
  Trash2,
  TrendingUp,
  SlidersHorizontal,
  Calendar,
  Filter,
  RotateCcw
} from 'lucide-react';
import { GoogleDriveManager } from './GoogleDriveManager';
import { PortfolioProgressChart } from './PortfolioProgressChart';
import { PeriodicReviewToast } from './PeriodicReviewToast';
import { PortfolioScorePredictionCard } from './PortfolioScorePredictionCard';
import { PortfolioWritingErrorChart } from './PortfolioWritingErrorChart';
import {
  filterPortfolioHistoryRecords,
  PortfolioSkillFilter,
  PortfolioTimeFilter
} from '../services/reviewCadenceService';

interface LearningPortfolioProps {
  studentUid?: string;
  readingAttempts: ReadingAttempt[];
  writingRecords: WritingSubmissionRecord[];
  targetScore?: number;
  onClearHistory: () => void;
  onGoToReading: () => void;
  onGoToWriting: () => void;
  onImportContent?: (title: string, content: string, type: 'reading' | 'writing') => void;
  onOpenSurvey?: () => void;
}

export const LearningPortfolio: React.FC<LearningPortfolioProps> = ({
  studentUid = 'guest_local',
  readingAttempts,
  writingRecords,
  targetScore = 8.0,
  onClearHistory,
  onGoToReading,
  onGoToWriting,
  onImportContent,
  onOpenSurvey
}) => {
  const [activeTab, setActiveTab] = useState<PortfolioSkillFilter>('all');
  const [timeFilter, setTimeFilter] = useState<PortfolioTimeFilter>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const historyListRef = useRef<HTMLDivElement>(null);

  const totalReadingCount = readingAttempts.length;
  const totalWritingCount = writingRecords.length;
  const totalRevisionsCount =
    readingAttempts.filter((r) => !!r.improvedAnswer).length +
    writingRecords.reduce((acc, curr) => acc + curr.revisions.length, 0);

  const filteredHistory = useMemo(
    () =>
      filterPortfolioHistoryRecords(
        readingAttempts,
        writingRecords,
        activeTab,
        timeFilter
      ),
    [readingAttempts, writingRecords, activeTab, timeFilter]
  );

  const {
    filteredReadingAttempts,
    filteredWritingRecords,
    totalFilteredCount,
    countsBySkillForActiveTime,
    countsByTimeForActiveSkill
  } = filteredHistory;

  const isFilterActive = activeTab !== 'all' || timeFilter !== 'all';

  const handleResetFilters = () => {
    setActiveTab('all');
    setTimeFilter('all');
  };

  const handleCopyRecord = (textToCopy: string, id: string) => {
    navigator.clipboard.writeText(textToCopy);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Header khu vực */}
      <div className="space-y-2 border-b border-stone-200 pb-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif-literary font-bold text-[#0F172A]">
              Hồ sơ học tập & Nhật ký rèn luyện
            </h1>
            <p className="text-sm text-stone-600 mt-1">
              Theo dõi lịch sử thử sức, các góp ý sư phạm và sự tiến bộ qua các bản tự chỉnh sửa của bạn.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {onOpenSurvey && (
              <button
                onClick={onOpenSurvey}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs bg-white text-stone-800 hover:bg-stone-50 border border-stone-300 rounded-lg font-semibold transition-colors shadow-2xs cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-blue-700" />
                <span>Thiết lập lộ trình học tập & Mục tiêu</span>
              </button>
            )}
            {(totalReadingCount > 0 || totalWritingCount > 0) && (
              <button
                onClick={onClearHistory}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-stone-600 hover:text-red-700 hover:bg-red-50 border border-stone-200 rounded-lg transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa nhật ký phiên này</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* BANNER THÔNG BÁO MINH BẠCH BẮT BUỘC THEO YÊU CẦU & KẾT NỐI GOOGLE DRIVE */}
      <div className="p-4 rounded-xl bg-amber-50/90 border border-amber-300 text-amber-950 text-xs sm:text-sm flex gap-3.5 items-start">
        <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h2 className="font-bold text-amber-900">
            Thông báo minh bạch về lưu trữ dữ liệu (Bản thử nghiệm v1.0)
          </h2>
          <p className="leading-relaxed text-stone-700">
            Dữ liệu trên giao diện trình duyệt hiện được lưu tạm trong bộ nhớ phiên làm việc. Để lưu trữ bài viết an toàn và lâu dài, bạn có thể <strong>kết nối tài khoản Google Drive ngay bên dưới</strong> để đồng bộ trực tiếp mọi bài làm và bản sửa đổi vào thư mục riêng của bạn trên đám mây.
          </p>
        </div>
      </div>

      {/* KHỐI QUẢN LÝ ĐỒNG BỘ GOOGLE DRIVE */}
      <GoogleDriveManager onImportContent={onImportContent} />

      {/* Thẻ Thống kê nhanh */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-white border border-stone-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-stone-500 text-xs font-medium">
            <span>Bài đọc hiểu đã luyện</span>
            <BookOpen className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-[#0F172A] tabular-nums">
            {totalReadingCount}
          </div>
          <p className="text-[11px] text-stone-500">Câu trả lời đã được phân tích ngữ liệu</p>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-stone-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-stone-500 text-xs font-medium">
            <span>Bài viết nghị luận</span>
            <PenTool className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-[#0F172A] tabular-nums">
            {totalWritingCount}
          </div>
          <p className="text-[11px] text-stone-500">Đã qua rà soát 5 tiêu chí chấm thi</p>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-stone-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-stone-500 text-xs font-medium">
            <span>Lượt tự chỉnh sửa</span>
            <TrendingUp className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-bold text-[#0F172A] tabular-nums">
            {totalRevisionsCount}
          </div>
          <p className="text-[11px] text-stone-500">Bản viết hoàn thiện có kèm giải thích</p>
        </div>
      </div>

      {/* HỆ THỐNG NHẮC NHỞ ÔN TẬP ĐỊNH KỲ (TOAST NOTIFICATION) DỰA TRÊN TẦN SUẤT HỌC TẬP */}
      <PeriodicReviewToast
        studentUid={studentUid}
        readingAttempts={readingAttempts}
        writingRecords={writingRecords}
        onGoToReading={onGoToReading}
        onGoToWriting={onGoToWriting}
        onScrollToHistory={() => {
          historyListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
      />

      {/* DỰ ĐOÁN ĐIỂM SỐ DỰA TRÊN XU HƯỚNG PHÁT TRIỂN (TREND-BASED SCORE PREDICTION) */}
      <PortfolioScorePredictionCard
        readingAttempts={readingAttempts}
        writingRecords={writingRecords}
        targetScore={targetScore}
        onGoToReading={onGoToReading}
        onGoToWriting={onGoToWriting}
      />

      {/* BIỂU ĐỒ TIẾN TRÌNH ĐIỂM SỐ ĐỌC HIỂU & VIẾT THEO THỜI GIAN (RECHARTS) */}
      <PortfolioProgressChart
        readingAttempts={readingAttempts}
        writingRecords={writingRecords}
      />

      {/* PHÂN TÍCH XU HƯỚNG LỖI SAI PHỔ BIẾN TỪ LỊCH SỬ VIẾT BÀI (BIỂU ĐỒ CỘT RECHARTS) */}
      <PortfolioWritingErrorChart
        writingRecords={writingRecords}
        onGoToWriting={onGoToWriting}
      />

      {/* Bộ lọc lịch sử bài luyện theo Loại kỹ năng (Đọc hiểu / Viết) & Theo thời gian (Tuần / Tháng / Tất cả) */}
      <div
        ref={historyListRef}
        className="p-4 sm:p-5 rounded-2xl bg-white border border-stone-200 shadow-2xs space-y-3.5 scroll-mt-20"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Lọc theo loại kỹ năng */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-700 mr-1">
              <Filter className="w-3.5 h-3.5 text-blue-700" />
              <span>Loại kỹ năng:</span>
            </span>
            <div
              role="group"
              aria-label="Lọc theo loại kỹ năng"
              className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-stone-100 border border-stone-200 text-xs font-semibold"
            >
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'all'
                    ? 'bg-[#0F172A] text-white shadow-2xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                Tất cả ({countsBySkillForActiveTime.all})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('reading')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'reading'
                    ? 'bg-[#0F172A] text-white shadow-2xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5 text-blue-400" />
                <span>Đọc hiểu ({countsBySkillForActiveTime.reading})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('writing')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'writing'
                    ? 'bg-[#0F172A] text-white shadow-2xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <PenTool className="w-3.5 h-3.5 text-emerald-400" />
                <span>Viết nghị luận ({countsBySkillForActiveTime.writing})</span>
              </button>
            </div>
          </div>

          {/* Lọc theo thời gian (Tuần, Tháng, Tất cả) */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-700 mr-1">
              <Calendar className="w-3.5 h-3.5 text-emerald-700" />
              <span>Khoảng thời gian:</span>
            </span>
            <div
              role="group"
              aria-label="Lọc theo khoảng thời gian"
              className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-stone-100 border border-stone-200 text-xs font-semibold"
            >
              <button
                type="button"
                onClick={() => setTimeFilter('week')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  timeFilter === 'week'
                    ? 'bg-emerald-900 text-white shadow-2xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                Tuần này · 7 ngày ({countsByTimeForActiveSkill.week})
              </button>
              <button
                type="button"
                onClick={() => setTimeFilter('month')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  timeFilter === 'month'
                    ? 'bg-emerald-900 text-white shadow-2xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                Tháng này · 30 ngày ({countsByTimeForActiveSkill.month})
              </button>
              <button
                type="button"
                onClick={() => setTimeFilter('all')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  timeFilter === 'all'
                    ? 'bg-emerald-900 text-white shadow-2xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                Tất cả ({countsByTimeForActiveSkill.all})
              </button>
            </div>
          </div>
        </div>

        {/* Dòng tóm tắt kết quả lọc & nút đặt lại */}
        <div className="pt-2.5 border-t border-stone-100 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-600">
          <span>
            Đang hiển thị{' '}
            <strong className="text-[#0F172A]">{totalFilteredCount}</strong> bài luyện (
            {filteredReadingAttempts.length} Đọc hiểu · {filteredWritingRecords.length} Viết nghị luận)
            {timeFilter === 'week'
              ? ' trong 7 ngày gần nhất'
              : timeFilter === 'month'
              ? ' trong 30 ngày gần nhất'
              : ' trên toàn bộ lịch sử'}
            .
          </span>

          {isFilterActive && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Đặt lại bộ lọc</span>
            </button>
          )}
        </div>
      </div>

      {/* Trạng thái trống nếu chưa có bài nào trong toàn bộ hồ sơ */}
      {totalReadingCount === 0 && totalWritingCount === 0 && (
        <div className="p-12 text-center rounded-2xl bg-white border border-dashed border-stone-300 space-y-4">
          <Award className="w-12 h-12 text-stone-400 mx-auto" />
          <div className="space-y-1">
            <h2 className="text-base font-bold text-[#0F172A]">
              Chưa có bài rèn luyện nào trong phiên này
            </h2>
            <p className="text-xs text-stone-500 max-w-md mx-auto">
              Hãy bắt đầu thử sức bằng một câu hỏi đọc hiểu hoặc một bài viết nghị luận 200 chữ để xem phản hồi và tiến trình tự sửa của bạn.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={onGoToReading}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0F172A] text-white hover:bg-[#1E293B]"
            >
              Luyện Đọc hiểu ngay
            </button>
            <button
              onClick={onGoToWriting}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-800 text-white hover:bg-emerald-900"
            >
              Viết bài Nghị luận
            </button>
          </div>
        </div>
      )}

      {/* Trạng thái không có kết quả khớp bộ lọc (nhưng hồ sơ có dữ liệu) */}
      {(totalReadingCount > 0 || totalWritingCount > 0) && totalFilteredCount === 0 && (
        <div className="p-8 text-center rounded-2xl bg-stone-50 border border-dashed border-stone-300 space-y-3">
          <Calendar className="w-8 h-8 text-stone-400 mx-auto" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-[#0F172A]">
              Không tìm thấy bài luyện nào khớp với bộ lọc đã chọn
            </h3>
            <p className="text-xs text-stone-500 max-w-md mx-auto">
              Không có bài luyện thuộc nhóm{' '}
              <strong>
                {activeTab === 'reading'
                  ? 'Đọc hiểu'
                  : activeTab === 'writing'
                  ? 'Viết nghị luận'
                  : 'Tất cả kỹ năng'}
              </strong>{' '}
              trong khoảng thời gian{' '}
              <strong>
                {timeFilter === 'week'
                  ? '7 ngày qua (Tuần)'
                  : timeFilter === 'month'
                  ? '30 ngày qua (Tháng)'
                  : 'Tất cả'}
              </strong>
              .
            </p>
          </div>
          <button
            type="button"
            onClick={handleResetFilters}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0F172A] text-white hover:bg-stone-800 cursor-pointer inline-flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Xem tất cả lịch sử bài luyện ({totalReadingCount + totalWritingCount})</span>
          </button>
        </div>
      )}

      {/* DANH SÁCH BÀI VIẾT NGHỊ LUẬN */}
      {(activeTab === 'all' || activeTab === 'writing') && filteredWritingRecords.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-base font-serif-literary font-bold text-[#0F172A] flex items-center gap-2">
            <PenTool className="w-4 h-4 text-emerald-700" />
            <span>Lịch sử Huấn luyện viết ({filteredWritingRecords.length})</span>
          </h2>

          <div className="space-y-4">
            {filteredWritingRecords.map((rec) => {
              const exportText = `ĐỀ BÀI: ${rec.promptTitle}\n${rec.promptText}\n\nBẢN BAN ĐẦU (${rec.wordCount} từ):\n${rec.originalText}\n\n` +
                (rec.revisions.length > 0
                  ? `BẢN ĐÃ CHỈNH SỬA (${rec.revisions[0].wordCount} từ):\n${rec.revisions[0].revisedText}\n\nGIẢI THÍCH THAY ĐỔI:\n${rec.revisions[0].reflectionNote}`
                  : '');

              return (
                <div
                  key={rec.id}
                  className="p-5 sm:p-6 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-100 pb-3">
                    <div>
                      <div className="flex items-center gap-2 text-xs text-stone-500 mb-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{rec.createdAt}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-medium text-emerald-800">
                          {rec.type === 'nghi_luan_xa_hoi' ? 'Nghị luận xã hội' : 'Nghị luận văn học'}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-[#0F172A]">{rec.promptTitle}</h3>
                    </div>

                    <button
                      onClick={() => handleCopyRecord(exportText, rec.id)}
                      className="px-3 py-1.5 text-xs font-medium text-stone-600 hover:text-stone-900 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-lg flex items-center gap-1.5"
                    >
                      {copiedId === rec.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Đã sao chép!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Sao chép bản viết</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Bản ban đầu */}
                  <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200 text-xs space-y-1">
                    <span className="font-bold text-stone-700 block">
                      Bản ban đầu ({rec.wordCount} từ):
                    </span>
                    <p className="font-serif-literary text-stone-700 whitespace-pre-line leading-relaxed">
                      {rec.originalText}
                    </p>
                  </div>

                  {/* Đánh giá tiêu chí */}
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-stone-700 block">
                      Kết quả 5 tiêu chí:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2 text-[11px]">
                      {rec.feedback.criteria.map((c) => (
                        <div key={c.id} className="p-2 rounded-lg bg-stone-100 border border-stone-200 space-y-0.5">
                          <div className="font-semibold text-stone-800 truncate">{c.name.slice(3)}</div>
                          <div className="text-emerald-800 font-medium">{c.scoreLevel}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Bản chỉnh sửa nếu có */}
                  {rec.revisions.length > 0 && (
                    <div className="p-4 bg-emerald-50/60 rounded-xl border border-emerald-200 text-xs space-y-2">
                      <div className="flex items-center justify-between text-emerald-900 font-bold">
                        <span>Bản đã tự chỉnh sửa ({rec.revisions[0].wordCount} từ):</span>
                        <span className="text-[11px] font-normal text-emerald-800">
                          Lưu lúc {rec.revisions[0].savedAt}
                        </span>
                      </div>
                      <p className="font-serif-literary text-emerald-950 whitespace-pre-line leading-relaxed">
                        {rec.revisions[0].revisedText}
                      </p>
                      <div className="pt-2 border-t border-emerald-200 text-emerald-900">
                        <strong className="block mb-0.5">Học sinh tự giải thích thay đổi:</strong>
                        <p className="italic">{rec.revisions[0].reflectionNote}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* DANH SÁCH BÀI ĐỌC HIỂU */}
      {(activeTab === 'all' || activeTab === 'reading') && filteredReadingAttempts.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-base font-serif-literary font-bold text-[#0F172A] flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-blue-700" />
            <span>Lịch sử Luyện đọc hiểu ({filteredReadingAttempts.length})</span>
          </h2>

          <div className="space-y-4">
            {filteredReadingAttempts.map((att) => {
              const exportReading = `NGỮ LIỆU: ${att.passageTitle}\nCÂU HỎI: ${att.question}\n\nCÂU TRẢ LỜI GỐC:\n${att.originalAnswer}\n\n` +
                (att.improvedAnswer ? `CÂU TRẢ LỜI ĐÃ HOÀN THIỆN:\n${att.improvedAnswer}` : '');

              return (
                <div
                  key={att.id}
                  className="p-5 sm:p-6 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-100 pb-3">
                    <div>
                      <div className="flex items-center gap-2 text-xs text-stone-500 mb-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{att.timestamp}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-medium text-blue-800">{att.passageTitle}</span>
                      </div>
                      <h3 className="text-sm font-bold text-[#0F172A]">{att.question}</h3>
                    </div>

                    <button
                      onClick={() => handleCopyRecord(exportReading, att.id)}
                      className="px-3 py-1.5 text-xs font-medium text-stone-600 hover:text-stone-900 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-lg flex items-center gap-1.5"
                    >
                      {copiedId === att.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Đã sao chép!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Sao chép</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-1">
                      <span className="font-bold text-stone-700 block">Câu trả lời ban đầu:</span>
                      <p className="text-stone-700 leading-relaxed">{att.originalAnswer}</p>
                    </div>

                    <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-200 space-y-1">
                      <span className="font-bold text-emerald-900 block">
                        Câu trả lời đã hoàn thiện:
                      </span>
                      <p className="text-emerald-950 leading-relaxed">
                        {att.improvedAnswer || 'Chưa lưu bản hoàn thiện.'}
                      </p>
                    </div>
                  </div>

                  {/* Tóm tắt phản hồi */}
                  <div className="p-3 bg-stone-50 rounded-xl text-xs space-y-1 text-stone-700">
                    <span className="font-semibold text-stone-900 block">Điểm sáng nhận xét:</span>
                    <p className="text-emerald-800">• {att.feedback.strengths[0]}</p>
                    {att.feedback.missingPoints[0] && (
                      <p className="text-amber-800">• {att.feedback.missingPoints[0]}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
