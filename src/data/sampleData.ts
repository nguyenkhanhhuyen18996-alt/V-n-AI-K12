import { ReadingPassage, WritingPrompt, CriterionEvaluation } from '../types';

export const TEACHER_RUBRIC_PARAGRAPH_NLXH_20: CriterionEvaluation[] = [
  {
    id: 'rubric-p-nlxh-1',
    name: '1. Đảm bảo thể thức và dung lượng đoạn văn (~200 chữ)',
    weightLabel: '0,25 điểm',
    scoreLevel: 'Đạt cơ bản',
    scoreStatus: 'info',
    strengths: 'Trình bày đúng hình thức 1 đoạn văn duy nhất (không xuống dòng ngắt đoạn), dung lượng khoảng 180–250 chữ.',
    weaknesses: 'Ngắt thành nhiều đoạn hoặc quá ngắn/quá dài so với yêu cầu.',
    remedyStep: 'Viết liền mạch 1 đoạn văn từ mở đoạn đến kết đoạn.',
    scoreAwarded: 0.25,
    maxCriterionScore: 0.25
  },
  {
    id: 'rubric-p-nlxh-2',
    name: '2. Xác định đúng vấn đề nghị luận xã hội',
    weightLabel: '0,25 điểm',
    scoreLevel: 'Đạt cơ bản',
    scoreStatus: 'info',
    strengths: 'Nêu trực tiếp, rõ ràng vấn đề nghị luận xã hội ngay ở câu mở đoạn.',
    weaknesses: 'Dẫn dắt lan man hoặc xác định lệch trọng tâm đề bài.',
    remedyStep: 'Gạch chân từ khóa trong đề và đưa vào câu chủ đề mở đoạn.',
    scoreAwarded: 0.25,
    maxCriterionScore: 0.25
  },
  {
    id: 'rubric-p-nlxh-3',
    name: '3. Triển khai lí lẽ, phân tích dẫn chứng thực tế và phản đề',
    weightLabel: '1,0 điểm',
    scoreLevel: 'Đạt cơ bản',
    scoreStatus: 'info',
    strengths: 'Lập luận chặt chẽ, kết hợp lí lẽ sắc bén với dẫn chứng người thật việc thật tiêu biểu; có góc nhìn mở rộng/phản đề.',
    weaknesses: 'Lí lẽ chung chung, thiếu dẫn chứng thực tế hoặc chỉ liệt kê dẫn chứng mà không phân tích.',
    remedyStep: 'Chọn 1 dẫn chứng thực tế xác thực và viết 2–3 câu bình phân tích ý nghĩa.',
    scoreAwarded: 1.0,
    maxCriterionScore: 1.0
  },
  {
    id: 'rubric-p-nlxh-4',
    name: '4. Chính tả, ngữ pháp, liên kết câu và sáng tạo diễn đạt',
    weightLabel: '0,5 điểm',
    scoreLevel: 'Đạt cơ bản',
    scoreStatus: 'info',
    strengths: 'Dùng từ chuẩn xác, các câu liên kết mạch lạc, có suy nghĩ riêng sâu sắc.',
    weaknesses: 'Lặp từ, câu văn rườm rà hoặc sai quy tắc chính tả.',
    remedyStep: 'Sử dụng từ nối chuyển ý và rà soát dấu câu trước khi nộp.',
    scoreAwarded: 0.5,
    maxCriterionScore: 0.5
  }
];

export const TEACHER_RUBRIC_PARAGRAPH_NLVH_20: CriterionEvaluation[] = [
  {
    id: 'rubric-p-nlvh-1',
    name: '1. Đảm bảo thể thức và dung lượng đoạn văn (~200 chữ)',
    weightLabel: '0,25 điểm',
    scoreLevel: 'Đạt cơ bản',
    scoreStatus: 'info',
    strengths: 'Đúng hình thức 1 đoạn văn duy nhất, dung lượng khoảng 180–250 chữ.',
    weaknesses: 'Tách thành nhiều đoạn văn như bài thu nhỏ hoặc thiếu hụt dung lượng.',
    remedyStep: 'Giữ trọn vẹn cấu trúc Tổng - Phân - Hợp trong 1 đoạn văn duy nhất.',
    scoreAwarded: 0.25,
    maxCriterionScore: 0.25
  },
  {
    id: 'rubric-p-nlvh-2',
    name: '2. Xác định đúng khía cạnh nội dung/nghệ thuật cần phân tích',
    weightLabel: '0,25 điểm',
    scoreLevel: 'Đạt cơ bản',
    scoreStatus: 'info',
    strengths: 'Giới thiệu chính xác tác giả, tác phẩm và khía cạnh đặc sắc mà đề bài yêu cầu.',
    weaknesses: 'Kể lại cốt truyện hoặc diễn xuôi thơ mà chưa nêu luận điểm văn học.',
    remedyStep: 'Mở đoạn bằng câu luận điểm khái quát rõ nét đặc sắc của đoạn trích/hình tượng.',
    scoreAwarded: 0.25,
    maxCriterionScore: 0.25
  },
  {
    id: 'rubric-p-nlvh-3',
    name: '3. Phân tích dẫn chứng văn bản gắn liền nội dung và nghệ thuật',
    weightLabel: '1,0 điểm',
    scoreLevel: 'Đạt cơ bản',
    scoreStatus: 'info',
    strengths: 'Trích dẫn chọn lọc từ ngữ, hình ảnh, biện pháp nghệ thuật tiêu biểu và giải mã chiều sâu tư tưởng của nhà văn.',
    weaknesses: 'Tách rời nghệ thuật khỏi nội dung hoặc trích dẫn tràn lan không phân tích.',
    remedyStep: 'Phân tích từng tín hiệu thẩm mỹ (từ ngữ, nhịp điệu, tu từ) để làm bật thông điệp.',
    scoreAwarded: 1.0,
    maxCriterionScore: 1.0
  },
  {
    id: 'rubric-p-nlvh-4',
    name: '4. Chính tả, liên kết câu và cảm thụ văn học sáng tạo',
    weightLabel: '0,5 điểm',
    scoreLevel: 'Đạt cơ bản',
    scoreStatus: 'info',
    strengths: 'Ngôn từ giàu chất văn, dùng đúng thuật ngữ lý luận/phê bình, không mắc lỗi chính tả.',
    weaknesses: 'Diễn đạt khô khan, lặp từ hoặc sai chính tả.',
    remedyStep: 'Bổ sung nhận xét đánh giá khái quát tài năng tác giả ở câu kết đoạn.',
    scoreAwarded: 0.5,
    maxCriterionScore: 0.5
  }
];

export const TEACHER_RUBRIC_ESSAY_NLXH_40: CriterionEvaluation[] = [
  {
    id: 'rubric-e-nlxh-1',
    name: '1. Đảm bảo cấu trúc bài văn nghị luận xã hội (~600 chữ)',
    weightLabel: '0,5 điểm',
    scoreLevel: 'Đạt cơ bản',
    scoreStatus: 'info',
    strengths: 'Bố cục 3 phần Mở bài - Thân bài - Kết bài rõ ràng; các đoạn văn thân bài chia tách mạch lạc.',
    weaknesses: 'Thiếu Mở/Kết bài hoặc viết gộp toàn bộ thân bài thành 1 đoạn.',
    remedyStep: 'Tách mỗi luận điểm lớn ở thân bài thành một đoạn văn độc lập.',
    scoreAwarded: 0.5,
    maxCriterionScore: 0.5
  },
  {
    id: 'rubric-e-nlxh-2',
    name: '2. Xác định đúng vấn đề nghị luận và giải thích khái niệm trọng tâm',
    weightLabel: '0,5 điểm',
    scoreLevel: 'Đạt cơ bản',
    scoreStatus: 'info',
    strengths: 'Giới thiệu trúng vấn đề tư tưởng/đời sống và giải thích thấu đáo các khái niệm then chốt.',
    weaknesses: 'Giải thích sơ sài hoặc hiểu chưa đầy đủ các vế của vấn đề.',
    remedyStep: 'Dành đoạn đầu thân bài để giải thích từ khóa và bản chất vấn đề nghị luận.',
    scoreAwarded: 0.5,
    maxCriterionScore: 0.5
  },
  {
    id: 'rubric-e-nlxh-3',
    name: '3. Hệ thống luận điểm đa chiều, dẫn chứng thực tế và bàn luận mở rộng',
    weightLabel: '2,0 điểm',
    scoreLevel: 'Đạt cơ bản',
    scoreStatus: 'info',
    strengths: 'Triển khai hệ thống luận điểm thuyết phục, dẫn chứng thời sự/lịch sử tiêu biểu, có phản đề và bài học nhận thức - hành động.',
    weaknesses: 'Luận điểm trùng lặp, dẫn chứng sáo mòn hoặc thiếu phần phản biện đa chiều.',
    remedyStep: 'Xây dựng đủ các bước: Giải thích -> Bàn luận (Biểu hiện, Ý nghĩa) -> Dẫn chứng -> Phản đề -> Bài học.',
    scoreAwarded: 2.0,
    maxCriterionScore: 2.0
  },
  {
    id: 'rubric-e-nlxh-4',
    name: '4. Diễn đạt, liên kết đoạn văn và bản sắc tư duy cá nhân',
    weightLabel: '1,0 điểm',
    scoreLevel: 'Đạt cơ bản',
    scoreStatus: 'info',
    strengths: 'Lập luận sắc sảo, giọng điệu giàu sức thuyết phục, có góc nhìn sâu sắc của người trẻ.',
    weaknesses: 'Diễn đạt dài dòng, mắc lỗi chính tả/ngữ pháp hoặc thiếu liên kết giữa các đoạn.',
    remedyStep: 'Dùng câu chuyển đoạn uyển chuyển và kiểm tra kỹ chính tả.',
    scoreAwarded: 1.0,
    maxCriterionScore: 1.0
  }
];

export const TEACHER_RUBRIC_ESSAY_NLVH_40: CriterionEvaluation[] = [
  {
    id: 'rubric-e-nlvh-1',
    name: '1. Đảm bảo cấu trúc bài văn nghị luận văn học (~600 chữ)',
    weightLabel: '0,5 điểm',
    scoreLevel: 'Đạt cơ bản',
    scoreStatus: 'info',
    strengths: 'Đầy đủ 3 phần Mở bài - Thân bài - Kết bài; phân chia hệ thống luận điểm thân bài cân đối.',
    weaknesses: 'Bố cục thiếu cân đối hoặc không tách đoạn rõ ràng ở phần thân bài.',
    remedyStep: 'Tổ chức thân bài thành 3–4 đoạn văn tương ứng với từng luận điểm cảm thụ.',
    scoreAwarded: 0.5,
    maxCriterionScore: 0.5
  },
  {
    id: 'rubric-e-nlvh-2',
    name: '2. Xác định đúng vấn đề nghị luận và giới thiệu khái quát tác giả, tác phẩm',
    weightLabel: '0,5 điểm',
    scoreLevel: 'Đạt cơ bản',
    scoreStatus: 'info',
    strengths: 'Giới thiệu chính xác vị trí tác giả, hoàn cảnh/xuất xứ tác phẩm và nêu bật vấn đề nghị luận.',
    weaknesses: 'Mở bài chung chung hoặc bỏ sót yêu cầu trọng tâm của đề.',
    remedyStep: 'Nêu rõ luận đề văn học ngay ở phần Mở bài và đoạn khái quát đầu Thân bài.',
    scoreAwarded: 0.5,
    maxCriterionScore: 0.5
  },
  {
    id: 'rubric-e-nlvh-3',
    name: '3. Phân tích sâu sắc nội dung tư tưởng gắn với đặc trưng thể loại và nghệ thuật',
    weightLabel: '2,0 điểm',
    scoreLevel: 'Đạt cơ bản',
    scoreStatus: 'info',
    strengths: 'Phân tích thấu đáo hình tượng, ngôn từ, giọng điệu, bút pháp nghệ thuật; có so sánh, liên hệ mở rộng.',
    weaknesses: 'Chỉ diễn xuôi tác phẩm, thiếu phân tích nghệ thuật hoặc trích dẫn thiếu chọn lọc.',
    remedyStep: 'Kết hợp phân tích chi tiết nghệ thuật đắt giá với đánh giá giá trị nhân văn/thẩm mỹ.',
    scoreAwarded: 2.0,
    maxCriterionScore: 2.0
  },
  {
    id: 'rubric-e-nlvh-4',
    name: '4. Diễn đạt giàu chất văn, liên kết mạch lạc và sáng tạo cảm thụ',
    weightLabel: '1,0 điểm',
    scoreLevel: 'Đạt cơ bản',
    scoreStatus: 'info',
    strengths: 'Hành văn trong sáng, giàu cảm xúc thẩm mỹ, vận dụng hợp lý tri thức lý luận văn học.',
    weaknesses: 'Diễn đạt khô cứng, lặp từ hoặc sai lỗi chính tả.',
    remedyStep: 'Trau chuốt câu văn giàu hình ảnh và kiểm tra lỗi ngữ pháp.',
    scoreAwarded: 1.0,
    maxCriterionScore: 1.0
  }
];

export const SAMPLE_READING_PASSAGES: ReadingPassage[] = [
  {
    id: 'passage-1',
    title: 'Khoảng lặng giữa dòng đời hối hả',
    author: 'Chu Văn Sơn',
    source: 'Trích "Ánh sáng từ những trang văn", NXB Hội Nhà Văn',
    genre: 'Tản văn',
    textType: 'van_hoc',
    textTypeLabel: 'Văn bản văn học',
    level: 'Thông hiểu',
    targetSkill: 'reading_main_idea',
    targetSkillName: 'Đọc hiểu thông tin & suy luận ngữ cảnh văn học',
    estimatedMinutes: 30,
    maxScore: 4.0,
    rubricId: 'RUBRIC-READ-VH-40',
    examTemplate: 'A',
    status: 'published',
    sourceLabel: 'Đề ngân hàng Giáo viên xuất bản',
    content: `Trong nhịp sống cuồn cuộn hôm nay, con người dường như sợ hãi sự im lặng. Chúng ta vội vã lấp đầy mọi khoảng trống thời gian bằng những âm thanh nhân tạo, những thông báo dồn dập từ màn hình điện tử. Người ta sợ rằng nếu dừng lại một giây, mình sẽ bị bỏ lại phía sau bởi dòng chảy vũ bão của thời cuộc.

Thế nhưng, sự im lặng đích thực không phải là sự trống rỗng hay buông xuôi, mà là mảnh đất màu mỡ cho sự suy ngẫm nảy mầm. Khi bớt đi tiếng ồn ào bên ngoài, tai ta mới bắt đầu nghe được nhịp đập của trái tim mình, mắt ta mới nhận ra vẻ đẹp bình dị của một chiếc lá rơi hay ánh mắt mỏi mệt của người thân. Khoảng lặng chính là nơi nhân cách được định hình, nơi ta gạn đục khơi trong những suy tư bề bộn để tìm về bản ngã nguyên sơ.

Biết tạo ra những khoảng lặng cho tâm hồn không phải là trốn chạy thực tại, mà là một sự chuẩn bị can đảm để dấn thân sâu sắc hơn vào đời sống. Chỉ khi thấu hiểu chính mình trong tĩnh lặng, con người mới đủ sức bền và lòng trắc ẩn để đi cùng người khác giữa muôn ngàn biến động.`,
    questions: [
      {
        id: 'q1-1',
        level: 'nhan_biet',
        levelName: 'Nhận biết',
        maxScore: 0.75,
        question: 'Theo đoạn trích, con người hôm nay thường vội vã lấp đầy khoảng trống thời gian bằng những điều gì?',
        contextHint: 'Xem xét kỹ câu thứ hai trong đoạn văn đầu tiên.',
        keyConcepts: ['âm thanh nhân tạo', 'thông báo dồn dập từ màn hình điện tử'],
        sampleScaffoldNotes: [
          'Chỉ cần tìm và chỉ ra chính xác cụm từ tác giả đã nêu trong văn bản.',
          'Không diễn giải lan man ngoài câu chữ của đoạn trích.'
        ]
      },
      {
        id: 'q1-2',
        level: 'thong_hieu',
        levelName: 'Thông hiểu',
        maxScore: 0.75,
        question: 'Anh/chị hiểu như thế nào về nhận định của tác giả: "Khoảng lặng chính là nơi nhân cách được định hình"?',
        contextHint: 'Liên hệ giữa cụm từ "suy ngẫm nảy mầm", "gạn đục khơi trong" và ý nghĩa của sự tự phản tỉnh.',
        keyConcepts: ['khoảng lặng', 'tự nhìn nhận bản thân', 'lắng đọng', 'gạn lọc', 'hoàn thiện nhân cách'],
        sampleScaffoldNotes: [
          'Giải thích nghĩa của "khoảng lặng": trạng thái bình tâm, không xao động.',
          'Giải thích vì sao nhờ khoảng lặng mà nhân cách được bồi đắp và trưởng thành.'
        ]
      },
      {
        id: 'q1-3',
        level: 'van_dung',
        levelName: 'Vận dụng',
        maxScore: 1.0,
        question: 'Nhận xét về tác dụng của biện pháp tu từ tương phản được sử dụng trong đoạn văn thứ hai.',
        contextHint: 'Đối chiếu giữa "tiếng ồn ào bên ngoài" với "nhịp đập của trái tim mình", "trống rỗng" với "mảnh đất màu mỡ".',
        keyConcepts: ['tương phản', 'tiếng ồn bên ngoài', 'nhịp đập trái tim', 'nhấn mạnh giá trị của tĩnh lặng'],
        sampleScaffoldNotes: [
          'Chỉ rõ 2 vế tương phản cụ thể trong câu văn.',
          'Nêu tác dụng nghệ thuật: làm nổi bật giá trị của sự tĩnh lặng so với lối sống ồn ào xô bồ.'
        ]
      },
      {
        id: 'q1-4',
        level: 'van_dung_cao',
        levelName: 'Vận dụng cao',
        maxScore: 1.5,
        question: 'Thông điệp nào trong văn bản có ý nghĩa nhất đối với anh/chị khi đang đứng trước ngưỡng cửa thi cử và trưởng thành? Vì sao?',
        contextHint: 'Lựa chọn 1 thông điệp gắn liền với trải nghiệm áp lực hoặc việc quản lý thời gian của bản thân học sinh lớp 12.',
        keyConcepts: ['thông điệp', 'lắng nghe chính mình', 'tránh áp lực cuốn đi', 'bản lĩnh'],
        sampleScaffoldNotes: [
          'Gọi tên rõ ràng 1 thông điệp rút ra từ văn bản (ví dụ: biết dừng lại để nhìn nhận bản thân).',
          'Lí giải thuyết phục bằng trải nghiệm thực tế học tập của bản thân học sinh lớp 12.'
        ]
      }
    ]
  },
  {
    id: 'passage-2',
    title: 'Những nhành cây vươn ra đón bão',
    author: 'Nguyễn Khoa Điềm',
    source: 'Trích tuyển tập thơ thời kỳ mới',
    genre: 'Thơ hiện đại',
    textType: 'van_hoc',
    textTypeLabel: 'Văn bản văn học',
    level: 'Vận dụng',
    targetSkill: 'reading_rhetoric',
    targetSkillName: 'Nhận biết & phân tích biện pháp tu từ trong thơ',
    estimatedMinutes: 30,
    maxScore: 4.0,
    rubricId: 'RUBRIC-READ-VH-40',
    examTemplate: 'A',
    status: 'published',
    sourceLabel: 'Đề ngân hàng Giáo viên xuất bản',
    content: `Cây không chọn đất để sinh ra
Nhưng cây chọn vươn lên cùng bão gió
Đất cằn cỗi dạy rễ cày sâu vào lòng đá
Lá xanh ngời vượt qua những mùa khô.

Chúng ta sống không phải để âu lo
Về những trắc trở ngày mai chưa tới
Mỗi vết sẹo trên thân cây rắn rỏi
Là một lời thề kiên định trước thời gian.

Đất nước này lớn lên từ gian nan
Từ mồ hôi và những bàn tay lặng lẽ
Ai cũng có một phần đời thật trẻ
Đừng để tháng năm trôi dạt vô hình.`,
    questions: [
      {
        id: 'q2-1',
        level: 'nhan_biet',
        levelName: 'Nhận biết',
        maxScore: 1.0,
        question: 'Chỉ ra thể thơ của văn bản trên.',
        contextHint: 'Đếm số chữ trong các dòng thơ của khổ 1 và khổ 2.',
        keyConcepts: ['thể thơ tự do', 'tám chữ', 'tự do'],
        sampleScaffoldNotes: [
          'Xác định dựa trên số tiếng trong từng dòng thơ.',
          'Nếu số tiếng không cố định, nêu thể thơ tự do.'
        ]
      },
      {
        id: 'q2-2',
        level: 'thong_hieu',
        levelName: 'Thông hiểu',
        maxScore: 1.5,
        question: 'Hình ảnh "mỗi vết sẹo trên thân cây rắn rỏi / là một lời thề kiên định trước thời gian" gợi cho anh/chị suy nghĩ gì?',
        contextHint: 'Hình tượng ẩn dụ "vết sẹo" tượng trưng cho những thử thách, va vấp đã trải qua.',
        keyConcepts: ['ẩn dụ vết sẹo', 'thử thách', 'bản lĩnh', 'trưởng thành'],
        sampleScaffoldNotes: [
          'Phân tích nghĩa đen của vết sẹo trên cây và nghĩa biểu tượng cho con người.',
          'Khẳng định giá trị của việc kiên định vượt qua khó khăn.'
        ]
      },
      {
        id: 'q2-3',
        level: 'van_dung',
        levelName: 'Vận dụng',
        maxScore: 1.5,
        question: 'Anh/chị có đồng tình với lời nhắn nhủ: "Ai cũng có một phần đời thật trẻ / Đừng để tháng năm trôi dạt vô hình" không? Vì sao?',
        contextHint: 'Bày tỏ quan điểm rõ ràng (Đồng tình/Hoàn toàn đồng tình) và đưa ra ít nhất 2 lí lẽ xác đáng.',
        keyConcepts: ['đồng tình', 'tuổi trẻ quý giá', 'sống có mục đích', 'cống hiến'],
        sampleScaffoldNotes: [
          'Nêu rõ thái độ đồng tình.',
          'Lí giải vì sao tuổi trẻ chỉ đến một lần và cần sống có lý tưởng, trách nhiệm.'
        ]
      }
    ]
  },
  {
    id: 'passage-3',
    title: 'Bản lĩnh của sự chính trực',
    author: 'Đặng Hoàng Giang',
    source: 'Trích "Bức xúc không làm ta vô can", NXB Hội Nhà Văn',
    genre: 'Bình luận xã hội',
    textType: 'nghi_luan',
    textTypeLabel: 'Văn bản nghị luận',
    level: 'Vận dụng',
    targetSkill: 'reading_theme',
    targetSkillName: 'Xác định luận đề, lí lẽ và bằng chứng trong văn bản nghị luận',
    estimatedMinutes: 30,
    maxScore: 4.0,
    rubricId: 'RUBRIC-READ-NL-40',
    examTemplate: 'B',
    status: 'published',
    sourceLabel: 'Đề ngân hàng Giáo viên xuất bản',
    content: `Chính trực không đơn thuần là việc không làm điều xấu khi có người khác nhìn thấy; đó là sự lựa chọn hành động đúng đắn ngay cả khi bạn hoàn toàn cô độc và không ai biết đến.

Trong một thế giới đầy cám dỗ của sự tiện lợi và danh vọng ảo, người chính trực thường phải chấp nhận đi con đường gập ghềnh hơn. Họ có thể từ chối một điểm số không xứng đáng, từ chối một lời khen đãi bôi hay kiên quyết không đồng lõa với sự gian dối tập thể. Sự lựa chọn đó đòi hỏi một sự dũng cảm bền bỉ, bởi cái giá của nó đôi khi là sự cô lập tạm thời.

Nhưng chính sự chính trực mới là chiếc neo giữ con người không bị chao đảo trước những cơn sóng ngầm của đạo đức giả. Một xã hội phát triển lành mạnh không được xây dựng trên những vẻ bề ngoài bóng bẩy, mà dựa vào mạng lưới những cá nhân có lòng tự trọng và can đảm sống thật với những giá trị căn cốt của mình.`,
    questions: [
      {
        id: 'q3-1',
        level: 'nhan_biet',
        levelName: 'Nhận biết',
        maxScore: 1.0,
        question: 'Theo tác giả, chính trực là gì?',
        contextHint: 'Tìm câu định nghĩa trực tiếp ở đoạn văn thứ nhất.',
        keyConcepts: ['lựa chọn hành động đúng đắn', 'khi hoàn toàn cô độc', 'không ai biết đến'],
        sampleScaffoldNotes: [
          'Trích dẫn đúng câu tác giả định nghĩa về sự chính trực.',
          'Tránh tự suy diễn khác với câu chữ nguyên gốc.'
        ]
      },
      {
        id: 'q3-2',
        level: 'thong_hieu',
        levelName: 'Thông hiểu',
        maxScore: 1.5,
        question: 'Vì sao tác giả cho rằng: "người chính trực thường phải chấp nhận đi con đường gập ghềnh hơn"?',
        contextHint: 'Đọc kỹ các ví dụ tác giả nêu ở đoạn hai: từ chối điểm số, từ chối khen ngợi đãi bôi, nguy cơ cô lập.',
        keyConcepts: ['từ chối cám dỗ', 'không đồng lõa gian dối', 'chấp nhận cô lập', 'đòi hỏi lòng dũng cảm'],
        sampleScaffoldNotes: [
          'Chỉ ra các khó khăn mà người chính trực phải đối mặt.',
          'Nhấn mạnh áp lực từ sự tiện lợi và thói quen thỏa hiệp của số đông.'
        ]
      },
      {
        id: 'q3-3',
        level: 'van_dung',
        levelName: 'Vận dụng',
        maxScore: 1.5,
        question: 'Hình ảnh ẩn dụ "chiếc neo giữ con người không bị chao đảo trước những cơn sóng ngầm của đạo đức giả" có tác dụng gì trong việc thể hiện luận đề?',
        contextHint: 'Liên hệ hình ảnh chiếc neo giữ tàu vững vàng với bản lĩnh đạo đức của cá nhân.',
        keyConcepts: ['ẩn dụ chiếc neo', 'điểm tựa đạo đức', 'không bị cuốn theo cái xấu', 'khẳng định giá trị tự trọng'],
        sampleScaffoldNotes: [
          'Chỉ ra tác dụng làm cho lập luận sinh động, giàu sức biểu cảm.',
          'Nhấn mạnh vai trò điểm tựa tinh thần vững chắc của sự chính trực.'
        ]
      }
    ]
  },
  {
    id: 'passage-4',
    title: 'Chuyển đổi số và bài toán bảo tồn di sản văn hóa Việt Nam',
    author: 'Theo Tạp chí Văn hóa & Công nghệ',
    source: 'Chuyên đề Di sản số Quốc gia 2025',
    genre: 'Văn bản thông tin',
    textType: 'thong_tin',
    textTypeLabel: 'Văn bản thông tin',
    level: 'Thông hiểu',
    targetSkill: 'reading_main_idea',
    targetSkillName: 'Đọc hiểu văn bản thông tin, trích xuất dữ liệu & đánh giá giải pháp',
    estimatedMinutes: 30,
    maxScore: 4.0,
    rubricId: 'RUBRIC-READ-TT-40',
    examTemplate: 'B',
    status: 'published',
    sourceLabel: 'Đề ngân hàng Giáo viên xuất bản',
    content: `Trong bối cảnh Cách mạng công nghiệp lần thứ tư, công nghệ số đang mở ra phương thức tiếp cận hoàn toàn mới đối với công tác bảo tồn và phát huy giá trị di sản văn hóa dân tộc. Thay vì chỉ lưu trữ tĩnh trên giấy hoặc trưng bày giới hạn trong tủ kính bảo tàng, hàng nghìn hiện vật lịch sử, mộc bản, châu bản và kiến trúc cổ đã được quét 3D độ phân giải cao và số hóa thành cơ sở dữ liệu mở.

Tại Hoàng thành Thăng Long và Quần thể di tích Cố đô Huế, công nghệ thực tế ảo (VR) cùng thực tế tăng cường (AR) cho phép người xem, đặc biệt là học sinh và du khách trẻ, phục dựng lại không gian kiến trúc cung đình thế kỷ XIX ngay trên thiết bị di động. Các bản thu âm nghệ thuật truyền thống như Ca trù, Nhã nhạc cung đình Huế hay Quan họ Bắc Ninh cũng được mã hóa chuẩn âm thanh số nhằm tránh nguy cơ thất truyền khi các nghệ nhân cao tuổi lần lượt qua đời.

Tuy nhiên, số hóa di sản không có nghĩa là lấy công nghệ thay thế hoàn toàn trải nghiệm văn hóa thực. Thách thức lớn nhất hiện nay là sự thiếu hụt đội ngũ chuyên gia am hiểu đồng thời cả công nghệ thông tin lẫn chiều sâu lịch sử - mỹ thuật, dẫn đến nguy cơ tái tạo sai lệch nguyên bản di sản. Do đó, chuyển đổi số trong văn hóa cần được thực hiện trên nguyên tắc tôn trọng tính xác thực lịch sử, lấy con người và bản sắc dân tộc làm trung tâm.`,
    questions: [
      {
        id: 'q4-1',
        level: 'nhan_biet',
        levelName: 'Nhận biết',
        maxScore: 0.75,
        question: 'Theo văn bản, những công nghệ cụ thể nào đang được ứng dụng tại Hoàng thành Thăng Long và Quần thể di tích Cố đô Huế?',
        contextHint: 'Tìm thông tin trực tiếp ở câu đầu tiên của đoạn văn thứ hai.',
        keyConcepts: ['thực tế ảo (VR)', 'thực tế tăng cường (AR)', 'quét 3D', 'phục dựng không gian kiến trúc'],
        sampleScaffoldNotes: [
          'Liệt kê chính xác tên các công nghệ được nêu trong đoạn 2.',
          'Không suy diễn các công nghệ không được nhắc tới trong bài.'
        ]
      },
      {
        id: 'q4-2',
        level: 'thong_hieu',
        levelName: 'Thông hiểu',
        maxScore: 0.75,
        question: 'Việc đưa ra các dẫn chứng cụ thể về Hoàng thành Thăng Long, Cố đô Huế, Ca trù, Quan họ có tác dụng gì đối với văn bản thông tin trên?',
        contextHint: 'Xét đặc trưng của văn bản thông tin: tính xác thực, độ tin cậy và minh họa trực quan.',
        keyConcepts: ['tăng tính xác thực', 'minh họa cụ thể', 'thuyết phục người đọc', 'rõ ràng khách quan'],
        sampleScaffoldNotes: [
          'Nêu tác dụng về mặt thông tin: giúp số liệu, nhận định trở nên khách quan, cụ thể.',
          'Giúp người đọc hình dung rõ kết quả ứng dụng thực tiễn tại Việt Nam.'
        ]
      },
      {
        id: 'q4-3',
        level: 'van_dung',
        levelName: 'Vận dụng',
        maxScore: 1.0,
        question: 'Anh/chị hiểu như thế nào về cảnh báo của tác giả: "số hóa di sản không có nghĩa là lấy công nghệ thay thế hoàn toàn trải nghiệm văn hóa thực"?',
        contextHint: 'Đối chiếu vai trò công cụ của công nghệ với giá trị cảm xúc, tâm linh và tính xác thực của di sản gốc.',
        keyConcepts: ['công nghệ chỉ là công cụ hỗ trợ', 'không thay thế giá trị nguyên bản', 'trải nghiệm thực tế', 'tôn trọng tính xác thực'],
        sampleScaffoldNotes: [
          'Khẳng định công nghệ giúp lan tỏa và lưu trữ di sản tốt hơn.',
          'Nhưng hồn cốt văn hóa vẫn nằm ở di tích thật, con người thật và sự gắn kết cộng đồng.'
        ]
      },
      {
        id: 'q4-4',
        level: 'van_dung_cao',
        levelName: 'Vận dụng cao',
        maxScore: 1.5,
        question: 'Là một học sinh lớp 12 trong kỷ nguyên số, anh/chị hãy đề xuất một cách làm thiết thực để người trẻ góp phần lan tỏa di sản văn hóa địa phương trên không gian mạng.',
        contextHint: 'Đề xuất hành động khả thi, tôn trọng sự thật lịch sử và phù hợp với học sinh THPT.',
        keyConcepts: ['sáng tạo nội dung số', 'giới thiệu di tích địa phương', 'kiểm chứng thông tin lịch sử', 'lan tỏa tích cực'],
        sampleScaffoldNotes: [
          'Nêu rõ 1 hành động cụ thể (ví dụ: làm infographic, video thuyết minh lịch sử chuẩn xác).',
          'Giải thích ngắn gọn ý nghĩa của hành động đó.'
        ]
      }
    ]
  }
];

export const SAMPLE_WRITING_PROMPTS: WritingPrompt[] = [
  // =========================================================================
  // NHÓM B: ĐOẠN VĂN KHOẢNG 200 CHỮ (THANG ĐIỂM 2,0 — DỰ KIẾN 30 PHÚT)
  // 2.1. Nghị luận xã hội (Đoạn văn ~200 chữ)
  // =========================================================================
  {
    id: 'prompt-1',
    title: 'Ý nghĩa của sự tự học đối với người trẻ trong kỷ nguyên số',
    type: 'nghi_luan_xa_hoi',
    typeName: '2.1. Nghị luận xã hội (Đoạn văn ~200 chữ)',
    sectionType: 'paragraph_200w',
    targetWordCount: 200,
    wordLimit: 'Khoảng 200 chữ (dung lượng 1 đoạn văn)',
    promptText: 'Từ góc nhìn của một học sinh lớp 12 chuẩn bị bước vào ngưỡng cửa đại học, hãy viết một đoạn văn (khoảng 200 chữ) trình bày suy nghĩ của anh/chị về ý nghĩa của tinh thần tự học trong kỷ nguyên số.',
    focusGuide: 'Tập trung vào 1 luận điểm cốt lõi: Tự học là chìa khóa thích ứng với tri thức không ngừng thay đổi. Cần có 1 dẫn chứng thực tế sống động.',
    coreConcepts: ['tự học', 'kỷ nguyên số', 'chủ động', 'thích ứng', 'năng lực suốt đời'],
    maxScore: 2.0,
    level: 'Vận dụng',
    targetSkill: 'writing_evidence_analysis',
    targetSkillName: 'Lựa chọn, phân tích dẫn chứng thực tế trong đoạn 200 chữ',
    estimatedMinutes: 30,
    rubricId: 'RUBRIC-PARA-NLXH-20',
    rubric: TEACHER_RUBRIC_PARAGRAPH_NLXH_20,
    examTemplate: 'B',
    status: 'published',
    sourceLabel: 'Đề ngân hàng Giáo viên xuất bản'
  },
  {
    id: 'prompt-2',
    title: 'Bản lĩnh dám đối diện với sự không hoàn hảo để vươn lên',
    type: 'nghi_luan_xa_hoi',
    typeName: '2.1. Nghị luận xã hội (Đoạn văn ~200 chữ)',
    sectionType: 'paragraph_200w',
    targetWordCount: 200,
    wordLimit: 'Khoảng 200 chữ (dung lượng 1 đoạn văn)',
    promptText: 'Viết một đoạn văn (khoảng 200 chữ) bàn về ý nghĩa của việc "dám chấp nhận những khiếm khuyết của bản thân để không ngừng nỗ lực vươn lên".',
    focusGuide: 'Phân biệt giữa việc "chấp nhận khiếm khuyết để tự hoàn thiện" với thái độ "thỏa hiệp, buông xuôi". Giữ đúng thể thức 1 đoạn văn duy nhất.',
    coreConcepts: ['chấp nhận khiếm khuyết', 'thấu hiểu bản thân', 'vươn lên', 'không tự ti', 'không buông xuôi'],
    maxScore: 2.0,
    level: 'Cơ bản',
    targetSkill: 'writing_paragraph_200w',
    targetSkillName: 'Viết đoạn văn nghị luận 200 chữ đúng thể thức',
    estimatedMinutes: 30,
    rubricId: 'RUBRIC-PARA-NLXH-20',
    rubric: TEACHER_RUBRIC_PARAGRAPH_NLXH_20,
    examTemplate: 'B',
    status: 'published',
    sourceLabel: 'Đề ngân hàng Giáo viên xuất bản'
  },
  {
    id: 'prompt-3',
    title: 'Sức mạnh của sự thấu cảm trong các mối quan hệ đời sống',
    type: 'nghi_luan_xa_hoi',
    typeName: '2.1. Nghị luận xã hội (Đoạn văn ~200 chữ)',
    sectionType: 'paragraph_200w',
    targetWordCount: 200,
    wordLimit: 'Khoảng 200 chữ (dung lượng 1 đoạn văn)',
    promptText: 'Viết một đoạn văn (khoảng 200 chữ) chia sẻ quan điểm của anh/chị về sức mạnh của sự thấu cảm trong việc hàn gắn những rạn nứt giữa con người với con người hiện nay.',
    focusGuide: 'Giải thích thấu cảm là gì, vì sao xã hội hiện đại dễ thiếu thấu cảm, và bài học hành động cho bản thân.',
    coreConcepts: ['thấu cảm', 'lắng nghe', 'khoan dung', 'kết nối tình người'],
    maxScore: 2.0,
    level: 'Vận dụng cao',
    targetSkill: 'writing_thesis_arguments',
    targetSkillName: 'Xây dựng luận điểm và phản đề sắc bén',
    estimatedMinutes: 30,
    rubricId: 'RUBRIC-PARA-NLXH-20',
    rubric: TEACHER_RUBRIC_PARAGRAPH_NLXH_20,
    examTemplate: 'B',
    status: 'published',
    sourceLabel: 'Đề ngân hàng Giáo viên xuất bản'
  },

  // =========================================================================
  // 2.2. Nghị luận văn học (Đoạn văn ~200 chữ — Thang điểm 2,0)
  // =========================================================================
  {
    id: 'prompt-5',
    title: 'Cảm nhận vẻ đẹp hình tượng thiên nhiên và con người trong đoạn thơ hiện đại',
    type: 'nghi_luan_van_hoc',
    typeName: '2.2. Nghị luận văn học (Đoạn văn ~200 chữ)',
    sectionType: 'paragraph_200w',
    targetWordCount: 200,
    wordLimit: 'Khoảng 200 chữ (dung lượng 1 đoạn văn)',
    promptText: 'Viết một đoạn văn nghị luận (khoảng 200 chữ) phân tích vẻ đẹp kiên cường của hình tượng "những nhành cây vươn ra đón bão" trong đoạn thơ của Nguyễn Khoa Điềm ("Cây không chọn đất để sinh ra / Nhưng cây chọn vươn lên cùng bão gió...").',
    focusGuide: 'Trình bày trọn vẹn trong 1 đoạn văn duy nhất (~200 chữ). Chỉ rõ nghệ thuật ẩn dụ, tương phản và thông điệp nhân sinh sâu sắc.',
    coreConcepts: ['ẩn dụ cây đón bão', 'kiên cường', 'nghệ thuật tương phản', 'giọng điệu suy tư', 'bản lĩnh con người'],
    maxScore: 2.0,
    level: 'Thông hiểu',
    targetSkill: 'writing_paragraph_200w',
    targetSkillName: 'Viết đoạn văn nghị luận văn học 200 chữ (gắn nội dung & nghệ thuật)',
    estimatedMinutes: 30,
    rubricId: 'RUBRIC-PARA-NLVH-20',
    rubric: TEACHER_RUBRIC_PARAGRAPH_NLVH_20,
    examTemplate: 'A',
    status: 'published',
    sourceLabel: 'Đề ngân hàng Giáo viên xuất bản'
  },
  {
    id: 'prompt-6',
    title: 'Phân tích giọng điệu triết lý trữ tình trong tản văn "Khoảng lặng giữa dòng đời hối hả"',
    type: 'nghi_luan_van_hoc',
    typeName: '2.2. Nghị luận văn học (Đoạn văn ~200 chữ)',
    sectionType: 'paragraph_200w',
    targetWordCount: 200,
    wordLimit: 'Khoảng 200 chữ (dung lượng 1 đoạn văn)',
    promptText: 'Viết một đoạn văn nghị luận (khoảng 200 chữ) làm rõ nét đặc sắc về nghệ thuật lập luận và hình ảnh giàu sức gợi trong đoạn trích "Khoảng lặng giữa dòng đời hối hả" của Chu Văn Sơn.',
    focusGuide: 'Tập trung phân tích cách tác giả kết hợp hình ảnh ẩn dụ ("mảnh đất màu mỡ", "gạn đục khơi trong") với giọng văn trầm tĩnh, sâu lắng.',
    coreConcepts: ['giọng điệu triết lý trữ tình', 'hình ảnh ẩn dụ', 'tương phản', 'tản văn Chu Văn Sơn'],
    maxScore: 2.0,
    level: 'Vận dụng',
    targetSkill: 'writing_evidence_analysis',
    targetSkillName: 'Trích dẫn và giải mã tín hiệu thẩm mỹ trong đoạn 200 chữ',
    estimatedMinutes: 30,
    rubricId: 'RUBRIC-PARA-NLVH-20',
    rubric: TEACHER_RUBRIC_PARAGRAPH_NLVH_20,
    examTemplate: 'A',
    status: 'published',
    sourceLabel: 'Đề ngân hàng Giáo viên xuất bản'
  },

  // =========================================================================
  // NHÓM C: BÀI VĂN KHOẢNG 600 CHỮ (THANG ĐIỂM 4,0 — DỰ KIẾN 60 PHÚT)
  // 2.1. Nghị luận xã hội (Bài văn ~600 chữ)
  // =========================================================================
  {
    id: 'prompt-7',
    title: 'Trách nhiệm giữ gìn bản sắc cá nhân và lòng tự trọng trong thế giới số',
    type: 'nghi_luan_xa_hoi',
    typeName: '2.1. Nghị luận xã hội (Bài văn ~600 chữ)',
    sectionType: 'essay_600w',
    targetWordCount: 600,
    wordLimit: 'Bài văn nghị luận (khoảng 600 chữ)',
    promptText: 'Viết một bài văn nghị luận (khoảng 600 chữ) trình bày suy nghĩ của anh/chị về vấn đề: Giữ gìn sự chính trực và bản sắc cá nhân của người trẻ trước áp lực đám đông trên không gian mạng hiện nay.',
    focusGuide: 'Đảm bảo bố cục 3 phần Mở - Thân - Kết (~600 chữ). Triển khai đủ các luận điểm: giải thích sự chính trực/bản sắc, thực trạng tâm lý đám đông, ý nghĩa của lòng tự trọng, dẫn chứng thực tế và phản đề.',
    coreConcepts: ['chính trực', 'bản sắc cá nhân', 'tâm lý đám đông', 'không gian mạng', 'lòng tự trọng', 'bản lĩnh tuổi trẻ'],
    maxScore: 4.0,
    level: 'Vận dụng',
    targetSkill: 'writing_essay_600w',
    targetSkillName: 'Tổ chức bài văn nghị luận xã hội 600 chữ đa chiều',
    estimatedMinutes: 60,
    rubricId: 'RUBRIC-ESSAY-NLXH-40',
    rubric: TEACHER_RUBRIC_ESSAY_NLXH_40,
    examTemplate: 'A',
    status: 'published',
    sourceLabel: 'Đề ngân hàng Giáo viên xuất bản'
  },
  {
    id: 'prompt-8',
    title: 'Khát vọng dấn thân và tạo dựng giá trị bền vững cho cộng đồng',
    type: 'nghi_luan_xa_hoi',
    typeName: '2.1. Nghị luận xã hội (Bài văn ~600 chữ)',
    sectionType: 'essay_600w',
    targetWordCount: 600,
    wordLimit: 'Bài văn nghị luận (khoảng 600 chữ)',
    promptText: 'Từ góc nhìn của người trẻ trước ngưỡng cửa trưởng thành, anh/chị hãy viết một bài văn nghị luận (khoảng 600 chữ) bàn về mối quan hệ giữa việc hoàn thiện năng lực cá nhân và trách nhiệm đóng góp những giá trị bền vững cho cộng đồng.',
    focusGuide: 'Bài văn ~600 chữ cần làm rõ mối quan hệ hai chiều: Phát triển bản thân là nền tảng để cống hiến, và cống hiến cho cộng đồng giúp cá nhân trưởng thành toàn diện.',
    coreConcepts: ['dấn thân', 'hoàn thiện bản thân', 'giá trị bền vững', 'trách nhiệm cộng đồng', 'tuổi trẻ lớp 12'],
    maxScore: 4.0,
    level: 'Vận dụng cao',
    targetSkill: 'writing_thesis_arguments',
    targetSkillName: 'Lập luận biện chứng & phản biện trong bài văn 600 chữ',
    estimatedMinutes: 60,
    rubricId: 'RUBRIC-ESSAY-NLXH-40',
    rubric: TEACHER_RUBRIC_ESSAY_NLXH_40,
    examTemplate: 'A',
    status: 'published',
    sourceLabel: 'Đề ngân hàng Giáo viên xuất bản'
  },

  // =========================================================================
  // 2.2. Nghị luận văn học (Bài văn ~600 chữ — Thang điểm 4,0)
  // =========================================================================
  {
    id: 'prompt-4',
    title: 'Vẻ đẹp của khát vọng cống hiến thầm lặng trong văn học Việt Nam hiện đại',
    type: 'nghi_luan_van_hoc',
    typeName: '2.2. Nghị luận văn học (Bài văn ~600 chữ)',
    sectionType: 'essay_600w',
    targetWordCount: 600,
    wordLimit: 'Bài văn nghị luận (khoảng 600 chữ)',
    promptText: 'Bàn về vẻ đẹp của những con người sống thầm lặng cống hiến cho quê hương, đất nước qua hình tượng nhân vật trong các tác phẩm văn học hiện đại lớp 12 (ví dụ: nhân vật anh thanh niên trong Lặng lẽ Sa Pa, hoặc vẻ đẹp người lính trong Tây Tiến, Đất Nước).',
    focusGuide: 'Cần phân tích cả nội dung tư tưởng (lý tưởng sống cao đẹp, đức hi sinh) lẫn nét đặc sắc nghệ thuật (xây dựng hình tượng, giọng điệu trữ tình sâu lắng).',
    coreConcepts: ['khát vọng cống hiến', 'thầm lặng', 'trách nhiệm', 'nghệ thuật xây dựng nhân vật'],
    maxScore: 4.0,
    level: 'Vận dụng',
    targetSkill: 'writing_essay_600w',
    targetSkillName: 'Phân tích hình tượng & nghệ thuật trong bài văn NLVH 600 chữ',
    estimatedMinutes: 60,
    rubricId: 'RUBRIC-ESSAY-NLVH-40',
    rubric: TEACHER_RUBRIC_ESSAY_NLVH_40,
    examTemplate: 'B',
    status: 'published',
    sourceLabel: 'Đề ngân hàng Giáo viên xuất bản'
  },
  {
    id: 'prompt-9',
    title: 'Chiều sâu nhân đạo và tiếng nói thức tỉnh lương tri trong văn xuôi hiện đại',
    type: 'nghi_luan_van_hoc',
    typeName: '2.2. Nghị luận văn học (Bài văn ~600 chữ)',
    sectionType: 'essay_600w',
    targetWordCount: 600,
    wordLimit: 'Bài văn nghị luận (khoảng 600 chữ)',
    promptText: 'Viết bài văn nghị luận (khoảng 600 chữ) phân tích chiều sâu tư tưởng nhân đạo và nghệ thuật miêu tả tâm lý nhân vật trong một tác phẩm truyện ngắn Việt Nam hiện đại mà anh/chị tâm đắc.',
    focusGuide: 'Tổ chức bài văn 3 phần Mở - Thân - Kết mạch lạc. Làm nổi bật tình huống truyện, diễn biến tâm lý nhân vật và giá trị nhân sinh vượt thời đại.',
    coreConcepts: ['giá trị nhân đạo', 'tâm lý nhân vật', 'tình huống truyện', 'ngôn ngữ trần thuật', 'thức tỉnh lương tri'],
    maxScore: 4.0,
    level: 'Vận dụng cao',
    targetSkill: 'writing_essay_600w',
    targetSkillName: 'Phân tích thi pháp truyện ngắn & chiều sâu tư tưởng (600 chữ)',
    estimatedMinutes: 60,
    rubricId: 'RUBRIC-ESSAY-NLVH-40',
    rubric: TEACHER_RUBRIC_ESSAY_NLVH_40,
    examTemplate: 'B',
    status: 'published',
    sourceLabel: 'Đề ngân hàng Giáo viên xuất bản'
  },
  {
    id: 'prompt-unverified-draft',
    title: '[Dự thảo chờ duyệt] Đề nghị luận chưa gắn Rubric chuẩn của giáo viên',
    type: 'nghi_luan_xa_hoi',
    typeName: '2.1. Nghị luận xã hội (Chưa xác nhận Rubric)',
    sectionType: 'paragraph_200w',
    targetWordCount: 200,
    wordLimit: 'Đoạn văn khoảng 200 chữ',
    promptText: 'Viết đoạn văn khoảng 200 chữ bàn về vai trò của kỷ luật cá nhân.',
    focusGuide: 'Đề dự thảo đang chờ giáo viên kiểm tra và gắn Rubric chuẩn trước khi xuất bản.',
    coreConcepts: ['kỷ luật cá nhân', 'tự giác'],
    maxScore: 2.0,
    level: 'Thông hiểu',
    targetSkill: 'writing_paragraph_200w',
    targetSkillName: 'Viết đoạn văn nghị luận 200 chữ',
    estimatedMinutes: 30,
    rubricId: '',
    rubric: [],
    examTemplate: 'B',
    status: 'pending_teacher_review',
    sourceLabel: 'Chờ giáo viên kiểm tra'
  }
];

