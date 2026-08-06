import { OverrideSummary, describeOverride } from '../components/OverrideSummary'
import { EmptyState, ExternalLinkIcon, MetricTile, ScreenChip, StarIcon, StatusPill, WorkspaceSection, type Tone } from '../components/primitives'
import { formatDuration, formatTimestamp, pluralize } from '../lib/format'
import { getScreenSummary, getScreenTitle } from '../lib/screens'
import { useAdmin } from '../state/adminContext'

/** How many rotation entries the overview shows before summarising the rest. */
const ROTATION_PREVIEW_LIMIT = 6

function pluginHealth(screen: { lastError: string | null; lastRefreshedAt: string | null }): { label: string; tone: Tone; meta: string } {
  if (screen.lastError) return { label: 'Needs attention', tone: 'error', meta: screen.lastError }
  if (screen.lastRefreshedAt) return { label: 'Healthy', tone: 'success', meta: `Last refresh ${formatTimestamp(screen.lastRefreshedAt)}.` }
  return { label: 'Pending', tone: 'neutral', meta: 'Awaiting first refresh.' }
}

export function HomePage() {
  const { boards, config, screens, message, drafts } = useAdmin()

  const manual = drafts.filter((screen) => screen.type === 'manual')
  const plugins = drafts.filter((screen) => screen.type === 'plugin')
  const visible = drafts.slice(0, ROTATION_PREVIEW_LIMIT)
  const hidden = drafts.length - visible.length

  return (
    <section className='workspace-page' data-page='home'>
      <section className='overview-strip'>
        <MetricTile
          label='Board size'
          value={`${config.cols} x ${config.rows}`}
          meta={`${config.cols * config.rows} characters across ${config.rows} ${pluralize('row', config.rows)}.`}
        />
        <MetricTile
          label='Rotation'
          value={formatDuration(config.messageDurationSeconds)}
          meta={`Screens advance every ${formatDuration(config.messageDurationSeconds)}. API overrides expire after ${formatDuration(config.apiMessageDurationSeconds)}.`}
        />
        <MetricTile label='Screen mix' value={`${drafts.length} total`} meta={`${manual.length} manual · ${plugins.length} plugin.`} />
        <MetricTile
          label='Override'
          value={message.hasOverride ? 'Live' : 'Clear'}
          meta={message.hasOverride ? `Override updated ${formatTimestamp(message.updatedAt)}.` : 'Rotation is running without a temporary override.'}
        />
      </section>

      <div className='home-board-page'>
        <div id='home-board-grid' className='home-board-grid' aria-live='polite'>
          {boards.boards.length === 0 ? (
            <EmptyState>No boards configured yet.</EmptyState>
          ) : (
            boards.boards.map((board) => (
              <article key={board.slug} className='board-overview-card'>
                <div className='board-overview-header'>
                  <h3 className='board-overview-title'>{board.name}</h3>
                  <div className='board-overview-actions'>
                    {board.isDefault && (
                      <span className='board-status-icon' aria-label='Default board' title='Default board'>
                        <StarIcon />
                      </span>
                    )}
                    <a
                      className='screen-icon-button'
                      href={`/${encodeURIComponent(board.slug)}`}
                      target='_blank'
                      rel='noopener noreferrer'
                      aria-label={`Open ${board.name}`}
                      title={`Open ${board.name}`}
                    >
                      <ExternalLinkIcon />
                    </a>
                  </div>
                </div>
                <p className='board-overview-count'>{`${board.screenCount} ${pluralize('screen', board.screenCount)}`}</p>
              </article>
            ))
          )}
        </div>
      </div>

      <WorkspaceSection kicker='Rotation' title='What plays, in order'>
        {drafts.length === 0 ? (
          <EmptyState>No screens are configured yet.</EmptyState>
        ) : (
          <div className='rotation-list'>
            {visible.map((screen, index) => (
              // The doubled .rotation-item-head is deliberate, not a mistake.
              // The outer one is a flex row wrapping a single grid child, which
              // sizes to its content; the inner one then spreads the badge and
              // title across that narrower width. Flattening it makes the head
              // full-bleed and throws the title against the right edge.
              <article key={screen.id} className='rotation-item'>
                <div className='rotation-item-head'>
                  <div className='stack compact-stack'>
                    <div className='rotation-item-head'>
                      <span className='rotation-item-index'>{index + 1}</span>
                      <h3 className='rotation-item-title'>{getScreenTitle(screen, index)}</h3>
                    </div>
                    <div className='screen-item-meta'>
                      <ScreenChip label={screen.type === 'manual' ? 'Manual' : 'Plugin'} variant={screen.type === 'manual' ? '' : 'accent'} />
                      {screen.type === 'plugin' && <ScreenChip label={`${Math.round(screen.refreshIntervalSeconds / 60)} min`} />}
                      {screen.type === 'plugin' && screen.lastError && <ScreenChip label='Needs attention' variant='error' />}
                      {screen.type === 'plugin' && !screen.lastError && screen.lastRefreshedAt && <ScreenChip label={`Updated ${formatTimestamp(screen.lastRefreshedAt)}`} />}
                    </div>
                    <p className='helper-copy'>{getScreenSummary(screen, screens.plugins)}</p>
                  </div>
                </div>
              </article>
            ))}
            {hidden > 0 && <EmptyState>{`${hidden} more ${pluralize('screen', hidden)} in the saved rotation.`}</EmptyState>}
          </div>
        )}
      </WorkspaceSection>

      {/* Nothing to report when no screen fetches anything, so the section goes
          away rather than showing an empty shell. */}
      {plugins.length > 0 && (
        <WorkspaceSection kicker='Plugins' title='Refresh health'>
          <div className='health-list'>
            {plugins.map((screen, index) => {
              const health = pluginHealth(screen)
              return (
                <article key={screen.id} className='health-item'>
                  <div className='health-item-head'>
                    <h3 className='health-item-title'>{getScreenTitle(screen, index)}</h3>
                    <StatusPill label={health.label} tone={health.tone} />
                  </div>
                  <p className='helper-copy'>{health.meta}</p>
                </article>
              )
            })}
          </div>
        </WorkspaceSection>
      )}

      <WorkspaceSection kicker='Live State' title='Override'>
        <OverrideSummary view={describeOverride(message, config, drafts)} variant='overview-preview' />
      </WorkspaceSection>
    </section>
  )
}
