/**
 * Renderer for the Sticky Library Panel
 */
import { DB_KEYS, cleanName } from './config.js';
import { appState } from './state.js';
import { getSortedLibrary } from './storage.js';

export function refreshLibraryUI() {
    // 1. CAPTURE FOCUS
    const activeEl = document.activeElement;
    const activeId = activeEl ? activeEl.id : null;
    const cursorPosition = (activeId && activeEl.type === 'text') ? activeEl.selectionStart : null;

    let stickyPanel = document.getElementById('sticky-library-panel');
    if (!stickyPanel) {
        stickyPanel = document.createElement('div');
        stickyPanel.id = 'sticky-library-panel';
        stickyPanel.className = appState.isLibraryCollapsed ? 'sticky-library-panel collapsed' : 'sticky-library-panel';
        const header = document.getElementById('main-header'); 
        const container = document.querySelector('.container');
        if (header && header.nextSibling) header.parentNode.insertBefore(stickyPanel, header.nextSibling);
        else if (container) container.insertBefore(stickyPanel, container.firstChild);
    } else {
        stickyPanel.className = appState.isLibraryCollapsed ? 'sticky-library-panel collapsed' : 'sticky-library-panel';
    }

    let shots = getSortedLibrary(DB_KEYS.SHOTS);
    let profiles = getSortedLibrary(DB_KEYS.PROFILES);

    // --- Bidirectional Auto-Match Sorting ---
    const cleanStr = (str) => (str || "").replace(/\.json$/i, '').trim().toLowerCase();

    // Sort Profiles if Shot loaded
    if (appState.currentShotData && appState.currentShotData.profile && !appState.librarySearch.profiles) {
        const target = cleanStr(appState.currentShotData.profile);
        profiles.sort((a, b) => {
            const valA = cleanStr(a.name);
            const valB = cleanStr(b.name);
            if (valA === target) return -1; 
            if (valB === target) return 1;
            return 0;
        });
    }

    // Sort Shots if Profile loaded
    if (appState.currentProfileData && !appState.librarySearch.shots) {
        const target = cleanStr(appState.currentProfileName);
        shots.sort((a, b) => {
            const valA = cleanStr(a.profileName);
            const valB = cleanStr(b.profileName);
            const matchA = valA === target;
            const matchB = valB === target;
            if (matchA && !matchB) return -1;
            if (!matchA && matchB) return 1;
            return 0; 
        });
    }

    // Icons
    const searchIcon = `<svg class="lib-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`;
    const exportIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;stroke-width:2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;
    const trashIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;stroke-width:2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
    const chevronDown = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
    const chevronUp = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>`;

    const getSortIcon = (colType, colKey) => {
        const stateKey = colType === DB_KEYS.SHOTS ? 'shots' : 'profiles';
        const active = appState.currentSort[stateKey];
        const isActive = active.key === colKey;
        const opacity = isActive ? 1 : 0.2;
        const rotation = (isActive && active.order === 'asc') ? 'rotate(180)' : 'rotate(0)';
        return `<svg width="8" height="8" viewBox="0 0 10 10" style="margin-left:5px; opacity:${opacity}; transform:${rotation}; transition: transform 0.2s;"><path d="M5 10L0 0L10 0L5 10Z" fill="#2c3e50"/></svg>`;
    };

    const buildSortOptions = () => {
        const s = appState.currentSort.shots;
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
        const stateKey = type === DB_KEYS.SHOTS ? 'SHOTS' : 'PROFILES'; // libraryExpanded uses uppercase keys
        const isExpanded = appState.libraryExpanded[stateKey];
        const isShots = type === DB_KEYS.SHOTS;

        const widthName = isShots ? "20%" : "55%";
        const widthDate = "30%";
        const widthProfile = "38%";
        const widthAction = "12%";

        // Search value needs helper to get correct state key
        const searchKey = type === DB_KEYS.SHOTS ? 'shots' : 'profiles';

        return `
            <div class="library-section">
                <div class="lib-toolbar">
                    <div class="lib-toolbar-left">
                        <div class="lib-search-wrapper">
                            ${searchIcon}
                            <input type="text" id="search-${type}" class="lib-search" 
                                   placeholder="Search ${title}..." value="${appState.librarySearch[searchKey]}" 
                                   oninput="window.updateLibrarySearch('${type}', this.value)">
                        </div>
                        ${isShots ? buildSortOptions() : ''}
                    </div>
                    <div class="lib-toolbar-right">
                        <button class="toolbar-icon-btn exp" title="Export All" onclick="window.exportFullLibrary('${type}')">${exportIcon}</button>
                        <button class="toolbar-icon-btn del" title="Delete All" onclick="window.clearFullLibrary('${type}')">${trashIcon}</button>
                    </div>
                </div>
                <div class="lib-list-container ${isExpanded ? 'expanded' : ''}">
                    <table class="lib-table">
                        <thead>
                            <tr>
                                <th style="width: ${widthName}" onclick="window.updateLibrarySort('${type}', 'name')">Name ${getSortIcon(type, 'name')}</th>
                                <th style="width: ${widthDate}" onclick="window.updateLibrarySort('${type}', 'shotDate')">Date ${getSortIcon(type, 'shotDate')}</th>
                                ${isShots ? `<th style="width: ${widthProfile}" onclick="window.updateLibrarySort('${type}', 'profileName')">Profile ${getSortIcon(type, 'profileName')}</th>` : ''}
                                <th style="width: ${widthAction}; text-align:right;"></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${items.length === 0 ? `<tr><td colspan="4" class="empty-msg" style="padding:15px; text-align:center; color:#999;">No results found</td></tr>` : items.map(item => {
                                
                                const cleanItemName = cleanStr(item.name);
                                const displayName = item.name.replace(/\.json$/i, ''); 
                                const cleanProfileRef = (appState.currentShotData && appState.currentShotData.profile) ? cleanStr(appState.currentShotData.profile) : "";
                                const cleanCurrentProfile = appState.currentProfileName ? cleanStr(appState.currentProfileName) : "";

                                let isMatch = false;
                                if (type === DB_KEYS.PROFILES && cleanProfileRef) {
                                    isMatch = (cleanItemName === cleanProfileRef);
                                } else if (type === DB_KEYS.SHOTS && cleanCurrentProfile) {
                                    isMatch = (cleanStr(item.profileName || "") === cleanCurrentProfile);
                                }

                                const clickAction = `window.triggerLoad('${type}', '${item.name}')`;
                                
                                return `
                                    <tr class="${isMatch ? 'row-match' : ''}" onclick="${clickAction}">
                                        <td title="${item.name}">
                                            <span class="cell-main">${displayName}</span>
                                        </td>
                                        <td>
                                            <span class="cell-meta">${new Date(item.shotDate).toLocaleDateString()}</span>
                                            <span class="cell-meta" style="font-size:0.75em; margin-left:4px;">${new Date(item.shotDate).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                        </td>
                                        ${isShots ? `<td><span class="cell-meta">${item.profileName}</span></td>` : ''}
                                        <td>
                                            <div class="lib-action-cell" onclick="event.stopPropagation()">
                                                <button class="icon-btn exp" title="Export JSON" onclick="window.exportSingleItem('${type}', '${item.name}')">${exportIcon}</button>
                                                <button class="icon-btn del" title="Delete" onclick="window.deleteSingleItem('${type}', '${item.name}')">${trashIcon}</button>
                                            </div>
                                        </td>
                                    </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
                ${items.length > 4 ? `<button class="btn-show-more" onclick="window.toggleLibraryExpand('${type}')" title="${isExpanded ? 'Show Less' : 'Show All'}">${isExpanded ? chevronUp : chevronDown}</button>` : ''}
            </div>`;
    };

    const shotClass = appState.currentShotData ? 'status-badge shot loaded' : 'status-badge shot';
    let profileClass = appState.currentProfileData ? 'status-badge profile loaded' : 'status-badge profile';
    let mismatchTitle = "Click to open/close Library";

    if (appState.currentShotData && appState.currentProfileData) {
        const shotRef = cleanStr(appState.currentShotData.profile);
        const activeLabel = cleanStr(appState.currentProfileName);
        if (shotRef && shotRef !== activeLabel) {
            profileClass = 'status-badge profile mismatch';
            mismatchTitle = "Mismatch detected!";
        }
    }

    const badgeChevron = `<svg class="badge-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
    const closeChevron = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>`;

    stickyPanel.innerHTML = `
        <div class="library-status-bar">
            <div class="status-bar-group">
                <div id="drop-zone-import" class="status-badge import-action" title="Drag & Drop or Click to Import">
                    <span>IMPORT</span>
                    <input type="file" id="file-unified" multiple accept=".json" style="display: none;">
                </div>
                <div class="${shotClass}" onclick="window.toggleStickyPanel()">
                    <div class="badge-left">${badgeChevron}</div>
                    <span class="status-value">${cleanName(appState.currentShotName)}</span>
                    <div class="badge-right">${appState.currentShotData ? `<span class="unload-btn" onclick="window.unloadShot(event)">×</span>` : ''}</div>
                </div>
            </div>
            <div class="status-bar-group">
                <div class="${profileClass}" onclick="window.toggleStickyPanel()" title="${mismatchTitle}">
                    <div class="badge-left">${badgeChevron}</div>
                    <span class="status-value">${profileClass.includes('mismatch') ? '⚠ ' : ''}${cleanName(appState.currentProfileName)}</span>
                    <div class="badge-right">${appState.currentProfileData ? `<span class="unload-btn" onclick="window.unloadProfile(event)">×</span>` : ''}</div>
                </div>
                <div class="status-badge stats-action" onclick="window.showStatsFeatureInfo()"><span>STATS</span></div>
            </div>
        </div>
        <div class="library-grid">${createSection('Shots', shots, DB_KEYS.SHOTS)}${createSection('Profiles', profiles, DB_KEYS.PROFILES)}</div>
    `;
    
    if (!appState.isLibraryCollapsed) {
        stickyPanel.innerHTML += `
        <div class="library-footer" onclick="window.toggleStickyPanel()">
            <div class="btn-close-panel" title="Close Library">
                ${closeChevron}
            </div>
        </div>`;
    }

    // Trigger Import setup (now must be called from main because render destroys DOM listeners)
    // We will handle this by checking if elements exist in main loop, or dispatching an event.
    // Simpler: Just rely on the main app to re-attach if needed, or inline the setup here:
    setupSmartImportUI();

    // 2. RESTORE FOCUS
    if (activeId) {
        const el = document.getElementById(activeId);
        if (el) {
            el.focus();
            if (cursorPosition !== null) el.setSelectionRange(cursorPosition, cursorPosition);
        }
    }
}

function setupSmartImportUI() {
    const zone = document.getElementById('drop-zone-import');
    const input = document.getElementById('file-unified');
    if (!zone || !input) return;

    // Use window handler defined in app.js
    zone.onclick = () => input.click();
    input.onchange = (e) => { 
        if (e.target.files.length > 0) window.handleSmartImport(e.target.files);
        input.value = ''; 
    };
    
    // Drag & Drop
    zone.ondragover = (e) => { e.preventDefault(); zone.classList.add('hover'); };
    zone.ondragleave = () => zone.classList.remove('hover');
    zone.ondrop = (e) => { 
        e.preventDefault(); zone.classList.remove('hover'); 
        if (e.dataTransfer.files.length > 0) window.handleSmartImport(e.dataTransfer.files);
    };
}