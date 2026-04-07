'use client';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type Props = {
    data: { month: string; revenue: number; projects: number }[];
};

export default function RevenueChart({ data }: Props) {
    return (
        <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#999' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#999' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => '$' + (v / 1000).toFixed(0) + 'k'} />
                <Tooltip
                    formatter={(v: any) => ['$' + Number(v).toLocaleString(), 'Revenue']}
                    labelStyle={{ fontSize: 11 }}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} fill="url(#revGrad)" />
            </AreaChart>
        </ResponsiveContainer>
    );
}
