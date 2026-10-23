import React, { useState, useEffect } from 'react';
import { SAMPLE_READING_PASSAGES } from '../data/sampleData';
import { ReadingPassage, ReadingQuestion, ReadingFeedback, ReadingAttempt } from '../types';
import { evaluateReadingAnswerWithAI } from '../services/pedagogicalEngine';
import { classifyReadingPassageItem } from '../services/recommendationEngine';
import { saveStudyDocumentToDrive } from '../services/googleDriveService';
import { getAccessToken, savePracticeRecordToFirestore } from '../services/firebaseAuth';
import {
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  HelpCircle,
  RotateCcw,
  PlusCircle,
  Save,
  Check,
  Cloud
} from 'lucide-react';
import { FocusModeBar } from './FocusModeBar';
import { GentleTypewriterText } from './GentleTypewriterText';

interface ReadingComprehensionProps {
  initialPassageId?: string | null;
  onSaveAttempt: (attempt: ReadingAttempt) => void;
  isFocusMode?: boolean;
  onToggleFocusMode?: (nextValue: boolean) => void;
}

const PUBLISHED_READING_PASSAGES: ReadingPassage[] = SAMPLE_READING_PASSAGES.filter(
  (p) => classifyReadingPassageItem(p).isReadyForStudent
);

export const ReadingComprehension: React.FC<ReadingComprehensionProps> = ({
  initialPassageId = null,
  onSaveAttempt,
  isFocusMode,
  onToggleFocusMode
}) => {
  const [localFocusMode, setLocalFocusMode] = useState<boolean>(false);
  const effectiveFocusMode = isFocusMode ?? localFocusMode;
  const handleToggleFocus = (nextVal: boolean) => {
    setLocalFocusMode(nextVal);
    onToggleFocusMode?.(nextVal);
  };
  // Trạng thái chọn văn bản mẫu đã xuất bản hoặc tự nhập
  const [selectedPassageId, setSelectedPassageId] = useState<string>(
    () =>
      (initialPassageId && PUBLISHED_READING_PASSAGES.some((p) => p.id === initialPassageId)
        ? initialPassageId
        : PUBLISHED_READING_PASSAGES[0]?.id) || SAMPLE_READING_PASSAGES[0].id
  );
  const [isCustomMode, setIsCustomMode] = useState<boolean>(false);

  // Dữ liệu văn bản
  const [customTitle, setCustomTitle] = useState<string>('');
  const [customAuthor, setCustomAuthor] = useState<string>('');
  const [customContent, setCustomContent] = useState<string>('');

  // Câu hỏi & Trả lời
  const [selectedQuestionId, setSelectedQuestionId] = useState<string>(
    SAMPLE_READING_PASSAGES[0].questions[0].id
  );
  const [customQuestionText, setCustomQuestionText] = useState<string>('');
  const [studentAnswer, setStudentAnswer] = useState<string>('');

  // Phản hồi & Tự sửa
  const [feedback, setFeedback] = useState<ReadingFeedback | null>(null);
  const [improvedAnswer, setImprovedAnswer] = useState<string>('');
  const [savedNotification, setSavedNotification] = useState<boolean>(false);
  const [validationWarning, setValidationWarning] = useState<string | null>(null);

  // Lấy dữ liệu văn bản hiện tại (Chỉ dùng đề đã được Giáo viên xuất bản và có Rubric hợp lệ)
  const currentSample =
    PUBLISHED_READING_PASSAGES.find((p) => p.id === selectedPassageId) ||
    PUBLISHED_READING_PASSAGES[0] ||
    SAMPLE_READING_PASSAGES[0];
  const activeContent = isCustomMode ? customContent : currentSample.content;
  const activeTitle = isCustomMode ? (customTitle || 'Văn bản tự nhập') : currentSample.title;
  const activeAuthor = isCustomMode ? customAuthor : currentSample.author;

  useEffect(() => {
    if (initialPassageId && PUBLISHED_READING_PASSAGES.some((p) => p.id === initialPassageId)) {
      setIsCustomMode(false);
      setSelectedPassageId(initialPassageId);
      const pass = PUBLISHED_READING_PASSAGES.find((p) => p.id === initialPassageId);
      if (pass && pass.questions.length > 0) {
        setSelectedQuestionId(pass.questions[0].id);
      }
      setStudentAnswer('');
      setFeedback(null);
      setImprovedAnswer('');
      setValidationWarning(null);
    }
  }, [initialPassageId]);

  // Lấy câu hỏi hiện tại
  const activeSampleQuestion = !isCustomMode
    ? currentSample.questions.find((q) => q.id === selectedQuestionId) || currentSample.questions[0]
    : undefined;

  const currentQuestionText = isCustomMode
    ? customQuestionText
    : activeSampleQuestion?.question || '';

  // Đổi văn bản mẫu
  const handleSelectPassage = (id: string) => {
    setIsCustomMode(false);
    setSelectedPassageId(id);
    const pass = PUBLISHED_READING_PASSAGES.find((p) => p.id === id);
    if (pass && pass.questions.length > 0) {
      setSelectedQuestionId(pass.questions[0].id);
    }
    setStudentAnswer('');
    setFeedback(null);
    setImprovedAnswer('');
    setValidationWarning(null);
    setSavedNotification(false);
  };

  const handleSwitchToCustom = () => {
    setIsCustomMode(true);
    setStudentAnswer('');
    setFeedback(null);
    setImprovedAnswer('');
    setValidationWarning(null);
    setSavedNotification(false);
  };

  // Đổi câu hỏi trong mẫu
  const handleSelectQuestion = (q: ReadingQuestion) => {
    setSelectedQuestionId(q.id);
    setStudentAnswer('');
    setFeedback(null);
    setImprovedAnswer('');
    setValidationWarning(null);
    setSavedNotification(false);
  };

  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);

  // Xử lý kiểm tra câu trả lời qua Gemini AI Server-Side
  const handleCheckAnswer = async () => {
    setValidationWarning(null);
    setSavedNotification(false);

    if (!activeContent.trim()) {
      setValidationWarning('Vui lòng nhập hoặc chọn một văn bản ngữ liệu để đọc hiểu.');
      return;
    }
    if (!currentQuestionText.trim()) {
      setValidationWarning('Vui lòng nhập hoặc chọn câu hỏi đọc hiểu.');
      return;
    }
    if (!studentAnswer.trim()) {
      setValidationWarning('Bạn chưa nhập câu trả lời. Theo nguyên tắc sư phạm, bạn cần thử tự viết câu trả lời trước khi nhận gợi ý phản hồi.');
      return;
    }

    setIsEvaluating(true);
    try {
      const result = await evaluateReadingAnswerWithAI(
        activeContent,
        currentQuestionText,
        studentAnswer,
        activeSampleQuestion
      );
      setFeedback(result);
      setImprovedAnswer(studentAnswer);
    } finally {
      setIsEvaluating(false);
    }
  };

  // Lưu vào hồ sơ học tập & đồng bộ Cloud Firestore
  const handleSaveToPortfolio = () => {
    if (!feedback) return;

    const attempt: ReadingAttempt = {
      id: `attempt-${Date.now()}`,
      passageTitle: activeTitle,
      question: currentQuestionText,
      questionLevel: activeSampleQuestion?.level || 'thong_hieu',
      originalAnswer: studentAnswer,
      feedback: feedback,
      improvedAnswer: improvedAnswer.trim() ? improvedAnswer : undefined,
      timestamp: new Date().toLocaleString('vi-VN', {
        dateStyle: 'short',
        timeStyle: 'short'
      }),
      submissionVersion: 1,
      scoreStatus:
        typeof feedback.teacherConfirmedScore === 'number'
          ? 'teacher_approved'
          : feedback.evaluationSource === 'gemini_ai'
          ? 'ai_proposed'
          : 'rule_based_suggested'
    };

    onSaveAttempt(attempt);
    savePracticeRecordToFirestore('reading', attempt).catch(() => {});
    setSavedNotification(true);
    setTimeout(() => setSavedNotification(false), 3000);
  };

  // Lưu trực tiếp lên Google Drive
  const [driveSaving, setDriveSaving] = useState<boolean>(false);
  const [driveSaveMsg, setDriveSaveMsg] = useState<string | null>(null);

  const handleSaveToDrive = async () => {
    if (!feedback) return;
    const token = await getAccessToken();
    if (!token) {
      setDriveSaveMsg('Vui lòng kết nối Google Drive trong mục "Hồ sơ học tập" trước.');
      setTimeout(() => setDriveSaveMsg(null), 4000);
      return;
    }

    setDriveSaving(true);
    setDriveSaveMsg(null);
    try {
      const fileName = `VanAI_DocHieu_${activeTitle.slice(0, 25).replace(/\s+/g, '_')}_${Date.now()}`;
      const fileContent = `=========================================
VĂNAI 12 - TÀI LIỆU ÔN THI ĐỌC HIỂU THPT
=========================================
Văn bản: ${activeTitle}
Tác giả: ${activeAuthor}
Thời gian: ${new Date().toLocaleString('vi-VN')}

CÂU HỎI:
${currentQuestionText}

CÂU TRẢ LỜI GỐC CỦA HỌC SINH:
${studentAnswer}

PHẢN HỒI SƯ PHẠM GỢI MỞ:
- Điểm đã làm tốt:
${feedback.strengths.map((s) => `  + ${s}`).join('\n')}
- Điểm còn thiếu:
${feedback.missingPoints.map((m) => `  + ${m}`).join('\n')}
- Căn cứ gợi ý từ văn bản:
${feedback.textEvidenceHints.map((h) => `  + ${h}`).join('\n')}
- Câu hỏi tư duy định hướng:
${feedback.guidingQuestions.map((q) => `  + ${q}`).join('\n')}

CÂU TRẢ LỜI ĐÃ HOÀN THIỆN:
${improvedAnswer || '(Chưa chỉnh sửa)'}
`;

      await saveStudyDocumentToDrive(fileName, fileContent, `Bài đọc hiểu "${activeTitle}" - VănAI 12`);
      setDriveSaveMsg('Đã lưu thành công vào thư mục VănAI 12 trên Google Drive!');
      setTimeout(() => setDriveSaveMsg(null), 3500);
    } catch (err: any) {
      setDriveSaveMsg('Lỗi lưu Google Drive: ' + err.message);
      setTimeout(() => setDriveSaveMsg(null), 4000);
    } finally {
      setDriveSaving(false);
    }
  };

  // Reset câu trả lời
  const handleResetAnswer = () => {
    setStudentAnswer('');
    setFeedback(null);
    setImprovedAnswer('');
    setValidationWarning(null);
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Thanh Chế độ Tập trung (Focus Mode) & Đồng hồ đếm ngược */}
      <FocusModeBar
        isFocusMode={effectiveFocusMode}
        onToggleFocusMode={handleToggleFocus}
        modeTitle={`Đọc hiểu: ${activeTitle}`}
        taskSubtitle={
          isCustomMode
            ? 'Văn bản tự nhập · Thang điểm 4,0'
            : `${currentSample.genre} · Mã Rubric: ${currentSample.rubricId || 'Chuẩn THPT'} · 4,0 điểm`
        }
        defaultMinutes={30}
        presetMinutes={[15, 25, 30, 45]}
      />

      {/* Header khu vực (Ẩn khi bật Focus Mode để tránh xao nhãng) */}
      {!effectiveFocusMode && (
        <div className="space-y-2 border-b border-stone-200 pb-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-serif-literary font-bold text-[#0F172A]">
                Luyện Đọc hiểu văn bản
              </h1>
              <p className="text-sm text-stone-600 mt-1">
                Phát triển năng lực phân tích câu chữ, bám sát ngữ liệu và suy luận đúng bản chất theo thang điểm Đọc hiểu THPT.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-stone-500 font-medium">Ngữ liệu:</span>
              <button
                onClick={() => handleSelectPassage(SAMPLE_READING_PASSAGES[0].id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  !isCustomMode ? 'bg-[#0F172A] text-white' : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
                }`}
              >
                Đề thi thử mẫu
              </button>
              <button
                onClick={handleSwitchToCustom}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  isCustomMode ? 'bg-[#0F172A] text-white' : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
                }`}
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Tự dán văn bản</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bộ chọn văn bản mẫu (Ẩn khi bật Focus Mode để học sinh tập trung hoàn toàn vào bài đang làm) */}
      {!effectiveFocusMode && !isCustomMode && (
        <div className="flex flex-wrap items-center gap-2 p-3 bg-stone-100/70 rounded-xl border border-stone-200 text-xs">
          <span className="font-semibold text-stone-700 mr-2">Chọn văn bản ngân hàng GV xuất bản:</span>
          {PUBLISHED_READING_PASSAGES.map((p, idx) => {
            const cls = classifyReadingPassageItem(p);
            return (
              <button
                key={p.id}
                onClick={() => handleSelectPassage(p.id)}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all text-xs cursor-pointer ${
                  selectedPassageId === p.id
                    ? 'bg-white text-[#0F172A] shadow-xs border border-stone-300 font-bold'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/50'
                }`}
              >
                Đề {idx + 1}: {p.title} ({cls.readingTextTypeLabel} · {p.rubricId})
              </button>
            );
          })}
        </div>
      )}

      {/* Khung làm việc 2 cột: Cột trái Ngữ liệu - Cột phải Câu hỏi & Phản hồi */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* CỘT TRÁI: VĂN BẢN NGỮ LIỆU (5/12 cột) */}
        <div className="lg:col-span-5 space-y-4">
          <div
            className={`p-5 sm:p-6 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-4 sticky ${
              effectiveFocusMode ? 'top-24' : 'top-20'
            }`}
          >
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2 text-stone-700">
                <BookOpen className="w-4 h-4 text-emerald-700" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  Văn bản đọc hiểu
                </span>
              </div>
              <span className="text-xs text-stone-500">
                {isCustomMode ? 'Ngữ liệu người dùng' : currentSample.genre}
              </span>
            </div>

            {isCustomMode ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Tiêu đề hoặc tên trích đoạn:
                  </label>
                  <input
                    type="text"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="Ví dụ: Trích bài báo về lòng dũng cảm..."
                    className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Tác giả / Nguồn dẫn (tùy chọn):
                  </label>
                  <input
                    type="text"
                    value={customAuthor}
                    onChange={(e) => setCustomAuthor(e.target.value)}
                    placeholder="Ví dụ: Báo Tuổi Trẻ, 2026..."
                    className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Nội dung văn bản (dán vào đây):
                  </label>
                  <textarea
                    rows={12}
                    value={customContent}
                    onChange={(e) => setCustomContent(e.target.value)}
                    placeholder="Dán trích đoạn văn xuôi, thơ, hoặc tản văn của bạn vào đây..."
                    className="w-full px-3 py-2 text-sm font-serif-literary bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-600 leading-relaxed"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-serif-literary font-bold text-[#0F172A]">
                    {currentSample.title}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-stone-500 mt-1">
                    <span>{currentSample.author}</span>
                    <span aria-hidden="true">·</span>
                    <span className="italic">{currentSample.source}</span>
                  </div>
                </div>

                <div className="p-4 bg-stone-50/70 rounded-xl border border-stone-200/80 max-h-[500px] overflow-y-auto">
                  <GentleTypewriterText
                    text={currentSample.content}
                    triggerKey={`passage_${currentSample.id}`}
                    autoStart={true}
                    intervalMs={16}
                    maxDurationMs={2600}
                    streamingLabel="AI đang phản hồi trực tiếp nội dung văn bản đọc hiểu..."
                    className="font-serif-literary text-stone-800 text-sm sm:text-base leading-relaxed whitespace-pre-line selection:bg-amber-100"
                  />
                </div>

                <div className="p-3 rounded-lg bg-emerald-50/60 border border-emerald-200/80 text-xs text-emerald-900 flex items-start gap-2">
                  <Lightbulb className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <span>
                    <strong>Mẹo đọc hiểu THPT:</strong> Hãy dùng chuột bôi đen hoặc ghi chú nhanh các từ ngữ đóng vai trò là "từ khóa" trong văn bản trước khi bắt đầu trả lời.
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* CỘT PHẢI: CÂU HỎI, TRẢ LỜI & PHẢN HỒI GỢI MỞ (7/12 cột) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Khối Câu hỏi */}
          <div className="p-5 sm:p-6 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-stone-700">
                Câu hỏi đọc hiểu
              </span>
              {!isCustomMode && activeSampleQuestion && (
                <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                  Cấp độ: {activeSampleQuestion.levelName}
                </span>
              )}
            </div>

            {!isCustomMode && (
              <div className="space-y-2">
                <span className="text-xs text-stone-500 block">Chọn câu hỏi trong đề:</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {currentSample.questions.map((q, idx) => {
                    const isSelected = selectedQuestionId === q.id;
                    return (
                      <button
                        key={q.id}
                        onClick={() => handleSelectQuestion(q)}
                        className={`text-left p-2.5 rounded-lg text-xs font-medium transition-all border ${
                          isSelected
                            ? 'bg-[#0F172A] text-white border-[#0F172A]'
                            : 'bg-stone-50 hover:bg-stone-100 text-stone-700 border-stone-200'
                        }`}
                      >
                        <div className="font-semibold mb-0.5">
                          Câu {idx + 1} ({q.levelName})
                        </div>
                        <div className="truncate opacity-90">{q.question}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {isCustomMode ? (
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Nhập câu hỏi bạn cần trả lời:
                </label>
                <textarea
                  rows={2}
                  value={customQuestionText}
                  onChange={(e) => setCustomQuestionText(e.target.value)}
                  placeholder="Ví dụ: Theo đoạn trích, tác giả quan niệm thế nào về lòng dũng cảm?"
                  className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-600"
                />
              </div>
            ) : (
              <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200">
                <p className="text-sm font-semibold text-[#0F172A] leading-relaxed">
                  {currentQuestionText}
                </p>
              </div>
            )}

            {/* Ô học sinh tự viết câu trả lời */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-stone-700 flex items-center gap-1.5">
                  <span>Câu trả lời của bạn:</span>
                  <span className="text-stone-500 font-normal">
                    (Hãy tự viết bằng ngôn từ của mình)
                  </span>
                </label>
                <span className="text-xs text-stone-500 tabular-nums">
                  {studentAnswer.trim() ? studentAnswer.trim().split(/\s+/).length : 0} từ
                </span>
              </div>

              <textarea
                rows={5}
                value={studentAnswer}
                onChange={(e) => setStudentAnswer(e.target.value)}
                placeholder="Viết câu trả lời đầy đủ câu cú (có chủ ngữ - vị ngữ), bám sát chi tiết trong văn bản..."
                className="w-full p-3.5 text-sm bg-stone-50/50 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0F172A] focus:border-transparent leading-relaxed"
              />

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="text-[11px] text-stone-500">
                  Lưu ý: Không thể xem gợi ý chi tiết nếu chưa nhập câu trả lời thử sức.
                </div>
                <div className="flex items-center gap-2">
                  {studentAnswer && (
                    <button
                      onClick={handleResetAnswer}
                      className="px-3 py-1.5 text-xs text-stone-600 hover:text-stone-900 flex items-center gap-1"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Viết lại</span>
                    </button>
                  )}
                  <button
                    onClick={handleCheckAnswer}
                    disabled={isEvaluating}
                    className="px-4 py-2 text-xs font-semibold text-white bg-[#0F172A] hover:bg-[#1E293B] rounded-lg transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-60 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>{isEvaluating ? 'AI đang phân tích ngữ liệu...' : 'Kiểm tra câu trả lời'}</span>
                  </button>
                </div>
              </div>

              {validationWarning && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <span>{validationWarning}</span>
                </div>
              )}
            </div>
          </div>

          {/* KHU VỰC HIỂN THỊ PHẢN HỒI GỢI MỞ (CHỈ HIỂN THỊ SAU KHI HỌC SINH ĐÃ KIỂM TRA) */}
          {feedback && (
            <div className="p-5 sm:p-6 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-6 animate-fadeIn">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-3">
                <div className="flex items-center gap-2 text-[#0F172A]">
                  <Lightbulb className="w-5 h-5 text-emerald-600" />
                  <h3 className="text-base font-serif-literary font-bold">
                    Phản hồi sư phạm & Định hướng tự hoàn thiện
                  </h3>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                      feedback.evaluationSource === 'gemini_ai'
                        ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                        : 'bg-amber-100 text-amber-950 border-amber-300'
                    }`}
                  >
                    {feedback.evaluationSourceLabel ||
                      (feedback.evaluationSource === 'gemini_ai'
                        ? 'Chấm sơ bộ bằng Gemini AI (Chờ giáo viên duyệt)'
                        : 'Gợi ý theo quy tắc — chưa phải chấm AI')}
                  </span>
                  <span className="text-xs text-stone-500">Đánh giá lúc {feedback.evaluatedAt}</span>
                </div>
              </div>

              {feedback.apiWarningMessage && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-950 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-bold">Lưu ý trạng thái chấm: </strong>
                    <span>{feedback.apiWarningMessage}</span>
                  </div>
                </div>
              )}

              {/* Thông tin độ chắc chắn, trích dẫn nguyên văn và cờ cần giáo viên xem lại */}
              <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 text-xs space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-stone-600">Độ chắc chắn phân tích:</span>
                    <span className="font-bold text-stone-900">
                      {feedback.confidenceLevel === 'high'
                        ? 'Cao'
                        : feedback.confidenceLevel === 'medium'
                        ? 'Trung bình'
                        : 'Thấp (Gợi ý quy tắc)'}
                    </span>
                  </div>
                  {feedback.needsReview && (
                    <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold text-[11px]">
                      ⚑ Cần giáo viên bộ môn xem lại
                    </span>
                  )}
                </div>
                {feedback.rationale && (
                  <p className="text-stone-700 leading-relaxed">
                    <strong>Lí do đánh giá:</strong> {feedback.rationale}
                  </p>
                )}
                {feedback.studentQuotes && feedback.studentQuotes.length > 0 && (
                  <div className="pt-1 border-t border-stone-200/80 text-stone-700">
                    <strong>Dẫn chứng trích từ bài làm của học sinh:</strong>{' '}
                    <span className="italic font-serif">"{feedback.studentQuotes.join('"; "')}"</span>
                  </div>
                )}
              </div>

              {/* 4 Nhóm phản hồi sư phạm */}
              <div className="space-y-4">
                {/* 1. Điểm đúng đã làm tốt */}
                <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-900 font-semibold text-xs uppercase tracking-wide">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>1. Điểm đã làm tốt</span>
                  </div>
                  <ul className="space-y-1.5 text-xs text-emerald-950 pl-6 list-disc">
                    {feedback.strengths.map((str, idx) => (
                      <li key={idx} className="leading-relaxed">
                        {str}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* 2. Điểm còn thiếu / cần bổ sung */}
                <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2">
                  <div className="flex items-center gap-2 text-amber-900 font-semibold text-xs uppercase tracking-wide">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>2. Điểm còn thiếu / chưa sáng rõ</span>
                  </div>
                  <ul className="space-y-1.5 text-xs text-amber-950 pl-6 list-disc">
                    {feedback.missingPoints.map((mis, idx) => (
                      <li key={idx} className="leading-relaxed">
                        {mis}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* 3. Căn cứ từ văn bản (Không bịa đặt) */}
                <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 space-y-2">
                  <div className="flex items-center gap-2 text-blue-900 font-semibold text-xs uppercase tracking-wide">
                    <BookOpen className="w-4 h-4 text-blue-700 shrink-0" />
                    <span>3. Căn cứ gợi ý từ ngữ liệu</span>
                  </div>
                  <div className="space-y-1.5 text-xs text-blue-950 pl-2">
                    {feedback.textEvidenceHints.map((hint, idx) => (
                      <p key={idx} className="leading-relaxed italic">
                        • {hint}
                      </p>
                    ))}
                  </div>
                </div>

                {/* 4. Câu hỏi định hướng tư duy */}
                <div className="p-4 rounded-xl bg-stone-100 border border-stone-200 space-y-2">
                  <div className="flex items-center gap-2 text-stone-900 font-semibold text-xs uppercase tracking-wide">
                    <HelpCircle className="w-4 h-4 text-stone-700 shrink-0" />
                    <span>4. Câu hỏi gợi mở để tự hoàn thiện</span>
                  </div>
                  <ul className="space-y-1.5 text-xs text-stone-800 pl-6 list-decimal">
                    {feedback.guidingQuestions.map((gq, idx) => (
                      <li key={idx} className="leading-relaxed">
                        {gq}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* KHU VỰC HỌC SINH TỰ HOÀN THIỆN CÂU TRẢ LỜI */}
              <div className="pt-4 border-t border-stone-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-[#0F172A] flex items-center gap-1.5">
                    <span>Bản tự sửa đổi & hoàn thiện của bạn:</span>
                  </h4>
                  <span className="text-[11px] text-stone-500">
                    Áp dụng các gợi ý trên vào câu trả lời mới
                  </span>
                </div>

                <textarea
                  rows={4}
                  value={improvedAnswer}
                  onChange={(e) => setImprovedAnswer(e.target.value)}
                  placeholder="Gọt giũa và bổ sung câu trả lời hoàn chỉnh của bạn tại đây..."
                  className="w-full p-3 text-sm bg-stone-50 border border-emerald-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-700 leading-relaxed"
                />

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <span className="text-xs text-stone-500">
                    Bản sửa này sẽ được ghi nhận vào Hồ sơ học tập hoặc đồng bộ Google Drive.
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSaveToDrive}
                      disabled={driveSaving}
                      className="px-3.5 py-2 text-xs font-semibold text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-60 cursor-pointer"
                    >
                      <Cloud className="w-4 h-4 text-blue-600" />
                      <span>{driveSaving ? 'Đang lưu Drive...' : 'Lưu lên Google Drive'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveToPortfolio}
                      className="px-4 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      {savedNotification ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-300" />
                          <span>Đã lưu vào hồ sơ!</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          <span>Lưu vào Hồ sơ</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {driveSaveMsg && (
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900 flex items-center gap-2">
                    <Cloud className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>{driveSaveMsg}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
