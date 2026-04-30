import * as vscode from "vscode";

export type LogLevel = "off" | "info" | "debug";

export function isEnabled(): boolean {
  return vscode.workspace
    .getConfiguration("thisCode")
    .get<boolean>("enable", false);
}

export function getLogLevel(): LogLevel {
  return vscode.workspace
    .getConfiguration("thisCode")
    .get<LogLevel>("logLevel", "info") as LogLevel;
}
