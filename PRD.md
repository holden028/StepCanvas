# StepCanvas
## Full Product Requirements Document (PRD)

Version: 1.0
Status: Pre-Development
License Target: MIT

### 1. Product Definition
#### 1.1 Product Name
StepCanvas

#### 1.2 Product Type
Cross-platform Electron desktop application

#### 1.3 Purpose
Automatically generate step-by-step documentation from recorded on-screen activity, with post-recording editing and multi-format export.

#### 1.4 Key Principles
- Local-first
- Privacy-focused
- Fully open-source
- No forced cloud services
- Professional export quality
- Extensible architecture

### 2. Target Users
**Primary**
- Engineers creating SOPs
- Trainers building walkthroughs
- SMEs documenting internal tools
- Developers writing technical guides

**Secondary**
- Compliance teams
- IT departments
- Educators

### 3. In Scope
- Mouse + keyboard recording
- Screenshot capture
- Step generation
- Mandatory post-recording editing
- Annotation tools
- Export to: Markdown, HTML, PDF, DOCX, PPTX
- Local storage only
- macOS + Windows builds

### 4. Out of Scope (v1.0)
- Cloud sync
- Real-time collaboration
- AI step naming
- OCR button detection
- Browser extension
- Linux support
- Video recording

### 5. User Journey
#### 5.1 Recording Flow
1. User clicks “New Recording”
2. Permission check
3. Recording overlay appears
4. User performs workflow
5. User clicks “Stop”
6. Step Review Mode launches
7. User renames steps
8. User exports

### 6. Feature Requirements (Detailed)
#### 6.1 Recording Engine
**FR-001: Global Input Capture**
Must capture:
- Mouse click position
- Mouse button used
- Active window title
- Timestamp
- Optional keystrokes

*Acceptance Criteria*
- Click event captured within 50ms
- Screenshot corresponds to click location
- Window title stored accurately

#### 6.2 Screenshot Engine
**FR-002: Screenshot Capture**
Options:
- Full-screen
- Region around click (default 800x600)
- Adjustable resolution

*Acceptance Criteria*
- Screenshot saved locally
- Highlight drawn around click
- Image <500KB default size

#### 6.3 Step Builder
**FR-003: Step Object Creation**
Each event becomes a Step object.
Auto-generated title rules:
- Click → “Click [Window Title]”
- Type → “Enter text”

#### 6.4 Mandatory Step Review Mode
**FR-004: Editable Review Panel**
Requirements:
- All steps must be editable
- Title required
- Description optional
- Drag-and-drop reorder
- Delete step
- Add manual step

*Acceptance Criteria*
- No export allowed until review completed
- Empty titles blocked
- Reordering updates export order

#### 6.5 Annotation System
**FR-005**
Tools: Arrow, Circle, Text overlay, Blur, Crop
Annotations saved as non-destructive layers.

### 7. Export Specifications (Detailed)
#### 7.1 Markdown Export
Format:
```markdown
# Guide Title

## Step 1 – Open Settings
![Step 1](images/step1.png)

Description text
```
Images stored in: `/images`

#### 7.2 HTML Export
Requirements: Single file, Embedded CSS, Responsive layout, Optional embedded base64 images

#### 7.3 PDF Export
Layout Requirements: Title page, Step per section, Page numbers, Header/footer, Custom logo support
Rendering Method: HTML → Puppeteer → PDF
Acceptance: 50-step guide renders <10s, No broken images, Proper pagination

#### 7.4 DOCX Export
Requirements: Fully editable, Structured headings, Images inline, Compatible with Word 365
Heading structure: H1 → Guide title, H2 → Step title

#### 7.5 PPTX Export
Requirements: Slide 1 → Title, Slide per step, Screenshot centered, Title at top, Description text box optional
Options: 1 step per slide, 2 steps per slide

### 8. Settings Panel
Must include: Screenshot resolution, Mask typing toggle, Image compression level, Default export format, Theme selection, Exclusion list for apps, Auto-numbering toggle

### 9. Permissions Model
**macOS**: Requires Screen recording permission, Accessibility permission. Clear onboarding modal required.
**Windows**: Requires Desktop capture permission, Global hook access

### 10. Security Model
- No automatic outbound requests
- No telemetry by default
- Visible recording indicator
- Exclusion list capability
- Optional keystroke masking
- Threat considerations: Accidental password capture, Recording sensitive applications, File system write failures

### 11. Performance Targets
| Metric | Target |
|---|---|
| Idle CPU | <5% |
| Recording CPU | <12% |
| 100-step guide memory | <500MB |
| Screenshot capture latency | <100ms |

### 12. File Storage Structure
Local guide storage:
```
/Documents/StepCanvas/
   /GuideName/
       guide.json
       /images/
```

### 13. Technical Stack
Electron, React, TypeScript, Zustand, iohook, sharp, puppeteer, docx, pptxgenjs

### 14. Testing Strategy
- Unit Tests: Step builder, Export formatting, File writing
- Integration Tests: Recording session, Export generation, Permission flow
- Manual QA: macOS Intel, macOS ARM, Windows 10, Windows 11

### 15. Versioning Plan
- v0.1 – Internal alpha
- v0.5 – Public beta
- v1.0 – Stable GitHub release

### 16. Success Criteria
Stable cross-platform builds, 0 crash reports in first 30 days, Community contributions initiated, Functional exports across formats

### 17. Future Roadmap
- v1.1: Template library, Custom themes, Dark mode UI
- v2.0: Plugin system, Local AI enhancements, Git integration
