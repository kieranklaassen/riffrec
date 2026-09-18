import type { StatIconName } from '../data'

type Props = {
  name: StatIconName
}

export function StatIcon({ name }: Props) {
  switch (name) {
    case 'revenue':
      return (
        <svg className="stat__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
          <circle cx="12" cy="12" r="2.75" />
          <path d="M6 9.5h.01M18 14.5h.01" />
        </svg>
      )
    case 'users':
      return (
        <svg className="stat__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="9" cy="8" r="3.25" />
          <path d="M2.75 19.5c0-3.3 2.8-5.5 6.25-5.5s6.25 2.2 6.25 5.5" />
          <path d="M16 5.2a3.25 3.25 0 0 1 0 5.6" />
          <path d="M17.5 14.3c2.3.6 3.75 2.5 3.75 5.2" />
        </svg>
      )
    case 'churn':
      return (
        <svg className="stat__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 5c-7 0-13 3-13 10.5 0 1.3.2 2.4.6 3.5" />
          <path d="M20 5c0 7-3 13-10.5 13-1 0-1.9-.1-2.9-.4" />
          <path d="M7.6 19c2.4-4.6 5.4-8 9.9-10.5" />
        </svg>
      )
    case 'tickets':
      return (
        <svg className="stat__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h15A1.5 1.5 0 0 1 21 8.5v1.75a2 2 0 0 0 0 3.5v1.75a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 15.5v-1.75a2 2 0 0 0 0-3.5z" />
          <path d="M14.5 7v10" strokeDasharray="2 2" />
        </svg>
      )
    default: {
      const exhaustive: never = name
      return exhaustive
    }
  }
}
