import React, { useState } from 'react';
import { DraftVersion } from '../types';
import {
  History,
  RotateCcw,
  X,
  Clock,
  CheckCircle,
  Lock
} from 'lucide-react';

interface DraftHistoryModalProps {
  isOpen: boolean;
  versions: DraftVersion[];
  currentText: string;
  onClose: () => void;
  onRestoreVersion: (version: DraftVersion) => void;
}

export const DraftHistoryModal: React.FC<DraftHistoryModalProps> = ({
  isOpen,
  versions,
  currentText,
  onClose,
  onRestoreVersion
}) => {
  const [selectedVersionId, setSelectedVersionId] = useState<string>(
    versions.length > 0 ? versions[0].id : ''
  );

  if (!isOpen) return null;

  const activeVersion =
    versions.find((v) => v.id === selectedVersionId) || (versions.length > 0 ? versions[0] : null);

  const currentWordCount = currentText.trim() ? currentText.trim().split(/\s+/).length : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs animate-fadeIn overflow-y-auto">
      <div className="bg-[#FAF7F2] rounded-2xl max-w-4xl w-full border border-stone-200 shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-[#0F172A] text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600/30 text-emerald-300 flex items-center justify-center border border-emerald-400/30">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-serif-literary text-lg font-bold text-white">
                Lịch sử phiên bản & Bản đã nộp bất biến
              </h2>
              <p className="text-xs text-stone-300">
                Toàn bộ các lần lưu tự động, lưu thủ công, nhập từ Google Docs/Tệp tin và bản nộp chính thức
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

        {/* Content 2 Cột: Cột trái danh sách phiên bản - Cột phải nội dung chi tiết */}
        <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-12 gap-6 flex-1 text-sm text-stone-800">
          {/* CỘT TRÁI: DANH SÁCH BẢN LƯU (5/12) */}
          <div className="md:col-span-5 space-y-3">
            <div className="flex items-center justify-between text-xs text-stone-600 border-b border-stone-200 pb-2">
              <span className="font-bold text-stone-800 uppercase tracking-wider">
                Các bản đã lưu ({versions.length})
              </span>
              <span>Bản đang mở: {currentWordCount} từ</span>
            </div>

            {versions.length === 0 ? (
              <div className="p-6 text-center rounded-xl bg-white border border-dashed border-stone-200 text-xs text-stone-500">
                Chưa có phiên bản lịch sử nào được ghi nhận cho nhiệm vụ này.
              </div>
            ) : (
              <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                {versions.map((ver) => {
                  const isSelected = ver.id === activeVersion?.id;
                  const isImmutable = Boolean(ver.immutable || ver.isSubmittedSnapshot);
                  return (
                    <button
                      key={ver.id}
                      type="button"
                      onClick={() => setSelectedVersionId(ver.id)}
                      className={`w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col space-y-1 ${
                        isSelected
                          ? 'bg-[#0F172A] text-white border-[#0F172A] shadow-xs'
                          : isImmutable
                          ? 'bg-emerald-50/70 hover:bg-emerald-100/70 text-stone-900 border-emerald-300'
                          : 'bg-white hover:bg-stone-50 text-stone-800 border-stone-200'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold flex items-center gap-1.5">
                          {isImmutable ? (
                            <Lock className={`w-3.5 h-3.5 ${isSelected ? 'text-emerald-400' : 'text-emerald-700'}`} />
                          ) : (
                            <Clock className={`w-3.5 h-3.5 ${isSelected ? 'text-emerald-400' : 'text-stone-400'}`} />
                          )}
                          <span>
                            {ver.versionCode ? `[${ver.versionCode}] ` : ver.versionNumber ? `[v${ver.versionNumber}] ` : ''}
                            {ver.savedAt}
                          </span>
                        </span>
                        <span className={`text-[11px] tabular-nums ${isSelected ? 'text-emerald-300' : 'text-stone-500'}`}>
                          {ver.wordCount} từ
                        </span>
                      </div>
                      <div className="text-[11px] truncate opacity-90 flex items-center gap-1.5">
                        {isImmutable && (
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                              isSelected ? 'bg-emerald-700 text-white' : 'bg-emerald-200 text-emerald-950'
                            }`}
                          >
                            Bản nộp bất biến
                          </span>
                        )}
                        <span className="truncate">{ver.sourceLabel}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* CỘT PHẢI: XEM TRƯỚC VÀ NÚT KHÔI PHỤC THÀNH PHIÊN BẢN MỚI (7/12) */}
          <div className="md:col-span-7 space-y-4">
            {activeVersion ? (
              <div className="p-5 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-4 flex flex-col h-full">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-3">
                  <div>
                    <span className="text-xs font-bold text-stone-900 block">
                      Chi tiết: {activeVersion.versionCode ? `${activeVersion.versionCode} — ` : ''}
                      {activeVersion.sourceLabel}
                    </span>
                    <span className="text-[11px] text-stone-500">
                      Lưu lúc: {activeVersion.savedAt} · Dung lượng: {activeVersion.wordCount} từ
                      {(activeVersion.immutable || activeVersion.isSubmittedSnapshot) &&
                        ' · 🔒 Đã khóa bất biến (Bản nộp chính thức)'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onRestoreVersion(activeVersion);
                      onClose();
                    }}
                    className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>
                      {activeVersion.immutable || activeVersion.isSubmittedSnapshot
                        ? 'Tạo bản nháp mới từ bản nộp này'
                        : 'Khôi phục thành phiên bản mới'}
                    </span>
                  </button>
                </div>

                <div className="p-4 bg-stone-50 rounded-xl border border-stone-200/80 font-serif-literary text-xs sm:text-sm text-stone-800 leading-relaxed overflow-y-auto max-h-[380px] whitespace-pre-line">
                  {activeVersion.content || '(Nội dung trống)'}
                </div>

                <div className="text-[11px] text-stone-500 flex items-center gap-1.5 pt-1">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>
                    Khi khôi phục, bản gốc vẫn được giữ nguyên bất biến trong lịch sử và hệ thống sẽ tạo một phiên bản mới để bạn tiếp tục chỉnh sửa.
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-12 text-center text-xs text-stone-500">
                Hãy chọn một phiên bản bên trái để xem trước nội dung.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
