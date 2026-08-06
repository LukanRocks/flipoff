import type { PluginPlaceholderArgs, PluginRefreshArgs, PluginRefreshResult, ScreenPlugin } from '../base'
import { withOptionalTitle } from '../base'
import { fit, formatAlignedPairs } from '../lib/format'
import { DEFAULT_GITHUB_REPOSITORY, countOpenPullRequests, fetchRepository, normalizeRepository, repositoryHeading } from './lib/common'

function buildMetricLines(heading: string | null, metrics: string[], cols: number): string[] {
  const lines: string[] = []
  if (heading) lines.push(fit(heading, cols))
  lines.push(...metrics.map((metric) => fit(metric, cols)))
  return lines
}

export const githubOpenWorkPlugin: ScreenPlugin = {
  manifest: {
    id: 'github_open_work',
    name: 'GitHub Open Issues and PRs',
    description: 'Show the current number of open issues and open pull requests for a public GitHub repository.',
    defaultRefreshIntervalSeconds: 300,
    settingsSchema: [
      {
        name: 'repository',
        label: 'Repository',
        type: 'text',
        default: DEFAULT_GITHUB_REPOSITORY,
        placeholder: 'owner/repo',
        helpText: `Uses the GitHub REST API for public repositories. Leave blank for '${DEFAULT_GITHUB_REPOSITORY}'.`,
      },
    ],
    designSchema: [
      { name: 'title', label: 'Title Override', type: 'text', default: '', placeholder: 'OPEN WORK' },
      {
        name: 'showRepository',
        label: 'Show Organization / Repo',
        type: 'checkbox',
        default: true,
        helpText: 'Display the owner/repository line above the issue and PR counts.',
      },
    ],
  },

  async refresh({ settings, design, context, signal }: PluginRefreshArgs): Promise<PluginRefreshResult> {
    const [owner, repo] = normalizeRepository(settings.repository)
    const repositoryPayload = await fetchRepository(owner, repo, signal)
    const openPrs = await countOpenPullRequests(owner, repo, signal)

    // GitHub counts pull requests as issues, so subtract them back out.
    const openIssuesTotal = Number(repositoryPayload.open_issues_count)
    const openIssues = Number.isFinite(openIssuesTotal) ? Math.max(0, Math.trunc(openIssuesTotal) - openPrs) : 0

    const metrics = formatAlignedPairs(
      [
        ['ISSUE', String(openIssues)],
        ['PR', String(openPrs)],
      ],
      context.cols,
    )

    const lines = withOptionalTitle(buildMetricLines(repositoryHeading(owner, repo, design), metrics, context.cols), design, context)
    return { lines: lines.slice(0, context.rows) }
  },

  placeholderLines({ settings, design, context, error }: PluginPlaceholderArgs): string[] {
    const [owner, repo] = normalizeRepository(settings.repository)
    const metrics = formatAlignedPairs(
      [
        ['ISSUE', '--'],
        ['PR', '--'],
      ],
      context.cols,
    )

    const lines = withOptionalTitle(buildMetricLines(repositoryHeading(owner, repo, design, error), metrics, context.cols), design, context)
    return lines.slice(0, context.rows)
  },
}
