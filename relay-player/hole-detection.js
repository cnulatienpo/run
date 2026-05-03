/* =========================
   HOLE DETECTION & FRAMING
========================= */

// Global hole state
let hole = {
  x: 0,
  y: 0,
  width: 380,
  height: 250
}

// Cache for loaded frame metadata
const frameAlphaHoleCache = new Map()

// Get current hole center as {x, y}
function getHoleCenter() {
  return {
    x: hole.x + hole.width / 2,
    y: hole.y + hole.height / 2
  }
}

// Load metadata JSON for a frame name
async function loadFrameMetadata(frameName) {
  const metadataPath = `${FRONT_DIR}/json_final/${frameName}.json`
  
  try {
    const response = await fetch(metadataPath)
    if (!response.ok) {
      console.warn(`Metadata not found for frame: ${frameName}`)
      return null
    }
    
    const metadata = await response.json()
    return metadata
  } catch (err) {
    console.debug(`Could not load metadata for ${frameName}:`, err.message)
    return null
  }
}

// Apply hole from metadata JSON if available, returns true if applied
async function applyHoleFromMetadata(frameIndex) {
  if (frameIndex >= frontAssets.length) {
    return false
  }
  
  const framePath = frontAssets[frameIndex]
  const frameName = framePath.split('/').pop().replace(/\.png$/i, '')
  
  // Check cache first
  if (frameAlphaHoleCache.has(frameName)) {
    const metadata = frameAlphaHoleCache.get(frameName)
    if (metadata) {
      applyHoleMetadata(metadata)
      return true
    }
    return false
  }
  
  // Load and cache
  const metadata = await loadFrameMetadata(frameName)
  frameAlphaHoleCache.set(frameName, metadata)
  
  if (!metadata || !metadata.has_mask || !metadata.centroid) {
    return false
  }
  
  applyHoleMetadata(metadata)
  return true
}

// Apply hole properties from metadata object
function applyHoleMetadata(metadata) {
  if (metadata.centroid) {
    const center = metadata.centroid
    hole.x = Math.round(center.x - hole.width / 2)
    hole.y = Math.round(center.y - hole.height / 2)
  }
  
  if (metadata.bbox) {
    const [x1, y1, x2, y2] = metadata.bbox
    const detectedWidth = x2 - x1
    const detectedHeight = y2 - y1
    
    // Update hole size from detected bbox
    if (detectedWidth > 0 && detectedHeight > 0) {
      hole.width = detectedWidth
      hole.height = detectedHeight
      hole.x = x1
      hole.y = y1
    }
  }
}

// Fallback: placeholder for future alpha channel analysis
async function applyHoleFromImageAlpha(frameIndex) {
  // Fallback when metadata is not available
  // Could implement real-time alpha scanning here if needed
  console.debug(`No metadata for frame ${frameIndex}, using defaults`)
  return false
}

// Sync relay-root position/size to hole (called when hole changes)
function syncRelayRootToHoleSize(recenter = false) {
  if (!relayRoot) return
  
  // Adjust layer transform origins and scales based on hole
  for (const f of frames) {
    const layer = f.layer
    if (layer) {
      // Center transform on hole center instead of image center
      const holeCenterX = hole.x + hole.width / 2
      const holeCenterY = hole.y + hole.height / 2
      const pct_x = (holeCenterX / relayRoot.offsetWidth) * 100
      const pct_y = (holeCenterY / relayRoot.offsetHeight) * 100
      
      layer.style.transformOrigin = `${pct_x}% ${pct_y}%`
    }
  }
}

// Resize debug canvas (no-op if no debug canvas)
function resizeDebugCanvas() {
  const debugCanvas = document.getElementById('debug-canvas')
  if (!debugCanvas) return
  
  debugCanvas.width = relayRoot.offsetWidth
  debugCanvas.height = relayRoot.offsetHeight
}

// Update patch layer layouts (called when hole size changes)
function updatePatchLayerLayouts() {
  // Placeholder for any layer patch system
  // Re-applies layer sizing/positioning based on new hole geometry
}

// Initialize hole detection on frame load
async function detectHoleForCurrentFrame() {
  const applied = await applyHoleFromMetadata(currentFrameIndex)
  if (applied) {
    syncRelayRootToHoleSize()
    resizeDebugCanvas()
    updatePatchLayerLayouts()
  } else {
    // Fallback to defaults or alpha scanning
    await applyHoleFromImageAlpha(currentFrameIndex)
  }
}
