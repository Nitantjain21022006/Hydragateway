/**
 * Kafka monitoring dashboard page component.
 * Displays Kafka connectivity status, total consumed events, events/sec, per-topic breakdown, and live event feed.
 * Exports KafkaPage component.
 */

import React, { useState } from 'react';
import { Radio, Zap, BarChart3, List, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import TopBar from '../components/layout/TopBar';
import MetricsCard from '../components/shared/MetricsCard';
import { useKafkaMetrics } from '../hooks/useKafkaMetrics';
import { useSSE } from '../hooks/useSSE';

const TOPIC_COLORS = {
  'order.created':     '#7c3aed',
  'payment.completed': '#059669',
  'payment.failed':    '#dc2626',
  'inventory.updated': '#0ea5e9',
  'analytics.event':   '#f59e0b',
};

function TopicBar({ name, count, max }) {
  const color = TOPIC_COLORS[name] || '#6366f1';
  const pct   = max > 0 ? (count / max) * 100 : 0;

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
        <span style={{ color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace' }}>
          {name}
        </span>
        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
          {count.toLocaleString()}
        </span>
      </div>
      <div className="progress-track">
        <div
          className="progress-fill"
          style={{
            width:      `${pct}%`,
            background: color,
            animation:  'none',
            transition: 'width 0.4s ease',
          }}
        />
      </div>
    </div>
  );
}

function EventBadge({ type }) {
  const color = TOPIC_COLORS[type] || '#6366f1';
  return (
    <span style={{
      display:      'inline-block',
      background:   `${color}22`,
      color:        color,
      border:       `1px solid ${color}55`,
      borderRadius:  4,
      padding:      '2px 8px',
      fontSize:      11,
      fontFamily:   'JetBrains Mono, monospace',
      fontWeight:    600,
    }}>
      {type}
    </span>
  );
}

function LiveFeed({ events }) {
  if (!events.length) {
    return (
      <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
        Waiting for Kafka events…
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {events.map((ev, i) => (
        <div key={i} style={{
          display:       'flex',
          alignItems:    'center',
          gap:            12,
          padding:       '8px 12px',
          background:    'var(--bg-hover)',
          borderRadius:   6,
          fontSize:       12,
          animation:     'fadeIn 0.3s ease',
        }}>
          <span style={{ color: 'var(--text-muted)', flexShrink: 0, width: 70 }}>
            {ev.ts ? new Date(ev.ts).toLocaleTimeString() : '—'}
          </span>
          <EventBadge type={ev.eventType || ev.topic || 'unknown'} />
          {ev.orderId && (
            <span style={{ color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace' }}>
              order: {ev.orderId.slice(-8)}
            </span>
          )}
          {ev.productId && (
            <span style={{ color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace' }}>
              product: {ev.productId.slice(-8)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function KafkaPage() {
  const { data, loading, lastUpdated, refresh } = useKafkaMetrics();
  const [liveEvents, setLiveEvents] = useState([]);

  useSSE('/analytics/stream', {
    onEvent: (name, payload) => {
      if (name === 'kafka_event') {
        setLiveEvents(prev => {
          const next = [{ ...payload, ts: Date.now() }, ...prev];
          return next.slice(0, 30);
        });
      }
    },
  });

  const topicEntries  = Object.entries(data.topics || {}).sort((a, b) => b[1] - a[1]);
  const eventEntries  = Object.entries(data.events  || {}).sort((a, b) => b[1] - a[1]);
  const topicMax      = topicEntries.reduce((m, [, v]) => Math.max(m, v), 0);
  const eventMax      = eventEntries.reduce((m, [, v]) => Math.max(m, v), 0);

  return (
    <>
      <TopBar
        title="Kafka Events"
        subtitle="Asynchronous event stream monitoring"
        lastUpdated={lastUpdated}
        actions={
          <button className="btn btn-ghost btn-sm" onClick={refresh}>
            <RefreshCw size={13} style={{ marginRight: 4 }} />
            Refresh
          </button>
        }
      />

      <main className="page-main animate-fade-in">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-muted)' }}>
            <div className="spinner" />
            Loading Kafka metrics…
          </div>
        ) : (
          <div className="space-y-6">

            <div className="grid-4">
              <div className="card" style={{ gridColumn: 'span 1' }}>
                <div className="card-body" style={{ alignItems: 'center', textAlign: 'center' }}>
                  <div style={{ marginBottom: 8 }}>
                    {data.connected ? (
                      <CheckCircle size={36} style={{ color: 'var(--emerald)' }} />
                    ) : (
                      <XCircle size={36} style={{ color: 'var(--rose)' }} />
                    )}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: data.connected ? 'var(--emerald)' : 'var(--rose)' }}>
                    {data.connected ? 'Connected' : 'Disconnected'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Kafka Broker</div>
                </div>
              </div>

              <MetricsCard
                title="Events Consumed"
                value={data.consumed_total.toLocaleString()}
                icon={Radio}
                accent="purple"
              />

              <MetricsCard
                title="Events / sec"
                value={data.events_per_sec.toFixed(1)}
                icon={Zap}
                accent="blue"
              />

              <MetricsCard
                title="Active Topics"
                value={topicEntries.length}
                icon={BarChart3}
                accent="emerald"
              />
            </div>

            <div className="grid-2">
              <div className="card">
                <div className="card-header">
                  <span className="card-title">Events by Topic</span>
                </div>
                <div className="card-body">
                  {topicEntries.length === 0 ? (
                    <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                      No topic data yet — create an order to start seeing events.
                    </span>
                  ) : (
                    topicEntries.map(([name, count]) => (
                      <TopicBar key={name} name={name} count={count} max={topicMax} />
                    ))
                  )}
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <span className="card-title">Events by Type</span>
                </div>
                <div className="card-body">
                  {eventEntries.length === 0 ? (
                    <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                      No event type data yet — events will appear after activity.
                    </span>
                  ) : (
                    eventEntries.map(([name, count]) => (
                      <TopicBar key={name} name={name} count={count} max={eventMax} />
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <span className="card-title">
                  <List size={14} style={{ marginRight: 6 }} />
                  Live Event Feed
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {liveEvents.length > 0 ? `${liveEvents.length} events captured` : 'Waiting for SSE stream…'}
                </span>
              </div>
              <div className="card-body" style={{ maxHeight: 320, overflowY: 'auto' }}>
                <LiveFeed events={liveEvents} />
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <span className="card-title">Event Flow Architecture</span>
              </div>
              <div className="card-body" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, lineHeight: 1.8 }}>
                <div style={{ color: 'var(--text-secondary)', whiteSpace: 'pre' }}>
{`POST /v1/orders  (sync REST)
  └─► Order Service  ──────────────────► MongoDB (saves order)
        │                                HTTP ──► Payment Service  (sync response)
        │
        └─► Kafka: order.created  ──────► Payment Service (async consumer)
                                          └─► Kafka: payment.completed / payment.failed
                                                └─► Product Service  (reduces stock)
                                                      └─► Kafka: inventory.updated
                                                └─► Order Service (reconciles status)

POST /v1/auth/login  ───────────────────► Kafka: analytics.event (user.login)
GET  /v1/products/:id ──────────────────► Kafka: analytics.event (product.viewed)

All events ─────────────────────────────► Analytics Consumer  ──► Redis counters`}
                </div>
              </div>
            </div>

          </div>
        )}
      </main>
    </>
  );
}
