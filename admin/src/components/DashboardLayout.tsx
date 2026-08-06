import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router'

import type { BoardSummary } from '../api/types'
import type { StatusApi } from '../state/useStatus'
import { DeleteIcon, PlusIcon } from './primitives'

/**
 * The four pages, in sidebar order. `end` marks the index route so `/admin`
 * does not light up while a child route is active.
 */
export const PAGES = [
  { path: '/', title: 'Home', end: true },
  { path: '/send', title: 'Send Message', end: false },
  { path: '/screens', title: 'Screens', end: false },
  { path: '/settings', title: 'Settings', end: false },
] as const

function HomeIcon() {
  return (
    <svg viewBox='0 0 24 24' focusable='false'>
      <path d='M4 10.5L12 4l8 6.5' />
      <path d='M6.5 9.5V20h11V9.5' />
      <path d='M10 20v-5h4v5' />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg viewBox='0 0 24 24' focusable='false'>
      <path d='M21 4L10 15' />
      <path d='M21 4L14 20l-4-5-5-4 16-7z' />
    </svg>
  )
}

function ScreensIcon() {
  return (
    <svg viewBox='0 0 24 24' focusable='false'>
      <rect x='4' y='5' width='16' height='14' rx='2' />
      <path d='M4 10h16' />
      <path d='M9 10v9' />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg viewBox='0 0 24 24' focusable='false'>
      <path d='M4 7h10' />
      <path d='M4 17h16' />
      <path d='M14 7h6' />
      <path d='M4 12h16' />
      <circle cx='11' cy='7' r='2.5' />
      <circle cx='8' cy='12' r='2.5' />
      <circle cx='16' cy='17' r='2.5' />
    </svg>
  )
}

const ICONS: Record<string, () => ReactNode> = {
  '/': HomeIcon,
  '/send': SendIcon,
  '/screens': ScreensIcon,
  '/settings': SettingsIcon,
}

interface BoardSwitcherProps {
  boards: BoardSummary[]
  boardSlug: string | null
  onSelect: (slug: string) => void
  onAdd: () => void
  onDelete: () => void
}

function BoardSwitcher({ boards, boardSlug, onSelect, onAdd, onDelete }: BoardSwitcherProps) {
  return (
    <div className='board-switcher-toolbar' aria-label='Board switcher'>
      <div className='board-switcher-row'>
        <select id='board-select' value={boardSlug ?? ''} onChange={(event) => onSelect(event.target.value)}>
          {boards.map((board) => (
            <option key={board.slug} value={board.slug}>
              {board.isDefault ? `${board.name} (${board.slug}, default)` : `${board.name} (${board.slug})`}
            </option>
          ))}
        </select>
        <button type='button' className='screen-icon-button' aria-label='Add board' title='Add board' onClick={onAdd}>
          <PlusIcon />
        </button>
        <button
          type='button'
          className='screen-icon-button danger'
          aria-label='Delete board'
          title='Delete board'
          // The server refuses to delete the last board; disabling here turns
          // that into an affordance rather than an error message.
          disabled={boards.length <= 1 || !boardSlug}
          onClick={onDelete}
        >
          <DeleteIcon />
        </button>
      </div>
    </div>
  )
}

interface DashboardLayoutProps extends BoardSwitcherProps {
  boardName: string
  status: StatusApi
  onLogout: () => void
  children: ReactNode
}

export function DashboardLayout({ boardName, status, onLogout, children, ...switcher }: DashboardLayoutProps) {
  const { pathname } = useLocation()
  const active = PAGES.find((page) => (page.end ? pathname === page.path : pathname.startsWith(page.path))) ?? PAGES[0]

  // Home spans every board, so naming one there would be misleading -- which
  // is also why the switcher is hidden on it.
  const isHome = active.path === '/'
  const title = isHome || !boardName ? active.title : `${active.title} · ${boardName}`

  return (
    <section className='dashboard-shell' id='dashboard-shell'>
      <aside className='dashboard-sidebar'>
        <div className='sidebar-brand'>
          <p className='eyebrow'>FlipOff Admin</p>
          <h2>Control Desk</h2>
        </div>

        <nav className='sidebar-nav' aria-label='Admin pages'>
          {PAGES.map((page) => {
            const Icon = ICONS[page.path]!
            return (
              <NavLink key={page.path} to={page.path} end={page.end} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
                <span className='nav-icon' aria-hidden='true'>
                  <Icon />
                </span>
                <span>{page.title}</span>
              </NavLink>
            )
          })}
        </nav>

        <div className='sidebar-footer'>
          <button type='button' id='logout-btn' className='ghost-btn sidebar-logout' onClick={onLogout}>
            Log out
          </button>
        </div>
      </aside>

      <section className='dashboard-main'>
        <header className='workspace-header'>
          <div>
            <p className='section-kicker'>Admin Workspace</p>
            <h1 id='workspace-title'>{title}</h1>
          </div>
          <div className='workspace-header-actions' id='workspace-header-actions'>
            {!isHome && <BoardSwitcher {...switcher} />}
          </div>
        </header>

        {children}

        {status.message && (
          <p className={['status-message', status.tone].filter(Boolean).join(' ')} aria-live='polite'>
            {status.message}
          </p>
        )}
      </section>
    </section>
  )
}
