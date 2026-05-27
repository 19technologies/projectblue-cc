# Project Blue Room UI Redesign — PRD

**Date:** May 2026  
**Status:** Implemented (Commit b4100c6)  
**Reference Design:** Beatsync.gg (persistent three-column desktop layout)

---

## Executive Summary

Redesign the Project Blue room UI to match Beatsync.gg's three-column persistent layout on desktop (≥768px), while preserving the mobile tab layout (Session/Media/Chat) for narrower screens (<768px). Additionally, remove accent color from non-critical UI elements to create a quieter, more cohesive visual hierarchy where "good design is not noticed."

---

## Requirements

### 1. Desktop Layout (≥768px) — Three-Column Persistent View

**Structure:**
```
┌─────────────────────────────────────────────────────┐
│  Header: WordMark · room code · connection status   │
├──────────────┬──────────────────────┬───────────────┤
│  LEFT        │  CENTER (flex: 1)    │  RIGHT        │
│  260px       │                      │  280px        │
│              │                      │               │
│  • People    │  • Player stage      │  • Chat       │
│    list      │  (YT or audio card)  │    (scrollable│
│  • Add       │  • Queue list        │    messages + │
│    controls  │  (with drag/reorder) │    input)     │
│              │                      │               │
│  • Room hint │                      │               │
└──────────────┴──────────────────────┴───────────────┘
│  Transport bar (full-width strip)                    │
│  [Seek bar — audio only] [Play/Pause] [Skip] [Vol]  │
└─────────────────────────────────────────────────────┘
```

**Key Specifications:**
- Left sidebar (260px): vertical people list + upload controls (file picker + YouTube form) + guest toggle (if host) + room hint
- Center column (flex: 1): player stage + queue list with drag-and-drop
- Right sidebar (280px): chat with scrollable message history and input form
- Transport bar: full-width strip at the bottom with playback controls
- Separators: hairline borders between columns
- No tab switching on desktop — all three columns visible simultaneously

### 2. Mobile Layout (<768px) — Three-Tab View

**Unchanged.** Keep the existing mobile tab bar with Session / Media / Chat tabs (with icons: Headphones / ListMusic / MessageCircle).

- Fixed-bottom tab bar with icon + label on mobile
- Session tab: player stage + transport controls + people chips + room hint
- Media tab: queue list + add controls (+ button inline)
- Chat tab: chat panel with full scrollable area
- Mini-player: shown above tab bar when playing away from session tab

### 3. Color Restraint — "Good Design is Not Noticed"

**Principle:** Accent color appears in ≤3 distinct spots only. Everything else uses neutral tokens.

**Accent color reserved for:**
1. Live room indicator (`.pb-room-dot.is-live`) — **keep**
2. Active tab indicator (mobile only) — **keep**

**Everything else → neutral tokens:**
- Track thumbnails: `background: var(--pb-hairline)`, no color distinction between audio/YouTube
- Track badges: `color: var(--pb-text-faint)` (no colored variant)
- Playing bars: `background: var(--pb-text-soft)` (was blue, now muted)
- People chip borders: `var(--pb-hairline)` for all (was blue for host, now all the same)
- Plus button: `border: 1px solid var(--pb-hairline)`, `color: var(--pb-text-soft)` (was ink, now soft gray)
- All text labels, timestamps, indices: `var(--pb-text-faint)` (25% opacity)

**Result:** Neutral, quiet UI where the content (music, people, messages) stands out, not the chrome.

### 4. Responsive Sizing

**Use `rem` for all dimensions.** Avoid hardcoded `px` except for border widths (1px, 2px).

**Breakpoints:**
- Desktop (≥768px): three-column layout
- Tablet/Mobile (<768px): tab layout
- Large screens (≥1200px): slightly wider sidebars (17.5rem left, 19rem right)

---

## Implementation Details

### Files Changed

#### 1. `app/src/components/Room.tsx`

**Changes:**
- Re-enable `useIsDesktop()` hook (already existed, was unused)
- Split `mediaPanel` JSX variable into reusable pieces:
  - `queueRows`: queue list with drag-drop, empty state, track items
  - `addControls`: + button, file picker, YouTube form, guest toggle
  - `mediaPanel` (mobile): combination of `queueRows` + `addControls`
- Replace return block with `isDesktop` ternary:
  - **Desktop branch:** three-column `.pb-room-body` + `.pb-room-transport` bar
  - **Mobile branch:** existing tab layout with tabbar + tab panels
- Ensure `fileInput` is always in DOM
- Update `autoplayBlocked` condition to show on desktop or when `activeTab === "session"` on mobile

**Key JSX Structure (Desktop):**
```jsx
{isDesktop ? (
  <>
    <div className="pb-room-body">
      <aside className="pb-room-left">
        {/* People list */}
        {addControls && /* Upload controls */}
        {/* Room hint */}
      </aside>
      <main className="pb-room-center">
        <div className="pb-room-stage">{stageContent}</div>
        {queueRows}
      </main>
      <aside className="pb-room-right">
        {chatPanel}
      </aside>
    </div>
    <div className="pb-room-transport">
      {transportRow}
    </div>
  </>
) : (
  /* Mobile tab layout — unchanged */
)}
```

#### 2. `app/src/app/globals.css`

**Layout CSS:**
```css
.pb-room-body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  border-top: 1px solid var(--pb-hairline);
}

.pb-room-left {
  width: 16rem;
  flex-shrink: 0;
  border-right: 1px solid var(--pb-hairline);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 1rem;
}

.pb-room-center {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 1.25rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.pb-room-right {
  width: 17.5rem;
  flex-shrink: 0;
  border-left: 1px solid var(--pb-hairline);
  display: flex;
  flex-direction: column;
}

.pb-room-transport {
  border-top: 1px solid var(--pb-hairline);
  padding: 0.6rem 1.5rem;
  flex-shrink: 0;
}

@media (min-width: 1200px) {
  .pb-room-left  { width: 17.5rem; }
  .pb-room-right { width: 19rem; }
}
```

**Color Neutralization:**
- `.pb-playing-bars span`: `background: var(--pb-text-soft)` (was accent blue)
- `.pb-track-thumb`: `background: var(--pb-hairline)`, `color: var(--pb-text-soft)` (no color distinction)
- `.pb-track-badge`: `color: var(--pb-text-faint)` (no colored variant)
- `.pb-people-chip`: `border: 1px solid var(--pb-hairline)` for all (removed accent border on host)
- `.pb-plus-btn`: `border: 1px solid var(--pb-hairline)`, `color: var(--pb-text-soft)` (removed ink styling)

---

## Testing Checklist

- [ ] No TypeScript errors: `npx tsc --noEmit` returns zero
- [ ] Build succeeds: `npm run build` completes clean
- [ ] At ≥768px viewport:
  - [ ] Three columns all visible simultaneously (no tabbar)
  - [ ] Left sidebar shows people list + upload controls
  - [ ] Center shows player stage + queue
  - [ ] Right sidebar shows chat with scrollable messages
  - [ ] Transport bar at bottom
  - [ ] Queue drag-and-drop works
  - [ ] Chat input sends messages
- [ ] At <768px viewport:
  - [ ] Session/Media/Chat tabs visible in fixed-bottom bar
  - [ ] Tabs are interactive and panels switch
  - [ ] Mini-player shows when playing away from session tab
- [ ] Accent color appears in ≤3 spots when scanning UI:
  - [ ] Live room dot (if room connected)
  - [ ] Active tab underline (mobile)
  - [ ] No accent on: track thumbnails, badges, playing bars, chip borders, + button
- [ ] All sizing is relative (`rem`, `em`, percentages) — no hardcoded viewport-dependent `px` values

---

## Design Tokens Reference

```css
--pb-bg          /* Paper blue background */
--pb-text        /* Near-black body text */
--pb-text-soft   /* 70% opacity text (labels, subtitles) */
--pb-text-faint  /* 25% opacity text (timestamps, badges) */
--pb-ink         /* Dark navy (buttons, borders) */
--pb-on-ink      /* White text on ink background */
--pb-accent      /* Brand blue — used sparingly (≤3 spots) */
--pb-hairline    /* 15% opacity separator lines */
--pb-muted       /* Neutral mid-gray */
```

---

## Rationale

**Why three columns on desktop?**  
Beatsync.gg's persistent three-panel layout lets users see the entire session context at once without tab switching — people, now playing, and chat are all glanceable. This matches how desktop users expect to consume information.

**Why keep tabs on mobile?**  
Narrow screens can't accommodate three columns. Tabs are the standard mobile UX pattern and match the Session/Media/Chat conceptual structure.

**Why neutral colors?**  
Accent colors are for emphasis. Overusing them (track thumbs, badges, borders, bars, buttons, chips) creates visual noise. Neutralizing everything except 2–3 critical indicators creates a calm, content-focused UI where the music and people are the stars, not the interface.

---

## Success Criteria

- Desktop users see Beatsync.gg-style three-column layout with no tab switching
- Mobile users see Session/Media/Chat tabs (unchanged from current design)
- UI scans as quiet and neutral — accent color barely noticeable
- All features (queue drag, chat, upload, playback) work identically in new layout
- Zero TypeScript errors, clean build, no console warnings
