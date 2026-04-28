import { useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from 'recharts'
import { FileText, FileSpreadsheet } from 'lucide-react'
import { apiUrl } from './config'
import type { TicketReport, PriorityReport, AssigneeReport, TrendReport } from './types'

interface ReportsPageProps {
  sessionToken: string | null
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8']

export const ReportsPage = ({ sessionToken }: ReportsPageProps) => {
  const [statusData, setStatusData] = useState<TicketReport[]>([])
  const [priorityData, setPriorityData] = useState<PriorityReport[]>([])
  const [assigneeData, setAssigneeData] = useState<AssigneeReport[]>([])
  const [trendData, setTrendData] = useState<TrendReport[]>([])
  const [trendDays, setTrendDays] = useState(30)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchReports()
  }, [trendDays])

  const fetchReports = async () => {
    setLoading(true)
    try {
      const requestOptions: RequestInit = sessionToken
        ? { headers: { Authorization: `Bearer ${sessionToken}` } }
        : {}

      const [statusRes, priorityRes, assigneeRes, trendRes] = await Promise.all([
        fetch(apiUrl('/api/reports/status'), requestOptions),
        fetch(apiUrl('/api/reports/priority'), requestOptions),
        fetch(apiUrl('/api/reports/assignee'), requestOptions),
        fetch(apiUrl(`/api/reports/trends?days=${trendDays}`), requestOptions),
      ])

      if (statusRes.ok) setStatusData(await statusRes.json())
      if (priorityRes.ok) setPriorityData(await priorityRes.json())
      if (assigneeRes.ok) {
        const data = await assigneeRes.json()
        setAssigneeData(data.map((item: AssigneeReport) => ({
          ...item,
          assigneeName: item.assigneeName || 'Unassigned'
        })))
      }
      if (trendRes.ok) setTrendData(await trendRes.json())
    } catch (error) {
      console.error('Failed to fetch reports:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async (format: 'csv' | 'excel') => {
    const requestOptions: RequestInit = sessionToken
      ? { headers: { Authorization: `Bearer ${sessionToken}` } }
      : {}
    const url = apiUrl(`/api/reports/export/${format}`)
    const response = await fetch(url, requestOptions)

    if (response.ok) {
      const blob = await response.blob()
      const downloadUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = `tickets.${format === 'csv' ? 'csv' : 'xlsx'}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(downloadUrl)
    }
  }

  if (loading) {
    return <div className="p-6">Loading reports...</div>
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Reports</h1>
        <div className="flex gap-2">
          <button
            onClick={() => handleExport('csv')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            <FileText size={16} />
            Export CSV
          </button>
          <button
            onClick={() => handleExport('excel')}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
          >
            <FileSpreadsheet size={16} />
            Export Excel
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Status Chart */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Tickets by Status</h2>
          {statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusData}
                  dataKey="count"
                  nameKey="status"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  fill="#8884d8"
                  label
                >
                  {statusData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div>No data available</div>
          )}
        </div>

        {/* Priority Chart */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Tickets by Priority</h2>
          {priorityData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={priorityData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="priority" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div>No data available</div>
          )}
        </div>

        {/* Assignee Chart */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Tickets by Assignee</h2>
          {assigneeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={assigneeData} layout="horizontal">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="assigneeName" type="category" width={100} />
                <Tooltip />
                <Bar dataKey="count" fill="#82ca9d" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div>No data available</div>
          )}
        </div>

        {/* Trends Chart */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Ticket Trends</h2>
            <select
              value={trendDays}
              onChange={(e) => setTrendDays(Number(e.target.value))}
              className="px-2 py-1 border rounded"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            {trendData.length > 0 ? (
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="created" stroke="#8884d8" name="Created" />
                <Line type="monotone" dataKey="resolved" stroke="#82ca9d" name="Resolved" />
              </LineChart>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                No data available
              </div>
            )}
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}