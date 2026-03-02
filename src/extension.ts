import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
const { exec } = require('child_process');

export function activate(context: vscode.ExtensionContext) {
    console.log('Error Sound Extension is now active!');

    let previousErrorCount = 0;
    let previousWarningCount = 0; // 🚨 Track warnings now!
    let isCooldown = false; 
    let totalSessionMistakes = 0;
    
    // Status Bar UI
    const mistakeCounterUI = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    mistakeCounterUI.text = `🦆 Mistakes: 0`;
    mistakeCounterUI.tooltip = "Total syntax errors made this session";
    mistakeCounterUI.show(); 
    context.subscriptions.push(mistakeCounterUI);

    let typingTimer: NodeJS.Timeout | undefined;
    let isTyping = false;
    let currentStreak = 0;
    let lastMistakeTime = 0;
    const STREAK_TIME_LIMIT = 30000;

    // Initial count of existing errors AND warnings
    vscode.workspace.textDocuments.forEach(doc => {
        const diagnostics = vscode.languages.getDiagnostics(doc.uri);
        previousErrorCount += diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error).length;
        previousWarningCount += diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Warning).length;
    });

    const textDocumentDisposable = vscode.workspace.onDidChangeTextDocument(e => {
        isTyping = true; 
        if (typingTimer) clearTimeout(typingTimer);
        
        typingTimer = setTimeout(() => {
            isTyping = false; 
            evaluateDiagnostics(); 
        }, 2000);
    });
    context.subscriptions.push(textDocumentDisposable);

    const diagnosticsDisposable = vscode.languages.onDidChangeDiagnostics(e => {
        if (!isTyping) evaluateDiagnostics();
    });
    context.subscriptions.push(diagnosticsDisposable);

    function evaluateDiagnostics() {
        const config = vscode.workspace.getConfiguration('errorSound');
        const isEnabled = config.get<boolean>('enabled');
        const playForWarnings = config.get<boolean>('playForWarnings') || false;
        
        if (!isEnabled) return; 

        let currentErrorCount = 0;
        let currentWarningCount = 0;
        
        vscode.workspace.textDocuments.forEach(doc => {
            const diagnostics = vscode.languages.getDiagnostics(doc.uri);
            currentErrorCount += diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error).length;
            currentWarningCount += diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Warning).length;
        });

        // 🚨 TIER 1: Hard Errors (Prioritized over warnings)
        if (currentErrorCount > previousErrorCount && !isCooldown) {
            isCooldown = true; 
            totalSessionMistakes++; 
            mistakeCounterUI.text = `🦆 Mistakes: ${totalSessionMistakes}`; 

            const now = Date.now();
            if (now - lastMistakeTime <= STREAK_TIME_LIMIT) {
                currentStreak++;
            } else {
                currentStreak = 1;
            }
            lastMistakeTime = now;

            const soundSelection = config.get<string>('soundSelection') || 'Mistake';
            const customSoundPath = config.get<string>('customSoundPath') || '';
            const messageSelection = config.get<string>('messageSelection') || 'None';
            const customMessageText = config.get<string>('customMessageText') || '';
            const cooldownSeconds = config.get<number>('cooldown') || 3;

            let textToShow = "";
            let soundFileName = soundSelection.toLowerCase() + '.mp3';

            if (currentStreak === 3) {
                textToShow = "🔥 TRIPLE KILL! 3 mistakes in 30 seconds! 🔥";
                soundFileName = "triplekill.mp3";
            } else if (currentStreak >= 5) {
                textToShow = "💀 RAMPAGE! Someone take their keyboard away! 💀";
                soundFileName = "rampage.mp3";
            } else {
                if (messageSelection === "Custom") textToShow = customMessageText;
                else if (messageSelection !== "None") textToShow = messageSelection;
            }

            if (textToShow !== "") vscode.window.showErrorMessage(textToShow);

            let soundToPlay = "";
            if (soundSelection === "Custom" && currentStreak < 3) {
                if (customSoundPath && fs.existsSync(customSoundPath)) soundToPlay = customSoundPath;
                else soundToPlay = path.join(context.extensionPath, 'sounds', 'mistake.mp3');
            } else {
                soundToPlay = path.join(context.extensionPath, 'sounds', soundFileName);
                if (!fs.existsSync(soundToPlay)) soundToPlay = path.join(context.extensionPath, 'sounds', 'mistake.mp3');
            }
            
            playSound(soundToPlay);

            setTimeout(() => { isCooldown = false; }, cooldownSeconds * 1000);
        }
        // 🚨 TIER 2: Gentle Warnings (Only plays if no hard errors just occurred)
        else if (playForWarnings && currentWarningCount > previousWarningCount && !isCooldown) {
            isCooldown = true;
            
            const warningSound = path.join(context.extensionPath, 'sounds', 'warning.mp3');
            playSound(warningSound);

            // Warnings have a shorter, fixed 1-second cooldown so they don't block errors for long
            setTimeout(() => { isCooldown = false; }, 1000);
        }
        
        previousErrorCount = currentErrorCount;
        previousWarningCount = currentWarningCount;
    }

    // Helper function to keep our code clean
    function playSound(soundPath: string) {
        if (fs.existsSync(soundPath)) {
            const command = `powershell -WindowStyle Hidden -Command "Add-Type -AssemblyName PresentationCore; $player = New-Object System.Windows.Media.MediaPlayer; $player.Open('${soundPath}'); $player.Play(); Start-Sleep -Seconds 5"`;
            exec(command, (error: any) => {
                if (error) console.error("PowerShell Error:", error);
            });
        }
    }
}

export function deactivate() {}