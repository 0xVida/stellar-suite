// ============================================================
// src/services/envVariableService.ts
// Environment variable management service — CRUD for env-var
// profiles, validation, import/export, and env merging for
// CLI execution. Pure service, no VS Code dependency.
// ============================================================

import {
    EnvVariable,
    EnvVariableImportResult,
    EnvVariableProfile,
    EnvVariableStoreState,
    EnvVariableValidation,
    ENV_VAR_NAME_PATTERN,
    SENSITIVE_ENV_VAR_NAMES,
} from '../types/envVariable';

// ── Store interface ──────────────────────────────────────────

export interface EnvVariableStore {
    get<T>(key: string, defaultValue: T): T;
    update<T>(key: string, value: T): PromiseLike<void>;
}

// ── Constants ────────────────────────────────────────────────

const STORE_KEY = 'stellarSuite.envVariableStore';
const STORE_VERSION = 1;

// ── Validation helpers ───────────────────────────────────────

/**
 * Validate a single environment variable entry.
 */
export function validateEnvVariable(v: EnvVariable): EnvVariableValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!v.name || !v.name.trim()) {
        errors.push('Variable name cannot be empty.');
    } else if (!ENV_VAR_NAME_PATTERN.test(v.name)) {
        errors.push(
            `Variable name "${v.name}" is invalid. ` +
            'Names must start with a letter or underscore and contain only letters, digits, or underscores.',
        );
    }

    if (v.value === undefined || v.value === null) {
        errors.push(`Variable "${v.name}" must have a value (empty string is allowed).`);
    }

    // Warn if a known-sensitive variable is not marked as sensitive
    if (v.name && SENSITIVE_ENV_VAR_NAMES.has(v.name.toUpperCase()) && !v.sensitive) {
        warnings.push(
            `Variable "${v.name}" looks like a secret. Consider marking it as sensitive.`,
        );
    }

    return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate an entire profile's variable set.
 */
export function validateEnvVariableProfile(
    variables: EnvVariable[],
): EnvVariableValidation {
    const errors: string[] = [];
    const warnings: string[] = [];
    const seen = new Set<string>();

    for (const v of variables) {
        const result = validateEnvVariable(v);
        errors.push(...result.errors);
        warnings.push(...result.warnings);

        if (v.name && seen.has(v.name)) {
            errors.push(`Duplicate variable name "${v.name}".`);
        }
        seen.add(v.name);
    }

    return { valid: errors.length === 0, errors, warnings };
}

// ── Utility helpers ──────────────────────────────────────────

function slugify(value: string): string {
    const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
    return slug || 'env-profile';
}

function safeParseJson<T>(content: string): T | undefined {
    try {
        return JSON.parse(content) as T;
    } catch {
        return undefined;
    }
}

// ── Service class ────────────────────────────────────────────

export class EnvVariableService {
    constructor(private readonly store: EnvVariableStore) { }

    // ── Read ─────────────────────────────────────────────────

    public async getProfiles(): Promise<EnvVariableProfile[]> {
        return [...this.getState().profiles];
    }

    public async getActiveProfileId(): Promise<string | undefined> {
        return this.getState().activeProfileId;
    }

    public async getActiveProfile(): Promise<EnvVariableProfile | undefined> {
        const state = this.getState();
        if (!state.activeProfileId) {
            return undefined;
        }
        return state.profiles.find(p => p.id === state.activeProfileId);
    }

    /**
     * Return a flat key→value map of the active profile's variables.
     * Returns an empty object when no profile is active.
     */
    public async getResolvedVariables(): Promise<Record<string, string>> {
        const profile = await this.getActiveProfile();
        if (!profile) {
            return {};
        }
        const result: Record<string, string> = {};
        for (const v of profile.variables) {
            result[v.name] = v.value;
        }
        return result;
    }

    /**
     * Merge the active profile's variables with a base environment
     * (defaults to `process.env`). Profile values take precedence.
     */
    public async buildEnvForExecution(
        baseEnv?: NodeJS.ProcessEnv,
    ): Promise<NodeJS.ProcessEnv> {
        const base = baseEnv ? { ...baseEnv } : { ...process.env };
        const vars = await this.getResolvedVariables();
        return { ...base, ...vars };
    }

    // ── Write ────────────────────────────────────────────────

    public async setActiveProfile(profileId: string | undefined): Promise<void> {
        const state = this.getState();
        if (profileId) {
            const exists = state.profiles.some(p => p.id === profileId);
            if (!exists) {
                throw new Error(`Environment variable profile "${profileId}" does not exist.`);
            }
        }
        state.activeProfileId = profileId;
        await this.saveState(state);
    }

    public async createProfile(
        name: string,
        variables: EnvVariable[],
        description?: string,
    ): Promise<EnvVariableProfile> {
        const trimmedName = name.trim();
        if (!trimmedName) {
            throw new Error('Profile name is required.');
        }

        const state = this.getState();
        if (state.profiles.some(p => p.name.toLowerCase() === trimmedName.toLowerCase())) {
            throw new Error(`An environment variable profile named "${trimmedName}" already exists.`);
        }

        const validation = validateEnvVariableProfile(variables);
        if (!validation.valid) {
            throw new Error(`Invalid variables: ${validation.errors.join(' ')}`);
        }

        const now = new Date().toISOString();
        const profile: EnvVariableProfile = {
            id: `${slugify(trimmedName)}-${Date.now()}`,
            name: trimmedName,
            description: description?.trim() || undefined,
            variables: [...variables],
            createdAt: now,
            updatedAt: now,
        };

        state.profiles.push(profile);
        await this.saveState(state);
        return profile;
    }

    public async updateProfile(
        profileId: string,
        updates: {
            name?: string;
            description?: string;
            variables?: EnvVariable[];
        },
    ): Promise<EnvVariableProfile> {
        const state = this.getState();
        const index = state.profiles.findIndex(p => p.id === profileId);
        if (index === -1) {
            throw new Error(`Environment variable profile "${profileId}" not found.`);
        }

        const existing = state.profiles[index];
        const nextName = (updates.name ?? existing.name).trim();
        if (!nextName) {
            throw new Error('Profile name cannot be empty.');
        }

        const duplicate = state.profiles.find(
            p => p.id !== profileId && p.name.toLowerCase() === nextName.toLowerCase(),
        );
        if (duplicate) {
            throw new Error(`An environment variable profile named "${nextName}" already exists.`);
        }

        const nextVars = updates.variables ?? existing.variables;
        const validation = validateEnvVariableProfile(nextVars);
        if (!validation.valid) {
            throw new Error(`Invalid variables: ${validation.errors.join(' ')}`);
        }

        const updated: EnvVariableProfile = {
            ...existing,
            name: nextName,
            description: updates.description !== undefined
                ? updates.description.trim() || undefined
                : existing.description,
            variables: [...nextVars],
            updatedAt: new Date().toISOString(),
        };

        state.profiles[index] = updated;
        await this.saveState(state);
        return updated;
    }

    public async deleteProfile(profileId: string): Promise<void> {
        const state = this.getState();
        const exists = state.profiles.some(p => p.id === profileId);
        if (!exists) {
            throw new Error(`Environment variable profile "${profileId}" not found.`);
        }

        state.profiles = state.profiles.filter(p => p.id !== profileId);
        if (state.activeProfileId === profileId) {
            state.activeProfileId = undefined;
        }
        await this.saveState(state);
    }

    // ── Import / Export ──────────────────────────────────────

    public async exportProfiles(): Promise<string> {
        const state = this.getState();
        return JSON.stringify({
            version: STORE_VERSION,
            exportedAt: new Date().toISOString(),
            activeProfileId: state.activeProfileId,
            profiles: state.profiles,
        }, null, 2);
    }

    public async importProfiles(
        serialized: string,
        options?: { replaceExisting?: boolean; activateImportedProfile?: boolean },
    ): Promise<EnvVariableImportResult> {
        const parsed = safeParseJson<{
            profiles?: unknown;
            activeProfileId?: unknown;
        }>(serialized);

        if (!parsed || !Array.isArray(parsed.profiles)) {
            throw new Error(
                'Invalid environment variable file format. Expected a JSON object with "profiles" array.',
            );
        }

        const replaceExisting = options?.replaceExisting ?? false;
        const incoming: EnvVariableProfile[] = [];

        for (const raw of parsed.profiles) {
            if (!raw || typeof raw !== 'object') {
                continue;
            }
            const p = raw as Partial<EnvVariableProfile>;
            if (!p.id || !p.name || !Array.isArray(p.variables)) {
                continue;
            }

            const validation = validateEnvVariableProfile(p.variables);
            if (!validation.valid) {
                continue;
            }

            incoming.push({
                id: String(p.id),
                name: String(p.name),
                description: p.description ? String(p.description) : undefined,
                variables: p.variables,
                createdAt: p.createdAt ? String(p.createdAt) : new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
        }

        const state = this.getState();
        let imported = 0;
        let replaced = 0;
        let skipped = 0;

        for (const profile of incoming) {
            const existingIndex = state.profiles.findIndex(p => p.id === profile.id);
            if (existingIndex >= 0) {
                if (replaceExisting) {
                    state.profiles[existingIndex] = profile;
                    replaced += 1;
                } else {
                    skipped += 1;
                }
                continue;
            }
            state.profiles.push(profile);
            imported += 1;
        }

        if (options?.activateImportedProfile && typeof parsed.activeProfileId === 'string') {
            const activeExists = state.profiles.some(p => p.id === parsed.activeProfileId);
            if (activeExists) {
                state.activeProfileId = parsed.activeProfileId as string;
            }
        }

        await this.saveState(state);
        return { imported, replaced, skipped, activeProfileId: state.activeProfileId };
    }

    // ── Internal state persistence ───────────────────────────

    private getState(): EnvVariableStoreState {
        const fallback: EnvVariableStoreState = {
            version: STORE_VERSION,
            profiles: [],
        };
        const state = this.store.get<EnvVariableStoreState>(STORE_KEY, fallback);

        if (!state || typeof state !== 'object' || !Array.isArray(state.profiles)) {
            return fallback;
        }

        return {
            version: STORE_VERSION,
            profiles: state.profiles,
            activeProfileId: state.activeProfileId,
        };
    }

    private async saveState(state: EnvVariableStoreState): Promise<void> {
        await this.store.update(STORE_KEY, {
            version: STORE_VERSION,
            profiles: state.profiles,
            activeProfileId: state.activeProfileId,
        });
    }
}
