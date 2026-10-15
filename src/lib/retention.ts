// PLACEHOLDER (PRD 21: retention periods and DPIA, to confirm with the DPO). Build plan section 17.

/** Media of rejected, declined and withdrawn stories is deleted this long after the decision (PRD 9.3). */
export const DELETE_MEDIA_AFTER_DAYS = 30;
/** Drafts never sent are deleted after this long without changes (Q12, Q24). */
export const ABANDONED_DRAFT_DAYS = 30;
/** Expired links are kept this long for the audit trail, then deleted. */
export const EXPIRED_TOKEN_DAYS = 7;
/** Approved media is kept while published and reviewed after this long (PRD 9.3). Not automated yet. */
export const APPROVED_REVIEW_MONTHS = 12;

export const daysFromNow = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);
