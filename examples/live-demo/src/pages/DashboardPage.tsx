import { orders, stats, type OrderStatus } from '../data'
import { StatIcon } from '../components/StatIcon'

function statusLabel(status: OrderStatus): string {
  switch (status) {
    case 'paid':
      return 'Paid'
    case 'pending':
      return 'Pending'
    case 'refunded':
      return 'Refunded'
    case 'failed':
      return 'Failed'
    default: {
      const exhaustive: never = status
      return exhaustive
    }
  }
}

export function DashboardPage() {
  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Dashboard</h1>
          <p className="page__subtitle">Overview for the last 30 days.</p>
        </div>
        <div className="page__actions">
          <button type="button" className="button button--secondary">
            Export
          </button>
          <button type="button" className="button">
            New order
          </button>
        </div>
      </div>

      <section className="cards" aria-label="Key metrics">
        {stats.map((stat) => (
          <article key={stat.label} className={`card stat stat--${stat.tone}`}>
            <div className="stat__top">
              <div className="stat__label">{stat.label}</div>
              <span className="stat__icon" aria-hidden="true">
                <StatIcon name={stat.icon} />
              </span>
            </div>
            <div className="stat__value">{stat.value}</div>
            <div className={`stat__delta stat__delta--${stat.trend}`}>
              <span className="stat__arrow" aria-hidden="true">
                {stat.trend === 'up' ? '↗' : stat.trend === 'down' ? '↘' : '→'}
              </span>
              {stat.delta} vs last month
            </div>
          </article>
        ))}
      </section>

      <section className="card table-card" aria-labelledby="recent-orders">
        <div className="table-card__header">
          <h2 id="recent-orders" className="table-card__title">
            Recent orders
          </h2>
          <a href="#" className="table-card__link">
            View all
          </a>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Status</th>
              <th className="table__num">Amount</th>
              <th>Placed</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td className="table__mono">{order.id}</td>
                <td>
                  <span className={`pill pill--${order.status}`}>{statusLabel(order.status)}</span>
                </td>
                <td className="table__num">${order.amount.toFixed(2)}</td>
                <td className="table__muted">{order.placedAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
