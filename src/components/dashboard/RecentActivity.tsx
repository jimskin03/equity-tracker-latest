import type { RecentActivityItem } from '../../types'

interface RecentActivityProps {
  activities: RecentActivityItem[]
  onViewAll: () => void
}

export function RecentActivity({ activities, onViewAll }: RecentActivityProps) {
  return (
    <article className="bottom-card recent-activity-card">
      <div className="card-top-bar">
        <h2 className="card-title">Recent Activity</h2>
        <button type="button" className="view-link" onClick={onViewAll}>
          View All &rarr;
        </button>
      </div>

      <div className="activity-list">
        {activities.slice(0, 5).map((act) => {
          const dotClass =
            act.type === 'buy'
              ? 'dot-buy'
              : act.type === 'sell'
              ? 'dot-sell'
              : act.type === 'deposit'
              ? 'dot-deposit'
              : 'dot-transfer'

          return (
            <div key={act.id} className="activity-row">
              <div className="activity-main">
                <span className={`activity-dot ${dotClass}`} />
                <div className="activity-texts">
                  <div className="activity-action-line">
                    <strong className="activity-title">{act.title}</strong>
                    <span className="activity-sub muted">{act.subtitle}</span>
                  </div>
                </div>
              </div>

              <div className="activity-end">
                <span className="activity-amount">{act.amount}</span>
                <span className="activity-date muted">{act.date}</span>
              </div>
            </div>
          )
        })}
      </div>
    </article>
  )
}
