import React from 'react';
import { Inbox } from 'lucide-react';

export default function EmptyState({ icon: Icon = Inbox, title = 'No data yet', description, action }) {
  return (
    <div className="empty-state">
      <Icon size={40} />
      <div>
        <p style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{title}</p>
        {description && (
          <p style={{ fontSize: 12, marginTop: 4 }}>{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
