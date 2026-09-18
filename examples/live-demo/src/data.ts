export type StatTone = 'brand' | 'blue' | 'green' | 'amber'

export type StatIconName = 'revenue' | 'users' | 'churn' | 'tickets'

export type Stat = {
  label: string
  value: string
  delta: string
  trend: 'up' | 'down' | 'flat'
  icon: StatIconName
  tone: StatTone
  /** Last 12 days, oldest first; drawn as a small chart in the card. */
  trendline?: number[]
}

export type OrderStatus = 'paid' | 'pending' | 'refunded' | 'failed'

export type Order = {
  id: string
  customer: string
  email: string
  amount: number
  status: OrderStatus
  placedAt: string
}

export type ActivityEvent = {
  id: string
  actor: string
  action: string
  target: string
  when: string
}

export const stats: Stat[] = [
  { label: 'Revenue', value: '$48,210', delta: '+12.4%', trend: 'up', icon: 'revenue', tone: 'brand', trendline: [38.2, 39.0, 40.4, 39.8, 41.6, 42.3, 43.1, 42.7, 44.9, 46.0, 47.2, 48.2] },
  { label: 'Churn', value: '2.1%', delta: '-0.4 pts', trend: 'down', icon: 'churn', tone: 'blue', trendline: [2.9, 2.8, 2.8, 2.6, 2.7, 2.5, 2.4, 2.5, 2.3, 2.2, 2.2, 2.1] },
  { label: 'Open tickets', value: '27', delta: '0', trend: 'flat', icon: 'tickets', tone: 'amber', trendline: [24, 29, 31, 26, 22, 25, 30, 33, 28, 24, 26, 27] },
]

export const orders: Order[] = [
  { id: 'ORD-1042', customer: 'Maya Chen', email: 'maya@northwind.io', amount: 129, status: 'paid', placedAt: '2026-09-17 09:12' },
  { id: 'ORD-1041', customer: 'Jonas Berg', email: 'jonas@fjord.dev', amount: 49, status: 'pending', placedAt: '2026-09-17 08:47' },
  { id: 'ORD-1040', customer: 'Priya Natarajan', email: 'priya@lumen.co', amount: 899, status: 'paid', placedAt: '2026-09-16 22:05' },
  { id: 'ORD-1039', customer: 'Diego Alvarez', email: 'diego@saltmill.com', amount: 249, status: 'refunded', placedAt: '2026-09-16 18:30' },
  { id: 'ORD-1038', customer: 'Aoife Byrne', email: 'aoife@greenline.ie', amount: 79, status: 'failed', placedAt: '2026-09-16 15:02' },
  { id: 'ORD-1037', customer: 'Tomasz Nowak', email: 'tomasz@kettle.pl', amount: 129, status: 'paid', placedAt: '2026-09-16 11:41' },
]

export const activity: ActivityEvent[] = [
  { id: 'a1', actor: 'Maya Chen', action: 'upgraded to', target: 'Pro plan', when: '12 minutes ago' },
  { id: 'a2', actor: 'System', action: 'completed', target: 'nightly backup', when: '2 hours ago' },
  { id: 'a3', actor: 'Jonas Berg', action: 'invited', target: 'two teammates', when: '3 hours ago' },
  { id: 'a4', actor: 'Priya Natarajan', action: 'exported', target: 'Q3 revenue report', when: 'yesterday' },
  { id: 'a5', actor: 'Diego Alvarez', action: 'requested refund for', target: 'ORD-1039', when: 'yesterday' },
  { id: 'a6', actor: 'Aoife Byrne', action: 'payment failed on', target: 'ORD-1038', when: 'yesterday' },
]
