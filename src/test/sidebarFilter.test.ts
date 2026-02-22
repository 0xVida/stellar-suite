import * as assert from 'assert';

interface MockContract {
    name: string;
    isBuilt: boolean;
    contractId?: string;
    templateCategory?: string;
}

interface FilterState {
    search: string;
    build: string;
    deploy: string;
    template: string;
}

function applyContractFiltersAndSearch(contracts: MockContract[], filters: FilterState): MockContract[] {
    return contracts.filter(c => {
        // Build filter
        if (filters.build === 'built' && !c.isBuilt) return false;
        if (filters.build === 'not-built' && c.isBuilt) return false;

        // Deploy filter
        if (filters.deploy === 'deployed' && !c.contractId) return false;
        if (filters.deploy === 'not-deployed' && c.contractId) return false;

        // Template filter
        if (filters.template && (c.templateCategory || 'unknown') !== filters.template) return false;

        // Search filter
        if (filters.search) {
            const query = filters.search.toLowerCase();
            if (!c.name.toLowerCase().includes(query)) return false;
        }

        return true;
    });
}

function highlightMatch(text: string, query: string): string {
    if (!query) return escapeHtml(text);
    const textLower = text.toLowerCase();
    const queryLower = query.toLowerCase();
    const idx = textLower.indexOf(queryLower);
    if (idx === -1) return escapeHtml(text);

    const before = text.substring(0, idx);
    const match = text.substring(idx, idx + query.length);
    const after = text.substring(idx + query.length);

    return `${escapeHtml(before)}<mark>${escapeHtml(match)}</mark>${escapeHtml(after)}`;
}

function escapeHtml(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

suite('Sidebar Contract Search and Filter Tests', () => {
    const contracts: MockContract[] = [
        { name: 'hello_world', isBuilt: true, contractId: 'C123', templateCategory: 'token' },
        { name: 'voting_app', isBuilt: false, templateCategory: 'voting' },
        { name: 'escrow_contract', isBuilt: true, templateCategory: 'escrow' },
        { name: 'auth_token', isBuilt: true, contractId: 'C456', templateCategory: 'token' },
        { name: 'simple_store', isBuilt: false }, // unknown template
    ];

    test('Filter by build status - built', () => {
        const filters: FilterState = { search: '', build: 'built', deploy: '', template: '' };
        const result = applyContractFiltersAndSearch(contracts, filters);
        assert.strictEqual(result.length, 3);
        assert.ok(result.every(c => c.isBuilt));
    });

    test('Filter by build status - not-built', () => {
        const filters: FilterState = { search: '', build: 'not-built', deploy: '', template: '' };
        const result = applyContractFiltersAndSearch(contracts, filters);
        assert.strictEqual(result.length, 2);
        assert.ok(result.every(c => !c.isBuilt));
    });

    test('Filter by deploy status - deployed', () => {
        const filters: FilterState = { search: '', build: '', deploy: 'deployed', template: '' };
        const result = applyContractFiltersAndSearch(contracts, filters);
        assert.strictEqual(result.length, 2);
        assert.ok(result.every(c => !!c.contractId));
    });

    test('Filter by deploy status - not-deployed', () => {
        const filters: FilterState = { search: '', build: '', deploy: 'not-deployed', template: '' };
        const result = applyContractFiltersAndSearch(contracts, filters);
        assert.strictEqual(result.length, 3);
        assert.ok(result.every(c => !c.contractId));
    });

    test('Filter by template type', () => {
        const filters: FilterState = { search: '', build: '', deploy: '', template: 'token' };
        const result = applyContractFiltersAndSearch(contracts, filters);
        assert.strictEqual(result.length, 2);
        assert.ok(result.every(c => c.templateCategory === 'token'));
    });

    test('Search matching (name)', () => {
        const filters: FilterState = { search: 'token', build: '', deploy: '', template: '' };
        const result = applyContractFiltersAndSearch(contracts, filters);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].name, 'auth_token');
    });

    test('Search matching (case insensitive)', () => {
        const filters: FilterState = { search: 'HeLlO', build: '', deploy: '', template: '' };
        const result = applyContractFiltersAndSearch(contracts, filters);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].name, 'hello_world');
    });

    test('Combined filters (built + token + name match)', () => {
        const filters: FilterState = { search: 'auth', build: 'built', deploy: 'deployed', template: 'token' };
        const result = applyContractFiltersAndSearch(contracts, filters);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].name, 'auth_token');
    });

    test('Empty results when no match', () => {
        const filters: FilterState = { search: 'xyz123', build: '', deploy: '', template: '' };
        const result = applyContractFiltersAndSearch(contracts, filters);
        assert.strictEqual(result.length, 0);
    });

    test('Highlight match works correctly', () => {
        const result = highlightMatch('auth_token', 'token');
        assert.strictEqual(result, 'auth_<mark>token</mark>');

        const noMatch = highlightMatch('auth_token', 'xyz');
        assert.strictEqual(noMatch, 'auth_token');

        const caseMatch = highlightMatch('HELLO_world', 'hello');
        assert.strictEqual(caseMatch, '<mark>HELLO</mark>_world');
    });
});
