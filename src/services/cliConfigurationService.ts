export interface RpcEndpoint {
    url: string;
    priority: number;
    enabled: boolean;
    name?: string;
}

export interface CliConfiguration {
    cliPath: string;
    source: string;
    network: string;
    rpcUrl: string;
    rpcEndpoints: RpcEndpoint[];
    automaticFailover: boolean;
    useLocalCli: boolean;
}

export interface CliConfigurationProfile {
    id: string;
    name: string;
    description?: string;
    configuration: Partial<CliConfiguration>;
    createdAt: string;
    updatedAt: string;
}

export interface CliConfigurationValidation {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

export interface ResolvedCliConfiguration {
    configuration: CliConfiguration;
    profile?: CliConfigurationProfile;
    validation: CliConfigurationValidation;
}

export interface CliConfigurationStore {
    get<T>(key: string, defaultValue: T): T;
    update<T>(key: string, value: T): PromiseLike<void>;
}

interface CliConfigurationStoreState {
    version: number;
    activeProfileId?: string;
    profiles: CliConfigurationProfile[];
}

export interface CliConfigurationImportResult {
    imported: number;
    replaced: number;
    skipped: number;
    activeProfileId?: string;
}

const CONFIG_STORE_KEY = 'stellarSuite.cliConfigurationStore';
const CONFIG_STORE_VERSION = 1;
const ALLOWED_NETWORKS = new Set(['testnet', 'mainnet', 'futurenet', 'localnet']);

export const DEFAULT_CLI_CONFIGURATION: CliConfiguration = {
    cliPath: 'stellar',
    source: 'dev',
    network: 'testnet',
    rpcUrl: 'https://soroban-testnet.stellar.org:443',
    rpcEndpoints: [
        { url: 'https://soroban-testnet.stellar.org:443', priority: 0, enabled: true, name: 'Default Testnet' }
    ],
    automaticFailover: true,
    useLocalCli: true,
};

export function normalizeCliConfiguration(config: Partial<CliConfiguration>): CliConfiguration {
    return {
        cliPath: (config.cliPath || DEFAULT_CLI_CONFIGURATION.cliPath).trim(),
        source: (config.source || DEFAULT_CLI_CONFIGURATION.source).trim(),
        network: (config.network || DEFAULT_CLI_CONFIGURATION.network).trim(),
        rpcUrl: (config.rpcUrl || DEFAULT_CLI_CONFIGURATION.rpcUrl).trim(),
        rpcEndpoints: Array.isArray(config.rpcEndpoints)
            ? config.rpcEndpoints.map(ep => ({
                url: ep.url.trim(),
                priority: typeof ep.priority === 'number' ? ep.priority : 0,
                enabled: typeof ep.enabled === 'boolean' ? ep.enabled : true,
                name: ep.name?.trim()
            }))
            : [...DEFAULT_CLI_CONFIGURATION.rpcEndpoints],
        automaticFailover: typeof config.automaticFailover === 'boolean'
            ? config.automaticFailover
            : DEFAULT_CLI_CONFIGURATION.automaticFailover,
        useLocalCli: typeof config.useLocalCli === 'boolean'
            ? config.useLocalCli
            : DEFAULT_CLI_CONFIGURATION.useLocalCli,
    };
}

export function validateCliConfiguration(config: CliConfiguration): CliConfigurationValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!config.cliPath.trim()) {
        errors.push('CLI path cannot be empty.');
    }
    if (!config.source.trim()) {
        errors.push('Source account cannot be empty.');
    }
    if (!config.network.trim()) {
        errors.push('Network cannot be empty.');
    }
    if (!config.useLocalCli) {
        if (!config.rpcUrl.trim()) {
            errors.push('RPC URL is required when local CLI is disabled.');
        }
    }

    if (config.rpcUrl.trim()) {
        const rpcPattern = /^https?:\/\/\S+$/i;
        if (!rpcPattern.test(config.rpcUrl.trim())) {
            errors.push('RPC URL must be a valid http(s) URL.');
        }
    }

    if (config.rpcEndpoints) {
        config.rpcEndpoints.forEach((ep, index) => {
            if (!ep.url.trim()) {
                errors.push(`RPC Endpoint ${index + 1} URL cannot be empty.`);
            } else {
                const rpcPattern = /^https?:\/\/\S+$/i;
                if (!rpcPattern.test(ep.url.trim())) {
                    errors.push(`RPC Endpoint ${index + 1} URL must be a valid http(s) URL.`);
                }
            }
        });
    }

    if (config.network && !ALLOWED_NETWORKS.has(config.network.toLowerCase())) {
        warnings.push(`Network "${config.network}" is custom. Ensure Stellar CLI supports it.`);
    }

    if (config.cliPath !== 'stellar' && !config.cliPath.includes('/')) {
        warnings.push(`CLI path "${config.cliPath}" may not resolve without a full path.`);
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}

function slugify(value: string): string {
    const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
    return slug || 'profile';
}

function safeParseJson<T>(content: string): T | undefined {
    try {
        return JSON.parse(content) as T;
    } catch {
        return undefined;
    }
}

export class CliConfigurationService {
    constructor(
        private readonly store: CliConfigurationStore,
        private readonly baseConfigurationProvider: () => CliConfiguration,
    ) {}

    public async getProfiles(): Promise<CliConfigurationProfile[]> {
        const state = this.getState();
        return [...state.profiles];
    }

    public async getActiveProfileId(): Promise<string | undefined> {
        return this.getState().activeProfileId;
    }

    public async getActiveProfile(): Promise<CliConfigurationProfile | undefined> {
        const state = this.getState();
        if (!state.activeProfileId) {
            return undefined;
        }
        return state.profiles.find(profile => profile.id === state.activeProfileId);
    }

    public async getResolvedConfiguration(): Promise<ResolvedCliConfiguration> {
        const base = normalizeCliConfiguration(this.baseConfigurationProvider());
        const activeProfile = await this.getActiveProfile();
        const resolved = normalizeCliConfiguration({
            ...base,
            ...(activeProfile?.configuration || {}),
        });

        return {
            configuration: resolved,
            profile: activeProfile,
            validation: validateCliConfiguration(resolved),
        };
    }

    public async setActiveProfile(profileId: string | undefined): Promise<void> {
        const state = this.getState();

        if (profileId) {
            const exists = state.profiles.some(profile => profile.id === profileId);
            if (!exists) {
                throw new Error(`Profile "${profileId}" does not exist.`);
            }
        }

        state.activeProfileId = profileId;
        await this.saveState(state);
    }

    public async createProfile(
        name: string,
        configuration: Partial<CliConfiguration>,
        description?: string,
    ): Promise<CliConfigurationProfile> {
        const trimmedName = name.trim();
        if (!trimmedName) {
            throw new Error('Profile name is required.');
        }

        const state = this.getState();
        if (state.profiles.some(profile => profile.name.toLowerCase() === trimmedName.toLowerCase())) {
            throw new Error(`A profile named "${trimmedName}" already exists.`);
        }

        const now = new Date().toISOString();
        const merged = normalizeCliConfiguration({
            ...normalizeCliConfiguration(this.baseConfigurationProvider()),
            ...configuration,
        });
        const validation = validateCliConfiguration(merged);
        if (!validation.valid) {
            throw new Error(`Invalid profile configuration: ${validation.errors.join(' ')}`);
        }

        const profile: CliConfigurationProfile = {
            id: `${slugify(trimmedName)}-${Date.now()}`,
            name: trimmedName,
            description: description?.trim() || undefined,
            configuration,
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
            configuration?: Partial<CliConfiguration>;
        },
    ): Promise<CliConfigurationProfile> {
        const state = this.getState();
        const index = state.profiles.findIndex(profile => profile.id === profileId);
        if (index === -1) {
            throw new Error(`Profile "${profileId}" not found.`);
        }

        const existing = state.profiles[index];
        const nextName = (updates.name ?? existing.name).trim();
        if (!nextName) {
            throw new Error('Profile name cannot be empty.');
        }

        const duplicate = state.profiles.find(
            profile => profile.id !== profileId && profile.name.toLowerCase() === nextName.toLowerCase()
        );
        if (duplicate) {
            throw new Error(`A profile named "${nextName}" already exists.`);
        }

        const nextConfig = updates.configuration ?? existing.configuration;
        const merged = normalizeCliConfiguration({
            ...normalizeCliConfiguration(this.baseConfigurationProvider()),
            ...nextConfig,
        });
        const validation = validateCliConfiguration(merged);
        if (!validation.valid) {
            throw new Error(`Invalid profile configuration: ${validation.errors.join(' ')}`);
        }

        const updated: CliConfigurationProfile = {
            ...existing,
            name: nextName,
            description: updates.description !== undefined
                ? updates.description.trim() || undefined
                : existing.description,
            configuration: nextConfig,
            updatedAt: new Date().toISOString(),
        };

        state.profiles[index] = updated;
        await this.saveState(state);
        return updated;
    }

    public async deleteProfile(profileId: string): Promise<void> {
        const state = this.getState();
        const profileExists = state.profiles.some(profile => profile.id === profileId);
        if (!profileExists) {
            throw new Error(`Profile "${profileId}" not found.`);
        }

        state.profiles = state.profiles.filter(profile => profile.id !== profileId);
        if (state.activeProfileId === profileId) {
            state.activeProfileId = undefined;
        }
        await this.saveState(state);
    }

    public async exportProfiles(): Promise<string> {
        const state = this.getState();
        return JSON.stringify({
            version: CONFIG_STORE_VERSION,
            exportedAt: new Date().toISOString(),
            activeProfileId: state.activeProfileId,
            profiles: state.profiles,
        }, null, 2);
    }

    public async importProfiles(
        serialized: string,
        options?: { replaceExisting?: boolean; activateImportedProfile?: boolean },
    ): Promise<CliConfigurationImportResult> {
        const parsed = safeParseJson<{
            profiles?: unknown;
            activeProfileId?: unknown;
        }>(serialized);

        if (!parsed || !Array.isArray(parsed.profiles)) {
            throw new Error('Invalid configuration file format. Expected a JSON object with "profiles" array.');
        }

        const replaceExisting = options?.replaceExisting ?? false;
        const incomingProfiles: CliConfigurationProfile[] = [];

        for (const rawProfile of parsed.profiles) {
            if (!rawProfile || typeof rawProfile !== 'object') {
                continue;
            }
            const profile = rawProfile as Partial<CliConfigurationProfile>;
            if (!profile.id || !profile.name || !profile.configuration) {
                continue;
            }

            const normalized = normalizeCliConfiguration({
                ...normalizeCliConfiguration(this.baseConfigurationProvider()),
                ...profile.configuration,
            });
            const validation = validateCliConfiguration(normalized);
            if (!validation.valid) {
                continue;
            }

            incomingProfiles.push({
                id: String(profile.id),
                name: String(profile.name),
                description: profile.description ? String(profile.description) : undefined,
                configuration: profile.configuration,
                createdAt: profile.createdAt ? String(profile.createdAt) : new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
        }

        const state = this.getState();
        let imported = 0;
        let replaced = 0;
        let skipped = 0;

        for (const incoming of incomingProfiles) {
            const existingIndex = state.profiles.findIndex(profile => profile.id === incoming.id);
            if (existingIndex >= 0) {
                if (replaceExisting) {
                    state.profiles[existingIndex] = incoming;
                    replaced += 1;
                } else {
                    skipped += 1;
                }
                continue;
            }
            state.profiles.push(incoming);
            imported += 1;
        }

        if (options?.activateImportedProfile && typeof parsed.activeProfileId === 'string') {
            const activeExists = state.profiles.some(profile => profile.id === parsed.activeProfileId);
            if (activeExists) {
                state.activeProfileId = parsed.activeProfileId;
            }
        }

        await this.saveState(state);
        return {
            imported,
            replaced,
            skipped,
            activeProfileId: state.activeProfileId,
        };
    }

    private getState(): CliConfigurationStoreState {
        const fallback: CliConfigurationStoreState = {
            version: CONFIG_STORE_VERSION,
            profiles: [],
        };
        const state = this.store.get<CliConfigurationStoreState>(CONFIG_STORE_KEY, fallback);

        if (!state || typeof state !== 'object' || !Array.isArray(state.profiles)) {
            return fallback;
        }

        return {
            version: CONFIG_STORE_VERSION,
            profiles: state.profiles,
            activeProfileId: state.activeProfileId,
        };
    }

    private async saveState(state: CliConfigurationStoreState): Promise<void> {
        await this.store.update(CONFIG_STORE_KEY, {
            version: CONFIG_STORE_VERSION,
            profiles: state.profiles,
            activeProfileId: state.activeProfileId,
        });
    }
}
