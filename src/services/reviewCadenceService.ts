import { ReadingAttempt, WritingSubmissionRecord } from '../types';

export type ReviewReminderCategory =
  | 'spaced_revision_due'
  | 'section_balance_due'
  | 'periodic_interval_due'
  | 'first_session_nudge';

export interface PeriodicReviewReminder {
  id: string;
  category: ReviewReminderCategory;
  badgeText: string;
  title: string;
  message: string;
  cadenceSummary: string;
  targetAction: 'portfolio_revision' | 'reading' | 'writing';
  actionLabel: string;
  targetRecordTitle?: string;
  priority: 'high' | 'medium' | 'low';
}

export interface StudyFrequencyMetrics {
  totalSessions: number;
  readingCount: number;
  writingCount: number;
  completedRevisionsCount: number;
  pendingRevisionsCount: number;
  revisionRatePct: number | null;
  latestActivityLabel: string;
  estimatedHoursSinceLastPractice: number | null;
  cadenceStatusLabel: string;
  recommendedNextReviewLabel: string;
  activeReminder: PeriodicReviewReminder | null;
}

const SNOOZE_STORAGE_PREFIX = 'vanai12_review_toast_snooze_v1';

interface SnoozeState {
  dismissedReminderIds: string[];
  snoozedUntilMs: number | null;
}

function getStorageKey(studentUid: string): string {
  const safeUid = (studentUid || 'guest_local').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${SNOOZE_STORAGE_PREFIX}:${safeUid}`;
}

export function loadReviewToastSnoozeState(studentUid: string): SnoozeState {
  try {
    const raw = localStorage.getItem(getStorageKey(studentUid));
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        dismissedReminderIds: Array.isArray(parsed.dismissedReminderIds)
          ? parsed.dismissedReminderIds
          : [],
        snoozedUntilMs: typeof parsed.snoozedUntilMs === 'number' ? parsed.snoozedUntilMs : null
      };
    }
  } catch {
    // Ignore storage read errors
  }
  return { dismissedReminderIds: [], snoozedUntilMs: null };
}

export function snoozeReviewReminder(studentUid: string, durationMinutes = 30): void {
  try {
    const current = loadReviewToastSnoozeState(studentUid);
    const updated: SnoozeState = {
      ...current,
      snoozedUntilMs: Date.now() + durationMinutes * 60 * 1000
    };
    localStorage.setItem(getStorageKey(studentUid), JSON.stringify(updated));
  } catch {
    // Ignore storage write errors
  }
}

export function dismissReviewReminderId(studentUid: string, reminderId: string): void {
  try {
    const current = loadReviewToastSnoozeState(studentUid);
    const nextIds = Array.from(new Set([...current.dismissedReminderIds, reminderId]));
    const updated: SnoozeState = {
      ...current,
      dismissedReminderIds: nextIds
    };
    localStorage.setItem(getStorageKey(studentUid), JSON.stringify(updated));
  } catch {
    // Ignore storage write errors
  }
}

export function clearReviewReminderSnooze(studentUid: string): void {
  try {
    localStorage.removeItem(getStorageKey(studentUid));
  } catch {
    // Ignore storage remove errors
  }
}

export type PortfolioSkillFilter = 'all' | 'reading' | 'writing';
export type PortfolioTimeFilter = 'all' | 'week' | 'month';

export interface FilteredPortfolioHistoryResult {
  filteredReadingAttempts: ReadingAttempt[];
  filteredWritingRecords: WritingSubmissionRecord[];
  totalFilteredCount: number;
  countsBySkillForActiveTime: {
    all: number;
    reading: number;
    writing: number;
  };
  countsByTimeForActiveSkill: {
    all: number;
    week: number;
    month: number;
  };
}

/**
 * Phân tích chuỗi thời gian tiếng Việt (ưu tiên định dạng dd/mm/yyyy hoặc dd-mm-yyyy chuẩn Việt Nam)
 */
export function parseVietnameseTimestampToMs(raw: string | undefined): number | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // 1. Ưu tiên mẫu dd/mm/yyyy hoặc dd-mm-yyyy chuẩn tiếng Việt (ví dụ: "14/10/2026, 09:30" hoặc "15/10/2026")
  const vnDateMatch = trimmed.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  const timeMatch = trimmed.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);

  if (vnDateMatch) {
    const day = parseInt(vnDateMatch[1], 10);
    const month = parseInt(vnDateMatch[2], 10) - 1;
    const year = parseInt(vnDateMatch[3], 10);
    const hour = timeMatch ? parseInt(timeMatch[1], 10) : 9;
    const minute = timeMatch ? parseInt(timeMatch[2], 10) : 0;
    const second = timeMatch && timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
    const constructed = new Date(year, month, day, hour, minute, second).getTime();
    if (!Number.isNaN(constructed)) return constructed;
  }

  // 2. Dự phòng chuỗi ISO (yyyy-mm-dd...)
  const direct = Date.parse(trimmed);
  if (!Number.isNaN(direct)) return direct;

  return null;
}

/**
 * Kiểm tra một mốc thời gian bài làm có thuộc khoảng thời gian lọc ('week' = 7 ngày, 'month' = 30 ngày, 'all' = tất cả)
 */
export function isRecordWithinTimeFilter(
  rawTimestamp: string | undefined,
  timeFilter: PortfolioTimeFilter,
  nowMs: number = Date.now()
): boolean {
  if (timeFilter === 'all') return true;
  const parsedMs = parseVietnameseTimestampToMs(rawTimestamp);
  // Nếu bài vừa lưu chỉ có giờ trong phiên hiện tại, tính là trong ngày hôm nay
  if (parsedMs === null) return true;

  const diffMs = Math.max(0, nowMs - parsedMs);
  const maxAgeMs =
    timeFilter === 'week' ? 7 * 24 * 3600 * 1000 : 30 * 24 * 3600 * 1000;
  return diffMs <= maxAgeMs;
}

/**
 * Lọc lịch sử bài luyện trong LearningPortfolio theo loại kỹ năng (Đọc hiểu / Viết / Tất cả)
 * và theo khoảng thời gian (7 ngày qua / 30 ngày qua / Tất cả).
 */
export function filterPortfolioHistoryRecords(
  readingAttempts: ReadingAttempt[],
  writingRecords: WritingSubmissionRecord[],
  skillFilter: PortfolioSkillFilter,
  timeFilter: PortfolioTimeFilter,
  nowMs: number = Date.now()
): FilteredPortfolioHistoryResult {
  const readingInTime = readingAttempts.filter((r) =>
    isRecordWithinTimeFilter(r.timestamp, timeFilter, nowMs)
  );
  const writingInTime = writingRecords.filter((w) =>
    isRecordWithinTimeFilter(w.createdAt, timeFilter, nowMs)
  );

  const filteredReadingAttempts = skillFilter === 'writing' ? [] : readingInTime;
  const filteredWritingRecords = skillFilter === 'reading' ? [] : writingInTime;

  const activeSkillSourceTimestamps: (string | undefined)[] =
    skillFilter === 'reading'
      ? readingAttempts.map((r) => r.timestamp)
      : skillFilter === 'writing'
      ? writingRecords.map((w) => w.createdAt)
      : [
          ...readingAttempts.map((r) => r.timestamp),
          ...writingRecords.map((w) => w.createdAt)
        ];

  const countsByTimeForActiveSkill = {
    all: activeSkillSourceTimestamps.length,
    week: activeSkillSourceTimestamps.filter((ts) =>
      isRecordWithinTimeFilter(ts, 'week', nowMs)
    ).length,
    month: activeSkillSourceTimestamps.filter((ts) =>
      isRecordWithinTimeFilter(ts, 'month', nowMs)
    ).length
  };

  const countsBySkillForActiveTime = {
    all: readingInTime.length + writingInTime.length,
    reading: readingInTime.length,
    writing: writingInTime.length
  };

  return {
    filteredReadingAttempts,
    filteredWritingRecords,
    totalFilteredCount: filteredReadingAttempts.length + filteredWritingRecords.length,
    countsBySkillForActiveTime,
    countsByTimeForActiveSkill
  };
}

/**
 * Phân tích tần suất học tập trong LearningPortfolio và xác định lời nhắc ôn tập định kỳ phù hợp
 */
export function analyzePortfolioStudyCadence(
  readingAttempts: ReadingAttempt[],
  writingRecords: WritingSubmissionRecord[],
  nowMs: number = Date.now()
): StudyFrequencyMetrics {
  const readingCount = readingAttempts.length;
  const writingCount = writingRecords.length;
  const totalSessions = readingCount + writingCount;

  const readingRevisions = readingAttempts.filter(
    (r) => Boolean(r.improvedAnswer && r.improvedAnswer.trim() && r.improvedAnswer.trim() !== r.originalAnswer.trim())
  ).length;
  const writingRevisions = writingRecords.filter((w) => Array.isArray(w.revisions) && w.revisions.length > 0).length;
  const completedRevisionsCount = readingRevisions + writingRevisions;
  const pendingRevisionsCount = Math.max(0, totalSessions - completedRevisionsCount);
  const revisionRatePct =
    totalSessions > 0 ? Math.round((completedRevisionsCount / totalSessions) * 100) : null;

  // Tìm thời điểm hoạt động gần nhất
  const allTimestampsRaw: string[] = [
    ...readingAttempts.map((r) => r.timestamp).filter(Boolean),
    ...writingRecords.map((w) => w.createdAt).filter(Boolean)
  ];

  const latestActivityLabel = allTimestampsRaw[0] || 'Chưa có dữ liệu';

  let latestMs: number | null = null;
  for (const ts of allTimestampsRaw) {
    const parsed = parseVietnameseTimestampToMs(ts);
    if (parsed !== null && (latestMs === null || parsed > latestMs)) {
      latestMs = parsed;
    }
  }

  const estimatedHoursSinceLastPractice =
    latestMs !== null && nowMs >= latestMs
      ? Math.max(0, Math.round(((nowMs - latestMs) / (1000 * 3600)) * 10) / 10)
      : null;

  // Trường hợp chưa có dữ liệu bài làm nào trong LearningPortfolio
  if (totalSessions === 0) {
    return {
      totalSessions: 0,
      readingCount: 0,
      writingCount: 0,
      completedRevisionsCount: 0,
      pendingRevisionsCount: 0,
      revisionRatePct: null,
      latestActivityLabel: 'Chưa có dữ liệu',
      estimatedHoursSinceLastPractice: null,
      cadenceStatusLabel: 'Chưa có nhịp luyện tập',
      recommendedNextReviewLabel: 'Hoàn thành 1 bài Đọc hiểu hoặc Viết để bắt đầu chu kỳ ôn tập',
      activeReminder: null
    };
  }

  // Kiểm tra các bài viết hoặc đọc hiểu có góp ý cần bổ sung nhưng chưa tự chỉnh sửa
  const unrevisedWriting = writingRecords.find(
    (w) =>
      (!w.revisions || w.revisions.length === 0) &&
      w.feedback.criteria.some((c) => c.scoreLevel === 'Cần bổ sung' || c.scoreLevel === 'Đạt cơ bản')
  );

  const unrevisedReading = readingAttempts.find(
    (r) =>
      (!r.improvedAnswer || r.improvedAnswer.trim() === r.originalAnswer.trim()) &&
      r.feedback.missingPoints.length > 0
  );

  // Ưu tiên 1: Nhắc ôn tập ngắt quãng (Spaced Revision) cho bài đã có nhận xét nhưng chưa viết bản tự sửa
  if (unrevisedWriting) {
    const missingCriterion = unrevisedWriting.feedback.criteria.find(
      (c) => c.scoreLevel === 'Cần bổ sung' || c.scoreLevel === 'Đạt cơ bản'
    );
    const reminder: PeriodicReviewReminder = {
      id: `reminder-rev-writing-${unrevisedWriting.id}`,
      category: 'spaced_revision_due',
      badgeText: 'Nhắc ôn tập định kỳ · Tự chỉnh sửa bài viết',
      title: 'Đến lúc hoàn thiện bản sửa cho bài viết gần đây',
      message: `Bạn đã hoàn thành ${totalSessions} lượt luyện tập nhưng bài "${unrevisedWriting.promptTitle}" vẫn chưa có bản tự chỉnh sửa${
        missingCriterion ? ` (cần củng cố: ${missingCriterion.name})` : ''
      }. Dành 5–10 phút ôn lại góp ý và viết lại đoạn chưa đạt sẽ giúp tăng điểm bền vững.`,
      cadenceSummary: `Tần suất tự sửa hiện tại: ${completedRevisionsCount}/${totalSessions} bài (${revisionRatePct}%)`,
      targetAction: 'portfolio_revision',
      actionLabel: 'Xem góp ý & Ôn lại bài viết',
      targetRecordTitle: unrevisedWriting.promptTitle,
      priority: 'high'
    };

    return {
      totalSessions,
      readingCount,
      writingCount,
      completedRevisionsCount,
      pendingRevisionsCount,
      revisionRatePct,
      latestActivityLabel,
      estimatedHoursSinceLastPractice,
      cadenceStatusLabel:
        estimatedHoursSinceLastPractice !== null && estimatedHoursSinceLastPractice > 48
          ? `Đã ${Math.round(estimatedHoursSinceLastPractice / 24)} ngày chưa ôn lại`
          : 'Đang duy trì nhịp học tập',
      recommendedNextReviewLabel: `Ôn tập & tự chỉnh sửa bài "${unrevisedWriting.promptTitle}"`,
      activeReminder: reminder
    };
  }

  if (unrevisedReading) {
    const reminder: PeriodicReviewReminder = {
      id: `reminder-rev-reading-${unrevisedReading.id}`,
      category: 'spaced_revision_due',
      badgeText: 'Nhắc ôn tập định kỳ · Bổ sung ý Đọc hiểu',
      title: 'Ôn lại câu hỏi Đọc hiểu còn thiếu ý khóa',
      message: `Trong ngữ liệu "${unrevisedReading.passageTitle}", câu trả lời của bạn còn ${unrevisedReading.feedback.missingPoints.length} ý cần bổ sung và chưa lưu bản hoàn thiện. Hãy xem lại gợi ý để khắc sâu kỹ năng bám sát văn bản.`,
      cadenceSummary: `Tần suất tự sửa hiện tại: ${completedRevisionsCount}/${totalSessions} bài (${revisionRatePct}%)`,
      targetAction: 'portfolio_revision',
      actionLabel: 'Xem lại câu Đọc hiểu trong Hồ sơ',
      targetRecordTitle: unrevisedReading.passageTitle,
      priority: 'medium'
    };

    return {
      totalSessions,
      readingCount,
      writingCount,
      completedRevisionsCount,
      pendingRevisionsCount,
      revisionRatePct,
      latestActivityLabel,
      estimatedHoursSinceLastPractice,
      cadenceStatusLabel: 'Đang duy trì nhịp học tập',
      recommendedNextReviewLabel: `Hoàn thiện câu trả lời ngữ liệu "${unrevisedReading.passageTitle}"`,
      activeReminder: reminder
    };
  }

  // Ưu tiên 2: Cân bằng tần suất giữa Đọc hiểu và Viết nghị luận
  if (readingCount >= 2 && writingCount === 0) {
    const reminder: PeriodicReviewReminder = {
      id: `reminder-balance-writing-${readingCount}`,
      category: 'section_balance_due',
      badgeText: 'Nhắc cân bằng nhịp ôn tập · Phần Viết (6,0đ)',
      title: 'Bạn đã luyện Đọc hiểu đều đặn — hãy thêm 1 bài Viết nghị luận',
      message: `Hồ sơ ghi nhận ${readingCount} lượt Đọc hiểu nhưng chưa có bài Viết nghị luận nào. Kỳ thi THPT dành tới 6,0/10,0 điểm cho Đoạn văn 200 chữ và Bài văn 600 chữ.`,
      cadenceSummary: `Tần suất hiện tại: ${readingCount} Đọc hiểu · 0 Viết nghị luận`,
      targetAction: 'writing',
      actionLabel: 'Chuyển sang Luyện Viết ngay',
      priority: 'medium'
    };

    return {
      totalSessions,
      readingCount,
      writingCount,
      completedRevisionsCount,
      pendingRevisionsCount,
      revisionRatePct,
      latestActivityLabel,
      estimatedHoursSinceLastPractice,
      cadenceStatusLabel: 'Lệch tần suất sang Đọc hiểu',
      recommendedNextReviewLabel: 'Thực hành 1 đề Đoạn văn 200 chữ hoặc Bài văn 600 chữ',
      activeReminder: reminder
    };
  }

  if (writingCount >= 2 && readingCount === 0) {
    const reminder: PeriodicReviewReminder = {
      id: `reminder-balance-reading-${writingCount}`,
      category: 'section_balance_due',
      badgeText: 'Nhắc cân bằng nhịp ôn tập · Phần Đọc hiểu (4,0đ)',
      title: 'Bổ sung nhịp luyện Đọc hiểu văn bản (4,0 điểm)',
      message: `Bạn đã viết ${writingCount} bài nghị luận nhưng chưa có lượt luyện Đọc hiểu nào trong hồ sơ. Dành 15 phút rèn câu hỏi Nhận biết & Thông hiểu sẽ giúp giữ chắc 4,0 điểm Đọc hiểu.`,
      cadenceSummary: `Tần suất hiện tại: 0 Đọc hiểu · ${writingCount} Viết nghị luận`,
      targetAction: 'reading',
      actionLabel: 'Chuyển sang Luyện Đọc hiểu',
      priority: 'medium'
    };

    return {
      totalSessions,
      readingCount,
      writingCount,
      completedRevisionsCount,
      pendingRevisionsCount,
      revisionRatePct,
      latestActivityLabel,
      estimatedHoursSinceLastPractice,
      cadenceStatusLabel: 'Lệch tần suất sang Viết nghị luận',
      recommendedNextReviewLabel: 'Thực hành 1 ngữ liệu Đọc hiểu (30 phút)',
      activeReminder: reminder
    };
  }

  // Ưu tiên 3: Nhắc ôn tập định kỳ theo khoảng cách thời gian (trên 24 giờ kể từ bài gần nhất hoặc định kỳ sau mỗi 3 bài)
  const isOver24h =
    estimatedHoursSinceLastPractice !== null && estimatedHoursSinceLastPractice >= 24;
  const daysElapsed =
    estimatedHoursSinceLastPractice !== null
      ? Math.max(1, Math.round(estimatedHoursSinceLastPractice / 24))
      : null;

  const reminder: PeriodicReviewReminder = {
    id: `reminder-periodic-${totalSessions}-${isOver24h ? 'time' : 'milestone'}`,
    category: 'periodic_interval_due',
    badgeText: isOver24h
      ? `Nhắc ôn tập định kỳ · ${daysElapsed} ngày từ phiên gần nhất`
      : `Cột mốc ôn tập định kỳ · ${totalSessions} phiên hoàn thành`,
    title: isOver24h
      ? 'Đến kỳ ôn tập định kỳ để duy trì phản xạ làm văn'
      : 'Tổng kết nhanh chu kỳ rèn luyện của bạn',
    message: isOver24h
      ? `Lần luyện tập gần nhất của bạn là lúc ${latestActivityLabel}. Ôn lại nhanh các điểm sáng và lỗi cần tránh trong Hồ sơ học tập trước khi làm đề mới sẽ giúp tránh lặp lại lỗi cũ.`
      : `Bạn đã hoàn thành ${totalSessions} bài luyện (${readingCount} Đọc hiểu, ${writingCount} Viết) với tỷ lệ tự sửa đạt ${revisionRatePct}%. Hãy rà soát lại biểu đồ tiến bộ để chọn kỹ năng cho phiên tiếp theo.`,
    cadenceSummary: `Đã lưu ${totalSessions} phiên · Tự chỉnh sửa ${completedRevisionsCount}/${totalSessions} bài (${revisionRatePct}%)`,
    targetAction: 'portfolio_revision',
    actionLabel: 'Rà soát nhật ký & Biểu đồ tiến bộ',
    priority: 'low'
  };

  return {
    totalSessions,
    readingCount,
    writingCount,
    completedRevisionsCount,
    pendingRevisionsCount,
    revisionRatePct,
    latestActivityLabel,
    estimatedHoursSinceLastPractice,
    cadenceStatusLabel: isOver24h
      ? `Đến hạn ôn tập định kỳ (${daysElapsed} ngày)`
      : `Nhịp học đều (${totalSessions} bài · ${revisionRatePct}% tự sửa)`,
    recommendedNextReviewLabel: 'Ôn lại lỗi thường gặp trước khi bắt đầu đề tiếp theo',
    activeReminder: reminder
  };
}
