// src/services/formTemplateService.ts
import * as vscode from "vscode";
import { FormTemplate, FormTemplateFilter } from "../types/formTemplate";

const TEMPLATES_STATE_KEY = "stellarSuite.formTemplates";

export class FormTemplateService {
  private _workspaceState: vscode.Memento;

  constructor(context: vscode.ExtensionContext) {
    this._workspaceState = context.workspaceState;
  }

  /**
   * Retrieve all saved templates, optionally filtering by contract/function/category.
   */
  public getTemplates(filter?: FormTemplateFilter): FormTemplate[] {
    const allTemplates = this._workspaceState.get<FormTemplate[]>(
      TEMPLATES_STATE_KEY,
      [],
    );

    if (!filter) {
      return allTemplates;
    }

    return allTemplates.filter((t) => {
      if (filter.contractId && t.contractId !== filter.contractId) {
        return false;
      }
      if (filter.functionName && t.functionName !== filter.functionName) {
        return false;
      }
      if (filter.category && t.category !== filter.category) {
        return false;
      }
      return true;
    });
  }

  /**
   * Save a new form template. Will generate an ID and timestamps automatically.
   */
  public saveTemplate(
    templateData: Omit<FormTemplate, "id" | "createdAt" | "updatedAt">,
  ): FormTemplate {
    const templates = this.getTemplates();
    const now = Date.now();
    const simpleId =
      now.toString(36) + Math.random().toString(36).substring(2, 9);

    const newTemplate: FormTemplate = {
      ...templateData,
      id: simpleId,
      createdAt: now,
      updatedAt: now,
    };

    templates.push(newTemplate);
    this._workspaceState.update(TEMPLATES_STATE_KEY, templates);

    return newTemplate;
  }

  /**
   * Update an existing form template by ID.
   */
  public updateTemplate(
    id: string,
    updates: Partial<FormTemplate>,
  ): FormTemplate | undefined {
    const templates = this.getTemplates();
    const idx = templates.findIndex((t) => t.id === id);

    if (idx === -1) {
      return undefined;
    }

    templates[idx] = {
      ...templates[idx],
      ...updates,
      updatedAt: Date.now(),
    };

    this._workspaceState.update(TEMPLATES_STATE_KEY, templates);
    return templates[idx];
  }

  /**
   * Delete a template by ID.
   */
  public deleteTemplate(id: string): void {
    const templates = this.getTemplates();
    const filtered = templates.filter((t) => t.id !== id);
    this._workspaceState.update(TEMPLATES_STATE_KEY, filtered);
  }

  /**
   * Clear all saved templates (useful for resetting/tests).
   */
  public clearTemplates(): void {
    this._workspaceState.update(TEMPLATES_STATE_KEY, undefined);
  }
}
