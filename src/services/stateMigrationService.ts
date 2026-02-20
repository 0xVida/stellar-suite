import * as vscode from 'vscode';

export interface Migration {
    /** The version number this migration upgrades to */
    version: number;
    /** Descriptive name of the migration */
    name: string;
    /** Apply the migration to the state */
    up(state: vscode.Memento): Promise<void> | void;
    /** Revert the migration from the state in case of failure */
    down(state: vscode.Memento): Promise<void> | void;
    /** Optional function to validate the state after the migration runs */
    validate?(state: vscode.Memento): Promise<boolean> | boolean;
}

export class StateMigrationService {
    private readonly state: vscode.Memento;
    private readonly outputChannel: vscode.OutputChannel;
    private readonly stateVersionKey: string;
    private migrations: Migration[] = [];

    constructor(
        state: vscode.Memento,
        outputChannel: vscode.OutputChannel,
        stateVersionKey: string = 'stellarSuite.stateVersion'
    ) {
        this.state = state;
        this.outputChannel = outputChannel;
        this.stateVersionKey = stateVersionKey;
    }

    public registerMigration(migration: Migration): void {
        this.migrations.push(migration);
        this.sortMigrations();
    }

    public registerMigrations(migrations: Migration[]): void {
        this.migrations.push(...migrations);
        this.sortMigrations();
    }

    public getCurrentVersion(): number {
        return this.state.get<number>(this.stateVersionKey, 0);
    }

    public async runMigrations(): Promise<boolean> {
        const currentVersion = this.getCurrentVersion();
        const pendingMigrations = this.migrations.filter(m => m.version > currentVersion);

        if (pendingMigrations.length === 0) {
            this.outputChannel.appendLine('[StateMigration] State schema is up to date.');
            return true;
        }

        this.outputChannel.appendLine(`[StateMigration] Starting state migrations. Current version: ${currentVersion}`);

        for (const migration of pendingMigrations) {
            this.outputChannel.appendLine(`[StateMigration] Running migration to v${migration.version}: ${migration.name}`);

            try {
                // Execute migration
                await migration.up(this.state);

                // Validate if method provided
                if (migration.validate) {
                    const isValid = await migration.validate(this.state);
                    if (!isValid) {
                        throw new Error(`Validation failed after applying v${migration.version}`);
                    }
                }

                // Update version
                await this.state.update(this.stateVersionKey, migration.version);
                this.outputChannel.appendLine(`[StateMigration] Migration to v${migration.version} completed successfully.`);

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                this.outputChannel.appendLine(`[StateMigration] ERROR: Migration to v${migration.version} failed: ${errorMessage}`);
                this.outputChannel.appendLine(`[StateMigration] Initiating rollback for v${migration.version}...`);

                try {
                    await migration.down(this.state);
                    this.outputChannel.appendLine(`[StateMigration] Rollback for v${migration.version} completed successfully.`);
                } catch (rollbackError) {
                    const rollbackMsg = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
                    this.outputChannel.appendLine(`[StateMigration] CRITICAL ERROR: Rollback for v${migration.version} also failed: ${rollbackMsg}`);
                }

                // Stop applying further migrations on failure
                return false;
            }
        }

        this.outputChannel.appendLine('[StateMigration] All migrations applied successfully.');
        return true;
    }

    public async resetVersion(toVersion: number = 0): Promise<void> {
        await this.state.update(this.stateVersionKey, toVersion);
        this.outputChannel.appendLine(`[StateMigration] Reset state version to ${toVersion}`);
    }

    private sortMigrations(): void {
        this.migrations.sort((a, b) => a.version - b.version);
    }
}
