// ============================================================
// src/services/simulationDiffService.ts
// Service for calculating detailed diffs between two
// simulation results. Provides unified and side-by-side
// diff views with highlighting of additions, deletions,
// and modifications.
// ============================================================

import { SimulationHistoryEntry } from './simulationHistoryService';
import { StateDiff, StateDiffChange } from '../types/simulationState';

// ── Type Definitions ──────────────────────────────────────────

/** Type of change in a diff line */
export type DiffLineType = 'added' | 'deleted' | 'modified' | 'unchanged';

/** Severity level for diff changes */
export type DiffSeverity = 'critical' | 'major' | 'minor';

/** A single line in a diff */
export interface DiffLine {
    type: DiffLineType;
    lineNumber: number;
    content: string;
    oldContent?: string;
    newContent?: string;
    severity?: DiffSeverity;
}

/** Diff for a specific section */
export interface SectionDiff {
    section: string;
    hasChanges: boolean;
    severity: DiffSeverity;
    lines: DiffLine[];
    summary: string;
}

/** Result diff details */
export interface ResultDiff {
    hasChanges: boolean;
    severity: DiffSeverity;
    oldValue: unknown;
    newValue: unknown;
    oldValueFormatted: string;
    newValueFormatted: string;
    changeDescription: string;
}

/** Resource usage diff details */
export interface ResourceDiff {
    hasChanges: boolean;
    severity: DiffSeverity;
    cpuDiff?: {
        oldValue: number;
        newValue: number;
        absoluteChange: number;
        percentChange: number;
    };
    memoryDiff?: {
        oldValue: number;
        newValue: number;
        absoluteChange: number;
        percentChange: number;
    };
}

/** Complete simulation diff result */
export interface SimulationDiff {
    /** ID of the first simulation */
    fromId: string;
    /** ID of the second simulation */
    toId: string;
    /** Timestamp when diff was generated */
    generatedAt: string;
    /** Overall diff severity */
    overallSeverity: DiffSeverity;
    /** Whether there are any changes */
    hasChanges: boolean;
    /** Summary of changes */
    summary: string;
    /** Outcome diff */
    outcomeDiff: SectionDiff;
    /** Result diff */
    resultDiff: ResultDiff;
    /** Resource usage diff */
    resourceDiff: ResourceDiff;
    /** State changes diff */
    stateDiff: SectionDiff;
    /** Parameters diff */
    parametersDiff: SectionDiff;
    /** All section diffs */
    sections: SectionDiff[];
    /** Navigation points for diff changes */
    navigationPoints: DiffNavigationPoint[];
}

/** Navigation point for jumping between changes */
export interface DiffNavigationPoint {
    section: string;
    lineNumber: number;
    severity: DiffSeverity;
    description: string;
}

/** Diff view mode */
export type DiffViewMode = 'side-by-side' | 'unified';

/** Export format for diff */
export type DiffExportFormat = 'json' | 'markdown' | 'html' | 'unified';

/** Export options */
export interface DiffExportOptions {
    format: DiffExportFormat;
    includeFullData?: boolean;
    viewMode?: DiffViewMode;
}

// ── Service Implementation ────────────────────────────────────

/**
 * Service for calculating and formatting diffs between two simulation results.
 */
export class SimulationDiffService {
    /**
     * Calculate a detailed diff between two simulations.
     */
    public calculateDiff(
        from: SimulationHistoryEntry,
        to: SimulationHistoryEntry
    ): SimulationDiff {
        const sections: SectionDiff[] = [];
        const navigationPoints: DiffNavigationPoint[] = [];

        // Calculate outcome diff
        const outcomeDiff = this.calculateOutcomeDiff(from, to);
        sections.push(outcomeDiff);
        if (outcomeDiff.hasChanges) {
            navigationPoints.push({
                section: 'outcome',
                lineNumber: 1,
                severity: outcomeDiff.severity,
                description: outcomeDiff.summary,
            });
        }

        // Calculate result diff
        const resultDiff = this.calculateResultDiff(from, to);
        const resultSection = this.resultDiffToSection(resultDiff);
        sections.push(resultSection);
        if (resultSection.hasChanges) {
            navigationPoints.push({
                section: 'result',
                lineNumber: 1,
                severity: resultSection.severity,
                description: resultSection.summary,
            });
        }

        // Calculate resource diff
        const resourceDiff = this.calculateResourceDiff(from, to);
        const resourceSection = this.resourceDiffToSection(resourceDiff);
        sections.push(resourceSection);
        if (resourceSection.hasChanges) {
            navigationPoints.push({
                section: 'resources',
                lineNumber: 1,
                severity: resourceSection.severity,
                description: resourceSection.summary,
            });
        }

        // Calculate state diff
        const stateDiff = this.calculateStateDiff(from, to);
        sections.push(stateDiff);
        if (stateDiff.hasChanges) {
            navigationPoints.push({
                section: 'state',
                lineNumber: 1,
                severity: stateDiff.severity,
                description: stateDiff.summary,
            });
        }

        // Calculate parameters diff
        const parametersDiff = this.calculateParametersDiff(from, to);
        sections.push(parametersDiff);
        if (parametersDiff.hasChanges) {
            navigationPoints.push({
                section: 'parameters',
                lineNumber: 1,
                severity: parametersDiff.severity,
                description: parametersDiff.summary,
            });
        }

        // Determine overall severity
        const overallSeverity = this.determineOverallSeverity(sections);
        const hasChanges = sections.some(s => s.hasChanges);

        // Generate summary
        const summary = this.generateSummary(sections, hasChanges);

        return {
            fromId: from.id,
            toId: to.id,
            generatedAt: new Date().toISOString(),
            overallSeverity,
            hasChanges,
            summary,
            outcomeDiff,
            resultDiff,
            resourceDiff,
            stateDiff,
            parametersDiff,
            sections,
            navigationPoints,
        };
    }

    /**
     * Calculate outcome diff
     */
    private calculateOutcomeDiff(
        from: SimulationHistoryEntry,
        to: SimulationHistoryEntry
    ): SectionDiff {
        const hasChanges = from.outcome !== to.outcome;
        const lines: DiffLine[] = [];

        if (hasChanges) {
            lines.push({
                type: 'deleted',
                lineNumber: 1,
                content: `Outcome: ${from.outcome}`,
                oldContent: from.outcome,
                severity: 'critical',
            });
            lines.push({
                type: 'added',
                lineNumber: 2,
                content: `Outcome: ${to.outcome}`,
                newContent: to.outcome,
                severity: 'critical',
            });

            // Add error details if applicable
            if (from.error || to.error) {
                if (from.error && !to.error) {
                    lines.push({
                        type: 'deleted',
                        lineNumber: 3,
                        content: `Error: ${from.error}`,
                        oldContent: from.error,
                        severity: 'major',
                    });
                } else if (!from.error && to.error) {
                    lines.push({
                        type: 'added',
                        lineNumber: 3,
                        content: `Error: ${to.error}`,
                        newContent: to.error,
                        severity: 'major',
                    });
                } else if (from.error !== to.error) {
                    lines.push({
                        type: 'modified',
                        lineNumber: 3,
                        content: `Error changed`,
                        oldContent: from.error,
                        newContent: to.error,
                        severity: 'major',
                    });
                }
            }
        } else {
            lines.push({
                type: 'unchanged',
                lineNumber: 1,
                content: `Outcome: ${from.outcome}`,
            });
        }

        return {
            section: 'outcome',
            hasChanges,
            severity: hasChanges ? 'critical' : 'minor',
            lines,
            summary: hasChanges
                ? `Outcome changed from ${from.outcome} to ${to.outcome}`
                : 'Outcome unchanged',
        };
    }

    /**
     * Calculate result diff
     */
    private calculateResultDiff(
        from: SimulationHistoryEntry,
        to: SimulationHistoryEntry
    ): ResultDiff {
        const oldValue = from.result;
        const newValue = to.result;
        const oldValueFormatted = this.formatValue(oldValue);
        const newValueFormatted = this.formatValue(newValue);
        const hasChanges = !this.valuesEqual(oldValue, newValue);

        let severity: DiffSeverity = 'minor';
        let changeDescription = 'Result unchanged';

        if (hasChanges) {
            // Determine severity based on change type
            if (oldValue === undefined && newValue !== undefined) {
                severity = 'major';
                changeDescription = 'Result added (was undefined)';
            } else if (oldValue !== undefined && newValue === undefined) {
                severity = 'major';
                changeDescription = 'Result removed (now undefined)';
            } else if (typeof oldValue !== typeof newValue) {
                severity = 'major';
                changeDescription = `Result type changed from ${typeof oldValue} to ${typeof newValue}`;
            } else {
                severity = 'major';
                changeDescription = 'Result value changed';
            }
        }

        return {
            hasChanges,
            severity,
            oldValue,
            newValue,
            oldValueFormatted,
            newValueFormatted,
            changeDescription,
        };
    }

    /**
     * Convert result diff to section diff
     */
    private resultDiffToSection(resultDiff: ResultDiff): SectionDiff {
        const lines: DiffLine[] = [];

        if (resultDiff.hasChanges) {
            lines.push({
                type: 'deleted',
                lineNumber: 1,
                content: `- ${resultDiff.oldValueFormatted}`,
                oldContent: resultDiff.oldValueFormatted,
                severity: resultDiff.severity,
            });
            lines.push({
                type: 'added',
                lineNumber: 2,
                content: `+ ${resultDiff.newValueFormatted}`,
                newContent: resultDiff.newValueFormatted,
                severity: resultDiff.severity,
            });
        } else {
            lines.push({
                type: 'unchanged',
                lineNumber: 1,
                content: resultDiff.oldValueFormatted,
            });
        }

        return {
            section: 'result',
            hasChanges: resultDiff.hasChanges,
            severity: resultDiff.severity,
            lines,
            summary: resultDiff.changeDescription,
        };
    }

    /**
     * Calculate resource usage diff
     */
    private calculateResourceDiff(
        from: SimulationHistoryEntry,
        to: SimulationHistoryEntry
    ): ResourceDiff {
        const fromCpu = from.resourceUsage?.cpuInstructions;
        const toCpu = to.resourceUsage?.cpuInstructions;
        const fromMem = from.resourceUsage?.memoryBytes;
        const toMem = to.resourceUsage?.memoryBytes;

        let cpuDiff: ResourceDiff['cpuDiff'];
        let memoryDiff: ResourceDiff['memoryDiff'];
        let hasChanges = false;
        let maxSeverity: DiffSeverity = 'minor';

        if (fromCpu !== undefined && toCpu !== undefined && fromCpu !== toCpu) {
            const absoluteChange = toCpu - fromCpu;
            const percentChange = fromCpu === 0 ? 0 : (absoluteChange / fromCpu) * 100;
            cpuDiff = {
                oldValue: fromCpu,
                newValue: toCpu,
                absoluteChange,
                percentChange,
            };
            hasChanges = true;

            // Determine severity based on percent change
            if (Math.abs(percentChange) > 50) {
                maxSeverity = 'critical';
            } else if (Math.abs(percentChange) > 20) {
                maxSeverity = 'major';
            }
        }

        if (fromMem !== undefined && toMem !== undefined && fromMem !== toMem) {
            const absoluteChange = toMem - fromMem;
            const percentChange = fromMem === 0 ? 0 : (absoluteChange / fromMem) * 100;
            memoryDiff = {
                oldValue: fromMem,
                newValue: toMem,
                absoluteChange,
                percentChange,
            };
            hasChanges = true;

            // Update severity if memory change is more severe
            const memSeverity =
                Math.abs(percentChange) > 50 ? 'critical' :
                Math.abs(percentChange) > 20 ? 'major' : 'minor';
            if (this.compareSeverity(memSeverity, maxSeverity) > 0) {
                maxSeverity = memSeverity;
            }
        }

        return {
            hasChanges,
            severity: maxSeverity,
            cpuDiff,
            memoryDiff,
        };
    }

    /**
     * Convert resource diff to section diff
     */
    private resourceDiffToSection(resourceDiff: ResourceDiff): SectionDiff {
        const lines: DiffLine[] = [];
        let lineNumber = 1;

        if (resourceDiff.cpuDiff) {
            const { oldValue, newValue, absoluteChange, percentChange } = resourceDiff.cpuDiff;
            lines.push({
                type: 'deleted',
                lineNumber: lineNumber++,
                content: `- CPU Instructions: ${oldValue.toLocaleString()}`,
                oldContent: oldValue.toString(),
                severity: resourceDiff.severity,
            });
            lines.push({
                type: 'added',
                lineNumber: lineNumber++,
                content: `+ CPU Instructions: ${newValue.toLocaleString()} (${absoluteChange > 0 ? '+' : ''}${absoluteChange.toLocaleString()}, ${percentChange.toFixed(1)}%)`,
                newContent: newValue.toString(),
                severity: resourceDiff.severity,
            });
        }

        if (resourceDiff.memoryDiff) {
            const { oldValue, newValue, absoluteChange, percentChange } = resourceDiff.memoryDiff;
            lines.push({
                type: 'deleted',
                lineNumber: lineNumber++,
                content: `- Memory Bytes: ${oldValue.toLocaleString()}`,
                oldContent: oldValue.toString(),
                severity: resourceDiff.severity,
            });
            lines.push({
                type: 'added',
                lineNumber: lineNumber++,
                content: `+ Memory Bytes: ${newValue.toLocaleString()} (${absoluteChange > 0 ? '+' : ''}${absoluteChange.toLocaleString()}, ${percentChange.toFixed(1)}%)`,
                newContent: newValue.toString(),
                severity: resourceDiff.severity,
            });
        }

        if (lines.length === 0) {
            lines.push({
                type: 'unchanged',
                lineNumber: 1,
                content: 'Resource usage unchanged',
            });
        }

        const summary = resourceDiff.hasChanges
            ? this.generateResourceSummary(resourceDiff)
            : 'Resource usage unchanged';

        return {
            section: 'resources',
            hasChanges: resourceDiff.hasChanges,
            severity: resourceDiff.severity,
            lines,
            summary,
        };
    }

    /**
     * Generate resource diff summary
     */
    private generateResourceSummary(resourceDiff: ResourceDiff): string {
        const parts: string[] = [];

        if (resourceDiff.cpuDiff) {
            const { percentChange } = resourceDiff.cpuDiff;
            parts.push(`CPU ${percentChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(percentChange).toFixed(1)}%`);
        }

        if (resourceDiff.memoryDiff) {
            const { percentChange } = resourceDiff.memoryDiff;
            parts.push(`Memory ${percentChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(percentChange).toFixed(1)}%`);
        }

        return parts.join(', ');
    }

    /**
     * Calculate state changes diff
     */
    private calculateStateDiff(
        from: SimulationHistoryEntry,
        to: SimulationHistoryEntry
    ): SectionDiff {
        const fromDiff = from.stateDiff;
        const toDiff = to.stateDiff;
        const lines: DiffLine[] = [];
        let lineNumber = 1;
        let hasChanges = false;
        let severity: DiffSeverity = 'minor';

        if (!fromDiff && !toDiff) {
            return {
                section: 'state',
                hasChanges: false,
                severity: 'minor',
                lines: [{
                    type: 'unchanged',
                    lineNumber: 1,
                    content: 'No state changes in either simulation',
                }],
                summary: 'No state changes',
            };
        }

        // Compare state changes
        const fromChanges = this.getAllStateChanges(fromDiff);
        const toChanges = this.getAllStateChanges(toDiff);

        // Create maps by key for comparison
        const fromMap = new Map(fromChanges.map(c => [c.key, c]));
        const toMap = new Map(toChanges.map(c => [c.key, c]));

        // Find differences
        const allKeys = new Set([...fromMap.keys(), ...toMap.keys()]);

        for (const key of allKeys) {
            const fromChange = fromMap.get(key);
            const toChange = toMap.get(key);

            if (!fromChange && toChange) {
                // New state change in 'to' simulation
                lines.push({
                    type: 'added',
                    lineNumber: lineNumber++,
                    content: `+ ${key}: ${toChange.type} (${this.formatValue(toChange.afterValue)})`,
                    newContent: this.formatValue(toChange.afterValue),
                    severity: 'major',
                });
                hasChanges = true;
                severity = 'major';
            } else if (fromChange && !toChange) {
                // State change removed in 'to' simulation
                lines.push({
                    type: 'deleted',
                    lineNumber: lineNumber++,
                    content: `- ${key}: ${fromChange.type} (${this.formatValue(fromChange.afterValue)})`,
                    oldContent: this.formatValue(fromChange.afterValue),
                    severity: 'major',
                });
                hasChanges = true;
                severity = 'major';
            } else if (fromChange && toChange) {
                // Compare change types or values
                if (fromChange.type !== toChange.type ||
                    !this.valuesEqual(fromChange.afterValue, toChange.afterValue)) {
                    lines.push({
                        type: 'modified',
                        lineNumber: lineNumber++,
                        content: `~ ${key}: ${fromChange.type} → ${toChange.type}`,
                        oldContent: this.formatValue(fromChange.afterValue),
                        newContent: this.formatValue(toChange.afterValue),
                        severity: 'major',
                    });
                    hasChanges = true;
                    severity = 'major';
                } else {
                    lines.push({
                        type: 'unchanged',
                        lineNumber: lineNumber++,
                        content: `  ${key}: ${toChange.type}`,
                    });
                }
            }
        }

        if (lines.length === 0) {
            lines.push({
                type: 'unchanged',
                lineNumber: 1,
                content: 'State changes identical',
            });
        }

        const summary = hasChanges
            ? `${lines.filter(l => l.type !== 'unchanged').length} state change differences`
            : 'State changes identical';

        return {
            section: 'state',
            hasChanges,
            severity,
            lines,
            summary,
        };
    }

    /**
     * Calculate parameters diff
     */
    private calculateParametersDiff(
        from: SimulationHistoryEntry,
        to: SimulationHistoryEntry
    ): SectionDiff {
        const lines: DiffLine[] = [];
        let lineNumber = 1;
        let hasChanges = false;

        // Compare contract ID
        if (from.contractId !== to.contractId) {
            lines.push({
                type: 'deleted',
                lineNumber: lineNumber++,
                content: `- Contract ID: ${from.contractId}`,
                oldContent: from.contractId,
                severity: 'major',
            });
            lines.push({
                type: 'added',
                lineNumber: lineNumber++,
                content: `+ Contract ID: ${to.contractId}`,
                newContent: to.contractId,
                severity: 'major',
            });
            hasChanges = true;
        } else {
            lines.push({
                type: 'unchanged',
                lineNumber: lineNumber++,
                content: `  Contract ID: ${from.contractId}`,
            });
        }

        // Compare function name
        if (from.functionName !== to.functionName) {
            lines.push({
                type: 'deleted',
                lineNumber: lineNumber++,
                content: `- Function: ${from.functionName}`,
                oldContent: from.functionName,
                severity: 'major',
            });
            lines.push({
                type: 'added',
                lineNumber: lineNumber++,
                content: `+ Function: ${to.functionName}`,
                newContent: to.functionName,
                severity: 'major',
            });
            hasChanges = true;
        } else {
            lines.push({
                type: 'unchanged',
                lineNumber: lineNumber++,
                content: `  Function: ${from.functionName}`,
            });
        }

        // Compare arguments
        if (!this.valuesEqual(from.args, to.args)) {
            lines.push({
                type: 'deleted',
                lineNumber: lineNumber++,
                content: `- Arguments: ${this.formatValue(from.args)}`,
                oldContent: this.formatValue(from.args),
                severity: 'minor',
            });
            lines.push({
                type: 'added',
                lineNumber: lineNumber++,
                content: `+ Arguments: ${this.formatValue(to.args)}`,
                newContent: this.formatValue(to.args),
                severity: 'minor',
            });
            hasChanges = true;
        } else {
            lines.push({
                type: 'unchanged',
                lineNumber: lineNumber++,
                content: `  Arguments: ${this.formatValue(from.args)}`,
            });
        }

        return {
            section: 'parameters',
            hasChanges,
            severity: hasChanges ? 'minor' : 'minor',
            lines,
            summary: hasChanges ? 'Parameters changed' : 'Parameters unchanged',
        };
    }

    /**
     * Export diff in specified format
     */
    public exportDiff(diff: SimulationDiff, options: DiffExportOptions): string {
        switch (options.format) {
            case 'json':
                return this.exportAsJson(diff, options);
            case 'markdown':
                return this.exportAsMarkdown(diff, options);
            case 'html':
                return this.exportAsHtml(diff, options);
            case 'unified':
                return this.exportAsUnified(diff, options);
            default:
                throw new Error(`Unsupported export format: ${options.format}`);
        }
    }

    /**
     * Export as JSON
     */
    private exportAsJson(diff: SimulationDiff, options: DiffExportOptions): string {
        const data = options.includeFullData ? diff : {
            fromId: diff.fromId,
            toId: diff.toId,
            generatedAt: diff.generatedAt,
            overallSeverity: diff.overallSeverity,
            hasChanges: diff.hasChanges,
            summary: diff.summary,
            sections: diff.sections.map(s => ({
                section: s.section,
                hasChanges: s.hasChanges,
                severity: s.severity,
                summary: s.summary,
            })),
        };
        return JSON.stringify(data, null, 2);
    }

    /**
     * Export as Markdown
     */
    private exportAsMarkdown(diff: SimulationDiff, options: DiffExportOptions): string {
        let md = `# Simulation Diff Report\n\n`;
        md += `**From:** ${diff.fromId}\n`;
        md += `**To:** ${diff.toId}\n`;
        md += `**Generated:** ${new Date(diff.generatedAt).toLocaleString()}\n`;
        md += `**Overall Severity:** ${diff.overallSeverity}\n`;
        md += `**Has Changes:** ${diff.hasChanges ? 'Yes' : 'No'}\n\n`;
        md += `## Summary\n\n${diff.summary}\n\n`;

        if (options.viewMode === 'side-by-side') {
            md += this.exportMarkdownSideBySide(diff);
        } else {
            md += this.exportMarkdownUnified(diff);
        }

        return md;
    }

    /**
     * Export as Markdown (unified view)
     */
    private exportMarkdownUnified(diff: SimulationDiff): string {
        let md = '';

        for (const section of diff.sections) {
            md += `## ${this.capitalizeFirst(section.section)}\n\n`;
            md += `**Status:** ${section.hasChanges ? 'Changed' : 'Unchanged'} (${section.severity})\n\n`;
            if (section.summary) {
                md += `*${section.summary}*\n\n`;
            }

            if (section.lines.length > 0) {
                md += '```diff\n';
                for (const line of section.lines) {
                    const prefix =
                        line.type === 'added' ? '+ ' :
                        line.type === 'deleted' ? '- ' :
                        line.type === 'modified' ? '~ ' : '  ';
                    md += `${prefix}${line.content}\n`;
                }
                md += '```\n\n';
            }
        }

        return md;
    }

    /**
     * Export as Markdown (side-by-side view)
     */
    private exportMarkdownSideBySide(diff: SimulationDiff): string {
        let md = '';

        for (const section of diff.sections) {
            md += `## ${this.capitalizeFirst(section.section)}\n\n`;
            md += `| From (${diff.fromId}) | To (${diff.toId}) |\n`;
            md += `|---|---|\n`;

            const oldLines: string[] = [];
            const newLines: string[] = [];

            for (const line of section.lines) {
                if (line.type === 'deleted' || line.type === 'modified') {
                    oldLines.push(line.oldContent || line.content);
                }
                if (line.type === 'added' || line.type === 'modified') {
                    newLines.push(line.newContent || line.content);
                }
                if (line.type === 'unchanged') {
                    oldLines.push(line.content);
                    newLines.push(line.content);
                }
            }

            const maxLines = Math.max(oldLines.length, newLines.length);
            for (let i = 0; i < maxLines; i++) {
                md += `| ${oldLines[i] || ''} | ${newLines[i] || ''} |\n`;
            }

            md += '\n';
        }

        return md;
    }

    /**
     * Export as HTML
     */
    private exportAsHtml(diff: SimulationDiff, options: DiffExportOptions): string {
        const viewMode = options.viewMode || 'unified';
        
        let html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Simulation Diff - ${diff.fromId} vs ${diff.toId}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        h1 { color: #333; border-bottom: 2px solid #007acc; padding-bottom: 10px; }
        h2 { color: #555; margin-top: 30px; border-bottom: 1px solid #ddd; padding-bottom: 8px; }
        .header-info { background: #f8f8f8; padding: 15px; border-radius: 4px; margin: 20px 0; }
        .header-info p { margin: 5px 0; }
        .severity-critical { color: #d32f2f; font-weight: bold; }
        .severity-major { color: #f57c00; font-weight: bold; }
        .severity-minor { color: #388e3c; }
        .diff-line { font-family: 'Courier New', monospace; padding: 4px 8px; margin: 2px 0; }
        .diff-added { background: #e8f5e9; color: #2e7d32; }
        .diff-deleted { background: #ffebee; color: #c62828; }
        .diff-modified { background: #fff3e0; color: #ef6c00; }
        .diff-unchanged { color: #666; }
        .side-by-side { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 10px 0; }
        .side-by-side .side { border: 1px solid #ddd; padding: 10px; border-radius: 4px; }
        .side-by-side .side h3 { margin-top: 0; font-size: 14px; color: #666; }
        .unified { margin: 10px 0; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Simulation Diff Report</h1>
        <div class="header-info">
            <p><strong>From:</strong> ${this.escapeHtml(diff.fromId)}</p>
            <p><strong>To:</strong> ${this.escapeHtml(diff.toId)}</p>
            <p><strong>Generated:</strong> ${new Date(diff.generatedAt).toLocaleString()}</p>
            <p><strong>Overall Severity:</strong> <span class="severity-${diff.overallSeverity}">${diff.overallSeverity}</span></p>
            <p><strong>Has Changes:</strong> ${diff.hasChanges ? 'Yes' : 'No'}</p>
        </div>
        <div class="summary">
            <h2>Summary</h2>
            <p>${this.escapeHtml(diff.summary)}</p>
        </div>`;

        if (viewMode === 'side-by-side') {
            html += this.exportHtmlSideBySide(diff);
        } else {
            html += this.exportHtmlUnified(diff);
        }

        html += `
    </div>
</body>
</html>`;

        return html;
    }

    /**
     * Export HTML unified view
     */
    private exportHtmlUnified(diff: SimulationDiff): string {
        let html = '';

        for (const section of diff.sections) {
            html += `<h2>${this.capitalizeFirst(section.section)}</h2>`;
            html += `<p><strong>Status:</strong> ${section.hasChanges ? 'Changed' : 'Unchanged'} `;
            html += `<span class="severity-${section.severity}">(${section.severity})</span></p>`;
            if (section.summary) {
                html += `<p><em>${this.escapeHtml(section.summary)}</em></p>`;
            }

            html += '<div class="unified">';
            for (const line of section.lines) {
                const cssClass = `diff-${line.type}`;
                html += `<div class="diff-line ${cssClass}">${this.escapeHtml(line.content)}</div>`;
            }
            html += '</div>';
        }

        return html;
    }

    /**
     * Export HTML side-by-side view
     */
    private exportHtmlSideBySide(diff: SimulationDiff): string {
        let html = '';

        for (const section of diff.sections) {
            html += `<h2>${this.capitalizeFirst(section.section)}</h2>`;
            html += '<div class="side-by-side">';
            html += `<div class="side"><h3>From: ${this.escapeHtml(diff.fromId)}</h3>`;
            
            for (const line of section.lines) {
                if (line.type === 'deleted' || line.type === 'modified' || line.type === 'unchanged') {
                    const content = line.oldContent || line.content;
                    const cssClass = line.type === 'deleted' ? 'diff-deleted' : line.type === 'modified' ? 'diff-modified' : 'diff-unchanged';
                    html += `<div class="diff-line ${cssClass}">${this.escapeHtml(content)}</div>`;
                }
            }
            
            html += '</div>';
            html += `<div class="side"><h3>To: ${this.escapeHtml(diff.toId)}</h3>`;
            
            for (const line of section.lines) {
                if (line.type === 'added' || line.type === 'modified' || line.type === 'unchanged') {
                    const content = line.newContent || line.content;
                    const cssClass = line.type === 'added' ? 'diff-added' : line.type === 'modified' ? 'diff-modified' : 'diff-unchanged';
                    html += `<div class="diff-line ${cssClass}">${this.escapeHtml(content)}</div>`;
                }
            }
            
            html += '</div></div>';
        }

        return html;
    }

    /**
     * Export as unified diff format (Git-style)
     */
    private exportAsUnified(diff: SimulationDiff, options: DiffExportOptions): string {
        let output = `diff --git a/${diff.fromId} b/${diff.toId}\n`;
        output += `--- a/${diff.fromId}\n`;
        output += `+++ b/${diff.toId}\n`;

        for (const section of diff.sections) {
            if (!section.hasChanges) continue;

            output += `@@ ${section.section} @@\n`;
            for (const line of section.lines) {
                const prefix =
                    line.type === 'added' ? '+' :
                    line.type === 'deleted' ? '-' :
                    line.type === 'modified' ? '!' : ' ';
                output += `${prefix}${line.content}\n`;
            }
        }

        return output;
    }

    // ── Helper Methods ────────────────────────────────────────────

    /**
     * Get all state changes from a state diff
     */
    private getAllStateChanges(stateDiff?: StateDiff): StateDiffChange[] {
        if (!stateDiff) return [];
        return [
            ...stateDiff.created,
            ...stateDiff.modified,
            ...stateDiff.deleted,
        ];
    }

    /**
     * Determine overall severity from sections
     */
    private determineOverallSeverity(sections: SectionDiff[]): DiffSeverity {
        let maxSeverity: DiffSeverity = 'minor';
        for (const section of sections) {
            if (this.compareSeverity(section.severity, maxSeverity) > 0) {
                maxSeverity = section.severity;
            }
        }
        return maxSeverity;
    }

    /**
     * Compare two severity levels
     */
    private compareSeverity(a: DiffSeverity, b: DiffSeverity): number {
        const order: Record<DiffSeverity, number> = {
            critical: 3,
            major: 2,
            minor: 1,
        };
        return order[a] - order[b];
    }

    /**
     * Generate summary text
     */
    private generateSummary(sections: SectionDiff[], hasChanges: boolean): string {
        if (!hasChanges) {
            return 'No changes detected between simulations';
        }

        const changedSections = sections.filter(s => s.hasChanges);
        const sectionNames = changedSections.map(s => s.section).join(', ');
        return `Changes detected in ${changedSections.length} section(s): ${sectionNames}`;
    }

    /**
     * Format value for display
     */
    private formatValue(value: unknown): string {
        if (value === undefined) return 'undefined';
        if (value === null) return 'null';
        if (typeof value === 'string') return value;
        if (typeof value === 'number') return value.toString();
        if (typeof value === 'boolean') return value.toString();
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }

    /**
     * Check if two values are equal
     */
    private valuesEqual(a: unknown, b: unknown): boolean {
        if (a === b) return true;
        if (a === null || b === null) return false;
        if (a === undefined || b === undefined) return false;
        if (typeof a !== typeof b) return false;

        try {
            return JSON.stringify(a) === JSON.stringify(b);
        } catch {
            return false;
        }
    }

    /**
     * Capitalize first letter
     */
    private capitalizeFirst(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    /**
     * Escape HTML
     */
    private escapeHtml(text: string): string {
        const map: Record<string, string> = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;',
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }
}
