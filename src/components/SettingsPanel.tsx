import React from 'react';
import { useStore } from '../store/useStore';
import { X, RefreshCw, Eye, Sparkles, Palette } from 'lucide-react';
import type { NamingMode, ScreenshotMode } from '../../shared/types';

interface OpenRouterModel {
  id: string;
  name: string;
  promptPrice: number;
  completionPrice: number;
  isFree: boolean;
  supportsVision: boolean;
  contextLength: number;
}

function formatPrice(perToken: number): string {
  if (perToken === 0) return 'Free';
  const perMillion = perToken * 1_000_000;
  if (perMillion < 0.01) return '<$0.01/M';
  return `$${perMillion.toFixed(2)}/M`;
}

type SettingsTab = 'capture' | 'ai' | 'branding';

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'capture', label: 'Capture', icon: <Eye size={14} /> },
  { id: 'ai', label: 'AI Enrichment', icon: <Sparkles size={14} /> },
  { id: 'branding', label: 'Branding', icon: <Palette size={14} /> },
];

export const SettingsModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { guide, setSettings, setAiSettings, setBrandingSettings } = useStore();
  const settings = guide.settings;
  const ai = settings.ai;
  const branding = settings.branding;

  const [activeTab, setActiveTab] = React.useState<SettingsTab>('capture');
  const [keyInput, setKeyInput] = React.useState('');
  const [keyStatus, setKeyStatus] = React.useState<'idle' | 'saved' | 'loading'>('idle');
  const [models, setModels] = React.useState<OpenRouterModel[]>([]);
  const [modelsLoading, setModelsLoading] = React.useState(false);
  const [modelsError, setModelsError] = React.useState('');
  const [modelFilter, setModelFilter] = React.useState<'all' | 'free' | 'vision'>('all');
  const [modelSearch, setModelSearch] = React.useState('');

  React.useEffect(() => {
    if (!open) return;
    setKeyStatus('loading');
    window.ipcRenderer.invoke('ai-has-key').then((has) => {
      setKeyStatus(has ? 'saved' : 'idle');
    });
  }, [open]);

  const fetchModels = async () => {
    setModelsLoading(true);
    setModelsError('');
    const result = (await window.ipcRenderer.invoke('ai-fetch-models')) as {
      ok: boolean;
      models: OpenRouterModel[];
      error?: string;
    };
    setModelsLoading(false);
    if (result.ok) {
      setModels(result.models);
    } else {
      setModelsError(result.error ?? 'Failed to fetch models.');
    }
  };

  React.useEffect(() => {
    if (open && keyStatus === 'saved' && ai?.aiEnabled) {
      fetchModels();
    }
  }, [keyStatus, ai?.aiEnabled, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveKey = async () => {
    if (!keyInput.trim()) return;
    await window.ipcRenderer.invoke('ai-save-key', keyInput.trim());
    setAiSettings({ openRouterApiKey: keyInput.trim() });
    setKeyInput('');
    setKeyStatus('saved');
  };

  const handleClearKey = async () => {
    await window.ipcRenderer.invoke('ai-clear-key');
    setAiSettings({ openRouterApiKey: '' });
    setKeyStatus('idle');
    setModels([]);
  };

  const handlePickLogo = async () => {
    const logoPath = (await window.ipcRenderer.invoke('pick-branding-logo')) as string | null;
    if (logoPath) {
      setBrandingSettings({ logoPath });
    }
  };

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const filteredModels = models.filter((m) => {
    if (modelFilter === 'free' && !m.isFree) return false;
    if (modelFilter === 'vision' && !m.supportsVision) return false;
    if (modelSearch) {
      const q = modelSearch.toLowerCase();
      return m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="settings-modal-header">
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Settings</h2>
          <button className="settings-close-btn" onClick={onClose} title="Close settings">
            <X size={18} />
          </button>
        </div>

        {/* Tabs + Content */}
        <div className="settings-modal-body">
          {/* Tab bar */}
          <nav className="settings-tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Tab content */}
          <div className="settings-tab-content">
            {/* ────── CAPTURE TAB ────── */}
            {activeTab === 'capture' && (
              <div className="settings-section">
                <h3 className="settings-section-title">Screenshot</h3>
                <div className="settings-grid">
                  <label className="settings-field">
                    <span className="settings-label">Capture mode</span>
                    <select
                      value={settings.screenshotMode}
                      onChange={(e) => setSettings({ screenshotMode: e.target.value as ScreenshotMode })}
                    >
                      <option value="snippet">Snippet (region around click)</option>
                      <option value="fullscreen">Full screen</option>
                      <option value="both">Both (snippet + full screen)</option>
                    </select>
                  </label>
                  <label className="settings-field">
                    <span className="settings-label">Snippet width</span>
                    <input
                      type="number"
                      value={settings.screenshotWidth}
                      onChange={(e) => setSettings({ screenshotWidth: Number(e.target.value) || 800 })}
                      disabled={settings.screenshotMode === 'fullscreen'}
                    />
                  </label>
                  <label className="settings-field">
                    <span className="settings-label">Snippet height</span>
                    <input
                      type="number"
                      value={settings.screenshotHeight}
                      onChange={(e) => setSettings({ screenshotHeight: Number(e.target.value) || 600 })}
                      disabled={settings.screenshotMode === 'fullscreen'}
                    />
                  </label>
                  <label className="settings-field">
                    <span className="settings-label">JPEG quality ({settings.imageQuality}%)</span>
                    <input
                      type="range"
                      min={30}
                      max={100}
                      value={settings.imageQuality}
                      onChange={(e) => setSettings({ imageQuality: Number(e.target.value) })}
                    />
                  </label>
                </div>

                <h3 className="settings-section-title" style={{ marginTop: '24px' }}>Naming</h3>
                <label className="settings-field">
                  <span className="settings-label">App naming style</span>
                  <select
                    value={settings.namingMode ?? 'hybrid'}
                    onChange={(e) => setSettings({ namingMode: e.target.value as NamingMode })}
                  >
                    <option value="hybrid">Hybrid (generic for common, specific for others)</option>
                    <option value="generic">Generic (Web Browser, Email Client, ...)</option>
                    <option value="specific">Specific (Chrome, Outlook, ...)</option>
                  </select>
                </label>

                <h3 className="settings-section-title" style={{ marginTop: '24px' }}>Options</h3>
                <label className="settings-check">
                  <input
                    type="checkbox"
                    checked={settings.maskKeystrokes}
                    onChange={(e) => setSettings({ maskKeystrokes: e.target.checked })}
                  />
                  Mask all keystrokes
                </label>
                <label className="settings-check">
                  <input
                    type="checkbox"
                    checked={settings.autoNumberTitles}
                    onChange={(e) => setSettings({ autoNumberTitles: e.target.checked })}
                  />
                  Auto-number titles
                </label>
              </div>
            )}

            {/* ────── AI ENRICHMENT TAB ────── */}
            {activeTab === 'ai' && (
              <div className="settings-section">
                <label className="settings-check" style={{ marginBottom: '16px' }}>
                  <input
                    type="checkbox"
                    checked={ai?.aiEnabled ?? false}
                    onChange={(e) => setAiSettings({ aiEnabled: e.target.checked })}
                  />
                  <span style={{ fontWeight: 600, fontSize: '14px' }}>Enable AI enrichment</span>
                </label>

                {ai?.aiEnabled && (
                  <>
                    {/* API Key */}
                    <h3 className="settings-section-title">API Key</h3>
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ marginBottom: '6px', fontSize: '12px' }}>
                        Status:{' '}
                        {keyStatus === 'saved'
                          ? <span style={{ color: 'var(--success)', fontWeight: 600 }}>Saved</span>
                          : <span style={{ color: 'var(--text-dim)' }}>Not set</span>}
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="password"
                          value={keyInput}
                          onChange={(e) => setKeyInput(e.target.value)}
                          placeholder="sk-or-..."
                          style={{ flex: 1 }}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveKey()}
                        />
                        <button className="btn btn-primary" style={{ padding: '6px 16px' }} onClick={handleSaveKey}>
                          Save
                        </button>
                        {keyStatus === 'saved' && (
                          <button className="btn btn-outline" style={{ padding: '6px 12px' }} onClick={handleClearKey}>
                            Clear
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Model browser */}
                    <h3 className="settings-section-title">
                      <span>Model</span>
                      <button
                        className="btn btn-outline"
                        style={{ padding: '3px 10px', fontSize: '11px', marginLeft: '12px' }}
                        onClick={fetchModels}
                        disabled={modelsLoading}
                      >
                        <RefreshCw size={12} className={modelsLoading ? 'spin' : ''} />
                        {modelsLoading ? 'Loading...' : 'Refresh Models'}
                      </button>
                    </h3>

                    {ai?.model && (
                      <div className="settings-active-model">
                        Active: <strong>{ai.model}</strong>
                      </div>
                    )}
                    {modelsError && (
                      <div style={{ fontSize: '12px', color: 'var(--danger)', marginBottom: '8px' }}>{modelsError}</div>
                    )}

                    {models.length > 0 && (
                      <div style={{ marginBottom: '16px' }}>
                        <input
                          type="text"
                          value={modelSearch}
                          onChange={(e) => setModelSearch(e.target.value)}
                          placeholder="Search models by name or ID..."
                          style={{ width: '100%', marginBottom: '8px' }}
                        />
                        <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                          {(['all', 'free', 'vision'] as const).map((f) => (
                            <button
                              key={f}
                              className={`btn ${modelFilter === f ? 'btn-primary' : 'btn-outline'}`}
                              style={{ padding: '4px 12px', fontSize: '11px' }}
                              onClick={() => setModelFilter(f)}
                            >
                              {f === 'vision' ? 'Vision' : f === 'free' ? 'Free' : 'All'}
                            </button>
                          ))}
                          <span style={{ fontSize: '11px', color: 'var(--text-dim)', alignSelf: 'center', marginLeft: '8px' }}>
                            {filteredModels.length} model{filteredModels.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="settings-model-list">
                          {filteredModels.slice(0, 100).map((m) => {
                            const isActive = ai?.model === m.id;
                            return (
                              <div
                                key={m.id}
                                className={`settings-model-row ${isActive ? 'active' : ''}`}
                                onClick={() => setAiSettings({ model: m.id })}
                              >
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div className="settings-model-name">{m.name}</div>
                                  <div className="settings-model-id">{m.id}</div>
                                </div>
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                                  {m.supportsVision && <span className="model-badge vision">Vision</span>}
                                  <span className={`model-badge ${m.isFree ? 'free' : 'paid'}`}>
                                    {m.isFree ? 'FREE' : formatPrice(m.promptPrice)}
                                  </span>
                                  {isActive && <span className="model-badge selected">Active</span>}
                                </div>
                              </div>
                            );
                          })}
                          {filteredModels.length === 0 && (
                            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '12px' }}>
                              No models match your filters.
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {models.length === 0 && !modelsLoading && !modelsError && keyStatus === 'saved' && (
                      <button className="btn btn-outline" style={{ width: '100%', marginBottom: '16px' }} onClick={fetchModels}>
                        Load available models
                      </button>
                    )}

                    {/* AI options */}
                    <h3 className="settings-section-title" style={{ marginTop: '8px' }}>Behaviour</h3>
                    <label className="settings-check">
                      <input
                        type="checkbox"
                        checked={ai?.enrichOnCapture ?? true}
                        onChange={(e) => setAiSettings({ enrichOnCapture: e.target.checked })}
                      />
                      Enrich steps automatically on capture
                    </label>
                    <label className="settings-check">
                      <input
                        type="checkbox"
                        checked={ai?.localOnlyMode ?? false}
                        onChange={(e) => setAiSettings({ localOnlyMode: e.target.checked })}
                      />
                      Local-only mode (OCR only, no cloud API calls)
                    </label>
                    <label className="settings-field" style={{ marginTop: '12px' }}>
                      <span className="settings-label">
                        Confidence threshold ({((ai?.confidenceThreshold ?? 0.6) * 100).toFixed(0)}%)
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={(ai?.confidenceThreshold ?? 0.6) * 100}
                        onChange={(e) => setAiSettings({ confidenceThreshold: Number(e.target.value) / 100 })}
                      />
                    </label>
                  </>
                )}

                {!ai?.aiEnabled && (
                  <p style={{ color: 'var(--text-dim)', fontSize: '13px', marginTop: '8px' }}>
                    Enable AI enrichment above to configure the OpenRouter API key, select a model, and adjust enrichment behaviour.
                  </p>
                )}
              </div>
            )}

            {/* ────── BRANDING TAB ────── */}
            {activeTab === 'branding' && (
              <div className="settings-section">
                <label className="settings-check" style={{ marginBottom: '16px' }}>
                  <input
                    type="checkbox"
                    checked={branding?.includeCoverPage ?? false}
                    onChange={(e) => setBrandingSettings({ includeCoverPage: e.target.checked })}
                  />
                  <span style={{ fontWeight: 600, fontSize: '14px' }}>Include cover page in exports</span>
                </label>

                <div className="settings-grid">
                  <label className="settings-field">
                    <span className="settings-label">Brand / Organisation name</span>
                    <input
                      type="text"
                      value={branding?.brandName ?? ''}
                      onChange={(e) => setBrandingSettings({ brandName: e.target.value })}
                      placeholder="Acme Corp"
                    />
                  </label>
                  <label className="settings-field">
                    <span className="settings-label">Author name</span>
                    <input
                      type="text"
                      value={branding?.authorName ?? ''}
                      onChange={(e) => setBrandingSettings({ authorName: e.target.value })}
                      placeholder="Jane Doe"
                    />
                  </label>
                  <label className="settings-field">
                    <span className="settings-label">Author role</span>
                    <input
                      type="text"
                      value={branding?.authorRole ?? ''}
                      onChange={(e) => setBrandingSettings({ authorRole: e.target.value })}
                      placeholder="Training Manager"
                    />
                  </label>
                  <label className="settings-field">
                    <span className="settings-label">Primary colour</span>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <input
                        type="color"
                        value={branding?.primaryColor ?? '#2563eb'}
                        onChange={(e) => setBrandingSettings({ primaryColor: e.target.value })}
                        style={{ width: '40px', height: '32px', border: 'none', cursor: 'pointer', borderRadius: '6px' }}
                      />
                      <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{branding?.primaryColor ?? '#2563eb'}</span>
                    </div>
                  </label>
                </div>

                <div style={{ display: 'flex', gap: '20px', marginTop: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <span className="settings-label" style={{ display: 'block', marginBottom: '6px' }}>Brand logo</span>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <button className="btn btn-outline" onClick={handlePickLogo}>
                        {branding?.logoPath ? 'Change Logo' : 'Select Logo'}
                      </button>
                      {branding?.logoPath && (
                        <>
                          <span style={{ fontSize: '11px', color: 'var(--success)' }}>Set</span>
                          <button className="btn btn-outline" style={{ padding: '3px 8px', fontSize: '10px' }} onClick={() => setBrandingSettings({ logoPath: '' })}>Clear</button>
                        </>
                      )}
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <span className="settings-label" style={{ display: 'block', marginBottom: '6px' }}>Cover page background</span>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <button className="btn btn-outline" onClick={async () => {
                        const bgPath = (await window.ipcRenderer.invoke('pick-branding-background')) as string | null;
                        if (bgPath) setBrandingSettings({ backgroundPath: bgPath });
                      }}>
                        {branding?.backgroundPath ? 'Change' : 'Select Image'}
                      </button>
                      {branding?.backgroundPath && (
                        <>
                          <span style={{ fontSize: '11px', color: 'var(--success)' }}>Set</span>
                          <button className="btn btn-outline" style={{ padding: '3px 8px', fontSize: '10px' }} onClick={() => setBrandingSettings({ backgroundPath: '' })}>Clear</button>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <label className="settings-field" style={{ marginTop: '16px' }}>
                  <span className="settings-label">Document purpose / summary</span>
                  <textarea
                    value={branding?.purposeSummary ?? ''}
                    onChange={(e) => setBrandingSettings({ purposeSummary: e.target.value })}
                    style={{ minHeight: '80px', resize: 'vertical' }}
                    placeholder="This guide explains how to..."
                  />
                </label>

                <label className="settings-check" style={{ marginTop: '12px' }}>
                  <input
                    type="checkbox"
                    checked={branding?.showDate !== false}
                    onChange={(e) => setBrandingSettings({ showDate: e.target.checked })}
                  />
                  Show date on cover page & exports
                </label>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
