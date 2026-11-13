/**
 * The public face of the infra pipeline's GitHub App client for other
 * modules (module-boundaries rule: import a module's root files only).
 * 09.11.2026: the AI assistant opens its task issues through the same App.
 */
export {
  GithubMergeError,
  InfraAuthError,
  InfraGithubClient,
  type GithubPull,
  type GithubPullFile,
  type WorkflowCaller,
} from './infra/infra-github.client';
