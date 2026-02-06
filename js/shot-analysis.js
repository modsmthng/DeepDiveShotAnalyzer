// shot-analysis.js

// --- Helper: Format Stop Reasons ---
export function formatStopReason(type) {
    if (!type) return "";
    const t = type.toLowerCase();
    if (t === "duration") return "Time Limit";
    if (t === "pumped") return "Water Drawn Limit";
    if (t === "volumetric" || t === "weight") return "Weight Limit";
    if (t === "pressure") return "Pressure Limit";
    if (t === "flow") return "Flow Limit";
    return t.charAt(0).toUpperCase() + t.slice(1) + " Limit";
}

// --- Helper: Statistics ---
function getMetricStats(samples, key) {
    let min = Infinity, max = -Infinity, weightedSum = 0, totalTime = 0;
    let start = samples[0][key], end = samples[samples.length - 1][key];
    if (start === undefined) start = 0; if (end === undefined) end = 0;
    for (let i = 0; i < samples.length; i++) {
        const val = samples[i][key] !== undefined ? samples[i][key] : 0;
        if (val < min) min = val; if (val > max) max = val;
        if (i > 0) {
            const dt = (samples[i].t - samples[i-1].t) / 1000; 
            if (dt > 0) { weightedSum += val * dt; totalTime += dt; }
        }
    }
    if (min === Infinity) min = 0; if (max === -Infinity) max = 0;
    const avg = totalTime > 0 ? (weightedSum / totalTime) : 0;
    return { start, end, min, max, avg };
}

// --- Main Analysis Logic ---
export function calculateShotMetrics(shotData, profileData, settings) {
    const { scaleDelayMs, sensorDelayMs, isAutoAdjusted } = settings;
    const gSamples = shotData.samples;
    const globalStartTime = gSamples[0].t;
    
    // 1. Phasen trennen
    const phases = {};
    const phaseNameMap = {};
    if (shotData.phaseTransitions) { 
        shotData.phaseTransitions.forEach(pt => phaseNameMap[pt.phaseNumber] = pt.phaseName); 
    }
    gSamples.forEach(sample => {
        const pNum = sample.phaseNumber;
        if (!phases[pNum]) phases[pNum] = [];
        phases[pNum].push(sample);
    });

    // 2. Scale Check
    const startSysInfo = gSamples[0].systemInfo || {};
    const isBrewByWeight = startSysInfo.shotStartedVolumetric === true;
    let globalScaleLost = false;
    if (isBrewByWeight) {
        globalScaleLost = gSamples.some(s => s.systemInfo && s.systemInfo.bluetoothScaleConnected === false);
    }

    // 3. Totals
    let gDuration = (gSamples[gSamples.length-1].t - gSamples[0].t) / 1000;
    let gWater = 0; 
    for (let i = 1; i < gSamples.length; i++) gWater += gSamples[i].fl * ((gSamples[i].t - gSamples[i-1].t) / 1000);
    let gWeight = gSamples[gSamples.length-1].v;

    // 4. Calculate Phase Metrics
    const analyzedPhases = [];
    const TOL_PRESSURE = 0.15; 
    const TOL_FLOW = 0.3; 
    let scaleConnectionBrokenPermanently = false;

    Object.keys(phases).sort((a,b) => a - b).forEach(phaseNum => {
        const samples = phases[phaseNum];
        const pStart = (samples[0].t - globalStartTime) / 1000;
        const pEnd = (samples[samples.length - 1].t - globalStartTime) / 1000;
        const duration = pEnd - pStart;
        const rawName = phaseNameMap[phaseNum];
        const displayName = rawName ? rawName : `Phase ${phaseNum}`;

        let scaleLostInThisPhase = false;
        if (isBrewByWeight) {
            scaleLostInThisPhase = samples.some(s => s.systemInfo && s.systemInfo.bluetoothScaleConnected === false);
        }
        if (scaleLostInThisPhase) scaleConnectionBrokenPermanently = true;

        let exitReason = null;
        let exitType = null;
        let finalPredictedWeight = null;
        let profilePhase = null;

        // Profile Match Logic
        if (profileData && profileData.phases) {
            const cleanName = rawName ? rawName.trim().toLowerCase() : "";
            profilePhase = profileData.phases.find(p => p.name.trim().toLowerCase() === cleanName);
            
            if (profilePhase) {
                const profDur = profilePhase.duration;
                // Time Limit Check
                if (Math.abs(duration - profDur) < 0.5 || duration >= profDur) {
                    exitReason = "Time Limit";
                    exitType = "duration";
                }
                
                // Target Checks
                if (profilePhase.targets && (!exitType || duration < (profDur - 0.5))) {
                    let wPumped = 0;
                    for (let i = 1; i < samples.length; i++) wPumped += samples[i].fl * ((samples[i].t - samples[i-1].t) / 1000);
                    
                    const lastSample = samples[samples.length-1];
                    const prevSample = samples.length > 1 ? samples[samples.length-2] : lastSample;
                    const dt = (lastSample.t - prevSample.t) / 1000.0;
                    const lastP = lastSample.cp; const lastF = lastSample.fl; const lastW = lastSample.v; const lastVF = lastSample.vf;
                    
                    // Look Ahead
                    let nextPhaseFirstSample = null;
                    const nextPNum = parseInt(phaseNum) + 1;
                    if (phases[nextPNum] && phases[nextPNum].length > 0) {
                        nextPhaseFirstSample = phases[nextPNum][0];
                    }

                    // Predictions
                    let predictedW = lastW;
                    if (lastW > 0.1 && !scaleConnectionBrokenPermanently) {
                        let currentRate = (lastVF !== undefined) ? lastVF : lastF;
                        let predictedAdded = currentRate * (scaleDelayMs / 500.0); 
                        if (predictedAdded < 0) predictedAdded = 0; if (predictedAdded > 8.0) predictedAdded = 8.0;
                        predictedW = lastW + predictedAdded;
                    }
                    finalPredictedWeight = predictedW;

                    let predictedPumped = wPumped; 
                    if (lastF > 0) predictedPumped += lastF * (sensorDelayMs / 1000.0);

                    let predictedP = lastP; let predictedF = lastF;
                    if (dt > 0) {
                        const slopeP = (lastP - prevSample.cp) / dt;
                        const slopeF = (lastF - prevSample.fl) / dt;
                        predictedP = lastP + (slopeP * (sensorDelayMs / 1000.0));
                        predictedF = lastF + (slopeF * (sensorDelayMs / 1000.0));
                    }

                    // Target Hit Logic
                    let hitTargets = [];
                    for (let tgt of profilePhase.targets) {
                        if ((tgt.type === 'volumetric' || tgt.type === 'weight') && scaleConnectionBrokenPermanently) continue;

                        let measured = 0; let checkValue = 0; let hit = false;
                        let tolerance = 0;

                        if (tgt.type === 'pressure') { measured = lastP; checkValue = (tgt.operator === 'gte' || tgt.operator === 'lte') ? predictedP : lastP; tolerance = TOL_PRESSURE; }
                        else if (tgt.type === 'flow') { measured = lastF; checkValue = (tgt.operator === 'gte' || tgt.operator === 'lte') ? predictedF : lastF; tolerance = TOL_FLOW; }
                        else if (tgt.type === 'volumetric' || tgt.type === 'weight') { measured = lastW; checkValue = (tgt.operator === 'gte') ? predictedW : lastW; }
                        else if (tgt.type === 'pumped') { measured = wPumped; checkValue = (tgt.operator === 'gte') ? predictedPumped : wPumped; }

                        // Hits
                        if (tgt.operator === 'gte' && measured >= tgt.value) hit = true;
                        if (tgt.operator === 'lte' && measured <= tgt.value) hit = true;
                        if (!hit) {
                             if (tgt.operator === 'gte' && checkValue >= tgt.value) hit = true;
                             if (tgt.operator === 'lte' && checkValue <= tgt.value) hit = true;
                        }
                        if (!hit && tolerance > 0) {
                            if (tgt.operator === 'gte' && measured >= tgt.value - tolerance) hit = true;
                            if (tgt.operator === 'lte' && measured <= tgt.value + tolerance) hit = true;
                        }
                        if (!hit && nextPhaseFirstSample) {
                            if (tgt.type === 'pressure' && tgt.operator === 'gte' && nextPhaseFirstSample.cp >= tgt.value) hit = true; 
                            if (tgt.type === 'flow' && tgt.operator === 'gte' && nextPhaseFirstSample.fl >= tgt.value) hit = true; 
                        }
                        if (hit) hitTargets.push(tgt);
                    }

                    if (hitTargets.length > 0) {
                        hitTargets.sort((a, b) => {
                             const getScore = (type) => { if (type === 'flow') return 1; if (type === 'weight') return 2; if (type === 'volumetric') return 2; if (type === 'pressure') return 3; return 4; };
                            return getScore(a.type) - getScore(b.type);
                        });
                        const bestMatch = hitTargets[0];
                        exitReason = formatStopReason(bestMatch.type);
                        exitType = bestMatch.type;
                    }
                }
            }
        }

        // Metrics for this phase
        let pWaterPumped = 0;
        for (let i = 1; i < samples.length; i++) pWaterPumped += samples[i].fl * ((samples[i].t - samples[i-1].t) / 1000);
        
        analyzedPhases.push({
            number: phaseNum,
            name: rawName,
            displayName: displayName,
            start: pStart,
            end: pEnd,
            duration: duration,
            water: pWaterPumped,
            weight: samples[samples.length - 1].v,
            stats: {
                p: getMetricStats(samples, 'cp'),
                tp: getMetricStats(samples, 'tp'),
                f: getMetricStats(samples, 'fl'),
                pf: getMetricStats(samples, 'pf'),
                tf: getMetricStats(samples, 'tf'),
                t: getMetricStats(samples, 'ct'),
                tt: getMetricStats(samples, 'tt'),
                w: getMetricStats(samples, 'v')
            },
            exit: { reason: exitReason, type: exitType },
            profilePhase: profilePhase,
            scaleLost: scaleLostInThisPhase,
            scalePermanentlyLost: scaleConnectionBrokenPermanently,
            prediction: {
                finalWeight: finalPredictedWeight
            }
        });
    });

    // 5. Total Stats
    const totalStats = {
        duration: gDuration,
        water: gWater,
        weight: gWeight,
        p: getMetricStats(gSamples, 'cp'),
        tp: getMetricStats(gSamples, 'tp'),
        f: getMetricStats(gSamples, 'fl'),
        pf: getMetricStats(gSamples, 'pf'),
        tf: getMetricStats(gSamples, 'tf'),
        t: getMetricStats(gSamples, 'ct'),
        tt: getMetricStats(gSamples, 'tt'),
        w: getMetricStats(gSamples, 'v')
    };

    return {
        isBrewByWeight,
        globalScaleLost,
        isAutoAdjusted,
        phases: analyzedPhases,
        total: totalStats,
        rawSamples: gSamples,
        startTime: globalStartTime
    };
}

export function detectAutoDelay(shotData, profileData, manualDelay) {
    if (!profileData || !profileData.phases) return { delay: manualDelay, auto: false };

    const phases = {};
    const phaseNameMap = {};
    if (shotData.phaseTransitions) { shotData.phaseTransitions.forEach(pt => phaseNameMap[pt.phaseNumber] = pt.phaseName); }
    shotData.samples.forEach(sample => {
        if (!phases[sample.phaseNumber]) phases[sample.phaseNumber] = [];
        phases[sample.phaseNumber].push(sample);
    });

    const checkDelay = (delayVal) => {
        let hitCount = 0;
        Object.keys(phases).forEach(phaseNum => {
            const samples = phases[phaseNum];
            const rawName = phaseNameMap[phaseNum];
            const cleanName = rawName ? rawName.trim().toLowerCase() : "";
            const profilePhase = profileData.phases.find(p => p.name.trim().toLowerCase() === cleanName);
            if (profilePhase && profilePhase.targets) {
                let wPumped = 0;
                for (let i = 1; i < samples.length; i++) wPumped += samples[i].fl * ((samples[i].t - samples[i-1].t) / 1000);
                const lastS = samples[samples.length-1];
                const prevS = samples.length > 1 ? samples[samples.length-2] : lastS;
                const dt = (lastS.t - prevS.t) / 1000.0;
                
                let predPumped = wPumped; 
                if (lastS.fl > 0) predPumped += lastS.fl * (delayVal / 1000.0);
                
                let predP = lastS.cp; let predF = lastS.fl;
                if (dt > 0) {
                    const slopeP = (lastS.cp - prevS.cp) / dt;
                    const slopeF = (lastS.fl - prevS.fl) / dt;
                    predP = lastS.cp + (slopeP * (delayVal / 1000.0));
                    predF = lastS.fl + (slopeF * (delayVal / 1000.0));
                }

                for (let tgt of profilePhase.targets) {
                    if (tgt.type === 'volumetric' || tgt.type === 'weight') continue;
                    let measured = 0; let checkValue = 0; let hit = false;
                    if (tgt.type === 'pressure') { measured = lastS.cp; checkValue = predP; }
                    else if (tgt.type === 'flow') { measured = lastS.fl; checkValue = predF; }
                    else if (tgt.type === 'pumped') { measured = wPumped; checkValue = predPumped; }

                    if ((tgt.operator === 'gte' && (measured >= tgt.value || checkValue >= tgt.value)) ||
                        (tgt.operator === 'lte' && (measured <= tgt.value || checkValue <= tgt.value))) {
                        hit = true;
                    }
                    if (hit) { hitCount++; break; } 
                }
            }
        });
        return hitCount;
    };

    const hitsNormal = checkDelay(manualDelay);
    const hitsHigh = checkDelay(800);
    
    if (hitsHigh > hitsNormal) {
        return { delay: 800, auto: true };
    }
    return { delay: manualDelay, auto: false };
}