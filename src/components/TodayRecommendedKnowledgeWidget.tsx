import React from 'react';
import {
  DailyKnowledgeRecommendation,
  KnowledgeCard
} from '../types';
import {
  Lightbulb,
  Clock,
  Sparkles,
  ArrowRight,
  BookOpen,
  CheckCircle,
  X,
  Target
} from 'lucide-react';

interface TodayRecommendedKnowledgeWidgetProps {
  recommendations: DailyKnowledgeRecommendation[];
  knowledgeCards: KnowledgeCard[];
  onLearnCard: (cardId: string) => void;
  onGoToExercise: (cardId: string) => void;
  onDismissRecommendation: (cardId: string) => void;
  onViewAllKnowledge: () => void;
}

export const TodayRecommendedKnowledgeWidget: React.FC<TodayRecommendedKnowledgeWidgetProps> = ({
  recommendations,
  knowledgeCards,
  onLearnCard,
  onGoToExercise,
  onDismissRecommendation,
  onViewAllKnowledge
}) => {
  if (recommendations.length === 0) {
    return (
      <div className="p-5 rounded-2xl bg-white border border-stone-200 shadow-xs flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-serif-literary font-bold text-sm text-[#0F172A]">
              Bạn đã xem hết các gợi ý kiến thức ưu tiên hôm nay!
            </h4>
            <p className="text-xs text-stone-500">
              Hãy tiếp tục khám phá thêm các chuyên đề khác trong thư viện hoặc luyện đề thi thử.
            </p>
          </div>
        </div>
        <button
          onClick={onViewAllKnowledge}
          className="px-3.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold rounded-lg transition-colors cursor-pointer shrink-0"
        >
          Mở Thư viện Tri thức
        </button>
      </div>
    );
  }

  return (
    <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-amber-50/70 via-white to-emerald-50/40 border border-amber-200/80 shadow-xs space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-800 flex items-center justify-center border border-amber-400/30">
            <Lightbulb className="w-4 h-4 text-amber-700" />
          </div>
          <div>
            <h3 className="font-serif-literary font-bold text-base sm:text-lg text-[#0F172A]">
              Kiến thức bạn nên ôn hôm nay (Ưu tiên cá nhân hóa)
            </h3>
            <p className="text-xs text-stone-600">
              Hệ thống tự động đề xuất dựa trên Khảo sát năng lực và kết quả phân tích bài làm gần nhất của bạn
            </p>
          </div>
        </div>

        <button
          onClick={onViewAllKnowledge}
          className="text-xs font-semibold text-emerald-800 hover:text-emerald-950 flex items-center gap-1 cursor-pointer"
        >
          <span>Xem tất cả chuyên đề</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Grid 3 thẻ gợi ý */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {recommendations.map((rec) => {
          const card = knowledgeCards.find((c) => c.id === rec.cardId);

          return (
            <div
              key={rec.cardId}
              className="p-4 rounded-xl bg-white border border-stone-200/90 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between space-y-3 relative group"
            >
              {/* Nút bỏ qua / để sau */}
              <button
                onClick={() => onDismissRecommendation(rec.cardId)}
                className="absolute top-3 right-3 text-stone-300 hover:text-stone-600 p-1 rounded-md transition-colors cursor-pointer"
                title="Để sau (Bỏ qua hôm nay)"
              >
                <X className="w-3.5 h-3.5" />
              </button>

              <div className="space-y-2 pr-5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded">
                    {rec.categoryName}
                  </span>
                  <span className="text-[11px] text-stone-400 flex items-center gap-0.5">
                    <Clock className="w-3 h-3" /> {rec.estimatedMinutes} phút
                  </span>
                </div>

                <h4 className="font-serif-literary font-bold text-sm text-[#0F172A] leading-snug line-clamp-1">
                  {rec.cardTitle}
                </h4>

                {/* Lí do đề xuất mang tính xây dựng */}
                <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-100 text-[11px] text-stone-700 leading-relaxed space-y-1">
                  <span className="font-semibold text-emerald-900 block flex items-center gap-1">
                    <Target className="w-3 h-3 text-emerald-700" />
                    <span>Lí do gợi ý:</span>
                  </span>
                  <p>{rec.reason}</p>
                </div>
              </div>

              {/* 3 Nút hành động */}
              <div className="pt-2 border-t border-stone-100 flex items-center justify-between gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => onLearnCard(rec.cardId)}
                  className="flex-1 py-1.5 px-2 bg-[#0F172A] hover:bg-[#1E293B] text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer text-[11px]"
                >
                  <BookOpen className="w-3 h-3 text-emerald-400" />
                  <span>Học nhanh</span>
                </button>

                <button
                  type="button"
                  onClick={() => onGoToExercise(rec.cardId)}
                  className="py-1.5 px-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-semibold rounded-lg border border-emerald-200 transition-colors flex items-center gap-1 cursor-pointer text-[11px]"
                >
                  <span>Làm bài luyện</span>
                </button>

                <button
                  type="button"
                  onClick={() => onDismissRecommendation(rec.cardId)}
                  className="py-1.5 px-2 text-stone-400 hover:text-stone-700 transition-colors cursor-pointer text-[11px]"
                >
                  Để sau
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
