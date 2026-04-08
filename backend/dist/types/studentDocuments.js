export const DOCUMENT_REQUIREMENT_TYPES = [
    "ferpa",
    "titleix",
    "campus",
    "copyright_release_agreement",
];
export function isDocumentRequirementType(value) {
    return DOCUMENT_REQUIREMENT_TYPES.includes(value);
}
export const DOCUMENT_QUIZ_REQUIREMENT_TYPES = ["ferpa", "titleix", "campus"];
export function isDocumentQuizRequirementType(value) {
    return DOCUMENT_QUIZ_REQUIREMENT_TYPES.includes(value);
}
//# sourceMappingURL=studentDocuments.js.map