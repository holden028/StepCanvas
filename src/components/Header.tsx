import React from 'react';
import { useStore } from '../store/useStore';
import { Play, Square, Download, FolderOpen, Save, FilePlus2, Pause, RotateCcw } from 'lucide-react';
import type { ExportFormat } from '../../shared/types';
import logoSrc from '../assets/logo.png';

export const Header: React.FC = () => {
    const { isRecording, isPaused, setPaused, setRecording, guide, guidePath, setGuidePath, setGuide, validateGuide, recaptureTarget } = useStore();
    const [format, setFormat] = React.useState<ExportFormat>(guide.settings.defaultExportFormat);

    const handleExport = async () => {
        const validation = validateGuide();
        if (!validation.ok) {
            window.alert(validation.message);
            return;
        }
        const success = await window.ipcRenderer.invoke('export-guide', { guide, format });
        if (success) {
            useStore.getState().setReviewCompleted(true);
        }
    };

    const handleToggleRecording = async () => {
        if (isRecording) {
            window.ipcRenderer.invoke('stop-recording');
            setRecording(false);
            setPaused(false);
            useStore.getState().setRecaptureTarget(null);
        } else {
            const startResult = (await window.ipcRenderer.invoke('start-recording', guide.settings)) as
                | { ok: true }
                | { ok: false; reason?: string };
            if (startResult?.ok) {
                setRecording(true);
                setPaused(false);
            } else {
                window.alert(`Recording failed to start. ${startResult?.reason ?? ''}`.trim());
            }
        }
    };

    const handleTogglePause = () => {
        setPaused(!isPaused);
    };

    const handleSave = async () => {
        const response = (await window.ipcRenderer.invoke('save-guide', { guide, guidePath })) as
            | { guidePath: string; recentGuides: string[] }
            | null;
        if (response) {
            setGuidePath(response.guidePath);
            useStore.getState().setRecentGuides(response.recentGuides);
        }
    };

    const handleOpen = async () => {
        const response = (await window.ipcRenderer.invoke('open-guide')) as
            | { guide: typeof guide; guidePath: string; recentGuides: string[] }
            | null;
        if (response) {
            setGuide(response.guide, response.guidePath);
            useStore.getState().setRecentGuides(response.recentGuides);
        }
    };

    const handleNew = async () => {
        const newGuide = (await window.ipcRenderer.invoke('new-guide')) as typeof guide;
        setGuide(newGuide, null);
    };

    const recordingLabel = recaptureTarget
        ? `Re-capturing (${recaptureTarget.strategy === 'single' ? 'single step' : 'from step forward'})`
        : isPaused
          ? 'Paused'
          : 'Recording';

    return (
        <header className="header" style={{
            height: '60px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
            borderBottom: '1px solid var(--border-glass)',
            background: 'rgba(255,255,255,0.02)'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <img src={logoSrc} alt="StepCanvas" style={{ width: '28px', height: '28px' }} />
                <h1 style={{ fontSize: '18px', margin: 0, fontWeight: 700, letterSpacing: '-0.5px' }}>
                    Step<span style={{ color: '#7c6cf0' }}>Canvas</span>
                </h1>
                {isRecording && (
                    <div
                        className="badge badge-recording"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: isPaused ? 'var(--warning, #f59e0b)' : recaptureTarget ? '#a855f7' : undefined,
                        }}
                    >
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'white' }} />
                        {recordingLabel}
                    </div>
                )}
                {!isRecording && guidePath && (
                    <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{guidePath}</span>
                )}
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
                <button className="btn btn-outline" onClick={handleNew}>
                    <FilePlus2 size={16} />
                    New
                </button>
                <button className="btn btn-outline" onClick={handleOpen}>
                    <FolderOpen size={16} />
                    Open
                </button>
                <button className="btn btn-outline" onClick={handleSave}>
                    <Save size={16} />
                    Save
                </button>
                <button
                    className={`btn ${isRecording ? 'btn-outline' : 'btn-primary'}`}
                    onClick={handleToggleRecording}
                    style={{ borderColor: isRecording ? 'var(--danger)' : undefined, color: isRecording ? 'var(--danger)' : undefined }}
                >
                    {isRecording ? <Square size={16} /> : <Play size={16} />}
                    {isRecording ? 'Stop Recording' : 'Start Capture'}
                </button>

                {isRecording && !recaptureTarget && (
                    <button
                        className={`btn ${isPaused ? 'btn-primary' : 'btn-outline'}`}
                        onClick={handleTogglePause}
                        style={isPaused ? {} : { borderColor: 'var(--warning, #f59e0b)', color: 'var(--warning, #f59e0b)' }}
                    >
                        {isPaused ? <><RotateCcw size={16} /> Resume</> : <><Pause size={16} /> Pause</>}
                    </button>
                )}

                <div
                    className="btn btn-outline"
                    style={{ gap: '6px', cursor: 'default' }}
                    title="Select export format"
                >
                    <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>Format</span>
                    <select
                        value={format}
                        onChange={(e) => setFormat(e.target.value as ExportFormat)}
                        style={{ background: 'transparent', color: 'inherit', border: 'none', outline: 'none', cursor: 'pointer' }}
                    >
                        <option value="markdown">Markdown</option>
                        <option value="html">HTML</option>
                        <option value="pdf">PDF</option>
                        <option value="docx">DOCX</option>
                        <option value="pptx">PPTX</option>
                        <option value="json">JSON</option>
                    </select>
                </div>
                <button
                    className="btn btn-primary"
                    disabled={guide.steps.length === 0}
                    onClick={handleExport}
                    title="Export using selected format"
                >
                    <Download size={16} />
                    Export Guide
                </button>
            </div>
        </header>
    );
};
