import { CompleteExam, ExamSubmission } from '../types';
import { PREBUILT_TEST_SCENARIO_EXAMS } from './examParserEngine';

const LEGACY_EXAMS_KEY = 'vanai12_complete_exams';
const LEGACY_SUBMISSIONS_KEY = 'vanai12_exam_submissions';
const BACKUP_SNAPSHOT_KEY = 'vanai12_legacy_backup_snapshot_v1';
const REAL_EXAMS_KEY = 'vanai12_real_complete_exams_v2';
const REAL_SUBMISSIONS_KEY = 'vanai12_real_exam_submissions_v2';

export interface LegacyMigrationPreview {
  hasLegacyData: boolean;
  customExamsCount: number;
  customExamTitles: string[];
  realSubmissionsCount: number;
  realSubmissionStudents: string[];
  backupExists: boolean;
  backupTimestamp?: string;
}

const PREBUILT_EXAM_IDS = new Set(PREBUILT_TEST_SCENARIO_EXAMS.map((e) => e.id));
const DEMO_SUBMISSION_IDS = new Set(['sub-hs-12a1-19', 'sub-demo-01']);

/**
 * Xem trước dữ liệu cũ có thể chuyển đổi (loại bỏ các kịch bản mẫu/demo)
 */
export function previewLegacyMigration(): LegacyMigrationPreview {
  let customExams: CompleteExam[] = [];
  let realSubmissions: ExamSubmission[] = [];
  let backupExists = false;
  let backupTimestamp: string | undefined;

  try {
    const rawBackup = localStorage.getItem(BACKUP_SNAPSHOT_KEY);
    if (rawBackup) {
      const parsedBackup = JSON.parse(rawBackup);
      backupExists = true;
      backupTimestamp = parsedBackup.backedUpAt;
    }

    const rawExams = localStorage.getItem(LEGACY_EXAMS_KEY);
    if (rawExams) {
      const parsed = JSON.parse(rawExams);
      if (Array.isArray(parsed)) {
        customExams = parsed.filter((e: CompleteExam) => e && e.id && !PREBUILT_EXAM_IDS.has(e.id));
      }
    }

    const rawSubs = localStorage.getItem(LEGACY_SUBMISSIONS_KEY);
    if (rawSubs) {
      const parsed = JSON.parse(rawSubs);
      if (Array.isArray(parsed)) {
        realSubmissions = parsed.filter(
          (s: ExamSubmission) => s && s.id && !DEMO_SUBMISSION_IDS.has(s.id)
        );
      }
    }
  } catch (err) {
    console.warn('Lỗi khi xem trước dữ liệu cũ:', err);
  }

  return {
    hasLegacyData: customExams.length > 0 || realSubmissions.length > 0,
    customExamsCount: customExams.length,
    customExamTitles: customExams.map((e) => e.title),
    realSubmissionsCount: realSubmissions.length,
    realSubmissionStudents: realSubmissions.map((s) => `${s.studentName} (${s.examTitle})`),
    backupExists,
    backupTimestamp
  };
}

/**
 * Sao lưu toàn bộ dữ liệu nguồn trước khi chuyển đổi
 */
export function createLegacyBackupSnapshot(): { success: boolean; timestamp: string; error?: string } {
  const timestamp = new Date().toISOString();
  try {
    const snapshot = {
      backedUpAt: timestamp,
      legacyExamsRaw: localStorage.getItem(LEGACY_EXAMS_KEY),
      legacySubmissionsRaw: localStorage.getItem(LEGACY_SUBMISSIONS_KEY)
    };
    localStorage.setItem(BACKUP_SNAPSHOT_KEY, JSON.stringify(snapshot));
    return { success: true, timestamp };
  } catch (err: any) {
    return {
      success: false,
      timestamp,
      error: err.message || 'Không thể tạo bản sao lưu dữ liệu cũ.'
    };
  }
}

/**
 * Thực thi chuyển đổi an toàn:
 * 1. Sao lưu trước vào vanai12_legacy_backup_snapshot_v1.
 * 2. Chỉ chuyển các đề thi và bài nộp thật (không chuyển kịch bản kiểm thử).
 * 3. Kiểm tra ghi thành công mới hoàn tất; tuyệt đối KHÔNG xóa dữ liệu nguồn nếu có bất kỳ lỗi nào.
 */
export function executeSafeLegacyMigration(): {
  success: boolean;
  migratedExams: number;
  migratedSubmissions: number;
  backupKey: string;
  message: string;
} {
  const backup = createLegacyBackupSnapshot();
  if (!backup.success) {
    return {
      success: false,
      migratedExams: 0,
      migratedSubmissions: 0,
      backupKey: BACKUP_SNAPSHOT_KEY,
      message: `Hủy chuyển đổi vì không tạo được bản sao lưu: ${backup.error}. Dữ liệu nguồn được giữ nguyên.`
    };
  }

  try {
    let migratedExams = 0;
    let migratedSubmissions = 0;

    // 1. Chuyển đề thi do giáo viên tự tải lên
    const rawLegacyExams = localStorage.getItem(LEGACY_EXAMS_KEY);
    if (rawLegacyExams) {
      const parsedLegacy = JSON.parse(rawLegacyExams);
      if (Array.isArray(parsedLegacy)) {
        const customOnly = parsedLegacy.filter(
          (e: CompleteExam) => e && e.id && !PREBUILT_EXAM_IDS.has(e.id)
        );
        if (customOnly.length > 0) {
          const existingRealRaw = localStorage.getItem(REAL_EXAMS_KEY);
          const existingReal: CompleteExam[] = existingRealRaw ? JSON.parse(existingRealRaw) : [];
          const existingIds = new Set(existingReal.map((e) => e.id));
          const merged = [
            ...customOnly.filter((e) => !existingIds.has(e.id)),
            ...existingReal
          ];
          localStorage.setItem(REAL_EXAMS_KEY, JSON.stringify(merged));
          // Verify write
          const verify = localStorage.getItem(REAL_EXAMS_KEY);
          if (!verify) throw new Error('Kiểm tra ghi đề thi sau chuyển đổi thất bại.');
          migratedExams = customOnly.length;
        }
      }
    }

    // 2. Chuyển bài nộp thật của học sinh
    const rawLegacySubs = localStorage.getItem(LEGACY_SUBMISSIONS_KEY);
    if (rawLegacySubs) {
      const parsedSubs = JSON.parse(rawLegacySubs);
      if (Array.isArray(parsedSubs)) {
        const realOnly = parsedSubs.filter(
          (s: ExamSubmission) => s && s.id && !DEMO_SUBMISSION_IDS.has(s.id)
        );
        if (realOnly.length > 0) {
          const existingSubsRaw = localStorage.getItem(REAL_SUBMISSIONS_KEY);
          const existingSubs: ExamSubmission[] = existingSubsRaw ? JSON.parse(existingSubsRaw) : [];
          const existingIds = new Set(existingSubs.map((s) => s.id));
          const mergedSubs = [
            ...realOnly.filter((s) => !existingIds.has(s.id)),
            ...existingSubs
          ];
          localStorage.setItem(REAL_SUBMISSIONS_KEY, JSON.stringify(mergedSubs));
          const verifySubs = localStorage.getItem(REAL_SUBMISSIONS_KEY);
          if (!verifySubs) throw new Error('Kiểm tra ghi bài nộp sau chuyển đổi thất bại.');
          migratedSubmissions = realOnly.length;
        }
      }
    }

    return {
      success: true,
      migratedExams,
      migratedSubmissions,
      backupKey: BACKUP_SNAPSHOT_KEY,
      message: `Đã sao lưu vào "${BACKUP_SNAPSHOT_KEY}" và chuyển thành công ${migratedExams} đề thi, ${migratedSubmissions} bài nộp thật. Dữ liệu nguồn vẫn được bảo toàn.`
    };
  } catch (err: any) {
    return {
      success: false,
      migratedExams: 0,
      migratedSubmissions: 0,
      backupKey: BACKUP_SNAPSHOT_KEY,
      message: `Chuyển đổi thất bại (${err.message}). Dữ liệu nguồn và bản sao lưu được giữ nguyên an toàn.`
    };
  }
}
