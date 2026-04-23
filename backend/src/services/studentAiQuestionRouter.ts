export type StudentAiIntent =
  | "student_record"
  | "policy"
  | "mixed"
  | "school_fact"
  | "local_search"
  | "general";

export type StudentRecordQuestionKind =
  | "current_term_courses"
  | "current_term_course_count"
  | "current_term_credits"
  | "registered_term_count"
  | "registration_in_year"
  | "historical_term_lookup"
  | "all_courses_history"
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
  | { kind: "historical_term_lookup"; year: number; term: string | null }
  | { kind: "all_courses_history" }
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
    /\b(policy|handbook|catalog|rule|rules|requirement|requirements|deadline|deadlines|prerequisite|prerequisites|graduation|attendance|probation|refund|withdrawal policy|withdrawal|add\/drop|registration policy|tuition|fee|fees|payment|clinical|clerkship|practicum|internship|hours)\b/i.test(
      value,
    ) ||
    /政策|规定|要求|规则|退选|退课|先修|先决|学费|费用|缴费|退款|毕业要求|目录|手册|deadline|withdrawal|prerequisite|临床|诊所|实习|见习|学时|时数|出席|考勤|出勤|旷课|加退选/.test(
      value,
    )
  );
}

/** Casual writing help without AMU policy context — keep on general chat path. */
function isConversationalWritingAssistOnly(question: string): boolean {
  const t = question.trim();
  if (t.length > 800) return false;
  const assist =
    /\b(rewrite|rephrase|polish|proofread|translate|summarize|fix my grammar|make this sound)\b/i.test(
      t,
    ) || /润色|改写|翻译|总结|措辞|优化一下|改成更|帮我改|修一下这段|把下面/.test(t);
  if (!assist) return false;
  if (
    /\b(catalog|tuition|withdraw|refund|graduation|enrollment|clinical|credit|policy|deadline)\b/i.test(
      t,
    ) ||
    /目录|学费|退课|退款|毕业|注册|临床|学分|政策|规定|手册|截止/.test(t)
  ) {
    return false;
  }
  return true;
}

function hasMixedApplicabilityCue(value: string): boolean {
  return (
    /\b(apply to me|apply in my case|how does it apply to me|based on my current record|based on my record|what should i pay attention to|for my situation|given my record)\b/i.test(
      value,
    ) || /对我适用吗|适用于我吗|根据我的情况|结合我的情况|按我的情况|看我的记录/.test(value)
  );
}

function hasAmuIdentityCue(value: string): boolean {
  return (
    /\b(amu|alhambra medical university)\b/i.test(value) ||
    /AMU|阿罕布拉医科大学|阿罕布拉醫科大學/.test(value)
  );
}

function hasExplicitSchoolIdentityQuestionCue(value: string): boolean {
  return (
    /\b(what\s+is\s+amu|which\s+school\s+is\s+amu|what\s+does\s+amu\s+mean|full\s+name\s+of\s+amu|where\s+is\s+amu|amu\s+(address|location|phone|email|contact))\b/i.test(
      value,
    ) ||
    /AMU.{0,8}(是什么|是什麼|哪所学校|哪所學校|哪个学校|哪個學校|全名|地址|位置|电话|電話|邮箱|郵箱|联系|聯繫)|是什么学校|是什麼學校|学校名称|學校名稱|学校全名|學校全名/.test(
      value,
    )
  );
}

function hasSchoolContextCue(value: string): boolean {
  return (
    /\b(school|campus|university|college)\b/i.test(value) ||
    /学校|學校|校区|校區|校园|校園|大学|大學/.test(value)
  );
}

function hasInstitutionFactCue(value: string): boolean {
  return (
    /\b(address|location|located|phone|email|contact|housing|dorm|where\s+is)\b/i.test(
      value,
    ) ||
    /地址|位置|地点|地點|电话|電話|邮箱|郵箱|邮件|郵件|联系|聯繫|联系方式|聯繫方式|宿舍|住宿|住校|在哪里|在哪裡|在哪/.test(
      value,
    )
  );
}

function hasSchoolFactCue(value: string): boolean {
  return (
    hasExplicitSchoolIdentityQuestionCue(value) ||
    (hasInstitutionFactCue(value) &&
      (hasAmuIdentityCue(value) || hasSchoolContextCue(value)))
  );
}

function hasLocalSearchCue(value: string): boolean {
  const explicitPhraseCue =
    /\b(near me|nearby|around here|close by|good places near|best places near|recommend places|recommend restaurants|restaurant recommendations|food recommendations)\b/i.test(
      value,
    ) ||
    /哪里好吃|哪裡好吃|附近有什么|附近有什麼|附近有啥|附近吃什么|附近吃什麼|附近有什么好吃|附近有什麼好吃|推荐餐厅|推薦餐廳|推荐美食|推薦美食|附近有什么地方可以去|附近有什麼地方可以去/.test(
      value,
    );

  const placeTopicCue =
    /\b(restaurant|restaurants|food|eat|eating|lunch|dinner|brunch|breakfast|coffee|cafe|cafes|boba|milk tea|dessert|hot pot|bbq|ramen|sushi|tacos?|burger|pizza|places|spots|things to do|attractions?)\b/i.test(
      value,
    ) ||
    /餐厅|餐廳|饭店|美食|吃的|吃饭|吃飯|火锅|火鍋|奶茶|咖啡|甜品|烧烤|燒烤|拉面|拉麵|寿司|壽司|早午餐|景点|景點|玩的地方/.test(
      value,
    );

  const recommendationCue =
    /\b(recommend|recommendation|suggest|suggestion|good|best|favorite|favourite|worth trying)\b/i.test(
      value,
    ) ||
    /推荐|推薦|好吃|值得去|值得吃|有什么好|有什麼好/.test(value);

  const areaCue =
    /\b(near|nearby|around|in)\s+[a-z][a-z\s-]{1,40}\b/i.test(value) ||
    /\b(los angeles|alhambra|irvine|pasadena|san gabriel|monterey park|arcadia|rowland heights|anaheim|orange county)\b/i.test(
      value,
    ) ||
    /附近|周边|周邊|洛杉矶|洛杉磯|阿罕布拉|尔湾|爾灣|帕萨迪纳|帕薩迪納|圣盖博|聖蓋博|蒙特利公园|蒙特利公園|亚凯迪亚|亞凱迪亞|橙县|橙縣/.test(
      value,
    );

  return explicitPhraseCue || (placeTopicCue && (recommendationCue || areaCue));
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

function normalizeHistoricalLookupTerm(raw: string): string | null {
  const normalized = raw.trim().toLowerCase();
  switch (normalized) {
    case "fall":
    case "autumn":
    case "秋":
    case "秋季":
    case "秋天":
    case "秋学期":
      return "Fall";
    case "summer":
    case "夏":
    case "夏季":
    case "夏天":
    case "夏学期":
      return "Summer";
    case "spring":
    case "春":
    case "春季":
    case "春天":
    case "春学期":
      return "Spring";
    case "winter":
    case "冬":
    case "冬季":
    case "冬天":
    case "冬学期":
      return "Winter";
    default:
      return null;
  }
}

export function extractHistoricalLookupTerm(question: string): string | null {
  const patterns = [
    /\b(fall|autumn|summer|spring|winter)\s+(?:19|20)\d{2}\b/i,
    /\b(?:19|20)\d{2}\s+(fall|autumn|summer|spring|winter)\b/i,
    /(?:19|20)\d{2}年.{0,4}(秋季|秋天|秋学期|秋|夏季|夏天|夏学期|夏|春季|春天|春学期|春|冬季|冬天|冬学期|冬)/,
    /(秋季|秋天|秋学期|秋|夏季|夏天|夏学期|夏|春季|春天|春学期|春|冬季|冬天|冬学期|冬).{0,4}(?:19|20)\d{2}年?/,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(question);
    if (match?.[1] != null) {
      const term = normalizeHistoricalLookupTerm(match[1]);
      if (term != null) return term;
    }
  }

  return null;
}

export function detectStudentRecordQuestion(
  question: string,
): StudentRecordQuestionMatch | null {
  const normalized = lower(question);
  const courseCode = extractCourseCode(question);
  const year = extractYear(question);
  const historicalTerm = extractHistoricalLookupTerm(question);

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
      ) ||
      /我.{0,6}\b(19|20)\d{2}\b年.{0,8}(修过|上过|学过|选过).{0,8}(什么课|哪些课|哪些课程)/.test(
        normalized,
      ) ||
      /\b(?:fall|autumn|spring|summer|winter)\s+\b(19|20)\d{2}\b.{0,20}\b(courses|classes)\b/i.test(
        normalized,
      ))
  ) {
    return { kind: "historical_term_lookup", year, term: historicalTerm };
  }

  if (
    /\b(what|which)\s+(courses|classes)\s+(have i|i have|i've|did i)\s+(take|taken|took|completed|finished|studied)\b/i.test(
      normalized,
    ) ||
    /\bwhat\s+(courses|classes)\s+have\s+i\s+(taken|completed)\b/i.test(
      normalized,
    ) ||
    /\b(show|list)\s+my\s+(courses|classes|academic history|record|records|transcript)\b/i.test(
      normalized,
    ) ||
    /我.{0,8}(修过|上过|学过|选过|完成过).{0,8}(什么课|哪些课|哪些课程)/.test(
      normalized,
    ) ||
    /我的.{0,6}(课程记录|学术记录|学术历史|修课记录)/.test(normalized)
  ) {
    return { kind: "all_courses_history" };
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
    /\bhow\s+many\s+earned\s+credits\s+do\s+i\s+have\b/i.test(normalized) ||
    /我.{0,6}(总共|一共|已经)?.{0,6}(有|拿了|获得了|修了|完成了)?.{0,6}多少学分/.test(
      normalized,
    ) ||
    /我的.{0,4}(总学分|已修学分|已获得学分).{0,4}(多少|是多少)/.test(normalized)
  ) {
    return { kind: "completed_credits_total" };
  }

  return null;
}

export function detectGraduationEligibilityQuestion(question: string): boolean {
  const normalized = lower(question);

  if (
    /\b(can\s+i\s+graduate|am\s+i\s+eligible\s+to\s+graduate|am\s+i\s+eligible\s+for\s+graduation|have\s+i\s+met\s+(the\s+)?graduation\s+requirements|have\s+i\s+met\s+(the\s+)?degree\s+requirements|do\s+i\s+meet\s+(the\s+)?graduation\s+requirements|do\s+i\s+meet\s+(the\s+)?degree\s+requirements|have\s+i\s+satisfied\s+(the\s+)?graduation\s+requirements|what\s+am\s+i\s+missing\s+to\s+graduate|which\s+courses\s+am\s+i\s+missing\s+to\s+graduate|how\s+many\s+credits?\s+do\s+i\s+still\s+need\s+to\s+graduate|how\s+far\s+am\s+i\s+from\s+graduation)\b/i.test(
      normalized,
    )
  ) {
    return true;
  }

  return (
    /我.{0,8}(能不能|可不可以|能否).{0,10}毕业/.test(normalized) ||
    /我.{0,8}(可以|能).{0,6}毕业了?吗?/.test(normalized) ||
    /那我.{0,8}(可以|能).{0,6}毕业了?吗?/.test(normalized) ||
    /我.{0,8}(是不是|是否).{0,8}(可以|能).{0,6}毕业/.test(normalized) ||
    /那我.{0,8}(是不是|是否).{0,8}(可以|能).{0,6}毕业/.test(normalized) ||
    /我.{0,8}(是否|是不是).{0,10}符合.{0,6}毕业/.test(normalized) ||
    /我.{0,8}(有没有|是否已经).{0,12}(达到|满足|符合).{0,8}毕业要求/.test(
      normalized,
    ) ||
    /毕业要求.{0,8}(达到|满足|符合)/.test(normalized) ||
    /我.{0,8}离.{0,4}毕业.{0,8}还差多少/.test(normalized) ||
    /我.{0,8}离.{0,4}毕业.{0,8}还差.{0,6}(多少|几).{0,4}学分/.test(normalized) ||
    /还差.{0,8}(多少|几).{0,4}学分.{0,6}毕业/.test(normalized) ||
    /我.{0,8}还缺.{0,8}(什么课|哪些课|什么要求|多少学分).{0,6}毕业/.test(
      normalized,
    )
  );
}

export function detectGraduationRequirementCreditsQuestion(
  question: string,
): boolean {
  const normalized = lower(question);
  return (
    /\b(how\s+many\s+credits?\s+are\s+required\s+to\s+graduate|how\s+many\s+credits?\s+do\s+i\s+need\s+to\s+graduate|what\s+are\s+the\s+graduation\s+credit\s+requirements?)\b/i.test(
      normalized,
    ) ||
    /毕业要求.{0,6}(多少|几).{0,4}学分/.test(normalized) ||
    /(毕业|毕业要求).{0,8}(学分).{0,6}(多少|几|是多少)/.test(normalized)
  );
}

export function classifyStudentAiIntent(question: string): StudentAiIntent {
  if (isConversationalWritingAssistOnly(question)) {
    return "general";
  }
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

  if (hasSchoolFactCue(normalized)) {
    return "school_fact";
  }

  if (hasLocalSearchCue(normalized)) {
    return "local_search";
  }

  return "general";
}
