import React, { useState, useEffect } from 'react';
import {
  Maximize2,
  Minimize2,
  Timer,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  Sparkles
} from 'lucide-react';

interface FocusModeBarProps {
  isFocusMode: boolean;
  onToggleFocusMode: (nextValue: boolean) => void;
  modeTitle: string;
  taskSubtitle?: string;
  defaultMinutes?: number;
  presetMinutes?: number[];
  extraStatusBadge?: React.ReactNode;
}

export const FocusModeBar: React.FC<FocusModeBarProps> = ({
  isFocusMode,
  onToggleFocusMode,
  modeTitle,
  taskSubtitle,
  defaultMinutes = 30,
  presetMinutes = [15, 25, 30, 45, 60],
  extraStatusBadge
}) => {
  const [selectedMinutes, setSelectedMinutes] = useState<number>(defaultMinutes);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(defaultMinutes * 60);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isFinished, setIsFinished] = useState<boolean>(false);

  // Đồng bộ thời lượng mặc định khi đổi dạng bài (ví dụ từ Đoạn 200 chữ 30p sang Bài 600 chữ 60p) nếu đồng hồ chưa chạy
  useEffect(() => {
    if (!isRunning && remainingSeconds === selectedMinutes * 60) {
      setSelectedMinutes(defaultMinutes);
      setRemainingSeconds(defaultMinutes * 60);
      setIsFinished(false);
    }
  }, [defaultMinutes]);

  // Bộ đếm ngược từng giây
  useEffect(() => {
    if (!isRunning) return;

    const interval = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          setIsRunning(false);
          setIsFinished(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isRunning]);

  // Hỗ trợ phím tắt Ctrl+F để bật/tắt nhanh Chế độ Tập trung và phím Esc để thoát
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        if (isFocusMode) {
          onToggleFocusMode(false);
        } else {
          onToggleFocusMode(true);
          setIsRunning((running) => {
            if (!running && remainingSeconds > 0) {
              return true;
            }
            return running;
          });
        }
        return;
      }

      if (isFocusMode && e.key === 'Escape') {
        onToggleFocusMode(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFocusMode, onToggleFocusMode, remainingSeconds]);

  const handleSelectDuration = (mins: number) => {
    setSelectedMinutes(mins);
    setRemainingSeconds(mins * 60);
    setIsFinished(false);
  };

  const handleResetTimer = () => {
    setIsRunning(false);
    setIsFinished(false);
    setRemainingSeconds(selectedMinutes * 60);
  };

  const handleEnterFocusMode = () => {
    onToggleFocusMode(true);
    if (!isRunning && remainingSeconds > 0) {
      setIsRunning(true);
    }
  };

  const handleExitFocusMode = () => {
    onToggleFocusMode(false);
  };

  const totalSeconds = Math.max(1, selectedMinutes * 60);
  const elapsedPercent = Math.min(
    100,
    Math.max(0, Math.round(((totalSeconds - remainingSeconds) / totalSeconds) * 100))
  );

  const minsDisplay = String(Math.floor(remainingSeconds / 60)).padStart(2, '0');
  const secsDisplay = String(remainingSeconds % 60).padStart(2, '0');

  const isLowTime = remainingSeconds > 0 && remainingSeconds <= 180; // Dưới 3 phút

  if (!isFocusMode) {
    return (
      <div className="p-3.5 sm:px-4 rounded-xl bg-white border border-stone-200/90 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center justify-center shrink-0">
            <Timer className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-[#0F172A]">
                Chế độ Tập trung (Focus Mode)
              </span>
              <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-stone-100 text-stone-700">
                {minsDisplay}:{secsDisplay}
              </span>
              {isRunning && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                  Đang đếm giờ
                </span>
              )}
            </div>
            <p className="text-[11px] text-stone-500">
              Ẩn thanh điều hướng phụ, danh sách đổi đề và bật đồng hồ đếm ngược chuẩn phòng thi ({defaultMinutes} phút) để tránh xao nhãng.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Chọn nhanh mốc thời gian trước khi bật */}
          <div className="hidden sm:inline-flex items-center p-0.5 rounded-lg bg-stone-100 border border-stone-200 text-[11px] font-semibold">
            {presetMinutes.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => handleSelectDuration(m)}
                className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                  selectedMinutes === m
                    ? 'bg-white text-[#0F172A] shadow-2xs font-bold'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                {m}p
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleEnterFocusMode}
            title="Bật Chế độ Tập trung (Phím tắt: Ctrl+F)"
            className="px-3.5 py-2 rounded-xl bg-[#0F172A] hover:bg-stone-800 text-white text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-2xs"
          >
            <Maximize2 className="w-3.5 h-3.5 text-cyan-300" />
            <span>Bật Chế độ Tập trung</span>
            <kbd className="hidden sm:inline-block ml-1 px-1.5 py-0.5 text-[10px] font-mono bg-white/15 text-cyan-200 rounded border border-white/20">
              Ctrl+F
            </kbd>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Thanh điều khiển Chế độ Tập trung"
      className="sticky top-2 z-40 p-3.5 sm:px-5 rounded-2xl bg-[#0F172A] text-white border border-indigo-400/40 shadow-md space-y-2.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Trái: Nhãn chế độ & Tên bài đang làm */}
        <div className="flex items-center gap-3 min-w-0">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/20 border border-indigo-400/40 text-cyan-200 text-xs font-bold shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
            <span>Focus Mode</span>
          </span>
          <div className="min-w-0">
            <div className="text-xs sm:text-sm font-bold text-white truncate">
              {modeTitle}
            </div>
            {taskSubtitle && (
              <div className="text-[11px] text-stone-300 truncate">{taskSubtitle}</div>
            )}
          </div>
          {extraStatusBadge}
        </div>

        {/* Giữa: Đồng hồ tập trung + Nút điều khiển Play/Pause/Reset + Chọn mốc phút */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Chọn nhanh thời lượng */}
          <div className="inline-flex items-center p-0.5 rounded-lg bg-white/10 border border-white/15 text-[11px] font-semibold">
            {presetMinutes.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => handleSelectDuration(m)}
                className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                  selectedMinutes === m
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'text-stone-300 hover:text-white'
                }`}
                title={`Đặt đồng hồ tập trung ${m} phút`}
              >
                {m}p
              </button>
            ))}
          </div>

          {/* Hiển thị đồng hồ đếm ngược */}
          <div
            className={`px-3 py-1.5 rounded-xl font-mono text-base sm:text-lg font-bold tabular-nums flex items-center gap-2 border ${
              isFinished
                ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/50'
                : isLowTime
                ? 'bg-rose-500/25 text-rose-200 border-rose-400/50'
                : 'bg-white/10 text-white border-white/20'
            }`}
          >
            <Timer className="w-4 h-4 text-cyan-300 shrink-0" />
            <span>
              {minsDisplay}:{secsDisplay}
            </span>
            {isFinished && (
              <span className="text-[11px] font-sans font-semibold text-emerald-300 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Hoàn thành!</span>
              </span>
            )}
          </div>

          {/* Nút Bắt đầu / Tạm dừng */}
          <button
            type="button"
            onClick={() => {
              if (remainingSeconds === 0) {
                setRemainingSeconds(selectedMinutes * 60);
                setIsFinished(false);
                setIsRunning(true);
              } else {
                setIsRunning((prev) => !prev);
              }
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
              isRunning
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
            }`}
          >
            {isRunning ? (
              <>
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span>Tạm dừng</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{remainingSeconds < selectedMinutes * 60 ? 'Tiếp tục' : 'Đếm giờ'}</span>
              </>
            )}
          </button>

          {/* Nút Đặt lại */}
          <button
            type="button"
            onClick={handleResetTimer}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-stone-200 border border-white/15 transition-colors cursor-pointer"
            title="Đặt lại đồng hồ tập trung"
            aria-label="Đặt lại đồng hồ tập trung"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Nút Thoát Chế độ Tập trung */}
          <button
            type="button"
            onClick={handleExitFocusMode}
            className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white border border-white/25 text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5"
            title="Thoát Chế độ Tập trung (Phím tắt: Ctrl+F hoặc Esc)"
          >
            <Minimize2 className="w-3.5 h-3.5 text-pink-300" />
            <span>Thoát tập trung (Ctrl+F / Esc)</span>
          </button>
        </div>
      </div>

      {/* Thanh tiến độ thời gian tập trung mảnh gọn */}
      <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-cyan-400 via-indigo-400 to-emerald-400 transition-all duration-300"
          style={{ width: `${elapsedPercent}%` }}
        />
      </div>
    </div>
  );
};
