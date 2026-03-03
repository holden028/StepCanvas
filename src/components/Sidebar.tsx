/* eslint-disable react-hooks/refs */
import React from 'react';
import { useStore } from '../store/useStore';
import { MousePointer2, Type, Trash2, Copy, PlusSquare, RefreshCw, Settings, FileText, BookOpen, X, Pencil, GripVertical } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SettingsModal } from './SettingsPanel';
import type { RecaptureStrategy } from '../../shared/types';

type SidebarItem = { kind: 'chapter'; id: string } | { kind: 'step'; id: string; stepIndex: number };

function buildSidebarItems(guide: ReturnType<typeof useStore.getState>['guide']): SidebarItem[] {
  const items: SidebarItem[] = [];
  const ungrouped = guide.steps.filter((s) => !s.chapterId);
  let stepCounter = 0;

  for (const step of ungrouped) {
    items.push({ kind: 'step', id: step.id, stepIndex: stepCounter++ });
  }

  for (const ch of guide.chapters) {
    items.push({ kind: 'chapter', id: ch.id });
    const chSteps = guide.steps.filter((s) => s.chapterId === ch.id);
    for (const step of chSteps) {
      items.push({ kind: 'step', id: step.id, stepIndex: stepCounter++ });
    }
  }

  return items;
}

const SortableStepCard: React.FC<{ stepId: string; displayNumber: number }> = ({ stepId, displayNumber }) => {
  const { guide, activeStepId, setActiveStep, removeStep, duplicateStep, addManualStep, isRecording } = useStore();
  const step = guide.steps.find((item) => item.id === stepId);
  const sortable = useSortable({ id: stepId });
  if (!step) return null;

  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };

  const handleRecapture = (e: React.MouseEvent) => {
    e.stopPropagation();
    const strategy: RecaptureStrategy = 'single';
    startRecapture(stepId, strategy);
  };

  const startRecapture = async (targetStepId: string, strategy: RecaptureStrategy) => {
    const store = useStore.getState();
    store.setRecaptureTarget({ stepId: targetStepId, strategy });
    if (!store.isRecording) {
      const startResult = (await window.ipcRenderer.invoke('start-recording', store.guide.settings)) as
        | { ok: true }
        | { ok: false; reason?: string };
      if (startResult?.ok) {
        store.setRecording(true);
        store.setPaused(false);
      } else {
        store.setRecaptureTarget(null);
        window.alert(`Recording failed to start. ${startResult?.reason ?? ''}`.trim());
      }
    }
  };

  return (
    <motion.div
      ref={sortable.setNodeRef}
      style={style}
      {...sortable.attributes}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className={`step-card ${activeStepId === step.id ? 'active' : ''}`}
      onClick={() => setActiveStep(step.id)}
    >
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <div
          {...sortable.listeners}
          style={{ cursor: 'grab', color: 'var(--text-dim)', flexShrink: 0, display: 'flex', alignItems: 'center', padding: '2px' }}
          title="Drag to reorder"
        >
          <GripVertical size={14} />
        </div>
        <div
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            background: step.type === 'click' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(168, 85, 247, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: step.type === 'click' ? 'var(--accent-primary)' : '#a855f7',
            fontSize: '11px',
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {displayNumber}
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {step.title}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {step.type === 'click' ? <MousePointer2 size={10} /> : <Type size={10} />}
            {new Date(step.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '4px', marginTop: '8px', paddingLeft: '24px' }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            const index = guide.steps.findIndex((s) => s.id === step.id);
            addManualStep(index + 1);
          }}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '4px' }}
          title="Insert step below"
        >
          <PlusSquare size={14} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); duplicateStep(step.id); }}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '4px' }}
          title="Duplicate step"
        >
          <Copy size={14} />
        </button>
        <button
          onClick={handleRecapture}
          style={{ background: 'transparent', border: 'none', color: isRecording ? 'var(--text-dim)' : '#a855f7', cursor: 'pointer', padding: '4px', opacity: isRecording ? 0.4 : 1 }}
          title="Re-capture this step"
          disabled={isRecording}
        >
          <RefreshCw size={14} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); removeStep(step.id); }}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '4px' }}
          title="Delete step"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </motion.div>
  );
};

const SortableChapterHeader: React.FC<{ chapterId: string }> = ({ chapterId }) => {
  const { guide, updateChapter, removeChapter } = useStore();
  const chapter = guide.chapters.find((c) => c.id === chapterId);
  const sortable = useSortable({ id: chapterId });
  const [editing, setEditing] = React.useState(false);
  const [editTitle, setEditTitle] = React.useState('');

  if (!chapter) return null;

  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };

  return (
    <div
      ref={sortable.setNodeRef}
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '10px 12px 6px 12px',
        marginTop: '6px',
        borderTop: '1px solid var(--border-glass)',
      }}
    >
      <div
        {...sortable.attributes}
        {...sortable.listeners}
        style={{ cursor: 'grab', color: 'var(--text-dim)', flexShrink: 0, display: 'flex', alignItems: 'center', padding: '2px' }}
        title="Drag to reorder chapter"
      >
        <GripVertical size={13} />
      </div>
      <BookOpen size={13} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
      {editing ? (
        <input
          autoFocus
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onBlur={() => { updateChapter(chapterId, { title: editTitle || chapter.title }); setEditing(false); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { updateChapter(chapterId, { title: editTitle || chapter.title }); setEditing(false); }
            if (e.key === 'Escape') setEditing(false);
          }}
          style={{
            flex: 1,
            fontSize: '12px',
            fontWeight: 700,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid var(--accent-primary)',
            borderRadius: '4px',
            padding: '2px 6px',
            color: 'var(--text-primary)',
          }}
        />
      ) : (
        <span
          style={{
            flex: 1,
            fontSize: '12px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: 'var(--accent-primary)',
            cursor: 'pointer',
          }}
          onDoubleClick={() => { setEditTitle(chapter.title); setEditing(true); }}
        >
          {chapter.title}
        </span>
      )}
      {!editing && (
        <>
          <button
            onClick={() => { setEditTitle(chapter.title); setEditing(true); }}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '2px' }}
            title="Rename chapter"
          >
            <Pencil size={11} />
          </button>
          <button
            onClick={() => removeChapter(chapterId)}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '2px' }}
            title="Remove chapter (steps will be ungrouped)"
          >
            <X size={11} />
          </button>
        </>
      )}
    </div>
  );
};

export const Sidebar: React.FC = () => {
  const { guide, addManualStep, addChapter, activeView, setActiveView, setActiveStep, applySidebarOrder } = useStore();
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const isCoverPageActive = activeView?.type === 'coverPage';

  const sidebarItems = React.useMemo(() => buildSidebarItems(guide), [guide]);
  const sortableIds = React.useMemo(() => sidebarItems.map((item) => item.id), [sidebarItems]);

  const [dragActiveId, setDragActiveId] = React.useState<string | null>(null);

  const onDragStart = (event: DragStartEvent) => {
    setDragActiveId(event.active.id as string);
  };

  const onDragEnd = (event: DragEndEvent) => {
    setDragActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIdx = sortableIds.indexOf(active.id as string);
    const newIdx = sortableIds.indexOf(over.id as string);
    if (oldIdx < 0 || newIdx < 0) return;

    const reordered = arrayMove(sortableIds, oldIdx, newIdx);
    applySidebarOrder(reordered);
  };

  const dragItem = dragActiveId ? sidebarItems.find((i) => i.id === dragActiveId) : null;
  const dragChapter = dragItem?.kind === 'chapter' ? guide.chapters.find((c) => c.id === dragItem.id) : null;
  const dragStep = dragItem?.kind === 'step' ? guide.steps.find((s) => s.id === dragItem.id) : null;

  return (
    <div className="sidebar">
      <div style={{ padding: '20px', borderBottom: '1px solid var(--border-glass)' }}>
        <h2 style={{ fontSize: '14px', margin: 0, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-dim)' }}>
          Captured Steps ({guide.steps.length})
        </h2>
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <button className="btn btn-outline" onClick={() => addManualStep()} style={{ flex: 1, justifyContent: 'center' }}>
            <PlusSquare size={14} />
            Add Step
          </button>
          <button className="btn btn-outline" onClick={() => addChapter()} style={{ flex: 1, justifyContent: 'center' }}>
            <BookOpen size={14} />
            Add Chapter
          </button>
        </div>
        <div style={{ marginTop: '8px' }}>
          <button
            className={`btn ${isCoverPageActive ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => {
              if (isCoverPageActive) {
                if (guide.steps[0]) setActiveStep(guide.steps[0].id);
                else setActiveView(null);
              } else {
                setActiveView({ type: 'coverPage' });
              }
            }}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            <FileText size={14} />
            Cover Page
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            <AnimatePresence>
              {sidebarItems.map((item) => {
                if (item.kind === 'chapter') {
                  return <SortableChapterHeader key={item.id} chapterId={item.id} />;
                }
                return <SortableStepCard key={item.id} stepId={item.id} displayNumber={item.stepIndex + 1} />;
              })}
            </AnimatePresence>
          </SortableContext>

          <DragOverlay>
            {dragChapter && (
              <div style={{
                padding: '8px 14px',
                background: 'var(--bg-glass)',
                border: '1px solid var(--accent-primary)',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--accent-primary)',
                textTransform: 'uppercase',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
              }}>
                <BookOpen size={13} />
                {dragChapter.title}
              </div>
            )}
            {dragStep && (
              <div style={{
                padding: '10px 14px',
                background: 'var(--bg-glass)',
                border: '1px solid var(--border-glass)',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                maxWidth: '260px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {dragStep.title}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      <button className="settings-gear-btn" onClick={() => setSettingsOpen(true)}>
        <Settings size={16} />
        Settings
      </button>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
};
