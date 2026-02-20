"use strict";
/**
 * State Integrity Check Utilities
 *
 * Provides reusable, pure functions for validating workspace state structure,
 * types, relationships, and data consistency.
 *
 * All functions are stateless and testable.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidUUID = isValidUUID;
exports.isValidId = isValidId;
exports.isValidContractId = isValidContractId;
exports.isString = isString;
exports.isNumber = isNumber;
exports.isBoolean = isBoolean;
exports.isObject = isObject;
exports.isArray = isArray;
exports.isMap = isMap;
exports.isDate = isDate;
exports.isNullOrUndefined = isNullOrUndefined;
exports.isDefined = isDefined;
exports.validateEnumValue = validateEnumValue;
exports.getEnumValues = getEnumValues;
exports.findDuplicateIds = findDuplicateIds;
exports.deduplicateById = deduplicateById;
exports.checkUniqueIds = checkUniqueIds;
exports.validateReferences = validateReferences;
exports.removeOrphanedReferences = removeOrphanedReferences;
exports.buildIdMap = buildIdMap;
exports.detectCircularReferences = detectCircularReferences;
exports.isValidTimestamp = isValidTimestamp;
exports.validateTimestampOrder = validateTimestampOrder;
exports.validateObjectStructure = validateObjectStructure;
exports.validateArrayItems = validateArrayItems;
exports.getTypeName = getTypeName;
exports.safeClone = safeClone;
exports.flattenObjectKeys = flattenObjectKeys;
// ============================================================
// UUID & ID Validation
// ============================================================
/**
 * Validates if a string is a valid UUID (v4).
 * Supports formats: 550e8400-e29b-41d4-a716-446655440000
 */
function isValidUUID(value) {
    if (typeof value !== 'string') {
        return false;
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
}
/**
 * Validates if a value is a valid identifier (non-empty string).
 */
function isValidId(value) {
    return typeof value === 'string' && value.trim().length > 0;
}
/**
 * Validates if a value is a valid contract ID (alphanumeric or special chars).
 */
function isValidContractId(value) {
    if (typeof value !== 'string') {
        return false;
    }
    // Stellar contract IDs are typically alphanumeric, may contain hyphens
    return /^[a-zA-Z0-9\-_]+$/.test(value) && value.length > 0;
}
// ============================================================
// Type Guards
// ============================================================
/**
 * Type guard: value is a string
 */
function isString(value) {
    return typeof value === 'string';
}
/**
 * Type guard: value is a number
 */
function isNumber(value) {
    return typeof value === 'number' && !isNaN(value);
}
/**
 * Type guard: value is a boolean
 */
function isBoolean(value) {
    return typeof value === 'boolean';
}
/**
 * Type guard: value is an object (but not array or null)
 */
function isObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/**
 * Type guard: value is an array
 */
function isArray(value) {
    return Array.isArray(value);
}
/**
 * Type guard: value is a Map
 */
function isMap(value) {
    return value instanceof Map;
}
/**
 * Type guard: value is a Date
 */
function isDate(value) {
    return value instanceof Date && !isNaN(value.getTime());
}
/**
 * Type guard: value is null or undefined
 */
function isNullOrUndefined(value) {
    return value === null || value === undefined;
}
/**
 * Type guard: value is NOT null or undefined
 */
function isDefined(value) {
    return value !== null && value !== undefined;
}
// ============================================================
// Enum Validation
// ============================================================
/**
 * Validates if a value is a valid enum value
 */
function validateEnumValue(value, enumValues) {
    return enumValues.includes(value);
}
/**
 * Gets valid enum values as a read-only array
 */
function getEnumValues(enumObj) {
    return Object.values(enumObj);
}
// ============================================================
// Collection Uniqueness & Deduplication
// ============================================================
/**
 * Finds duplicate IDs in an array of objects with id property
 */
function findDuplicateIds(items) {
    const idMap = new Map();
    items.forEach(item => {
        idMap.set(item.id, (idMap.get(item.id) ?? 0) + 1);
    });
    const duplicates = Array.from(idMap.entries())
        .filter(([, count]) => count > 1)
        .map(([id]) => id);
    const counts = Array.from(idMap.entries())
        .map(([id, count]) => ({ id, count }))
        .sort((a, b) => b.count - a.count);
    return { duplicateIds: duplicates, counts };
}
/**
 * Deduplicates array items by ID, keeping first occurrence
 */
function deduplicateById(items) {
    const seen = new Set();
    const result = [];
    for (const item of items) {
        if (!seen.has(item.id)) {
            seen.add(item.id);
            result.push(item);
        }
    }
    return result;
}
/**
 * Checks if all IDs in collection are unique
 */
function checkUniqueIds(items) {
    const idSet = new Set();
    for (const item of items) {
        if (idSet.has(item.id)) {
            return false;
        }
        idSet.add(item.id);
    }
    return true;
}
// ============================================================
// Reference Validation
// ============================================================
/**
 * Checks if references point to existing entities
 */
function validateReferences(references, validIds) {
    const orphaned = references.filter(ref => !validIds.has(ref));
    return {
        valid: orphaned.length === 0,
        orphanedRefs: orphaned
    };
}
/**
 * Removes orphaned references from array
 */
function removeOrphanedReferences(references, validIds, refProperty) {
    return references.filter(ref => validIds.has(ref[refProperty]));
}
/**
 * Builds a map of valid IDs from entities
 */
function buildIdMap(entities) {
    const map = new Map();
    for (const entity of entities) {
        map.set(entity.id, entity);
    }
    return map;
}
// ============================================================
// Circular Reference Detection
// ============================================================
/**
 * Detects circular references in object graph
 * Returns cycles found or empty array if none
 */
function detectCircularReferences(startNode, getRelations = () => []) {
    const visited = new Set();
    const recursionStack = new Set();
    const cycles = [];
    function hasCycle(node, nodeId, path) {
        visited.add(nodeId);
        recursionStack.add(nodeId);
        path.push(nodeId);
        const relations = getRelations(node);
        for (const relation of relations) {
            const relId = typeof relation === 'object' ? relation.id : String(relation);
            if (!visited.has(relId)) {
                if (hasCycle(relation, relId, [...path])) {
                    return true;
                }
            }
            else if (recursionStack.has(relId)) {
                // Found cycle
                const cycleStart = path.indexOf(relId);
                if (cycleStart !== -1) {
                    const cycle = path.slice(cycleStart);
                    cycles.push([...cycle, relId]); // Complete the cycle
                }
                return true;
            }
        }
        recursionStack.delete(nodeId);
        return false;
    }
    const startId = typeof startNode === 'object' ? startNode.id : String(startNode);
    hasCycle(startNode, startId, []);
    return {
        hasCircular: cycles.length > 0,
        cycles
    };
}
// ============================================================
// Timestamp Validation
// ============================================================
/**
 * Validates if a timestamp is reasonable (within 100 years)
 */
function isValidTimestamp(value, allowFuture = true) {
    if (typeof value !== 'number') {
        return false;
    }
    const now = Date.now();
    const hundredYearsMs = 100 * 365.25 * 24 * 60 * 60 * 1000;
    // Must not be negative or way too far in past
    if (value < 0 || value < (now - hundredYearsMs)) {
        return false;
    }
    // Check future if not allowed
    if (!allowFuture && value > now) {
        return false;
    }
    return true;
}
/**
 * Validates timestamp consistency (earlier comes before later)
 */
function validateTimestampOrder(earlier, later) {
    return isValidTimestamp(earlier) && isValidTimestamp(later) && earlier <= later;
}
// ============================================================
// Deep Structure Validation
// ============================================================
/**
 * Deep validates object structure against schema
 * Schema: { propName: expectedType (string), ... }
 */
function validateObjectStructure(obj, schema, required = []) {
    const errors = [];
    if (!isObject(obj)) {
        return {
            valid: false,
            errors: ['Value is not an object']
        };
    }
    // Check required properties exist
    for (const prop of required) {
        if (!(prop in obj)) {
            errors.push(`Missing required property: ${prop}`);
        }
    }
    // Check types match
    for (const [prop, expectedType] of Object.entries(schema)) {
        if (prop in obj) {
            const value = obj[prop];
            const actualType = getTypeName(value);
            if (actualType !== expectedType) {
                errors.push(`Property '${prop}' has wrong type: expected ${expectedType}, got ${actualType}`);
            }
        }
    }
    return {
        valid: errors.length === 0,
        errors
    };
}
/**
 * Validates array items match expected type
 */
function validateArrayItems(arr, expectedType) {
    const errors = [];
    if (!Array.isArray(arr)) {
        return {
            valid: false,
            errors: ['Value is not an array']
        };
    }
    for (let i = 0; i < arr.length; i++) {
        const actualType = getTypeName(arr[i]);
        if (actualType !== expectedType) {
            errors.push(`Array[${i}] has wrong type: expected ${expectedType}, got ${actualType}`);
        }
    }
    return {
        valid: errors.length === 0,
        errors
    };
}
// ============================================================
// Utility Functions
// ============================================================
/**
 * Gets descriptive type name for any value
 */
function getTypeName(value) {
    if (value === null)
        return 'null';
    if (value === undefined)
        return 'undefined';
    if (Array.isArray(value))
        return 'array';
    if (value instanceof Map)
        return 'map';
    if (value instanceof Set)
        return 'set';
    if (value instanceof Date)
        return 'date';
    if (typeof value === 'object')
        return 'object';
    return typeof value;
}
/**
 * Safely clones object, handling Maps and Sets
 */
function safeClone(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    if (obj instanceof Map) {
        return new Map(obj);
    }
    if (obj instanceof Set) {
        return new Set(obj);
    }
    if (Array.isArray(obj)) {
        return obj.map(item => safeClone(item));
    }
    if (obj instanceof Date) {
        return new Date(obj.getTime());
    }
    const cloned = {};
    for (const [key, value] of Object.entries(obj)) {
        cloned[key] = safeClone(value);
    }
    return cloned;
}
/**
 * Flattens nested object keys for path reporting
 * Example: { a: { b: { c: 1 } } } -> ['a.b.c']
 */
function flattenObjectKeys(obj, prefix = '') {
    const keys = [];
    if (isObject(obj)) {
        for (const [key, value] of Object.entries(obj)) {
            const path = prefix ? `${prefix}.${key}` : key;
            if (isObject(value) || Array.isArray(value)) {
                keys.push(...flattenObjectKeys(value, path));
            }
            else {
                keys.push(path);
            }
        }
    }
    else if (Array.isArray(obj)) {
        obj.forEach((item, index) => {
            const path = `${prefix}[${index}]`;
            if (isObject(item) || Array.isArray(item)) {
                keys.push(...flattenObjectKeys(item, path));
            }
            else {
                keys.push(path);
            }
        });
    }
    return keys;
}
