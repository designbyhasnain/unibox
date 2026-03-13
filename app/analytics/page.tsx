'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
    AreaChart, Area, PieChart, Pie, Cell, Legend, LabelList
} from 'recharts';
import { getAnalyticsDataAction } from '../../src/actions/analyticsActions';
import { getAccountsAction } from '../../src/actions/accountActions';
import { getManagersAction } from '../../src/actions/projectActions';
import { useGlobalFilter } from '../context/FilterContext';
import { PageLoader } from '../components/LoadingStates';
import { useHydrated } from '../utils/useHydration';
import DateRangePicker from '../components/DateRangePicker';
import { saveToLocalCache, getFromLocalCache } from '../utils/localCache';

const ADMIN_USER_ID = '1ca1464d-1009-426e-96d5-8c5e8c84faac';
const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16'];

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div style={{ 
                background: 'rgba(255, 255, 255, 0.9)', 
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(0,0,0,0.05)', 
                borderRadius: '16px', 
                padding: '16px', 
                boxShadow: '0 20px 40px rgba(0,0,0,0.1)', 
                minWidth: '200px' 
            }}>
                <p style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '12px', color: '#1a1a1a' }}>{label}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {payload.map((entry: any, index: number) => (
                        <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#666' }}>
                                <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: entry.color || entry.fill }} />
                                {entry.name}
                            </span>
                            <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#1a1a1a' }}>{entry.value.toLocaleString()}</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }
    return null;
};

const KPICard = ({ title, value, subtext, icon, index, accent }: any) => (
    <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ delay: index * 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }} 
        whileHover={{ y: -5, boxShadow: '0 20px 40px rgba(0,0,0,0.08)' }}
        style={{ 
            flex: 1, 
            minWidth: '260px', 
            background: 'white',
            borderRadius: '24px',
            padding: '28px',
            border: '1px solid rgba(0,0,0,0.04)',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
        }}
    >
        <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '120px', height: '120px', background: `${accent}08`, borderRadius: '50%', filter: 'blur(40px)' }} />
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
            <div style={{ 
                width: '56px', 
                height: '56px', 
                background: `linear-gradient(135deg, ${accent}15, ${accent}05)`, 
                borderRadius: '18px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                color: accent,
                boxShadow: `0 8px 16px ${accent}10`
            }}>{icon}</div>
        </div>

        <div>
            <p style={{ color: '#64748b', fontSize: '0.9rem', fontWeight: 600, letterSpacing: '0.01em', marginBottom: '8px' }}>{title}</p>
            <h2 style={{ fontSize: '2.5rem', fontWeight: 850, color: '#0f172a', letterSpacing: '-0.04em', lineHeight: 1 }}>{value}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px' }}>
                <div style={{ padding: '4px 10px', background: '#f1f5f9', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>
                    {subtext}
                </div>
            </div>
        </div>
    </motion.div>
);

export default function AnalyticsPage() {
    const { selectedAccountId, setSelectedAccountId, startDate, endDate } = useGlobalFilter();
    const [selectedManager, setSelectedManager] = useState('ALL');
    const [accounts, setAccounts] = useState<any[]>([]);
    const [managers, setManagers] = useState<any[]>([]);
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const isHydrated = useHydrated();

    // 1. Initial hydration from cache — ONLY on client to prevent SSR mismatch
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const cached = getFromLocalCache('analytics_data');
            if (cached) {
                setData(cached);
                setLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        const loadMetaData = async () => {
            const [accs, mgrs] = await Promise.all([getAccountsAction(ADMIN_USER_ID), getManagersAction()]);
            if (accs.success) setAccounts(accs.accounts);
            setManagers(mgrs);
        };
        loadMetaData();
    }, []);

    useEffect(() => {
        if (!isHydrated) return; // Wait for hydration before fetching to allow cache sync

        const fetchData = async () => {
            // Only show loader if we don't have cached data
            if (!data) setLoading(true);
            
            const result = await getAnalyticsDataAction({ startDate, endDate, managerId: selectedManager, accountId: selectedAccountId });
            if (result.success) {
                setData(result);
                saveToLocalCache('analytics_data', result);
            }
            setLoading(false);
        };
        fetchData();
    }, [startDate, endDate, selectedManager, selectedAccountId, isHydrated]);

    return (
        <>
            <Sidebar onOpenCompose={() => {}} />
            <main className="main-area" style={{ background: '#f8fafc' }}>
                <Topbar searchTerm="" setSearchTerm={() => {}} onSearch={() => {}} onClearSearch={() => {}} placeholder="Search deep business intelligence..." />

                <div style={{ 
                    padding: '16px 32px', 
                    background: 'rgba(255, 255, 255, 0.8)', 
                    backdropFilter: 'blur(12px)',
                    borderBottom: '1px solid rgba(0,0,0,0.05)', 
                    display: 'flex', 
                    gap: '24px', 
                    alignItems: 'center', 
                    position: 'sticky', 
                    top: 0, 
                    zIndex: 100 
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#6366f1', boxShadow: '0 0 12px #6366f160' }} />
                        <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>Intelligence</h1>
                    </div>
                    
                    <div style={{ height: '32px', width: '1px', background: 'rgba(0,0,0,0.1)', margin: '0 8px' }} />
                    
                    <DateRangePicker />
                    
                    <select className="premium-select" style={{ background: '#f1f5f9', border: 'none', padding: '10px 18px', borderRadius: '14px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', outline: 'none' }} value={selectedManager} onChange={(e) => setSelectedManager(e.target.value)}>
                        <option value="ALL">All Managers</option>
                        {managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>

                    <select className="premium-select" style={{ background: '#f1f5f9', border: 'none', padding: '10px 18px', borderRadius: '14px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', outline: 'none' }} value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)}>
                        <option value="ALL">All Accounts</option>
                        {accounts.map(a => <option key={a.id} value={a.id}>{a.email}</option>)}
                    </select>

                    <AnimatePresence>
                        {isHydrated && loading && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ marginLeft: 'auto' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div className="pulse-dot" style={{ width: '8px', height: '8px', background: '#6366f1' }} />
                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6366f1' }}>SYNCING LIVE...</span>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <div className="content-area" style={{ flex: 1, overflowY: 'auto' }}>
                    <PageLoader isLoading={!isHydrated || (loading && !data)} type="grid">
                        {isHydrated && data && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '40px', maxWidth: '1800px', margin: '0 auto' }}>
                                
                                {/* 1. Premium Master KPIs */}
                                <div style={{ display: 'flex', gap: '24px', marginBottom: '40px', overflowX: 'auto', paddingBottom: '10px' }}>
                                    <KPICard title="TOTAL OUTREACH" value={data?.stats?.totalOutreach || 0} subtext={`${data?.stats?.avgReplyRate || '0%'} reply rate`} index={0} accent="#6366f1" icon={<svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>} />
                                    <KPICard title="EMAIL OPEN RATE" value={data?.stats?.openRate || '0%'} subtext={`${data?.stats?.openedEmails || 0} unique opens`} index={1} accent="#10b981" icon={<svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>} />
                                    <KPICard title="LINK CLICK RATE" value={data?.stats?.clickRate || '0%'} subtext={`${data?.stats?.clickedEmails || 0} link clicks`} index={2} accent="#f59e0b" icon={<svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>} />
                                    <KPICard title="DELIVERABILITY" value={data?.deliverability?.inboxRate || '100%'} subtext={`Status: ${data?.deliverability?.health || 'Optimal'}`} index={3} accent="#8b5cf6" icon={<svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>} />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '40px', marginBottom: '40px' }}>
                                    
                                    {/* 2. Conversion Funnel Deep Dive */}
                                    <div style={{ gridColumn: 'span 7', background: 'white', borderRadius: '32px', padding: '40px', border: '1px solid rgba(0,0,0,0.04)', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
                                            <div>
                                                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.03em' }}>Conversion Efficiency</h3>
                                                <p style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500, marginTop: '4px' }}>Deep analysis of outreach flow</p>
                                            </div>
                                            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#6366f1' }} />
                                        </div>
                                        <div style={{ width: '100%', height: '400px' }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart layout="vertical" data={data?.funnelData || []} margin={{ left: 20 }}>
                                                    <XAxis type="number" hide />
                                                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} fontSize={13} width={100} tick={{ fill: '#64748b', fontWeight: 600 }} />
                                                    <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
                                                    <Bar dataKey="value" radius={[0, 12, 12, 0]} barSize={48}>
                                                        {(data?.funnelData || []).map((entry: any, index: number) => (
                                                            <Cell key={index} fill={entry.fill} fillOpacity={0.9} />
                                                        ))}
                                                        <LabelList dataKey="value" position="right" offset={15} style={{ fill: '#0f172a', fontSize: '14px', fontWeight: 800 }} />
                                                    </Bar>
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>

                                    {/* 3. Sentiment & Account Health */}
                                    <div style={{ gridColumn: 'span 5', background: 'white', borderRadius: '32px', padding: '40px', border: '1px solid rgba(0,0,0,0.04)', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
                                        <div style={{ marginBottom: '40px' }}>
                                            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.03em' }}>AI Sentiment Pulse</h3>
                                            <p style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500, marginTop: '4px' }}>Natural language reply classification</p>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', height: '320px', gap: '20px' }}>
                                            <div style={{ flex: 1.2, height: '100%' }}>
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <PieChart>
                                                        <Pie 
                                                            data={data?.sentimentData || []} 
                                                            innerRadius={100} 
                                                            outerRadius={135} 
                                                            paddingAngle={10} 
                                                            cornerRadius={8}
                                                            dataKey="value"
                                                            stroke="none"
                                                        >
                                                            {(data?.sentimentData || []).map((entry:any, i:number) => <Cell key={i} fill={entry.color} />)}
                                                        </Pie>
                                                        <Tooltip content={<CustomTooltip />} />
                                                    </PieChart>
                                                </ResponsiveContainer>
                                            </div>
                                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                                {(data?.sentimentData || []).map((s:any, i:number) => (
                                                    <div key={i}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                <div style={{ width: 12, height: 12, borderRadius: '4px', background: s.color }} />
                                                                <span style={{ fontSize: '0.9rem', color: '#475569', fontWeight: 600 }}>{s.name}</span>
                                                            </div>
                                                            <span style={{ fontWeight: 800, color: '#0f172a' }}>{s.value}</span>
                                                        </div>
                                                        <div style={{ width: '100%', height: '4px', background: '#f1f5f9', borderRadius: '2px', overflow: 'hidden' }}>
                                                            <motion.div 
                                                                initial={{ width: 0 }} 
                                                                animate={{ width: `${(s.value / data.stats.totalReceived) * 100}%` }} 
                                                                style={{ height: '100%', background: s.color }} 
                                                            />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* 4. Team Performance Table */}
                                <div style={{ background: 'white', borderRadius: '32px', padding: '40px', border: '1px solid rgba(0,0,0,0.04)', boxShadow: '0 4px 20px rgba(0,0,0,0.02)', marginBottom: '40px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                                        <div>
                                            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.03em' }}>Leaderboard Spectrum</h3>
                                            <p style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500, marginTop: '4px' }}>Real-time team conversion dynamics</p>
                                        </div>
                                    </div>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 12px' }}>
                                            <thead>
                                                <tr style={{ textAlign: 'left' }}>
                                                    <th style={{ padding: '0 20px', color: '#94a3b8', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Leader</th>
                                                    <th style={{ padding: '0 20px', color: '#94a3b8', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Leads</th>
                                                    <th style={{ padding: '0 20px', color: '#94a3b8', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Revenue</th>
                                                    <th style={{ padding: '0 20px', color: '#94a3b8', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Success Rate</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(data?.leaderboard || []).map((m:any, i:number) => (
                                                    <motion.tr 
                                                        key={i} 
                                                        initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 + (i * 0.1) }}
                                                        style={{ borderRadius: '16px' }}
                                                    >
                                                        <td style={{ padding: '16px 20px', background: '#f8fafc', borderRadius: '16px 0 0 16px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                                                <div style={{ width: 44, height: 44, borderRadius: '14px', background: `linear-gradient(135deg, ${COLORS[i % COLORS.length]}, ${COLORS[i % COLORS.length]}dd)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: '1.1rem', boxShadow: `0 8px 16px ${COLORS[i % COLORS.length]}20` }}>{m.name[0]}</div>
                                                                <div>
                                                                    <p style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.95rem' }}>{m.name}</p>
                                                                    <p style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Active Manager</p>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '16px 20px', background: '#f8fafc', fontWeight: 700, color: '#0f172a' }}>{m.leads} <span style={{ color: '#94a3b8', fontSize: '0.75rem', marginLeft: '4px' }}>Qualified</span></td>
                                                        <td style={{ padding: '16px 20px', background: '#f8fafc', fontWeight: 850, color: '#0f172a', fontSize: '1.1rem' }}>${(m.revenue || 0).toLocaleString()}</td>
                                                        <td style={{ padding: '16px 20px', background: '#f8fafc', borderRadius: '0 16px 16px 0' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                                <div style={{ flex: 1, height: '8px', background: 'white', borderRadius: '4px', overflow: 'hidden', minWidth: '80px' }}>
                                                                    <div style={{ height: '100%', width: m.conversion, background: '#10b981', borderRadius: '4px' }} />
                                                                </div>
                                                                <span style={{ fontWeight: 800, color: '#10b981', fontSize: '0.9rem' }}>{m.conversion}</span>
                                                            </div>
                                                        </td>
                                                    </motion.tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '40px' }}>
                                    {/* 5. Precision Engagement Timing */}
                                    <div style={{ gridColumn: 'span 7', background: 'white', borderRadius: '32px', padding: '40px', border: '1px solid rgba(0,0,0,0.04)', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
                                        <div style={{ marginBottom: '40px' }}>
                                            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.03em' }}>Peak Resonance Time</h3>
                                            <p style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500, marginTop: '4px' }}>Hourly reply distribution analysis</p>
                                        </div>
                                        <div style={{ width: '100%', height: '280px' }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <AreaChart data={data?.hourlyEngagement || []}>
                                                    <defs>
                                                        <linearGradient id="colorReplies" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4}/>
                                                            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                                                        </linearGradient>
                                                    </defs>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                    <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} interval={3} tick={{ fill: '#94a3b8', fontWeight: 600 }} />
                                                    <YAxis hide />
                                                    <Tooltip content={<CustomTooltip />} />
                                                    <Area type="monotone" dataKey="replies" stroke="#f59e0b" strokeWidth={4} fillOpacity={1} fill="url(#colorReplies)" />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>

                                    {/* 6. Elite Content Performance */}
                                    <div style={{ gridColumn: 'span 5', background: 'white', borderRadius: '32px', padding: '40px', border: '1px solid rgba(0,0,0,0.04)', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
                                        <div style={{ marginBottom: '32px' }}>
                                            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.03em' }}>Elite Performing Assets</h3>
                                            <p style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500, marginTop: '4px' }}>Highest reply resonance content</p>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                            {(data?.topSubjects || []).map((s:any, i:number) => (
                                                <motion.div 
                                                    key={i} 
                                                    whileHover={{ scale: 1.02 }}
                                                    style={{ padding: '20px', background: '#f8fafc', borderRadius: '20px', border: '1px solid rgba(0,0,0,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                                >
                                                    <div style={{ maxWidth: '75%' }}>
                                                        <p style={{ fontSize: '0.95rem', fontWeight: 750, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</p>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                                                            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#6366f1', background: '#eeeefd', padding: '2px 8px', borderRadius: '6px', textTransform: 'uppercase' }}>Subject Alpha</span>
                                                        </div>
                                                    </div>
                                                    <div style={{ textAlign: 'center', padding: '8px 16px', background: 'white', borderRadius: '14px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                                                        <p style={{ fontSize: '1.25rem', fontWeight: 900, color: '#6366f1', lineHeight: 1 }}>{s.replies}</p>
                                                        <p style={{ fontSize: '0.6rem', fontWeight: 800, color: '#94a3b8', marginTop: '4px' }}>REPLIES</p>
                                                    </div>
                                                </motion.div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                            </motion.div>
                        )}
                    </PageLoader>
                </div>
            </main>
            <style jsx global>{`
                .premium-select:hover {
                    background: #e2e8f0 !important;
                    transition: all 0.2s ease;
                }
                .pulse-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    animation: pulse 2s infinite;
                }
                @keyframes pulse {
                    0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.7); }
                    70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(99, 102, 241, 0); }
                    100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
                }
                ::-webkit-scrollbar {
                    width: 6px;
                }
                ::-webkit-scrollbar-thumb {
                    background: #cbd5e1;
                    border-radius: 10px;
                }
            `}</style>
        </>
    );
}
