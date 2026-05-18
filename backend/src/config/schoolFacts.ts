export type AmuSchoolFacts = {
  institutionName: string;
  sourceLabel: string;
  address: string | null;
  location: string | null;
  phone: string | null;
  email: string | null;
  campusInfo: string | null;
  housingAvailable: boolean | null;
  housingNote: string | null;
};

/**
 * Controlled source of truth for AMU institutional facts.
 * Only populate fields here when they are verified from trusted AMU sources.
 */
export const AMU_SCHOOL_FACTS: AmuSchoolFacts = {
  institutionName: "Alhambra Medical University",
  sourceLabel:
    "AMU official documents in backend/knowledge/sources (see SOURCE_INDEX.md)",
  address: null,
  location: null,
  phone: null,
  email: null,
  campusInfo: null,
  housingAvailable: null,
  housingNote: null,
};
