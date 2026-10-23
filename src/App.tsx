/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  NavigationTab,
  UserRole,
  ReadingAttempt,
  WritingSubmissionRecord,
  StudentSurveyData,
  PersonalizedRecommendation,
  TestScenarioKey,
  KnowledgeCard,
  StudentKnowledgeInteraction,
  UserAccount,
  CompleteExam
} from './types';
import { Navbar } from './components/Navbar';
import { HomeOverview } from './components/HomeOverview';
import { ReadingComprehension } from './components/ReadingComprehension';
import { WritingCoach } from './components/WritingCoach';
import { LearningPortfolio } from './components/LearningPortfolio';
import { GuideModal } from './components/GuideModal';
import { StudentSurveyModal } from './components/StudentSurveyModal';
import { TeacherAnalyticsPortal } from './components/TeacherAnalyticsPortal';
import { AdminPortal } from './components/AdminPortal';
import { KnowledgeBaseHub } from './components/KnowledgeBaseHub';
import { KnowledgeCardDetailModal } from './components/KnowledgeCardDetailModal';
import { AuthModal } from './components/AuthModal';
import { CompleteExamRunner } from './components/CompleteExamRunner';
import { DEFAULT_STUDENT_SURVEY, TEST_SCENARIOS_PROFILES } from './data/mockProfiles';
import { INITIAL_KNOWLEDGE_CARDS } from './data/knowledgeBaseData';
import { generatePersonalizedRecommendations } from './services/recommendationEngine';
import { getDailyKnowledgeRecommendations } from './services/knowledgeRecommendationService';
import {
  getStoredCompleteExams,
  getPublishedBankExamsByTemplate,
  formatVNDecimal
} from './services/examParserEngine';
import {
  initializeAccounts,
  getStoredAccountsSync,
  getSavedSessionUser,
  saveAuthSession,
  isVerifiedTeacherSession,
  isVerifiedAdminSession,
  matchAccountByGoogleEmail,
  fetchStudentStateFromServer,
  saveStudentStateToServer,
  fetchAllStudentStatesForTeacher
} from './services/accountService';
import {
  subscribeToAuthState,
  syncUserProfileToFirestore,
  loadStudentLearningStateFromFirestore,
  saveStudentLearningStateToFirestore,
  loadExamsFromFirestore,
  firebaseSignOut
} from './services/firebaseAuth';
import { Eye, ShieldCheck, Lock, LogIn } from 'lucide-react';

interface PerUserLearningState {
  survey: StudentSurveyData;
  readingAttempts: ReadingAttempt[];
  writingRecords: WritingSubmissionRecord[];
}

function getLocalUserLearningState(userId: string): PerUserLearningState {
  try {
    const raw = localStorage.getItem(`vanai12_prod_learning_state_${userId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        survey: parsed.survey || { ...DEFAULT_STUDENT_SURVEY },
        readingAttempts: Array.isArray(parsed.readingAttempts) ? parsed.readingAttempts : [],
        writingRecords: Array.isArray(parsed.writingRecords) ? parsed.writingRecords : []
      };
    }
  } catch (e) {
    console.warn('Không đọc được bản nháp cục bộ:', e);
  }
  return {
    survey: { ...DEFAULT_STUDENT_SURVEY },
    readingAttempts: [],
    writingRecords: []
  };
}

function saveLocalUserLearningState(userId: string, state: PerUserLearningState) {
  try {
    localStorage.setItem(`vanai12_prod_learning_state_${userId}`, JSON.stringify(state));
  } catch (e) {
    console.warn('Không lưu được bản nháp cục bộ:', e);
  }
}

export default function App() {
  const [currentTab, setCurrentTab] = useState<NavigationTab>('home');
  const [userRole, setUserRole] = useState<UserRole>('student');
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);
  const [isSurveyOpen, setIsSurveyOpen] = useState<boolean>(false);
  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false);
  const [runningExam, setRunningExam] = useState<CompleteExam | null>(null);

  // Chế độ sản phẩm thật: Mặc định tắt hoàn toàn Chế độ Dữ liệu Minh họa (isDemoMode = false)
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);

  // Quản lý tài khoản từ Backend & phiên đăng nhập thực tế (Không tự động đăng nhập tài khoản mẫu)
  const [accounts, setAccounts] = useState<UserAccount[]>(getStoredAccountsSync());
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => getSavedSessionUser());
  const [firebaseUid, setFirebaseUid] = useState<string | null>(null);
  const [cloudExams, setCloudExams] = useState<CompleteExam[]>([]);

  // Dữ liệu học tập thực tế của toàn bộ học sinh (Dành cho Giáo viên đã xác thực, gắn theo UID)
  const [studentStatesMap, setStudentStatesMap] = useState<Record<string, PerUserLearningState>>({});

  // Dữ liệu học tập thực tế của người dùng hiện tại (Khởi tạo rỗng, không kế thừa kịch bản kiểm thử)
  const [survey, setSurvey] = useState<StudentSurveyData>({ ...DEFAULT_STUDENT_SURVEY });
  const [readingAttempts, setReadingAttempts] = useState<ReadingAttempt[]>([]);
  const [writingRecords, setWritingRecords] = useState<WritingSubmissionRecord[]>([]);

  // Kịch bản kiểm thử (Chỉ dùng khi Giáo viên bật Chế độ Dữ liệu Minh họa)
  const [currentScenario, setCurrentScenario] = useState<TestScenarioKey>('scenario_low_self_high_actual');

  // Danh sách bài luyện đã bỏ qua ("Để sau")
  const [dismissedExerciseIds, setDismissedExerciseIds] = useState<string[]>([]);

  // Cờ đánh dấu đang nạp dữ liệu người dùng để tránh ghi đè rỗng
  const isHydratingRef = useRef<boolean>(false);

  const normalizeStudentStatesMap = (
    rawMap: Record<
      string,
      {
        survey: StudentSurveyData | null;
        readingAttempts: ReadingAttempt[];
        writingRecords: WritingSubmissionRecord[];
      }
    >
  ): Record<string, PerUserLearningState> => {
    const out: Record<string, PerUserLearningState> = {};
    for (const [uid, val] of Object.entries(rawMap || {})) {
      out[uid] = {
        survey: val.survey || { ...DEFAULT_STUDENT_SURVEY },
        readingAttempts: Array.isArray(val.readingAttempts) ? val.readingAttempts : [],
        writingRecords: Array.isArray(val.writingRecords) ? val.writingRecords : []
      };
    }
    return out;
  };

  // Khôi phục phiên đăng nhập hợp lệ từ sessionStorage (nếu có Bearer token hợp lệ)
  useEffect(() => {
    const savedUser = getSavedSessionUser();
    if (savedUser) {
      setCurrentUser(savedUser);
      setUserRole(savedUser.role);
      if (savedUser.role === 'teacher' && isVerifiedTeacherSession()) {
        initializeAccounts().then(setAccounts);
        fetchAllStudentStatesForTeacher().then((m) =>
          setStudentStatesMap(normalizeStudentStatesMap(m))
        );
      }
    }
  }, []);

  // Lắng nghe trạng thái xác thực Firebase Authentication & tải dữ liệu Cloud Firestore
  useEffect(() => {
    const unsubscribe = subscribeToAuthState(async (fbUser) => {
      if (fbUser) {
        setFirebaseUid(fbUser.uid);
        try {
          const idToken = await fbUser.getIdToken(false);
          // Đối chiếu với máy chủ xác thực (/api/auth/google-match) bằng Firebase ID Token đã ký
          const match = await matchAccountByGoogleEmail(
            idToken,
            fbUser.displayName || undefined
          );

          if (match.matched && match.user) {
            setCurrentUser(match.user);
            setUserRole(match.user.role);
            if (match.user.role === 'teacher' || match.user.role === 'admin') {
              initializeAccounts().then(setAccounts);
              fetchAllStudentStatesForTeacher().then((m) =>
                setStudentStatesMap(normalizeStudentStatesMap(m))
              );
            }

            await syncUserProfileToFirestore(match.user, survey);
          }

          // Tải ngân hàng đề từ Cloud Firestore
          const remoteExams = await loadExamsFromFirestore();
          if (remoteExams.length > 0) {
            setCloudExams(remoteExams);
          }

          // Tải hồ sơ học tập thực tế từ Cloud Firestore theo UID
          const targetUid = match.user?.id || fbUser.uid;
          const remoteState = await loadStudentLearningStateFromFirestore(targetUid);
          if (remoteState && !isDemoMode) {
            isHydratingRef.current = true;
            if (remoteState.survey) setSurvey(remoteState.survey);
            if (remoteState.readingAttempts) setReadingAttempts(remoteState.readingAttempts);
            if (remoteState.writingRecords) setWritingRecords(remoteState.writingRecords);
            isHydratingRef.current = false;
          }
        } catch (err) {
          console.warn('Lỗi đồng bộ phiên Firebase Auth:', err);
        }
      } else {
        setFirebaseUid(null);
      }
    });
    return () => unsubscribe();
  }, [isDemoMode]);

  // Khi chuyển người dùng (theo UID ổn định currentUser.id) hoặc bật/tắt Chế độ Dữ liệu Minh họa
  useEffect(() => {
    if (isDemoMode) {
      const profile = TEST_SCENARIOS_PROFILES[currentScenario];
      setSurvey(profile.survey);
      setReadingAttempts(profile.readingAttempts);
      setWritingRecords(profile.writingRecords);
      return;
    }

    if (currentUser && currentUser.id) {
      const uid = currentUser.id;
      isHydratingRef.current = true;
      const localDraft = getLocalUserLearningState(uid);
      setSurvey(localDraft.survey);
      setReadingAttempts(localDraft.readingAttempts);
      setWritingRecords(localDraft.writingRecords);

      // Tải dữ liệu chính thức từ máy chủ theo UID ổn định
      fetchStudentStateFromServer(uid)
        .then((serverState) => {
          if (serverState) {
            setSurvey(serverState.survey || { ...DEFAULT_STUDENT_SURVEY });
            setReadingAttempts(
              Array.isArray(serverState.readingAttempts) ? serverState.readingAttempts : []
            );
            setWritingRecords(
              Array.isArray(serverState.writingRecords) ? serverState.writingRecords : []
            );
            saveLocalUserLearningState(uid, {
              survey: serverState.survey || { ...DEFAULT_STUDENT_SURVEY },
              readingAttempts: Array.isArray(serverState.readingAttempts)
                ? serverState.readingAttempts
                : [],
              writingRecords: Array.isArray(serverState.writingRecords)
                ? serverState.writingRecords
                : []
            });
          }
        })
        .finally(() => {
          isHydratingRef.current = false;
        });
    } else {
      // Người dùng mới / chưa đăng nhập: hoàn toàn trống, tuyệt đối không kế thừa kịch bản kiểm thử
      setSurvey({ ...DEFAULT_STUDENT_SURVEY });
      setReadingAttempts([]);
      setWritingRecords([]);
    }
  }, [currentUser?.id, isDemoMode, currentScenario]);

  // Tự động lưu dữ liệu học tập thực tế của học sinh theo UID ổn định (Server + Cloud Firestore + Bản nháp cục bộ)
  useEffect(() => {
    if (isDemoMode || isHydratingRef.current) return;
    if (currentUser && currentUser.id) {
      const statePayload: PerUserLearningState = {
        survey,
        readingAttempts,
        writingRecords
      };
      saveLocalUserLearningState(currentUser.id, statePayload);
      saveStudentStateToServer(currentUser.id, statePayload).catch(() => {});
      if (firebaseUid) {
        saveStudentLearningStateToFirestore(currentUser.id, statePayload).catch(() => {});
      }
    }
  }, [survey, readingAttempts, writingRecords, currentUser?.id, firebaseUid, isDemoMode]);

  const handleRefreshAccounts = async () => {
    if (!isVerifiedTeacherSession()) return;
    const updated = await initializeAccounts();
    setAccounts([...updated]);
    const states = await fetchAllStudentStatesForTeacher();
    setStudentStatesMap(normalizeStudentStatesMap(states));
  };

  // ========================================================
  // MÔ-ĐUN: GÓC TRI THỨC NGỮ VĂN STATE
  // ========================================================
  const [knowledgeCards, setKnowledgeCards] = useState<KnowledgeCard[]>(INITIAL_KNOWLEDGE_CARDS);
  const [knowledgeInteractions, setKnowledgeInteractions] = useState<Record<string, StudentKnowledgeInteraction>>({});
  const [dismissedKnowledgeRecIds, setDismissedKnowledgeRecIds] = useState<string[]>([]);
  const [selectedKnowledgeCardModalId, setSelectedKnowledgeCardModalId] = useState<string | null>(null);

  // Tính toán gợi ý bài luyện cá nhân hóa tự động (Đọc hiểu & Viết)
  const recommendations = generatePersonalizedRecommendations(
    survey,
    readingAttempts,
    writingRecords,
    dismissedExerciseIds
  );

  // Tính toán gợi ý 3 kiến thức ưu tiên nên ôn hôm nay (Cá nhân hóa)
  const dailyKnowledgeRecs = getDailyKnowledgeRecommendations(
    survey,
    readingAttempts,
    writingRecords,
    knowledgeCards,
    knowledgeInteractions,
    dismissedKnowledgeRecIds
  );

  // Chuyển đổi kịch bản kiểm thử (Chỉ tác động trong chế độ Dữ liệu Minh họa)
  const handleSelectScenario = (scenarioKey: TestScenarioKey) => {
    setCurrentScenario(scenarioKey);
    if (isDemoMode) {
      const profile = TEST_SCENARIOS_PROFILES[scenarioKey];
      setSurvey(profile.survey);
      setReadingAttempts(profile.readingAttempts);
      setWritingRecords(profile.writingRecords);
      setDismissedExerciseIds([]);
      setDismissedKnowledgeRecIds([]);
    }
  };

  // Handlers lưu dữ liệu bài làm mới
  const handleSaveReadingAttempt = (attempt: ReadingAttempt) => {
    setReadingAttempts((prev) => [attempt, ...prev]);
  };

  const handleSaveWritingRecord = (record: WritingSubmissionRecord) => {
    setWritingRecords((prev) => [record, ...prev]);
  };

  const handleClearHistory = () => {
    setReadingAttempts([]);
    setWritingRecords([]);
  };

  const handleImportContent = (title: string, content: string, type: 'reading' | 'writing') => {
    if (type === 'reading') {
      setCurrentTab('reading');
    } else {
      setCurrentTab('writing');
    }
  };

  const [activeReadingPassageId, setActiveReadingPassageId] = useState<string | null>(null);
  const [activeWritingPromptId, setActiveWritingPromptId] = useState<string | null>(null);
  const [isFocusMode, setIsFocusMode] = useState<boolean>(false);

  // Tự động tắt Focus Mode nếu người dùng rời khỏi tab Đọc hiểu hoặc Viết
  useEffect(() => {
    if (currentTab !== 'reading' && currentTab !== 'writing') {
      setIsFocusMode(false);
    }
  }, [currentTab]);

  // Hành động bắt đầu luyện tập từ thẻ gợi ý (chuyển đúng đề và rubric giáo viên đã gắn)
  const handleStartExercise = (rec: PersonalizedRecommendation) => {
    if (rec.type === 'reading' || rec.sectionType === 'reading') {
      if (rec.passageId) {
        setActiveReadingPassageId(rec.passageId);
      }
      setCurrentTab('reading');
    } else {
      if (rec.promptId) {
        setActiveWritingPromptId(rec.promptId);
      }
      setCurrentTab('writing');
    }
  };

  // Bỏ qua bài luyện ("Để sau")
  const handleDismissExercise = (recId: string) => {
    setDismissedExerciseIds((prev) => [...prev, recId]);
  };

  // Lưu khảo sát năng lực
  const handleSaveSurvey = (updatedSurvey: StudentSurveyData) => {
    setSurvey(updatedSurvey);
  };

  // ========================================================
  // HANDLERS GÓC TRI THỨC NGỮ VĂN
  // ========================================================
  const handleToggleBookmark = (cardId: string) => {
    setKnowledgeInteractions((prev) => {
      const current = prev[cardId] || {
        cardId,
        isBookmarked: false,
        needsReview: false,
        hasStudied: false,
        practiceCount: 0
      };
      return {
        ...prev,
        [cardId]: {
          ...current,
          isBookmarked: !current.isBookmarked
        }
      };
    });
  };

  const handleToggleNeedsReview = (cardId: string) => {
    setKnowledgeInteractions((prev) => {
      const current = prev[cardId] || {
        cardId,
        isBookmarked: false,
        needsReview: false,
        hasStudied: false,
        practiceCount: 0
      };
      return {
        ...prev,
        [cardId]: {
          ...current,
          needsReview: !current.needsReview
        }
      };
    });
  };

  const handleRecordStudy = (cardId: string) => {
    setKnowledgeInteractions((prev) => {
      const current = prev[cardId] || {
        cardId,
        isBookmarked: false,
        needsReview: false,
        hasStudied: false,
        practiceCount: 0
      };
      return {
        ...prev,
        [cardId]: {
          ...current,
          hasStudied: true,
          lastStudiedAt: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        }
      };
    });
  };

  const handleRecordPracticeScore = (cardId: string, score: number) => {
    setKnowledgeInteractions((prev) => {
      const current = prev[cardId] || {
        cardId,
        isBookmarked: false,
        needsReview: false,
        hasStudied: true,
        practiceCount: 0
      };
      return {
        ...prev,
        [cardId]: {
          ...current,
          hasStudied: true,
          practiceCount: current.practiceCount + 1,
          practiceScore: score
        }
      };
    });
  };

  const handleDismissKnowledgeRec = (cardId: string) => {
    setDismissedKnowledgeRecIds((prev) => [...prev, cardId]);
  };

  const handleLearnKnowledgeCard = (cardId: string) => {
    setSelectedKnowledgeCardModalId(cardId);
  };

  const handleGoToExerciseWithKnowledge = (cardId: string) => {
    const card = knowledgeCards.find((c) => c.id === cardId);
    if (!card) return;
    if (card.category === 'rhetoric' || card.category === 'reading_method') {
      setCurrentTab('reading');
    } else {
      setCurrentTab('writing');
    }
  };

  const handleNavigateToExercise = (type: 'reading' | 'writing') => {
    if (type === 'reading') {
      setCurrentTab('reading');
    } else {
      setCurrentTab('writing');
    }
  };

  // Quản lý thẻ của Giáo viên (Kiểm tra quyền Giáo viên trước khi ghi)
  const handleSaveKnowledgeCard = (card: KnowledgeCard) => {
    if (!isVerifiedTeacherSession()) return;
    setKnowledgeCards((prev) => {
      const existsIndex = prev.findIndex((c) => c.id === card.id);
      if (existsIndex >= 0) {
        const copy = [...prev];
        copy[existsIndex] = card;
        return copy;
      }
      return [card, ...prev];
    });
  };

  const handleDeleteKnowledgeCard = (cardId: string) => {
    if (!isVerifiedTeacherSession()) return;
    setKnowledgeCards((prev) => prev.filter((c) => c.id !== cardId));
  };

  const handleToggleKnowledgeCardStatus = (cardId: string) => {
    if (!isVerifiedTeacherSession()) return;
    setKnowledgeCards((prev) =>
      prev.map((c) => {
        if (c.id === cardId) {
          return {
            ...c,
            status: c.status === 'published' ? 'draft' : 'published'
          };
        }
        return c;
      })
    );
  };

  // Giáo viên duyệt điểm chính thức (Cập nhật đúng vào hồ sơ UID của học sinh)
  const handleApproveGrade = async (
    studentId: string,
    submissionId: string,
    approvedScore: number,
    teacherNotes: string
  ) => {
    if (!isVerifiedTeacherSession()) return;

    if (isDemoMode) {
      setWritingRecords((prev) =>
        prev.map((rec) =>
          rec.id === submissionId
            ? {
                ...rec,
                scoreStatus: 'teacher_approved',
                feedback: {
                  ...rec.feedback,
                  teacherConfirmedScore: approvedScore,
                  teacherNotes
                }
              }
            : rec
        )
      );
      return;
    }

    const targetState = studentStatesMap[studentId];
    if (!targetState) return;

    const updatedWritingRecords: WritingSubmissionRecord[] = targetState.writingRecords.map((rec) =>
      rec.id === submissionId
        ? {
            ...rec,
            scoreStatus: 'teacher_approved',
            feedback: {
              ...rec.feedback,
              teacherConfirmedScore: approvedScore,
              teacherNotes
            }
          }
        : rec
    );

    const updatedStudentState: PerUserLearningState = {
      ...targetState,
      writingRecords: updatedWritingRecords
    };

    setStudentStatesMap((prev) => ({
      ...prev,
      [studentId]: updatedStudentState
    }));

    await saveStudentStateToServer(studentId, updatedStudentState);
  };

  const handleLoginSuccess = async (user: UserAccount) => {
    setIsDemoMode(false);
    setCurrentUser(user);
    setUserRole(user.role);
    if (user.role === 'admin' && isVerifiedAdminSession()) {
      const [loadedAccs, loadedStates] = await Promise.all([
        initializeAccounts(),
        fetchAllStudentStatesForTeacher()
      ]);
      setAccounts(loadedAccs);
      setStudentStatesMap(normalizeStudentStatesMap(loadedStates));
      setCurrentTab('admin');
    } else if (user.role === 'teacher' && isVerifiedTeacherSession()) {
      const [loadedAccs, loadedStates] = await Promise.all([
        initializeAccounts(),
        fetchAllStudentStatesForTeacher()
      ]);
      setAccounts(loadedAccs);
      setStudentStatesMap(normalizeStudentStatesMap(loadedStates));
      setCurrentTab('teacher');
    } else {
      setCurrentTab('home');
      // Mở khảo sát nhanh 3 câu nếu học sinh đăng nhập lần đầu và chưa thiết lập mục tiêu
      const serverOrLocal =
        (await fetchStudentStateFromServer(user.id)) || getLocalUserLearningState(user.id);
      if (!serverOrLocal.survey?.isCompleted) {
        setIsSurveyOpen(true);
      }
    }
  };

  const handleLogout = async () => {
    await firebaseSignOut();
    saveAuthSession(null, null, null);
    setCurrentUser(null);
    setIsDemoMode(false);
    setUserRole('student');
    setCurrentTab('home');
  };

  // Chỉ Giáo viên hoặc Quản trị viên đã xác thực mới được bật/tắt Chế độ Dữ liệu Minh họa
  const handleToggleDemoMode = () => {
    if (!currentUser || !isVerifiedTeacherSession()) {
      setIsAuthOpen(true);
      return;
    }
    setIsDemoMode((prev) => !prev);
  };

  const modalActiveCard = selectedKnowledgeCardModalId
    ? knowledgeCards.find((c) => c.id === selectedKnowledgeCardModalId) || null
    : null;

  const isTeacherVerified = Boolean(
    currentUser &&
      (currentUser.role === 'teacher' || currentUser.role === 'admin') &&
      currentUser.status === 'active' &&
      isVerifiedTeacherSession()
  );

  const isAdminVerified = Boolean(
    currentUser &&
      currentUser.role === 'admin' &&
      currentUser.status === 'active' &&
      isVerifiedAdminSession()
  );

  const allAvailableExams = isDemoMode
    ? getStoredCompleteExams(true)
    : getPublishedBankExamsByTemplate('all', [
        ...cloudExams,
        ...getStoredCompleteExams(false).filter(
          (localEx) => !cloudExams.some((c) => c.id === localEx.id)
        )
      ]);

  const isPracticeFocusActive =
    isFocusMode && (currentTab === 'reading' || currentTab === 'writing');

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF7F2] text-[#1E293B]">
      {/* Banner cảnh báo rõ ràng khi đang bật Chế độ Dữ liệu Minh họa (Demo) - Ẩn khi đang trong Focus Mode */}
      {isDemoMode && !isPracticeFocusActive && (
        <div className="bg-amber-600 text-white px-4 py-2 text-xs font-bold flex flex-wrap items-center justify-between gap-2 shadow-xs">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 shrink-0" />
            <span>
              DỮ LIỆU MINH HỌA (CHẾ ĐỘ KIỂM THỬ DÀNH CHO GIÁO VIÊN): Đang hiển thị kịch bản mẫu. Dữ liệu này tách biệt hoàn toàn với dữ liệu học sinh thật.
            </span>
          </div>
          <button
            type="button"
            onClick={handleToggleDemoMode}
            className="px-3 py-1 rounded-lg bg-white text-amber-900 hover:bg-amber-50 font-bold text-[11px] cursor-pointer transition-colors"
          >
            Thoát Dữ liệu minh họa & Về dữ liệu thật
          </button>
        </div>
      )}

      {/* Top Navbar: Ẩn hoàn toàn khi bật Focus Mode trong bài Đọc hiểu / Viết */}
      {!isPracticeFocusActive && (
        <Navbar
          currentTab={currentTab}
          userRole={userRole}
          currentUser={currentUser}
          isDemoMode={isDemoMode}
          isCloudSynced={Boolean(firebaseUid)}
          onSelectTab={(tab) => {
            if (tab === 'teacher' && !isTeacherVerified) {
              setIsAuthOpen(true);
              return;
            }
            if (tab === 'admin' && !isAdminVerified) {
              setIsAuthOpen(true);
              return;
            }
            setCurrentTab(tab);
          }}
          onOpenGuide={() => setIsGuideOpen(true)}
          onOpenSurvey={() => setIsSurveyOpen(true)}
          onToggleDemoMode={isTeacherVerified ? handleToggleDemoMode : undefined}
          onOpenAuth={() => setIsAuthOpen(true)}
        />
      )}

      {/* Main Content Area */}
      <main
        className={`flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 ${
          isPracticeFocusActive ? 'pt-3 sm:pt-4' : 'pt-6 sm:pt-8'
        }`}
      >
        {currentTab === 'home' && (
          <HomeOverview
            currentUser={currentUser}
            isDemoMode={isDemoMode}
            survey={survey}
            readingAttempts={readingAttempts}
            writingRecords={writingRecords}
            recommendations={recommendations}
            dailyKnowledgeRecs={dailyKnowledgeRecs}
            knowledgeCards={knowledgeCards}
            onSelectTab={(tab) => {
              if (tab === 'teacher' && !isTeacherVerified) {
                setIsAuthOpen(true);
                return;
              }
              setCurrentTab(tab);
            }}
            onOpenGuide={() => setIsGuideOpen(true)}
            onOpenSurvey={() => setIsSurveyOpen(true)}
            onStartExercise={handleStartExercise}
            onDismissExercise={handleDismissExercise}
            onLearnKnowledgeCard={handleLearnKnowledgeCard}
            onGoToExerciseWithKnowledge={handleGoToExerciseWithKnowledge}
            onDismissKnowledgeRec={handleDismissKnowledgeRec}
            onSelectExam={(ex) => {
              setRunningExam(ex);
              setCurrentTab('exam');
            }}
          />
        )}

        {currentTab === 'exam' && (
          runningExam ? (
            <CompleteExamRunner
              exam={runningExam}
              currentUser={currentUser}
              isDemoMode={isDemoMode}
              onFinish={() => {
                setRunningExam(null);
                setCurrentTab('portfolio');
              }}
              onBack={() => setRunningExam(null)}
            />
          ) : (
            <div className="space-y-6 pb-16">
              <div className="p-6 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-2">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-900 text-xs font-semibold">
                  <span>
                    Luyện thi tốt nghiệp THPT — Thang điểm 10,0{' '}
                    {isDemoMode ? '· [Dữ liệu minh họa]' : ''}
                  </span>
                </div>
                <h2 className="text-2xl font-serif-literary font-bold text-[#0F172A]">
                  Ngân hàng Đề thi Hoàn chỉnh (Mẫu A & Mẫu B)
                </h2>
                <p className="text-xs text-stone-600">
                  Mỗi đề gồm 3 phần chuẩn hóa: Đọc hiểu 4,0đ (30 phút) — Đoạn văn ~200 chữ 2,0đ (30 phút) — Bài văn ~600 chữ 4,0đ (60 phút). Tự động lưu nháp và hỗ trợ AI chấm sơ bộ theo hướng dẫn chấm.
                </p>
              </div>

              {allAvailableExams.length === 0 ? (
                <div className="p-8 bg-white rounded-2xl border border-stone-200 text-center space-y-3">
                  <p className="text-sm font-bold text-stone-800">
                    Chưa có đề thi nào được giao trong lớp của bạn
                  </p>
                  <p className="text-xs text-stone-500 max-w-md mx-auto">
                    Hệ thống không tự động nạp đề kiểm thử khi dữ liệu thật đang trống. Giáo viên có thể đăng nhập để tải đề mới hoặc tạo đề từ Mẫu A / Mẫu B.
                  </p>
                  {isTeacherVerified ? (
                    <button
                      type="button"
                      onClick={() => setCurrentTab('teacher')}
                      className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold cursor-pointer"
                    >
                      Mở khu vực Giáo viên để Giao đề
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsAuthOpen(true)}
                      className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold cursor-pointer"
                    >
                      Đăng nhập Tài khoản
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {allAvailableExams.map((ex) => (
                    <div
                      key={ex.id}
                      className="p-6 bg-white rounded-2xl border border-stone-200 shadow-xs flex flex-col justify-between space-y-4 hover:shadow-md transition-shadow"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-bold text-stone-700 bg-stone-100 px-2 py-0.5 rounded">
                            {ex.code}
                          </span>
                          <div className="flex items-center gap-1">
                            {isDemoMode && (
                              <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold">
                                Dữ liệu minh họa
                              </span>
                            )}
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              ex.templateType === 'template_a'
                                ? 'bg-blue-100 text-blue-800'
                                : ex.templateType === 'template_b'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-stone-100 text-stone-700'
                            }`}>
                              {ex.templateType === 'template_a' ? 'Mẫu A' : ex.templateType === 'template_b' ? 'Mẫu B' : 'Tùy chỉnh'}
                            </span>
                          </div>
                        </div>

                        <h3 className="font-serif-literary font-bold text-base text-[#0F172A] line-clamp-2">
                          {ex.title}
                        </h3>

                        <div className="space-y-1.5 text-xs text-stone-600 border-t border-stone-100 pt-2">
                          <div className="flex items-center justify-between">
                            <span>Phần I: Đọc hiểu</span>
                            <span className="font-bold font-mono">{formatVNDecimal(ex.readingPassage.maxScore)}đ ({ex.readingPassage.genreName})</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Phần II: Đoạn ~200 chữ</span>
                            <span className="font-bold font-mono">2,0đ ({ex.writingTasks.paragraphTask.typeName})</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Phần II: Bài ~600 chữ</span>
                            <span className="font-bold font-mono">4,0đ ({ex.writingTasks.essayTask.typeName})</span>
                          </div>
                          <div className="flex items-center justify-between font-bold text-stone-900 pt-1 border-t border-stone-100">
                            <span>Tổng điểm đề</span>
                            <span className="font-mono text-emerald-700">{formatVNDecimal(ex.totalScore)}/10,0đ</span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setRunningExam(ex)}
                        className="w-full py-2.5 px-4 bg-[#0F172A] hover:bg-stone-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs"
                      >
                        <span>Bắt đầu thi thử ({ex.durationMinutes} phút)</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        )}

        {currentTab === 'knowledge' && (
          <KnowledgeBaseHub
            knowledgeCards={knowledgeCards}
            interactions={knowledgeInteractions}
            onToggleBookmark={handleToggleBookmark}
            onToggleNeedsReview={handleToggleNeedsReview}
            onRecordStudy={handleRecordStudy}
            onRecordPracticeScore={handleRecordPracticeScore}
            onNavigateToExercise={handleNavigateToExercise}
          />
        )}

        {currentTab === 'reading' && (
          <ReadingComprehension
            initialPassageId={activeReadingPassageId}
            onSaveAttempt={handleSaveReadingAttempt}
            isFocusMode={isFocusMode}
            onToggleFocusMode={setIsFocusMode}
          />
        )}

        {currentTab === 'writing' && (
          <WritingCoach
            currentUser={currentUser}
            isDemoMode={isDemoMode}
            initialPromptId={activeWritingPromptId}
            onSaveSubmission={handleSaveWritingRecord}
            isFocusMode={isFocusMode}
            onToggleFocusMode={setIsFocusMode}
          />
        )}

        {currentTab === 'portfolio' && (
          <LearningPortfolio
            studentUid={currentUser?.id || (isDemoMode ? `demo_${currentScenario}` : 'guest_local')}
            readingAttempts={readingAttempts}
            writingRecords={writingRecords}
            targetScore={survey.targetScore}
            onClearHistory={handleClearHistory}
            onGoToReading={() => setCurrentTab('reading')}
            onGoToWriting={() => setCurrentTab('writing')}
            onImportContent={handleImportContent}
            onOpenSurvey={() => setIsSurveyOpen(true)}
          />
        )}

        {currentTab === 'teacher' && (
          isTeacherVerified ? (
            <TeacherAnalyticsPortal
              currentScenario={currentScenario}
              isDemoMode={isDemoMode}
              onToggleDemoMode={handleToggleDemoMode}
              knowledgeCards={knowledgeCards}
              accounts={accounts}
              studentStatesMap={studentStatesMap}
              onRefreshAccounts={handleRefreshAccounts}
              onSelectScenario={handleSelectScenario}
              onApproveGrade={handleApproveGrade}
              onSaveKnowledgeCard={handleSaveKnowledgeCard}
              onDeleteKnowledgeCard={handleDeleteKnowledgeCard}
              onToggleKnowledgeCardStatus={handleToggleKnowledgeCardStatus}
            />
          ) : (
            <div className="my-12 max-w-lg mx-auto p-6 bg-white rounded-2xl border border-stone-200 shadow-xs text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-[#0F172A]">
                Từ chối truy cập (403) — Khu vực dành riêng cho Giáo viên đã được Quản trị viên duyệt
              </h2>
              <p className="text-xs text-stone-600 leading-relaxed">
                Hệ thống không cho phép đổi sang vai trò Giáo viên bằng nút giao diện. Giáo viên cần xác minh OTP điện thoại hoặc mã Gmail và được Quản trị viên phê duyệt mới có quyền quản lí lớp và ngân hàng đề.
              </p>
              <button
                type="button"
                onClick={() => setIsAuthOpen(true)}
                className="px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold inline-flex items-center gap-2 cursor-pointer shadow-xs"
              >
                <LogIn className="w-4 h-4" />
                <span>Đăng nhập hoặc Đăng ký Giáo viên</span>
              </button>
            </div>
          )
        )}

        {currentTab === 'admin' && (
          isAdminVerified && currentUser ? (
            <AdminPortal />
          ) : (
            <div className="my-12 max-w-lg mx-auto p-6 bg-white rounded-2xl border border-stone-200 shadow-xs text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-700 flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-[#0F172A]">
                Từ chối truy cập (403) — Khu vực Quản trị viên hệ thống
              </h2>
              <p className="text-xs text-stone-600 leading-relaxed">
                Quản trị viên là vai trò được cấp an toàn phía máy chủ; người dùng không thể tự chọn hoặc tự nâng quyền qua giao diện.
              </p>
              <button
                type="button"
                onClick={() => setIsAuthOpen(true)}
                className="px-5 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold inline-flex items-center gap-2 cursor-pointer shadow-xs"
              >
                <LogIn className="w-4 h-4" />
                <span>Đăng nhập Quản trị viên</span>
              </button>
            </div>
          )
        )}
      </main>

      {/* Modals */}
      {isAuthOpen && (
        <AuthModal
          isOpen={isAuthOpen}
          currentUser={currentUser}
          onClose={() => setIsAuthOpen(false)}
          onLoginSuccess={handleLoginSuccess}
          onLogout={handleLogout}
        />
      )}

      {isSurveyOpen && (
        <StudentSurveyModal
          isOpen={isSurveyOpen}
          initialData={survey}
          onClose={() => setIsSurveyOpen(false)}
          onSave={handleSaveSurvey}
        />
      )}

      {isGuideOpen && (
        <GuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
      )}

      {/* Quick Learn Modal from Recommendation or Widget */}
      {modalActiveCard && (
        <KnowledgeCardDetailModal
          card={modalActiveCard}
          isOpen={Boolean(modalActiveCard)}
          interaction={modalActiveCard ? knowledgeInteractions[modalActiveCard.id] : undefined}
          onClose={() => setSelectedKnowledgeCardModalId(null)}
          onToggleBookmark={handleToggleBookmark}
          onToggleNeedsReview={handleToggleNeedsReview}
          onRecordStudy={handleRecordStudy}
          onRecordPracticeScore={handleRecordPracticeScore}
          onNavigateToExercise={handleNavigateToExercise}
        />
      )}

      {/* Clean Footer - Ẩn khi đang trong Chế độ Tập trung (Focus Mode) */}
      {!isPracticeFocusActive && (
        <footer className="border-t border-stone-200/80 bg-[#F5F1E9] py-8 text-xs text-stone-600">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
            <div className="space-y-1">
              <div className="font-bold text-[#0F172A] text-sm flex items-center gap-2 justify-center sm:justify-start">
                <span>VănAI 12 – Trợ lý đọc hiểu và viết</span>
                <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  <span>Sản phẩm Chính thức THPT 2026</span>
                </span>
              </div>
              <p className="text-stone-500 text-[11px]">
                Ứng dụng sư phạm rèn luyện năng lực môn Ngữ văn dành cho học sinh lớp 12 ôn thi tốt nghiệp THPT.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-4 text-stone-600 text-[11px]">
              <button
                onClick={() => setCurrentTab('home')}
                className="hover:text-[#0F172A] transition-colors cursor-pointer"
              >
                Trang chủ
              </button>
              <span aria-hidden="true">·</span>
              <button
                onClick={() => setCurrentTab('knowledge')}
                className="hover:text-[#0F172A] font-semibold text-emerald-900 transition-colors cursor-pointer"
              >
                Góc tri thức Ngữ văn
              </button>
              <span aria-hidden="true">·</span>
              <button
                onClick={() => setIsSurveyOpen(true)}
                className="hover:text-[#0F172A] transition-colors cursor-pointer"
              >
                Khảo sát năng lực
              </button>
              <span aria-hidden="true">·</span>
              <button
                onClick={() => setCurrentTab('reading')}
                className="hover:text-[#0F172A] transition-colors cursor-pointer"
              >
                Luyện đọc hiểu
              </button>
              <span aria-hidden="true">·</span>
              <button
                onClick={() => setCurrentTab('writing')}
                className="hover:text-[#0F172A] transition-colors cursor-pointer"
              >
                Huấn luyện viết
              </button>
              <span aria-hidden="true">·</span>
              <button
                onClick={() => {
                  if (isTeacherVerified) {
                    setCurrentTab('teacher');
                  } else {
                    setIsAuthOpen(true);
                  }
                }}
                className="hover:text-[#0F172A] transition-colors cursor-pointer"
              >
                Phân hệ giáo viên
              </button>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
