import { useState, type FormEvent } from 'react'

type Settings = {
  name: string
  email: string
  timezone: string
  digest: 'daily' | 'weekly' | 'never'
  notifyOrders: boolean
  notifyMentions: boolean
  marketing: boolean
}

const initial: Settings = {
  name: 'Kieran Klaassen',
  email: 'kieran@orbitlabs.dev',
  timezone: 'America/Los_Angeles',
  digest: 'weekly',
  notifyOrders: true,
  notifyMentions: true,
  marketing: false,
}

export function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(initial)
  const [saved, setSaved] = useState(false)

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSaved(false)
    setSettings((current) => ({ ...current, [key]: value }))
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setSaved(true)
  }

  return (
    <div className="page page--narrow">
      <div className="page__header">
        <div>
          <h1 className="page__title">Settings</h1>
          <p className="page__subtitle">Manage your profile and how Orbit reaches you.</p>
        </div>
      </div>

      <form className="card form" onSubmit={onSubmit}>
        <fieldset className="form__section">
          <legend className="form__legend">Profile</legend>

          <div className="field">
            <label htmlFor="name">Full name</label>
            <input id="name" value={settings.name} onChange={(e) => update('name', e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={settings.email} onChange={(e) => update('email', e.target.value)} />
            <p className="field__hint">Used for sign-in and receipts.</p>
          </div>

          <div className="field">
            <label htmlFor="timezone">Timezone</label>
            <select id="timezone" value={settings.timezone} onChange={(e) => update('timezone', e.target.value)}>
              <option value="America/Los_Angeles">Pacific (Los Angeles)</option>
              <option value="America/New_York">Eastern (New York)</option>
              <option value="Europe/Amsterdam">Central European (Amsterdam)</option>
              <option value="Asia/Tokyo">Japan (Tokyo)</option>
            </select>
          </div>
        </fieldset>

        <fieldset className="form__section">
          <legend className="form__legend">Notifications</legend>

          <div className="field">
            <label htmlFor="digest">Email digest</label>
            <select id="digest" value={settings.digest} onChange={(e) => update('digest', e.target.value as Settings['digest'])}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="never">Never</option>
            </select>
          </div>

          <label className="checkbox">
            <input type="checkbox" checked={settings.notifyOrders} onChange={(e) => update('notifyOrders', e.target.checked)} />
            <span>New orders and refunds</span>
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={settings.notifyMentions} onChange={(e) => update('notifyMentions', e.target.checked)} />
            <span>Mentions and comments</span>
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={settings.marketing} onChange={(e) => update('marketing', e.target.checked)} />
            <span>Product updates and tips</span>
          </label>
        </fieldset>

        <div className="form__footer">
          {saved ? <span className="form__status">Saved</span> : <span className="form__status form__status--muted">Unsaved changes</span>}
          <div className="page__actions">
            <button type="button" className="button button--secondary" onClick={() => { setSettings(initial); setSaved(false) }}>
              Reset
            </button>
            <button type="submit" className="button">
              Save changes
            </button>
          </div>
        </div>
      </form>

      <section className="card danger">
        <h2 className="danger__title">Danger zone</h2>
        <p className="danger__text">Deleting your workspace removes all projects, orders, and team members. This cannot be undone.</p>
        <button type="button" className="button button--danger">
          Delete workspace
        </button>
      </section>
    </div>
  )
}
