// ui-renderer.js (Updated)

// --- Global Chart Instance ---
let myChart = null;

// --- Helper: Generate Icon HTML ---
function getIconHtml(iconName, isWhite = false) {
    if (!iconName) return '';
    const classString = isWhite ? 'ui-icon icon-white' : 'ui-icon';
    return `<img src="ui/assets/${iconName}.svg" class="${classString}" alt="">`; 
}

// --- Column Configuration (Labels now fully written out for Control Panel) ---
// Note: Double symbols (∅) removed from labels to avoid duplication in logic.
export const columnConfig = [
    // Basics
    { id: 'duration', label: 'Duration (s)', type: 'val', group: 'basics', default: true, targetType: 'duration' },
    { id: 'water', label: 'Water Drawn (ml)', type: 'val', group: 'basics', default: true, targetType: 'pumped' },
    { id: 'weight', label: 'Weight (g)', type: 'val', group: 'weight', default: true, targetType: 'weight' }, 
    
    // Pressure
    { id: 'p_se', label: 'Pressure (bar)', type: 'se', group: 'pressure', default: true, targetType: 'pressure' },
    { id: 'p_mm', label: 'Pressure (bar)', type: 'mm', group: 'pressure', default: false },
    { id: 'p_avg', label: 'Pressure (bar)', type: 'avg', group: 'pressure', default: false },
    
    // Target Pressure
    { id: 'tp_se', label: 'Target Pressure', type: 'se', group: 'target_pressure', default: false },
    { id: 'tp_mm', label: 'Target Pressure', type: 'mm', group: 'target_pressure', default: false },
    { id: 'tp_avg', label: 'Target Pressure', type: 'avg', group: 'target_pressure', default: false },
    
    // Flow
    { id: 'f_se', label: 'Flow (ml/s)', type: 'se', group: 'flow', default: true, targetType: 'flow' },
    { id: 'f_mm', label: 'Flow (ml/s)', type: 'mm', group: 'flow', default: false },
    { id: 'f_avg', label: 'Flow (ml/s)', type: 'avg', group: 'flow', default: false },
    
    // Target Flow
    { id: 'tf_se', label: 'Target Flow', type: 'se', group: 'target_flow', default: false },
    { id: 'tf_mm', label: 'Target Flow', type: 'mm', group: 'target_flow', default: false },
    { id: 'tf_avg', label: 'Target Flow', type: 'avg', group: 'target_flow', default: false },
    
    // Puck Flow (Resistance)
    { id: 'pf_se', label: 'Puck Flow (ml/s)', type: 'se', group: 'puckflow', default: true }, 
    { id: 'pf_mm', label: 'Puck Flow (ml/s)', type: 'mm', group: 'puckflow', default: false },
    { id: 'pf_avg', label: 'Puck Flow (ml/s)', type: 'avg', group: 'puckflow', default: false },
    
    // Temperature
    { id: 't_se', label: 'Temperature (℃)', type: 'se', group: 'temp', default: false },
    { id: 't_mm', label: 'Temperature (℃)', type: 'mm', group: 'temp', default: false },
    { id: 't_avg', label: 'Temperature (℃)', type: 'avg', group: 'temp', default: true },
    
    // Target Temp
    { id: 'tt_se', label: 'Target Temp', type: 'se', group: 'target_temp', default: false },
    { id: 'tt_mm', label: 'Target Temp', type: 'mm', group: 'target_temp', default: false },
    { id: 'tt_avg', label: 'Target Temp', type: 'avg', group: 'target_temp', default: false },
    
    // Detailed Weight
    { id: 'w_se', label: 'Weight Details (g)', type: 'se', group: 'weight_det', default: false },
    { id: 'w_mm', label: 'Weight Details (g)', type: 'mm', group: 'weight_det', default: false },
    { id: 'w_avg', label: 'Weight Details (g)', type: 'avg', group: 'weight_det', default: false },
    
    // System Info
    { id: 'sys_raw', label: 'Raw Data Points', type: 'val', group: 'system', default: false },
    { id: 'sys_shot_vol', label: 'Start Volumetric', type: 'bool', group: 'system', default: false },
    { id: 'sys_curr_vol', label: 'Currently Volumetric', type: 'bool', group: 'system', default: false },
    { id: 'sys_scale', label: 'BT Scale Connected', type: 'bool', group: 'system', default: false },
    { id: 'sys_vol_avail', label: 'Volumetric Avail.', type: 'bool', group: 'system', default: false },
    { id: 'sys_ext', label: 'Extended Record', type: 'bool', group: 'system', default: false },
];

export const groups = { 
    basics: "Basic Metrics", 
    pressure: "Pressure (bar)", 
    target_pressure: "Target Pressure (bar)",
    flow: "Pump Flow (ml/s)", 
    target_flow: "Target Flow (ml/s)", 
    puckflow: "Puck Flow (ml/s)", 
    temp: "Temperature (℃)", 
    target_temp: "Target Temp (℃)", 
    weight: "Weight (g)", 
    weight_det: "Weight Details (g)",
    system: "System Info"
};

/**
 * Renders the Header (FileInfo)
 * (Logic remains same, checking exports)
 */
export function renderFileInfo(shot, fileName) {
    // ... [Previous code for renderFileInfo remains exactly the same] ...
    // Just ensuring the existing function body is preserved
    const infoContainer = document.getElementById('file-info-container');
    const extendedContent = document.getElementById('extended-info-content');
    
    if (!shot || !infoContainer) return;

    let profileName = "Manual / Unknown";
    if (shot.profile) {
        if (typeof shot.profile === 'string') profileName = shot.profile;
        else if (shot.profile.title) profileName = shot.profile.title;
        else if (shot.profile.label) profileName = shot.profile.label; 
    }

    let detectedDoseIn = shot.doseIn || shot.bean_weight || 0;
    if (detectedDoseIn == 0 && profileName) {
        const doseMatch = profileName.match(/(\d+(?:\.\d+)?)g\b/i);
        if (doseMatch) {
            detectedDoseIn = parseFloat(doseMatch[1]);
            if (window.currentShotData) window.currentShotData.doseIn = detectedDoseIn;
        }
    }

    let calcDoseOut = shot.doseOut || shot.drink_weight || 0;
    if (!calcDoseOut || parseFloat(calcDoseOut) === 0) {
        if (shot.samples) {
            let maxW = 0;
            shot.samples.forEach(s => {
                const val = s.v !== undefined ? s.v : (s.w !== undefined ? s.w : 0);
                if (val > maxW) maxW = val;
            });
            if (maxW > 0) calcDoseOut = parseFloat(maxW.toFixed(1));
        }
    }
    if ((!shot.doseOut || shot.doseOut == 0) && calcDoseOut > 0 && window.currentShotData) {
        window.currentShotData.doseOut = calcDoseOut;
    }

    let ratio = shot.ratio || 0;
    if ((!ratio || ratio == 0) && detectedDoseIn > 0 && calcDoseOut > 0) {
        ratio = (calcDoseOut / detectedDoseIn).toFixed(1);
        if (window.currentShotData) window.currentShotData.ratio = parseFloat(ratio);
    }

    const idStr = shot.id ? `#${shot.id}` : "";
    const dateStr = shot.timestamp ? new Date(shot.timestamp * 1000).toLocaleString([], {year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute:'2-digit'}) : "";
    const durationStr = shot.samples && shot.samples.length > 0 
        ? ((shot.samples[shot.samples.length-1].t - shot.samples[0].t) / 1000).toFixed(1) + 's' 
        : "0s";
    
    const inStr = detectedDoseIn > 0 ? `In: ${detectedDoseIn}g` : "";
    const outStr = calcDoseOut > 0 ? `Out: ${calcDoseOut}g` : ""; 
    const ratioStr = ratio > 0 ? `1:${ratio}` : "";
    let ratingStr = "Not rated";
    if (shot.rating > 0) ratingStr = `★ ${shot.rating}`;

    const metaParts = [idStr, dateStr, durationStr, inStr, outStr, ratioStr, ratingStr].filter(p => p !== "");
    const metaHtml = metaParts.join(` <span class="meta-separator">•</span> `);
    const chevronIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;

    const headerHtml = `
        <div class="file-info-header">
            <div class="ui-toggle-btn" id="header-toggle-btn">${chevronIcon}</div>
            <div class="header-text-group">
                <div class="header-profile-title">${profileName}</div>
                <div class="header-meta-line">${metaHtml}</div>
            </div>
            <div class="header-actions">
                <button class="header-action-btn export" onclick="window.exportCurrentShot()" title="Export JSON">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </button>
                <button class="header-action-btn delete" onclick="window.unloadShot(event)" title="Close View">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
        </div>
    `;

    const existingContentDiv = extendedContent.cloneNode(true);
    infoContainer.innerHTML = headerHtml;
    infoContainer.appendChild(existingContentDiv);

    const newExtended = document.getElementById('extended-info-content');
    const newToggle = document.getElementById('header-toggle-btn');
    newExtended.style.display = 'none'; 
    newToggle.onclick = () => {
        const isClosed = newExtended.style.display === 'none';
        newExtended.style.display = isClosed ? 'block' : 'none';
        if (isClosed) {
            newToggle.classList.add('open');
            infoContainer.classList.add('expanded');
            renderEditorContent(shot, newExtended, detectedDoseIn, calcDoseOut, ratio);
        } else {
            newToggle.classList.remove('open');
            infoContainer.classList.remove('expanded');
        }
    };
    infoContainer.style.display = 'block';
}

function renderEditorContent(shot, container, dIn, dOut, rat) {
    let noteText = "";
    if (shot.notes) {
        if (typeof shot.notes === 'string') noteText = shot.notes;
        else if (typeof shot.notes === 'object') noteText = shot.notes.body || shot.notes.text || shot.notes.notes || ""; 
    }
    const meta = {
        beanType: shot.beanType || shot.bean_brand || "",
        grindSetting: shot.grindSetting || shot.grinder_setting || "",
        doseIn: dIn, doseOut: dOut, ratio: rat, rating: shot.rating || 0,
        balance: shot.balanceTaste || "balanced", notes: noteText
    };

    container.innerHTML = `
        <div class="editor-grid">
            <div class="editor-group"><label class="editor-label">Bean Type</label><input type="text" class="editor-input" value="${meta.beanType}" onchange="window.updateShotMeta('beanType', this.value)"></div>
            <div class="editor-group"><label class="editor-label">Grind</label><input type="text" class="editor-input" value="${meta.grindSetting}" onchange="window.updateShotMeta('grindSetting', this.value)"></div>
            <div class="editor-group"><label class="editor-label">Dose In (g)</label><input type="number" step="0.1" class="editor-input" value="${meta.doseIn}" onchange="window.updateShotMeta('doseIn', this.value)"></div>
            <div class="editor-group"><label class="editor-label">Dose Out (g)</label><input type="number" step="0.1" class="editor-input" value="${meta.doseOut}" onchange="window.updateShotMeta('doseOut', this.value)"></div>
            <div class="editor-group"><label class="editor-label">Ratio</label><input type="number" id="meta-ratio" class="editor-input" value="${meta.ratio}" readonly style="background:#f9f9f9; color:#95a5a6;"></div>
            <div class="editor-group"><label class="editor-label">Rating</label><input type="number" min="0" max="5" step="1" class="editor-input" value="${meta.rating}" onchange="window.updateShotMeta('rating', this.value)"></div>
            <div class="editor-group"><label class="editor-label">Balance</label><select class="editor-select" onchange="window.updateShotMeta('balanceTaste', this.value)"><option value="sour" ${meta.balance === 'sour' ? 'selected' : ''}>Sour</option><option value="balanced" ${meta.balance === 'balanced' ? 'selected' : ''}>Balanced</option><option value="bitter" ${meta.balance === 'bitter' ? 'selected' : ''}>Bitter</option></select></div>
        </div>
        <div class="editor-group" style="margin-top:10px;"><label class="editor-label">Notes</label><textarea class="editor-textarea" maxlength="200" onchange="window.updateShotMeta('notes', this.value)">${meta.notes}</textarea></div>
        <div class="editor-group" style="margin-top:20px; padding-top:15px; border-top:1px dashed #eee;">
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap:10px; font-size:0.8em; color:#95a5a6;">
                <div>ID: <strong>${shot.id || "-"}</strong></div>
                <div>Profile ID: <strong>${shot.profileId || "-"}</strong></div>
                <div>Ver: <strong>${shot.version || "-"}</strong></div>
                <div>Interval: <strong>${shot.sampleInterval || "-"} ms</strong></div>
                <div>Vol: <strong>${shot.volume || "-"} ml</strong></div>
            </div>
        </div>
    `;
}

/**
 * Renders the Analysis Table with Professional Grid & External Status Bar
 * UPDATED: Accepts activeColumnIds to preserve column visibility state during re-renders
 */
export function renderTable(results, activeCols = null) {
    const tableHead = document.getElementById('table-head');
    const tableBody = document.getElementById('table-body');
    const tableFoot = document.getElementById('table-foot');
    const legend = document.getElementById('table-legend'); 
    const resultArea = document.getElementById('result-area');
    const chartWrapper = document.getElementById('chart-wrapper');
    const statusBar = document.getElementById('analysis-status-bar');

    resultArea.style.display = 'block';
    chartWrapper.style.display = 'block';
    tableHead.innerHTML = ''; tableBody.innerHTML = ''; tableFoot.innerHTML = '';
    
    // --- 1. Render Status Bar ---
    if (statusBar) {
        statusBar.innerHTML = '';
        const modeText = results.isBrewByWeight ? "Brew by Weight" : "Brew by Time";
        const modeClass = results.isBrewByWeight ? "badge-brew-mode" : "badge-brew-mode time";
        statusBar.innerHTML += `<span class="analysis-status-badge ${modeClass}">${modeText}</span>`;

        if (results.isBrewByWeight && results.globalScaleLost) {
            statusBar.innerHTML += `<span class="analysis-status-badge badge-scale-lost">Scale Lost</span>`;
        }

        if (results.isAutoAdjusted) {
            statusBar.innerHTML += `<span class="analysis-status-badge badge-auto-adjust" title="System delay adjusted to 800ms for analysis">Auto-Adjust Active</span>`;
        }
    }

    // --- 2. Render Header ---
    let trHead = document.createElement('tr');
    trHead.innerHTML = `<th class="phase-col">Phase</th>`;
    
    columnConfig.forEach(col => {
        const th = document.createElement('th');
        
        // BUG FIX LOGIC:
        // If activeCols set is provided, check if ID is in it.
        // If not provided (null), fall back to col.default.
        const isVisible = activeCols ? activeCols.has(col.id) : col.default;
        
        th.className = `col-${col.id} group-${col.group} ${isVisible ? '' : 'hidden-col'}`;
        
        let sub = "";
        if (col.type === 'se') sub = "Start / End";
        else if (col.type === 'mm') sub = "Min / Max";
        else if (col.type === 'avg') sub = "∅ / t.w."; 
        
        let displayLabel = col.label;
        if (col.group === 'temp' || col.group === 'target_temp') {
            displayLabel = "℃"; 
        }

        th.innerHTML = displayLabel + (sub ? `<br><small style="font-weight:400; color:#666;">${sub}</small>` : "");
        trHead.appendChild(th);
    });
    tableHead.appendChild(trHead);

    // --- 3. Render Body ---
    results.phases.forEach(p => {
        const tr = document.createElement('tr');
        
        const exitBadge = p.exit.reason ? `<br><span class="reason-badge reason-target">${p.exit.reason}</span>` : "";
        const nameHtml = p.name 
            ? `<span class="phase-name">${p.name}</span><span class="phase-num">Phase ${p.number}</span>${exitBadge}` 
            : `<span class="phase-name">Phase ${p.number}</span>`;
        const tdPhase = document.createElement('td');
        tdPhase.className = "phase-col";
        tdPhase.innerHTML = nameHtml;
        tr.appendChild(tdPhase);

        columnConfig.forEach(col => {
            const td = document.createElement('td');
            
            // BUG FIX LOGIC applied to Body as well
            const isVisible = activeCols ? activeCols.has(col.id) : col.default;
            td.className = `col-${col.id} group-${col.group} ${isVisible ? '' : 'hidden-col'}`;
            
            let val = "-";
            const s = p.stats;
            const sys = results.rawSamples[0].systemInfo || {};

            // (Switch Case Block remains identical to your previous code)
            switch(col.id) {
                case 'duration': val = p.duration.toFixed(1); break;
                case 'water': val = p.water.toFixed(1); break;
                case 'weight': val = p.weight.toFixed(1); break;
                case 'p_se': val = `${s.p.start.toFixed(1)} / ${s.p.end.toFixed(1)}`; break;
                case 'p_mm': val = `${s.p.min.toFixed(1)} / ${s.p.max.toFixed(1)}`; break;
                case 'p_avg': val = s.p.avg.toFixed(1); break;
                case 'f_se': val = `${s.f.start.toFixed(1)} / ${s.f.end.toFixed(1)}`; break;
                case 'f_mm': val = `${s.f.min.toFixed(1)} / ${s.f.max.toFixed(1)}`; break;
                case 'f_avg': val = s.f.avg.toFixed(1); break;
                case 'pf_se': val = `${s.pf.start.toFixed(1)} / ${s.pf.end.toFixed(1)}`; break;
                case 'pf_mm': val = `${s.pf.min.toFixed(1)} / ${s.pf.max.toFixed(1)}`; break;
                case 'pf_avg': val = s.pf.avg.toFixed(1); break;
                case 't_se': val = `${s.t.start.toFixed(1)} / ${s.t.end.toFixed(1)}`; break;
                case 't_mm': val = `${s.t.min.toFixed(1)} / ${s.t.max.toFixed(1)}`; break;
                case 't_avg': val = s.t.avg.toFixed(1); break;
                case 'tt_se': val = `${s.tt.start.toFixed(1)} / ${s.tt.end.toFixed(1)}`; break;
                case 'tt_mm': val = `${s.tt.min.toFixed(1)} / ${s.tt.max.toFixed(1)}`; break;
                case 'tt_avg': val = s.tt.avg.toFixed(1); break;
                case 'w_se': val = `${s.w.start.toFixed(1)} / ${s.w.end.toFixed(1)}`; break;
                case 'w_mm': val = `${s.w.min.toFixed(1)} / ${s.w.max.toFixed(1)}`; break;
                case 'w_avg': val = s.w.avg.toFixed(1); break;
                case 'tp_se': val = `${s.tp.start.toFixed(1)} / ${s.tp.end.toFixed(1)}`; break;
                case 'tp_mm': val = `${s.tp.min.toFixed(1)} / ${s.tp.max.toFixed(1)}`; break;
                case 'tp_avg': val = s.tp.avg.toFixed(1); break;
                case 'tf_se': val = `${s.tf.start.toFixed(1)} / ${s.tf.end.toFixed(1)}`; break;
                case 'tf_mm': val = `${s.tf.min.toFixed(1)} / ${s.tf.max.toFixed(1)}`; break;
                case 'tf_avg': val = s.tf.avg.toFixed(1); break;
                case 'sys_raw': val = sys.raw ?? "-"; break; 
                case 'sys_shot_vol': val = (sys.shotStartedVolumetric !== undefined) ? ((sys.shotStartedVolumetric) ? "Yes" : "No") : "-"; break;
                case 'sys_curr_vol': val = (sys.currentlyVolumetric !== undefined) ? ((sys.currentlyVolumetric) ? "Yes" : "No") : "-"; break;
                case 'sys_scale': val = (sys.bluetoothScaleConnected !== undefined) ? ((sys.bluetoothScaleConnected) ? "Yes" : "No") : "-"; break;
                case 'sys_vol_avail': val = (sys.volumetricAvailable !== undefined) ? ((sys.volumetricAvailable) ? "Yes" : "No") : "-"; break;
                case 'sys_ext': val = (sys.extendedRecording !== undefined) ? ((sys.extendedRecording) ? "Yes" : "No") : "-"; break;
            }

            if (col.id === 'weight' && p.scalePermanentlyLost) {
                val = `<span style="font-weight:bold; color:#c0392b; border-bottom:1px dashed #c0392b;">${val}</span><br><span style="font-size:0.8em; color:#e74c3c;">Scale Lost</span>`;
            }

            if (p.profilePhase && col.targetType) {
                let tVal = null;
                let isTrigger = (p.exit.type === col.targetType);
                let effectiveTargetType = col.targetType;
                if (col.id === 'weight') effectiveTargetType = 'volumetric'; 

                if (col.targetType === 'duration') {
                    tVal = p.profilePhase.duration + "s";
                } else if (p.profilePhase.targets) {
                    let matched = p.profilePhase.targets.find(t => t.type === effectiveTargetType);
                    if (!matched && col.targetType === 'pumped') matched = p.profilePhase.targets.find(t => t.type === 'pumped');
                    if (!matched && col.targetType === 'weight') matched = p.profilePhase.targets.find(t => t.type === 'volumetric');
                    if (matched) tVal = (matched.operator === 'gte' ? '> ' : '< ') + matched.value;
                }
                
                if (tVal) {
                    if (p.exit.type === 'volumetric' && col.id === 'weight') isTrigger = true;
                    const style = isTrigger ? "trigger-hit" : "val-target";
                    val += ` <span class="${style}">/ ${tVal}</span>`;
                }
                
                if (col.id === 'weight' && p.prediction.finalWeight !== null && p.weight > 0.1 && !p.scalePermanentlyLost) {
                    val += `<br><small style="color:#7f8c8d; font-size:0.85em;" title="Predicted weight based on flow rate due to scale lag">(Est. ${p.prediction.finalWeight.toFixed(1)})</small>`;
                }
            }
            td.innerHTML = val;
            tr.appendChild(td);
        });
        tableBody.appendChild(tr);
    });

    // --- 4. Footer ---
    const trFoot = document.createElement('tr');
    const tdFootPhase = document.createElement('td');
    tdFootPhase.className = "phase-col"; tdFootPhase.innerText = "Total / Avg";
    trFoot.appendChild(tdFootPhase);
    
    const ts = results.total;
    const sys = results.rawSamples[0].systemInfo || {};

    columnConfig.forEach(col => {
        const td = document.createElement('td');
        // BUG FIX LOGIC applied to Footer
        const isVisible = activeCols ? activeCols.has(col.id) : col.default;
        td.className = `col-${col.id} group-${col.group} ${isVisible ? '' : 'hidden-col'}`;
        
        let val = "-";
        // (Switch Case identical to existing code)
        switch(col.id) {
            case 'duration': val = ts.duration.toFixed(1); break;
            case 'water': val = ts.water.toFixed(1); break;
            case 'weight': val = ts.weight.toFixed(1); break;
            case 'p_se': val = `${ts.p.start.toFixed(1)} / ${ts.p.end.toFixed(1)}`; break;
            case 'p_mm': val = `${ts.p.min.toFixed(1)} / ${ts.p.max.toFixed(1)}`; break;
            case 'p_avg': val = ts.p.avg.toFixed(1); break;
            case 'f_se': val = `${ts.f.start.toFixed(1)} / ${ts.f.end.toFixed(1)}`; break;
            case 'f_mm': val = `${ts.f.min.toFixed(1)} / ${ts.f.max.toFixed(1)}`; break;
            case 'f_avg': val = ts.f.avg.toFixed(1); break;
            case 'pf_se': val = `${ts.pf.start.toFixed(1)} / ${ts.pf.end.toFixed(1)}`; break;
            case 'pf_mm': val = `${ts.pf.min.toFixed(1)} / ${ts.pf.max.toFixed(1)}`; break;
            case 'pf_avg': val = ts.pf.avg.toFixed(1); break;
            case 't_se': val = `${ts.t.start.toFixed(1)} / ${ts.t.end.toFixed(1)}`; break;
            case 't_mm': val = `${ts.t.min.toFixed(1)} / ${ts.t.max.toFixed(1)}`; break;
            case 't_avg': val = ts.t.avg.toFixed(1); break;
            case 'tt_se': val = `${ts.tt.start.toFixed(1)} / ${ts.tt.end.toFixed(1)}`; break;
            case 'tt_mm': val = `${ts.tt.min.toFixed(1)} / ${ts.tt.max.toFixed(1)}`; break;
            case 'tt_avg': val = ts.tt.avg.toFixed(1); break;
            case 'w_se': val = `${ts.w.start.toFixed(1)} / ${ts.w.end.toFixed(1)}`; break;
            case 'w_mm': val = `${ts.w.min.toFixed(1)} / ${ts.w.max.toFixed(1)}`; break;
            case 'w_avg': val = ts.w.avg.toFixed(1); break;
            case 'tp_se': val = `${ts.tp.start.toFixed(1)} / ${ts.tp.end.toFixed(1)}`; break;
            case 'tp_mm': val = `${ts.tp.min.toFixed(1)} / ${ts.tp.max.toFixed(1)}`; break;
            case 'tp_avg': val = ts.tp.avg.toFixed(1); break;
            case 'tf_se': val = `${ts.tf.start.toFixed(1)} / ${ts.tf.end.toFixed(1)}`; break;
            case 'tf_mm': val = `${ts.tf.min.toFixed(1)} / ${ts.tf.max.toFixed(1)}`; break;
            case 'tf_avg': val = ts.tf.avg.toFixed(1); break;
            case 'sys_raw': val = sys.raw ?? "-"; break; 
            case 'sys_shot_vol': val = (sys.shotStartedVolumetric !== undefined) ? ((sys.shotStartedVolumetric) ? "Yes" : "No") : "-"; break;
            case 'sys_curr_vol': val = (sys.currentlyVolumetric !== undefined) ? ((sys.currentlyVolumetric) ? "Yes" : "No") : "-"; break;
            case 'sys_scale': val = (sys.bluetoothScaleConnected !== undefined) ? ((sys.bluetoothScaleConnected) ? "Yes" : "No") : "-"; break;
            case 'sys_vol_avail': val = (sys.volumetricAvailable !== undefined) ? ((sys.volumetricAvailable) ? "Yes" : "No") : "-"; break;
            case 'sys_ext': val = (sys.extendedRecording !== undefined) ? ((sys.extendedRecording) ? "Yes" : "No") : "-"; break;
        }
        td.innerText = val;
        trFoot.appendChild(td);
    });
    tableFoot.appendChild(trFoot);

    // --- 5. Legend ---
    if (legend) {
        legend.innerHTML = `
            <div class="legend-item"><span class="legend-symbol">∅</span> <span>Average</span></div>
            <div class="legend-item"><span class="legend-symbol">t.w.</span> <span>Time-Weighted</span></div>
        `;
    }
}

/**
 * Renders the Chart.js graph with GaggiMate colors using Raw Shot Data
 */
export function renderChart(results, shotData) {
    const ctx = document.getElementById('shotChart');
    if (!ctx) return;
    
    if (!shotData || !shotData.samples || shotData.samples.length === 0) {
        console.warn("No samples found for chart.");
        return;
    }
    document.getElementById('chart-wrapper').style.display = 'block';

    if (window.myChart instanceof Chart) {
        window.myChart.destroy();
    }

    const COLORS = {
        temp: '#F0561D',        
        tempTarget: '#731F00',  
        pressure: '#0066CC',    
        flow: '#63993D',        
        puckFlow: '#204D00',    
        weight: '#8B5CF6',      
        weightFlow: '#4b2e8d'   
    };

    const s = shotData.samples;
    const series = {
        pressure: [], flow: [], temp: [], weight: [],
        targetPressure: [], targetFlow: [], targetTemp: []
    };
    
    const getVal = (item, keys) => {
        for (let k of keys) {
            if (item[k] !== undefined) return item[k];
        }
        return null;
    };

    s.forEach(d => {
        const t = (d.t || 0) / 1000; 
        const press = getVal(d, ['cp', 'p', 'pressure']);
        const flow = getVal(d, ['fl', 'f', 'flow']);
        const temp = getVal(d, ['ct', 't', 'temperature']);
        const weight = getVal(d, ['v', 'w', 'weight', 'm']); 
        
        const tPress = getVal(d, ['tp', 'target_pressure']);
        const tFlow = getVal(d, ['tf', 'target_flow']);
        const tTemp = getVal(d, ['tt', 'tr', 'target_temperature']);

        if (press !== null) series.pressure.push({ x: t, y: press });
        if (flow !== null) series.flow.push({ x: t, y: flow });
        if (temp !== null) series.temp.push({ x: t, y: temp });
        if (weight !== null) series.weight.push({ x: t, y: weight });
        
        if (tPress !== null) series.targetPressure.push({ x: t, y: tPress });
        if (tFlow !== null) series.targetFlow.push({ x: t, y: tFlow });
        if (tTemp !== null) series.targetTemp.push({ x: t, y: tTemp });
    });

    const hasWeight = series.weight.some(pt => pt.y > 0);

    const datasets = [
        { label: 'Pressure (bar)', data: series.pressure, borderColor: COLORS.pressure, backgroundColor: COLORS.pressure, yAxisID: 'y', pointRadius: 0, borderWidth: 2, tension: 0.2 },
        { label: 'Flow (ml/s)', data: series.flow, borderColor: COLORS.flow, backgroundColor: COLORS.flow, yAxisID: 'y', pointRadius: 0, borderWidth: 2, tension: 0.2 },
        { label: 'Temp (℃)', data: series.temp, borderColor: COLORS.temp, backgroundColor: COLORS.temp, yAxisID: 'y1', pointRadius: 0, borderWidth: 2, tension: 0.2 },
        { label: 'Weight (g)', data: series.weight, borderColor: COLORS.weight, backgroundColor: COLORS.weight, yAxisID: 'y2', pointRadius: 0, borderWidth: 2, tension: 0.2, hidden: !hasWeight },
        { label: 'Target Pressure', data: series.targetPressure, borderColor: COLORS.pressure, borderDash: [5, 5], yAxisID: 'y', pointRadius: 0, borderWidth: 1, fill: false, tension: 0 },
        { label: 'Target Flow', data: series.targetFlow, borderColor: COLORS.flow, borderDash: [5, 5], yAxisID: 'y', pointRadius: 0, borderWidth: 1, fill: false, tension: 0 },
        { label: 'Target Temp', data: series.targetTemp, borderColor: COLORS.tempTarget, borderDash: [5, 5], yAxisID: 'y1', pointRadius: 0, borderWidth: 1, fill: false, tension: 0 }
    ];

    window.myChart = new Chart(ctx, {
        type: 'line',
        data: { datasets: datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8 } },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null) label += context.parsed.y.toFixed(2);
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: { type: 'linear', position: 'bottom', title: { display: true, text: 'Time (s)' }, ticks: { stepSize: 5 } },
                y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Pressure (bar) / Flow (ml/s)' }, min: 0 },
                y1: { type: 'linear', display: true, position: 'right', title: { display: true, text: 'Temperature (℃)' }, grid: { drawOnChartArea: false } },
                y2: { type: 'linear', display: hasWeight ? 'auto' : false, position: 'right', title: { display: true, text: 'Weight (g)' }, grid: { drawOnChartArea: false } }
            }
        }
    });
}