# SignBridge UI — Premium Playful Glassmorphism

The extension uses one shared lavender glass design system across the popup and the separate captions window. The
visual direction is premium and friendly, not a dashboard template.

## Palette

| Token | Value | Use |
| --- | --- | --- |
| Midnight violet | `#17132F` | Base background |
| Deep purple | `#241B48` | Background depth |
| Primary lavender | `#B8A4F5` | Primary actions, highlights, live indicators |
| Periwinkle | `#8589E8` | Gradient partner, secondary glow |
| Soft lilac | `#E9E1FF` | Focus rings, edge highlights, selected text |
| White | `#FFFFFF` | Caption text and primary content |

Supporting colours: muted lilac `#CEC6E9`, subtle `#9E93BF`, rose `#FFB7C8` (errors / Stop), amber `#FFD7A3`
(experimental / reconnecting), mint `#A7F3D0` (success).

## Glass recipe

```css
background:
  linear-gradient(155deg, rgba(255,255,255,.105), rgba(255,255,255,.035) 62%, rgba(255,255,255,.015));
border: 1px solid rgba(233,225,255,.145);
border-radius: 20px;
box-shadow: 0 18px 48px rgba(5,2,18,.46),
            inset 0 1px 0 rgba(255,255,255,.13);
backdrop-filter: blur(20px) saturate(135%);
```

- A 1px lavender gradient line at the top of each card gives the edge highlight.
- Depth comes from translucent layers, ambient orbs and soft shadows — not bright neon.
- Primary buttons use a restrained lavender → periwinkle gradient with midnight text.
- Secondary actions are translucent glass; Stop is a soft rose, never a harsh red.

## Typography and spacing

- System sans-serif stack (`ui-sans-serif`, `system-ui`, `Segoe UI`, Roboto, Helvetica, Arial).
- Eyebrows: 8.5–9px, 800 weight, uppercase, 0.12–0.14em tracking.
- Headings: 15–19px, 750–800 weight, tight tracking.
- Body: 10–13px in the popup; captions 16–26px depending on text size.
- Radii: 20px cards, 12–14px buttons/chips, pill for status and badges.
- Popup width fixed at **380px**; content height is capped by Chrome's 600px popup limit. Live fits at 600px; Message
  and Live Communication are shorter. No horizontal scrolling.

## Components

- `src/styles/tokens.css`: palette, radii, shadows, glass tokens, focus ring, reduced-motion rules, waveform keyframes.
- `src/ui/icons.jsx`: dependency-free inline line icons.
- `src/ui/Waveform.jsx`: CSS-only five-bar capture waveform.
- `src/popup/App.jsx`: shared header, glass tab bar, Live screen.
- `src/popup/CameraPreview.jsx`: off / loading / live / offline / error states with clear empty and retry panels.
- `src/popup/ConfidenceMeter.jsx`: confidence bar, threshold marker, accessible progress value.
- `src/popup/Composer.jsx`: spacious editor, character counter, edit chips, Copy/Speak/Stop speaking, Insert.
- `src/popup/MeetPanel.jsx`: Live Communication consent, target tab, active capture, universal platform wording.
- `src/captions/CaptionsApp.jsx`: translucent header, audio capture banner, source strip, readable transcript,
  interim/final distinction, three text sizes, Stop/Clear/Close.
- `src/captions/ErrorBoundary.jsx`: visible fallback if the captions UI fails.

## Motion

- Panel entrance: 320ms fade/translate.
- Letter recognition: short pop animation on the letter tile.
- Capture: pulsing status dot and five-bar waveform.
- Buttons: 140–180ms hover/press.
- Caption lines: 260ms fade/translate.
- All animation is CSS-only. `prefers-reduced-motion: reduce` sets animation/transition duration to near zero and
  freezes the waveform at a readable height.

## Accessibility

- Visible `3px` soft-lilac focus ring.
- Buttons are at least 32px high in compact rows and 38–44px for primary actions.
- Status changes use `role="status"` / `aria-live="polite"`; errors use `role="alert"`.
- The transcript is a labelled `role="log"` live region.
- Icons are `aria-hidden`; every icon-only button has an accessible name.
- Text contrast uses white/muted-lilac on midnight glass. The experimental model label stays visible.
- The captions window supports normal, large and extra-large text without changing capture behaviour.

## Screen principles

- **Live:** camera preview first, then one prominent recognition result. Start/Stop recognition remain obvious.
- **Message:** the editor is the largest element; destructive Clear is visually distinct; Insert is primary.
- **Live Communication:** universal “browser audio captions” language. Google Meet, Zoom and Microsoft Teams are
  examples only; compatibility is explicitly not claimed. Consent is required before Start.
- **Captions:** readability over decoration. The capture indicator and Stop action remain visible; interim text is
  italic lilac, final text is white and larger.
