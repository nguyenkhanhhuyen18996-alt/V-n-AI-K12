import {
  CompleteExam,
  CompleteExamQuestion,
  CompleteExamWritingTask,
  ExamTemplateType,
  ExtractionStatus,
  VerificationFlag,
  ExamConsistencyReport,
  CognitiveLevel,
  CriterionEvaluation
} from '../types';
import { isVerifiedTeacherSession } from './accountService';


/**
 * Định dạng số điểm theo chuẩn tiếng Việt sử dụng dấu phẩy thập phân
 * Ví dụ: 0.3 -> "0,3", 0.5 -> "0,5", 1 -> "1,0", 4 -> "4,0", 10 -> "10,0"
 */
export function formatVNDecimal(num: number | undefined | null): string {
  if (num === undefined || num === null || isNaN(num)) return '0,0';
  const fixed = Number(num).toFixed(1);
  return fixed.replace('.', ',');
}

/**
 * Các mức điểm thành phần chuẩn theo quy định: 0đ, 0,3đ, 0,5đ, 0,8đ, 1,0đ
 */
export const STANDARD_SCORE_STEPS = [0, 0.3, 0.5, 0.8, 1.0];

/**
 * Sinh Rubric dự thảo chuẩn THPT cho Đoạn văn ~200 chữ (Tổng: 2,0 điểm)
 */
export function generateDraftParagraphRubric(
  type: 'nghi_luan_xa_hoi' | 'nghi_luan_van_hoc'
): CriterionEvaluation[] {
  return [
    {
      id: 'crit-p1',
      name: '1. Đảm bảo thể thức đoạn văn ~200 chữ',
      weightLabel: '0,25 điểm',
      scoreLevel: 'Đạt cơ bản',
      scoreStatus: 'info',
      strengths: 'Đúng hình thức 1 đoạn văn (không ngắt dòng tùy tiện), dung lượng trong khoảng 180 - 250 từ.',
      weaknesses: 'Xuống dòng hoặc viết quá ngắn/quá dài so với yêu cầu.',
      remedyStep: 'Chỉ chấm xuống dòng khi kết thúc toàn bộ đoạn văn.',
      scoreAwarded: 0.25,
      maxCriterionScore: 0.25
    },
    {
      id: 'crit-p2',
      name: type === 'nghi_luan_xa_hoi'
        ? '2. Xác định đúng vấn đề nghị luận xã hội'
        : '2. Xác định đúng khía cạnh nội dung/nghệ thuật văn học',
      weightLabel: '0,25 điểm',
      scoreLevel: 'Đạt cơ bản',
      scoreStatus: 'info',
      strengths: 'Xác định trúng trọng tâm câu hỏi của đề bài, tránh lan man.',
      weaknesses: 'Hiểu sai hoặc lạc đề.',
      remedyStep: 'Mở đoạn trực tiếp bằng việc nêu vấn đề được yêu cầu trong đề.',
      scoreAwarded: 0.25,
      maxCriterionScore: 0.25
    },
    {
      id: 'crit-p3',
      name: '3. Triển khai luận điểm, lí lẽ và dẫn chứng thuyết phục',
      weightLabel: '1,0 điểm',
      scoreLevel: 'Đạt cơ bản',
      scoreStatus: 'info',
      strengths: 'Lí lẽ sắc bén, có dẫn chứng thực tế sống động (hoặc dẫn chứng văn học tiêu biểu), lập luận logic.',
      weaknesses: 'Lí lẽ chung chung, thiếu dẫn chứng hoặc dẫn chứng không tiêu biểu.',
      remedyStep: 'Đưa ít nhất 1 dẫn chứng cụ thể kèm theo câu bình phân tích ý nghĩa.',
      scoreAwarded: 1.0,
      maxCriterionScore: 1.0
    },
    {
      id: 'crit-p4',
      name: '4. Chính tả, ngữ pháp và sáng tạo diễn đạt',
      weightLabel: '0,5 điểm',
      scoreLevel: 'Đạt cơ bản',
      scoreStatus: 'info',
      strengths: 'Dùng từ chính xác, câu văn truyền cảm, có suy nghĩ sâu sắc hoặc phát hiện mới mẻ.',
      weaknesses: 'Mắc lỗi dùng từ, câu văn gãy khúc hoặc lặp từ.',
      remedyStep: 'Soát lại dấu câu và thêm liên từ liên kết các câu mạch lạc.',
      scoreAwarded: 0.5,
      maxCriterionScore: 0.5
    }
  ];
}

/**
 * Sinh Rubric dự thảo chuẩn THPT cho Bài văn ~600 chữ (Tổng: 4,0 điểm)
 */
export function generateDraftEssayRubric(
  type: 'nghi_luan_xa_hoi' | 'nghi_luan_van_hoc'
): CriterionEvaluation[] {
  return [
    {
      id: 'crit-e1',
      name: '1. Đảm bảo cấu trúc bài văn nghị luận (Mở - Thân - Kết)',
      weightLabel: '0,5 điểm',
      scoreLevel: 'Đạt cơ bản',
      scoreStatus: 'info',
      strengths: 'Mở bài giới thiệu vấn đề; Thân bài triển khai hệ thống luận điểm; Kết bài khái quát và đọng lại dư ba.',
      weaknesses: 'Thiếu mở bài/kết bài hoặc các đoạn thân bài không tách bạch.',
      remedyStep: 'Bố cục rõ ràng tối thiểu 3 phần với các đoạn văn thân bài mạch lạc.',
      scoreAwarded: 0.5,
      maxCriterionScore: 0.5
    },
    {
      id: 'crit-e2',
      name: type === 'nghi_luan_van_hoc'
        ? '2. Xác định và giải mã đúng vấn đề cảm thụ / phân tích văn học'
        : '2. Xác định trúng tầm vóc tư tưởng / hiện tượng đời sống',
      weightLabel: '0,5 điểm',
      scoreLevel: 'Đạt cơ bản',
      scoreStatus: 'info',
      strengths: 'Nắm chắc ngữ liệu nguồn, định hình được hướng tiếp cận sâu sắc.',
      weaknesses: 'Chỉ tóm tắt nội dung đơn thuần hoặc bình luận hời hợt.',
      remedyStep: 'Nêu bật được giá trị cốt lõi tác phẩm / thông điệp xã hội ngay từ mở bài.',
      scoreAwarded: 0.5,
      maxCriterionScore: 0.5
    },
    {
      id: 'crit-e3',
      name: '3. Triển khai luận điểm đa chiều, phân tích dẫn chứng thấu đáo',
      weightLabel: '2,0 điểm',
      scoreLevel: 'Đạt cơ bản',
      scoreStatus: 'info',
      strengths: 'Chia tách thành các luận điểm rõ ràng; kết hợp nhuần nhuyễn lí lẽ và dẫn chứng; có góc nhìn phản đề.',
      weaknesses: 'Các ý trùng lặp, thiếu dẫn chứng chứng minh hoặc dẫn chứng không phân tích.',
      remedyStep: 'Mỗi luận điểm cần đi theo cấu trúc: Luận điểm -> Lí lẽ -> Dẫn chứng -> Đánh giá.',
      scoreAwarded: 2.0,
      maxCriterionScore: 2.0
    },
    {
      id: 'crit-e4',
      name: '4. Diễn đạt lưu loát, liên kết câu đoạn và sáng tạo phong cách',
      weightLabel: '1,0 điểm',
      scoreLevel: 'Đạt cơ bản',
      scoreStatus: 'info',
      strengths: 'Giọng văn giàu cảm xúc, câu văn biến hóa nhịp điệu, có chiều sâu suy tưởng mang dấu ấn cá nhân.',
      weaknesses: 'Lối viết sáo mòn, mắc lỗi diễn đạt hoặc từ ngữ thiếu chọn lọc.',
      remedyStep: 'Vận dụng các thao tác so sánh, liên hệ văn học/đời sống để tạo sức gợi.',
      scoreAwarded: 1.0,
      maxCriterionScore: 1.0
    }
  ];
}

/**
 * Kiểm tra tính nhất quán điểm (Consistency Validator)
 */
export function validateExamConsistency(
  readingQuestions: CompleteExamQuestion[],
  paragraphTask: CompleteExamWritingTask,
  essayTask: CompleteExamWritingTask,
  expectedTotal: number = 10.0
): ExamConsistencyReport {
  const readingSum = readingQuestions.reduce((acc, q) => acc + (q.maxScore || 0), 0);
  const paragraphSum = paragraphTask.maxScore || 0;
  const essaySum = essayTask.maxScore || 0;
  const overallSum = Number((readingSum + paragraphSum + essaySum).toFixed(2));

  const discrepancies: string[] = [];
  const suggestedFixes: string[] = [];

  // Kiểm tra phần Đọc hiểu (chuẩn: 4.0 điểm)
  if (Math.abs(readingSum - 4.0) > 0.05) {
    discrepancies.push(
      `Tổng điểm phần Đọc hiểu hiện là ${formatVNDecimal(readingSum)}đ, chưa khớp chuẩn 4,0 điểm (${
        readingSum < 4.0 ? 'thiếu ' + formatVNDecimal(4.0 - readingSum) + 'đ' : 'thừa ' + formatVNDecimal(readingSum - 4.0) + 'đ'
      }).`
    );
    suggestedFixes.push(
      `Điều chỉnh điểm các câu hỏi đọc hiểu (ví dụ: Câu 1: 0,75đ, Câu 2: 0,75đ, Câu 3: 1,0đ, Câu 4: 1,5đ) để đạt tròn 4,0đ.`
    );
  }

  // Kiểm tra đoạn văn ~200 chữ (chuẩn: 2.0 điểm)
  if (Math.abs(paragraphSum - 2.0) > 0.05) {
    discrepancies.push(
      `Điểm tối đa đoạn văn ~200 chữ là ${formatVNDecimal(paragraphSum)}đ, khác chuẩn 2,0 điểm.`
    );
    suggestedFixes.push(`Thiết lập điểm tối đa cho đoạn văn là 2,0 điểm theo cấu trúc đề thi tốt nghiệp THPT.`);
  }

  // Kiểm tra bài văn ~600 chữ (chuẩn: 4.0 điểm)
  if (Math.abs(essaySum - 4.0) > 0.05) {
    discrepancies.push(
      `Điểm tối đa bài văn ~600 chữ là ${formatVNDecimal(essaySum)}đ, khác chuẩn 4,0 điểm.`
    );
    suggestedFixes.push(`Thiết lập điểm tối đa cho bài văn là 4,0 điểm theo cấu trúc đề thi tốt nghiệp THPT.`);
  }

  // Kiểm tra tổng bài
  if (Math.abs(overallSum - expectedTotal) > 0.05) {
    discrepancies.push(
      `Tổng điểm toàn đề là ${formatVNDecimal(overallSum)}đ, không khớp với tổng chuẩn ${formatVNDecimal(expectedTotal)} điểm.`
    );
    suggestedFixes.push(`Rà soát lại phân bổ điểm giữa Đọc hiểu (4,0đ), Đoạn văn (2,0đ) và Bài văn (4,0đ).`);
  }

  return {
    isValid: discrepancies.length === 0,
    readingScoreSum: Number(readingSum.toFixed(2)),
    paragraphScoreSum: Number(paragraphSum.toFixed(2)),
    essayScoreSum: Number(essaySum.toFixed(2)),
    overallScoreSum: overallSum,
    expectedTotal: expectedTotal,
    discrepancies,
    suggestedFixes
  };
}

/**
 * Thuật toán phân tích đề hoàn chỉnh từ văn bản thô (Tự động đọc, phân chia, nhận diện)
 */
export function parseCompleteExamText(
  rawExamText: string,
  rawGuideText?: string
): CompleteExam {
  const cleanRaw = rawExamText.trim();
  const cleanGuide = (rawGuideText || '').trim();
  const verificationFlags: VerificationFlag[] = [];

  // 1. Nhận diện tiêu đề đề thi & mã đề
  let title = 'Đề luyện thi Tốt nghiệp THPT môn Ngữ văn';
  const titleMatch = cleanRaw.match(/(KỲ THI[^]+?(?=PHẦN|ĐỌC HIỂU|I\.|$)|ĐỀ THI[^]+?(?=PHẦN|ĐỌC HIỂU|I\.|$)|BỘ GIÁO DỤC[^]+?(?=PHẦN|ĐỌC HIỂU|I\.|$))/i);
  if (titleMatch) {
    const lines = titleMatch[0].split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length > 0) {
      title = lines.slice(0, 3).join(' — ').replace(/\s+/g, ' ');
    }
  }

  // 2. Nhận diện thời gian làm bài
  let durationMinutes = 120;
  const timeMatch = cleanRaw.match(/Thời gian làm bài:\s*(\d+)\s*phút/i) || cleanRaw.match(/(\d+)\s*phút/i);
  if (timeMatch && timeMatch[1]) {
    durationMinutes = parseInt(timeMatch[1], 10);
  }

  // 3. Phân tách Phần I (Đọc hiểu) và Phần II (Làm văn / Viết)
  const part1Regex = /(?:PHẦN\s*I|I\.)\s*(?:[:.]|\s+)?\s*ĐỌC\s*HIỂU/i;
  const part2Regex = /(?:PHẦN\s*II|II\.)\s*(?:[:.]|\s+)?\s*(?:VIẾT|LÀM\s*VĂN)/i;

  const part1Index = cleanRaw.search(part1Regex);
  const part2Index = cleanRaw.search(part2Regex);

  let readingSectionRaw = '';
  let writingSectionRaw = '';

  if (part1Index >= 0 && part2Index > part1Index) {
    readingSectionRaw = cleanRaw.substring(part1Index, part2Index);
    writingSectionRaw = cleanRaw.substring(part2Index);
  } else if (part1Index >= 0) {
    readingSectionRaw = cleanRaw.substring(part1Index);
  } else {
    // Không tìm thấy cờ hiệu rõ ràng, chia theo heuristic
    const half = Math.floor(cleanRaw.length * 0.55);
    readingSectionRaw = cleanRaw.substring(0, half);
    writingSectionRaw = cleanRaw.substring(half);
    verificationFlags.push({
      id: 'flag-parts-split',
      targetField: 'parts_separation',
      fieldLabel: 'Phân định Phần I và Phần II',
      status: 'needs_teacher_confirm',
      originalSnippet: cleanRaw.slice(0, 150) + '...',
      reason: 'Đề bài không có tiêu đề "PHẦN I. ĐỌC HIỂU" và "PHẦN II. LÀM VĂN" chuẩn.',
      suggestedResolution: 'Hệ thống đã tự động chia theo ngữ liệu và câu hỏi. Vui lòng kiểm tra lại ranh giới 2 phần.',
      isResolved: false
    });
  }

  // 4. Trích xuất Ngữ liệu đọc hiểu (Passage Content, Author, Source, Genre)
  let passageContent = '';
  let passageTitle = 'Văn bản đọc hiểu';
  let passageAuthor = 'Tác giả';
  let passageSource = 'Nguồn trích';
  let passageGenre: 'van_hoc' | 'nghi_luan' | 'thong_tin' | 'tuy_chinh' = 'van_hoc';
  let genreName = 'Văn bản văn học';

  // Tìm vị trí bắt đầu câu hỏi đầu tiên (Câu 1. / Câu 1:)
  const firstQuestionMatch = readingSectionRaw.search(/Câu\s*1\s*[:.]/i);
  let passageRawBlock = '';
  let questionsRawBlock = '';

  if (firstQuestionMatch >= 0) {
    passageRawBlock = readingSectionRaw.substring(0, firstQuestionMatch);
    questionsRawBlock = readingSectionRaw.substring(firstQuestionMatch);
  } else {
    passageRawBlock = readingSectionRaw;
    questionsRawBlock = '';
  }

  // Lọc lấy nội dung ngữ liệu thực tế
  const passageLines = passageRawBlock.split('\n').map(l => l.trim()).filter(Boolean);
  const filteredPassageLines = passageLines.filter(l =>
    !l.match(/^(PHẦN\s*I|I\.|ĐỌC\s*HIỂU|Đọc\s*đoạn\s*trích|Đọc\s*văn\s*bản|Thực\s*hiện\s*các\s*yêu\s*cầu)/i)
  );

  passageContent = filteredPassageLines.join('\n\n');

  // Tìm tác giả và nguồn trích (thường ở cuối văn bản dạng "(Theo...)" hoặc "(Trích...)")
  const sourceMatch = passageContent.match(/\((?:Theo|Trích|Nguồn)[^)]+\)/i);
  if (sourceMatch) {
    passageSource = sourceMatch[0].replace(/[()]/g, '').trim();
    // Tách tác giả nếu có
    const authorMatch = passageSource.match(/(?:của|tác giả)\s+([^,]+)/i);
    if (authorMatch) {
      passageAuthor = authorMatch[1].trim();
    } else {
      const parts = passageSource.split(/[,-]/);
      if (parts.length > 1) passageAuthor = parts[0].replace(/^(Theo|Trích)\s*/i, '').trim();
    }
  }

  // Nhận diện thể loại ngữ liệu (Văn học vs Thông tin vs Nghị luận)
  const lowerPassage = passageContent.toLowerCase();
  if (
    lowerPassage.includes('theo số liệu') ||
    lowerPassage.includes('thống kê') ||
    lowerPassage.includes('báo cáo') ||
    lowerPassage.includes('nghiên cứu cho thấy') ||
    lowerPassage.includes('công nghệ') ||
    lowerPassage.includes('chuyển đổi số')
  ) {
    passageGenre = 'thong_tin';
    genreName = 'Văn bản thông tin';
  } else if (
    lowerPassage.includes('tôi cho rằng') ||
    lowerPassage.includes('quan điểm') ||
    lowerPassage.includes('nghị luận') ||
    lowerPassage.includes('bàn về') ||
    lowerPassage.includes('luận điểm')
  ) {
    passageGenre = 'nghi_luan';
    genreName = 'Văn bản nghị luận';
  } else {
    passageGenre = 'van_hoc';
    genreName = 'Văn bản văn học (Thơ / Truyện / Tản văn)';
  }

  // 5. Trích xuất các câu hỏi Đọc hiểu (Câu 1, Câu 2, Câu 3, Câu 4...)
  const questionMatches = questionsRawBlock.split(/(?=Câu\s*\d+\s*[:.])/i).filter(b => b.trim().length > 5);
  const parsedQuestions: CompleteExamQuestion[] = [];

  const defaultLevels: CognitiveLevel[] = ['nhan_biet', 'thong_hieu', 'van_dung', 'van_dung_cao'];
  const defaultScores = [0.75, 0.75, 1.0, 1.5]; // Tổng: 4.0 điểm

  questionMatches.forEach((qBlock, idx) => {
    const qOrder = idx + 1;
    const cleanQText = qBlock.replace(/^Câu\s*\d+\s*[:.]/i, '').trim();

    // Nhận diện điểm câu hỏi nếu có trong đề (ví dụ "(0.75 điểm)" hoặc "(1,0 điểm)")
    let detectedScore: number | undefined;
    const scoreMatch = cleanQText.match(/\((\d+(?:[.,]\d+)?)\s*điểm\)/i);
    if (scoreMatch) {
      detectedScore = parseFloat(scoreMatch[1].replace(',', '.'));
    }

    let extractionStatus: ExtractionStatus = 'extracted_clear';
    let verificationReason: string | undefined;

    if (detectedScore === undefined) {
      detectedScore = defaultScores[idx] || 1.0;
      extractionStatus = 'needs_teacher_confirm';
      verificationReason = `Đề gốc không ghi rõ số điểm cho Câu ${qOrder}. AI đã đề xuất ${formatVNDecimal(detectedScore)}đ theo thang chuẩn.`;
      verificationFlags.push({
        id: `flag-q${qOrder}-score`,
        targetField: `reading_question_${qOrder}_score`,
        fieldLabel: `Điểm Câu ${qOrder} Đọc hiểu`,
        status: 'needs_teacher_confirm',
        originalSnippet: qBlock.slice(0, 120),
        reason: `Câu ${qOrder} không có ghi chú số điểm cụ thể trong tệp đề.`,
        suggestedResolution: `Xác nhận mức điểm ${formatVNDecimal(detectedScore)}đ cho câu này.`,
        isResolved: false,
        resolvedValue: detectedScore
      });
    }

    // Nhận diện mức độ nhận thức
    const qLevel = defaultLevels[idx] || 'van_dung';
    const levelNames: Record<CognitiveLevel, string> = {
      nhan_biet: 'Nhận biết',
      thong_hieu: 'Thông hiểu',
      van_dung: 'Vận dụng',
      van_dung_cao: 'Vận dụng cao'
    };

    parsedQuestions.push({
      id: `exam-q-${qOrder}`,
      order: qOrder,
      question: cleanQText.replace(/\(\d+(?:[.,]\d+)?\s*điểm\)/gi, '').trim(),
      level: qLevel,
      levelName: levelNames[qLevel],
      maxScore: detectedScore,
      extractionStatus: extractionStatus,
      verificationReason: verificationReason,
      suggestedScore: detectedScore
    });
  });

  // Nếu không nhận diện được câu hỏi nào từ text
  if (parsedQuestions.length === 0) {
    verificationFlags.push({
      id: 'flag-missing-questions',
      targetField: 'reading_questions',
      fieldLabel: 'Câu hỏi Đọc hiểu',
      status: 'missing_data',
      originalSnippet: readingSectionRaw.slice(0, 150),
      reason: 'Không tìm thấy các câu hỏi bắt đầu bằng "Câu 1", "Câu 2"... trong tệp.',
      suggestedResolution: 'AI đã bổ sung 4 câu hỏi dự thảo theo chuẩn ma trận đề THPT.',
      isResolved: false
    });
    // Bổ sung 4 câu hỏi mặc định
    parsedQuestions.push(
      {
        id: 'exam-q-1',
        order: 1,
        question: 'Xác định phương thức biểu đạt chính / thể loại của văn bản trên.',
        level: 'nhan_biet',
        levelName: 'Nhận biết',
        maxScore: 0.75,
        extractionStatus: 'needs_teacher_confirm',
        suggestedScore: 0.75
      },
      {
        id: 'exam-q-2',
        order: 2,
        question: 'Theo đoạn trích, tác giả đã nêu những biểu hiện hoặc căn cứ nào về vấn đề?',
        level: 'thong_hieu',
        levelName: 'Thông hiểu',
        maxScore: 0.75,
        extractionStatus: 'needs_teacher_confirm',
        suggestedScore: 0.75
      },
      {
        id: 'exam-q-3',
        order: 3,
        question: 'Phân tích hiệu quả nghệ thuật của biện pháp tu từ được sử dụng trong văn bản.',
        level: 'van_dung',
        levelName: 'Vận dụng',
        maxScore: 1.0,
        extractionStatus: 'needs_teacher_confirm',
        suggestedScore: 1.0
      },
      {
        id: 'exam-q-4',
        order: 4,
        question: 'Rút ra thông điệp có ý nghĩa nhất đối với bản thân và lí giải lí do.',
        level: 'van_dung_cao',
        levelName: 'Vận dụng cao',
        maxScore: 1.5,
        extractionStatus: 'needs_teacher_confirm',
        suggestedScore: 1.5
      }
    );
  }

  // 6. Trích xuất Phần II: Viết (Đoạn 200 chữ & Bài 600 chữ)
  let paragraphPromptText = 'Từ nội dung văn bản ở phần Đọc hiểu, hãy viết một đoạn văn (khoảng 200 chữ) trình bày suy nghĩ của anh/chị.';
  let essayPromptText = 'Hãy viết một bài văn nghị luận (khoảng 600 chữ) phân tích, đánh giá vấn đề được gợi mở.';
  let paragraphType: 'nghi_luan_xa_hoi' | 'nghi_luan_van_hoc' = 'nghi_luan_xa_hoi';
  let essayType: 'nghi_luan_xa_hoi' | 'nghi_luan_van_hoc' = 'nghi_luan_van_hoc';

  // Tìm Câu 1 và Câu 2 trong phần Viết
  const writingTasksBlocks = writingSectionRaw.split(/(?=Câu\s*[12]\s*[:.])/i).filter(b => b.trim().length > 5);

  if (writingTasksBlocks.length >= 2) {
    paragraphPromptText = writingTasksBlocks[0].replace(/^Câu\s*1\s*[:.]/i, '').trim();
    essayPromptText = writingTasksBlocks[1].replace(/^Câu\s*2\s*[:.]/i, '').trim();

    // Nhận diện kiểu đề Câu 1 (NLXH vs NLVH)
    if (
      paragraphPromptText.toLowerCase().includes('đoạn trích') ||
      paragraphPromptText.toLowerCase().includes('tác phẩm') ||
      paragraphPromptText.toLowerCase().includes('nhân vật') ||
      paragraphPromptText.toLowerCase().includes('hình tượng')
    ) {
      paragraphType = 'nghi_luan_van_hoc';
    } else {
      paragraphType = 'nghi_luan_xa_hoi';
    }

    // Nhận diện kiểu đề Câu 2 (NLXH vs NLVH)
    if (
      essayPromptText.toLowerCase().includes('suy nghĩ của anh/chị về') ||
      essayPromptText.toLowerCase().includes('ý kiến cho rằng') ||
      essayPromptText.toLowerCase().includes('lối sống') ||
      essayPromptText.toLowerCase().includes('trách nhiệm của tuổi trẻ')
    ) {
      essayType = 'nghi_luan_xa_hoi';
    } else {
      essayType = 'nghi_luan_van_hoc';
    }
  }

  // 7. Nhận diện cấu trúc Mẫu: Mẫu A vs Mẫu B vs Tùy chỉnh
  let templateType: ExamTemplateType = 'custom';
  let templateLabel = 'Cấu trúc tùy chỉnh';

  if (
    passageGenre === 'van_hoc' &&
    paragraphType === 'nghi_luan_van_hoc' &&
    essayType === 'nghi_luan_xa_hoi'
  ) {
    templateType = 'template_a';
    templateLabel = 'Mẫu A (Đọc hiểu văn học — Đoạn NLVH 200 chữ — Bài NLXH 600 chữ)';
  } else if (
    (passageGenre === 'thong_tin' || passageGenre === 'nghi_luan') &&
    paragraphType === 'nghi_luan_xa_hoi' &&
    essayType === 'nghi_luan_van_hoc'
  ) {
    templateType = 'template_b';
    templateLabel = 'Mẫu B (Đọc hiểu thông tin/nghị luận — Đoạn NLXH 200 chữ — Bài NLVH 600 chữ)';
  } else {
    // Không ép mọi đề vào Mẫu A hay Mẫu B mà bảo toàn cấu trúc đề gốc
    templateType = 'custom';
    templateLabel = `Cấu trúc tùy chỉnh (${genreName} — Đoạn ${
      paragraphType === 'nghi_luan_xa_hoi' ? 'NLXH' : 'NLVH'
    } — Bài ${essayType === 'nghi_luan_xa_hoi' ? 'NLXH' : 'NLVH'})`;
  }

  // 8. Tạo Writing Tasks & Rubric dự thảo chuẩn
  const paragraphTask: CompleteExamWritingTask = {
    id: 'writing-task-1',
    type: paragraphType,
    typeName: paragraphType === 'nghi_luan_xa_hoi' ? 'Nghị luận xã hội' : 'Nghị luận văn học',
    wordLimitLabel: 'Khoảng 200 chữ (1 đoạn văn)',
    targetWordCount: 200,
    promptText: paragraphPromptText,
    maxScore: 2.0,
    rubric: generateDraftParagraphRubric(paragraphType),
    isAiDraftRubric: !cleanGuide.includes('đoạn văn'),
    extractionStatus: 'extracted_clear'
  };

  const essayTask: CompleteExamWritingTask = {
    id: 'writing-task-2',
    type: essayType,
    typeName: essayType === 'nghi_luan_xa_hoi' ? 'Nghị luận xã hội' : 'Nghị luận văn học',
    wordLimitLabel: 'Khoảng 600 chữ (Bài văn)',
    targetWordCount: 600,
    promptText: essayPromptText,
    maxScore: 4.0,
    rubric: generateDraftEssayRubric(essayType),
    isAiDraftRubric: !cleanGuide.includes('bài văn'),
    extractionStatus: 'extracted_clear'
  };

  // 9. Kiểm tra tính nhất quán (Validation consistency)
  const consistencyReport = validateExamConsistency(parsedQuestions, paragraphTask, essayTask, 10.0);

  if (!consistencyReport.isValid) {
    verificationFlags.push({
      id: 'flag-consistency-total',
      targetField: 'overall_total_score',
      fieldLabel: 'Tổng điểm toàn bài không khớp 10,0 điểm',
      status: 'needs_teacher_confirm',
      originalSnippet: `Đọc hiểu: ${formatVNDecimal(consistencyReport.readingScoreSum)}đ + Đoạn văn: ${formatVNDecimal(
        consistencyReport.paragraphScoreSum
      )}đ + Bài văn: ${formatVNDecimal(consistencyReport.essayScoreSum)}đ = ${formatVNDecimal(
        consistencyReport.overallScoreSum
      )}đ`,
      reason: consistencyReport.discrepancies.join(' '),
      suggestedResolution: consistencyReport.suggestedFixes.join(' '),
      isResolved: false
    });
  }

  return {
    id: `exam-${Date.now()}`,
    code: `THPT-2026-${Math.floor(100 + Math.random() * 900)}`,
    title: title,
    templateType: templateType,
    templateLabel: templateLabel,
    readingPassage: {
      title: passageTitle,
      author: passageAuthor,
      source: passageSource,
      genre: passageGenre,
      genreName: genreName,
      content: passageContent,
      questions: parsedQuestions,
      maxScore: 4.0
    },
    writingTasks: {
      paragraphTask: paragraphTask,
      essayTask: essayTask
    },
    totalScore: 10.0,
    durationMinutes: durationMinutes,
    hasScoringGuide: Boolean(cleanGuide),
    status: verificationFlags.some(f => !f.isResolved && f.status === 'needs_teacher_confirm')
      ? 'draft'
      : 'verified',
    assignedClasses: [],
    assignedMode: 'mock_exam',
    verificationFlags: verificationFlags,
    consistencyReport: consistencyReport,
    rawSourceText: rawExamText,
    rawGuideText: rawGuideText,
    createdAt: new Date().toLocaleDateString('vi-VN'),
    updatedAt: new Date().toLocaleDateString('vi-VN')
  };
}

/**
 * 7 BỘ ĐỀ MẪU KIỂM THỬ TOÀN DIỆN THEO ĐÚNG MỤC X CỦA YÊU CẦU:
 * 1. Đề hoàn chỉnh có đầy đủ Hướng dẫn chấm (Mẫu A).
 * 2. Đề không có rubric (AI tự sinh rubric dự thảo).
 * 3. Đề có câu hỏi điểm chưa rõ (gắn cờ Cần xác nhận).
 * 4. Đề có tổng điểm bị sai/lệch (AI cảnh báo mâu thuẫn điểm).
 * 5. Đề Mẫu A chuẩn Bộ GD&ĐT.
 * 6. Đề Mẫu B chuẩn Bộ GD&ĐT.
 * 7. Đề cấu trúc tùy chỉnh (không ép vào Mẫu A hoặc B).
 */
export const PREBUILT_TEST_SCENARIO_EXAMS: CompleteExam[] = [
  // 1. Đề Mẫu A có đầy đủ hướng dẫn chấm (Đạt chuẩn 100%)
  {
    id: 'exam-scenario-1-full-guide',
    code: 'THPT-MAU-A-01',
    title: 'Đề thi thử Tốt nghiệp THPT 2026 — Mẫu A (Có đủ Hướng dẫn chấm)',
    templateType: 'template_a',
    templateLabel: 'Mẫu A (Đọc hiểu văn học — Đoạn NLVH 200 chữ — Bài NLXH 600 chữ)',
    readingPassage: {
      title: 'Những nhành cây vươn ra đón bão',
      author: 'Nguyễn Khoa Điềm',
      source: 'Trích "Tuyển tập thơ thời kỳ mới", NXB Văn học',
      genre: 'van_hoc',
      genreName: 'Văn bản văn học (Thơ hiện đại)',
      content: `Cây không chọn đất để sinh ra\nNhưng cây chọn vươn lên cùng bão gió\nĐất cằn cỗi dạy rễ cày sâu vào lòng đá\nLá xanh ngời vượt qua những mùa khô.\n\nChúng ta sống không phải để âu lo\nVề những trắc trở ngày mai chưa tới\nMỗi vết sẹo trên thân cây rắn rỏi\nLà một lời thề kiên định trước thời gian.\n\nĐất nước này lớn lên từ gian nan\nTừ mồ hôi và những bàn tay lặng lẽ\nAi cũng có một phần đời thật trẻ\nĐừng để tháng năm trôi dạt vô hình.`,
      questions: [
        {
          id: 'q-s1-1',
          order: 1,
          question: 'Xác định thể thơ của đoạn trích trên.',
          level: 'nhan_biet',
          levelName: 'Nhận biết',
          maxScore: 0.75,
          answerGuide: 'Thể thơ tự do (hoặc thể thơ tám chữ kết hợp tự do). Chấp nhận học sinh trả lời đúng tên thể thơ.',
          extractionStatus: 'extracted_clear'
        },
        {
          id: 'q-s1-2',
          order: 2,
          question: 'Theo đoạn trích, đất cằn cỗi đã dạy cho cây bài học gì để vượt qua mùa khô?',
          level: 'nhan_biet',
          levelName: 'Nhận biết',
          maxScore: 0.75,
          answerGuide: 'Dạy rễ cày sâu vào lòng đá, giữ cho lá xanh ngời vượt qua mùa khô.',
          extractionStatus: 'extracted_clear'
        },
        {
          id: 'q-s1-3',
          order: 3,
          question: 'Nêu tác dụng của biện pháp tu từ ẩn dụ trong câu thơ: "Mỗi vết sẹo trên thân cây rắn rỏi / Là một lời thề kiên định trước thời gian".',
          level: 'van_dung',
          levelName: 'Vận dụng',
          maxScore: 1.0,
          answerGuide: 'Chỉ rõ ẩn dụ "vết sẹo" tượng trưng cho gian nan, va vấp. Tác dụng: khẳng định bản lĩnh kiên cường, sự trưởng thành sau thử thách.',
          extractionStatus: 'extracted_clear'
        },
        {
          id: 'q-s1-4',
          order: 4,
          question: 'Anh/chị có đồng tình với lời nhắn nhủ: "Ai cũng có một phần đời thật trẻ / Đừng để tháng năm trôi dạt vô hình" không? Vì sao?',
          level: 'van_dung_cao',
          levelName: 'Vận dụng cao',
          maxScore: 1.5,
          answerGuide: 'Nêu thái độ rõ ràng (Đồng tình / Hoàn toàn đồng tình). Lí giải thuyết phục ít nhất 2 ý: Tuổi trẻ chỉ đến một lần; cần sống có lý tưởng và khát vọng.',
          extractionStatus: 'extracted_clear'
        }
      ],
      maxScore: 4.0
    },
    writingTasks: {
      paragraphTask: {
        id: 'w-s1-task1',
        type: 'nghi_luan_van_hoc',
        typeName: 'Nghị luận văn học',
        wordLimitLabel: 'Khoảng 200 chữ (1 đoạn văn)',
        targetWordCount: 200,
        promptText: 'Viết một đoạn văn (khoảng 200 chữ) phân tích vẻ đẹp của hình tượng cây trong khổ thơ thứ nhất của đoạn trích ở phần Đọc hiểu.',
        maxScore: 2.0,
        rubric: generateDraftParagraphRubric('nghi_luan_van_hoc'),
        isAiDraftRubric: false,
        extractionStatus: 'extracted_clear'
      },
      essayTask: {
        id: 'w-s1-task2',
        type: 'nghi_luan_xa_hoi',
        typeName: 'Nghị luận xã hội',
        wordLimitLabel: 'Khoảng 600 chữ (Bài văn)',
        targetWordCount: 600,
        promptText: 'Viết một bài văn nghị luận (khoảng 600 chữ) bàn về tinh thần dấn thân và ý chí vượt qua nghịch cảnh của thế hệ trẻ hôm nay.',
        maxScore: 4.0,
        rubric: generateDraftEssayRubric('nghi_luan_xa_hoi'),
        isAiDraftRubric: false,
        extractionStatus: 'extracted_clear'
      }
    },
    totalScore: 10.0,
    durationMinutes: 120,
    hasScoringGuide: true,
    status: 'assigned',
    assignedClasses: ['12A1'],
    assignedMode: 'mock_exam',
    dueDate: '2026-11-20',
    verificationFlags: [],
    consistencyReport: {
      isValid: true,
      readingScoreSum: 4.0,
      paragraphScoreSum: 2.0,
      essayScoreSum: 4.0,
      overallScoreSum: 10.0,
      expectedTotal: 10.0,
      discrepancies: [],
      suggestedFixes: []
    },
    createdAt: '12/10/2026',
    updatedAt: '13/10/2026'
  },

  // 2. Đề Mẫu B KHÔNG CÓ RUBRIC (AI tự sinh rubric dự thảo)
  {
    id: 'exam-scenario-2-no-rubric',
    code: 'THPT-MAU-B-02',
    title: 'Đề thi thử Tốt nghiệp THPT 2026 — Mẫu B (Tệp không có Rubric, AI dự thảo)',
    templateType: 'template_b',
    templateLabel: 'Mẫu B (Đọc hiểu thông tin — Đoạn NLXH 200 chữ — Bài NLVH 600 chữ)',
    readingPassage: {
      title: 'Trí tuệ nhân tạo và tương lai của việc học độc lập',
      author: 'Nguyễn Văn A',
      source: 'Tạp chí Tia Sáng, số chuyên đề Giáo dục thời đại số',
      genre: 'thong_tin',
      genreName: 'Văn bản thông tin / Bình luận khoa học',
      content: `Sự phát triển vũ bão của trí tuệ nhân tạo (AI) đang tái định hình cách thức con người tiếp cận tri thức. AI có thể giải nhanh một bài toán, viết một đoạn mã lập trình hay tóm tắt một cuốn sách chỉ trong vài giây. Điều này đặt ra câu hỏi sống còn: Đâu là năng lực không thể thay thế của con người?\n\nCâu trả lời nằm ở tư duy phản biện và khả năng thấu cảm. AI có thể cung cấp câu trả lời, nhưng chỉ con người mới biết đặt ra những câu hỏi đúng và nghi vấn những tiền đề sẵn có. Người học trong kỷ nguyên số không còn là người tích lũy thông tin thụ động, mà phải trở thành người kiến tạo ý nghĩa, biết lọc vàng giữa biển dữ liệu.\n\nNếu chúng ta để công nghệ tư duy hộ mình, chúng ta sẽ dần đánh mất sự sắc sảo của trí tuệ. Nhưng nếu coi AI là đối tác phản biện, con người sẽ mở rộng được giới hạn sáng tạo và khám phá những chân trời mới.`,
      questions: [
        {
          id: 'q-s2-1',
          order: 1,
          question: 'Theo văn bản, AI có thể làm được những việc gì chỉ trong vài giây?',
          level: 'nhan_biet',
          levelName: 'Nhận biết',
          maxScore: 0.75,
          extractionStatus: 'extracted_clear'
        },
        {
          id: 'q-s2-2',
          order: 2,
          question: 'Tác giả đã chỉ ra hai năng lực cốt lõi không thể thay thế của con người là gì?',
          level: 'nhan_biet',
          levelName: 'Nhận biết',
          maxScore: 0.75,
          extractionStatus: 'extracted_clear'
        },
        {
          id: 'q-s2-3',
          order: 3,
          question: 'Vì sao tác giả cho rằng: "Người học trong kỷ nguyên số phải trở thành người kiến tạo ý nghĩa, biết lọc vàng giữa biển dữ liệu"?',
          level: 'thong_hieu',
          levelName: 'Thông hiểu',
          maxScore: 1.0,
          extractionStatus: 'extracted_clear'
        },
        {
          id: 'q-s2-4',
          order: 4,
          question: 'Anh/chị rút ra được bài học gì về phương pháp tự học của bản thân trước làn sóng phát triển của công nghệ hiện nay?',
          level: 'van_dung_cao',
          levelName: 'Vận dụng cao',
          maxScore: 1.5,
          extractionStatus: 'extracted_clear'
        }
      ],
      maxScore: 4.0
    },
    writingTasks: {
      paragraphTask: {
        id: 'w-s2-task1',
        type: 'nghi_luan_xa_hoi',
        typeName: 'Nghị luận xã hội',
        wordLimitLabel: 'Khoảng 200 chữ (1 đoạn văn)',
        targetWordCount: 200,
        promptText: 'Viết một đoạn văn (khoảng 200 chữ) trình bày suy nghĩ của anh/chị về sự cần thiết của tư duy phản biện đối với học sinh lớp 12 trong thời đại số.',
        maxScore: 2.0,
        rubric: generateDraftParagraphRubric('nghi_luan_xa_hoi'),
        isAiDraftRubric: true, // AI tự dự thảo
        extractionStatus: 'needs_teacher_confirm',
        verificationNotes: 'Tệp tải lên không kèm bảng rubric. AI đã tự sinh rubric dự thảo 4 tiêu chí đạt chuẩn 2,0đ.'
      },
      essayTask: {
        id: 'w-s2-task2',
        type: 'nghi_luan_van_hoc',
        typeName: 'Nghị luận văn học',
        wordLimitLabel: 'Khoảng 600 chữ (Bài văn)',
        targetWordCount: 600,
        promptText: 'Viết một bài văn nghị luận (khoảng 600 chữ) phân tích vẻ đẹp của con người lao động kiên định và thầm lặng trong một tác phẩm văn học lớp 12 mà anh/chị tâm đắc.',
        maxScore: 4.0,
        rubric: generateDraftEssayRubric('nghi_luan_van_hoc'),
        isAiDraftRubric: true, // AI tự dự thảo
        extractionStatus: 'needs_teacher_confirm',
        verificationNotes: 'Tệp tải lên không kèm bảng rubric. AI đã tự sinh rubric dự thảo 4 tiêu chí đạt chuẩn 4,0đ.'
      }
    },
    totalScore: 10.0,
    durationMinutes: 120,
    hasScoringGuide: false,
    status: 'draft',
    assignedClasses: [],
    assignedMode: 'practice',
    verificationFlags: [
      {
        id: 'flag-s2-rubric',
        targetField: 'writing_rubric',
        fieldLabel: 'Bảng Rubric dự thảo do AI tạo lập',
        status: 'needs_teacher_confirm',
        originalSnippet: 'Tệp đề bài không đính kèm hướng dẫn chấm hoặc barem rubric.',
        reason: 'Tệp tải lên chỉ có đề bài. Hệ thống đã tự động xây dựng Rubric dự thảo phân tầng tiêu chí.',
        suggestedResolution: 'Giáo viên bấm "Duyệt nhanh Rubric dự thảo" để chính thức sử dụng cho chấm điểm.',
        isResolved: false
      }
    ],
    consistencyReport: {
      isValid: true,
      readingScoreSum: 4.0,
      paragraphScoreSum: 2.0,
      essayScoreSum: 4.0,
      overallScoreSum: 10.0,
      expectedTotal: 10.0,
      discrepancies: [],
      suggestedFixes: []
    },
    createdAt: '10/10/2026',
    updatedAt: '13/10/2026'
  },

  // 3. Đề có câu hỏi đọc hiểu ĐIỂM CHƯA RÕ (Cần xác nhận)
  {
    id: 'exam-scenario-3-unclear-score',
    code: 'THPT-KIEM-TRA-03',
    title: 'Đề kiểm tra học kỳ — Câu 3 và Câu 4 chưa ghi điểm cụ thể',
    templateType: 'template_a',
    templateLabel: 'Mẫu A (Đọc hiểu văn học — Đoạn NLVH 200 chữ — Bài NLXH 600 chữ)',
    readingPassage: {
      title: 'Khoảng lặng giữa dòng đời hối hả',
      author: 'Chu Văn Sơn',
      source: 'Ánh sáng từ những trang văn',
      genre: 'van_hoc',
      genreName: 'Văn bản văn học (Tản văn)',
      content: `Trong nhịp sống cuồn cuộn hôm nay, con người dường như sợ hãi sự im lặng. Chúng ta vội vã lấp đầy mọi khoảng trống thời gian bằng những âm thanh nhân tạo... Khoảng lặng chính là nơi nhân cách được định hình...`,
      questions: [
        {
          id: 'q-s3-1',
          order: 1,
          question: 'Theo đoạn trích, con người hôm nay thường sợ hãi điều gì? (0,75 điểm)',
          level: 'nhan_biet',
          levelName: 'Nhận biết',
          maxScore: 0.75,
          extractionStatus: 'extracted_clear'
        },
        {
          id: 'q-s3-2',
          order: 2,
          question: 'Chỉ ra 02 chi tiết thể hiện tác dụng của sự im lặng trong đoạn văn thứ hai. (0,75 điểm)',
          level: 'nhan_biet',
          levelName: 'Nhận biết',
          maxScore: 0.75,
          extractionStatus: 'extracted_clear'
        },
        {
          id: 'q-s3-3',
          order: 3,
          question: 'Anh/chị hiểu như thế nào về nhận định: "Khoảng lặng chính là nơi nhân cách được định hình"?',
          level: 'thong_hieu',
          levelName: 'Thông hiểu',
          maxScore: 1.0,
          extractionStatus: 'needs_teacher_confirm',
          verificationReason: 'Tệp đề không ghi số điểm cho câu này. AI đề xuất 1,0 điểm.'
        },
        {
          id: 'q-s3-4',
          order: 4,
          question: 'Thông điệp nào trong văn bản có ý nghĩa nhất đối với anh/chị?',
          level: 'van_dung_cao',
          levelName: 'Vận dụng cao',
          maxScore: 1.5,
          extractionStatus: 'needs_teacher_confirm',
          verificationReason: 'Tệp đề không ghi số điểm cho câu này. AI đề xuất 1,5 điểm để tròn 4,0đ.'
        }
      ],
      maxScore: 4.0
    },
    writingTasks: {
      paragraphTask: {
        id: 'w-s3-task1',
        type: 'nghi_luan_van_hoc',
        typeName: 'Nghị luận văn học',
        wordLimitLabel: 'Khoảng 200 chữ (1 đoạn văn)',
        targetWordCount: 200,
        promptText: 'Viết đoạn văn khoảng 200 chữ phân tích chất trữ tình của ngòi bút Chu Văn Sơn qua văn bản trên.',
        maxScore: 2.0,
        rubric: generateDraftParagraphRubric('nghi_luan_van_hoc'),
        isAiDraftRubric: false,
        extractionStatus: 'extracted_clear'
      },
      essayTask: {
        id: 'w-s3-task2',
        type: 'nghi_luan_xa_hoi',
        typeName: 'Nghị luận xã hội',
        wordLimitLabel: 'Khoảng 600 chữ (Bài văn)',
        targetWordCount: 600,
        promptText: 'Viết bài văn nghị luận khoảng 600 chữ bàn về ý nghĩa của việc làm chủ bản thân trước những áp lực thời đại số.',
        maxScore: 4.0,
        rubric: generateDraftEssayRubric('nghi_luan_xa_hoi'),
        isAiDraftRubric: false,
        extractionStatus: 'extracted_clear'
      }
    },
    totalScore: 10.0,
    durationMinutes: 120,
    hasScoringGuide: false,
    status: 'draft',
    assignedClasses: [],
    assignedMode: 'mock_exam',
    verificationFlags: [
      {
        id: 'flag-s3-unclear-q3',
        targetField: 'reading_question_3_score',
        fieldLabel: 'Điểm Câu 3 Đọc hiểu chưa rõ',
        status: 'needs_teacher_confirm',
        originalSnippet: 'Câu 3: Anh/chị hiểu như thế nào về nhận định... (không có điểm)',
        reason: 'Đề gốc thiếu ghi chú điểm số cho Câu 3.',
        suggestedResolution: 'Xác nhận mức điểm 1,0đ cho câu Thông hiểu này.',
        isResolved: false,
        resolvedValue: 1.0
      },
      {
        id: 'flag-s3-unclear-q4',
        targetField: 'reading_question_4_score',
        fieldLabel: 'Điểm Câu 4 Đọc hiểu chưa rõ',
        status: 'needs_teacher_confirm',
        originalSnippet: 'Câu 4: Thông điệp nào trong văn bản có ý nghĩa... (không có điểm)',
        reason: 'Đề gốc thiếu ghi chú điểm số cho Câu 4.',
        suggestedResolution: 'Xác nhận mức điểm 1,5đ để phần Đọc hiểu tròn 4,0đ.',
        isResolved: false,
        resolvedValue: 1.5
      }
    ],
    consistencyReport: {
      isValid: true,
      readingScoreSum: 4.0,
      paragraphScoreSum: 2.0,
      essayScoreSum: 4.0,
      overallScoreSum: 10.0,
      expectedTotal: 10.0,
      discrepancies: [],
      suggestedFixes: []
    },
    createdAt: '08/10/2026',
    updatedAt: '13/10/2026'
  },

  // 4. Đề có TỔNG ĐIỂM BỊ SAI / LỆCH (Tổng = 9,5đ thay vì 10,0đ)
  {
    id: 'exam-scenario-4-score-mismatch',
    code: 'THPT-LECH-DIEM-04',
    title: 'Đề thi khảo sát chất lượng — Tổng điểm đọc hiểu bị thiếu 0,5 điểm',
    templateType: 'template_a',
    templateLabel: 'Mẫu A (Đọc hiểu văn học — Đoạn NLVH 200 chữ — Bài NLXH 600 chữ)',
    readingPassage: {
      title: 'Bản lĩnh của sự chính trực',
      author: 'Đặng Hoàng Giang',
      source: 'Bức xúc không làm ta vô can',
      genre: 'nghi_luan',
      genreName: 'Văn bản nghị luận xã hội',
      content: `Chính trực không đơn thuần là việc không làm điều xấu khi có người khác nhìn thấy; đó là sự lựa chọn hành động đúng đắn ngay cả khi bạn hoàn toàn cô độc và không ai biết đến...`,
      questions: [
        {
          id: 'q-s4-1',
          order: 1,
          question: 'Theo tác giả, chính trực là gì? (0,5 điểm)',
          level: 'nhan_biet',
          levelName: 'Nhận biết',
          maxScore: 0.5, // 0.5
          extractionStatus: 'extracted_clear'
        },
        {
          id: 'q-s4-2',
          order: 2,
          question: 'Người chính trực phải đối mặt với những khó khăn nào? (0,75 điểm)',
          level: 'thong_hieu',
          levelName: 'Thông hiểu',
          maxScore: 0.75, // 0.75
          extractionStatus: 'extracted_clear'
        },
        {
          id: 'q-s4-3',
          order: 3,
          question: 'Nhận xét về lập luận của tác giả trong đoạn trích. (1,0 điểm)',
          level: 'van_dung',
          levelName: 'Vận dụng',
          maxScore: 1.0, // 1.0
          extractionStatus: 'extracted_clear'
        },
        {
          id: 'q-s4-4',
          order: 4,
          question: 'Bài học về lòng tự trọng trong cuộc sống. (1,25 điểm)',
          level: 'van_dung_cao',
          levelName: 'Vận dụng cao',
          maxScore: 1.25, // 1.25 -> Tổng phần đọc hiểu = 3.5đ thay vì 4.0đ!
          extractionStatus: 'needs_teacher_confirm',
          verificationReason: 'Tổng 4 câu chỉ đạt 3,5đ, thiếu 0,5đ so với cấu trúc 4,0đ của đề thi.'
        }
      ],
      maxScore: 3.5 // Bị lệch!
    },
    writingTasks: {
      paragraphTask: {
        id: 'w-s4-task1',
        type: 'nghi_luan_van_hoc',
        typeName: 'Nghị luận văn học',
        wordLimitLabel: 'Khoảng 200 chữ (1 đoạn văn)',
        targetWordCount: 200,
        promptText: 'Viết đoạn văn khoảng 200 chữ làm rõ vẻ đẹp ngòi bút nghị luận giàu sức thuyết phục của tác giả.',
        maxScore: 2.0,
        rubric: generateDraftParagraphRubric('nghi_luan_van_hoc'),
        isAiDraftRubric: false,
        extractionStatus: 'extracted_clear'
      },
      essayTask: {
        id: 'w-s4-task2',
        type: 'nghi_luan_xa_hoi',
        typeName: 'Nghị luận xã hội',
        wordLimitLabel: 'Khoảng 600 chữ (Bài văn)',
        targetWordCount: 600,
        promptText: 'Viết bài văn nghị luận khoảng 600 chữ bàn về lòng tự trọng và sự dũng cảm sống thật với chính mình.',
        maxScore: 4.0,
        rubric: generateDraftEssayRubric('nghi_luan_xa_hoi'),
        isAiDraftRubric: false,
        extractionStatus: 'extracted_clear'
      }
    },
    totalScore: 9.5, // Sai tổng điểm
    durationMinutes: 120,
    hasScoringGuide: true,
    status: 'draft',
    assignedClasses: [],
    assignedMode: 'mock_exam',
    verificationFlags: [
      {
        id: 'flag-s4-score-mismatch',
        targetField: 'reading_section_total',
        fieldLabel: 'Tổng điểm Đọc hiểu bị lệch (3,5đ / 4,0đ)',
        status: 'needs_teacher_confirm',
        originalSnippet: 'Câu 1: 0,5đ + Câu 2: 0,75đ + Câu 3: 1,0đ + Câu 4: 1,25đ = 3,5đ (Tổng bài = 9,5đ)',
        reason: 'Điểm các câu đọc hiểu cộng lại chỉ bằng 3,5 điểm, khiến tổng điểm toàn đề chỉ có 9,5 điểm.',
        suggestedResolution: 'Tăng Câu 4 từ 1,25đ lên 1,75đ (hoặc Câu 1 từ 0,5đ lên 1,0đ) để làm tròn phần Đọc hiểu thành 4,0đ và bài thi tròn 10,0đ.',
        isResolved: false
      }
    ],
    consistencyReport: {
      isValid: false,
      readingScoreSum: 3.5,
      paragraphScoreSum: 2.0,
      essayScoreSum: 4.0,
      overallScoreSum: 9.5,
      expectedTotal: 10.0,
      discrepancies: [
        'Tổng điểm phần Đọc hiểu hiện là 3,5đ, chưa khớp chuẩn 4,0 điểm (thiếu 0,5đ).',
        'Tổng điểm toàn đề là 9,5đ, không khớp với tổng chuẩn 10,0 điểm.'
      ],
      suggestedFixes: [
        'Điều chỉnh điểm các câu hỏi đọc hiểu để đạt tròn 4,0đ.',
        'Đề xuất: tăng Câu 4 từ 1,25đ lên 1,75đ.'
      ]
    },
    createdAt: '05/10/2026',
    updatedAt: '13/10/2026'
  },

  // 5. Đề MẪU A chuẩn (Văn bản văn học — Đoạn NLVH — Bài NLXH)
  {
    id: 'exam-scenario-5-template-a',
    code: 'THPT-CHUAN-MAU-A',
    title: 'Đề luyện thi Tốt nghiệp THPT 2026 — Đề chuẩn Mẫu A (Số 01)',
    templateType: 'template_a',
    templateLabel: 'Mẫu A (Đọc hiểu văn học — Đoạn NLVH 200 chữ — Bài NLXH 600 chữ)',
    readingPassage: {
      title: 'Đất nước ở trong tim',
      author: 'Lê Cảnh Nhạc',
      source: 'Tuyển tập thơ ca kháng chiến và xây dựng đất nước',
      genre: 'van_hoc',
      genreName: 'Văn bản văn học (Thơ trữ tình)',
      content: `Khi con sinh ra đất nước đã có rồi\nĐất nước có trong những cái ngày xửa ngày xưa mẹ thường hay kể\nĐất nước bắt đầu với miếng trầu bây giờ bà ăn\nĐất nước lớn lên khi dân mình biết trồng tre mà đánh giặc.\n\nTóc mẹ thì bới sau đầu\nCha mẹ thương nhau bằng gừng cay muối mặn\nCái kèo, cái cột thành tên\nHạt gạo phải một nắng hai sương xay, giã, dần, sàng\nĐất nước có từ ngày đó...`,
      questions: [
        {
          id: 'q-s5-1',
          order: 1,
          question: 'Chỉ ra các chi tiết thể hiện cội nguồn đất nước trong đoạn thơ thứ nhất.',
          level: 'nhan_biet',
          levelName: 'Nhận biết',
          maxScore: 0.75,
          extractionStatus: 'extracted_clear'
        },
        {
          id: 'q-s5-2',
          order: 2,
          question: 'Hình ảnh "gừng cay muối mặn" gợi nhắc đến truyền thống đạo lí nào của dân tộc?',
          level: 'thong_hieu',
          levelName: 'Thông hiểu',
          maxScore: 0.75,
          extractionStatus: 'extracted_clear'
        },
        {
          id: 'q-s5-3',
          order: 3,
          question: 'Phân tích hiệu quả nghệ thuật của điệp ngữ "Đất nước" trong đoạn trích.',
          level: 'van_dung',
          levelName: 'Vận dụng',
          maxScore: 1.0,
          extractionStatus: 'extracted_clear'
        },
        {
          id: 'q-s5-4',
          order: 4,
          question: 'Từ cảm nhận về đất nước trong đoạn thơ, anh/chị hãy rút ra trách nhiệm của người trẻ với quê hương.',
          level: 'van_dung_cao',
          levelName: 'Vận dụng cao',
          maxScore: 1.5,
          extractionStatus: 'extracted_clear'
        }
      ],
      maxScore: 4.0
    },
    writingTasks: {
      paragraphTask: {
        id: 'w-s5-task1',
        type: 'nghi_luan_van_hoc',
        typeName: 'Nghị luận văn học',
        wordLimitLabel: 'Khoảng 200 chữ (1 đoạn văn)',
        targetWordCount: 200,
        promptText: 'Viết đoạn văn khoảng 200 chữ phân tích vẻ đẹp giản dị, thiêng liêng của Đất nước qua cách cảm nhận của nhà thơ trong đoạn trích trên.',
        maxScore: 2.0,
        rubric: generateDraftParagraphRubric('nghi_luan_van_hoc'),
        isAiDraftRubric: false,
        extractionStatus: 'extracted_clear'
      },
      essayTask: {
        id: 'w-s5-task2',
        type: 'nghi_luan_xa_hoi',
        typeName: 'Nghị luận xã hội',
        wordLimitLabel: 'Khoảng 600 chữ (Bài văn)',
        targetWordCount: 600,
        promptText: 'Viết bài văn nghị luận khoảng 600 chữ bàn về lòng yêu nước và trách nhiệm bảo vệ chủ quyền, gìn giữ bản sắc dân tộc trong thời kỳ hội nhập quốc tế.',
        maxScore: 4.0,
        rubric: generateDraftEssayRubric('nghi_luan_xa_hoi'),
        isAiDraftRubric: false,
        extractionStatus: 'extracted_clear'
      }
    },
    totalScore: 10.0,
    durationMinutes: 120,
    hasScoringGuide: true,
    status: 'assigned',
    assignedClasses: ['12A1', '12A2'],
    assignedMode: 'mock_exam',
    dueDate: '2026-11-25',
    verificationFlags: [],
    consistencyReport: {
      isValid: true,
      readingScoreSum: 4.0,
      paragraphScoreSum: 2.0,
      essayScoreSum: 4.0,
      overallScoreSum: 10.0,
      expectedTotal: 10.0,
      discrepancies: [],
      suggestedFixes: []
    },
    createdAt: '01/10/2026',
    updatedAt: '13/10/2026'
  },

  // 6. Đề MẪU B chuẩn (Văn bản thông tin/nghị luận — Đoạn NLXH — Bài NLVH)
  {
    id: 'exam-scenario-6-template-b',
    code: 'THPT-CHUAN-MAU-B',
    title: 'Đề luyện thi Tốt nghiệp THPT 2026 — Đề chuẩn Mẫu B (Số 01)',
    templateType: 'template_b',
    templateLabel: 'Mẫu B (Đọc hiểu văn bản thông tin — Đoạn NLXH 200 chữ — Bài NLVH 600 chữ)',
    readingPassage: {
      title: 'Lối sống xanh và trách nhiệm môi trường của thế hệ Gen Z',
      author: 'Trần Thu Trang',
      source: 'Báo Tuổi Trẻ, chuyên mục Phát triển bền vững',
      genre: 'thong_tin',
      genreName: 'Văn bản thông tin',
      content: `Biến đổi khí hậu không còn là câu chuyện dự báo xa vời của tương lai mà đang hiện hữu rõ nét qua từng đợt nắng nóng kỷ lục, nước biển dâng và thiên tai khắc nghiệt trên toàn cầu.\n\nTại Việt Nam, thế hệ trẻ (Gen Z) đang tiên phong khởi xướng xu hướng "sống xanh". Không chỉ dừng lại ở khẩu hiệu, họ biến ý thức thành hành động cụ thể mỗi ngày: từ chối túi ni lông dùng một lần, mang bình nước cá nhân, tái chế quần áo cũ và ưu tiên sử dụng phương tiện giao thông công cộng thân thiện môi trường.\n\nHành tinh này không phải là di sản ta thừa hưởng từ cha ông, mà là món nợ ta vay mượn từ con cháu mai sau. Thay đổi một thói quen nhỏ của mỗi cá nhân có thể tạo nên làn sóng chuyển biến lớn lao cho toàn xã hội.`,
      questions: [
        {
          id: 'q-s6-1',
          order: 1,
          question: 'Xác định đề tài và phương thức biểu đạt chính của văn bản trên.',
          level: 'nhan_biet',
          levelName: 'Nhận biết',
          maxScore: 0.75,
          extractionStatus: 'extracted_clear'
        },
        {
          id: 'q-s6-2',
          order: 2,
          question: 'Theo đoạn trích, thế hệ Gen Z đã có những hành động cụ thể nào để thực hành lối sống xanh?',
          level: 'nhan_biet',
          levelName: 'Nhận biết',
          maxScore: 0.75,
          extractionStatus: 'extracted_clear'
        },
        {
          id: 'q-s6-3',
          order: 3,
          question: 'Anh/chị hiểu như thế nào về câu nói: "Hành tinh này không phải là di sản ta thừa hưởng từ cha ông, mà là món nợ ta vay mượn từ con cháu mai sau"?',
          level: 'thong_hieu',
          levelName: 'Thông hiểu',
          maxScore: 1.0,
          extractionStatus: 'extracted_clear'
        },
        {
          id: 'q-s6-4',
          order: 4,
          question: 'Từ thông điệp của văn bản, anh/chị hãy đề xuất một sáng kiến cụ thể có thể áp dụng tại trường học để bảo vệ môi trường.',
          level: 'van_dung_cao',
          levelName: 'Vận dụng cao',
          maxScore: 1.5,
          extractionStatus: 'extracted_clear'
        }
      ],
      maxScore: 4.0
    },
    writingTasks: {
      paragraphTask: {
        id: 'w-s6-task1',
        type: 'nghi_luan_xa_hoi',
        typeName: 'Nghị luận xã hội',
        wordLimitLabel: 'Khoảng 200 chữ (1 đoạn văn)',
        targetWordCount: 200,
        promptText: 'Viết một đoạn văn (khoảng 200 chữ) bàn về vai trò của ý thức cá nhân trong việc giảm thiểu rác thải nhựa và bảo vệ hệ sinh thái chung.',
        maxScore: 2.0,
        rubric: generateDraftParagraphRubric('nghi_luan_xa_hoi'),
        isAiDraftRubric: false,
        extractionStatus: 'extracted_clear'
      },
      essayTask: {
        id: 'w-s6-task2',
        type: 'nghi_luan_van_hoc',
        typeName: 'Nghị luận văn học',
        wordLimitLabel: 'Khoảng 600 chữ (Bài văn)',
        targetWordCount: 600,
        promptText: 'Viết một bài văn nghị luận (khoảng 600 chữ) phân tích vẻ đẹp của thiên nhiên và tâm hồn con người gắn bó hòa hợp với đất trời qua một tác phẩm thơ văn lớp 12.',
        maxScore: 4.0,
        rubric: generateDraftEssayRubric('nghi_luan_van_hoc'),
        isAiDraftRubric: false,
        extractionStatus: 'extracted_clear'
      }
    },
    totalScore: 10.0,
    durationMinutes: 120,
    hasScoringGuide: true,
    status: 'assigned',
    assignedClasses: ['12A1'],
    assignedMode: 'mock_exam',
    dueDate: '2026-11-28',
    verificationFlags: [],
    consistencyReport: {
      isValid: true,
      readingScoreSum: 4.0,
      paragraphScoreSum: 2.0,
      essayScoreSum: 4.0,
      overallScoreSum: 10.0,
      expectedTotal: 10.0,
      discrepancies: [],
      suggestedFixes: []
    },
    createdAt: '03/10/2026',
    updatedAt: '13/10/2026'
  },

  // 7. Đề CẤU TRÚC TÙY CHỈNH (Không ép vào Mẫu A hay B, giữ nguyên cấu trúc hợp lý)
  {
    id: 'exam-scenario-7-custom-structure',
    code: 'THPT-TUY-CHINH-07',
    title: 'Đề thi chọn học sinh giỏi — Cấu trúc chuyên sâu (5 câu đọc hiểu & 1 bài luận tổng hợp)',
    templateType: 'custom',
    templateLabel: 'Cấu trúc tùy chỉnh (5 câu Đọc hiểu phân tích kịch bản — Bài luận 600 chữ)',
    readingPassage: {
      title: 'Hồn Trương Ba, da hàng thịt (Cảnh VII)',
      author: 'Lưu Quang Vũ',
      source: 'Kịch bản văn học Việt Nam hiện đại',
      genre: 'tuy_chinh',
      genreName: 'Văn bản kịch bản văn học',
      content: `HỒN TRƯƠNG BA: Không thể bên trong một đằng, bên ngoài một nẻo được. Tôi muốn được là tôi toàn vẹn!\n\nXÁC HÀNG THỊT: Vô ích! Cái linh hồn mờ nhạt của ông không tách ra khỏi tôi được đâu! Ông phải theo sự sai khiến của thân xác này...`,
      questions: [
        {
          id: 'q-s7-1',
          order: 1,
          question: 'Xác định xung đột kịch chủ yếu được thể hiện trong đoạn đối thoại.',
          level: 'nhan_biet',
          levelName: 'Nhận biết',
          maxScore: 0.5,
          extractionStatus: 'extracted_clear'
        },
        {
          id: 'q-s7-2',
          order: 2,
          question: 'Chỉ ra thái độ và lời thoại then chốt của Hồn Trương Ba khi phản kháng lại Xác hàng thịt.',
          level: 'nhan_biet',
          levelName: 'Nhận biết',
          maxScore: 0.5,
          extractionStatus: 'extracted_clear'
        },
        {
          id: 'q-s7-3',
          order: 3,
          question: 'Vì sao Xác hàng thịt lại tự tin cho rằng Hồn Trương Ba không thể tách rời khỏi thể xác phàm tục?',
          level: 'thong_hieu',
          levelName: 'Thông hiểu',
          maxScore: 1.0,
          extractionStatus: 'extracted_clear'
        },
        {
          id: 'q-s7-4',
          order: 4,
          question: 'Phân tích chiều sâu triết lý nhân sinh toát lên từ lời khẳng định: "Tôi muốn được là tôi toàn vẹn!".',
          level: 'van_dung',
          levelName: 'Vận dụng',
          maxScore: 1.0,
          extractionStatus: 'extracted_clear'
        },
        {
          id: 'q-s7-5',
          order: 5,
          question: 'Từ bi kịch của Hồn Trương Ba, anh/chị rút ra quan niệm sống nào về sự hài hòa giữa tâm hồn và thể xác?',
          level: 'van_dung_cao',
          levelName: 'Vận dụng cao',
          maxScore: 1.0,
          extractionStatus: 'extracted_clear'
        }
      ],
      maxScore: 4.0
    },
    writingTasks: {
      paragraphTask: {
        id: 'w-s7-task1',
        type: 'nghi_luan_van_hoc',
        typeName: 'Nghị luận văn học',
        wordLimitLabel: 'Khoảng 200 chữ (1 đoạn văn)',
        targetWordCount: 200,
        promptText: 'Viết đoạn văn khoảng 200 chữ phân tích nghệ thuật xây dựng đối thoại kịch sắc bén của Lưu Quang Vũ trong đoạn trích.',
        maxScore: 2.0,
        rubric: generateDraftParagraphRubric('nghi_luan_van_hoc'),
        isAiDraftRubric: false,
        extractionStatus: 'extracted_clear'
      },
      essayTask: {
        id: 'w-s7-task2',
        type: 'nghi_luan_xa_hoi',
        typeName: 'Nghị luận xã hội',
        wordLimitLabel: 'Khoảng 600 chữ (Bài văn)',
        targetWordCount: 600,
        promptText: 'Viết bài văn nghị luận khoảng 600 chữ bàn về dũng khí sống thật, bảo vệ nhân cách trong sạch trước những cám dỗ vật chất của cuộc đời.',
        maxScore: 4.0,
        rubric: generateDraftEssayRubric('nghi_luan_xa_hoi'),
        isAiDraftRubric: false,
        extractionStatus: 'extracted_clear'
      }
    },
    totalScore: 10.0,
    durationMinutes: 120,
    hasScoringGuide: true,
    status: 'verified',
    assignedClasses: [],
    assignedMode: 'mock_exam',
    verificationFlags: [],
    consistencyReport: {
      isValid: true,
      readingScoreSum: 4.0,
      paragraphScoreSum: 2.0,
      essayScoreSum: 4.0,
      overallScoreSum: 10.0,
      expectedTotal: 10.0,
      discrepancies: [],
      suggestedFixes: []
    },
    createdAt: '04/10/2026',
    updatedAt: '13/10/2026'
  },

  // 8. Đề MẪU B chuẩn số 02 (Văn bản nghị luận — Đoạn NLXH 200 chữ — Bài NLVH 600 chữ)
  {
    id: 'exam-scenario-8-template-b-02',
    code: 'THPT-CHUAN-MAU-B-02',
    title: 'Đề luyện thi Tốt nghiệp THPT 2026 — Đề chuẩn Mẫu B (Số 02)',
    templateType: 'template_b',
    templateLabel: 'Mẫu B (Đọc hiểu văn bản nghị luận — Đoạn NLXH 200 chữ — Bài NLVH 600 chữ)',
    readingPassage: {
      title: 'Bản lĩnh của sự chính trực trong đời sống hiện đại',
      author: 'Đặng Hoàng Giang',
      source: 'Trích "Bức xúc không làm ta vô can", NXB Hội Nhà Văn',
      genre: 'nghi_luan',
      genreName: 'Văn bản nghị luận',
      content: `Chính trực không đơn thuần là việc không làm điều xấu khi có người khác nhìn thấy; đó là sự lựa chọn hành động đúng đắn ngay cả khi bạn hoàn toàn cô độc và không ai biết đến.\n\nTrong một thế giới đầy cám dỗ của sự tiện lợi và danh vọng ảo, người chính trực thường phải chấp nhận đi con đường gập ghềnh hơn. Họ có thể từ chối một điểm số không xứng đáng, từ chối một lời khen đãi bôi hay kiên quyết không đồng lõa với sự gian dối tập thể. Sự lựa chọn đó đòi hỏi một sự dũng cảm bền bỉ, bởi cái giá của nó đôi khi là sự cô lập tạm thời.\n\nNhưng chính sự chính trực mới là chiếc neo giữ con người không bị chao đảo trước những cơn sóng ngầm của đạo đức giả.`,
      questions: [
        {
          id: 'q-s8-1',
          order: 1,
          question: 'Xác định luận đề chính của văn bản trên.',
          level: 'nhan_biet',
          levelName: 'Nhận biết',
          maxScore: 0.75,
          extractionStatus: 'extracted_clear'
        },
        {
          id: 'q-s8-2',
          order: 2,
          question: 'Theo tác giả, người chính trực có những biểu hiện cụ thể nào trước cám dỗ?',
          level: 'nhan_biet',
          levelName: 'Nhận biết',
          maxScore: 0.75,
          extractionStatus: 'extracted_clear'
        },
        {
          id: 'q-s8-3',
          order: 3,
          question: 'Phân tích tác dụng của biện pháp tu từ ẩn dụ trong câu: "chính sự chính trực mới là chiếc neo giữ con người không bị chao đảo trước những cơn sóng ngầm của đạo đức giả".',
          level: 'thong_hieu',
          levelName: 'Thông hiểu',
          maxScore: 1.0,
          extractionStatus: 'extracted_clear'
        },
        {
          id: 'q-s8-4',
          order: 4,
          question: 'Anh/chị có đồng tình với quan điểm: chấp nhận đi con đường gập ghềnh để giữ lòng tự trọng không? Vì sao?',
          level: 'van_dung_cao',
          levelName: 'Vận dụng cao',
          maxScore: 1.5,
          extractionStatus: 'extracted_clear'
        }
      ],
      maxScore: 4.0
    },
    writingTasks: {
      paragraphTask: {
        id: 'w-s8-task1',
        type: 'nghi_luan_xa_hoi',
        typeName: 'Nghị luận xã hội',
        wordLimitLabel: 'Khoảng 200 chữ (1 đoạn văn)',
        targetWordCount: 200,
        promptText: 'Viết một đoạn văn (khoảng 200 chữ) trình bày suy nghĩ của anh/chị về ý nghĩa của tính trung thực trong học tập và thi cử đối với học sinh lớp 12.',
        maxScore: 2.0,
        rubric: generateDraftParagraphRubric('nghi_luan_xa_hoi'),
        isAiDraftRubric: false,
        extractionStatus: 'extracted_clear'
      },
      essayTask: {
        id: 'w-s8-task2',
        type: 'nghi_luan_van_hoc',
        typeName: 'Nghị luận văn học',
        wordLimitLabel: 'Khoảng 600 chữ (Bài văn)',
        targetWordCount: 600,
        promptText: 'Viết một bài văn nghị luận (khoảng 600 chữ) phân tích vẻ đẹp phẩm chất kiên cường, bất khuất của con người Việt Nam qua một tác phẩm văn học hiện đại lớp 12.',
        maxScore: 4.0,
        rubric: generateDraftEssayRubric('nghi_luan_van_hoc'),
        isAiDraftRubric: false,
        extractionStatus: 'extracted_clear'
      }
    },
    totalScore: 10.0,
    durationMinutes: 120,
    hasScoringGuide: true,
    status: 'verified',
    assignedClasses: ['Tất cả lớp'],
    assignedMode: 'mock_exam',
    verificationFlags: [],
    consistencyReport: {
      isValid: true,
      readingScoreSum: 4.0,
      paragraphScoreSum: 2.0,
      essayScoreSum: 4.0,
      overallScoreSum: 10.0,
      expectedTotal: 10.0,
      discrepancies: [],
      suggestedFixes: []
    },
    createdAt: '06/10/2026',
    updatedAt: '14/10/2026'
  }
];

const STORAGE_KEY_REAL_EXAMS = 'vanai12_real_complete_exams_v2';

/**
 * Nhận diện và phân loại một Đề thi tổng hợp trong ngân hàng (Yêu cầu 2 & 4)
 */
export function classifyExamForTeacherBank(exam: CompleteExam): {
  examId: string;
  code: string;
  title: string;
  readingGenreLabel: string;
  paragraphTypeLabel: string;
  essayTypeLabel: string;
  templateCode: 'A' | 'B' | 'custom';
  templateBadge: string;
  rubricCode: string;
  isPublishedAndReady: boolean;
  statusBadge: 'Đã xuất bản' | 'Chờ giáo viên kiểm tra';
  pendingReason?: string;
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

  const isPublishedAndReady =
    isPublishedStatus &&
    !hasUnresolvedFlags &&
    isConsistent &&
    hasParagraphRubric &&
    hasEssayRubric &&
    exam.hasScoringGuide !== false;

  const templateCode: 'A' | 'B' | 'custom' =
    exam.templateType === 'template_a'
      ? 'A'
      : exam.templateType === 'template_b'
      ? 'B'
      : 'custom';

  const rubricCode =
    templateCode === 'A'
      ? 'RUBRIC-THPT-MAU-A-100'
      : templateCode === 'B'
      ? 'RUBRIC-THPT-MAU-B-100'
      : 'RUBRIC-THPT-CUSTOM-100';

  return {
    examId: exam.id,
    code: exam.code,
    title: exam.title,
    readingGenreLabel:
      exam.readingPassage.genre === 'van_hoc'
        ? 'Văn bản văn học (4,0đ · 30p)'
        : exam.readingPassage.genre === 'nghi_luan'
        ? 'Văn bản nghị luận (4,0đ · 30p)'
        : exam.readingPassage.genre === 'thong_tin'
        ? 'Văn bản thông tin (4,0đ · 30p)'
        : `${exam.readingPassage.genreName} (4,0đ · 30p)`,
    paragraphTypeLabel:
      exam.writingTasks.paragraphTask.type === 'nghi_luan_xa_hoi'
        ? 'Đoạn văn 200 chữ: 2.1. Nghị luận xã hội (2,0đ · 30p)'
        : 'Đoạn văn 200 chữ: 2.2. Nghị luận văn học (2,0đ · 30p)',
    essayTypeLabel:
      exam.writingTasks.essayTask.type === 'nghi_luan_xa_hoi'
        ? 'Bài văn 600 chữ: 2.1. Nghị luận xã hội (4,0đ · 60p)'
        : 'Bài văn 600 chữ: 2.2. Nghị luận văn học (4,0đ · 60p)',
    templateCode,
    templateBadge:
      templateCode === 'A' ? 'Đề mẫu A' : templateCode === 'B' ? 'Đề mẫu B' : 'Cấu trúc tùy chỉnh',
    rubricCode,
    isPublishedAndReady,
    statusBadge: isPublishedAndReady ? 'Đã xuất bản' : 'Chờ giáo viên kiểm tra',
    pendingReason: isPublishedAndReady
      ? undefined
      : !isConsistent
      ? 'Tổng điểm chưa khớp chuẩn 4,0 + 2,0 + 4,0 = 10,0 điểm.'
      : !hasParagraphRubric || !hasEssayRubric || exam.hasScoringGuide === false
      ? 'Thiếu hướng dẫn chấm hoặc Rubric dự thảo chưa được giáo viên xác nhận.'
      : hasUnresolvedFlags
      ? 'Còn cờ cảnh báo cần giáo viên kiểm tra lại.'
      : 'Đề đang ở trạng thái nháp — chờ giáo viên xuất bản.'
  };
}

/**
 * Lấy danh sách các Đề thi tổng hợp ĐÃ XUẤT BẢN và CÓ ĐỦ RUBRIC HỢP LỆ theo Đề mẫu A hoặc Đề mẫu B
 * Không bao giờ trả về các đề đang "Chờ giáo viên kiểm tra" (như đề thiếu rubric hoặc lệch điểm).
 */
export function getPublishedBankExamsByTemplate(
  templateFilter: 'all' | 'template_a' | 'template_b' = 'all',
  customStoredExams: CompleteExam[] = []
): CompleteExam[] {
  // Gộp đề giáo viên đã xuất bản từ kho lưu trữ và ngân hàng đề chuẩn đã xuất bản
  const combined: CompleteExam[] = [...customStoredExams];
  for (const preset of PREBUILT_TEST_SCENARIO_EXAMS) {
    if (!combined.some((c) => c.id === preset.id)) {
      combined.push(preset);
    }
  }

  // Chỉ giữ những đề đã xuất bản (verified / assigned) và vượt qua kiểm tra Rubric + Thang điểm 4+2+4
  const readyExams = combined.filter((ex) => classifyExamForTeacherBank(ex).isPublishedAndReady);

  if (templateFilter === 'all') {
    return readyExams;
  }
  return readyExams.filter((ex) => ex.templateType === templateFilter);
}

/**
 * Lấy danh sách đề hoàn chỉnh thực tế (hoặc kịch bản minh họa khi isDemoMode = true).
 * Tuyệt đối KHÔNG tự nạp đề kiểm thử lỗi khi dữ liệu thật đang trống.
 */
export function getStoredCompleteExams(isDemoMode = false): CompleteExam[] {
  if (isDemoMode) {
    return PREBUILT_TEST_SCENARIO_EXAMS;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY_REAL_EXAMS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Lỗi đọc danh sách đề thi hoàn chỉnh thực tế:', err);
  }
  return [];
}

/**
 * Lưu danh sách đề hoàn chỉnh thực tế (Kiểm tra quyền Giáo viên ở tầng ghi dữ liệu)
 */
export function saveStoredCompleteExams(exams: CompleteExam[], isDemoMode = false): void {
  if (isDemoMode) return;
  if (!isVerifiedTeacherSession()) {
    throw new Error('Từ chối truy cập (403): Chỉ tài khoản Giáo viên đã xác thực mới có quyền lưu/chỉnh sửa ngân hàng đề.');
  }
  try {
    localStorage.setItem(STORAGE_KEY_REAL_EXAMS, JSON.stringify(exams));
  } catch (err) {
    console.error('Lỗi lưu danh sách đề thi hoàn chỉnh:', err);
  }
}


/**
 * Tạo đề nhanh theo Mẫu A hoặc Mẫu B
 */
export function createExamFromTemplate(
  template: 'template_a' | 'template_b',
  assignedClass: string,
  mode: 'practice' | 'mock_exam'
): CompleteExam {
  const base = template === 'template_a' ? PREBUILT_TEST_SCENARIO_EXAMS[4] : PREBUILT_TEST_SCENARIO_EXAMS[5];
  const newExam: CompleteExam = {
    ...JSON.parse(JSON.stringify(base)),
    id: `exam-tpl-${Date.now()}`,
    code: `THPT-${template === 'template_a' ? 'MAU-A' : 'MAU-B'}-${Math.floor(100 + Math.random() * 900)}`,
    title: `${base.title} (Giao lớp ${assignedClass})`,
    status: 'assigned',
    assignedClasses: [assignedClass],
    assignedMode: mode,
    dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toLocaleDateString('vi-VN'),
    createdAt: new Date().toLocaleDateString('vi-VN'),
    updatedAt: new Date().toLocaleDateString('vi-VN')
  };
  return newExam;
}

/**
 * Phân tích đề hoàn chỉnh bằng Server-Side Gemini AI (/api/ai/parse-exam)
 * Hỗ trợ cả văn bản (.docx, .txt, dán trực tiếp) và tệp đa phương thức (.pdf, ảnh chụp đề)
 */
export async function parseCompleteExamWithAI(
  rawExamText: string,
  rawGuideText?: string,
  fileData?: { mimeType: string; base64Data: string; fileName?: string }
): Promise<CompleteExam> {
  const res = await fetch('/api/ai/parse-exam', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawExamText, rawGuideText, fileData })
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || 'Không thể kết nối tới dịch vụ AI phân tích đề.');
  }

  const payload = await res.json();
  const aiData = payload.data;
  if (!aiData || !aiData.passageContent) {
    return parseCompleteExamText(rawExamText, rawGuideText);
  }

  const verificationFlags: VerificationFlag[] = [];
  const parsedQuestions: CompleteExamQuestion[] = (aiData.questions || []).map(
    (q: any, idx: number) => {
      const qOrder = q.order || idx + 1;
      const isScoreExplicit = Boolean(q.isScoreExplicit);
      const maxScore = Number(q.maxScore || 1.0);

      if (!isScoreExplicit) {
        verificationFlags.push({
          id: `flag-ai-q${qOrder}-score`,
          targetField: `reading_question_${qOrder}_score`,
          fieldLabel: `Điểm Câu ${qOrder} Đọc hiểu`,
          status: 'needs_teacher_confirm',
          originalSnippet: q.question?.slice(0, 120) || '',
          reason: `Đề gốc không ghi rõ điểm cho Câu ${qOrder}. AI đề xuất ${formatVNDecimal(maxScore)}đ.`,
          suggestedResolution: `Xác nhận mức điểm ${formatVNDecimal(maxScore)}đ cho Câu ${qOrder}.`,
          isResolved: false,
          resolvedValue: maxScore
        });
      }

      return {
        id: `exam-q-${qOrder}`,
        order: qOrder,
        question: q.question || '',
        level: (q.level as CognitiveLevel) || 'thong_hieu',
        levelName: q.levelName || 'Thông hiểu',
        maxScore,
        answerGuide: q.answerGuide || undefined,
        extractionStatus: isScoreExplicit ? 'extracted_clear' : 'needs_teacher_confirm',
        suggestedScore: maxScore
      };
    }
  );

  const pType: 'nghi_luan_xa_hoi' | 'nghi_luan_van_hoc' =
    aiData.paragraphTask?.type === 'nghi_luan_van_hoc' ? 'nghi_luan_van_hoc' : 'nghi_luan_xa_hoi';
  const eType: 'nghi_luan_xa_hoi' | 'nghi_luan_van_hoc' =
    aiData.essayTask?.type === 'nghi_luan_van_hoc' ? 'nghi_luan_van_hoc' : 'nghi_luan_xa_hoi';

  const hasGuide = Boolean(
    rawGuideText?.trim() ||
      aiData.paragraphTask?.answerGuideOrRubricNote ||
      aiData.essayTask?.answerGuideOrRubricNote
  );

  const paragraphTask: CompleteExamWritingTask = {
    id: 'writing-task-1',
    type: pType,
    typeName: pType === 'nghi_luan_xa_hoi' ? 'Nghị luận xã hội' : 'Nghị luận văn học',
    wordLimitLabel: 'Khoảng 200 chữ (1 đoạn văn)',
    targetWordCount: 200,
    promptText: aiData.paragraphTask?.promptText || 'Viết đoạn văn khoảng 200 chữ.',
    maxScore: Number(aiData.paragraphTask?.maxScore || 2.0),
    rubric: generateDraftParagraphRubric(pType),
    isAiDraftRubric: !hasGuide,
    extractionStatus: hasGuide ? 'extracted_clear' : 'needs_teacher_confirm',
    verificationNotes: aiData.paragraphTask?.answerGuideOrRubricNote || undefined
  };

  const essayTask: CompleteExamWritingTask = {
    id: 'writing-task-2',
    type: eType,
    typeName: eType === 'nghi_luan_xa_hoi' ? 'Nghị luận xã hội' : 'Nghị luận văn học',
    wordLimitLabel: 'Khoảng 600 chữ (Bài văn)',
    targetWordCount: 600,
    promptText: aiData.essayTask?.promptText || 'Viết bài văn khoảng 600 chữ.',
    maxScore: Number(aiData.essayTask?.maxScore || 4.0),
    rubric: generateDraftEssayRubric(eType),
    isAiDraftRubric: !hasGuide,
    extractionStatus: hasGuide ? 'extracted_clear' : 'needs_teacher_confirm',
    verificationNotes: aiData.essayTask?.answerGuideOrRubricNote || undefined
  };

  if (!hasGuide) {
    verificationFlags.push({
      id: 'flag-ai-draft-rubric',
      targetField: 'writing_rubric',
      fieldLabel: 'Rubric dự thảo cho Phần Viết',
      status: 'needs_teacher_confirm',
      originalSnippet: 'Tệp đề không kèm hướng dẫn chấm chi tiết.',
      reason: 'AI đã tự sinh bảng Rubric dự thảo chuẩn THPT (Đoạn văn 2,0đ + Bài văn 4,0đ).',
      suggestedResolution: 'Giáo viên bấm xác nhận để áp dụng Rubric dự thảo này khi chấm bài.',
      isResolved: false
    });
  }

  const consistencyReport = validateExamConsistency(parsedQuestions, paragraphTask, essayTask, 10.0);
  if (!consistencyReport.isValid) {
    verificationFlags.push({
      id: 'flag-ai-consistency',
      targetField: 'overall_total_score',
      fieldLabel: 'Tổng điểm đề chưa khớp 10,0 điểm',
      status: 'needs_teacher_confirm',
      originalSnippet: `Tổng hiện tại: ${formatVNDecimal(consistencyReport.overallScoreSum)}đ`,
      reason: consistencyReport.discrepancies.join(' '),
      suggestedResolution: consistencyReport.suggestedFixes.join(' '),
      isResolved: false
    });
  }

  const templateType: ExamTemplateType =
    aiData.templateType === 'template_a' || aiData.templateType === 'template_b'
      ? aiData.templateType
      : 'custom';

  return {
    id: `exam-${Date.now()}`,
    code: `THPT-2026-${Math.floor(100 + Math.random() * 900)}`,
    title: aiData.title || 'Đề thi Tốt nghiệp THPT môn Ngữ văn',
    templateType,
    templateLabel: aiData.templateLabel || 'Cấu trúc đề THPT',
    readingPassage: {
      title: aiData.passageTitle || 'Ngữ liệu đọc hiểu',
      author: aiData.passageAuthor || 'Tác giả',
      source: aiData.passageSource || 'Nguồn trích',
      genre: aiData.passageGenre || 'van_hoc',
      genreName: aiData.genreName || 'Văn bản đọc hiểu',
      content: aiData.passageContent,
      questions: parsedQuestions,
      maxScore: Number(consistencyReport.readingScoreSum || 4.0)
    },
    writingTasks: {
      paragraphTask,
      essayTask
    },
    totalScore: 10.0,
    durationMinutes: Number(aiData.durationMinutes || 120),
    hasScoringGuide: hasGuide,
    status: verificationFlags.some((f) => !f.isResolved) ? 'draft' : 'verified',
    assignedClasses: [],
    assignedMode: 'mock_exam',
    verificationFlags,
    consistencyReport,
    rawSourceText: rawExamText || aiData.passageContent,
    rawGuideText,
    createdAt: new Date().toLocaleDateString('vi-VN'),
    updatedAt: new Date().toLocaleDateString('vi-VN')
  };
}

