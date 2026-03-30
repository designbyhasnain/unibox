'use client';

import React from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

interface ABTestingChartProps {
    variants: {
        label: string;
        openRate: number;
        replyRate: number;
    }[];
}

export default function ABTestingChart({ variants }: ABTestingChartProps) {
    const chartData = variants.map(v => ({
        name: v.label,
        'Open Rate': v.openRate,
        'Reply Rate': v.replyRate,
    }));

    return (
        <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" unit="%" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} width={80} />
                <Tooltip
                    contentStyle={{
                        background: 'var(--bg-surface)', border: '1px solid var(--border)',
                        borderRadius: '8px', fontSize: '12px',
                    }}
                    formatter={(value: any) => [`${value}%`]}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="Open Rate" fill="#1a73e8" radius={[0, 4, 4, 0]} barSize={20} />
                <Bar dataKey="Reply Rate" fill="#137333" radius={[0, 4, 4, 0]} barSize={20} />
            </BarChart>
        </ResponsiveContainer>
    );
}
