import { useState, type FormEvent } from 'react'

import { clearMessage, sendMessage } from '../api/client'
import { OverrideSummary, describeOverride } from '../components/OverrideSummary'
import { WorkspaceSection } from '../components/primitives'
import { useAdmin } from '../state/adminContext'

export function SendMessagePage() {
  const { config, message, boardSlug, status, setMessage, drafts } = useAdmin()
  const [text, setText] = useState('')

  const view = describeOverride(message, config, drafts)

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()

    const trimmed = text.trim()
    if (!trimmed) {
      status.set('Enter a message before sending it.', 'error')
      return
    }

    await status.run(
      'Sending remote message...',
      async () => {
        // The response is the new override state, so there is nothing to
        // refetch -- applying it directly keeps the preview in step without a
        // full snapshot reload.
        setMessage(await sendMessage(boardSlug, trimmed))
      },
      'Remote message sent.',
    )
  }

  async function handleClear(): Promise<void> {
    await status.run(
      'Clearing active override...',
      async () => {
        setMessage(await clearMessage(boardSlug))
      },
      'Remote override cleared.',
    )
  }

  return (
    <section className='workspace-page' data-page='send-message'>
      <form className='stack message-form-layout' onSubmit={handleSubmit}>
        <label className='field'>
          <span>Message</span>
          <textarea id='remote-message' rows={5} spellCheck={false} placeholder='Server driven updates are live' value={text} onChange={(event) => setText(event.target.value)} />
        </label>

        <div className='action-row'>
          <button type='submit' className='primary-btn'>
            Send Message
          </button>
          <button type='button' className='ghost-btn' onClick={() => void handleClear()}>
            Clear Active Override
          </button>
        </div>
      </form>

      <WorkspaceSection kicker='Live State' title='What the board is showing'>
        <OverrideSummary view={view} variant='compact-preview' />
      </WorkspaceSection>
    </section>
  )
}
