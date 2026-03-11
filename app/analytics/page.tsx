'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
    AreaChart, Area, PieChart, Pie, Cell 
} from 'recharts';
import { getAnalyticsDataAction } from '../../src/actions/analyticsActions';
import { getAccountsAction } from '../../src/actions/accountActions';
import { getManagersAction } from '../../src/actions/projectActions';
import { useGlobalFilter } from '../context/FilterContext';
import { PageLoader } from '../components/LoadingStates';
import { useHydrated } from '../utils/useHydration';
import DateRangePicker from '../components/DateRangePicker';

const ADMIN_USER_ID = '1ca1464d-1009-426e-96d5-8c5e8c84faac';

const COLORS = ['#1a73e8', '#34a853', '#fbbc04', '#ea4335'];

import { saveToLocalCache, getFromLocalCache } from '../utils/localCache';

let globalAnalyticsCache: any = null;
if (typeof window !== 'undefined') {
    globalAnalyticsCache = getFromLocalCache('analytics_data');
}

// ─── Components ─────────────────────────────────────────────────────────────

const KPICard = ({ title, value, subtext, icon, index }: any) => (
    <motion.div 
        className="skeleton-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.1 }}
        whileHover={{ translateY: -5, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
        style={{ flex: 1, minWidth: '200px', cursor: 'default' }}
    >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 500 }}>{title}</p>
                <h2 style={{ fontSize: '1.8rem', fontWeight: 700, margin: '0.5rem 0', color: 'var(--text-primary)' }}>{value}</h2>
                <p style={{ fontSize: '0.75rem', color: subtext.includes('+') ? 'var(--success)' : 'var(--text-muted)' }}>
                    {subtext}
                </p>
            </div>
            <div style={{ padding: '8px', background: 'var(--bg-base)', borderRadius: '8px', color: 'var(--accent)' }}>
                {icon}
            </div>
        </div>
    </motion.div>
);

export default function AnalyticsPage() {
    const { selectedAccountId, setSelectedAccountId, startDate, endDate } = useGlobalFilter();
    const [selectedManager, setSelectedManager] = useState('ALL');
    const [accounts, setAccounts] = useState<any[]>([]);
    const [managers, setManagers] = useState<any[]>([]);
    const [data, setData] = useState<any>(() => globalAnalyticsCache);
    const [loading, setLoading] = useState(() => !globalAnalyticsCache);
    const [isComposeOpen, setIsComposeOpen] = useState(false);
    const isHydrated = useHydrated();

    useEffect(() => {
        // Hydrate cache on client only
        if (typeof window !== 'undefined' && !data) {
            const cached = getFromLocalCache('analytics_data');
            if (cached) {
                setData(cached);
                setLoading(false);
            }
        }
    }, [data]);

    useEffect(() => {
        const loadInitialData = async () => {
            const [accs, mgrs] = await Promise.all([
                getAccountsAction(ADMIN_USER_ID),
                getManagersAction()
            ]);
            if (accs.success) setAccounts(accs.accounts);
            setManagers(mgrs);
        };
        loadInitialData();
    }, []);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            const result = await getAnalyticsDataAction({
                startDate,
                endDate,
                managerId: selectedManager,
                accountId: selectedAccountId
            });
            if (result.success) {
                setData(result);
                saveToLocalCache('analytics_data', result);
            }
            setLoading(false);
        };
        fetchData();
    }, [startDate, endDate, selectedManager, selectedAccountId]);

    return (
        <>
            <Sidebar onOpenCompose={() => setIsComposeOpen(true)} />
            
            <main className="main-area">
                <Topbar 
                    searchTerm=""
                    setSearchTerm={() => {}}
                    onSearch={() => {}}
                    onClearSearch={() => {}}
                    placeholder="Search analytics..."
                />

                {/* Sub-Topbar Filters */}
                <div style={{ 
                    padding: '12px 24px', 
                    background: 'var(--bg-surface)', 
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    gap: '16px',
                    alignItems: 'center',
                    zIndex: 10
                }}>
                    <div className="filter-group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Date:</span>
                        <DateRangePicker />
                    </div>

                    <div className="filter-group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Manager:</span>
                        <select 
                            className="btn btn-secondary" 
                            style={{ padding: '4px 12px', fontSize: '0.85rem' }}
                            value={selectedManager}
                            onChange={(e) => setSelectedManager(e.target.value)}
                        >
                            <option value="ALL">All Managers</option>
                            {managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                    </div>

                    <div className="filter-group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Account:</span>
                        <select 
                            className="btn btn-secondary" 
                            style={{ padding: '4px 12px', fontSize: '0.85rem' }}
                            value={selectedAccountId}
                            onChange={(e) => setSelectedAccountId(e.target.value)}
                        >
                            <option value="ALL">All Accounts</option>
                            {accounts.map(a => <option key={a.id} value={a.id}>{a.email}</option>)}
                        </select>
                    </div>
                </div>

                <div className="content-area" id="analytics-scroll" style={{ flex: 1, overflowY: 'auto', width: '100%' }}>
                    <PageLoader isLoading={!isHydrated || loading || !data} type="grid">
                        {data && (
                            <motion.div 
                            initial={{ opacity: 0 }} 
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.4 }}
                            style={{ padding: '24px', width: '100%' }}
                        >
                                {/* KPI Section */}
                                <div style={{ display: 'flex', gap: '20px', marginBottom: '24px', flexWrap: 'wrap' }}>
                                    <KPICard 
                                        title="Total Outreach" 
                                        value={data.stats.totalOutreach} 
                                        subtext="+12% from last week" 
                                        index={0}
                                        icon={<svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>}
                                    />
                                    <KPICard 
                                        title="Leads Generated" 
                                        value={data.stats.leadsGenerated} 
                                        subtext="+5 new leads today" 
                                        index={1}
                                        icon={<svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>}
                                    />
                                    <KPICard 
                                        title="Reply Rate" 
                                        value={data.stats.avgReplyRate} 
                                        subtext="System optimal" 
                                        index={2}
                                        icon={<svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>}
                                    />
                                    <KPICard 
                                        title="Revenue" 
                                        value={`$${data.stats.totalRevenue.toLocaleString()}`} 
                                        subtext="Paid projects" 
                                        index={3}
                                        icon={<svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>}
                                    />
                                </div>

                                {/* Charts Section */}
                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px', marginBottom: '24px' }}>
                                    <div className="skeleton-card" style={{ padding: '24px', minHeight: '400px' }}>
                                        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '20px' }}>Daily Outreach Intensity</h3>
                                        <div style={{ width: '100%', height: '300px' }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={data.dailyData}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#80868b' }} dy={10} />
                                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#80868b' }} />
                                                    <Tooltip 
                                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                                        cursor={{ fill: 'rgba(26, 115, 232, 0.05)' }}
                                                    />
                                                    <Bar dataKey="sent" fill="#1a73e8" radius={[4, 4, 0, 0]} barSize={32} />
                                                    <Bar dataKey="leads" fill="#34a853" radius={[4, 4, 0, 0]} barSize={8} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>

                                    <div className="skeleton-card" style={{ padding: '24px' }}>
                                        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '20px' }}>Lead Status</h3>
                                        <div style={{ width: '100%', height: '300px' }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie
                                                        data={[
                                                            { name: 'Cold', value: 400 },
                                                            { name: 'Lead', value: 300 },
                                                            { name: 'Offer', value: 100 },
                                                            { name: 'Closed', value: 50 },
                                                        ]}
                                                        cx="50%"
                                                        cy="50%"
                                                        innerRadius={60}
                                                        outerRadius={80}
                                                        paddingAngle={5}
                                                        dataKey="value"
                                                    >
                                                        {COLORS.map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length] || '#1a73e8'} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip />
                                                </PieChart>
                                            </ResponsiveContainer>
                                            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap', marginTop: '10px' }}>
                                                {['Cold', 'Lead', 'Offer', 'Closed'].map((label, i) => (
                                                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: COLORS[i] }} />
                                                        {label}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Table Section */}
                                <div className="skeleton-card" style={{ padding: '0' }}>
                                    <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
                                        <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Account Manager Performance</h3>
                                    </div>
                                    <div className="grid-table">
                                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr style={{ background: 'var(--bg-base)', textAlign: 'left' }}>
                                                    <th style={{ padding: '12px 24px', fontWeight: 500, color: 'var(--text-secondary)' }}>Manager</th>
                                                    <th style={{ padding: '12px 24px', fontWeight: 500, color: 'var(--text-secondary)' }}>Emails Sent</th>
                                                    <th style={{ padding: '12px 24px', fontWeight: 500, color: 'var(--text-secondary)' }}>Leads</th>
                                                    <th style={{ padding: '12px 24px', fontWeight: 500, color: 'var(--text-secondary)' }}>Conversion</th>
                                                    <th style={{ padding: '12px 24px', fontWeight: 500, color: 'var(--text-secondary)' }}>Efficiency</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {data.managerPerformance.map((mgr: any, i: number) => (
                                                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                                        <td style={{ padding: '12px 24px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                <div style={{ 
                                                                    width: '32px', height: '32px', borderRadius: '50%', background: COLORS[i % COLORS.length],
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600
                                                                }}>
                                                                    {mgr.name[0]}
                                                                </div>
                                                                {mgr.name}
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '12px 24px' }}>{mgr.sent}</td>
                                                        <td style={{ padding: '12px 24px' }}>{mgr.leads}</td>
                                                        <td style={{ padding: '12px 24px' }}>{mgr.conversion}</td>
                                                        <td style={{ padding: '12px 24px', width: '200px' }}>
                                                            <div style={{ width: '100%', background: '#eee', height: '6px', borderRadius: '3px', position: 'relative' }}>
                                                                <motion.div 
                                                                    initial={{ width: 0 }}
                                                                    animate={{ width: mgr.conversion }}
                                                                    transition={{ duration: 1, delay: 0.5 }}
                                                                    style={{ background: 'var(--accent)', height: '100%', borderRadius: '3px' }} 
                                                                />
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </PageLoader>
                </div>
            </main>
        </>
    );
}
