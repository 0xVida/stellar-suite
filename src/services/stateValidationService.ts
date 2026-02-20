/**
 * State Validation Service
 * 
 * Comprehensive runtime validation of workspace state structure, types, relationships,
 * and data consistency. Supports corruption detection and safe auto-repair.
 * 
 * This is the core validation engine for workspace integrity.
 */

let vscode: any = null;
try {
    vscode = require('vscode');
} catch (e) {
    // vscode module not available in test environment
}

import {
    isString,
    isNumber,
    isBoolean,
    isObject,
    isArray,
    isMap,
    isValidId,
    isValidContractId,
    isValidTimestamp,
    checkUniqueIds,
    findDuplicateIds,
    deduplicateById,
    validateReferences,
    removeOrphanedReferences,
    buildIdMap,
    detectCircularReferences,
    validateObjectStructure,
    validateArrayItems,
    getTypeName,
    flattenObjectKeys,
    isDefined
} from '../utils/stateIntegrity';

// ============================================================
// Type Definitions
// ============================================================

export type ValidationSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export enum ValidationSeverityEnum {
    INFO = 'INFO',
    WARNING = 'WARNING',
    ERROR = 'ERROR',
    CRITICAL = 'CRITICAL'
}

export interface ValidationIssue {
    path: string;
    message: string;
    severity: ValidationSeverity;
    code: string;
    context?: Record<string, any>;
}

export interface RepairAction {
    path: string;
    action: string;
    details: string;
    applied: boolean;
    error?: string;
}

export interface ValidationResult {
    valid: boolean;
    severity: ValidationSeverity;
    issues: ValidationIssue[];
    repairs: RepairAction[];
    summary: {
        totalIssues: number;
        infoCount: number;
        warningCount: number;
        errorCount: number;
        criticalCount: number;
        repaired: number;
        unrepaired: number;
    };
    timestamp: number;
}

export interface StateValidationOptions {
    autoRepair?: boolean;
    validateOnly?: boolean;
    logVerbose?: boolean;
    checkRelationships?: boolean;
    detectCorruption?: boolean;
}

// ============================================================
// State Validation Service
// ============================================================

export class StateValidationService {
    private outputChannel: any;
    private issues: ValidationIssue[] = [];
    private repairs: RepairAction[] = [];
    private options: StateValidationOptions = {};

    constructor() {
        this.outputChannel = vscode && vscode.window 
            ? vscode.window.createOutputChannel('State Validation')
            : { appendLine: (msg: string) => {}, show: () => {}, dispose: () => {} } as any;
    }

    /**
     * Validate workspace state structure and consistency.
     * Returns detailed validation result with optional auto-repair.
     */
    public validate(
        state: any,
        options: StateValidationOptions = {}
    ): ValidationResult {
        // Reset state
        this.issues = [];
        this.repairs = [];
        this.options = { ...options };

        this.log('Starting workspace state validation...');

        // Run validation suite
        this.validateStructure(state);
        this.validateDataTypes(state);
        this.validateEnums(state);
        
        if (options.checkRelationships !== false) {
            this.validateRelationships(state);
        }
        
        if (options.detectCorruption !== false) {
            this.detectCorruption(state);
        }

        // Apply repairs if requested
        if (options.autoRepair && this.highestSeverity !== 'CRITICAL') {
            this.applyAutoRepairs(state);
        }

        // Build result
        const result = this.buildValidationResult(state);
        this.log(`Validation complete: ${result.summary.totalIssues} issue(s) found`);

        return result;
    }

    /**
     * Validates the top-level structure of workspace state
     */
    private validateStructure(state: any): void {
        this.log('Validating structure...');

        if (!isObject(state)) {
            this.addIssue(
                'root',
                'Workspace state is not an object',
                'CRITICAL',
                'INVALID_STATE_TYPE'
            );
            return;
        }

        // Check required top-level fields
        const requiredFields = [
            'deployments',
            'configurations',
            'lastSync',
            'syncVersion'
        ];

        for (const field of requiredFields) {
            if (!(field in state)) {
                this.addIssue(
                    field,
                    `Missing required top-level field: ${field}`,
                    'ERROR',
                    'MISSING_REQUIRED_FIELD',
                    { field }
                );
            }
        }

        // Validate deployments structure
        if ('deployments' in state) {
            this.validateDeploymentsStructure(state.deployments);
        }

        // Validate configurations structure
        if ('configurations' in state) {
            this.validateConfigurationsStructure(state.configurations);
        }

        // Validate syncVersion
        if ('syncVersion' in state && !isNumber(state.syncVersion)) {
            this.addIssue(
                'syncVersion',
                `syncVersion must be a number, got ${getTypeName(state.syncVersion)}`,
                'ERROR',
                'INVALID_FIELD_TYPE',
                { field: 'syncVersion', expected: 'number', actual: getTypeName(state.syncVersion) }
            );
        }
    }

    /**
     * Validates deployments object structure
     */
    private validateDeploymentsStructure(deployments: any): void {
        if (isMap(deployments)) {
            // Valid: Map<string, DeploymentRecord>
            for (const [key, value] of deployments.entries()) {
                if (!isString(key)) {
                    this.addIssue(
                        `deployments[${key}]`,
                        `Deployment key must be string, got ${getTypeName(key)}`,
                        'ERROR',
                        'INVALID_KEY_TYPE'
                    );
                }
                this.validateDeploymentRecord(value, key);
            }
        } else if (isObject(deployments)) {
            // Valid: Record<string, DeploymentRecord>
            for (const [key, value] of Object.entries(deployments)) {
                this.validateDeploymentRecord(value, key);
            }
        } else {
            this.addIssue(
                'deployments',
                `deployments must be Map or object, got ${getTypeName(deployments)}`,
                'ERROR',
                'INVALID_FIELD_TYPE'
            );
        }
    }

    /**
     * Validates individual deployment record
     */
    private validateDeploymentRecord(record: any, key: string): void {
        if (!isObject(record)) {
            this.addIssue(
                `deployments.${key}`,
                `Deployment record must be object, got ${getTypeName(record)}`,
                'ERROR',
                'INVALID_DEPLOYMENT_RECORD'
            );
            return;
        }

        const requiredFields = ['contractId', 'deployedAt', 'network'];
        for (const field of requiredFields) {
            if (!(field in record)) {
                this.addIssue(
                    `deployments.${key}.${field}`,
                    `Missing required deployment field: ${field}`,
                    'WARNING',
                    'MISSING_DEPLOYMENT_FIELD'
                );
            }
        }

        // Validate types
        if ('contractId' in record && !isValidContractId(record.contractId)) {
            this.addIssue(
                `deployments.${key}.contractId`,
                `Invalid contract ID format: ${record.contractId}`,
                'WARNING',
                'INVALID_CONTRACT_ID'
            );
        }

        if ('deployedAt' in record && !isString(record.deployedAt)) {
            this.addIssue(
                `deployments.${key}.deployedAt`,
                `deployedAt must be ISO string, got ${getTypeName(record.deployedAt)}`,
                'ERROR',
                'INVALID_DEPLOYMENT_DATE'
            );
        }

        if ('network' in record && !isString(record.network)) {
            this.addIssue(
                `deployments.${key}.network`,
                `network must be string, got ${getTypeName(record.network)}`,
                'ERROR',
                'INVALID_NETWORK_TYPE'
            );
        }

        // Validate optional fields
        if ('transactionHash' in record && record.transactionHash !== undefined) {
            if (!isString(record.transactionHash)) {
                this.addIssue(
                    `deployments.${key}.transactionHash`,
                    `transactionHash must be string, got ${getTypeName(record.transactionHash)}`,
                    'WARNING',
                    'INVALID_HASH_TYPE'
                );
            }
        }

        if ('metadata' in record && record.metadata !== undefined) {
            if (!isObject(record.metadata)) {
                this.addIssue(
                    `deployments.${key}.metadata`,
                    `metadata must be object, got ${getTypeName(record.metadata)}`,
                    'WARNING',
                    'INVALID_METADATA_TYPE'
                );
            }
        }
    }

    /**
     * Validates configurations structure
     */
    private validateConfigurationsStructure(configurations: any): void {
        if (!isObject(configurations)) {
            this.addIssue(
                'configurations',
                `configurations must be object, got ${getTypeName(configurations)}`,
                'ERROR',
                'INVALID_CONFIGURATIONS_TYPE'
            );
            return;
        }

        // Configurations are flexible, so just ensure values are valid
        for (const [key, value] of Object.entries(configurations)) {
            if (value === undefined) {
                this.addIssue(
                    `configurations.${key}`,
                    'Configuration value is undefined',
                    'INFO',
                    'UNDEFINED_CONFIG_VALUE'
                );
            }
        }
    }

    /**
     * Validates data types throughout state
     */
    private validateDataTypes(state: any): void {
        this.log('Validating data types...');

        if (!isObject(state)) {
            return;
        }

        // Check lastSync is number
        if ('lastSync' in state && !isNumber(state.lastSync)) {
            this.addIssue(
                'lastSync',
                `lastSync must be number, got ${getTypeName(state.lastSync)}`,
                'ERROR',
                'INVALID_TIMESTAMP_TYPE'
            );
        }

        // Validate lastSync is valid timestamp
        if ('lastSync' in state && isNumber(state.lastSync)) {
            if (!isValidTimestamp(state.lastSync)) {
                this.addIssue(
                    'lastSync',
                    `lastSync contains invalid timestamp: ${state.lastSync}`,
                    'WARNING',
                    'INVALID_TIMESTAMP_VALUE'
                );
            }
        }
    }

    /**
     * Validates enum values
     */
    private validateEnums(state: any): void {
        this.log('Validating enum values...');

        if (!isObject(state)) {
            return;
        }

        // Validate deployment networks (if we know valid networks)
        if (isMap(state.deployments)) {
            for (const [, record] of state.deployments.entries()) {
                if (isObject(record) && 'network' in record) {
                    this.validateNetworkValue(record.network);
                }
            }
        } else if (isObject(state.deployments)) {
            for (const record of Object.values(state.deployments)) {
                if (isObject(record) && 'network' in record) {
                    this.validateNetworkValue(record.network);
                }
            }
        }
    }

    /**
     * Validates network enum value
     */
    private validateNetworkValue(network: any): void {
        const validNetworks = ['public', 'testnet', 'futurenet', 'local'];
        if (!validNetworks.includes(network)) {
            this.addIssue(
                'deployments.*.network',
                `Invalid network value: ${network}. Must be one of: ${validNetworks.join(', ')}`,
                'WARNING',
                'INVALID_NETWORK_VALUE'
            );
        }
    }

    /**
     * Validates state relationships and references
     */
    private validateRelationships(state: any): void {
        this.log('Validating relationships...');

        if (!isObject(state)) {
            return;
        }

        // No explicit relationships defined in current schema,
        // but we check for orphaned references within deployments
        this.validateDeploymentReferences(state);
    }

    /**
     * Validates deployment references are consistent
     */
    private validateDeploymentReferences(state: any): void {
        const deploymentIds = new Set<string>();

        if (isMap(state.deployments)) {
            for (const key of state.deployments.keys()) {
                deploymentIds.add(String(key));
            }
        } else if (isObject(state.deployments)) {
            for (const key of Object.keys(state.deployments)) {
                deploymentIds.add(key);
            }
        }

        // Check for duplicate deployment IDs
        const records: any[] = [];
        if (isMap(state.deployments)) {
            records.push(...state.deployments.values());
        } else if (isObject(state.deployments)) {
            records.push(...Object.values(state.deployments));
        }

        const contractIds = records
            .filter(r => isObject(r) && r.contractId)
            .map(r => r.contractId);

        const { duplicateIds, counts } = findDuplicateIds(
            contractIds.map((id, idx) => ({ id, index: idx }))
        );

        if (duplicateIds.length > 0) {
            this.addIssue(
                'deployments',
                `Found duplicate contract IDs: ${duplicateIds.join(', ')}`,
                'WARNING',
                'DUPLICATE_CONTRACT_IDS',
                { duplicateIds, counts }
            );
        }
    }

    /**
     * Detects data corruption patterns
     */
    private detectCorruption(state: any): void {
        this.log('Detecting corruption...');

        if (!isObject(state)) {
            return;
        }

        // Check for inconsistent timestamps
        this.detectTimestampCorruption(state);

        // Check for impossible state combinations
        this.detectImpossibleStates(state);

        // Check for data truncation patterns
        this.detectTruncation(state);
    }

    /**
     * Detects inconsistent or invalid timestamps
     */
    private detectTimestampCorruption(state: any): void {
        if ('lastSync' in state && isNumber(state.lastSync)) {
            if (state.lastSync < 0) {
                this.addIssue(
                    'lastSync',
                    'Negative timestamp detected (data corruption)',
                    'CRITICAL',
                    'NEGATIVE_TIMESTAMP'
                );
            }

            if (!isValidTimestamp(state.lastSync, true)) {
                this.addIssue(
                    'lastSync',
                    'Timestamp outside reasonable range (potential corruption)',
                    'CRITICAL',
                    'TIMESTAMP_CORRUPTION'
                );
            }
        }

        // Check deployment timestamps
        const records: any[] = [];
        if (isMap(state.deployments)) {
            records.push(...state.deployments.values());
        } else if (isObject(state.deployments)) {
            records.push(...Object.values(state.deployments));
        }

        for (let i = 0; i < records.length; i++) {
            if (isObject(records[i]) && records[i].deployedAt) {
                try {
                    const date = new Date(records[i].deployedAt);
                    if (isNaN(date.getTime())) {
                        this.addIssue(
                            `deployments[${i}].deployedAt`,
                            `Invalid date format: ${records[i].deployedAt}`,
                            'ERROR',
                            'INVALID_DATE_FORMAT'
                        );
                    }
                } catch (e) {
                    this.addIssue(
                        `deployments[${i}].deployedAt`,
                        `Failed to parse date: ${records[i].deployedAt}`,
                        'ERROR',
                        'DATE_PARSE_ERROR'
                    );
                }
            }
        }
    }

    /**
     * Detects impossible state combinations
     */
    private detectImpossibleStates(state: any): void {
        // Example: if syncVersion is > current protocol version
        if ('syncVersion' in state && isNumber(state.syncVersion)) {
            const currentVersion = 1;
            if (state.syncVersion > currentVersion) {
                this.addIssue(
                    'syncVersion',
                    `syncVersion (${state.syncVersion}) exceeds current protocol (${currentVersion})`,
                    'WARNING',
                    'FUTURE_PROTOCOL_VERSION'
                );
            }
        }
    }

    /**
     * Detects data truncation patterns
     */
    private detectTruncation(state: any): void {
        // Check if expected data fields are suspiciously empty
        const records: any[] = [];
        if (isMap(state.deployments)) {
            records.push(...state.deployments.values());
        } else if (isObject(state.deployments)) {
            records.push(...Object.values(state.deployments));
        }

        for (let i = 0; i < records.length; i++) {
            if (isObject(records[i])) {
                // Check for suspiciously empty required fields
                if (records[i].contractId === '') {
                    this.addIssue(
                        `deployments[${i}].contractId`,
                        'Empty contract ID (possible truncation)',
                        'ERROR',
                        'EMPTY_REQUIRED_FIELD'
                    );
                }
            }
        }
    }

    /**
     * Apply safe auto-repairs
     */
    private applyAutoRepairs(state: any): void {
        this.log('Applying auto-repairs...');

        // Repair duplicate deployments (keep first)
        this.repairDuplicateDeployments(state);

        // Repair invalid enum values (reset to default)
        this.repairInvalidEnums(state);

        // Remove orphaned references (not applicable in current schema)
        this.repairOrphanedReferences(state);
    }

    /**
     * Repairs duplicate deployments
     */
    private repairDuplicateDeployments(state: any): void {
        if (!isObject(state)) {
            return;
        }

        if (isMap(state.deployments)) {
            // Maps naturally prevent duplicates by key
            return;
        }

        if (!isObject(state.deployments)) {
            return;
        }

        const records = Object.values(state.deployments) as any[];
        const contractIdMap = new Map<string, string[]>();

        // Map contract IDs to their deployment keys
        for (const [key, record] of Object.entries(state.deployments)) {
            if (isObject(record) && record.contractId) {
                if (!contractIdMap.has(record.contractId)) {
                    contractIdMap.set(record.contractId, []);
                }
                contractIdMap.get(record.contractId)!.push(key);
            }
        }

        // Remove duplicate deployments (keep first)
        for (const [contractId, keys] of contractIdMap.entries()) {
            if (keys.length > 1) {
                const keysToRemove = keys.slice(1);
                for (const key of keysToRemove) {
                    delete (state.deployments as any)[key];
                    this.repairs.push({
                        path: `deployments.${key}`,
                        action: 'remove_duplicate',
                        details: `Removed duplicate deployment for contract ${contractId}`,
                        applied: true
                    });
                }
            }
        }
    }

    /**
     * Repairs invalid enum values
     */
    private repairInvalidEnums(state: any): void {
        const validNetworks = ['public', 'testnet', 'futurenet', 'local'];
        const defaultNetwork = 'testnet';

        if (!isObject(state)) {
            return;
        }

        const records: any[] = [];
        let isMap = false;

        if (state.deployments instanceof Map) {
            records.push(...state.deployments.values());
            isMap = true;
        } else if (isObject(state.deployments)) {
            records.push(...Object.values(state.deployments));
        }

        let idx = 0;
        if (isMap && state.deployments instanceof Map) {
            for (const [, record] of state.deployments.entries()) {
                if (isObject(record) && !validNetworks.includes(record.network)) {
                    const oldValue = record.network;
                    record.network = defaultNetwork;
                    this.repairs.push({
                        path: `deployments[${idx}].network`,
                        action: 'reset_invalid_enum',
                        details: `Reset invalid network '${oldValue}' to '${defaultNetwork}'`,
                        applied: true
                    });
                }
                idx++;
            }
        } else if (isObject(state.deployments)) {
            for (const [key, record] of Object.entries(state.deployments)) {
                if (isObject(record) && !validNetworks.includes(record.network)) {
                    const oldValue = record.network;
                    (record as any).network = defaultNetwork;
                    this.repairs.push({
                        path: `deployments.${key}.network`,
                        action: 'reset_invalid_enum',
                        details: `Reset invalid network '${oldValue}' to '${defaultNetwork}'`,
                        applied: true
                    });
                }
            }
        }
    }

    /**
     * Repairs orphaned references
     */
    private repairOrphanedReferences(state: any): void {
        // Not applicable in current schema, but included for completeness
        this.log('Checking for orphaned references...');
    }

    /**
     * Builds validation result object
     */
    private buildValidationResult(state: any): ValidationResult {
        const severityOrder = { INFO: 0, WARNING: 1, ERROR: 2, CRITICAL: 3 };
        const severities = this.issues.map(i => i.severity);
        const maxSeverity = severities.length > 0
            ? severities.sort((a, b) => severityOrder[b] - severityOrder[a])[0]
            : 'INFO';

        return {
            valid: this.issues.filter(i => i.severity === 'ERROR' || i.severity === 'CRITICAL').length === 0,
            severity: maxSeverity,
            issues: this.issues,
            repairs: this.repairs,
            summary: {
                totalIssues: this.issues.length,
                infoCount: this.issues.filter(i => i.severity === 'INFO').length,
                warningCount: this.issues.filter(i => i.severity === 'WARNING').length,
                errorCount: this.issues.filter(i => i.severity === 'ERROR').length,
                criticalCount: this.issues.filter(i => i.severity === 'CRITICAL').length,
                repaired: this.repairs.filter(r => r.applied).length,
                unrepaired: this.repairs.filter(r => !r.applied).length
            },
            timestamp: Date.now()
        };
    }

    /**
     * Helper: Add validation issue
     */
    private addIssue(
        path: string,
        message: string,
        severity: ValidationSeverity,
        code: string,
        context?: Record<string, any>
    ): void {
        this.issues.push({
            path,
            message,
            severity,
            code,
            context
        });
    }

    /**
     * Helper: Get highest severity level
     */
    private get highestSeverity(): ValidationSeverity {
        const severityOrder = { INFO: 0, WARNING: 1, ERROR: 2, CRITICAL: 3 };
        if (this.issues.length === 0) {
            return 'INFO';
        }
        return this.issues
            .map(i => i.severity)
            .sort((a, b) => severityOrder[b] - severityOrder[a])[0];
    }

    /**
     * Helper: Log message
     */
    private log(message: string): void {
        if (this.options.logVerbose) {
            this.outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
        }
    }

    /**
     * Get output channel for logging
     */
    public getOutputChannel(): any {
        return this.outputChannel;
    }

    /**
     * Format validation result for display
     */
    public formatResult(result: ValidationResult): string {
        const lines: string[] = [
            '=== VALIDATION RESULT ===',
            `Valid: ${result.valid}`,
            `Highest Severity: ${result.severity}`,
            `Timestamp: ${new Date(result.timestamp).toISOString()}`,
            '',
            '=== SUMMARY ===',
            `Total Issues: ${result.summary.totalIssues}`,
            `  - Info: ${result.summary.infoCount}`,
            `  - Warning: ${result.summary.warningCount}`,
            `  - Error: ${result.summary.errorCount}`,
            `  - Critical: ${result.summary.criticalCount}`,
            `Repairs Applied: ${result.summary.repaired}`,
            `Repairs Unapplied: ${result.summary.unrepaired}`,
            ''
        ];

        if (result.issues.length > 0) {
            lines.push('=== ISSUES ===');
            for (const issue of result.issues) {
                lines.push(`[${issue.severity}] ${issue.code} at ${issue.path}`);
                lines.push(`  ${issue.message}`);
            }
            lines.push('');
        }

        if (result.repairs.length > 0) {
            lines.push('=== REPAIRS ===');
            for (const repair of result.repairs) {
                lines.push(`${repair.path}`);
                lines.push(`  Action: ${repair.action}`);
                lines.push(`  Details: ${repair.details}`);
                if (repair.error) {
                    lines.push(`  Error: ${repair.error}`);
                }
            }
        }

        return lines.join('\n');
    }
}

// ============================================================
// Singleton Instance
// ============================================================

let serviceInstance: StateValidationService | null = null;

export function getStateValidationService(): StateValidationService {
    if (!serviceInstance) {
        serviceInstance = new StateValidationService();
    }
    return serviceInstance;
}
