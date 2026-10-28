export type NavigationTab = 'home' | 'reading' | 'writing' | 'portfolio' | 'teacher' | 'admin' | 'knowledge' | 'exam';

export type UserRole = 'student' | 'teacher' | 'admin';

export type CognitiveLevel = 'nhan_biet' | 'thong_hieu' | 'van_dung' | 'van_dung_cao';

export interface ReadingQuestion {
  id: string;
  level: CognitiveLevel;
  levelName: string;
  question: string;
  contextHint: string; // Căn cứ gợi mở từ văn bản
  keyConcepts: string[]; // Khái niệm/từ khóa then chốt
  sampleScaffoldNotes: string[]; // Lưu ý sư phạm
  maxScore?: number; // Thang điểm theo câu (ví dụ: 0.75 hoặc 1.0)
}

export type ReadingTextType = 'van_hoc' | 'nghi_luan' | 'thong_tin';
export type PracticeSectionType = 'reading' | 'paragraph_200w' | 'essay_600w';
export type BankPublicationStatus = 'published' | 'pending_teacher_review' | 'draft';

export interface ReadingPassage {
  id: string;
  title: string;
  author: string;
  source: string;
  genre: 'Tản văn' | 'Thơ hiện đại' | 'Bình luận xã hội' | 'Văn xuôi' | 'Văn bản thông tin';
  textType?: ReadingTextType; // Phân loại chuẩn: Văn học / Nghị luận / Thông tin
  textTypeLabel?: string; // Nhãn hiển thị: Văn bản văn học / Văn bản nghị luận / Văn bản thông tin
  level?: 'Cơ bản' | 'Thông hiểu' | 'Vận dụng' | 'Vận dụng cao';
  targetSkill?: SkillKey;
  targetSkillName?: string;
  estimatedMinutes?: number; // Mặc định 30 phút
  maxScore?: number; // Chuẩn 4,0 điểm
  rubricId?: string; // Mã rubric gắn với đề đọc hiểu
  examTemplate?: 'A' | 'B'; // Mẫu luyện đề tương ứng
  status?: BankPublicationStatus; // Chỉ gợi ý nếu 'published' và có đủ rubric
  sourceLabel?: string; // Nhãn nguồn đề
  content: string;
  questions: ReadingQuestion[];
}

export type EvaluationSource = 'gemini_ai' | 'rule_based_fallback';
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface ReadingFeedback {
  strengths: string[]; // Điểm đúng đã làm tốt
  missingPoints: string[]; // Điểm còn thiếu / chưa sáng rõ
  textEvidenceHints: string[]; // Gợi ý căn cứ chính xác trong văn bản
  guidingQuestions: string[]; // Câu hỏi định hướng để tự hoàn thiện
  rubricSummary: string;
  evaluatedAt: string;
  evaluationSource?: EvaluationSource;
  evaluationSourceLabel?: string; // "Gợi ý theo quy tắc — chưa phải chấm AI" hoặc "Chấm sơ bộ bằng Gemini AI (Chờ giáo viên duyệt)"
  studentQuotes?: string[]; // Dẫn chứng trích nguyên văn từ câu trả lời của học sinh
  rationale?: string; // Lí do chấm từng ý
  confidenceLevel?: ConfidenceLevel; // Mức độ chắc chắn của kết quả chấm
  confidenceScore?: number; // 0 - 100
  needsReview?: boolean; // Cờ cần giáo viên xem lại
  reviewReason?: string; // Lí do cần giáo viên xem lại
  apiWarningMessage?: string; // Cảnh báo khi mất mạng / lỗi API / thiếu khóa Gemini
  aiSuggestedScore?: number; // Điểm gợi ý tham khảo (thang câu hỏi hoặc thang 4.0)
  teacherConfirmedScore?: number | null; // Điểm giáo viên duyệt chính thức
  teacherNotes?: string; // Nhận xét của giáo viên
  confirmedByTeacherId?: string; // UID giáo viên xác nhận
  confirmedByTeacherName?: string; // Tên giáo viên xác nhận
  confirmedAt?: string; // Thời điểm giáo viên xác nhận
}

export interface ReadingAttempt {
  id: string;
  passageTitle: string;
  question: string;
  questionLevel?: CognitiveLevel;
  originalAnswer: string;
  feedback: ReadingFeedback;
  improvedAnswer?: string;
  timestamp: string;
  submissionVersion?: number;
  scoreStatus?: 'rule_based_suggested' | 'ai_proposed' | 'teacher_approved';
}

export interface WritingPrompt {
  id: string;
  title: string;
  type: 'nghi_luan_xa_hoi' | 'nghi_luan_van_hoc';
  typeName: string;
  sectionType?: 'paragraph_200w' | 'essay_600w'; // Phân định rõ Đoạn văn 200 chữ (2,0đ) vs Bài văn 600 chữ (4,0đ)
  targetWordCount?: number; // 200 hoặc 600
  wordLimit: string;
  promptText: string;
  focusGuide: string;
  coreConcepts: string[];
  maxScore?: number; // Đoạn văn 200 chữ: 2,0đ; Bài văn 600 chữ: 4,0đ
  level?: 'Cơ bản' | 'Thông hiểu' | 'Vận dụng' | 'Vận dụng cao';
  targetSkill?: SkillKey;
  targetSkillName?: string;
  estimatedMinutes?: number; // Đoạn văn: 30 phút; Bài văn: 60 phút
  rubricId?: string; // Mã rubric tương ứng do giáo viên gắn với đề
  rubric?: CriterionEvaluation[]; // Rubric chuẩn giáo viên gắn với đề (chuyển thẳng sang quy trình chấm)
  examTemplate?: 'A' | 'B'; // Mẫu luyện đề tương ứng
  status?: BankPublicationStatus; // 'published' | 'pending_teacher_review' | 'draft'
  sourceLabel?: string; // Nhãn nguồn đề
}

export interface CriterionEvaluation {
  id: string;
  name: string;
  weightLabel: string;
  scoreLevel: 'Cần bổ sung' | 'Đạt cơ bản' | 'Khá' | 'Tốt & Sâu sắc';
  scoreStatus: 'warning' | 'info' | 'success';
  strengths: string;
  weaknesses: string;
  remedyStep: string;
  scoreAwarded?: number; // Điểm thành phần (đã kiểm tra không vượt maxCriterionScore)
  maxCriterionScore?: number; // Điểm tối đa tiêu chí
  rationale?: string; // Lí do chấm chi tiết của tiêu chí
  studentQuote?: string; // Dẫn chứng trích nguyên văn từ bài làm học sinh
  confidenceLevel?: ConfidenceLevel; // Mức độ chắc chắn ở tiêu chí này
  needsReview?: boolean; // Cờ cần giáo viên xem lại tiêu chí này
}

export interface WritingFeedback {
  overallImpression: string;
  wordCount: number;
  paragraphCount: number;
  criteria: CriterionEvaluation[];
  actionSteps: string[]; // 3 bước chỉnh sửa tiếp theo
  cautionNote: string;
  evaluatedAt: string;
  evaluationSource?: EvaluationSource;
  evaluationSourceLabel?: string; // "Gợi ý theo quy tắc — chưa phải chấm AI" hoặc "Chấm sơ bộ bằng Gemini AI (Chờ giáo viên duyệt)"
  confidenceLevel?: ConfidenceLevel;
  confidenceScore?: number;
  needsReview?: boolean;
  reviewReason?: string;
  apiWarningMessage?: string;
  aiSuggestedScore?: number; // Điểm gợi ý tham khảo (thang 2.0 cho đoạn văn hoặc 4.0 cho bài văn)
  teacherConfirmedScore?: number | null; // Điểm giáo viên duyệt chính thức
  teacherNotes?: string;
  confirmedByTeacherId?: string;
  confirmedByTeacherName?: string;
  confirmedAt?: string;
}

export interface WritingSubmissionRecord {
  id: string;
  promptId?: string;
  promptTitle: string;
  promptText: string;
  type: 'nghi_luan_xa_hoi' | 'nghi_luan_van_hoc';
  sectionType?: 'paragraph_200w' | 'essay_600w'; // Phân biệt Đoạn văn 200 chữ (2,0đ) và Bài văn 600 chữ (4,0đ)
  maxScore?: number; // 2.0 hoặc 4.0
  rubricId?: string;
  originalText: string;
  wordCount: number;
  feedback: WritingFeedback;
  revisions: {
    id: string;
    revisedText: string;
    wordCount: number;
    reflectionNote: string; // Học sinh tự giải thích thay đổi
    savedAt: string;
  }[];
  createdAt: string;
  submissionVersion?: number;
  scoreStatus?: 'rule_based_suggested' | 'ai_proposed' | 'teacher_approved';
}

// ========================================================
// 10 KỸ NĂNG CHUẨN THPT THEO CHƯƠNG TRÌNH NGỮ VĂN
// ========================================================
export type SkillKey =
  | 'reading_main_idea'
  | 'reading_rhetoric'
  | 'reading_theme'
  | 'reading_eval_relate'
  | 'writing_reading_answer'
  | 'writing_paragraph_200w'
  | 'writing_thesis_arguments'
  | 'writing_evidence_analysis'
  | 'writing_essay_600w'
  | 'writing_expression_spelling';

export interface SkillDefinition {
  key: SkillKey;
  label: string;
  category: 'Đọc hiểu' | 'Viết đoạn văn' | 'Viết bài văn' | 'Diễn đạt chung';
  description: string;
}

// ========================================================
// MÔ-ĐUN: KHẢO SÁT NHANH (QUICK SURVEY) & ĐỊNH HƯỚNG CÁ NHÂN HÓA
// ========================================================
export type QuickTargetScoreRange = 'under_5' | '5_to_6_5' | '7_to_8' | 'above_8';
export type QuickFocusArea = 'reading' | 'paragraph_200w' | 'essay_600w' | 'unknown';
export type QuickDailyTime = '5_mins' | '10_15_mins' | '20_30_mins' | 'full_exam';

// 3 trạng thái phân định rõ ràng trong bảng tiến độ học sinh & giáo viên
export type StudentSurveyProgressStatus =
  | 'not_surveyed' // Chưa khảo sát
  | 'quick_surveyed' // Đã khảo sát nhanh
  | 'actual_data_ready'; // Đã có dữ liệu từ bài làm thực tế

// KHẢO SÁT NĂNG LỰC & MỤC TIÊU BAN ĐẦU
export interface StudentSurveyData {
  completedAt?: string;
  updatedAt?: string;
  isCompleted: boolean;
  surveyType?: 'quick' | 'deep' | 'skipped';

  // 1. Khảo sát nhanh (3 câu hỏi cốt lõi tinh gọn 30 giây)
  quickTargetScoreRange?: QuickTargetScoreRange; // Mục tiêu điểm: dưới 5 | 5 đến 6.5 | 7 đến 8 | trên 8
  quickFocusArea?: QuickFocusArea; // Phần muốn cải thiện nhất: đọc hiểu | đoạn 200 chữ | bài 600 chữ | chưa rõ
  quickDailyTime?: QuickDailyTime; // Thời gian rèn luyện mỗi ngày: 5p | 10-15p | 20-30p | luyện đề đầy đủ

  // 2. Thiết lập lộ trình học tập chuyên sâu (Tự chọn trong hồ sơ, không bắt buộc)
  selfReportedLatestScore: number | null; // Điểm Ngữ văn gần nhất (để trống nếu không nhớ)
  selfReportedMockScore: number | null; // Điểm thi thử / kiểm tra gần nhất
  selfReportedReadingScore: number | null; // Điểm đọc hiểu tự khai (thang 4.0)
  selfReportedParagraphScore: number | null; // Điểm đoạn văn tự khai (thang 2.0)
  selfReportedEssayScore: number | null; // Điểm bài văn tự khai (thang 4.0)
  examDateOrScoreDate: string; // Thời điểm nhận điểm gần nhất
  targetScore: number; // Mức điểm mục tiêu trong kỳ thi tốt nghiệp THPT (ví dụ: 8.0)

  // 3. Tự đánh giá kỹ năng (thang 1 - 5, tùy chọn, không ép buộc đánh giá 10 kỹ năng)
  skillConfidence: Partial<Record<SkillKey, number>>;

  // 4. Mong muốn & Kế hoạch chi tiết (Tùy chọn)
  prioritySkillToImprove?: SkillKey; // Kĩ năng muốn cải thiện trước tiên
  mostDifficultFormat?: 'doc_hieu_tho' | 'doc_hieu_van_ban_thong_tin' | 'doan_van_200_chu' | 'bai_van_nlvh';
  practiceTimeAvailability?: '15_phut_ngay' | '30_phut_ngay' | '45_phut_ngay' | '2_3_gio_tuan';
  preferredFormat?: 'bai_ngan' | 'cau_hoi_tung_buoc' | 'de_tung_phan' | 'thi_thu_day_du';
}

// BÀI TẬP ĐỀ XUẤT CÁ NHÂN HÓA
export interface PersonalizedRecommendation {
  id: string;
  title: string;
  targetSkill: SkillKey;
  targetSkillName: string;
  reason: string;
  level: 'Cơ bản' | 'Thông hiểu' | 'Vận dụng' | 'Vận dụng cao';
  estimatedMinutes: number;
  type: 'reading' | 'writing_paragraph' | 'writing_essay';
  sectionType?: PracticeSectionType; // 'reading' | 'paragraph_200w' | 'essay_600w'
  readingTextType?: ReadingTextType; // 'van_hoc' | 'nghi_luan' | 'thong_tin'
  writingArgumentType?: 'nghi_luan_xa_hoi' | 'nghi_luan_van_hoc';
  taskFormatLabel?: string; // Nhãn dạng bài cụ thể (vd: "Đọc hiểu — Văn bản văn học" hoặc "Đoạn văn 200 chữ — Nghị luận văn học")
  rubricId?: string; // Mã rubric gắn với đề
  maxScore?: number; // 4.0 hoặc 2.0
  examTemplate?: 'A' | 'B';
  isInitialSurveyBased?: boolean; // Cờ đánh dấu "Gợi ý ban đầu dựa trên tự đánh giá"
  source: 'teacher_bank' | 'ai_generated'; // Chỉ dùng đề 'teacher_bank' đã xuất bản để gợi ý chính thức
  sourceBadge: string;
  passageId?: string;
  promptId?: string;
  difficultyTone: 'reinforce' | 'challenge' | 'target_gap';
}

// ĐỐI CHIẾU NĂNG LỰC (GAP ANALYSIS)
export interface SkillGapItem {
  skillKey: SkillKey;
  skillName: string;
  category: string;
  selfConfidenceScore: number; // 1-5
  actualPerformanceLevel: 'Chưa đủ dữ liệu' | 'Cần rèn luyện' | 'Đạt yêu cầu' | 'Khá' | 'Tốt';
  gapStatus:
    | 'acknowledged_weakness' // Biết mình gặp khó khăn (tự đánh giá thấp + thực tế thấp)
    | 'overconfident_risk' // Tự tin nhưng thực tế thấp (nguy cơ chủ quan)
    | 'underconfident_strength' // Làm tốt nhưng chưa tự tin (cần động viên)
    | 'aligned_strength' // Tự tin và làm rất tốt
    | 'needs_more_data'; // Chưa đủ dữ liệu kết luận
  gapExplanation: string;
  actionRecommendation: string;
}

// THÔNG TIN HỌC SINH VÀ KỊCH BẢN KIỂM THỬ
export interface StudentProfile {
  id: string;
  fullName: string;
  studentCode: string;
  className: string;
  survey: StudentSurveyData;
  readingAttempts: ReadingAttempt[];
  writingRecords: WritingSubmissionRecord[];
}

export type TestScenarioKey =
  | 'scenario_new_student' // Học sinh mới, chưa có bài làm
  | 'scenario_low_self_high_actual' // Tự khai thấp nhưng làm bài rất tốt
  | 'scenario_high_confidence_low_actual' // Tự tin cao nhưng kết quả thực tế thấp
  | 'scenario_weak_one_rubric' // Yếu 1 tiêu chí rubric (dẫn chứng) nhưng tốt tiêu chí khác
  | 'scenario_high_progress' // Đã tiến bộ rõ rệt sau khi luyện tập
  | 'scenario_uncompleted_survey'; // Chưa hoàn thành khảo sát

// ========================================================
// MÔ-ĐUN: SOẠN THẢO LINH HOẠT - BẢN NHÁP - NỘP BÀI
// ========================================================
export type DraftingMethod =
  | 'direct' // Soạn trực tiếp trong VănAI 12
  | 'google_docs' // Soạn trên Google Docs
  | 'upload_file' // Tải bài từ thiết bị (.docx, .txt)
  | 'paste_content'; // Dán nội dung đã viết

export type TaskSubmissionStatus =
  | 'chua_bat_dau' // Chưa bắt đầu
  | 'dang_soan_nhap' // Đang soạn bản nháp
  | 'da_luu_nhap' // Đã lưu bản nháp
  | 'da_nhap_tu_ngoai' // Đã nhập nội dung từ tài liệu ngoài
  | 'san_sang_nop' // Sẵn sàng nộp
  | 'da_nop_chinh_thuc' // Đã nộp chính thức
  | 'dang_cho_cham' // Đang chờ chấm
  | 'da_co_ket_qua'; // Đã có kết quả được giáo viên công bố

export interface DraftVersion {
  id: string;
  versionNumber?: number;
  versionCode?: string;
  content: string;
  wordCount: number;
  source:
    | 'direct_edit'
    | 'auto_save'
    | 'google_docs_sync'
    | 'file_upload'
    | 'paste_import'
    | 'manual_save'
    | 'final_submission';
  sourceLabel: string;
  savedAt: string;
  notes?: string;
  isSubmittedSnapshot?: boolean;
  immutable?: boolean;
}

export interface LinkedGoogleDocMetadata {
  docId: string;
  id: string; // Tương thích ngược với các chỗ đọc .id
  docUrl: string;
  url: string; // Tương thích ngược với các chỗ đọc .url
  name: string;
  taskId: string;
  studentUid: string;
  ownerAccount: string; // Email hoặc định danh tài khoản Google chủ sở hữu
  ownerGoogleUid?: string;
  ownerDisplayName?: string;
  createdAt: string;
  lastSyncedAt?: string | null;
  lastSyncedVersionCode?: string | null;
}

export interface WritingTaskSession {
  taskId: string;
  promptId: string;
  promptTitle: string;
  promptText: string;
  type: 'nghi_luan_xa_hoi' | 'nghi_luan_van_hoc';
  targetWordCount: number; // Khoảng 200 chữ hoặc 600 chữ
  status: TaskSubmissionStatus;
  currentDraft: string;
  lastSavedAt?: string;
  autoSavedAt?: string;
  versions: DraftVersion[];
  googleDocId?: string;
  googleDocUrl?: string;
  googleDocSyncedAt?: string;
  isTimedExam?: boolean;
  examTimeRemainingSeconds?: number;
  submittedAt?: string;
  submittedVersionId?: string;
  feedback?: WritingFeedback;
}

// ========================================================
// MÔ-ĐUN: GÓC TRI THỨC NGỮ VĂN (KNOWLEDGE HUB)
// ========================================================

export type KnowledgeCategory =
  | 'rhetoric' // A. Biện pháp tu từ và kiến thức tiếng Việt
  | 'reading_method' // B. Phương pháp làm đọc hiểu
  | 'paragraph_200w' // C. Phương pháp viết đoạn văn khoảng 200 chữ
  | 'essay_600w' // D. Phương pháp viết bài văn khoảng 600 chữ
  | 'exam_skills'; // E. Kĩ năng làm bài thi và quản lí thời gian

export interface KnowledgePracticeQuestion {
  id: string;
  level: CognitiveLevel;
  levelName: string;
  question: string;
  contextPassage?: string; // Đoạn trích ngữ liệu ngắn kèm theo (nếu có)
  type: 'multiple_choice' | 'short_answer';
  options?: string[]; // Dành cho câu trắc nghiệm
  correctOptionIndex?: number;
  expectedKeyPoints: string[]; // Điểm cốt lõi cần có
  sampleModelAnswer: string; // Lời giải/đáp án mẫu chính xác
  detailedExplanation: string; // Phần giải thích sư phạm sau khi làm
  pedagogicalScaffold: {
    strengthsHint: string; // Gợi ý điểm đúng
    missingWarning: string; // Cảnh báo điểm hay thiếu
    thinkingStep: string; // Hướng dẫn học sinh tự suy nghĩ và hoàn thiện
  };
}

export interface KnowledgeCardExample {
  quote: string; // Ngữ liệu trích dẫn
  source: string; // Tác giả / Tác phẩm / Nguồn
  analysis: string; // Phân tích chi tiết dấu hiệu
  contextEffect: string; // Tác dụng cụ thể gắn với ngữ cảnh (không máy móc)
}

export interface KnowledgeCommonMistake {
  mistake: string; // Lỗi học sinh hay mắc
  consequence: string; // Hậu quả (bị trừ điểm ra sao)
  howToFix: string; // Cách khắc phục cụ thể
}

export interface KnowledgeCard {
  id: string;
  title: string; // Tên kiến thức (vd: "Biện pháp tu từ Ẩn dụ")
  category: KnowledgeCategory;
  categoryName: string; // Tên nhóm hiển thị tiếng Việt
  level: CognitiveLevel;
  levelName: string;
  targetSkill?: SkillKey; // Liên kết 1 trong 10 kĩ năng chuẩn THPT
  targetGoal: string; // Mục tiêu cần đạt
  summary: string; // Khái niệm & Giải thích ngắn gọn, chính xác
  recognitionSigns: string[]; // Dấu hiệu nhận biết / Quy trình thực hiện
  distinctionNotes?: string; // Phân biệt với biện pháp / dạng bài dễ nhầm lẫn
  examples: KnowledgeCardExample[]; // Ví dụ minh họa thực tế
  commonMistakes: KnowledgeCommonMistake[]; // Lỗi thường gặp và cách khắc phục
  practiceQuestions: KnowledgePracticeQuestion[]; // Câu hỏi tự luyện tương tác
  relatedPromptIds?: string[]; // Liên kết đề bài viết trong ngân hàng đề
  relatedPassageIds?: string[]; // Liên kết văn bản đọc hiểu trong ngân hàng
  rubricCriterionLink?: string; // Liên kết tiêu chí rubric cụ thể
  status: 'published' | 'draft'; // Đã duyệt / Bản nháp (phân quyền giáo viên)
  estimatedMinutes: number; // Thời gian học dự kiến (vd: 5-8 phút)
  author: string; // Người biên soạn / kiểm duyệt
  updatedAt: string;
}

export interface StudentKnowledgeInteraction {
  cardId: string;
  isBookmarked: boolean; // Yêu thích
  needsReview: boolean; // Cần ôn lại
  hasStudied: boolean; // Đã xem
  practiceCount: number; // Số lần tự luyện
  practiceScore?: number; // Điểm tự luyện gần nhất (thang 100)
  lastStudiedAt?: string;
}

export interface DailyKnowledgeRecommendation {
  cardId: string;
  cardTitle: string;
  categoryName: string;
  reason: string; // Lí do tích cực, cụ thể
  estimatedMinutes: number;
  priorityLevel: 'high' | 'medium';
  relatedSkillName: string;
}

// ========================================================
// MÔ-ĐUN: QUẢN TRỊ VIÊN, XÁC MINH GIÁO VIÊN & GIỚI HẠN LỚP (5 LỚP × 50 HỌC SINH)
// ========================================================
export type TeacherVerificationMethod = 'phone_otp' | 'gmail_otp';

export type TeacherApprovalStatus =
  | 'pending_verification' // Chưa hoàn tất xác minh OTP SĐT hoặc Gmail
  | 'pending_admin_approval' // Đã xác minh OTP, chờ Quản trị viên duyệt
  | 'approved' // Đã được Quản trị viên duyệt (được vào khu vực giáo viên)
  | 'rejected' // Bị Quản trị viên từ chối kèm lí do
  | 'suspended'; // Bị Quản trị viên tạm khóa

export const MAX_ACTIVE_CLASSES_PER_TEACHER = 5;
export const MAX_ENROLLED_STUDENTS_PER_CLASS = 50;

export interface ClassroomRecord {
  id: string;
  name: string; // VD: "12A1"
  teacherUid: string; // UID giáo viên sở hữu lớp
  teacherName: string;
  status: 'active' | 'archived';
  enrolledCount: number; // Số học sinh đang ghi danh (tối đa 50)
  maxCapacity: number; // 50
  remainingSeats: number; // 50 - enrolledCount
  createdAt: string;
  updatedAt: string;
}

export interface TeacherRegistrationRecord {
  id: string;
  teacherUid: string; // UID tài khoản giáo viên liên kết
  username: string;
  fullName: string;
  phone: string; // Số điện thoại đăng ký
  gmail: string; // Địa chỉ Gmail đăng ký
  verificationMethod: TeacherVerificationMethod;
  phoneVerified: boolean;
  phoneVerifiedAt?: string;
  gmailVerified: boolean;
  gmailVerifiedAt?: string;
  isOwnershipVerified: boolean; // true khi phoneVerified || gmailVerified
  approvalStatus: TeacherApprovalStatus;
  rejectionReason?: string;
  suspensionReason?: string;
  reviewedByUid?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  activeClassesCount?: number;
  remainingClassesQuota?: number;
  totalEnrolledStudentsCount?: number;
  classes?: ClassroomRecord[];
  registrationStateToken?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAuditLogRecord {
  id: string;
  action: 'approve_teacher' | 'reject_teacher' | 'suspend_teacher' | 'reactivate_teacher';
  targetTeacherUid: string;
  targetTeacherName: string;
  reason?: string;
  performedByUid: string;
  performedByName: string;
  performedAt: string;
}

export interface AdminOverviewData {
  registrations: TeacherRegistrationRecord[];
  classes: ClassroomRecord[];
  auditLogs: AdminAuditLogRecord[];
  summary: {
    totalTeachers: number;
    pendingVerificationCount: number;
    pendingApprovalCount: number;
    approvedTeachersCount: number;
    rejectedTeachersCount: number;
    suspendedTeachersCount: number;
    totalActiveClasses: number;
    totalEnrolledStudents: number;
  };
  emailProviderStatus: {
    configured: boolean;
    providerName: string;
    missingEnvVars: string[];
  };
}

// ========================================================
// MÔ-ĐUN: HỆ THỐNG TÀI KHOẢN VÀ THEO DÕI TIẾN ĐỘ THEO LỚP
// ========================================================
export interface UserAccount {
  id: string;
  username: string; // Mã học sinh (vd: '12A1-19'), Mã giáo viên (vd: 'GV-VAN01'), hoặc Mã QTV
  fullName: string;
  role: UserRole; // 'student' | 'teacher' | 'admin'
  className?: string; // Lớp học của học sinh (vd: '12A1')
  classId?: string; // ID lớp học chuẩn hóa
  teacherUid?: string; // UID giáo viên quản lý học sinh này (phân quyền phạm vi giáo viên)
  email?: string;
  phone?: string;
  verificationMethod?: TeacherVerificationMethod;
  phoneVerified?: boolean;
  gmailVerified?: boolean;
  teacherApprovalStatus?: TeacherApprovalStatus;
  rejectionReason?: string;
  reviewedByUid?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  isActivated: boolean; // Đã kích hoạt mật khẩu lần đầu chưa
  activationCode?: string; // Mã dùng 1 lần (6 chữ số)
  activationCodeExpiresAt?: string; // Thời hạn của mã dùng 1 lần
  passwordHash?: string; // Băm PBKDF2-SHA256 kèm salt (TUYỆT ĐỐI KHÔNG LƯU PLAIN TEXT)
  passwordSalt?: string;
  lastLoginAt?: string;
  createdAt: string;
  status: 'active' | 'pending_activation' | 'locked';
  notes?: string;
}

export interface StudentClassProgress {
  studentId: string;
  studentCode: string;
  fullName: string;
  className: string;
  isActivated: boolean;
  accountStatus: 'active' | 'pending_activation' | 'locked';
  activationCode?: string;
  activationCodeExpiresAt?: string;
  surveyCompleted: boolean;
  surveyStatus: StudentSurveyProgressStatus; // 'not_surveyed' | 'quick_surveyed' | 'actual_data_ready'
  readingAttemptsCount: number;
  writingSubmissionsCount: number;
  latestReadingScore?: number;
  latestWritingScore?: number;
  avgEstimatedScore?: number; // Thang 10 ước tính
  targetScore: number;
  prioritySkill?: SkillKey;
  pedagogicalAlertTag?:
    | 'overconfident_risk'
    | 'underconfident_strength'
    | 'weak_rubric'
    | 'good_progress'
    | 'normal';
  pedagogicalAlertText?: string;
}

// ========================================================
// MÔ-ĐUN: TỰ ĐỘNG PHÂN TÍCH ĐỀ, CHUẨN HÓA CHẤM ĐIỂM & ĐỀ HOÀN CHỈNH
// ========================================================
export type ExamTemplateType = 'template_a' | 'template_b' | 'custom';

export type ExtractionStatus =
  | 'extracted_clear' // Đã trích xuất rõ ràng từ tài liệu gốc
  | 'needs_teacher_confirm' // Cần giáo viên xác nhận (điểm chưa rõ, mâu thuẫn)
  | 'missing_data' // Thiếu dữ liệu trong tệp gốc
  | 'unreadable'; // Không thể đọc hoặc nhận dạng chính xác

export interface VerificationFlag {
  id: string;
  targetField: string;
  fieldLabel: string;
  status: ExtractionStatus;
  originalSnippet: string; // Đoạn trích dẫn thực tế trong tệp
  reason: string; // Lí do cần kiểm tra
  suggestedResolution: string; // Đề xuất xử lý
  isResolved: boolean;
  resolvedValue?: any;
}

export interface CompleteExamQuestion {
  id: string;
  order: number;
  question: string;
  level: CognitiveLevel;
  levelName: string;
  maxScore: number; // vd: 0.75, 1.0
  answerGuide?: string; // Hướng dẫn chấm / đáp án
  keyConcepts?: string[];
  extractionStatus: ExtractionStatus;
  verificationReason?: string;
  suggestedScore?: number;
}

export interface CompleteExamWritingTask {
  id: string;
  type: 'nghi_luan_xa_hoi' | 'nghi_luan_van_hoc';
  typeName: string;
  wordLimitLabel: string;
  targetWordCount: number; // 200 hoặc 600
  promptText: string;
  maxScore: number; // 2.0 hoặc 4.0
  rubric: CriterionEvaluation[];
  isAiDraftRubric: boolean; // Rubric do AI đề xuất hay trích từ file
  extractionStatus: ExtractionStatus;
  verificationNotes?: string;
}

export interface ExamConsistencyReport {
  isValid: boolean;
  readingScoreSum: number;
  paragraphScoreSum: number;
  essayScoreSum: number;
  overallScoreSum: number;
  expectedTotal: number; // Thường là 10.0
  discrepancies: string[];
  suggestedFixes: string[];
}

export interface CompleteExam {
  id: string;
  code: string;
  title: string;
  templateType: ExamTemplateType;
  templateLabel: string; // "Mẫu A", "Mẫu B", hoặc "Cấu trúc tùy chỉnh"
  
  // Phần I: Đọc hiểu
  readingPassage: {
    title: string;
    author: string;
    source: string;
    genre: 'van_hoc' | 'nghi_luan' | 'thong_tin' | 'tuy_chinh';
    genreName: string;
    content: string;
    questions: CompleteExamQuestion[];
    maxScore: number; // 4.0 điểm
  };

  // Phần II: Viết (Đoạn 200 chữ & Bài 600 chữ)
  writingTasks: {
    paragraphTask: CompleteExamWritingTask; // Đoạn văn ~200 chữ (2.0 điểm)
    essayTask: CompleteExamWritingTask; // Bài văn ~600 chữ (4.0 điểm)
  };

  // Tổng quan & Quản trị
  totalScore: number; // 10.0 điểm
  durationMinutes: number; // 120 phút mặc định
  hasScoringGuide: boolean;
  status: 'draft' | 'verified' | 'assigned';
  assignedClasses: string[];
  assignedMode: 'practice' | 'mock_exam';
  dueDate?: string;
  verificationFlags: VerificationFlag[];
  consistencyReport: ExamConsistencyReport;
  rawSourceText?: string;
  rawGuideText?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExamSubmissionAnswer {
  readingAnswers: Record<string, string>; // questionId -> answer
  paragraphText: string;
  essayText: string;
}

export interface ExamAiEvaluationResult {
  evaluationSource?: EvaluationSource;
  evaluationSourceLabel?: string; // "Gợi ý theo quy tắc — chưa phải chấm AI" hoặc "Chấm sơ bộ bằng Gemini AI (Chờ giáo viên duyệt)"
  submissionVersion?: number;
  confidenceLevel?: ConfidenceLevel;
  confidenceScore?: number;
  apiWarningMessage?: string;
  readingScores: Record<string, {
    score: number;
    maxScore: number;
    rationale: string;
    strengths: string[];
    missingPoints: string[];
    studentQuotes?: string[];
    confidenceLevel?: ConfidenceLevel;
    evaluationSource?: EvaluationSource;
    evaluationSourceLabel?: string;
    needsReview: boolean;
    reviewReason?: string;
  }>;
  paragraphFeedback: WritingFeedback;
  essayFeedback: WritingFeedback;
  proposedTotal: number;
  itemsNeedingTeacherReview: {
    id: string;
    section: 'reading' | 'paragraph' | 'essay';
    title: string;
    reason: string;
    proposedScore: number;
  }[];
}

export interface ExamSubmission {
  id: string;
  examId: string;
  examTitle: string;
  templateType: ExamTemplateType;
  studentId: string;
  studentName: string;
  className: string;
  submittedAt: string;
  durationSeconds: number;
  submissionVersion?: number;
  answers: ExamSubmissionAnswer;
  status: 'submitted' | 'rule_based_suggested' | 'ai_evaluated' | 'teacher_approved';
  aiEvaluation?: ExamAiEvaluationResult;
  teacherConfirmedScore?: {
    readingScore: number;
    paragraphScore: number;
    essayScore: number;
    totalScore: number;
    teacherNotes: string;
    confirmedByTeacherId?: string;
    confirmedByTeacherName?: string;
    confirmedAt: string;
    isLockedAgainstAiOverwrite?: boolean;
  };
}

