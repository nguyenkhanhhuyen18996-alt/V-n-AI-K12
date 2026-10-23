import {
  StudentSurveyData,
  ReadingAttempt,
  WritingSubmissionRecord,
  KnowledgeCard,
  DailyKnowledgeRecommendation,
  StudentKnowledgeInteraction
} from '../types';

export function getDailyKnowledgeRecommendations(
  survey: StudentSurveyData,
  readingAttempts: ReadingAttempt[],
  writingRecords: WritingSubmissionRecord[],
  knowledgeCards: KnowledgeCard[],
  interactions: Record<string, StudentKnowledgeInteraction> = {},
  dismissedCardIds: string[] = []
): DailyKnowledgeRecommendation[] {
  const publishedCards = knowledgeCards.filter(
    (c) => c.status === 'published' && !dismissedCardIds.includes(c.id)
  );

  const recommendations: DailyKnowledgeRecommendation[] = [];

  // 1. Kiểm tra các thẻ học sinh chủ động đánh dấu "Cần ôn lại"
  for (const card of publishedCards) {
    const interaction = interactions[card.id];
    if (interaction?.needsReview) {
      recommendations.push({
        cardId: card.id,
        cardTitle: card.title,
        categoryName: card.categoryName,
        reason: 'Bạn đã chủ động đánh dấu thẻ này để ôn tập lại kỹ lưỡng hơn.',
        estimatedMinutes: card.estimatedMinutes,
        priorityLevel: 'high',
        relatedSkillName: card.targetGoal
      });
      if (recommendations.length >= 3) return recommendations;
    }
  }

  // 2. Dựa trên Khảo sát năng lực tự đánh giá (các kĩ năng đánh giá 1-2 sao hoặc kĩ năng ưu tiên)
  if (survey.isCompleted) {
    // Kĩ năng ưu tiên học sinh muốn cải thiện
    const prioritySkill = survey.prioritySkillToImprove;
    const priorityMatch = publishedCards.find(
      (c) => c.targetSkill === prioritySkill && !recommendations.some((r) => r.cardId === c.id)
    );
    if (priorityMatch) {
      recommendations.push({
        cardId: priorityMatch.id,
        cardTitle: priorityMatch.title,
        categoryName: priorityMatch.categoryName,
        reason: `Trọng tâm ôn luyện bạn đã chọn trong Khảo sát năng lực (Mục tiêu bứt phá điểm số).`,
        estimatedMinutes: priorityMatch.estimatedMinutes,
        priorityLevel: 'high',
        relatedSkillName: priorityMatch.targetGoal
      });
      if (recommendations.length >= 3) return recommendations;
    }

    // Các kĩ năng tự đánh giá chưa tự tin (điểm <= 2)
    const lowConfidenceSkills = Object.entries(survey.skillConfidence || {})
      .filter(([_, score]) => score <= 2)
      .map(([skill]) => skill);

    for (const skillKey of lowConfidenceSkills) {
      const match = publishedCards.find(
        (c) => c.targetSkill === skillKey && !recommendations.some((r) => r.cardId === c.id)
      );
      if (match) {
        recommendations.push({
          cardId: match.id,
          cardTitle: match.title,
          categoryName: match.categoryName,
          reason: `Củng cố nền tảng kiến thức ở phần bạn cảm thấy chưa tự tin trong phiếu tự đánh giá.`,
          estimatedMinutes: match.estimatedMinutes,
          priorityLevel: 'medium',
          relatedSkillName: match.targetGoal
        });
        if (recommendations.length >= 3) return recommendations;
      }
    }
  }

  // 3. Dựa trên bài làm thực tế: Tiêu chí rubric bài viết thường bị trừ điểm
  if (writingRecords.length > 0) {
    // Kiểm tra xem có bài nào bị nhắc nhở về dẫn chứng hoặc thể thức đoạn không
    const hasEvidenceWarning = writingRecords.some((w) =>
      w.feedback?.criteria?.some(
        (c) => c.id === 'evidence' && (c.scoreStatus === 'warning' || c.scoreLevel === 'Cần bổ sung')
      )
    );
    const hasStructureWarning = writingRecords.some((w) =>
      w.feedback?.criteria?.some(
        (c) => c.id === 'structure' && (c.scoreStatus === 'warning' || c.scoreLevel === 'Cần bổ sung')
      )
    );

    if (hasEvidenceWarning || hasStructureWarning) {
      const paragraphCard = publishedCards.find(
        (c) => c.id === 'k-doan-200-chu' && !recommendations.some((r) => r.cardId === c.id)
      );
      if (paragraphCard) {
        recommendations.push({
          cardId: paragraphCard.id,
          cardTitle: paragraphCard.title,
          categoryName: paragraphCard.categoryName,
          reason: 'Phát hiện bài viết gần đây cần hoàn thiện thêm về tổ chức cấu trúc đoạn và dẫn chứng thực tế.',
          estimatedMinutes: paragraphCard.estimatedMinutes,
          priorityLevel: 'high',
          relatedSkillName: 'Kỹ thuật viết đoạn văn nghị luận 200 chữ'
        });
        if (recommendations.length >= 3) return recommendations;
      }
    }
  }

  // 4. Nếu chưa đủ 3 gợi ý, bổ sung các kiến thức nền tảng thiết yếu
  const defaultCardIds = ['k-an-du', 'k-doc-hieu-quy-trinh', 'k-quan-li-thoi-gian'];
  for (const defId of defaultCardIds) {
    const card = publishedCards.find(
      (c) => c.id === defId && !recommendations.some((r) => r.cardId === c.id)
    );
    if (card) {
      recommendations.push({
        cardId: card.id,
        cardTitle: card.title,
        categoryName: card.categoryName,
        reason: 'Gợi ý sơ bộ: Kiến thức cốt lõi thường xuyên xuất hiện trong cấu trúc đề thi tốt nghiệp THPT.',
        estimatedMinutes: card.estimatedMinutes,
        priorityLevel: 'medium',
        relatedSkillName: card.targetGoal
      });
      if (recommendations.length >= 3) return recommendations;
    }
  }

  // Fallback: Lấy các thẻ đầu tiên
  for (const card of publishedCards) {
    if (!recommendations.some((r) => r.cardId === card.id)) {
      recommendations.push({
        cardId: card.id,
        cardTitle: card.title,
        categoryName: card.categoryName,
        reason: 'Gợi ý ôn tập hàng ngày giúp tích lũy phản xạ phân tích nhanh.',
        estimatedMinutes: card.estimatedMinutes,
        priorityLevel: 'medium',
        relatedSkillName: card.targetGoal
      });
      if (recommendations.length >= 3) break;
    }
  }

  return recommendations;
}
