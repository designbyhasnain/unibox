'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getPipelineVisualizationAction, type PipelineStageSummary } from '../../src/actions/revenueActions';
import { getClientsAction, updateClientAction } from '../../src/actions/clientActions';
import { useHydrated } from '../utils/useHydration';
import { PageLoader } from '../components/LoadingStates';
import { useGlobalFilter } from '../context/FilterContext';
import { useUndoToast } from '../context/UndoToastContext';
import { usePerfMonitor } from '../hooks/usePerfMonitor';
import {
    DndContext,
    PointerSensor,
    KeyboardSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
    useDroppable,
    useDraggable,
} from '@dnd-kit/core';

const pipelineCols = [
    { key: 'COLD_LEAD', label: 'Cold Lead', color: 'oklch(0.6 0.13 230)' },
    { key: 'CONTACTED', label: 'Contacted', color: 'oklch(0.65 0.008 260)' },
    { key: 'WARM_LEAD', label: 'Warm Lead', color: 'oklch(0.72 0.14 75)' },
    { key: 'LEAD', label: 'Lead', color: 'oklch(0.62 0.18 295)' },
    { key: 'OFFER_ACCEPTED', label: 'Offer', color: 'oklch(0.66 0.15 25)' },
    { key: 'CLOSED', label: 'Closed', color: 'oklch(0.68 0.14 160)' },
];

function ini(n: string) { return (n || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2); }
function fmt(n: number) { return n >= 1000 ? '$' + (n / 1000).toFixed(1) + 'k' : '$' + n.toLocaleString(); }
function fmtDate(d: string) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const Spark = ({ points, color = 'var(--ink-muted)' }: { points: number[]; color?: string }) => {
    const w = 64, h = 28;
    const max = Math.max(...points), min = Math.min(...points);
    const step = w / (points.length - 1);
    const d = points.map((p, i) => {
        const x = i * step;
        const y = h - ((p - min) / (max - min || 1)) * h;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return <svg className="kpi-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`}><path d={d} stroke={color} fill="none" strokeWidth="1.5" /></svg>;
};

// ── Drag handle: each kanban card is a draggable. ──────────────────────────
function DraggableCard({ id, children }: { id: string; children: (props: { listeners: any; isDragging: boolean }) => React.ReactNode }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
    const style: React.CSSProperties = transform
        ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.6 : 1, zIndex: isDragging ? 50 : 'auto', cursor: 'grabbing' }
        : { cursor: 'grab' };
    return (
        <div ref={setNodeRef} style={style} {...attributes}>
            {children({ listeners, isDragging })}
        </div>
    );
}

// ── Drop target: each pipeline column accepts cards. ───────────────────────
function DroppableColumn({ stageKey, children }: { stageKey: string; children: React.ReactNode }) {
    const { setNodeRef, isOver } = useDroppable({ id: stageKey });
    return (
        <div ref={setNodeRef} className="kcol" data-stage={stageKey} style={isOver ? { background: 'color-mix(in oklab, var(--accent), transparent 92%)', borderColor: 'var(--accent)' } : undefined}>
            {children}
        </div>
    );
}

export default function OpportunitiesPage() {
    const hydrated = useHydrated();
    const router = useRouter();
    const { selectedAccountId } = useGlobalFilter();
    const { showError, showSuccess } = useUndoToast();
    usePerfMonitor('/opportunities');
    const [pipeline, setPipeline] = useState<{ stages: PipelineStageSummary[]; totalValue: number; totalDeals: number } | null>(null);
    const [clients, setClients] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // 5px activation distance avoids the kanban swallowing plain clicks meant
    // for the contact-detail panel — drag only kicks in once the pointer
    // actually moves. KeyboardSensor is the accessibility complement: focus a
    // card and press Space/Enter to pick up, arrow keys to move, then Space
    // again to drop.
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor),
    );

    useEffect(() => {
        Promise.all([
            getPipelineVisualizationAction(),
            getClientsAction(selectedAccountId, 1, 200),
        ]).then(([p, c]) => {
            if (p.success) setPipeline({ stages: p.stages, totalValue: p.totalValue, totalDeals: p.totalDeals });
            setClients(c.clients || []);
        }).catch(console.error).finally(() => setLoading(false));
    }, [selectedAccountId]);

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) return;
        const contactId = String(active.id);
        const newStage = String(over.id);
        const card = clients.find(c => c.id === contactId);
        if (!card) return;
        const previousStage = card.pipeline_stage;
        if (previousStage === newStage) return; // dropped in same column

        // Optimistic: flip the card's stage locally so the UI moves instantly.
        setClients(prev => prev.map(c => c.id === contactId ? { ...c, pipeline_stage: newStage } : c));

        try {
            const res = await updateClientAction(contactId, { pipeline_stage: newStage });
            if (!res.success) {
                // Revert
                setClients(prev => prev.map(c => c.id === contactId ? { ...c, pipeline_stage: previousStage } : c));
                showError(res.error || `Couldn't move "${card.name || card.email}" — reverted.`);
                return;
            }
            const stageLabel = pipelineCols.find(p => p.key === newStage)?.label || newStage;
            showSuccess(`Moved "${card.name || card.email}" → ${stageLabel}`);
        } catch (err) {
            setClients(prev => prev.map(c => c.id === contactId ? { ...c, pipeline_stage: previousStage } : c));
            showError(`Couldn't reach the server — "${card.name || card.email}" reverted.`);
        }
    };

    if (!hydrated || loading) return <PageLoader isLoading type="grid" count={6} context="clients"><div /></PageLoader>;

    const avColors = ['av-a', 'av-b', 'av-c', 'av-d', 'av-e', 'av-f', 'av-g', 'av-h'];
    const byStage: Record<string, any[]> = {};
    pipelineCols.forEach(col => { byStage[col.key] = clients.filter(c => c.pipeline_stage === col.key); });

    const openStages = ['COLD_LEAD', 'CONTACTED', 'WARM_LEAD', 'LEAD', 'OFFER_ACCEPTED'];
    const openValue = openStages.reduce((s, k) => s + (byStage[k] || []).reduce((ss: number, c: any) => ss + (c.estimated_value || 0), 0), 0);
    const openCount = openStages.reduce((s, k) => s + (byStage[k] || []).length, 0);
    const closedValue = (byStage['CLOSED'] || []).reduce((s: number, c: any) => s + (c.estimated_value || 0), 0);
    const stageProb: Record<string, number> = { COLD_LEAD: 0.05, CONTACTED: 0.15, WARM_LEAD: 0.35, LEAD: 0.5, OFFER_ACCEPTED: 0.75 };
    const forecast = openStages.reduce((s, k) => s + (byStage[k] || []).reduce((ss: number, c: any) => ss + (c.estimated_value || 0) * (stageProb[k] || 0.1), 0), 0);
    // Recompute winRate from the optimistic client state so KPIs update
    // instantly after a card drag. Falls back to the server snapshot only when
    // we have no local data yet.
    const localTotalDeals = clients.length;
    const localClosedCount = (byStage['CLOSED'] || []).length;
    const winRate = localTotalDeals > 0
        ? Math.round((localClosedCount / localTotalDeals) * 100)
        : (pipeline ? Math.round((pipeline.stages.find(s => s.stage === 'CLOSED')?.count || 0) / Math.max(pipeline.totalDeals, 1) * 100) : 0);

    return (
        <div className="op-page">
            <div className="op-content">
                <div className="page-head">
                    <div>
                        <h2>Pipeline board</h2>
                        <div className="sub">{openCount} open · {fmt(openValue)} in flight · drag a card or press Space to move between stages</div>
                        {pipeline && pipeline.totalDeals > clients.length && (
                            <div className="sub" style={{ color: 'var(--warn)', marginTop: 2 }}>
                                Showing {clients.length} of {pipeline.totalDeals.toLocaleString()} contacts — narrow by account or open `/clients` for the full list.
                            </div>
                        )}
                    </div>
                </div>

                <div className="kpi-grid" style={{ marginBottom: 16 }}>
                    <div className="kpi"><div className="k">Open pipeline</div><div className="v">{fmt(openValue)}</div><div className="d" style={{ color: 'var(--ink-muted)' }}>{openCount} active deals</div><Spark points={[3,4,5,6,5,7,8]} color="var(--coach)" /></div>
                    <div className="kpi"><div className="k">Weighted forecast</div><div className="v">{fmt(Math.round(forecast))}</div><div className="d" style={{ color: 'var(--ink-muted)' }}>next 30 days</div><Spark points={[2,3,4,5,5,6,7]} color="var(--coach)" /></div>
                    <div className="kpi"><div className="k">Closed this month</div><div className="v">{fmt(closedValue)}</div><div className="d"><span className="up">▲</span> {(byStage['CLOSED'] || []).length} deals won</div><Spark points={[1,2,2,3,3,4,5]} color="var(--coach)" /></div>
                    <div className="kpi"><div className="k">Win rate</div><div className="v">{winRate}%</div><div className="d" style={{ color: 'var(--ink-muted)' }}>all time</div><Spark points={[4,5,5,6,6,7,8]} color="var(--coach)" /></div>
                </div>

                <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                    <div className="kanban">
                        {pipelineCols.map(col => (
                            <DroppableColumn key={col.key} stageKey={col.key}>
                                <div className="kcol-head">
                                    <span className="dot" style={{ background: col.color }} />
                                    <span className="title">{col.label}</span>
                                    <span className="count">{(byStage[col.key] || []).length}</span>
                                </div>
                                <div className="kcol-body">
                                {(byStage[col.key] || []).map((c, i) => {
                                    const av = avColors[(c.name || '').charCodeAt(0) % avColors.length];
                                    return (
                                        <DraggableCard key={c.id || i} id={c.id}>
                                            {({ listeners, isDragging }) => (
                                                <div
                                                    className="kcard"
                                                    {...listeners}
                                                    role="button"
                                                    tabIndex={0}
                                                    aria-label={`${c.name || c.email}. Click to open contact, drag to move stage`}
                                                    // Click → contact detail. PointerSensor uses a 5px activation
                                                    // distance, so simple clicks (no drag) still bubble here.
                                                    onClick={() => { if (!isDragging) router.push(`/clients/${c.id}`); }}
                                                    onKeyDown={(e) => {
                                                        if ((e.key === 'Enter' || e.key === ' ') && !isDragging) {
                                                            e.preventDefault();
                                                            router.push(`/clients/${c.id}`);
                                                        }
                                                    }}
                                                    style={{ pointerEvents: isDragging ? 'none' : undefined }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                                        <div className={`avatar ${av}`} style={{ width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center', color: 'white', fontSize: 9, fontWeight: 600 }}>{ini(c.name)}</div>
                                                        <div style={{ minWidth: 0, flex: 1 }}>
                                                            <div className="name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name || c.email}</div>
                                                            <div className="co" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.company || ''}</div>
                                                        </div>
                                                    </div>
                                                    <div className="foot">
                                                        <span className="val">{c.estimated_value ? fmt(c.estimated_value) : '—'}</span>
                                                        <span className="dates">{fmtDate(c.last_email_at)}</span>
                                                    </div>
                                                </div>
                                            )}
                                        </DraggableCard>
                                    );
                                })}
                                {(byStage[col.key] || []).length === 0 && (
                                    <div style={{ padding: '10px 8px', fontSize: 11.5, color: 'var(--ink-muted)', textAlign: 'center', fontStyle: 'italic' }}>Drop a card here</div>
                                )}
                                </div>
                            </DroppableColumn>
                        ))}
                    </div>
                </DndContext>
            </div>

            <style>{`
/* Layout (2026-05-06): board page is now a flex column whose only
   scrollable region is each kanban *column* (and its inner card list).
   The previous CSS gave every .kcol min-height:300px with no max — so
   one busy column (Contacted=70 cards) made the whole page scroll while
   the empty columns stayed short, producing the uneven-stack look in
   the screenshot. Now: page is fixed-viewport, kanban grid stretches to
   fill, and each column owns its own overflow:auto. */
.op-page{height:100%;display:flex;flex-direction:column;overflow:hidden;background:var(--shell);font-family:var(--font-ui);color:var(--ink)}
.op-content{padding:22px 26px;display:flex;flex-direction:column;flex:1;min-height:0}
.op-page .page-head{display:flex;align-items:baseline;gap:14px;margin-bottom:18px;flex-shrink:0}
.op-page .page-head h2{font-size:22px;font-weight:600;letter-spacing:-.02em;margin:0}
.op-page .page-head .sub{color:var(--ink-muted);font-size:13px;margin-top:4px}
.op-page .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;flex-shrink:0}
.op-page .kpi{background:var(--surface);border:1px solid var(--hairline-soft);border-radius:14px;padding:14px 16px;position:relative;overflow:hidden}
.op-page .kpi .k{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-muted);font-weight:500}
.op-page .kpi .v{font-size:26px;font-weight:600;letter-spacing:-.02em;margin:6px 0 2px;font-variant-numeric:tabular-nums}
.op-page .kpi .d{font-size:11.5px;color:var(--ink-muted)}
.op-page .kpi .d .up{color:var(--coach)}
.op-page .kpi-spark{position:absolute;right:10px;top:10px;width:64px;height:28px;opacity:.6}
.op-page .kanban{display:grid;grid-template-columns:repeat(6,minmax(210px,1fr));gap:10px;align-items:stretch;overflow-x:auto;flex:1;
    /* Floor the kanban height so on short viewports we still get a usable
       column rather than collapsing to 0. The page scrolls on small screens;
       on tall ones the columns stretch to fill via flex:1. The 240px deduction
       roughly accounts for topbar + page-head + KPI row above. */
    min-height:calc(100vh - 240px);
}
.op-page .kcol{background:var(--shell);border:1px solid var(--hairline-soft);border-radius:14px;padding:10px;display:flex;flex-direction:column;min-height:0;overflow:hidden}
.op-page .kcol-body{flex:1;min-height:0;overflow-y:auto;padding-right:2px;scrollbar-width:thin;scrollbar-color:var(--hairline) transparent}
.op-page .kcol-body::-webkit-scrollbar{width:6px}
.op-page .kcol-body::-webkit-scrollbar-thumb{background:var(--hairline);border-radius:3px}
.op-page .kcol-head{display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:2px 4px;flex-shrink:0}
.op-page .kcol-head .dot{width:7px;height:7px;border-radius:50%}
.op-page .kcol-head .title{font-size:12px;font-weight:600}
.op-page .kcol-head .count{font-size:11px;color:var(--ink-muted);margin-left:auto}
.op-page .kcard{background:var(--surface);border:1px solid var(--hairline-soft);border-radius:10px;padding:10px;margin-bottom:8px;cursor:grab;transition:border-color .12s,transform .12s}
.op-page .kcard:hover{border-color:var(--hairline);transform:translateY(-1px)}
.op-page .kcard .name{font-size:12.5px;font-weight:600;margin-bottom:2px}
.op-page .kcard .co{font-size:11.5px;color:var(--ink-muted)}
.op-page .kcard .foot{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--ink-muted)}
.op-page .kcard .val{color:var(--ink);font-weight:600}
.op-page .kcard .dates{margin-left:auto;font-size:10.5px;color:var(--ink-faint)}
            `}</style>
        </div>
    );
}
