import {
  CompleteExam,
  ExamSubmission,
  ExamSubmissionAnswer,
  ExamAiEvaluationResult,
  ConfidenceLevel
} from '../types';
import {
  evaluateReadingAnswer,
  evaluateWritingEssay,
  evaluateReadingAnswerWithAI,
  evaluateWritingEssayWithAI,
  extractVerbatimStudentQuotes,
  RULE_BASED_LABEL,
  GEMINI_AI_LABEL
} from './pedagogicalEngine';
import { formatVNDecimal } from './examParserEngine';
import { isVerifiedTeacherSession, getSavedSessionUser, getActiveSessionToken } from './accountService';

const STORAGE_KEY_REAL_SUBMISSIONS = 'vanai12_real_exam_submissions_v2';

/**
 * GỢI Ý THEO QUY TẮC CHO BÀI THI HOÀN CHỈNH (Đọc hiểu 4,0đ + Đoạn văn 2,0đ + Bài văn 4,0đ = 10,0đ)
 * - Chỉ sử dụng khi chưa cấu hình khóa GEMINI_API_KEY ở máy chủ hoặc mất kết nối mạng.
 * - Tuyệt đối KHÔNG gọi kết quả này là điểm AI chính thức và KHÔNG đưa vào thống kê điểm đã duyệt.
 */
export function evaluateCompleteExamSubmission(
  exam: CompleteExam,
  answers: ExamSubmissionAnswer,
  submissionVersion: number = 1,
  apiWarningMessage?: string
): ExamAiEvaluationResult {
  const readingScores: ExamAiEvaluationResult['readingScores'] = {};
  const itemsNeedingTeacherReview: ExamAiEvaluationResult['itemsNeedingTeacherReview'] = [];
  let readingTotalProposed = 0;

  // 1. Gợi ý theo quy tắc cho phần Đọc hiểu (từng câu, tổng tối đa 4.0đ)
  exam.readingPassage.questions.forEach((q) => {
    const studentAns = (answers.readingAnswers[q.id] || '').trim();
    const maxScore = Number(Math.max(0.25, Math.min(4.0, Number(q.maxScore) || 1.0)).toFixed(2));

    if (!studentAns) {
      readingScores[q.id] = {
        score: 0,
        maxScore,
        rationale: 'Học sinh để trống, chưa trả lời câu hỏi này.',
        strengths: [],
        missingPoints: ['Chưa có nội dung trả lời.'],
        studentQuotes: [],
        confidenceLevel: 'high',
        evaluationSource: 'rule_based_fallback',
        evaluationSourceLabel: RULE_BASED_LABEL,
        needsReview: false
      };
      return;
    }

    const feedback = evaluateReadingAnswer(
      exam.readingPassage.content,
      q.question,
      studentAns,
      {
        id: q.id,
        level: q.level,
        levelName: q.levelName,
        question: q.question,
        contextHint: q.answerGuide || 'Căn cứ vào ngữ liệu đọc hiểu',
        keyConcepts: q.keyConcepts || [],
        sampleScaffoldNotes: [],
        maxScore
      },
      apiWarningMessage
    );

    const wordCount = studentAns.split(/\s+/).filter(Boolean).length;
    const hasConceptMatch = feedback.strengths.some((s) => s.includes('tương đương') || s.includes('trọng tâm'));

    let rawProposed = 0;
    if (q.level === 'nhan_biet') {
      rawProposed = wordCount >= 3 && hasConceptMatch ? maxScore : maxScore * 0.5;
    } else if (q.level === 'thong_hieu') {
      rawProposed = wordCount >= 10 && hasConceptMatch ? maxScore * 0.85 : maxScore * 0.5;
    } else {
      rawProposed = wordCount >= 15 ? maxScore * 0.75 : maxScore * 0.4;
    }

    const clampedQuestionScore = Number(Math.max(0, Math.min(maxScore, rawProposed)).toFixed(2));
    const reviewReason = `Câu ${q.order} (${q.levelName}): Kết quả đang ở chế độ "${RULE_BASED_LABEL}", cần giáo viên bộ môn chấm chính thức.`;

    itemsNeedingTeacherReview.push({
      id: `review-q-${q.id}`,
      section: 'reading',
      title: `Đọc hiểu — Câu ${q.order} (Tối đa ${formatVNDecimal(maxScore)}đ)`,
      reason: reviewReason,
      proposedScore: clampedQuestionScore
    });

    readingTotalProposed += clampedQuestionScore;
    readingScores[q.id] = {
      score: clampedQuestionScore,
      maxScore,
      rationale: `[${RULE_BASED_LABEL}]: Ước tính sơ bộ ${formatVNDecimal(clampedQuestionScore)}/${formatVNDecimal(maxScore)}đ dựa trên độ dài câu (${wordCount} từ) và nhóm ý tương đương. Chưa phải điểm chấm AI hay điểm chính thức.`,
      strengths: feedback.strengths,
      missingPoints: feedback.missingPoints,
      studentQuotes: extractVerbatimStudentQuotes(studentAns, 1),
      confidenceLevel: 'low',
      evaluationSource: 'rule_based_fallback',
      evaluationSourceLabel: RULE_BASED_LABEL,
      needsReview: true,
      reviewReason
    };
  });

  // Kiểm soát tổng điểm Đọc hiểu không vượt quá 4.0 điểm
  readingTotalProposed = Number(Math.max(0, Math.min(4.0, readingTotalProposed)).toFixed(2));

  // 2. Gợi ý theo quy tắc cho Đoạn văn ~200 chữ (Thang 2,0 điểm)
  const paragraphFeedback = evaluateWritingEssay(
    exam.writingTasks.paragraphTask.promptText,
    answers.paragraphText,
    exam.writingTasks.paragraphTask.type,
    apiWarningMessage
  );
  const paragraphProposed = Number(
    Math.max(0, Math.min(2.0, Number(paragraphFeedback.aiSuggestedScore) || 0)).toFixed(2)
  );
  paragraphFeedback.aiSuggestedScore = paragraphProposed;

  itemsNeedingTeacherReview.push({
    id: 'review-task1-paragraph',
    section: 'paragraph',
    title: 'Đoạn văn ~200 chữ (Tối đa 2,0đ) — Cần giáo viên chấm chính thức',
    reason: `[${RULE_BASED_LABEL}]: Hệ thống chỉ mới kiểm tra thể thức (${paragraphFeedback.paragraphCount} đoạn, ${paragraphFeedback.wordCount} từ); cần giáo viên chấm nội dung lập luận.`,
    proposedScore: paragraphProposed
  });

  // 3. Gợi ý theo quy tắc cho Bài văn ~600 chữ (Thang 4,0 điểm)
  const essayFeedback = evaluateWritingEssay(
    exam.writingTasks.essayTask.promptText,
    answers.essayText,
    exam.writingTasks.essayTask.type,
    apiWarningMessage
  );
  const essayProposed = Number(
    Math.max(0, Math.min(4.0, Number(essayFeedback.aiSuggestedScore) || 0)).toFixed(2)
  );
  essayFeedback.aiSuggestedScore = essayProposed;

  itemsNeedingTeacherReview.push({
    id: 'review-task2-essay',
    section: 'essay',
    title: 'Bài văn ~600 chữ (Tối đa 4,0đ) — Cần giáo viên chấm chính thức',
    reason: `[${RULE_BASED_LABEL}]: Bài viết gồm ${essayFeedback.wordCount} từ (${essayFeedback.paragraphCount} đoạn); cần giáo viên thẩm định luận điểm, dẫn chứng và chất văn.`,
    proposedScore: essayProposed
  });

  // Kiểm tra tổng điểm đúng thang 4.0 + 2.0 + 4.0 = 10.0
  const totalProposed = Number(
    Math.max(0, Math.min(10.0, readingTotalProposed + paragraphProposed + essayProposed)).toFixed(2)
  );

  return {
    evaluationSource: 'rule_based_fallback',
    evaluationSourceLabel: RULE_BASED_LABEL,
    submissionVersion,
    confidenceLevel: 'low',
    confidenceScore: 42,
    apiWarningMessage,
    readingScores,
    paragraphFeedback,
    essayFeedback,
    proposedTotal: totalProposed,
    itemsNeedingTeacherReview
  };
}

/**
 * Chấm bài thi hoàn chỉnh bằng Server-Side Gemini AI (/api/ai/evaluate-reading & /api/ai/evaluate-writing)
 * - Gửi đầy đủ ngữ liệu, từng câu hỏi + đáp án, đề viết + rubric và phiên bản bài làm (submissionVersion).
 * - Kiểm tra chặt chẽ điểm từng tiêu chí không vượt mức tối đa, tổng điểm đúng thang 4 + 2 + 4 = 10.
 * - Nếu chưa có GEMINI_API_KEY hoặc lỗi mạng/JSON, tự động gắn nhãn rõ ràng "Gợi ý theo quy tắc — chưa phải chấm AI".
 */
export async function evaluateCompleteExamSubmissionWithAI(
  exam: CompleteExam,
  answers: ExamSubmissionAnswer,
  submissionVersion: number = 1
): Promise<ExamAiEvaluationResult> {
  try {
    const readingScores: ExamAiEvaluationResult['readingScores'] = {};
    const itemsNeedingTeacherReview: ExamAiEvaluationResult['itemsNeedingTeacherReview'] = [];
    let anyAiSucceeded = false;
    let anyRuleFallback = false;
    let firstWarningMessage: string | undefined;

    // 1. Chấm từng câu Đọc hiểu qua Gemini AI phía máy chủ
    await Promise.all(
      exam.readingPassage.questions.map(async (q) => {
        const studentAns = (answers.readingAnswers[q.id] || '').trim();
        const maxScore = Number(Math.max(0.25, Math.min(4.0, Number(q.maxScore) || 1.0)).toFixed(2));

        if (!studentAns) {
          readingScores[q.id] = {
            score: 0,
            maxScore,
            rationale: 'Học sinh để trống câu hỏi này.',
            strengths: [],
            missingPoints: ['Chưa có nội dung trả lời.'],
            studentQuotes: [],
            confidenceLevel: 'high',
            evaluationSource: 'gemini_ai',
            evaluationSourceLabel: 'Bỏ trống (0,0đ)',
            needsReview: false
          };
          return;
        }

        const rEval = await evaluateReadingAnswerWithAI(
          exam.readingPassage.content,
          q.question,
          studentAns,
          {
            id: q.id,
            level: q.level,
            levelName: q.levelName,
            question: q.question,
            contextHint: q.answerGuide || '',
            keyConcepts: q.keyConcepts || [],
            sampleScaffoldNotes: [],
            maxScore
          },
          {
            submissionVersion,
            maxScore,
            answerGuide: q.answerGuide || ''
          }
        );

        if (rEval.evaluationSource === 'gemini_ai') {
          anyAiSucceeded = true;
        } else {
          anyRuleFallback = true;
          if (rEval.apiWarningMessage && !firstWarningMessage) {
            firstWarningMessage = rEval.apiWarningMessage;
          }
        }

        const clampedScore = Number(
          Math.max(0, Math.min(maxScore, Number(rEval.aiSuggestedScore) || 0)).toFixed(2)
        );
        const needsReview =
          Boolean(rEval.needsReview) ||
          rEval.evaluationSource === 'rule_based_fallback' ||
          q.level === 'van_dung' ||
          q.level === 'van_dung_cao';

        readingScores[q.id] = {
          score: clampedScore,
          maxScore,
          rationale:
            rEval.rationale ||
            `${rEval.evaluationSourceLabel || RULE_BASED_LABEL}: ${formatVNDecimal(clampedScore)}/${formatVNDecimal(maxScore)}đ.`,
          strengths: rEval.strengths,
          missingPoints: rEval.missingPoints,
          studentQuotes: rEval.studentQuotes || [],
          confidenceLevel: rEval.confidenceLevel || 'medium',
          evaluationSource: rEval.evaluationSource || 'rule_based_fallback',
          evaluationSourceLabel: rEval.evaluationSourceLabel || RULE_BASED_LABEL,
          needsReview,
          reviewReason: rEval.reviewReason
        };

        if (needsReview) {
          itemsNeedingTeacherReview.push({
            id: `review-q-${q.id}`,
            section: 'reading',
            title: `Đọc hiểu — Câu ${q.order} (${formatVNDecimal(maxScore)}đ)`,
            reason:
              rEval.reviewReason ||
              `Câu ${q.order} (${q.levelName}) cần giáo viên thẩm định cách diễn đạt và duyệt điểm.`,
            proposedScore: clampedScore
          });
        }
      })
    );

    // Tổng điểm Đọc hiểu (tối đa 4.0đ)
    const rawReadingSum = Object.values(readingScores).reduce((sum, item) => sum + item.score, 0);
    const clampedReadingSum = Number(Math.max(0, Math.min(4.0, rawReadingSum)).toFixed(2));

    // 2. Chấm Đoạn văn ~200 chữ (Thang 2,0đ) kèm Rubric của đề
    let paragraphFeedback = evaluateWritingEssay(
      exam.writingTasks.paragraphTask.promptText,
      answers.paragraphText,
      exam.writingTasks.paragraphTask.type
    );
    if (answers.paragraphText && answers.paragraphText.trim().length > 10) {
      paragraphFeedback = await evaluateWritingEssayWithAI(
        exam.writingTasks.paragraphTask.promptText,
        answers.paragraphText,
        exam.writingTasks.paragraphTask.type,
        2.0,
        200,
        {
          submissionVersion,
          rubric: exam.writingTasks.paragraphTask.rubric,
          answerGuideOrRubricNote: exam.writingTasks.paragraphTask.verificationNotes || ''
        }
      );
      if (paragraphFeedback.evaluationSource === 'gemini_ai') {
        anyAiSucceeded = true;
      } else {
        anyRuleFallback = true;
        if (paragraphFeedback.apiWarningMessage && !firstWarningMessage) {
          firstWarningMessage = paragraphFeedback.apiWarningMessage;
        }
      }
    } else {
      paragraphFeedback.aiSuggestedScore = 0;
      paragraphFeedback.overallImpression = 'Học sinh để trống phần viết đoạn văn 200 chữ.';
    }

    const clampedParagraphScore = Number(
      Math.max(0, Math.min(2.0, Number(paragraphFeedback.aiSuggestedScore) || 0)).toFixed(2)
    );
    paragraphFeedback.aiSuggestedScore = clampedParagraphScore;

    if (paragraphFeedback.needsReview || paragraphFeedback.paragraphCount > 1) {
      itemsNeedingTeacherReview.push({
        id: 'review-task1-paragraph',
        section: 'paragraph',
        title: 'Phần II. Câu 1: Đoạn văn ~200 chữ (2,0đ)',
        reason:
          paragraphFeedback.reviewReason ||
          `Đề xuất ${formatVNDecimal(clampedParagraphScore)}/2,0đ (${paragraphFeedback.evaluationSourceLabel || RULE_BASED_LABEL}); cần giáo viên xác nhận.`,
        proposedScore: clampedParagraphScore
      });
    }

    // 3. Chấm Bài văn ~600 chữ (Thang 4,0đ) kèm Rubric của đề
    let essayFeedback = evaluateWritingEssay(
      exam.writingTasks.essayTask.promptText,
      answers.essayText,
      exam.writingTasks.essayTask.type
    );
    if (answers.essayText && answers.essayText.trim().length > 10) {
      essayFeedback = await evaluateWritingEssayWithAI(
        exam.writingTasks.essayTask.promptText,
        answers.essayText,
        exam.writingTasks.essayTask.type,
        4.0,
        600,
        {
          submissionVersion,
          rubric: exam.writingTasks.essayTask.rubric,
          answerGuideOrRubricNote: exam.writingTasks.essayTask.verificationNotes || ''
        }
      );
      if (essayFeedback.evaluationSource === 'gemini_ai') {
        anyAiSucceeded = true;
      } else {
        anyRuleFallback = true;
        if (essayFeedback.apiWarningMessage && !firstWarningMessage) {
          firstWarningMessage = essayFeedback.apiWarningMessage;
        }
      }
    } else {
      essayFeedback.aiSuggestedScore = 0;
      essayFeedback.overallImpression = 'Học sinh để trống phần viết bài văn 600 chữ.';
    }

    const clampedEssayScore = Number(
      Math.max(0, Math.min(4.0, Number(essayFeedback.aiSuggestedScore) || 0)).toFixed(2)
    );
    essayFeedback.aiSuggestedScore = clampedEssayScore;

    itemsNeedingTeacherReview.push({
      id: 'review-task2-essay',
      section: 'essay',
      title: 'Phần II. Câu 2: Bài văn ~600 chữ (4,0đ)',
      reason:
        essayFeedback.reviewReason ||
        `Bài văn (${essayFeedback.wordCount} từ, ${essayFeedback.paragraphCount} đoạn) — ${essayFeedback.evaluationSourceLabel || RULE_BASED_LABEL}: ${formatVNDecimal(clampedEssayScore)}/4,0đ. Cần giáo viên thẩm định và duyệt điểm chính thức.`,
      proposedScore: clampedEssayScore
    });

    // Kiểm tra tổng điểm đúng thang 4.0 + 2.0 + 4.0 = 10.0
    const proposedTotal = Number(
      Math.max(0, Math.min(10.0, clampedReadingSum + clampedParagraphScore + clampedEssayScore)).toFixed(2)
    );

    const overallSource = anyAiSucceeded && !anyRuleFallback ? 'gemini_ai' : 'rule_based_fallback';
    const overallLabel =
      overallSource === 'gemini_ai' ? GEMINI_AI_LABEL : RULE_BASED_LABEL;
    const overallConfidence: ConfidenceLevel =
      overallSource === 'gemini_ai' ? 'medium' : 'low';

    return {
      evaluationSource: overallSource,
      evaluationSourceLabel: overallLabel,
      submissionVersion,
      confidenceLevel: overallConfidence,
      confidenceScore: overallSource === 'gemini_ai' ? 82 : 42,
      apiWarningMessage: firstWarningMessage,
      readingScores,
      paragraphFeedback,
      essayFeedback,
      proposedTotal,
      itemsNeedingTeacherReview
    };
  } catch (err: any) {
    console.warn('Fallback to rule-based complete exam evaluation:', err);
    return evaluateCompleteExamSubmission(
      exam,
      answers,
      submissionVersion,
      err?.message || 'Không thể kết nối máy chủ Gemini AI. Đang hiển thị gợi ý theo quy tắc.'
    );
  }
}

/**
 * Dữ liệu bài nộp minh họa (Chỉ hiển thị khi bật Chế độ Dữ liệu Minh họa / Demo)
 * Được gắn nhãn rõ ràng để không bao giờ trộn với kết quả học sinh thật.
 */
export const DEMO_EXAM_SUBMISSIONS: ExamSubmission[] = [
  {
    id: 'sub-demo-01',
    examId: 'exam-scenario-1-full-guide',
    examTitle: '[Dữ liệu minh họa] Đề thi thử Tốt nghiệp THPT 2026 — Mẫu A',
    templateType: 'template_a',
    studentId: 'DEMO-01',
    studentName: 'Học sinh Minh họa 01 [Dữ liệu minh họa]',
    className: '12-MINH-HOA',
    submittedAt: '13/10/2026 14:30',
    durationSeconds: 6840,
    submissionVersion: 1,
    answers: {
      readingAnswers: {
        'q-s1-1': 'Đoạn trích được viết theo thể thơ tự do.',
        'q-s1-2':
          'Theo đoạn trích, đất cằn cỗi đã dạy rễ cây biết cày sâu vào lòng đá, giữ cho lá xanh ngời vượt qua những mùa khô hạn.',
        'q-s1-3':
          'Biện pháp tu từ ẩn dụ ở hình ảnh "vết sẹo" tượng trưng cho những đau thương, va vấp và thử thách mà con người phải nếm trải trong cuộc đời. Tác dụng: làm nổi bật bản lĩnh rắn rỏi, kiên cường vượt qua phong ba bão táp.',
        'q-s1-4':
          'Em hoàn toàn đồng tình với lời nhắn nhủ của tác giả. Bởi vì tuổi trẻ là quãng thời gian đẹp đẽ và giàu nhiệt huyết nhất nhưng cũng trôi qua rất nhanh. Nếu chúng ta chỉ sống thờ ơ, buông xuôi, tháng năm tuổi trẻ sẽ trôi qua vô nghĩa mà không để lại bất kỳ giá trị nào cho bản thân và xã hội.'
      },
      paragraphText: `Hình tượng cây trong khổ thơ thứ nhất của đoạn trích hiện lên với vẻ đẹp kiên cường, bất khuất trước nghịch cảnh. Nhà thơ khẳng định: "Cây không chọn đất để sinh ra / Nhưng cây chọn vươn lên cùng bão gió". Đất có thể cằn cỗi, sỏi đá, nhưng chính hoàn cảnh khắc nghiệt ấy lại tôi luyện cho rễ cây biết "cày sâu vào lòng đá", nuôi dưỡng cho những mầm lá xanh ngời vượt qua mùa khô hạn. Qua hình tượng cây, tác giả không chỉ miêu tả sức sống mãnh liệt của thiên nhiên mà còn ngầm gửi gắm triết lý nhân sinh sâu sắc về con người: chúng ta không thể chọn nơi mình sinh ra, nhưng hoàn toàn có thể chọn thái độ sống dũng cảm đối diện với thử thách. Đó là vẻ đẹp của sự chủ động vươn lên và khát vọng sống hiên ngang.`,
      essayText: `Trong hành trình trưởng thành của mỗi con người, nghịch cảnh là điều không thể tránh khỏi. Thế nhưng, điều quyết định tầm vóc của một cá nhân không nằm ở số lần họ gặp trắc trở, mà ở tinh thần dấn thân và ý chí vượt lên số phận. Thế hệ trẻ hôm nay, khi đứng trước muôn vàn biến động của thời đại, càng cần trang bị cho mình bản lĩnh kiên cường để biến nghịch cảnh thành bàn đạp vươn tới tương lai.\n\nTrước hết, tinh thần dấn thân là thái độ chủ động bước ra khỏi vùng an toàn, dám nghĩ, dám làm và dám nhận trách nhiệm về mình. Người có tinh thần dấn thân không bao giờ than vãn trước khó khăn mà luôn tìm kiếm giải pháp để thay đổi hiện thực. Họ hiểu rằng con đường dẫn đến thành công chưa bao giờ trải đầy hoa hồng, mà luôn gập ghềnh với những khúc quanh thử thách.\n\nBên cạnh đó, ý chí vượt qua nghịch cảnh chính là ngọn lửa giữ cho tâm hồn không bị gục ngã trước giông bão. Hãy nhìn vào những tấm gương của những bạn trẻ khởi nghiệp thất bại nhiều lần nhưng vẫn kiên trì theo đuổi ước mơ, hay những học sinh nghèo vượt khó vươn lên đạt thành tích xuất sắc. Họ chính là minh chứng sống động cho chân lý: áp lực tạo nên kim cương.\n\nTuy nhiên, dấn thân không đồng nghĩa với liều lĩnh mù quáng. Tuổi trẻ cần tỉnh táo trang bị tri thức và kỹ năng để mỗi bước dấn thân đều mang lại giá trị thiết thực. Là học sinh lớp 12 đang đứng trước ngưỡng cửa thi cử quan trọng, chúng em cần tôi luyện cho mình ý chí kiên định mỗi ngày, không nản lòng trước những bài toán khó hay những lần điểm số chưa như ý, để tự tin bước vào đời.`
    },
    status: 'ai_evaluated',
    aiEvaluation: {
      evaluationSource: 'gemini_ai',
      evaluationSourceLabel: '[Dữ liệu minh họa] Kết quả chấm mẫu tham khảo',
      submissionVersion: 1,
      confidenceLevel: 'high',
      confidenceScore: 88,
      readingScores: {
        'q-s1-1': {
          score: 0.75,
          maxScore: 0.75,
          rationale: 'Học sinh trả lời chính xác thể thơ tự do.',
          strengths: ['Xác định đúng thể thơ.'],
          missingPoints: [],
          studentQuotes: ['Đoạn trích được viết theo thể thơ tự do.'],
          confidenceLevel: 'high',
          needsReview: false
        },
        'q-s1-2': {
          score: 0.75,
          maxScore: 0.75,
          rationale: 'Trích dẫn chính xác chi tiết từ văn bản.',
          strengths: ['Bám sát văn bản.'],
          missingPoints: [],
          studentQuotes: ['đất cằn cỗi đã dạy rễ cây biết cày sâu vào lòng đá'],
          confidenceLevel: 'high',
          needsReview: false
        },
        'q-s1-3': {
          score: 1.0,
          maxScore: 1.0,
          rationale: 'Chỉ rõ ẩn dụ và phân tích tác dụng sâu sắc.',
          strengths: ['Hiểu đúng nghệ thuật ẩn dụ.'],
          missingPoints: [],
          studentQuotes: ['hình ảnh "vết sẹo" tượng trưng cho những đau thương, va vấp'],
          confidenceLevel: 'medium',
          needsReview: true,
          reviewReason: 'Câu vận dụng có cách diễn đạt linh hoạt, cần giáo viên xác nhận mức điểm tối đa.'
        },
        'q-s1-4': {
          score: 1.25,
          maxScore: 1.5,
          rationale: 'Bày tỏ quan điểm rõ ràng và có 2 lí lẽ xác đáng.',
          strengths: ['Lập luận chặt chẽ.'],
          missingPoints: ['Có thể mở rộng thêm một dẫn chứng thực tế.'],
          studentQuotes: ['Nếu chúng ta chỉ sống thờ ơ, buông xuôi, tháng năm tuổi trẻ sẽ trôi qua vô nghĩa'],
          confidenceLevel: 'medium',
          needsReview: true,
          reviewReason: 'Câu hỏi mở; đề xuất 1,25/1,5đ, chuyển giáo viên quyết định điểm 1,5đ nếu đồng tình.'
        }
      },
      paragraphFeedback: {
        overallImpression:
          '[Dữ liệu minh họa] Đoạn văn viết đúng thể thức 1 đoạn duy nhất, bám sát hình tượng cây và khái quát thành bài học nhân sinh.',
        wordCount: 215,
        paragraphCount: 1,
        evaluationSource: 'gemini_ai',
        evaluationSourceLabel: '[Dữ liệu minh họa] Kết quả chấm mẫu tham khảo',
        confidenceLevel: 'high',
        confidenceScore: 86,
        needsReview: false,
        criteria: [
          {
            id: 'c1',
            name: '1. Thể thức đoạn văn ~200 chữ',
            weightLabel: '0,25đ',
            scoreLevel: 'Tốt & Sâu sắc',
            scoreStatus: 'success',
            strengths: 'Chuẩn 1 đoạn văn (215 từ).',
            weaknesses: '',
            remedyStep: '',
            rationale: 'Viết đúng 1 đoạn văn không ngắt dòng.',
            studentQuote: 'Hình tượng cây trong khổ thơ thứ nhất của đoạn trích hiện lên với vẻ đẹp kiên cường',
            confidenceLevel: 'high',
            needsReview: false,
            scoreAwarded: 0.25,
            maxCriterionScore: 0.25
          },
          {
            id: 'c2',
            name: '2. Đúng vấn đề nghị luận văn học',
            weightLabel: '0,25đ',
            scoreLevel: 'Tốt & Sâu sắc',
            scoreStatus: 'success',
            strengths: 'Phân tích trúng hình tượng cây.',
            weaknesses: '',
            remedyStep: '',
            rationale: 'Nêu bật chủ đề ngay từ câu mở đoạn.',
            studentQuote: 'vẻ đẹp kiên cường, bất khuất trước nghịch cảnh',
            confidenceLevel: 'high',
            needsReview: false,
            scoreAwarded: 0.25,
            maxCriterionScore: 0.25
          },
          {
            id: 'c3',
            name: '3. Triển khai luận điểm & dẫn chứng',
            weightLabel: '1,0đ',
            scoreLevel: 'Tốt & Sâu sắc',
            scoreStatus: 'success',
            strengths: 'Lí lẽ sâu sắc, trích dẫn thơ đắt giá.',
            weaknesses: '',
            remedyStep: '',
            rationale: 'Kết hợp trích dẫn thơ và phân tích biểu tượng.',
            studentQuote: 'Cây không chọn đất để sinh ra / Nhưng cây chọn vươn lên cùng bão gió',
            confidenceLevel: 'high',
            needsReview: false,
            scoreAwarded: 1.0,
            maxCriterionScore: 1.0
          },
          {
            id: 'c4',
            name: '4. Diễn đạt và sáng tạo',
            weightLabel: '0,5đ',
            scoreLevel: 'Khá',
            scoreStatus: 'info',
            strengths: 'Văn phong mượt mà.',
            weaknesses: 'Có thể làm nổi bật hơn phong cách thơ tác giả.',
            remedyStep: '',
            rationale: 'Diễn đạt trong sáng, có suy ngẫm nhân sinh.',
            studentQuote: 'chúng ta không thể chọn nơi mình sinh ra, nhưng hoàn toàn có thể chọn thái độ sống',
            confidenceLevel: 'medium',
            needsReview: false,
            scoreAwarded: 0.4,
            maxCriterionScore: 0.5
          }
        ],
        actionSteps: ['Duy trì cấu trúc chặt chẽ như hiện tại.'],
        cautionNote: '[Dữ liệu minh họa] Kết quả mẫu dùng để giáo viên thử nghiệm luồng duyệt điểm.',
        evaluatedAt: '13/10/2026',
        aiSuggestedScore: 1.9
      },
      essayFeedback: {
        overallImpression:
          '[Dữ liệu minh họa] Bài văn nghị luận xã hội bố cục 4 đoạn rõ ràng, lập luận chặt chẽ, có liên hệ bản thân thực tế.',
        wordCount: 540,
        paragraphCount: 4,
        evaluationSource: 'gemini_ai',
        evaluationSourceLabel: '[Dữ liệu minh họa] Kết quả chấm mẫu tham khảo',
        confidenceLevel: 'medium',
        confidenceScore: 84,
        needsReview: true,
        reviewReason: 'Bài văn nghị luận 4,0 điểm cần giáo viên duyệt chính thức.',
        criteria: [
          {
            id: 'e1',
            name: '1. Cấu trúc bài văn nghị luận',
            weightLabel: '0,5đ',
            scoreLevel: 'Tốt & Sâu sắc',
            scoreStatus: 'success',
            strengths: 'Đủ Mở bài, Thân bài, Kết bài.',
            weaknesses: '',
            remedyStep: '',
            rationale: 'Bố cục 4 đoạn cân đối.',
            studentQuote: 'Trong hành trình trưởng thành của mỗi con người, nghịch cảnh là điều không thể tránh khỏi.',
            confidenceLevel: 'high',
            needsReview: false,
            scoreAwarded: 0.5,
            maxCriterionScore: 0.5
          },
          {
            id: 'e2',
            name: '2. Xác định trúng vấn đề nghị luận',
            weightLabel: '0,5đ',
            scoreLevel: 'Tốt & Sâu sắc',
            scoreStatus: 'success',
            strengths: 'Bàn đúng về tinh thần dấn thân và ý chí vượt nghịch cảnh.',
            weaknesses: '',
            remedyStep: '',
            rationale: 'Xác định rõ trọng tâm nghị luận.',
            studentQuote: 'tinh thần dấn thân và ý chí vượt lên số phận',
            confidenceLevel: 'high',
            needsReview: false,
            scoreAwarded: 0.5,
            maxCriterionScore: 0.5
          },
          {
            id: 'e3',
            name: '3. Luận điểm, lí lẽ và dẫn chứng',
            weightLabel: '2,0đ',
            scoreLevel: 'Tốt & Sâu sắc',
            scoreStatus: 'success',
            strengths: 'Có phản đề và dẫn chứng sinh động.',
            weaknesses: '',
            remedyStep: '',
            rationale: 'Lập luận nhiều tầng bậc, có phản biện.',
            studentQuote: 'Tuy nhiên, dấn thân không đồng nghĩa với liều lĩnh mù quáng.',
            confidenceLevel: 'medium',
            needsReview: true,
            scoreAwarded: 1.8,
            maxCriterionScore: 2.0
          },
          {
            id: 'e4',
            name: '4. Diễn đạt và sáng tạo',
            weightLabel: '1,0đ',
            scoreLevel: 'Khá',
            scoreStatus: 'info',
            strengths: 'Giọng văn truyền cảm hứng.',
            weaknesses: '',
            remedyStep: '',
            rationale: 'Liên hệ thực tế học sinh lớp 12 chân thực.',
            studentQuote: 'Là học sinh lớp 12 đang đứng trước ngưỡng cửa thi cử quan trọng',
            confidenceLevel: 'medium',
            needsReview: true,
            scoreAwarded: 0.8,
            maxCriterionScore: 1.0
          }
        ],
        actionSteps: ['Phân tích sâu hơn 1 dẫn chứng cụ thể của người thật việc thật.'],
        cautionNote: '[Dữ liệu minh họa] Kết quả mẫu dùng để giáo viên thử nghiệm luồng duyệt điểm.',
        evaluatedAt: '13/10/2026',
        aiSuggestedScore: 3.6
      },
      proposedTotal: 9.25,
      itemsNeedingTeacherReview: [
        {
          id: 'item-1',
          section: 'reading',
          title: 'Đọc hiểu — Câu 4 (1,5đ)',
          reason: 'Câu hỏi mở; học sinh lập luận sắc bén, đề xuất 1,25đ. Giáo viên xem xét có thể cho trọn 1,5đ.',
          proposedScore: 1.25
        },
        {
          id: 'item-2',
          section: 'essay',
          title: 'Bài văn ~600 chữ (4,0đ)',
          reason: 'Bài làm 540 từ, đề xuất 3,6đ; cần giáo viên thẩm định và duyệt điểm chính thức.',
          proposedScore: 3.6
        }
      ]
    }
  }
];

/**
 * Lấy danh sách bài nộp thực tế (hoặc bài nộp minh họa nếu isDemoMode = true).
 * Tuyệt đối KHÔNG tự động nạp bài nộp mẫu khi dữ liệu thật đang trống.
 */
export function getStoredSubmissions(isDemoMode = false): ExamSubmission[] {
  if (isDemoMode) {
    return DEMO_EXAM_SUBMISSIONS;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY_REAL_SUBMISSIONS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Lỗi đọc danh sách bài nộp thực tế:', err);
  }

  return [];
}

/**
 * Lưu danh sách bài nộp thực tế.
 * YÊU CẦU 7: Bảo vệ tuyệt đối điểm giáo viên đã xác nhận (teacher_approved / teacherConfirmedScore)
 * để không bị ghi đè bởi bất kỳ lần chấm AI tiếp theo nào.
 */
export function saveStoredSubmissions(subs: ExamSubmission[], isDemoMode = false): void {
  if (isDemoMode) return;
  try {
    const existingList = getStoredSubmissions(false);
    const existingMap = new Map<string, ExamSubmission>();
    existingList.forEach((s) => existingMap.set(s.id, s));

    const protectedSubs = subs
      .filter((s) => s.id !== 'sub-demo-01')
      .map((incoming) => {
        const prev = existingMap.get(incoming.id);
        if (
          prev &&
          (prev.status === 'teacher_approved' || prev.teacherConfirmedScore?.isLockedAgainstAiOverwrite) &&
          !incoming.teacherConfirmedScore
        ) {
          // Bảo toàn trạng thái và điểm giáo viên đã duyệt, không cho AI ghi đè
          return {
            ...incoming,
            status: 'teacher_approved' as const,
            teacherConfirmedScore: prev.teacherConfirmedScore
          };
        }
        return incoming;
      });

    localStorage.setItem(STORAGE_KEY_REAL_SUBMISSIONS, JSON.stringify(protectedSubs));
  } catch (err) {
    console.error('Lỗi lưu danh sách bài nộp:', err);
  }
}

/**
 * Đồng bộ bài nộp lên máy chủ trung tâm (/api/submissions)
 */
export async function syncSubmissionToServer(submission: ExamSubmission): Promise<void> {
  const token = getActiveSessionToken();
  if (!token) return;
  try {
    await fetch('/api/submissions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ submission })
    });
  } catch (err) {
    console.warn('Chưa thể đồng bộ bài nộp lên máy chủ:', err);
  }
}

/**
 * Giáo viên phê duyệt điểm chính thức cho một bài nộp:
 * - Có trạng thái riêng ('teacher_approved')
 * - Lưu rõ người xác nhận (confirmedByTeacherId, confirmedByTeacherName) và thời gian duyệt (confirmedAt)
 * - Khóa bảo vệ (isLockedAgainstAiOverwrite = true) để không bị ghi đè bởi lần chấm AI tiếp theo
 */
export function approveExamSubmissionGrade(
  submissionId: string,
  scores: {
    readingScore: number;
    paragraphScore: number;
    essayScore: number;
    totalScore: number;
    teacherNotes: string;
  },
  isDemoMode = false
): ExamSubmission | null {
  if (!isDemoMode && !isVerifiedTeacherSession()) {
    throw new Error(
      'Từ chối truy cập (403): Chỉ tài khoản Giáo viên đã xác thực mới có quyền duyệt điểm chính thức.'
    );
  }

  const teacherUser = getSavedSessionUser();
  const rScore = Number(Math.max(0, Math.min(4.0, Number(scores.readingScore) || 0)).toFixed(2));
  const pScore = Number(Math.max(0, Math.min(2.0, Number(scores.paragraphScore) || 0)).toFixed(2));
  const eScore = Number(Math.max(0, Math.min(4.0, Number(scores.essayScore) || 0)).toFixed(2));
  const clampedTotal = Number(Math.min(10.0, rScore + pScore + eScore).toFixed(2));

  const confirmedAtStr =
    new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) +
    ' ' +
    new Date().toLocaleDateString('vi-VN');

  const confirmedPayload = {
    readingScore: rScore,
    paragraphScore: pScore,
    essayScore: eScore,
    totalScore: clampedTotal,
    teacherNotes: String(scores.teacherNotes || '').trim(),
    confirmedByTeacherId: teacherUser?.id || (isDemoMode ? 'DEMO-TEACHER' : 'GV-VERIFIED'),
    confirmedByTeacherName: teacherUser
      ? `${teacherUser.fullName} (${teacherUser.username})`
      : isDemoMode
      ? 'Giáo viên [Chế độ Minh họa]'
      : 'Giáo viên bộ môn',
    confirmedAt: confirmedAtStr,
    isLockedAgainstAiOverwrite: true
  };

  const list = getStoredSubmissions(isDemoMode);
  const idx = list.findIndex((s) => s.id === submissionId);
  if (idx === -1) return null;

  const sub: ExamSubmission = {
    ...list[idx],
    status: 'teacher_approved',
    teacherConfirmedScore: confirmedPayload
  };

  if (!isDemoMode) {
    const updatedList = [...list];
    updatedList[idx] = sub;
    saveStoredSubmissions(updatedList, false);

    // Đồng bộ trạng thái duyệt chính thức của giáo viên lên máy chủ
    const token = getActiveSessionToken();
    if (token) {
      fetch('/api/teacher/approve-submission', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          submissionId,
          readingScore: rScore,
          paragraphScore: pScore,
          essayScore: eScore,
          teacherNotes: confirmedPayload.teacherNotes
        })
      }).catch(() => {});
    }
  }
  return sub;
}

/**
 * Chấm lại bài nộp bằng Gemini AI:
 * - Gửi đúng đề, rubric và phiên bản bài làm hiện tại
 * - Tuyệt đối KHÔNG ghi đè trạng thái 'teacher_approved' hoặc điểm giáo viên đã xác nhận (teacherConfirmedScore)
 */
export async function reEvaluateSubmissionWithAI(
  submissionId: string,
  exam: CompleteExam,
  isDemoMode = false
): Promise<ExamSubmission | null> {
  const list = getStoredSubmissions(isDemoMode);
  const idx = list.findIndex((s) => s.id === submissionId);
  if (idx === -1) return null;

  const existing = list[idx];
  const nextVersion = existing.submissionVersion || 1;
  const newAiEval = await evaluateCompleteExamSubmissionWithAI(
    exam,
    existing.answers,
    nextVersion
  );

  // Bảo vệ tuyệt đối điểm giáo viên đã xác nhận
  const isLocked =
    existing.status === 'teacher_approved' ||
    Boolean(existing.teacherConfirmedScore?.isLockedAgainstAiOverwrite) ||
    Boolean(existing.teacherConfirmedScore);

  const updatedSub: ExamSubmission = {
    ...existing,
    submissionVersion: nextVersion,
    status: isLocked
      ? 'teacher_approved'
      : newAiEval.evaluationSource === 'gemini_ai'
      ? 'ai_evaluated'
      : 'rule_based_suggested',
    teacherConfirmedScore: isLocked ? existing.teacherConfirmedScore : undefined,
    aiEvaluation: newAiEval
  };

  if (!isDemoMode) {
    const updatedList = [...list];
    updatedList[idx] = updatedSub;
    saveStoredSubmissions(updatedList, false);
    syncSubmissionToServer(updatedSub).catch(() => {});
  }

  return updatedSub;
}
