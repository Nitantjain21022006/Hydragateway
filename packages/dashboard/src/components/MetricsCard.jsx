/**
 * Stat card component displaying summary analytics metrics.
 * Renders KPI cards for traffic, latencies, and error rates.
 * Exports MetricsCard component.
 */

import React from 'react';

const MetricsCard = ({ title, value, icon, trend }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
        <div className="flex items-baseline space-x-2">
          <h3 className="text-2xl font-bold text-gray-900">{value}</h3>
          {trend && (
            <span className={`text-xs font-medium ${trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
              {trend === 'up' ? '↑' : '↓'}
            </span>
          )}
        </div>
      </div>
      <div className="p-3 bg-gray-50 rounded-lg">
        {icon}
      </div>
    </div>
  );
};

export default MetricsCard;
