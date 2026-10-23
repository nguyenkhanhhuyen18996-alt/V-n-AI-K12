import React from 'react';
import {
  NavigationTab,
  StudentSurveyData,
  ReadingAttempt,
  WritingSubmissionRecord,
  PersonalizedRecommendation,
  DailyKnowledgeRecommendation,
  KnowledgeCard,
  UserAccount,
  CompleteExam
} from '../types';
import { StudentDashboard } from './StudentDashboard';

interface HomeOverviewProps {
  currentUser?: UserAccount | null;
  isDemoMode?: boolean;
  survey: StudentSurveyData;
  readingAttempts: ReadingAttempt[];
  writingRecords: WritingSubmissionRecord[];
  recommendations: PersonalizedRecommendation[];
  dailyKnowledgeRecs: DailyKnowledgeRecommendation[];
  knowledgeCards: KnowledgeCard[];
  onSelectTab: (tab: NavigationTab) => void;
  onOpenGuide: () => void;
  onOpenSurvey: () => void;
  onStartExercise: (rec: PersonalizedRecommendation) => void;
  onDismissExercise: (recId: string) => void;
  onLearnKnowledgeCard: (cardId: string) => void;
  onGoToExerciseWithKnowledge: (cardId: string) => void;
  onDismissKnowledgeRec: (cardId: string) => void;
  onSelectExam?: (exam: CompleteExam) => void;
}

export const HomeOverview: React.FC<HomeOverviewProps> = ({
  currentUser,
  isDemoMode = false,
  survey,
  readingAttempts,
  writingRecords,
  recommendations,
  onSelectTab,
  onOpenSurvey,
  onStartExercise,
  onDismissExercise,
  onSelectExam
}) => {
  return (
    <div className="space-y-6">
      <StudentDashboard
        currentUser={currentUser}
        isDemoMode={isDemoMode}
        survey={survey}
        readingAttempts={readingAttempts}
        writingRecords={writingRecords}
        recommendations={recommendations}
        onOpenSurvey={onOpenSurvey}
        onStartExercise={onStartExercise}
        onDismissExercise={onDismissExercise}
        onNavigateTab={onSelectTab}
        onSelectExam={onSelectExam}
      />
    </div>
  );
};
