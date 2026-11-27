/**
 * Group E2EE G1 (docs/architecture/GROUP_E2EE_DESIGN_2026-11-26.md §4.1):
 * the public face of the chat module's MLS Delivery Service that group
 * chats share — the key-less MLS readers (ts-mls) and the wire DTOs. One
 * implementation for chats and groups; nothing here holds an MLS secret.
 */
export {
  MLS_CIPHERSUITE,
  deviceIdentity,
  isWelcome,
  readApplicationMessage,
  readCommit,
  readExternalCommit,
  readGroupInfo,
} from './e2ee/mls-codec';
export {
  ClaimedKeyPackageDto,
  MLS_COMMIT_MAX_B64,
  MLS_GROUP_ID_MAX_B64,
  MLS_MESSAGE_MAX_B64,
  MLS_WELCOME_MAX_B64,
  MlsCommitDto,
  MlsCommitRowDto,
  MlsCommitsQueryDto,
  MlsEpochDto,
  MlsGroupMemberDeviceDto,
  MlsWelcomesQueryDto,
  E2EE_STATES,
  type E2eeState,
} from './e2ee/e2ee.dto';
