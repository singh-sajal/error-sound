import * as vscode from 'vscode';
import * as path from 'path';
const { exec } = require('child_process');

export function activate(context: vscode.ExtensionContext) {
    console.log('Error Sound Extension is now active!');

    let previousErrorCount = 0;

    const diagnosticsDisposable = vscode.languages.onDidChangeDiagnostics(e => {
        let currentErrorCount = 0;

        vscode.workspace.textDocuments.forEach(doc => {
            const diagnostics = vscode.languages.getDiagnostics(doc.uri);
            const errors = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error);
            currentErrorCount += errors.length;
        });

        // If the tripwire is crossed!
        if (currentErrorCount > previousErrorCount) {
            const soundPath = path.join(context.extensionPath, 'sounds', 'mistake.mp3');

            // 🚨 NEW DEBUG LOGS 🚨
            console.log('-----------------------------------');
            console.log('🚨 MISTAKE DETECTED! 🚨');
            console.log(`Errors went from ${previousErrorCount} to ${currentErrorCount}`);
            console.log(`Attempting to play audio file at: ${soundPath}`);
            console.log('-----------------------------------');

            // The Nuclear Option: Uses core Windows UI libraries to force audio playback
            const command = `powershell -WindowStyle Hidden -Command "Add-Type -AssemblyName PresentationCore; $player = New-Object System.Windows.Media.MediaPlayer; $player.Open('${soundPath}'); $player.Play(); Start-Sleep -Seconds 5"`;
            
            exec(command, (error: any, stdout: any, stderr: any) => {
                if (error) console.error("PowerShell Error:", error);
                if (stderr) console.error("PowerShell Stderr:", stderr);
            });
        }

        previousErrorCount = currentErrorCount;
    });

    context.subscriptions.push(diagnosticsDisposable);
}

export function deactivate() { }