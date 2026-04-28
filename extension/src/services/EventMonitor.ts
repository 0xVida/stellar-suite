import * as vscode from 'vscode';

export interface SorobanEvent {
    id: string;
    type: string;
    contractId: string;
    timestamp: string;
    data: any;
}

export class EventMonitor {
    private outputChannel: vscode.OutputChannel;
    private isMonitoring: boolean = false;
    private filterContractId: string | null = null;
    private filterType: string | null = null;
    private mockInterval: NodeJS.Timeout | null = null;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Soroban Events');
    }

    public startMonitoring() {
        if (this.isMonitoring) return;
        this.isMonitoring = true;
        this.outputChannel.show(true);
        this.logMessage('Started monitoring Soroban contract events...', 'INFO');

        // Connect to RPC event stream (mocked for now)
        this.connectToEventStream();
    }

    public stopMonitoring() {
        this.isMonitoring = false;
        if (this.mockInterval) {
            clearInterval(this.mockInterval);
        }
        this.logMessage('Stopped monitoring Soroban contract events.', 'INFO');
    }

    public setFilters(contractId?: string, type?: string) {
        this.filterContractId = contractId || null;
        this.filterType = type || null;
        this.logMessage(`Filters updated: ContractId=${contractId || 'None'}, Type=${type || 'None'}`, 'INFO');
    }

    private connectToEventStream() {
        // Simulating RPC event stream updates
        this.mockInterval = setInterval(() => {
            const mockEvent: SorobanEvent = {
                id: Math.random().toString(36).substring(7),
                type: ['transfer', 'mint', 'burn', 'invoke'][Math.floor(Math.random() * 4)],
                contractId: ['C123...', 'C456...', 'C789...'][Math.floor(Math.random() * 3)],
                timestamp: new Date().toISOString(),
                data: { amount: Math.floor(Math.random() * 1000) }
            };
            this.handleEvent(mockEvent);
        }, 5000);
    }

    private handleEvent(event: SorobanEvent) {
        if (this.filterContractId && event.contractId !== this.filterContractId) return;
        if (this.filterType && event.type !== this.filterType) return;

        const formattedLog = `[${event.timestamp}] [${event.type.toUpperCase()}] Contract: ${event.contractId} | EventID: ${event.id}\nData: ${JSON.stringify(event.data, null, 2)}\n---`;
        this.outputChannel.appendLine(formattedLog);
    }

    private logMessage(message: string, level: string = 'INFO') {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] [${level}] ${message}`);
    }

    public dispose() {
        this.stopMonitoring();
        this.outputChannel.dispose();
    }
}
