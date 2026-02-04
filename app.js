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

    // Initialize Database UI
    refreshLibraryUI();

    // --- Scroll-Check for Sticky Panel ---
    window.addEventListener('scroll', () => {
        const panel = document.getElementById('sticky-library-panel');
        const uploadGrid = document.querySelector('.upload-grid');
        
        if (panel && uploadGrid) {
            const threshold = uploadGrid.offsetTop + uploadGrid.offsetHeight;
            
            if (window.scrollY > (threshold - 20)) {
                panel.classList.add('is-stuck');
            } else {
                panel.classList.remove('is-stuck');
            }
        }
    });

    // Initialize Database UI
    refreshLibraryUI();

    // Setup Drop Zones with explicit storage logic
    setupDropZone('drop-zone-shot', 'file-shot', (data, name) => {
        console.log("Shot uploaded:", name);
        saveToLibrary(DB_KEYS.SHOTS, name, data);
        loadShot(data, name);
    });

    setupDropZone('drop-zone-profile', 'file-profile', (data, name) => {
        console.log("Profile uploaded:", name);
        saveToLibrary(DB_KEYS.PROFILES, name, data);
        loadProfile(data, name);
    });
});

/**
 * Global Expose: Unload current Shot
 */
window.unloadShot = (e) => {
    if (e) e.stopPropagation(); 
    currentShotData = null;
    currentShotName = "No Shot Loaded";
    
    const label = document.getElementById('label-shot');
    const zone = document.getElementById('drop-zone-shot');
    if (label) label.innerText = "Drag & Drop or Click to Upload Shot File(s)";
    if (zone) zone.classList.remove('loaded');
    
    // Clear Analysis Areas
    const controlsArea = document.getElementById('controls-area');
    const chartArea = document.getElementById('chart-wrapper');
    const infoArea = document.getElementById('file-info-container');
    if (controlsArea) controlsArea.style.display = 'none';
    if (chartArea) chartArea.style.display = 'none';
    if (infoArea) infoArea.style.display = 'none';
    const statsTable = document.getElementById('stats-table');
    if (statsTable) statsTable.innerHTML = '';

    refreshLibraryUI();
};

/**
 * Global Expose: Unload current Profile
 */
window.unloadProfile = (e) => {
    if (e) e.stopPropagation(); 
    currentProfileData = null;
    currentProfileName = "No Profile Loaded";
    
    const label = document.getElementById('label-profile');
    const zone = document.getElementById('drop-zone-profile');
    if (label) label.innerText = "Drag & Drop or Click to Upload Profile File(s)";
    if (zone) zone.classList.remove('loaded');

    if (currentShotData) checkAndAnalyze();
    refreshLibraryUI();
};

/**
 * Core loading logic for Shots 
 * FEATURE: Auto-loads the matching profile from library if it exists.
 */
function loadShot(data, name) {
    currentShotData = data;
    currentShotName = cleanName(name); 
    
    // --- AUTO-MATCH LOGIC START ---
    // Check if the shot refers to a specific profile
    if (data.profile) {
        try {
            // Get all saved profiles
            const profiles = JSON.parse(localStorage.getItem(DB_KEYS.PROFILES) || '[]');
            
            // Normalize names for comparison (remove .json, lowercase)
            const targetName = cleanName(data.profile).toLowerCase();
            
            // Find the matching profile in the library
            const match = profiles.find(p => cleanName(p.name).toLowerCase() === targetName);

            if (match) {
                console.log(`Auto-matched Profile found: ${match.name}`);
                // Load the profile. 
                // NOTE: loadProfile() calls refreshLibraryUI() and checkAndAnalyze(),
                // so we return immediately to avoid double-rendering/analyzing.
                loadProfile(match.data, match.name);
                return; 
            }
        } catch (e) {
            console.warn("Auto-match failed:", e);
        }
    }
    // --- AUTO-MATCH LOGIC END ---

    // If no match found (or no profile reference), proceed as normal
    refreshLibraryUI(); 
    checkAndAnalyze();
}

/**
 * Core loading logic for Profiles
 */
function loadProfile(data, name) {
    currentProfileData = data;
    currentProfileName = cleanName(name); 

    refreshLibraryUI(); 
    checkAndAnalyze();
}

/**
 * Persists JSON data with extracted metadata
 */
function saveToLibrary(collection, fileName, data) {
    try {
        const library = JSON.parse(localStorage.getItem(collection) || '[]');
        const existingIndex = library.findIndex(item => item.name === fileName);
        
        const meta = {
            name: fileName,
            saveDate: Date.now(), 
            shotDate: data.timestamp ? data.timestamp * 1000 : Date.now(), 
            profileName: data.profile || "Manual/Unknown",
            duration: data.samples ? ((data.samples[data.samples.length-1].t - data.samples[0].t) / 1000).toFixed(1) : 0
        };

        const entry = { ...meta, data: data };

        if (existingIndex > -1) {
            library[existingIndex] = entry;
        } else {
            library.push(entry);
        }
        
        localStorage.setItem(collection, JSON.stringify(library));
        refreshLibraryUI();
    } catch (e) {
        console.error("Database Save Error:", e);
    }
}

// Global state for current sorting
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
 * Global Expose: Show graphical info about upcoming stats features
 * Creates a custom overlay because standard alerts cannot show images.
 */
window.showStatsFeatureInfo = () => {
    // 1. Create the background overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.4); z-index: 10000;
        display: flex; align-items: center; justify-content: center;
        backdrop-filter: blur(2px); cursor: pointer;
        animation: fadeIn 0.2s ease-out;
    `;

    // 2. Create the white content box
    const content = document.createElement('div');
    content.style.cssText = `
        background: white; padding: 40px; border-radius: 12px;
        text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.15);
        border: 1px solid #eee; max-width: 300px;
        display: flex; flex-direction: column; align-items: center; gap: 20px;
    `;

    // 3. Set the HTML content (Text + Logo)
    content.innerHTML = `
        <h3 style="margin: 0; color: #2c3e50; font-size: 1.1em; line-height: 1.5;">
            Advanced Statistics<br>and Insights coming soon!
        </h3>
        
        <img src="ui/assets/deep-dive-logo.png" alt="Deep Dive Logo" style="width: 140px; opacity: 0.9;">
        
        <div style="font-size: 0.75em; color: #bdc3c7; text-transform: uppercase; letter-spacing: 1px;">
            Click to close
        </div>
    `;

    // 4. Click to close logic
    overlay.onclick = () => {
        overlay.style.opacity = '0'; // Fade out effect
        setTimeout(() => document.body.removeChild(overlay), 200);
    };

    // Assemble and show
    overlay.appendChild(content);
    document.body.appendChild(overlay);
};

/**
 * Updates the visual list of stored files in a sticky, collapsible panel
 * Features: Auto-Matching Sort & Mismatch Detection
 */
function refreshLibraryUI() {
    let stickyPanel = document.getElementById('sticky-library-panel');
    
    if (!stickyPanel) {
        stickyPanel = document.createElement('div');
        stickyPanel.id = 'sticky-library-panel';
        stickyPanel.className = 'sticky-library-panel';
        const uploadGrid = document.querySelector('.upload-grid');
        if (uploadGrid && uploadGrid.nextSibling) {
            uploadGrid.parentNode.insertBefore(stickyPanel, uploadGrid.nextSibling);
        }
    }

    if (isLibraryCollapsed) {
        stickyPanel.classList.add('collapsed');
    } else {
        stickyPanel.classList.remove('collapsed');
    }

    // 1. Get standard sorted lists
    let shots = getSortedLibrary(DB_KEYS.SHOTS);
    let profiles = getSortedLibrary(DB_KEYS.PROFILES);

    // 2. AUTO-MATCH SORTING LOGIC
    // Logic: If a Shot is loaded, move the matching Profile to top.
    if (currentShotData && currentShotData.profile) {
        const targetProfile = cleanName(currentShotData.profile).toLowerCase();
        
        profiles.sort((a, b) => {
            const aName = cleanName(a.name).toLowerCase();
            const bName = cleanName(b.name).toLowerCase();
            
            // Check for exact matches
            const aIsMatch = aName === targetProfile;
            const bIsMatch = bName === targetProfile;
            
            // Move match to top (-1), keep others in current order (0)
            if (aIsMatch && !bIsMatch) return -1;
            if (!aIsMatch && bIsMatch) return 1;
            return 0;
        });
    }

    // Logic: If a Profile is loaded, move matching Shots to top.
    if (currentProfileName) {
        const targetProfileName = cleanName(currentProfileName).toLowerCase();

        shots.sort((a, b) => {
            const aProf = cleanName(a.profileName || "").toLowerCase();
            const bProf = cleanName(b.profileName || "").toLowerCase();

            const aIsMatch = aProf === targetProfileName;
            const bIsMatch = bProf === targetProfileName;

            if (aIsMatch && !bIsMatch) return -1;
            if (!aIsMatch && bIsMatch) return 1;
            return 0;
        });
    }

    const createSection = (baseTitle, items, type) => {
        const isExpanded = libraryExpanded[type];
        const columnCount = type === DB_KEYS.SHOTS ? 4 : 3;
        const countLabel = `(${items.length})`;

        return `
            <div class="library-section">
                <div class="lib-header">
                    <div class="header-left">
                        <span class="sort-label">${baseTitle} ${countLabel}</span>
                        <button class="btn-sort" onclick="window.updateSort('${type}', 'shotDate')">Date</button>
                        <button class="btn-sort" onclick="window.updateSort('${type}', 'name')">Name</button>
                        ${type === DB_KEYS.SHOTS ? `<button class="btn-sort" onclick="window.updateSort('${type}', 'profileName')">Profile</button>` : ''}
                    </div>

                    <div class="header-right">
                        <button class="btn-export-all" onclick="window.exportFullLibrary('${type}')">Export All</button>
                        <button class="btn-clear-all" onclick="window.clearFullLibrary('${type}')">Delete All</button>
                    </div>
                </div>

                <div class="lib-list-container ${isExpanded ? 'expanded' : ''}">
                    <table class="lib-table ${type === DB_KEYS.PROFILES ? 'profile-table' : ''}">
                        <thead>
                            <tr>
                                <th style="text-align:left">Name</th>
                                <th>Date / Time</th>
                                ${type === DB_KEYS.SHOTS ? '<th>Profile</th>' : ''}
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${items.length === 0 ? `<tr><td colspan="${columnCount}" class="empty-msg">No entries saved</td></tr>` : 
                              items.map(item => {
                                const cleanItemName = cleanName(item.name);
                                const cleanProfileName = cleanName(item.profileName);
                                const dateStr = new Date(item.shotDate).toLocaleString('de-DE', { 
                                    day: '2-digit', month: '2-digit', year: '2-digit', 
                                    hour: '2-digit', minute: '2-digit' 
                                });

                                // Highlight logic for table rows (Visual aid for matching)
                                let rowStyle = '';
                                if (type === DB_KEYS.PROFILES && currentShotData) {
                                    const target = cleanName(currentShotData.profile).toLowerCase();
                                    if (cleanItemName.toLowerCase() === target) rowStyle = 'background-color: #f0fdf4; font-weight:bold;';
                                }
                                if (type === DB_KEYS.SHOTS && currentProfileName) {
                                    const target = cleanName(currentProfileName).toLowerCase();
                                    if (cleanProfileName.toLowerCase() === target) rowStyle = 'background-color: #f0fdf4; font-weight:bold;';
                                }

                                return `
                                    <tr style="${rowStyle}">
                                        <td title="${cleanItemName}">
                                            <span class="lib-file-name" onclick="window.triggerLoad('${type}', '${item.name}')">
                                                ${cleanItemName}
                                            </span>
                                        </td>
                                        <td class="lib-meta-cell">${dateStr}</td>
                                        ${type === DB_KEYS.SHOTS ? `<td class="lib-meta-cell" title="${cleanProfileName || '-'}">${cleanProfileName || '-'}</td>` : ''}
                                        <td>
                                            <div class="lib-action-cell">
                                                <span class="lib-row-btn exp" title="Export JSON" onclick="window.exportSingleItem('${type}', '${item.name}')">EXP</span>
                                                <span class="lib-row-btn del" title="Delete permanently" onclick="window.deleteSingleItem('${type}', '${item.name}')">−</span>
                                            </div>
                                        </td>
                                    </tr>
                                `;
                              }).join('')}
                        </tbody>
                    </table>
                </div>
                ${items.length > 4 ? `
                    <button class="btn-show-more" onclick="window.toggleLibraryExpand('${type}')">
                        ${isExpanded ? 'Show Less' : 'Show All Entries'}
                    </button>
                ` : ''}
            </div>
        `;
    };

    // 3. MISMATCH DETECTION LOGIC
    let shotClass = currentShotData ? 'status-badge shot loaded' : 'status-badge shot';
    let profileClass = currentProfileData ? 'status-badge profile loaded' : 'status-badge profile';
    let mismatchTitle = "Click to open/close Library";

    if (currentShotData && currentProfileData) {
        const shotProfileRef = cleanName(currentShotData.profile || "").toLowerCase();
        const activeProfileName = cleanName(currentProfileName).toLowerCase();

        // If Shot specifies a profile, but the loaded profile is different -> Mismatch
        if (shotProfileRef && shotProfileRef !== activeProfileName) {
            profileClass = 'status-badge profile mismatch';
            mismatchTitle = `Warning: This profile does not match the shot's reference (${cleanName(currentShotData.profile)})`;
        }
    }

    // --- HTML STRUCTURE (Aligned Grid) ---
    // The status bar is now a grid with 2 columns, matching the drop zones.
    // Left Column: [Logo/Import] + [Shot Badge]
    // Right Column: [Profile Badge] + [Stats]
    
    let html = `
        <div class="library-status-bar">
            
            <div class="status-bar-group">
                <div class="status-badge left-container">
                    <img src="ui/assets/deep-dive-logo.png" alt="Deep Dive Logo" class="header-app-logo">
                    <div class="header-import-btn" onclick="window.scrollTo({ top: 0, behavior: 'smooth' })" title="Scroll to Drop Zones">
                        <span>IMPORT</span>
                    </div>
                </div>

                <div class="${shotClass}" onclick="window.toggleStickyPanel()" title="Click to open/close Library">
                    <span class="status-value">${currentShotName}</span>
                    <div class="badge-controls">
                        ${currentShotData ? `<span class="unload-btn" title="Unload Shot" onclick="window.unloadShot(event)">×</span>` : ''}
                        <div class="css-menu-icon"><span></span></div>
                    </div>
                </div>
            </div>

            <div class="status-bar-group">
                <div class="${profileClass}" onclick="window.toggleStickyPanel()" title="${mismatchTitle}">
                    <span class="status-value">
                        ${profileClass.includes('mismatch') ? '<span class="warning-icon">⚠</span>' : ''}
                        ${currentProfileName}
                    </span>
                    <div class="badge-controls">
                        ${currentProfileData ? `<span class="unload-btn" title="Unload Profile" onclick="window.unloadProfile(event)">×</span>` : ''}
                        <div class="css-menu-icon"><span></span></div>
                    </div>
                </div>

                <div class="status-badge stats-action" onclick="window.showStatsFeatureInfo()" title="Coming Soon: Advanced Analytics">
                    <span>STATS</span>
                </div>
            </div>

        </div>

        <div class="library-grid">
            ${createSection('Shots', shots, DB_KEYS.SHOTS)}
            ${createSection('Profiles', profiles, DB_KEYS.PROFILES)}
        </div>
    `;

    if (!isLibraryCollapsed) {
        html += `
            <div class="library-footer">
                <button class="btn-close-panel" onclick="window.toggleStickyPanel()">Close Library</button>
            </div>
        `;
    }

    stickyPanel.innerHTML = html;
}

window.toggleStickyPanel = () => {
    isLibraryCollapsed = !isLibraryCollapsed;
    refreshLibraryUI();
};
window.triggerLoad = (type, name) => {
    const library = JSON.parse(localStorage.getItem(type) || '[]');
    const entry = library.find(i => i.name === name);
    if (entry) {
        if (type === DB_KEYS.SHOTS) loadShot(entry.data, entry.name);
        else loadProfile(entry.data, entry.name);
    }
};
window.toggleLibraryExpand = (type) => {
    libraryExpanded[type] = !libraryExpanded[type];
    refreshLibraryUI();
};
window.deleteSingleItem = (collection, name) => {
    const typeText = collection === DB_KEYS.SHOTS ? 'Shot' : 'Profile';
    if (confirm(`Are you sure you want to delete the ${typeText} "${name}"?`)) {
        const library = JSON.parse(localStorage.getItem(collection) || '[]');
        const filtered = library.filter(item => item.name !== name);
        localStorage.setItem(collection, JSON.stringify(filtered));
        refreshLibraryUI();
    }
};
window.clearFullLibrary = (collection) => {
    const typeText = collection === DB_KEYS.SHOTS ? 'ALL Shots' : 'ALL Profiles';
    if (confirm(`DANGER: Are you sure you want to delete ${typeText}? This cannot be undone.`)) {
        localStorage.setItem(collection, JSON.stringify([]));
        refreshLibraryUI();
    }
};
window.exportSingleItem = (collection, name) => {
    const library = JSON.parse(localStorage.getItem(collection) || '[]');
    const item = library.find(i => i.name === name);
    if (!item) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(item.data, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", name);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
};
window.exportFullLibrary = (collection) => {
    const library = JSON.parse(localStorage.getItem(collection) || '[]');
    if (library.length === 0) return;
    library.forEach((item, index) => {
        setTimeout(() => {
            window.exportSingleItem(collection, item.name);
        }, index * 200);
    });
};
function processFileList(files, expectedType, callback) {
    Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                const hasSamples = data.hasOwnProperty('samples');
                const hasPhases = data.hasOwnProperty('phases');
                let detectedType = hasSamples ? "SHOT" : (hasPhases ? "PROFILE" : "UNKNOWN");
                if (detectedType !== expectedType) {
                    throw new Error(`Type mismatch: ${file.name} is a ${detectedType}`);
                }
                callback(data, file.name);
            } catch (err) {
                console.error("Batch Import Error:", err);
                alert(`Could not import ${file.name}: ${err.message}`);
            }
        };
        reader.readAsText(file);
    });
}
function checkAndAnalyze() {
    if (currentShotData) {
        const controlsArea = document.getElementById('controls-area');
        if (controlsArea) controlsArea.style.display = 'block';
        renderControls();
        performAnalysis();
    }
}
function performAnalysis() {
    const scaleDelayInput = document.getElementById('predictive-scale-delay');
    const sensorDelayInput = document.getElementById('predictive-sensor-delay');
    const manualScale = scaleDelayInput ? (parseFloat(scaleDelayInput.value) || 800) : 800;
    const manualSensor = sensorDelayInput ? (parseFloat(sensorDelayInput.value) || 200) : 200;
    let usedSensorDelay = manualSensor;
    let autoActive = false;
    if (isSensorDelayAuto) {
        const detection = detectAutoDelay(currentShotData, currentProfileData, manualSensor);
        usedSensorDelay = detection.delay;
        autoActive = detection.auto;
    }
    const results = calculateShotMetrics(currentShotData, currentProfileData, {
        scaleDelayMs: manualScale,
        sensorDelayMs: usedSensorDelay,
        isAutoAdjusted: autoActive
    });
    renderFileInfo(currentShotData, currentShotName);
    renderTable(results);
    renderChart(results);
}
function toggleExtendedInfo() {
    const content = document.getElementById('extended-info-content');
    const toggleBtn = document.getElementById('toggle-info-btn');
    if (!content || !toggleBtn) return;
    isInfoExpanded = !isInfoExpanded;
    content.style.display = isInfoExpanded ? 'block' : 'none';
    toggleBtn.innerText = isInfoExpanded ? "Less Info" : "More Info";
}
function setupDropZone(zoneId, inputId, callback) {
    const zone = document.getElementById(zoneId);
    const input = document.getElementById(inputId);
    if (!zone || !input) return;
    const expectedType = zoneId.includes('shot') ? 'SHOT' : 'PROFILE';
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('hover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('hover'));
    zone.addEventListener('drop', (e) => { 
        e.preventDefault(); 
        zone.classList.remove('hover'); 
        if (e.dataTransfer.files.length > 0) {
            handleMultipleFiles(e.dataTransfer.files, expectedType, callback);
        }
    });
    zone.addEventListener('click', () => input.click());
    input.addEventListener('change', (e) => { 
        if (e.target.files.length > 0) {
            handleMultipleFiles(e.target.files, expectedType, callback);
        }
    });
}
function handleMultipleFiles(fileList, expectedType, callback) {
    Array.from(fileList).forEach(file => {
        processFile(file, expectedType, callback);
    });
}
function processFile(file, expectedType, callback) {
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = JSON.parse(event.target.result);
            const hasSamples = data.hasOwnProperty('samples');
            const hasPhases = data.hasOwnProperty('phases');
            let detectedType = "UNKNOWN";
            if (hasSamples) detectedType = "SHOT";
            else if (hasPhases) detectedType = "PROFILE";
            if (detectedType === "UNKNOWN") {
                throw new Error("The file format is not recognized as a GaggiMate file. (Missing 'samples' or 'phases')");
            }
            if (detectedType !== expectedType) {
                const typeName = expectedType === 'SHOT' ? 'Shot (recording)' : 'Profile (recipe)';
                const foundName = detectedType === 'SHOT' ? 'Shot' : 'Profile';
                throw new Error(`You tried to upload a ${foundName} into a ${typeName} zone. (Type mismatch: ${detectedType}_TO_${expectedType})`);
            }
            callback(data, file.name);
        } catch (err) { 
            console.error("File Processing Error:", err);
            const friendlyMsg = "Oops! Something went wrong with the file upload.";
            const instruction = "\n\nPlease make sure you are uploading the correct JSON file to the right area.";
            alert(`${friendlyMsg}${instruction}\n\n[Details: ${err.message}]`); 
        }
    };
    reader.onerror = () => alert("The file could not be read at all. (FileReader error)");
    reader.readAsText(file);
}
function renderControls() {
    const controlsGrid = document.getElementById('controls-grid');
    if (!controlsGrid) return;
    controlsGrid.innerHTML = '';
    let settingsDiv = document.getElementById('analysis-settings');
    if (!settingsDiv) {
        settingsDiv = document.createElement('div');
        settingsDiv.id = 'analysis-settings';
        settingsDiv.innerHTML = `
            <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 20px; font-size: 0.9em;">
                <h4 style="margin: 0; color: #34495e; margin-right: 10px; font-size: 1em;">Analysis Latency (Delays)</h4>
                <div style="display: flex; align-items: center; gap: 5px;" title="Estimated delay of Bluetooth scales.">
                    <label for="predictive-scale-delay" style="font-weight: bold; color: #555;">Scale (BT):</label>
                    <input type="number" id="predictive-scale-delay" value="800" step="50" style="padding: 2px 4px; width: 55px; border: 1px solid #ccc; border-radius: 3px;">
                    <span style="color: #888;">ms</span>
                </div>
                <div style="display: flex; align-items: center; gap: 5px;" title="Compensates for system processing time and sensor lag.">
                    <label for="predictive-sensor-delay" style="font-weight: bold; color: #555;">System/Sensor:</label>
                    <input type="number" id="predictive-sensor-delay" value="200" step="50" style="padding: 2px 4px; width: 55px; border: 1px solid #ccc; border-radius: 3px;">
                    <span style="color: #888;">ms</span>
                    <div style="margin-left:8px; display:flex; align-items:center;">
                        <input type="checkbox" id="auto-sensor-delay" ${isSensorDelayAuto ? 'checked' : ''} style="cursor:pointer;">
                        <label for="auto-sensor-delay" style="margin-left:4px; color:#16a085; cursor:pointer; font-weight:bold;">Auto-Adjust</label>
                    </div>
                </div>
            </div>
        `;
        const table = document.getElementById('stats-table');
        if (table && table.parentNode) {
            table.parentNode.insertBefore(settingsDiv, table); 
        }
    }
    const scaleInput = document.getElementById('predictive-scale-delay');
    const sensorInput = document.getElementById('predictive-sensor-delay');
    const autoCheck = document.getElementById('auto-sensor-delay');
    if (scaleInput) scaleInput.onchange = performAnalysis;
    if (sensorInput) {
        sensorInput.onchange = performAnalysis;
        sensorInput.disabled = isSensorDelayAuto;
        sensorInput.style.backgroundColor = isSensorDelayAuto ? '#f0f0f0' : 'white';
    }
    if (autoCheck) {
        autoCheck.onchange = (e) => {
            isSensorDelayAuto = e.target.checked;
            sensorInput.disabled = isSensorDelayAuto;
            sensorInput.style.backgroundColor = isSensorDelayAuto ? '#f0f0f0' : 'white';
            performAnalysis();
        };
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
            let fullText = col.label;
            if (col.type !== 'val' && col.type !== 'bool') {
                fullText += ` <small style="color:#7f8c8d; font-size:0.85em;">${suffix}</small>`;
            }
            label.innerHTML = `<input type="checkbox" id="chk-${col.id}" ${col.default ? 'checked' : ''}> ${fullText}`;
            groupDiv.appendChild(label);
            setTimeout(() => {
                const cb = document.getElementById(`chk-${col.id}`);
                if(cb) cb.onchange = () => toggleColumn(col.id);
            }, 0);
        });
        controlsGrid.appendChild(groupDiv);
    });
}
function toggleColumn(colId) {
    const isChecked = document.getElementById(`chk-${colId}`).checked;
    document.querySelectorAll(`.col-${colId}`).forEach(el => {
        isChecked ? el.classList.remove('hidden-col') : el.classList.add('hidden-col');
    });
}