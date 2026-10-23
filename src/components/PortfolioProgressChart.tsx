import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine
} from 'recharts';
import { ReadingAttempt, WritingSubmissionRecord } from '../types';
import {
  computeSectionMasteryIndicator,
  isParagraph200wRecord
} from '../services/competencyAnalytics';
import { formatVNDecimal } from '../services/examParserEngine';
import {
  TrendingUp,
  BarChart3,
  CheckCircle2,
  Sparkles,
  Info,
  BookOpen,
  PenTool
} from 'lucide-react';

interface PortfolioProgressChartProps {
  readingAttempts: ReadingAttempt[];
  writingRecords: WritingSubmissionRecord[];
}

export interface TimelinePoint {
  indexLabel: string;
  order: number;
  id: string;
  timestamp: string;
  title: string;
  category: 'reading' | 'paragraph_200w' | 'essay_600w';
  categoryLabel: string;
  maxScore: 4.0 | 2.0;
  // Điểm Giáo viên đã duyệt (Chính thức)
  officialRawScore: number | null;
  officialProgressPct: number | null;
  officialTierLabel: string | null;
  // Điểm AI tham khảo (Chờ giáo viên duyệt — tách biệt hoàn toàn)
  aiSuggestedRawScore: number | null;
  aiSuggestedProgressPct: number | null;
  aiSuggestedTierLabel: string | null;
  // Phục vụ hiển thị đường theo phần bài thi (quy đổi % tiến bộ hoặc điểm gốc)
  readingOfficialVal: number | null;
  readingAiVal: number | null;
  writingOfficialVal: number | null;
  writingAiVal: number | null;
}

export const PortfolioProgressChart: React.FC<PortfolioProgressChartProps> = ({
  readingAttempts,
  writingRecords
}) => {
  const [scaleMode, setScaleMode] = useState<'progress_pct' | 'raw_score'>('progress_pct');
  const [sourceFilter, setSourceFilter] = useState<'both' | 'official_only' | 'ai_only'>('both');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'reading' | 'writing'>('all');

  // Chuẩn hóa chuỗi thời gian & điểm số theo thứ tự thời gian (từ bài cũ nhất -> bài mới nhất)
  const timelineData = useMemo<TimelinePoint[]>(() => {
    const rawItems: Array<{
      id: string;
      timestamp: string;
      title: string;
      category: 'reading' | 'paragraph_200w' | 'essay_600w';
      categoryLabel: string;
      maxScore: 4.0 | 2.0;
      teacherScore: number | null;
      aiScore: number | null;
    }> = [];

    // Đảo ngược mảng để bài làm trước đứng trước, bài mới nhất đứng cuối trục thời gian
    const chronologicalReading = [...readingAttempts].reverse();
    const chronologicalWriting = [...writingRecords].reverse();

    chronologicalReading.forEach((att) => {
      const teacherScore =
        typeof att.feedback.teacherConfirmedScore === 'number'
          ? att.feedback.teacherConfirmedScore
          : null;
      const aiScore =
        teacherScore === null && typeof att.feedback.aiSuggestedScore === 'number'
          ? att.feedback.aiSuggestedScore
          : null;

      rawItems.push({
        id: att.id,
        timestamp: att.timestamp || 'Gần đây',
        title: `${att.passageTitle} — ${att.question}`,
        category: 'reading',
        categoryLabel: 'Đọc hiểu (/4,0đ)',
        maxScore: 4.0,
        teacherScore,
        aiScore
      });
    });

    chronologicalWriting.forEach((rec) => {
      const isPara = isParagraph200wRecord(rec);
      const section: 'paragraph_200w' | 'essay_600w' = isPara ? 'paragraph_200w' : 'essay_600w';
      const maxScore: 4.0 | 2.0 = isPara ? 2.0 : 4.0;
      const teacherScore =
        typeof rec.feedback.teacherConfirmedScore === 'number'
          ? rec.feedback.teacherConfirmedScore
          : null;
      const aiScore =
        teacherScore === null && typeof rec.feedback.aiSuggestedScore === 'number'
          ? rec.feedback.aiSuggestedScore
          : null;

      rawItems.push({
        id: rec.id,
        timestamp: rec.createdAt || 'Gần đây',
        title: rec.promptTitle,
        category: section,
        categoryLabel: isPara ? 'Đoạn văn 200 chữ (/2,0đ)' : 'Bài văn 600 chữ (/4,0đ)',
        maxScore,
        teacherScore,
        aiScore
      });
    });

    const filtered = rawItems.filter((item) => {
      if (categoryFilter === 'reading') return item.category === 'reading';
      if (categoryFilter === 'writing') return item.category !== 'reading';
      return true;
    });

    return filtered.map((item, idx) => {
      const officialMastery = computeSectionMasteryIndicator(item.category, item.teacherScore);
      const aiMastery = computeSectionMasteryIndicator(item.category, item.aiScore);

      const officialVal =
        scaleMode === 'progress_pct' ? officialMastery.convertedPercentage : officialMastery.rawScore;
      const aiVal =
        scaleMode === 'progress_pct' ? aiMastery.convertedPercentage : aiMastery.rawScore;

      const shortDate = item.timestamp.split(',')[0]?.trim() || `Lần ${idx + 1}`;

      return {
        indexLabel: `#${idx + 1} (${shortDate})`,
        order: idx + 1,
        id: item.id,
        timestamp: item.timestamp,
        title: item.title,
        category: item.category,
        categoryLabel: item.categoryLabel,
        maxScore: item.maxScore,
        officialRawScore: officialMastery.rawScore,
        officialProgressPct: officialMastery.convertedPercentage,
        officialTierLabel: item.teacherScore !== null ? officialMastery.tierLabel : null,
        aiSuggestedRawScore: aiMastery.rawScore,
        aiSuggestedProgressPct: aiMastery.convertedPercentage,
        aiSuggestedTierLabel: item.aiScore !== null ? aiMastery.tierLabel : null,
        readingOfficialVal: item.category === 'reading' ? officialVal : null,
        readingAiVal: item.category === 'reading' ? aiVal : null,
        writingOfficialVal: item.category !== 'reading' ? officialVal : null,
        writingAiVal: item.category !== 'reading' ? aiVal : null
      };
    });
  }, [readingAttempts, writingRecords, scaleMode, categoryFilter]);

  const hasAnyAttempt = readingAttempts.length > 0 || writingRecords.length > 0;
  const hasScoredPoint = timelineData.some(
    (d) => d.officialRawScore !== null || d.aiSuggestedRawScore !== null
  );

  const officialCount = timelineData.filter((d) => d.officialRawScore !== null).length;
  const aiPendingCount = timelineData.filter((d) => d.aiSuggestedRawScore !== null).length;

  // Custom Tooltip hiển thị rõ Điểm gốc, Quy đổi %, Xếp loại và Trạng thái duyệt
  const renderCustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || payload.length === 0) return null;
    const point: TimelinePoint | undefined = payload[0]?.payload;
    if (!point) return null;

    const maxLabel = point.maxScore === 2.0 ? '2,0' : '4,0';

    return (
      <div className="p-3.5 rounded-xl bg-white border border-stone-200 shadow-lg text-xs space-y-2 max-w-xs">
        <div className="flex items-center justify-between gap-2 border-b border-stone-100 pb-1.5">
          <span className="font-bold text-stone-900">{point.categoryLabel}</span>
          <span className="font-mono text-[11px] text-stone-500">{point.timestamp}</span>
        </div>

        <p className="font-serif-literary font-bold text-[#0F172A] leading-snug line-clamp-2">
          {point.title}
        </p>

        {point.officialRawScore !== null && (
          <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 space-y-0.5">
            <div className="text-[11px] font-bold text-emerald-900 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Điểm chính thức (Giáo viên đã duyệt):</span>
            </div>
            <div className="font-mono font-bold text-emerald-950">
              {formatVNDecimal(point.officialRawScore)}/{maxLabel} điểm ·{' '}
              {point.officialProgressPct}% ({point.officialTierLabel})
            </div>
          </div>
        )}

        {point.aiSuggestedRawScore !== null && (
          <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 space-y-0.5">
            <div className="text-[11px] font-bold text-amber-900 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>Điểm AI tham khảo — chờ giáo viên duyệt:</span>
            </div>
            <div className="font-mono font-bold text-amber-950">
              {formatVNDecimal(point.aiSuggestedRawScore)}/{maxLabel} điểm ·{' '}
              {point.aiSuggestedProgressPct}% ({point.aiSuggestedTierLabel})
            </div>
          </div>
        )}

        {point.officialRawScore === null && point.aiSuggestedRawScore === null && (
          <div className="text-stone-500 italic">
            Bài luyện này chỉ có nhận xét định tính, chưa gắn điểm số định lượng.
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="p-5 sm:p-6 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-5">
      {/* Header biểu đồ */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-stone-100 pb-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-900 border border-indigo-200 text-xs font-bold">
            <TrendingUp className="w-3.5 h-3.5 text-indigo-700" />
            <span>Biểu đồ Tiến trình Điểm số theo Thời gian (Recharts)</span>
          </div>
          <h2 className="text-lg sm:text-xl font-serif-literary font-bold text-[#0F172A]">
            Sự tiến bộ qua các bài luyện Đọc hiểu & Viết nghị luận
          </h2>
          <p className="text-xs text-stone-600">
            Tách biệt minh bạch giữa <strong className="text-emerald-800">Điểm Giáo viên đã duyệt</strong> (nét liền) và{' '}
            <strong className="text-amber-800">Điểm AI tham khảo — chờ giáo viên duyệt</strong> (nét đứt).
          </p>
        </div>

        {/* Bộ lọc chế độ xem */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Lọc phần thi */}
          <div className="inline-flex rounded-xl bg-stone-100 p-1 border border-stone-200">
            <button
              type="button"
              onClick={() => setCategoryFilter('all')}
              className={`px-2.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                categoryFilter === 'all'
                  ? 'bg-white text-[#0F172A] shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Tất cả
            </button>
            <button
              type="button"
              onClick={() => setCategoryFilter('reading')}
              className={`px-2.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1 ${
                categoryFilter === 'reading'
                  ? 'bg-white text-teal-900 shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <BookOpen className="w-3 h-3" />
              <span>Đọc hiểu</span>
            </button>
            <button
              type="button"
              onClick={() => setCategoryFilter('writing')}
              className={`px-2.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1 ${
                categoryFilter === 'writing'
                  ? 'bg-white text-indigo-900 shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <PenTool className="w-3 h-3" />
              <span>Viết</span>
            </button>
          </div>

          {/* Chuyển đổi thang đo */}
          <div className="inline-flex rounded-xl bg-stone-100 p-1 border border-stone-200">
            <button
              type="button"
              onClick={() => setScaleMode('progress_pct')}
              className={`px-2.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                scaleMode === 'progress_pct'
                  ? 'bg-[#0F172A] text-white shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Quy đổi tiến bộ (%)
            </button>
            <button
              type="button"
              onClick={() => setScaleMode('raw_score')}
              className={`px-2.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                scaleMode === 'raw_score'
                  ? 'bg-[#0F172A] text-white shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Điểm gốc (/4,0 · /2,0)
            </button>
          </div>

          {/* Lọc nguồn điểm */}
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as any)}
            aria-label="Chọn nguồn điểm hiển thị trên biểu đồ"
            className="px-2.5 py-1.5 rounded-xl bg-stone-50 border border-stone-300 font-semibold text-stone-800 cursor-pointer"
          >
            <option value="both">Hiện cả GV duyệt & AI tham khảo</option>
            <option value="official_only">Chỉ Điểm chính thức (GV duyệt)</option>
            <option value="ai_only">Chỉ Điểm AI tham khảo</option>
          </select>
        </div>
      </div>

      {/* Trạng thái "Chưa có dữ liệu" khi chưa có bài làm thực tế */}
      {!hasAnyAttempt || !hasScoredPoint ? (
        <div className="p-8 rounded-2xl bg-stone-50 border border-dashed border-stone-300 text-center space-y-2">
          <BarChart3 className="w-10 h-10 text-stone-400 mx-auto" />
          <h3 className="text-sm font-bold text-[#0F172A]">Chưa có dữ liệu</h3>
          <p className="text-xs text-stone-500 max-w-md mx-auto">
            Hệ thống chưa ghi nhận bài luyện Đọc hiểu hoặc Viết nghị luận có điểm số trong hồ sơ của bạn. Không tạo biểu đồ hoặc điểm trung bình mẫu khi chưa có dữ liệu thật.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Tóm tắt số lượng điểm theo nguồn */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-900 border border-emerald-200 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Bài đã được Giáo viên duyệt: {officialCount} bài</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-900 border border-amber-200 font-semibold">
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>Điểm AI tham khảo — chờ giáo viên duyệt: {aiPendingCount} bài</span>
              </span>
            </div>
            <span className="text-[11px] text-stone-500">
              {scaleMode === 'progress_pct'
                ? 'Trục tung: Phần trăm quy đổi theo mức tiến bộ (0–59%: Cần củng cố · 60–79%: Khá · 80–100%: Tốt)'
                : 'Trục tung: Điểm gốc từng phần (Đọc hiểu & Bài văn /4,0đ · Đoạn văn 200 chữ /2,0đ)'}
            </span>
          </div>

          {/* Khung vẽ Recharts ResponsiveContainer */}
          <div className="w-full h-72 sm:h-80 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={timelineData}
                margin={{ top: 12, right: 16, left: 0, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                <XAxis
                  dataKey="indexLabel"
                  tick={{ fontSize: 11, fill: '#57534E' }}
                  stroke="#A8A29E"
                />
                <YAxis
                  domain={scaleMode === 'progress_pct' ? [0, 100] : [0, 4.0]}
                  unit={scaleMode === 'progress_pct' ? '%' : 'đ'}
                  tick={{ fontSize: 11, fill: '#57534E' }}
                  stroke="#A8A29E"
                />
                <Tooltip content={renderCustomTooltip} />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />

                {scaleMode === 'progress_pct' && (
                  <>
                    <ReferenceLine
                      y={80}
                      stroke="#10B981"
                      strokeDasharray="4 4"
                      label={{
                        value: 'Mốc Tốt (80%)',
                        position: 'insideTopRight',
                        fill: '#047857',
                        fontSize: 10
                      }}
                    />
                    <ReferenceLine
                      y={60}
                      stroke="#F59E0B"
                      strokeDasharray="4 4"
                      label={{
                        value: 'Mốc Khá (60%)',
                        position: 'insideTopRight',
                        fill: '#B45309',
                        fontSize: 10
                      }}
                    />
                  </>
                )}

                {/* Điểm Đọc hiểu chính thức (GV duyệt) */}
                {(sourceFilter === 'both' || sourceFilter === 'official_only') &&
                  (categoryFilter === 'all' || categoryFilter === 'reading') && (
                    <Line
                      type="monotone"
                      dataKey="readingOfficialVal"
                      name="Đọc hiểu (GV đã duyệt)"
                      stroke="#0D9488"
                      strokeWidth={3}
                      dot={{ r: 5, fill: '#0D9488', strokeWidth: 2, stroke: '#ffffff' }}
                      activeDot={{ r: 7 }}
                      connectNulls
                    />
                  )}

                {/* Điểm Viết nghị luận chính thức (GV duyệt) */}
                {(sourceFilter === 'both' || sourceFilter === 'official_only') &&
                  (categoryFilter === 'all' || categoryFilter === 'writing') && (
                    <Line
                      type="monotone"
                      dataKey="writingOfficialVal"
                      name="Viết nghị luận (GV đã duyệt)"
                      stroke="#4F46E5"
                      strokeWidth={3}
                      dot={{ r: 5, fill: '#4F46E5', strokeWidth: 2, stroke: '#ffffff' }}
                      activeDot={{ r: 7 }}
                      connectNulls
                    />
                  )}

                {/* Điểm Đọc hiểu AI tham khảo (Chờ GV duyệt — Nét đứt) */}
                {(sourceFilter === 'both' || sourceFilter === 'ai_only') &&
                  (categoryFilter === 'all' || categoryFilter === 'reading') && (
                    <Line
                      type="monotone"
                      dataKey="readingAiVal"
                      name="Đọc hiểu (Điểm AI tham khảo)"
                      stroke="#14B8A6"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={{ r: 4, fill: '#F0FDFA', strokeWidth: 2, stroke: '#0D9488' }}
                      connectNulls
                    />
                  )}

                {/* Điểm Viết nghị luận AI tham khảo (Chờ GV duyệt — Nét đứt) */}
                {(sourceFilter === 'both' || sourceFilter === 'ai_only') &&
                  (categoryFilter === 'all' || categoryFilter === 'writing') && (
                    <Line
                      type="monotone"
                      dataKey="writingAiVal"
                      name="Viết nghị luận (Điểm AI tham khảo)"
                      stroke="#F59E0B"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={{ r: 4, fill: '#FFFBEB', strokeWidth: 2, stroke: '#D97706' }}
                      connectNulls
                    />
                  )}

                <Bar
                  dataKey="officialRawScore"
                  name="Điểm gốc GV duyệt"
                  fill="#10B981"
                  fillOpacity={0.12}
                  barSize={18}
                  hide={scaleMode === 'progress_pct'}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/80 text-[11px] text-stone-600 flex items-start gap-2">
            <Info className="w-4 h-4 text-stone-500 shrink-0 mt-0.5" />
            <span>
              <strong>Ghi chú sư phạm:</strong> Di chuột hoặc chạm vào từng điểm mốc trên biểu đồ để xem chi tiết điểm gốc (thang <code>/4,0</code> cho Đọc hiểu & Bài văn 600 chữ; thang <code>/2,0</code> cho Đoạn văn 200 chữ), mức xếp loại và trạng thái duyệt của giáo viên.
            </span>
          </div>
        </div>
      )}
    </section>
  );
};
