/**
 * Global Application State management
 */
export const appState = {
    // UI State
    libraryExpanded: { SHOTS: false, PROFILES: false },
    isLibraryCollapsed: true,
    isInfoExpanded: false,
    
    // Data State
    currentShotData: null,
    currentProfileData: null,
    currentShotName: "No Shot Loaded",      
    currentProfileName: "No Profile Loaded", 
    
    // Settings
    isSensorDelayAuto: true,
    activeColumnIds: new Set(),
    areControlsRendered: false,

    // Search & Sort
    librarySearch: { shots: '', profiles: '' }, // lowercase keys for easier access
    currentSort: {
        shots: { key: 'shotDate', order: 'desc' },
        profiles: { key: 'name', order: 'asc' }
    }
};