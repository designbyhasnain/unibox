'use client';
import { VIEW_TABS, type ViewId } from '../../../lib/projects/constants';

export default function ViewSwitcher({ activeView, onChangeView }: {
  activeView: ViewId;
  onChangeView: (v: ViewId) => void;
}) {
  return (
    <div className="ep-view-tabs">
      {VIEW_TABS.map(tab => (
        <button
          key={tab.id}
          className={`ep-view-tab ${activeView === tab.id ? 'ep-view-tab-active' : ''}`}
          onClick={() => onChangeView(tab.id)}
        >
          <span className="ep-view-tab-icon">{tab.icon}</span> {tab.label}
        </button>
      ))}
      <span className="ep-view-tab ep-view-tab-more">··· 27 more</span>
    </div>
  );
}
