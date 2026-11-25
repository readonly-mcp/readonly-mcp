/*
 * The query keys that the Gitea and Forgejo API paths gt api allows read,
 * from both projects' swagger specs. Any other key is refused:
 * sudo above all, which Gitea reads as it reads the Sudo header, sending an
 * administrator's request as another user, and token and access_token,
 * which authenticate as whoever the caller names.
 */
export const giteaQueryKeys: ReadonlySet<string> = new Set([
  'actor', 'attempt', 'branch', 'event', 'exclude_pull_requests', 'format', 'head_sha', 'limit',
  'order', 'page', 'q', 'qi', 'ref', 'run_number', 'sort', 'state', 'status', 'step',
  'workflow_id',
]);
