import React, { useState } from 'react';
import {
  KnowledgeCard,
  KnowledgeCategory,
  CognitiveLevel,
  KnowledgePracticeQuestion,
  KnowledgeCardExample,
  KnowledgeCommonMistake
} from '../types';
import { KnowledgeCardDetailModal } from './KnowledgeCardDetailModal';
import {
  PlusCircle,
  Edit3,
  Trash2,
  CheckCircle,
  Eye,
  Clock,
  Sparkles,
  BookOpen,
  Filter,
  Check,
  AlertTriangle,
  X,
  Save,
  HelpCircle
} from 'lucide-react';

interface TeacherKnowledgeManagerProps {
  knowledgeCards: KnowledgeCard[];
  onSaveCard: (card: KnowledgeCard) => void;
  onDeleteCard: (cardId: string) => void;
  onToggleStatus: (cardId: string) => void;
}

export const TeacherKnowledgeManager: React.FC<TeacherKnowledgeManagerProps> = ({
  knowledgeCards,
  onSaveCard,
  onDeleteCard,
  onToggleStatus
}) => {
  const [filterCategory, setFilterCategory] = useState<KnowledgeCategory | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'published' | 'draft'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modal thêm / sửa
  const [isEditorModalOpen, setIsEditorModalOpen] = useState<boolean>(false);
  const [editingCard, setEditingCard] = useState<KnowledgeCard | null>(null);

  // Modal xem trước góc nhìn học sinh
  const [previewCard, setPreviewCard] = useState<KnowledgeCard | null>(null);

  // Notification
  const [savedSuccessMsg, setSavedSuccessMsg] = useState<string | null>(null);

  // Form State
  const [formTitle, setFormTitle] = useState<string>('');
  const [formCategory, setFormCategory] = useState<KnowledgeCategory>('rhetoric');
  const [formLevel, setFormLevel] = useState<CognitiveLevel>('thong_hieu');
  const [formEstimatedMinutes, setFormEstimatedMinutes] = useState<number>(6);
  const [formTargetGoal, setFormTargetGoal] = useState<string>('');
  const [formSummary, setFormSummary] = useState<string>('');
  const [formRecognitionSigns, setFormRecognitionSigns] = useState<string>('');
  const [formDistinctionNotes, setFormDistinctionNotes] = useState<string>('');
  const [formStatus, setFormStatus] = useState<'published' | 'draft'>('published');

  // Ví dụ mẫu (1 ví dụ trong form ngắn gọn)
  const [exampleQuote, setExampleQuote] = useState<string>('');
  const [exampleSource, setExampleSource] = useState<string>('');
  const [exampleAnalysis, setExampleAnalysis] = useState<string>('');
  const [exampleEffect, setExampleEffect] = useState<string>('');

  // Lỗi thường gặp
  const [mistakeText, setMistakeText] = useState<string>('');
  const [mistakeFix, setMistakeFix] = useState<string>('');

  // Câu hỏi tự luyện
  const [questionText, setQuestionText] = useState<string>('');
  const [questionModelAnswer, setQuestionModelAnswer] = useState<string>('');
  const [questionExplanation, setQuestionExplanation] = useState<string>('');

  // Mở modal tạo mới
  const handleOpenCreateModal = () => {
    setEditingCard(null);
    setFormTitle('');
    setFormCategory('rhetoric');
    setFormLevel('thong_hieu');
    setFormEstimatedMinutes(6);
    setFormTargetGoal('');
    setFormSummary('');
    setFormRecognitionSigns('');
    setFormDistinctionNotes('');
    setFormStatus('published');

    setExampleQuote('');
    setExampleSource('');
    setExampleAnalysis('');
    setExampleEffect('');

    setMistakeText('');
    setMistakeFix('');

    setQuestionText('');
    setQuestionModelAnswer('');
    setQuestionExplanation('');

    setIsEditorModalOpen(true);
  };

  // Mở modal sửa thẻ có sẵn
  const handleOpenEditModal = (card: KnowledgeCard) => {
    setEditingCard(card);
    setFormTitle(card.title);
    setFormCategory(card.category);
    setFormLevel(card.level);
    setFormEstimatedMinutes(card.estimatedMinutes);
    setFormTargetGoal(card.targetGoal);
    setFormSummary(card.summary);
    setFormRecognitionSigns(card.recognitionSigns.join('\n'));
    setFormDistinctionNotes(card.distinctionNotes || '');
    setFormStatus(card.status);

    const firstEx = card.examples[0] || { quote: '', source: '', analysis: '', contextEffect: '' };
    setExampleQuote(firstEx.quote);
    setExampleSource(firstEx.source);
    setExampleAnalysis(firstEx.analysis);
    setExampleEffect(firstEx.contextEffect);

    const firstMistake = card.commonMistakes[0] || { mistake: '', howToFix: '' };
    setMistakeText(firstMistake.mistake);
    setMistakeFix(firstMistake.howToFix);

    const firstQ = card.practiceQuestions[0];
    if (firstQ) {
      setQuestionText(firstQ.question);
      setQuestionModelAnswer(firstQ.sampleModelAnswer);
      setQuestionExplanation(firstQ.detailedExplanation);
    } else {
      setQuestionText('');
      setQuestionModelAnswer('');
      setQuestionExplanation('');
    }

    setIsEditorModalOpen(true);
  };

  // Lưu thẻ
  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formSummary.trim()) {
      alert('Vui lòng điền đầy đủ Tên kiến thức và Nội dung tóm tắt.');
      return;
    }

    const signsList = formRecognitionSigns
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    const examplesList: KnowledgeCardExample[] = exampleQuote.trim()
      ? [
          {
            quote: exampleQuote.trim(),
            source: exampleSource.trim() || 'Ngữ văn 12',
            analysis: exampleAnalysis.trim() || 'Phân tích dấu hiệu nhận biết.',
            contextEffect: exampleEffect.trim() || 'Tác dụng ngữ cảnh biểu đạt cảm xúc và tư tưởng.'
          }
        ]
      : editingCard?.examples || [];

    const mistakesList: KnowledgeCommonMistake[] = mistakeText.trim()
      ? [
          {
            mistake: mistakeText.trim(),
            consequence: 'Bị trừ từ 0.25 - 0.5 điểm tiêu chí phân tích.',
            howToFix: mistakeFix.trim() || 'Bám sát ngữ cảnh câu chữ của tác phẩm.'
          }
        ]
      : editingCard?.commonMistakes || [];

    const questionsList: KnowledgePracticeQuestion[] = questionText.trim()
      ? [
          {
            id: editingCard?.practiceQuestions[0]?.id || `q-${Date.now()}`,
            level: formLevel,
            levelName:
              formLevel === 'nhan_biet'
                ? 'Nhận biết'
                : formLevel === 'thong_hieu'
                ? 'Thông hiểu'
                : formLevel === 'van_dung'
                ? 'Vận dụng'
                : 'Vận dụng cao',
            type: 'short_answer',
            question: questionText.trim(),
            expectedKeyPoints: ['Chỉ rõ từ ngữ/dấu hiệu', 'Phân tích tác dụng ngữ cảnh'],
            sampleModelAnswer: questionModelAnswer.trim() || 'Đáp án mẫu chuẩn theo barem.',
            detailedExplanation: questionExplanation.trim() || 'Giải thích sư phạm từ giáo viên.',
            pedagogicalScaffold: {
              strengthsHint: 'Nhận diện đúng hình ảnh và câu từ.',
              missingWarning: 'Cần phân tích sâu thêm tác dụng tình cảm của tác giả.',
              thinkingStep: 'Bám sát ngữ cảnh cụ thể của văn bản.'
            }
          }
        ]
      : editingCard?.practiceQuestions || [];

    const categoryNames: Record<KnowledgeCategory, string> = {
      rhetoric: 'Biện pháp tu từ & Tiếng Việt',
      reading_method: 'Phương pháp Đọc hiểu',
      paragraph_200w: 'Phương pháp viết đoạn 200 chữ',
      essay_600w: 'Phương pháp viết bài văn 600 chữ',
      exam_skills: 'Kĩ năng phòng thi & Thời gian'
    };

    const levelNames: Record<CognitiveLevel, string> = {
      nhan_biet: 'Nhận biết',
      thong_hieu: 'Thông hiểu',
      van_dung: 'Vận dụng',
      van_dung_cao: 'Vận dụng cao'
    };

    const newCard: KnowledgeCard = {
      id: editingCard?.id || `k-custom-${Date.now()}`,
      title: formTitle.trim(),
      category: formCategory,
      categoryName: categoryNames[formCategory],
      level: formLevel,
      levelName: levelNames[formLevel],
      targetGoal: formTargetGoal.trim() || `Nắm vững ${formTitle.trim()} trong kỳ thi THPT.`,
      summary: formSummary.trim(),
      recognitionSigns: signsList.length > 0 ? signsList : ['Quan sát kỹ câu chữ và ngữ cảnh của văn bản.'],
      distinctionNotes: formDistinctionNotes.trim() || undefined,
      examples: examplesList,
      commonMistakes: mistakesList,
      practiceQuestions: questionsList,
      status: formStatus,
      estimatedMinutes: Number(formEstimatedMinutes) || 6,
      author: 'Giáo viên phụ trách',
      updatedAt: new Date().toLocaleDateString('vi-VN')
    };

    onSaveCard(newCard);
    setIsEditorModalOpen(false);
    setSavedSuccessMsg(`Đã lưu thành công thẻ kiến thức "${newCard.title}"!`);
    setTimeout(() => setSavedSuccessMsg(null), 3000);
  };

  // Lọc thẻ
  const filteredCards = knowledgeCards.filter((card) => {
    const matchSearch =
      !searchQuery.trim() ||
      card.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      card.summary.toLowerCase().includes(searchQuery.toLowerCase());
    const matchCategory = filterCategory === 'all' || card.category === filterCategory;
    const matchStatus = filterStatus === 'all' || card.status === filterStatus;
    return matchSearch && matchCategory && matchStatus;
  });

  return (
    <div className="space-y-6">
      {/* HEADER QUẢN LÝ */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 pb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-serif-literary font-bold text-[#0F172A] flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-emerald-700" />
            <span>Quản lý Thư viện Tri thức Ngữ văn (Dành cho Giáo viên)</span>
          </h2>
          <p className="text-xs text-stone-500 mt-1">
            Biên soạn, kiểm duyệt, sửa đổi và xuất bản thẻ kiến thức cho học sinh lớp 12 mà không cần biết lập trình.
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Biên soạn thẻ kiến thức mới</span>
        </button>
      </div>

      {savedSuccessMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs font-medium flex items-center gap-2 animate-fadeIn">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
          <span>{savedSuccessMsg}</span>
        </div>
      )}

      {/* THANH BỘ LỌC CỦA GIÁO VIÊN */}
      <div className="p-4 bg-white rounded-2xl border border-stone-200 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên thẻ hoặc nội dung..."
            className="px-3 py-1.5 bg-stone-50 border border-stone-300 rounded-lg text-xs w-60 focus:outline-none focus:ring-1 focus:ring-emerald-600"
          />

          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value as any)}
            className="px-3 py-1.5 bg-stone-50 border border-stone-300 rounded-lg text-xs focus:outline-none"
          >
            <option value="all">Tất cả nhóm tri thức</option>
            <option value="rhetoric">A. Biện pháp tu từ & Tiếng Việt</option>
            <option value="reading_method">B. Phương pháp Đọc hiểu</option>
            <option value="paragraph_200w">C. Đoạn văn 200 chữ</option>
            <option value="essay_600w">D. Bài văn 600 chữ</option>
            <option value="exam_skills">E. Kĩ năng phòng thi & Thời gian</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="px-3 py-1.5 bg-stone-50 border border-stone-300 rounded-lg text-xs focus:outline-none"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="published">Đã xuất bản (Học sinh thấy)</option>
            <option value="draft">Bản nháp (Đang biên soạn)</option>
          </select>
        </div>

        <div className="text-stone-500 font-medium">
          Hiển thị <strong>{filteredCards.length}</strong> / {knowledgeCards.length} thẻ kiến thức
        </div>
      </div>

      {/* DANH SÁCH THẺ TRI THỨC */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCards.map((card) => {
          const isPublished = card.status === 'published';

          return (
            <div
              key={card.id}
              className={`p-4 rounded-xl border transition-all flex flex-col justify-between space-y-3 ${
                isPublished
                  ? 'bg-white border-stone-200 shadow-2xs'
                  : 'bg-stone-50/70 border-dashed border-stone-300'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-stone-100 text-stone-700">
                    {card.categoryName}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isPublished
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-amber-100 text-amber-800 border border-amber-300'
                    }`}
                  >
                    {isPublished ? '✓ Đã xuất bản' : '● Bản nháp'}
                  </span>
                </div>

                <h3 className="font-serif-literary font-bold text-sm text-[#0F172A] line-clamp-1">
                  {card.title}
                </h3>

                <p className="text-xs text-stone-600 line-clamp-2">{card.summary}</p>

                <div className="flex items-center gap-3 text-[11px] text-stone-400 pt-1">
                  <span>{card.practiceQuestions.length} câu tự luyện</span>
                  <span>·</span>
                  <span>{card.examples.length} ví dụ ngữ cảnh</span>
                  <span>·</span>
                  <span>{card.estimatedMinutes} phút</span>
                </div>
              </div>

              {/* Hàng nút thao tác của Giáo viên */}
              <div className="pt-2 border-t border-stone-100 flex items-center justify-between gap-1 text-xs">
                {/* Xem trước */}
                <button
                  type="button"
                  onClick={() => setPreviewCard(card)}
                  className="p-1.5 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
                  title="Xem trước như học sinh thấy"
                >
                  <Eye className="w-4 h-4" />
                </button>

                {/* Đổi trạng thái Duyệt / Nháp */}
                <button
                  type="button"
                  onClick={() => onToggleStatus(card.id)}
                  className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                    isPublished
                      ? 'text-stone-600 hover:bg-stone-200'
                      : 'text-emerald-800 bg-emerald-50 hover:bg-emerald-100'
                  }`}
                  title={isPublished ? 'Chuyển về bản nháp' : 'Xuất bản cho học sinh'}
                >
                  {isPublished ? 'Chuyển về nháp' : 'Xuất bản'}
                </button>

                {/* Sửa */}
                <button
                  type="button"
                  onClick={() => handleOpenEditModal(card)}
                  className="p-1.5 text-blue-700 hover:text-blue-900 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                  title="Chỉnh sửa nội dung"
                >
                  <Edit3 className="w-4 h-4" />
                </button>

                {/* Xóa */}
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Thầy/cô có chắc muốn xóa thẻ "${card.title}" không?`)) {
                      onDeleteCard(card.id);
                    }
                  }}
                  className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                  title="Xóa thẻ"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* MODAL BIÊN SOẠN / CHỈNH SỬA THẺ KIẾN THỨC */}
      {isEditorModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs animate-fadeIn overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full border border-stone-200 shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
            <div className="bg-[#0F172A] text-white px-6 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-emerald-400" />
                <h3 className="font-serif-literary font-bold text-base text-white">
                  {editingCard ? 'Chỉnh sửa thẻ kiến thức' : 'Biên soạn thẻ kiến thức mới'}
                </h3>
              </div>
              <button
                onClick={() => setIsEditorModalOpen(false)}
                className="text-stone-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="p-6 overflow-y-auto flex-1 space-y-4 text-xs">
              {/* Hàng 1: Tên & Chủ đề */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">
                    Tên kiến thức (Tiêu đề): *
                  </label>
                  <input
                    type="text"
                    required
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="Ví dụ: Biện pháp tu từ Nói giảm nói tránh"
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-emerald-600"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-stone-700 mb-1">Nhóm tri thức: *</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as any)}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-xs focus:outline-none"
                  >
                    <option value="rhetoric">A. Biện pháp tu từ & Tiếng Việt</option>
                    <option value="reading_method">B. Phương pháp Đọc hiểu</option>
                    <option value="paragraph_200w">C. Phương pháp viết đoạn 200 chữ</option>
                    <option value="essay_600w">D. Phương pháp viết bài văn 600 chữ</option>
                    <option value="exam_skills">E. Kĩ năng phòng thi & Thời gian</option>
                  </select>
                </div>
              </div>

              {/* Hàng 2: Mức độ nhận thức & Thời gian học & Trạng thái */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">Mức độ nhận thức:</label>
                  <select
                    value={formLevel}
                    onChange={(e) => setFormLevel(e.target.value as any)}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-xs focus:outline-none"
                  >
                    <option value="nhan_biet">Nhận biết</option>
                    <option value="thong_hieu">Thông hiểu</option>
                    <option value="van_dung">Vận dụng</option>
                    <option value="van_dung_cao">Vận dụng cao</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-stone-700 mb-1">Thời gian học (phút):</label>
                  <input
                    type="number"
                    min="3"
                    max="30"
                    value={formEstimatedMinutes}
                    onChange={(e) => setFormEstimatedMinutes(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-xs focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-stone-700 mb-1">Trạng thái xuất bản:</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as any)}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-xs focus:outline-none font-medium"
                  >
                    <option value="published">Xuất bản (Học sinh thấy ngay)</option>
                    <option value="draft">Lưu nháp (Chỉ giáo viên thấy)</option>
                  </select>
                </div>
              </div>

              {/* Mục tiêu cần đạt */}
              <div>
                <label className="block font-semibold text-stone-700 mb-1">
                  Mục tiêu cần đạt trong kỳ thi THPT:
                </label>
                <input
                  type="text"
                  value={formTargetGoal}
                  onChange={(e) => setFormTargetGoal(e.target.value)}
                  placeholder="Ví dụ: Giúp học sinh nhận diện đúng dấu hiệu và phân tích tác dụng bám sát ngữ cảnh..."
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-xs focus:outline-none"
                />
              </div>

              {/* Khái niệm & Giải thích ngắn gọn */}
              <div>
                <label className="block font-semibold text-stone-700 mb-1">
                  Khái niệm & Giải thích ngắn gọn (Không quá dài): *
                </label>
                <textarea
                  rows={3}
                  required
                  value={formSummary}
                  onChange={(e) => setFormSummary(e.target.value)}
                  placeholder="Định nghĩa bản chất ngắn gọn, chính xác theo chương trình Ngữ văn 12..."
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-xs focus:outline-none"
                />
              </div>

              {/* Dấu hiệu nhận biết */}
              <div>
                <label className="block font-semibold text-stone-700 mb-1">
                  Dấu hiệu nhận biết hoặc Quy trình các bước (Mỗi dòng một dấu hiệu):
                </label>
                <textarea
                  rows={3}
                  value={formRecognitionSigns}
                  onChange={(e) => setFormRecognitionSigns(e.target.value)}
                  placeholder="Dấu hiệu 1...&#10;Dấu hiệu 2...&#10;Dấu hiệu 3..."
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-xs focus:outline-none font-mono"
                />
              </div>

              {/* Phân biệt dễ nhầm lẫn */}
              <div>
                <label className="block font-semibold text-stone-700 mb-1">
                  Lưu ý phân biệt với các biện pháp / dạng bài dễ nhầm lẫn:
                </label>
                <textarea
                  rows={2}
                  value={formDistinctionNotes}
                  onChange={(e) => setFormDistinctionNotes(e.target.value)}
                  placeholder="Ví dụ: Phân biệt với Ẩn dụ ở chỗ..."
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-xs focus:outline-none"
                />
              </div>

              {/* Khối ví dụ minh họa */}
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-2">
                <span className="font-bold text-stone-800 block">Ví dụ minh họa & Phân tích ngữ cảnh:</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={exampleQuote}
                    onChange={(e) => setExampleQuote(e.target.value)}
                    placeholder="Câu thơ / câu văn trích dẫn..."
                    className="px-3 py-1.5 bg-white border border-stone-300 rounded-lg text-xs"
                  />
                  <input
                    type="text"
                    value={exampleSource}
                    onChange={(e) => setExampleSource(e.target.value)}
                    placeholder="Tác giả / Tác phẩm..."
                    className="px-3 py-1.5 bg-white border border-stone-300 rounded-lg text-xs"
                  />
                </div>
                <input
                  type="text"
                  value={exampleAnalysis}
                  onChange={(e) => setExampleAnalysis(e.target.value)}
                  placeholder="Chỉ ra dấu hiệu (từ ngữ nào mang biện pháp)..."
                  className="w-full px-3 py-1.5 bg-white border border-stone-300 rounded-lg text-xs"
                />
                <input
                  type="text"
                  value={exampleEffect}
                  onChange={(e) => setExampleEffect(e.target.value)}
                  placeholder="Tác dụng ngữ cảnh cụ thể (không dùng công thức máy móc)..."
                  className="w-full px-3 py-1.5 bg-white border border-stone-300 rounded-lg text-xs"
                />
              </div>

              {/* Khối lỗi thường gặp */}
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-2">
                <span className="font-bold text-stone-800 block">Lỗi học sinh thường mắc & Cách khắc phục:</span>
                <input
                  type="text"
                  value={mistakeText}
                  onChange={(e) => setMistakeText(e.target.value)}
                  placeholder="Lỗi học sinh thường mắc (ví dụ: chỉ nêu công thức sáo rỗng)..."
                  className="w-full px-3 py-1.5 bg-white border border-stone-300 rounded-lg text-xs"
                />
                <input
                  type="text"
                  value={mistakeFix}
                  onChange={(e) => setMistakeFix(e.target.value)}
                  placeholder="Cách khắc phục theo barem chấm thi..."
                  className="w-full px-3 py-1.5 bg-white border border-stone-300 rounded-lg text-xs"
                />
              </div>

              {/* Khối bài tập tự luyện */}
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-2">
                <span className="font-bold text-stone-800 block">Bài tập tự kiểm tra kèm phản hồi:</span>
                <input
                  type="text"
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                  placeholder="Câu hỏi tự luyện ngắn..."
                  className="w-full px-3 py-1.5 bg-white border border-stone-300 rounded-lg text-xs"
                />
                <textarea
                  rows={2}
                  value={questionModelAnswer}
                  onChange={(e) => setQuestionModelAnswer(e.target.value)}
                  placeholder="Đáp án mẫu chuẩn barem..."
                  className="w-full px-3 py-1.5 bg-white border border-stone-300 rounded-lg text-xs"
                />
                <input
                  type="text"
                  value={questionExplanation}
                  onChange={(e) => setQuestionExplanation(e.target.value)}
                  placeholder="Phần giải thích sư phạm sau khi học sinh làm..."
                  className="w-full px-3 py-1.5 bg-white border border-stone-300 rounded-lg text-xs"
                />
              </div>

              <div className="pt-3 border-t border-stone-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditorModalOpen(false)}
                  className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold rounded-lg cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{editingCard ? 'Cập nhật thẻ' : 'Lưu và Xuất bản thẻ'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL XEM TRƯỚC GÓC NHÌN HỌC SINH */}
      {previewCard && (
        <KnowledgeCardDetailModal
          card={previewCard}
          isOpen={Boolean(previewCard)}
          onClose={() => setPreviewCard(null)}
          onToggleBookmark={() => {}}
          onToggleNeedsReview={() => {}}
          onRecordStudy={() => {}}
          onRecordPracticeScore={() => {}}
        />
      )}
    </div>
  );
};
