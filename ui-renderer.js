// ui-renderer.js

// --- Global Chart Instance ---
let myChart = null;

// --- Helper: Generate Icon HTML ---
function getIconHtml(iconName, isWhite = false) {
    if (!iconName) return '';
    const classString = isWhite ? 'ui-icon icon-white' : 'ui-icon';
    return `<img src="ui/assets/${iconName}.svg" class="${classString}" alt="">`; 
}

// --- Column Configuration (Exportiert für App.js Checkboxen) ---
export const columnConfig = [
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

export const groups = { 
    basics: "Basic Metrics", pressure: "Pressure (bar)", target_pressure: "Target Pressure (bar)",
    flow: "Pump Flow (ml/s)", target_flow: "Target Flow (ml/s)", puckflow: "Puck Flow (ml/s)", 
    temp: "Temperature (°C)", target_temp: "Target Temp (°C)", weight_det: "Weight Details (g)", system: "System Info"
};

export function renderFileInfo(data, filename) {
    const container = document.getElementById('file-info-container');
    const text = document.getElementById('file-info-text');
    const extended = document.getElementById('extended-info-content');
    const btn = document.getElementById('toggle-info-btn');
    
    container.style.display = 'block';
    text.innerHTML = `<strong>File:</strong> ${filename} &nbsp;|&nbsp; <strong>Profile:</strong> ${data.profile || 'Unknown'} &nbsp;|&nbsp; <strong>Date:</strong> ${new Date(data.timestamp * 1000).toLocaleString('en-US')}`;
    
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
    extended.innerHTML = html;
    extended.style.display = 'none'; 
    btn.innerText = "More Info";
}

export function renderTable(results) {
    const tableHead = document.getElementById('table-head');
    const tableBody = document.getElementById('table-body');
    const tableFoot = document.getElementById('table-foot');
    const resultArea = document.getElementById('result-area');
    const chartWrapper = document.getElementById('chart-wrapper');

    resultArea.style.display = 'block';
    chartWrapper.style.display = 'block';
    tableHead.innerHTML = ''; tableBody.innerHTML = ''; tableFoot.innerHTML = '';

    // --- Header ---
    let modeLabel = results.isBrewByWeight 
        ? `<span style="display:inline-block; margin-top:4px; padding:2px 6px; border-radius:4px; background:#e8f8f5; color:#16a085; font-size:0.8em; border:1px solid #a3e4d7;">Brew by Weight</span>` 
        : `<span style="display:inline-block; margin-top:4px; padding:2px 6px; border-radius:4px; background:#f4f6f7; color:#7f8c8d; font-size:0.8em; border:1px solid #bdc3c7;">Brew by Time</span>`;

    if (results.isBrewByWeight && results.globalScaleLost) {
        modeLabel += `<br><span style="display:inline-block; margin-top:2px; padding:2px 6px; border-radius:4px; background:#fadbd8; color:#c0392b; font-size:0.8em; border:1px solid #e6b0aa; font-weight:bold;">Scale Lost</span>`;
    }

    if (results.isAutoAdjusted) {
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

    // --- Body ---
    results.phases.forEach(p => {
        const tr = document.createElement('tr');
        
        // Phase Name Column
        const exitBadge = p.exit.reason ? `<br><span class="reason-badge reason-target">${p.exit.reason}</span>` : "";
        const nameHtml = p.name 
            ? `<span class="phase-name">${p.name}</span><span class="phase-num">Phase ${p.number}</span>${exitBadge}` 
            : `<span class="phase-name">Phase ${p.number}</span>`;
        const tdPhase = document.createElement('td');
        tdPhase.className = "phase-col";
        tdPhase.innerHTML = nameHtml;
        tr.appendChild(tdPhase);

        // Data Columns
        columnConfig.forEach(col => {
            const td = document.createElement('td');
            td.className = `col-${col.id} group-${col.group} ${col.default ? '' : 'hidden-col'}`;
            let val = "-";
            const s = p.stats;
            const sys = results.rawSamples[0].systemInfo || {};

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

            // Target Values
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

    // --- Footer ---
    const trFoot = document.createElement('tr');
    const tdFootPhase = document.createElement('td');
    tdFootPhase.className = "phase-col"; tdFootPhase.innerText = "Total / Avg";
    trFoot.appendChild(tdFootPhase);
    
    const ts = results.total;
    const sys = results.rawSamples[0].systemInfo || {};

    columnConfig.forEach(col => {
        const td = document.createElement('td');
        td.className = `col-${col.id} group-${col.group} ${col.default ? '' : 'hidden-col'}`;
        let val = "-";
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
}

export function renderChart(results) {
    const ctx = document.getElementById('shotChart').getContext('2d');
    if (myChart) myChart.destroy();
    
    const cd = { times: [], pressure: [], targetPressure: [], flow: [], targetFlow: [], pumpFlow: [], weight: [], temp: [], targetTemp: [] };
    const globalStartTime = results.startTime;

    results.rawSamples.forEach(s => {
        cd.times.push(((s.t - globalStartTime) / 1000).toFixed(2));
        cd.pressure.push(s.cp);
        cd.targetPressure.push(s.tp !== undefined ? s.tp : null);
        cd.flow.push(s.fl); 
        cd.targetFlow.push(s.tf !== undefined ? s.tf : null);
        cd.pumpFlow.push(s.pf !== undefined ? s.pf : null);
        cd.weight.push(s.v);
        cd.temp.push(s.ct);
        cd.targetTemp.push(s.tt !== undefined ? s.tt : null);
    });

    const colPress = 'rgb(41, 128, 185)'; const colFlow = 'rgb(22, 160, 133)'; const colTemp = 'rgb(192, 57, 43)'; const colWeight = 'rgb(211, 84, 0)'; const colPuck = 'rgb(142, 68, 173)';
    
    const phaseBackgroundPlugin = {
        id: 'phaseBackgrounds',
        beforeDraw: (chart) => {
            const { ctx, chartArea: { top, bottom }, scales: { x } } = chart;
            ctx.save(); ctx.font = 'bold 12px sans-serif'; ctx.textBaseline = 'middle'; 
            results.phases.forEach((phase, index) => {
                const startX = x.getPixelForValue(phase.start); 
                const endX = x.getPixelForValue(phase.end);
                const width = endX - startX;
                ctx.fillStyle = index % 2 === 0 ? 'rgba(0,0,0,0.02)' : 'rgba(0,0,0,0.06)';
                ctx.fillRect(startX, top, width, bottom - top);
                if (width > 12) { 
                    ctx.save(); ctx.fillStyle = '#7f8c8d'; ctx.translate(startX + (width / 2), top + 10); ctx.rotate(Math.PI / 2); ctx.textAlign = 'left'; ctx.fillText(phase.displayName, 0, 0); ctx.restore();
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