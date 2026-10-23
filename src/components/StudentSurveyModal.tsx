import React, { useState } from 'react';
import {
  StudentSurveyData,
  SkillKey,
  QuickTargetScoreRange,
  QuickFocusArea,
  QuickDailyTime
} from '../types';
import { HIGH_SCHOOL_SKILLS_CATALOG } from '../data/skillsCatalog';
import {
  Sparkles,
  X,
  CheckCircle,
  HelpCircle,
  Save,
  Target,
  Clock,
  BookOpen,
  PenTool,
  Award,
  AlertCircle,
  ArrowRight,
  Compass,
  Check,
  FileText,
  SlidersHorizontal
} from 'lucide-react';

interface StudentSurveyModalProps {
  isOpen: boolean;
  initialData: StudentSurveyData;
  onClose: () => void;
  onSave: (data: StudentSurveyData) => void;
  initialMode?: 'quick' | 'deep';
}

export const StudentSurveyModal: React.FC<StudentSurveyModalProps> = ({
  isOpen,
  initialData,
  onClose,
  onSave,
  initialMode = 'quick'
}) => {
  // Chế độ: 'quick' (Khảo sát nhanh 30 giây) hoặc 'deep' (Thiết lập lộ trình học tập chuyên sâu)
  const [mode, setMode] = useState<'quick' | 'deep'>(initialMode);

  // State cho Khảo sát nhanh (3 câu cốt lõi)
  const [quickTarget, setQuickTarget] = useState<QuickTargetScoreRange>(
    initialData.quickTargetScoreRange ||
      (initialData.targetScore >= 8.5
        ? 'above_8'
        : initialData.targetScore >= 7.0
        ? '7_to_8'
        : initialData.targetScore >= 5.0
        ? '5_to_6_5'
        : '7_to_8')
  );

  const [quickFocus, setQuickFocus] = useState<QuickFocusArea>(
    initialData.quickFocusArea ||
      (initialData.prioritySkillToImprove?.includes('reading')
        ? 'reading'
        : initialData.prioritySkillToImprove?.includes('essay')
        ? 'essay_600w'
        : initialData.prioritySkillToImprove?.includes('paragraph') ||
          initialData.prioritySkillToImprove?.includes('evidence')
        ? 'paragraph_200w'
        : 'paragraph_200w')
  );

  const [quickTime, setQuickTime] = useState<QuickDailyTime>(
    initialData.quickDailyTime ||
      (initialData.practiceTimeAvailability === '15_phut_ngay'
        ? '10_15_mins'
        : initialData.practiceTimeAvailability === '30_phut_ngay'
        ? '20_30_mins'
        : initialData.practiceTimeAvailability === '2_3_gio_tuan'
        ? 'full_exam'
        : '10_15_mins')
  );

  // State cho phần Thiết lập lộ trình chuyên sâu (tùy chọn trong hồ sơ)
  const [deepFormData, setDeepFormData] = useState<StudentSurveyData>(initialData);
  const [deepStep, setDeepStep] = useState<'scores' | 'skills' | 'preferences'>('scores');

  if (!isOpen) return null;

  // Xử lý lưu Khảo sát nhanh (30 giây)
  const handleSaveQuickSurvey = () => {
    // Map điểm mục tiêu tương ứng
    let targetNum = 7.5;
    if (quickTarget === 'under_5') targetNum = 4.75;
    else if (quickTarget === '5_to_6_5') targetNum = 6.25;
    else if (quickTarget === '7_to_8') targetNum = 7.75;
    else if (quickTarget === 'above_8') targetNum = 8.5;

    // Map kĩ năng ưu tiên ban đầu (chỉ dùng tham khảo khi chưa có bài làm thực tế)
    let prioritySkill: SkillKey = 'writing_paragraph_200w';
    let mostDifficult: StudentSurveyData['mostDifficultFormat'] = 'doan_van_200_chu';
    if (quickFocus === 'reading') {
      prioritySkill = 'reading_main_idea';
      mostDifficult = 'doc_hieu_van_ban_thong_tin';
    } else if (quickFocus === 'paragraph_200w') {
      prioritySkill = 'writing_paragraph_200w';
      mostDifficult = 'doan_van_200_chu';
    } else if (quickFocus === 'essay_600w') {
      prioritySkill = 'writing_essay_600w';
      mostDifficult = 'bai_van_nlvh';
    } else {
      prioritySkill = 'reading_main_idea';
      mostDifficult = 'doan_van_200_chu';
    }

    // Map thời gian
    let timeAvail: StudentSurveyData['practiceTimeAvailability'] = '30_phut_ngay';
    if (quickTime === '5_mins' || quickTime === '10_15_mins') timeAvail = '15_phut_ngay';
    else if (quickTime === '20_30_mins') timeAvail = '30_phut_ngay';
    else if (quickTime === 'full_exam') timeAvail = '2_3_gio_tuan';

    const updatedSurvey: StudentSurveyData = {
      ...deepFormData,
      isCompleted: true,
      surveyType: 'quick',
      quickTargetScoreRange: quickTarget,
      quickFocusArea: quickFocus,
      quickDailyTime: quickTime,
      targetScore: targetNum,
      prioritySkillToImprove: prioritySkill,
      mostDifficultFormat: mostDifficult,
      practiceTimeAvailability: timeAvail,
      completedAt: deepFormData.completedAt || new Date().toLocaleDateString('vi-VN'),
      updatedAt: new Date().toLocaleDateString('vi-VN')
    };

    onSave(updatedSurvey);
    onClose();
  };

  // Xử lý lưu Lộ trình chuyên sâu (tùy chọn)
  const handleSaveDeepSurvey = () => {
    const updatedSurvey: StudentSurveyData = {
      ...deepFormData,
      isCompleted: true,
      surveyType: 'deep',
      quickTargetScoreRange: quickTarget,
      quickFocusArea: quickFocus,
      quickDailyTime: quickTime,
      completedAt: deepFormData.completedAt || new Date().toLocaleDateString('vi-VN'),
      updatedAt: new Date().toLocaleDateString('vi-VN')
    };

    onSave(updatedSurvey);
    onClose();
  };

  const handleConfidenceChange = (key: SkillKey, val: number) => {
    setDeepFormData((prev) => ({
      ...prev,
      skillConfidence: {
        ...prev.skillConfidence,
        [key]: val
      }
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-fadeIn overflow-y-auto">
      <div className="bg-[#FAF7F2] rounded-2xl max-w-2xl w-full border border-stone-200 shadow-2xl overflow-hidden my-auto max-h-[94vh] flex flex-col">
        {/* Header thân thiện & Tinh gọn */}
        <div className="bg-[#0F172A] text-white px-5 sm:px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-600/30 border border-emerald-400/40 text-emerald-300 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-serif-literary text-base sm:text-lg font-bold text-white">
                  {mode === 'quick' ? 'Khảo sát nhanh năng lực Ngữ văn 12' : 'Thiết lập lộ trình học tập chuyên sâu'}
                </h2>
                {mode === 'quick' && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-400/30">
                    ⏱️ Khoảng 30 giây
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-300 mt-0.5">
                {mode === 'quick'
                  ? '3 câu hỏi cốt lõi giúp hệ thống gợi ý lộ trình phù hợp ngay lập tức'
                  : 'Tự khai kết quả học tập & cập nhật kỹ năng (hoàn toàn tùy chọn)'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer"
            title="Đóng modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Thanh chuyển đổi giữa Khảo sát nhanh và Thiết lập chuyên sâu */}
        <div className="bg-stone-100/90 border-b border-stone-200 px-5 sm:px-6 py-2.5 flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setMode('quick')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                mode === 'quick'
                  ? 'bg-[#0F172A] text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/70'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Khảo sát nhanh (30s)</span>
            </button>

            <button
              type="button"
              onClick={() => setMode('deep')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                mode === 'deep'
                  ? 'bg-[#0F172A] text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/70'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Thiết lập lộ trình chi tiết (Tùy chọn)</span>
            </button>
          </div>

          <span className="text-[11px] text-stone-500 hidden sm:inline">
            {mode === 'quick' ? 'Chọn 1 phương án' : 'Không bắt buộc điền hết'}
          </span>
        </div>

        {/* ========================================================
            CHẾ ĐỘ 1: KHẢO SÁT NHANH (3 CÂU HỎI CỐT LÕI - 30 GIÂY)
           ======================================================== */}
        {mode === 'quick' ? (
          <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 text-stone-800">
            {/* Lời giới thiệu thân thiện, ngắn gọn */}
            <div className="p-3.5 rounded-xl bg-emerald-50/90 border border-emerald-200/80 text-xs text-emerald-950 flex items-start gap-2.5 leading-relaxed">
              <Compass className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <strong>Chào mừng bạn đến với VănAI 12!</strong> Chỉ cần 3 lựa chọn nhanh bên dưới, hệ thống sẽ tự động điều chỉnh bài tập phù hợp với mục tiêu của bạn. Bạn luôn có thể cập nhật lại bất cứ lúc nào trong trang cá nhân.
              </div>
            </div>

            {/* Câu hỏi 1: Mục tiêu điểm Ngữ văn */}
            <div className="space-y-2.5">
              <label className="block text-xs sm:text-sm font-bold text-stone-900 flex items-center gap-1.5">
                <Target className="w-4 h-4 text-emerald-700" />
                <span>1. Mục tiêu điểm thi tốt nghiệp THPT của bạn:</span>
              </label>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {[
                  {
                    key: 'under_5' as QuickTargetScoreRange,
                    label: 'Dưới 5',
                    desc: 'Củng cố cơ bản'
                  },
                  {
                    key: '5_to_6_5' as QuickTargetScoreRange,
                    label: 'Từ 5 đến 6,5',
                    desc: 'Chuẩn tốt nghiệp'
                  },
                  {
                    key: '7_to_8' as QuickTargetScoreRange,
                    label: 'Từ 7 đến 8',
                    desc: 'Xét tuyển ĐH'
                  },
                  {
                    key: 'above_8' as QuickTargetScoreRange,
                    label: 'Trên 8',
                    desc: 'Chinh phục 8.5+'
                  }
                ].map((item) => {
                  const isSelected = quickTarget === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setQuickTarget(item.key)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'bg-emerald-900 text-white border-emerald-900 shadow-md ring-2 ring-emerald-500/40'
                          : 'bg-white text-stone-800 border-stone-200 hover:border-emerald-400 hover:bg-stone-50'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-bold text-sm">{item.label}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-emerald-300" />}
                      </div>
                      <span
                        className={`text-[10px] mt-1 ${
                          isSelected ? 'text-emerald-200' : 'text-stone-500'
                        }`}
                      >
                        {item.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Câu hỏi 2: Phần muốn cải thiện nhất */}
            <div className="space-y-2.5">
              <label className="block text-xs sm:text-sm font-bold text-stone-900 flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-blue-700" />
                <span>2. Phần bạn muốn cải thiện nhất lúc này:</span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {[
                  {
                    key: 'reading' as QuickFocusArea,
                    label: 'Đọc hiểu (4,0 điểm)',
                    desc: 'Nhận biết ngữ liệu, tu từ, thông điệp tác giả'
                  },
                  {
                    key: 'paragraph_200w' as QuickFocusArea,
                    label: 'Đoạn văn khoảng 200 chữ (2,0 điểm)',
                    desc: 'Kĩ năng viết đoạn NLXH, lập luận và dẫn chứng'
                  },
                  {
                    key: 'essay_600w' as QuickFocusArea,
                    label: 'Bài văn khoảng 600 chữ (4,0 điểm)',
                    desc: 'Nghị luận văn học, bố cục mở - thân - kết sâu sắc'
                  },
                  {
                    key: 'unknown' as QuickFocusArea,
                    label: 'Chưa biết mình cần cải thiện phần nào',
                    desc: 'Muốn luyện thử để hệ thống tự phát hiện điểm yếu'
                  }
                ].map((item) => {
                  const isSelected = quickFocus === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setQuickFocus(item.key)}
                      className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#0F172A] text-white border-[#0F172A] shadow-md ring-2 ring-stone-400/50'
                          : 'bg-white text-stone-800 border-stone-200 hover:border-stone-400 hover:bg-stone-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs sm:text-sm">{item.label}</span>
                        {isSelected && <Check className="w-4 h-4 text-emerald-400" />}
                      </div>
                      <p
                        className={`text-[11px] mt-1 leading-relaxed ${
                          isSelected ? 'text-stone-300' : 'text-stone-500'
                        }`}
                      >
                        {item.desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Câu hỏi 3: Thời gian luyện tập mỗi ngày */}
            <div className="space-y-2.5">
              <label className="block text-xs sm:text-sm font-bold text-stone-900 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-purple-700" />
                <span>3. Thời gian bạn có thể dành để luyện tập mỗi ngày:</span>
              </label>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {[
                  {
                    key: '5_mins' as QuickDailyTime,
                    label: '5 phút',
                    desc: 'Khởi động nhanh'
                  },
                  {
                    key: '10_15_mins' as QuickDailyTime,
                    label: '10–15 phút',
                    desc: 'Chuẩn khuyến nghị'
                  },
                  {
                    key: '20_30_mins' as QuickDailyTime,
                    label: '20–30 phút',
                    desc: 'Luyện sâu có bài viết'
                  },
                  {
                    key: 'full_exam' as QuickDailyTime,
                    label: 'Luyện đề đầy đủ',
                    desc: 'Làm trọn bộ 120 phút'
                  }
                ].map((item) => {
                  const isSelected = quickTime === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setQuickTime(item.key)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'bg-purple-900 text-white border-purple-900 shadow-md ring-2 ring-purple-400/40'
                          : 'bg-white text-stone-800 border-stone-200 hover:border-purple-300 hover:bg-stone-50'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-bold text-xs sm:text-sm">{item.label}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-purple-200" />}
                      </div>
                      <span
                        className={`text-[10px] mt-1 ${
                          isSelected ? 'text-purple-200' : 'text-stone-500'
                        }`}
                      >
                        {item.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Chú thích quan trọng về tính linh hoạt */}
            <div className="text-[11px] text-stone-500 flex items-center gap-2 pt-1 border-t border-stone-200/80">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>
                Bạn có thể bỏ qua khảo sát này và quay lại thiết lập bất kỳ lúc nào từ mục Hồ sơ cá nhân.
              </span>
            </div>
          </div>
        ) : (
          /* ========================================================
             CHẾ ĐỘ 2: THIẾT LẬP LỘ TRÌNH HỌC TẬP CHUYÊN SÂU (TỰ CHỌN)
             ======================================================== */
          <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 text-stone-800">
            {/* Phân bước lộ trình chuyên sâu */}
            <div className="flex items-center gap-2 border-b border-stone-200 pb-3 text-xs">
              <button
                type="button"
                onClick={() => setDeepStep('scores')}
                className={`px-3 py-1.5 rounded-lg font-medium cursor-pointer transition-colors ${
                  deepStep === 'scores'
                    ? 'bg-stone-900 text-white font-semibold'
                    : 'text-stone-600 hover:bg-stone-200'
                }`}
              >
                1. Điểm số tự khai (Tùy chọn)
              </button>
              <button
                type="button"
                onClick={() => setDeepStep('skills')}
                className={`px-3 py-1.5 rounded-lg font-medium cursor-pointer transition-colors ${
                  deepStep === 'skills'
                    ? 'bg-stone-900 text-white font-semibold'
                    : 'text-stone-600 hover:bg-stone-200'
                }`}
              >
                2. Tự đánh giá kỹ năng (1-5)
              </button>
              <button
                type="button"
                onClick={() => setDeepStep('preferences')}
                className={`px-3 py-1.5 rounded-lg font-medium cursor-pointer transition-colors ${
                  deepStep === 'preferences'
                    ? 'bg-stone-900 text-white font-semibold'
                    : 'text-stone-600 hover:bg-stone-200'
                }`}
              >
                3. Định dạng mong muốn
              </button>
            </div>

            {/* BƯỚC 1: ĐIỂM SỐ TỰ KHAI */}
            {deepStep === 'scores' && (
              <div className="space-y-4 animate-fadeIn">
                <div className="p-3.5 rounded-xl bg-blue-50/80 border border-blue-200 text-xs text-blue-900 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                  <div>
                    <strong>Nguyên tắc tôn trọng học sinh:</strong> Nếu bạn không nhớ chính xác điểm hoặc chưa từng thi thử, hãy <strong>để trống</strong>. Hệ thống không tự điền điểm giả và không suy đoán năng lực của bạn.
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Điểm Ngữ văn gần nhất của bạn:
                    </label>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      max="10"
                      value={deepFormData.selfReportedLatestScore ?? ''}
                      onChange={(e) =>
                        setDeepFormData({
                          ...deepFormData,
                          selfReportedLatestScore: e.target.value ? parseFloat(e.target.value) : null
                        })
                      }
                      placeholder="VD: 6.5 hoặc để trống"
                      className="w-full px-3 py-2 text-sm bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                    />
                    <span className="text-[11px] text-stone-500 mt-1 block">
                      (Điểm kiểm tra 1 tiết, giữa kỳ hoặc cuối kỳ)
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Điểm thi thử THPT gần nhất (nếu có):
                    </label>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      max="10"
                      value={deepFormData.selfReportedMockScore ?? ''}
                      onChange={(e) =>
                        setDeepFormData({
                          ...deepFormData,
                          selfReportedMockScore: e.target.value ? parseFloat(e.target.value) : null
                        })
                      }
                      placeholder="VD: 7.25 hoặc để trống"
                      className="w-full px-3 py-2 text-sm bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                    />
                  </div>
                </div>

                {/* Điểm thành phần chi tiết (tùy chọn) */}
                <div className="p-4 bg-white rounded-xl border border-stone-200 space-y-3">
                  <span className="text-xs font-bold text-stone-800 block">
                    Điểm thành phần chi tiết (Để trống nếu không nhớ rõ):
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] text-stone-600 mb-1">
                        Đọc hiểu (thang 4,0đ):
                      </label>
                      <input
                        type="number"
                        step="0.25"
                        min="0"
                        max="4"
                        value={deepFormData.selfReportedReadingScore ?? ''}
                        onChange={(e) =>
                          setDeepFormData({
                            ...deepFormData,
                            selfReportedReadingScore: e.target.value ? parseFloat(e.target.value) : null
                          })
                        }
                        placeholder="VD: 2.75"
                        className="w-full px-2.5 py-1.5 text-xs bg-stone-50 border border-stone-300 rounded-md"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-stone-600 mb-1">
                        Đoạn văn 200 chữ (thang 2,0đ):
                      </label>
                      <input
                        type="number"
                        step="0.25"
                        min="0"
                        max="2"
                        value={deepFormData.selfReportedParagraphScore ?? ''}
                        onChange={(e) =>
                          setDeepFormData({
                            ...deepFormData,
                            selfReportedParagraphScore: e.target.value ? parseFloat(e.target.value) : null
                          })
                        }
                        placeholder="VD: 1.5"
                        className="w-full px-2.5 py-1.5 text-xs bg-stone-50 border border-stone-300 rounded-md"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-stone-600 mb-1">
                        Bài văn 600 chữ (thang 4,0đ):
                      </label>
                      <input
                        type="number"
                        step="0.25"
                        min="0"
                        max="4"
                        value={deepFormData.selfReportedEssayScore ?? ''}
                        onChange={(e) =>
                          setDeepFormData({
                            ...deepFormData,
                            selfReportedEssayScore: e.target.value ? parseFloat(e.target.value) : null
                          })
                        }
                        placeholder="VD: 2.75"
                        className="w-full px-2.5 py-1.5 text-xs bg-stone-50 border border-stone-300 rounded-md"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Thời điểm làm bài / nhận điểm:
                    </label>
                    <input
                      type="text"
                      value={deepFormData.examDateOrScoreDate}
                      onChange={(e) =>
                        setDeepFormData({ ...deepFormData, examDateOrScoreDate: e.target.value })
                      }
                      placeholder="VD: Giữa kỳ 1 (Tháng 10/2026)"
                      className="w-full px-3 py-2 text-sm bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Mức điểm mục tiêu trong kỳ thi THPT:
                    </label>
                    <input
                      type="number"
                      step="0.25"
                      min="4"
                      max="10"
                      value={deepFormData.targetScore || ''}
                      onChange={(e) =>
                        setDeepFormData({
                          ...deepFormData,
                          targetScore: parseFloat(e.target.value) || 8.0
                        })
                      }
                      placeholder="VD: 8.0"
                      className="w-full px-3 py-2 text-sm bg-white border border-emerald-500 rounded-lg font-bold text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* BƯỚC 2: TỰ ĐÁNH GIÁ 10 KỸ NĂNG (TÙY CHỌN) */}
            {deepStep === 'skills' && (
              <div className="space-y-3.5 animate-fadeIn">
                <div className="p-3 rounded-xl bg-stone-100 text-xs text-stone-600 flex items-center justify-between">
                  <span>Thang đánh giá: <strong>1 (Chưa tự tin)</strong> → <strong>5 (Rất tự tin)</strong></span>
                  <span className="text-[11px] text-stone-500">Chỉ đánh giá kĩ năng bạn quan tâm</span>
                </div>

                <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                  {HIGH_SCHOOL_SKILLS_CATALOG.map((skill, idx) => {
                    const currentScore = deepFormData.skillConfidence[skill.key] || 3;
                    return (
                      <div
                        key={skill.key}
                        className="p-3 bg-white rounded-xl border border-stone-200 shadow-2xs space-y-1.5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="max-w-md">
                            <span className="text-xs font-bold text-stone-900 block">
                              {idx + 1}. {skill.label}
                            </span>
                            <p className="text-[11px] text-stone-500 line-clamp-2">
                              {skill.description}
                            </p>
                          </div>

                          <div className="flex items-center gap-1 shrink-0 bg-stone-50 p-1 rounded-lg border border-stone-200">
                            {[1, 2, 3, 4, 5].map((val) => (
                              <button
                                key={val}
                                type="button"
                                onClick={() => handleConfidenceChange(skill.key, val)}
                                className={`w-6 h-6 rounded text-xs font-bold transition-all cursor-pointer ${
                                  currentScore === val
                                    ? 'bg-emerald-800 text-white shadow-xs'
                                    : 'text-stone-600 hover:bg-stone-200'
                                }`}
                              >
                                {val}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* BƯỚC 3: ĐỊNH DẠNG MONG MUỐN */}
            {deepStep === 'preferences' && (
              <div className="space-y-4 animate-fadeIn">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Kĩ năng bạn muốn ưu tiên cải thiện nhất:
                  </label>
                  <select
                    value={deepFormData.prioritySkillToImprove || 'writing_paragraph_200w'}
                    onChange={(e) =>
                      setDeepFormData({
                        ...deepFormData,
                        prioritySkillToImprove: e.target.value as SkillKey
                      })
                    }
                    className="w-full px-3 py-2 text-xs bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  >
                    {HIGH_SCHOOL_SKILLS_CATALOG.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label} ({s.category})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Dạng bài bạn cảm thấy khó khăn nhất:
                  </label>
                  <select
                    value={deepFormData.mostDifficultFormat || 'doan_van_200_chu'}
                    onChange={(e) =>
                      setDeepFormData({
                        ...deepFormData,
                        mostDifficultFormat: e.target.value as any
                      })
                    }
                    className="w-full px-3 py-2 text-xs bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  >
                    <option value="doan_van_200_chu">Đoạn văn Nghị luận xã hội 200 chữ</option>
                    <option value="bai_van_nlvh">Bài văn Nghị luận văn học (600 chữ)</option>
                    <option value="doc_hieu_tho">Đọc hiểu ngữ liệu Thơ / Thơ tự do</option>
                    <option value="doc_hieu_van_ban_thong_tin">Đọc hiểu văn bản thông tin / Báo chí</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Hình thức luyện tập ưa thích:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {[
                      { id: 'bai_ngan', label: 'Bài ngắn (10-15 phút)', desc: 'Rèn từng kỹ năng đơn lẻ' },
                      { id: 'cau_hoi_tung_buoc', label: 'Câu hỏi từng bước', desc: 'Có gợi mở câu chữ và dẫn chứng' },
                      { id: 'de_tung_phan', label: 'Đề từng phần', desc: 'Luyện riêng Đọc hiểu hoặc NLXH' },
                      { id: 'thi_thu_day_du', label: 'Thi thử đầy đủ (120p)', desc: 'Luyện trọn bộ đề thi tốt nghiệp' }
                    ].map((fmt) => (
                      <button
                        key={fmt.id}
                        type="button"
                        onClick={() =>
                          setDeepFormData({ ...deepFormData, preferredFormat: fmt.id as any })
                        }
                        className={`text-left p-3 rounded-xl border transition-all cursor-pointer ${
                          deepFormData.preferredFormat === fmt.id
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-950 font-medium'
                            : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'
                        }`}
                      >
                        <div className="font-semibold">{fmt.label}</div>
                        <div className="text-[11px] text-stone-500 mt-0.5">{fmt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer Hành Động: Phân minh các lựa chọn */}
        <div className="bg-stone-100/90 border-t border-stone-200 px-5 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Nút Bỏ qua / Thiết lập sau */}
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl text-stone-600 hover:text-stone-900 hover:bg-stone-200/80 text-xs font-semibold transition-colors cursor-pointer"
          >
            Thiết lập lộ trình sau
          </button>

          <div className="flex items-center gap-2">
            {mode === 'quick' ? (
              <button
                type="button"
                onClick={handleSaveQuickSurvey}
                className="px-5 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-2 transition-all cursor-pointer"
              >
                <span>Lưu & Bắt đầu luyện tập</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSaveDeepSurvey}
                className="px-5 py-2.5 bg-[#0F172A] hover:bg-stone-800 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-2 transition-all cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>Lưu lộ trình chuyên sâu</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
