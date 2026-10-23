import React, { useState, useEffect, useMemo } from 'react';
import { ReadingAttempt, WritingSubmissionRecord } from '../types';
import {
  analyzePortfolioStudyCadence,
  loadReviewToastSnoozeState,
  snoozeReviewReminder,
  dismissReviewReminderId,
  clearReviewReminderSnooze
} from '../services/reviewCadenceService';
import {
  Bell,
  Clock,
  Sparkles,
  CheckCircle2,
  X,
  ArrowRight,
  RotateCcw,
  CalendarClock
} from 'lucide-react';

interface PeriodicReviewToastProps {
  studentUid?: string;
  readingAttempts: ReadingAttempt[];
  writingRecords: WritingSubmissionRecord[];
  onGoToReading: () => void;
  onGoToWriting: () => void;
  onScrollToHistory?: () => void;
}

export const PeriodicReviewToast: React.FC<PeriodicReviewToastProps> = ({
  studentUid = 'guest_local',
  readingAttempts,
  writingRecords,
  onGoToReading,
  onGoToWriting,
  onScrollToHistory
}) => {
  const metrics = useMemo(
    () => analyzePortfolioStudyCadence(readingAttempts, writingRecords),
    [readingAttempts, writingRecords]
  );

  const [isToastVisible, setIsToastVisible] = useState<boolean>(false);
  const [snoozedConfirmation, setSnoozedConfirmation] = useState<string | null>(null);

  // Tự động hiển thị thông báo nhắc nhở nhẹ nhàng (toast) sau 800ms nếu có lời nhắc định kỳ và chưa bị tạm ẩn
  useEffect(() => {
    const reminder = metrics.activeReminder;
    if (!reminder) {
      setIsToastVisible(false);
      return;
    }

    const snoozeState = loadReviewToastSnoozeState(studentUid);
    const isDismissed = snoozeState.dismissedReminderIds.includes(reminder.id);
    const isSnoozed =
      typeof snoozeState.snoozedUntilMs === 'number' && Date.now() < snoozeState.snoozedUntilMs;

    if (isDismissed || isSnoozed) {
      setIsToastVisible(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setIsToastVisible(true);
    }, 650);

    return () => window.clearTimeout(timer);
  }, [metrics.activeReminder, studentUid]);

  const handleSnooze30Min = () => {
    snoozeReviewReminder(studentUid, 30);
    setIsToastVisible(false);
    setSnoozedConfirmation('Đã tạm ẩn nhắc nhở trong 30 phút.');
    window.setTimeout(() => setSnoozedConfirmation(null), 3500);
  };

  const handleDismiss = () => {
    if (metrics.activeReminder) {
      dismissReviewReminderId(studentUid, metrics.activeReminder.id);
    }
    setIsToastVisible(false);
  };

  const handleManualOpenToast = () => {
    clearReviewReminderSnooze(studentUid);
    setSnoozedConfirmation(null);
    setIsToastVisible(true);
  };

  const handleTriggerAction = () => {
    const reminder = metrics.activeReminder;
    setIsToastVisible(false);
    if (!reminder) return;

    if (reminder.targetAction === 'reading') {
      onGoToReading();
    } else if (reminder.targetAction === 'writing') {
      onGoToWriting();
    } else if (onScrollToHistory) {
      onScrollToHistory();
    }
  };

  const activeReminder = metrics.activeReminder;

  return (
    <>
      {/* THANH TẦN SUẤT HỌC TẬP & LỊCH ÔN TẬP ĐỊNH KỲ TRONG LEARNING PORTFOLIO */}
      <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white border border-indigo-500/30 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-200 border border-cyan-400/30 text-[11px] font-bold">
              <CalendarClock className="w-3.5 h-3.5 text-cyan-300" />
              <span>Nhịp độ & Nhắc nhở Ôn tập Định kỳ</span>
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-stone-200 border border-white/15 text-[11px] font-semibold">
              {metrics.cadenceStatusLabel}
            </span>
            {metrics.latestActivityLabel !== 'Chưa có dữ liệu' && (
              <span className="text-[11px] text-stone-300 font-mono">
                Phiên gần nhất: {metrics.latestActivityLabel}
              </span>
            )}
          </div>

          <p className="text-xs sm:text-sm text-stone-200 leading-relaxed">
            <strong className="text-white">Đề xuất ôn tập định kỳ tiếp theo:</strong>{' '}
            {metrics.recommendedNextReviewLabel}
          </p>

          {snoozedConfirmation && (
            <p className="text-[11px] text-emerald-300 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{snoozedConfirmation}</span>
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {activeReminder ? (
            <button
              type="button"
              onClick={handleManualOpenToast}
              className="min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-cyan-600 via-indigo-600 to-purple-600 hover:from-cyan-500 hover:via-indigo-500 hover:to-purple-500 border border-white/20 transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <Bell className="w-3.5 h-3.5 text-cyan-200" />
              <span>{isToastVisible ? 'Đang hiển thị lời nhắc' : 'Mở nhắc nhở ôn tập'}</span>
            </button>
          ) : (
            <span className="text-xs text-stone-400 italic px-2">
              Chưa có dữ liệu phiên học để đặt lời nhắc định kỳ
            </span>
          )}
        </div>
      </div>

      {/* THÔNG BÁO NHẮC NHỞ NHẸ NHÀNG (GENTLE FLOATING TOAST NOTIFICATION) */}
      {isToastVisible && activeReminder && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 md:bottom-6 right-4 left-4 sm:left-auto sm:w-[410px] z-50 rounded-2xl bg-white/95 backdrop-blur-md border border-indigo-200 shadow-2xl p-4 sm:p-5 space-y-3.5 transition-all duration-300"
        >
          {/* Thanh điểm nhấn ánh sắc nhẹ trên đầu Toast */}
          <div className="flex items-start justify-between gap-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-900 border border-indigo-200 text-[11px] font-bold">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span>{activeReminder.badgeText}</span>
            </div>

            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Đóng thông báo nhắc nhở"
              className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-1.5">
            <h3 className="text-sm sm:text-base font-serif-literary font-bold text-[#0F172A] leading-snug">
              {activeReminder.title}
            </h3>
            <p className="text-xs text-stone-600 leading-relaxed">
              {activeReminder.message}
            </p>
          </div>

          <div className="px-3 py-2 rounded-xl bg-stone-50 border border-stone-200/80 flex items-center justify-between gap-2 text-[11px] text-stone-600">
            <span className="flex items-center gap-1.5 font-medium text-stone-700">
              <Clock className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span>{activeReminder.cadenceSummary}</span>
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={handleSnooze30Min}
              className="px-3 py-2 rounded-xl text-xs font-semibold text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 transition-colors cursor-pointer flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Nhắc lại sau 30p</span>
            </button>

            <button
              type="button"
              onClick={handleTriggerAction}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-cyan-600 via-indigo-600 to-purple-600 hover:from-cyan-500 hover:via-indigo-500 hover:to-purple-500 transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
            >
              <span>{activeReminder.actionLabel}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};
