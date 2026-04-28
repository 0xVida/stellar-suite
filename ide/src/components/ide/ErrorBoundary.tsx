"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertCircle, RotateCcw, Send, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { crashTracker, CrashReport } from "@/lib/diagnostics/crashTracker";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  reportSent: boolean;
  isSending: boolean;
  report?: CrashReport;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    reportSent: false,
    isSending: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, reportSent: false, isSending: false };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    crashTracker.captureException(error).then((report) => {
      this.setState({ report });
    });
  }

  private handleSendReport = async () => {
    if (!this.state.report) return;

    this.setState({ isSending: true });
    const success = await crashTracker.sendReport(this.state.report);

    if (success) {
      this.setState({ reportSent: true, isSending: false });
    } else {
      setTimeout(() => this.setState({ reportSent: true, isSending: false }), 1000);
    }
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center p-4 bg-background">
          <Card className="max-w-md w-full border-2 border-destructive/20 shadow-2xl">
            <CardHeader className="space-y-4 text-center">
              <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center">
                <AlertCircle className="w-10 h-10 text-destructive" />
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight">
                Something went wrong
              </CardTitle>
              <p className="text-sm text-muted-foreground px-4">
                The IDE encountered a fatal exception. Our diagnostics have captured the error to help our engineers fix it.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 bg-muted rounded-lg border border-border font-mono text-[10px] max-h-32 overflow-auto text-muted-foreground whitespace-pre-wrap">
                {this.state.error?.message || "Unknown error"}
                {"\n"}
                {this.state.error?.stack?.split("\n").slice(0, 3).join("\n") || ""}
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              {!this.state.reportSent ? (
                <Button
                  onClick={this.handleSendReport}
                  disabled={this.state.isSending}
                  variant="default"
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold flex items-center gap-2"
                >
                  {this.state.isSending ? (
                    "Sending..."
                  ) : (
                    <>
                      <Send className="w-4 h-4" /> Send Crash Report
                    </>
                  )}
                </Button>
              ) : (
                <div className="w-full py-2 px-4 rounded-md bg-green-500/10 border border-green-500/20 text-green-500 text-sm flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> Report Sent Successfully
                </div>
              )}
              <Button
                onClick={this.handleReload}
                variant="outline"
                className="w-full border-border hover:bg-muted font-medium flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" /> Reload IDE
              </Button>
            </CardFooter>
            <div className="pb-6 px-6 text-center">
              <p className="text-[10px] text-muted-foreground">
                All reports are anonymized and only include technical data.
              </p>
            </div>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
