/**
 * React component rendering a status code breakdown chart (2xx, 3xx, 4xx, 5xx).
 * Displays HTTP status response distribution.
 * Exports StatusCodeChart component.
 */

import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const STATUS_COLORS = {
  '2xx': '#10b981',
  '3xx': '#06b6d4',
  '4xx': '#f59e0b',
  '5xx': '#f43f5e',
};

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        padding: '8px 12px',
        fontSize: 12,
      }}>
        <p style={{ color: payload[0].payload.fill, fontWeight: 600 }}>
          {payload[0].name}: {payload[0].value.toLocaleString()}
        </p>
      </div>
    );
  }
  return null;
};

export default function StatusCodeChart({ data }) {
  if (!data) return null;

  const chartData = Object.entries(data)
    .filter(([, v]) => v > 0)
    .map(([key, value]) => ({
      name:  key,
      value,
      fill:  STATUS_COLORS[key] || '#8b949e',
    }));

  const total = chartData.reduce((sum, d) => sum + d.value, 0);

  if (total === 0) {
    return (
      <div className="card">
        <div className="card-header">
          <span className="card-title">Status Codes</span>
        </div>
        <div className="card-body">
          <div className="empty-state" style={{ padding: '28px 0' }}>
            <p style={{ fontSize: 12 }}>No data yet</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Status Code Breakdown</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {total.toLocaleString()} total
        </span>
      </div>
      <div className="card-body" style={{ paddingTop: 8 }}>
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                dataKey="value"
                strokeWidth={0}
              >
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={(value) => (
                  <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
