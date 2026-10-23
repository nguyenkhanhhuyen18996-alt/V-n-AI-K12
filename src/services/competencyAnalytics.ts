import {
  StudentSurveyData,
  ReadingAttempt,
  WritingSubmissionRecord,
  SkillKey,
  SkillGapItem,
  StudentSurveyProgressStatus
} from '../types';
import { HIGH_SCHOOL_SKILLS_CATALOG } from '../data/skillsCatalog';

export interface CompetencyAnalyticsSummary {
  // Trạng thái khảo sát & tiến độ
  surveyProgressStatus: StudentSurveyProgressStatus; // 'not_surveyed' | 'quick_surveyed' | 'actual_data_ready'
  hasSufficientData: boolean;
  totalSubmissionsCount: number;
  teacherApprovedCount: number;
  pendingApprovalCount: number;

  // Điểm thực tế chính thức (CHỈ tính từ điểm giáo viên đã xác nhận duyệt, tuyệt đối KHÔNG trộn điểm gợi ý)
  actualReadingScore: number | null; // Thang 4.0
  actualParagraphScore: number | null; // Thang 2.0
  actualEssayScore: number | null; // Thang 4.0
  actualOverallScore: number | null; // Thang 10.0 (Chỉ tính từ bài đã được Giáo viên duyệt)

  // Điểm gợi ý / AI đề xuất sơ bộ (Chỉ dùng tham khảo riêng biệt, không tính vào điểm chính thức)
  provisionalSuggestedOverall: number | null;
  suggestedOverallScore: number | null;

  // Chi tiết điểm chính thức theo rubric chuẩn THPT (Đã được giáo viên duyệt)
  rubricScores: {
    reading: number | null; // Thang 4.0
    paragraph: number | null; // Thang 2.0
    essay: number | null; // Thang 4.0
  };

  // Sơ đồ kết quả và mức độ đạt cho 3 phần trên trang chủ học sinh (Yêu cầu 3)
  sectionProgress: {
    reading: SectionProgressDetail;
    paragraph: SectionProgressDetail;
    essay: SectionProgressDetail;
  };

  // Điểm tự khai (chỉ dùng tham khảo ban đầu)
  selfReportedLatestScore: number | null;
  targetScore: number;

  // Điểm mạnh & Điểm cần ưu tiên rèn luyện
  topStrengths: string[];
  prioritySkillsToImprove: {
    key: SkillKey;
    label: string;
    reason: string;
    urgency: 'high' | 'medium';
    sourceType: 'actual_submission' | 'quick_survey' | 'diagnostic_initial';
  }[];

  // Lỗi lặp lại qua nhiều bài
  recurringMistakes: {
    title: string;
    frequency: string;
    description: string;
    actionAdvice: string;
  }[];

  // Ma trận đối chiếu (Gap Analysis)
  gapAnalysisList: SkillGapItem[];

  // Xu hướng tiến bộ
  progressTrend: 'improving' | 'stable' | 'needs_attention' | 'insufficient_data';
  progressSummaryText: string;
}

export type MasteryTierCode = 'no_data' | 'trung_binh' | 'kha' | 'tot';

export interface SectionMasteryIndicator {
  section: 'reading' | 'paragraph_200w' | 'essay_600w';
  maxScore: 4.0 | 2.0;
  rawScore: number | null; // Không làm tròn để đẩy học sinh sang mức cao hơn
  formattedRawScore: string; // Ví dụ: "2,8/4,0 điểm" hoặc "Chưa có dữ liệu"
  tier: MasteryTierCode;
  tierLabel: 'Chưa có dữ liệu' | 'Trung bình / cần củng cố' | 'Khá' | 'Tốt';
  convertedPercentage: number | null; // 0-59%, 60-79%, 80-100% (quy đổi tuyến tính theo mức tiến bộ)
  colorState: 'neutral' | 'coral' | 'amber' | 'emerald';
}

export interface SectionProgressDetail {
  section: 'reading' | 'paragraph_200w' | 'essay_600w';
  sectionTitle: string;
  maxScore: 4.0 | 2.0;
  // Kết quả chính thức (CHỈ dùng điểm Giáo viên đã duyệt)
  officialMastery: SectionMasteryIndicator;
  approvedCount: number;
  approvedTimeInfo: string | null;
  // Điểm AI tham khảo (tách riêng, hiển thị nhãn "Điểm AI tham khảo — chờ giáo viên duyệt")
  aiReferenceMastery: SectionMasteryIndicator;
  aiReferenceCount: number;
  aiReferenceTimeInfo: string | null;
  aiReferenceLabel: string;
  // Điểm tự khai ban đầu (tách riêng)
  selfReportedScore: number | null;
}

export function formatScoreVN(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(Number(val))) {
    return '0,0';
  }
  const num = Number(val);
  const sign = num < 0 ? '-' : '';
  const absVal = Math.abs(num);
  const truncated = Math.floor((absVal + 1e-9) * 100) / 100;
  const isOneDec = Math.abs(truncated * 10 - Math.round(truncated * 10)) < 1e-6;
  return sign + (isOneDec ? truncated.toFixed(1) : truncated.toFixed(2)).replace('.', ',');
}

/**
 * Tính mức xếp loại và phần trăm quy đổi tuyến tính theo đúng bảng ngưỡng (Yêu cầu 3):
 * - Đọc hiểu (/4,0) & Bài văn (/4,0): [0..2,0] -> Trung bình/cần củng cố (0-59%); (2,0..3,0] -> Khá (60-79%); (3,0..4,0] -> Tốt (80-100%)
 * - Đoạn văn (/2,0): [0..1,0] -> Trung bình/cần củng cố (0-59%); (1,0..1,5] -> Khá (60-79%); (1,5..2,0] -> Tốt (80-100%)
 * Không làm tròn điểm gốc để đẩy học sinh sang mức cao hơn.
 */
export function computeSectionMasteryIndicator(
  section: 'reading' | 'paragraph_200w' | 'essay_600w',
  rawScore: number | null | undefined
): SectionMasteryIndicator {
  const maxScore: 4.0 | 2.0 = section === 'paragraph_200w' ? 2.0 : 4.0;
  const maxLabel = maxScore === 2.0 ? '2,0' : '4,0';

  if (rawScore === null || rawScore === undefined || !Number.isFinite(Number(rawScore))) {
    return {
      section,
      maxScore,
      rawScore: null,
      formattedRawScore: 'Chưa có dữ liệu',
      tier: 'no_data',
      tierLabel: 'Chưa có dữ liệu',
      convertedPercentage: null,
      colorState: 'neutral'
    };
  }

  // Giữ điểm gốc (kẹp trong [0, maxScore], cắt 2 chữ số thập phân mà không làm tròn đẩy bậc)
  const clamped = Math.max(0, Math.min(maxScore, Math.floor((Number(rawScore) + 1e-9) * 100) / 100));
  const formattedRawScore = `${formatScoreVN(clamped)}/${maxLabel} điểm`;

  const t1 = maxScore === 2.0 ? 1.0 : 2.0;
  const t2 = maxScore === 2.0 ? 1.5 : 3.0;

  if (clamped <= t1) {
    // Mức 1: Trung bình / cần củng cố (0 -> t1 tương ứng 0% -> 59%)
    const pct = Math.min(59, Math.max(0, Math.floor((clamped / t1) * 59 + 1e-9)));
    return {
      section,
      maxScore,
      rawScore: clamped,
      formattedRawScore,
      tier: 'trung_binh',
      tierLabel: 'Trung bình / cần củng cố',
      convertedPercentage: pct,
      colorState: 'coral'
    };
  }

  if (clamped <= t2) {
    // Mức 2: Khá (trên t1 -> t2 tương ứng 60% -> 79%)
    const span = t2 - t1;
    const pct = Math.min(79, Math.max(60, Math.floor(60 + ((clamped - t1) / span) * 19 + 1e-9)));
    return {
      section,
      maxScore,
      rawScore: clamped,
      formattedRawScore,
      tier: 'kha',
      tierLabel: 'Khá',
      convertedPercentage: pct,
      colorState: 'amber'
    };
  }

  // Mức 3: Tốt (trên t2 -> maxScore tương ứng 80% -> 100%)
  const span = maxScore - t2;
  const pct = Math.min(100, Math.max(80, Math.floor(80 + ((clamped - t2) / span) * 20 + 1e-9)));
  return {
    section,
    maxScore,
    rawScore: clamped,
    formattedRawScore,
    tier: 'tot',
    tierLabel: 'Tốt',
    convertedPercentage: pct,
    colorState: 'emerald'
  };
}

function summarizeTimeRange(timestamps: string[]): string | null {
  const valid = timestamps.map((t) => String(t || '').trim()).filter(Boolean);
  if (valid.length === 0) return null;
  if (valid.length === 1) return `Ghi nhận lúc ${valid[0]}`;
  return `Từ ${valid[valid.length - 1]} đến ${valid[0]}`;
}

export function isParagraph200wRecord(w: WritingSubmissionRecord): boolean {
  if (w.sectionType === 'paragraph_200w') return true;
  if (w.sectionType === 'essay_600w') return false;
  if (typeof w.maxScore === 'number') return w.maxScore <= 2.5;
  return w.type === 'nghi_luan_xa_hoi';
}

export function isEssay600wRecord(w: WritingSubmissionRecord): boolean {
  if (w.sectionType === 'essay_600w') return true;
  if (w.sectionType === 'paragraph_200w') return false;
  if (typeof w.maxScore === 'number') return w.maxScore > 2.5;
  return w.type === 'nghi_luan_van_hoc';
}

export function analyzeStudentCompetency(
  survey: StudentSurveyData,
  readingAttempts: ReadingAttempt[],
  writingRecords: WritingSubmissionRecord[]
): CompetencyAnalyticsSummary {
  const totalSubmissions = readingAttempts.length + writingRecords.length;
  const hasSufficientData = totalSubmissions >= 2;

  // YÊU CẦU 2 & 3: Chỉ đưa điểm Giáo viên đã duyệt (teacherConfirmedScore) vào thống kê chính thức & hồ sơ năng lực.
  // Tuyệt đối KHÔNG đưa điểm gợi ý theo quy tắc hoặc điểm AI chưa duyệt thành điểm chính thức, không làm tròn đẩy bậc.
  let readingSum = 0;
  let readingCount = 0;
  const readingApprovedTimes: string[] = [];
  let suggestedReadingSum = 0;
  let suggestedReadingCount = 0;
  const readingAiTimes: string[] = [];

  readingAttempts.forEach((att) => {
    if (typeof att.feedback.teacherConfirmedScore === 'number') {
      readingSum += att.feedback.teacherConfirmedScore;
      readingCount++;
      if (att.feedback.confirmedAt || att.timestamp) {
        readingApprovedTimes.push(att.feedback.confirmedAt || att.timestamp);
      }
    } else if (typeof att.feedback.aiSuggestedScore === 'number') {
      suggestedReadingSum += att.feedback.aiSuggestedScore;
      suggestedReadingCount++;
      if (att.timestamp) readingAiTimes.push(att.timestamp);
    }
  });
  const actualReadingScore =
    readingCount > 0 ? Math.floor(((readingSum / readingCount) + 1e-9) * 100) / 100 : null;
  const suggestedReadingAvg =
    suggestedReadingCount > 0
      ? Math.floor(((suggestedReadingSum / suggestedReadingCount) + 1e-9) * 100) / 100
      : null;

  // Điểm đoạn văn 200 chữ (Thang 2,0 — gồm cả 2.1 NLXH và 2.2 NLVH) — Chỉ tính bài giáo viên đã duyệt
  const paragraphRecords = writingRecords.filter(isParagraph200wRecord);
  let paragraphSum = 0;
  let paragraphCount = 0;
  const paragraphApprovedTimes: string[] = [];
  let suggestedParagraphSum = 0;
  let suggestedParagraphCount = 0;
  const paragraphAiTimes: string[] = [];

  paragraphRecords.forEach((w) => {
    if (typeof w.feedback.teacherConfirmedScore === 'number') {
      paragraphSum += w.feedback.teacherConfirmedScore;
      paragraphCount++;
      if (w.feedback.confirmedAt || w.createdAt) {
        paragraphApprovedTimes.push(w.feedback.confirmedAt || w.createdAt);
      }
    } else if (typeof w.feedback.aiSuggestedScore === 'number') {
      suggestedParagraphSum += w.feedback.aiSuggestedScore;
      suggestedParagraphCount++;
      if (w.createdAt) paragraphAiTimes.push(w.createdAt);
    }
  });
  const actualParagraphScore =
    paragraphCount > 0 ? Math.floor(((paragraphSum / paragraphCount) + 1e-9) * 100) / 100 : null;
  const suggestedParagraphAvg =
    suggestedParagraphCount > 0
      ? Math.floor(((suggestedParagraphSum / suggestedParagraphCount) + 1e-9) * 100) / 100
      : null;

  // Điểm bài văn 600 chữ (Thang 4,0 — gồm cả 2.1 NLXH và 2.2 NLVH) — Chỉ tính bài giáo viên đã duyệt
  const essayRecords = writingRecords.filter(isEssay600wRecord);
  let essaySum = 0;
  let essayCount = 0;
  const essayApprovedTimes: string[] = [];
  let suggestedEssaySum = 0;
  let suggestedEssayCount = 0;
  const essayAiTimes: string[] = [];

  essayRecords.forEach((w) => {
    if (typeof w.feedback.teacherConfirmedScore === 'number') {
      essaySum += w.feedback.teacherConfirmedScore;
      essayCount++;
      if (w.feedback.confirmedAt || w.createdAt) {
        essayApprovedTimes.push(w.feedback.confirmedAt || w.createdAt);
      }
    } else if (typeof w.feedback.aiSuggestedScore === 'number') {
      suggestedEssaySum += w.feedback.aiSuggestedScore;
      suggestedEssayCount++;
      if (w.createdAt) essayAiTimes.push(w.createdAt);
    }
  });
  const actualEssayScore =
    essayCount > 0 ? Math.floor(((essaySum / essayCount) + 1e-9) * 100) / 100 : null;
  const suggestedEssayAvg =
    suggestedEssayCount > 0
      ? Math.floor(((suggestedEssaySum / suggestedEssayCount) + 1e-9) * 100) / 100
      : null;

  const teacherApprovedCount = readingCount + paragraphCount + essayCount;
  const pendingApprovalCount = Math.max(0, totalSubmissions - teacherApprovedCount);

  // Tổng hợp điểm thực tế chính thức thang 10.0 (CHỈ tính từ bài đã được Giáo viên duyệt)
  let actualOverallScore: number | null = null;
  if (actualReadingScore !== null || actualParagraphScore !== null || actualEssayScore !== null) {
    let totalMaxAvailable = 0;
    let actualEarned = 0;
    if (actualReadingScore !== null) {
      totalMaxAvailable += 4.0;
      actualEarned += actualReadingScore;
    }
    if (actualParagraphScore !== null) {
      totalMaxAvailable += 2.0;
      actualEarned += actualParagraphScore;
    }
    if (actualEssayScore !== null) {
      totalMaxAvailable += 4.0;
      actualEarned += actualEssayScore;
    }
    if (totalMaxAvailable > 0) {
      actualOverallScore = Number(((actualEarned / totalMaxAvailable) * 10).toFixed(2));
    }
  }

  // Điểm AI đề xuất sơ bộ (tách riêng, không gộp vào actualOverallScore)
  let provisionalSuggestedOverall: number | null = null;
  if (suggestedReadingCount > 0 || suggestedParagraphCount > 0 || suggestedEssayCount > 0) {
    let maxAvail = 0;
    let earned = 0;
    if (suggestedReadingCount > 0) {
      maxAvail += 4.0;
      earned += suggestedReadingSum / suggestedReadingCount;
    }
    if (suggestedParagraphCount > 0) {
      maxAvail += 2.0;
      earned += suggestedParagraphSum / suggestedParagraphCount;
    }
    if (suggestedEssayCount > 0) {
      maxAvail += 4.0;
      earned += suggestedEssaySum / suggestedEssayCount;
    }
    if (maxAvail > 0) {
      provisionalSuggestedOverall = Number(((earned / maxAvail) * 10).toFixed(2));
    }
  }

  const sectionProgress: CompetencyAnalyticsSummary['sectionProgress'] = {
    reading: {
      section: 'reading',
      sectionTitle: 'Đọc hiểu văn bản',
      maxScore: 4.0,
      officialMastery: computeSectionMasteryIndicator('reading', actualReadingScore),
      approvedCount: readingCount,
      approvedTimeInfo: summarizeTimeRange(readingApprovedTimes),
      aiReferenceMastery: computeSectionMasteryIndicator('reading', suggestedReadingAvg),
      aiReferenceCount: suggestedReadingCount,
      aiReferenceTimeInfo: summarizeTimeRange(readingAiTimes),
      aiReferenceLabel: 'Điểm AI tham khảo — chờ giáo viên duyệt',
      selfReportedScore: survey.selfReportedReadingScore ?? null
    },
    paragraph: {
      section: 'paragraph_200w',
      sectionTitle: 'Đoạn văn khoảng 200 chữ',
      maxScore: 2.0,
      officialMastery: computeSectionMasteryIndicator('paragraph_200w', actualParagraphScore),
      approvedCount: paragraphCount,
      approvedTimeInfo: summarizeTimeRange(paragraphApprovedTimes),
      aiReferenceMastery: computeSectionMasteryIndicator('paragraph_200w', suggestedParagraphAvg),
      aiReferenceCount: suggestedParagraphCount,
      aiReferenceTimeInfo: summarizeTimeRange(paragraphAiTimes),
      aiReferenceLabel: 'Điểm AI tham khảo — chờ giáo viên duyệt',
      selfReportedScore: survey.selfReportedParagraphScore ?? null
    },
    essay: {
      section: 'essay_600w',
      sectionTitle: 'Bài văn khoảng 600 chữ',
      maxScore: 4.0,
      officialMastery: computeSectionMasteryIndicator('essay_600w', actualEssayScore),
      approvedCount: essayCount,
      approvedTimeInfo: summarizeTimeRange(essayApprovedTimes),
      aiReferenceMastery: computeSectionMasteryIndicator('essay_600w', suggestedEssayAvg),
      aiReferenceCount: suggestedEssayCount,
      aiReferenceTimeInfo: summarizeTimeRange(essayAiTimes),
      aiReferenceLabel: 'Điểm AI tham khảo — chờ giáo viên duyệt',
      selfReportedScore: survey.selfReportedEssayScore ?? null
    }
  };

  // Xác định rõ ràng 3 trạng thái khảo sát & bài làm
  const surveyProgressStatus: StudentSurveyProgressStatus =
    totalSubmissions > 0
      ? 'actual_data_ready'
      : survey.isCompleted
      ? 'quick_surveyed'
      : 'not_surveyed';

  // 2. Phát hiện lỗi lặp lại qua nhiều bài
  const recurringMistakes: CompetencyAnalyticsSummary['recurringMistakes'] = [];

  // Lỗi tách đoạn trong đoạn văn 200 chữ
  const splitParagraphCount = paragraphRecords.filter((w) => w.feedback.paragraphCount > 1).length;
  if (splitParagraphCount >= 1) {
    recurringMistakes.push({
      title: 'Tách đoạn sai thể thức trong đoạn văn 200 chữ',
      frequency: `${splitParagraphCount}/${paragraphRecords.length} bài`,
      description: 'Quy chế chấm thi THPT trừ 0.25 điểm nếu học sinh xuống dòng ngắt đoạn trong bài NLXH 200 chữ.',
      actionAdvice: 'Tuyệt đối chỉ viết 1 đoạn văn duy nhất từ đầu đến cuối bài, chỉ chấm xuống dòng ở câu kết thúc.'
    });
  }

  // Lỗi thiếu dẫn chứng
  const missingEvidenceCount = writingRecords.filter((w) =>
    w.feedback.criteria.some((c) => c.name.includes('Dẫn chứng') && c.scoreLevel === 'Cần bổ sung')
  ).length;
  if (missingEvidenceCount >= 1) {
    recurringMistakes.push({
      title: 'Thiếu dẫn chứng thực tế sống động',
      frequency: `${missingEvidenceCount}/${writingRecords.length} bài`,
      description: 'Bài viết chỉ dừng lại ở lý lẽ chung chung, thiếu người thật việc thật hoặc chi tiết nghệ thuật đắt giá.',
      actionAdvice: 'Chuẩn bị sẵn ngân hàng 5-7 tấm gương thời đại (tự học, kiên trì, tử tế, cống hiến) kèm câu bình sâu sắc.'
    });
  }

  // Lỗi không bám sát ngữ liệu đọc hiểu
  const offTextReadingCount = readingAttempts.filter((a) =>
    a.feedback.missingPoints.some((m) => m.toLowerCase().includes('không có trong') || m.toLowerCase().includes('chưa bám sát'))
  ).length;
  if (offTextReadingCount >= 1) {
    recurringMistakes.push({
      title: 'Chưa bám sát câu chữ trong ngữ liệu đọc hiểu',
      frequency: `${offTextReadingCount}/${readingAttempts.length} bài`,
      description: 'Tự đưa suy nghĩ cá nhân hoặc diễn giải tùy tiện vào câu hỏi nhận biết thay vì trích dẫn nguyên văn từ ngữ tác giả.',
      actionAdvice: 'Với câu nhận biết: Tìm chính xác câu văn chứa thông tin trong đoạn trích và trích dẫn trực tiếp.'
    });
  }

  // 3. Xây dựng Ma trận đối chiếu (Gap Analysis) cho 10 kĩ năng
  const gapAnalysisList: SkillGapItem[] = HIGH_SCHOOL_SKILLS_CATALOG.map((skill) => {
    const selfConf = survey.skillConfidence[skill.key] || 3;

    if (!hasSufficientData) {
      return {
        skillKey: skill.key,
        skillName: skill.label,
        category: skill.category,
        selfConfidenceScore: selfConf,
        actualPerformanceLevel: 'Chưa đủ dữ liệu',
        gapStatus: 'needs_more_data',
        gapExplanation: 'Chưa có đủ bài làm thực tế để đối chiếu chính xác. Hiện căn cứ chủ yếu vào mức tự đánh giá.',
        actionRecommendation: 'Thực hiện 1-2 bài luyện để hệ thống ghi nhận năng lực thực tế.'
      };
    }

    // Đánh giá hiệu suất thực tế của kỹ năng dựa vào bài làm
    let actualLevel: SkillGapItem['actualPerformanceLevel'] = 'Đạt yêu cầu';
    let hasExplicitWeakness = false;
    let hasExplicitStrength = false;

    if (skill.key === 'writing_evidence_analysis') {
      const weakEv = writingRecords.some((w) =>
        w.feedback.criteria.some((c) => c.name.includes('Dẫn chứng') && c.scoreLevel === 'Cần bổ sung')
      );
      if (weakEv) {
        actualLevel = 'Cần rèn luyện';
        hasExplicitWeakness = true;
      } else if (writingRecords.length > 0) {
        actualLevel = 'Tốt';
        hasExplicitStrength = true;
      }
    } else if (skill.key === 'writing_paragraph_200w') {
      const splitWrong = paragraphRecords.some((w) => w.feedback.paragraphCount > 1);
      if (splitWrong) {
        actualLevel = 'Cần rèn luyện';
        hasExplicitWeakness = true;
      } else if (paragraphRecords.length > 0) {
        actualLevel = 'Tốt';
        hasExplicitStrength = true;
      }
    } else if (skill.key === 'reading_main_idea' || skill.key === 'writing_reading_answer') {
      const lowReading = readingAttempts.some(
        (a) =>
          (typeof a.feedback.teacherConfirmedScore === 'number' && a.feedback.teacherConfirmedScore < 2.5) ||
          a.feedback.missingPoints.length >= 2
      );
      if (lowReading) {
        actualLevel = 'Cần rèn luyện';
        hasExplicitWeakness = true;
      } else if (readingAttempts.length > 0) {
        actualLevel = 'Tốt';
        hasExplicitStrength = true;
      }
    } else {
      // Các kĩ năng khác
      if (actualOverallScore && actualOverallScore >= 8.0) {
        actualLevel = 'Tốt';
        hasExplicitStrength = true;
      } else if (actualOverallScore && actualOverallScore <= 6.0) {
        actualLevel = 'Cần rèn luyện';
        hasExplicitWeakness = true;
      } else {
        actualLevel = 'Khá';
      }
    }

    // Phân loại Gap Status
    let gapStatus: SkillGapItem['gapStatus'] = 'aligned_strength';
    let gapExplanation = '';
    let actionRecommendation = '';

    if (hasExplicitWeakness && selfConf <= 2) {
      gapStatus = 'acknowledged_weakness';
      gapExplanation = 'Học sinh nhận thức rõ mình còn gặp khó khăn ở kĩ năng này và bài làm thực tế cũng phản ánh điều đó.';
      actionRecommendation = 'Ưu tiên xếp bài tập củng cố kĩ năng này ở mức độ cơ bản trước khi tăng dần độ khó.';
    } else if (hasExplicitWeakness && selfConf >= 4) {
      gapStatus = 'overconfident_risk';
      gapExplanation = 'Học sinh tự tin cao (4-5/5) nhưng bài làm thực tế thường xuyên mắc lỗi hoặc bị trừ điểm.';
      actionRecommendation = 'Cần chỉ rõ các lỗi cụ thể trong rubric để học sinh khắc phục tâm lý chủ quan.';
    } else if (hasExplicitStrength && selfConf <= 2) {
      gapStatus = 'underconfident_strength';
      gapExplanation = 'Bài làm thực tế đạt kết quả tốt nhưng học sinh vẫn đánh giá thấp năng lực của bản thân.';
      actionRecommendation = 'Động viên, khích lệ để học sinh tự tin phát huy thế mạnh trong bài thi.';
    } else if (hasExplicitStrength && selfConf >= 4) {
      gapStatus = 'aligned_strength';
      gapExplanation = 'Tự tin cao và kết quả bài làm thực tế đạt mức tốt, phong độ ổn định.';
      actionRecommendation = 'Thử sức với các đề bài vận dụng cao và dạng đề phân hóa 9+.';
    } else {
      gapStatus = 'needs_more_data';
      gapExplanation = 'Kĩ năng ở mức khá hoặc chưa có đủ biến số để kết luận sâu.';
      actionRecommendation = 'Tiếp tục duy trì rèn luyện đều đặn.';
    }

    return {
      skillKey: skill.key,
      skillName: skill.label,
      category: skill.category,
      selfConfidenceScore: selfConf,
      actualPerformanceLevel: actualLevel,
      gapStatus,
      gapExplanation,
      actionRecommendation
    };
  });

  // 4. Xác định Điểm mạnh & 2-3 Kỹ năng ưu tiên
  const topStrengths: string[] = [];
  const prioritySkillsToImprove: CompetencyAnalyticsSummary['prioritySkillsToImprove'] = [];

  // ƯU TIÊN SỐ 1: Căn cứ vào lỗi và điểm yếu từ bài làm thực tế
  gapAnalysisList.forEach((gap) => {
    if (gap.gapStatus === 'acknowledged_weakness' || gap.gapStatus === 'overconfident_risk') {
      prioritySkillsToImprove.push({
        key: gap.skillKey,
        label: gap.skillName,
        reason: gap.gapExplanation,
        urgency: gap.gapStatus === 'overconfident_risk' ? 'high' : 'medium',
        sourceType: 'actual_submission'
      });
    } else if (gap.gapStatus === 'aligned_strength' || gap.gapStatus === 'underconfident_strength') {
      topStrengths.push(gap.skillName);
    }
  });

  // ƯU TIÊN SỐ 2: Nếu chưa có bài làm, căn cứ vào lựa chọn trong Khảo sát nhanh
  if (prioritySkillsToImprove.length === 0) {
    if (survey.quickFocusArea === 'reading') {
      prioritySkillsToImprove.push({
        key: 'reading_main_idea',
        label: 'Đọc hiểu thông tin, xác định nội dung và chi tiết quan trọng',
        reason: 'Căn cứ khảo sát nhanh: Bạn chọn muốn tập trung cải thiện trước hết phần Đọc hiểu (thang 4,0đ).',
        urgency: 'medium',
        sourceType: 'quick_survey'
      });
    } else if (survey.quickFocusArea === 'paragraph_200w') {
      prioritySkillsToImprove.push({
        key: 'writing_paragraph_200w',
        label: 'Viết đoạn văn nghị luận xã hội khoảng 200 chữ chuẩn quy cách',
        reason: 'Căn cứ khảo sát nhanh: Bạn chọn muốn tập trung cải thiện đoạn văn NLXH 200 chữ (thang 2,0đ).',
        urgency: 'medium',
        sourceType: 'quick_survey'
      });
    } else if (survey.quickFocusArea === 'essay_600w') {
      prioritySkillsToImprove.push({
        key: 'writing_essay_600w',
        label: 'Viết bài văn nghị luận khoảng 600 chữ (Nghị luận văn học)',
        reason: 'Căn cứ khảo sát nhanh: Bạn chọn muốn rèn luyện bài văn NLVH khoảng 600 chữ (thang 4,0đ).',
        urgency: 'medium',
        sourceType: 'quick_survey'
      });
    } else if (survey.prioritySkillToImprove) {
      const surveyPriority = HIGH_SCHOOL_SKILLS_CATALOG.find((s) => s.key === survey.prioritySkillToImprove);
      if (surveyPriority) {
        prioritySkillsToImprove.push({
          key: surveyPriority.key,
          label: surveyPriority.label,
          reason: 'Căn cứ đăng ký nguyện vọng trong bản khảo sát năng lực ban đầu.',
          urgency: 'medium',
          sourceType: 'quick_survey'
        });
      }
    } else {
      // ƯU TIÊN SỐ 3: Học sinh chưa khảo sát -> Bài luyện chuẩn đoán khởi đầu
      prioritySkillsToImprove.push({
        key: 'reading_main_idea',
        label: 'Đọc hiểu thông tin, xác định nội dung và chi tiết quan trọng',
        reason: 'Bài luyện khởi đầu chuẩn đoán: Rèn luyện bám sát ngữ liệu văn bản gốc.',
        urgency: 'medium',
        sourceType: 'diagnostic_initial'
      });
      prioritySkillsToImprove.push({
        key: 'writing_paragraph_200w',
        label: 'Viết đoạn văn nghị luận xã hội khoảng 200 chữ chuẩn quy cách',
        reason: 'Bài luyện chuẩn đoán thể thức: Chuẩn hóa 1 đoạn duy nhất 180-250 từ.',
        urgency: 'medium',
        sourceType: 'diagnostic_initial'
      });
    }
  }

  // Điểm mạnh mặc định nếu dữ liệu ít
  if (topStrengths.length === 0) {
    topStrengths.push('Ý thức tự giác rèn luyện và tinh thần cầu thị hoàn thiện bản thân');
    topStrengths.push('Khả năng diễn đạt bằng ngôn từ cá nhân');
  }

  // 5. Đánh giá tiến độ
  let progressTrend: CompetencyAnalyticsSummary['progressTrend'] = 'insufficient_data';
  let progressSummaryText = 'Chưa đủ dữ liệu để kết luận xu hướng tiến bộ lâu dài. Hãy thực hiện thêm các bài luyện.';

  if (writingRecords.length >= 2 || readingAttempts.length >= 2) {
    progressTrend = 'improving';
    progressSummaryText = 'Có tín hiệu tiến bộ tích cực: Đã có ý thức tiếp thu phản hồi và thực hiện tự chỉnh sửa bài làm.';
  }

  return {
    surveyProgressStatus,
    hasSufficientData,
    totalSubmissionsCount: totalSubmissions,
    teacherApprovedCount,
    pendingApprovalCount,
    actualReadingScore,
    actualParagraphScore,
    actualEssayScore,
    actualOverallScore,
    provisionalSuggestedOverall,
    suggestedOverallScore: provisionalSuggestedOverall,
    rubricScores: {
      reading: actualReadingScore,
      paragraph: actualParagraphScore,
      essay: actualEssayScore
    },
    sectionProgress,
    selfReportedLatestScore: survey.selfReportedLatestScore,
    targetScore: survey.targetScore || 8.0,
    topStrengths: topStrengths.slice(0, 3),
    prioritySkillsToImprove: prioritySkillsToImprove.slice(0, 3),
    recurringMistakes,
    gapAnalysisList,
    progressTrend,
    progressSummaryText
  };
}

// ============================================================================
// DỰ ĐOÁN ĐIỂM SỐ DỰA TRÊN XU HƯỚNG PHÁT TRIỂN (TREND-BASED SCORE PREDICTION)
// ============================================================================

export type TrendDirection = 'upward' | 'stable' | 'downward' | 'single_point' | 'no_data';

export interface SectionTrendPrediction {
  section: 'reading' | 'paragraph_200w' | 'essay_600w';
  sectionTitle: string;
  maxScore: 4.0 | 2.0;
  sampleCount: number;
  chronologicalScores: number[];
  currentAverage: number | null;
  latestScore: number | null;
  slopePerAttempt: number | null; // Độ dốc xu hướng tuyến tính (điểm / bài)
  predictedNextScore: number | null; // Điểm dự đoán cho bài tiếp theo (không làm tròn đẩy bậc)
  predictedRange: [number, number] | null;
  predictedMastery: SectionMasteryIndicator;
  trendDirection: TrendDirection;
  trendLabel: string;
}

export interface TrendPredictionBreakdown {
  sourceLabel: string;
  isOfficialTeacherApproved: boolean;
  hasAnyData: boolean;
  totalScoredAttempts: number;
  reading: SectionTrendPrediction;
  paragraph: SectionTrendPrediction;
  essay: SectionTrendPrediction;
  // Dự đoán tổng điểm thang 10,0 (4,0 + 2,0 + 4,0)
  predictedOverallScore10: number | null;
  predictedOverallRange10: [number, number] | null;
  currentOverallScore10: number | null;
  overallDelta10: number | null;
  overallTrendDirection: TrendDirection;
  overallTrendSummary: string;
  confidenceLevel: 'high' | 'medium' | 'low' | 'none';
  confidenceLabel: string;
}

export interface StudentScorePredictionSummary {
  // Dự đoán chính thức (CHỈ tính từ điểm Giáo viên đã duyệt)
  officialPrediction: TrendPredictionBreakdown;
  // Dự đoán tham khảo từ điểm AI đề xuất (tách biệt minh bạch, chờ giáo viên duyệt)
  aiReferencePrediction: TrendPredictionBreakdown;
  // Số lượt tự chỉnh sửa hoàn thiện giúp củng cố đà tăng điểm
  completedRevisionsCount: number;
  targetScore10: number;
}

function truncateTwoDecimals(val: number): number {
  return Math.floor((val + 1e-9) * 100) / 100;
}

function computeSingleSectionTrend(
  section: 'reading' | 'paragraph_200w' | 'essay_600w',
  sectionTitle: string,
  chronologicalScores: number[],
  revisionBonusFactor: number
): SectionTrendPrediction {
  const maxScore: 4.0 | 2.0 = section === 'paragraph_200w' ? 2.0 : 4.0;
  const n = chronologicalScores.length;

  if (n === 0) {
    return {
      section,
      sectionTitle,
      maxScore,
      sampleCount: 0,
      chronologicalScores: [],
      currentAverage: null,
      latestScore: null,
      slopePerAttempt: null,
      predictedNextScore: null,
      predictedRange: null,
      predictedMastery: computeSectionMasteryIndicator(section, null),
      trendDirection: 'no_data',
      trendLabel: 'Chưa có dữ liệu'
    };
  }

  const sum = chronologicalScores.reduce((acc, s) => acc + s, 0);
  const currentAverage = truncateTwoDecimals(sum / n);
  const latestScore = truncateTwoDecimals(chronologicalScores[n - 1]);

  if (n === 1) {
    // Khi mới có 1 bài làm: dự đoán thận trọng quanh điểm hiện tại + biên độ tự sửa nhỏ
    const modestBoost = Math.min(maxScore * 0.04, revisionBonusFactor * (maxScore / 4.0));
    const predicted = truncateTwoDecimals(Math.max(0, Math.min(maxScore, latestScore + modestBoost)));
    const spread = maxScore === 2.0 ? 0.15 : 0.25;
    const minR = truncateTwoDecimals(Math.max(0, predicted - spread));
    const maxR = truncateTwoDecimals(Math.min(maxScore, predicted + spread));

    return {
      section,
      sectionTitle,
      maxScore,
      sampleCount: 1,
      chronologicalScores,
      currentAverage,
      latestScore,
      slopePerAttempt: 0,
      predictedNextScore: predicted,
      predictedRange: [minR, maxR],
      predictedMastery: computeSectionMasteryIndicator(section, predicted),
      trendDirection: 'single_point',
      trendLabel: 'Mới có 1 mốc điểm (cần thêm bài để xác định độ dốc xu hướng)'
    };
  }

  // Hồi quy tuyến tính (Ordinary Least Squares) trên chuỗi thời gian x = 0, 1, ..., n-1
  const meanX = (n - 1) / 2;
  const meanY = sum / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - meanX;
    num += dx * (chronologicalScores[i] - meanY);
    den += dx * dx;
  }
  const rawSlope = den > 0 ? num / den : 0;

  // Trung bình trượt có trọng số ưu tiên các bài gần nhất
  let weightedSum = 0;
  let weightTotal = 0;
  for (let i = 0; i < n; i++) {
    const w = i + 1;
    weightedSum += chronologicalScores[i] * w;
    weightTotal += w;
  }
  const weightedRecentAvg = weightedSum / weightTotal;

  // Dự đoán bước kế tiếp = Trung bình trọng số gần nhất + 0.65 * độ dốc tuyến tính (giảm chấn tránh vọt quá đà) + thưởng tự sửa nhỏ
  const dampedDelta = Math.max(-maxScore * 0.2, Math.min(maxScore * 0.2, rawSlope * 0.65));
  const revisionBoost = Math.min(maxScore * 0.03, revisionBonusFactor * (maxScore / 4.0));
  const rawPredicted = weightedRecentAvg + dampedDelta + revisionBoost;
  const predictedNextScore = truncateTwoDecimals(Math.max(0, Math.min(maxScore, rawPredicted)));

  const slopeRounded = Math.round(rawSlope * 100) / 100;
  const thresholdSlope = maxScore === 2.0 ? 0.04 : 0.08;
  const trendDirection: TrendDirection =
    rawSlope > thresholdSlope ? 'upward' : rawSlope < -thresholdSlope ? 'downward' : 'stable';

  const trendLabel =
    trendDirection === 'upward'
      ? `Đang tiến bộ (+${formatScoreVN(Math.abs(slopeRounded))}đ/bài)`
      : trendDirection === 'downward'
      ? `Đang chững lại (-${formatScoreVN(Math.abs(slopeRounded))}đ/bài)`
      : 'Phong độ ổn định';

  const spread = maxScore === 2.0 ? 0.12 : 0.22;
  const minR = truncateTwoDecimals(Math.max(0, predictedNextScore - spread));
  const maxR = truncateTwoDecimals(Math.min(maxScore, predictedNextScore + spread));

  return {
    section,
    sectionTitle,
    maxScore,
    sampleCount: n,
    chronologicalScores,
    currentAverage,
    latestScore,
    slopePerAttempt: slopeRounded,
    predictedNextScore,
    predictedRange: [minR, maxR],
    predictedMastery: computeSectionMasteryIndicator(section, predictedNextScore),
    trendDirection,
    trendLabel
  };
}

function buildTrendBreakdown(
  sourceLabel: string,
  isOfficialTeacherApproved: boolean,
  readingScoresChrono: number[],
  paragraphScoresChrono: number[],
  essayScoresChrono: number[],
  revisionBonusFactor: number
): TrendPredictionBreakdown {
  const reading = computeSingleSectionTrend(
    'reading',
    'Đọc hiểu văn bản',
    readingScoresChrono,
    revisionBonusFactor
  );
  const paragraph = computeSingleSectionTrend(
    'paragraph_200w',
    'Đoạn văn khoảng 200 chữ',
    paragraphScoresChrono,
    revisionBonusFactor
  );
  const essay = computeSingleSectionTrend(
    'essay_600w',
    'Bài văn khoảng 600 chữ',
    essayScoresChrono,
    revisionBonusFactor
  );

  const totalScoredAttempts =
    reading.sampleCount + paragraph.sampleCount + essay.sampleCount;
  const hasAnyData = totalScoredAttempts > 0;

  if (!hasAnyData) {
    return {
      sourceLabel,
      isOfficialTeacherApproved,
      hasAnyData: false,
      totalScoredAttempts: 0,
      reading,
      paragraph,
      essay,
      predictedOverallScore10: null,
      predictedOverallRange10: null,
      currentOverallScore10: null,
      overallDelta10: null,
      overallTrendDirection: 'no_data',
      overallTrendSummary: 'Chưa có dữ liệu',
      confidenceLevel: 'none',
      confidenceLabel: 'Chưa có dữ liệu'
    };
  }

  let availableMax = 0;
  let predictedSum = 0;
  let currentAvgSum = 0;
  let minRangeSum = 0;
  let maxRangeSum = 0;

  for (const sec of [reading, paragraph, essay]) {
    if (sec.predictedNextScore !== null && sec.currentAverage !== null && sec.predictedRange) {
      availableMax += sec.maxScore;
      predictedSum += sec.predictedNextScore;
      currentAvgSum += sec.currentAverage;
      minRangeSum += sec.predictedRange[0];
      maxRangeSum += sec.predictedRange[1];
    }
  }

  const predictedOverallScore10 =
    availableMax > 0 ? truncateTwoDecimals((predictedSum / availableMax) * 10) : null;
  const currentOverallScore10 =
    availableMax > 0 ? truncateTwoDecimals((currentAvgSum / availableMax) * 10) : null;
  const predictedOverallRange10: [number, number] | null =
    availableMax > 0
      ? [
          truncateTwoDecimals(Math.max(0, (minRangeSum / availableMax) * 10)),
          truncateTwoDecimals(Math.min(10, (maxRangeSum / availableMax) * 10))
        ]
      : null;

  const overallDelta10 =
    predictedOverallScore10 !== null && currentOverallScore10 !== null
      ? Math.round((predictedOverallScore10 - currentOverallScore10) * 100) / 100
      : null;

  const sectionsWithMultiple = [reading, paragraph, essay].filter((s) => s.sampleCount >= 2);
  let overallTrendDirection: TrendDirection = 'single_point';
  if (sectionsWithMultiple.length > 0 && overallDelta10 !== null) {
    if (overallDelta10 >= 0.15) overallTrendDirection = 'upward';
    else if (overallDelta10 <= -0.15) overallTrendDirection = 'downward';
    else overallTrendDirection = 'stable';
  }

  const sectionsCoveredCount = [reading, paragraph, essay].filter((s) => s.sampleCount > 0).length;
  const confidenceLevel: TrendPredictionBreakdown['confidenceLevel'] =
    totalScoredAttempts >= 5 && sectionsCoveredCount === 3
      ? 'high'
      : totalScoredAttempts >= 2
      ? 'medium'
      : 'low';

  const confidenceLabel =
    confidenceLevel === 'high'
      ? `Độ tin cậy cao (${totalScoredAttempts} bài đã chấm đủ 3 phần)`
      : confidenceLevel === 'medium'
      ? `Độ tin cậy trung bình (${totalScoredAttempts} bài · ${sectionsCoveredCount}/3 phần)`
      : `Dự báo sơ bộ (${totalScoredAttempts} bài · cần làm thêm để hội tụ xu hướng)`;

  const overallTrendSummary =
    overallTrendDirection === 'upward'
      ? 'Xu hướng điểm số đang tăng trưởng tích cực qua các lần luyện tập gần đây.'
      : overallTrendDirection === 'downward'
      ? 'Điểm các bài gần đây có dấu hiệu chững lại; nên ôn kỹ các tiêu chí bị trừ điểm trước khi làm đề mới.'
      : overallTrendDirection === 'stable'
      ? 'Phong độ điểm số duy trì ổn định; hãy tập trung nâng cấp các câu vận dụng cao để bứt phá.'
      : 'Mới có ít mốc dữ liệu; hãy hoàn thành thêm 1–2 bài luyện ở từng phần để đường xu hướng chính xác hơn.';

  return {
    sourceLabel,
    isOfficialTeacherApproved,
    hasAnyData: true,
    totalScoredAttempts,
    reading,
    paragraph,
    essay,
    predictedOverallScore10,
    predictedOverallRange10,
    currentOverallScore10,
    overallDelta10,
    overallTrendDirection,
    overallTrendSummary,
    confidenceLevel,
    confidenceLabel
  };
}

/**
 * Tính toán điểm dự đoán dựa trên xu hướng phát triển từ readingAttempts và writingRecords.
 * Tuân thủ nghiêm ngặt:
 * - Tách riêng Dự đoán chính thức (từ điểm Giáo viên đã duyệt) và Dự đoán tham khảo từ điểm AI.
 * - Khi chưa có dữ liệu thật, trả về hasAnyData = false ("Chưa có dữ liệu"), không sinh điểm giả.
 */
export function computeTrendScorePrediction(
  readingAttempts: ReadingAttempt[],
  writingRecords: WritingSubmissionRecord[],
  targetScore10 = 8.0
): StudentScorePredictionSummary {
  // Đảo ngược để sắp xếp theo trình tự thời gian từ cũ nhất -> mới nhất
  const chronoReading = [...readingAttempts].reverse();
  const chronoWriting = [...writingRecords].reverse();

  const readingOfficialScores: number[] = [];
  const readingAiRefScores: number[] = [];

  chronoReading.forEach((att) => {
    if (typeof att.feedback.teacherConfirmedScore === 'number') {
      readingOfficialScores.push(att.feedback.teacherConfirmedScore);
    } else if (typeof att.feedback.aiSuggestedScore === 'number') {
      readingAiRefScores.push(att.feedback.aiSuggestedScore);
    }
  });

  const paragraphOfficialScores: number[] = [];
  const paragraphAiRefScores: number[] = [];
  const essayOfficialScores: number[] = [];
  const essayAiRefScores: number[] = [];

  chronoWriting.forEach((rec) => {
    const isPara = isParagraph200wRecord(rec);
    if (typeof rec.feedback.teacherConfirmedScore === 'number') {
      if (isPara) paragraphOfficialScores.push(rec.feedback.teacherConfirmedScore);
      else essayOfficialScores.push(rec.feedback.teacherConfirmedScore);
    } else if (typeof rec.feedback.aiSuggestedScore === 'number') {
      if (isPara) paragraphAiRefScores.push(rec.feedback.aiSuggestedScore);
      else essayAiRefScores.push(rec.feedback.aiSuggestedScore);
    }
  });

  const completedRevisionsCount =
    readingAttempts.filter((r) => Boolean(r.improvedAnswer && r.improvedAnswer.trim())).length +
    writingRecords.reduce((acc, w) => acc + (Array.isArray(w.revisions) ? w.revisions.length : 0), 0);

  const totalAttempts = readingAttempts.length + writingRecords.length;
  const revisionRate = totalAttempts > 0 ? completedRevisionsCount / totalAttempts : 0;
  const revisionBonusFactor = Math.min(0.12, revisionRate * 0.1);

  const officialPrediction = buildTrendBreakdown(
    'Dự đoán từ Điểm chính thức (Giáo viên đã duyệt)',
    true,
    readingOfficialScores,
    paragraphOfficialScores,
    essayOfficialScores,
    revisionBonusFactor
  );

  const aiReferencePrediction = buildTrendBreakdown(
    'Dự đoán tham khảo từ Điểm AI — chờ giáo viên duyệt',
    false,
    readingAiRefScores,
    paragraphAiRefScores,
    essayAiRefScores,
    revisionBonusFactor
  );

  return {
    officialPrediction,
    aiReferencePrediction,
    completedRevisionsCount,
    targetScore10
  };
}

