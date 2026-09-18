import { orders, stats, type OrderStatus } from '../data'
import { StatIcon } from '../components/StatIcon'

/** A small area chart of recent values, scaled to its own min and max. */
function Trendline({ points, label }: { points: number[]; label: string }) {
  const width = 200
  const height = 40
  const min = Math.min(...points)
  const max = Math.max(...points)
  const x = (index: number) => (index / (points.length - 1)) * width
  const y = (value: number) => height - 4 - ((value - min) / (max - min || 1)) * (height - 8)
  const line = points.map((value, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)} ${y(value).toFixed(1)}`).join(' ')
  return (
    <svg className="stat__chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <path d={`${line} L${width} ${height} L0 ${height} Z`} className="stat__chart-area" />
      <path d={line} className="stat__chart-line" />
      <circle cx={x(points.length - 1)} cy={y(points[points.length - 1])} r="2.5" className="stat__chart-dot" />
    </svg>
  )
}

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
      <div className="page__header page__header--textured">
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
            {stat.trendline ? <Trendline points={stat.trendline} label={`${stat.label} over the last 12 days`} /> : null}
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
              <th>Name</th>
              <th>Email</th>
              <th>Status</th>
              <th className="table__num">Amount</th>
              <th>Placed</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td className="table__mono">{order.id}</td>
                <td>{order.customer}</td>
                <td className="table__muted">{order.email}</td>
                <td>
                  <span className={`pill pill--${order.status}`}>
                    {statusLabel(order.status)}
                    {order.status === 'paid' ? ` · $${order.amount.toFixed(2)}` : null}
                  </span>
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
