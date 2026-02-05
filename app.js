/**
 * Deep Dive Shot Analyzer - Main Application Controller
 * Handles file persistence, user interactions, and orchestrates analysis.
 */
import { calculateShotMetrics, detectAutoDelay } from './shot-analysis.js';
// WICHTIG: Stelle sicher, dass in ui-renderer.js 'export const columnConfig' steht!
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

// --- Database Keys ---
const DB_KEYS = {
    SHOTS: 'gaggimate_shots',
    PROFILES: 'gaggimate_profiles',
    PRESETS: 'gaggimate_column_presets',
    USER_STANDARD: 'gaggimate_user_standard_cols'
};

// Helper to remove .json extension
const cleanName = (name) => name ? name.replace(/\.json$/i, '') : '';

// --- Active Columns State ---
let activeColumnIds = new Set(); 
let areControlsRendered = false; 

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
    
    // Reset UI Visibility
    const controlsArea = document.getElementById('controls-area');
    const chartArea = document.getElementById('chart-wrapper');
    const infoArea = document.getElementById('file-info-container');
    const resultArea = document.getElementById('result-area');
    const settingsDiv = document.getElementById('analysis-settings');
    
    if (settingsDiv) settingsDiv.style.display = 'none';
    if (controlsArea) controlsArea.style.display = 'none';
    if (chartArea) chartArea.style.display = 'none';
    if (infoArea) infoArea.style.display = 'none';
    if (resultArea) resultArea.style.display = 'none';

    refreshLibraryUI();
};

window.unloadProfile = (e) => {
    if (e) e.stopPropagation(); 
    currentProfileData = null;
    currentProfileName = "No Profile Loaded";
    
    if (currentShotData) checkAndAnalyze();
    refreshLibraryUI();
};

/**
 * Smart Import Logic
 */
function handleSmartImport(fileList) {
    Array.from(fileList).forEach(file => {
        const reader = new FileReader();
        
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                
                // --- BULK IMPORT ---
                if (Array.isArray(data)) {
                    console.log("Smart Import: Detected Bulk Profile Array ->", file.name);
                    const library = JSON.parse(localStorage.getItem(DB_KEYS.PROFILES) || '[]');
                    let importCount = 0;

                    data.forEach(profileItem => {
                        if (profileItem.phases && profileItem.label) {
                            const displayName = profileItem.label;
                            const fakeFileName = displayName.replace(/[^a-z0-9]/gi, '_').toLowerCase() + ".json";
                            
                            const entry = {
                                name: displayName,
                                fileName: fakeFileName,
                                saveDate: Date.now(),
                                shotDate: Date.now(),
                                profileName: "Manual/Unknown",
                                duration: 0,
                                data: profileItem
                            };

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
                    }
                    return;
                }

                // --- SINGLE ITEM ---
                const hasSamples = data.hasOwnProperty('samples');
                const hasPhases = data.hasOwnProperty('phases');
                
                if (hasSamples) {
                    saveToLibrary(DB_KEYS.SHOTS, file.name, data);
                    loadShot(data, file.name);
                } else if (hasPhases) {
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
        reader.readAsText(file);
    });
}

function setupSmartImport() {
    const zone = document.getElementById('drop-zone-import');
    const input = document.getElementById('file-unified');
    if (!zone || !input) return;

    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('hover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('hover'));
    zone.addEventListener('drop', (e) => { 
        e.preventDefault(); zone.classList.remove('hover'); 
        if (e.dataTransfer.files.length > 0) handleSmartImport(e.dataTransfer.files);
    });
    zone.onclick = () => input.click();
    input.onchange = (e) => { 
        if (e.target.files.length > 0) handleSmartImport(e.target.files);
        input.value = ''; 
    };
}

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

function loadProfile(data, name) {
    currentProfileData = data;
    currentProfileName = data.label || cleanName(name); 
    refreshLibraryUI(); 
    checkAndAnalyze();
}

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

// --- Sorting & Searching State ---
let librarySearch = { [DB_KEYS.SHOTS]: '', [DB_KEYS.PROFILES]: '' };
let currentSort = {
    [DB_KEYS.SHOTS]: { key: 'shotDate', order: 'desc' },
    [DB_KEYS.PROFILES]: { key: 'name', order: 'asc' }
};

window.updateLibrarySearch = (collection, value) => {
    librarySearch[collection] = value.toLowerCase();
    refreshLibraryUI();
};

window.updateLibrarySort = (collection, key, specificOrder = null) => {
    const current = currentSort[collection];
    if (specificOrder) {
        current.key = key; current.order = specificOrder;
    } else {
        if (current.key === key) current.order = current.order === 'asc' ? 'desc' : 'asc';
        else { current.key = key; current.order = 'desc'; }
    }
    refreshLibraryUI();
};

function getSortedLibrary(collection) {
    const raw = JSON.parse(localStorage.getItem(collection) || '[]');
    const searchTerm = librarySearch[collection];
    const { key, order } = currentSort[collection];
    const orderMult = order === 'asc' ? 1 : -1;

    let items = raw;
    if (searchTerm) {
        items = raw.filter(item => {
            const n = (item.name || '').toLowerCase();
            const p = (item.profileName || '').toLowerCase();
            return n.includes(searchTerm) || p.includes(searchTerm);
        });
    }

    return items.sort((a, b) => {
        let valA = a[key]; let valB = b[key];
        if (key === 'data.rating') { valA = a.data?.rating || 0; valB = b.data?.rating || 0; } 
        else if (key === 'duration') { valA = parseFloat(a.duration || 0); valB = parseFloat(b.duration || 0); } 
        else { valA = valA || ''; valB = valB || ''; }

        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return -1 * orderMult;
        if (valA > valB) return 1 * orderMult;
        return 0;
    });
}

// --- UI Renderer ---
function refreshLibraryUI() {
    // 1. CAPTURE FOCUS
    const activeEl = document.activeElement;
    const activeId = activeEl ? activeEl.id : null;
    const cursorPosition = (activeId && activeEl.type === 'text') ? activeEl.selectionStart : null;

    let stickyPanel = document.getElementById('sticky-library-panel');
    if (!stickyPanel) {
        stickyPanel = document.createElement('div');
        stickyPanel.id = 'sticky-library-panel';
        stickyPanel.className = isLibraryCollapsed ? 'sticky-library-panel collapsed' : 'sticky-library-panel';
        const header = document.getElementById('main-header'); 
        const container = document.querySelector('.container');
        if (header && header.nextSibling) header.parentNode.insertBefore(stickyPanel, header.nextSibling);
        else if (container) container.insertBefore(stickyPanel, container.firstChild);
    } else {
        stickyPanel.className = isLibraryCollapsed ? 'sticky-library-panel collapsed' : 'sticky-library-panel';
    }

    let shots = getSortedLibrary(DB_KEYS.SHOTS);
    let profiles = getSortedLibrary(DB_KEYS.PROFILES);

    if (currentShotData && currentShotData.profile && !librarySearch[DB_KEYS.PROFILES]) {
        const target = currentShotData.profile.toLowerCase();
        profiles.sort((a, b) => a.name.toLowerCase() === target ? -1 : (b.name.toLowerCase() === target ? 1 : 0));
    }

    const getSortIcon = (colType, colKey) => {
        const active = currentSort[colType];
        const isActive = active.key === colKey;
        const opacity = isActive ? 1 : 0.2;
        const rotation = (isActive && active.order === 'asc') ? 'rotate(180)' : 'rotate(0)';
        const color = isActive ? '#3498db' : '#95a5a6';
        return `<svg width="8" height="8" viewBox="0 0 10 10" style="margin-left:5px; opacity:${opacity}; transform:${rotation}; transition: transform 0.2s;"><path d="M5 10L0 0L10 0L5 10Z" fill="${color}"/></svg>`;
    };

    const buildSortOptions = () => {
        const s = currentSort[DB_KEYS.SHOTS];
        const val = `${s.key}-${s.order}`;
        return `
            <select class="lib-sort-select" onchange="const [k, o] = this.value.split('-'); window.updateLibrarySort('${DB_KEYS.SHOTS}', k, o);">
                <option value="shotDate-desc" ${val === 'shotDate-desc' ? 'selected' : ''}>Date: Newest First</option>
                <option value="shotDate-asc" ${val === 'shotDate-asc' ? 'selected' : ''}>Date: Oldest First</option>
                <option value="name-asc" ${val === 'name-asc' ? 'selected' : ''}>Name: A-Z</option>
                <option value="name-desc" ${val === 'name-desc' ? 'selected' : ''}>Name: Z-A</option>
                <option value="data.rating-desc" ${val === 'data.rating-desc' ? 'selected' : ''}>Rating: High to Low</option>
                <option value="data.rating-asc" ${val === 'data.rating-asc' ? 'selected' : ''}>Rating: Low to High</option>
                <option value="duration-desc" ${val === 'duration-desc' ? 'selected' : ''}>Duration: Longest</option>
                <option value="duration-asc" ${val === 'duration-asc' ? 'selected' : ''}>Duration: Shortest</option>
            </select>`;
    };

    const createSection = (title, items, type) => {
        const isExpanded = libraryExpanded[type];
        const isShots = type === DB_KEYS.SHOTS;
        const iconExport = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;
        const iconTrash = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

        return `
            <div class="library-section">
                <div class="lib-toolbar">
                    <div class="lib-toolbar-left">
                        <input type="text" id="search-${type}" class="lib-search" placeholder="Search ${title}..." value="${librarySearch[type]}" oninput="window.updateLibrarySearch('${type}', this.value)">
                        ${isShots ? buildSortOptions() : ''}
                    </div>
                    <div class="lib-toolbar-right">
                        <button class="toolbar-icon-btn exp" title="Export All" onclick="window.exportFullLibrary('${type}')">${iconExport}</button>
                        <button class="toolbar-icon-btn del" title="Delete All" onclick="window.clearFullLibrary('${type}')">${iconTrash}</button>
                    </div>
                </div>
                <div class="lib-list-container ${isExpanded ? 'expanded' : ''}">
                    <table class="lib-table">
                        <thead>
                            <tr>
                                <th onclick="window.updateLibrarySort('${type}', 'name')">Name ${getSortIcon(type, 'name')}</th>
                                <th onclick="window.updateLibrarySort('${type}', 'shotDate')">Date ${getSortIcon(type, 'shotDate')}</th>
                                ${isShots ? `<th onclick="window.updateLibrarySort('${type}', 'profileName')">Profile ${getSortIcon(type, 'profileName')}</th>` : ''}
                                <th style="cursor:default; text-align:right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${items.length === 0 ? `<tr><td colspan="4" class="empty-msg">No results found</td></tr>` : items.map(item => {
                                const isMatch = (type === DB_KEYS.PROFILES && currentShotData && item.name.toLowerCase() === (currentShotData.profile || "").toLowerCase()) ||
                                                (type === DB_KEYS.SHOTS && currentProfileName && (item.profileName || "").toLowerCase() === currentProfileName.toLowerCase());
                                return `
                                    <tr style="${isMatch ? 'background-color: #f0fdf4; font-weight:600;' : ''}">
                                        <td title="${item.name}"><span class="lib-file-name" onclick="window.triggerLoad('${type}', '${item.name}')">${item.name}</span></td>
                                        <td class="lib-meta-cell">${new Date(item.shotDate).toLocaleDateString()} ${new Date(item.shotDate).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</td>
                                        ${isShots ? `<td class="lib-meta-cell">${item.profileName}</td>` : ''}
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

    stickyPanel.innerHTML = `
        <div class="library-status-bar">
            <div class="status-bar-group">
                <div id="drop-zone-import" class="status-badge import-action" title="Drag & Drop or Click to Import">
                    <span>IMPORT</span>
                    <input type="file" id="file-unified" multiple accept=".json" style="display: none;">
                </div>
                <div class="${shotClass}" onclick="window.toggleStickyPanel()">
                    <div class="badge-left"><div class="css-menu-icon"><span></span></div></div>
                    <span class="status-value">${currentShotName}</span>
                    <div class="badge-right">${currentShotData ? `<span class="unload-btn" onclick="window.unloadShot(event)">×</span>` : ''}</div>
                </div>
            </div>
            <div class="status-bar-group">
                <div class="${profileClass}" onclick="window.toggleStickyPanel()" title="${mismatchTitle}">
                    <div class="badge-left"><div class="css-menu-icon"><span></span></div></div>
                    <span class="status-value">${profileClass.includes('mismatch') ? '⚠ ' : ''}${currentProfileName}</span>
                    <div class="badge-right">${currentProfileData ? `<span class="unload-btn" onclick="window.unloadProfile(event)">×</span>` : ''}</div>
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

    // 2. RESTORE FOCUS
    if (activeId) {
        const el = document.getElementById(activeId);
        if (el) {
            el.focus();
            if (cursorPosition !== null) el.setSelectionRange(cursorPosition, cursorPosition);
        }
    }
}

function checkAndAnalyze() {
    if (!currentShotData) return;
    const resultArea = document.getElementById('result-area');
    if (resultArea) resultArea.style.display = 'block';

    if (!areControlsRendered) {
        renderControls();
        areControlsRendered = true;
    }
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
    
    // BUG FIX: Pass the current Active Columns to renderTable!
    // If activeColumnIds is empty (first load), pass null to let it use defaults.
    const activeColsToPass = activeColumnIds.size > 0 ? activeColumnIds : null;
    renderTable(results, activeColsToPass);
    
    renderChart(results, currentShotData);
}

/**
 * UI Controls Rendering (Fixed Layout & Buttons)
 */
function renderControls() {
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
                    <label style="cursor:pointer; user-select:none; display:flex; align-items:center;"><input type="checkbox" id="auto-sensor-delay" ${isSensorDelayAuto ? 'checked' : ''} style="margin-right:4px;"> Auto</label>
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

        // FOOTER HTML (New Layout: Standard Text Left | Icons Right)
        const footer = document.createElement('div');
        footer.id = 'controls-footer';
        footer.className = 'controls-footer';
        
        // Icons
        const resetIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg>`;
        const plusIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;

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
        
        // Hide footer initially if grid is collapsed (Optional, or keep always visible)
        // Let's keep it inside the collapse logic visually by toggling its display in toggleGrid
        
        columnsBox.appendChild(header);
        columnsBox.appendChild(grid);
        columnsBox.appendChild(footer); // Appended AFTER grid, so it sits at the bottom full width
        
        // Initially hide footer since grid is collapsed
        footer.style.display = 'none';

        wrapper.innerHTML = ''; 
        wrapper.appendChild(columnsBox);
        if (settingsDiv) {
             wrapper.appendChild(settingsDiv);
             attachLatencyListeners();
        }
    }

    function toggleGrid() {
        const gridEl = document.getElementById('controls-grid');
        const footerEl = document.getElementById('controls-footer'); // Select Footer
        const btn = document.getElementById('col-toggle-btn');
        const isCollapsed = gridEl.classList.contains('collapsed');
        
        if (isCollapsed) { 
            gridEl.classList.remove('collapsed'); 
            btn.classList.add('open'); 
            // FIX: Nutze 'flex' statt 'block', damit justify-content funktioniert!
            if(footerEl) footerEl.style.display = 'flex'; 
        } else { 
            gridEl.classList.add('collapsed'); 
            btn.classList.remove('open'); 
            if(footerEl) footerEl.style.display = 'none'; // Hide footer
        }
    }

    // 3. Render Checkboxes
    if (activeColumnIds.size === 0) {
        // CHECK FOR USER STANDARD ON LOAD
        const userStd = localStorage.getItem(DB_KEYS.USER_STANDARD);
        if (userStd) {
            const cols = JSON.parse(userStd);
            cols.forEach(id => activeColumnIds.add(id));
        } else {
            // Fallback to Factory Defaults
            if (columnConfig && Array.isArray(columnConfig)) {
                columnConfig.forEach(col => { if (col.default) activeColumnIds.add(col.id); });
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
            
            const isChecked = activeColumnIds.has(col.id);
            lbl.innerHTML = `<input type="checkbox" id="chk-${col.id}" ${isChecked ? 'checked' : ''}> ${col.label}${suffix}`;
            div.appendChild(lbl);
            
            setTimeout(() => {
                const cb = document.getElementById(`chk-${col.id}`);
                if (cb) cb.onchange = (e) => toggleColumn(col.id, e.target.checked);
            }, 0);
        });
        grid.appendChild(div);
    });

    // NOTE: We do NOT append footer to grid anymore. It lives outside.

    if (columnConfig) columnConfig.forEach(col => toggleColumn(col.id, activeColumnIds.has(col.id), false));
    refreshPresetDropdown();

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
    attachLatencyListeners();
}

/**
 * Handle Column Toggling (Logic)
 */
function toggleColumn(id, isChecked, updateTable = true) {
    if (isChecked) activeColumnIds.add(id);
    else activeColumnIds.delete(id);

    const chk = document.getElementById(`chk-${id}`);
    if (chk) chk.checked = isChecked;

    document.querySelectorAll(`.col-${id}`).forEach(el => {
        if (isChecked) el.classList.remove('hidden-col');
        else el.classList.add('hidden-col');
    });
}

/**
 * Applies the "Standard" Preset.
 * Priority: 1. User defined standard (if saved). 2. Factory defaults.
 */
window.applyStandardPreset = () => {
    const userStd = localStorage.getItem(DB_KEYS.USER_STANDARD);

    activeColumnIds.clear();

    if (userStd) {
        // Load User Standard
        const cols = JSON.parse(userStd);
        cols.forEach(id => activeColumnIds.add(id));
    } else {
        // Load Factory Defaults
        columnConfig.forEach(col => {
            if (col.default) activeColumnIds.add(col.id);
        });
    }

    // Sync UI
    columnConfig.forEach(col => toggleColumn(col.id, activeColumnIds.has(col.id)));
    document.getElementById('preset-select').value = ""; 
    document.getElementById('btn-del-preset').style.display = 'none';
};

/**
     * Hard Reset to Code defaults (Immediate, no confirm)
     */
    window.applyFactoryReset = () => {
        
        activeColumnIds.clear();
        columnConfig.forEach(col => {
            if (col.default) activeColumnIds.add(col.id);
        });
        
        // Sync UI
        columnConfig.forEach(col => toggleColumn(col.id, activeColumnIds.has(col.id)));
        
        // Reset Dropdown UI
        document.getElementById('preset-select').value = ""; 
        document.getElementById('btn-del-preset').style.display = 'none';
    };

/**
 * Save current selection as the new "Standard"
 */
window.saveCurrentAsStandard = () => {
    if(!confirm("Save current selection as your new 'Standard'?\nThis will be loaded when you click 'Standard' or reload the page.")) return;

    const cols = Array.from(activeColumnIds);
    localStorage.setItem(DB_KEYS.USER_STANDARD, JSON.stringify(cols));
    alert("New Standard saved!");
};

window.saveCurrentAsPreset = () => {
    const name = prompt("Enter a name for this preset:");
    if (!name) return;

    const presets = JSON.parse(localStorage.getItem(DB_KEYS.PRESETS) || '[]');
    const newPreset = {
        id: Date.now().toString(),
        name: name,
        columns: Array.from(activeColumnIds),
        isFavorite: false
    };

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
        alert("No favorite set yet. Save a preset and mark it as favorite.");
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

function applyPresetData(preset) {
    activeColumnIds.clear();
    preset.columns.forEach(id => activeColumnIds.add(id));
    columnConfig.forEach(col => {
        toggleColumn(col.id, activeColumnIds.has(col.id));
    });
}

function refreshPresetDropdown() {
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

// --- Action Helpers ---
window.toggleStickyPanel = () => { isLibraryCollapsed = !isLibraryCollapsed; refreshLibraryUI(); };

window.triggerLoad = (type, name) => {
    const entry = JSON.parse(localStorage.getItem(type) || '[]').find(i => i.name === name);
    if (entry) type === DB_KEYS.SHOTS ? loadShot(entry.data, entry.name) : loadProfile(entry.data, entry.name);
};

window.toggleLibraryExpand = (type) => { libraryExpanded[type] = !libraryExpanded[type]; refreshLibraryUI(); };

window.deleteSingleItem = (col, name) => { 
    if (confirm(`Delete "${name}"?`)) { 
        const current = JSON.parse(localStorage.getItem(col) || '[]');
        const filtered = current.filter(i => i.name !== name);
        localStorage.setItem(col, JSON.stringify(filtered)); 
        refreshLibraryUI(); 
    }
};

window.clearFullLibrary = (col) => { 
    const count = JSON.parse(localStorage.getItem(col) || '[]').length;
    if (count === 0) return;
    if (confirm(`Are you sure you want to DELETE ALL ${count} items from ${col === DB_KEYS.SHOTS ? 'Shots' : 'Profiles'}? This cannot be undone.`)) { 
        localStorage.setItem(col, "[]"); 
        refreshLibraryUI(); 
    }
};

window.exportSingleItem = (col, name) => {
    const item = JSON.parse(localStorage.getItem(col)).find(i => i.name === name);
    if (!item) return;

    const jsonStr = JSON.stringify(item.data, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    
    let safeName = name;
    if (!safeName.toLowerCase().endsWith('.json')) {
        safeName += '.json';
    }
    
    link.download = safeName; 
    link.click();
    URL.revokeObjectURL(url);
};

window.exportFullLibrary = (col) => { 
    const items = JSON.parse(localStorage.getItem(col) || '[]');
    if (items.length === 0) return;
    if (confirm(`Export all ${items.length} items from ${col === DB_KEYS.SHOTS ? 'Shots' : 'Profiles'}?`)) {
        items.forEach((item, i) => {
            setTimeout(() => window.exportSingleItem(col, item.name), i * 300);
        });
    }
};

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
    box.innerHTML = `<h3 style="margin: 0; color: #2c3e50;">Advanced Statistics coming soon!</h3><div style="font-size: 0.8em; color: #bdc3c7;">Click to close</div>`;
    overlay.onclick = () => document.body.removeChild(overlay);
    overlay.appendChild(box); document.body.appendChild(overlay);
};

window.updateShotMeta = (field, value) => {
    if (!currentShotData) return;
    if (field === 'doseIn' || field === 'doseOut' || field === 'rating') value = parseFloat(value);
    currentShotData[field] = value;
    
    if (field === 'doseIn' || field === 'doseOut') {
        const inVal = parseFloat(currentShotData.doseIn) || 0;
        const outVal = parseFloat(currentShotData.doseOut) || 0;
        if (inVal > 0 && outVal > 0) {
            currentShotData.ratio = parseFloat((outVal / inVal).toFixed(2));
            const ratioInput = document.getElementById('meta-ratio');
            if (ratioInput) ratioInput.value = currentShotData.ratio;
        }
    }
    
    const library = JSON.parse(localStorage.getItem(DB_KEYS.SHOTS) || '[]');
    const index = library.findIndex(i => i.name === currentShotData.name || i.fileName === currentShotData.fileName); 
    if (index > -1) {
        library[index].data = currentShotData;
        localStorage.setItem(DB_KEYS.SHOTS, JSON.stringify(library));
    }
};

window.exportCurrentShot = () => {
    if (!currentShotData) return;
    const jsonStr = JSON.stringify(currentShotData, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    let downloadName = currentShotName;
    if (!downloadName.toLowerCase().endsWith('.json')) downloadName += '.json';
    link.download = downloadName;
    link.click();
    URL.revokeObjectURL(url);
};