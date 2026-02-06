/**
 * Deep Dive Shot Analyzer - Main Application Controller
 * Orchestrates modules: State, Storage, Library UI, Controls UI, Analysis.
 */
import { calculateShotMetrics, detectAutoDelay } from './shot-analysis.js';
import { renderFileInfo, renderTable, renderChart, columnConfig } from './ui-renderer.js';

// New Modules
import { DB_KEYS, cleanName } from './config.js';
import { appState } from './state.js';
import * as Storage from './storage.js';
import { refreshLibraryUI } from './library-ui.js';
import { renderControls, toggleColumn, applyPresetData, refreshPresetDropdown } from './controls-ui.js';

// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('toggle-info-btn');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', toggleExtendedInfo);
    }

    // Scroll-Check for Sticky Panel
    window.addEventListener('scroll', () => {
        const panel = document.getElementById('sticky-library-panel');
        const guideContainer = document.querySelector('.import-guide-container');
        if (panel && guideContainer) {
            const threshold = guideContainer.offsetTop + guideContainer.offsetHeight;
            if (window.scrollY > (threshold - 20)) {
                panel.classList.add('is-stuck');
            } else {
                panel.classList.remove('is-stuck');
            }
        }
    });

    // Initialize UI
    refreshLibraryUI();
});

// --- Window / Global Exposures (Required for HTML onclick attributes) ---

// Library / File Loading
window.unloadShot = (e) => {
    if (e) e.stopPropagation(); 
    appState.currentShotData = null;
    appState.currentShotName = "No Shot Loaded";
    
    const divs = ['controls-area', 'chart-wrapper', 'file-info-container', 'result-area', 'analysis-settings'];
    divs.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.style.display = 'none';
    });

    refreshLibraryUI();
};

window.unloadProfile = (e) => {
    if (e) e.stopPropagation(); 
    appState.currentProfileData = null;
    appState.currentProfileName = "No Profile Loaded";
    
    if (appState.currentShotData) checkAndAnalyze();
    refreshLibraryUI();
};

window.triggerLoad = (type, name) => {
    const entry = JSON.parse(localStorage.getItem(type) || '[]').find(i => i.name === name);
    if (entry) type === DB_KEYS.SHOTS ? loadShot(entry.data, entry.name) : loadProfile(entry.data, entry.name);
};

// Import / Export / Delete
window.handleSmartImport = (fileList) => {
    Array.from(fileList).forEach(file => {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                // Bulk Import Logic
                if (Array.isArray(data)) {
                    console.log("Bulk Import detected");
                    const library = JSON.parse(localStorage.getItem(DB_KEYS.PROFILES) || '[]');
                    let count = 0;
                    data.forEach(p => {
                        if (p.phases && p.label) {
                            Storage.saveToLibrary(DB_KEYS.PROFILES, p.label + ".json", p, null);
                            count++;
                        }
                    });
                    if (count > 0) {
                        refreshLibraryUI();
                        alert(`Imported ${count} profiles.`);
                    }
                    return;
                }
                // Single Import
                if (data.hasOwnProperty('samples')) {
                    Storage.saveToLibrary(DB_KEYS.SHOTS, file.name, data, () => loadShot(data, file.name));
                } else if (data.hasOwnProperty('phases')) {
                    Storage.saveToLibrary(DB_KEYS.PROFILES, file.name, data, () => loadProfile(data, file.name));
                } else {
                    throw new Error("Unknown file format.");
                }
            } catch (err) {
                console.error(err);
                alert(`Error importing ${file.name}: ${err.message}`);
            }
        };
        reader.readAsText(file);
    });
};

window.exportSingleItem = Storage.exportSingleItem;
window.exportFullLibrary = Storage.exportFullLibrary;
window.deleteSingleItem = (col, name) => Storage.deleteSingleItem(col, name, refreshLibraryUI);
window.clearFullLibrary = (col) => Storage.clearFullLibrary(col, refreshLibraryUI);

// Library Interaction
window.toggleStickyPanel = () => { appState.isLibraryCollapsed = !appState.isLibraryCollapsed; refreshLibraryUI(); };
window.toggleLibraryExpand = (typeKey) => { 
    // TypeKey matches DB_KEY (e.g. gaggimate_shots). State uses uppercase "SHOTS".
    const stateKey = typeKey === DB_KEYS.SHOTS ? 'SHOTS' : 'PROFILES';
    appState.libraryExpanded[stateKey] = !appState.libraryExpanded[stateKey]; 
    refreshLibraryUI(); 
};
window.updateLibrarySearch = (typeKey, value) => {
    const searchKey = typeKey === DB_KEYS.SHOTS ? 'shots' : 'profiles';
    appState.librarySearch[searchKey] = value.toLowerCase();
    refreshLibraryUI();
};
window.updateLibrarySort = (typeKey, key, specificOrder = null) => {
    const sortKey = typeKey === DB_KEYS.SHOTS ? 'shots' : 'profiles';
    const current = appState.currentSort[sortKey];
    if (specificOrder) {
        current.key = key; current.order = specificOrder;
    } else {
        if (current.key === key) current.order = current.order === 'asc' ? 'desc' : 'asc';
        else { current.key = key; current.order = 'desc'; }
    }
    refreshLibraryUI();
};

// Presets & Columns (Delegated to Controls UI)
window.applyStandardPreset = () => {
    const userStd = localStorage.getItem(DB_KEYS.USER_STANDARD);
    appState.activeColumnIds.clear();
    if (userStd) {
        JSON.parse(userStd).forEach(id => appState.activeColumnIds.add(id));
    } else {
        columnConfig.forEach(col => { if (col.default) appState.activeColumnIds.add(col.id); });
    }
    // Sync UI
    columnConfig.forEach(col => toggleColumn(col.id, appState.activeColumnIds.has(col.id)));
    document.getElementById('preset-select').value = ""; 
    document.getElementById('btn-del-preset').style.display = 'none';
};

window.applyFactoryReset = () => {
    appState.activeColumnIds.clear();
    columnConfig.forEach(col => { if (col.default) appState.activeColumnIds.add(col.id); });
    columnConfig.forEach(col => toggleColumn(col.id, appState.activeColumnIds.has(col.id)));
    document.getElementById('preset-select').value = ""; 
    document.getElementById('btn-del-preset').style.display = 'none';
};

window.saveCurrentAsStandard = () => {
    if(!confirm("Save current selection as your new 'Standard'?")) return;
    const cols = Array.from(appState.activeColumnIds);
    localStorage.setItem(DB_KEYS.USER_STANDARD, JSON.stringify(cols));
    alert("New Standard saved!");
};

window.saveCurrentAsPreset = () => {
    const name = prompt("Enter a name for this preset:");
    if (!name) return;
    const presets = JSON.parse(localStorage.getItem(DB_KEYS.PRESETS) || '[]');
    const newPreset = { id: Date.now().toString(), name: name, columns: Array.from(appState.activeColumnIds), isFavorite: false };
    if (confirm("Set as your new Favorite?")) {
        presets.forEach(p => p.isFavorite = false); 
        newPreset.isFavorite = true;
    }
    presets.push(newPreset);
    localStorage.setItem(DB_KEYS.PRESETS, JSON.stringify(presets));
    refreshPresetDropdown();
    const select = document.getElementById('preset-select');
    select.value = newPreset.id;
    window.handlePresetChange(newPreset.id); 
};

window.applyFavoritePreset = () => {
    const presets = JSON.parse(localStorage.getItem(DB_KEYS.PRESETS) || '[]');
    const fav = presets.find(p => p.isFavorite);
    if (fav) {
        applyPresetData(fav);
        document.getElementById('preset-select').value = fav.id;
        document.getElementById('btn-del-preset').style.display = 'flex';
    } else {
        alert("No favorite set yet.");
    }
};

window.handlePresetChange = (presetId) => {
    const presets = JSON.parse(localStorage.getItem(DB_KEYS.PRESETS) || '[]');
    const selected = presets.find(p => p.id === presetId);
    if (selected) {
        applyPresetData(selected);
        document.getElementById('btn-del-preset').style.display = 'flex';
    } else {
        document.getElementById('btn-del-preset').style.display = 'none';
    }
};

window.deleteCurrentPreset = () => {
    const select = document.getElementById('preset-select');
    const id = select.value;
    if (!id) return;
    if (confirm("Delete this preset?")) {
        let presets = JSON.parse(localStorage.getItem(DB_KEYS.PRESETS) || '[]');
        presets = presets.filter(p => p.id !== id);
        localStorage.setItem(DB_KEYS.PRESETS, JSON.stringify(presets));
        refreshPresetDropdown();
        window.applyStandardPreset(); 
    }
};

// Metadata & Export
window.updateShotMeta = (field, value) => {
    if (!appState.currentShotData) return;
    if (field === 'doseIn' || field === 'doseOut' || field === 'rating') value = parseFloat(value);
    appState.currentShotData[field] = value;
    
    if (field === 'doseIn' || field === 'doseOut') {
        const inVal = parseFloat(appState.currentShotData.doseIn) || 0;
        const outVal = parseFloat(appState.currentShotData.doseOut) || 0;
        if (inVal > 0 && outVal > 0) {
            appState.currentShotData.ratio = parseFloat((outVal / inVal).toFixed(2));
            const ratioInput = document.getElementById('meta-ratio');
            if (ratioInput) ratioInput.value = appState.currentShotData.ratio;
        }
    }
    
    // Save back to DB
    const library = JSON.parse(localStorage.getItem(DB_KEYS.SHOTS) || '[]');
    const index = library.findIndex(i => i.name === appState.currentShotData.name || i.fileName === appState.currentShotData.fileName); 
    if (index > -1) {
        library[index].data = appState.currentShotData;
        localStorage.setItem(DB_KEYS.SHOTS, JSON.stringify(library));
    }
};

window.exportCurrentShot = () => {
    if (!appState.currentShotData) return;
    const jsonStr = JSON.stringify(appState.currentShotData, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    let downloadName = appState.currentShotName;
    if (!downloadName.toLowerCase().endsWith('.json')) downloadName += '.json';
    link.download = downloadName;
    link.click();
    URL.revokeObjectURL(url);
};

window.showStatsFeatureInfo = () => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.4); z-index: 10000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(2px); cursor: pointer;`;
    const box = document.createElement('div');
    box.style.cssText = `background: white; padding: 40px; border-radius: 12px; text-align: center; max-width: 300px;`;
    box.innerHTML = `<h3 style="margin: 0; color: #2c3e50;">Advanced Statistics coming soon!</h3><div style="font-size: 0.8em; color: #bdc3c7;">Click to close</div>`;
    overlay.onclick = () => document.body.removeChild(overlay);
    overlay.appendChild(box); document.body.appendChild(overlay);
};

// --- Logic Controllers ---

function loadShot(data, name) {
    appState.currentShotData = data;
    appState.currentShotName = cleanName(name); 
    
    // Auto Match Profile
    if (data.profile) {
        try {
            const profiles = JSON.parse(localStorage.getItem(DB_KEYS.PROFILES) || '[]');
            const targetLabel = data.profile.toLowerCase();
            const match = profiles.find(p => p.name.toLowerCase() === targetLabel);
            if (match) {
                loadProfile(match.data, match.name);
                return; 
            }
        } catch (e) { console.warn("Auto-match failed:", e); }
    }
    refreshLibraryUI(); 
    checkAndAnalyze();
}

function loadProfile(data, name) {
    appState.currentProfileData = data;
    appState.currentProfileName = data.label || cleanName(name); 
    refreshLibraryUI(); 
    checkAndAnalyze();
}

function checkAndAnalyze() {
    if (!appState.currentShotData) return;
    const resultArea = document.getElementById('result-area');
    if (resultArea) resultArea.style.display = 'block';

    if (!appState.areControlsRendered) {
        renderControls(performAnalysis);
        appState.areControlsRendered = true;
    }
    performAnalysis();
}

function performAnalysis() {
    const scaleDelay = parseFloat(document.getElementById('predictive-scale-delay')?.value || 800);
    const sensorDelay = parseFloat(document.getElementById('predictive-sensor-delay')?.value || 200);
    
    let usedDelay = sensorDelay;
    let autoActive = false;
    if (appState.isSensorDelayAuto) {
        const detection = detectAutoDelay(appState.currentShotData, appState.currentProfileData, sensorDelay);
        usedDelay = detection.delay;
        autoActive = detection.auto;
    }

    const results = calculateShotMetrics(appState.currentShotData, appState.currentProfileData, {
        scaleDelayMs: scaleDelay,
        sensorDelayMs: usedDelay,
        isAutoAdjusted: autoActive
    });

    renderFileInfo(appState.currentShotData, appState.currentShotName);
    
    // Pass Active Columns
    const activeColsToPass = appState.activeColumnIds.size > 0 ? appState.activeColumnIds : null;
    renderTable(results, activeColsToPass);
    
    renderChart(results, appState.currentShotData);
}

// Helpers
function toggleExtendedInfo() {
    appState.isInfoExpanded = !appState.isInfoExpanded;
    document.getElementById('extended-info-content').style.display = appState.isInfoExpanded ? 'block' : 'none';
    document.getElementById('toggle-info-btn').innerText = appState.isInfoExpanded ? "Less Info" : "More Info";
}