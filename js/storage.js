/**
 * Storage, Import/Export and Data Logic
 */
import { DB_KEYS, cleanName } from './config.js';
import { appState } from './state.js';

// --- Library Helpers ---

export function getSortedLibrary(collectionKey) {
    // Map internal keys to state keys (shots/profiles)
    const stateKey = collectionKey === DB_KEYS.SHOTS ? 'shots' : 'profiles';
    
    const raw = JSON.parse(localStorage.getItem(collectionKey) || '[]');
    const searchTerm = appState.librarySearch[stateKey];
    const { key, order } = appState.currentSort[stateKey];
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

export function saveToLibrary(collection, fileName, data, refreshCallback) {
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
        if(refreshCallback) refreshCallback();
    } catch (e) { console.error("Storage Error:", e); }
}

export function deleteSingleItem(col, name, refreshCallback) { 
    if (confirm(`Delete "${name}"?`)) { 
        const current = JSON.parse(localStorage.getItem(col) || '[]');
        const filtered = current.filter(i => i.name !== name);
        localStorage.setItem(col, JSON.stringify(filtered)); 
        if(refreshCallback) refreshCallback(); 
    }
}

export function clearFullLibrary(col, refreshCallback) { 
    const count = JSON.parse(localStorage.getItem(col) || '[]').length;
    if (count === 0) return;
    if (confirm(`Are you sure you want to DELETE ALL ${count} items? This cannot be undone.`)) { 
        localStorage.setItem(col, "[]"); 
        if(refreshCallback) refreshCallback(); 
    }
}

export function exportSingleItem(col, name) {
    const item = JSON.parse(localStorage.getItem(col)).find(i => i.name === name);
    if (!item) return;

    const jsonStr = JSON.stringify(item.data, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    let safeName = name;
    if (!safeName.toLowerCase().endsWith('.json')) safeName += '.json';
    
    link.download = safeName; 
    link.click();
    URL.revokeObjectURL(url);
}

export function exportFullLibrary(col) { 
    const items = JSON.parse(localStorage.getItem(col) || '[]');
    if (items.length === 0) return;
    if (confirm(`Export all ${items.length} items?`)) {
        items.forEach((item, i) => {
            setTimeout(() => exportSingleItem(col, item.name), i * 300);
        });
    }
}