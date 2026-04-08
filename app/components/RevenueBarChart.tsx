'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

type Props = {
    data: { month: string; revenue: number; projects: number }[];
    paidTotal: number;
    totalRevenue: number;
};

export default function RevenueBarChart({ data, paidTotal, totalRevenue }: Props) {
    // Transform data: split revenue into paid and pending proportions
    const ratio = totalRevenue > 0 ? paidTotal / totalRevenue : 1;
    const chartData = data.map(d => ({
        month: d.month.length > 7 ? d.month : new Date(d.month + '-01').toLocaleDateString('en-US', { month: 'short' }),
        paid: Math.round(d.revenue * ratio),
        pending: Math.round(d.revenue * (1 - ratio)),
        projects: d.projects,
    }));

    return (
        <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }} barGap={0}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" vertical={false} />
                <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fill: '#a3a3a3' }}
                    axisLine={false}
                    tickLine={false}
                />
                <YAxis
                    tick={{ fontSize: 11, fill: '#a3a3a3' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => '$' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v)}
                />
                <Tooltip
                    formatter={(v: any, name: any) => ['$' + Number(v).toLocaleString(), name === 'paid' ? 'Paid' : 'Pending']}
                    labelStyle={{ fontSize: 12, fontWeight: 600 }}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e5e5e5', fontSize: 12, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                />
                <Legend
                    iconType="square"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 11, color: '#737373' }}
                    formatter={(value: string) => value === 'paid' ? 'Paid Revenue' : 'Pending Revenue'}
                />
                <Bar dataKey="paid" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
                <Bar dataKey="pending" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
        </ResponsiveContainer>
    );
}
