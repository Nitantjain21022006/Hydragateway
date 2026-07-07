import React, { useState, useEffect } from 'react';
import api from './services/axios';
import MetricsCard from './components/MetricsCard';
import TrafficChart from './components/TrafficChart';
import ResponseTimeChart from './components/ResponseTimeChart';
import ServiceHealth from './components/ServiceHealth';
import { Activity, XCircle, BarChart3, Clock } from 'lucide-react';

function App() {
  const [metrics, setMetrics] = useState({
    totalRequests: 0,
    failedRequests: 0,
    gatewayTraffic: [],
    serviceHealth: [],
    responseTimes: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchMetrics = async () => {
    try {
      // Simulate API call using axios since no backend exists yet or we just mock if it fails
      // In reality, this would hit the API gateway
      const res = await api.get('/api/analytics').catch(() => ({
        data: {
          totalRequests: 12543,
          failedRequests: 234,
          gatewayTraffic: [
            { time: '10:00', traffic: 400 },
            { time: '10:05', traffic: 300 },
            { time: '10:10', traffic: 550 },
            { time: '10:15', traffic: 450 },
            { time: '10:20', traffic: 600 },
            { time: '10:25', traffic: 700 }
          ],
          serviceHealth: [
            { name: 'Auth Service', status: 'Healthy', uptime: '99.9%' },
            { name: 'Product Service', status: 'Healthy', uptime: '99.8%' },
            { name: 'Order Service', status: 'Degraded', uptime: '98.5%' },
            { name: 'Payment Service', status: 'Healthy', uptime: '100%' }
          ],
          responseTimes: [
            { service: 'Auth', time: 45 },
            { service: 'Product', time: 120 },
            { service: 'Order', time: 85 },
            { service: 'Payment', time: 200 }
          ]
        }
      }));
      
      setMetrics(res.data);
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch metrics');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div className="flex items-center justify-center min-h-screen bg-gray-50 text-gray-900">Loading Dashboard...</div>;
  if (error) return <div className="flex items-center justify-center min-h-screen bg-gray-50 text-red-600">{error}</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <header>
          <h1 className="text-3xl font-bold text-gray-900">HydraGateway Dashboard</h1>
          <p className="text-gray-500 mt-2">Real-time monitoring and analytics</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <MetricsCard 
            title="Total Requests" 
            value={metrics.totalRequests.toLocaleString()} 
            icon={<Activity className="text-blue-500" />} 
          />
          <MetricsCard 
            title="Failed Requests" 
            value={metrics.failedRequests.toLocaleString()} 
            icon={<XCircle className="text-red-500" />} 
            trend="down"
          />
          <MetricsCard 
            title="Avg Gateway Traffic" 
            value={`${Math.round(metrics.gatewayTraffic.reduce((acc, curr) => acc + curr.traffic, 0) / metrics.gatewayTraffic.length)} req/s`}
            icon={<BarChart3 className="text-green-500" />} 
          />
          <MetricsCard 
            title="Avg Response Time" 
            value={`${Math.round(metrics.responseTimes.reduce((acc, curr) => acc + curr.time, 0) / metrics.responseTimes.length)}ms`} 
            icon={<Clock className="text-purple-500" />} 
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <TrafficChart data={metrics.gatewayTraffic} />
          <ResponseTimeChart data={metrics.responseTimes} />
        </div>

        <div className="mt-8">
          <ServiceHealth data={metrics.serviceHealth} />
        </div>
      </div>
    </div>
  );
}

export default App;
