/**
 * Deep Dive Shot Analyzer - Main Application Controller
 * Handles file persistence, user interactions, and orchestrates analysis.
 */
import { calculateShotMetrics, detectAutoDelay } from './shot-analysis.js';
import { renderFileInfo, renderTable, renderChart, columnConfig, groups } from './ui-renderer.js';

// --- Global State ---
let libraryExpanded = {
    SHOTS: false,
    PROFILES: false
};
let isLibraryCollapsed = true; // Default: Collapsed
let isInfoExpanded = false;

let currentShotData = null;
let currentProfileData = null;
let currentShotName = "No Shot Loaded";      
let currentProfileName = "No Profile Loaded"; 

let isSensorDelayAuto = true;

// Database keys mirroring GaggiMate structure
const DB_KEYS = {
    SHOTS: 'gaggimate_shots',
    PROFILES: 'gaggimate_profiles'
};

// Helper to remove .json extension
const cleanName = (name) => name ? name.replace(/\.json$/i, '') : '';

document.addEventListener('DOMContentLoaded', () => {
    // Basic DOM setup
    const toggleBtn = document.getElementById('toggle-info-btn');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', toggleExtendedInfo);
    }

    // --- Scroll-Check for Sticky Panel ---
    // Note: Adjusted selector to look for the new container instead of upload-grid
    window.addEventListener('scroll', () => {
        const panel = document.getElementById('sticky-library-panel');
        const dropContainer = document.querySelector('.unified-drop-container');
        
        if (panel && dropContainer) {
            const threshold = dropContainer.offsetTop + dropContainer.offsetHeight;
            if (window.scrollY > (threshold - 20)) {
                panel.classList.add('is-stuck');
            } else {
                panel.classList.remove('is-stuck');
            }
        }
    });

    // Initialize Database UI
    refreshLibraryUI();

    // Setup the new Single Smart Drop Zone
    setupUnifiedDropZone();
});

/**
 * Global Expose: Unload current Shot
 */
window.unloadShot = (e) => {
    if (e) e.stopPropagation(); 
    currentShotData = null;
    currentShotName = "No Shot Loaded";
    
    // Reset UI Visibility Only (DO NOT destroy table structure)
    const controlsArea = document.getElementById('controls-area');
    const chartArea = document.getElementById('chart-wrapper');
    const infoArea = document.getElementById('file-info-container');
    const resultArea = document.getElementById('result-area'); // Wrapper for table

    if (controlsArea) controlsArea.style.display = 'none';
    if (chartArea) chartArea.style.display = 'none';
    if (infoArea) infoArea.style.display = 'none';
    if (resultArea) resultArea.style.display = 'none';

    // BUGFIX: Removed statsTable.innerHTML = ''; 
    // This prevented the table from reloading because it deleted the <thead> with the ID.

    refreshLibraryUI();
};

/**
 * Global Expose: Unload current Profile
 */
window.unloadProfile = (e) => {
    if (e) e.stopPropagation(); 
    currentProfileData = null;
    currentProfileName = "No Profile Loaded";
    
    if (currentShotData) checkAndAnalyze();
    refreshLibraryUI();
};

/**
 * Setup the Unified Smart Drop Zone
 */
function setupUnifiedDropZone() {
    const zone = document.getElementById('drop-zone-unified');
    const input = document.getElementById('file-unified');

    if (!zone || !input) return;

    // Drag Effects
    zone.addEventListener('dragover', (e) => { 
        e.preventDefault(); 
        zone.classList.add('hover'); 
    });
    
    zone.addEventListener('dragleave', () => { 
        zone.classList.remove('hover'); 
    });

    // Drop Handler
    zone.addEventListener('drop', (e) => { 
        e.preventDefault(); 
        zone.classList.remove('hover'); 
        if (e.dataTransfer.files.length > 0) {
            handleSmartImport(e.dataTransfer.files);
        }
    });

    // Click Handler
    zone.addEventListener('click', () => input.click());

    // Input Change Handler
    input.addEventListener('change', (e) => { 
        if (e.target.files.length > 0) {
            handleSmartImport(e.target.files);
        }
        // Reset input so same file can be selected again if needed
        input.value = '';
    });
}

/**
 * Smart Import Logic: Detects file type and routes accordingly
 */
function handleSmartImport(fileList) {
    Array.from(fileList).forEach(file => {
        const reader = new FileReader();
        
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                
                // --- TYPE DETECTION ---
                const hasSamples = data.hasOwnProperty('samples');
                const hasPhases = data.hasOwnProperty('phases');
                
                if (hasSamples) {
                    // It is a SHOT
                    console.log("Smart Import: Detected Shot ->", file.name);
                    saveToLibrary(DB_KEYS.SHOTS, file.name, data);
                    loadShot(data, file.name);
                } else if (hasPhases) {
                    // It is a PROFILE
                    console.log("Smart Import: Detected Profile ->", file.name);
                    saveToLibrary(DB_KEYS.PROFILES, file.name, data);
                    loadProfile(data, file.name);
                } else {
                    throw new Error("Unknown file format. Missing 'samples' or 'phases'.");
                }

            } catch (err) {
                console.error("Import Error:", err);
                alert(`Could not import ${file.name}.\nError: ${err.message}`);
            }
        };

        reader.onerror = () => alert(`Error reading file: ${file.name}`);
        reader.readAsText(file);
    });
}

/**
 * Core loading logic for Shots 
 */
function loadShot(data, name) {
    currentShotData = data;
    currentShotName = cleanName(name); 
    
    // Auto-match logic using profile label
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

/**
 * Core loading logic for Profiles
 */
function loadProfile(data, name) {
    currentProfileData = data;
    currentProfileName = data.label || cleanName(name); 

    refreshLibraryUI(); 
    checkAndAnalyze();
}

/**
 * Persists data to localStorage with metadata
 */
function saveToLibrary(collection, fileName, data) {
    try {
        const library = JSON.parse(localStorage.getItem(collection) || '[]');
        const displayName = (collection === DB_KEYS.PROFILES && data.label) ? data.label : fileName;
        const existingIndex = library.findIndex(item => item.name === displayName);
        
        const entry = {
            name: displayName,
            fileName: fileName,
            saveDate: Date.now(), 
            shotDate: data.timestamp ? data.timestamp * 1000 : Date.now(), 
            profileName: data.profile || "Manual/Unknown",
            duration: data.samples ? ((data.samples[data.samples.length-1].t - data.samples[0].t) / 1000).toFixed(1) : 0,
            data: data
        };

        if (existingIndex > -1) library[existingIndex] = entry;
        else library.push(entry);
        
        localStorage.setItem(collection, JSON.stringify(library));
        refreshLibraryUI();
    } catch (e) { console.error("Storage Error:", e); }
}

/**
 * Global state for current sorting
 */
let currentSort = {
    SHOTS: 'saveDate',
    PROFILES: 'name',
    order: 'desc' 
};

window.updateSort = (collection, key) => {
    if (currentSort[collection] === key) {
        currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort[collection] = key;
        currentSort.order = 'desc';
    }
    refreshLibraryUI();
};

function getSortedLibrary(collection) {
    const library = JSON.parse(localStorage.getItem(collection) || '[]');
    const key = currentSort[collection];
    const order = currentSort.order === 'asc' ? 1 : -1;

    return library.sort((a, b) => {
        let valA = a[key] || '';
        let valB = b[key] || '';
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        if (valA < valB) return -1 * order;
        if (valA > valB) return 1 * order;
        return 0;
    });
}

/**
 * Library UI Renderer
 */
function refreshLibraryUI() {
    let stickyPanel = document.getElementById('sticky-library-panel');
    
    if (!stickyPanel) {
        stickyPanel = document.createElement('div');
        stickyPanel.id = 'sticky-library-panel';
        stickyPanel.className = 'sticky-library-panel';
        // Insert after the new unified drop container
        const dropContainer = document.querySelector('.unified-drop-container');
        if (dropContainer && dropContainer.nextSibling) {
            dropContainer.parentNode.insertBefore(stickyPanel, dropContainer.nextSibling);
        }
    }

    if (isLibraryCollapsed) {
        stickyPanel.classList.add('collapsed');
    } else {
        stickyPanel.classList.remove('collapsed');
    }

    let shots = getSortedLibrary(DB_KEYS.SHOTS);
    let profiles = getSortedLibrary(DB_KEYS.PROFILES);

    // Auto-match sorting logic
    if (currentShotData && currentShotData.profile) {
        const target = currentShotData.profile.toLowerCase();
        profiles.sort((a, b) => a.name.toLowerCase() === target ? -1 : (b.name.toLowerCase() === target ? 1 : 0));
    }
    if (currentProfileName) {
        const target = currentProfileName.toLowerCase();
        shots.sort((a, b) => (a.profileName || "").toLowerCase() === target ? -1 : (b.profileName || "").toLowerCase() === target ? 1 : 0);
    }

    const createSection = (title, items, type) => {
        const isExpanded = libraryExpanded[type];
        return `
            <div class="library-section">
                <div class="lib-header">
                    <div class="header-left">
                        <span class="sort-label">${title} (${items.length})</span>
                        <button class="btn-sort" onclick="window.updateSort('${type}', 'shotDate')">Date</button>
                        <button class="btn-sort" onclick="window.updateSort('${type}', 'name')">Name</button>
                    </div>
                    <div class="header-right">
                        <button class="btn-export-all" onclick="window.exportFullLibrary('${type}')">Export All</button>
                        <button class="btn-clear-all" onclick="window.clearFullLibrary('${type}')">Delete All</button>
                    </div>
                </div>
                <div class="lib-list-container ${isExpanded ? 'expanded' : ''}">
                    <table class="lib-table">
                        <thead><tr><th>Name</th><th>Date</th>${type === DB_KEYS.SHOTS ? '<th>Profile</th>' : ''}<th>Actions</th></tr></thead>
                        <tbody>
                            ${items.map(item => {
                                const isMatch = (type === DB_KEYS.PROFILES && currentShotData && item.name.toLowerCase() === (currentShotData.profile || "").toLowerCase()) ||
                                                (type === DB_KEYS.SHOTS && currentProfileName && (item.profileName || "").toLowerCase() === currentProfileName.toLowerCase());
                                return `
                                    <tr style="${isMatch ? 'background-color: #f0fdf4; font-weight:bold;' : ''}">
                                        <td title="${item.name}"><span class="lib-file-name" onclick="window.triggerLoad('${type}', '${item.name}')">${item.name}</span></td>
                                        <td class="lib-meta-cell">${new Date(item.shotDate).toLocaleDateString()}</td>
                                        ${type === DB_KEYS.SHOTS ? `<td class="lib-meta-cell">${item.profileName}</td>` : ''}
                                        <td><div class="lib-action-cell">
                                            <span class="lib-row-btn exp" onclick="window.exportSingleItem('${type}', '${item.name}')">EXP</span>
                                            <span class="lib-row-btn del" onclick="window.deleteSingleItem('${type}', '${item.name}')">−</span>
                                        </div></td>
                                    </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
                ${items.length > 4 ? `<button class="btn-show-more" onclick="window.toggleLibraryExpand('${type}')">${isExpanded ? 'Show Less' : 'Show All'}</button>` : ''}
            </div>`;
    };

    const shotClass = currentShotData ? 'status-badge shot loaded' : 'status-badge shot';
    let profileClass = currentProfileData ? 'status-badge profile loaded' : 'status-badge profile';
    let mismatchTitle = "Click to open/close Library";

    if (currentShotData && currentProfileData) {
        const shotRef = (currentShotData.profile || "").toLowerCase();
        const activeLabel = currentProfileName.toLowerCase();
        if (shotRef && shotRef !== activeLabel) {
            profileClass = 'status-badge profile mismatch';
            mismatchTitle = "Mismatch detected!";
        }
    }

    stickyPanel.innerHTML = `
        <div class="library-status-bar">
            <div class="status-bar-group">
                <div class="status-badge left-container">
                    <img src="ui/assets/deep-dive-logo.png" class="header-app-logo">
                    <div class="header-import-btn" onclick="window.scrollTo({top:0, behavior:'smooth'})"><span>IMPORT</span></div>
                </div>
                <div class="${shotClass}" onclick="window.toggleStickyPanel()">
                    <span class="status-value">${currentShotName}</span>
                    <div class="badge-controls">${currentShotData ? `<span class="unload-btn" onclick="window.unloadShot(event)">×</span>` : ''}<div class="css-menu-icon"><span></span></div></div>
                </div>
            </div>
            <div class="status-bar-group">
                <div class="${profileClass}" onclick="window.toggleStickyPanel()" title="${mismatchTitle}">
                    <span class="status-value">${profileClass.includes('mismatch') ? '⚠ ' : ''}${currentProfileName}</span>
                    <div class="badge-controls">${currentProfileData ? `<span class="unload-btn" onclick="window.unloadProfile(event)">×</span>` : ''}<div class="css-menu-icon"><span></span></div></div>
                </div>
                <div class="status-badge stats-action" onclick="window.showStatsFeatureInfo()"><span>STATS</span></div>
            </div>
        </div>
        <div class="library-grid">${createSection('Shots', shots, DB_KEYS.SHOTS)}${createSection('Profiles', profiles, DB_KEYS.PROFILES)}</div>
    `;
    
    if (!isLibraryCollapsed) {
        stickyPanel.innerHTML += `<div class="library-footer"><button class="btn-close-panel" onclick="window.toggleStickyPanel()">Close Library</button></div>`;
    }
}

/**
 * Analysis Orchestration
 */
function checkAndAnalyze() {
    if (!currentShotData) return;
    document.getElementById('controls-area').style.display = 'block';
    renderControls();
    performAnalysis();
}

function performAnalysis() {
    const scaleDelay = parseFloat(document.getElementById('predictive-scale-delay')?.value || 800);
    const sensorDelay = parseFloat(document.getElementById('predictive-sensor-delay')?.value || 200);
    
    let usedDelay = sensorDelay;
    let autoActive = false;
    if (isSensorDelayAuto) {
        const detection = detectAutoDelay(currentShotData, currentProfileData, sensorDelay);
        usedDelay = detection.delay;
        autoActive = detection.auto;
    }

    const results = calculateShotMetrics(currentShotData, currentProfileData, {
        scaleDelayMs: scaleDelay,
        sensorDelayMs: usedDelay,
        isAutoAdjusted: autoActive
    });

    renderFileInfo(currentShotData, currentShotName);
    renderTable(results);
    renderChart(results);
}

/**
 * UI Controls Rendering
 */
function renderControls() {
    const grid = document.getElementById('controls-grid');
    if (!grid) return;
    grid.innerHTML = '';

    // Latency Settings Injection
    let settingsDiv = document.getElementById('analysis-settings');
    if (!settingsDiv) {
        settingsDiv = document.createElement('div');
        settingsDiv.id = 'analysis-settings';
        settingsDiv.innerHTML = `
            <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 20px; font-size: 0.9em; margin-bottom:15px; background:#fff; padding:10px; border-radius:8px; border:1px solid #eee;">
                <h4 style="margin: 0; color: #34495e;">Latency Settings</h4>
                <div style="display: flex; align-items: center; gap: 5px;">
                    <label>Scale:</label> <input type="number" id="predictive-scale-delay" value="800" step="50" style="width: 50px;"> ms
                </div>
                <div style="display: flex; align-items: center; gap: 5px;">
                    <label>Sensor:</label> <input type="number" id="predictive-sensor-delay" value="200" step="50" style="width: 50px;"> ms
                    <input type="checkbox" id="auto-sensor-delay" ${isSensorDelayAuto ? 'checked' : ''}> Auto
                </div>
            </div>`;
        const container = document.getElementById('file-info-container');
        if(container && container.parentNode) container.parentNode.insertBefore(settingsDiv, container.nextSibling);
        
        document.getElementById('predictive-scale-delay').onchange = performAnalysis;
        const sensorInp = document.getElementById('predictive-sensor-delay');
        sensorInp.onchange = performAnalysis;
        document.getElementById('auto-sensor-delay').onchange = (e) => {
            isSensorDelayAuto = e.target.checked;
            sensorInp.disabled = isSensorDelayAuto;
            performAnalysis();
        };
    }

    // Column Checkboxes
    const grouped = {};
    columnConfig.forEach(col => {
        if (!grouped[col.group]) grouped[col.group] = [];
        grouped[col.group].push(col);
    });

    Object.keys(grouped).forEach(key => {
        const div = document.createElement('div');
        div.className = `control-group group-${key}`;
        div.innerHTML = `<h4>${groups[key] || key}</h4>`;
        grouped[key].forEach(col => {
            const lbl = document.createElement('label');
            lbl.className = 'checkbox-label';
            lbl.innerHTML = `<input type="checkbox" id="chk-${col.id}" ${col.default ? 'checked' : ''}> ${col.label}`;
            div.appendChild(lbl);
            setTimeout(() => {
                const cb = document.getElementById(`chk-${col.id}`);
                if (cb) cb.onchange = () => toggleColumn(col.id);
            }, 0);
        });
        grid.appendChild(div);
    });
}

// Helpers
window.toggleStickyPanel = () => { isLibraryCollapsed = !isLibraryCollapsed; refreshLibraryUI(); };
window.triggerLoad = (type, name) => {
    const entry = JSON.parse(localStorage.getItem(type) || '[]').find(i => i.name === name);
    if (entry) type === DB_KEYS.SHOTS ? loadShot(entry.data, entry.name) : loadProfile(entry.data, entry.name);
};
window.toggleLibraryExpand = (type) => { libraryExpanded[type] = !libraryExpanded[type]; refreshLibraryUI(); };
window.deleteSingleItem = (col, name) => { if (confirm(`Delete ${name}?`)) { localStorage.setItem(col, JSON.stringify(JSON.parse(localStorage.getItem(col)).filter(i => i.name !== name))); refreshLibraryUI(); }};
window.clearFullLibrary = (col) => { if (confirm("Clear all?")) { localStorage.setItem(col, "[]"); refreshLibraryUI(); }};
window.exportSingleItem = (col, name) => {
    const item = JSON.parse(localStorage.getItem(col)).find(i => i.name === name);
    const link = document.createElement('a');
    link.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(item.data));
    link.download = name; link.click();
};
window.exportFullLibrary = (col) => { JSON.parse(localStorage.getItem(col)).forEach((item, i) => setTimeout(() => window.exportSingleItem(col, item.name), i * 200)); };

function toggleColumn(id) {
    const checked = document.getElementById(`chk-${id}`).checked;
    document.querySelectorAll(`.col-${id}`).forEach(el => checked ? el.classList.remove('hidden-col') : el.classList.add('hidden-col'));
}

function toggleExtendedInfo() {
    isInfoExpanded = !isInfoExpanded;
    document.getElementById('extended-info-content').style.display = isInfoExpanded ? 'block' : 'none';
    document.getElementById('toggle-info-btn').innerText = isInfoExpanded ? "Less Info" : "More Info";
}

window.showStatsFeatureInfo = () => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.4); z-index: 10000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(2px); cursor: pointer;`;
    const box = document.createElement('div');
    box.style.cssText = `background: white; padding: 40px; border-radius: 12px; text-align: center; max-width: 300px;`;
    box.innerHTML = `<h3 style="margin: 0; color: #2c3e50;">Advanced Statistics coming soon!</h3><img src="ui/assets/deep-dive-logo.png" style="width: 140px;"><div style="font-size: 0.8em; color: #bdc3c7;">Click to close</div>`;
    overlay.onclick = () => document.body.removeChild(overlay);
    overlay.appendChild(box); document.body.appendChild(overlay);
};