// --- Global State ---
let myChart = null;
let isInfoExpanded = false;
let currentShotData = null;
let currentProfileData = null;
// Default setting for Auto-Sensor Delay
let isSensorDelayAuto = true; 

// --- DOM Elements ---
let resultArea, fileInfoContainer, fileInfoText, extendedInfoContent, toggleBtn, controlsArea, controlsGrid, tableHead, tableBody, tableFoot, chartWrapper;

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. CSS Injection for Subtle Table Borders & Styles ---
    const style = document.createElement('style');
    style.innerHTML = `
        table { border-collapse: collapse; width: 100%; margin-bottom: 15px; }
        th, td { border: 1px solid #e0e0e0; }
        thead th { border-bottom: 2px solid #bdc3c7; }
        .phase-col { border-right: 2px solid #bdc3c7; background-color: #fcfcfc; }
    `;
    document.head.appendChild(style);

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

    // Initialize drop zones
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

// --- Helper: Format Stop Reasons (Professional Naming) ---
function formatStopReason(type) {
    if (!type) return "";
    const t = type.toLowerCase();
    
    // Explicit Professional Mapping
    if (t === "duration") return "Time Limit";
    if (t === "pumped") return "Water Drawn Limit";
    if (t === "volumetric" || t === "weight") return "Weight Limit";
    if (t === "pressure") return "Pressure Limit";
    if (t === "flow") return "Flow Limit";
    
    // Fallback Capitalization
    return t.charAt(0).toUpperCase() + t.slice(1) + " Limit";
}

// --- Column Configuration ---
const columnConfig = [
    { id: 'duration', label: 'Duration (s)', type: 'val', group: 'basics', default: true, targetType: 'duration' },
    { id: 'water', label: 'Water Drawn (ml)', type: 'val', group: 'basics', default: true, targetType: 'pumped' },
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

    // --- Analysis Settings (Delays) ---
    let settingsDiv = document.getElementById('analysis-settings');
    if (!settingsDiv) {
        settingsDiv = document.createElement('div');
        settingsDiv.id = 'analysis-settings';
        // REQ 1: Subtle Styling
        settingsDiv.style.marginBottom = '10px';
        settingsDiv.style.padding = '8px 12px';
        settingsDiv.style.background = '#f9f9f9'; // Subtle grey
        settingsDiv.style.border = '1px solid #e0e0e0'; // Subtle border
        settingsDiv.style.borderRadius = '4px';
        
        // REQ 3: Added Tooltip to Sensor div
        settingsDiv.innerHTML = `
            <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 20px; font-size: 0.9em;">
                <h4 style="margin: 0; color: #34495e; margin-right: 10px; font-size: 1em;">Stop Delays</h4>
                
                <div style="display: flex; align-items: center; gap: 5px;" title="Compensates for Bluetooth scale latency.">
                    <label for="predictive-scale-delay" style="font-weight: bold; color: #555;">Scale (BT):</label>
                    <input type="number" id="predictive-scale-delay" value="800" step="50" style="padding: 2px 4px; width: 50px; border: 1px solid #ccc; border-radius: 3px;">
                    <span style="color: #888;">ms</span>
                </div>

                <div style="display: flex; align-items: center; gap: 5px;" title="Compensates for internal system processing time and sensor lag.">
                    <label for="predictive-sensor-delay" style="font-weight: bold; color: #555;">System/Sensor:</label>
                    <input type="number" id="predictive-sensor-delay" value="200" step="50" style="padding: 2px 4px; width: 50px; border: 1px solid #ccc; border-radius: 3px;">
                    <span style="color: #888;">ms</span>
                    
                    <div style="margin-left:8px; display:flex; align-items:center;">
                        <input type="checkbox" id="auto-sensor-delay" ${isSensorDelayAuto ? 'checked' : ''} style="cursor:pointer;">
                        <label for="auto-sensor-delay" style="margin-left:4px; color:#16a085; cursor:pointer; font-weight:bold;">Auto</label>
                    </div>
                </div>
            </div>
        `;
        
        // REQ 1: Logic to place settings directly OVER the table
        const table = tableFoot.closest('table');
        if (table && table.parentNode) {
            table.parentNode.insertBefore(settingsDiv, table); 
        } else {
            controlsGrid.parentNode.insertBefore(settingsDiv, controlsGrid);
        }
        
        const scaleInput = document.getElementById('predictive-scale-delay');
        const sensorInput = document.getElementById('predictive-sensor-delay');
        const autoCheck = document.getElementById('auto-sensor-delay');
        
        const triggerUpdate = () => analyzeShot(currentShotData, document.getElementById('label-shot').innerText);
        
        // Logic for Auto-Disable Input
        const updateInputState = () => {
            if (isSensorDelayAuto) {
                sensorInput.disabled = true;
                sensorInput.style.backgroundColor = '#f0f0f0';
                sensorInput.style.color = '#999';
            } else {
                sensorInput.disabled = false;
                sensorInput.style.backgroundColor = 'white';
                sensorInput.style.color = 'black';
            }
        };

        // Initialize state
        updateInputState();

        scaleInput.addEventListener('change', triggerUpdate);
        sensorInput.addEventListener('change', triggerUpdate);
        
        autoCheck.addEventListener('change', (e) => {
            isSensorDelayAuto = e.target.checked;
            updateInputState();
            triggerUpdate();
        });

        scaleInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') scaleInput.blur(); });
        sensorInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sensorInput.blur(); });
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

    const gSamples = data.samples; 
    const globalStartTime = gSamples[0].t;
    const startSysInfo = gSamples[0].systemInfo || {};
    
    // Mode & Scale check
    const isBrewByWeight = startSysInfo.shotStartedVolumetric === true;
    let globalScaleLost = false;
    if (isBrewByWeight) {
        globalScaleLost = gSamples.some(s => s.systemInfo && s.systemInfo.bluetoothScaleConnected === false);
    }

    // --- DELAY PREPARATION & AUTO LOGIC ---
    const scaleDelayInput = document.getElementById('predictive-scale-delay');
    const sensorDelayInput = document.getElementById('predictive-sensor-delay');
    const scaleDelayMs = scaleDelayInput ? (parseFloat(scaleDelayInput.value) || 800) : 800;
    const manualSensorDelayMs = sensorDelayInput ? (parseFloat(sensorDelayInput.value) || 200) : 200;

    let usedSensorDelay = manualSensorDelayMs;
    let wasAutoAdjusted = false;

    // Phase setup for pre-scan
    const phases = {};
    const phaseNameMap = {};
    if (data.phaseTransitions) { data.phaseTransitions.forEach(pt => phaseNameMap[pt.phaseNumber] = pt.phaseName); }
    gSamples.forEach(sample => {
        const pNum = sample.phaseNumber;
        if (!phases[pNum]) phases[pNum] = [];
        phases[pNum].push(sample);
    });

    // --- AUTO DELAY ADJUSTMENT ALGORITHM ---
    if (isSensorDelayAuto && currentProfileData && currentProfileData.phases) {
        const checkDelay = (delayVal) => {
            let hitCount = 0;
            Object.keys(phases).forEach(phaseNum => {
                const samples = phases[phaseNum];
                const rawName = phaseNameMap[phaseNum];
                const cleanName = rawName ? rawName.trim().toLowerCase() : "";
                const profilePhase = currentProfileData.phases.find(p => p.name.trim().toLowerCase() === cleanName);
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

        const hitsNormal = checkDelay(manualSensorDelayMs);
        const hitsHigh = checkDelay(800); 
        
        if (hitsHigh > hitsNormal) {
            usedSensorDelay = 800;
            wasAutoAdjusted = true;
            console.log("Auto-Adjusted Sensor Delay to 800ms");
        }
    }

    console.log(`--- ANALYSIS: ScaleDelay=${scaleDelayMs}ms, SensorDelay=${usedSensorDelay}ms (Auto=${wasAutoAdjusted}) ---`);

    // --- HEADER GENERATION (Clean No-Icon) ---
    // --- 3. REQ: Removed Warning Icon ⚠️ ---
    let modeLabel = isBrewByWeight 
        ? `<span style="display:inline-block; margin-top:4px; padding:2px 6px; border-radius:4px; background:#e8f8f5; color:#16a085; font-size:0.8em; border:1px solid #a3e4d7;">Brew by Weight</span>` 
        : `<span style="display:inline-block; margin-top:4px; padding:2px 6px; border-radius:4px; background:#f4f6f7; color:#7f8c8d; font-size:0.8em; border:1px solid #bdc3c7;">Brew by Time</span>`;

    if (isBrewByWeight && globalScaleLost) {
        modeLabel += `<br><span style="display:inline-block; margin-top:2px; padding:2px 6px; border-radius:4px; background:#fadbd8; color:#c0392b; font-size:0.8em; border:1px solid #e6b0aa; font-weight:bold;">Scale Lost</span>`;
    }

    if (wasAutoAdjusted) {
        // REQ 2: distinct visual style (Purple/Software Look) for Auto-Adjust
        modeLabel += `<br><span title="System delay adjusted to 800ms for analysis" style="display:inline-block; margin-top:2px; padding:2px 6px; border-radius:4px; background:#f3e5f5; color:#8e24aa; font-size:0.8em; border:1px dashed #ce93d8; font-weight:bold; cursor:help;">Auto-Adjust Active</span>`;
    }

    let trHead = document.createElement('tr');
    trHead.innerHTML = `<th class="phase-col">Phase<br>${modeLabel}</th>`;
    
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

    const phaseBoundaries = [];
    const TOL_PRESSURE = 0.15; 
    const TOL_FLOW = 0.3; 
    let scaleConnectionBrokenPermanently = false;

    // --- PROCESS ROWS ---
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

        let exitReasonBadge = "";
        let exitType = ""; 
        let profilePhase = null;
        let finalPredictedWeight = null; 

        if (currentProfileData && currentProfileData.phases) {
            const cleanName = rawName ? rawName.trim().toLowerCase() : "";
            profilePhase = currentProfileData.phases.find(p => p.name.trim().toLowerCase() === cleanName);
            
            if (profilePhase) {
                const profDur = profilePhase.duration;
                if (Math.abs(duration - profDur) < 0.5 || duration >= profDur) {
                    exitReasonBadge = `<br><span class="reason-badge reason-time">Time Limit</span>`;
                    exitType = "duration";
                }
                
                if (profilePhase.targets && (!exitType || duration < (profDur - 0.5))) {
                    let wPumped = 0;
                    for (let i = 1; i < samples.length; i++) wPumped += samples[i].fl * ((samples[i].t - samples[i-1].t) / 1000);
                    
                    const lastSample = samples[samples.length-1];
                    const prevSample = samples.length > 1 ? samples[samples.length-2] : lastSample;
                    const dt = (lastSample.t - prevSample.t) / 1000.0;
                    const lastP = lastSample.cp; const lastF = lastSample.fl; const lastW = lastSample.v; const lastVF = lastSample.vf; 
                    
                    // Look Ahead Prep
                    let nextPhaseFirstSample = null;
                    const nextPNum = parseInt(phaseNum) + 1;
                    if (phases[nextPNum] && phases[nextPNum].length > 0) {
                        nextPhaseFirstSample = phases[nextPNum][0];
                    }

                    // Predictive Calculation
                    let predictedW = lastW;
                    if (lastW > 0.1 && !scaleConnectionBrokenPermanently) {
                        let currentRate = (lastVF !== undefined) ? lastVF : lastF;
                        let predictedAdded = currentRate * (scaleDelayMs / 500.0); 
                        if (predictedAdded < 0) predictedAdded = 0; if (predictedAdded > 8.0) predictedAdded = 8.0;
                        predictedW = lastW + predictedAdded;
                    }
                    finalPredictedWeight = predictedW;

                    let predictedPumped = wPumped; 
                    if (lastF > 0) predictedPumped += lastF * (usedSensorDelay / 1000.0);

                    let predictedP = lastP; let predictedF = lastF;
                    if (dt > 0) {
                        const slopeP = (lastP - prevSample.cp) / dt;
                        const slopeF = (lastF - prevSample.fl) / dt;
                        predictedP = lastP + (slopeP * (usedSensorDelay / 1000.0));
                        predictedF = lastF + (slopeF * (usedSensorDelay / 1000.0));
                    }

                    let hitTargets = [];
                    for (let tgt of profilePhase.targets) {
                        if ((tgt.type === 'volumetric' || tgt.type === 'weight') && scaleConnectionBrokenPermanently) continue;

                        let measured = 0; let checkValue = 0; let hit = false;
                        let tolerance = 0;

                        if (tgt.type === 'pressure') { measured = lastP; checkValue = (tgt.operator === 'gte' || tgt.operator === 'lte') ? predictedP : lastP; tolerance = TOL_PRESSURE; }
                        else if (tgt.type === 'flow') { measured = lastF; checkValue = (tgt.operator === 'gte' || tgt.operator === 'lte') ? predictedF : lastF; tolerance = TOL_FLOW; }
                        else if (tgt.type === 'volumetric' || tgt.type === 'weight') { measured = lastW; checkValue = (tgt.operator === 'gte') ? predictedW : lastW; }
                        else if (tgt.type === 'pumped') { measured = wPumped; checkValue = (tgt.operator === 'gte') ? predictedPumped : wPumped; }

                        // 1. Direct Hit
                        if (tgt.operator === 'gte' && measured >= tgt.value) hit = true;
                        if (tgt.operator === 'lte' && measured <= tgt.value) hit = true;
                        
                        // 2. Predictive Hit
                        if (!hit) {
                             if (tgt.operator === 'gte' && checkValue >= tgt.value) hit = true;
                             if (tgt.operator === 'lte' && checkValue <= tgt.value) hit = true;
                        }

                        // 3. Tolerance Hit
                        if (!hit && tolerance > 0) {
                            if (tgt.operator === 'gte' && measured >= tgt.value - tolerance) hit = true;
                            if (tgt.operator === 'lte' && measured <= tgt.value + tolerance) hit = true;
                        }

                        // 4. Next Phase Lookahead
                        if (!hit && nextPhaseFirstSample) {
                            if (tgt.type === 'pressure') { 
                                if (tgt.operator === 'gte' && nextPhaseFirstSample.cp >= tgt.value) hit = true; 
                            } 
                            else if (tgt.type === 'flow') { 
                                if (tgt.operator === 'gte' && nextPhaseFirstSample.fl >= tgt.value) hit = true; 
                            }
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
                        const reasonText = formatStopReason(bestMatch.type);

                        exitReasonBadge = `<br><span class="reason-badge reason-target">${reasonText}</span>`;
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
                case 'tt_se': val = `${statTT.start.toFixed(1)} / ${statTT.end.toFixed(1)}`; break;
                case 'tt_mm': val = `${statTT.min.toFixed(1)} / ${statTT.max.toFixed(1)}`; break;
                case 'tt_avg': val = statTT.avg.toFixed(1); break; 
                case 'w_se': val = `${statW.start.toFixed(1)} / ${statW.end.toFixed(1)}`; break;
                case 'w_mm': val = `${statW.min.toFixed(1)} / ${statW.max.toFixed(1)}`; break;
                case 'w_avg': val = statW.avg.toFixed(1); break;
                case 'tp_se': val = `${statTP.start.toFixed(1)} / ${statTP.end.toFixed(1)}`; break;
                case 'tp_mm': val = `${statTP.min.toFixed(1)} / ${statTP.max.toFixed(1)}`; break;
                case 'tp_avg': val = statTP.avg.toFixed(1); break;
                case 'tf_se': val = `${statTF.start.toFixed(1)} / ${statTF.end.toFixed(1)}`; break;
                case 'tf_mm': val = `${statTF.min.toFixed(1)} / ${statTF.max.toFixed(1)}`; break;
                case 'tf_avg': val = statTF.avg.toFixed(1); break;
                case 'sys_raw': val = gSamples[0].systemInfo?.raw ?? "-"; break; 
                case 'sys_shot_vol': val = (gSamples[0].systemInfo?.shotStartedVolumetric !== undefined) ? ((gSamples[0].systemInfo.shotStartedVolumetric) ? "Yes" : "No") : "-"; break;
                case 'sys_curr_vol': val = (gSamples[0].systemInfo?.currentlyVolumetric !== undefined) ? ((gSamples[0].systemInfo.currentlyVolumetric) ? "Yes" : "No") : "-"; break;
                case 'sys_scale': val = (gSamples[0].systemInfo?.bluetoothScaleConnected !== undefined) ? ((gSamples[0].systemInfo.bluetoothScaleConnected) ? "Yes" : "No") : "-"; break;
                case 'sys_vol_avail': val = (gSamples[0].systemInfo?.volumetricAvailable !== undefined) ? ((gSamples[0].systemInfo.volumetricAvailable) ? "Yes" : "No") : "-"; break;
                case 'sys_ext': val = (gSamples[0].systemInfo?.extendedRecording !== undefined) ? ((gSamples[0].systemInfo.extendedRecording) ? "Yes" : "No") : "-"; break;
            }

            if (col.id === 'weight' && scaleConnectionBrokenPermanently) {
                val = `<span style="font-weight:bold; color:#c0392b; border-bottom:1px dashed #c0392b;">${val}</span><br><span style="font-size:0.8em; color:#e74c3c;">Scale Lost</span>`;
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
                    val += ` <span class="${style}">/ ${tVal}</span>`;
                }
                
                if (col.id === 'weight' && finalPredictedWeight !== null && weightVal > 0.1 && !scaleConnectionBrokenPermanently) {
                    val += `<br><small style="color:#7f8c8d; font-size:0.85em;" title="Predicted weight based on flow rate due to scale lag">(Est. ${finalPredictedWeight.toFixed(1)})</small>`;
                }
            }
            td.innerHTML = val;
            tr.appendChild(td);
        });
        tableBody.appendChild(tr);
    });

    // --- FOOTER ---
    const gStatsP = getMetricStats(gSamples, 'cp'); const gStatsTP = getMetricStats(gSamples, 'tp');
    const gStatsF = getMetricStats(gSamples, 'fl'); const gStatsPF = getMetricStats(gSamples, 'pf');
    const gStatsTF = getMetricStats(gSamples, 'tf'); const gStatsT = getMetricStats(gSamples, 'ct');
    const gStatsTT = getMetricStats(gSamples, 'tt'); const gStatsW = getMetricStats(gSamples, 'v');
    let gDuration = (gSamples[gSamples.length-1].t - gSamples[0].t) / 1000;
    let gWater = 0; for (let i = 1; i < gSamples.length; i++) gWater += gSamples[i].fl * ((gSamples[i].t - gSamples[i-1].t) / 1000);
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
            // FIX: Use gStatsTT here, NOT statTT
            case 'tt_se': val = `${gStatsTT.start.toFixed(1)} / ${gStatsTT.end.toFixed(1)}`; break;
            case 'tt_mm': val = `${gStatsTT.min.toFixed(1)} / ${gStatsTT.max.toFixed(1)}`; break;
            case 'tt_avg': val = gStatsTT.avg.toFixed(1); break; 
            case 'w_se': val = `${gStatsW.start.toFixed(1)} / ${gStatsW.end.toFixed(1)}`; break;
            case 'w_mm': val = `${gStatsW.min.toFixed(1)} / ${gStatsW.max.toFixed(1)}`; break;
            case 'w_avg': val = gStatsW.avg.toFixed(1); break;
            case 'tp_se': val = `${gStatsTP.start.toFixed(1)} / ${gStatsTP.end.toFixed(1)}`; break;
            case 'tp_mm': val = `${gStatsTP.min.toFixed(1)} / ${gStatsTP.max.toFixed(1)}`; break;
            case 'tp_avg': val = gStatsTP.avg.toFixed(1); break;
            case 'tf_se': val = `${gStatsTF.start.toFixed(1)} / ${gStatsTF.end.toFixed(1)}`; break;
            case 'tf_mm': val = `${gStatsTF.min.toFixed(1)} / ${gStatsTF.max.toFixed(1)}`; break;
            case 'tf_avg': val = gStatsTF.avg.toFixed(1); break;
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