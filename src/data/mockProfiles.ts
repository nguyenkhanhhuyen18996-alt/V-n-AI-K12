import { StudentProfile, StudentSurveyData, TestScenarioKey } from '../types';

/**
 * Khảo sát mặc định cho người dùng thật mới đăng nhập:
 * Hoàn toàn trống (isCompleted = false, không điền sẵn điểm giả hoặc tự đánh giá mẫu).
 */
export const DEFAULT_STUDENT_SURVEY: StudentSurveyData = {
  isCompleted: false,
  surveyType: undefined,
  quickTargetScoreRange: undefined,
  quickFocusArea: undefined,
  quickDailyTime: undefined,
  selfReportedLatestScore: null,
  selfReportedMockScore: null,
  selfReportedReadingScore: null,
  selfReportedParagraphScore: null,
  selfReportedEssayScore: null,
  examDateOrScoreDate: '',
  targetScore: 8.0,
  skillConfidence: {},
  prioritySkillToImprove: undefined,
  mostDifficultFormat: undefined,
  practiceTimeAvailability: undefined,
  preferredFormat: undefined
};

// 6 Kịch bản kiểm thử minh họa (Đã ẩn danh hoàn toàn PII, chỉ dùng khi bật Chế độ Dữ liệu Minh họa)
export const TEST_SCENARIOS_PROFILES: Record<TestScenarioKey, StudentProfile> = {
  // 1. Học sinh minh họa 01 (chưa có bài làm)
  scenario_new_student: {
    id: 'demo-student-01',
    fullName: 'Học sinh Minh họa 01 (Mới khảo sát)',
    studentCode: 'DEMO-01',
    className: '12-MINH-HOA',
    survey: {
      isCompleted: true,
      surveyType: 'quick',
      completedAt: '13/10/2026',
      quickTargetScoreRange: '7_to_8',
      quickFocusArea: 'paragraph_200w',
      quickDailyTime: '20_30_mins',
      selfReportedLatestScore: null,
      selfReportedMockScore: null,
      selfReportedReadingScore: null,
      selfReportedParagraphScore: null,
      selfReportedEssayScore: null,
      examDateOrScoreDate: '',
      targetScore: 8.0,
      skillConfidence: {},
      prioritySkillToImprove: 'writing_paragraph_200w',
      mostDifficultFormat: 'doan_van_200_chu',
      practiceTimeAvailability: '30_phut_ngay',
      preferredFormat: 'cau_hoi_tung_buoc'
    },
    readingAttempts: [],
    writingRecords: []
  },

  // 2. Điểm tự khai thấp nhưng làm bài rất tốt
  scenario_low_self_high_actual: {
    id: 'demo-student-02',
    fullName: 'Học sinh Minh họa 02 (Tự đánh giá thấp - Thực tế cao)',
    studentCode: 'DEMO-02',
    className: '12-MINH-HOA',
    survey: {
      isCompleted: true,
      completedAt: '05/10/2026',
      selfReportedLatestScore: 5.5,
      selfReportedMockScore: 5.75,
      selfReportedReadingScore: 2.0,
      selfReportedParagraphScore: 1.0,
      selfReportedEssayScore: 2.25,
      examDateOrScoreDate: 'Dữ liệu minh họa',
      targetScore: 8.0,
      skillConfidence: {
        reading_main_idea: 2,
        reading_rhetoric: 2,
        reading_theme: 2,
        reading_eval_relate: 2,
        writing_reading_answer: 2,
        writing_paragraph_200w: 2,
        writing_thesis_arguments: 2,
        writing_evidence_analysis: 2,
        writing_essay_600w: 2,
        writing_expression_spelling: 3
      },
      prioritySkillToImprove: 'reading_theme',
      mostDifficultFormat: 'doc_hieu_tho',
      practiceTimeAvailability: '45_phut_ngay',
      preferredFormat: 'de_tung_phan'
    },
    readingAttempts: [
      {
        id: 'demo-att-02',
        passageTitle: 'Khoảng lặng giữa dòng đời hối hả',
        question: 'Anh/chị hiểu như thế nào về nhận định của tác giả: "Khoảng lặng chính là nơi nhân cách được định hình"?',
        questionLevel: 'thong_hieu',
        originalAnswer: 'Khoảng lặng là thời điểm con người tạm lắng lại những ồn ào bên ngoài để nhìn nhận lại chính mình. Nhờ có khoảng lặng, ta mới có thể suy ngẫm, gạn đục khơi trong những bồng bột để nhân cách ngày một chín chắn và thấu hiểu hơn.',
        feedback: {
          strengths: ['Bám sát định nghĩa trong văn bản', 'Lập luận sắc bén', 'Diễn đạt có chiều sâu triết lý'],
          missingPoints: [],
          textEvidenceHints: ['Dẫn chứng câu văn thứ 2 đoạn 2'],
          guidingQuestions: [],
          rubricSummary: 'Đạt tối đa thang điểm câu thông hiểu',
          evaluatedAt: '08:30',
          aiSuggestedScore: 3.75,
          teacherConfirmedScore: 3.75,
          teacherNotes: 'Câu trả lời rất sâu sắc, bộc lộ tư duy phản tỉnh độc lập tốt.'
        },
        improvedAnswer: 'Khoảng lặng không phải sự buông xuôi mà là lúc con người tự phản tỉnh, lắng nghe trái tim mình, từ đó gạn đục khơi trong để bồi đắp nhân cách vững vàng.',
        timestamp: '11/10/2026',
        scoreStatus: 'teacher_approved'
      }
    ],
    writingRecords: [
      {
        id: 'demo-rec-02',
        promptTitle: 'Ý nghĩa của sự tự học đối với người trẻ',
        promptText: 'Từ góc nhìn của một học sinh lớp 12 chuẩn bị bước vào ngưỡng cửa đại học, hãy viết một đoạn văn (khoảng 200 chữ) trình bày suy nghĩ của anh/chị về ý nghĩa của tinh thần tự học trong kỷ nguyên số.',
        type: 'nghi_luan_xa_hoi',
        originalText: 'Trong kỷ nguyên số hóa, khi lượng tri thức bùng nổ không ngừng, tự học chính là năng lực cốt lõi giúp người trẻ làm chủ số phận của chính mình. Tự học không chỉ đơn thuần là việc tự đọc sách hay tra cứu tài liệu, mà là ý thức chủ động vượt thoát khỏi tâm lý ỷ lại để rèn luyện tư duy độc lập. Minh chứng rõ nét là việc hàng triệu bạn trẻ Việt Nam đang tự học trí tuệ nhân tạo và ngoại ngữ qua các nền tảng mở để vươn ra toàn cầu. Khi có tinh thần tự học, con người sẽ không bao giờ bị tụt hậu trước những biến thiên khôn lường của thời đại. Tóm lại, đối với học sinh lớp 12, tự học chính là bệ phóng vững chắc nhất để bước vào tương lai.',
        wordCount: 205,
        feedback: {
          overallImpression: 'Bài viết xuất sắc, chuẩn mực 1 đoạn văn duy nhất, dẫn chứng giàu hơi thở thời đại và câu văn giàu âm hưởng.',
          wordCount: 205,
          paragraphCount: 1,
          criteria: [
            { id: 'c1', name: '1. Yêu cầu đề & thể thức', weightLabel: '0.25đ', scoreLevel: 'Tốt & Sâu sắc', scoreStatus: 'success', strengths: 'Chuẩn 1 đoạn 205 từ', weaknesses: '', remedyStep: '' },
            { id: 'c2', name: '2. Luận điểm', weightLabel: '0.5đ', scoreLevel: 'Tốt & Sâu sắc', scoreStatus: 'success', strengths: 'Luận điểm thuyết phục', weaknesses: '', remedyStep: '' },
            { id: 'c3', name: '3. Lí lẽ & dẫn chứng', weightLabel: '0.5đ', scoreLevel: 'Tốt & Sâu sắc', scoreStatus: 'success', strengths: 'Dẫn chứng thực tiễn sinh động', weaknesses: '', remedyStep: '' },
            { id: 'c4', name: '4. Tổ chức liên kết', weightLabel: '0.25đ', scoreLevel: 'Tốt & Sâu sắc', scoreStatus: 'success', strengths: 'Mạch văn trôi chảy', weaknesses: '', remedyStep: '' },
            { id: 'c5', name: '5. Diễn đạt & chính tả', weightLabel: '0.25đ', scoreLevel: 'Tốt & Sâu sắc', scoreStatus: 'success', strengths: 'Từ ngữ chọn lọc', weaknesses: '', remedyStep: '' }
          ],
          actionSteps: ['Tiếp tục phát huy phong độ này!'],
          cautionNote: '',
          evaluatedAt: '09:00',
          aiSuggestedScore: 1.85,
          teacherConfirmedScore: 1.9,
          teacherNotes: 'Bài viết rất xuất thần, hoàn toàn có thể tự tin đặt mục tiêu 8.5+ điểm.'
        },
        revisions: [],
        createdAt: '11/10/2026',
        scoreStatus: 'teacher_approved'
      }
    ]
  },

  // 3. Tự tin cao nhưng kết quả thực tế thấp
  scenario_high_confidence_low_actual: {
    id: 'demo-student-03',
    fullName: 'Học sinh Minh họa 03 (Tự tin cao - Bài thực tế thấp)',
    studentCode: 'DEMO-03',
    className: '12-MINH-HOA',
    survey: {
      isCompleted: true,
      completedAt: '02/10/2026',
      selfReportedLatestScore: 8.0,
      selfReportedMockScore: 8.25,
      selfReportedReadingScore: 3.5,
      selfReportedParagraphScore: 1.75,
      selfReportedEssayScore: 3.25,
      examDateOrScoreDate: 'Dữ liệu minh họa',
      targetScore: 9.0,
      skillConfidence: {
        reading_main_idea: 5,
        reading_rhetoric: 5,
        reading_theme: 5,
        reading_eval_relate: 4,
        writing_reading_answer: 5,
        writing_paragraph_200w: 5,
        writing_thesis_arguments: 4,
        writing_evidence_analysis: 4,
        writing_essay_600w: 4,
        writing_expression_spelling: 5
      },
      prioritySkillToImprove: 'writing_essay_600w',
      mostDifficultFormat: 'bai_van_nlvh',
      practiceTimeAvailability: '15_phut_ngay',
      preferredFormat: 'thi_thu_day_du'
    },
    readingAttempts: [
      {
        id: 'demo-att-03',
        passageTitle: 'Khoảng lặng giữa dòng đời hối hả',
        question: 'Theo đoạn trích, con người hôm nay thường vội vã lấp đầy khoảng trống thời gian bằng những điều gì?',
        questionLevel: 'nhan_biet',
        originalAnswer: 'Họ dùng mạng xã hội thâu đêm suốt sáng để thỏa mãn thói quen.',
        feedback: {
          strengths: ['Có ý nói về thiết bị điện tử'],
          missingPoints: ['Sai sót căn bản câu Nhận biết: Tác giả viết là "âm thanh nhân tạo" và "thông báo từ màn hình", không bám sát ngữ liệu.'],
          textEvidenceHints: ['Đoạn 1, câu 2'],
          guidingQuestions: ['Hãy trích đúng câu chữ của tác giả thay vì tự đưa ý kiến cá nhân vào câu Nhận biết.'],
          rubricSummary: 'Mất 0.5 điểm do không bám sát văn bản',
          evaluatedAt: '10:00',
          aiSuggestedScore: 1.5,
          teacherConfirmedScore: 1.5,
          teacherNotes: 'Cần bỏ thói quen chủ quan làm bài theo cảm tính, phải tôn trọng ngữ liệu!'
        },
        timestamp: '09/10/2026',
        scoreStatus: 'teacher_approved'
      }
    ],
    writingRecords: [
      {
        id: 'demo-rec-03',
        promptTitle: 'Ý nghĩa của sự tự học đối với người trẻ',
        promptText: 'Đoạn văn (khoảng 200 chữ) về tinh thần tự học trong kỷ nguyên số.',
        type: 'nghi_luan_xa_hoi',
        originalText: `Tự học là điều ai cũng biết là quan trọng. Trong cuộc sống hôm nay không tự học là sẽ thất bại ngay lập tức.\n\nNgười trẻ phải biết tự học trên mạng. Nếu cứ đợi thầy cô thì sẽ không làm được gì cả.\n\nTóm lại tự học giúp ta thành công.`,
        wordCount: 51,
        feedback: {
          overallImpression: 'Bài viết quá ngắn (51 từ), ngắt thành 3 đoạn sai nghiêm trọng thể thức đoạn 200 chữ. Lí lẽ sơ sài, hoàn toàn thiếu dẫn chứng.',
          wordCount: 51,
          paragraphCount: 3,
          criteria: [
            { id: 'c1', name: '1. Thể thức đoạn', weightLabel: '0.25đ', scoreLevel: 'Cần bổ sung', scoreStatus: 'warning', strengths: '', weaknesses: 'Tách 3 đoạn, chỉ được 51 từ', remedyStep: 'Gộp thành 1 đoạn 200 chữ' },
            { id: 'c2', name: '2. Luận điểm', weightLabel: '0.5đ', scoreLevel: 'Cần bổ sung', scoreStatus: 'warning', strengths: '', weaknesses: 'Nông cạn', remedyStep: 'Khai triển lí lẽ sâu sắc hơn' },
            { id: 'c3', name: '3. Dẫn chứng', weightLabel: '0.5đ', scoreLevel: 'Cần bổ sung', scoreStatus: 'warning', strengths: '', weaknesses: 'Hoàn toàn không có dẫn chứng', remedyStep: 'Bổ sung dẫn chứng cụ thể' },
            { id: 'c4', name: '4. Tổ chức liên kết', weightLabel: '0.25đ', scoreLevel: 'Cần bổ sung', scoreStatus: 'warning', strengths: '', weaknesses: 'Cụt lủn', remedyStep: 'Dùng từ nối' },
            { id: 'c5', name: '5. Diễn đạt chính tả', weightLabel: '0.25đ', scoreLevel: 'Đạt cơ bản', scoreStatus: 'info', strengths: 'Không sai chính tả', weaknesses: 'Văn phong thiếu tính học thuật', remedyStep: 'Trau chuốt' }
          ],
          actionSteps: ['Viết lại toàn bộ bài đảm bảo dung lượng 180-220 từ', 'Đưa vào ít nhất 1 dẫn chứng thực tế'],
          cautionNote: 'Cần nghiêm túc rèn luyện lại kỹ năng viết đoạn',
          evaluatedAt: '10:30',
          aiSuggestedScore: 0.65,
          teacherConfirmedScore: 0.75,
          teacherNotes: 'Khoảng cách giữa tự đánh giá và bài làm thực tế rất lớn. Cần rèn luyện nghiêm túc từ các bài ngắn.'
        },
        revisions: [],
        createdAt: '09/10/2026',
        scoreStatus: 'teacher_approved'
      }
    ]
  },

  // 4. Yếu 1 tiêu chí rubric (dẫn chứng)
  scenario_weak_one_rubric: {
    id: 'demo-student-04',
    fullName: 'Học sinh Minh họa 04 (Thiếu dẫn chứng thực tế)',
    studentCode: 'DEMO-04',
    className: '12-MINH-HOA',
    survey: {
      isCompleted: true,
      completedAt: '08/10/2026',
      selfReportedLatestScore: 7.25,
      selfReportedMockScore: 7.0,
      selfReportedReadingScore: 3.25,
      selfReportedParagraphScore: 1.25,
      selfReportedEssayScore: 2.75,
      examDateOrScoreDate: 'Dữ liệu minh họa',
      targetScore: 8.5,
      skillConfidence: {
        reading_main_idea: 4,
        reading_rhetoric: 4,
        reading_theme: 4,
        reading_eval_relate: 3,
        writing_reading_answer: 4,
        writing_paragraph_200w: 3,
        writing_thesis_arguments: 4,
        writing_evidence_analysis: 2,
        writing_essay_600w: 3,
        writing_expression_spelling: 4
      },
      prioritySkillToImprove: 'writing_evidence_analysis',
      mostDifficultFormat: 'doan_van_200_chu',
      practiceTimeAvailability: '30_phut_ngay',
      preferredFormat: 'bai_ngan'
    },
    readingAttempts: [
      {
        id: 'demo-att-04',
        passageTitle: 'Bản lĩnh của sự chính trực',
        question: 'Vì sao tác giả cho rằng: "người chính trực thường phải chấp nhận đi con đường gập ghềnh hơn"?',
        questionLevel: 'thong_hieu',
        originalAnswer: 'Bởi vì người chính trực phải từ chối những điểm số không xứng đáng, từ chối lời khen đãi bôi và không đồng lõa với sự gian dối.',
        feedback: {
          strengths: ['Bám sát văn bản', 'Lập luận rõ ràng'],
          missingPoints: [],
          textEvidenceHints: ['Đoạn 2'],
          guidingQuestions: [],
          rubricSummary: 'Đạt điểm tối đa',
          evaluatedAt: '14:00',
          aiSuggestedScore: 3.5,
          teacherConfirmedScore: 3.5
        },
        timestamp: '10/10/2026',
        scoreStatus: 'teacher_approved'
      }
    ],
    writingRecords: [
      {
        id: 'demo-rec-04',
        promptTitle: 'Ý nghĩa của sự tự học đối với người trẻ',
        promptText: 'Đoạn văn 200 chữ về tự học.',
        type: 'nghi_luan_xa_hoi',
        originalText: 'Trong đời sống hôm nay, tự học là phẩm chất quyết định tầm vóc của mỗi cá nhân khi bước ra xã hội rộng lớn. Tự học giúp chúng ta biến tri thức nhân loại thành tài sản riêng, kích thích tư duy đào sâu bản chất vấn đề và không bao giờ bị phụ thuộc vào người khác. Khi con người tự học, họ sẽ có năng lực tư duy độc lập và niềm tin vững vàng vào chính mình. Ngược lại, nếu chỉ thụ động tiếp thu, ta sẽ trở thành những chiếc bình rỗng không có giá trị nội tại. Tóm lại, tự học là con đường duy nhất dẫn đến sự trưởng thành chân chính của mỗi học sinh lớp 12.',
        wordCount: 165,
        feedback: {
          overallImpression: 'Văn phong đĩnh đạc, bố cục 1 đoạn văn chuẩn, luận điểm sắc sảo. Tuy nhiên điểm trừ lớn nhất là HOÀN TOÀN THIẾU DẪN CHỨNG THỰC TẾ.',
          wordCount: 165,
          paragraphCount: 1,
          criteria: [
            { id: 'c1', name: '1. Thể thức đoạn', weightLabel: '0.25đ', scoreLevel: 'Tốt & Sâu sắc', scoreStatus: 'success', strengths: '1 đoạn duy nhất 165 từ', weaknesses: '', remedyStep: '' },
            { id: 'c2', name: '2. Luận điểm', weightLabel: '0.5đ', scoreLevel: 'Tốt & Sâu sắc', scoreStatus: 'success', strengths: 'Sâu sắc, mạch lạc', weaknesses: '', remedyStep: '' },
            { id: 'c3', name: '3. Dẫn chứng', weightLabel: '0.5đ', scoreLevel: 'Cần bổ sung', scoreStatus: 'warning', strengths: '', weaknesses: 'Thiếu dẫn chứng thực tế minh chứng', remedyStep: 'Bổ sung ngay 1 tấm gương tiêu biểu' },
            { id: 'c4', name: '4. Tổ chức liên kết', weightLabel: '0.25đ', scoreLevel: 'Tốt & Sâu sắc', scoreStatus: 'success', strengths: 'Mạch lạc', weaknesses: '', remedyStep: '' },
            { id: 'c5', name: '5. Diễn đạt chính tả', weightLabel: '0.25đ', scoreLevel: 'Tốt & Sâu sắc', scoreStatus: 'success', strengths: 'Ngữ pháp chuẩn mực', weaknesses: '', remedyStep: '' }
          ],
          actionSteps: ['Bổ sung 1 dẫn chứng thực tế sống động kèm câu bình.'],
          cautionNote: 'Đừng để mất 0.5 điểm dẫn chứng đáng tiếc trong phòng thi',
          evaluatedAt: '14:30',
          aiSuggestedScore: 1.35,
          teacherConfirmedScore: 1.4,
          teacherNotes: 'Viết văn rất sắc, nhưng thiếu dẫn chứng là điểm trừ lớn ở đề thi tốt nghiệp.'
        },
        revisions: [],
        createdAt: '10/10/2026',
        scoreStatus: 'teacher_approved'
      }
    ]
  },

  // 5. Đã tiến bộ rõ rệt sau khi luyện tập
  scenario_high_progress: {
    id: 'demo-student-05',
    fullName: 'Học sinh Minh họa 05 (Tiến bộ rõ rệt)',
    studentCode: 'DEMO-05',
    className: '12-MINH-HOA',
    survey: {
      isCompleted: true,
      completedAt: '01/10/2026',
      selfReportedLatestScore: 6.0,
      selfReportedMockScore: 6.25,
      selfReportedReadingScore: 2.25,
      selfReportedParagraphScore: 1.0,
      selfReportedEssayScore: 2.75,
      examDateOrScoreDate: 'Dữ liệu minh họa',
      targetScore: 8.0,
      skillConfidence: {
        reading_main_idea: 3,
        reading_rhetoric: 3,
        reading_theme: 3,
        reading_eval_relate: 3,
        writing_reading_answer: 3,
        writing_paragraph_200w: 3,
        writing_thesis_arguments: 3,
        writing_evidence_analysis: 3,
        writing_essay_600w: 3,
        writing_expression_spelling: 3
      },
      prioritySkillToImprove: 'writing_paragraph_200w',
      mostDifficultFormat: 'doan_van_200_chu',
      practiceTimeAvailability: '30_phut_ngay',
      preferredFormat: 'cau_hoi_tung_buoc'
    },
    readingAttempts: [
      {
        id: 'demo-att-05',
        passageTitle: 'Khoảng lặng giữa dòng đời hối hả',
        question: 'Theo đoạn trích, khoảng lặng là gì?',
        questionLevel: 'nhan_biet',
        originalAnswer: 'Khoảng lặng là mảnh đất màu mỡ cho sự suy ngẫm nảy mầm, là nơi nhân cách được định hình.',
        feedback: {
          strengths: ['Trích xuất chính xác cụm từ nguyên bản của tác giả'],
          missingPoints: [],
          textEvidenceHints: ['Đoạn 2'],
          guidingQuestions: [],
          rubricSummary: 'Đạt điểm tối đa',
          evaluatedAt: '15:00',
          aiSuggestedScore: 3.5,
          teacherConfirmedScore: 3.5
        },
        timestamp: '12/10/2026',
        scoreStatus: 'teacher_approved'
      }
    ],
    writingRecords: [
      {
        id: 'demo-rec-05',
        promptTitle: 'Ý nghĩa của sự tự học đối với người trẻ',
        promptText: 'Đoạn văn 200 chữ về tự học trong kỷ nguyên số.',
        type: 'nghi_luan_xa_hoi',
        originalText: 'Trong thời đại công nghệ số bùng nổ, tinh thần tự học chính là chiếc chìa khóa vạn năng giúp người trẻ chủ động thích ứng với biển tri thức vô tận mà không bị lạc lõng. Khi tự học, chúng ta không thụ động chờ đợi thầy cô truyền thụ mà tự mình khám phá, tôi luyện tư duy phản biện và khả năng sinh tồn bền bỉ trước mọi biến động. Minh chứng sống động là tấm gương tự học miệt mài của các nhà khoa học trẻ Việt Nam để cống hiến cho đất nước. Tóm lại, tự học là hành trang cốt tử của mỗi học sinh lớp 12 khi chuẩn bị bước vào giảng đường đại học.',
        wordCount: 192,
        feedback: {
          overallImpression: 'Tiến bộ vượt bậc! Đã khắc phục triệt để lỗi tách đoạn và bổ sung dẫn chứng thuyết phục.',
          wordCount: 192,
          paragraphCount: 1,
          criteria: [
            { id: 'c1', name: '1. Thể thức đoạn', weightLabel: '0.25đ', scoreLevel: 'Tốt & Sâu sắc', scoreStatus: 'success', strengths: '1 đoạn chuẩn 192 từ', weaknesses: '', remedyStep: '' },
            { id: 'c2', name: '2. Luận điểm', weightLabel: '0.5đ', scoreLevel: 'Tốt & Sâu sắc', scoreStatus: 'success', strengths: 'Mạch lạc, có tính phát hiện', weaknesses: '', remedyStep: '' },
            { id: 'c3', name: '3. Dẫn chứng', weightLabel: '0.5đ', scoreLevel: 'Tốt & Sâu sắc', scoreStatus: 'success', strengths: 'Dẫn chứng sắc sảo, có tính giáo dục cao', weaknesses: '', remedyStep: '' },
            { id: 'c4', name: '4. Tổ chức liên kết', weightLabel: '0.25đ', scoreLevel: 'Tốt & Sâu sắc', scoreStatus: 'success', strengths: 'Mạch lạc', weaknesses: '', remedyStep: '' },
            { id: 'c5', name: '5. Diễn đạt chính tả', weightLabel: '0.25đ', scoreLevel: 'Tốt & Sâu sắc', scoreStatus: 'success', strengths: 'Từ ngữ chuẩn mực', weaknesses: '', remedyStep: '' }
          ],
          actionSteps: ['Duy trì cấu trúc lập luận này cho các đề bài tiếp theo.'],
          cautionNote: '',
          evaluatedAt: '16:00',
          aiSuggestedScore: 1.8,
          teacherConfirmedScore: 1.85,
          teacherNotes: 'Đã tiếp thu trọn vẹn góp ý từ lần sửa trước. Bài viết đạt mức điểm giỏi.'
        },
        revisions: [],
        createdAt: '12/10/2026',
        scoreStatus: 'teacher_approved'
      }
    ]
  },

  // 6. Chưa hoàn thành khảo sát
  scenario_uncompleted_survey: {
    id: 'demo-student-06',
    fullName: 'Học sinh Minh họa 06 (Chưa khảo sát)',
    studentCode: 'DEMO-06',
    className: '12-MINH-HOA',
    survey: {
      isCompleted: false,
      selfReportedLatestScore: null,
      selfReportedMockScore: null,
      selfReportedReadingScore: null,
      selfReportedParagraphScore: null,
      selfReportedEssayScore: null,
      examDateOrScoreDate: '',
      targetScore: 8.0,
      skillConfidence: {}
    },
    readingAttempts: [],
    writingRecords: []
  }
};
