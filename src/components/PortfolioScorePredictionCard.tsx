import React, { useMemo, useState, useEffect } from 'react';
import { ReadingAttempt, WritingSubmissionRecord } from '../types';
import {
  computeTrendScorePrediction,
  formatScoreVN,
  SectionTrendPrediction,
  TrendDirection
} from '../services/competencyAnalytics';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  CheckCircle2,
  Target,
  BookOpen,
  FileText,
  PenTool,
  Info,
  ArrowUpRight,
  Compass
} from 'lucide-react';

interface PortfolioScorePredictionCardProps {
  readingAttempts: ReadingAttempt[];
  writingRecords: WritingSubmissionRecord[];
  targetScore?: number;
  onGoToReading?: () => void;
  onGoToWriting?: () => void;
}

export const PortfolioScorePredictionCard: React.FC<PortfolioScorePredictionCardProps> = ({
  readingAttempts,
  writingRecords,
  targetScore = 8.0,
  onGoToReading,
  onGoToWriting
}) => {
  const predictionSummary = useMemo(
    () => computeTrendScorePrediction(readingAttempts, writingRecords, targetScore),
    [readingAttempts, writingRecords, targetScore]
  );

  const hasOfficial = predictionSummary.officialPrediction.hasAnyData;
  const hasAiRef = predictionSummary.aiReferencePrediction.hasAnyData;

  const [sourceMode, setSourceMode] = useState<'official' | 'ai_reference'>('official');

  useEffect(() => {
    if (!hasOfficial && hasAiRef) {
      setSourceMode('ai_reference');
    } else if (hasOfficial) {
      setSourceMode('official');
    }
  }, [hasOfficial, hasAiRef]);

  const activeBreakdown =
    sourceMode === 'official'
      ? predictionSummary.officialPrediction
      : predictionSummary.aiReferencePrediction;

  const renderTrendIcon = (dir: TrendDirection) => {
    if (dir === 'upward') return <TrendingUp className="w-4 h-4 text-emerald-700" />;
    if (dir === 'downward') return <TrendingDown className="w-4 h-4 text-rose-700" />;
    return <Minus className="w-4 h-4 text-amber-700" />;
  };

  const getMasteryTierClasses = (tier: SectionTrendPrediction['predictedMastery']['tier']) => {
    if (tier === 'tot') {
      return {
        badge: 'bg-teal-100 text-teal-900 border-teal-300',
        bar: 'bg-teal-600',
        border: 'border-teal-200/90 bg-teal-50/25'
      };
    }
    if (tier === 'kha') {
      return {
        badge: 'bg-amber-100 text-amber-900 border-amber-300',
        bar: 'bg-amber-500',
        border: 'border-amber-200/90 bg-amber-50/25'
      };
    }
    if (tier === 'trung_binh') {
      return {
        badge: 'bg-rose-100 text-rose-900 border-rose-300',
        bar: 'bg-rose-500',
        border: 'border-rose-200/90 bg-rose-50/25'
      };
    }
    return {
      badge: 'bg-stone-100 text-stone-600 border-stone-200',
      bar: 'bg-stone-300',
      border: 'border-stone-200 bg-stone-50/50'
    };
  };

  const getSectionIcon = (section: SectionTrendPrediction['section']) => {
    if (section === 'reading') return <BookOpen className="w-4 h-4 text-blue-700" />;
    if (section === 'paragraph_200w') return <FileText className="w-4 h-4 text-indigo-700" />;
    return <PenTool className="w-4 h-4 text-emerald-700" />;
  };

  const gapToTarget =
    activeBreakdown.predictedOverallScore10 !== null
      ? Math.round((targetScore - activeBreakdown.predictedOverallScore10) * 100) / 100
      : null;

  return (
    <section
      aria-label="Dự đoán điểm số dựa trên xu hướng phát triển"
      className="p-5 sm:p-6 rounded-2xl bg-white border border-stone-200 shadow-xs space-y-5"
    >
      {/* Header & Bộ chuyển nguồn dữ liệu minh bạch */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-stone-100 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-[#0F172A] text-white">
              <Compass className="w-4 h-4" />
            </span>
            <h2 className="text-base sm:text-lg font-serif-literary font-bold text-[#0F172A]">
              Dự đoán điểm số theo xu hướng phát triển
            </h2>
            <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-md bg-stone-100 text-stone-700 border border-stone-200">
              Thang 10,0 (4,0 + 2,0 + 4,0)
            </span>
          </div>
          <p className="text-xs text-stone-600">
            Tính toán bằng hồi quy tuyến tính và trung bình trượt có trọng số từ chuỗi kết quả thực tế của bạn. Không làm tròn đẩy bậc.
          </p>
        </div>

        {/* Toggle tách bạch Điểm chính thức GV duyệt và Điểm AI tham khảo */}
        <div className="flex flex-wrap items-center gap-1.5 bg-stone-100 p-1 rounded-xl border border-stone-200 self-start lg:self-auto">
          <button
            type="button"
            onClick={() => setSourceMode('official')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              sourceMode === 'official'
                ? 'bg-[#0F172A] text-white shadow-2xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              Điểm GV duyệt ({predictionSummary.officialPrediction.totalScoredAttempts})
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSourceMode('ai_reference')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              sourceMode === 'ai_reference'
                ? 'bg-amber-900 text-white shadow-2xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>
              Điểm AI tham khảo ({predictionSummary.aiReferencePrediction.totalScoredAttempts})
            </span>
          </button>
        </div>
      </div>

      {/* Nhãn cảnh báo nguồn dữ liệu đang xem */}
      {sourceMode === 'ai_reference' && (
        <div className="px-3.5 py-2.5 rounded-xl bg-amber-50/90 border border-amber-300 text-amber-950 text-xs flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 font-medium">
            <Sparkles className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              <strong>Dự đoán tham khảo từ Điểm AI — chờ giáo viên duyệt:</strong> Chỉ dùng để định hướng tự ôn luyện, không thay thế điểm chính thức của giáo viên.
            </span>
          </div>
          {hasOfficial && (
            <button
              type="button"
              onClick={() => setSourceMode('official')}
              className="text-[11px] font-bold text-amber-900 underline hover:text-amber-700 cursor-pointer"
            >
              Chuyển về điểm GV đã duyệt
            </button>
          )}
        </div>
      )}

      {/* Trạng thái Chưa có dữ liệu */}
      {!activeBreakdown.hasAnyData ? (
        <div className="p-8 rounded-xl bg-stone-50 border border-dashed border-stone-300 text-center space-y-3">
          <div className="w-10 h-10 rounded-xl bg-stone-200/70 text-stone-600 flex items-center justify-center mx-auto">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <div className="text-sm font-bold text-[#0F172A]">Chưa có dữ liệu</div>
            <p className="text-xs text-stone-600 max-w-lg mx-auto leading-relaxed">
              {sourceMode === 'official' && hasAiRef
                ? 'Hiện chưa có bài làm nào được giáo viên xác nhận điểm chính thức. Bạn có thể chuyển sang tab "Điểm AI tham khảo" ở góc trên để xem xu hướng dự báo tạm thời.'
                : 'Hệ thống không tạo điểm dự đoán mẫu khi chưa có bài làm thực tế. Hãy hoàn thành ít nhất một bài luyện Đọc hiểu hoặc Viết nghị luận để mở khóa mô hình dự báo xu hướng.'}
            </p>
          </div>
          <div className="flex items-center justify-center gap-2.5 pt-1 flex-wrap">
            {sourceMode === 'official' && hasAiRef && (
              <button
                type="button"
                onClick={() => setSourceMode('ai_reference')}
                className="px-3.5 py-1.5 rounded-lg bg-amber-800 text-white hover:bg-amber-900 text-xs font-semibold transition-colors cursor-pointer"
              >
                Xem dự đoán từ Điểm AI tham khảo ({predictionSummary.aiReferencePrediction.totalScoredAttempts} bài)
              </button>
            )}
            {onGoToReading && (
              <button
                type="button"
                onClick={onGoToReading}
                className="px-3.5 py-1.5 rounded-lg bg-[#0F172A] text-white hover:bg-stone-800 text-xs font-semibold transition-colors cursor-pointer"
              >
                Luyện Đọc hiểu
              </button>
            )}
            {onGoToWriting && (
              <button
                type="button"
                onClick={onGoToWriting}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-800 text-white hover:bg-emerald-900 text-xs font-semibold transition-colors cursor-pointer"
              >
                Luyện Viết nghị luận
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Khối Tổng quan Dự báo Thang 10,0 */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
            <div className="lg:col-span-5 p-4 sm:p-5 rounded-xl bg-stone-50 border border-stone-200/90 flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-stone-600">
                  {activeBreakdown.isOfficialTeacherApproved
                    ? 'Dự đoán tổng điểm (Từ điểm GV duyệt)'
                    : 'Dự đoán tổng điểm (Điểm AI tham khảo)'}
                </span>
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${
                    activeBreakdown.confidenceLevel === 'high'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : activeBreakdown.confidenceLevel === 'medium'
                      ? 'bg-blue-50 text-blue-800 border-blue-200'
                      : 'bg-stone-100 text-stone-700 border-stone-200'
                  }`}
                >
                  {activeBreakdown.confidenceLabel}
                </span>
              </div>

              <div className="flex items-baseline gap-3 flex-wrap">
                <div className="text-3xl sm:text-4xl font-bold text-[#0F172A] tabular-nums">
                  {formatScoreVN(activeBreakdown.predictedOverallScore10)}
                  <span className="text-base font-normal text-stone-500">/10,0</span>
                </div>

                {activeBreakdown.overallDelta10 !== null && (
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-md ${
                      activeBreakdown.overallDelta10 > 0
                        ? 'bg-emerald-100 text-emerald-900'
                        : activeBreakdown.overallDelta10 < 0
                        ? 'bg-rose-100 text-rose-900'
                        : 'bg-stone-200 text-stone-800'
                    }`}
                  >
                    {renderTrendIcon(activeBreakdown.overallTrendDirection)}
                    <span>
                      {activeBreakdown.overallDelta10 > 0 ? '+' : ''}
                      {formatScoreVN(activeBreakdown.overallDelta10)} đ so với TB hiện tại (
                      {formatScoreVN(activeBreakdown.currentOverallScore10)})
                    </span>
                  </span>
                )}
              </div>

              <div className="space-y-1.5 pt-1 border-t border-stone-200/70 text-xs text-stone-600">
                {activeBreakdown.predictedOverallRange10 && (
                  <div className="flex items-center justify-between">
                    <span>Khoảng dao động dự kiến:</span>
                    <span className="font-semibold text-stone-900 tabular-nums">
                      {formatScoreVN(activeBreakdown.predictedOverallRange10[0])} –{' '}
                      {formatScoreVN(activeBreakdown.predictedOverallRange10[1])} / 10,0 điểm
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Target className="w-3.5 h-3.5 text-blue-700" />
                    <span>So với mục tiêu cá nhân ({formatScoreVN(targetScore)}/10,0):</span>
                  </span>
                  <span className="font-semibold text-stone-900 tabular-nums">
                    {gapToTarget !== null && gapToTarget <= 0
                      ? 'Đạt / vượt mục tiêu đề ra'
                      : `Còn cách mục tiêu ${formatScoreVN(gapToTarget)} điểm`}
                  </span>
                </div>
              </div>
            </div>

            {/* Nhận xét xu hướng & đóng góp từ lượt tự sửa bài */}
            <div className="lg:col-span-7 p-4 sm:p-5 rounded-xl bg-stone-50/70 border border-stone-200/80 flex flex-col justify-between space-y-3">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-[#0F172A]">
                  {renderTrendIcon(activeBreakdown.overallTrendDirection)}
                  <span>Nhận định xu hướng phát triển</span>
                </div>
                <p className="text-xs text-stone-700 leading-relaxed">
                  {activeBreakdown.overallTrendSummary}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                <div className="p-3 rounded-lg bg-white border border-stone-200/80 text-xs space-y-0.5">
                  <div className="text-stone-500 text-[11px]">Tổng số bài đưa vào mô hình</div>
                  <div className="font-bold text-[#0F172A] tabular-nums">
                    {activeBreakdown.totalScoredAttempts} bài chấm ({activeBreakdown.sourceLabel})
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-white border border-stone-200/80 text-xs space-y-0.5">
                  <div className="text-stone-500 text-[11px]">Hệ số củng cố từ tự sửa chữa</div>
                  <div className="font-bold text-emerald-900 tabular-nums">
                    {predictionSummary.completedRevisionsCount} bản tự sửa hoàn thiện
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-[11px] text-stone-500">
                <Info className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                <span>
                  Phần trăm hiển thị ở từng phần là <strong>quy đổi theo mức tiến bộ</strong> (Trung bình 0–59%, Khá 60–79%, Tốt 80–100%), không phải điểm thi gốc.
                </span>
              </div>
            </div>
          </div>

          {/* Dự đoán chi tiết theo 3 phần cấu trúc đề THPT (4,0 + 2,0 + 4,0) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[activeBreakdown.reading, activeBreakdown.paragraph, activeBreakdown.essay].map(
              (sec) => {
                const styles = getMasteryTierClasses(sec.predictedMastery.tier);
                return (
                  <div
                    key={sec.section}
                    className={`p-4 rounded-xl border ${styles.border} flex flex-col justify-between space-y-3`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-[#0F172A]">
                          {getSectionIcon(sec.section)}
                          <span>{sec.sectionTitle}</span>
                        </div>
                        <span className="text-[11px] font-semibold text-stone-500 tabular-nums">
                          /{formatScoreVN(sec.maxScore)}đ
                        </span>
                      </div>

                      {sec.sampleCount === 0 || sec.predictedNextScore === null ? (
                        <div className="py-4 text-center space-y-1">
                          <div className="text-xs font-bold text-stone-500">Chưa có dữ liệu</div>
                          <p className="text-[11px] text-stone-500">
                            Chưa có bài chấm ở phần này trong nguồn đang chọn.
                          </p>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-baseline justify-between gap-2 pt-1">
                            <div>
                              <div className="text-[11px] text-stone-500">Dự đoán bài kế tiếp</div>
                              <div className="text-xl font-bold text-[#0F172A] tabular-nums">
                                {formatScoreVN(sec.predictedNextScore)}/{formatScoreVN(sec.maxScore)}{' '}
                                <span className="text-xs font-normal text-stone-500">điểm</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <span
                                className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-md border ${styles.badge}`}
                              >
                                {sec.predictedMastery.tierLabel} ({sec.predictedMastery.convertedPercentage ?? 0}%)
                              </span>
                            </div>
                          </div>

                          {/* Thanh tiến độ ngang */}
                          <div className="space-y-1">
                            <div className="w-full h-2 rounded-full bg-stone-200/80 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${styles.bar}`}
                                style={{
                                  width: `${Math.max(4, Math.min(100, sec.predictedMastery.convertedPercentage ?? 0))}%`
                                }}
                              />
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-stone-600 tabular-nums">
                              <span>TB hiện tại: {formatScoreVN(sec.currentAverage)}đ</span>
                              {sec.predictedRange && (
                                <span>
                                  Biên độ: {formatScoreVN(sec.predictedRange[0])}–
                                  {formatScoreVN(sec.predictedRange[1])}đ
                                </span>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="pt-2 border-t border-stone-200/60 flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-stone-600 font-medium flex items-center gap-1">
                        {sec.sampleCount > 0 && <ArrowUpRight className="w-3.5 h-3.5 text-stone-500 shrink-0" />}
                        <span>{sec.trendLabel}</span>
                      </span>
                      <span className="text-stone-500 tabular-nums shrink-0">
                        {sec.sampleCount} bài
                      </span>
                    </div>
                  </div>
                );
              }
            )}
          </div>
        </div>
      )}
    </section>
  );
};
