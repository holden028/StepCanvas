import React from 'react';
import { useStore } from '../store/useStore';
import { Sparkles, Loader2, RotateCcw, Check, Image, X, Wand2 } from 'lucide-react';

interface CoverGenResult {
  ok: boolean;
  title?: string;
  purposeSummary?: string;
  highlights?: string[];
  error?: string;
}

export const CoverPageEditor: React.FC = () => {
  const { guide, setBrandingSettings } = useStore();
  const meta = guide.meta;
  const branding = guide.settings.branding;
  const ai = guide.settings.ai;

  const [generating, setGenerating] = React.useState(false);
  const [genError, setGenError] = React.useState('');
  const [generated, setGenerated] = React.useState(false);
  const highlights = branding?.highlights ?? [];
  const setHighlights = (next: string[]) => setBrandingSettings({ highlights: next });

  const [logoDataUrl, setLogoDataUrl] = React.useState<string | null>(null);
  const [bgDataUrl, setBgDataUrl] = React.useState<string | null>(null);
  const [generatingBg, setGeneratingBg] = React.useState(false);
  const [bgGenError, setBgGenError] = React.useState('');

  React.useEffect(() => {
    if (branding?.logoPath) {
      window.ipcRenderer.invoke('read-branding-image-data-url', branding.logoPath).then((url) => setLogoDataUrl(url as string | null));
    } else {
      setLogoDataUrl(null);
    }
  }, [branding?.logoPath]);

  React.useEffect(() => {
    if (branding?.backgroundPath) {
      window.ipcRenderer.invoke('read-branding-image-data-url', branding.backgroundPath).then((url) => setBgDataUrl(url as string | null));
    } else {
      setBgDataUrl(null);
    }
  }, [branding?.backgroundPath]);

  const updateTitle = (title: string) => {
    useStore.getState().setGuide(
      { ...guide, meta: { ...meta, title } },
      useStore.getState().guidePath,
    );
  };

  const handlePickLogo = async () => {
    const logoPath = (await window.ipcRenderer.invoke('pick-branding-logo')) as string | null;
    if (logoPath) setBrandingSettings({ logoPath });
  };

  const handlePickBackground = async () => {
    const bgPath = (await window.ipcRenderer.invoke('pick-branding-background')) as string | null;
    if (bgPath) setBrandingSettings({ backgroundPath: bgPath });
  };

  const handleGenerateBackground = async () => {
    setGeneratingBg(true);
    setBgGenError('');
    try {
      const apiKey = (await window.ipcRenderer.invoke('ai-load-key')) as string;
      if (!apiKey) {
        setBgGenError('No API key configured. Set one in Settings > AI Enrichment.');
        setGeneratingBg(false);
        return;
      }
      const result = (await window.ipcRenderer.invoke('ai-generate-background', {
        brandName: branding?.brandName ?? '',
        primaryColor: branding?.primaryColor ?? '#2563eb',
        purposeSummary: branding?.purposeSummary ?? '',
        aiSettings: { ...ai, openRouterApiKey: apiKey },
      })) as { ok: boolean; backgroundPath?: string; error?: string };

      if (result.ok && result.backgroundPath) {
        setBrandingSettings({ backgroundPath: result.backgroundPath });
      } else {
        setBgGenError(result.error ?? 'Background generation failed.');
      }
    } catch (err) {
      setBgGenError(err instanceof Error ? err.message : 'Unexpected error.');
    }
    setGeneratingBg(false);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setGenError('');
    try {
      const apiKey = (await window.ipcRenderer.invoke('ai-load-key')) as string;
      if (!apiKey) {
        setGenError('No API key configured. Set one in Settings > AI Enrichment.');
        setGenerating(false);
        return;
      }

      const result = (await window.ipcRenderer.invoke('ai-generate-cover', {
        steps: guide.steps.map((s) => ({
          title: s.title,
          description: s.description,
          appName: s.appName,
          currentUrl: s.currentUrl,
        })),
        guideTitle: meta.title,
        branding: {
          brandName: branding?.brandName ?? '',
          authorName: branding?.authorName ?? '',
          authorRole: branding?.authorRole ?? '',
          purposeSummary: branding?.purposeSummary ?? '',
        },
        aiSettings: { ...ai, openRouterApiKey: apiKey },
      })) as CoverGenResult;

      if (result.ok) {
        if (result.title) updateTitle(result.title);
        if (result.purposeSummary) setBrandingSettings({ purposeSummary: result.purposeSummary, includeCoverPage: true });
        if (result.highlights) setHighlights(result.highlights);
        setGenerated(true);
      } else {
        setGenError(result.error ?? 'AI generation failed.');
      }
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Unexpected error.');
    }
    setGenerating(false);
  };

  const primaryColor = branding?.primaryColor || '#2563eb';
  const date = new Date(meta.updatedAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const hasBg = !!bgDataUrl;

  return (
    <div style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        {/* Header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 700 }}>Cover Page</h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            {generated && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--success)' }}>
                <Check size={14} /> Generated
              </span>
            )}
            <button
              className="btn btn-primary"
              onClick={handleGenerate}
              disabled={generating || !ai?.aiEnabled || guide.steps.length === 0}
              style={{ fontSize: '13px' }}
            >
              {generating ? (
                <><Loader2 size={14} className="spin" /> Generating...</>
              ) : (
                <><Sparkles size={14} /> Generate with AI</>
              )}
            </button>
            {generated && (
              <button className="btn btn-outline" onClick={handleGenerate} disabled={generating} title="Regenerate">
                <RotateCcw size={14} />
              </button>
            )}
          </div>
        </div>

        {genError && (
          <div style={{ marginBottom: '16px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', fontSize: '13px', color: '#ef4444' }}>
            {genError}
          </div>
        )}

        {!ai?.aiEnabled && (
          <div style={{ marginBottom: '16px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', fontSize: '13px', color: '#fbbf24' }}>
            AI enrichment is disabled. Enable it in Settings to use AI generation.
          </div>
        )}

        {guide.steps.length === 0 && (
          <div style={{ marginBottom: '16px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', fontSize: '13px', color: '#60a5fa' }}>
            Capture some steps first so AI can generate a meaningful cover page.
          </div>
        )}

        {/* Editable fields */}
        <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-dim)' }}>
            Edit Cover Page Content
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px' }}>
            <label className="settings-field" style={{ gridColumn: '1 / -1' }}>
              <span className="settings-label">Document Title</span>
              <input
                type="text"
                value={meta.title}
                onChange={(e) => updateTitle(e.target.value)}
                placeholder="Untitled Guide"
              />
            </label>
            <label className="settings-field" style={{ gridColumn: '1 / -1' }}>
              <span className="settings-label">Purpose Summary</span>
              <textarea
                value={branding?.purposeSummary ?? ''}
                onChange={(e) => setBrandingSettings({ purposeSummary: e.target.value })}
                placeholder="A brief description of what this guide covers..."
                style={{ minHeight: '70px', resize: 'vertical' }}
              />
            </label>
            <label className="settings-field">
              <span className="settings-label">Brand / Organisation</span>
              <input
                type="text"
                value={branding?.brandName ?? ''}
                onChange={(e) => setBrandingSettings({ brandName: e.target.value })}
                placeholder="Acme Corp"
              />
            </label>
            <label className="settings-field">
              <span className="settings-label">Primary Colour</span>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="color"
                  value={branding?.primaryColor ?? '#2563eb'}
                  onChange={(e) => setBrandingSettings({ primaryColor: e.target.value })}
                  style={{ width: '40px', height: '32px', border: 'none', cursor: 'pointer', borderRadius: '6px' }}
                />
                <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{branding?.primaryColor ?? '#2563eb'}</span>
              </div>
            </label>
            <label className="settings-field">
              <span className="settings-label">Author Name</span>
              <input
                type="text"
                value={branding?.authorName ?? ''}
                onChange={(e) => setBrandingSettings({ authorName: e.target.value })}
                placeholder="Jane Doe"
              />
            </label>
            <label className="settings-field">
              <span className="settings-label">Author Role</span>
              <input
                type="text"
                value={branding?.authorRole ?? ''}
                onChange={(e) => setBrandingSettings({ authorRole: e.target.value })}
                placeholder="Training Manager"
              />
            </label>
          </div>

          {/* Logo and Background pickers */}
          <div style={{ display: 'flex', gap: '20px', marginTop: '16px' }}>
            <div style={{ flex: 1 }}>
              <span className="settings-label" style={{ display: 'block', marginBottom: '6px' }}>Brand Logo</span>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                {logoDataUrl && (
                  <img src={logoDataUrl} alt="Logo" style={{ height: '36px', maxWidth: '80px', objectFit: 'contain', borderRadius: '4px', border: '1px solid var(--border-glass)' }} />
                )}
                <button className="btn btn-outline" style={{ fontSize: '12px' }} onClick={handlePickLogo}>
                  <Image size={12} />
                  {branding?.logoPath ? 'Change' : 'Select'}
                </button>
                {branding?.logoPath && (
                  <button className="btn btn-outline" style={{ padding: '4px 8px', fontSize: '10px' }} onClick={() => setBrandingSettings({ logoPath: '' })}>
                    <X size={10} /> Clear
                  </button>
                )}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <span className="settings-label" style={{ display: 'block', marginBottom: '6px' }}>Cover Background</span>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                {bgDataUrl && (
                  <img src={bgDataUrl} alt="Background" style={{ height: '36px', maxWidth: '80px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--border-glass)' }} />
                )}
                <button className="btn btn-outline" style={{ fontSize: '12px' }} onClick={handlePickBackground}>
                  <Image size={12} />
                  {branding?.backgroundPath ? 'Change' : 'Select'}
                </button>
                <button
                  className="btn btn-outline"
                  style={{ fontSize: '12px' }}
                  onClick={handleGenerateBackground}
                  disabled={generatingBg || !ai?.aiEnabled}
                  title={!ai?.aiEnabled ? 'Enable AI in Settings first' : 'Generate a background image using AI based on your branding'}
                >
                  {generatingBg ? <Loader2 size={12} className="spin" /> : <Wand2 size={12} />}
                  {generatingBg ? 'Generating...' : 'Generate with AI'}
                </button>
                {branding?.backgroundPath && (
                  <button className="btn btn-outline" style={{ padding: '4px 8px', fontSize: '10px' }} onClick={() => setBrandingSettings({ backgroundPath: '' })}>
                    <X size={10} /> Clear
                  </button>
                )}
              </div>
              {bgGenError && (
                <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '4px' }}>{bgGenError}</div>
              )}
            </div>
          </div>

          {/* Highlights */}
          <div style={{ marginTop: '16px' }}>
            <span className="settings-label" style={{ display: 'block', marginBottom: '8px' }}>
              Key Highlights / Learning Outcomes
            </span>
            {highlights.map((h, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                <input
                  type="text"
                  value={h}
                  onChange={(e) => {
                    const next = [...highlights];
                    next[i] = e.target.value;
                    setHighlights(next);
                  }}
                  style={{ flex: 1 }}
                />
                <button
                  className="btn btn-outline"
                  style={{ padding: '4px 8px', fontSize: '11px' }}
                  onClick={() => setHighlights(highlights.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              className="btn btn-outline"
              style={{ fontSize: '12px', marginTop: '4px' }}
              onClick={() => setHighlights([...highlights, ''])}
            >
              + Add Highlight
            </button>
          </div>

          <div style={{ display: 'flex', gap: '24px', marginTop: '16px' }}>
            <label className="settings-check">
              <input
                type="checkbox"
                checked={branding?.includeCoverPage ?? false}
                onChange={(e) => setBrandingSettings({ includeCoverPage: e.target.checked })}
              />
              Include cover page in exports
            </label>
            <label className="settings-check">
              <input
                type="checkbox"
                checked={branding?.showDate !== false}
                onChange={(e) => setBrandingSettings({ showDate: e.target.checked })}
              />
              Show date
            </label>
          </div>
        </div>

        {/* Live preview */}
        <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
          <div style={{
            padding: '12px 20px',
            borderBottom: '1px solid var(--border-glass)',
            fontSize: '12px',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            color: 'var(--text-dim)',
          }}>
            Preview
          </div>
          <div style={{
            position: 'relative',
            minHeight: '480px',
            overflow: 'hidden',
          }}>
            {/* Background layer */}
            {hasBg && (
              <div style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: `url(${bgDataUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                zIndex: 0,
              }} />
            )}
            {/* Overlay to ensure text readability over background */}
            {hasBg && (
              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(255,255,255,0.82)',
                zIndex: 1,
              }} />
            )}

            {/* Content */}
            <div style={{
              position: 'relative',
              zIndex: 2,
              padding: '48px 40px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              minHeight: '480px',
              color: '#111',
              background: hasBg ? 'transparent' : '#fafafa',
            }}>
              {logoDataUrl && (
                <img
                  src={logoDataUrl}
                  alt="Logo"
                  style={{ maxWidth: '160px', maxHeight: '90px', objectFit: 'contain', marginBottom: '24px' }}
                />
              )}
              {branding?.brandName && (
                <div style={{
                  fontSize: '14px',
                  color: primaryColor,
                  fontWeight: 600,
                  letterSpacing: '2px',
                  textTransform: 'uppercase',
                  marginBottom: '16px',
                }}>
                  {branding.brandName}
                </div>
              )}
              <h1 style={{
                fontSize: '32px',
                margin: '0 0 16px',
                color: '#111',
                fontWeight: 700,
                maxWidth: '600px',
                lineHeight: 1.2,
              }}>
                {meta.title || 'Untitled Guide'}
              </h1>
              {branding?.purposeSummary && (
                <p style={{
                  fontSize: '15px',
                  color: '#555',
                  maxWidth: '500px',
                  margin: '0 auto 24px',
                  lineHeight: 1.5,
                }}>
                  {branding.purposeSummary}
                </p>
              )}
              {highlights.filter((h) => h.trim()).length > 0 && (
                <div style={{
                  textAlign: 'left',
                  margin: '0 auto 24px',
                  maxWidth: '440px',
                  padding: '16px 20px',
                  background: hasBg ? 'rgba(255,255,255,0.7)' : '#f0f0f0',
                  borderRadius: '10px',
                  borderLeft: `4px solid ${primaryColor}`,
                  backdropFilter: hasBg ? 'blur(4px)' : undefined,
                }}>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: '#888', marginBottom: '8px', fontWeight: 600 }}>
                    What you'll learn
                  </div>
                  {highlights.filter((h) => h.trim()).map((h, i) => (
                    <div key={i} style={{ fontSize: '13px', color: '#333', marginBottom: '4px', display: 'flex', gap: '6px' }}>
                      <span style={{ color: primaryColor, fontWeight: 700 }}>•</span>
                      {h}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: '16px', fontSize: '13px', color: '#666' }}>
                {guide.steps.length} step{guide.steps.length !== 1 ? 's' : ''}
              </div>
              <div style={{ marginTop: '24px', fontSize: '13px', color: '#888' }}>
                {branding?.authorName && (
                  <div>
                    Authored by <strong style={{ color: '#555' }}>{branding.authorName}</strong>
                  </div>
                )}
                {branding?.authorRole && (
                  <div style={{ fontSize: '12px' }}>{branding.authorRole}</div>
                )}
                {branding?.showDate !== false && (
                  <div style={{ marginTop: '6px', fontSize: '12px' }}>{date}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
