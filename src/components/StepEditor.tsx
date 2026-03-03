import React from 'react';
import { useStore } from '../store/useStore';
import { Eye, Circle, ArrowRight, Type, Paintbrush2, Crop, MousePointer2, Trash2, Image, Maximize2, Sparkles, Check, X, Loader2, Zap } from 'lucide-react';
import type { StepAnnotation } from '../../shared/types';

type AnnotationTool = 'pointer' | 'arrow' | 'circle' | 'text' | 'blur' | 'crop';
type AnnotationInteraction =
  | {
      mode: 'move' | 'resize';
      annotationId: string;
      startClientX: number;
      startClientY: number;
      startX: number;
      startY: number;
      startWidth: number;
      startHeight: number;
    }
  | null;

type PreviewMode = 'snippet' | 'fullscreen';

export const StepEditor: React.FC = () => {
  const { guide, activeStepId, updateStep, setActiveStep, applyProposal, rejectProposal, acceptAllHighConfidence, enrichingStepIds, setEnriching, assignStepToChapter } = useStore();
  const activeStep = guide.steps.find((s) => s.id === activeStepId);
  const activeIndex = guide.steps.findIndex((s) => s.id === activeStepId);
  const [imageSrc, setImageSrc] = React.useState<string | null>(null);
  const [imageError, setImageError] = React.useState<string | null>(null);
  const [activeTool, setActiveTool] = React.useState<AnnotationTool | null>(null);
  const [draftAnnotation, setDraftAnnotation] = React.useState<Omit<StepAnnotation, 'id'> | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = React.useState<string | null>(null);
  const [annotationInteraction, setAnnotationInteraction] = React.useState<AnnotationInteraction>(null);
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = React.useState({ width: 1, height: 1 });
  const [previewMode, setPreviewMode] = React.useState<PreviewMode>('snippet');
  const [showAdditionalInstructions, setShowAdditionalInstructions] = React.useState(false);
  const [draggingCursor, setDraggingCursor] = React.useState(false);
  const [textInput, setTextInput] = React.useState<{ x: number; y: number; value: string; baseWidth?: number; baseHeight?: number } | null>(null);
  const textInputRef = React.useRef<HTMLInputElement | null>(null);

  const hasSnippet = !!activeStep?.screenshotPath;
  const hasFullscreen = !!activeStep?.screenshotFullPath;
  const effectivePath =
    previewMode === 'fullscreen' && hasFullscreen
      ? activeStep?.screenshotFullPath
      : activeStep?.screenshotPath;

  const deleteSelectedAnnotation = React.useCallback(() => {
    if (!activeStep || !selectedAnnotationId) {
      return;
    }
    updateStep(activeStep.id, {
      annotations: activeStep.annotations.filter((annotation) => annotation.id !== selectedAnnotationId),
    });
    setSelectedAnnotationId(null);
  }, [activeStep, selectedAnnotationId, updateStep]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (event.key === 'ArrowDown' && guide.steps[activeIndex + 1]) {
        setActiveStep(guide.steps[activeIndex + 1].id);
      } else if (event.key === 'ArrowUp' && guide.steps[activeIndex - 1]) {
        setActiveStep(guide.steps[activeIndex - 1].id);
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedAnnotationId) {
        const target = event.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
        event.preventDefault();
        deleteSelectedAnnotation();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeIndex, guide.steps, setActiveStep, selectedAnnotationId, deleteSelectedAnnotation]);

  React.useEffect(() => {
    let cancelled = false;
    const resolveImage = async () => {
      if (!effectivePath) {
        setImageSrc(null);
        setImageError(null);
        return;
      }
      const dataUrl = (await window.ipcRenderer.invoke('read-image-data-url', effectivePath)) as string | null;
      if (cancelled) {
        return;
      }
      if (dataUrl) {
        setImageSrc(dataUrl);
        setImageError(null);
      } else {
        setImageSrc(`local-asset://${effectivePath}`);
        setImageError('Image preview fallback used.');
      }
    };
    resolveImage();
    return () => {
      cancelled = true;
    };
  }, [activeStep?.id, effectivePath]);

  React.useEffect(() => {
    setSelectedAnnotationId(null);
    setAnnotationInteraction(null);
    setDraftAnnotation(null);
    setPreviewMode('snippet');
    setShowAdditionalInstructions(Boolean(activeStep?.additionalInstructions));
  }, [activeStep?.id, activeStep?.additionalInstructions]);

  React.useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const updateSize = () => {
      const rect = stage.getBoundingClientRect();
      setStageSize({ width: Math.max(1, rect.width), height: Math.max(1, rect.height) });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(stage);
    window.addEventListener('resize', updateSize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, [activeStep?.id, imageSrc]);

  const addAnnotation = (annotation: Omit<StepAnnotation, 'id'>) => {
    if (!activeStep) {
      return;
    }
    updateStep(activeStep.id, {
      annotations: [...activeStep.annotations, { ...annotation, id: `ann-${Date.now()}` }],
    });
  };

  const updateAnnotation = (annotationId: string, updater: (annotation: StepAnnotation) => StepAnnotation) => {
    if (!activeStep) {
      return;
    }
    updateStep(activeStep.id, {
      annotations: activeStep.annotations.map((annotation) => (annotation.id === annotationId ? updater(annotation) : annotation)),
    });
  };

  const clearAnnotations = () => {
    if (!activeStep) {
      return;
    }
    updateStep(activeStep.id, { annotations: [] });
  };

  const pointInStage = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    const rect = stage.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
      return null;
    }
    return { x, y };
  };

  const normalizeRect = (annotation: Omit<StepAnnotation, 'id'>): Omit<StepAnnotation, 'id'> => {
    if (annotation.type === 'arrow') {
      return annotation;
    }
    const width = annotation.width ?? 0;
    const height = annotation.height ?? 0;
    return {
      ...annotation,
      x: width < 0 ? annotation.x + width : annotation.x,
      y: height < 0 ? annotation.y + height : annotation.y,
      width: Math.abs(width),
      height: Math.abs(height),
    };
  };

  const stageRect = () => stageRef.current?.getBoundingClientRect() ?? null;
  const toStageScale = (annotation: StepAnnotation) => {
    return {
      sx: stageSize.width / (annotation.baseWidth || stageSize.width),
      sy: stageSize.height / (annotation.baseHeight || stageSize.height),
    };
  };

  const commitTextInput = React.useCallback(() => {
    if (!textInput || !textInput.value.trim()) {
      setTextInput(null);
      return;
    }
    addAnnotation({
      type: 'text',
      x: textInput.x,
      y: textInput.y,
      text: textInput.value.trim(),
      width: Math.max(120, textInput.value.trim().length * 8),
      height: 26,
      baseWidth: textInput.baseWidth,
      baseHeight: textInput.baseHeight,
    });
    setTextInput(null);
  }, [textInput, addAnnotation]);

  const handleStageMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (textInput) {
      commitTextInput();
      return;
    }
    if (!activeTool || activeTool === 'pointer' || !activeStep?.screenshotPath) {
      setSelectedAnnotationId(null);
      return;
    }
    const point = pointInStage(event.clientX, event.clientY);
    if (!point) return;

    if (activeTool === 'text') {
      const rect = stageRect();
      setTextInput({ x: point.x, y: point.y, value: '', baseWidth: rect?.width ?? undefined, baseHeight: rect?.height ?? undefined });
      setTimeout(() => textInputRef.current?.focus(), 0);
      return;
    }
    const rect = stageRect();
    setDraftAnnotation({
      type: activeTool,
      x: point.x,
      y: point.y,
      width: 0,
      height: 0,
      baseWidth: rect?.width,
      baseHeight: rect?.height,
    });
  };

  const handleStageMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!draftAnnotation) {
      return;
    }
    const point = pointInStage(event.clientX, event.clientY);
    if (!point) {
      return;
    }
    setDraftAnnotation({
      ...draftAnnotation,
      width: point.x - draftAnnotation.x,
      height: point.y - draftAnnotation.y,
    });
  };

  const handleStageMouseUp = () => {
    if (!draftAnnotation) {
      return;
    }
    const finalized = normalizeRect(draftAnnotation);
    const minSize = 8;
    if ((finalized.width ?? 0) >= minSize || (finalized.height ?? 0) >= minSize || finalized.type === 'arrow') {
      addAnnotation(finalized);
    }
    setDraftAnnotation(null);
  };

  // Cursor indicator drag handling
  React.useEffect(() => {
    if (!draggingCursor || !activeStep) return;

    const onMouseMove = (event: MouseEvent) => {
      const stage = stageRef.current;
      if (!stage || !activeStep.screenshotRegion) return;
      const rect = stage.getBoundingClientRect();
      const pctX = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const pctY = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
      const region = activeStep.screenshotRegion;
      const newX = region.x + pctX * region.width;
      const newY = region.y + pctY * region.height;
      updateStep(activeStep.id, { x: newX, y: newY });
    };

    const onMouseUp = () => setDraggingCursor(false);

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [draggingCursor, activeStep, updateStep]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (!annotationInteraction || !activeStep) {
      return;
    }

    const onMouseMove = (event: MouseEvent) => {
      const targetAnnotation = activeStep.annotations.find((annotation) => annotation.id === annotationInteraction.annotationId);
      if (!targetAnnotation) {
        return;
      }
      const { sx, sy } = toStageScale(targetAnnotation);
      const dx = (event.clientX - annotationInteraction.startClientX) / sx;
      const dy = (event.clientY - annotationInteraction.startClientY) / sy;
      if (annotationInteraction.mode === 'move') {
        updateAnnotation(annotationInteraction.annotationId, (annotation) => ({
          ...annotation,
          x: annotationInteraction.startX + dx,
          y: annotationInteraction.startY + dy,
        }));
      } else {
        updateAnnotation(annotationInteraction.annotationId, (annotation) => ({
          ...annotation,
          width: Math.max(8, annotationInteraction.startWidth + dx),
          height: Math.max(8, annotationInteraction.startHeight + dy),
        }));
      }
    };

    const onMouseUp = () => {
      setAnnotationInteraction(null);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [annotationInteraction, activeStep]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!activeStep) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
        <Eye size={48} strokeWidth={1} style={{ marginBottom: '16px' }} />
        <p>Select a step to begin editing</p>
      </div>
    );
  }

  const relativeX =
    activeStep.x !== undefined && activeStep.screenshotRegion
      ? ((activeStep.x - activeStep.screenshotRegion.x) / activeStep.screenshotRegion.width) * 100
      : null;
  const relativeY =
    activeStep.y !== undefined && activeStep.screenshotRegion
      ? ((activeStep.y - activeStep.screenshotRegion.y) / activeStep.screenshotRegion.height) * 100
      : null;

  return (
    <div style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ marginBottom: '24px' }}>
          <input
            value={activeStep.title}
            onChange={(e) => updateStep(activeStep.id, { title: e.target.value })}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '32px',
              fontWeight: 700,
              color: 'white',
              width: '100%',
              outline: 'none',
              marginBottom: '8px',
            }}
            placeholder="Step Title"
          />
          <textarea
            value={activeStep.description}
            onChange={(e) => updateStep(activeStep.id, { description: e.target.value })}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '16px',
              color: 'var(--text-dim)',
              width: '100%',
              outline: 'none',
              resize: 'none',
              minHeight: '100px',
            }}
            placeholder="Add a detailed description for this step..."
          />
          {!showAdditionalInstructions && !activeStep.additionalInstructions ? (
            <button
              className="btn btn-outline"
              style={{ marginTop: '8px' }}
              onClick={() => setShowAdditionalInstructions(true)}
            >
              Add Additional Instructions (Optional)
            </button>
          ) : null}
          {(showAdditionalInstructions || activeStep.additionalInstructions) && (
            <div style={{ marginTop: '10px' }}>
              <textarea
                value={activeStep.additionalInstructions ?? ''}
                onChange={(e) => updateStep(activeStep.id, { additionalInstructions: e.target.value })}
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid var(--border-glass)',
                  borderRadius: '8px',
                  fontSize: '14px',
                  color: 'var(--text-dim)',
                  width: '100%',
                  outline: 'none',
                  resize: 'vertical',
                  minHeight: '74px',
                  padding: '10px',
                }}
                placeholder='Optional: add examples, sample login details (generic), caveats, or extra instructions for this step.'
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                  Only included when you fill it in.
                </span>
                <button
                  className="btn btn-outline"
                  style={{ padding: '2px 8px', fontSize: '11px' }}
                  onClick={() => {
                    updateStep(activeStep.id, { additionalInstructions: '' });
                    setShowAdditionalInstructions(false);
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          )}
          {/* --- AI Proposal Review --- */}
          {activeStep.proposal?.status === 'ready' && (
            <div style={{
              marginTop: '12px',
              padding: '12px',
              borderRadius: '10px',
              border: '1px solid rgba(168, 85, 247, 0.4)',
              background: 'rgba(168, 85, 247, 0.06)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', fontSize: '12px', color: '#a855f7' }}>
                <Sparkles size={14} />
                AI Suggestion ({((activeStep.proposal.confidence ?? 0) * 100).toFixed(0)}% confidence)
              </div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'white', marginBottom: '4px' }}>
                {activeStep.proposal.proposedTitle}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-dim)', marginBottom: '10px' }}>
                {activeStep.proposal.proposedDescription}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="btn btn-primary"
                  style={{ padding: '4px 12px', fontSize: '12px' }}
                  onClick={() => applyProposal(activeStep.id, activeStep.proposal!)}
                >
                  <Check size={12} /> Accept
                </button>
                <button
                  className="btn btn-outline"
                  style={{ padding: '4px 12px', fontSize: '12px' }}
                  onClick={() => rejectProposal(activeStep.id)}
                >
                  <X size={12} /> Reject
                </button>
                <button
                  className="btn btn-outline"
                  style={{ padding: '4px 12px', fontSize: '12px' }}
                  onClick={acceptAllHighConfidence}
                >
                  <Zap size={12} /> Accept All High Conf.
                </button>
              </div>
            </div>
          )}
          {activeStep.proposal?.status === 'accepted' && (
            <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Check size={12} /> AI suggestion applied
            </div>
          )}
          {activeStep.proposal?.status === 'failed' && (
            <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--danger)' }}>
              AI enrichment failed: {activeStep.proposal.error}
            </div>
          )}
          {enrichingStepIds.has(activeStep.id) && (
            <div style={{ marginTop: '8px', fontSize: '11px', color: '#a855f7', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Loader2 size={12} className="spin" /> Enriching with AI...
            </div>
          )}
          {guide.settings.ai?.aiEnabled && !activeStep.proposal && !enrichingStepIds.has(activeStep.id) && (
            <button
              className="btn btn-outline"
              style={{ marginTop: '8px', fontSize: '12px', padding: '4px 12px' }}
              onClick={async () => {
                setEnriching(activeStep.id, true);
                const aiKey = (await window.ipcRenderer.invoke('ai-load-key')) as string;
                const stepIdx = guide.steps.findIndex((s) => s.id === activeStep.id);
                const nearby = guide.steps
                  .slice(Math.max(0, stepIdx - 3), stepIdx + 4)
                  .filter((s) => s.id !== activeStep.id)
                  .map((s, i) => `${i < stepIdx ? 'Before' : 'After'}: ${s.title}`)
                  .join('; ');
                const result = (await window.ipcRenderer.invoke('ai-enrich-step', {
                  stepId: activeStep.id,
                  screenshotPath: activeStep.screenshotPath,
                  appName: activeStep.appName,
                  windowTitle: activeStep.windowTitle,
                  currentUrl: activeStep.currentUrl,
                  clickTargetLabel: activeStep.clickTargetLabel,
                  typedText: activeStep.key,
                  neighborContext: nearby,
                  existingTitle: activeStep.title,
                  existingDescription: activeStep.description,
                  stepNumber: stepIdx + 1,
                  totalSteps: guide.steps.length,
                  aiSettings: { ...guide.settings.ai, openRouterApiKey: aiKey },
                })) as import('../../shared/types').StepProposal;
                setEnriching(activeStep.id, false);
                updateStep(activeStep.id, { proposal: result });
              }}
            >
              <Sparkles size={12} /> Enrich with AI
            </button>
          )}

          <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
            <button
              className={`btn ${activeTool === 'arrow' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setActiveTool((current) => (current === 'arrow' ? null : 'arrow'))}
            >
              <ArrowRight size={14} />
              Arrow
            </button>
            <button
              className={`btn ${activeTool === 'circle' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setActiveTool((current) => (current === 'circle' ? null : 'circle'))}
            >
              <Circle size={14} />
              Circle
            </button>
            <button
              className={`btn ${activeTool === 'text' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setActiveTool((current) => (current === 'text' ? null : 'text'))}
            >
              <Type size={14} />
              Text
            </button>
            <button
              className={`btn ${activeTool === 'blur' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setActiveTool((current) => (current === 'blur' ? null : 'blur'))}
            >
              <Paintbrush2 size={14} />
              Blur
            </button>
            <button
              className={`btn ${activeTool === 'crop' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setActiveTool((current) => (current === 'crop' ? null : 'crop'))}
            >
              <Crop size={14} />
              Crop
            </button>
            <button
              className={`btn ${activeTool === 'pointer' || activeTool === null ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setActiveTool('pointer')}
            >
              <MousePointer2 size={14} />
              Pointer
            </button>
            <button className="btn btn-outline" onClick={clearAnnotations}>
              <Trash2 size={14} />
              Clear
            </button>
            <button className="btn btn-outline" onClick={deleteSelectedAnnotation} disabled={!selectedAnnotationId}>
              <Trash2 size={14} />
              Delete Selected
            </button>
          </div>
          {activeTool && activeTool !== 'pointer' ? (
            <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-dim)' }}>
              Draw mode: <b>{activeTool}</b> ({activeTool === 'text' ? 'click on image to place text' : 'drag on image to annotate'})
            </div>
          ) : (activeTool === 'pointer' || activeTool === null) && activeStep.annotations.length > 0 ? (
            <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-dim)' }}>
              Select mode: click an annotation to select it, drag to move, use the handle to resize
            </div>
          ) : null}
          <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-dim)' }}>
            {activeStep.appName ? <div>App: {activeStep.appName}</div> : null}
            {activeStep.windowTitle ? <div>Window: {activeStep.windowTitle}</div> : null}
            {activeStep.currentUrl ? <div>URL: {activeStep.currentUrl}</div> : null}
            {activeStep.clickTargetLabel ? <div>Target: {activeStep.clickTargetLabel}</div> : null}
            {typeof activeStep.x === 'number' && typeof activeStep.y === 'number' ? (
              <div>
                Position: ({Math.round(activeStep.x)}, {Math.round(activeStep.y)})
              </div>
            ) : null}
          </div>
          {guide.chapters.length > 0 && (
            <div style={{ marginTop: '12px' }}>
              <label className="settings-field" style={{ margin: 0 }}>
                <span className="settings-label" style={{ fontSize: '12px' }}>Chapter</span>
                <select
                  value={activeStep.chapterId ?? ''}
                  onChange={(e) => assignStepToChapter(activeStep.id, e.target.value || undefined)}
                  style={{ fontSize: '12px', padding: '4px 8px' }}
                >
                  <option value="">— No chapter —</option>
                  {guide.chapters.map((ch) => (
                    <option key={ch.id} value={ch.id}>{ch.title}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>

        {activeStep.screenshotPath && (
          <div className="glass-panel" style={{ padding: '20px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <button
                className={`btn ${previewMode === 'snippet' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setPreviewMode('snippet')}
                style={{ fontSize: '12px', padding: '4px 10px' }}
                disabled={!hasSnippet}
              >
                <Image size={12} />
                Snippet
              </button>
              <button
                className={`btn ${previewMode === 'fullscreen' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setPreviewMode('fullscreen')}
                style={{ fontSize: '12px', padding: '4px 10px' }}
                disabled={!hasFullscreen}
              >
                <Maximize2 size={12} />
                Full Screen
              </button>
            </div>
            <div
              ref={stageRef}
              style={{ position: 'relative', width: '100%', cursor: activeTool && activeTool !== 'pointer' ? 'crosshair' : 'default' }}
              onMouseDown={handleStageMouseDown}
              onMouseMove={handleStageMouseMove}
              onMouseUp={handleStageMouseUp}
              onMouseLeave={handleStageMouseUp}
            >
              <img
                src={imageSrc ?? `local-asset://${effectivePath}`}
                alt="Step Capture"
                style={{ width: '100%', borderRadius: '8px', display: 'block', userSelect: 'none' }}
                onLoad={() => setImageError(null)}
                onError={() => {
                  setImageError(`Could not load image: ${effectivePath}`);
                }}
              />
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'auto' }}>
                {relativeX !== null && relativeY !== null && (
                  <div
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setDraggingCursor(true);
                    }}
                    title="Drag to reposition cursor indicator"
                    style={{
                      position: 'absolute',
                      left: `calc(${relativeX}% - 14px)`,
                      top: `calc(${relativeY}% - 14px)`,
                      width: '28px',
                      height: '28px',
                      border: '3px solid var(--accent-primary)',
                      borderRadius: '50%',
                      boxShadow: '0 0 20px rgba(59, 130, 246, 0.5)',
                      cursor: 'grab',
                      zIndex: 50,
                    }}
                  />
                )}
                {textInput && (
                  <input
                    ref={textInputRef}
                    type="text"
                    value={textInput.value}
                    onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitTextInput();
                      if (e.key === 'Escape') setTextInput(null);
                      e.stopPropagation();
                    }}
                    onBlur={commitTextInput}
                    style={{
                      position: 'absolute',
                      left: textInput.x,
                      top: textInput.y,
                      minWidth: '120px',
                      fontSize: '13px',
                      padding: '3px 8px',
                      background: 'rgba(15, 23, 42, 0.85)',
                      border: '2px solid #a855f7',
                      borderRadius: '4px',
                      color: '#f8fafc',
                      outline: 'none',
                      zIndex: 100,
                    }}
                    placeholder="Type annotation text..."
                    autoFocus
                  />
                )}
                {[...activeStep.annotations, ...(draftAnnotation ? [{ ...normalizeRect(draftAnnotation), id: 'draft-annotation' }] : [])].map((annotation, index) => {
                  const sx = stageSize.width / (annotation.baseWidth || stageSize.width);
                  const sy = stageSize.height / (annotation.baseHeight || stageSize.height);
                  const scaledX = annotation.x * sx;
                  const scaledY = annotation.y * sy;
                  const scaledW = (annotation.width ?? 40) * sx;
                  const scaledH = (annotation.height ?? 24) * sy;
                  if (annotation.type === 'arrow') {
                    const x1 = scaledX;
                    const y1 = scaledY;
                    const x2 = scaledX + ((annotation.width ?? 0) * sx);
                    const y2 = scaledY + ((annotation.height ?? 0) * sy);
                    return (
                      <svg
                        key={annotation.id ?? `annotation-${index}`}
                        style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
                        onMouseDown={(event) => {
                          if (!annotation.id || annotation.id === 'draft-annotation') return;
                          event.stopPropagation();
                          setSelectedAnnotationId(annotation.id);
                          setAnnotationInteraction({
                            mode: 'move',
                            annotationId: annotation.id,
                            startClientX: event.clientX,
                            startClientY: event.clientY,
                            startX: annotation.x,
                            startY: annotation.y,
                            startWidth: annotation.width ?? 0,
                            startHeight: annotation.height ?? 0,
                          });
                        }}
                      >
                        <defs>
                          <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                            <polygon points="0 0, 8 3, 0 6" fill="#a855f7" />
                          </marker>
                        </defs>
                        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#a855f7" strokeWidth="3" markerEnd="url(#arrowhead)" />
                      </svg>
                    );
                  }
                  return (
                    <div
                      key={annotation.id ?? `annotation-${index}`}
                      style={{
                        position: 'absolute',
                        left: scaledX,
                        top: scaledY,
                        width: scaledW,
                        height: scaledH,
                        border:
                          annotation.type === 'circle'
                            ? '2px solid #f59e0b'
                            : annotation.type === 'blur'
                              ? '2px dashed #ef4444'
                              : annotation.type === 'crop'
                                ? '2px solid #22c55e'
                                : '2px solid #a855f7',
                        borderRadius: annotation.type === 'circle' ? '999px' : '4px',
                        color: '#f8fafc',
                        background:
                          annotation.type === 'text'
                            ? 'rgba(15, 23, 42, 0.75)'
                            : annotation.type === 'blur'
                              ? 'rgba(255,255,255,0.14)'
                              : 'transparent',
                        backdropFilter: annotation.type === 'blur' ? 'blur(4px)' : undefined,
                        WebkitBackdropFilter: annotation.type === 'blur' ? 'blur(4px)' : undefined,
                        fontSize: '12px',
                        padding: annotation.type === 'text' ? '2px 6px' : undefined,
                        pointerEvents: 'auto',
                        boxShadow: selectedAnnotationId === annotation.id ? '0 0 0 2px rgba(59,130,246,0.6)' : undefined,
                      }}
                      onMouseDown={(event) => {
                        if (!annotation.id || annotation.id === 'draft-annotation') return;
                        event.stopPropagation();
                        setSelectedAnnotationId(annotation.id);
                        setAnnotationInteraction({
                          mode: 'move',
                          annotationId: annotation.id,
                          startClientX: event.clientX,
                          startClientY: event.clientY,
                          startX: annotation.x,
                          startY: annotation.y,
                          startWidth: annotation.width ?? 0,
                          startHeight: annotation.height ?? 0,
                        });
                      }}
                    >
                      {annotation.text}
                      {annotation.id !== 'draft-annotation' && annotation.id === selectedAnnotationId ? (
                        <div
                          style={{
                            position: 'absolute',
                            right: -6,
                            bottom: -6,
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            background: '#3b82f6',
                            cursor: 'nwse-resize',
                          }}
                          onMouseDown={(event) => {
                            event.stopPropagation();
                            setAnnotationInteraction({
                              mode: 'resize',
                              annotationId: annotation.id,
                              startClientX: event.clientX,
                              startClientY: event.clientY,
                              startX: annotation.x,
                              startY: annotation.y,
                              startWidth: annotation.width ?? 0,
                              startHeight: annotation.height ?? 0,
                            });
                          }}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
            {imageError ? <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--danger)' }}>{imageError}</div> : null}
          </div>
        )}
      </div>
    </div>
  );
};
