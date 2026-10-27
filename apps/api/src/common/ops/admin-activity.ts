/** TTL key (10 min), refreshed by every admin request: "someone looks at
 * the admin now" (S20-1: the admin summaries follow it in Авто). Kept in its
 * own file so the admin session service needs no other ops imports. */
export const ADMIN_ACTIVE_KEY = 'ops:admin-active';
export const ADMIN_ACTIVE_TTL_SEC = 600;
