/**
 * UI Controls Rendering (Columns & Presets)
 */
import { DB_KEYS } from './config.js';
import { appState } from './state.js';
import { columnConfig, groups } from './ui-renderer.js';

export function renderControls(analysisCallback) {
    const wrapper = document.getElementById('controls-area');
    if (!wrapper) return;

    // 1. Latency Settings
    let settingsDiv = document.getElementById('analysis-settings');
    if (!settingsDiv) {
         settingsDiv = document.createElement('div');
         settingsDiv.id = 'analysis-settings';
         settingsDiv.className = 'controls-box'; 
         settingsDiv.innerHTML = `
            <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 20px; font-size: 0.9em;">
                <h4 style="margin: 0; color: #34495e; font-weight:600;">Latency Settings</h4>
                <div style="display: flex; align-items: center; gap: 5px;">
                    <label style="color:#555;">Scale:</label> <input type="number" id="predictive-scale-delay" value="800" step="50" style="width: 50px; padding:4px; border:1px solid #ccc; border-radius:4px;"> ms
                </div>
                <div style="display: flex; align-items: center; gap: 5px;">
                    <label style="color:#555;">System:</label> <input type="number" id="predictive-sensor-delay" value="200" step="50" style="width: 50px; padding:4px; border:1px solid #ccc; border-radius:4px;"> ms
                    <label style="cursor:pointer; user-select:none; display:flex; align-items:center;"><input type="checkbox" id="auto-sensor-delay" ${appState.isSensorDelayAuto ? 'checked' : ''} style="margin-right:4px;"> Auto</label>
                </div>
            </div>`;
    }
    settingsDiv.style.display = 'block';

    // 2. DISPLAYED COLUMNS
    let columnsBox = document.getElementById('columns-control-box');
    if (!columnsBox) {
        columnsBox = document.createElement('div');
        columnsBox.id = 'columns-control-box';
        columnsBox.className = 'controls-box';
        
        const chevronIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
        const trashIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
        
        // Icons for Footer
        const resetIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg>`;
        const plusIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;

        // Fetch Fav Name
        const presets = JSON.parse(localStorage.getItem(DB_KEYS.PRESETS) || '[]');
        const fav = presets.find(p => p.isFavorite);
        const favLabel = fav ? `★ ${fav.name}` : `★ Fav`;

        const header = document.createElement('div');
        header.className = 'controls-header-row';
        header.onclick = (e) => {
            if(e.target.closest('.preset-toolbar') || e.target.tagName === 'SELECT' || e.target.tagName === 'BUTTON') {
                e.stopPropagation();
                return;
            }
            toggleGrid();
        };

        // HEADER HTML
        header.innerHTML = `
            <div class="ui-toggle-btn" id="col-toggle-btn">${chevronIcon}</div>
            <div class="controls-title">Displayed Columns</div>
            <div class="controls-spacer"></div>
            <div class="preset-toolbar">
                <button class="btn-preset fav" onclick="window.applyFavoritePreset()" title="Load My Favorite">${favLabel}</button>
                <button class="btn-preset" onclick="window.applyStandardPreset()" title="Load Standard (User or Factory)">Standard</button>
                <select id="preset-select" class="preset-select" onchange="window.handlePresetChange(this.value)">
                    <option value="" disabled selected>Presets...</option>
                </select>
                <button id="btn-del-preset" class="btn-preset-del" title="Delete selected preset" onclick="window.deleteCurrentPreset()">${trashIcon}</button>
            </div>
        `;
        
        const grid = document.createElement('div');
        grid.id = 'controls-grid';
        grid.className = 'controls-grid collapsed'; 

        // FOOTER HTML
        const footer = document.createElement('div');
        footer.id = 'controls-footer';
        footer.className = 'controls-footer';
        
        footer.innerHTML = `
            <button class="btn-footer-action standard" onclick="window.saveCurrentAsStandard()" title="Save current selection as my new Standard">
                Save as Standard
            </button>
            
            <div class="footer-actions-right">
                <button class="btn-footer-icon reset" onclick="window.applyFactoryReset()" title="Reset to Factory Defaults">
                    ${resetIcon}
                </button>
                <button class="btn-footer-icon add" onclick="window.saveCurrentAsPreset()" title="Save as new Preset">
                    ${plusIcon}
                </button>
            </div>
        `;
        
        columnsBox.appendChild(header);
        columnsBox.appendChild(grid);
        columnsBox.appendChild(footer); 
        footer.style.display = 'none';

        wrapper.innerHTML = ''; 
        wrapper.appendChild(columnsBox);
        if (settingsDiv) {
             wrapper.appendChild(settingsDiv);
             attachLatencyListeners(analysisCallback);
        }
    }

    // 3. Render Checkboxes
    if (appState.activeColumnIds.size === 0) {
        const userStd = localStorage.getItem(DB_KEYS.USER_STANDARD);
        if (userStd) {
            const cols = JSON.parse(userStd);
            cols.forEach(id => appState.activeColumnIds.add(id));
        } else {
            if (columnConfig && Array.isArray(columnConfig)) {
                columnConfig.forEach(col => { if (col.default) appState.activeColumnIds.add(col.id); });
            }
        }
    }

    const grid = document.getElementById('controls-grid');
    grid.innerHTML = ''; 
    
    const grouped = {};
    if (columnConfig && Array.isArray(columnConfig)) {
        columnConfig.forEach(col => {
            if (!grouped[col.group]) grouped[col.group] = [];
            grouped[col.group].push(col);
        });
    }

    Object.keys(grouped).forEach(key => {
        const div = document.createElement('div');
        div.className = `control-group group-${key}`;
        div.innerHTML = `<h4>${groups[key] || key}</h4>`;
        
        grouped[key].forEach(col => {
            const lbl = document.createElement('label');
            lbl.className = 'checkbox-label';
            
            let suffix = "";
            if (col.type === 'se') suffix = " <small style='color:#95a5a6'>Start/End</small>";
            else if (col.type === 'mm') suffix = " <small style='color:#95a5a6'>Min/Max</small>";
            else if (col.type === 'avg') suffix = " <small style='color:#95a5a6'>Avg</small>";
            
            const isChecked = appState.activeColumnIds.has(col.id);
            lbl.innerHTML = `<input type="checkbox" id="chk-${col.id}" ${isChecked ? 'checked' : ''}> ${col.label}${suffix}`;
            div.appendChild(lbl);
            
            setTimeout(() => {
                const cb = document.getElementById(`chk-${col.id}`);
                if (cb) cb.onchange = (e) => toggleColumn(col.id, e.target.checked);
            }, 0);
        });
        grid.appendChild(div);
    });

    if (columnConfig) columnConfig.forEach(col => toggleColumn(col.id, appState.activeColumnIds.has(col.id), false));
    refreshPresetDropdown();
}

function attachLatencyListeners(analysisCallback) {
    const scaleInput = document.getElementById('predictive-scale-delay');
    const sensorInput = document.getElementById('predictive-sensor-delay');
    const autoCheck = document.getElementById('auto-sensor-delay');
    
    if(scaleInput) scaleInput.onchange = analysisCallback;
    if(sensorInput) sensorInput.onchange = analysisCallback;
    if(autoCheck) autoCheck.onchange = (e) => {
        appState.isSensorDelayAuto = e.target.checked;
        if(sensorInput) sensorInput.disabled = appState.isSensorDelayAuto;
        analysisCallback();
    };
}

export function toggleColumn(id, isChecked, updateTable = true) {
    if (isChecked) appState.activeColumnIds.add(id);
    else appState.activeColumnIds.delete(id);

    const chk = document.getElementById(`chk-${id}`);
    if (chk) chk.checked = isChecked;

    document.querySelectorAll(`.col-${id}`).forEach(el => {
        if (isChecked) el.classList.remove('hidden-col');
        else el.classList.add('hidden-col');
    });
}

function toggleGrid() {
    const gridEl = document.getElementById('controls-grid');
    const footerEl = document.getElementById('controls-footer'); 
    const btn = document.getElementById('col-toggle-btn');
    const isCollapsed = gridEl.classList.contains('collapsed');
    
    if (isCollapsed) { 
        gridEl.classList.remove('collapsed'); 
        btn.classList.add('open'); 
        if(footerEl) footerEl.style.display = 'flex'; 
    } else { 
        gridEl.classList.add('collapsed'); 
        btn.classList.remove('open'); 
        if(footerEl) footerEl.style.display = 'none'; 
    }
}

export function refreshPresetDropdown() {
    const select = document.getElementById('preset-select');
    if (!select) return;
    
    const presets = JSON.parse(localStorage.getItem(DB_KEYS.PRESETS) || '[]');
    select.innerHTML = `<option value="" disabled selected>Presets...</option>`;
    
    presets.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name + (p.isFavorite ? ' ★' : '');
        select.appendChild(opt);
    });
}

export function applyPresetData(preset) {
    appState.activeColumnIds.clear();
    preset.columns.forEach(id => appState.activeColumnIds.add(id));
    columnConfig.forEach(col => {
        toggleColumn(col.id, appState.activeColumnIds.has(col.id));
    });
}