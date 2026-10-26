/** Additional authenticated data of the small key-store tables, shared by
 * the writers and the key-rotation job (S3-4). */
export const joinCodeAad = (membershipId: string): string =>
  `assistant_memberships.join_code:${membershipId}`;
export const barRegistryAad = (stateCode: string): string =>
  `bar_registry:${stateCode}`;
