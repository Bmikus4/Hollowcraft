// Build index-preextract.html: the CURRENT index.html with §1-step-2's hcLight extraction undone, and
// nothing else undone. That is what makes the bit-identity A/B honest — HEAD would also carry the other
// live session's uncommitted player-model and menu work, and then a moved pixel would have two possible
// authors. This file differs from index.html by the extraction and by nothing else.
//
// EVERY REPLACEMENT IS CHECKED. A string replace that misses its token fails SILENTLY, and this codebase
// has been bitten by exactly that often enough to have a comment about it (see mat.userData.folSrc). A
// miss here would produce a "before" that is really an "after" and the A/B would read a perfect 0.0.
import fs from 'node:fs'; import path from 'node:path';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const SRC=path.join(ROOT,'index.html'), DST=path.join(ROOT,'index-preextract.html');
let s=fs.readFileSync(SRC,'utf8');
let n=0;
const sub=(from,to)=>{ const i=s.indexOf(from);
  if(i<0){ console.error('  MISS: token not found:\n    '+from.slice(0,150)); process.exit(1); }
  if(s.indexOf(from, i+from.length)>=0){ console.error('  AMBIGUOUS: token appears more than once:\n    '+from.slice(0,150)); process.exit(1); }
  s=s.slice(0,i)+to+s.slice(i+from.length); n++; };

// 1. the ambient chain: hcAmbient() back to the four inline factors, in the shipped order
sub(`'float _sdir;\\n'+
        'irradiance = hcAmbient(irradiance, vObjN, vSky, vCan, reflectedLight.directDiffuse, uDayS,\\n'+
        '                       uSkyDirAmt, uSkyDirDn, uSkyDirUp, uDayShade, uCanopy, uSkyCurve, _sdir);\\n'+`,
`'float _sdir=mix(1.0, mix(uSkyDirDn, uSkyDirUp, 0.5+0.5*normalize(vObjN).y), uSkyDirAmt);\\n'+
        'irradiance *= _sdir;\\n'+`);
sub(`        // (hcSunShade, applied by hcAmbient above)`,
`        'float _sunlit=clamp(dot(reflectedLight.directDiffuse, vec3(0.2126,0.7152,0.0722))*uDayShade.y, 0.0, 1.0);\\n'+
        'irradiance *= mix(1.0, mix(uDayShade.x, 1.0, _sunlit), clamp(uDayS,0.0,1.0));\\n'+`);
sub(`        // (hcCanopy, applied by hcAmbient above)`,
`        'irradiance *= mix(1.0, max(uCanopy.y, pow(uCanopy.x, vCan)), clamp(uDayS,0.0,1.0));\\n'+`);
sub(`'' /* was: irradiance *= (uSkyCurve.x + (1.0-uSkyCurve.x)*pow(vSky,uSkyCurve.y)); */ +`,
`'irradiance *= (uSkyCurve.x + (1.0-uSkyCurve.x)*pow(vSky,uSkyCurve.y));\\n'+`);

// 2. the emitters: hcEmitters() back to the flicker, the pool, the held light and the cone
sub(`        // The flicker, the placed pool, the held light and the flashlight cone are all applied by hcEmitters
        // (see HC_LIGHT_GLSL), to this accumulator, in this order, with the two branches intact.`,
`        'float _fl = 0.90 + 0.10*sin(uTime*7.3 + vLP.x*1.7 + vLP.z*1.3);\\n'+`);
sub(`'irradiance = hcEmitters(irradiance, vWPos, vLP, uTime, uChunkTint, _bl,\\n'+
        '                        uHeld, uHeldC, uFlash, uFlashD, uFlashC);\\n'+
        '' /* was: irradiance += 3.6 * uChunkTint * pow(_bl,1.45) * _fl; */ +`,
`'irradiance += 3.6 * uChunkTint * pow(_bl,1.45) * _fl;'+`);
sub(`        // (hcHeldGlow, applied by hcEmitters above)`,
`        'if(uHeld.w > 0.0){ float _hd = distance(vWPos, uHeld.xyz); float _hf = clamp(1.0 - _hd/uHeld.w, 0.0, 1.0);\\n'+
        '  irradiance += 3.6 * uHeldC * pow(_hf,1.45) * _fl; }\\n'+`);
sub(`        // (hcFlashGlow, applied by hcEmitters above)
        '')`,
`        'if(uFlash.w > 0.0){ vec3 _fv = vWPos - uFlash.xyz; float _fd2 = length(_fv);\\n'+
        '  float _ff = clamp(1.0 - _fd2/uFlash.w, 0.0, 1.0);\\n'+
        '  float _fc = dot(_fv/max(_fd2,1e-4), uFlashD.xyz);\\n'+
        '  float _fcone = smoothstep(uFlashD.w, mix(uFlashD.w, 1.0, 0.35), _fc);\\n'+
        '  irradiance += 4.6 * uFlashC * _ff * _ff * _fcone; }\\n')`);

// 3. the direct side: the sky occlusion on the sun, and the cloud deck
sub(`reflectedLight.directDiffuse *= hcSkyDirect(vSky, uSkyCurve);`,
    `reflectedLight.directDiffuse *= pow(clamp(vSky,0.0,1.0), uSkyCurve.y);`);
sub(`'{ float _clight = texture2D(uCloudTex, hcCloudUV(vWPos, uSunDirC, uCloudScroll)).r;\\n'+
        '  reflectedLight.directDiffuse *= hcCloudMask(_clight, vSky, uCloudShadow); }');`,
`'{ float _cdeck = 190.0 - vWPos.y;\\n'+
        '  vec2 _cuv = (vWPos.xz + uSunDirC.xz*(_cdeck/max(uSunDirC.y,0.28)))*0.0026 + uCloudScroll;\\n'+
        '  float _clight = texture2D(uCloudTex, _cuv).r;\\n'+
        '  float _camt = uCloudShadow*smoothstep(0.10,0.55,vSky);\\n'+
        '  reflectedLight.directDiffuse *= mix(1.0, 0.20+0.80*_clight, _camt); }');`);

// 4. and the shared chunk itself stops being appended, so the pre-extraction shader has no hc* at all.
//    The definitions can stay in the JS unreferenced; what matters is that nothing reaches the GPU.
sub(`  THREE.ShaderChunk.lights_pars_begin += '\\n' + HC_LIGHT_GLSL;`,
    `  /* pre-extraction: HC_LIGHT_GLSL not appended */`);

// The call sites must all be gone. Definitions may remain in the JS (HC_LIGHT_GLSL is just a string that
// is no longer appended); what must not remain is a hc* call reaching the GPU.
for(const bad of ['hcAmbient(irradiance','hcEmitters(irradiance','hcSkyDirect(vSky','hcCloudUV(vWPos','hcCloudMask(_clight']){
  if(s.indexOf(bad)>=0){ console.error('  a hc* CALL survived: '+bad); process.exit(1); } }
fs.writeFileSync(DST,s);
console.log(`  ${n} replacements applied -> index-preextract.html (${s.split('\n').length} lines)`);
