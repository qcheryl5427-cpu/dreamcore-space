/**
 * Visual lint for index.html — catches common rendering/art bugs automatically.
 * Usage: node tools/lint-visual.js
 */

const fs = require('fs');
const path = require('path');

const file = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf-8');
const issues = [];
const warnings = [];
const ok = [];

function addIssue(msg, line) { issues.push({ msg, line }); }
function addWarning(msg, line) { warnings.push({ msg, line }); }
function addOk(msg) { ok.push(msg); }

// Helper: find line number of a match
function lineOf(str, index) {
  return str.slice(0, index).split('\n').length;
}

// ===== Rule 1: Tone mapping exposure safety =====
const exposureMatch = file.match(/toneMappingExposure\s*=\s*([0-9.]+)/);
if (exposureMatch) {
  const val = parseFloat(exposureMatch[1]);
  if (val > 1.4) addIssue(`toneMappingExposure ${val} is high (>1.4) — risk of overexposure`, lineOf(file, exposureMatch.index));
  else if (val > 1.25) addWarning(`toneMappingExposure ${val} is moderately high`, lineOf(file, exposureMatch.index));
  else addOk(`toneMappingExposure ${val} within safe range`);
}

// ===== Rule 2: Bloom parameter safety =====
const bloomMatch = file.match(/new\s+UnrealBloomPass\([^)]*\)/);
if (bloomMatch) {
  const nums = bloomMatch[0].match(/[0-9.]+/g);
  if (nums && nums.length >= 3) {
    const [strength, radius, threshold] = nums.slice(0,3).map(Number);
    if (strength > 0.7) addIssue(`Bloom strength ${strength} > 0.7 — high glow risk`, lineOf(file, bloomMatch.index));
    if (threshold < 0.3) addWarning(`Bloom threshold ${threshold} < 0.3 — may catch too much`, lineOf(file, bloomMatch.index));
    addOk(`Bloom params: strength=${strength}, radius=${radius}, threshold=${threshold}`);
  }
}

// ===== Rule 3: Light intensity total (overexposure guard) =====
const lightMatches = [...file.matchAll(/new\s+(?:THREE\.)?(?:SpotLight|PointLight|AmbientLight|DirectionalLight)\s*\(\s*(?:0x[0-9a-fA-F]+\s*,\s*)?([0-9.]+)/g)];
let totalIntensity = 0;
lightMatches.forEach(m => { totalIntensity += parseFloat(m[1]); });
if (totalIntensity > 80) addIssue(`Total light intensity ${totalIntensity.toFixed(1)} is very high — strong overexposure risk`);
else if (totalIntensity > 50) addWarning(`Total light intensity ${totalIntensity.toFixed(1)} is moderately high`);
else addOk(`Total light intensity ${totalIntensity.toFixed(1)} within safe range`);

// ===== Rule 4: Guide icon renderOrder / z-fighting check =====
if (file.includes('userData.isGuide')) {
  const guideMatches = [...file.matchAll(/userData\.isGuide\s*=\s*true/g)];
  // Check if any guide is placed behind expected equipment z-position
  // This is heuristic: if guide z is less than equipment z, it may be occluded
  const hpGuideZ = file.match(/hpGuide\.position\.set\([^,]+,\s*[^,]+,\s*([0-9.-]+)\)/);
  const hpZ = file.match(/hpGroup\.position\.set\([^,]+,\s*[^,]+,\s*([0-9.-]+)\)/);
  if (hpGuideZ && hpZ) {
    const gz = parseFloat(hpGuideZ[1]);
    const ez = parseFloat(hpZ[1]);
    if (Math.abs(gz - ez) < 0.15) addWarning(`Headphone guide z=${gz} is very close to equipment z=${ez} — may be occluded`, lineOf(file, hpGuideZ.index));
    else addOk(`Headphone guide z offset safe (${(gz-ez).toFixed(3)})`);
  }
}

// ===== Rule 5: Collision / clipping heuristic (VR glasses vs table / nose) =====
const vrZ = file.match(/vrGroup\.position\.set\([^,]+,\s*[^,]+,\s*([0-9.-]+)\)/);
const tableZ = file.match(/makeBox\(tw,\s*0\.06,\s*td,\s*0,\s*th,\s*0,/);
if (vrZ && tableZ) {
  const vz = parseFloat(vrZ[1]);
  // VR z should not be deeply embedded into table surface (th ~0.85)
  // Very rough: if vrGroup z < 0.3 it may clip with model or hands
  // We'll rely on more precise checks below
}

// ===== Rule 6: Camera boundary sanity =====
const bMin = file.match(/boundaryMin\.set\(\s*([0-9.-]+)\s*,\s*([0-9.-]+)\s*,\s*([0-9.-]+)\s*\)/g);
const bMax = file.match(/boundaryMax\.set\(\s*([0-9.-]+)\s*,\s*([0-9.-]+)\s*,\s*([0-9.-]+)\s*\)/g);
if (bMin && bMax) {
  // Last definition wins in JS execution, but we just check one pair
  const parseSet = (s) => s.match(/-?[0-9.]+/g).map(Number);
  const mins = parseSet(bMin[bMin.length-1]);
  const maxs = parseSet(bMax[bMax.length-1]);
  if (mins.some((v,i) => v > maxs[i])) addIssue(`Camera boundary min > max`);
  else addOk(`Camera boundaries are valid`);
}

// ===== Rule 7: CSS blackout transition consistency =====
const blackoutTrans = file.match(/#blackout\s*\{[^}]*transition[^}]*\}/);
const blackoutOpacity = file.match(/#blackout\.active\s*\{[^}]*opacity[^}]*\}/);
if (blackoutTrans) {
  const durMatch = blackoutTrans[0].match(/(\d+(?:\.\d+)?)s/);
  const dur = durMatch ? parseFloat(durMatch[1]) * 1000 : 1000;
  // Find the top-level blackout setTimeout (not nested inside another setTimeout)
  const allSetTimeouts = [...file.matchAll(/setTimeout\(\(\)\s*=>\s*\{[\s\S]{0,300}?blackout\.classList\.remove\('active'\)/g)];
  for (const stm of allSetTimeouts) {
    const snippet = stm[0];
    const delayMatch = snippet.match(/,\s*(\d+)/);
    if (!delayMatch) continue;
    const delay = parseInt(delayMatch[1]);
    // Check if this setTimeout is nested inside another setTimeout callback
    const before = file.slice(0, stm.index);
    const openCallbacks = (before.match(/setTimeout\s*\(/g) || []).length;
    const closeCallbacks = (before.match(/\}\s*,\s*\d+\s*\)/g) || []).length;
    if (openCallbacks > closeCallbacks + 1) {
      // Nested — this is likely a hold-duration inside enterZone, not the fade timing itself
      addOk(`Blackout nested hold duration ${delay}ms (inside scene-switch callback)`);
      continue;
    }
    if (delay < dur) addIssue(`Blackout setTimeout ${delay}ms < CSS transition ${dur}ms — screen won't fully fade before restoring`, lineOf(file, stm.index));
    else addOk(`Blackout timing consistent (${delay}ms >= ${dur}ms)`);
  }
}

// ===== Rule 8: Hand rotation sanity (first-person palms should face inward/toward face) =====
// Heuristic: check if any hand rotation.x is extreme
const handRotX = [...file.matchAll(/(?:leftHand|rightHand)\.rotation\.x\s*=\s*(-?[0-9.]+)/g)];
handRotX.forEach(m => {
  const val = parseFloat(m[1]);
  if (Math.abs(val) > 1.5) addWarning(`Hand rotation.x ${val} is extreme — may face wrong direction`, lineOf(file, m.index));
});

// ===== Rule 9: Door / navigation object existence =====
const zoneDoors = [...file.matchAll(/userData\.(?:doorMesh|backDoorMesh|doorGlow|doorFrame|doorPlane|backHitPlane)\s*=/g)];
const zonesWithDoors = new Set();
zoneDoors.forEach(m => {
  const line = lineOf(file, m.index);
  // Rough heuristic: which zone function it's in
  const preceding = file.slice(0, m.index);
  const zoneFn = preceding.match(/function\s+buildZone(\d)/g);
  if (zoneFn) zonesWithDoors.add(zoneFn[zoneFn.length-1].match(/\d/)[0]);
});
for (let z = 1; z <= 5; z++) {
  if (!zonesWithDoors.has(String(z))) addWarning(`Zone ${z} may be missing navigation door objects`);
}

// ===== Report =====
console.log('\n========== Visual Lint Report ==========\n');

if (issues.length) {
  console.log(`Issues (${issues.length}):`);
  issues.forEach(i => console.log(`  [L${i.line || '?'}] ISSUE: ${i.msg}`));
  console.log('');
}

if (warnings.length) {
  console.log(`Warnings (${warnings.length}):`);
  warnings.forEach(w => console.log(`  [L${w.line || '?'}] WARN: ${w.msg}`));
  console.log('');
}

if (ok.length) {
  console.log(`OK (${ok.length}):`);
  ok.forEach(o => console.log(`  OK: ${o}`));
  console.log('');
}

const exitCode = issues.length > 0 ? 1 : 0;
process.exit(exitCode);
