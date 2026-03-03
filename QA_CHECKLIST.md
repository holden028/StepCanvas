# StepCanvas QA Checklist (Stabilization Pass)

## Test Setup

- Build and launch latest app build.
- Use a fresh guide folder for this run.
- Target at least one realistic workflow with 20-50 steps.
- Record OS and app version at start.

## 1) Permissions and Recorder Start

- [ ] App shows permission state clearly on first launch.
- [ ] "Open System Settings" flow works without app lockup.
- [ ] Start/Stop recording toggles correctly.
- [ ] Visible recording indicator appears while recording.

Pass criteria:
- No crashes.
- Recorder starts within 2 seconds after clicking start.

## 2) Capture Quality

- [ ] Click events create steps in order.
- [ ] Repeated rapid clicks do not create obvious duplicates.
- [ ] Typing creates grouped text/keypress steps as expected.
- [ ] Screenshot crops center around click target.
- [ ] Multi-monitor (if available): captures come from correct display.

Pass criteria:
- 30-step flow has stable ordering.
- No major coordinate mismatch in screenshot highlight placement.

## 3) Step Review and Editing

- [ ] Select step and edit title/description.
- [ ] Add manual step from sidebar.
- [ ] Duplicate step.
- [ ] Delete step.
- [ ] Reorder steps via drag-and-drop.
- [ ] Keyboard navigation (up/down) changes active step.

Pass criteria:
- All edits are reflected immediately.
- No UI freeze with 100 steps loaded.

## 4) Annotation Basics

- [ ] Add arrow annotation.
- [ ] Add circle annotation.
- [ ] Add text annotation.
- [ ] Add blur annotation.
- [ ] Add crop annotation.

Pass criteria:
- Annotation overlays render after save/reload.

## 5) Persistence and Recovery

- [ ] Save guide to folder.
- [ ] Close app and reopen same guide.
- [ ] Verify titles/descriptions/order preserved.
- [ ] Verify images still render.
- [ ] Verify autosave captured recent edits.

Pass criteria:
- `guide.json` exists with expected step count.
- `images` folder contains referenced screenshots.

## 6) Export Validation

- [ ] Export Markdown bundle.
- [ ] Export HTML.
- [ ] Export PDF.
- [ ] Export DOCX.
- [ ] Export PPTX.

Pass criteria:
- Files are created successfully.
- No broken images in outputs.
- DOCX opens editable in Word.
- PPTX opens with per-step slides intact.

## 7) Privacy and Settings

- [ ] Toggle keystroke masking on/off and verify output behavior.
- [ ] Change screenshot width/height/quality and verify effect.
- [ ] Auto-numbering setting does not break title editing flow.

Pass criteria:
- Setting changes persist for current guide and affect new captures.

## 8) Platform Pass (macOS + Windows)

- [ ] Run sections 1-7 on macOS.
- [ ] Run sections 1-7 on Windows.
- [ ] Compare step ordering and export integrity between platforms.

Pass criteria:
- No platform-specific blocker in core workflow.

## 9) AI Enrichment (BYOK OpenRouter)

- [ ] Configure OpenRouter API key in Settings panel.
- [ ] Enable "AI enrichment" toggle.
- [ ] Record a short browser flow (new tab, address bar, navigate, click links).
- [ ] Verify AI proposals appear with purple badge and confidence %.
- [ ] Accept a single proposal — title/description updates immediately.
- [ ] Reject a proposal — step keeps original text.
- [ ] Click "Accept All High Conf." — all ready proposals above threshold are applied.
- [ ] Manual "Enrich with AI" button works on a step without a proposal.
- [ ] Enable "Local-only mode" and verify no cloud calls are made (proposals show "Local-only mode" error).
- [ ] Verify sensitive fields (password/OTP) are not sent to AI (redacted).

Pass criteria:
- AI enrichment never blocks capture or export.
- At least 3/5 browser steps auto-labelled correctly (e.g. "Click 'Site administration'").
- Proposals visible within 10 seconds of step capture.

## 10) OCR Verification

- [ ] Record a step with visible text on screen (e.g. web page with headings).
- [ ] Check that local OCR extracts text (visible in proposal/debug metadata).
- [ ] With AI disabled, verify local OCR still runs and populates ocrResult on step.
- [ ] With AI enabled and low local OCR confidence, verify OpenRouter vision fallback triggers.

Pass criteria:
- OCR text is available for at least 80% of steps with screenshots.

## 11) Branding & Cover Page

- [ ] Set brand name, author name, author role, primary colour in Settings.
- [ ] Upload a brand logo via the logo picker.
- [ ] Enable "Include cover page" toggle.
- [ ] Export PDF — verify cover page with logo, title, author, date, purpose summary.
- [ ] Export DOCX — verify cover page section.
- [ ] Export PPTX — verify branded title slide with colour.
- [ ] Export HTML — verify cover page section and branded heading colours.
- [ ] Export Markdown — verify cover metadata block.
- [ ] Disable cover page — verify exports have no cover section.

Pass criteria:
- All export formats reflect branding settings.
- Exports without branding are not broken.

## 12) End-to-End Scribe-Like Flow

- [ ] Open a new tab in Chrome.
- [ ] Navigate to a web application (e.g. moodle.nanofibre.co.uk).
- [ ] Click through 5+ pages/buttons.
- [ ] Type in a search box.
- [ ] Stop recording.
- [ ] Review steps — verify titles say things like "Click 'Site administration'", "Navigate to moodle.nanofibre.co.uk/my/", "Type 'search term'".
- [ ] With AI enabled, accept proposals for any generic steps.
- [ ] Export branded PDF.
- [ ] Verify the PDF reads as a professional step-by-step guide with <= 2 manual edits needed.

Pass criteria:
- Guide is usable as-is or with minimal edits.
- Screenshots present for every step.
- No garbled text or generic "Click in Web Browser" for identifiable actions.

## Bug Template (for each failure)

- Title:
- OS/Version:
- Build/Commit:
- Steps to reproduce:
- Expected:
- Actual:
- Severity (Blocker/High/Medium/Low):
- Attachments (screenshot/export file/log):

