/**
 * Component summarizing overall system microservice health status.
 * Renders status overview cards for registered downstream services.
 * Exports ServiceHealth component.
 */

import React from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react';

const getStatusIcon = (status) => {
  switch (status.toLowerCase()) {
    case 'healthy':
      return <CheckCircle2 className="text-green-500 w-5 h-5" />;
    case 'degraded':
      return <AlertTriangle className="text-yellow-500 w-5 h-5" />;
    case 'down':
      return <AlertCircle className="text-red-500 w-5 h-5" />;
    default:
      return <CheckCircle2 className="text-gray-400 w-5 h-5" />;
  }
};

const getStatusColor = (status) => {
  switch (status.toLowerCase()) {
    case 'healthy':
      return 'bg-green-100 text-green-800';
    case 'degraded':
      return 'bg-yellow-100 text-yellow-800';
    case 'down':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

const ServiceHealth = ({ data }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-6 border-b border-gray-100">
        <h3 className="text-lg font-semibold text-gray-900">Service Health Status</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-sm font-medium text-gray-500">
              <th className="px-6 py-4">Service Name</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Uptime</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map((service, index) => (
              <tr key={index} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center space-x-3">
                    {getStatusIcon(service.status)}
                    <span className="font-medium text-gray-900">{service.name}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(service.status)}`}>
                    {service.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {service.uptime}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ServiceHealth;
