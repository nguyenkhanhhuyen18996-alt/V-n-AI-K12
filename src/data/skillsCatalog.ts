import { SkillDefinition, SkillKey } from '../types';

export const HIGH_SCHOOL_SKILLS_CATALOG: SkillDefinition[] = [
  {
    key: 'reading_main_idea',
    label: 'Đọc hiểu thông tin, xác định nội dung và chi tiết quan trọng',
    category: 'Đọc hiểu',
    description: 'Năng lực bao quát văn bản, định vị chính xác từ ngữ, chi tiết, dữ kiện tác giả nêu mà không bịa đặt hoặc suy diễn sai lệch.'
  },
  {
    key: 'reading_rhetoric',
    label: 'Nhận biết và phân tích tác dụng biện pháp tu từ, đặc điểm hình thức và ngôn ngữ',
    category: 'Đọc hiểu',
    description: 'Chỉ rõ cấu trúc tu từ (so sánh, ẩn dụ, tương phản, điệp ngữ...) và hiệu quả biểu đạt cảm xúc, hình tượng trong văn cảnh.'
  },
  {
    key: 'reading_theme',
    label: 'Lí giải ý nghĩa, chủ đề, thái độ, tình cảm hoặc thông điệp văn bản',
    category: 'Đọc hiểu',
    description: 'Thấu hiểu tư tưởng tác giả gửi gắm, thông điệp nhân văn và các lớp nghĩa ẩn dụ sâu kín sau câu chữ.'
  },
  {
    key: 'reading_eval_relate',
    label: 'Nhận xét, đánh giá và liên hệ vấn đề từ văn bản với đời sống',
    category: 'Đọc hiểu',
    description: 'Bày tỏ quan điểm cá nhân có căn cứ, rút ra bài học ứng xử và hành động thực tiễn cho học sinh lớp 12.'
  },
  {
    key: 'writing_reading_answer',
    label: 'Viết câu trả lời đọc hiểu ngắn gọn, đúng trọng tâm và thể thức',
    category: 'Đọc hiểu',
    description: 'Kỹ năng trả lời trọn vẹn chủ ngữ - vị ngữ, không lan man, trích dẫn chuẩn xác căn cứ ngữ liệu.'
  },
  {
    key: 'writing_paragraph_200w',
    label: 'Viết đoạn văn nghị luận xã hội khoảng 200 chữ chuẩn quy cách',
    category: 'Viết đoạn văn',
    description: 'Tuân thủ nghiêm ngặt hình thức 1 đoạn duy nhất (180-250 từ), không xuống dòng tùy tiện, cấu trúc mở - thân - kết hoàn chỉnh.'
  },
  {
    key: 'writing_thesis_arguments',
    label: 'Xác định vấn đề, xây dựng luận điểm và triển khai lí lẽ mạch lạc',
    category: 'Viết đoạn văn',
    description: 'Nêu quan điểm rõ ràng, triển khai lí lẽ có chiều sâu, biết lật lại vấn đề (phản đề) để tạo sức thuyết phục.'
  },
  {
    key: 'writing_evidence_analysis',
    label: 'Lựa chọn và phân tích dẫn chứng thực tế, dẫn chứng văn học',
    category: 'Viết đoạn văn',
    description: 'Chọn dẫn chứng sống động, giàu sức thuyết phục và đặc biệt phải có câu bình luận làm sáng rõ luận điểm (không kể lể dài dòng).'
  },
  {
    key: 'writing_essay_600w',
    label: 'Viết bài văn nghị luận khoảng 600 chữ (Nghị luận văn học)',
    category: 'Viết bài văn',
    description: 'Bố cục 3 phần rõ ràng, phân tích sâu sắc cả nội dung tư tưởng và đặc sắc nghệ thuật của tác phẩm văn học.'
  },
  {
    key: 'writing_expression_spelling',
    label: 'Diễn đạt, liên kết câu/đoạn, dùng từ chuẩn xác và kiểm soát chính tả',
    category: 'Diễn đạt chung',
    description: 'Câu văn có nhịp điệu, sử dụng từ nối chuyển tiếp tự nhiên, bảo đảm sự trong sáng của tiếng Việt và đúng quy tắc ngữ pháp.'
  }
];

export const CONFIDENCE_LEVEL_LABELS: Record<number, string> = {
  1: 'Rất chưa tự tin (1/5)',
  2: 'Chưa tự tin (2/5)',
  3: 'Tương đối tự tin (3/5)',
  4: 'Tự tin (4/5)',
  5: 'Rất tự tin (5/5)'
};
