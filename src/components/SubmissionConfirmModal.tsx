import React from 'react';
import {
  Send,
  CheckCircle,
  X,
  ShieldCheck,
  Lock
} from 'lucide-react';

interface SubmissionConfirmModalProps {
  isOpen: boolean;
  promptTitle: string;
  taskId?: string;
  versionNumber?: number;
  versionCode?: string;
  studentIdentityLabel?: string;
  wordCount: number;
  targetWordCount: number;
  typeLabel: string;
  isSubmitting?: boolean;
  onClose: () => void;
  onConfirmSubmit: () => void;
}

export const SubmissionConfirmModal: React.FC<SubmissionConfirmModalProps> = ({
  isOpen,
  promptTitle,
  taskId,
  versionNumber = 1,
  versionCode = 'VER-001',
  studentIdentityLabel,
  wordCount,
  targetWordCount,
  typeLabel,
  isSubmitting = false,
  onClose,
  onConfirmSubmit
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs animate-fadeIn overflow-y-auto">
      <div className="bg-[#FAF7F2] rounded-2xl max-w-lg w-full border border-stone-200 shadow-2xl overflow-hidden my-auto flex flex-col">
        {/* Header */}
        <div className="bg-[#0F172A] text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600/30 text-emerald-300 flex items-center justify-center border border-emerald-400/30">
              <Send className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-serif-literary text-lg font-bold text-white">
                Xác nhận Nộp bài chính thức
              </h2>
              <p className="text-xs text-stone-300">
                Cố định phiên bản nộp bất biến & gửi vào quy trình chấm
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 rounded-md text-stone-400 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-sm text-stone-800">
          <div className="p-4 bg-white rounded-xl border border-stone-200 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-semibold text-stone-500 uppercase">
              <span>Thông tin phiên bản nộp:</span>
              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-mono font-bold">
                Phiên bản v{versionNumber} ({versionCode})
              </span>
            </div>
            <div className="font-serif-literary font-bold text-base text-[#0F172A]">
              {promptTitle}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-stone-600 pt-1 border-t border-stone-100">
              <div>
                Thể loại: <strong>{typeLabel}</strong>
              </div>
              <div className="tabular-nums">
                Dung lượng: <strong>{wordCount} từ</strong> (Mục tiêu ~{targetWordCount} từ)
              </div>
              {taskId && (
                <div>
                  Mã nhiệm vụ: <strong className="font-mono">{taskId}</strong>
                </div>
              )}
              {studentIdentityLabel && (
                <div>
                  Tài khoản: <strong className="font-mono">{studentIdentityLabel}</strong>
                </div>
              )}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-950 space-y-1.5">
            <div className="font-bold flex items-center gap-1.5 text-blue-900">
              <Lock className="w-4 h-4 text-blue-700" />
              <span>Quy tắc bảo toàn phiên bản đã nộp (Bất biến):</span>
            </div>
            <p className="leading-relaxed">
              • Hệ thống sẽ ghi nhận chính xác <strong>thời điểm nộp</strong> và cố định <strong>mã phiên bản {versionCode} (v{versionNumber})</strong> để gửi chấm.
            </p>
            <p className="leading-relaxed">
              • Bản đã nộp sẽ được <strong>khóa bất biến</strong> (không thể sửa đè trực tiếp). Nếu muốn chỉnh sửa hoặc viết lại sau khi nộp, hệ thống sẽ yêu cầu khởi tạo <strong>Phiên bản mới (v{versionNumber + 1})</strong> theo đúng quy tắc bài.
            </p>
          </div>
        </div>

        {/* Nút hành động (Chống nhấn đúp nộp trùng) */}
        <div className="bg-stone-100 border-t border-stone-200 px-6 py-3.5 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 border border-stone-300 text-stone-700 text-xs font-semibold rounded-lg hover:bg-stone-200 cursor-pointer disabled:opacity-50"
          >
            Tiếp tục sửa bản nháp
          </button>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => {
              if (isSubmitting) return;
              onConfirmSubmit();
            }}
            className="px-5 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            <span>
              {isSubmitting
                ? 'Đang khóa phiên bản & nộp bài...'
                : `Xác nhận Nộp Phiên bản v${versionNumber}`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
