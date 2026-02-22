import { Migration } from '../services/stateMigrationService';

// Example migration that could be used in the future
export const initialMigration: Migration = {
    version: 1,
    name: 'Initial state schema setup',
    up: async (state) => {
        // No-op for existing workspaces, this just establishes baseline
    },
    down: async (state) => {
        // Rollback
    },
    validate: (state) => {
        return true;
    }
};

export const migrations: Migration[] = [
    initialMigration
];
