import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
const { exec } = require('child_process');

export function activate(context: vscode.ExtensionContext) {
    console.log('Error Sound Extension is now active!');

    let previousErrorCount = 0;
    let isCooldown = false; 
    let totalSessionMistakes = 0;
    
    // Status Bar UI
    const mistakeCounterUI = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    mistakeCounterUI.text = `🦆 Mistakes: 0`;
    mistakeCounterUI.tooltip = "Total syntax errors made this session";
    mistakeCounterUI.show(); 
    context.subscriptions.push(mistakeCounterUI);

    // 🚨 NEW LOGIC: The 2-Second Grace Period 🚨
    let typingTimer: NodeJS.Timeout | undefined;
    let isTyping = false;

    // First, silently count any errors that already exist when the editor opens 
    // (so it doesn't honk at you immediately on startup)
    vscode.workspace.textDocuments.forEach(doc => {
        const diagnostics = vscode.languages.getDiagnostics(doc.uri);
        const errors = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error);
        previousErrorCount += errors.length;
    });

    // 1. Listen for EVERY keystroke
    const textDocumentDisposable = vscode.workspace.onDidChangeTextDocument(e => {
        isTyping = true; // Tell the brain we are actively typing
        
        // Clear the existing stopwatch if they keep typing
        if (typingTimer) {
            clearTimeout(typingTimer);
        }
        
        // Set a new stopwatch for 2 seconds (2000 milliseconds)
        typingTimer = setTimeout(() => {
            isTyping = false; // We stopped typing!
            evaluateDiagnostics(); // Now judge the code.
        }, 2000);
    });
    context.subscriptions.push(textDocumentDisposable);

    // 2. Listen for slow background linters
    const diagnosticsDisposable = vscode.languages.onDidChangeDiagnostics(e => {
        // ONLY check for errors if the user's hands are off the keyboard!
        if (!isTyping) {
            evaluateDiagnostics();
        }
    });
    context.subscriptions.push(diagnosticsDisposable);

    // 3. The Judgment Function (Extracted from your old code)
    function evaluateDiagnostics() {
        const config = vscode.workspace.getConfiguration('errorSound');
        const isEnabled = config.get<boolean>('enabled');
        
        if (!isEnabled) return; 

        let currentErrorCount = 0;
        
        vscode.workspace.textDocuments.forEach(doc => {
            const diagnostics = vscode.languages.getDiagnostics(doc.uri);
            const errors = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error);
            currentErrorCount += errors.length;
        });

        // Did errors go up, and are we allowed to play a sound?
        if (currentErrorCount > previousErrorCount && !isCooldown) {
            isCooldown = true; 

            totalSessionMistakes++; 
            mistakeCounterUI.text = `🦆 Mistakes: ${totalSessionMistakes}`; 

            const soundSelection = config.get<string>('soundSelection') || 'Mistake';
            const customSoundPath = config.get<string>('customSoundPath') || '';
            const messageSelection = config.get<string>('messageSelection') || 'None';
            const customMessageText = config.get<string>('customMessageText') || '';
            const cooldownSeconds = config.get<number>('cooldown') || 3;

            let textToShow = "";
            if (messageSelection === "Custom") {
                textToShow = customMessageText;
            } else if (messageSelection !== "None") {
                textToShow = messageSelection;
            }

            if (textToShow !== "") {
                vscode.window.showErrorMessage(textToShow);
            }

            let soundToPlay = "";
            if (soundSelection === "Custom") {
                if (customSoundPath && fs.existsSync(customSoundPath)) {
                    soundToPlay = customSoundPath;
                } else {
                    soundToPlay = path.join(context.extensionPath, 'sounds', 'mistake.mp3');
                }
            } else {
                const fileName = soundSelection.toLowerCase() + '.mp3';
                soundToPlay = path.join(context.extensionPath, 'sounds', fileName);
            }
            
            if (fs.existsSync(soundToPlay)) {
                const command = `powershell -WindowStyle Hidden -Command "Add-Type -AssemblyName PresentationCore; $player = New-Object System.Windows.Media.MediaPlayer; $player.Open('${soundToPlay}'); $player.Play(); Start-Sleep -Seconds 5"`;
                exec(command, (error: any) => {
                    if (error) console.error("PowerShell Error:", error);
                });
            }

            setTimeout(() => {
                isCooldown = false;
            }, cooldownSeconds * 1000);
        }
        
        // Update the count (whether it went up or down)
        previousErrorCount = currentErrorCount;
    }
}

export function deactivate() {}