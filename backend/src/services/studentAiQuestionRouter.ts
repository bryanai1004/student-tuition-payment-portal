export type StudentAiIntent =
  | "student_record"
  | "policy"
  | "mixed"
  | "general";

export type StudentRecordQuestionKind =
  | "current_term_courses"
  | "current_term_course_count"
  | "current_term_credits"
  | "registered_term_count"
  | "registration_in_year"
  | "courses_in_year"
  | "withdrawal_history"
  | "took_course"
  | "completed_course"
  | "completed_credits_total";

export type StudentRecordQuestionMatch =
  | { kind: "current_term_courses" }
  | { kind: "current_term_course_count" }
  | { kind: "current_term_credits" }
  | { kind: "registered_term_count" }
  | { kind: "registration_in_year"; year: number }
  | { kind: "courses_in_year"; year: number }
  | { kind: "withdrawal_history" }
  | { kind: "took_course"; courseCode: string }
  | { kind: "completed_course"; courseCode: string }
  | { kind: "completed_credits_total" };

const COURSE_CODE_RE = /\b([A-Za-z]{2,5})[\s-]?(\d{3}[A-Za-z]?)\b/;
const YEAR_RE = /\b(19|20)\d{2}\b/;

function lower(text: string): string {
  return text.trim().toLowerCase();
}

function hasPersonalReferenceCue(value: string): boolean {
  return (
    /\b(i|me|my|mine|am i|do i|did i|have i|for me)\b/i.test(value) ||
    /我|我的|我现在|我目前|我当前/.test(value)
  );
}

function hasStudentRecordTopicCue(value: string): boolean {
  return (
    /\b(course|courses|class|classes|enroll|enrolled|enrollment|taking|credits?|grade|grades|term|terms|record|records|schedule|withdraw|withdrawn|completed|transcript)\b/i.test(
      value,
    ) ||
    /选课|选了|修了|上了|课程|学分|成绩|注册|退选|退课|学期|记录|课表|在读|已修/.test(
      value,
    )
  );
}

function hasPolicyCue(value: string): boolean {
  return (
    /\b(policy|handbook|catalog|rule|rules|requirement|requirements|deadline|deadlines|prerequisite|prerequisites|graduation|attendance|probation|refund|withdrawal policy|withdrawal|add\/drop|registration policy|tuition|fee|fees|payment)\b/i.test(
      value,
    ) ||
    /政策|规定|要求|规则|退选|退课|先修|先决|学费|费用|缴费|退款|毕业要求|目录|手册|deadline|withdrawal|prerequisite/.test(
      value,
    )
  );
}

function hasMixedApplicabilityCue(value: string): boolean {
  return (
    /\b(apply to me|apply in my case|how does it apply to me|based on my current record|based on my record|what should i pay attention to|for my situation|given my record)\b/i.test(
      value,
    ) || /对我适用吗|适用于我吗|根据我的情况|结合我的情况|按我的情况|看我的记录/.test(value)
  );
}

export function extractCourseCode(question: string): string | null {
  const match = COURSE_CODE_RE.exec(question);
  if (match == null) return null;
  return `${match[1]}${match[2]}`.toUpperCase();
}

function extractYear(question: string): number | null {
  const match = YEAR_RE.exec(question);
  if (match == null) return null;
  const year = Number(match[0]);
  return Number.isFinite(year) ? year : null;
}

export function detectStudentRecordQuestion(
  question: string,
): StudentRecordQuestionMatch | null {
  const normalized = lower(question);
  const courseCode = extractCourseCode(question);
  const year = extractYear(question);

  if (
    /\b(what|which)\s+(courses|classes)\s+(am i|i am|i'm)\s+(taking|enrolled in)\b/i.test(
      normalized,
    ) ||
    /\bwhat\s+am\s+i\s+taking\s+(this term|now|currently)\b/i.test(normalized) ||
    /我(现在|目前|当前).{0,8}(在上|在修|在读|选).{0,8}(什么课|哪些课|哪些课程)/.test(
      normalized,
    )
  ) {
    return { kind: "current_term_courses" };
  }

  if (
    /\bhow\s+many\s+(courses|classes)\s+(am i|i am|i'm)\s+(taking|enrolled in)\b/i.test(
      normalized,
    ) ||
    /\bhow\s+many\s+(courses|classes)\s+am\s+i\s+taking\s+(this term|now|currently)\b/i.test(
      normalized,
    ) ||
    /我(现在|目前|当前).{0,8}(选|修|上).{0,4}了?.{0,4}多少(门|节)?课/.test(
      normalized,
    )
  ) {
    return { kind: "current_term_course_count" };
  }

  if (
    /\bhow\s+many\s+credits\s+(am i|i am|i'm)\s+(taking|enrolled in)\b/i.test(
      normalized,
    ) ||
    /\bhow\s+many\s+credits\s+am\s+i\s+taking\s+(this term|now|currently)\b/i.test(
      normalized,
    ) ||
    /\bwhat\s+is\s+my\s+current\s+credit\s+load\b/i.test(normalized) ||
    /我(现在|目前|当前).{0,8}(有|修|选).{0,8}多少学分/.test(normalized)
  ) {
    return { kind: "current_term_credits" };
  }

  if (
    /\bhow\s+many\s+terms\s+(have i|i have|i've)\s+(registered|enrolled)\b/i.test(
      normalized,
    ) ||
    /\bhow\s+many\s+registered\s+terms\s+do\s+i\s+have\b/i.test(normalized)
  ) {
    return { kind: "registered_term_count" };
  }

  if (
    year != null &&
    /\b(did i|have i|was i|do i)\s+(register|registered|enroll|enrolled)\b/i.test(
      normalized,
    )
  ) {
    return { kind: "registration_in_year", year };
  }

  if (
    year != null &&
    (/\b(what|which)\s+(courses|classes)\s+(did i|have i|i have)\s+(take|taken|took|complete|completed|register(?:ed)?\s+for|enroll(?:ed)?\s+in)\b/i.test(
      normalized,
    ) ||
      /\bwhat\s+did\s+i\s+(take|took|complete|completed|register(?:ed)?\s+for|enroll(?:ed)?\s+in)\b/i.test(
        normalized,
      ) ||
      /我.{0,8}(在|于)?.{0,8}\b(19|20)\d{2}\b.{0,8}(修了|上了|选了|注册了|完成了).{0,8}(什么课|哪些课|哪些课程)/.test(
        normalized,
      ))
  ) {
    return { kind: "courses_in_year", year };
  }

  if (
    courseCode != null &&
    /\b(did i|have i|do i|was i)\b/i.test(normalized) &&
    /\b(take|taken|took|register(?:ed)?\s+for|enroll(?:ed)?\s+in)\b/i.test(
      normalized,
    )
  ) {
    return { kind: "took_course", courseCode };
  }

  if (
    /\b(do i|did i|have i|my)\b/i.test(normalized) &&
    /\b(withdrawal|withdrawn|withdrew)\b/i.test(normalized)
  ) {
    return { kind: "withdrawal_history" };
  }

  if (/我.{0,8}(退选|退课|withdraw)/.test(normalized)) {
    return { kind: "withdrawal_history" };
  }

  if (
    courseCode != null &&
    /\b(have i|did i|do i)\b/i.test(normalized) &&
    /\b(complete|completed|pass|passed|finish|finished)\b/i.test(normalized)
  ) {
    return { kind: "completed_course", courseCode };
  }

  if (
    /\bhow\s+many\s+credits\s+do\s+i\s+have\b/i.test(normalized) ||
    /\bhow\s+many\s+credits\s+(have i|i have|i've)\s+completed\b/i.test(
      normalized,
    ) ||
    /\bhow\s+many\s+earned\s+credits\s+do\s+i\s+have\b/i.test(normalized)
  ) {
    return { kind: "completed_credits_total" };
  }

  return null;
}

export function classifyStudentAiIntent(question: string): StudentAiIntent {
  const normalized = lower(question);
  const recordMatch = detectStudentRecordQuestion(question);
  const policyCue = hasPolicyCue(normalized);
  const personalAcademicCue =
    recordMatch != null ||
    (hasPersonalReferenceCue(normalized) && hasStudentRecordTopicCue(normalized));
  const mixedApplicabilityCue = hasMixedApplicabilityCue(normalized);
  const courseCode = extractCourseCode(question);
  const canITakeCourse =
    courseCode != null &&
    /\bcan\s+i\s+take\b/i.test(normalized) &&
    /\b(next term|next semester|this term|now|currently|later)\b/i.test(normalized);
  const canITakeCourseZh =
    courseCode != null &&
    /我.{0,8}(现在|这学期|下学期).{0,8}(能不能|可不可以|能否).{0,8}(选|修)/.test(
      normalized,
    );

  if (
    canITakeCourse ||
    canITakeCourseZh ||
    mixedApplicabilityCue ||
    (policyCue && personalAcademicCue)
  ) {
    return "mixed";
  }

  if (personalAcademicCue) {
    return "student_record";
  }

  if (policyCue || courseCode != null) {
    return "policy";
  }

  return "general";
}
