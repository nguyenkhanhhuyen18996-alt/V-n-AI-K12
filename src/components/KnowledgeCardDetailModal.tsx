import React, { useState } from 'react';
import {
  KnowledgeCard,
  StudentKnowledgeInteraction,
  KnowledgePracticeQuestion
} from '../types';
import {
  X,
  BookOpen,
  Target,
  CheckCircle,
  AlertTriangle,
  Lightbulb,
  Bookmark,
  RotateCcw,
  Sparkles,
  ArrowRight,
  Clock,
  Eye,
  Check,
  HelpCircle,
  Compass,
  FileText
} from 'lucide-react';

interface KnowledgeCardDetailModalProps {
  card: KnowledgeCard | null;
  isOpen: boolean;
  interaction?: StudentKnowledgeInteraction;
  onClose: () => void;
  onToggleBookmark: (cardId: string) => void;
  onToggleNeedsReview: (cardId: string) => void;
  onRecordStudy: (cardId: string) => void;
  onRecordPracticeScore: (cardId: string, score: number) => void;
  onNavigateToExercise?: (type: 'reading' | 'writing', targetId?: string) => void;
}

export const KnowledgeCardDetailModal: React.FC<KnowledgeCardDetailModalProps> = ({
  card,
  isOpen,
  interaction,
  onClose,
  onToggleBookmark,
  onToggleNeedsReview,
  onRecordStudy,
  onRecordPracticeScore,
  onNavigateToExercise
}) => {
  // Active tab inside modal
  const [activeTab, setActiveTab] = useState<'theory' | 'practice'>('theory');

  // Interactive Question State
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState<number>(0);
  const [userSelectedOption, setUserSelectedOption] = useState<number | null>(null);
  const [userShortAnswer, setUserShortAnswer] = useState<string>('');
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState<boolean>(false);
  const [showFullExplanation, setShowFullExplanation] = useState<boolean>(false);
  const [answerResult, setAnswerResult] = useState<'correct' | 'partial' | 'review' | null>(null);

  // Mark as studied when opening
  React.useEffect(() => {
    if (isOpen && card && onRecordStudy) {
      onRecordStudy(card.id);
    }
  }, [isOpen, card?.id]);

  // Reset question state when changing card
  React.useEffect(() => {
    setSelectedQuestionIndex(0);
    setUserSelectedOption(null);
    setUserShortAnswer('');
    setIsAnswerSubmitted(false);
    setShowFullExplanation(false);
    setAnswerResult(null);
    setActiveTab('theory');
  }, [card?.id]);

  if (!isOpen || !card) return null;

  const activeQuestion: KnowledgePracticeQuestion | undefined =
    card.practiceQuestions && card.practiceQuestions.length > selectedQuestionIndex
      ? card.practiceQuestions[selectedQuestionIndex]
      : undefined;

  const handleSelectQuestion = (index: number) => {
    setSelectedQuestionIndex(index);
    setUserSelectedOption(null);
    setUserShortAnswer('');
    setIsAnswerSubmitted(false);
    setShowFullExplanation(false);
    setAnswerResult(null);
  };

  const handleCheckAnswer = () => {
    if (!activeQuestion) return;

    if (activeQuestion.type === 'multiple_choice') {
      if (userSelectedOption === null) return;
      const isCorrect = userSelectedOption === activeQuestion.correctOptionIndex;
      setAnswerResult(isCorrect ? 'correct' : 'review');
      setIsAnswerSubmitted(true);
      if (isCorrect) {
        onRecordPracticeScore(card.id, 100);
      } else {
        onRecordPracticeScore(card.id, 50);
      }
    } else {
      // Short answer
      if (!userShortAnswer.trim()) return;
      const textLower = userShortAnswer.toLowerCase();
      // Check keyword coverage
      const hitCount = activeQuestion.expectedKeyPoints.filter((kp) =>
        textLower.includes(kp.toLowerCase())
      ).length;

      if (hitCount >= Math.ceil(activeQuestion.expectedKeyPoints.length * 0.6)) {
        setAnswerResult('correct');
        onRecordPracticeScore(card.id, 90);
      } else if (hitCount > 0) {
        setAnswerResult('partial');
        onRecordPracticeScore(card.id, 65);
      } else {
        setAnswerResult('review');
        onRecordPracticeScore(card.id, 40);
      }
      setIsAnswerSubmitted(true);
    }
  };

  const handleRetry = () => {
    setUserSelectedOption(null);
    setUserShortAnswer('');
    setIsAnswerSubmitted(false);
    setShowFullExplanation(false);
    setAnswerResult(null);
  };

  const isBookmarked = interaction?.isBookmarked || false;
  const needsReview = interaction?.needsReview || false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs animate-fadeIn overflow-y-auto">
      <div className="bg-[#FAF7F2] rounded-2xl max-w-4xl w-full border border-stone-200 shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* MODAL HEADER */}
        <div className="bg-[#0F172A] text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center justify-center border border-emerald-400/30">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                  {card.categoryName}
                </span>
                <span className="text-stone-500">·</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-stone-800 text-stone-300 border border-stone-700">
                  Mức độ: {card.levelName}
                </span>
                <span className="text-stone-500 hidden sm:inline">·</span>
                <span className="text-[11px] text-stone-400 flex items-center gap-1 hidden sm:flex">
                  <Clock className="w-3 h-3" /> {card.estimatedMinutes} phút học
                </span>
              </div>
              <h2 className="font-serif-literary text-lg sm:text-xl font-bold text-white mt-0.5">
                {card.title}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Nút Đánh dấu Yêu thích */}
            <button
              onClick={() => onToggleBookmark(card.id)}
              className={`p-2 rounded-lg transition-colors cursor-pointer ${
                isBookmarked
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                  : 'text-stone-400 hover:text-white hover:bg-stone-800'
              }`}
              title={isBookmarked ? 'Bỏ yêu thích' : 'Đánh dấu yêu thích'}
            >
              <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-amber-400 text-amber-400' : ''}`} />
            </button>

            {/* Nút Cần ôn lại */}
            <button
              onClick={() => onToggleNeedsReview(card.id)}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                needsReview
                  ? 'bg-red-500/20 text-red-300 border border-red-400/30'
                  : 'text-stone-300 hover:text-white hover:bg-stone-800'
              }`}
              title="Đánh dấu cần ôn lại kỹ lưỡng hơn"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{needsReview ? 'Đã ghim cần ôn' : 'Cần ôn lại'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* TAB SWITCHER: LÝ THUYẾT TINH GỌN VS BÀI TẬP TỰ KIỂM TRA */}
        <div className="px-6 bg-[#F5F1E9] border-b border-stone-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('theory')}
              className={`py-3 px-4 text-xs sm:text-sm font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'theory'
                  ? 'border-[#0F172A] text-[#0F172A]'
                  : 'border-transparent text-stone-600 hover:text-stone-900'
              }`}
            >
              <FileText className="w-4 h-4 text-emerald-700" />
              <span>Nội dung cốt lõi & Ví dụ ngữ cảnh</span>
            </button>

            <button
              onClick={() => setActiveTab('practice')}
              className={`py-3 px-4 text-xs sm:text-sm font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'practice'
                  ? 'border-[#0F172A] text-[#0F172A]'
                  : 'border-transparent text-stone-600 hover:text-stone-900'
              }`}
            >
              <Sparkles className="w-4 h-4 text-amber-600" />
              <span>Bài tập tự luyện tương tác ({card.practiceQuestions.length})</span>
            </button>
          </div>

          {/* Liên kết đến đề luyện tập trong ngân hàng */}
          <div className="hidden md:flex items-center gap-2 text-xs">
            {card.relatedPassageIds && card.relatedPassageIds.length > 0 && onNavigateToExercise && (
              <button
                onClick={() => {
                  onClose();
                  onNavigateToExercise('reading', card.relatedPassageIds?.[0]);
                }}
                className="text-blue-800 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Làm bài đọc hiểu tương ứng</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
            {card.relatedPromptIds && card.relatedPromptIds.length > 0 && onNavigateToExercise && (
              <button
                onClick={() => {
                  onClose();
                  onNavigateToExercise('writing', card.relatedPromptIds?.[0]);
                }}
                className="text-emerald-800 font-semibold hover:underline flex items-center gap-1 cursor-pointer ml-3"
              >
                <span>Luyện viết đề tương ứng</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* MODAL BODY */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6 text-sm text-stone-800">
          {activeTab === 'theory' ? (
            <div className="space-y-6">
              {/* 1. MỤC TIÊU CẦN ĐẠT */}
              <div className="p-4 rounded-xl bg-emerald-50/80 border border-emerald-200/80 space-y-1.5">
                <div className="flex items-center gap-2 text-emerald-900 font-bold text-xs uppercase tracking-wider">
                  <Target className="w-4 h-4 text-emerald-700" />
                  <span>Mục tiêu cần đạt trong kỳ thi THPT:</span>
                </div>
                <p className="text-emerald-950 font-medium leading-relaxed">{card.targetGoal}</p>
              </div>

              {/* 2. KHÁI NIỆM & GIẢI THÍCH TINH GỌN */}
              <div className="space-y-2">
                <h3 className="font-serif-literary font-bold text-base text-[#0F172A] flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-600"></div>
                  <span>1. Bản chất kiến thức & Định nghĩa chính xác</span>
                </h3>
                <div className="p-4 bg-white rounded-xl border border-stone-200 text-stone-700 leading-relaxed font-serif-literary">
                  {card.summary}
                </div>
              </div>

              {/* 3. DẤU HIỆU NHẬN BIẾT & QUY TRÌNH THỰC HIỆN */}
              <div className="space-y-2">
                <h3 className="font-serif-literary font-bold text-base text-[#0F172A] flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-600"></div>
                  <span>2. Dấu hiệu nhận biết & Các bước phân tích chuẩn</span>
                </h3>
                <div className="p-4 bg-white rounded-xl border border-stone-200 space-y-2.5">
                  {card.recognitionSigns.map((sign, idx) => (
                    <div key={idx} className="flex items-start gap-2.5">
                      <div className="w-5 h-5 rounded-full bg-stone-100 text-[#0F172A] flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                        {idx + 1}
                      </div>
                      <p className="text-stone-700 leading-relaxed">{sign}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* 4. PHÂN BIỆT DỄ NHẦM LẪN (NẾU CÓ) */}
              {card.distinctionNotes && (
                <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200 space-y-2">
                  <div className="flex items-center gap-2 text-amber-900 font-bold text-xs uppercase tracking-wider">
                    <Compass className="w-4 h-4 text-amber-700" />
                    <span>Lưu ý đặc biệt: Phân biệt để tránh mất điểm oan</span>
                  </div>
                  <div className="text-amber-950 text-xs sm:text-sm leading-relaxed whitespace-pre-line font-medium">
                    {card.distinctionNotes}
                  </div>
                </div>
              )}

              {/* 5. VÍ DỤ MINH HỌA GẮN VỚI NGỮ CẢNH CỤ THỂ */}
              <div className="space-y-3">
                <h3 className="font-serif-literary font-bold text-base text-[#0F172A] flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-600"></div>
                  <span>3. Ngữ liệu minh họa & Cách phân tích tác dụng cụ thể</span>
                </h3>
                <div className="space-y-3">
                  {card.examples.map((ex, idx) => (
                    <div key={idx} className="p-4 bg-white rounded-xl border border-stone-200 space-y-2.5">
                      <div className="p-3 bg-stone-50 rounded-lg border-l-3 border-[#0F172A] text-stone-900 font-serif-literary italic text-sm">
                        "{ex.quote}"
                      </div>
                      <div className="text-xs text-stone-500 font-medium">
                        — Nguồn trích: <span className="text-stone-700">{ex.source}</span>
                      </div>
                      <div className="text-xs text-stone-700 space-y-1 pt-1 border-t border-stone-100">
                        <p>
                          <strong className="text-[#0F172A]">Chỉ ra dấu hiệu:</strong> {ex.analysis}
                        </p>
                        <p>
                          <strong className="text-emerald-800">Tác dụng ngữ cảnh cụ thể:</strong>{' '}
                          <span className="text-stone-800">{ex.contextEffect}</span>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 6. LỖI THƯỜNG GẶP VÀ CÁCH KHẮC PHỤC */}
              <div className="space-y-3">
                <h3 className="font-serif-literary font-bold text-base text-[#0F172A] flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-600"></div>
                  <span>4. Lỗi học sinh hay mắc & Cách khắc phục khi chấm thi</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {card.commonMistakes.map((mis, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-xl bg-red-50/60 border border-red-200/80 space-y-2 text-xs"
                    >
                      <div className="flex items-start gap-1.5 text-red-900 font-bold">
                        <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                        <span>Lỗi: {mis.mistake}</span>
                      </div>
                      <p className="text-stone-600 italic">
                        <strong>Hậu quả chấm thi:</strong> {mis.consequence}
                      </p>
                      <div className="p-2.5 bg-white/90 rounded-lg border border-red-100 text-stone-800">
                        <strong className="text-emerald-800">Cách khắc phục:</strong> {mis.howToFix}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* FOOTER ACTION: CHUYỂN SANG TỰ LUYỆN */}
              <div className="pt-4 border-t border-stone-200 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-stone-500">
                  Đã nắm vững lý thuyết? Hãy thử sức ngay với bài tập ngắn bên cạnh.
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTab('practice')}
                  className="px-5 py-2.5 bg-[#0F172A] hover:bg-[#1E293B] text-white text-xs font-bold rounded-lg shadow-sm transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span>Bắt đầu tự luyện tương tác ngay</span>
                </button>
              </div>
            </div>
          ) : (
            /* ======================================================== */
            /* TAB 2: BÀI TẬP TỰ KIỂM TRA KÈM PHẢN HỒI GỢI MỞ          */
            /* ======================================================== */
            <div className="space-y-6">
              {/* DANH SÁCH CÂU HỎI */}
              <div className="flex items-center gap-2 border-b border-stone-200 pb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-700">
                  Chọn câu hỏi tự luyện:
                </span>
                <div className="flex items-center gap-2">
                  {card.practiceQuestions.map((q, idx) => (
                    <button
                      key={q.id}
                      onClick={() => handleSelectQuestion(idx)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        selectedQuestionIndex === idx
                          ? 'bg-[#0F172A] text-white shadow-xs'
                          : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
                      }`}
                    >
                      Câu {idx + 1} ({q.levelName})
                    </button>
                  ))}
                </div>
              </div>

              {activeQuestion && (
                <div className="p-5 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-4">
                  {/* Tiêu đề câu hỏi */}
                  <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded">
                        Mức độ: {activeQuestion.levelName}
                      </span>
                      <span className="text-xs text-stone-500">
                        {activeQuestion.type === 'multiple_choice' ? 'Trắc nghiệm khách quan' : 'Tự luận ngắn'}
                      </span>
                    </div>
                  </div>

                  {/* Đoạn trích nếu có */}
                  {activeQuestion.contextPassage && (
                    <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-stone-800 text-xs sm:text-sm font-serif-literary italic">
                      "{activeQuestion.contextPassage}"
                    </div>
                  )}

                  {/* Lệnh hỏi */}
                  <h4 className="text-sm sm:text-base font-semibold text-[#0F172A] leading-relaxed">
                    {activeQuestion.question}
                  </h4>

                  {/* KHU VỰC TRẢ LỜI */}
                  {activeQuestion.type === 'multiple_choice' ? (
                    <div className="space-y-2.5 pt-2">
                      {activeQuestion.options?.map((opt, optIdx) => (
                        <label
                          key={optIdx}
                          className={`p-3 rounded-xl border flex items-center gap-3 transition-all cursor-pointer text-xs sm:text-sm ${
                            userSelectedOption === optIdx
                              ? 'bg-emerald-50/70 border-emerald-500 text-emerald-950 font-medium'
                              : 'bg-white hover:bg-stone-50 border-stone-200 text-stone-800'
                          }`}
                        >
                          <input
                            type="radio"
                            name="quiz-option"
                            checked={userSelectedOption === optIdx}
                            onChange={() => setUserSelectedOption(optIdx)}
                            disabled={isAnswerSubmitted}
                            className="text-emerald-600 focus:ring-emerald-500"
                          />
                          <span>{opt}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2 pt-2">
                      <textarea
                        rows={4}
                        value={userShortAnswer}
                        onChange={(e) => setUserShortAnswer(e.target.value)}
                        disabled={isAnswerSubmitted}
                        placeholder="Nhập câu trả lời hoặc phân tích của bạn vào đây (chỉ ra từ ngữ, tác dụng nội dung và cảm xúc)..."
                        className="w-full p-3.5 text-xs sm:text-sm bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-600 font-serif-literary"
                      />
                      <p className="text-[11px] text-stone-500 italic">
                        * Gợi ý: Hãy trả lời đầy đủ theo 3 vế: (1) Chỉ rõ từ ngữ; (2) Tác dụng nội dung; (3) Tác dụng cảm xúc/thái độ.
                      </p>
                    </div>
                  )}

                  {/* NÚT KIỂM TRA & THỬ LẠI */}
                  <div className="pt-3 flex flex-wrap items-center justify-between gap-3">
                    {!isAnswerSubmitted ? (
                      <button
                        type="button"
                        onClick={handleCheckAnswer}
                        disabled={
                          activeQuestion.type === 'multiple_choice'
                            ? userSelectedOption === null
                            : !userShortAnswer.trim()
                        }
                        className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
                      >
                        <Check className="w-4 h-4" />
                        <span>Kiểm tra câu trả lời</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={handleRetry}
                          className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Thử lại câu này</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowFullExplanation(!showFullExplanation)}
                          className="px-4 py-2 bg-white border border-stone-300 hover:bg-stone-50 text-stone-800 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5 text-blue-600" />
                          <span>{showFullExplanation ? 'Ẩn lời giải chi tiết' : 'Xem đáp án mẫu & Giải thích'}</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* PHẢN HỒI SƯ PHẠM GỢI MỞ KHI ĐÃ LÀM */}
                  {isAnswerSubmitted && (
                    <div className="mt-4 p-4 rounded-xl space-y-3 animate-fadeIn bg-stone-50 border border-stone-200">
                      {/* Trạng thái kết quả */}
                      <div className="flex items-center gap-2">
                        {answerResult === 'correct' ? (
                          <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs">
                            <CheckCircle className="w-4 h-4 text-emerald-600" />
                            <span>Rất chính xác! Bạn đã nhận diện và phân tích trúng trọng tâm câu hỏi.</span>
                          </div>
                        ) : answerResult === 'partial' ? (
                          <div className="flex items-center gap-2 text-amber-800 font-bold text-xs">
                            <AlertTriangle className="w-4 h-4 text-amber-600" />
                            <span>Câu trả lời đã có ý đúng nhưng chưa trọn vẹn. Hãy xem lưu ý gợi mở bên dưới.</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-stone-800 font-bold text-xs">
                            <HelpCircle className="w-4 h-4 text-blue-600" />
                            <span>Chưa hoàn toàn chuẩn xác. Đừng lo lắng, hãy cùng phân tích căn cứ để sửa lại nhé!</span>
                          </div>
                        )}
                      </div>

                      {/* GỢI Ý ĐỊNH HƯỚNG TƯ DUY */}
                      <div className="p-3 bg-white rounded-lg border border-stone-200 text-xs space-y-1.5 text-stone-700">
                        <p className="font-semibold text-emerald-900 flex items-center gap-1.5">
                          <Lightbulb className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Điểm cần ghi nhớ:</span> {activeQuestion.pedagogicalScaffold.strengthsHint}
                        </p>
                        <p className="text-amber-900">
                          <strong>Lưu ý:</strong> {activeQuestion.pedagogicalScaffold.missingWarning}
                        </p>
                        <p className="text-stone-600 italic">
                          <strong>Hướng dẫn tự hoàn thiện:</strong> {activeQuestion.pedagogicalScaffold.thinkingStep}
                        </p>
                      </div>

                      {/* LỜI GIẢI ĐẦY ĐỦ KHI HỌC SINH MỞ */}
                      {showFullExplanation && (
                        <div className="p-3.5 bg-blue-50/80 rounded-lg border border-blue-200 text-xs space-y-2 text-blue-950 animate-fadeIn">
                          <div className="font-bold text-blue-900 flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-blue-700" />
                            <span>Đáp án mẫu & Barem gợi ý từ giáo viên:</span>
                          </div>
                          <div className="p-2.5 bg-white rounded border border-blue-100 font-serif-literary text-stone-800 leading-relaxed">
                            {activeQuestion.sampleModelAnswer}
                          </div>
                          <p className="leading-relaxed text-stone-700">
                            <strong>Giải thích chi tiết:</strong> {activeQuestion.detailedExplanation}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="bg-[#F5F1E9] px-6 py-3 border-t border-stone-200 flex items-center justify-between text-xs text-stone-600 shrink-0">
          <div>
            Biên soạn: <span className="font-medium text-stone-800">{card.author}</span> · Cập nhật:{' '}
            <span>{card.updatedAt}</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
