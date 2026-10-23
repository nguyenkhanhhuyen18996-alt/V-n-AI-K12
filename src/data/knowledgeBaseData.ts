import { KnowledgeCard } from '../types';

export const INITIAL_KNOWLEDGE_CARDS: KnowledgeCard[] = [
  // ========================================================
  // NHÓM A: BIỆN PHÁP TU TỪ VÀ KIẾN THỨC TIẾNG VIỆT
  // ========================================================
  {
    id: 'k-an-du',
    title: 'Biện pháp tu từ Ẩn dụ (Ẩn dụ tu từ)',
    category: 'rhetoric',
    categoryName: 'Biện pháp tu từ & Tiếng Việt',
    level: 'thong_hieu',
    levelName: 'Thông hiểu',
    targetSkill: 'reading_rhetoric',
    targetGoal: 'Nhận diện đúng hình ảnh ẩn dụ, phân biệt với hoán dụ, phân tích tác dụng bám sát ngữ cảnh mà không dùng công thức chung chung.',
    summary: 'Ẩn dụ là gọi tên sự vật, hiện tượng này bằng tên sự vật, hiện tượng khác dựa trên quan hệ TƯƠNG ĐỒNG (giống nhau về hình thức, phẩm chất, cách thức hoặc cảm giác). Thực chất là phép so sánh ngầm (đã lược bỏ vế A và từ so sánh).',
    recognitionSigns: [
      'Tìm từ ngữ/hình ảnh có ý nghĩa chuyển nghĩa, gợi liên tưởng đến một đối tượng khác không xuất hiện trực tiếp trong câu.',
      'Xét xem giữa hình ảnh được dùng và đối tượng hàm ý có nét TƯƠNG ĐỒNG nào (hình dáng, màu sắc, giá trị, sự chịu đựng gian khó...).',
      'Công thức so sánh ngầm: Thay vì nói "A như B", tác giả chỉ dùng "B" để biểu thị "A".'
    ],
    distinctionNotes: 'DỄ NHẦM VỚI HOÁN DỤ: Ẩn dụ dựa trên quan hệ TƯƠNG ĐỒNG (giống nhau, dù thuộc hai phạm trù khác nhau). Hoán dụ dựa trên quan hệ TƯƠNG CẬN (gần gũi, đi liền với nhau trong thực tế, như lấy bộ phận chỉ toàn thể, lấy dấu hiệu chỉ người mang dấu hiệu).',
    examples: [
      {
        quote: 'Mặt trời của bắp thì nằm trên đồi / Mặt trời của mẹ, em nằm trên lưng.',
        source: 'Khúc hát ru những em bé lớn trên lưng mẹ – Nguyễn Khoa Điềm',
        analysis: 'Từ "mặt trời" thứ hai là ẩn dụ chỉ đứa con (em cu Tai).',
        contextEffect: 'Tác dụng ngữ cảnh: "Mặt trời của mẹ" thể hiện con là nguồn sống, niềm tin, nguồn ánh sáng sưởi ấm tâm hồn và hy vọng sống của người mẹ Tà-ôi. Thể hiện tình mẫu tử thiêng liêng, nồng ấm hòa quyện cùng tình yêu quê hương đất nước.'
      },
      {
        quote: 'Thuyền về có nhớ bến chăng / Bến thì một dạ khăng khăng đợi thuyền.',
        source: 'Ca dao truyền thống',
        analysis: '"Thuyền" (di chuyển, phiêu bạt) là ẩn dụ cho người con trai; "Bến" (đứng yên, thủy chung) là ẩn dụ cho người con gái đợi chờ.',
        contextEffect: 'Tác dụng ngữ cảnh: Khắc họa kín đáo, tế nhị tấm lòng thủy chung sắt son, bền chặt của người phụ nữ trong tình yêu dù người thương phải bôn ba dặm trường.'
      }
    ],
    commonMistakes: [
      {
        mistake: 'Chỉ nêu công thức sáo rỗng: "Làm câu thơ thêm sinh động, hấp dẫn, giàu cảm xúc" mà không chỉ ra đối tượng và nội dung cụ thể.',
        consequence: 'Bị trừ từ 0.5 đến 0.75 điểm trên barem chấm thi THPT vì thiếu phân tích ngữ cảnh.',
        howToFix: 'Luôn trả lời theo cấu trúc 3 phần: (1) Chỉ rõ từ ngữ ẩn dụ; (2) Giải nghĩa hình ảnh ẩn dụ biểu thị điều gì; (3) Tác dụng biểu đạt tư tưởng, tình cảm của tác giả đối với đối tượng.'
      },
      {
        mistake: 'Nhầm lẫn ẩn dụ với so sánh vì thấy có sự giống nhau.',
        consequence: 'Nhận diện sai tên biện pháp tu từ, mất trọn vẹn điểm câu Nhận biết.',
        howToFix: 'So sánh luôn có từ so sánh (như, là, tựa, tựa hồ...) hoặc ít nhất có cả vế A và vế B. Ẩn dụ đã ẩn vế A đi, chỉ còn vế B.'
      }
    ],
    practiceQuestions: [
      {
        id: 'q-an-du-1',
        level: 'nhan_biet',
        levelName: 'Nhận biết',
        type: 'multiple_choice',
        question: 'Trong câu thơ sau của Viễn Phương: "Ngày ngày mặt trời đi qua trên lăng / Thấy một mặt trời trong lăng rất đỏ", hình ảnh "mặt trời" thứ hai sử dụng biện pháp tu từ nào?',
        options: [
          'A. So sánh',
          'B. Ẩn dụ',
          'C. Hoán dụ',
          'D. Điệp từ đơn thuần'
        ],
        correctOptionIndex: 1,
        expectedKeyPoints: ['Biện pháp ẩn dụ phẩm chất', 'Chỉ Bác Hồ kính yêu'],
        sampleModelAnswer: 'Đáp án đúng: B. Ẩn dụ (Ẩn dụ phẩm chất - Bác Hồ như mặt trời cách mạng mang lại ánh sáng tự do cho dân tộc).',
        detailedExplanation: 'Mặt trời tự nhiên đem lại ánh sáng sự sống cho muôn loài; Bác Hồ đem lại ánh sáng độc lập, ấm no cho dân tộc Việt Nam. Giữa Bác và mặt trời có nét tương đồng về sự vĩ đại và nguồn sống soi đường, nên đây là phép ẩn dụ phẩm chất.',
        pedagogicalScaffold: {
          strengthsHint: 'Nhận diện đúng quan hệ tương đồng giữa đối tượng được ẩn đi và hình ảnh biểu thị.',
          missingWarning: 'Tránh chọn so sánh vì ở đây không có từ nối so sánh (như, là).',
          thinkingStep: 'Tự hỏi: Ở câu thơ thứ hai, tác giả mượn hình ảnh mặt trời để kín đáo ngợi ca ai?'
        }
      },
      {
        id: 'q-an-du-2',
        level: 'thong_hieu',
        levelName: 'Thông hiểu',
        type: 'short_answer',
        question: 'Hãy phân tích tác dụng của biện pháp ẩn dụ "người cầm lái" trong câu văn: "Người thầy giáo trên bục giảng chính là người cầm lái đưa con thuyền tri thức cập bến tương lai."',
        contextPassage: 'Người thầy giáo trên bục giảng chính là người cầm lái đưa con thuyền tri thức cập bến tương lai.',
        expectedKeyPoints: [
          'Chỉ ra từ ngữ ẩn dụ: "người cầm lái", "con thuyền tri thức"',
          'Nội dung: Thể hiện vai trò dẫn dắt, định hướng, vượt qua sóng gió gian nan của người thầy đối với học trò trên hành trình chiếm lĩnh tri thức',
          'Thái độ: Bày tỏ sự tri ân, trân trọng và tôn vinh sứ mệnh cao quý của nhà giáo'
        ],
        sampleModelAnswer: 'Biện pháp ẩn dụ "người cầm lái" đã: (1) Khắc họa người thầy như một hoa tiêu giàu bản lĩnh, trí tuệ, dẫn dắt học sinh vượt qua những thử thách để tiếp cận chân trời học vấn; (2) Tăng tính biểu cảm, làm nổi bật lòng biết ơn và sự tôn vinh đối với sự cống hiến thầm lặng của nghề dạy học.',
        detailedExplanation: 'Khi phân tích tác dụng ẩn dụ, cần chỉ ra: Hình ảnh ẩn dụ gợi liên tưởng tới điều gì trong thực tế? Nó giúp nhấn mạnh phẩm chất hay vai trò gì của nhân vật?',
        pedagogicalScaffold: {
          strengthsHint: 'Đã giải thích được nghĩa của hình ảnh "người cầm lái".',
          missingWarning: 'Cần bổ sung tình cảm/thái độ trân trọng của người viết đối với người thầy.',
          thinkingStep: 'Hình ảnh người cầm lái gợi bạn nhớ tới công việc gì trên sông biển? Áp dụng vào việc dạy học thì có điểm tương đồng nào?'
        }
      }
    ],
    relatedPassageIds: ['passage-1'],
    status: 'published',
    estimatedMinutes: 6,
    author: 'Tổ Chuyên môn Ngữ văn THPT',
    updatedAt: '2026-10-13'
  },

  {
    id: 'k-hoan-du',
    title: 'Biện pháp tu từ Hoán dụ (Phân biệt với Ẩn dụ)',
    category: 'rhetoric',
    categoryName: 'Biện pháp tu từ & Tiếng Việt',
    level: 'thong_hieu',
    levelName: 'Thông hiểu',
    targetSkill: 'reading_rhetoric',
    targetGoal: 'Nhận diện chính xác 4 dạng hoán dụ thường gặp trong đề thi và phân biệt rạch ròi với ẩn dụ.',
    summary: 'Hoán dụ là gọi tên sự vật, hiện tượng này bằng tên sự vật, hiện tượng khác dựa trên quan hệ TƯƠNG CẬN (gần gũi, đi liền với nhau trong thực tế khách quan).',
    recognitionSigns: [
      'Lấy một bộ phận để gọi toàn thể (ví dụ: "chân sút", "bàn tay", "mái đầu").',
      'Lấy vật chứa đựng để gọi vật bị chứa đựng (ví dụ: "cả lớp lắng nghe", "thôn Đoài ngồi nhớ thôn Đông").',
      'Lấy dấu hiệu của sự vật để gọi sự vật (ví dụ: "áo chàm", "áo nâu", "màu cờ đỏ").',
      'Lấy cái cụ thể để gọi cái trừu tượng (ví dụ: "một cây làm chẳng nên non / ba cây chụm lại...").'
    ],
    distinctionNotes: 'BẢNG ĐỐI CHIẾU ẨN DỤ VS HOÁN DỤ:\n• Ẩn dụ: Hai sự vật KHÔNG ĐI CÙNG NHAU ngoài đời, chỉ giống nhau về một nét nghĩa (quan hệ Tương đồng: Mặt trời - Bác Hồ; Thuyền - Người đi xa).\n• Hoán dụ: Hai sự vật CÙNG NẰM TRONG MỘT CHỈ THỂ hoặc gắn bó mật thiết ngoài đời (quan hệ Tương cận: Áo chàm - Đồng bào Việt Bắc thường mặc áo chàm; Bàn tay - Bộ phận của con người lao động).',
    examples: [
      {
        quote: 'Áo chàm đưa buổi phân ly / Cầm tay nhau biết nói gì hôm nay.',
        source: 'Việt Bắc – Tố Hữu',
        analysis: '"Áo chàm" là dấu hiệu trang phục đặc trưng để chỉ người dân Việt Bắc giản dị, son sắt.',
        contextEffect: 'Tác dụng: Khắc họa vẻ đẹp mộc mạc, thủy chung của đồng bào chiến khu; làm câu thơ đậm chất trữ tình và tình nghĩa cách mạng gắn bó keo sơn.'
      },
      {
        quote: 'Bàn tay ta làm nên tất cả / Có sức người sỏi đá cũng thành cơm.',
        source: 'Bài ca vỡ đất – Hoàng Trung Thông',
        analysis: '"Bàn tay" (bộ phận) hoán dụ cho sức lao động cần cù, sáng tạo của con người (toàn thể).',
        contextEffect: 'Tác dụng: Ca ngợi sức mạnh kì diệu của lao động cải tạo thiên nhiên, truyền cảm hứng lạc quan và niềm tin vào tương lai.'
      }
    ],
    commonMistakes: [
      {
        mistake: 'Thấy có hình ảnh chuyển nghĩa là lập tức kết luận là "Ẩn dụ".',
        consequence: 'Sai bản chất biện pháp tu từ, mất trọn 0.5 điểm nhận biết.',
        howToFix: 'Hãy tự hỏi: Chiếc áo chàm và người Việt Bắc có liên hệ gì với nhau? Chiếc áo là thứ người Việt Bắc mặc trên mình (tương cận) chứ không phải người Việt Bắc giống chiếc áo.'
      }
    ],
    practiceQuestions: [
      {
        id: 'q-hoan-du-1',
        level: 'thong_hieu',
        levelName: 'Thông hiểu',
        type: 'multiple_choice',
        question: 'Câu thơ nào sau đây sử dụng biện pháp HOÁN DỤ (lấy bộ phận chỉ toàn thể)?',
        options: [
          'A. Trăng nằm sóng soài trên cành liễu (Hàn Mặc Tử)',
          'B. Đầu xanh có tội tình gì / Má hồng đến quá nửa thì chưa thôi (Nguyễn Du)',
          'C. Thác bao nhiêu thác cũng bừa / Tây Tiến người đi không hẹn nữa (Quang Dũng)',
          'D. Người cha mái tóc bạc / Đốt lửa cho anh nằm (Minh Huệ)'
        ],
        correctOptionIndex: 1,
        expectedKeyPoints: ['"Đầu xanh" chỉ tuổi trẻ, "Má hồng" chỉ người phụ nữ nhan sắc'],
        sampleModelAnswer: 'Đáp án đúng: B. "Đầu xanh" (mái tóc xanh) và "Má hồng" là các bộ phận/dấu hiệu hoán dụ cho tuổi thanh xuân và người phụ nữ hồng nhan mệnh bạc.',
        detailedExplanation: 'Đầu xanh và má hồng là những nét diện mạo gắn liền với người con gái trẻ tuổi thời xưa, thuộc quan hệ tương cận bộ phận - toàn thể.',
        pedagogicalScaffold: {
          strengthsHint: 'Nhận diện đúng dạng hoán dụ lấy bộ phận chỉ toàn thể.',
          missingWarning: 'Câu A là nhân hóa, câu D là ẩn dụ "Người cha" chỉ Bác Hồ.',
          thinkingStep: 'Tìm xem câu nào dùng một chi tiết trên cơ thể để gọi cả một số phận con người.'
        }
      }
    ],
    status: 'published',
    estimatedMinutes: 6,
    author: 'Tổ Chuyên môn Ngữ văn THPT',
    updatedAt: '2026-10-13'
  },

  {
    id: 'k-so-sanh',
    title: 'Biện pháp tu từ So sánh & Cách phân tích tác dụng',
    category: 'rhetoric',
    categoryName: 'Biện pháp tu từ & Tiếng Việt',
    level: 'nhan_biet',
    levelName: 'Nhận biết',
    targetSkill: 'reading_rhetoric',
    targetGoal: 'Nắm chắc mô hình so sánh và cách chỉ ra giá trị gợi hình gợi cảm trong văn cảnh cụ thể.',
    summary: 'So sánh là đối chiếu sự vật, hiện tượng này với sự vật, hiện tượng khác có nét tương đồng để làm tăng sức gợi hình, gợi cảm cho sự diễn đạt.',
    recognitionSigns: [
      'Mô hình đầy đủ: Vế A (sự vật được so sánh) + Phương diện so sánh + Từ so sánh + Vế B (sự vật dùng để so sánh).',
      'Từ so sánh thường gặp: như, là, tựa như, ngỡ như, chẳng khác nào, hơn, kém...',
      'Lưu ý: Có trường hợp lược bỏ từ so sánh hoặc phương diện so sánh (dùng dấu hai chấm hoặc dấu gạch nối).'
    ],
    distinctionNotes: 'Phân biệt so sánh tu từ với so sánh thông thường: So sánh tu từ nhằm mục đích tăng sức gợi hình gợi cảm và tạo liên tưởng thẩm mỹ, không đơn thuần đo đạc kích thước.',
    examples: [
      {
        quote: 'Tiếng suối trong như tiếng hát xa / Trăng lồng cổ thụ bóng lồng hoa.',
        source: 'Cảnh khuya – Hồ Chí Minh',
        analysis: 'Vế A: Tiếng suối (âm thanh tự nhiên); Từ so sánh: "như"; Vế B: Tiếng hát xa (âm thanh con người).',
        contextEffect: 'Tác dụng: Tiếng suối trong trẻo được nhân hóa như tiếng hát con người, khiến không gian chiến khu Việt Bắc đêm khuya trở nên ấm áp hơi ấm sự sống, thể hiện tâm hồn thanh cao, ung dung tự tại của Bác Hồ.'
      }
    ],
    commonMistakes: [
      {
        mistake: 'Chỉ ghi "tác dụng: làm cho sự vật được so sánh đẹp hơn".',
        consequence: 'Câu trả lời thiếu căn cứ, chỉ đạt 0.25/1.0 điểm.',
        howToFix: 'Chỉ rõ: Vế A là gì, vế B gợi lên vẻ đẹp hay tính chất gì, và tâm trạng của tác giả gửi gắm vào đó.'
      }
    ],
    practiceQuestions: [
      {
        id: 'q-ss-1',
        level: 'nhan_biet',
        levelName: 'Nhận biết',
        type: 'multiple_choice',
        question: 'Dấu hiệu nào chắc chắn nhất để phân biệt phép so sánh tu từ với phép ẩn dụ?',
        options: [
          'A. So sánh luôn có vế A và vế B cùng xuất hiện công khai trên văn bản',
          'B. So sánh chỉ dùng trong thơ, không dùng trong văn xuôi',
          'C. So sánh không mang lại giá trị biểu cảm bằng ẩn dụ',
          'D. So sánh dựa trên quan hệ tương cận'
        ],
        correctOptionIndex: 0,
        expectedKeyPoints: ['So sánh có cả 2 vế A và B xuất hiện trực tiếp'],
        sampleModelAnswer: 'Đáp án đúng: A. Trong so sánh, cả hai đối tượng A và B đều được nêu rõ ra văn bản, có thể kèm từ so sánh.',
        detailedExplanation: 'Ẩn dụ bản chất là so sánh ngầm đã giấu đi vế A, chỉ giữ lại vế B. So sánh công khai cả A và B.',
        pedagogicalScaffold: {
          strengthsHint: 'Nhớ lại định nghĩa so sánh ngầm của ẩn dụ.',
          missingWarning: 'Không nhầm lẫn với quan hệ tương cận của hoán dụ.',
          thinkingStep: 'Xem vế A có hiện diện rõ ràng trên mặt chữ hay không.'
        }
      }
    ],
    status: 'published',
    estimatedMinutes: 5,
    author: 'Tổ Chuyên môn Ngữ văn THPT',
    updatedAt: '2026-10-13'
  },

  {
    id: 'k-diep-ngu',
    title: 'Điệp từ, Điệp ngữ & Điệp cấu trúc cú pháp',
    category: 'rhetoric',
    categoryName: 'Biện pháp tu từ & Tiếng Việt',
    level: 'thong_hieu',
    levelName: 'Thông hiểu',
    targetSkill: 'reading_rhetoric',
    targetGoal: 'Phân tích trúng hiệu quả nhịp điệu, nhấn mạnh cảm xúc và tầng nghĩa của phép điệp trong thơ và văn xuôi nghị luận.',
    summary: 'Điệp từ ngữ/cấu trúc là việc lặp đi lặp lại một từ, cụm từ hoặc một mô hình câu nhiều lần nhằm nhấn mạnh ý nghĩa, khắc sâu cảm xúc và tạo nhịp điệu dồn dập, ngân vang cho câu văn/câu thơ.',
    recognitionSigns: [
      'Điệp từ/ngữ cách quãng: Từ ngữ được lặp lại ở đầu các câu hoặc rải rác trong đoạn.',
      'Điệp nối tiếp: Từ ngữ lặp lại liền kề nhau để tạo sức ép cảm xúc.',
      'Điệp vòng tròn (điệp ngắt bậc): Từ ngữ cuối câu trước lặp lại ở đầu câu sau.',
      'Điệp cấu trúc: Cùng một khuôn mẫu ngữ pháp (chủ - vị, cặp quan hệ từ) lặp lại ở nhiều dòng liên tiếp.'
    ],
    distinctionNotes: 'Phân biệt phép điệp tu từ với lỗi lặp từ: Điệp tu từ có chủ đích nghệ thuật nhằm tạo nhạc tính và nhấn mạnh nội dung; lỗi lặp từ là sự vụng về do nghèo nàn vốn từ gây cảm giác luộm thuộm.',
    examples: [
      {
        quote: 'Dốc lên khúc khuỷu dốc thăm thẳm / Heo hút cồn mây súng ngửi trời / Ngàn thước lên cao, ngàn thước xuống.',
        source: 'Tây Tiến – Quang Dũng',
        analysis: 'Điệp từ "dốc" kết hợp với điệp cấu trúc "ngàn thước lên cao, ngàn thước xuống".',
        contextEffect: 'Tác dụng: Tái hiện sự trùng điệp, hiểm trở đến rợn ngợp của địa hình miền Tây Bắc, đồng thời làm nổi bật tư thế hiên ngang vượt khó phi thường của người lính Tây Tiến.'
      }
    ],
    commonMistakes: [
      {
        mistake: 'Chỉ nói "tác dụng tạo nhịp điệu" mà quên mất nội dung/cảm xúc nào được nhấn mạnh.',
        consequence: 'Mất điểm phần tác dụng tư tưởng, chỉ được tối đa nửa số điểm.',
        howToFix: 'Luôn trả lời: Nhấn mạnh điều gì (nội dung) + Tạo nhịp điệu như thế nào (dồn dập, tha thiết hay chậm rãi) + Bộc lộ cảm xúc gì.'
      }
    ],
    practiceQuestions: [
      {
        id: 'q-diep-1',
        level: 'thong_hieu',
        levelName: 'Thông hiểu',
        type: 'short_answer',
        question: 'Chỉ ra và nêu ngắn gọn tác dụng của phép điệp trong câu: "Lòng yêu nước bắt đầu từ lòng yêu những vật tầm thường nhất: yêu cái cây trồng ở trước nhà, yêu cái phố nhỏ đổ ra bờ sông, yêu vị thơm chua mát của trái lê mùa thu..." (I-li-a Ê-ren-bua)',
        expectedKeyPoints: [
          'Chỉ ra từ ngữ điệp: lặp lại từ "yêu" (3 lần)',
          'Nhấn mạnh cội nguồn bình dị, gần gũi nhưng chân thành và sâu sắc của lòng yêu nước',
          'Tạo giọng điệu tha thiết, truyền cảm hứng và tính thuyết phục cho lập luận'
        ],
        sampleModelAnswer: 'Phép điệp từ "yêu" lặp lại 3 lần gắn với những hình ảnh bình dị (cái cây, phố nhỏ, vị thơm của trái lê) đã: (1) Khắc sâu chân lý lòng yêu nước bắt nguồn từ những tình cảm gắn bó dung dị đời thường nhất; (2) Tạo nhịp điệu dồn dập, tha thiết, thấm sâu vào tâm trí người đọc.',
        detailedExplanation: 'Điệp từ kết hợp với phép liệt kê tăng tiến giúp bài nghị luận đạt sức lay động cảm xúc lớn.',
        pedagogicalScaffold: {
          strengthsHint: 'Xác định đúng từ "yêu" được lặp lại.',
          missingWarning: 'Cần phân tích các hình ảnh đi kèm để thấy được ý đồ tác giả.',
          thinkingStep: 'Nếu bỏ đi 3 chữ "yêu" và viết thành một câu đơn thì cảm xúc câu văn sẽ giảm đi như thế nào?'
        }
      }
    ],
    status: 'published',
    estimatedMinutes: 5,
    author: 'Tổ Chuyên môn Ngữ văn THPT',
    updatedAt: '2026-10-13'
  },

  {
    id: 'k-liet-ke-dao-ngu-cau-hoi-tu-tu',
    title: 'Liệt kê, Đảo ngữ, Câu hỏi tu từ & Phép đối',
    category: 'rhetoric',
    categoryName: 'Biện pháp tu từ & Tiếng Việt',
    level: 'thong_hieu',
    levelName: 'Thông hiểu',
    targetSkill: 'reading_rhetoric',
    targetGoal: 'Phân tích trọn vẹn nhóm biện pháp tu từ cú pháp thường gặp trong đề thi tốt nghiệp THPT.',
    summary: 'Nhóm biện pháp tu từ cú pháp can thiệp vào trật tự câu, kết cấu liệt kê, câu nghi vấn hoặc thế cân xứng để tạo ấn tượng mạnh mẽ về hình ảnh và lập luận.',
    recognitionSigns: [
      'Liệt kê: Sắp xếp nối tiếp hàng loạt từ, cụm từ cùng loại để diễn tả đầy đủ, sâu sắc các khía cạnh (có liệt kê tăng tiến, liệt kê theo cặp).',
      'Đảo ngữ: Đảo trật tự ngữ pháp thông thường (đưa vị ngữ lên trước chủ ngữ, tính từ/động từ lên trước danh từ) nhằm nhấn mạnh đặc điểm hoặc trạng thái.',
      'Câu hỏi tu từ: Câu mang hình thức nghi vấn nhưng không nhằm tìm kiếm câu trả lời mà để khẳng định, phủ định hoặc bộc lộ nỗi niềm băn khoăn trăn trở.',
      'Phép đối: Đặt hai vế câu có sự cân xứng về số lượng từ, từ loại, thanh điệu (bằng/trắc) và ý nghĩa (đối thuận hoặc đối nghịch).'
    ],
    distinctionNotes: 'Lưu ý Câu hỏi tu từ: Dấu chấm hỏi cuối câu chỉ là hình thức ngữ pháp; về bản chất chức năng, câu hỏi tu từ là một lời khẳng định đầy cảm xúc hoặc lời thức tỉnh lương tâm người đọc.',
    examples: [
      {
        quote: 'Lom khom dưới núi tiều vài chú / Lác đác bên sông chợ mấy nhà.',
        source: 'Qua Đèo Ngang – Bà Huyện Thanh Quan',
        analysis: 'Đảo ngữ: Đưa từ láy gợi hình "Lom khom", "Lác đác" lên đầu mỗi câu thơ.',
        contextEffect: 'Tác dụng: Nhấn mạnh sự nhỏ bé, thưa thớt, vắng vẻ của sự sống con người giữa không gian đèo Ngang mênh mông, qua đó làm nổi bật tâm trạng cô đơn, hoài cổ của tác giả.'
      },
      {
        quote: 'Ai chiến thắng mà không hề chiến bại? / Ai nên khôn mà chẳng dại đôi lần?',
        source: 'Dậy mà đi – Tố Hữu',
        analysis: 'Câu hỏi tu từ khẳng định một quy luật tất yếu của sự trưởng thành.',
        contextEffect: 'Tác dụng: Khẳng định thất bại là bài học quý giá trên đường đời, tạo giọng điệu đanh thép, động viên con người dũng cảm đứng lên sau vấp ngã.'
      }
    ],
    commonMistakes: [
      {
        mistake: 'Xem câu hỏi tu từ là tác giả đang chưa biết và cần người đọc trả lời.',
        consequence: 'Hiểu sai hoàn toàn mục đích giao tiếp của văn bản nghị luận.',
        howToFix: 'Biến câu hỏi tu từ thành câu khẳng định tương đương để thấy ý đồ tác giả.'
      }
    ],
    practiceQuestions: [
      {
        id: 'q-cu-phap-1',
        level: 'nhan_biet',
        levelName: 'Nhận biết',
        type: 'multiple_choice',
        question: 'Câu thơ "Lơ thơ cồn nhỏ gió đìu hiu / Đâu tiếng làng xa vãn chợ chiều" (Huy Cận) sử dụng biện pháp tu từ cú pháp nào nổi bật ở dòng 1?',
        options: [
          'A. Nói giảm nói tránh',
          'B. Đảo ngữ kết hợp từ láy gợi cảm',
          'C. Hoán dụ lấy vật chứa đựng',
          'D. Điệp cấu trúc cú pháp'
        ],
        correctOptionIndex: 1,
        expectedKeyPoints: ['Đảo ngữ: "Lơ thơ" được đảo lên đầu câu'],
        sampleModelAnswer: 'Đáp án đúng: B. Đảo ngữ kết hợp từ láy "Lơ thơ" đưa lên đầu câu nhằm nhấn mạnh sự vắng vẻ, hiu hắt của cảnh sông nước Tràng Giang.',
        detailedExplanation: 'Trật tự thông thường là "Cồn nhỏ lơ thơ, gió đìu hiu". Tác giả đảo "Lơ thơ" lên trước để gây ấn tượng mạnh về cái thưa thớt, tiêu điều.',
        pedagogicalScaffold: {
          strengthsHint: 'Nhận diện được vị ngữ tính từ bị đảo lên trước chủ ngữ.',
          missingWarning: 'Chú ý trật tự từ nguyên thủy của câu tiếng Việt.',
          thinkingStep: 'Thử đổi vị trí các từ về trật tự tự nhiên để nhận ra từ nào bị đảo lên đầu.'
        }
      }
    ],
    status: 'published',
    estimatedMinutes: 7,
    author: 'Tổ Chuyên môn Ngữ văn THPT',
    updatedAt: '2026-10-13'
  },

  // ========================================================
  // NHÓM B: PHƯƠNG PHÁP LÀM ĐỌC HIỂU
  // ========================================================
  {
    id: 'k-doc-hieu-quy-trinh',
    title: 'Quy trình giải quyết 4 mức độ câu hỏi Đọc hiểu (3.0 - 4.0đ)',
    category: 'reading_method',
    categoryName: 'Phương pháp Đọc hiểu',
    level: 'thong_hieu',
    levelName: 'Thông hiểu',
    targetSkill: 'reading_main_idea',
    targetGoal: 'Nắm chắc phương pháp phân bổ điểm và kỹ thuật trả lời trúng - đủ - bám sát ngữ liệu cho từng mức độ.',
    summary: 'Phần Đọc hiểu thi tốt nghiệp THPT gồm 4 câu hỏi phân hóa theo 4 mức độ: Nhận biết (0.5 - 0.75đ), Thông hiểu (0.75 - 1.0đ), Vận dụng thấp (0.75 - 1.0đ), Vận dụng cao (0.75 - 1.0đ). Học sinh cần bám sát văn bản, tuyệt đối không bịa đặt dẫn chứng ngoài văn bản.',
    recognitionSigns: [
      'Câu 1 (Nhận biết): Lệnh hỏi thường là "Theo văn bản...", "Chỉ ra những chi tiết/từ ngữ...", "Xác định thể thơ/phương thức biểu đạt...". CÂU TRẢ LỜI CÓ SẴN TRONG VĂN BẢN.',
      'Câu 2 (Thông hiểu): Lệnh hỏi thường là "Anh/chị hiểu như thế nào về câu nói...", "Phân tích tác dụng của biện pháp tu từ...". CẦN LÍ GIẢI NGHĨA ĐEN & NGHĨA BÓNG.',
      'Câu 3 (Vận dụng): Lệnh hỏi thường là "Nhận xét về thái độ/tình cảm của tác giả...", "Rút ra bài học/thông điệp có ý nghĩa nhất...". PHẢI CÓ LÍ LẼ VÀ CĂN CỨ TỪ NGỮ LIỆU.',
      'Câu 4 (Vận dụng cao): Lệnh hỏi thường là "Anh/chị có đồng tình với quan điểm... Vì sao?". BẮT BUỘC NÊU RÕ QUAN ĐIỂM (Đồng tình/Không đồng tình/Đồng tình một phần) + TỐI THIỂU 2 LÍ LẼ THUYẾT PHỤC.'
    ],
    distinctionNotes: 'PHÂN BIỆT THEO THỂ LOẠI VĂN BẢN:\n• Văn bản văn học (Thơ, Tản văn, Truyện ngắn): Chú trọng ngôn ngữ hình tượng, cảm xúc nhân vật trữ tình, thông điệp nhân văn.\n• Văn bản nghị luận: Chú trọng luận đề, luận điểm, tính logic của lập luận và thái độ người viết.\n• Văn bản thông tin: Chú trọng tính xác thực của dữ liệu, số liệu, mục đích truyền tải thông tin của người viết.',
    examples: [
      {
        quote: 'Câu hỏi: Anh/chị có đồng tình với ý kiến: "Thất bại là người thầy nghiêm khắc nhất nhưng tận tâm nhất" không? Vì sao?',
        source: 'Đề thi minh họa tốt nghiệp THPT',
        analysis: 'Dạng câu hỏi Vận dụng cao yêu cầu bày tỏ chính kiến và lập luận độc lập.',
        contextEffect: 'Mẫu câu trả lời đạt điểm tối đa:\n- Nêu rõ quan điểm: "Tôi hoàn toàn đồng tình với ý kiến trên." (0.25đ)\n- Lí lẽ 1: "Bởi vì thất bại chỉ ra cho ta thấy những thiếu sót, lỗ hổng về kiến thức, kỹ năng hoặc chiến lược mà khi thành công ta thường bỏ qua." (0.5đ)\n- Lí lẽ 2: "Nó tôi luyện cho con người ý chí kiên cường, bản lĩnh dám đối mặt với nghịch cảnh để trưởng thành vững vàng hơn." (0.25đ)'
      }
    ],
    commonMistakes: [
      {
        mistake: 'Chép nguyên cả một đoạn dài trong văn bản vào câu Nhận biết mà không chắt lọc từ khóa.',
        consequence: 'Giám khảo đánh giá học sinh không nắm được bản chất, chỉ đạt nửa số điểm.',
        howToFix: 'Gạch chân từ khóa cần tìm, dùng gạch đầu dòng rõ ràng: "Theo tác giả, các chi tiết là: - ...; - ..."'
      },
      {
        mistake: 'Câu Vận dụng cao quên không khẳng định "Đồng tình" hay "Không đồng tình" mà nhảy ngay vào phân tích.',
        consequence: 'Mất ngay 0.25 điểm khẳng định lập trường trong barem chấm thi chính thức.',
        howToFix: 'Luôn mở đầu bằng câu ngắn gọn: "Tôi đồng tình / không đồng tình với quan điểm trên vì các lí do sau:"'
      }
    ],
    practiceQuestions: [
      {
        id: 'q-dh-1',
        level: 'van_dung_cao',
        levelName: 'Vận dụng cao',
        type: 'short_answer',
        question: 'Khi gặp câu hỏi: "Anh/chị hãy rút ra thông điệp có ý nghĩa sâu sắc nhất đối với bản thân từ đoạn trích", câu trả lời cần có những yếu tố cốt lõi nào để đạt trọn vẹn điểm?',
        expectedKeyPoints: [
          'Gọi tên chính xác 01 thông điệp cụ thể (không lan man nhiều thông điệp)',
          'Giải thích vì sao thông điệp đó có ý nghĩa (gắn với thực tế đời sống hoặc bản thân học sinh lớp 12)',
          'Liên hệ hành động thiết thực của bản thân'
        ],
        sampleModelAnswer: 'Cần có 3 phần: (1) Nêu rõ thông điệp tâm đắc nhất; (2) Lí giải tại sao thông điệp đó có ý nghĩa lớn đối với cuộc sống hiện nay; (3) Nêu hành động cụ thể mà bản thân sẽ thực hiện để áp dụng thông điệp đó vào thực tiễn.',
        detailedExplanation: 'Barem chấm điểm luôn chia nhỏ: 0.25đ cho việc nêu thông điệp và 0.5-0.75đ cho phần lí giải căn cứ và bài học hành động.',
        pedagogicalScaffold: {
          strengthsHint: 'Nhớ giới hạn chỉ chọn 01 thông điệp đắt giá nhất.',
          missingWarning: 'Tránh liệt kê 3-4 thông điệp nhưng không có phần lí giải sâu sắc.',
          thinkingStep: 'Đặt câu hỏi: Thông điệp này giúp thay đổi nhận thức và hành vi của tôi như thế nào?'
        }
      }
    ],
    relatedPassageIds: ['passage-1'],
    status: 'published',
    estimatedMinutes: 8,
    author: 'Tổ Chuyên môn Ngữ văn THPT',
    updatedAt: '2026-10-13'
  },

  // ========================================================
  // NHÓM C: PHƯƠNG PHÁP VIẾT ĐOẠN VĂN KHOẢNG 200 CHỮ
  // ========================================================
  {
    id: 'k-doan-200-chu',
    title: 'Kỹ thuật viết Đoạn văn Nghị luận Xã hội khoảng 200 chữ (2.0đ)',
    category: 'paragraph_200w',
    categoryName: 'Phương pháp viết đoạn 200 chữ',
    level: 'van_dung',
    levelName: 'Vận dụng',
    targetSkill: 'writing_paragraph_200w',
    targetGoal: 'Nắm vững quy tắc hình thức đoạn đơn, cấu trúc lập luận 5 bước và kỹ thuật đưa dẫn chứng sắc sảo đạt 2.0/2.0 điểm.',
    summary: 'Đoạn văn 200 chữ yêu cầu giải quyết MỘT KHÍA CẠNH của vấn đề (ví dụ: ý nghĩa, tác hại, giải pháp, hoặc trách nhiệm), không viết như một bài văn thu nhỏ. Dung lượng chuẩn: khoảng 200 chữ (tương đương 20 - 25 dòng viết tay), tuyệt đối viết thành MỘT ĐOẠN ĐƠN duy nhất.',
    recognitionSigns: [
      'Bước 1 - Mở đoạn (1-2 câu): Dẫn dắt và nêu đúng vấn đề cần nghị luận (Ghi điểm đúng yêu cầu đề).',
      'Bước 2 - Giải thích ngắn (1-2 câu): Làm rõ từ khóa cốt lõi (Không sa đà giải thích dài dòng).',
      'Bước 3 - Bàn luận trọng tâm (6-8 câu): Tập trung trả lời câu hỏi: Vì sao? Ý nghĩa là gì? Có vai trò gì đối với cá nhân và cộng đồng?',
      'Bước 4 - Dẫn chứng thực tế tiêu biểu (2-3 câu): Đưa 01 dẫn chứng xác thực, thời sự, phân tích ngắn gọn gắn với luận điểm.',
      'Bước 5 - Mở rộng phản đề & Bài học nhận thức, hành động (2-3 câu): Phê phán hiện tượng lệch lạc, rút ra bài học cho bản thân.'
    ],
    distinctionNotes: 'LỖI TỬ HUYỆT VỀ HÌNH THỨC: Tuyệt đối KHÔNG ĐƯỢC XUỐNG DÒNG. Nếu xuống dòng tạo thành 2 đoạn, giám khảo sẽ trừ 0.25 - 0.5 điểm tiêu chí "Đảm bảo yêu cầu về hình thức đoạn văn".',
    examples: [
      {
        quote: 'Đề bài: Viết một đoạn văn khoảng 200 chữ trình bày suy nghĩ của anh/chị về sự cần thiết của việc vượt qua vùng an toàn đối với người trẻ.',
        source: 'Đề thi thử THPT Quốc gia',
        analysis: 'Yêu cầu trọng tâm: "Sự cần thiết" (tức là ý nghĩa/tầm quan trọng), không dàn trải sang biểu hiện hay nguồn gốc.',
        contextEffect: 'Dẫn chứng sắc bén mẫu: "Hình ảnh vận động viên Nguyễn Thị Oanh dù đối mặt với lịch thi đấu khắc nghiệt vẫn kiên cường bứt phá để giành 4 tấm huy chương vàng SEA Games chính là minh chứng sống động cho sức mạnh của việc dũng cảm bước qua giới hạn bản thân, biến khó khăn thành bệ phóng vươn tới vinh quang."'
      }
    ],
    commonMistakes: [
      {
        mistake: 'Viết thành bài văn thu nhỏ có đầy đủ mở bài, thân bài (chia nhiều đoạn), kết bài.',
        consequence: 'Bị trừ điểm hình thức và dung lượng quá tải, thiếu thời gian cho câu 4.0 điểm.',
        howToFix: 'Viết liên tục từ chữ đầu tiên lùi đầu dòng cho đến dấu chấm kết thúc đoạn.'
      },
      {
        mistake: 'Dẫn chứng sáo rỗng, quá quen thuộc (như Edison thất bại 10.000 lần, Bác Hồ ra đi tìm đường cứu nước) mà không có phân tích mới mẻ.',
        consequence: 'Mất điểm sáng tạo và chiều sâu lập luận.',
        howToFix: 'Ưu tiên những tấm gương thế hệ trẻ đương đại, những câu chuyện truyền cảm hứng thời sự hoặc hành động giản dị có thật.'
      }
    ],
    practiceQuestions: [
      {
        id: 'q-doan-1',
        level: 'thong_hieu',
        levelName: 'Thông hiểu',
        type: 'multiple_choice',
        question: 'Theo cấu trúc barem điểm chấm thi tốt nghiệp THPT, lỗi nào sau đây ở phần Đoạn văn 200 chữ sẽ bị trừ điểm trực tiếp về hình thức?',
        options: [
          'A. Sử dụng nhiều hơn 01 dẫn chứng thực tế',
          'B. Xuống dòng tách bài làm thành 2 hoặc 3 đoạn riêng biệt',
          'C. Sử dụng câu ghép phức hợp trong bài',
          'D. Viết khoảng 230 chữ'
        ],
        correctOptionIndex: 1,
        expectedKeyPoints: ['Xuống dòng vi phạm quy chuẩn đoạn văn đơn'],
        sampleModelAnswer: 'Đáp án đúng: B. Quy chế chấm thi THPT quy định rõ đoạn văn phải được viết liền mạch, lùi đầu dòng và chấm hết đoạn. Tách đoạn bị coi là sai quy cách thể thức đoạn văn.',
        detailedExplanation: 'Đoạn văn được định nghĩa là đơn vị ngữ pháp bắt đầu từ chữ viết hoa lùi đầu dòng và kết thúc bằng dấu chấm xuống dòng. Nếu xuống dòng giữa chừng, học sinh đã viết thành nhiều đoạn.',
        pedagogicalScaffold: {
          strengthsHint: 'Nhớ kỹ quy chuẩn hình thức đoạn văn của Bộ Giáo dục & Đào tạo.',
          missingWarning: 'Dung lượng dao động 180-230 chữ vẫn được chấp nhận.',
          thinkingStep: 'Hình thức đoạn văn chuẩn chỉ có duy nhất 1 lần lùi đầu dòng.'
        }
      }
    ],
    relatedPromptIds: ['nlxh-1', 'nlxh-3'],
    rubricCriterionLink: 'Đáp ứng yêu cầu hình thức và dung lượng đoạn văn',
    status: 'published',
    estimatedMinutes: 8,
    author: 'Tổ Chuyên môn Ngữ văn THPT',
    updatedAt: '2026-10-13'
  },

  // ========================================================
  // NHÓM D: PHƯƠNG PHÁP VIẾT BÀI VĂN KHOẢNG 600 CHỮ
  // ========================================================
  {
    id: 'k-bai-van-600-chu',
    title: 'Chiến lược viết Bài văn Nghị luận (Văn học & Xã hội) khoảng 600 chữ (4.0đ)',
    category: 'essay_600w',
    categoryName: 'Phương pháp viết bài văn 600 chữ',
    level: 'van_dung_cao',
    levelName: 'Vận dụng cao',
    targetSkill: 'writing_essay_600w',
    targetGoal: 'Xây dựng hệ thống luận điểm sắc bén, liên kết đoạn uyển chuyển và đạt trọn vẹn điểm sáng tạo theo barem 4.0 điểm.',
    summary: 'Bài văn khoảng 600 chữ là câu hỏi chiếm trọng số cao nhất (4.0 điểm). Đòi hỏi học sinh có cấu trúc 3 phần hoàn chỉnh (Mở bài, Thân bài, Kết bài), biết tách đoạn mạch lạc theo từng luận điểm và kết hợp nhuần nhuyễn giữa lí lẽ với dẫn chứng.',
    recognitionSigns: [
      '1. Mở bài (1 đoạn, ~40-60 chữ): Dẫn dắt gợi mở, nêu tác giả, tác phẩm/luận đề và trích dẫn vấn đề trọng tâm.',
      '2. Thân bài (tối thiểu 3-4 đoạn, ~450-500 chữ):\n   • Đoạn khái quát: Hoàn cảnh sáng tác, vị trí đoạn trích hoặc bối cảnh xã hội.\n   • Các đoạn luận điểm trọng tâm: Mỗi luận điểm là một đoạn văn riêng biệt có câu chủ đề, lí lẽ, dẫn chứng và bình luận nghệ thuật.\n   • Đoạn đánh giá/nâng cao: Đánh giá nét đặc sắc về nội dung, phong cách nghệ thuật, giá trị nhân đạo hoặc liên hệ mở rộng.',
      '3. Kết bài (1 đoạn, ~40-60 chữ): Khẳng định lại giá trị tác phẩm/ý nghĩa vấn đề và đọng lại dư ba trong lòng người đọc.'
    ],
    distinctionNotes: 'KHÔNG BIẾN BÀI VĂN THÀNH BÀI DIỄN XUÔI THƠ HOẶC KỂ LẠI CỐT TRUYỆN: Cần có thao tác phân tích thi pháp (từ ngữ, hình ảnh, nhịp điệu, nghệ thuật trần thuật) thay vì chỉ tóm tắt nội dung.',
    examples: [
      {
        quote: 'Yêu cầu mở bài ấn tượng cho bài văn phân tích vẻ đẹp thiên nhiên miền Tây trong bài thơ Tây Tiến:',
        source: 'Ngữ văn 12 - Chương trình mới',
        analysis: 'Kỹ thuật mở bài gián tiếp đi từ thi đề hoặc cảm hứng lãng mạn.',
        contextEffect: 'Đoạn mở bài mẫu tham khảo: "Chiến tranh đã lùi xa vào dĩ vãng, nhưng tượng đài bất tử về người lính Tây Tiến vẫn sừng sững tạc vào dòng chảy thi ca dân tộc. Bằng ngòi bút tài hoa và hồn thơ lãng mạn, Quang Dũng không chỉ tái hiện một thời hoa lửa bi tráng mà còn vẽ nên bức tranh thiên nhiên Tây Bắc vừa hùng vĩ, hiểm trở, vừa thấm đượm chất thơ thơ mộng, trữ tình qua những dòng thơ kiệt tác..."'
      }
    ],
    commonMistakes: [
      {
        mistake: 'Thân bài viết thành một khối chữ dính liền không tách đoạn.',
        consequence: 'Giám khảo rất khó theo dõi mạch luận điểm, mất điểm tiêu chí Bố cục mạch lạc.',
        howToFix: 'Mỗi luận điểm bắt buộc xuống dòng thành một đoạn văn mới có từ nối chuyển mạch.'
      },
      {
        mistake: 'Chỉ phân tích nội dung mà hoàn toàn bỏ qua nghệ thuật (nhịp điệu, biện pháp tu từ, giọng điệu).',
        consequence: 'Mất từ 0.75 đến 1.0 điểm tiêu chí nghệ thuật trong barem thi THPT.',
        howToFix: 'Luôn đan cài nhận xét nghệ thuật đi liền với nội dung: "Bằng việc sử dụng thành công nghệ thuật... tác giả đã làm nổi bật..."'
      }
    ],
    practiceQuestions: [
      {
        id: 'q-bv-1',
        level: 'thong_hieu',
        levelName: 'Thông hiểu',
        type: 'multiple_choice',
        question: 'Trong cấu trúc bài văn nghị luận văn học 600 chữ, đoạn văn nào sau đây đóng vai trò tạo nên "điểm sáng tạo và chiều sâu" để bứt phá điểm 3.5 - 4.0?',
        options: [
          'A. Đoạn chép lại toàn bộ bài thơ ở phần mở bài',
          'B. Đoạn đánh giá nâng cao về đặc sắc nghệ thuật, phong cách tác giả và thông điệp tư tưởng',
          'C. Đoạn tóm tắt tiểu sử năm sinh năm mất của tác giả',
          'D. Đoạn kể lại chi tiết cuộc đời cá nhân của học sinh'
        ],
        correctOptionIndex: 1,
        expectedKeyPoints: ['Đoạn đánh giá nâng cao nghệ thuật và phong cách'],
        sampleModelAnswer: 'Đáp án đúng: B. Đoạn đánh giá nâng cao tổng kết nét đặc sắc nghệ thuật, dấu ấn phong cách tác giả và chiều sâu tư tưởng là tiêu chí then chốt để giám khảo chấm điểm giỏi (sáng tạo).',
        detailedExplanation: 'Học sinh trung bình chỉ dừng lại ở phân tích bề nổi, học sinh giỏi luôn có đoạn đánh giá thi pháp và đóng góp của tác phẩm vào nền văn học.',
        pedagogicalScaffold: {
          strengthsHint: 'Nhận diện đúng vị trí tạo điểm nhấn phân hóa học sinh giỏi.',
          missingWarning: 'Tránh sa đà vào tiểu sử tác giả vì không nằm trong barem chấm điểm chính.',
          thinkingStep: 'Barem điểm sáng tạo thường dành cho việc đánh giá phong cách và liên hệ mở rộng.'
        }
      }
    ],
    relatedPromptIds: ['nlvh-1'],
    rubricCriterionLink: 'Tổ chức bài viết và chiều sâu luận điểm',
    status: 'published',
    estimatedMinutes: 8,
    author: 'Tổ Chuyên môn Ngữ văn THPT',
    updatedAt: '2026-10-13'
  },

  // ========================================================
  // NHÓM E: KĨ NĂNG LÀM BÀI THI VÀ QUẢN LÍ THỜI GIAN
  // ========================================================
  {
    id: 'k-quan-li-thoi-gian',
    title: 'Chiến thuật phân bổ 120 phút & Quy trình 5 phút vàng phòng thi',
    category: 'exam_skills',
    categoryName: 'Kĩ năng phòng thi & Thời gian',
    level: 'van_dung',
    levelName: 'Vận dụng',
    targetSkill: 'writing_expression_spelling',
    targetGoal: 'Kiểm soát nhịp độ làm bài thi tốt nghiệp THPT, tuyệt đối không bị cháy giáo án hoặc bỏ sót câu hỏi.',
    summary: 'Bài thi môn Ngữ văn có thời gian 120 phút. Thất bại phổ biến nhất của học sinh không phải vì không biết làm mà vì mất quá nhiều thời gian cho phần Đọc hiểu dẫn đến bài văn 600 chữ bị cụt hoặc sơ sài.',
    recognitionSigns: [
      'Khung phân bổ thời gian lý tưởng 120 phút:\n• 05 phút đầu: Đọc lướt toàn bộ đề, dùng bút chì gạch chân từ khóa then chốt của từng câu.\n• 20 - 25 phút: Hoàn thành trọn vẹn 4 câu Đọc hiểu (ngắn gọn, trúng ý, không lan man).\n• 20 - 25 phút: Viết hoàn chỉnh Đoạn văn nghị luận xã hội khoảng 200 chữ.\n• 65 - 70 phút: Tập trung tối đa cho Bài văn nghị luận 600 chữ (5 phút lập dàn ý ngắn, 55 phút viết, 5 phút nâng cao).\n• 05 phút cuối: "5 PHÚT VÀNG PHÒNG THI" để dò lại toàn bộ bài thi.'
    ],
    distinctionNotes: 'LƯU Ý TRONG CHẾ ĐỘ THI THỬ VĂNAI 12: Bộ đếm thời gian của bài thi độc lập hoàn toàn với việc bạn tra cứu kiến thức trong thư viện. Tuy nhiên khi thi thật, hãy rèn luyện phản xạ không tra tài liệu để đúng với áp lực phòng thi.',
    examples: [
      {
        quote: 'Quy trình "5 PHÚT VÀNG" kiểm tra trước khi nộp bài:',
        source: 'Kinh nghiệm Thủ khoa Ngữ văn THPT Quốc gia',
        analysis: 'Checklist rà soát nhanh 4 hạng mục tử huyệt:',
        contextEffect: '1. Kiểm tra mã đề, số báo danh và thứ tự các câu (tránh làm thiếu câu 3, câu 4 đọc hiểu).\n2. Kiểm tra đoạn văn 200 chữ có bị xuống dòng nhầm không.\n3. Rà soát chính tả, dấu câu, đặc biệt là tên riêng của tác giả và nhân vật.\n4. Đọc lại mở bài và kết bài để đảm bảo tính nhất quán của tư tưởng.'
      }
    ],
    commonMistakes: [
      {
        mistake: 'Dành tới 45 phút cho phần đọc hiểu vì cố nắn nót viết quá dài.',
        consequence: 'Chỉ còn 75 phút cho cả đoạn văn và bài văn, dẫn đến kết bài qua loa, mất từ 1.5 - 2.0 điểm phần Làm văn.',
        howToFix: 'Cài đặt đồng hồ đeo tay, đặt giới hạn nghiêm ngặt: Hết 25 phút đọc hiểu dù chưa hoàn hảo cũng phải chuyển ngay sang đoạn văn.'
      }
    ],
    practiceQuestions: [
      {
        id: 'q-tg-1',
        level: 'thong_hieu',
        levelName: 'Thông hiểu',
        type: 'multiple_choice',
        question: 'Nếu trong phòng thi, học sinh chỉ còn đúng 15 phút nhưng chưa viết xong thân bài của bài văn 600 chữ, giải pháp xử lý sư phạm thông minh nhất là gì?',
        options: [
          'A. Tiếp tục phân tích thật kĩ một luận điểm còn dở, bỏ qua phần kết bài',
          'B. Viết thật nhanh các ý chính còn lại dưới dạng khái quát, và BẮT BUỘC phải viết ngay một Kết bài hoàn chỉnh',
          'C. Ngồi im chờ hết giờ để nộp bài',
          'D. Chép lại đề bài vào bài làm'
        ],
        correctOptionIndex: 1,
        expectedKeyPoints: ['Bắt buộc phải có kết bài để đảm bảo tính trọn vẹn của chỉnh thể văn bản'],
        sampleModelAnswer: 'Đáp án đúng: B. Quy chế chấm thi trừ điểm rất nặng đối với bài viết "đầu voi đuôi chuột" không có kết bài (mất điểm chỉnh thể bố cục). Cần tóm lược nhanh các ý còn lại và viết ngay một kết bài trọn vẹn để bảo toàn cấu trúc bài văn.',
        detailedExplanation: 'Một bài văn thiếu kết bài bị coi là chưa hoàn thành tác phẩm, có thể bị trừ từ 0.5 - 1.0 điểm kết cấu.',
        pedagogicalScaffold: {
          strengthsHint: 'Hiểu được tầm quan trọng của cấu trúc 3 phần hoàn chỉnh trong bài văn nghị luận.',
          missingWarning: 'Tuyệt đối không bỏ kết bài dù thời gian còn rất ít.',
          thinkingStep: 'Bố cục mở - thân - kết là tiêu chí bắt buộc trong barem chấm thi của Bộ GD&ĐT.'
        }
      }
    ],
    status: 'published',
    estimatedMinutes: 6,
    author: 'Tổ Chuyên môn Ngữ văn THPT',
    updatedAt: '2026-10-13'
  }
];
