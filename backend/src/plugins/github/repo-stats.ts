import type { PluginPlaceholderArgs, PluginRefreshArgs, PluginRefreshResult, ScreenPlugin } from '../base'
import { withOptionalTitle } from '../base'
import { fit, formatAlignedPairs } from '../lib/format'
import { DEFAULT_GITHUB_REPOSITORY, fetchRepository, normalizeRepository, repositoryHeading } from './lib/common'

function asCount(value: unknown): string {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? String(Math.trunc(parsed)) : '--'
}

function buildMetricLines(heading: string | null, metrics: string[], cols: number): string[] {
  const lines: string[] = []
  if (heading) lines.push(fit(heading, cols))
  lines.push(...metrics.map((metric) => fit(metric, cols)))
  return lines
}

export const githubRepoStatsPlugin: ScreenPlugin = {
  manifest: {
    id: 'github_repo_stats',
    name: 'GitHub Stars, Watches, Forks',
    description: 'Show stars, watches, and forks for a public GitHub repository.',
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
      { name: 'title', label: 'Title Override', type: 'text', default: '', placeholder: 'GITHUB STATS' },
      {
        name: 'showRepository',
        label: 'Show Organization / Repo',
        type: 'checkbox',
        default: true,
        helpText: 'Display the owner/repository line above the GitHub metrics.',
      },
    ],
  },

  async refresh({ settings, design, context, signal }: PluginRefreshArgs): Promise<PluginRefreshResult> {
    const [owner, repo] = normalizeRepository(settings.repository)
    const payload = await fetchRepository(owner, repo, signal)

    const metrics = formatAlignedPairs(
      [
        ['STAR', asCount(payload.stargazers_count)],
        ['WATCH', asCount(payload.subscribers_count ?? payload.watchers_count)],
        ['FORK', asCount(payload.forks_count)],
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
        ['STAR', '--'],
        ['WATCH', '--'],
        ['FORK', '--'],
      ],
      context.cols,
    )

    const lines = withOptionalTitle(buildMetricLines(repositoryHeading(owner, repo, design, error), metrics, context.cols), design, context)
    return lines.slice(0, context.rows)
  },
}
