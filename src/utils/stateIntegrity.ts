/**
 * State Integrity Check Utilities
 * 
 * Provides reusable, pure functions for validating workspace state structure,
 * types, relationships, and data consistency.
 * 
 * All functions are stateless and testable.
 */

// ============================================================
// Type Definitions
// ============================================================

export interface IntegrityCheckResult {
    valid: boolean;
    errors: string[];
}

export interface CircularRefCheckResult {
    hasCircular: boolean;
    cycles: string[][];
}

// ============================================================
// UUID & ID Validation
// ============================================================

/**
 * Validates if a string is a valid UUID (v4).
 * Supports formats: 550e8400-e29b-41d4-a716-446655440000
 */
export function isValidUUID(value: unknown): value is string {
    if (typeof value !== 'string') {
        return false;
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
}

/**
 * Validates if a value is a valid identifier (non-empty string).
 */
export function isValidId(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validates if a value is a valid contract ID (alphanumeric or special chars).
 */
export function isValidContractId(value: unknown): value is string {
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
export function isString(value: unknown): value is string {
    return typeof value === 'string';
}

/**
 * Type guard: value is a number
 */
export function isNumber(value: unknown): value is number {
    return typeof value === 'number' && !isNaN(value);
}

/**
 * Type guard: value is a boolean
 */
export function isBoolean(value: unknown): value is boolean {
    return typeof value === 'boolean';
}

/**
 * Type guard: value is an object (but not array or null)
 */
export function isObject(value: unknown): value is Record<string, any> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Type guard: value is an array
 */
export function isArray(value: unknown): value is unknown[] {
    return Array.isArray(value);
}

/**
 * Type guard: value is a Map
 */
export function isMap(value: unknown): value is Map<any, any> {
    return value instanceof Map;
}

/**
 * Type guard: value is a Date
 */
export function isDate(value: unknown): value is Date {
    return value instanceof Date && !isNaN(value.getTime());
}

/**
 * Type guard: value is null or undefined
 */
export function isNullOrUndefined(value: unknown): value is null | undefined {
    return value === null || value === undefined;
}

/**
 * Type guard: value is NOT null or undefined
 */
export function isDefined(value: unknown): boolean {
    return value !== null && value !== undefined;
}

// ============================================================
// Enum Validation
// ============================================================

/**
 * Validates if a value is a valid enum value
 */
export function validateEnumValue<T extends string | number>(
    value: unknown,
    enumValues: readonly (T | string | number)[]
): value is T {
    return enumValues.includes(value as any);
}

/**
 * Gets valid enum values as a read-only array
 */
export function getEnumValues<T extends string | number>(
    enumObj: Record<string, T>
): readonly T[] {
    return Object.values(enumObj);
}

// ============================================================
// Collection Uniqueness & Deduplication
// ============================================================

/**
 * Finds duplicate IDs in an array of objects with id property
 */
export function findDuplicateIds<T extends { id: any }>(items: T[]): {
    duplicateIds: any[];
    counts: { id: any; count: number }[];
} {
    const idMap = new Map<any, number>();
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
export function deduplicateById<T extends { id: any }>(items: T[]): T[] {
    const seen = new Set<any>();
    const result: T[] = [];
    
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
export function checkUniqueIds<T extends { id: any }>(items: T[]): boolean {
    const idSet = new Set<any>();
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
export function validateReferences<T extends { id: any }>(
    references: any[],
    validIds: Set<any>
): { valid: boolean; orphanedRefs: any[] } {
    const orphaned = references.filter(ref => !validIds.has(ref));
    return {
        valid: orphaned.length === 0,
        orphanedRefs: orphaned
    };
}

/**
 * Removes orphaned references from array
 */
export function removeOrphanedReferences<T>(
    references: T[],
    validIds: Set<any>,
    refProperty: keyof T
): T[] {
    return references.filter(ref => validIds.has(ref[refProperty]));
}

/**
 * Builds a map of valid IDs from entities
 */
export function buildIdMap<T extends { id: any }>(entities: T[]): Map<any, T> {
    const map = new Map<any, T>();
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
export function detectCircularReferences(
    startNode: any,
    getRelations: (node: any) => any[] = () => []
): CircularRefCheckResult {
    const visited = new Set<any>();
    const recursionStack = new Set<any>();
    const cycles: string[][] = [];

    function hasCycle(
        node: any,
        nodeId: string,
        path: string[]
    ): boolean {
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
            } else if (recursionStack.has(relId)) {
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
export function isValidTimestamp(value: unknown, allowFuture = true): boolean {
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
export function validateTimestampOrder(
    earlier: number,
    later: number
): boolean {
    return isValidTimestamp(earlier) && isValidTimestamp(later) && earlier <= later;
}

// ============================================================
// Deep Structure Validation
// ============================================================

/**
 * Deep validates object structure against schema
 * Schema: { propName: expectedType (string), ... }
 */
export function validateObjectStructure(
    obj: unknown,
    schema: Record<string, string>,
    required: string[] = []
): IntegrityCheckResult {
    const errors: string[] = [];

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
                errors.push(
                    `Property '${prop}' has wrong type: expected ${expectedType}, got ${actualType}`
                );
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
export function validateArrayItems(
    arr: unknown,
    expectedType: string
): IntegrityCheckResult {
    const errors: string[] = [];

    if (!Array.isArray(arr)) {
        return {
            valid: false,
            errors: ['Value is not an array']
        };
    }

    for (let i = 0; i < arr.length; i++) {
        const actualType = getTypeName(arr[i]);
        if (actualType !== expectedType) {
            errors.push(
                `Array[${i}] has wrong type: expected ${expectedType}, got ${actualType}`
            );
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
export function getTypeName(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (Array.isArray(value)) return 'array';
    if (value instanceof Map) return 'map';
    if (value instanceof Set) return 'set';
    if (value instanceof Date) return 'date';
    if (typeof value === 'object') return 'object';
    return typeof value;
}

/**
 * Safely clones object, handling Maps and Sets
 */
export function safeClone<T extends any>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    if (obj instanceof Map) {
        return new Map(obj) as T;
    }

    if (obj instanceof Set) {
        return new Set(obj) as T;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => safeClone(item)) as T;
    }

    if (obj instanceof Date) {
        return new Date(obj.getTime()) as T;
    }

    const cloned = {} as T;
    for (const [key, value] of Object.entries(obj)) {
        (cloned as any)[key] = safeClone(value);
    }
    return cloned;
}

/**
 * Flattens nested object keys for path reporting
 * Example: { a: { b: { c: 1 } } } -> ['a.b.c']
 */
export function flattenObjectKeys(
    obj: any,
    prefix = ''
): string[] {
    const keys: string[] = [];

    if (isObject(obj)) {
        for (const [key, value] of Object.entries(obj)) {
            const path = prefix ? `${prefix}.${key}` : key;
            if (isObject(value) || Array.isArray(value)) {
                keys.push(...flattenObjectKeys(value, path));
            } else {
                keys.push(path);
            }
        }
    } else if (Array.isArray(obj)) {
        obj.forEach((item, index) => {
            const path = `${prefix}[${index}]`;
            if (isObject(item) || Array.isArray(item)) {
                keys.push(...flattenObjectKeys(item, path));
            } else {
                keys.push(path);
            }
        });
    }

    return keys;
}
