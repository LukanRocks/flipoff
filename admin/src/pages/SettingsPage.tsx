import { useEffect, useState, type FormEvent } from 'react'

import { saveSettings, type SettingsPayload } from '../api/client'
import { useAdmin } from '../state/adminContext'

interface Form {
  name: string
  slug: string
  isDefault: boolean
  cols: string
  rows: string
  messageDurationSeconds: string
  apiMessageDurationSeconds: string
}

/** Numbers are held as strings so a half-typed field does not snap back to 0. */
function formFrom(config: ReturnType<typeof useAdmin>['config']): Form {
  return {
    name: config.name,
    slug: config.slug,
    isDefault: config.isDefault,
    cols: String(config.cols),
    rows: String(config.rows),
    messageDurationSeconds: String(config.messageDurationSeconds),
    apiMessageDurationSeconds: String(config.apiMessageDurationSeconds),
  }
}

export function SettingsPage() {
  const { config, boardSlug, status, reload, draftsDirty } = useAdmin()

  const [form, setForm] = useState<Form>(() => formFrom(config))
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')

  // Re-seed when the selected board changes, or after a save returns the
  // server's normalised values (a slug is rewritten, not accepted verbatim).
  useEffect(() => setForm(formFrom(config)), [config])

  const update = <K extends keyof Form>(key: K, value: Form[K]): void => setForm((previous) => ({ ...previous, [key]: value }))

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()

    // A resize reconciles the screen stack server-side, which would silently
    // throw away unsaved drafts.
    if (draftsDirty) {
      status.set('Save screens before changing settings so the draft screen stack is not lost.', 'error')
      return
    }

    if ((password || passwordConfirm) && password !== passwordConfirm) {
      status.set('The new admin password confirmation does not match.', 'error')
      return
    }

    const payload: SettingsPayload = {
      name: form.name.trim(),
      slug: form.slug.trim(),
      isDefault: form.isDefault,
      cols: Number(form.cols),
      rows: Number(form.rows),
      messageDurationSeconds: Number(form.messageDurationSeconds),
      apiMessageDurationSeconds: Number(form.apiMessageDurationSeconds),
    }
    // Present-but-empty would be read as "set the password to nothing".
    if (password) payload.adminPassword = password

    let savedSlug = boardSlug
    const ok = await status.run('Saving settings...', async () => {
      const saved = await saveSettings(boardSlug, payload)
      savedSlug = saved.slug
    })
    if (!ok) return

    setPassword('')
    setPasswordConfirm('')
    // Follow the slug: a rename means the board we were editing now answers
    // to a different name.
    await reload(savedSlug)
    status.set(password ? 'Settings and admin password saved. Display pages will refresh automatically.' : 'Settings saved. Display pages will refresh automatically.', 'success')
  }

  return (
    <section className='workspace-page' data-page='settings'>
      <div className='page-grid page-grid-single'>
        <div className='page-panel settings-panel'>
          {/* The id is load-bearing: `.settings-panel #settings-form` is the
              one id-based rule in admin.css, and it widens the gap from the
              .stack default of 20px to 30px. Drop it and the form silently
              tightens by 50px. */}
          <form id='settings-form' className='stack' onSubmit={handleSubmit}>
            <section className='form-section stack'>
              <div className='section-heading'>
                <div>
                  <p className='section-kicker'>Board</p>
                  <h2>Identity and routing</h2>
                </div>
              </div>

              <div className='grid grid-two'>
                <label className='field'>
                  <span>Board name</span>
                  <input id='board-name' type='text' required value={form.name} onChange={(event) => update('name', event.target.value)} />
                </label>

                <label className='field'>
                  <span>Board slug</span>
                  <input id='board-slug' type='text' required value={form.slug} onChange={(event) => update('slug', event.target.value)} />
                </label>
              </div>

              <label className='field'>
                <span>Default board</span>
                <input id='board-default' type='checkbox' checked={form.isDefault} onChange={(event) => update('isDefault', event.target.checked)} />
              </label>
            </section>

            <section className='form-section stack'>
              <div className='section-heading'>
                <div>
                  <p className='section-kicker'>Display</p>
                  <h2>Board geometry</h2>
                </div>
              </div>

              <div className='grid grid-two'>
                <label className='field'>
                  <span>Columns</span>
                  <input id='cols' type='number' min='6' max='256' required value={form.cols} onChange={(event) => update('cols', event.target.value)} />
                </label>

                <label className='field'>
                  <span>Rows</span>
                  <input id='rows' type='number' min='1' max='128' required value={form.rows} onChange={(event) => update('rows', event.target.value)} />
                </label>
              </div>
            </section>

            <section className='form-section stack'>
              <div className='section-heading'>
                <div>
                  <p className='section-kicker'>Timing</p>
                  <h2>Rotation and override windows</h2>
                </div>
              </div>

              <div className='grid grid-two'>
                <label className='field'>
                  <span>Screen message duration (seconds)</span>
                  <input
                    id='message-duration'
                    type='number'
                    min='1'
                    max='86400'
                    required
                    value={form.messageDurationSeconds}
                    onChange={(event) => update('messageDurationSeconds', event.target.value)}
                  />
                </label>

                <label className='field'>
                  <span>API message duration (seconds)</span>
                  <input
                    id='api-duration'
                    type='number'
                    min='1'
                    max='86400'
                    required
                    value={form.apiMessageDurationSeconds}
                    onChange={(event) => update('apiMessageDurationSeconds', event.target.value)}
                  />
                </label>
              </div>
            </section>

            <section className='form-section stack'>
              <div className='section-heading'>
                <div>
                  <p className='section-kicker'>Security</p>
                  <h2>Admin password</h2>
                </div>
              </div>

              <div className='grid grid-two'>
                <label className='field'>
                  <span>New admin password</span>
                  <input
                    id='admin-password-setting'
                    type='password'
                    autoComplete='new-password'
                    placeholder='Leave blank to keep current password'
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </label>

                <label className='field'>
                  <span>Confirm new admin password</span>
                  <input
                    id='admin-password-confirm-setting'
                    type='password'
                    autoComplete='new-password'
                    placeholder='Repeat the new password'
                    value={passwordConfirm}
                    onChange={(event) => setPasswordConfirm(event.target.value)}
                  />
                </label>
              </div>
            </section>

            <p className='helper-copy'>Changes save to the server config immediately. Leave the password fields blank to keep the current password.</p>

            <button type='submit' className='primary-btn'>
              Save Settings
            </button>
          </form>
        </div>
      </div>
    </section>
  )
}
