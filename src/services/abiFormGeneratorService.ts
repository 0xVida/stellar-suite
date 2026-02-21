// src/services/abiFormGeneratorService.ts
// Generates HTML form markup from parsed ABI parameters.
// No vscode dependency — pure TypeScript service.

import { ContractFunction } from './contractInspector';
import { AbiParameter, SorobanType } from '../utils/abiParser';

// ── Interfaces ────────────────────────────────────────────────

export interface FormField {
    paramName: string;
    label: string;
    inputHtml: string;    // The <input>, <select>, or <textarea> element HTML string
    wrapperClass: string; // CSS class applied to the outer field wrapper div
    required: boolean;
    helpText?: string;
}

export interface GeneratedForm {
    formHtml: string;     // Complete <form>...</form> HTML string
    fields: FormField[];
    functionName: string;
    contractId: string;
}

// ── Service ───────────────────────────────────────────────────

export class AbiFormGeneratorService {

    /**
     * Generate a complete HTML form for the given contract function.
     *
     * @param contractId - The contract ID string (used in hidden input)
     * @param fn         - The ContractFunction metadata
     * @param abiParams  - Parsed AbiParameter[] from abiParser.parseParameters()
     * @returns GeneratedForm with complete HTML and field metadata
     */
    generateForm(
        contractId: string,
        fn: ContractFunction,
        abiParams: AbiParameter[]
    ): GeneratedForm {
        const fields = abiParams.map(p => this.generateField(p));

        const fieldsHtml = fields.map(f => `
            <div class="form-field-wrapper ${esc(f.wrapperClass)}" data-param="${esc(f.paramName)}">
                <label for="param-${esc(f.paramName)}">
                    ${esc(f.label)}${f.required ? ' <span class="required-mark" aria-label="required">*</span>' : ''}
                </label>
                ${f.inputHtml}
                ${f.helpText ? `<span class="field-help">${esc(f.helpText)}</span>` : ''}
                <span class="field-error" id="err-${esc(f.paramName)}" role="alert"></span>
            </div>
        `).join('\n');

        const noParams = abiParams.length === 0
            ? `<p class="no-params">This function takes no parameters.</p>`
            : '';

        const formHtml = `
            <form id="contract-form" novalidate>
                <input type="hidden" name="__contractId" value="${esc(contractId)}">
                <input type="hidden" name="__functionName" value="${esc(fn.name)}">
                ${noParams}
                ${fieldsHtml}
                <div class="form-actions">
                    <button type="submit" class="btn btn-primary">Simulate</button>
                    <button type="button" class="btn btn-secondary" id="cancel-btn">Cancel</button>
                </div>
            </form>`;

        return { formHtml, fields, functionName: fn.name, contractId };
    }

    // ── Private: Field Generation ─────────────────────────────

    private generateField(param: AbiParameter): FormField {
        const inputHtml = this.typeToInputHtml(param.sorobanType, param.name, param.required);
        const label = this.labelFromName(param.name);
        const helpText = this.helpTextForType(param.sorobanType, param.description);
        const wrapperClass = this.wrapperClassForType(param.sorobanType, param.required);

        return {
            paramName: param.name,
            label,
            inputHtml,
            wrapperClass,
            required: param.required,
            helpText,
        };
    }

    /**
     * Core type → HTML input mapping.
     */
    private typeToInputHtml(
        type: SorobanType,
        name: string,
        required: boolean
    ): string {
        const id = `param-${esc(name)}`;
        const reqAttr = required ? ' required' : '';

        switch (type.kind) {
            case 'primitive':
                return this.primitiveToInput(type.name, id, name, reqAttr);

            case 'option': {
                // Wraps the inner type control with a "None" checkbox.
                // When checked, the inner input is disabled and its value cleared.
                const innerHtml = this.typeToInputHtml(type.inner, name, false);
                return `
                    <div class="option-wrapper">
                        <label class="none-label">
                            <input type="checkbox" class="none-toggle" data-target="${esc(id)}" id="none-${esc(name)}">
                            None (omit this parameter)
                        </label>
                        <div class="option-inner" id="inner-${esc(name)}">
                            ${innerHtml}
                        </div>
                    </div>`;
            }

            case 'vec':
                return `<textarea id="${id}" name="${esc(name)}" class="json-input" rows="4"
                    placeholder='["item1", "item2"]'${reqAttr}
                    aria-label="JSON array for ${esc(name)}"></textarea>`;

            case 'map':
                return `<textarea id="${id}" name="${esc(name)}" class="json-input" rows="4"
                    placeholder='{"key": "value"}'${reqAttr}
                    aria-label="JSON object for ${esc(name)}"></textarea>`;

            case 'custom':
                return `<textarea id="${id}" name="${esc(name)}" class="json-input" rows="4"
                    placeholder='JSON value for ${esc(type.name)}'${reqAttr}
                    aria-label="JSON value for ${esc(name)}"></textarea>`;
        }
    }

    private primitiveToInput(
        typeName: string,
        id: string,
        name: string,
        reqAttr: string
    ): string {
        switch (typeName) {
            case 'bool':
                return `<select id="${id}" name="${esc(name)}"${reqAttr}>
                    <option value="">-- select --</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                </select>`;

            case 'u32': case 'u64': case 'u128': case 'u256':
                return `<input type="number" id="${id}" name="${esc(name)}"
                    min="0" step="1"
                    placeholder="0"${reqAttr}
                    aria-label="${esc(name)} (unsigned integer)">`;

            case 'i32': case 'i64': case 'i128': case 'i256':
                return `<input type="number" id="${id}" name="${esc(name)}"
                    step="1"
                    placeholder="0"${reqAttr}
                    aria-label="${esc(name)} (integer)">`;

            case 'String': case 'Symbol':
                return `<input type="text" id="${id}" name="${esc(name)}"${reqAttr}
                    aria-label="${esc(name)} (string)">`;

            case 'Bytes': case 'BytesN':
                return `<input type="text" id="${id}" name="${esc(name)}"
                    placeholder="hex-encoded bytes (e.g. deadbeef)"${reqAttr}
                    pattern="[0-9a-fA-F]*"
                    aria-label="${esc(name)} (hex bytes)">`;

            case 'Address':
                return `<input type="text" id="${id}" name="${esc(name)}"
                    placeholder="G... or C... (56 chars)"${reqAttr}
                    pattern="[CG][A-Z0-9]{55}"
                    maxlength="56"
                    aria-label="${esc(name)} (Stellar address)">`;

            default:
                return `<input type="text" id="${id}" name="${esc(name)}"${reqAttr}
                    aria-label="${esc(name)}">`;
        }
    }

    // ── Private: Label / Help / Class Helpers ─────────────────

    private labelFromName(name: string): string {
        // Convert snake_case → "Title Case With Spaces"
        return name
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    private helpTextForType(type: SorobanType, description?: string): string {
        if (description) { return description; }
        switch (type.kind) {
            case 'primitive':
                return this.primitiveHelpText(type.name);
            case 'option':
                return 'Optional. Check "None" to omit, or fill in the value below.';
            case 'vec':
                return 'Enter a JSON array, e.g. ["item1", "item2"]';
            case 'map':
                return 'Enter a JSON object, e.g. {"key": "value"}';
            case 'custom':
                return `Enter a JSON-encoded ${type.name} value.`;
        }
    }

    private primitiveHelpText(name: string): string {
        const map: Record<string, string> = {
            bool:    'Select true or false.',
            u32:     'Unsigned 32-bit integer (0 to 4,294,967,295).',
            i32:     'Signed 32-bit integer (−2,147,483,648 to 2,147,483,647).',
            u64:     'Unsigned 64-bit integer (0 to 18,446,744,073,709,551,615).',
            i64:     'Signed 64-bit integer.',
            u128:    'Unsigned 128-bit integer. Enter as a string for very large values.',
            i128:    'Signed 128-bit integer. Enter as a string for very large values.',
            u256:    'Unsigned 256-bit integer. Enter as a string for very large values.',
            i256:    'Signed 256-bit integer. Enter as a string for very large values.',
            String:  'A UTF-8 text string.',
            Symbol:  'A short identifier string (Soroban symbol).',
            Bytes:   'Hex-encoded bytes (e.g. deadbeef).',
            BytesN:  'Fixed-length hex-encoded bytes (even number of hex characters).',
            Address: 'A 56-character Stellar address (starts with G for accounts or C for contracts).',
        };
        return map[name] ?? '';
    }

    private wrapperClassForType(type: SorobanType, required: boolean): string {
        const classes: string[] = [];
        if (!required) { classes.push('optional'); }
        if (type.kind === 'option') { classes.push('option-field'); }
        if (type.kind === 'vec' || type.kind === 'map' || type.kind === 'custom') {
            classes.push('json-field');
        }
        return classes.join(' ');
    }
}

// ── HTML Escape Helper ────────────────────────────────────────

/**
 * Escape a string for safe insertion into HTML attributes and text nodes.
 * Follows the same pattern as simulationPanel.ts escapeHtml().
 */
function esc(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
