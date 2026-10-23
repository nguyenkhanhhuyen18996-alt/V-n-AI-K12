import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, FastForward, RotateCcw } from 'lucide-react';

export interface GentleTypewriterTextProps {
  text: string;
  /** Unique key that resets and starts typing when changed (e.g. passageId or promptId) */
  triggerKey: string;
  /** Whether typing animation should run automatically on mount/triggerKey change */
  autoStart?: boolean;
  /** Interval in ms between typing ticks */
  intervalMs?: number;
  /** Target total duration in ms so long texts still finish gracefully */
  maxDurationMs?: number;
  /** Class name for the rendered text container */
  className?: string;
  /** Optional label shown while AI typing effect is active */
  streamingLabel?: string;
  /** Whether to show the subtle AI status header bar */
  showControlBar?: boolean;
}

export const GentleTypewriterText: React.FC<GentleTypewriterTextProps> = ({
  text,
  triggerKey,
  autoStart = true,
  intervalMs = 18,
  maxDurationMs = 2600,
  className = '',
  streamingLabel = 'AI đang phản hồi trực tiếp nội dung...',
  showControlBar = true
}) => {
  const [displayedLength, setDisplayedLength] = useState<number>(() =>
    autoStart ? 0 : text.length
  );
  const [isTyping, setIsTyping] = useState<boolean>(autoStart && text.length > 0);
  const [replayCount, setReplayCount] = useState<number>(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (!text || (!autoStart && replayCount === 0)) {
      setDisplayedLength(text.length);
      setIsTyping(false);
      return;
    }

    setDisplayedLength(0);
    setIsTyping(true);

    // Calculate adaptive step size so both short hints and longer reading passages feel gentle & responsive
    const totalTicks = Math.max(15, Math.floor(maxDurationMs / intervalMs));
    const stepSize = Math.max(1, Math.ceil(text.length / totalTicks));

    timerRef.current = window.setInterval(() => {
      setDisplayedLength((prev) => {
        const next = prev + stepSize;
        if (next >= text.length) {
          if (timerRef.current) {
            window.clearInterval(timerRef.current);
            timerRef.current = null;
          }
          setIsTyping(false);
          return text.length;
        }
        return next;
      });
    }, intervalMs);

    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [text, triggerKey, autoStart, intervalMs, maxDurationMs, replayCount]);

  const handleCompleteImmediately = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setDisplayedLength(text.length);
    setIsTyping(false);
  };

  const handleReplay = (e: React.MouseEvent) => {
    e.stopPropagation();
    setReplayCount((c) => c + 1);
  };

  const visibleText = text.slice(0, displayedLength);

  return (
    <div className="space-y-2">
      {showControlBar && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="inline-flex items-center gap-1.5 font-semibold text-indigo-800">
            <Sparkles
              className={`w-3.5 h-3.5 text-indigo-600 shrink-0 ${
                isTyping ? 'animate-spin' : ''
              }`}
            />
            <span>
              {isTyping
                ? streamingLabel
                : 'AI đã hiển thị đầy đủ nội dung gợi ý'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isTyping ? (
              <button
                type="button"
                onClick={handleCompleteImmediately}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 font-semibold transition-colors cursor-pointer"
                title="Hiển thị toàn bộ nội dung ngay lập tức"
              >
                <FastForward className="w-3 h-3" />
                <span>Hiện toàn bộ</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleReplay}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200 font-medium transition-colors cursor-pointer"
                title="Phát lại hiệu ứng gõ chữ trực tiếp"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Gõ lại</span>
              </button>
            )}
          </div>
        </div>
      )}

      <div className={className}>
        {visibleText}
        {isTyping && (
          <span
            aria-hidden="true"
            className="inline-block w-1.5 h-4 ml-0.5 align-middle bg-indigo-600 animate-pulse rounded-xs"
          />
        )}
      </div>
    </div>
  );
};
