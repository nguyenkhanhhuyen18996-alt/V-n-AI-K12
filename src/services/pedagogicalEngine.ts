import {
  ReadingFeedback,
  WritingFeedback,
  CriterionEvaluation,
  ReadingQuestion,
  ConfidenceLevel
} from '../types';

/**
 * Động cơ phân tích sư phạm VănAI 12 (Phiên bản v2.0)
 * - Cơ chế tại trình duyệt: "Gợi ý theo quy tắc — chưa phải chấm AI" (chỉ kiểm tra cấu trúc, dung lượng, nhóm ý tương đương; không mạo danh AI và không cấp điểm chính thức).
 * - Cơ chế máy chủ (/api/ai/*): Gọi mô hình Gemini thật ở phía server bằng khóa bí mật GEMINI_API_KEY, trả về điểm từng tiêu chí, lí do, trích dẫn nguyên văn từ bài làm học sinh, mức độ chắc chắn và cờ cần giáo viên xem lại.
 */

export const RULE_BASED_LABEL = 'Gợi ý theo quy tắc — chưa phải chấm AI';
export const GEMINI_AI_LABEL = 'Chấm sơ bộ bằng Gemini AI (Chờ giáo viên duyệt)';

// Nhóm từ đồng nghĩa & cách diễn đạt tương đương trong Ngữ văn THPT (tránh dò từ khóa máy móc)
const SEMANTIC_SYNONYM_CLUSTERS: Record<string, string[]> = {
  'ẩn dụ': ['ẩn dụ', 'hình ảnh biểu trưng', 'hàm ý', 'ngầm chỉ', 'tượng trưng cho'],
  'hoán dụ': ['hoán dụ', 'lấy bộ phận chỉ toàn thể', 'dấu hiệu đi liền'],
  'điệp': ['điệp từ', 'điệp ngữ', 'điệp cấu trúc', 'lặp lại', 'nhấn mạnh'],
  'nhân hóa': ['nhân hóa', 'gán thuộc tính con người', 'trở nên có hồn', 'sống động'],
  'tự do': ['thể thơ tự do', 'thơ tự do', 'câu thơ dài ngắn linh hoạt', 'không bó buộc số chữ'],
  'nghịch cảnh': ['nghịch cảnh', 'khó khăn', 'thử thách', 'gian nan', 'bão giông', 'trắc trở', 'sỏi đá', 'vấp ngã'],
  'kiên cường': ['kiên cường', 'bản lĩnh', 'vươn lên', 'bất khuất', 'không bỏ cuộc', 'ý chí', 'nghị lực', 'vượt qua'],
  'dấn thân': ['dấn thân', 'nhập cuộc', 'dám nghĩ dám làm', 'bước ra khỏi vùng an toàn', 'chủ động', 'cống hiến'],
  'tuổi trẻ': ['tuổi trẻ', 'thanh niên', 'thế hệ trẻ', 'người trẻ', 'thanh xuân'],
  'tác giả': ['tác giả', 'nhà thơ', 'nhà văn', 'người viết', 'chủ thể trữ tình']
};

/**
 * Kiểm tra xem văn bản học sinh có chứa khái niệm hoặc cách diễn đạt tương đương về ý hay không
 */
export function matchesConceptOrEquivalent(studentTextLower: string, concept: string): boolean {
  const cleanConcept = concept.trim().toLowerCase();
  if (!cleanConcept) return false;
  if (studentTextLower.includes(cleanConcept)) return true;

  for (const [key, equivalents] of Object.entries(SEMANTIC_SYNONYM_CLUSTERS)) {
    if (cleanConcept.includes(key) || equivalents.some((eq) => cleanConcept.includes(eq))) {
      if (equivalents.some((eq) => studentTextLower.includes(eq))) {
        return true;
      }
    }
  }

  // So khớp theo cụm từ gốc (> 2 từ) nếu học sinh diễn đạt đảo trật tự từ
  const tokens = cleanConcept.split(/\s+/).filter((w) => w.length > 2);
  if (tokens.length >= 2) {
    const matchedTokens = tokens.filter((t) => studentTextLower.includes(t));
    if (matchedTokens.length >= Math.ceil(tokens.length * 0.7)) {
      return true;
    }
  }
  return false;
}

/**
 * Trích dẫn nguyên văn câu văn thực tế từ bài làm của học sinh (Tuyệt đối không bịa dẫn chứng)
 */
export function extractVerbatimStudentQuotes(studentText: string, maxQuotes = 2): string[] {
  const clean = studentText.trim();
  if (!clean) return [];
  const sentences = clean
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12);
  if (sentences.length === 0) {
    return [clean.slice(0, 140)];
  }
  return sentences.slice(0, maxQuotes).map((s) => (s.length > 160 ? `${s.slice(0, 157)}...` : s));
}

/**
 * Xác thực trích dẫn có thực sự nằm trong bài làm của học sinh hay không (Chống ảo giác AI)
 */
export function verifyQuotesInStudentText(quotes: unknown, studentText: string): string[] {
  if (!Array.isArray(quotes) || !studentText) return [];
  const normalizedStudent = studentText.toLowerCase().replace(/\s+/g, ' ').trim();
  return quotes
    .map((q) => String(q || '').trim())
    .filter((q) => {
      if (!q || q.length < 3) return false;
      const normalizedQuote = q
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/^["“']+|["”']+$/g, '')
        .trim();
      return normalizedQuote.length >= 3 && normalizedStudent.includes(normalizedQuote);
    });
}

/**
 * GỢI Ý THEO QUY TẮC CHO CÂU HỎI ĐỌC HIỂU (CHƯA PHẢI CHẤM AI)
 */
export function evaluateReadingAnswer(
  passageText: string,
  questionText: string,
  studentAnswer: string,
  questionRef?: ReadingQuestion,
  apiWarningMessage?: string
): ReadingFeedback {
  const cleanAnswer = studentAnswer.trim();
  const words = cleanAnswer.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  const strengths: string[] = [];
  const missingPoints: string[] = [];
  const textEvidenceHints: string[] = [];
  const guidingQuestions: string[] = [];

  if (wordCount < 6) {
    missingPoints.push('Câu trả lời quá ngắn, chưa tạo thành câu hoàn chỉnh có chủ ngữ - vị ngữ rõ ràng.');
    guidingQuestions.push('Bạn hãy viết lại thành một câu diễn đạt trọn vẹn, bắt đầu bằng cách nhắc lại một phần câu hỏi.');
  } else {
    strengths.push(`Đã hình thành câu trả lời (${wordCount} từ), có nỗ lực diễn đạt bằng lời văn cá nhân.`);
  }

  const answerLower = cleanAnswer.toLowerCase();
  const studentQuotes = extractVerbatimStudentQuotes(cleanAnswer, 1);

  if (questionRef) {
    const matchedConcepts = (questionRef.keyConcepts || []).filter((concept) =>
      matchesConceptOrEquivalent(answerLower, concept)
    );

    if (matchedConcepts.length > 0) {
      strengths.push(
        `Đã thể hiện được ý tương đương hoặc khái niệm trọng tâm liên quan đến: "${matchedConcepts.join(', ')}".`
      );
    } else {
      missingPoints.push(
        'Chưa nhận diện rõ ý trọng tâm hoặc chi tiết tương đương với hướng dẫn chấm (lưu ý: bộ lọc quy tắc chỉ kiểm tra sơ bộ, cần giáo viên hoặc Gemini AI đối chiếu ngữ nghĩa sâu hơn).'
      );
      guidingQuestions.push(
        `Hãy đọc lại văn bản và kiểm tra nội dung gợi ý: "${questionRef.contextHint}".`
      );
    }

    if (questionRef.level === 'nhan_biet') {
      textEvidenceHints.push(`Căn cứ trực tiếp: ${questionRef.contextHint}`);
      guidingQuestions.push(
        'Với câu hỏi Nhận biết, chỉ cần chỉ ra hoặc trích dẫn chính xác chi tiết trong ngữ liệu.'
      );
    } else if (questionRef.level === 'thong_hieu') {
      textEvidenceHints.push(`Căn cứ suy luận: ${questionRef.contextHint}`);
      if (!/vì|bởi|nghĩa là|cho thấy|thể hiện|nhấn mạnh|qua đó|giúp/i.test(cleanAnswer)) {
        missingPoints.push('Nên bổ sung từ ngữ lí giải ý nghĩa/tác dụng (ví dụ: "qua đó thể hiện...", "bởi vì...").');
        guidingQuestions.push('Sau khi nêu ý chính, bạn hãy giải thích ngắn gọn: Chi tiết/biện pháp đó có tác dụng gì?');
      }
    } else {
      textEvidenceHints.push('Gợi ý vận dụng: Kết nối thông điệp của văn bản với góc nhìn và trải nghiệm thực tế.');
      guidingQuestions.push('Thông điệp này có ý nghĩa gì đối với nhận thức và hành động của người trẻ hiện nay?');
    }
  } else {
    const sentences = passageText
      .split(/[.\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 15);
    const relatedSentence = sentences.find((s) => {
      const sWords = s.toLowerCase().split(/\s+/).slice(0, 6);
      return sWords.some((w) => w.length > 3 && answerLower.includes(w));
    });

    if (relatedSentence) {
      strengths.push('Câu trả lời có sự liên kết với chi tiết trong ngữ liệu đọc hiểu.');
      textEvidenceHints.push(`Chi tiết ngữ liệu liên quan: "${relatedSentence.slice(0, 100)}..."`);
    } else {
      missingPoints.push('Chưa thấy trích dẫn hoặc liên hệ trực tiếp tới chi tiết trong đoạn trích.');
      textEvidenceHints.push('Hãy trích dẫn hoặc nêu rõ chi tiết trong văn bản làm căn cứ cho câu trả lời.');
    }
    guidingQuestions.push('Câu trả lời đã bao gồm đủ 2 vế: (1) Nêu trực tiếp ý trả lời và (2) Lí giải ngắn gọn chưa?');
  }

  if (cleanAnswer && !/[.!?]$/.test(cleanAnswer)) {
    missingPoints.push('Cuối câu trả lời chưa có dấu câu kết thúc theo quy tắc chính tả.');
  }

  return {
    strengths: strengths.length ? strengths : ['Đã ghi nhận câu trả lời nháp ban đầu của học sinh.'],
    missingPoints: missingPoints.length ? missingPoints : ['Cần giáo viên hoặc mô hình AI thẩm định thêm chiều sâu lập luận.'],
    textEvidenceHints: textEvidenceHints.length ? textEvidenceHints : ['Đối chiếu trực tiếp các câu văn trong đoạn trích.'],
    guidingQuestions: guidingQuestions.slice(0, 3),
    rubricSummary: `${RULE_BASED_LABEL} — Phân tích sơ bộ dựa trên cấu trúc câu, độ dài và nhóm từ đồng nghĩa.`,
    evaluatedAt: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    evaluationSource: 'rule_based_fallback',
    evaluationSourceLabel: RULE_BASED_LABEL,
    studentQuotes,
    rationale:
      'Kết quả này được tạo tự động bằng bộ quy tắc kiểm tra định dạng, độ dài và nhóm từ đồng nghĩa tại trình duyệt (chưa phải chấm bằng mô hình AI). Điểm số không được tính vào hồ sơ năng lực chính thức.',
    confidenceLevel: 'low',
    confidenceScore: 45,
    needsReview: true,
    reviewReason: 'Chế độ gợi ý theo quy tắc — cần Giáo viên bộ môn xem xét và chấm điểm chính thức.',
    apiWarningMessage
  };
}

/**
 * GỢI Ý THEO QUY TẮC CHO BÀI VIẾT NGHỊ LUẬN (CHƯA PHẢI CHẤM AI)
 */
export function evaluateWritingEssay(
  promptText: string,
  essayText: string,
  type: 'nghi_luan_xa_hoi' | 'nghi_luan_van_hoc',
  apiWarningMessage?: string,
  options?: {
    maxScore?: number;
    targetWordCount?: number;
    rubric?: CriterionEvaluation[];
  }
): WritingFeedback {
  const cleanText = essayText.trim();
  const words = cleanText.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  const paragraphs = cleanText.split(/\n+/).filter((p) => p.trim().length > 0);
  const paragraphCount = paragraphs.length;
  const isParagraph200Words =
    options?.maxScore !== undefined
      ? options.maxScore <= 2.5
      : options?.targetWordCount !== undefined
      ? options.targetWordCount <= 250
      : type === 'nghi_luan_xa_hoi';
  const quotes = extractVerbatimStudentQuotes(cleanText, 4);

  // Tiêu chí 1: Thể thức & Cấu trúc
  let c1Score: CriterionEvaluation['scoreLevel'] = 'Đạt cơ bản';
  let c1Status: CriterionEvaluation['scoreStatus'] = 'info';
  let c1Strengths = 'Đã trình bày văn bản theo chủ đề bài viết.';
  let c1Weaknesses = '';
  let c1Remedy = 'Tiếp tục duy trì bố cục rõ ràng, mạch lạc.';
  const c1Max = isParagraph200Words ? 0.25 : 0.5;
  let c1Awarded = isParagraph200Words ? 0.2 : 0.35;

  if (isParagraph200Words) {
    if (paragraphCount > 1) {
      c1Score = 'Cần bổ sung';
      c1Status = 'warning';
      c1Awarded = 0;
      c1Weaknesses = `Đề yêu cầu viết ĐOẠN VĂN (~200 chữ), nhưng bài viết đang tách thành ${paragraphCount} đoạn.`;
      c1Remedy = 'Gộp các đoạn lại thành 1 đoạn văn duy nhất, không xuống dòng giữa chừng.';
    } else if (wordCount < 120) {
      c1Score = 'Cần bổ sung';
      c1Status = 'warning';
      c1Awarded = 0.1;
      c1Weaknesses = `Dung lượng hiện tại (${wordCount} từ) ngắn hơn yêu cầu chuẩn khoảng 200 chữ.`;
      c1Remedy = 'Bổ sung thêm lí lẽ phân tích và dẫn chứng thực tế.';
    } else if (wordCount > 350) {
      c1Score = 'Khá';
      c1Status = 'info';
      c1Awarded = 0.2;
      c1Weaknesses = `Dung lượng (${wordCount} từ) dài hơn quy chuẩn đoạn văn 200 chữ.`;
      c1Remedy = 'Cô đọng câu chữ, tập trung vào trọng tâm vấn đề.';
    } else {
      c1Score = 'Tốt & Sâu sắc';
      c1Status = 'success';
      c1Awarded = 0.25;
      c1Strengths = `Đảm bảo đúng thể thức 1 đoạn văn duy nhất (${wordCount} từ).`;
    }
  } else {
    if (paragraphCount < 3) {
      c1Score = 'Cần bổ sung';
      c1Status = 'warning';
      c1Awarded = 0.2;
      c1Weaknesses = `Bài văn nghị luận cần tối thiểu 3 phần (Mở - Thân - Kết), hiện mới có ${paragraphCount} đoạn.`;
      c1Remedy = 'Tách rõ Mở bài, các đoạn Thân bài và Kết bài.';
    } else if (wordCount < 350) {
      c1Score = 'Cần bổ sung';
      c1Status = 'warning';
      c1Awarded = 0.25;
      c1Weaknesses = `Dung lượng (${wordCount} từ) còn ngắn so với yêu cầu bài văn khoảng 600 chữ.`;
      c1Remedy = 'Mở rộng phân tích luận điểm và dẫn chứng.';
    } else {
      c1Score = 'Tốt & Sâu sắc';
      c1Status = 'success';
      c1Awarded = 0.5;
      c1Strengths = `Bố cục nhiều đoạn (${paragraphCount} đoạn, ${wordCount} từ) đáp ứng cấu trúc bài văn.`;
    }
  }

  // Tiêu chí 2: Xác định vấn đề nghị luận (kiểm tra sự tương giao từ ngữ/khái niệm với đề bài)
  const promptKeywords = promptText
    .toLowerCase()
    .split(/[\s,.;:?!"“”()]+/)
    .filter((w) => w.length > 4);
  const textLower = cleanText.toLowerCase();
  const matchedPromptWords = promptKeywords.filter((w) => matchesConceptOrEquivalent(textLower, w));
  const relevanceRatio = promptKeywords.length > 0 ? matchedPromptWords.length / promptKeywords.length : 0.5;
  const c2Max = isParagraph200Words ? 0.25 : 0.5;
  const c2Awarded = Number((relevanceRatio >= 0.25 ? c2Max : c2Max * 0.5).toFixed(2));
  const c2Score: CriterionEvaluation['scoreLevel'] = relevanceRatio >= 0.25 ? 'Khá' : 'Cần bổ sung';
  const c2Status: CriterionEvaluation['scoreStatus'] = relevanceRatio >= 0.25 ? 'success' : 'warning';

  // Tiêu chí 3: Luận điểm, lí lẽ và dẫn chứng
  const hasReasoningMarkers =
    /theo tôi|có thể thấy|trước hết|mặt khác|thực chất|ý nghĩa|bản chất|giá trị|bởi vì|do đó|nhờ có|khi chúng ta/i.test(
      cleanText
    );
  const hasEvidenceMarkers =
    /ví dụ|chẳng hạn|dẫn chứng|điển hình|trong thực tế|nhân vật|tác phẩm|câu thơ|chi tiết|hình ảnh|lịch sử|cuộc sống/i.test(
      cleanText
    );
  const c3Max = isParagraph200Words ? 1.0 : 2.0;
  let c3Awarded = Number((c3Max * 0.5).toFixed(2));
  let c3Score: CriterionEvaluation['scoreLevel'] = 'Đạt cơ bản';
  let c3Status: CriterionEvaluation['scoreStatus'] = 'info';

  if (hasReasoningMarkers && hasEvidenceMarkers && wordCount >= (isParagraph200Words ? 150 : 400)) {
    c3Awarded = Number((c3Max * 0.8).toFixed(2));
    c3Score = 'Khá';
    c3Status = 'success';
  } else if (!hasEvidenceMarkers) {
    c3Awarded = Number((c3Max * 0.4).toFixed(2));
    c3Score = 'Cần bổ sung';
    c3Status = 'warning';
  }

  // Tiêu chí 4: Diễn đạt, liên kết và sáng tạo
  const transitionWords =
    /tuy nhiên|bởi vậy|do đó|thêm vào đó|bên cạnh đó|không chỉ|mặt khác|chính vì vậy|tóm lại|nhìn chung|hơn thế nữa/i.test(
      cleanText
    );
  const sentences = cleanText.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  const overlyLongSentence = sentences.find((s) => s.split(/\s+/).length > 48);
  const c4Max = isParagraph200Words ? 0.5 : 1.0;
  const c4Awarded = Number(
    (transitionWords && !overlyLongSentence ? c4Max * 0.8 : c4Max * 0.6).toFixed(2)
  );

  const baseCriteria: CriterionEvaluation[] = [
    {
      id: options?.rubric?.[0]?.id || 'crit-1',
      name:
        options?.rubric?.[0]?.name ||
        (isParagraph200Words
          ? '1. Đảm bảo thể thức 1 đoạn văn (~200 chữ)'
          : '1. Đảm bảo cấu trúc bài nghị luận (Mở - Thân - Kết)'),
      weightLabel: options?.rubric?.[0]?.weightLabel || (isParagraph200Words ? '0,25 điểm' : '0,5 điểm'),
      scoreLevel: c1Score,
      scoreStatus: c1Status,
      strengths: c1Strengths,
      weaknesses: c1Weaknesses || 'Đáp ứng yêu cầu hình thức cơ bản.',
      remedyStep: c1Remedy,
      scoreAwarded: c1Awarded,
      maxCriterionScore: options?.rubric?.[0]?.maxCriterionScore || c1Max,
      rationale: `[Quy tắc kiểm tra hình thức]: Bài viết gồm ${paragraphCount} đoạn, ${wordCount} từ.`,
      studentQuote: quotes[0] || '',
      confidenceLevel: 'high',
      needsReview: false
    },
    {
      id: options?.rubric?.[1]?.id || 'crit-2',
      name:
        options?.rubric?.[1]?.name ||
        (type === 'nghi_luan_van_hoc'
          ? '2. Xác định đúng khía cạnh nội dung/nghệ thuật văn học'
          : '2. Xác định đúng vấn đề nghị luận xã hội'),
      weightLabel: options?.rubric?.[1]?.weightLabel || (isParagraph200Words ? '0,25 điểm' : '0,5 điểm'),
      scoreLevel: c2Score,
      scoreStatus: c2Status,
      strengths:
        relevanceRatio >= 0.25
          ? 'Có sử dụng các từ ngữ/khái niệm gắn với chủ đề trong đề bài.'
          : 'Đã bước đầu triển khai nội dung bài viết.',
      weaknesses:
        relevanceRatio >= 0.25
          ? 'Cần giáo viên hoặc mô hình Gemini AI kiểm tra độ sâu sắc của luận đề.'
          : 'Ít xuất hiện từ khóa hoặc khái niệm tương đương với đề bài.',
      remedyStep: 'Nêu bật vấn đề nghị luận ngay ở câu mở đoạn / mở bài.',
      scoreAwarded: c2Awarded,
      maxCriterionScore: options?.rubric?.[1]?.maxCriterionScore || c2Max,
      rationale:
        '[Gợi ý theo quy tắc]: Kiểm tra sơ bộ độ phủ khái niệm tương đương với đề bài (cần giáo viên duyệt chính thức).',
      studentQuote: quotes[0] || '',
      confidenceLevel: 'low',
      needsReview: true
    },
    {
      id: options?.rubric?.[2]?.id || 'crit-3',
      name: options?.rubric?.[2]?.name || '3. Triển khai luận điểm, lí lẽ và dẫn chứng',
      weightLabel: options?.rubric?.[2]?.weightLabel || (isParagraph200Words ? '1,0 điểm' : '2,0 điểm'),
      scoreLevel: c3Score,
      scoreStatus: c3Status,
      strengths: hasReasoningMarkers
        ? 'Có dấu hiệu triển khai lập luận và giải thích vấn đề.'
        : 'Đã trình bày suy nghĩ cá nhân về đề bài.',
      weaknesses: hasEvidenceMarkers
        ? 'Cần giáo viên thẩm định độ xác thực và chiều sâu phân tích dẫn chứng.'
        : 'Chưa nhận diện thấy dấu hiệu dẫn chứng cụ thể trong bài.',
      remedyStep: 'Kết hợp lí lẽ giải thích với phân tích dẫn chứng thực tế hoặc chi tiết tác phẩm.',
      scoreAwarded: c3Awarded,
      maxCriterionScore: options?.rubric?.[2]?.maxCriterionScore || c3Max,
      rationale:
        '[Gợi ý theo quy tắc]: Dựa trên dấu hiệu từ ngữ lập luận/dẫn chứng và độ dài; chưa thể đánh giá chiều sâu tư duy như giáo viên.',
      studentQuote: quotes[1] || quotes[0] || '',
      confidenceLevel: 'low',
      needsReview: true
    },
    {
      id: options?.rubric?.[3]?.id || 'crit-4',
      name: options?.rubric?.[3]?.name || '4. Diễn đạt, liên kết văn bản và sáng tạo',
      weightLabel: options?.rubric?.[3]?.weightLabel || (isParagraph200Words ? '0,5 điểm' : '1,0 điểm'),
      scoreLevel: overlyLongSentence ? 'Cần bổ sung' : 'Khá',
      scoreStatus: overlyLongSentence ? 'warning' : 'info',
      strengths: transitionWords
        ? 'Có sử dụng phương tiện liên kết câu và chuyển ý.'
        : 'Diễn đạt thành câu văn hoàn chỉnh.',
      weaknesses: overlyLongSentence
        ? 'Có câu văn quá dài (> 48 từ) chưa ngắt câu hợp lý.'
        : 'Cần giáo viên thẩm định chất văn và sáng tạo riêng.',
      remedyStep: overlyLongSentence
        ? 'Tách câu quá dài thành các câu ngắn gọn, rõ chủ ngữ - vị ngữ.'
        : 'Bổ sung câu văn phản đề hoặc liên hệ bản thân sâu sắc.',
      scoreAwarded: c4Awarded,
      maxCriterionScore: options?.rubric?.[3]?.maxCriterionScore || c4Max,
      rationale: '[Gợi ý theo quy tắc]: Kiểm tra độ dài câu và từ ngữ chuyển tiếp.',
      studentQuote: quotes[2] || '',
      confidenceLevel: 'low',
      needsReview: true
    }
  ];

  const criteria = baseCriteria.map((c) => ({
    ...c,
    scoreAwarded: Number(
      Math.max(0, Math.min(c.maxCriterionScore || 1, c.scoreAwarded || 0)).toFixed(2)
    )
  }));

  const sectionMax = isParagraph200Words ? 2.0 : 4.0;
  const totalRuleSuggested = Number(
    Math.min(
      sectionMax,
      criteria.reduce((sum, c) => sum + (c.scoreAwarded || 0), 0)
    ).toFixed(2)
  );

  const actionSteps: string[] = [
    `Bước 1 (Thể thức & Dung lượng): ${c1Remedy}`,
    `Bước 2 (Lập luận & Dẫn chứng): ${
      hasEvidenceMarkers
        ? 'Phân tích sâu hơn ý nghĩa của dẫn chứng đối với luận điểm chính.'
        : 'Bổ sung ít nhất 1 dẫn chứng cụ thể (người thật việc thật hoặc chi tiết tác phẩm).'
    }`,
    `Bước 3 (Diễn đạt): Rà soát lại mạch liên kết giữa các câu và chính tả trước khi nộp giáo viên.`
  ];

  return {
    overallImpression: `[${RULE_BASED_LABEL}]: Hệ thống đã kiểm tra nhanh thể thức (${paragraphCount} đoạn, ${wordCount} từ) và các dấu hiệu lập luận cơ bản. Lưu ý: Kết quả này chỉ là gợi ý theo quy tắc, KHÔNG phải điểm chấm AI chính thức và không đưa vào thống kê điểm đã duyệt.`,
    wordCount,
    paragraphCount,
    criteria,
    actionSteps,
    cautionNote:
      'Lưu ý minh bạch: Đây là gợi ý tự động theo quy tắc (từ khóa, số đoạn, độ dài) khi chưa kết nối Gemini AI phía máy chủ. Điểm chính thức phải do Giáo viên bộ môn chấm và xác nhận.',
    evaluatedAt: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    evaluationSource: 'rule_based_fallback',
    evaluationSourceLabel: RULE_BASED_LABEL,
    confidenceLevel: 'low',
    confidenceScore: 40,
    needsReview: true,
    reviewReason: 'Kết quả gợi ý theo quy tắc — bắt buộc cần Giáo viên bộ môn xem xét và chấm điểm chính thức.',
    apiWarningMessage,
    aiSuggestedScore: totalRuleSuggested
  };
}

/**
 * Helper gọi API kèm kiểm soát thời gian chờ (Timeout) và bắt lỗi JSON / Mất mạng
 */
async function postJsonWithTimeout(url: string, body: any, timeoutMs = 25000): Promise<any> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('NETWORK_OFFLINE: Thiết bị đang mất kết nối mạng Internet.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const rawText = await res.text();
    let parsed: any = null;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new Error('INVALID_JSON: Phản hồi từ máy chủ không đúng định dạng JSON hợp lệ.');
    }

    if (!res.ok || !parsed?.success) {
      const code = parsed?.errorCode || `HTTP_${res.status}`;
      const msg = parsed?.error || `Lỗi phản hồi API (${res.status}).`;
      throw new Error(`${code}: ${msg}`);
    }

    return parsed;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('AI_TIMEOUT: Quá thời gian chờ (25 giây) khi gọi máy chủ Gemini AI.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function formatFallbackWarning(err: any): string {
  const msg = String(err?.message || '');
  if (msg.includes('GEMINI_NOT_CONFIGURED')) {
    return 'Máy chủ chưa cấu hình biến môi trường bí mật GEMINI_API_KEY. Hệ thống giữ chế độ "Gợi ý theo quy tắc — chưa phải chấm AI" và không tạo điểm AI giả.';
  }
  if (msg.includes('NETWORK_OFFLINE')) {
    return 'Thiết bị đang mất kết nối mạng. Hệ thống tạm hiển thị "Gợi ý theo quy tắc — chưa phải chấm AI".';
  }
  if (msg.includes('AI_TIMEOUT')) {
    return 'Quá thời gian chờ phản hồi từ mô hình Gemini AI. Hệ thống tạm hiển thị "Gợi ý theo quy tắc — chưa phải chấm AI".';
  }
  if (msg.includes('INVALID_JSON') || msg.includes('INVALID_AI_JSON')) {
    return 'Phản hồi JSON từ mô hình không hợp lệ. Hệ thống chuyển về "Gợi ý theo quy tắc — chưa phải chấm AI".';
  }
  return `Không thể kết nối Gemini AI phía máy chủ (${msg || 'Lỗi kết nối'}). Đang hiển thị "Gợi ý theo quy tắc — chưa phải chấm AI".`;
}

/**
 * Phản hồi câu trả lời Đọc hiểu bằng Server-Side Gemini AI (/api/ai/evaluate-reading)
 * Bảo toàn điểm giáo viên đã duyệt (nếu có) để không bao giờ ghi đè điểm chính thức.
 */
export async function evaluateReadingAnswerWithAI(
  passageText: string,
  questionText: string,
  studentAnswer: string,
  questionRef?: ReadingQuestion,
  options?: {
    submissionVersion?: number;
    maxScore?: number;
    answerGuide?: string;
    existingApprovedFeedback?: Partial<ReadingFeedback>;
  }
): Promise<ReadingFeedback> {
  const maxScore = Number(
    Math.max(0.25, Math.min(4.0, options?.maxScore ?? questionRef?.maxScore ?? 1.0)).toFixed(2)
  );
  const submissionVersion = options?.submissionVersion ?? 1;

  try {
    const payload = await postJsonWithTimeout('/api/ai/evaluate-reading', {
      passageText,
      questionText,
      studentAnswer,
      submissionVersion,
      level: questionRef?.level || 'thong_hieu',
      levelName: questionRef?.levelName || 'Thông hiểu',
      maxScore,
      answerGuide: options?.answerGuide || questionRef?.contextHint || '',
      keyConcepts: questionRef?.keyConcepts || []
    });

    const fb = payload.feedback || {};
    const rawScore = Number(fb.aiSuggestedScore);
    const clampedScore = Number.isFinite(rawScore)
      ? Number(Math.max(0, Math.min(maxScore, rawScore)).toFixed(2))
      : 0;

    const verifiedQuotes = verifyQuotesInStudentText(fb.studentQuotes, studentAnswer);
    const confLevel: ConfidenceLevel =
      fb.confidenceLevel === 'high' || fb.confidenceLevel === 'medium' || fb.confidenceLevel === 'low'
        ? fb.confidenceLevel
        : 'medium';

    const result: ReadingFeedback = {
      strengths: Array.isArray(fb.strengths) && fb.strengths.length > 0 ? fb.strengths : ['Đã ghi nhận câu trả lời.'],
      missingPoints: Array.isArray(fb.missingPoints) ? fb.missingPoints : [],
      textEvidenceHints: Array.isArray(fb.textEvidenceHints) ? fb.textEvidenceHints : [],
      guidingQuestions: Array.isArray(fb.guidingQuestions) ? fb.guidingQuestions : [],
      rubricSummary:
        fb.rationale ||
        `Chấm sơ bộ bằng Gemini AI (Phiên bản v${submissionVersion} — Tối đa ${maxScore}đ).`,
      evaluatedAt: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      evaluationSource: 'gemini_ai',
      evaluationSourceLabel: GEMINI_AI_LABEL,
      studentQuotes: verifiedQuotes,
      aiSuggestedScore: clampedScore,
      rationale: String(fb.rationale || '').trim(),
      confidenceLevel: confLevel,
      confidenceScore: Number.isFinite(Number(fb.confidenceScore)) ? Number(fb.confidenceScore) : 80,
      needsReview: Boolean(fb.needsReview) || questionRef?.level === 'van_dung' || questionRef?.level === 'van_dung_cao',
      reviewReason: fb.reviewReason
    };

    // YÊU CẦU 7: Không bao giờ ghi đè điểm giáo viên đã xác nhận trước đó
    if (
      options?.existingApprovedFeedback &&
      typeof options.existingApprovedFeedback.teacherConfirmedScore === 'number'
    ) {
      result.teacherConfirmedScore = options.existingApprovedFeedback.teacherConfirmedScore;
      result.teacherNotes = options.existingApprovedFeedback.teacherNotes;
      result.confirmedByTeacherId = options.existingApprovedFeedback.confirmedByTeacherId;
      result.confirmedByTeacherName = options.existingApprovedFeedback.confirmedByTeacherName;
      result.confirmedAt = options.existingApprovedFeedback.confirmedAt;
    }

    return result;
  } catch (err: any) {
    const warningMsg = formatFallbackWarning(err);
    const fallback = evaluateReadingAnswer(passageText, questionText, studentAnswer, questionRef, warningMsg);

    if (
      options?.existingApprovedFeedback &&
      typeof options.existingApprovedFeedback.teacherConfirmedScore === 'number'
    ) {
      fallback.teacherConfirmedScore = options.existingApprovedFeedback.teacherConfirmedScore;
      fallback.teacherNotes = options.existingApprovedFeedback.teacherNotes;
      fallback.confirmedByTeacherId = options.existingApprovedFeedback.confirmedByTeacherId;
      fallback.confirmedByTeacherName = options.existingApprovedFeedback.confirmedByTeacherName;
      fallback.confirmedAt = options.existingApprovedFeedback.confirmedAt;
    }

    return fallback;
  }
}

/**
 * Chấm và phản hồi bài viết nghị luận bằng Server-Side Gemini AI (/api/ai/evaluate-writing)
 * Kiểm tra chặt chẽ điểm từng tiêu chí không vượt mức tối đa, tổng điểm đúng thang 2,0 hoặc 4,0,
 * và không bao giờ ghi đè điểm giáo viên đã duyệt.
 */
export async function evaluateWritingEssayWithAI(
  promptText: string,
  studentEssay: string,
  essayType: 'nghi_luan_xa_hoi' | 'nghi_luan_van_hoc',
  maxScore: number = 4.0,
  targetWordCount: number = 600,
  options?: {
    submissionVersion?: number;
    rubric?: CriterionEvaluation[];
    answerGuideOrRubricNote?: string;
    existingApprovedFeedback?: Partial<WritingFeedback>;
  }
): Promise<WritingFeedback> {
  const cleanEssay = studentEssay.trim();
  const wordCount = cleanEssay ? cleanEssay.split(/\s+/).filter(Boolean).length : 0;
  const paragraphCount = cleanEssay
    ? cleanEssay
        .split(/\n+/)
        .map((p) => p.trim())
        .filter(Boolean).length
    : 0;

  const isParagraph = maxScore <= 2.5 || targetWordCount <= 250;
  const sectionMaxScore = isParagraph ? 2.0 : 4.0;
  const submissionVersion = options?.submissionVersion ?? 1;

  try {
    const payload = await postJsonWithTimeout('/api/ai/evaluate-writing', {
      promptText,
      studentEssay,
      submissionVersion,
      essayType,
      maxScore: sectionMaxScore,
      targetWordCount,
      rubric: options?.rubric || [],
      answerGuideOrRubricNote: options?.answerGuideOrRubricNote || ''
    });

    const fb = payload.feedback || {};
    const rawCriteria = Array.isArray(fb.criteria) ? fb.criteria : [];
    if (rawCriteria.length === 0) {
      throw new Error('INVALID_AI_JSON: Phản hồi thiếu danh sách tiêu chí rubric.');
    }

    // Kiểm tra điểm từng tiêu chí không vượt mức tối đa và xác thực trích dẫn nguyên văn
    const validatedCriteria: CriterionEvaluation[] = rawCriteria.map((c: any, idx: number) => {
      const defaultMax = isParagraph
        ? [0.25, 0.25, 1.0, 0.5][idx] ?? 0.5
        : [0.5, 0.5, 2.0, 1.0][idx] ?? 1.0;
      const maxCrit =
        Number.isFinite(Number(c.maxCriterionScore)) && Number(c.maxCriterionScore) > 0
          ? Number(c.maxCriterionScore)
          : defaultMax;
      const rawAwarded = Number(c.scoreAwarded);
      const clampedAwarded = Number.isFinite(rawAwarded)
        ? Number(Math.max(0, Math.min(maxCrit, rawAwarded)).toFixed(2))
        : 0;

      const verifiedQuotes = verifyQuotesInStudentText([c.studentQuote], studentEssay);

      return {
        id: c.id || `crit-${idx + 1}`,
        name: c.name || `Tiêu chí ${idx + 1}`,
        weightLabel: c.weightLabel || `${maxCrit} điểm`,
        scoreLevel: c.scoreLevel || 'Đạt cơ bản',
        scoreStatus: c.scoreStatus || 'info',
        strengths: String(c.strengths || '').trim(),
        weaknesses: String(c.weaknesses || '').trim(),
        remedyStep: String(c.remedyStep || '').trim(),
        rationale: String(c.rationale || '').trim(),
        studentQuote: verifiedQuotes[0] || '',
        confidenceLevel:
          c.confidenceLevel === 'high' || c.confidenceLevel === 'medium' || c.confidenceLevel === 'low'
            ? c.confidenceLevel
            : 'medium',
        needsReview: Boolean(c.needsReview),
        scoreAwarded: clampedAwarded,
        maxCriterionScore: maxCrit
      };
    });

    const sumCriteria = validatedCriteria.reduce((acc, c) => acc + (c.scoreAwarded || 0), 0);
    const clampedTotal = Number(Math.max(0, Math.min(sectionMaxScore, sumCriteria)).toFixed(2));

    const result: WritingFeedback = {
      overallImpression: fb.overallImpression || '',
      wordCount,
      paragraphCount,
      criteria: validatedCriteria,
      actionSteps: Array.isArray(fb.actionSteps) ? fb.actionSteps : [],
      cautionNote:
        fb.cautionNote ||
        'Điểm số trên là đề xuất sơ bộ của Gemini AI theo Rubric. Điểm chính thức do Giáo viên bộ môn xét duyệt.',
      evaluatedAt: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      evaluationSource: 'gemini_ai',
      evaluationSourceLabel: GEMINI_AI_LABEL,
      confidenceLevel:
        fb.confidenceLevel === 'high' || fb.confidenceLevel === 'medium' || fb.confidenceLevel === 'low'
          ? fb.confidenceLevel
          : 'medium',
      confidenceScore: Number.isFinite(Number(fb.confidenceScore)) ? Number(fb.confidenceScore) : 82,
      needsReview: Boolean(fb.needsReview) || validatedCriteria.some((c) => c.needsReview),
      reviewReason: fb.reviewReason,
      aiSuggestedScore: clampedTotal
    };

    // YÊU CẦU 7: Không bao giờ ghi đè điểm giáo viên đã xác nhận
    if (
      options?.existingApprovedFeedback &&
      typeof options.existingApprovedFeedback.teacherConfirmedScore === 'number'
    ) {
      result.teacherConfirmedScore = options.existingApprovedFeedback.teacherConfirmedScore;
      result.teacherNotes = options.existingApprovedFeedback.teacherNotes;
      result.confirmedByTeacherId = options.existingApprovedFeedback.confirmedByTeacherId;
      result.confirmedByTeacherName = options.existingApprovedFeedback.confirmedByTeacherName;
      result.confirmedAt = options.existingApprovedFeedback.confirmedAt;
    }

    return result;
  } catch (err: any) {
    const warningMsg = formatFallbackWarning(err);
    const fallback = evaluateWritingEssay(promptText, studentEssay, essayType, warningMsg, {
      maxScore: sectionMaxScore,
      targetWordCount,
      rubric: options?.rubric
    });

    if (
      options?.existingApprovedFeedback &&
      typeof options.existingApprovedFeedback.teacherConfirmedScore === 'number'
    ) {
      fallback.teacherConfirmedScore = options.existingApprovedFeedback.teacherConfirmedScore;
      fallback.teacherNotes = options.existingApprovedFeedback.teacherNotes;
      fallback.confirmedByTeacherId = options.existingApprovedFeedback.confirmedByTeacherId;
      fallback.confirmedByTeacherName = options.existingApprovedFeedback.confirmedByTeacherName;
      fallback.confirmedAt = options.existingApprovedFeedback.confirmedAt;
    }

    return fallback;
  }
}
