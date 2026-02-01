// --- Global State ---
let myChart = null;
let isInfoExpanded = false;
let currentShotData = null;
let currentProfileData = null;

// --- DOM Elements ---
let resultArea, fileInfoContainer, fileInfoText, extendedInfoContent, toggleBtn, controlsArea, controlsGrid, tableHead, tableBody, tableFoot, chartWrapper;

document.addEventListener('DOMContentLoaded', () => {
    resultArea = document.getElementById('result-area');
    fileInfoContainer = document.getElementById('file-info-container');
    fileInfoText = document.getElementById('file-info-text');
    extendedInfoContent = document.getElementById('extended-info-content');
    toggleBtn = document.getElementById('toggle-info-btn');
    controlsArea = document.getElementById('controls-area');
    controlsGrid = document.getElementById('controls-grid');
    tableHead = document.getElementById('table-head');
    tableBody = document.getElementById('table-body');
    tableFoot = document.getElementById('table-foot');
    chartWrapper = document.getElementById('chart-wrapper');

    setupDropZone('drop-zone-shot', 'file-shot', (data, name) => {
        currentShotData = data;
        document.getElementById('label-shot').innerText = name;
        document.getElementById('drop-zone-shot').classList.add('loaded');
        checkAndAnalyze();
    });

    setupDropZone('drop-zone-profile', 'file-profile', (data, name) => {
        currentProfileData = data;
        document.getElementById('label-profile').innerText = name;
        document.getElementById('drop-zone-profile').classList.add('loaded');
        document.getElementById('remove-profile-btn').style.display = 'flex';
        checkAndAnalyze();
    });
});

// --- Helper for Formatting Target Names ---
function formatTargetName(name) {
    if (!name) return "";
    // Special mapping for weight
    if (name.toLowerCase() === "volumetric" || name.toLowerCase() === "weight") return "Weight";
    if (name.toLowerCase() === "pumped") return "Pumped";
    if (name.toLowerCase() === "duration") return "Time";
    // Capitalize first letter for everything else
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

// --- Column Config ---
const columnConfig = [
    { id: 'duration', label: 'Duration (s)', type: 'val', group: 'basics', default: true, targetType: 'duration' },
    { id: 'water', label: 'Water (ml)', type: 'val', group: 'basics', default: true, targetType: 'pumped' },
    { id: 'weight', label: 'Weight (g)', type: 'val', group: 'basics', default: true, targetType: 'weight' }, 
    { id: 'p_se', label: 'Pressure', type: 'se', group: 'pressure', default: true, targetType: 'pressure' },
    { id: 'p_mm', label: 'Pressure', type: 'mm', group: 'pressure', default: false },
    { id: 'p_avg', label: 'Pressure', type: 'avg', group: 'pressure', default: false },
    { id: 'tp_se', label: 'Target Pressure', type: 'se', group: 'target_pressure', default: false },
    { id: 'tp_mm', label: 'Target Pressure', type: 'mm', group: 'target_pressure', default: false },
    { id: 'tp_avg', label: 'Target Pressure', type: 'avg', group: 'target_pressure', default: false },
    { id: 'f_se', label: 'Pump Flow', type: 'se', group: 'flow', default: true, targetType: 'flow' },
    { id: 'f_mm', label: 'Pump Flow', type: 'mm', group: 'flow', default: false },
    { id: 'f_avg', label: 'Pump Flow', type: 'avg', group: 'flow', default: false },
    { id: 'tf_se', label: 'Target Flow', type: 'se', group: 'target_flow', default: false },
    { id: 'tf_mm', label: 'Target Flow', type: 'mm', group: 'target_flow', default: false },
    { id: 'tf_avg', label: 'Target Flow', type: 'avg', group: 'target_flow', default: false },
    { id: 'pf_se', label: 'Puck Flow', type: 'se', group: 'puckflow', default: true }, 
    { id: 'pf_mm', label: 'Puck Flow', type: 'mm', group: 'puckflow', default: false },
    { id: 'pf_avg', label: 'Puck Flow', type: 'avg', group: 'puckflow', default: false },
    { id: 't_se', label: 'Temperature', type: 'se', group: 'temp', default: false },
    { id: 't_mm', label: 'Temperature', type: 'mm', group: 'temp', default: false },
    { id: 't_avg', label: 'Temperature', type: 'avg', group: 'temp', default: true },
    { id: 'tt_se', label: 'Target Temp', type: 'se', group: 'target_temp', default: false },
    { id: 'tt_mm', label: 'Target Temp', type: 'mm', group: 'target_temp', default: false },
    { id: 'tt_avg', label: 'Target Temp', type: 'avg', group: 'target_temp', default: false },
    { id: 'w_se', label: 'Weight Detailed', type: 'se', group: 'weight_det', default: false },
    { id: 'w_mm', label: 'Weight Detailed', type: 'mm', group: 'weight_det', default: false },
    { id: 'w_avg', label: 'Weight Detailed', type: 'avg', group: 'weight_det', default: false },
    { id: 'sys_raw', label: 'Raw', type: 'val', group: 'system', default: false },
    { id: 'sys_shot_vol', label: 'Shot Started Volumetric', type: 'bool', group: 'system', default: false },
    { id: 'sys_curr_vol', label: 'Currently Volumetric', type: 'bool', group: 'system', default: false },
    { id: 'sys_scale', label: 'Bluetooth Scale Connected', type: 'bool', group: 'system', default: false },
    { id: 'sys_vol_avail', label: 'Volumetric Available', type: 'bool', group: 'system', default: false },
    { id: 'sys_ext', label: 'Extended Recording', type: 'bool', group: 'system', default: false },
];

const groups = { 
    basics: "Basic Metrics", pressure: "Pressure (bar)", target_pressure: "Target Pressure (bar)",
    flow: "Pump Flow (ml/s)", target_flow: "Target Flow (ml/s)", puckflow: "Puck Flow (ml/s)", 
    temp: "Temperature (°C)", target_temp: "Target Temp (°C)", weight_det: "Weight Details (g)", system: "System Info"
};

function removeProfile(event) {
    event.stopPropagation();
    currentProfileData = null;
    document.getElementById('label-profile').innerText = "Drag & Drop or Click";
    document.getElementById('drop-zone-profile').classList.remove('loaded');
    document.getElementById('remove-profile-btn').style.display = 'none';
    document.getElementById('file-profile').value = "";
    checkAndAnalyze();
}

function setupDropZone(zoneId, inputId, callback) {
    const zone = document.getElementById(zoneId);
    const input = document.getElementById(inputId);
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('hover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('hover'));
    zone.addEventListener('drop', (e) => { 
        e.preventDefault(); zone.classList.remove('hover'); 
        if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0], callback); 
    });
    zone.addEventListener('click', () => input.click());
    input.addEventListener('change', (e) => { if (e.target.files[0]) processFile(e.target.files[0], callback); });
}

function processFile(file, callback) {
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = JSON.parse(event.target.result);
            callback(data, file.name);
        } catch (err) { 
            console.error(err);
            alert("Error processing file:\n" + err.name + ": " + err.message); 
        }
    };
    reader.readAsText(file);
}

function checkAndAnalyze() {
    if (currentShotData) {
        controlsArea.style.display = 'block';
        renderControls();
        analyzeShot(currentShotData, document.getElementById('label-shot').innerText);
    }
}

function renderControls() {
    controlsGrid.innerHTML = '';

    // --- Analysis Settings (Predictive Delay) ---
    let settingsDiv = document.getElementById('analysis-settings');
    if (!settingsDiv) {
        settingsDiv = document.createElement('div');
        settingsDiv.id = 'analysis-settings';
        settingsDiv.style.marginBottom = '15px';
        settingsDiv.style.padding = '10px';
        settingsDiv.style.background = '#e8f6f3';
        settingsDiv.style.border = '1px solid #d1f2eb';
        settingsDiv.style.borderRadius = '6px';
        settingsDiv.innerHTML = `
            <div style="display: flex; align-items: center; gap: 15px;">
                <h4 style="margin: 0; color: #16a085;">Analysis Settings</h4>
                <div style="display: flex; align-items: center; gap: 5px;">
                    <label for="predictive-delay-input" style="font-size: 0.9em; font-weight: bold; color: #2c3e50;">Predictive Scale Delay (ms):</label>
                    <input type="number" id="predictive-delay-input" value="800" step="50" style="padding: 4px; width: 60px; border: 1px solid #bdc3c7; border-radius: 4px;">
                </div>
            </div>
        `;
        controlsGrid.parentNode.insertBefore(settingsDiv, controlsGrid);
        
        const input = document.getElementById('predictive-delay-input');
        input.addEventListener('change', () => analyzeShot(currentShotData, document.getElementById('label-shot').innerText));
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
    }

    const grouped = {};
    columnConfig.forEach(col => {
        if (!grouped[col.group]) grouped[col.group] = [];
        grouped[col.group].push(col);
    });

    Object.keys(grouped).forEach(grpKey => {
        const groupDiv = document.createElement('div');
        groupDiv.className = `control-group group-${grpKey}`;
        groupDiv.innerHTML = `<h4>${groups[grpKey] || grpKey.toUpperCase()}</h4>`;
        grouped[grpKey].forEach(col => {
            const label = document.createElement('label');
            label.className = 'checkbox-label';
            let suffix = "";
            if (col.type === 'se') suffix = " Start / End";
            else if (col.type === 'mm') suffix = " [min / max]";
            else if (col.type === 'avg') suffix = " Avg (Time-Weighted)";
            let text = col.label;
            if (col.type !== 'val' && col.type !== 'bool') text += suffix; 
            label.innerHTML = `<input type="checkbox" id="chk-${col.id}" ${col.default ? 'checked' : ''} onchange="toggleColumn('${col.id}')"> ${text}`;
            groupDiv.appendChild(label);
        });
        controlsGrid.appendChild(groupDiv);
    });
}

function toggleColumn(colId) {
    const isChecked = document.getElementById(`chk-${colId}`).checked;
    const cells = document.querySelectorAll(`.col-${colId}`);
    cells.forEach(cell => {
        if (isChecked) cell.classList.remove('hidden-col');
        else cell.classList.add('hidden-col');
    });
    const colDef = columnConfig.find(c => c.id === colId);
    if(colDef) colDef.default = isChecked;
}

function toggleExtendedInfo() {
    isInfoExpanded = !isInfoExpanded;
    extendedInfoContent.style.display = isInfoExpanded ? 'block' : 'none';
    toggleBtn.innerText = isInfoExpanded ? "Less Info" : "More Info";
}

function renderFileInfo(data, filename) {
    fileInfoContainer.style.display = 'block';
    fileInfoText.innerHTML = `<strong>File:</strong> ${filename} &nbsp;|&nbsp; <strong>Profile:</strong> ${data.profile || 'Unknown'} &nbsp;|&nbsp; <strong>Date:</strong> ${new Date(data.timestamp * 1000).toLocaleString('en-US')}`;
    const notes = data.notes || {};
    const safe = (val) => (val && val !== "") ? val : "-";
    const row = (label, val) => `<div class="detail-row"><span class="detail-label">${label}:</span><span class="detail-val">${safe(val)}</span></div>`;
    let ratioVal = safe(notes.ratio);
    if (ratioVal === "-" && notes.doseIn && notes.doseOut) {
        const di = parseFloat(notes.doseIn);
        const doo = parseFloat(notes.doseOut);
        if (!isNaN(di) && !isNaN(doo) && di > 0) ratioVal = `1 : ${(doo / di).toFixed(1)} (Calc)`;
    }
    let html = '<div class="details-grid">';
    html += `<div class="detail-section"><h5>Bean & Grinder</h5>${row("Bean Type", notes.beanType)}${row("Grind Setting", notes.grindSetting)}${row("Dose In", notes.doseIn ? notes.doseIn + " g" : "-")}${row("Dose Out", notes.doseOut ? notes.doseOut + " g" : "-")}${row("Ratio", ratioVal)}</div>`;
    html += `<div class="detail-section"><h5>Taste & Rating</h5>${row("Rating", notes.rating)}${row("Balance", notes.balanceTaste)}${notes.notes ? '<div class="detail-notes">"'+notes.notes+'"</div>' : ''}</div>`;
    html += `<div class="detail-section"><h5>Technical Specs</h5>${row("Profile ID", data.profileId)}${row("Shot ID", data.id)}${row("Version", data.version)}${row("Sample Interval", data.sampleInterval ? data.sampleInterval + " ms" : "-")}${row("Volume (Sensor)", data.volume ? data.volume + " ml" : "-")}</div></div>`;
    extendedInfoContent.innerHTML = html;
    isInfoExpanded = false; extendedInfoContent.style.display = 'none'; toggleBtn.innerText = "More Info";
}

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

function analyzeShot(data, filename) {
    renderFileInfo(data, filename);
    resultArea.style.display = 'block';
    tableHead.innerHTML = ''; tableBody.innerHTML = ''; tableFoot.innerHTML = '';
    chartWrapper.style.display = 'block';
    if (!data.samples || data.samples.length === 0) { alert("No sample data found."); return; }

    const delayInput = document.getElementById('predictive-delay-input');
    const predictiveDelayMs = delayInput ? (parseFloat(delayInput.value) || 800) : 800;
    console.log("--- START ANALYSIS: Predictive Delay = " + predictiveDelayMs + "ms ---");

    let trHead = document.createElement('tr');
    trHead.innerHTML = `<th class="phase-col">Phase</th>`;
    columnConfig.forEach(col => {
        const th = document.createElement('th');
        th.className = `col-${col.id} group-${col.group} ${col.default ? '' : 'hidden-col'}`;
        let sub = "";
        if (col.type === 'se') sub = "Start / End";
        else if (col.type === 'mm') sub = "[min / max]";
        else if (col.type === 'avg') sub = "Avg (Time-Weighted)";
        th.innerHTML = col.label + (sub ? `<br><small>${sub}</small>` : "");
        trHead.appendChild(th);
    });
    tableHead.appendChild(trHead);

    const phaseNameMap = {};
    if (data.phaseTransitions) { data.phaseTransitions.forEach(pt => phaseNameMap[pt.phaseNumber] = pt.phaseName); }
    const phases = {};
    const globalStartTime = data.samples[0].t;
    data.samples.forEach(sample => {
        const pNum = sample.phaseNumber;
        if (!phases[pNum]) phases[pNum] = [];
        phases[pNum].push(sample);
    });
    const phaseBoundaries = [];

    Object.keys(phases).sort((a,b) => a - b).forEach(phaseNum => {
        const samples = phases[phaseNum];
        const pStart = (samples[0].t - globalStartTime) / 1000;
        const pEnd = (samples[samples.length - 1].t - globalStartTime) / 1000;
        const duration = pEnd - pStart;
        const rawName = phaseNameMap[phaseNum];
        const displayName = rawName ? rawName : `Phase ${phaseNum}`;
        const startSysInfo = samples[0].systemInfo || {};

        let exitReasonBadge = "";
        let exitType = ""; 
        let profilePhase = null;
        let finalPredictedWeight = null; 

        if (currentProfileData && currentProfileData.phases) {
            const cleanName = rawName ? rawName.trim().toLowerCase() : "";
            profilePhase = currentProfileData.phases.find(p => p.name.trim().toLowerCase() === cleanName);
            
            if (profilePhase) {
                const profDur = profilePhase.duration;
                // Time Check
                if (Math.abs(duration - profDur) < 0.5 || duration >= profDur) {
                    exitReasonBadge = `<br><span class="reason-badge reason-time">⏱️ Time Limit</span>`;
                    exitType = "duration";
                }
                
                // --- TARGET LOGIC ---
                if (profilePhase.targets && (!exitType || duration < (profDur - 0.5))) {
                    let wPumped = 0;
                    for (let i = 1; i < samples.length; i++) wPumped += samples[i].fl * ((samples[i].t - samples[i-1].t) / 1000);
                    
                    const lastP = samples[samples.length-1].cp;
                    const lastF = samples[samples.length-1].fl; // Pump flow
                    const lastW = samples[samples.length-1].v;  // Cup weight
                    const lastVF = samples[samples.length-1].vf; // Volumetric flow (Scale flow)
                    
                    // --- PREDICTIVE LOGIC ---
                    let predictedW = lastW;

                    if (lastW > 0.1) {
                        let currentRate = (lastVF !== undefined) ? lastVF : lastF;
                        let predictedAdded = currentRate * (predictiveDelayMs / 500.0); //or 1000
                        
                        if (predictedAdded < 0) predictedAdded = 0;
                        if (predictedAdded > 8.0) predictedAdded = 8.0;

                        predictedW = lastW + predictedAdded;
                    }
                    
                    finalPredictedWeight = predictedW;

                    let hitTargets = [];

                    for (let tgt of profilePhase.targets) {
                        let measured = 0; 
                        let hit = false;
                        
                        if (tgt.type === 'pressure') measured = lastP;
                        else if (tgt.type === 'flow') measured = lastF;
                        else if (tgt.type === 'volumetric') measured = lastW; 
                        else if (tgt.type === 'weight') measured = lastW;
                        else if (tgt.type === 'pumped') measured = wPumped;

                        if (tgt.operator === 'gte' && measured >= tgt.value) hit = true;
                        if (tgt.operator === 'lte' && measured <= tgt.value) hit = true;

                        if (!hit && (tgt.type === 'weight' || tgt.type === 'volumetric') && tgt.operator === 'gte') {
                            if (predictedW >= tgt.value) hit = true;
                        }
                        
                        if (!hit && tgt.type === 'flow' && tgt.operator === 'lte' && measured <= (tgt.value + 0.2)) {
                            hit = true;
                        }

                        if (hit) hitTargets.push(tgt);
                    }

                    if (hitTargets.length > 0) {
                        hitTargets.sort((a, b) => {
                             const getScore = (type) => {
                                if (type === 'flow') return 1;
                                if (type === 'weight') return 2;
                                if (type === 'volumetric') return 2;
                                if (type === 'pressure') return 3;
                                return 4; 
                            };
                            return getScore(a.type) - getScore(b.type);
                        });

                        const bestMatch = hitTargets[0];
                        let icon = "🎯";
                        if(bestMatch.type === 'volumetric' || bestMatch.type === 'weight') icon = "⚖️";
                        else if(bestMatch.type === 'pumped') icon = "🚰"; 
                        else if(bestMatch.type === 'flow') icon = "💧"; 
                        else if(bestMatch.type === 'pressure') icon = "💨";

                        // FIX: Added formatTargetName() call here
                        exitReasonBadge = `<br><span class="reason-badge reason-target">${icon} ${formatTargetName(bestMatch.type)}</span>`;
                        exitType = bestMatch.type;
                    }
                }
            }
        }

        const tablePhaseHtml = rawName 
            ? `<span class="phase-name">${rawName}</span><span class="phase-num">Phase ${phaseNum}</span>${exitReasonBadge}` 
            : `<span class="phase-name">Phase ${phaseNum}</span>`;

        phaseBoundaries.push({ label: displayName, start: pStart, end: pEnd, number: phaseNum });

        let waterPumped = 0;
        for (let i = 1; i < samples.length; i++) waterPumped += samples[i].fl * ((samples[i].t - samples[i-1].t) / 1000);
        const weightVal = samples[samples.length - 1].v;

        const statP = getMetricStats(samples, 'cp');
        const statTP = getMetricStats(samples, 'tp');
        const statF = getMetricStats(samples, 'fl');
        const statPF = getMetricStats(samples, 'pf');
        const statTF = getMetricStats(samples, 'tf');
        const statT = getMetricStats(samples, 'ct');
        const statTT = getMetricStats(samples, 'tt');
        const statW = getMetricStats(samples, 'v');

        const tr = document.createElement('tr');
        const tdPhase = document.createElement('td');
        tdPhase.className = "phase-col";
        tdPhase.innerHTML = tablePhaseHtml;
        tr.appendChild(tdPhase);

        columnConfig.forEach(col => {
            const td = document.createElement('td');
            td.className = `col-${col.id} group-${col.group} ${col.default ? '' : 'hidden-col'}`;
            let val = "-";
            const getBool = (v) => v ? "Yes" : "No";

            switch(col.id) {
                case 'duration': val = duration.toFixed(1); break;
                case 'water': val = waterPumped.toFixed(1); break;
                case 'weight': val = weightVal.toFixed(1); break;
                case 'p_se': val = `${statP.start.toFixed(1)} / ${statP.end.toFixed(1)}`; break;
                case 'p_mm': val = `${statP.min.toFixed(1)} / ${statP.max.toFixed(1)}`; break;
                case 'p_avg': val = statP.avg.toFixed(1); break;
                case 'f_se': val = `${statF.start.toFixed(1)} / ${statF.end.toFixed(1)}`; break;
                case 'f_mm': val = `${statF.min.toFixed(1)} / ${statF.max.toFixed(1)}`; break;
                case 'f_avg': val = statF.avg.toFixed(1); break;
                case 'pf_se': val = `${statPF.start.toFixed(1)} / ${statPF.end.toFixed(1)}`; break;
                case 'pf_mm': val = `${statPF.min.toFixed(1)} / ${statPF.max.toFixed(1)}`; break;
                case 'pf_avg': val = statPF.avg.toFixed(1); break;
                case 't_se': val = `${statT.start.toFixed(1)} / ${statT.end.toFixed(1)}`; break;
                case 't_mm': val = `${statT.min.toFixed(1)} / ${statT.max.toFixed(1)}`; break;
                case 't_avg': val = statT.avg.toFixed(1); break;
                case 'w_se': val = `${statW.start.toFixed(1)} / ${statW.end.toFixed(1)}`; break;
                case 'w_mm': val = `${statW.min.toFixed(1)} / ${statW.max.toFixed(1)}`; break;
                case 'w_avg': val = statW.avg.toFixed(1); break;
                case 'tp_se': val = `${statTP.start.toFixed(1)} / ${statTP.end.toFixed(1)}`; break;
                case 'tp_mm': val = `${statTP.min.toFixed(1)} / ${statTP.max.toFixed(1)}`; break;
                case 'tp_avg': val = statTP.avg.toFixed(1); break;
                case 'tf_se': val = `${statTF.start.toFixed(1)} / ${statTF.end.toFixed(1)}`; break;
                case 'tf_mm': val = `${statTF.min.toFixed(1)} / ${statTF.max.toFixed(1)}`; break;
                case 'tf_avg': val = statTF.avg.toFixed(1); break;
                case 'tt_se': val = `${statTT.start.toFixed(1)} / ${statTT.end.toFixed(1)}`; break;
                case 'tt_mm': val = `${statTT.min.toFixed(1)} / ${statTT.max.toFixed(1)}`; break;
                case 'tt_avg': val = statTT.avg.toFixed(1); break; 
                case 'sys_raw': val = (startSysInfo.raw !== undefined) ? startSysInfo.raw : "-"; break;
                case 'sys_shot_vol': val = (startSysInfo.shotStartedVolumetric !== undefined) ? getBool(startSysInfo.shotStartedVolumetric) : "-"; break;
                case 'sys_curr_vol': val = (startSysInfo.currentlyVolumetric !== undefined) ? getBool(startSysInfo.currentlyVolumetric) : "-"; break;
                case 'sys_scale': val = (startSysInfo.bluetoothScaleConnected !== undefined) ? getBool(startSysInfo.bluetoothScaleConnected) : "-"; break;
                case 'sys_vol_avail': val = (startSysInfo.volumetricAvailable !== undefined) ? getBool(startSysInfo.volumetricAvailable) : "-"; break;
                case 'sys_ext': val = (startSysInfo.extendedRecording !== undefined) ? getBool(startSysInfo.extendedRecording) : "-"; break;
            }

            if (profilePhase && col.targetType) {
                let tVal = null;
                let isTrigger = (exitType === col.targetType);
                let effectiveTargetType = col.targetType;
                if (col.id === 'weight') effectiveTargetType = 'volumetric'; 

                if (col.targetType === 'duration') {
                    tVal = profilePhase.duration + "s";
                } else if (profilePhase.targets) {
                    let matched = profilePhase.targets.find(t => t.type === effectiveTargetType);
                    if (!matched && col.targetType === 'pumped') matched = profilePhase.targets.find(t => t.type === 'pumped');
                    if (!matched && col.targetType === 'weight') matched = profilePhase.targets.find(t => t.type === 'volumetric');
                    if (matched) tVal = (matched.operator === 'gte' ? '> ' : '< ') + matched.value;
                }
                
                if (tVal) {
                    if (exitType === 'volumetric' && col.id === 'weight') isTrigger = true;
                    const style = isTrigger ? "trigger-hit" : "val-target";
                    // FIX: formatTargetName() also used for table labels
                    val += ` <span class="${style}">/ ${tVal}</span>`;
                }
                
                if (col.id === 'weight' && finalPredictedWeight !== null && weightVal > 0.1) {
                    val += `<br><small style="color:#7f8c8d; font-size:0.85em;">(🔮 ${finalPredictedWeight.toFixed(1)})</small>`;
                }
            }
            td.innerHTML = val;
            tr.appendChild(td);
        });
        tableBody.appendChild(tr);
    });

    // --- FOOTER (GLOBAL STATS) ---
    const gSamples = data.samples;
    const gStatsP = getMetricStats(gSamples, 'cp');
    const gStatsTP = getMetricStats(gSamples, 'tp');
    const gStatsF = getMetricStats(gSamples, 'fl');
    const gStatsPF = getMetricStats(gSamples, 'pf');
    const gStatsTF = getMetricStats(gSamples, 'tf');
    const gStatsT = getMetricStats(gSamples, 'ct');
    const gStatsTT = getMetricStats(gSamples, 'tt');
    const gStatsW = getMetricStats(gSamples, 'v');
    let gDuration = (gSamples[gSamples.length-1].t - gSamples[0].t) / 1000;
    let gWater = 0;
    for (let i = 1; i < gSamples.length; i++) gWater += gSamples[i].fl * ((gSamples[i].t - gSamples[i-1].t) / 1000);
    let gWeight = gSamples[gSamples.length-1].v;

    const trFoot = document.createElement('tr');
    const tdFootPhase = document.createElement('td');
    tdFootPhase.className = "phase-col"; tdFootPhase.innerText = "Total / Avg";
    trFoot.appendChild(tdFootPhase);

    columnConfig.forEach(col => {
        const td = document.createElement('td');
        td.className = `col-${col.id} group-${col.group} ${col.default ? '' : 'hidden-col'}`;
        let val = "-";
        switch(col.id) {
            case 'duration': val = gDuration.toFixed(1); break;
            case 'water': val = gWater.toFixed(1); break;
            case 'weight': val = gWeight.toFixed(1); break;
            case 'p_se': val = `${gStatsP.start.toFixed(1)} / ${gStatsP.end.toFixed(1)}`; break;
            case 'p_mm': val = `${gStatsP.min.toFixed(1)} / ${gStatsP.max.toFixed(1)}`; break;
            case 'p_avg': val = gStatsP.avg.toFixed(1); break;
            case 'f_se': val = `${gStatsF.start.toFixed(1)} / ${gStatsF.end.toFixed(1)}`; break;
            case 'f_mm': val = `${gStatsF.min.toFixed(1)} / ${gStatsF.max.toFixed(1)}`; break;
            case 'f_avg': val = gStatsF.avg.toFixed(1); break;
            case 'pf_se': val = `${gStatsPF.start.toFixed(1)} / ${gStatsPF.end.toFixed(1)}`; break;
            case 'pf_mm': val = `${gStatsPF.min.toFixed(1)} / ${gStatsPF.max.toFixed(1)}`; break;
            case 'pf_avg': val = gStatsPF.avg.toFixed(1); break;
            case 't_se': val = `${gStatsT.start.toFixed(1)} / ${gStatsT.end.toFixed(1)}`; break;
            case 't_mm': val = `${gStatsT.min.toFixed(1)} / ${gStatsT.max.toFixed(1)}`; break;
            case 't_avg': val = gStatsT.avg.toFixed(1); break;
            case 'w_se': val = `${gStatsW.start.toFixed(1)} / ${gStatsW.end.toFixed(1)}`; break;
            case 'w_mm': val = `${gStatsW.min.toFixed(1)} / ${gStatsW.max.toFixed(1)}`; break;
            case 'w_avg': val = gStatsW.avg.toFixed(1); break;
            case 'tp_se': val = `${gStatsTP.start.toFixed(1)} / ${gStatsTP.end.toFixed(1)}`; break;
            case 'tp_mm': val = `${gStatsTP.min.toFixed(1)} / ${gStatsTP.max.toFixed(1)}`; break;
            case 'tp_avg': val = gStatsTP.avg.toFixed(1); break;
            case 'tf_se': val = `${gStatsTF.start.toFixed(1)} / ${gStatsTF.end.toFixed(1)}`; break;
            case 'tf_mm': val = `${gStatsTF.min.toFixed(1)} / ${gStatsTF.max.toFixed(1)}`; break;
            case 'tf_avg': val = gStatsTF.avg.toFixed(1); break;
            case 'tt_se': val = `${gStatsTT.start.toFixed(1)} / ${gStatsTT.end.toFixed(1)}`; break;
            case 'tt_mm': val = `${gStatsTT.min.toFixed(1)} / ${gStatsTT.max.toFixed(1)}`; break;
            case 'tt_avg': val = gStatsTT.avg.toFixed(1); break;
            case 'sys_raw': val = gSamples[0].systemInfo?.raw ?? "-"; break;
            case 'sys_shot_vol': val = (gSamples[0].systemInfo?.shotStartedVolumetric !== undefined) ? ((gSamples[0].systemInfo.shotStartedVolumetric) ? "Yes" : "No") : "-"; break;
            case 'sys_curr_vol': val = (gSamples[0].systemInfo?.currentlyVolumetric !== undefined) ? ((gSamples[0].systemInfo.currentlyVolumetric) ? "Yes" : "No") : "-"; break;
            case 'sys_scale': val = (gSamples[0].systemInfo?.bluetoothScaleConnected !== undefined) ? ((gSamples[0].systemInfo.bluetoothScaleConnected) ? "Yes" : "No") : "-"; break;
            case 'sys_vol_avail': val = (gSamples[0].systemInfo?.volumetricAvailable !== undefined) ? ((gSamples[0].systemInfo.volumetricAvailable) ? "Yes" : "No") : "-"; break;
            case 'sys_ext': val = (gSamples[0].systemInfo?.extendedRecording !== undefined) ? ((gSamples[0].systemInfo.extendedRecording) ? "Yes" : "No") : "-"; break;
        }
        td.innerText = val;
        trFoot.appendChild(td);
    });
    tableFoot.appendChild(trFoot);

    const chartData = { times: [], pressure: [], targetPressure: [], flow: [], targetFlow: [], pumpFlow: [], weight: [], temp: [], targetTemp: [] };
    data.samples.forEach(s => {
        chartData.times.push(((s.t - globalStartTime) / 1000).toFixed(2));
        chartData.pressure.push(s.cp);
        chartData.targetPressure.push(s.tp !== undefined ? s.tp : null);
        chartData.flow.push(s.fl); 
        chartData.targetFlow.push(s.tf !== undefined ? s.tf : null);
        chartData.pumpFlow.push(s.pf !== undefined ? s.pf : null);
        chartData.weight.push(s.v);
        chartData.temp.push(s.ct);
        chartData.targetTemp.push(s.tt !== undefined ? s.tt : null);
    });
    renderChart(chartData, phaseBoundaries);
}

function renderChart(cd, boundaries) {
    const ctx = document.getElementById('shotChart').getContext('2d');
    if (myChart) myChart.destroy();
    const colPress = 'rgb(41, 128, 185)'; const colFlow = 'rgb(22, 160, 133)'; const colTemp = 'rgb(192, 57, 43)'; const colWeight = 'rgb(211, 84, 0)'; const colPuck = 'rgb(142, 68, 173)';
    const phaseBackgroundPlugin = {
        id: 'phaseBackgrounds',
        beforeDraw: (chart) => {
            const { ctx, chartArea: { top, bottom }, scales: { x } } = chart;
            ctx.save(); ctx.font = 'bold 12px sans-serif'; ctx.textBaseline = 'middle'; 
            boundaries.forEach((phase, index) => {
                const startX = x.getPixelForValue(parseFloat(phase.start)); 
                const endX = x.getPixelForValue(parseFloat(phase.end));
                const width = endX - startX;
                ctx.fillStyle = index % 2 === 0 ? 'rgba(0,0,0,0.02)' : 'rgba(0,0,0,0.06)';
                ctx.fillRect(startX, top, width, bottom - top);
                if (width > 12) { 
                    ctx.save(); ctx.fillStyle = '#7f8c8d'; ctx.translate(startX + (width / 2), top + 10); ctx.rotate(Math.PI / 2); ctx.textAlign = 'left'; ctx.fillText(phase.label, 0, 0); ctx.restore();
                }
            });
            ctx.restore();
        }
    };
    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: cd.times.map(n => parseFloat(n)), 
            datasets: [
                { label: "Pressure", data: cd.pressure, borderColor: colPress, backgroundColor: colPress, yAxisID: 'y-left', tension: 0.3, pointRadius: 0, borderWidth: 2, fill: false },
                { label: "Target Pressure", data: cd.targetPressure, borderColor: colPress, borderDash: [5, 5], yAxisID: 'y-left', tension: 0.1, pointRadius: 0, borderWidth: 1.5, fill: false },
                { label: "Pump Flow", data: cd.flow, borderColor: colFlow, backgroundColor: colFlow, yAxisID: 'y-left', tension: 0.3, pointRadius: 0, borderWidth: 2, fill: false },
                { label: "Puck Flow", data: cd.pumpFlow, borderColor: colPuck, backgroundColor: colPuck, yAxisID: 'y-left', tension: 0.3, pointRadius: 0, borderWidth: 2, fill: false, hidden: false }, 
                { label: "Target Flow", data: cd.targetFlow, borderColor: colFlow, borderDash: [5, 5], yAxisID: 'y-left', tension: 0.1, pointRadius: 0, borderWidth: 1.5, fill: false },
                { label: "Temperature", data: cd.temp, borderColor: colTemp, yAxisID: 'y-temp', tension: 0.3, pointRadius: 0, borderWidth: 2, fill: false },
                { label: "Target Temp", data: cd.targetTemp, borderColor: colTemp, borderDash: [5, 5], yAxisID: 'y-temp', tension: 0.1, pointRadius: 0, borderWidth: 1.5, fill: false },
                { label: "Weight", data: cd.weight, borderColor: colWeight, backgroundColor: 'rgba(211,84,0,0.1)', yAxisID: 'y-weight', tension: 0.3, pointRadius: 0, borderWidth: 2, fill: true }
            ]
        },
        plugins: [phaseBackgroundPlugin],
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 6 } }, tooltip: { backgroundColor: 'rgba(44, 62, 80, 0.9)', padding: 10 } },
            scales: {
                x: { type: 'linear', title: { display: true, text: "Time (s)" }, grid: { display: false }, ticks: { stepSize: 5 } },
                'y-left': { type: 'linear', display: true, position: 'left', title: { display: true, text: "Pressure (bar) / Flow (ml/s)" }, min: 0, suggestedMax: 12 },
                'y-weight': { type: 'linear', display: true, position: 'right', title: { display: true, text: "Weight (g)" }, min: 0, grid: { drawOnChartArea: false } },
                'y-temp': { type: 'linear', display: true, position: 'right', title: { display: true, text: "Temperature (°C)" }, grid: { drawOnChartArea: false }, grace: '5%' }
            }
        }
    });
}