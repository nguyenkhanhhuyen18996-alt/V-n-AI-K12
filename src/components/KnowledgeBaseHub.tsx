import React, { useState } from 'react';
import {
  KnowledgeCard,
  KnowledgeCategory,
  CognitiveLevel,
  StudentKnowledgeInteraction
} from '../types';
import { KnowledgeCardDetailModal } from './KnowledgeCardDetailModal';
import {
  Search,
  BookOpen,
  Filter,
  Bookmark,
  RotateCcw,
  Sparkles,
  CheckCircle,
  Clock,
  ArrowRight,
  Eye,
  Check,
  Compass,
  FileText,
  PenTool,
  HelpCircle,
  GraduationCap
} from 'lucide-react';

interface KnowledgeBaseHubProps {
  knowledgeCards: KnowledgeCard[];
  interactions: Record<string, StudentKnowledgeInteraction>;
  onToggleBookmark: (cardId: string) => void;
  onToggleNeedsReview: (cardId: string) => void;
  onRecordStudy: (cardId: string) => void;
  onRecordPracticeScore: (cardId: string, score: number) => void;
  onNavigateToExercise?: (type: 'reading' | 'writing', targetId?: string) => void;
}

export const KnowledgeBaseHub: React.FC<KnowledgeBaseHubProps> = ({
  knowledgeCards,
  interactions,
  onToggleBookmark,
  onToggleNeedsReview,
  onRecordStudy,
  onRecordPracticeScore,
  onNavigateToExercise
}) => {
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<KnowledgeCategory | 'all'>('all');
  const [selectedLevel, setSelectedLevel] = useState<CognitiveLevel | 'all'>('all');
  const [filterBookmarkOnly, setFilterBookmarkOnly] = useState<boolean>(false);
  const [filterNeedsReviewOnly, setFilterNeedsReviewOnly] = useState<boolean>(false);

  // Modal xem chi tiết
  const [selectedCardForModal, setSelectedCardForModal] = useState<KnowledgeCard | null>(null);

  // Chỉ hiển thị các thẻ đã xuất bản (published) cho học sinh
  const studentCards = knowledgeCards.filter((c) => c.status === 'published');

  // Lọc thẻ
  const filteredCards = studentCards.filter((card) => {
    // Tìm kiếm từ khóa
    const searchLower = searchKeyword.toLowerCase();
    const matchSearch =
      !searchKeyword.trim() ||
      card.title.toLowerCase().includes(searchLower) ||
      card.summary.toLowerCase().includes(searchLower) ||
      card.targetGoal.toLowerCase().includes(searchLower) ||
      card.recognitionSigns.some((s) => s.toLowerCase().includes(searchLower)) ||
      card.examples.some((e) => e.quote.toLowerCase().includes(searchLower));

    // Lọc theo nhóm
    const matchCategory = selectedCategory === 'all' || card.category === selectedCategory;

    // Lọc theo mức độ
    const matchLevel = selectedLevel === 'all' || card.level === selectedLevel;

    // Lọc theo yêu thích / cần ôn lại
    const interaction = interactions[card.id];
    const matchBookmark = !filterBookmarkOnly || (interaction && interaction.isBookmarked);
    const matchReview = !filterNeedsReviewOnly || (interaction && interaction.needsReview);

    return matchSearch && matchCategory && matchLevel && matchBookmark && matchReview;
  });

  // Thống kê nhanh
  const totalCards = studentCards.length;
  const studiedCount = Object.values(interactions).filter((i) => i.hasStudied).length;
  const bookmarkedCount = Object.values(interactions).filter((i) => i.isBookmarked).length;
  const needsReviewCount = Object.values(interactions).filter((i) => i.needsReview).length;

  const categoriesConfig: { id: KnowledgeCategory | 'all'; label: string; icon: React.ReactNode }[] = [
    { id: 'all', label: 'Tất cả chủ đề', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'rhetoric', label: 'A. Biện pháp tu từ & Tiếng Việt', icon: <Sparkles className="w-4 h-4" /> },
    { id: 'reading_method', label: 'B. Phương pháp Đọc hiểu', icon: <Compass className="w-4 h-4" /> },
    { id: 'paragraph_200w', label: 'C. Đoạn văn 200 chữ', icon: <FileText className="w-4 h-4" /> },
    { id: 'essay_600w', label: 'D. Bài văn 600 chữ', icon: <PenTool className="w-4 h-4" /> },
    { id: 'exam_skills', label: 'E. Kĩ năng phòng thi & Thời gian', icon: <Clock className="w-4 h-4" /> }
  ];

  return (
    <div className="space-y-8 pb-16">
      {/* HEADER BANNER */}
      <div className="p-6 sm:p-8 rounded-2xl bg-gradient-to-r from-[#0F172A] to-[#1E293B] text-white shadow-lg space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold border border-emerald-400/30">
              <GraduationCap className="w-3.5 h-3.5" />
              <span>Thư viện Tri thức Ngữ văn 12 Chuẩn THPT</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-serif-literary font-bold text-white">
              Góc tri thức Ngữ văn – Học nhanh & Tự luyện
            </h1>
            <p className="text-xs sm:text-sm text-stone-300 leading-relaxed">
              Hệ thống thẻ kiến thức ngắn, giải thích tinh gọn, bám sát ngữ cảnh thực tế và tránh học thuộc máy móc. Học xong thực hành tự kiểm tra ngay với barem phản hồi gợi mở.
            </p>
          </div>

          {/* Quick Stats Chips */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="px-3.5 py-2 rounded-xl bg-white/10 backdrop-blur-xs border border-white/15 text-center">
              <span className="block text-xl font-bold font-serif-literary text-white">
                {studiedCount}/{totalCards}
              </span>
              <span className="text-[10px] text-stone-300 uppercase tracking-wider">Đã học</span>
            </div>
            <div className="px-3.5 py-2 rounded-xl bg-white/10 backdrop-blur-xs border border-white/15 text-center">
              <span className="block text-xl font-bold font-serif-literary text-amber-300">
                {bookmarkedCount}
              </span>
              <span className="text-[10px] text-stone-300 uppercase tracking-wider">Yêu thích</span>
            </div>
            <div className="px-3.5 py-2 rounded-xl bg-white/10 backdrop-blur-xs border border-white/15 text-center">
              <span className="block text-xl font-bold font-serif-literary text-red-300">
                {needsReviewCount}
              </span>
              <span className="text-[10px] text-stone-300 uppercase tracking-wider">Cần ôn lại</span>
            </div>
          </div>
        </div>
      </div>

      {/* THANH TÌM KIẾM & BỘ LỌC ĐA TIÊU CHÍ */}
      <div className="p-5 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-4">
        {/* Hàng 1: Ô tìm kiếm từ khóa & Nút lọc nhanh Bookmark */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="Tìm kiếm kiến thức (ví dụ: ẩn dụ, hoán dụ, đoạn 200 chữ, thời gian làm bài, phân biệt...)"
              className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-600 transition-colors"
            />
            {searchKeyword && (
              <button
                onClick={() => setSearchKeyword('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 text-xs cursor-pointer"
              >
                Xóa
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Lọc Yêu thích */}
            <button
              onClick={() => setFilterBookmarkOnly(!filterBookmarkOnly)}
              className={`px-3 py-2 text-xs font-semibold rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer ${
                filterBookmarkOnly
                  ? 'bg-amber-50 text-amber-900 border-amber-300 shadow-xs'
                  : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
              }`}
            >
              <Bookmark className={`w-3.5 h-3.5 ${filterBookmarkOnly ? 'fill-amber-500 text-amber-500' : ''}`} />
              <span>Yêu thích ({bookmarkedCount})</span>
            </button>

            {/* Lọc Cần ôn lại */}
            <button
              onClick={() => setFilterNeedsReviewOnly(!filterNeedsReviewOnly)}
              className={`px-3 py-2 text-xs font-semibold rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer ${
                filterNeedsReviewOnly
                  ? 'bg-red-50 text-red-900 border-red-300 shadow-xs'
                  : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5 text-red-600" />
              <span>Cần ôn lại ({needsReviewCount})</span>
            </button>
          </div>
        </div>

        {/* Hàng 2: Tabs Chủ đề chính */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 text-xs">
          {categoriesConfig.map((cat) => {
            const isActive = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-lg whitespace-nowrap font-medium transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                  isActive
                    ? 'bg-[#0F172A] text-white shadow-xs'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200 hover:text-stone-900'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Hàng 3: Lọc theo Mức độ nhận thức */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-stone-100 text-xs">
          <span className="text-stone-500 font-medium flex items-center gap-1 mr-1">
            <Filter className="w-3.5 h-3.5" />
            <span>Mức độ:</span>
          </span>
          {[
            { id: 'all', label: 'Tất cả mức độ' },
            { id: 'nhan_biet', label: 'Nhận biết' },
            { id: 'thong_hieu', label: 'Thông hiểu' },
            { id: 'van_dung', label: 'Vận dụng' },
            { id: 'van_dung_cao', label: 'Vận dụng cao' }
          ].map((lvl) => (
            <button
              key={lvl.id}
              onClick={() => setSelectedLevel(lvl.id as any)}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer text-xs ${
                selectedLevel === lvl.id
                  ? 'bg-emerald-100 text-emerald-900 font-semibold border border-emerald-300'
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              {lvl.label}
            </button>
          ))}

          {(selectedCategory !== 'all' ||
            selectedLevel !== 'all' ||
            searchKeyword ||
            filterBookmarkOnly ||
            filterNeedsReviewOnly) && (
            <button
              onClick={() => {
                setSelectedCategory('all');
                setSelectedLevel('all');
                setSearchKeyword('');
                setFilterBookmarkOnly(false);
                setFilterNeedsReviewOnly(false);
              }}
              className="text-stone-500 hover:text-red-700 ml-auto font-medium cursor-pointer"
            >
              Đặt lại bộ lọc
            </button>
          )}
        </div>
      </div>

      {/* DANH SÁCH THẺ TRI THỨC (GRID) */}
      {filteredCards.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-dashed border-stone-300 space-y-3">
          <div className="w-12 h-12 rounded-full bg-stone-100 text-stone-400 mx-auto flex items-center justify-center">
            <Search className="w-6 h-6" />
          </div>
          <h3 className="font-serif-literary font-bold text-stone-800 text-lg">
            Không tìm thấy thẻ tri thức phù hợp
          </h3>
          <p className="text-xs text-stone-500 max-w-md mx-auto">
            Hãy thử tìm kiếm với từ khóa khác hoặc xóa bớt các tiêu chí lọc đang chọn.
          </p>
          <button
            onClick={() => {
              setSearchKeyword('');
              setSelectedCategory('all');
              setSelectedLevel('all');
              setFilterBookmarkOnly(false);
              setFilterNeedsReviewOnly(false);
            }}
            className="px-4 py-2 bg-[#0F172A] text-white text-xs font-semibold rounded-lg cursor-pointer"
          >
            Hiển thị toàn bộ thư viện
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCards.map((card) => {
            const interaction = interactions[card.id];
            const isBookmarked = interaction?.isBookmarked || false;
            const needsReview = interaction?.needsReview || false;
            const hasStudied = interaction?.hasStudied || false;

            return (
              <div
                key={card.id}
                className="p-5 rounded-2xl bg-white border border-stone-200 hover:border-stone-300 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4 group"
              >
                {/* Header Card */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-200">
                      {card.categoryName}
                    </span>

                    <div className="flex items-center gap-1.5">
                      {/* Trạng thái đã học */}
                      {hasStudied && (
                        <span
                          className="flex items-center gap-0.5 text-[11px] text-emerald-700 font-medium"
                          title="Đã xem bài học này"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Đã xem</span>
                        </span>
                      )}

                      {/* Nút Yêu thích */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleBookmark(card.id);
                        }}
                        className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                          isBookmarked
                            ? 'text-amber-500 hover:text-amber-600 bg-amber-50'
                            : 'text-stone-400 hover:text-stone-600 hover:bg-stone-100'
                        }`}
                        title={isBookmarked ? 'Bỏ yêu thích' : 'Đánh dấu yêu thích'}
                      >
                        <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-amber-500' : ''}`} />
                      </button>

                      {/* Nút Cần ôn lại */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleNeedsReview(card.id);
                        }}
                        className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                          needsReview
                            ? 'text-red-600 bg-red-50'
                            : 'text-stone-400 hover:text-stone-600 hover:bg-stone-100'
                        }`}
                        title={needsReview ? 'Đã ghim cần ôn lại' : 'Đánh dấu cần ôn lại'}
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Tên Thẻ & Mức độ */}
                  <div>
                    <div className="flex items-center gap-2 text-[11px] text-stone-500 mb-1">
                      <span className="px-1.5 py-0.2 rounded bg-stone-100 text-stone-700">
                        {card.levelName}
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {card.estimatedMinutes} phút
                      </span>
                    </div>

                    <h3 className="text-base sm:text-lg font-serif-literary font-bold text-[#0F172A] group-hover:text-emerald-900 transition-colors leading-snug">
                      {card.title}
                    </h3>
                  </div>

                  {/* Mục tiêu cốt lõi */}
                  <p className="text-xs text-stone-600 line-clamp-2 leading-relaxed">
                    {card.targetGoal}
                  </p>

                  {/* Checklist 2 dấu hiệu nhận biết */}
                  <div className="p-3 bg-stone-50 rounded-xl space-y-1.5 text-xs text-stone-700 border border-stone-100">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 block">
                      Dấu hiệu nhận biết trọng tâm:
                    </span>
                    {card.recognitionSigns.slice(0, 2).map((sign, idx) => (
                      <p key={idx} className="line-clamp-1 flex items-start gap-1.5 text-[11px]">
                        <span className="text-emerald-600 font-bold">•</span>
                        <span>{sign}</span>
                      </p>
                    ))}
                  </div>
                </div>

                {/* Footer Action */}
                <div className="pt-3 border-t border-stone-100 flex items-center justify-between gap-2">
                  <div className="text-[11px] text-stone-500">
                    {card.practiceQuestions.length} câu tự luyện
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedCardForModal(card)}
                    className="px-3.5 py-1.5 bg-[#0F172A] hover:bg-[#1E293B] text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <span>Học & Tự luyện</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CHI TIẾT THẺ BÀI HỌC VÀ TỰ LUYỆN MODAL */}
      {selectedCardForModal && (
        <KnowledgeCardDetailModal
          card={selectedCardForModal}
          isOpen={Boolean(selectedCardForModal)}
          interaction={interactions[selectedCardForModal.id]}
          onClose={() => setSelectedCardForModal(null)}
          onToggleBookmark={onToggleBookmark}
          onToggleNeedsReview={onToggleNeedsReview}
          onRecordStudy={onRecordStudy}
          onRecordPracticeScore={onRecordPracticeScore}
          onNavigateToExercise={onNavigateToExercise}
        />
      )}
    </div>
  );
};
