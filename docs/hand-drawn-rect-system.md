# Procedural Hand-Drawn Rectangle System

## Concept

**This is NOT a UI component system.**  
**This is a drawing system.**

A rectangle is not an asset. A rectangle is a procedure. Every rectangle must be redrawn every time.

## Philosophy

- Rectangles are defined conceptually by position and dimensions
- Each rectangle is drawn as **four independent line segments**
- Each line is **segmented** into multiple short strokes
- Every stroke has **slight jitter** in position, angle, and width
- **No two rectangles ever look identical**
- The result should look **written**, not rendered

## Visual Goals

The rectangle should:
- Look like it was drawn with a steady ballpoint pen
- Have lines that slightly overshoot corners
- Have corners that don't meet perfectly
- Feel organic and imperfect
- Look worse when it's "perfect" or "clean"

**If the result looks nice, clean, or perfect — it is wrong.**

## API

### Core Function

```javascript
drawHandRect(svg, x, y, w, h, options)
```

Draws a hand-drawn rectangle by appending path elements to the provided SVG.

**Parameters:**

- `svg` (SVGElement) - Target SVG element
- `x` (number) - Rectangle X position
- `y` (number) - Rectangle Y position  
- `w` (number) - Rectangle width
- `h` (number) - Rectangle height
- `options` (object) - Drawing options

**Options:**

```javascript
{
  seed: 12345,              // Seed for deterministic randomness
  strokeColor: '#8b0000',   // Line color
  strokeWidth: 2.0,         // Base stroke width
  wobble: 0.8,              // Position jitter (0-5+)
  segments: 12,             // Number of sub-strokes per line (4-32)
  pressureVariance: 0.3,    // Stroke width variation (0-1)
  jitter: 0.5,              // Angle jitter (0-2)
  overshoot: 2.5,           // Corner overshoot distance (0-10)
  style: {}                 // Additional CSS styles for paths
}
```

### Helper Functions

#### `createHandDrawnButton(text, options)`

Creates a button with double hand-drawn frame.

```javascript
const button = createHandDrawnButton('Start Session', {
  width: 120,
  height: 32,
  seed: Date.now(),
  frameColor: '#8b0000',
  textColor: '#e63946',
  padding: 4,
});

button.addEventListener('click', () => {
  console.log('Button clicked');
});
```

#### `createHandDrawnPanel(options)`

Creates a container panel with hand-drawn border.

```javascript
const panel = createHandDrawnPanel({
  width: 200,
  height: 150,
  seed: Date.now(),
  borderColor: '#8b0000',
  backgroundColor: 'rgba(0, 0, 0, 0.6)',
  padding: 12,
});

// Access content area
const content = panel.querySelector('.hand-drawn-panel-content');
content.innerHTML = '<p>Panel content here</p>';
```

## Implementation Details

### Line Drawing Algorithm

Each line is drawn as a series of short strokes:

1. Calculate line vector and length
2. Extend line past endpoints (overshoot)
3. Divide line into segments
4. For each segment:
   - Calculate base position along line
   - Add perpendicular wobble (hand shake)
   - Add angle jitter
   - Vary stroke width (pressure)
5. Generate SVG path data

### Randomness

Uses Mulberry32 PRNG for deterministic results:

```javascript
function createRNG(seed) {
  let state = seed;
  return function() {
    state |= 0;
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

### Rectangle Construction

Four independent lines are drawn:

1. **Top**: (x1, y1) → (x2, y2)
2. **Right**: (x2, y2) → (x3, y3)
3. **Bottom**: (x3, y3) → (x4, y4)
4. **Left**: (x4, y4) → (x1, y1)

Each corner gets initial jitter so they don't align perfectly.

## Usage Examples

### Basic Rectangle

```javascript
import { drawHandRect } from './hand-drawn-rect.js';

const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
svg.setAttribute('width', 200);
svg.setAttribute('height', 150);
svg.setAttribute('viewBox', '0 0 200 150');

drawHandRect(svg, 10, 10, 180, 130, {
  seed: Date.now(),
  strokeColor: '#e63946',
  strokeWidth: 2,
});

document.body.appendChild(svg);
```

### Sketchy Rectangle

```javascript
drawHandRect(svg, 10, 10, 180, 130, {
  seed: Date.now(),
  strokeColor: '#e63946',
  strokeWidth: 2.5,
  wobble: 5.0,      // More hand shake
  segments: 6,       // Fewer segments = more sketchy
  overshoot: 5,      // Longer corner extensions
});
```

### Smooth Rectangle

```javascript
drawHandRect(svg, 10, 10, 180, 130, {
  seed: Date.now(),
  strokeColor: '#e63946',
  strokeWidth: 1.8,
  wobble: 0.4,       // Less wobble
  segments: 24,      // More segments = smoother
  overshoot: 1,      // Subtle overshoot
});
```

### Multiple Rectangles

```javascript
// Each with unique seed for variation
for (let i = 0; i < 5; i++) {
  drawHandRect(svg, 10 + i * 40, 10, 30, 30, {
    seed: 1000 + i * 100,  // Different seed each time
    strokeColor: '#e63946',
  });
}
```

## Parameter Guide

### wobble (0-5+)
- **0.3-0.5**: Steady hand, minimal shake
- **0.8-1.2**: Natural hand-drawn look (recommended)
- **2.0-3.0**: Shaky, sketchy appearance
- **4.0+**: Extremely rough, almost broken lines

### segments (4-32)
- **4-6**: Very sketchy, angular
- **8-12**: Balanced sketch quality (recommended)
- **16-24**: Smooth but still hand-drawn
- **28+**: Almost smooth, minimal sketch feel

### overshoot (0-10)
- **0**: No overshoot (corners meet)
- **1-3**: Subtle extension (recommended)
- **4-6**: Noticeable pen drag past corners
- **8+**: Exaggerated overshoot

### pressureVariance (0-1)
- **0.1-0.3**: Consistent pen pressure (recommended)
- **0.4-0.6**: Noticeable width variation
- **0.7+**: Dramatic pressure changes

### jitter (0-2)
- **0.2-0.5**: Minimal directional noise (recommended)
- **0.6-1.0**: Noticeable angle variation
- **1.5+**: Very jittery, chaotic angles

## Design Principles

1. **Procedural over Assets**: Don't create SVG files. Generate paths.
2. **Imperfection is Essential**: Perfect lines mean failure.
3. **Deterministic Randomness**: Same seed = same result.
4. **Four Independent Lines**: Not one closed path.
5. **Real Drawing Behavior**: Overshoot, wobble, pressure variation.
6. **Scale Agnostic**: Should work at any size.

## What NOT to Do

❌ Don't use CSS borders  
❌ Don't trace existing images  
❌ Don't create rounded corners  
❌ Don't make perfect straight lines  
❌ Don't reuse static SVG paths  
❌ Don't aim for "nice" or "clean" results  
❌ Don't create UI components (create drawing procedures)

## Integration with HUD

The HUD now uses this system for:
- Buttons (`createHandDrawnButton`)
- Floating info panels (custom hand-drawn borders)
- Control elements

Each element is drawn procedurally when created, ensuring unique appearance.

## Demo

View the interactive demo at: `renderer/hand-drawn-demo.html`

The demo shows:
- Basic rectangles with different seeds
- Wobble variations
- Segment count variations
- Overshoot variations
- Button examples
- Size variations
- Live redraw functionality

## Technical Notes

### SVG Structure

Each rectangle generates 4 separate `<path>` elements (one per line).

### Performance

Drawing is fast. Typical rectangle takes <1ms to generate.

### Browser Compatibility

Uses standard SVG path syntax. Works in all modern browsers.

### Dependencies

None. Pure vanilla JavaScript + SVG.

## File Structure

```
renderer/
  hand-drawn-rect.js      # Core drawing system
  hand-drawn-demo.html    # Interactive demo
  hud.js                  # HUD integration
```

## License

Part of the RunnyVision project.
