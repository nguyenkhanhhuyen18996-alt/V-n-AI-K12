import React from 'react';
import {
  FileText,
  AlertTriangle,
  CheckCircle,
  X,
  PlusCircle,
  History
} from 'lucide-react';

interface ImportPreviewModalProps {
  isOpen: boolean;
  incomingText: string;
  incomingSourceTitle: string;
  currentText: string;
  currentVersionNumber?: number;
  onClose: () => void;
  onConfirmReplace: (text: string) => void;
  onConfirmAppend: (text: string) => void;
  onConfirmSaveAsVersionOnly?: (text: string) => void;
}

export const ImportPreviewModal: React.FC<ImportPreviewModalProps> = ({
  isOpen,
  incomingText,
  incomingSourceTitle,
  currentText,
  currentVersionNumber = 1,
  onClose,
  onConfirmReplace,
  onConfirmAppend,
  onConfirmSaveAsVersionOnly
}) => {
  if (!isOpen) return null;

  const incomingWordCount = incomingText.trim() ? incomingText.trim().split(/\s+/).length : 0;
  const currentWordCount = currentText.trim() ? currentText.trim().split(/\s+/).length : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs animate-fadeIn overflow-y-auto">
      <div className="bg-[#FAF7F2] rounded-2xl max-w-2xl w-full border border-stone-200 shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-[#0F172A] text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/30 text-blue-300 flex items-center justify-center border border-blue-400/30">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-serif-literary text-lg font-bold text-white">
                Xác nhận nhập nội dung & Tạo phiên bản mới
              </h2>
              <p className="text-xs text-stone-300">
                Nguồn: {incomingSourceTitle} ({incomingWordCount} từ)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-stone-400 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cảnh báo bảo vệ dữ liệu */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1 text-sm text-stone-800">
          {currentWordCount > 0 ? (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-950 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div>
                  <strong>Xác nhận trước khi ghi đè bản nháp đang có ({currentWordCount} từ):</strong>
                </div>
                <p>
                  Trình soạn thảo hiện đang có nội dung ở <strong>Phiên bản v{currentVersionNumber}</strong>. Mọi thao tác nhập, dán, tải tệp hoặc đồng bộ Google Docs đều sẽ <strong>tự động đóng gói bản đang gõ vào Lịch sử phiên bản</strong> và khởi tạo <strong>Phiên bản mới v{currentVersionNumber + 1}</strong> để không bao giờ mất dữ liệu cũ.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950">
              Nội dung này sẽ được nạp vào trình soạn thảo và ghi nhận thành một phiên bản mới trong Lịch sử phiên bản.
            </div>
          )}

          {/* Vùng xem trước văn bản nhập */}
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-stone-700 block">
              Nội dung văn bản xem trước ({incomingWordCount} từ):
            </span>
            <div className="p-4 bg-white rounded-xl border border-stone-200 font-serif-literary text-xs sm:text-sm text-stone-800 leading-relaxed max-h-[280px] overflow-y-auto whitespace-pre-line shadow-2xs">
              {incomingText || '(Không có nội dung văn bản)'}
            </div>
          </div>

          <div className="text-[11px] text-stone-500">
            • Bạn có thể khôi phục bất kỳ phiên bản nào trước đó trong mục <strong>Lịch sử phiên bản</strong>.
          </div>
        </div>

        {/* Nút hành động */}
        <div className="bg-stone-100 border-t border-stone-200 px-6 py-3.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-stone-300 text-stone-700 text-xs font-semibold rounded-lg hover:bg-stone-200 cursor-pointer"
          >
            Hủy bỏ
          </button>

          <div className="flex flex-wrap items-center gap-2">
            {currentWordCount > 0 && onConfirmSaveAsVersionOnly && (
              <button
                type="button"
                onClick={() => {
                  onConfirmSaveAsVersionOnly(incomingText);
                  onClose();
                }}
                className="px-3 py-2 bg-white hover:bg-stone-50 text-stone-800 border border-stone-300 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Chỉ thêm vào Lịch sử phiên bản, giữ nguyên văn bản đang gõ"
              >
                <History className="w-3.5 h-3.5 text-stone-600" />
                <span>Chỉ lưu thành phiên bản phụ</span>
              </button>
            )}

            {currentWordCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  onConfirmAppend(incomingText);
                  onClose();
                }}
                className="px-3.5 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5 text-stone-600" />
                <span>Nối vào cuối bài (Tạo v{currentVersionNumber + 1})</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                onConfirmReplace(incomingText);
                onClose();
              }}
              className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <CheckCircle className="w-3.5 h-3.5 text-emerald-300" />
              <span>
                {currentWordCount > 0
                  ? `Xác nhận ghi đè & Tạo v${currentVersionNumber + 1}`
                  : 'Đưa vào bài làm (Tạo phiên bản)'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
