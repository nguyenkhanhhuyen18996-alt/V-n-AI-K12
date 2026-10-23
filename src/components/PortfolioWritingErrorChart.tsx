import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell
} from 'recharts';
import { WritingSubmissionRecord } from '../types';
import { isParagraph200wRecord } from '../services/competencyAnalytics';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  PenTool,
  Sparkles,
  Wrench
} from 'lucide-react';

interface PortfolioWritingErrorChartProps {
  writingRecords: WritingSubmissionRecord[];
  onGoToWriting?: () => void;
}

export interface WritingErrorCategoryMetric {
  key: 'structure' | 'missing_ideas' | 'weak_evidence' | 'word_choice';
  shortLabel: string;
  fullTitle: string;
  errorCount: number;
  totalAnalyzed: number;
  errorRatePct: number;
  masteryPct: number;
  severity: 'high' | 'medium' | 'low';
  barColor: string;
  sampleWeakness: string;
  remedyAdvice: string;
}

export const PortfolioWritingErrorChart: React.FC<PortfolioWritingErrorChartProps> = ({
  writingRecords,
  onGoToWriting
}) => {
  const [chartMode, setChartMode] = useState<'error_count' | 'percentage_compare'>('error_count');

  const analysis = useMemo(() => {
    const total = writingRecords.length;
    if (total === 0) {
      return {
        total: 0,
        categories: [] as WritingErrorCategoryMetric[],
        topError: null as WritingErrorCategoryMetric | null,
        strongestArea: null as WritingErrorCategoryMetric | null
      };
    }

    let structureErrors = 0;
    let structureScoreRatioSum = 0;
    let structureWeaknessSample = '';
    let structureRemedySample = '';

    let missingIdeasErrors = 0;
    let missingIdeasScoreRatioSum = 0;
    let missingIdeasWeaknessSample = '';
    let missingIdeasRemedySample = '';

    let evidenceErrors = 0;
    let evidenceScoreRatioSum = 0;
    let evidenceWeaknessSample = '';
    let evidenceRemedySample = '';

    let wordChoiceErrors = 0;
    let wordChoiceScoreRatioSum = 0;
    let wordChoiceWeaknessSample = '';
    let wordChoiceRemedySample = '';

    writingRecords.forEach((rec) => {
      const isPara = isParagraph200wRecord(rec);
      const criteria = rec.feedback?.criteria || [];

      // 1. Lỗi sai cấu trúc & thể thức (Tách đoạn ở câu 200 chữ, thiếu 3 phần ở bài 600 chữ, hoặc tiêu chí 1 cảnh báo)
      const cStructure =
        criteria.find(
          (c) =>
            c.id === 'crit-1' ||
            /thể thức|cấu trúc|bố cục|đoạn văn/i.test(c.name)
        ) || criteria[0];

      const structureRatio =
        cStructure &&
        typeof cStructure.scoreAwarded === 'number' &&
        typeof cStructure.maxCriterionScore === 'number' &&
        cStructure.maxCriterionScore > 0
          ? cStructure.scoreAwarded / cStructure.maxCriterionScore
          : cStructure?.scoreLevel === 'Tốt & Sâu sắc'
          ? 0.9
          : cStructure?.scoreLevel === 'Khá'
          ? 0.75
          : cStructure?.scoreLevel === 'Cần bổ sung'
          ? 0.45
          : 0.65;

      structureScoreRatioSum += structureRatio;

      const hasStructureFault =
        (isPara && (rec.feedback?.paragraphCount || 1) > 1) ||
        (!isPara && (rec.feedback?.paragraphCount || 1) < 3) ||
        cStructure?.scoreLevel === 'Cần bổ sung' ||
        cStructure?.scoreStatus === 'warning' ||
        structureRatio < 0.65;

      if (hasStructureFault) {
        structureErrors += 1;
        if (!structureWeaknessSample && cStructure?.weaknesses) {
          structureWeaknessSample = cStructure.weaknesses;
        }
        if (!structureRemedySample && cStructure?.remedyStep) {
          structureRemedySample = cStructure.remedyStep;
        }
      }

      // 2. Lỗi thiếu ý & triển khai luận điểm chưa trọn vẹn
      const cIdeas =
        criteria.find(
          (c) =>
            c.id === 'crit-2' ||
            /vấn đề nghị luận|luận điểm|nội dung|trọng tâm/i.test(c.name)
        ) || criteria[1];

      const ideasRatio =
        cIdeas &&
        typeof cIdeas.scoreAwarded === 'number' &&
        typeof cIdeas.maxCriterionScore === 'number' &&
        cIdeas.maxCriterionScore > 0
          ? cIdeas.scoreAwarded / cIdeas.maxCriterionScore
          : cIdeas?.scoreLevel === 'Tốt & Sâu sắc'
          ? 0.9
          : cIdeas?.scoreLevel === 'Khá'
          ? 0.76
          : cIdeas?.scoreLevel === 'Cần bổ sung'
          ? 0.45
          : 0.62;

      missingIdeasScoreRatioSum += ideasRatio;

      const minWordsExpected = isPara ? 150 : 420;
      const hasMissingIdeasFault =
        rec.wordCount < minWordsExpected ||
        cIdeas?.scoreLevel === 'Cần bổ sung' ||
        cIdeas?.scoreStatus === 'warning' ||
        ideasRatio < 0.7 ||
        /thiếu ý|sơ sài|chung chung|chưa sâu|chưa làm rõ/i.test(cIdeas?.weaknesses || '');

      if (hasMissingIdeasFault) {
        missingIdeasErrors += 1;
        if (!missingIdeasWeaknessSample && cIdeas?.weaknesses) {
          missingIdeasWeaknessSample = cIdeas.weaknesses;
        }
        if (!missingIdeasRemedySample && cIdeas?.remedyStep) {
          missingIdeasRemedySample = cIdeas.remedyStep;
        }
      }

      // 3. Lỗi thiếu dẫn chứng hoặc phân tích dẫn chứng chưa thuyết phục
      const cEvidence =
        criteria.find(
          (c) =>
            c.id === 'crit-3' ||
            /dẫn chứng|lí lẽ|lập luận/i.test(c.name)
        ) || criteria[2];

      const evidenceRatio =
        cEvidence &&
        typeof cEvidence.scoreAwarded === 'number' &&
        typeof cEvidence.maxCriterionScore === 'number' &&
        cEvidence.maxCriterionScore > 0
          ? cEvidence.scoreAwarded / cEvidence.maxCriterionScore
          : cEvidence?.scoreLevel === 'Tốt & Sâu sắc'
          ? 0.88
          : cEvidence?.scoreLevel === 'Khá'
          ? 0.75
          : cEvidence?.scoreLevel === 'Cần bổ sung'
          ? 0.42
          : 0.6;

      evidenceScoreRatioSum += evidenceRatio;

      const hasEvidenceFault =
        cEvidence?.scoreLevel === 'Cần bổ sung' ||
        cEvidence?.scoreStatus === 'warning' ||
        evidenceRatio < 0.7 ||
        /thiếu dẫn chứng|chưa có dẫn chứng|kể lể|sáo rỗng/i.test(cEvidence?.weaknesses || '');

      if (hasEvidenceFault) {
        evidenceErrors += 1;
        if (!evidenceWeaknessSample && cEvidence?.weaknesses) {
          evidenceWeaknessSample = cEvidence.weaknesses;
        }
        if (!evidenceRemedySample && cEvidence?.remedyStep) {
          evidenceRemedySample = cEvidence.remedyStep;
        }
      }

      // 4. Lỗi dùng từ, diễn đạt, chính tả & liên kết câu
      const cWordChoice =
        criteria.find(
          (c) =>
            c.id === 'crit-4' ||
            c.id === 'crit-5' ||
            /diễn đạt|dùng từ|liên kết|chính tả|ngữ pháp|sáng tạo/i.test(c.name)
        ) || criteria[3] || criteria[criteria.length - 1];

      const wordChoiceRatio =
        cWordChoice &&
        typeof cWordChoice.scoreAwarded === 'number' &&
        typeof cWordChoice.maxCriterionScore === 'number' &&
        cWordChoice.maxCriterionScore > 0
          ? cWordChoice.scoreAwarded / cWordChoice.maxCriterionScore
          : cWordChoice?.scoreLevel === 'Tốt & Sâu sắc'
          ? 0.9
          : cWordChoice?.scoreLevel === 'Khá'
          ? 0.75
          : cWordChoice?.scoreLevel === 'Cần bổ sung'
          ? 0.45
          : 0.65;

      wordChoiceScoreRatioSum += wordChoiceRatio;

      const hasWordChoiceFault =
        cWordChoice?.scoreLevel === 'Cần bổ sung' ||
        cWordChoice?.scoreStatus === 'warning' ||
        wordChoiceRatio < 0.72 ||
        /dùng từ|diễn đạt|lặp từ|câu quá dài|thiếu liên kết|chính tả/i.test(
          cWordChoice?.weaknesses || ''
        );

      if (hasWordChoiceFault) {
        wordChoiceErrors += 1;
        if (!wordChoiceWeaknessSample && cWordChoice?.weaknesses) {
          wordChoiceWeaknessSample = cWordChoice.weaknesses;
        }
        if (!wordChoiceRemedySample && cWordChoice?.remedyStep) {
          wordChoiceRemedySample = cWordChoice.remedyStep;
        }
      }
    });

    const buildCategory = (
      key: WritingErrorCategoryMetric['key'],
      shortLabel: string,
      fullTitle: string,
      errorCount: number,
      ratioSum: number,
      sampleWeakness: string,
      defaultWeakness: string,
      sampleRemedy: string,
      defaultRemedy: string
    ): WritingErrorCategoryMetric => {
      const errorRatePct = Math.round((errorCount / total) * 100);
      const avgMastery = Math.min(100, Math.max(0, Math.round((ratioSum / total) * 100)));
      const severity: WritingErrorCategoryMetric['severity'] =
        errorRatePct >= 60 ? 'high' : errorRatePct >= 30 ? 'medium' : 'low';
      const barColor =
        severity === 'high'
          ? '#E11D48' // rose-600
          : severity === 'medium'
          ? '#D97706' // amber-600
          : '#0D9488'; // teal-600

      return {
        key,
        shortLabel,
        fullTitle,
        errorCount,
        totalAnalyzed: total,
        errorRatePct,
        masteryPct: avgMastery,
        severity,
        barColor,
        sampleWeakness: sampleWeakness || defaultWeakness,
        remedyAdvice: sampleRemedy || defaultRemedy
      };
    };

    const categories: WritingErrorCategoryMetric[] = [
      buildCategory(
        'word_choice',
        'Dùng từ & Diễn đạt',
        'Lỗi dùng từ, diễn đạt & liên kết câu',
        wordChoiceErrors,
        wordChoiceScoreRatioSum,
        wordChoiceWeaknessSample,
        'Đôi chỗ diễn đạt còn dài dòng hoặc thiếu từ nối chuyển ý giữa các câu.',
        wordChoiceRemedySample,
        'Sử dụng từ ngữ chính xác, bổ sung phép nối (tuy nhiên, hơn thế nữa, do đó) và ngắt câu gọn gàng.'
      ),
      buildCategory(
        'missing_ideas',
        'Thiếu ý trọng tâm',
        'Lỗi thiếu ý, lập luận chưa sâu hoặc hụt dung lượng',
        missingIdeasErrors,
        missingIdeasScoreRatioSum,
        missingIdeasWeaknessSample,
        'Các luận điểm giải thích và bàn luận mở rộng đôi khi còn dừng ở mức khái quát.',
        missingIdeasRemedySample,
        'Lập dàn ý 4 bước (Giải thích → Phân tích mặt đúng → Phản đề/Mở rộng → Bài học nhận thức & hành động).'
      ),
      buildCategory(
        'structure',
        'Sai cấu trúc',
        'Lỗi cấu trúc bố cục & thể thức đoạn/bài văn',
        structureErrors,
        structureScoreRatioSum,
        structureWeaknessSample,
        'Cần chú ý quy tắc 1 đoạn duy nhất cho câu 200 chữ và bố cục 3 phần rõ ràng cho bài 600 chữ.',
        structureRemedySample,
        'Đoạn văn 200 chữ tuyệt đối không xuống dòng; bài văn 600 chữ tách rõ Mở bài - Thân bài - Kết bài.'
      ),
      buildCategory(
        'weak_evidence',
        'Thiếu dẫn chứng',
        'Lỗi thiếu dẫn chứng thực tế hoặc chưa phân tích dẫn chứng',
        evidenceErrors,
        evidenceScoreRatioSum,
        evidenceWeaknessSample,
        'Dẫn chứng đưa vào bài còn ít hoặc mới dừng ở liệt kê tên nhân vật/sự kiện.',
        evidenceRemedySample,
        'Mỗi luận điểm chính cần 1 dẫn chứng tiêu biểu kèm 2–3 câu phân tích trực tiếp hướng vào chủ đề.'
      )
    ];

    const sortedByError = [...categories].sort(
      (a, b) => b.errorCount - a.errorCount || a.masteryPct - b.masteryPct
    );
    const sortedByMastery = [...categories].sort((a, b) => b.masteryPct - a.masteryPct);

    return {
      total,
      categories,
      topError: sortedByError[0]?.errorCount > 0 ? sortedByError[0] : null,
      strongestArea: sortedByMastery[0] || null
    };
  }, [writingRecords]);

  return (
    <section
      aria-label="Phân tích xu hướng lỗi sai phổ biến trong viết bài"
      className="p-5 sm:p-6 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-5"
    >
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-stone-100 pb-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-900 border border-rose-200 text-xs font-bold">
            <BarChart3 className="w-3.5 h-3.5 text-rose-700" />
            <span>Chẩn đoán năng lực viết nghị luận · Biểu đồ cột Recharts</span>
          </div>
          <h2 className="text-lg sm:text-xl font-serif-literary font-bold text-[#0F172A]">
            Phân tích xu hướng lỗi sai phổ biến từ lịch sử viết bài
          </h2>
          <p className="text-xs text-stone-600">
            Thống kê trực quan 4 nhóm lỗi thường gặp (<strong>Dùng từ & Diễn đạt</strong>,{' '}
            <strong>Thiếu ý trọng tâm</strong>, <strong>Sai cấu trúc</strong>,{' '}
            <strong>Thiếu dẫn chứng</strong>) dựa trên {analysis.total} bài viết nghị luận đã lưu.
          </p>
        </div>

        {analysis.total > 0 && (
          <div
            role="group"
            aria-label="Chế độ xem biểu đồ lỗi viết"
            className="inline-flex items-center p-1 rounded-xl bg-stone-100 border border-stone-200 text-xs font-semibold shrink-0 self-start lg:self-auto"
          >
            <button
              type="button"
              onClick={() => setChartMode('error_count')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                chartMode === 'error_count'
                  ? 'bg-[#0F172A] text-white shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Số bài mắc lỗi
            </button>
            <button
              type="button"
              onClick={() => setChartMode('percentage_compare')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                chartMode === 'percentage_compare'
                  ? 'bg-[#0F172A] text-white shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Tỷ lệ lỗi vs Độ vững (%)
            </button>
          </div>
        )}
      </div>

      {analysis.total === 0 ? (
        <div className="p-8 rounded-2xl bg-stone-50 border border-stone-200/80 text-center space-y-3">
          <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-800 flex items-center justify-center mx-auto">
            <PenTool className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-stone-800">
            Chưa có lịch sử bài viết nghị luận để phân tích xu hướng lỗi sai
          </h3>
          <p className="text-xs text-stone-600 max-w-md mx-auto leading-relaxed">
            Sau khi bạn hoàn thành và lưu ít nhất 1 bài viết (Đoạn văn 200 chữ hoặc Bài văn 600 chữ), hệ thống sẽ tự động tổng hợp biểu đồ cột thống kê các lỗi dùng từ, thiếu ý, sai cấu trúc và thiếu dẫn chứng tại đây.
          </p>
          {onGoToWriting && (
            <button
              type="button"
              onClick={onGoToWriting}
              className="px-4 py-2 rounded-xl bg-[#0F172A] hover:bg-stone-800 text-white text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5"
            >
              <PenTool className="w-3.5 h-3.5 text-emerald-300" />
              <span>Bắt đầu luyện viết ngay</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Cột trái (7/12): Biểu đồ cột Recharts */}
          <div className="lg:col-span-7 p-4 rounded-2xl bg-stone-50/70 border border-stone-200/90 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold text-stone-800">
                {chartMode === 'error_count'
                  ? `Biểu đồ số bài phát hiện lỗi (trên tổng số ${analysis.total} bài viết)`
                  : 'Biểu đồ đối chiếu Tỷ lệ mắc lỗi (%) và Mức độ làm chủ kỹ năng (%)'}
              </span>
              <div className="flex items-center gap-3 text-[11px] text-stone-600">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-xs bg-rose-600" />
                  <span>Hay mắc (≥60%)</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-xs bg-amber-600" />
                  <span>Cần lưu ý (30–59%)</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-xs bg-teal-600" />
                  <span>Ít lỗi (&lt;30%)</span>
                </span>
              </div>
            </div>

            <div className="w-full h-72">
              <ResponsiveContainer width="100%" height="100%">
                {chartMode === 'error_count' ? (
                  <BarChart
                    data={analysis.categories}
                    margin={{ top: 12, right: 16, left: 0, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                    <XAxis
                      dataKey="shortLabel"
                      tick={{ fontSize: 11, fill: '#334155', fontWeight: 600 }}
                    />
                    <YAxis
                      allowDecimals={false}
                      domain={[0, Math.max(analysis.total, 3)]}
                      tick={{ fontSize: 11, fill: '#475569' }}
                      unit=" bài"
                    />
                    <Tooltip
                      formatter={(value: any, _name: any, props: any) => {
                        const item = props?.payload as WritingErrorCategoryMetric | undefined;
                        return [
                          `${value}/${analysis.total} bài (${item?.errorRatePct ?? 0}%)`,
                          item?.fullTitle || 'Tần suất xuất hiện lỗi'
                        ];
                      }}
                      contentStyle={{
                        borderRadius: '12px',
                        border: '1px solid #E2E8F0',
                        fontSize: '12px'
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Bar
                      dataKey="errorCount"
                      name="Số bài xuất hiện lỗi"
                      radius={[8, 8, 0, 0]}
                      maxBarSize={54}
                    >
                      {analysis.categories.map((entry) => (
                        <Cell key={entry.key} fill={entry.barColor} />
                      ))}
                    </Bar>
                  </BarChart>
                ) : (
                  <BarChart
                    data={analysis.categories}
                    margin={{ top: 12, right: 16, left: 0, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                    <XAxis
                      dataKey="shortLabel"
                      tick={{ fontSize: 11, fill: '#334155', fontWeight: 600 }}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 11, fill: '#475569' }}
                      unit="%"
                    />
                    <Tooltip
                      formatter={(value: any, name: any) => [`${value}%`, name]}
                      contentStyle={{
                        borderRadius: '12px',
                        border: '1px solid #E2E8F0',
                        fontSize: '12px'
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Bar
                      dataKey="errorRatePct"
                      name="Tỷ lệ bài mắc lỗi (%)"
                      fill="#E11D48"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={38}
                    />
                    <Bar
                      dataKey="masteryPct"
                      name="Độ vững tiêu chí (%)"
                      fill="#0D9488"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={38}
                    />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          {/* Cột phải (5/12): Chẩn đoán chi tiết từng nhóm lỗi & Hướng khắc phục */}
          <div className="lg:col-span-5 space-y-3">
            {analysis.topError ? (
              <div className="p-3.5 rounded-xl bg-rose-50/90 border border-rose-200/90 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-900">
                    <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
                    <span>Lỗi cần ưu tiên khắc phục nhất: {analysis.topError.shortLabel}</span>
                  </span>
                  <span className="px-2 py-0.5 rounded bg-rose-200/80 text-rose-950 font-mono text-[11px] font-bold">
                    {analysis.topError.errorCount}/{analysis.total} bài ({analysis.topError.errorRatePct}%)
                  </span>
                </div>
                <p className="text-xs text-rose-900 leading-relaxed">
                  <strong>Biểu hiện thực tế:</strong> {analysis.topError.sampleWeakness}
                </p>
                <p className="text-xs text-stone-800 bg-white/90 p-2.5 rounded-lg border border-rose-200/70 leading-relaxed">
                  <Wrench className="w-3.5 h-3.5 text-indigo-700 inline mr-1 -mt-0.5" />
                  <strong>Giải pháp:</strong> {analysis.topError.remedyAdvice}
                </p>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">Phong độ viết rất ổn định!</div>
                  <p className="mt-0.5 text-emerald-800">
                    Các bài viết đã lưu của bạn đều đáp ứng tốt các tiêu chí cấu trúc, triển khai ý, dẫn chứng và dùng từ.
                  </p>
                </div>
              </div>
            )}

            {/* Danh sách 4 nhóm tiêu chí kèm thanh chỉ báo */}
            <div className="space-y-2">
              {analysis.categories.map((cat) => (
                <div
                  key={cat.key}
                  className="p-3 rounded-xl bg-stone-50 border border-stone-200/80 space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[#0F172A]">{cat.fullTitle}</span>
                    <span className="font-mono font-semibold text-stone-700">
                      Lỗi: {cat.errorCount}/{cat.totalAnalyzed} bài · Vững: {cat.masteryPct}%
                    </span>
                  </div>
                  <div className="text-[11px] text-stone-600 line-clamp-2">
                    <Sparkles className="w-3 h-3 text-amber-600 inline mr-1 -mt-0.5" />
                    {cat.remedyAdvice}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
