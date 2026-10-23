import {
  PersonalizedRecommendation,
  StudentSurveyData,
  ReadingAttempt,
  WritingSubmissionRecord,
  SkillKey,
  ReadingPassage,
  WritingPrompt,
  ReadingTextType,
  PracticeSectionType,
  BankPublicationStatus,
  CriterionEvaluation,
  CompleteExam
} from '../types';
import {
  SAMPLE_READING_PASSAGES,
  SAMPLE_WRITING_PROMPTS
} from '../data/sampleData';
import { analyzeStudentCompetency } from './competencyAnalytics';

// Ngân hàng đề luyện tập sẵn có (Giáo viên xuất bản có đáp án & rubric)
export interface ExerciseBankItem {
  id: string;
  title: string;
  targetSkill: SkillKey;
  targetSkillName: string;
  level: 'Cơ bản' | 'Thông hiểu' | 'Vận dụng' | 'Vận dụng cao';
  estimatedMinutes: number;
  type: 'reading' | 'writing_paragraph' | 'writing_essay';
  sectionType: PracticeSectionType; // 'reading' | 'paragraph_200w' | 'essay_600w'
  readingTextType?: ReadingTextType; // 'van_hoc' | 'nghi_luan' | 'thong_tin'
  writingArgumentType?: 'nghi_luan_xa_hoi' | 'nghi_luan_van_hoc';
  taskFormatLabel: string;
  rubricId: string;
  maxScore: number;
  examTemplate: 'A' | 'B';
  status: BankPublicationStatus; // 'published' | 'pending_teacher_review' | 'draft'
  source: 'teacher_bank' | 'ai_generated';
  passageId?: string;
  promptId?: string;
  defaultReason: string;
}

export interface BankItemClassificationReport {
  itemId: string;
  title: string;
  sectionType: PracticeSectionType | 'unknown';
  sectionLabel: string;
  readingTextType?: ReadingTextType;
  readingTextTypeLabel?: string;
  writingArgumentType?: 'nghi_luan_xa_hoi' | 'nghi_luan_van_hoc';
  writingArgumentTypeLabel?: string;
  level: 'Cơ bản' | 'Thông hiểu' | 'Vận dụng' | 'Vận dụng cao';
  targetSkill: SkillKey;
  targetSkillName: string;
  examTemplate: 'A' | 'B' | 'custom';
  rubricId: string | null;
  hasValidRubric: boolean;
  maxScore: number;
  status: BankPublicationStatus;
  statusBadge: 'Đã xuất bản' | 'Chờ giáo viên kiểm tra';
  isReadyForStudent: boolean;
  reviewReason?: string;
}

/**
 * Tự động nhận diện và kiểm tra phân loại đề Đọc hiểu trong ngân hàng (Yêu cầu 2)
 */
export function classifyReadingPassageItem(passage: ReadingPassage): BankItemClassificationReport {
  // Ưu tiên thông tin đã có trong đề
  let textType: ReadingTextType | undefined = passage.textType;
  if (!textType) {
    if (passage.genre === 'Tản văn' || passage.genre === 'Thơ hiện đại' || passage.genre === 'Văn xuôi') {
      textType = 'van_hoc';
    } else if (passage.genre === 'Bình luận xã hội') {
      textType = 'nghi_luan';
    } else if (passage.genre === 'Văn bản thông tin') {
      textType = 'thong_tin';
    }
  }

  const textTypeLabel =
    textType === 'van_hoc'
      ? 'Văn bản văn học'
      : textType === 'nghi_luan'
      ? 'Văn bản nghị luận'
      : textType === 'thong_tin'
      ? 'Văn bản thông tin'
      : 'Chưa xác định loại văn bản';

  const questionsSum = Number(
    (passage.questions || []).reduce((acc, q) => acc + Number(q.maxScore || 0), 0).toFixed(2)
  );
  const hasAllKeyConcepts =
    Array.isArray(passage.questions) &&
    passage.questions.length > 0 &&
    passage.questions.every((q) => Array.isArray(q.keyConcepts) && q.keyConcepts.length > 0);
  const rubricId =
    passage.rubricId ||
    (hasAllKeyConcepts
      ? textType === 'van_hoc'
        ? 'RUBRIC-READ-VH-40'
        : textType === 'nghi_luan'
        ? 'RUBRIC-READ-NL-40'
        : textType === 'thong_tin'
        ? 'RUBRIC-READ-TT-40'
        : null
      : null);

  const hasValidRubric = Boolean(rubricId && hasAllKeyConcepts && (questionsSum === 4.0 || passage.maxScore === 4.0));
  const explicitPublished = (passage.status || 'published') === 'published';
  const isReady = Boolean(textType && hasValidRubric && explicitPublished);

  return {
    itemId: passage.id,
    title: passage.title,
    sectionType: 'reading',
    sectionLabel: 'Đọc hiểu (4,0 điểm)',
    readingTextType: textType,
    readingTextTypeLabel: textTypeLabel,
    level: passage.level || 'Thông hiểu',
    targetSkill: passage.targetSkill || 'reading_main_idea',
    targetSkillName: passage.targetSkillName || 'Đọc hiểu văn bản theo ngữ cảnh',
    examTemplate: passage.examTemplate || (textType === 'van_hoc' ? 'A' : 'B'),
    rubricId,
    hasValidRubric,
    maxScore: 4.0,
    status: isReady ? 'published' : 'pending_teacher_review',
    statusBadge: isReady ? 'Đã xuất bản' : 'Chờ giáo viên kiểm tra',
    isReadyForStudent: isReady,
    reviewReason: isReady
      ? undefined
      : !textType
      ? 'Chưa xác định được loại văn bản đọc hiểu (Văn học / Nghị luận / Thông tin).'
      : !hasValidRubric
      ? 'Thiếu hướng dẫn chấm (rubric) hoặc tổng điểm câu hỏi chưa khớp 4,0 điểm.'
      : 'Đề đang ở trạng thái Chờ giáo viên kiểm tra trước khi xuất bản.'
  };
}

/**
 * Tự động nhận diện và kiểm tra phân loại đề Viết (Đoạn văn 200 chữ / Bài văn 600 chữ) trong ngân hàng (Yêu cầu 2)
 */
export function classifyWritingPromptItem(prompt: WritingPrompt): BankItemClassificationReport {
  // Ưu tiên thông tin đã có trong đề và rubric
  let sectionType: 'paragraph_200w' | 'essay_600w' | 'unknown' = prompt.sectionType || 'unknown';
  if (sectionType === 'unknown') {
    if (prompt.maxScore === 2.0 || prompt.targetWordCount === 200 || /200\s*chữ|đoạn\s*văn/i.test(prompt.wordLimit + ' ' + prompt.promptText)) {
      sectionType = 'paragraph_200w';
    } else if (prompt.maxScore === 4.0 || prompt.targetWordCount === 600 || /600\s*chữ|bài\s*văn/i.test(prompt.wordLimit + ' ' + prompt.promptText)) {
      sectionType = 'essay_600w';
    }
  }

  const writingArgumentType = prompt.type;
  const writingArgumentTypeLabel =
    writingArgumentType === 'nghi_luan_xa_hoi'
      ? '2.1. Nghị luận xã hội'
      : writingArgumentType === 'nghi_luan_van_hoc'
      ? '2.2. Nghị luận văn học'
      : 'Chưa xác định dạng nghị luận';

  const expectedMaxScore = sectionType === 'paragraph_200w' ? 2.0 : 4.0;
  const rubricList: CriterionEvaluation[] = Array.isArray(prompt.rubric) ? prompt.rubric : [];
  const rubricSum = Number(
    rubricList.reduce((acc, c) => acc + Number(c.maxCriterionScore || 0), 0).toFixed(2)
  );
  const hasValidRubric =
    Boolean(prompt.rubricId) &&
    rubricList.length > 0 &&
    Math.abs(rubricSum - expectedMaxScore) <= 0.05;

  const explicitPublished = (prompt.status || 'published') === 'published';
  const isReady =
    sectionType !== 'unknown' &&
    (writingArgumentType === 'nghi_luan_xa_hoi' || writingArgumentType === 'nghi_luan_van_hoc') &&
    hasValidRubric &&
    explicitPublished;

  const defaultTemplate: 'A' | 'B' =
    (sectionType === 'paragraph_200w' && writingArgumentType === 'nghi_luan_van_hoc') ||
    (sectionType === 'essay_600w' && writingArgumentType === 'nghi_luan_xa_hoi')
      ? 'A'
      : 'B';

  return {
    itemId: prompt.id,
    title: prompt.title,
    sectionType,
    sectionLabel:
      sectionType === 'paragraph_200w'
        ? 'Đoạn văn khoảng 200 chữ (2,0 điểm)'
        : sectionType === 'essay_600w'
        ? 'Bài văn khoảng 600 chữ (4,0 điểm)'
        : 'Chưa xác định phần thi',
    writingArgumentType,
    writingArgumentTypeLabel,
    level: prompt.level || 'Vận dụng',
    targetSkill:
      prompt.targetSkill ||
      (sectionType === 'paragraph_200w' ? 'writing_paragraph_200w' : 'writing_essay_600w'),
    targetSkillName:
      prompt.targetSkillName ||
      (sectionType === 'paragraph_200w'
        ? 'Viết đoạn văn nghị luận ~200 chữ'
        : 'Viết bài văn nghị luận ~600 chữ'),
    examTemplate: prompt.examTemplate || defaultTemplate,
    rubricId: prompt.rubricId || null,
    hasValidRubric,
    maxScore: expectedMaxScore,
    status: isReady ? 'published' : 'pending_teacher_review',
    statusBadge: isReady ? 'Đã xuất bản' : 'Chờ giáo viên kiểm tra',
    isReadyForStudent: isReady,
    reviewReason: isReady
      ? undefined
      : sectionType === 'unknown'
      ? 'Không xác định được dung lượng phần thi (Đoạn văn 200 chữ hay Bài văn 600 chữ).'
      : !hasValidRubric
      ? `Chưa gắn Rubric chuẩn của giáo viên hoặc tổng điểm Rubric chưa khớp ${expectedMaxScore.toFixed(1).replace('.', ',')} điểm.`
      : 'Đề đang ở trạng thái Chờ giáo viên kiểm tra trước khi xuất bản.'
  };
}

/**
 * Kiểm tra một Đề thi tổng hợp (CompleteExam) đã đủ điều kiện xuất bản và có Rubric hợp lệ 4,0 + 2,0 + 4,0 = 10,0 hay chưa
 */
export function isCompleteExamPublishedAndReady(exam: CompleteExam): {
  isReady: boolean;
  statusBadge: 'Đã xuất bản' | 'Chờ giáo viên kiểm tra';
  reason?: string;
} {
  const isPublishedStatus = exam.status === 'verified' || exam.status === 'assigned';
  const hasUnresolvedFlags =
    Array.isArray(exam.verificationFlags) && exam.verificationFlags.some((f) => !f.isResolved);
  const isConsistent = Boolean(exam.consistencyReport?.isValid);
  const hasParagraphRubric =
    Array.isArray(exam.writingTasks?.paragraphTask?.rubric) &&
    exam.writingTasks.paragraphTask.rubric.length > 0 &&
    !exam.writingTasks.paragraphTask.isAiDraftRubric;
  const hasEssayRubric =
    Array.isArray(exam.writingTasks?.essayTask?.rubric) &&
    exam.writingTasks.essayTask.rubric.length > 0 &&
    !exam.writingTasks.essayTask.isAiDraftRubric;

  const isReady =
    isPublishedStatus &&
    !hasUnresolvedFlags &&
    isConsistent &&
    hasParagraphRubric &&
    hasEssayRubric &&
    exam.hasScoringGuide !== false;

  if (isReady) {
    return {
      isReady: true,
      statusBadge: 'Đã xuất bản'
    };
  }

  return {
    isReady: false,
    statusBadge: 'Chờ giáo viên kiểm tra',
    reason: !isConsistent
      ? 'Tổng điểm các phần chưa khớp chuẩn 4,0 + 2,0 + 4,0 = 10,0 điểm.'
      : !hasParagraphRubric || !hasEssayRubric || exam.hasScoringGuide === false
      ? 'Đề thi chưa có Hướng dẫn chấm / Rubric được giáo viên xác nhận.'
      : hasUnresolvedFlags
      ? 'Đề thi còn mục cần giáo viên kiểm tra lại.'
      : 'Đề đang ở trạng thái nháp — chờ giáo viên kiểm tra và xuất bản.'
  };
}

// Xây dựng Ngân hàng bài tập chuẩn từ các đề Giáo viên đã xuất bản + 1 mục chờ kiểm tra để kiểm chứng bộ lọc
export const EXERCISE_BANK: ExerciseBankItem[] = [
  // --- NHÓM A: ĐỌC HIỂU (3 LOẠI VĂN BẢN: VĂN HỌC, NGHỊ LUẬN, THÔNG TIN) ---
  {
    id: 'ex-read-vh-1',
    title: 'Khoảng lặng giữa dòng đời hối hả (Chu Văn Sơn)',
    targetSkill: 'reading_main_idea',
    targetSkillName: 'Đọc hiểu thông tin & suy luận ngữ cảnh văn học',
    level: 'Thông hiểu',
    estimatedMinutes: 30,
    type: 'reading',
    sectionType: 'reading',
    readingTextType: 'van_hoc',
    taskFormatLabel: 'Đọc hiểu — Văn bản văn học (Tản văn)',
    rubricId: 'RUBRIC-READ-VH-40',
    maxScore: 4.0,
    examTemplate: 'A',
    status: 'published',
    source: 'teacher_bank',
    passageId: 'passage-1',
    defaultReason: 'Rèn kỹ năng bám sát ngữ liệu văn học, xác định chi tiết nhận biết và phân tích phép tương phản.'
  },
  {
    id: 'ex-read-vh-2',
    title: 'Những nhành cây vươn ra đón bão (Nguyễn Khoa Điềm)',
    targetSkill: 'reading_rhetoric',
    targetSkillName: 'Nhận biết & phân tích biện pháp tu từ trong thơ',
    level: 'Vận dụng',
    estimatedMinutes: 30,
    type: 'reading',
    sectionType: 'reading',
    readingTextType: 'van_hoc',
    taskFormatLabel: 'Đọc hiểu — Văn bản văn học (Thơ hiện đại)',
    rubricId: 'RUBRIC-READ-VH-40',
    maxScore: 4.0,
    examTemplate: 'A',
    status: 'published',
    source: 'teacher_bank',
    passageId: 'passage-2',
    defaultReason: 'Tập trung giải mã hình ảnh ẩn dụ trong thơ hiện đại và cách trả lời câu hỏi vận dụng rút ra thông điệp.'
  },
  {
    id: 'ex-read-nl-1',
    title: 'Bản lĩnh của sự chính trực (Đặng Hoàng Giang)',
    targetSkill: 'reading_theme',
    targetSkillName: 'Xác định luận đề, lí lẽ và bằng chứng trong văn bản nghị luận',
    level: 'Vận dụng',
    estimatedMinutes: 30,
    type: 'reading',
    sectionType: 'reading',
    readingTextType: 'nghi_luan',
    taskFormatLabel: 'Đọc hiểu — Văn bản nghị luận',
    rubricId: 'RUBRIC-READ-NL-40',
    maxScore: 4.0,
    examTemplate: 'B',
    status: 'published',
    source: 'teacher_bank',
    passageId: 'passage-3',
    defaultReason: 'Rèn luyện tư duy phân tích mạch lập luận, chỉ ra tác dụng của hình ảnh ẩn dụ lập luận trong văn bản nghị luận xã hội.'
  },
  {
    id: 'ex-read-tt-1',
    title: 'Chuyển đổi số và bài toán bảo tồn di sản văn hóa Việt Nam',
    targetSkill: 'reading_main_idea',
    targetSkillName: 'Đọc hiểu văn bản thông tin, trích xuất dữ liệu & đánh giá giải pháp',
    level: 'Thông hiểu',
    estimatedMinutes: 30,
    type: 'reading',
    sectionType: 'reading',
    readingTextType: 'thong_tin',
    taskFormatLabel: 'Đọc hiểu — Văn bản thông tin',
    rubricId: 'RUBRIC-READ-TT-40',
    maxScore: 4.0,
    examTemplate: 'B',
    status: 'published',
    source: 'teacher_bank',
    passageId: 'passage-4',
    defaultReason: 'Rèn kỹ năng đọc lướt trích xuất thông tin chính xác, phân tích tác dụng của dẫn chứng số liệu và đề xuất giải pháp thực tiễn.'
  },

  // --- NHÓM B: ĐOẠN VĂN KHOẢNG 200 CHỮ (2,0 ĐIỂM — 2.1 NLXH & 2.2 NLVH) ---
  {
    id: 'ex-para-nlxh-1',
    title: 'Ý nghĩa của sự tự học đối với người trẻ trong kỷ nguyên số',
    targetSkill: 'writing_evidence_analysis',
    targetSkillName: 'Lựa chọn, phân tích dẫn chứng thực tế trong đoạn 200 chữ',
    level: 'Vận dụng',
    estimatedMinutes: 30,
    type: 'writing_paragraph',
    sectionType: 'paragraph_200w',
    writingArgumentType: 'nghi_luan_xa_hoi',
    taskFormatLabel: 'Đoạn văn 200 chữ — 2.1. Nghị luận xã hội',
    rubricId: 'RUBRIC-PARA-NLXH-20',
    maxScore: 2.0,
    examTemplate: 'B',
    status: 'published',
    source: 'teacher_bank',
    promptId: 'prompt-1',
    defaultReason: 'Gia cố kỹ năng lựa chọn 1 tấm gương thực tế sống động và viết câu bình sâu sắc trong cấu trúc 1 đoạn văn 200 chữ.'
  },
  {
    id: 'ex-para-nlxh-2',
    title: 'Bản lĩnh dám đối diện với sự không hoàn hảo để vươn lên',
    targetSkill: 'writing_paragraph_200w',
    targetSkillName: 'Viết đoạn văn nghị luận 200 chữ đúng thể thức',
    level: 'Cơ bản',
    estimatedMinutes: 30,
    type: 'writing_paragraph',
    sectionType: 'paragraph_200w',
    writingArgumentType: 'nghi_luan_xa_hoi',
    taskFormatLabel: 'Đoạn văn 200 chữ — 2.1. Nghị luận xã hội',
    rubricId: 'RUBRIC-PARA-NLXH-20',
    maxScore: 2.0,
    examTemplate: 'B',
    status: 'published',
    source: 'teacher_bank',
    promptId: 'prompt-2',
    defaultReason: 'Rèn phản xạ căn chỉnh dung lượng (180–250 chữ) và giữ nguyên vẹn cấu trúc 1 đoạn văn không xuống dòng giữa chừng.'
  },
  {
    id: 'ex-para-nlxh-3',
    title: 'Sức mạnh của sự thấu cảm trong các mối quan hệ đời sống',
    targetSkill: 'writing_thesis_arguments',
    targetSkillName: 'Xây dựng luận điểm và phản đề sắc bén',
    level: 'Vận dụng cao',
    estimatedMinutes: 30,
    type: 'writing_paragraph',
    sectionType: 'paragraph_200w',
    writingArgumentType: 'nghi_luan_xa_hoi',
    taskFormatLabel: 'Đoạn văn 200 chữ — 2.1. Nghị luận xã hội',
    rubricId: 'RUBRIC-PARA-NLXH-20',
    maxScore: 2.0,
    examTemplate: 'B',
    status: 'published',
    source: 'teacher_bank',
    promptId: 'prompt-3',
    defaultReason: 'Thử thách tư duy đa chiều và khả năng mở rộng phản đề nhằm đạt điểm tối đa 2,0/2,0 phần đoạn văn NLXH.'
  },
  {
    id: 'ex-para-nlvh-1',
    title: 'Cảm nhận vẻ đẹp hình tượng "những nhành cây vươn ra đón bão" (Nguyễn Khoa Điềm)',
    targetSkill: 'writing_paragraph_200w',
    targetSkillName: 'Viết đoạn văn nghị luận văn học 200 chữ (gắn nội dung & nghệ thuật)',
    level: 'Thông hiểu',
    estimatedMinutes: 30,
    type: 'writing_paragraph',
    sectionType: 'paragraph_200w',
    writingArgumentType: 'nghi_luan_van_hoc',
    taskFormatLabel: 'Đoạn văn 200 chữ — 2.2. Nghị luận văn học',
    rubricId: 'RUBRIC-PARA-NLVH-20',
    maxScore: 2.0,
    examTemplate: 'A',
    status: 'published',
    source: 'teacher_bank',
    promptId: 'prompt-5',
    defaultReason: 'Rèn kỹ năng phân tích 1 khía cạnh đặc sắc của đoạn thơ trong đúng 1 đoạn văn 200 chữ theo cấu trúc Đề mẫu A.'
  },
  {
    id: 'ex-para-nlvh-2',
    title: 'Phân tích giọng điệu triết lý trữ tình trong tản văn "Khoảng lặng giữa dòng đời hối hả"',
    targetSkill: 'writing_evidence_analysis',
    targetSkillName: 'Trích dẫn và giải mã tín hiệu thẩm mỹ trong đoạn 200 chữ',
    level: 'Vận dụng',
    estimatedMinutes: 30,
    type: 'writing_paragraph',
    sectionType: 'paragraph_200w',
    writingArgumentType: 'nghi_luan_van_hoc',
    taskFormatLabel: 'Đoạn văn 200 chữ — 2.2. Nghị luận văn học',
    rubricId: 'RUBRIC-PARA-NLVH-20',
    maxScore: 2.0,
    examTemplate: 'A',
    status: 'published',
    source: 'teacher_bank',
    promptId: 'prompt-6',
    defaultReason: 'Luyện cách chọn lọc chi tiết nghệ thuật đắt giá trong tản văn và phân tích ngắn gọn, hàm súc.'
  },

  // --- NHÓM C: BÀI VĂN KHOẢNG 600 CHỮ (4,0 ĐIỂM — 2.1 NLXH & 2.2 NLVH) ---
  {
    id: 'ex-essay-nlxh-1',
    title: 'Giữ gìn sự chính trực và bản sắc cá nhân trước áp lực đám đông trên không gian mạng',
    targetSkill: 'writing_essay_600w',
    targetSkillName: 'Tổ chức bài văn nghị luận xã hội 600 chữ đa chiều',
    level: 'Vận dụng',
    estimatedMinutes: 60,
    type: 'writing_essay',
    sectionType: 'essay_600w',
    writingArgumentType: 'nghi_luan_xa_hoi',
    taskFormatLabel: 'Bài văn 600 chữ — 2.1. Nghị luận xã hội',
    rubricId: 'RUBRIC-ESSAY-NLXH-40',
    maxScore: 4.0,
    examTemplate: 'A',
    status: 'published',
    source: 'teacher_bank',
    promptId: 'prompt-7',
    defaultReason: 'Rèn luyện bố cục 3 phần (Mở - Thân - Kết) cho bài văn nghị luận xã hội 600 chữ (4,0 điểm) theo cấu trúc Đề mẫu A.'
  },
  {
    id: 'ex-essay-nlxh-2',
    title: 'Mối quan hệ giữa hoàn thiện năng lực cá nhân và trách nhiệm đóng góp cho cộng đồng',
    targetSkill: 'writing_thesis_arguments',
    targetSkillName: 'Lập luận biện chứng & phản biện trong bài văn 600 chữ',
    level: 'Vận dụng cao',
    estimatedMinutes: 60,
    type: 'writing_essay',
    sectionType: 'essay_600w',
    writingArgumentType: 'nghi_luan_xa_hoi',
    taskFormatLabel: 'Bài văn 600 chữ — 2.1. Nghị luận xã hội',
    rubricId: 'RUBRIC-ESSAY-NLXH-40',
    maxScore: 4.0,
    examTemplate: 'A',
    status: 'published',
    source: 'teacher_bank',
    promptId: 'prompt-8',
    defaultReason: 'Phát triển tư duy lập luận hai chiều, kết hợp dẫn chứng thực tế thuyết phục và bài học hành động của tuổi trẻ lớp 12.'
  },
  {
    id: 'ex-essay-nlvh-1',
    title: 'Vẻ đẹp của khát vọng cống hiến thầm lặng trong văn học Việt Nam hiện đại',
    targetSkill: 'writing_essay_600w',
    targetSkillName: 'Phân tích hình tượng & nghệ thuật trong bài văn NLVH 600 chữ',
    level: 'Vận dụng',
    estimatedMinutes: 60,
    type: 'writing_essay',
    sectionType: 'essay_600w',
    writingArgumentType: 'nghi_luan_van_hoc',
    taskFormatLabel: 'Bài văn 600 chữ — 2.2. Nghị luận văn học',
    rubricId: 'RUBRIC-ESSAY-NLVH-40',
    maxScore: 4.0,
    examTemplate: 'B',
    status: 'published',
    source: 'teacher_bank',
    promptId: 'prompt-4',
    defaultReason: 'Hoàn thiện kỹ năng phân tích hình tượng nhân vật gắn liền với đặc sắc nghệ thuật trong bài văn NLVH 600 chữ (4,0 điểm).'
  },
  {
    id: 'ex-essay-nlvh-2',
    title: 'Chiều sâu nhân đạo và tiếng nói thức tỉnh lương tri trong văn xuôi hiện đại',
    targetSkill: 'writing_essay_600w',
    targetSkillName: 'Phân tích thi pháp truyện ngắn & chiều sâu tư tưởng (600 chữ)',
    level: 'Vận dụng cao',
    estimatedMinutes: 60,
    type: 'writing_essay',
    sectionType: 'essay_600w',
    writingArgumentType: 'nghi_luan_van_hoc',
    taskFormatLabel: 'Bài văn 600 chữ — 2.2. Nghị luận văn học',
    rubricId: 'RUBRIC-ESSAY-NLVH-40',
    maxScore: 4.0,
    examTemplate: 'B',
    status: 'published',
    source: 'teacher_bank',
    promptId: 'prompt-9',
    defaultReason: 'Chinh phục mức điểm التốt (trên 3,0/4,0đ) phần bài văn NLVH thông qua phân tích tình huống truyện và tâm lý nhân vật.'
  },

  // --- ĐỀ CHƯA XUẤT BẢN / CHỜ GIÁO VIÊN KIỂM TRA (Không bao giờ xuất hiện trong gợi ý của học sinh) ---
  {
    id: 'ex-unverified-ai-draft',
    title: '[Chờ giáo viên kiểm tra] Đề tự động chưa gắn Rubric chuẩn',
    targetSkill: 'writing_expression_spelling',
    targetSkillName: 'Diễn đạt, liên kết và chính tả',
    level: 'Thông hiểu',
    estimatedMinutes: 20,
    type: 'writing_paragraph',
    sectionType: 'paragraph_200w',
    writingArgumentType: 'nghi_luan_xa_hoi',
    taskFormatLabel: 'Chờ giáo viên kiểm tra',
    rubricId: '',
    maxScore: 2.0,
    examTemplate: 'B',
    status: 'pending_teacher_review',
    source: 'ai_generated',
    defaultReason: 'Đề này chưa được giáo viên xác nhận Rubric nên hệ thống tự động chặn không hiển thị cho học sinh.'
  }
];

/**
 * Kiểm tra một mục trong EXERCISE_BANK có đủ điều kiện xuất bản và có Rubric giáo viên hợp lệ hay không
 */
export function isExerciseBankItemPublishedAndValid(item: ExerciseBankItem): boolean {
  if (item.status !== 'published' || item.source !== 'teacher_bank' || !item.rubricId) {
    return false;
  }

  if (item.sectionType === 'reading') {
    const passage = SAMPLE_READING_PASSAGES.find((p) => p.id === item.passageId);
    if (!passage) return false;
    return classifyReadingPassageItem(passage).isReadyForStudent;
  }

  const prompt = SAMPLE_WRITING_PROMPTS.find((p) => p.id === item.promptId);
  if (!prompt) return false;
  return classifyWritingPromptItem(prompt).isReadyForStudent;
}

export interface StructuredHomepageRecommendations {
  isInitialSurveyBasis: boolean;
  basisBadgeLabel: string;
  basisExplanation: string;
  readingRecommendations: PersonalizedRecommendation[];
  paragraphRecommendations: PersonalizedRecommendation[];
  essayRecommendations: PersonalizedRecommendation[];
}

/**
 * Sinh danh sách gợi ý "Bài luyện phù hợp với bạn" chia rõ 3 nhóm A (Đọc hiểu), B (Đoạn văn 200 chữ), C (Bài văn 600 chữ)
 * Chỉ lấy đề đã được giáo viên xuất bản từ ngân hàng đề và có Rubric hợp lệ (Yêu cầu 1 & 2).
 */
export function getStructuredPracticeRecommendations(
  survey: StudentSurveyData,
  readingAttempts: ReadingAttempt[],
  writingRecords: WritingSubmissionRecord[],
  filters: {
    readingTextType: ReadingTextType;
    paragraphArgumentType: 'nghi_luan_xa_hoi' | 'nghi_luan_van_hoc';
    essayArgumentType: 'nghi_luan_xa_hoi' | 'nghi_luan_van_hoc';
  },
  dismissedExerciseIds: string[] = []
): StructuredHomepageRecommendations {
  const analytics = analyzeStudentCompetency(survey, readingAttempts, writingRecords);
  const hasApprovedResults = analytics.teacherApprovedCount > 0;
  const isInitialSurveyBasis = !hasApprovedResults;

  const basisBadgeLabel = isInitialSurveyBasis
    ? 'Gợi ý ban đầu dựa trên tự đánh giá'
    : `Cá nhân hóa từ ${analytics.teacherApprovedCount} bài Giáo viên đã duyệt`;

  const basisExplanation = isInitialSurveyBasis
    ? 'Gợi ý ban đầu dựa trên tự đánh giá — Hệ thống chưa kết luận chắc chắn về năng lực cho đến khi có bài làm thực tế được giáo viên xác nhận.'
    : 'Độ khó và mục tiêu kĩ năng được điều chỉnh trực tiếp dựa trên điểm Giáo viên đã xác nhận và các câu/tiêu chí bạn thường mất điểm.';

  // Chỉ lấy đề ngân hàng Giáo viên đã xuất bản và có Rubric hợp lệ
  const publishedValidItems = EXERCISE_BANK.filter(
    (item) => isExerciseBankItemPublishedAndValid(item) && !dismissedExerciseIds.includes(item.id)
  );

  // Phát hiện mức độ câu đọc hiểu học sinh thường mất điểm (nếu có)
  const weakReadingQuestionLevel = (() => {
    const lowAttempts = readingAttempts.filter((a) => {
      const score = a.feedback.teacherConfirmedScore ?? a.feedback.aiSuggestedScore;
      return (typeof score === 'number' && score < 0.6) || a.feedback.missingPoints.length >= 2;
    });
    if (lowAttempts.length > 0) {
      return lowAttempts[0].questionLevel || 'thong_hieu';
    }
    return null;
  })();

  const toRecommendation = (item: ExerciseBankItem, customReason: string): PersonalizedRecommendation => ({
    id: item.id,
    title: item.title,
    targetSkill: item.targetSkill,
    targetSkillName: item.targetSkillName,
    reason: customReason,
    level: item.level,
    estimatedMinutes: item.estimatedMinutes,
    type: item.type,
    sectionType: item.sectionType,
    readingTextType: item.readingTextType,
    writingArgumentType: item.writingArgumentType,
    taskFormatLabel: item.taskFormatLabel,
    rubricId: item.rubricId,
    maxScore: item.maxScore,
    examTemplate: item.examTemplate,
    isInitialSurveyBased: isInitialSurveyBasis,
    source: 'teacher_bank',
    sourceBadge: `Đề ngân hàng Giáo viên xuất bản · Mã Rubric: ${item.rubricId}`,
    passageId: item.passageId,
    promptId: item.promptId,
    difficultyTone: item.level === 'Vận dụng cao' ? 'challenge' : 'target_gap'
  });

  // A. ĐỌC HIỂU: Lọc đúng loại văn bản (van_hoc | nghi_luan | thong_tin)
  const readingItems = publishedValidItems.filter(
    (item) => item.sectionType === 'reading' && item.readingTextType === filters.readingTextType
  );
  const readingOfficialScore = analytics.sectionProgress.reading.officialMastery.rawScore;
  const readingRecommendations = readingItems.map((item) => {
    let reason = item.defaultReason;
    if (isInitialSurveyBasis) {
      const selfConf = survey.skillConfidence[item.targetSkill] || 3;
      reason = `[Gợi ý ban đầu dựa trên tự đánh giá (${selfConf}/5)]: ${item.defaultReason}`;
    } else if (readingOfficialScore !== null) {
      if (readingOfficialScore <= 2.0) {
        reason = `Điểm Đọc hiểu GV duyệt hiện đạt ${readingOfficialScore.toFixed(1).replace('.', ',')}/4,0đ (Cần củng cố). ${item.defaultReason}`;
      } else if (weakReadingQuestionLevel) {
        reason = `Tập trung khắc phục câu hỏi mức ${weakReadingQuestionLevel === 'nhan_biet' ? 'Nhận biết' : weakReadingQuestionLevel === 'thong_hieu' ? 'Thông hiểu' : 'Vận dụng'} bạn thường mất điểm. ${item.defaultReason}`;
      } else {
        reason = `Phát huy kết quả Đọc hiểu (${readingOfficialScore.toFixed(1).replace('.', ',')}/4,0đ) để rèn sâu ${item.taskFormatLabel.toLowerCase()}.`;
      }
    }
    return toRecommendation(item, reason);
  });

  // B. ĐOẠN VĂN 200 CHỮ: Lọc riêng 2.1 NLXH hoặc 2.2 NLVH (tuyệt đối không trộn lẫn)
  const paragraphItems = publishedValidItems.filter(
    (item) =>
      item.sectionType === 'paragraph_200w' &&
      item.writingArgumentType === filters.paragraphArgumentType
  );
  const paragraphOfficialScore = analytics.sectionProgress.paragraph.officialMastery.rawScore;
  const paragraphRecommendations = paragraphItems.map((item) => {
    let reason = item.defaultReason;
    if (isInitialSurveyBasis) {
      const selfConf = survey.skillConfidence[item.targetSkill] || 3;
      reason = `[Gợi ý ban đầu dựa trên tự đánh giá (${selfConf}/5)]: ${item.defaultReason}`;
    } else if (paragraphOfficialScore !== null) {
      reason =
        paragraphOfficialScore <= 1.0
          ? `Điểm Đoạn văn 200 chữ GV duyệt hiện đạt ${paragraphOfficialScore.toFixed(2).replace('.', ',')}/2,0đ (Cần củng cố). ${item.defaultReason}`
          : `Nâng cấp kĩ năng "${item.targetSkillName}" từ mức ${paragraphOfficialScore.toFixed(2).replace('.', ',')}/2,0đ lên mốc Tốt (trên 1,5đ).`;
    }
    return toRecommendation(item, reason);
  });

  // C. BÀI VĂN 600 CHỮ: Lọc riêng 2.1 NLXH hoặc 2.2 NLVH (tuyệt đối không trộn lẫn)
  const essayItems = publishedValidItems.filter(
    (item) =>
      item.sectionType === 'essay_600w' &&
      item.writingArgumentType === filters.essayArgumentType
  );
  const essayOfficialScore = analytics.sectionProgress.essay.officialMastery.rawScore;
  const essayRecommendations = essayItems.map((item) => {
    let reason = item.defaultReason;
    if (isInitialSurveyBasis) {
      const selfConf = survey.skillConfidence[item.targetSkill] || 3;
      reason = `[Gợi ý ban đầu dựa trên tự đánh giá (${selfConf}/5)]: ${item.defaultReason}`;
    } else if (essayOfficialScore !== null) {
      reason =
        essayOfficialScore <= 2.0
          ? `Điểm Bài văn 600 chữ GV duyệt hiện đạt ${essayOfficialScore.toFixed(2).replace('.', ',')}/4,0đ (Cần củng cố). ${item.defaultReason}`
          : `Tối ưu hóa kĩ năng "${item.targetSkillName}" để bứt phá mốc Tốt (trên 3,0/4,0đ).`;
    }
    return toRecommendation(item, reason);
  });

  return {
    isInitialSurveyBasis,
    basisBadgeLabel,
    basisExplanation,
    readingRecommendations,
    paragraphRecommendations,
    essayRecommendations
  };
}

export function generatePersonalizedRecommendations(
  survey: StudentSurveyData,
  readingAttempts: ReadingAttempt[],
  writingRecords: WritingSubmissionRecord[],
  dismissedExerciseIds: string[] = []
): PersonalizedRecommendation[] {
  const analytics = analyzeStudentCompetency(survey, readingAttempts, writingRecords);
  const isInitialSurveyBasis = analytics.teacherApprovedCount === 0;
  const prioritizedSkills = analytics.prioritySkillsToImprove.map((p) => p.key);

  // Chỉ lấy các đề đã được giáo viên xuất bản và có Rubric hợp lệ
  const availableExercises = EXERCISE_BANK.filter(
    (ex) => isExerciseBankItemPublishedAndValid(ex) && !dismissedExerciseIds.includes(ex.id)
  );

  const recommendations: PersonalizedRecommendation[] = [];

  prioritizedSkills.forEach((priorityKey) => {
    const matched = availableExercises.find((ex) => ex.targetSkill === priorityKey);
    if (matched && !recommendations.some((r) => r.id === matched.id)) {
      const priorityInfo = analytics.prioritySkillsToImprove.find((p) => p.key === priorityKey);
      recommendations.push({
        id: matched.id,
        title: matched.title,
        targetSkill: matched.targetSkill,
        targetSkillName: matched.targetSkillName,
        reason: isInitialSurveyBasis
          ? `[Gợi ý ban đầu dựa trên tự đánh giá]: ${priorityInfo ? priorityInfo.reason : matched.defaultReason}`
          : priorityInfo
          ? `Mục tiêu ưu tiên: ${priorityInfo.reason}`
          : matched.defaultReason,
        level: matched.level,
        estimatedMinutes: matched.estimatedMinutes,
        type: matched.type,
        sectionType: matched.sectionType,
        readingTextType: matched.readingTextType,
        writingArgumentType: matched.writingArgumentType,
        taskFormatLabel: matched.taskFormatLabel,
        rubricId: matched.rubricId,
        maxScore: matched.maxScore,
        examTemplate: matched.examTemplate,
        isInitialSurveyBased: isInitialSurveyBasis,
        source: 'teacher_bank',
        sourceBadge: `Đề ngân hàng Giáo viên xuất bản · Mã Rubric: ${matched.rubricId}`,
        passageId: matched.passageId,
        promptId: matched.promptId,
        difficultyTone: 'target_gap'
      });
    }
  });

  for (const ex of availableExercises) {
    if (recommendations.length >= 4) break;
    if (!recommendations.some((r) => r.id === ex.id)) {
      recommendations.push({
        id: ex.id,
        title: ex.title,
        targetSkill: ex.targetSkill,
        targetSkillName: ex.targetSkillName,
        reason: isInitialSurveyBasis
          ? `[Gợi ý ban đầu dựa trên tự đánh giá]: ${ex.defaultReason}`
          : ex.defaultReason,
        level: ex.level,
        estimatedMinutes: ex.estimatedMinutes,
        type: ex.type,
        sectionType: ex.sectionType,
        readingTextType: ex.readingTextType,
        writingArgumentType: ex.writingArgumentType,
        taskFormatLabel: ex.taskFormatLabel,
        rubricId: ex.rubricId,
        maxScore: ex.maxScore,
        examTemplate: ex.examTemplate,
        isInitialSurveyBased: isInitialSurveyBasis,
        source: 'teacher_bank',
        sourceBadge: `Đề ngân hàng Giáo viên xuất bản · Mã Rubric: ${ex.rubricId}`,
        passageId: ex.passageId,
        promptId: ex.promptId,
        difficultyTone: 'reinforce'
      });
    }
  }

  return recommendations.slice(0, 4);
}

// ============================================================================
// TÍNH NĂNG "LUYỆN TẬP NHANH" (QUICK PRACTICE) TRÊN TRANG CHỦ
// Chọn nhanh kỹ năng (Đọc hiểu hoặc Viết) và lấy ngẫu nhiên bài tập theo mức độ ưu tiên
// ============================================================================

export type QuickPracticeSkillFocus =
  | 'reading'
  | 'writing'
  | 'writing_paragraph'
  | 'writing_essay';

export interface QuickPracticeSelectionResult {
  selectedExercise: PersonalizedRecommendation;
  skillFocus: QuickPracticeSkillFocus;
  priorityBadge: 'Ưu tiên cao nhất' | 'Ưu tiên củng cố' | 'Luyện tập chuẩn';
  priorityScore: number;
  matchingPoolCount: number;
}

/**
 * Chọn ngẫu nhiên một bài tập đã xuất bản (có Rubric hợp lệ) theo kỹ năng người dùng chọn
 * ('reading' hoặc 'writing'), có trọng số ưu tiên dựa trên hệ thống phân tích năng lực & gợi ý.
 */
export function pickPriorityRandomQuickExercise(
  skillFocus: QuickPracticeSkillFocus,
  survey: StudentSurveyData,
  readingAttempts: ReadingAttempt[],
  writingRecords: WritingSubmissionRecord[],
  excludeExerciseId?: string
): QuickPracticeSelectionResult | null {
  const analytics = analyzeStudentCompetency(survey, readingAttempts, writingRecords);
  const isInitialSurveyBasis = analytics.teacherApprovedCount === 0;

  // Chỉ lấy đề ngân hàng Giáo viên đã xuất bản và có Rubric hợp lệ
  const allPublishedValid = EXERCISE_BANK.filter((item) => isExerciseBankItemPublishedAndValid(item));

  // Lọc theo kỹ năng người dùng chọn (Đọc hiểu hoặc Viết)
  const categoryFiltered = allPublishedValid.filter((item) => {
    if (skillFocus === 'reading') {
      return item.sectionType === 'reading';
    }
    if (skillFocus === 'writing_paragraph') {
      return item.sectionType === 'paragraph_200w';
    }
    if (skillFocus === 'writing_essay') {
      return item.sectionType === 'essay_600w';
    }
    // 'writing' bao gồm cả Đoạn văn 200 chữ và Bài văn 600 chữ
    return item.sectionType === 'paragraph_200w' || item.sectionType === 'essay_600w';
  });

  if (categoryFiltered.length === 0) {
    return null;
  }

  // Nếu có nhiều hơn 1 bài trong nhóm, loại trừ bài vừa chọn để mỗi lần bấm ngẫu nhiên luôn đổi bài mới
  const candidatePool =
    excludeExerciseId && categoryFiltered.length > 1
      ? categoryFiltered.filter((item) => item.id !== excludeExerciseId)
      : categoryFiltered;

  const attemptedPassageTitles = new Set(readingAttempts.map((a) => a.passageTitle));
  const attemptedPromptIds = new Set(writingRecords.map((w) => w.promptId));

  // Chấm điểm mức độ ưu tiên cho từng đề ứng viên
  const scoredCandidates = candidatePool.map((item) => {
    let priorityScore = 10; // Điểm nền
    let customReason = item.defaultReason;
    let priorityBadge: QuickPracticeSelectionResult['priorityBadge'] = 'Luyện tập chuẩn';

    // 1. Khớp danh sách kỹ năng cần cải thiện từ hệ thống gợi ý (prioritySkillsToImprove)
    const matchedPrioritySkill = analytics.prioritySkillsToImprove.find(
      (p) => p.key === item.targetSkill
    );
    if (matchedPrioritySkill) {
      if (matchedPrioritySkill.urgency === 'high') {
        priorityScore += 60;
        priorityBadge = 'Ưu tiên cao nhất';
      } else {
        priorityScore += 35;
        priorityBadge = 'Ưu tiên củng cố';
      }
      customReason = isInitialSurveyBasis
        ? `[Gợi ý ban đầu dựa trên tự đánh giá]: ${matchedPrioritySkill.reason}`
        : `Ưu tiên từ hệ thống gợi ý: ${matchedPrioritySkill.reason}`;
    }

    // 2. Xét mức độ đạt hiện tại của phần tương ứng (ưu tiên phần đang ở mức Trung bình / cần củng cố)
    const sectionDetail =
      item.sectionType === 'reading'
        ? analytics.sectionProgress.reading
        : item.sectionType === 'paragraph_200w'
        ? analytics.sectionProgress.paragraph
        : analytics.sectionProgress.essay;

    if (sectionDetail.officialMastery.tier === 'trung_binh') {
      priorityScore += 45;
      priorityBadge = 'Ưu tiên cao nhất';
      if (!matchedPrioritySkill && sectionDetail.officialMastery.rawScore !== null) {
        customReason = `Điểm ${sectionDetail.sectionTitle} hiện đạt ${sectionDetail.officialMastery.formattedRawScore} (Cần củng cố). ${item.defaultReason}`;
      }
    } else if (sectionDetail.officialMastery.tier === 'kha') {
      priorityScore += 20;
      if (priorityBadge === 'Luyện tập chuẩn') {
        priorityBadge = 'Ưu tiên củng cố';
      }
    }

    // 3. Ưu tiên đề học sinh chưa từng làm để trải nghiệm đa dạng ngữ liệu
    const isUnattempted =
      item.sectionType === 'reading'
        ? !attemptedPassageTitles.has(item.title)
        : Boolean(item.promptId && !attemptedPromptIds.has(item.promptId));

    if (isUnattempted) {
      priorityScore += 25;
    }

    // 4. Khớp mục tiêu tự chọn trong khảo sát nhanh (nếu chưa có điểm GV duyệt)
    if (isInitialSurveyBasis) {
      const confidence = survey.skillConfidence[item.targetSkill];
      if (typeof confidence === 'number' && confidence <= 2) {
        priorityScore += 30;
        priorityBadge = 'Ưu tiên cao nhất';
      }
      if (
        (survey.quickFocusArea === 'reading' && item.sectionType === 'reading') ||
        (survey.quickFocusArea === 'paragraph_200w' && item.sectionType === 'paragraph_200w') ||
        (survey.quickFocusArea === 'essay_600w' && item.sectionType === 'essay_600w')
      ) {
        priorityScore += 20;
      }
      if (!customReason.startsWith('[Gợi ý ban đầu')) {
        customReason = `[Gợi ý ban đầu dựa trên tự đánh giá]: ${customReason}`;
      }
    }

    return {
      item,
      priorityScore,
      priorityBadge,
      customReason
    };
  });

  // Sắp xếp theo điểm ưu tiên giảm dần
  scoredCandidates.sort((a, b) => b.priorityScore - a.priorityScore);

  // Lấy nhóm ứng viên có mức ưu tiên cao (trong biên độ 35 điểm so với bài cao nhất) để chọn ngẫu nhiên có trọng số
  const maxPriority = scoredCandidates[0].priorityScore;
  const topPriorityPool = scoredCandidates.filter((c) => c.priorityScore >= maxPriority - 35);

  const totalWeight = topPriorityPool.reduce((sum, c) => sum + c.priorityScore, 0);
  let randomCursor = Math.random() * totalWeight;
  let chosen = topPriorityPool[0];

  for (const candidate of topPriorityPool) {
    randomCursor -= candidate.priorityScore;
    if (randomCursor <= 0) {
      chosen = candidate;
      break;
    }
  }

  const rec: PersonalizedRecommendation = {
    id: chosen.item.id,
    title: chosen.item.title,
    targetSkill: chosen.item.targetSkill,
    targetSkillName: chosen.item.targetSkillName,
    reason: chosen.customReason,
    level: chosen.item.level,
    estimatedMinutes: chosen.item.estimatedMinutes,
    type: chosen.item.type,
    sectionType: chosen.item.sectionType,
    readingTextType: chosen.item.readingTextType,
    writingArgumentType: chosen.item.writingArgumentType,
    taskFormatLabel: chosen.item.taskFormatLabel,
    rubricId: chosen.item.rubricId,
    maxScore: chosen.item.maxScore,
    examTemplate: chosen.item.examTemplate,
    isInitialSurveyBased: isInitialSurveyBasis,
    source: 'teacher_bank',
    sourceBadge: `Đề ngân hàng Giáo viên xuất bản · Mã Rubric: ${chosen.item.rubricId}`,
    passageId: chosen.item.passageId,
    promptId: chosen.item.promptId,
    difficultyTone: chosen.item.level === 'Vận dụng cao' ? 'challenge' : 'target_gap'
  };

  return {
    selectedExercise: rec,
    skillFocus,
    priorityBadge: chosen.priorityBadge,
    priorityScore: chosen.priorityScore,
    matchingPoolCount: categoryFiltered.length
  };
}

