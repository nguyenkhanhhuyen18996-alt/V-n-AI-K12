/**
 * Test Runner Specification for VănAI 12 Firestore Security Rules
 * Verifies that all 12 "Dirty Dozen" adversarial payloads return PERMISSION_DENIED.
 */

export interface SecurityTestCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  expectedOutcome: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_SECURITY_TESTS: SecurityTestCase[] = [
  {
    id: 1,
    name: 'Privilege Escalation on User Profile Creation (Self-Assigned Teacher Role)',
    collectionPath: '/users/student_uid_1',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 2,
    name: 'Shadow Field Injection on User Profile Update ("Ghost Field" Attack)',
    collectionPath: '/users/student_uid_1',
    operation: 'update',
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 3,
    name: 'Unverified Email Admin Spoofing Attack',
    collectionPath: '/exams/exam_spoof_1',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 4,
    name: 'Cross-User PII Leak on /users/{userId}/private/info',
    collectionPath: '/users/victim_uid/private/info',
    operation: 'get',
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 5,
    name: 'Orphaned Exam Submission (Non-Existent examId)',
    collectionPath: '/exam_submissions/sub_orphan_1',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 6,
    name: 'Student Self-Approving Official Exam Grade',
    collectionPath: '/exam_submissions/sub_valid_1',
    operation: 'update',
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 7,
    name: 'Terminal State Mutation After Teacher Approval',
    collectionPath: '/exam_submissions/sub_approved_1',
    operation: 'update',
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 8,
    name: 'Identity Spoofing on Submission Creation (studentUid Mismatch)',
    collectionPath: '/exam_submissions/sub_spoof_1',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 9,
    name: 'ID Poisoning Attack (Invalid Characters / Oversized Document ID)',
    collectionPath: '/practice_records/invalid$id#with!spaces',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 10,
    name: 'Value Poisoning on Update (Boundary Overflow targetScore > 10)',
    collectionPath: '/users/student_uid_1',
    operation: 'update',
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 11,
    name: 'Forged Client Timestamp (createdAt != request.time)',
    collectionPath: '/practice_records/rec_forged_time',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 12,
    name: 'Unauthorized List Query Scraping Other Students Submissions',
    collectionPath: '/exam_submissions',
    operation: 'list',
    expectedOutcome: 'PERMISSION_DENIED'
  }
];
