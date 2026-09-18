import { activity } from '../data'

export function ActivityPage() {
  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Activity</h1>
          <p className="page__subtitle">What happened across the workspace recently.</p>
        </div>
        <div className="page__actions">
          <button type="button" className="button button--secondary">
            Mark all read
          </button>
        </div>
      </div>

      <section className="card">
        <ul className="feed">
          {activity.map((event) => (
            <li key={event.id} className="feed__item">
              <div className="feed__avatar" aria-hidden="true">
                {event.actor
                  .split(' ')
                  .map((part) => part[0])
                  .join('')
                  .slice(0, 2)}
              </div>
              <div className="feed__body">
                <div className="feed__text">
                  <strong>{event.actor}</strong> {event.action} <em>{event.target}</em>
                </div>
                <div className="feed__when">{event.when}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
