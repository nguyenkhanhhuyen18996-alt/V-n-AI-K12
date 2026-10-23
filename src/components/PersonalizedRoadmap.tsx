import React, { useState } from 'react';
import { PersonalizedRecommendation } from '../types';
import {
  Compass,
  Clock,
  ArrowRight,
  Sparkles,
  BookOpen,
  PenTool,
  CheckCircle,
  EyeOff,
  Tag
} from 'lucide-react';

interface PersonalizedRoadmapProps {
  recommendations: PersonalizedRecommendation[];
  onStartExercise: (rec: PersonalizedRecommendation) => void;
  onDismissExercise: (recId: string) => void;
  onRefreshRecommendations?: () => void;
}

export const PersonalizedRoadmap: React.FC<PersonalizedRoadmapProps> = ({
  recommendations,
  onStartExercise,
  onDismissExercise
}) => {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
            <Compass className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-serif-literary text-lg font-bold text-[#0F172A] flex items-center gap-2">
              <span>Lộ trình luyện tập dành riêng cho bạn</span>
              <span className="text-[11px] font-sans font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                {recommendations.length} bài ưu tiên
              </span>
            </h3>
            <p className="text-xs text-stone-500">
              Được cá nhân hóa theo mục tiêu điểm số và các tiêu chí bạn cần bứt phá nhất
            </p>
          </div>
        </div>
      </div>

      {recommendations.length === 0 ? (
        <div className="p-8 text-center rounded-2xl bg-white border border-dashed border-stone-300 text-xs text-stone-500 space-y-2">
          <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto" />
          <p className="font-semibold text-stone-800">
            Bạn đã xem hoặc hoàn thành tất cả các bài luyện được đề xuất!
          </p>
          <p className="text-stone-500">
            Hãy tiếp tục luyện đề trong Ngân hàng đề thi hoặc cập nhật lại Khảo sát năng lực để nhận thêm đề xuất mới.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {recommendations.map((rec) => {
            const isReading = rec.type === 'reading';
            const isAiGenerated = rec.source === 'ai_generated';

            return (
              <div
                key={rec.id}
                className="p-5 bg-white rounded-2xl border border-stone-200 shadow-xs flex flex-col justify-between space-y-4 transition-all hover:border-stone-300 hover:shadow-sm"
              >
                <div className="space-y-3">
                  {/* Header nhãn */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <div className="flex items-center gap-1.5 font-medium">
                      <span
                        className={`px-2 py-0.5 rounded-md font-semibold ${
                          isReading
                            ? 'bg-blue-50 text-blue-800 border border-blue-200'
                            : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        }`}
                      >
                        {isReading ? 'Phần Đọc hiểu' : 'Phần Làm văn'}
                      </span>
                      <span className="text-stone-400">·</span>
                      <span className="text-stone-600 font-medium">
                        Mức độ: <strong>{rec.level}</strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-stone-500">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{rec.estimatedMinutes} phút</span>
                    </div>
                  </div>

                  {/* Tên bài */}
                  <h4 className="font-serif-literary text-base font-bold text-[#0F172A] leading-snug">
                    {rec.title}
                  </h4>

                  {/* Kỹ năng mục tiêu */}
                  <div className="flex items-center gap-1.5 text-xs text-stone-600">
                    <Tag className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                    <span>Kĩ năng mục tiêu: <strong className="text-stone-800">{rec.targetSkillName}</strong></span>
                  </div>

                  {/* Lí do đề xuất */}
                  <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/80 text-xs text-stone-700 leading-relaxed">
                    <span className="font-semibold text-emerald-900 block mb-0.5">
                      💡 Lí do đề xuất:
                    </span>
                    {rec.reason}
                  </div>

                  {/* Nguồn đề */}
                  <div className="text-[11px] text-stone-500">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded ${
                        isAiGenerated
                          ? 'bg-purple-50 text-purple-700 border border-purple-200'
                          : 'bg-stone-100 text-stone-600'
                      }`}
                    >
                      {isAiGenerated ? <Sparkles className="w-3 h-3" /> : <BookOpen className="w-3 h-3" />}
                      <span>{rec.sourceBadge}</span>
                    </span>
                  </div>
                </div>

                {/* Các nút hành động */}
                <div className="pt-2 border-t border-stone-100 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onDismissExercise(rec.id)}
                    className="px-3 py-1.5 text-xs text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>Để sau</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onStartExercise(rec)}
                    className="px-4 py-2 text-xs font-bold text-white bg-[#0F172A] hover:bg-[#1E293B] rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <span>Bắt đầu luyện tập</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
