/**
 * React component rendering a time-series chart of gateway response latencies.
 * Visualizes average response time trends over time using Recharts.
 * Exports ResponseTimeChart component.
 */

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b'];

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        padding: '8px 12px',
        fontSize: 12,
      }}>
        <p style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{label}</p>
        <p style={{ color: '#8b5cf6', fontWeight: 600 }}>{payload[0]?.value}ms</p>
      </div>
    );
  }
  return null;
};

export default function ResponseTimeChart({ data = [] }) {
  const normalized = data.map((d) => ({
    service: d.service || d.name,
    time:    d.time || d.avg || 0,
  }));

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Response Times</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>avg ms</span>
      </div>
      <div className="card-body" style={{ paddingTop: 12 }}>
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={normalized} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="service"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="time" radius={[4, 4, 0, 0]}>
                {normalized.map((entry, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
