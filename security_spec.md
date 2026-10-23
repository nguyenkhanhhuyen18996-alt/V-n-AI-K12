# VănAI 12 — Security Specification (`security_spec.md`)

## 1. Data Invariants & Master Source of Truth

1. **Identity & Role Integrity (`UserProfile` at `/users/{userId}`)**:
   - A `UserProfile` document ID `{userId}` MUST strictly equal `request.auth.uid` and `incoming().uid`.
   - Self-assigned `teacher` privilege is strictly prohibited unless the authenticated user is the bootstrapped teacher admin (`nguyenkhanhhuyen18996@gmail.com` with `email_verified == true`) or exists in `/admins/{userId}`.
   - Students (`role == 'student'`) can never escalate their own `role` to `'teacher'` on create or update.
   - `uid` and `createdAt` are immortal fields and cannot be mutated on update.

2. **PII Isolation (`UserPrivateInfo` at `/users/{userId}/private/{docId}`)**:
   - Email and private contact metadata are stored strictly in `/users/{userId}/private/{docId}`.
   - Only the owner (`request.auth.uid == userId`) or a verified teacher/admin (`isAdmin()`) can read or write `/users/{userId}/private/{docId}`, and the parent `/users/{userId}` document must exist (Master Gate).

3. **Teacher-Managed Roster (`StudentRosterItem` at `/student_rosters/{rosterId}`)**:
   - Only verified teachers/admins (`isAdmin()`) can create, update, or delete roster items.
   - Students can only read a roster item if `resource.data.linkedUid == request.auth.uid`.

4. **Complete Exams (`ExamDocument` at `/exams/{examId}`)**:
   - Only verified teachers/admins (`isAdmin()`) can create, update, or delete exams, and `authorUid` must match `request.auth.uid` on creation.
   - Students can only read exams whose `status == 'assigned'`.

5. **Exam Submissions (`ExamSubmissionDocument` at `/exam_submissions/{submissionId}`)**:
   - A submission cannot exist unless the referenced `/exams/{examId}` document exists (`exists(/databases/$(database)/documents/exams/$(incoming().examId))`).
   - Students can only create a submission where `studentUid == request.auth.uid` and initial `status` is `'submitted'` or `'ai_evaluated'` (never `'teacher_approved'`).
   - Once `status == 'teacher_approved'` (terminal state), students are locked out from modifying the submission; only `isAdmin()` can update `confirmedTotal`, `teacherNotes`, and `status`.
   - `list` queries on `/exam_submissions` strictly enforce `resource.data.studentUid == request.auth.uid || isAdmin()`.

6. **Practice Records (`PracticeRecordDocument` at `/practice_records/{recordId}`)**:
   - Students can only create or read practice records where `studentUid == request.auth.uid`.
   - Students cannot set `scoreStatus == 'teacher_approved'` or modify `teacherConfirmedScore`; only `isAdmin()` can approve practice scores.

---

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Payload 1 — Privilege Escalation on User Profile Creation (Self-Assigned Teacher Role)**
   ```json
   {
     "path": "/users/student_uid_1",
     "auth": { "uid": "student_uid_1", "email": "hs1@thpt.edu.vn", "email_verified": true },
     "operation": "create",
     "data": {
       "uid": "student_uid_1",
       "username": "12A1-01",
       "fullName": "Hacker Student",
       "role": "teacher",
       "className": "12A1",
       "status": "active",
       "surveyCompleted": false,
       "targetScore": 8,
       "createdAt": "REQUEST_TIME",
       "updatedAt": "REQUEST_TIME"
     }
   }
   ```

2. **Payload 2 — Shadow Field Injection on User Profile Update ("Ghost Field" Attack)**
   ```json
   {
     "path": "/users/student_uid_1",
     "auth": { "uid": "student_uid_1", "email": "hs1@thpt.edu.vn", "email_verified": true },
     "operation": "update",
     "data": {
       "targetScore": 9.0,
       "isAdmin": true,
       "updatedAt": "REQUEST_TIME"
     }
   }
   ```

3. **Payload 3 — Unverified Email Admin Spoofing Attack**
   ```json
   {
     "path": "/exams/exam_spoof_1",
     "auth": { "uid": "attacker_uid", "email": "nguyenkhanhhuyen18996@gmail.com", "email_verified": false },
     "operation": "create",
     "data": {
       "id": "exam_spoof_1",
       "code": "THPT-01",
       "title": "Spoofed Exam",
       "templateType": "template_a",
       "status": "assigned",
       "authorUid": "attacker_uid",
       "readingPassageContent": "Nội dung...",
       "paragraphPrompt": "Câu 1...",
       "essayPrompt": "Câu 2...",
       "totalScore": 10,
       "durationMinutes": 120,
       "createdAt": "REQUEST_TIME",
       "updatedAt": "REQUEST_TIME"
     }
   }
   ```

4. **Payload 4 — Cross-User PII Leak on `/users/{userId}/private/info`**
   ```json
   {
     "path": "/users/victim_uid/private/info",
     "auth": { "uid": "other_student_uid", "email": "other@thpt.edu.vn", "email_verified": true },
     "operation": "get"
   }
   ```

5. **Payload 5 — Orphaned Exam Submission (Non-Existent `examId`)**
   ```json
   {
     "path": "/exam_submissions/sub_orphan_1",
     "auth": { "uid": "student_uid_1", "email": "hs1@thpt.edu.vn", "email_verified": true },
     "operation": "create",
     "data": {
       "id": "sub_orphan_1",
       "examId": "non_existent_exam_999",
       "studentUid": "student_uid_1",
       "studentCode": "12A1-01",
       "studentName": "Nguyễn Văn A",
       "className": "12A1",
       "status": "ai_evaluated",
       "paragraphText": "Đoạn văn...",
       "essayText": "Bài văn...",
       "proposedTotal": 7.5,
       "createdAt": "REQUEST_TIME",
       "updatedAt": "REQUEST_TIME"
     }
   }
   ```

6. **Payload 6 — Student Self-Approving Official Exam Grade (`status: "teacher_approved"`)**
   ```json
   {
     "path": "/exam_submissions/sub_valid_1",
     "auth": { "uid": "student_uid_1", "email": "hs1@thpt.edu.vn", "email_verified": true },
     "operation": "update",
     "data": {
       "status": "teacher_approved",
       "confirmedTotal": 10.0,
       "updatedAt": "REQUEST_TIME"
     }
   }
   ```

7. **Payload 7 — Terminal State Mutation After Teacher Approval**
   ```json
   {
     "path": "/exam_submissions/sub_approved_1",
     "auth": { "uid": "student_uid_1", "email": "hs1@thpt.edu.vn", "email_verified": true },
     "operation": "update",
     "data": {
       "essayText": "Sửa lại bài văn sau khi giáo viên đã chấm...",
       "updatedAt": "REQUEST_TIME"
     }
   }
   ```

8. **Payload 8 — Identity Spoofing on Submission Creation (`studentUid` Mismatch)**
   ```json
   {
     "path": "/exam_submissions/sub_spoof_1",
     "auth": { "uid": "student_uid_1", "email": "hs1@thpt.edu.vn", "email_verified": true },
     "operation": "create",
     "data": {
       "id": "sub_spoof_1",
       "examId": "existing_exam_1",
       "studentUid": "victim_student_uid",
       "studentCode": "12A1-02",
       "studentName": "Victim Student",
       "className": "12A1",
       "status": "submitted",
       "paragraphText": "Bài nộp giả mạo",
       "essayText": "Bài nộp giả mạo",
       "proposedTotal": 1.0,
       "createdAt": "REQUEST_TIME",
       "updatedAt": "REQUEST_TIME"
     }
   }
   ```

9. **Payload 9 — ID Poisoning Attack (Invalid Characters / Oversized Document ID)**
   ```json
   {
     "path": "/practice_records/invalid$id#with!spaces",
     "auth": { "uid": "student_uid_1", "email": "hs1@thpt.edu.vn", "email_verified": true },
     "operation": "create",
     "data": {
       "id": "invalid$id#with!spaces",
       "studentUid": "student_uid_1",
       "recordType": "writing",
       "title": "Bài luyện",
       "content": "Nội dung",
       "aiSuggestedScore": 3.0,
       "scoreStatus": "ai_suggested",
       "createdAt": "REQUEST_TIME",
       "updatedAt": "REQUEST_TIME"
     }
   }
   ```

10. **Payload 10 — Value Poisoning on Update (Invalid Type / Boundary Overflow)**
    ```json
    {
      "path": "/users/student_uid_1",
      "auth": { "uid": "student_uid_1", "email": "hs1@thpt.edu.vn", "email_verified": true },
      "operation": "update",
      "data": {
        "targetScore": 99999,
        "updatedAt": "REQUEST_TIME"
      }
    }
    ```

11. **Payload 11 — Forged Client Timestamp (`createdAt != request.time`)**
    ```json
    {
      "path": "/practice_records/rec_forged_time",
      "auth": { "uid": "student_uid_1", "email": "hs1@thpt.edu.vn", "email_verified": true },
      "operation": "create",
      "data": {
        "id": "rec_forged_time",
        "studentUid": "student_uid_1",
        "recordType": "reading",
        "title": "Đọc hiểu",
        "content": "Trả lời",
        "aiSuggestedScore": 3.5,
        "scoreStatus": "ai_suggested",
        "createdAt": "2020-01-01T00:00:00Z",
        "updatedAt": "2020-01-01T00:00:00Z"
      }
    }
    ```

12. **Payload 12 — Unauthorized List Query Scraping Other Students' Submissions**
    ```json
    {
      "path": "/exam_submissions",
      "auth": { "uid": "student_uid_1", "email": "hs1@thpt.edu.vn", "email_verified": true },
      "operation": "list",
      "query": "where('className', '==', '12A1')"
    }
    ```
