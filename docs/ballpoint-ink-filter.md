# Ballpoint Ink Filter

A reusable SVG filter that applies a handwritten, pen-on-paper aesthetic to text elements throughout the application.

## Overview

The ballpoint ink filter simulates the organic texture of ballpoint pen writing on paper, including:
- **Paper grain texture**: Subtle turbulence mimics paper tooth guiding ink flow
- **Pressure wobble**: Gentle displacement creates natural hand movement variation
- **Ink feathering**: Soft edges simulate ink absorption into paper fibers
- **Stroke density variation**: Controlled alpha shaping keeps text legible while adding character

## Files

- **`/assets/filters/ballpoint-ink.svg`** - Standalone SVG filter (can be referenced externally)
- **`/assets/ballpoint-ink-component.html`** - Inline HTML snippet for embedding in pages
- **`/assets/ballpoint-ink.css`** - CSS utilities for applying the filter
- **`/rv-app/public/assets/filters/ballpoint-ink.svg`** - Copy for rv-app

## Usage

### Method 1: Inline SVG Filter (Recommended)

Include the filter definition at the top of your HTML body:

```html
<svg width="0" height="0" style="position: absolute;">
  <defs>
    <filter id="ballpoint-ink" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.25 0.35" numOctaves="2" seed="11" result="paperGrain" />
      <feComponentTransfer in="paperGrain" result="inkFlow">
        <feFuncR type="table" tableValues="0.48 0.52 0.56" />
        <feFuncG type="table" tableValues="0.48 0.52 0.56" />
        <feFuncB type="table" tableValues="0.48 0.52 0.56" />
      </feComponentTransfer>
      <feDisplacementMap in="SourceGraphic" in2="inkFlow" scale="0.65" xChannelSelector="R" yChannelSelector="G" result="waveredInk" />
      <feGaussianBlur in="waveredInk" stdDeviation="0.35" result="featheredInk" />
      <feComponentTransfer in="featheredInk" result="inked">
        <feFuncR type="gamma" amplitude="0.98" exponent="0.9" offset="0" />
        <feFuncG type="gamma" amplitude="0.98" exponent="0.9" offset="0" />
        <feFuncB type="gamma" amplitude="0.98" exponent="0.9" offset="0" />
        <feFuncA type="table" tableValues="0 0.16 0.42 0.78 1" />
      </feComponentTransfer>
      <feComposite in="inked" in2="inkFlow" operator="arithmetic" k1="0" k2="1" k3="0.08" k4="0" result="finalInk" />
    </filter>
  </defs>
</svg>
```

Then apply via CSS:

```css
text {
  filter: url(#ballpoint-ink);
}
```

Or inline on SVG text elements:

```html
<text x="20" y="50" filter="url(#ballpoint-ink)">Handwritten text</text>
```

### Method 2: External SVG Reference

Reference the standalone SVG file:

```css
text {
  filter: url(/assets/filters/ballpoint-ink.svg#ballpoint-ink);
}
```

### Method 3: CSS Utility Classes

Include the CSS file:

```html
<link rel="stylesheet" href="/assets/ballpoint-ink.css">
```

Apply the class:

```html
<div class="ballpoint-container">
  <svg>
    <text x="20" y="50">Auto-filtered text</text>
  </svg>
</div>
```

## Implementation Status

### ✅ Applied
- `/rv-app/public/tools/collision-field-ui.html` - All text labels on collision field nodes
- `/public/tools/stage-template.html` - All navigation marker labels

### 🔄 Recommended Applications
- Passport stamp text
- Mnemonic scene labels
- Workout route names
- User notes and annotations
- Badge titles
- Any UI element with a "handwritten journal" aesthetic

## Technical Notes

- **Performance**: The filter uses optimized parameters (low octaves, minimal blur) for real-time rendering
- **Accessibility**: Filter maintains text legibility and does not interfere with screen readers
- **Color-safe**: Works with any text color; adjusts organically to fill values
- **Browser support**: Compatible with all modern browsers supporting SVG filters (Chrome, Firefox, Safari, Edge)

## Customization

Adjust these parameters in the filter definition to modify the effect:

- **`baseFrequency`**: Paper grain coarseness (higher = more texture)
- **`scale`** in `feDisplacementMap`: Wobble intensity (higher = more distortion)
- **`stdDeviation`** in `feGaussianBlur`: Edge softness (higher = more blur)
- **`tableValues`** in final `feFuncA`: Stroke density distribution

## Examples

See live examples at:
- http://localhost:4173/tools/collision-field-ui.html
- http://localhost:3000/tools/stage-template.html
