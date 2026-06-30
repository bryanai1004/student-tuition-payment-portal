-- DEPRECATED SNAPSHOT — do not use to bootstrap new environments.
-- Generated from MySQL SHOW CREATE TABLE output (school database import).
-- Missing: RLS, FK batches, student_course_bin, portal_store_orders, admin_users.username, etc.
-- Authoritative schema evolution: supabase/migrations/ — see docs/database-migrations.md
-- This file contains PostgreSQL DDL only and is not executed by any script.


CREATE TABLE "Test" (
    "ID" SERIAL NOT NULL,
    "test1" text CHARACTER SET big5 NOT NULL,
    "test2" text CHARACTER SET big5 NOT NULL,
    "test3" decimal(11 ,2) NOT NULL,
    "test4" integer NOT NULL,
    PRIMARY KEY ("ID")
);

CREATE TABLE "academic_terms" (
    "id" varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
    "term_label" varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
    "year" integer NOT NULL,
    "term_name" varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
    "quarter_index" integer NOT NULL,
    "sequence_no" integer NOT NULL,
    "start_date" date,
    "end_date" date,
    "registration_open" date,
    "registration_close" date,
    "payment_due_date" date,
    "lock_registration_if_overdue" boolean NOT NULL DEFAULT FALSE,
    "status" varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
    "is_visible" boolean NOT NULL DEFAULT TRUE,
    "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdraw_deadline" date,
    "is_posted_to_dashboard" boolean NOT NULL DEFAULT FALSE,
    "clinic_appointment_deadline" date,
    PRIMARY KEY ("id"),
    CONSTRAINT "uq_academic_terms_year_quarter" UNIQUE ("year", "quarter_index"),
    CONSTRAINT "uq_academic_terms_sequence_no" UNIQUE ("sequence_no"),
    CONSTRAINT "chk_academic_terms_status" CHECK (("status" in (_utf8mb4'planned',_utf8mb4'registration_open',_utf8mb4'in_progress',_utf8mb4'completed'))),
    CONSTRAINT "chk_academic_terms_term_name" CHECK (("term_name" in (_utf8mb4'Winter',_utf8mb4'Spring',_utf8mb4'Summer',_utf8mb4'Fall')))
);
CREATE INDEX "idx_academic_terms_visible_sequence" ON "academic_terms" ("is_visible", "sequence_no");
CREATE INDEX "idx_academic_terms_status_sequence" ON "academic_terms" ("status", "sequence_no");

CREATE TABLE "accounting" (
    "seqNumber" SERIAL NOT NULL,
    "id" text NOT NULL,
    "year" integer NOT NULL,
    "term" text NOT NULL,
    "date" integer NOT NULL,
    "type" text NOT NULL,
    "code" text NOT NULL,
    "debit" decimal(11 ,2) NOT NULL,
    "credit" decimal(11 ,2) NOT NULL,
    "memo" text NOT NULL,
    PRIMARY KEY ("seqNumber")
);

CREATE TABLE "accounting_drop_log" (
    "seqNumber" SERIAL NOT NULL,
    "id" text NOT NULL,
    "year" integer NOT NULL,
    "term" text NOT NULL,
    "date" integer NOT NULL,
    "type" text NOT NULL,
    "code" text NOT NULL,
    "debit" decimal(11 ,2) NOT NULL,
    "credit" decimal(11 ,2) NOT NULL,
    "memo" text NOT NULL,
    "time" text NOT NULL,
    PRIMARY KEY ("seqNumber")
);

CREATE TABLE "acknowledgement_quiz_answers" (
    "id" SERIAL NOT NULL,
    "quiz_question_id" integer NOT NULL,
    "answer_order" integer NOT NULL,
    "answer" text CHARACTER SET big5 NOT NULL,
    "correct_answer" smallint NOT NULL,
    PRIMARY KEY ("id")
);

CREATE TABLE "acknowledgement_quiz_questions" (
    "id" SERIAL NOT NULL,
    "question" text CHARACTER SET big5 NOT NULL,
    "question_type" text CHARACTER SET big5 NOT NULL,
    PRIMARY KEY ("id")
);

CREATE TABLE "acknowledgement_quiz_records" (
    "id" SERIAL NOT NULL,
    "student_id" text CHARACTER SET big5 NOT NULL,
    "record_time" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "question_type" text CHARACTER SET big5 NOT NULL,
    PRIMARY KEY ("id")
);

CREATE TABLE "adddrop_log" (
    "seqNumber" SERIAL NOT NULL,
    "username" text NOT NULL,
    "id" text NOT NULL,
    "code" text NOT NULL,
    "action" text NOT NULL,
    "date" text NOT NULL,
    PRIMARY KEY ("seqNumber")
);

CREATE TABLE "admin" (
    "seqNum" SERIAL NOT NULL,
    "year" integer NOT NULL,
    "term" text NOT NULL,
    "date_from" date NOT NULL,
    "date_to" date NOT NULL,
    "date_from2" date NOT NULL,
    "date_to2" date NOT NULL,
    "type" text NOT NULL,
    PRIMARY KEY ("seqNum")
);

CREATE TABLE "admin_users" (
    "id" BIGSERIAL NOT NULL,
    "email" varchar(255) NOT NULL,
    "password_hash" varchar(255) NOT NULL,
    "role" varchar(50) NOT NULL DEFAULT 'admin',
    "created_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id"),
    CONSTRAINT "email" UNIQUE ("email")
);

CREATE TABLE "block_log" (
    "id" text CHARACTER SET latin1 NOT NULL,
    "message" text CHARACTER SET latin1 NOT NULL,
    "date" text CHARACTER SET latin1 NOT NULL
);

CREATE TABLE "chineseDesc" (
    "seqNumber" SERIAL NOT NULL,
    "title" text CHARACTER SET latin1 NOT NULL,
    "description" text CHARACTER SET utf8mb3 NOT NULL,
    PRIMARY KEY ("seqNumber")
);

CREATE TABLE "clinic" (
    "seqNumber" SERIAL NOT NULL,
    "name" text NOT NULL,
    "id" text NOT NULL,
    "code" text NOT NULL,
    "grade" text NOT NULL,
    "grade2" decimal(11 ,2) NOT NULL DEFAULT '0.00',
    "course_title" text NOT NULL,
    "units" decimal(11 ,1) NOT NULL,
    "days" text NOT NULL,
    "time_from" time NOT NULL DEFAULT '00:00:00',
    "time_to" time NOT NULL DEFAULT '00:00:00',
    "instructor" text CHARACTER SET utf8mb3 NOT NULL,
    "term" text NOT NULL,
    "year" integer NOT NULL DEFAULT '0',
    "hours" integer NOT NULL DEFAULT '0',
    PRIMARY KEY ("seqNumber")
);

CREATE TABLE "clinic_courses" (
    "sequenceNumber" SERIAL NOT NULL,
    "code" text NOT NULL,
    "title" text CHARACTER SET utf8mb3 NOT NULL,
    "title_chinese" text CHARACTER SET utf8mb3 NOT NULL,
    "units" integer NOT NULL,
    "hours" integer NOT NULL,
    "is_daim" integer NOT NULL,
    PRIMARY KEY ("sequenceNumber")
);

CREATE TABLE "clinic_timetable" (
    "seqNum" SERIAL NOT NULL,
    "year" integer NOT NULL,
    "term" text NOT NULL,
    "day" text NOT NULL,
    "time_from" time NOT NULL,
    "time_to" time NOT NULL,
    "slot" text NOT NULL,
    "instructor_id" text NOT NULL,
    "instructor" text CHARACTER SET utf8mb3 NOT NULL,
    "100Max" integer NOT NULL,
    "200Max" integer NOT NULL,
    "300Max" integer NOT NULL,
    "123Max" integer NOT NULL,
    PRIMARY KEY ("seqNum")
);

CREATE TABLE "clinical_assignments" (
    "id" SERIAL NOT NULL,
    "student_id" varchar(20) NOT NULL,
    "course_code" varchar(20) NOT NULL,
    "session_date" date NOT NULL,
    "session_name" varchar(255),
    "site" varchar(255),
    "faculty" varchar(255),
    "status" varchar(50) NOT NULL DEFAULT 'Scheduled',
    "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "timetable_id" integer,
    "term" varchar(20),
    "year" integer,
    PRIMARY KEY ("id")
);
CREATE INDEX "idx_clinical_assignments_student_date" ON "clinical_assignments" ("student_id", "session_date");
CREATE INDEX "idx_clinical_assignments_timetable" ON "clinical_assignments" ("timetable_id");

CREATE TABLE "clinical_booking_payment_holds" (
    "id" BIGSERIAL NOT NULL,
    "clinical_enrollment_id" bigint NOT NULL,
    "student_id" varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
    "billing_adjustment_id" bigint NOT NULL,
    "term" varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
    "year" integer NOT NULL,
    "charge_amount" decimal(12 ,2) NOT NULL,
    "balance_before_charge" decimal(12 ,2) NOT NULL,
    "hold_expires_at" timestamp NOT NULL,
    "status" varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
    "satisfied_at" timestamp,
    "auto_dropped_at" timestamp,
    "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id")
);
CREATE INDEX "idx_cbph_enrollment" ON "clinical_booking_payment_holds" ("clinical_enrollment_id");
CREATE INDEX "idx_cbph_status_expires" ON "clinical_booking_payment_holds" ("status", "hold_expires_at");
CREATE INDEX "idx_cbph_student" ON "clinical_booking_payment_holds" ("student_id");
CREATE INDEX "idx_cbph_adjustment" ON "clinical_booking_payment_holds" ("billing_adjustment_id");

CREATE TABLE "clinical_enrollments" (
    "id" SERIAL NOT NULL,
    "student_id" varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
    "timetable_id" integer NOT NULL,
    "term" varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
    "year" integer NOT NULL,
    "status" varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'enrolled',
    "seat_bucket" varchar(10) COLLATE utf8mb4_unicode_ci,
    "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id"),
    CONSTRAINT "uq_clinical_enrollment_student_slot_term_year" UNIQUE ("student_id", "timetable_id", "term", "year")
);
CREATE INDEX "idx_clinical_enrollments_student_id" ON "clinical_enrollments" ("student_id");
CREATE INDEX "idx_clinical_enrollments_timetable_id" ON "clinical_enrollments" ("timetable_id");
CREATE INDEX "idx_clinical_enrollments_slot_term_year_status" ON "clinical_enrollments" ("timetable_id", "term", "year", "status");

CREATE TABLE "clinical_exam_requests" (
    "id" BIGSERIAL NOT NULL,
    "student_id" varchar(20) NOT NULL,
    "exam_code" varchar(20) NOT NULL,
    "exam_name" varchar(255) NOT NULL,
    "term" varchar(20) NOT NULL,
    "year" integer NOT NULL,
    "status" varchar(32) NOT NULL DEFAULT 'requested',
    "assigned_exam_date" date,
    "assigned_exam_time" time,
    "assigned_by" varchar(255),
    "assigned_at" timestamp,
    "notes" text,
    "billing_adjustment_id" bigint,
    "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id")
);
CREATE INDEX "idx_exam_student" ON "clinical_exam_requests" ("student_id");
CREATE INDEX "idx_exam_status" ON "clinical_exam_requests" ("status");
CREATE INDEX "idx_exam_student_code" ON "clinical_exam_requests" ("student_id", "exam_code");

CREATE TABLE "clinical_requests" (
    "id" SERIAL NOT NULL,
    "student_id" varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
    "timetable_id" integer NOT NULL,
    "term" varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
    "year" integer NOT NULL,
    "status" varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
    "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" timestamp NULL,
    "decided_by" varchar(255) COLLATE utf8mb4_unicode_ci,
    PRIMARY KEY ("id")
);
CREATE INDEX "idx_student_id" ON "clinical_requests" ("student_id");
CREATE INDEX "idx_status" ON "clinical_requests" ("status");

CREATE TABLE "copyright_release_agreement" (
    "id" SERIAL NOT NULL,
    "student_id" text CHARACTER SET big5 NOT NULL,
    "year" integer NOT NULL,
    "term" text CHARACTER SET big5 NOT NULL,
    "click_datetime" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id")
);
CREATE INDEX "id" ON "copyright_release_agreement" ("id");

CREATE TABLE "course_category" (
    "id" SERIAL NOT NULL,
    "category_id" text CHARACTER SET latin1 NOT NULL,
    "category_name" text CHARACTER SET latin1 NOT NULL,
    PRIMARY KEY ("id")
);

CREATE TABLE "course_feedback" (
    "id" BIGSERIAL NOT NULL,
    "student_id" varchar(64) NOT NULL,
    "course_code" varchar(32) NOT NULL,
    "term" varchar(32) NOT NULL,
    "year" integer NOT NULL,
    "q1_rating" integer NOT NULL,
    "q2_rating" integer NOT NULL,
    "q3_rating" integer NOT NULL,
    "q4_rating" integer NOT NULL,
    "q5_rating" integer NOT NULL,
    "overall_rating" integer NOT NULL,
    "comment" text,
    "submitted_at" timestamp DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id"),
    CONSTRAINT "uniq_feedback" UNIQUE ("student_id", "course_code", "term", "year")
);

CREATE TABLE "course_sections" (
    "id" SERIAL NOT NULL,
    "course_code" varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
    "term" varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
    "year" integer NOT NULL,
    "section_code" varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
    "weekday" varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
    "start_time" time,
    "end_time" time,
    "delivery_mode" varchar(64) COLLATE utf8mb4_unicode_ci,
    "room" varchar(128) COLLATE utf8mb4_unicode_ci,
    "instructor" varchar(255) COLLATE utf8mb4_unicode_ci,
    "notes" text COLLATE utf8mb4_unicode_ci,
    "prerequisite_course_id" varchar(64) COLLATE utf8mb4_unicode_ci,
    "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "schedule_track" varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'EN',
    PRIMARY KEY ("id"),
    CONSTRAINT "uq_course_sections_offer" UNIQUE ("course_code", "term", "year", "section_code")
);
CREATE INDEX "idx_course_sections_course" ON "course_sections" ("course_code");
CREATE INDEX "idx_course_sections_course_term_year" ON "course_sections" ("course_code", "term", "year");
CREATE INDEX "idx_course_sections_prerequisite_course_id" ON "course_sections" ("prerequisite_course_id");

CREATE TABLE "course_withdraw_date" (
    "id" SERIAL NOT NULL,
    "students_id" text NOT NULL,
    "courses_id" text NOT NULL,
    "date" date NOT NULL,
    "year" integer NOT NULL,
    "term" text NOT NULL,
    PRIMARY KEY ("id")
);

CREATE TABLE "courses" (
    "sequenceNumber" SERIAL NOT NULL,
    "code" text NOT NULL,
    "eng_name" text NOT NULL,
    "chi_name" text CHARACTER SET utf8mb3 NOT NULL,
    "units" decimal(11 ,1) NOT NULL,
    "prerequisites" text NOT NULL,
    "concurrent" text NOT NULL,
    "is_daim" smallint NOT NULL,
    "clinicL1Required" smallint NOT NULL DEFAULT '0',
    "clinicL2Required" smallint NOT NULL DEFAULT '0',
    "category" text NOT NULL,
    PRIMARY KEY ("sequenceNumber")
);

CREATE TABLE "courses_equivalency" (
    "id" SERIAL NOT NULL,
    "code1" text CHARACTER SET big5 NOT NULL,
    "code2" text CHARACTER SET big5 NOT NULL,
    PRIMARY KEY ("id")
);

CREATE TABLE "daim_clinic_timetable" (
    "id" SERIAL NOT NULL,
    "code" text CHARACTER SET latin1 NOT NULL,
    "year" integer NOT NULL,
    "term" text CHARACTER SET latin1 NOT NULL,
    "day" text CHARACTER SET latin1 NOT NULL,
    "time_from" time NOT NULL,
    "time_to" time NOT NULL,
    "instructor_id" text CHARACTER SET latin1 NOT NULL,
    "instructor" text CHARACTER SET utf8mb3 NOT NULL,
    PRIMARY KEY ("id")
);

CREATE TABLE "daim_students_info" (
    "id" SERIAL NOT NULL,
    "student_id" varchar(10) CHARACTER SET latin1 NOT NULL,
    "daim_status" text CHARACTER SET big5 NOT NULL,
    "daim_background" text CHARACTER SET big5 NOT NULL,
    "daim_signed_date" date NOT NULL,
    "daim_tertiary" text CHARACTER SET big5 NOT NULL,
    "daim_requirements_id" integer NOT NULL,
    "daim_financial_aid" integer NOT NULL,
    "daim_grad_date" date NOT NULL,
    "daim_grad_term" text CHARACTER SET big5 NOT NULL,
    "daim_grad_year" integer NOT NULL,
    "daim_grad_check_out" integer NOT NULL,
    PRIMARY KEY ("id"),
    CONSTRAINT "student_id" UNIQUE ("student_id")
);

CREATE TABLE "daim_timetable" (
    "seqNum" SERIAL NOT NULL,
    "year" integer NOT NULL,
    "term" text CHARACTER SET latin1 NOT NULL,
    "day" text CHARACTER SET latin1 NOT NULL,
    "time_from" time NOT NULL,
    "time_to" time NOT NULL,
    "course" text CHARACTER SET latin1 NOT NULL,
    "instructor_id" text CHARACTER SET latin1 NOT NULL,
    "instructor" text CHARACTER SET latin1 NOT NULL,
    PRIMARY KEY ("seqNum")
);

CREATE TABLE "daim_timetable2" (
    "seqNum" SERIAL NOT NULL,
    "year" integer NOT NULL,
    "term" text CHARACTER SET latin1 NOT NULL,
    "day" text CHARACTER SET latin1 NOT NULL,
    "time_from" time NOT NULL,
    "time_to" time NOT NULL,
    "course" text CHARACTER SET latin1 NOT NULL,
    "instructor_id" text CHARACTER SET latin1 NOT NULL,
    "instructor" text CHARACTER SET latin1 NOT NULL,
    PRIMARY KEY ("seqNum")
);

CREATE TABLE "day_order" (
    "seqNumber" SERIAL NOT NULL,
    "day" text CHARACTER SET latin1 NOT NULL,
    "order" integer NOT NULL,
    PRIMARY KEY ("seqNumber")
);

CREATE TABLE "default_view" (
    "ID" SERIAL NOT NULL,
    "year" integer NOT NULL,
    "term" text CHARACTER SET big5 NOT NULL,
    "description" text CHARACTER SET big5 NOT NULL,
    PRIMARY KEY ("ID")
);

CREATE TABLE "evaluation_answers" (
    "id" SERIAL NOT NULL,
    "answer_type" text CHARACTER SET big5 NOT NULL,
    "answer_english" text CHARACTER SET big5 NOT NULL,
    "answer_chinese" text CHARACTER SET big5 NOT NULL,
    "active" smallint NOT NULL,
    PRIMARY KEY ("id")
);

CREATE TABLE "evaluation_questions" (
    "id" SERIAL NOT NULL,
    "question_type" text CHARACTER SET big5 NOT NULL,
    "question_english" text CHARACTER SET big5 NOT NULL,
    "question_chinese" text CHARACTER SET big5 NOT NULL,
    "active" smallint NOT NULL DEFAULT '1',
    PRIMARY KEY ("id")
);

CREATE TABLE "evaluations" (
    "id" SERIAL NOT NULL,
    "marks_id" integer NOT NULL,
    "evaluation_questions_id" integer NOT NULL,
    "answer" integer NOT NULL,
    PRIMARY KEY ("id")
);

CREATE TABLE "evaluations_clinic" (
    "id" SERIAL NOT NULL,
    "clinic_id" integer NOT NULL,
    "evaluation_questions_id" integer NOT NULL,
    "answer" integer NOT NULL,
    PRIMARY KEY ("id")
);

CREATE TABLE "evaluations_clinic_comment" (
    "id" SERIAL NOT NULL,
    "clinic_id" integer NOT NULL,
    "comment" text CHARACTER SET big5 NOT NULL,
    PRIMARY KEY ("id")
);

CREATE TABLE "evaluations_comment" (
    "id" SERIAL NOT NULL,
    "marks_id" integer NOT NULL,
    "comment" text CHARACTER SET utf8mb3 NOT NULL,
    PRIMARY KEY ("id")
);

CREATE TABLE "gpa_list" (
    "id" SERIAL NOT NULL,
    "letter_grade" text CHARACTER SET latin1 NOT NULL,
    "gpa_grade" decimal(11 ,2) NOT NULL,
    "grade_order" integer NOT NULL,
    PRIMARY KEY ("id")
);

CREATE TABLE "instructors" (
    "sequenceNumber" SERIAL NOT NULL,
    "instructor_id" text NOT NULL,
    "name_chi" text CHARACTER SET utf8mb3 NOT NULL,
    "name_eng" text NOT NULL,
    PRIMARY KEY ("sequenceNumber")
);

CREATE TABLE "loa" (
    "seqNumber" SERIAL NOT NULL,
    "student_id" text CHARACTER SET latin1 NOT NULL,
    "absent_quarter" text CHARACTER SET latin1 NOT NULL,
    "absent_year" integer NOT NULL,
    "absent_starting_date" date NOT NULL,
    "return_quarter" text CHARACTER SET latin1 NOT NULL,
    "return_year" integer,
    "return_date" date,
    "reasons" text CHARACTER SET latin1 NOT NULL,
    "HasStuReturned" text CHARACTER SET latin1 NOT NULL,
    "actual_return" date,
    PRIMARY KEY ("seqNumber")
);

CREATE TABLE "marks" (
    "seqNumber" SERIAL NOT NULL,
    "name" text CHARACTER SET latin1 NOT NULL,
    "id" text CHARACTER SET latin1 NOT NULL,
    "regis" integer NOT NULL DEFAULT '0',
    "code" text CHARACTER SET latin1 NOT NULL,
    "grade" text CHARACTER SET latin1 NOT NULL,
    "grade2" decimal(11 ,2) NOT NULL DEFAULT '0.00',
    "course_title" text CHARACTER SET utf8mb3 NOT NULL,
    "units" decimal(11 ,1) NOT NULL,
    "days" text CHARACTER SET latin1,
    "time_from" time DEFAULT '00:00:00',
    "time_to" time DEFAULT '00:00:00',
    "instructor" text CHARACTER SET utf8mb3 NOT NULL,
    "term" text CHARACTER SET latin1 NOT NULL,
    "year" integer NOT NULL DEFAULT '0',
    "language" text CHARACTER SET latin1 NOT NULL,
    "indie_study" text CHARACTER SET utf8mb3 NOT NULL,
    PRIMARY KEY ("seqNumber")
);

CREATE TABLE "marks_log" (
    "seqNum" SERIAL NOT NULL,
    "username" text NOT NULL,
    "id" text NOT NULL,
    "code" text NOT NULL,
    "mark_from" text NOT NULL,
    "mark_to" text NOT NULL,
    "date" text NOT NULL,
    PRIMARY KEY ("seqNum")
);

CREATE TABLE "password_staff" (
    "sequenceNumber" SERIAL NOT NULL,
    "id" text NOT NULL,
    "password" text NOT NULL,
    "title" text NOT NULL,
    "isLockedOut" integer NOT NULL,
    "passwordChanged" text NOT NULL,
    PRIMARY KEY ("sequenceNumber")
);

CREATE TABLE "password_stu" (
    "seqNum" SERIAL NOT NULL,
    "id" text NOT NULL,
    "password" text NOT NULL,
    PRIMARY KEY ("seqNum")
);

CREATE TABLE "portal_billing_adjustments" (
    "id" BIGSERIAL NOT NULL,
    "student_external_id" varchar(64) NOT NULL,
    "term" varchar(32) NOT NULL,
    "year" integer NOT NULL,
    "description" varchar(255) NOT NULL,
    "amount" decimal(12 ,2) NOT NULL,
    "category" enum('tuition' ,'clinical','fees','other') NOT NULL,
    "adjustment_source" varchar(64) NOT NULL DEFAULT 'manual',
    "clinical_enrollment_id" bigint,
    "reversal_of_adjustment_id" bigint,
    PRIMARY KEY ("id")
);
CREATE INDEX "idx_adj_student_term" ON "portal_billing_adjustments" ("student_external_id", "term", "year");
CREATE INDEX "idx_pba_clinical_enrollment_id" ON "portal_billing_adjustments" ("clinical_enrollment_id");
CREATE INDEX "idx_portal_billing_adj_reversal_of_adjustment" ON "portal_billing_adjustments" ("reversal_of_adjustment_id");

CREATE TABLE "portal_courses" (
    "course_id" varchar(64) NOT NULL,
    "course_code" varchar(32) NOT NULL,
    "title" varchar(255) NOT NULL,
    "type" enum('didactic' ,'lab','clinical','other') NOT NULL,
    "units" decimal(5 ,2),
    "hours" integer,
    PRIMARY KEY ("course_id")
);

CREATE TABLE "portal_document_requirement_attempts" (
    "id" BIGSERIAL NOT NULL,
    "student_external_id" varchar(64) NOT NULL,
    "academic_term_id" varchar(16) NOT NULL,
    "requirement_type" enum('ferpa' ,'titleix','campus','copyright_release_agreement') NOT NULL,
    "attempt_no" integer NOT NULL,
    "submitted_answers_json" jsonb,
    "score_correct" integer,
    "total_questions" integer,
    "is_passed" boolean NOT NULL DEFAULT FALSE,
    "submitted_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id"),
    CONSTRAINT "uq_attempt" UNIQUE ("student_external_id", "academic_term_id", "requirement_type", "attempt_no")
);
CREATE INDEX "idx_student_term_type" ON "portal_document_requirement_attempts" ("student_external_id", "academic_term_id", "requirement_type");

CREATE TABLE "portal_document_requirements" (
    "id" BIGSERIAL NOT NULL,
    "student_external_id" varchar(64) NOT NULL,
    "academic_term_id" varchar(16) NOT NULL,
    "requirement_type" enum('ferpa' ,'titleix','campus','copyright_release_agreement') NOT NULL,
    "status" enum('assigned' ,'completed') NOT NULL DEFAULT 'assigned',
    "score_correct" integer,
    "total_questions" integer,
    "is_passed" boolean NOT NULL DEFAULT FALSE,
    "assigned_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" timestamp NULL,
    "last_reassigned_at" timestamp NULL,
    "assigned_by" varchar(255),
    "reassigned_by" varchar(255),
    "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id"),
    CONSTRAINT "uq_student_term_type" UNIQUE ("student_external_id", "academic_term_id", "requirement_type")
);
CREATE INDEX "idx_student_term" ON "portal_document_requirements" ("student_external_id", "academic_term_id");
CREATE INDEX "idx_term_type" ON "portal_document_requirements" ("academic_term_id", "requirement_type");

CREATE TABLE "portal_enrollments" (
    "id" BIGSERIAL NOT NULL,
    "student_external_id" varchar(64) NOT NULL,
    "course_id" varchar(64) NOT NULL,
    "course_section_id" integer,
    "section_code" varchar(32),
    "schedule_track" varchar(16),
    "term" varchar(32) NOT NULL,
    "year" integer NOT NULL,
    "status" varchar(20) NOT NULL DEFAULT 'active',
    "withdrawn_at" timestamp,
    "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id"),
    CONSTRAINT "uniq_portal_enrollment_student_section_term_year" UNIQUE ("student_external_id", "course_section_id", "term", "year")
);
CREATE INDEX "idx_student_term" ON "portal_enrollments" ("student_external_id", "term", "year");
CREATE INDEX "fk_portal_enrollment_course" ON "portal_enrollments" ("course_id");
CREATE INDEX "idx_portal_enrollments_student_term_year" ON "portal_enrollments" ("student_external_id", "term", "year");
CREATE INDEX "idx_portal_enrollments_course_section" ON "portal_enrollments" ("course_section_id");
CREATE INDEX "idx_portal_enrollments_course_id" ON "portal_enrollments" ("course_id");
CREATE INDEX "idx_portal_enrollments_section_code" ON "portal_enrollments" ("section_code");
ALTER TABLE "portal_enrollments" ADD CONSTRAINT "fk_portal_enrollment_course" FOREIGN KEY ("course_id") REFERENCES "portal_courses" ("course_id");

CREATE TABLE "portal_enrollments_backup_20260410" (
    "id" bigint NOT NULL DEFAULT '0',
    "student_external_id" varchar(64) NOT NULL,
    "course_id" varchar(64) NOT NULL,
    "term" varchar(32) NOT NULL,
    "year" integer NOT NULL,
    "status" varchar(20) NOT NULL DEFAULT 'active',
    "withdrawn_at" timestamp
);

CREATE TABLE "portal_payments" (
    "id" BIGSERIAL NOT NULL,
    "student_external_id" varchar(64) NOT NULL,
    "term" varchar(32) NOT NULL,
    "year" integer NOT NULL,
    "amount" decimal(12 ,2) NOT NULL,
    "paid_at" date NOT NULL,
    "method" varchar(32) NOT NULL,
    "description" varchar(255),
    PRIMARY KEY ("id")
);
CREATE INDEX "idx_pay_student_term" ON "portal_payments" ("student_external_id", "term", "year");

CREATE TABLE "portal_student_term_prefs" (
    "student_external_id" varchar(64) NOT NULL,
    "term" varchar(32) NOT NULL,
    "year" integer NOT NULL,
    "use_installment_plan" boolean NOT NULL DEFAULT FALSE,
    "tuition_paid_in_full_at_reg" boolean NOT NULL DEFAULT FALSE,
    "installment_count" integer NOT NULL DEFAULT '3',
    "registration_period_ends" date,
    PRIMARY KEY ("student_external_id", "term", "year")
);

CREATE TABLE "portal_students" (
    "student_external_id" varchar(64) NOT NULL,
    "full_name" varchar(255) NOT NULL,
    "avatar_object_key" varchar(512),
    PRIMARY KEY ("student_external_id")
);

CREATE TABLE "quarterly_withdrawl" (
    "seqNumber" SERIAL NOT NULL,
    "year" integer NOT NULL,
    "term" text CHARACTER SET big5 NOT NULL,
    "id" text CHARACTER SET big5 NOT NULL,
    "total_units" integer NOT NULL,
    PRIMARY KEY ("seqNumber")
);

CREATE TABLE "registration" (
    "year" integer NOT NULL,
    "term" text CHARACTER SET latin1 NOT NULL,
    "id" text CHARACTER SET latin1 NOT NULL,
    "total_fees" decimal(11 ,2) NOT NULL,
    "date" text CHARACTER SET latin1 NOT NULL
);

CREATE TABLE "requirement_log" (
    "id" SERIAL NOT NULL,
    "students_id" integer NOT NULL,
    "requirements_old" integer NOT NULL,
    "requirements_new" integer NOT NULL,
    "modified_by" text CHARACTER SET big5 NOT NULL,
    "datetime" timestamp NOT NULL,
    PRIMARY KEY ("id")
);

CREATE TABLE "requirements" (
    "id" SERIAL NOT NULL,
    "year_from" integer NOT NULL,
    "year_to" integer,
    "academic_units" integer NOT NULL,
    "clinic_hours" integer NOT NULL,
    PRIMARY KEY ("id")
);

CREATE TABLE "rm102_log" (
    "id" SERIAL NOT NULL,
    "students_id" text CHARACTER SET big5 NOT NULL,
    "year" integer NOT NULL,
    "term" text CHARACTER SET big5 NOT NULL,
    "datetime" date NOT NULL,
    PRIMARY KEY ("id")
);

CREATE TABLE "school_transfer" (
    "id" text NOT NULL,
    "school" text CHARACTER SET utf8mb3 NOT NULL
);

CREATE TABLE "seniority" (
    "seqNum" SERIAL NOT NULL,
    "year" integer NOT NULL,
    "term" text NOT NULL,
    "id" text NOT NULL,
    "date" date NOT NULL,
    "date2" date,
    "max" integer NOT NULL,
    "max2" integer NOT NULL,
    "time_from" text NOT NULL,
    "time_to" time NOT NULL,
    "time_from2" text NOT NULL,
    "time_to2" time NOT NULL,
    PRIMARY KEY ("seqNum")
);

CREATE TABLE "simulation_exam_answers" (
    "id" SERIAL NOT NULL,
    "question_id" integer NOT NULL,
    "answer_order" integer NOT NULL,
    "answer_eng" text CHARACTER SET latin1 NOT NULL,
    "answer_chi" text CHARACTER SET utf8mb4 NOT NULL,
    "correct_answer" integer NOT NULL,
    PRIMARY KEY ("id")
);

CREATE TABLE "simulation_exam_questions" (
    "id" SERIAL NOT NULL,
    "question_eng" text CHARACTER SET latin1 NOT NULL,
    "question_chi" text CHARACTER SET utf8mb4 NOT NULL,
    "question_type" text CHARACTER SET latin1 NOT NULL,
    "active" integer NOT NULL,
    PRIMARY KEY ("id")
);

CREATE TABLE "simulation_exam_sessions" (
    "id" SERIAL NOT NULL,
    "student_id" text CHARACTER SET big5 NOT NULL,
    "start_datetime" timestamp NOT NULL,
    "end_datetime" timestamp NOT NULL,
    PRIMARY KEY ("id")
);

CREATE TABLE "simulation_exam_students" (
    "id" SERIAL NOT NULL,
    "exam_session" integer NOT NULL,
    "question_order" integer NOT NULL,
    "student_id" text CHARACTER SET latin1 NOT NULL,
    "student_exam_question" integer NOT NULL,
    "student_exam_answer" integer NOT NULL,
    "datetime" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id")
);

CREATE TABLE "status_log" (
    "seq_number" SERIAL NOT NULL,
    "id" text CHARACTER SET latin1 NOT NULL,
    "status" text CHARACTER SET latin1 NOT NULL,
    "date" date NOT NULL,
    PRIMARY KEY ("seq_number")
);

CREATE TABLE "students" (
    "seqNum" SERIAL NOT NULL,
    "name" text NOT NULL,
    "alias" text CHARACTER SET utf8mb3 NOT NULL,
    "id" text NOT NULL,
    "dob" date NOT NULL,
    "address" text NOT NULL,
    "address2" text NOT NULL,
    "city" text NOT NULL,
    "state" text NOT NULL,
    "zip" integer NOT NULL,
    "country" text NOT NULL,
    "ssn" text NOT NULL,
    "gender" text NOT NULL,
    "race" text NOT NULL,
    "status" text NOT NULL,
    "phone1" text NOT NULL,
    "phone2" text NOT NULL,
    "phone3" text NOT NULL,
    "email" text NOT NULL,
    "amu_email" varchar(255),
    "background" text CHARACTER SET utf8mb3 NOT NULL,
    "tertiary" text NOT NULL,
    "visa" text NOT NULL,
    "regis_fee" integer NOT NULL,
    "clinic_fee" integer NOT NULL,
    "admission_credits" integer NOT NULL,
    "notes" text NOT NULL,
    "cpr" text NOT NULL,
    "toefl" text NOT NULL,
    "exam" text NOT NULL,
    "level1exam" text NOT NULL,
    "level2exam" text NOT NULL,
    "level3exam" text NOT NULL,
    "cnt" text NOT NULL,
    "hold" integer NOT NULL,
    "signed_date" date NOT NULL,
    "grad_date" date NOT NULL,
    "grad_term" text NOT NULL,
    "grad_year" integer NOT NULL,
    "withdraw_date" date NOT NULL,
    "required_units_to_grad" integer NOT NULL,
    "marital" text NOT NULL,
    "citizenship" text NOT NULL,
    "EnrollStartDate" date NOT NULL,
    "requirements_id" integer,
    "financial_aid" integer NOT NULL,
    "grad_check_out" integer NOT NULL,
    "cale_license" text,
    "cale_date" date NOT NULL,
    "level1practice" text NOT NULL,
    "program" varchar(10) NOT NULL DEFAULT 'MAHM',
    "photo_path" varchar(255),
    PRIMARY KEY ("seqNum")
);

CREATE TABLE "term_list" (
    "id" SERIAL NOT NULL,
    "year" integer NOT NULL,
    "term" text NOT NULL,
    "StartDate" date NOT NULL,
    "EndDate" date NOT NULL,
    PRIMARY KEY ("id")
);

CREATE TABLE "term_order" (
    "seqNumber" SERIAL NOT NULL,
    "term" text CHARACTER SET latin1 NOT NULL,
    "order" integer NOT NULL,
    "start_date" date NOT NULL,
    PRIMARY KEY ("seqNumber")
);

CREATE TABLE "timetable" (
    "seqNum" SERIAL NOT NULL,
    "year" integer NOT NULL,
    "term" text NOT NULL,
    "day" text NOT NULL,
    "time_from" time NOT NULL,
    "time_to" time NOT NULL,
    "course" text NOT NULL,
    "instructor_id" text NOT NULL,
    "instructor" text NOT NULL,
    PRIMARY KEY ("seqNum")
);

CREATE TABLE "timetable2" (
    "seqNum" SERIAL NOT NULL,
    "year" integer NOT NULL,
    "term" text NOT NULL,
    "day" text NOT NULL,
    "time_from" time NOT NULL,
    "time_to" time NOT NULL,
    "course" text NOT NULL,
    "instructor_id" text NOT NULL,
    "instructor" text CHARACTER SET utf8mb3 NOT NULL,
    "hidden" integer NOT NULL DEFAULT '0',
    PRIMARY KEY ("seqNum")
);

CREATE TABLE "title_iv" (
    "id" SERIAL NOT NULL,
    "students_id" text CHARACTER SET latin1 NOT NULL,
    "year" integer NOT NULL,
    "term" text CHARACTER SET latin1 NOT NULL,
    "category" text CHARACTER SET latin1 NOT NULL,
    PRIMARY KEY ("id")
);
