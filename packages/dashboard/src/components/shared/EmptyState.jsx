/**
 * Reusable UI fallback component for empty data sets and missing stats.
 * Renders placeholder visuals and helpful messaging.
 * Exports EmptyState component.
 */

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
