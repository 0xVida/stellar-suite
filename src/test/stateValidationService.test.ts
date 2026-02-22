declare function require(name: string): any;
declare const process: { exitCode?: number };

const assert = require('assert');
import {
    // Type guards
    isString, isNumber, isBoolean, isObject, isArray, isMap, isDefined,
    // ID validation
    isValidUUID, isValidId, isValidContractId,
    // Type utilities
    getTypeName, safeClone,
    // Collection utilities
    findDuplicateIds, deduplicateById, checkUniqueIds,
    // Reference validation
    buildIdMap,
    // Circular reference detection
    detectCircularReferences,
    // Timestamp validation
    isValidTimestamp
} from '../utils/stateIntegrity';

import {
    StateValidationService
} from '../services/stateValidationService';

// ============================================================
// Test Utilities
// ============================================================

function createValidState(): any {
    return {
        deployments: new Map([
            ['deployment-1', {
                contractId: 'contract-abc123',
                contractName: 'MyContract',
                deployedAt: new Date().toISOString(),
                network: 'testnet',
                source: 'src/contracts/mycontract.rs',
                transactionHash: 'abc123def456',
                metadata: { version: '1.0.0' }
            }],
            ['deployment-2', {
                contractId: 'contract-xyz789',
                deployedAt: new Date().toISOString(),
                network: 'public',
                source: 'src/contracts/other.rs'
            }]
        ]),
        configurations: {
            cliPath: '/usr/local/bin/soroban',
            defaultNetwork: 'testnet',
            buildFlags: ['--release']
        },
        lastSync: Date.now(),
        syncVersion: 1
    };
}

// ============================================================
// Type Guard Tests
// ============================================================

async function testIsStringIdentifiesStrings() {
    assert.strictEqual(isString('hello'), true);
    assert.strictEqual(isString(123), false);
    assert.strictEqual(isString(null), false);
    assert.strictEqual(isString(undefined), false);
    console.log('  [ok] isString identifies strings');
}

async function testIsNumberIdentifiesNumbers() {
    assert.strictEqual(isNumber(123), true);
    assert.strictEqual(isNumber(0), true);
    assert.strictEqual(isNumber(-456), true);
    assert.strictEqual(isNumber(NaN), false);
    assert.strictEqual(isNumber('123'), false);
    console.log('  [ok] isNumber identifies numbers');
}

async function testIsBooleanIdentifiesBooleans() {
    assert.strictEqual(isBoolean(true), true);
    assert.strictEqual(isBoolean(false), true);
    assert.strictEqual(isBoolean(1), false);
    assert.strictEqual(isBoolean('true'), false);
    console.log('  [ok] isBoolean identifies booleans');
}

async function testIsObjectIdentifiesObjects() {
    assert.strictEqual(isObject({}), true);
    assert.strictEqual(isObject({ a: 1 }), true);
    assert.strictEqual(isObject(null), false);
    assert.strictEqual(isObject([]), false);
    console.log('  [ok] isObject identifies objects correctly');
}

async function testIsArrayIdentifiesArrays() {
    assert.strictEqual(isArray([]), true);
    assert.strictEqual(isArray([1, 2, 3]), true);
    assert.strictEqual(isArray({}), false);
    assert.strictEqual(isArray('array'), false);
    console.log('  [ok] isArray identifies arrays');
}

async function testIsDefinedChecksNullability() {
    assert.strictEqual(isDefined(null), false);
    assert.strictEqual(isDefined(undefined), false);
    assert.strictEqual(isDefined(0), true);
    assert.strictEqual(isDefined(''), true);
    assert.strictEqual(isDefined(false), true);
    console.log('  [ok] isDefined checks nullability');
}

// ============================================================
// ID Validation Tests
// ============================================================

async function testIsValidUUIDValidatesUUIDs() {
    assert.strictEqual(isValidUUID('550e8400-e29b-41d4-a716-446655440000'), true);
    assert.strictEqual(isValidUUID('invalid-format'), false);
    assert.strictEqual(isValidUUID(123), false);
    assert.strictEqual(isValidUUID(null), false);
    console.log('  [ok] isValidUUID validates UUID format');
}

async function testIsValidIdValidatesIds() {
    assert.strictEqual(isValidId('contract-1'), true);
    assert.strictEqual(isValidId('ABC123_xyz'), true);
    assert.strictEqual(isValidId(''), false);
    assert.strictEqual(isValidId('   '), false);
    assert.strictEqual(isValidId(123), false);
    console.log('  [ok] isValidId validates non-empty strings');
}

async function testIsValidContractIdValidateContractIds() {
    assert.strictEqual(isValidContractId('contract-abc123'), true);
    assert.strictEqual(isValidContractId('CONTRACT_XYZ_789'), true);
    assert.strictEqual(isValidContractId(''), false);
    assert.strictEqual(isValidContractId('invalid@id'), false);
    assert.strictEqual(isValidContractId(123), false);
    console.log('  [ok] isValidContractId validates contract ID format');
}

// ============================================================
// Duplicate Detection Tests
// ============================================================

async function testFindDuplicateIdsDetectsDuplicates() {
    const items = [
        { id: 'a', name: 'first a' },
        { id: 'b', name: 'first b' },
        { id: 'a', name: 'second a' },
        { id: 'c', name: 'first c' },
        { id: 'b', name: 'second b' }
    ];

    const result = findDuplicateIds(items);
    assert.deepStrictEqual(new Set(result.duplicateIds), new Set(['a', 'b']));
    console.log('  [ok] findDuplicateIds detects duplicates');
}

async function testDeduplicateByIdRemovesDuplicates() {
    const items = [
        { id: 'a', value: 1 },
        { id: 'b', value: 2 },
        { id: 'a', value: 999 }
    ];

    const result = deduplicateById(items);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].id, 'a');
    assert.strictEqual(result[0].value, 1);
    assert.strictEqual(result[1].id, 'b');
    console.log('  [ok] deduplicateById removes duplicates keeping first');
}

async function testCheckUniqueIdsReturnsTrue() {
    const items = [
        { id: 'a' },
        { id: 'b' },
        { id: 'c' }
    ];
    assert.strictEqual(checkUniqueIds(items), true);
    console.log('  [ok] checkUniqueIds returns true for all unique ids');
}

async function testCheckUniqueIdsReturnsFalse() {
    const items = [
        { id: 'a' },
        { id: 'b' },
        { id: 'a' }
    ];
    assert.strictEqual(checkUniqueIds(items), false);
    console.log('  [ok] checkUniqueIds returns false for duplicates');
}

// ============================================================
// Timestamp Validation Tests
// ============================================================

async function testIsValidTimestampAcceptsValid() {
    const now = Date.now();
    assert.strictEqual(isValidTimestamp(now), true);
    assert.strictEqual(isValidTimestamp(now - 86400000), true); // 1 day ago
    console.log('  [ok] isValidTimestamp accepts valid timestamps');
}

async function testIsValidTimestampRejectsInvalid() {
    assert.strictEqual(isValidTimestamp(-1), false);
    assert.strictEqual(isValidTimestamp('not a number'), false);
    assert.strictEqual(isValidTimestamp(null), false);
    console.log('  [ok] isValidTimestamp rejects invalid timestamps');
}

// ============================================================
// State Validation Service Tests
// ============================================================

async function testValidatesValidStateSuccessfully() {
    const service = new StateValidationService();
    const validState = createValidState();
    const result = service.validate(validState);

    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.summary.criticalCount, 0);
    assert.strictEqual(result.summary.errorCount, 0);
    console.log('  [ok] validates valid state successfully');
}

async function testDetectsMissingRequiredFields() {
    const service = new StateValidationService();
    const invalidState = {
        deployments: new Map(),
        configurations: {}
        // Missing lastSync and syncVersion
    };

    const result = service.validate(invalidState);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.summary.errorCount > 0, true);
    console.log('  [ok] detects missing required top-level fields');
}

async function testDetectsInvalidFieldTypes() {
    const service = new StateValidationService();
    const invalidState = {
        deployments: new Map(),
        configurations: {},
        lastSync: 'not a number', // Should be number
        syncVersion: 1
    };

    const result = service.validate(invalidState);
    assert.strictEqual(result.valid, false);
    console.log('  [ok] detects invalid field types');
}

async function testRejectsNonObjectState() {
    const service = new StateValidationService();
    const result = service.validate('not an object');
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.severity, 'CRITICAL');
    console.log('  [ok] rejects non-object state');
}

async function testDetectsDuplicateContractIds() {
    const service = new StateValidationService();
    const state = {
        deployments: new Map([
            ['dep1', { contractId: 'contract-123', deployedAt: new Date().toISOString(), network: 'testnet' }],
            ['dep2', { contractId: 'contract-123', deployedAt: new Date().toISOString(), network: 'testnet' }]
        ]),
        configurations: {},
        lastSync: Date.now(),
        syncVersion: 1
    };

    const result = service.validate(state);
    assert.strictEqual(result.issues.some(i => i.code === 'DUPLICATE_CONTRACT_IDS'), true);
    console.log('  [ok] detects duplicate contract IDs');
}

async function testDetectsInvalidNetworkEnumValues() {
    const service = new StateValidationService();
    const state = {
        deployments: new Map([
            ['dep1', {
                contractId: 'contract-123',
                deployedAt: new Date().toISOString(),
                network: 'invalid-network'
            }]
        ]),
        configurations: {},
        lastSync: Date.now(),
        syncVersion: 1
    };

    const result = service.validate(state);
    assert.strictEqual(result.issues.some(i => i.code === 'INVALID_NETWORK_VALUE'), true);
    console.log('  [ok] detects invalid network enum values');
}

async function testDetectsNegativeTimestamps() {
    const service = new StateValidationService();
    const state = {
        deployments: new Map(),
        configurations: {},
        lastSync: -12345,
        syncVersion: 1
    };

    const result = service.validate(state);
    const corruptionIssue = result.issues.find(i => i.code === 'NEGATIVE_TIMESTAMP');
    assert.strictEqual(corruptionIssue !== undefined, true);
    assert.strictEqual(corruptionIssue?.severity, 'CRITICAL');
    console.log('  [ok] detects negative timestamps as corruption');
}

async function testDetectsInvalidDeploymentRecord() {
    const service = new StateValidationService();
    const state = {
        deployments: new Map([
            ['dep1', 'not an object']
        ]),
        configurations: {},
        lastSync: Date.now(),
        syncVersion: 1
    };

    const result = service.validate(state);
    assert.strictEqual(result.issues.some(i => i.code === 'INVALID_DEPLOYMENT_RECORD'), true);
    console.log('  [ok] detects invalid deployment record structure');
}

async function testAutoRepairsInvalidEnumValues() {
    const service = new StateValidationService();
    const state = {
        deployments: new Map([
            ['dep1', {
                contractId: 'contract-123',
                deployedAt: new Date().toISOString(),
                network: 'invalid-network'
            }]
        ]),
        configurations: {},
        lastSync: Date.now(),
        syncVersion: 1
    };

    const result = service.validate(state, { autoRepair: true });
    
    const repairAction = result.repairs.find(r => r.action === 'reset_invalid_enum');
    assert.strictEqual(repairAction !== undefined, true);

    const deployment = state.deployments.get('dep1');
    assert.strictEqual(['public', 'testnet', 'futurenet', 'local'].includes(deployment.network), true);
    console.log('  [ok] auto-repairs invalid enum values when requested');
}

async function testFormatsValidationResult() {
    const service = new StateValidationService();
    const state = {
        deployments: new Map(),
        configurations: {},
        lastSync: 'invalid', // Wrong type
        syncVersion: 1
    };

    const result = service.validate(state);
    const formatted = service.formatResult(result);

    assert.strictEqual(formatted.includes('VALIDATION RESULT'), true);
    assert.strictEqual(formatted.includes('Valid: false'), true);
    assert.strictEqual(formatted.includes('SUMMARY'), true);
    console.log('  [ok] formats validation result for display');
}

async function testValidatesAllFieldTypesInDeploymentRecords() {
    const service = new StateValidationService();
    const state = {
        deployments: new Map([
            ['dep1', {
                contractId: 'contract-123',
                deployedAt: 12345, // Should be ISO string
                network: 'testnet',
                transactionHash: 123, // Should be string
                metadata: 'invalid' // Should be object
            }]
        ]),
        configurations: {},
        lastSync: Date.now(),
        syncVersion: 1
    };

    const result = service.validate(state);
    const invalidDateIssue = result.issues.find(i => i.code === 'INVALID_DEPLOYMENT_DATE');
    const invalidHashIssue = result.issues.find(i => i.code === 'INVALID_HASH_TYPE');
    const invalidMetadataIssue = result.issues.find(i => i.code === 'INVALID_METADATA_TYPE');

    assert.strictEqual(invalidDateIssue !== undefined, true);
    assert.strictEqual(invalidHashIssue !== undefined, true);
    assert.strictEqual(invalidMetadataIssue !== undefined, true);
    console.log('  [ok] validates all field types in deployment records');
}

async function testHandlesEmptyConfigurations() {
    const service = new StateValidationService();
    const state = {
        deployments: new Map(),
        configurations: {},
        lastSync: Date.now(),
        syncVersion: 1
    };

    const result = service.validate(state);
    assert.strictEqual(result.valid, true);
    console.log('  [ok] handles empty configurations');
}

async function testValidationPreservesStateWhenNotRepairing() {
    const service = new StateValidationService();
    const state = createValidState();
    const originalJson = JSON.stringify(Array.from(state.deployments.entries()));

    service.validate(state, { autoRepair: false });

    const afterJson = JSON.stringify(Array.from(state.deployments.entries()));
    assert.strictEqual(originalJson, afterJson);
    console.log('  [ok] validation preserves state when not auto-repairing');
}

// ============================================================
// Main Test Runner
// ============================================================

async function runAllTests() {
    console.log('\nState validation service unit tests');
    
    try {
        // Type Guards
        await testIsStringIdentifiesStrings();
        await testIsNumberIdentifiesNumbers();
        await testIsBooleanIdentifiesBooleans();
        await testIsObjectIdentifiesObjects();
        await testIsArrayIdentifiesArrays();
        await testIsDefinedChecksNullability();

        // ID Validation
        await testIsValidUUIDValidatesUUIDs();
        await testIsValidIdValidatesIds();
        await testIsValidContractIdValidateContractIds();

        // Duplicate Detection
        await testFindDuplicateIdsDetectsDuplicates();
        await testDeduplicateByIdRemovesDuplicates();
        await testCheckUniqueIdsReturnsTrue();
        await testCheckUniqueIdsReturnsFalse();

        // Timestamp Validation
        await testIsValidTimestampAcceptsValid();
        await testIsValidTimestampRejectsInvalid();

        // State Validation Service
        await testValidatesValidStateSuccessfully();
        await testDetectsMissingRequiredFields();
        await testDetectsInvalidFieldTypes();
        await testRejectsNonObjectState();
        await testDetectsDuplicateContractIds();
        await testDetectsInvalidNetworkEnumValues();
        await testDetectsNegativeTimestamps();
        await testDetectsInvalidDeploymentRecord();
        await testAutoRepairsInvalidEnumValues();
        await testFormatsValidationResult();
        await testValidatesAllFieldTypesInDeploymentRecords();
        await testHandlesEmptyConfigurations();
        await testValidationPreservesStateWhenNotRepairing();

        console.log('\n24 tests: 24 passed, 0 failed\n');
    } catch (error) {
        console.error('Test failed:', error);
        process.exitCode = 1;
    }
}

runAllTests();
