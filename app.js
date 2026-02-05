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

    // Initialize Database UI
    refreshLibraryUI();
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
    const resultArea = document.getElementById('result-area');
    
    // Also hide the dynamic settings div if it exists
    const settingsDiv = document.getElementById('analysis-settings');
    if (settingsDiv) settingsDiv.style.display = 'none';

    if (controlsArea) controlsArea.style.display = 'none';
    if (chartArea) chartArea.style.display = 'none';
    if (infoArea) infoArea.style.display = 'none';
    if (resultArea) resultArea.style.display = 'none';

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
 * Smart Import Logic: Detects file type (Shot, Single Profile, or Bulk Profiles)
 */
function handleSmartImport(fileList) {
    Array.from(fileList).forEach(file => {
        const reader = new FileReader();
        
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                
                // --- CASE 1: BULK IMPORT (Array of Profiles) ---
                if (Array.isArray(data)) {
                    console.log("Smart Import: Detected Bulk Profile Array ->", file.name);
                    
                    // Load existing library once to perform bulk update
                    const library = JSON.parse(localStorage.getItem(DB_KEYS.PROFILES) || '[]');
                    let importCount = 0;

                    data.forEach(profileItem => {
                        // Basic validation: must have 'phases' and a 'label'
                        if (profileItem.phases && profileItem.label) {
                            const displayName = profileItem.label;
                            // Generate a safe pseudo-filename since it comes from a big JSON
                            const fakeFileName = displayName.replace(/[^a-z0-9]/gi, '_').toLowerCase() + ".json";
                            
                            const entry = {
                                name: displayName,
                                fileName: fakeFileName,
                                saveDate: Date.now(),
                                shotDate: Date.now(), // Profiles don't have a shot date
                                profileName: "Manual/Unknown",
                                duration: 0,
                                data: profileItem
                            };

                            // Update existing or add new
                            const existingIndex = library.findIndex(item => item.name === displayName);
                            if (existingIndex > -1) library[existingIndex] = entry;
                            else library.push(entry);
                            
                            importCount++;
                        }
                    });

                    if (importCount > 0) {
                        localStorage.setItem(DB_KEYS.PROFILES, JSON.stringify(library));
                        refreshLibraryUI();
                        alert(`Successfully imported ${importCount} profiles from ${file.name}`);
                    } else {
                        throw new Error("JSON Array found, but no valid profiles detected inside.");
                    }
                    return; // Done with this file
                }

                // --- CASE 2: SINGLE ITEM (Shot or Profile) ---
                const hasSamples = data.hasOwnProperty('samples');
                const hasPhases = data.hasOwnProperty('phases');
                
                if (hasSamples) {
                    // It is a SHOT
                    saveToLibrary(DB_KEYS.SHOTS, file.name, data);
                    loadShot(data, file.name);
                } else if (hasPhases) {
                    // It is a SINGLE PROFILE
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
 * Attaches events to the dynamically created Import Button in the dashboard
 */
function setupSmartImport() {
    const zone = document.getElementById('drop-zone-import');
    const input = document.getElementById('file-unified');

    if (!zone || !input) return;

    // Drag Effects
    zone.addEventListener('dragover', (e) => { 
        e.preventDefault(); 
        zone.classList.add('hover'); 
    });
    
    zone.addEventListener('dragleave', () => zone.classList.remove('hover'));
    
    zone.addEventListener('drop', (e) => { 
        e.preventDefault(); 
        zone.classList.remove('hover'); 
        if (e.dataTransfer.files.length > 0) {
            handleSmartImport(e.dataTransfer.files);
        }
    });

    // Click Handler
    zone.onclick = () => input.click();

    // Input Change Handler
    input.onchange = (e) => { 
        if (e.target.files.length > 0) {
            handleSmartImport(e.target.files);
        }
        input.value = ''; // Reset
    };
}

/**
 * Core loading logic for Shots 
 */
function loadShot(data, name) {
    currentShotData = data;
    currentShotName = cleanName(name); 
    
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
        stickyPanel.className = isLibraryCollapsed ? 'sticky-library-panel collapsed' : 'sticky-library-panel';

        // --- INSERTION LOGIC: Place directly after the main header ---
        const header = document.getElementById('main-header'); 
        const container = document.querySelector('.container');
        
        if (header && header.nextSibling) {
            // Insert after header
            header.parentNode.insertBefore(stickyPanel, header.nextSibling);
        } else if (container) {
            // Fallback: Insert at top of container (if header logic fails)
            container.insertBefore(stickyPanel, container.firstChild);
        }
    } else {
        // Update class if element already exists
        stickyPanel.className = isLibraryCollapsed ? 'sticky-library-panel collapsed' : 'sticky-library-panel';
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

    // Helper to generate Sort Icon SVG based on state
    const getSortIcon = (colType, colKey) => {
        const isActive = currentSort[colType] === colKey;
        const isAsc = currentSort.order === 'asc';
        const opacity = isActive ? 1 : 0.2;
        const rotation = (isActive && isAsc) ? 'rotate(180)' : 'rotate(0)';
        const color = isActive ? '#3498db' : '#95a5a6';
        
        // Simple Triangle SVG
        return `<svg width="8" height="8" viewBox="0 0 10 10" style="margin-left:5px; opacity:${opacity}; transform:${rotation}; transition: transform 0.2s;">
            <path d="M5 10L0 0L10 0L5 10Z" fill="${color}"/>
        </svg>`;
    };

    const createSection = (title, items, type) => {
        const isExpanded = libraryExpanded[type];
        
        // --- ICONS (SVG Strings) ---
        const iconExport = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;
        const iconTrash = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

        return `
            <div class="library-section">
                <div class="lib-header">
                    <div class="header-left">
                        <span class="sort-label">${title} <span style="color:#bdc3c7; font-weight:400;">(${items.length})</span></span>
                    </div>
                    <div class="header-right">
                        <button class="btn-export-all" onclick="window.exportFullLibrary('${type}')">Export All</button>
                        <button class="btn-clear-all" onclick="window.clearFullLibrary('${type}')">Delete All</button>
                    </div>
                </div>
                <div class="lib-list-container ${isExpanded ? 'expanded' : ''}">
                    <table class="lib-table">
                        <thead>
                            <tr>
                                <th onclick="window.updateSort('${type}', 'name')">Name ${getSortIcon(type, 'name')}</th>
                                <th onclick="window.updateSort('${type}', 'shotDate')">Date ${getSortIcon(type, 'shotDate')}</th>
                                ${type === DB_KEYS.SHOTS ? `<th onclick="window.updateSort('${type}', 'profileName')">Profile ${getSortIcon(type, 'profileName')}</th>` : ''}
                                <th style="cursor:default; text-align:right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${items.map(item => {
                                const isMatch = (type === DB_KEYS.PROFILES && currentShotData && item.name.toLowerCase() === (currentShotData.profile || "").toLowerCase()) ||
                                                (type === DB_KEYS.SHOTS && currentProfileName && (item.profileName || "").toLowerCase() === currentProfileName.toLowerCase());
                                return `
                                    <tr style="${isMatch ? 'background-color: #f0fdf4; font-weight:600;' : ''}">
                                        <td title="${item.name}"><span class="lib-file-name" onclick="window.triggerLoad('${type}', '${item.name}')">${item.name}</span></td>
                                        <td class="lib-meta-cell">${new Date(item.shotDate).toLocaleDateString()}</td>
                                        ${type === DB_KEYS.SHOTS ? `<td class="lib-meta-cell">${item.profileName}</td>` : ''}
                                        <td>
                                            <div class="lib-action-cell">
                                                <button class="icon-btn exp" title="Export JSON" onclick="window.exportSingleItem('${type}', '${item.name}')">${iconExport}</button>
                                                <button class="icon-btn del" title="Delete" onclick="window.deleteSingleItem('${type}', '${item.name}')">${iconTrash}</button>
                                            </div>
                                        </td>
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

    // --- HTML STRUCTURE (Symmetrical Badges) ---
    stickyPanel.innerHTML = `
        <div class="library-status-bar">
            <div class="status-bar-group">
                <div id="drop-zone-import" class="status-badge import-action" title="Drag & Drop or Click to Import">
                    <span>IMPORT</span>
                    <input type="file" id="file-unified" multiple accept=".json" style="display: none;">
                </div>
                <div class="${shotClass}" onclick="window.toggleStickyPanel()">
                    <div class="badge-left">
                        <div class="css-menu-icon"><span></span></div>
                    </div>
                    <span class="status-value">${currentShotName}</span>
                    <div class="badge-right">
                        ${currentShotData ? `<span class="unload-btn" onclick="window.unloadShot(event)">×</span>` : ''}
                    </div>
                </div>
            </div>
            <div class="status-bar-group">
                <div class="${profileClass}" onclick="window.toggleStickyPanel()" title="${mismatchTitle}">
                    <div class="badge-left">
                        <div class="css-menu-icon"><span></span></div>
                    </div>
                    <span class="status-value">${profileClass.includes('mismatch') ? '⚠ ' : ''}${currentProfileName}</span>
                    <div class="badge-right">
                        ${currentProfileData ? `<span class="unload-btn" onclick="window.unloadProfile(event)">×</span>` : ''}
                    </div>
                </div>
                <div class="status-badge stats-action" onclick="window.showStatsFeatureInfo()"><span>STATS</span></div>
            </div>
        </div>
        <div class="library-grid">${createSection('Shots', shots, DB_KEYS.SHOTS)}${createSection('Profiles', profiles, DB_KEYS.PROFILES)}</div>
    `;
    
    if (!isLibraryCollapsed) {
        stickyPanel.innerHTML += `<div class="library-footer"><button class="btn-close-panel" onclick="window.toggleStickyPanel()">Close Library</button></div>`;
    }

    setupSmartImport();
}

/**
 * Analysis Orchestration
 */
function checkAndAnalyze() {
    if (!currentShotData) return;
    
    // Make sure result area is visible
    const resultArea = document.getElementById('result-area');
    if (resultArea) resultArea.style.display = 'block';

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
    renderChart(results, currentShotData);
}

/**
 * UI Controls Rendering (Boxed, Collapsed Default, Responsive)
 */
function renderControls() {
    const wrapper = document.getElementById('controls-area');
    if (!wrapper) return;

    // --- 1. LATENCY SETTINGS (Always Visible) ---
    // Check if latency settings exist, if not create them in their own box
    let settingsDiv = document.getElementById('analysis-settings');
    if (!settingsDiv) {
        settingsDiv = document.createElement('div');
        settingsDiv.id = 'analysis-settings';
        // Reuse the .controls-box class for consistent look
        settingsDiv.className = 'controls-box'; 
        settingsDiv.style.display = 'block'; // Ensure it's visible
        settingsDiv.innerHTML = `
            <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 20px; font-size: 0.9em;">
                <h4 style="margin: 0; color: #34495e; font-weight:600;">Latency Settings</h4>
                <div style="display: flex; align-items: center; gap: 5px;">
                    <label style="color:#555;">Scale:</label> <input type="number" id="predictive-scale-delay" value="800" step="50" style="width: 50px; padding:4px; border:1px solid #ccc; border-radius:4px;"> ms
                </div>
                <div style="display: flex; align-items: center; gap: 5px;">
                    <label style="color:#555;">System:</label> <input type="number" id="predictive-sensor-delay" value="200" step="50" style="width: 50px; padding:4px; border:1px solid #ccc; border-radius:4px;"> ms
                    <label style="cursor:pointer; user-select:none; display:flex; align-items:center;"><input type="checkbox" id="auto-sensor-delay" ${isSensorDelayAuto ? 'checked' : ''} style="margin-right:4px;"> Auto</label>
                </div>
            </div>`;
        
        // Append to wrapper (Order: Latency first, or Columns first? User said "Latency Settings darunter" -> So Columns first)
        // But to keep code simple, we usually just append. If we want Latency BELOW columns, we append it AFTER columns.
        // Let's create columns first below.
    }

    // --- 2. DISPLAYED COLUMNS (Collapsible Box) ---
    // Check if the Columns Container already exists
    let columnsBox = document.getElementById('columns-control-box');
    
    // If not, build the structure
    if (!columnsBox) {
        columnsBox = document.createElement('div');
        columnsBox.id = 'columns-control-box';
        columnsBox.className = 'controls-box';
        
        // Header with Plus Button
        const header = document.createElement('div');
        header.className = 'controls-header-row';
        header.innerHTML = `
            <div class="toggle-plus-btn" id="col-toggle-btn">+</div>
            <div class="controls-title">Displayed Columns</div>
        `;
        
        // The Grid (Default Collapsed)
        const grid = document.createElement('div');
        grid.id = 'controls-grid';
        grid.className = 'controls-grid collapsed'; // Start collapsed
        
        // Toggle Logic
        header.onclick = () => {
            const isCollapsed = grid.classList.contains('collapsed');
            const btn = document.getElementById('col-toggle-btn');
            
            if (isCollapsed) {
                grid.classList.remove('collapsed');
                btn.innerText = "−"; // Minus sign
                btn.style.color = "#e74c3c";
            } else {
                grid.classList.add('collapsed');
                btn.innerText = "+";
                btn.style.color = "#3498db";
            }
        };

        // Assemble Box
        columnsBox.appendChild(header);
        columnsBox.appendChild(grid);
        
        // Clear Wrapper and Re-Order: Columns TOP, Settings BOTTOM
        wrapper.innerHTML = ''; 
        wrapper.appendChild(columnsBox);
        
        if (settingsDiv) {
             wrapper.appendChild(settingsDiv);
             // Re-attach listeners for latency since we moved the node
             attachLatencyListeners();
        }

    } else {
        // Just clear the grid to re-render checkboxes
        document.getElementById('controls-grid').innerHTML = '';
    }

    // --- 3. Render Checkboxes ---
    const grid = document.getElementById('controls-grid');
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
            
            let suffix = "";
            if (col.type === 'se') suffix = " <small style='color:#95a5a6'>S/E</small>";
            else if (col.type === 'mm') suffix = " <small style='color:#95a5a6'>Min/Max</small>";
            else if (col.type === 'avg') suffix = " <small style='color:#95a5a6'>Avg</small>";
            
            lbl.innerHTML = `<input type="checkbox" id="chk-${col.id}" ${col.default ? 'checked' : ''}> ${col.label}${suffix}`;
            div.appendChild(lbl);
            
            setTimeout(() => {
                const cb = document.getElementById(`chk-${col.id}`);
                if (cb) cb.onchange = () => toggleColumn(col.id);
            }, 0);
        });
        grid.appendChild(div);
    });

    // Helper to attach listeners (since innerHTML wipe might lose them)
    function attachLatencyListeners() {
        const scaleInput = document.getElementById('predictive-scale-delay');
        const sensorInput = document.getElementById('predictive-sensor-delay');
        const autoCheck = document.getElementById('auto-sensor-delay');
        
        if(scaleInput) scaleInput.onchange = performAnalysis;
        if(sensorInput) sensorInput.onchange = performAnalysis;
        if(autoCheck) autoCheck.onchange = (e) => {
            isSensorDelayAuto = e.target.checked;
            if(sensorInput) sensorInput.disabled = isSensorDelayAuto;
            performAnalysis();
        };
    }
    
    // Initial attach if creating for the first time
    attachLatencyListeners();
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

/**
 * Helper to update shot metadata live
 */
window.updateShotMeta = (field, value) => {
    if (!currentShotData) return;
    
    // Convert numbers
    if (field === 'doseIn' || field === 'doseOut' || field === 'rating') {
        value = parseFloat(value);
    }

    // Update Data
    currentShotData[field] = value;
    
    // Auto-Calculate Ratio if dose changes
    if (field === 'doseIn' || field === 'doseOut') {
        const inVal = parseFloat(currentShotData.doseIn) || 0;
        const outVal = parseFloat(currentShotData.doseOut) || 0;
        if (inVal > 0 && outVal > 0) {
            currentShotData.ratio = parseFloat((outVal / inVal).toFixed(2));
            const ratioInput = document.getElementById('meta-ratio');
            if (ratioInput) ratioInput.value = currentShotData.ratio;
        }
    }
    
    // Persist to LocalStorage (Update the library entry)
    const library = JSON.parse(localStorage.getItem(DB_KEYS.SHOTS) || '[]');
    const index = library.findIndex(i => i.name === currentShotData.name || i.fileName === currentShotData.fileName); // Fallback to filename match
    
    if (index > -1) {
        library[index].data = currentShotData;
        localStorage.setItem(DB_KEYS.SHOTS, JSON.stringify(library));
    }
};

/**
 * Export the CURRENTLY LOADED shot with all edits (Keep original filename)
 */
window.exportCurrentShot = () => {
    if (!currentShotData) return;
    const jsonStr = JSON.stringify(currentShotData, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    
    // Use the original filename variable
    // Check if it already has .json, if not add it
    let downloadName = currentShotName;
    if (!downloadName.toLowerCase().endsWith('.json')) {
        downloadName += '.json';
    }
    
    link.download = downloadName;
    link.click();
    URL.revokeObjectURL(url);
};