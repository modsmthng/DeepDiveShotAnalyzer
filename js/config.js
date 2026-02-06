/**
 * Configuration Constants
 */
export const DB_KEYS = {
    SHOTS: 'gaggimate_shots',
    PROFILES: 'gaggimate_profiles',
    PRESETS: 'gaggimate_column_presets',
    USER_STANDARD: 'gaggimate_user_standard_cols'
};

// Helper to remove .json extension
export const cleanName = (name) => name ? name.replace(/\.json$/i, '') : '';