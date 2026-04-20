'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

type Props = {
    data: { month: string; revenue: number; projects: number }[];
    paidTotal: number;
    totalRevenue: number;
};

export default function RevenueBarChart({ data, paidTotal, totalRevenue }: Props) {
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
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.006 260)" vertical={false} />
                <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fill: 'oklch(0.66 0.008 260)' }}
                    axisLine={false}
                    tickLine={false}
                />
                <YAxis
                    tick={{ fontSize: 11, fill: 'oklch(0.66 0.008 260)' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => '$' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v)}
                />
                <Tooltip
                    formatter={(v: any, name: any) => ['$' + Number(v).toLocaleString(), name === 'paid' ? 'Paid' : 'Pending']}
                    labelStyle={{ fontSize: 12, fontWeight: 600 }}
                    contentStyle={{ borderRadius: 8, border: '1px solid oklch(0.28 0.006 260)', fontSize: 12, background: 'oklch(0.245 0.006 260)', color: 'oklch(0.965 0.003 80)' }}
                />
                <Legend
                    iconType="square"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 11, color: 'oklch(0.66 0.008 260)' }}
                    formatter={(value: string) => value === 'paid' ? 'Paid Revenue' : 'Pending Revenue'}
                />
                <Bar dataKey="paid" stackId="a" fill="oklch(0.68 0.14 160)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="pending" stackId="a" fill="oklch(0.78 0.15 75)" radius={[4, 4, 0, 0]} />
            </BarChart>
        </ResponsiveContainer>
    );
}
