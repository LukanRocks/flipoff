import { useState, type FormEvent } from 'react'

import { login } from '../api/client'
import type { StatusApi } from '../state/useStatus'

/**
 * The password never leaves this component's state -- it is cleared on the way
 * out, and the session lives in an httpOnly cookie the server sets.
 */
export function Login({ status, onAuthenticated }: { status: StatusApi; onAuthenticated: () => Promise<void> }) {
  const [password, setPassword] = useState('')

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    const ok = await status.run('Checking password...', async () => {
      await login(password)
    })
    if (!ok) return

    setPassword('')
    await onAuthenticated()
  }

  return (
    <section className='login-shell' id='login-shell'>
      <section className='login-intro'>
        <div className='login-intro-copy'>
          <p className='eyebrow'>FlipOff Admin</p>
          <h1>Run the display from one calm control desk.</h1>
          <p className='lede'>Control remote overrides, rotation screens, and board geometry without digging through crowded panels.</p>
        </div>

        <div className='login-highlights' aria-hidden='true'>
          <article className='intro-note'>
            <p className='section-kicker'>Overview</p>
            <p>Board status, rotation health, and override state stay visible in the first scan.</p>
          </article>
          <article className='intro-note'>
            <p className='section-kicker'>Editing</p>
            <p>Message tools, screens, and settings each get their own working surface instead of sharing one stack.</p>
          </article>
          <article className='intro-note'>
            <p className='section-kicker'>Runtime</p>
            <p>Changes still save directly to the server config and refresh the live display automatically.</p>
          </article>
        </div>
      </section>

      <section className='login-card' id='login-panel'>
        <div className='login-card-head'>
          <p className='section-kicker'>Admin Login</p>
          <h2>Unlock the dashboard</h2>
          <p className='helper-copy'>Enter the current admin password to open the runtime controls.</p>
        </div>

        <form className='stack' onSubmit={handleSubmit}>
          <label className='field'>
            <span>Password</span>
            <input
              id='password'
              name='password'
              type='password'
              autoComplete='current-password'
              required
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <button type='submit' className='primary-btn'>
            Unlock Admin
          </button>
        </form>

        <p className='helper-copy'>If this is the first run, the server prints the generated password to the terminal and stores it in the user config.</p>
      </section>
    </section>
  )
}
