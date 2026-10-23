import React from 'react';
import { X, BookOpen, PenTool, CheckCircle, ShieldAlert, Sparkles } from 'lucide-react';

interface GuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GuideModal: React.FC<GuideModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fadeIn">
      <div className="bg-[#FAF7F2] rounded-2xl max-w-2xl w-full border border-stone-200 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-[#FAF7F2]/95 backdrop-blur-xs border-b border-stone-200 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-700" />
            <h2 className="text-lg font-serif-literary font-bold text-[#0F172A]">
              Phương pháp ôn thi THPT & Hướng dẫn sử dụng VănAI 12
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-200/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 text-sm text-stone-700 leading-relaxed">
          {/* Mục tiêu sư phạm */}
          <div className="space-y-2">
            <h3 className="font-bold text-[#0F172A] text-base flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
              <span>1. Triết lý sư phạm của ứng dụng</span>
            </h3>
            <p>
              VănAI 12 được thiết kế như một <strong>người trợ giảng hướng dẫn và phản biện</strong>. Chúng tôi không bao giờ viết bài văn hộ bạn hay cung cấp các bài văn mẫu sao chép rập khuôn. Giá trị lớn nhất của việc học Văn là giúp bạn hình thành tư duy độc lập và năng lực thấu cảm sâu sắc.
            </p>
          </div>

          {/* Cấu trúc đề thi */}
          <div className="p-4 rounded-xl bg-white border border-stone-200 space-y-3">
            <h3 className="font-bold text-[#0F172A] text-sm">
              Cấu trúc chuẩn đề thi Tốt nghiệp THPT môn Ngữ văn:
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-blue-50/70 border border-blue-200 space-y-1">
                <span className="font-bold text-blue-900 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Phần I: Đọc hiểu (3.0 điểm)</span>
                </span>
                <p>Gồm 4 câu hỏi phân tầng: Nhận biết (0.75đ), Thông hiểu (0.75đ), Vận dụng (1.0đ), Vận dụng cao (0.5đ). Yêu cầu trả lời ngắn gọn, chuẩn xác, bám chắc ngữ liệu.</p>
              </div>

              <div className="p-3 rounded-lg bg-emerald-50/70 border border-emerald-200 space-y-1">
                <span className="font-bold text-emerald-900 flex items-center gap-1.5">
                  <PenTool className="w-3.5 h-3.5" />
                  <span>Phần II: Làm văn (7.0 điểm)</span>
                </span>
                <p>
                  • <strong>Câu 1:</strong> Đoạn văn Nghị luận xã hội khoảng 200 chữ (2.0 điểm).<br />
                  • <strong>Câu 2:</strong> Bài văn Nghị luận văn học (5.0 điểm).
                </p>
              </div>
            </div>
          </div>

          {/* Quy trình tự học hiệu quả 3 bước */}
          <div className="space-y-3">
            <h3 className="font-bold text-[#0F172A] text-base flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
              <span>2. Quy trình luyện tập 3 bước với VănAI 12</span>
            </h3>
            <ol className="space-y-2.5 pl-4 list-decimal text-xs sm:text-sm">
              <li>
                <strong>Bước 1 - Tự thử sức trước:</strong> Đọc kỹ văn bản hoặc đề bài, tự viết câu trả lời theo hiểu biết của bản thân vào ô soạn thảo.
              </li>
              <li>
                <strong>Bước 2 - Đọc phản hồi gợi mở:</strong> Quan sát các điểm đúng đã làm được, các điểm còn thiếu sót và căn cứ chỉ điểm trong văn bản.
              </li>
              <li>
                <strong>Bước 3 - Tự sửa và giải thích:</strong> Viết lại bản hoàn thiện ở khu vực "Bản tự sửa đổi" và ghi lại lý do thay đổi. Đây là bước khắc sâu năng lực tư duy.
              </li>
            </ol>
          </div>

          {/* Cảnh báo minh bạch v1.0 */}
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <strong>Lưu ý về phiên bản v1.0:</strong> Ứng dụng chạy bộ quy tắc sư phạm THPT tương tác trực tiếp phía trình duyệt. Dữ liệu chưa lưu vào máy chủ vĩnh viễn, bạn hãy sao chép các bài viết tâm đắc về máy tính cá nhân để lưu giữ.
            </div>
          </div>
        </div>

        <div className="border-t border-stone-200 p-4 bg-stone-100/60 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-[#0F172A] text-white text-xs font-semibold hover:bg-[#1E293B] transition-colors"
          >
            Đã hiểu & Bắt đầu học
          </button>
        </div>
      </div>
    </div>
  );
};
