import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router'

import './css/reset.css'
import './css/admin.css'

import { App } from './App'
import { HomePage } from './pages/HomePage'
import { ScreensPage } from './pages/ScreensPage'
import { SendMessagePage } from './pages/SendMessagePage'
import { SettingsPage } from './pages/SettingsPage'

/**
 * Real URLs, not in-page tabs: /admin/screens survives a refresh and can be
 * linked to. The backend serves the same document for every /admin/* path
 * (see routes/pages.ts), so the router is what decides which page renders.
 */
const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <App />,
      children: [
        { index: true, element: <HomePage /> },
        { path: 'send', element: <SendMessagePage /> },
        { path: 'screens', element: <ScreensPage /> },
        { path: 'settings', element: <SettingsPage /> },
        // The backend's catch-all means any /admin/* URL reaches us, including
        // typos. Send those home rather than rendering nothing.
        { path: '*', element: <Navigate to='/' replace /> },
      ],
    },
  ],
  { basename: '/admin' },
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
