import { ContractFunction, FunctionParameter } from './contractInspector';

export interface PredictedError {
    code: string;
    message: string;
    suggestion: string;
    severity: 'warning' | 'error';
}

export interface ValidationReport {
    valid: boolean;
    errors: string[];
    warnings: string[];
    suggestions: string[];
    predictedErrors: PredictedError[];
}

export class SimulationValidationService {
    public validateSimulation(
        contractId: string,
        functionName: string,
        args: any[],
        selectedFunction: ContractFunction | null,
        availableFunctions: ContractFunction[]
    ): ValidationReport {
        const errors: string[] = [];
        const warnings: string[] = [];
        const suggestions: string[] = [];

        this.validateSimulationParameters(contractId, functionName, args, errors, suggestions);

        const argObject = this.getNamedArgs(args);
        this.validateContractState(functionName, selectedFunction, availableFunctions, errors, warnings, suggestions);
        this.validateFunctionSignature(selectedFunction, argObject, errors, warnings, suggestions);

        const predictedErrors = this.predictPotentialErrors(
            contractId,
            functionName,
            argObject,
            selectedFunction,
            availableFunctions
        );

        for (const predicted of predictedErrors) {
            if (predicted.severity === 'error') {
                errors.push(`Predicted ${predicted.code}: ${predicted.message}`);
            } else {
                warnings.push(`Predicted ${predicted.code}: ${predicted.message}`);
            }
            suggestions.push(predicted.suggestion);
        }

        return {
            valid: errors.length === 0,
            errors: this.unique(errors),
            warnings: this.unique(warnings),
            suggestions: this.unique(suggestions),
            predictedErrors,
        };
    }

    private validateSimulationParameters(
        contractId: string,
        functionName: string,
        args: any[],
        errors: string[],
        suggestions: string[]
    ): void {
        if (!contractId || !/^C[A-Z0-9]{55}$/.test(contractId)) {
            errors.push('Invalid contract ID format. Expected a 56-character Stellar contract address starting with C.');
            suggestions.push('Use a valid contract ID from your deployment output or workspace metadata.');
        }

        if (!functionName || functionName.trim().length === 0) {
            errors.push('Function name is required.');
            suggestions.push('Select a contract function from the picker or enter a valid function name.');
        }

        if (!Array.isArray(args)) {
            errors.push('Arguments payload must be an array.');
            suggestions.push('Provide arguments as an object wrapped in an array, e.g. [{"name":"value"}].');
            return;
        }

        if (args.length > 1) {
            suggestions.push('Only one named argument object is currently used for simulation. Additional positional values may be ignored by the CLI.');
        }
    }

    private validateContractState(
        functionName: string,
        selectedFunction: ContractFunction | null,
        availableFunctions: ContractFunction[],
        errors: string[],
        warnings: string[],
        suggestions: string[]
    ): void {
        if (availableFunctions.length === 0) {
            warnings.push('Contract functions could not be discovered. Signature validation is limited.');
            suggestions.push('Ensure Stellar CLI has access to the target contract and try again for full signature validation.');
            return;
        }

        const contractFn = selectedFunction || availableFunctions.find(fn => fn.name === functionName);
        if (!contractFn) {
            errors.push(`Function "${functionName}" was not found in contract metadata.`);
            suggestions.push(`Choose one of the available functions: ${availableFunctions.map(f => f.name).slice(0, 8).join(', ')}.`);
        }
    }

    private validateFunctionSignature(
        selectedFunction: ContractFunction | null,
        argObject: Record<string, unknown>,
        errors: string[],
        warnings: string[],
        suggestions: string[]
    ): void {
        if (!selectedFunction) {
            return;
        }

        const parameters = selectedFunction.parameters || [];
        const providedKeys = new Set(Object.keys(argObject));

        for (const param of parameters) {
            if (param.required && !(param.name in argObject)) {
                errors.push(`Missing required parameter: ${param.name}.`);
                suggestions.push(`Add a value for "${param.name}" before running simulation.`);
                continue;
            }

            if (param.name in argObject && !this.matchesType(argObject[param.name], param.type)) {
                warnings.push(`Type mismatch for parameter "${param.name}". Expected ${param.type || 'unknown type'}.`);
                suggestions.push(this.getTypeSuggestion(param, argObject[param.name]));
            }
        }

        for (const providedKey of providedKeys) {
            if (!parameters.some(param => param.name === providedKey)) {
                warnings.push(`Unknown parameter provided: ${providedKey}.`);
                suggestions.push(`Remove "${providedKey}" or verify the function signature for "${selectedFunction.name}".`);
            }
        }
    }

    private predictPotentialErrors(
        contractId: string,
        functionName: string,
        argObject: Record<string, unknown>,
        selectedFunction: ContractFunction | null,
        availableFunctions: ContractFunction[]
    ): PredictedError[] {
        const predictions: PredictedError[] = [];

        if (contractId.endsWith('AAAAAAAA')) {
            predictions.push({
                code: 'LIKELY_NOT_FOUND',
                message: 'Contract ID suffix suggests placeholder/test value that may not exist on-chain.',
                suggestion: 'Replace placeholder contract IDs with a deployed contract address.',
                severity: 'warning'
            });
        }

        if (availableFunctions.length > 0 && !availableFunctions.some(fn => fn.name === functionName)) {
            predictions.push({
                code: 'FUNCTION_NOT_EXPORTED',
                message: `Function "${functionName}" does not appear to be exported by the contract.`,
                suggestion: 'Pick a function from discovered contract metadata to avoid invocation failures.',
                severity: 'error'
            });
        }

        const stateChangingNames = ['set', 'update', 'mint', 'burn', 'transfer', 'approve', 'initialize'];
        if (stateChangingNames.some(name => functionName.toLowerCase().includes(name)) && Object.keys(argObject).length === 0) {
            predictions.push({
                code: 'MISSING_STATE_ARGUMENTS',
                message: 'State-changing function invoked without arguments may fail authorization or validation checks.',
                suggestion: 'Populate required fields and signer-related arguments before simulation.',
                severity: 'warning'
            });
        }

        if (selectedFunction && selectedFunction.parameters.some(param => param.type?.toLowerCase().includes('address'))) {
            for (const param of selectedFunction.parameters) {
                if (!param.type?.toLowerCase().includes('address')) {
                    continue;
                }
                const value = argObject[param.name];
                if (typeof value === 'string' && !/^[CG][A-Z0-9]{55}$/.test(value)) {
                    predictions.push({
                        code: 'INVALID_ADDRESS_SHAPE',
                        message: `Parameter "${param.name}" looks like an address but has an invalid format.`,
                        suggestion: `Provide a valid Stellar account (G...) or contract (C...) address for "${param.name}".`,
                        severity: 'error'
                    });
                }
            }
        }

        return predictions;
    }

    private getNamedArgs(args: any[]): Record<string, unknown> {
        if (args.length === 0) {
            return {};
        }

        const first = args[0];
        if (typeof first === 'object' && first !== null && !Array.isArray(first)) {
            return first as Record<string, unknown>;
        }

        return {};
    }

    private matchesType(value: unknown, type?: string): boolean {
        if (!type) {
            return true;
        }

        const normalized = type.toLowerCase();

        if (normalized.includes('bool')) {
            return typeof value === 'boolean';
        }
        if (normalized.includes('string') || normalized.includes('symbol')) {
            return typeof value === 'string';
        }
        if (normalized.includes('i') || normalized.includes('u') || normalized.includes('int')) {
            return typeof value === 'number' || (typeof value === 'string' && /^-?\d+$/.test(value));
        }
        if (normalized.includes('vec') || normalized.includes('list') || normalized.includes('array')) {
            return Array.isArray(value);
        }
        if (normalized.includes('map') || normalized.includes('struct') || normalized.includes('object') || normalized.includes('tuple')) {
            return typeof value === 'object' && value !== null && !Array.isArray(value);
        }

        return true;
    }

    private getTypeSuggestion(parameter: FunctionParameter, value: unknown): string {
        const actualType = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
        return `Parameter "${parameter.name}" expects ${parameter.type || 'a specific type'}, but received ${actualType}. Convert the value before simulation.`;
    }

    private unique(values: string[]): string[] {
        return Array.from(new Set(values));
    }
}
