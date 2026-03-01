import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
const { exec } = require('child_process');

export function activate(context: vscode.ExtensionContext) {
    console.log('Error Sound Extension is now active!');

    let previousErrorCount = 0;
    let isCooldown = false; // 👈 Our new safety lock

    const diagnosticsDisposable = vscode.languages.onDidChangeDiagnostics(e => {
        // 1. Instantly grab the latest settings
        const config = vscode.workspace.getConfiguration('errorSound');
        const isEnabled = config.get<boolean>('enabled');

        // 🚨 If the user turned the extension off in settings, stop immediately!
        if (!isEnabled) return;

        let currentErrorCount = 0;

        vscode.workspace.textDocuments.forEach(doc => {
            const diagnostics = vscode.languages.getDiagnostics(doc.uri);
            const errors = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error);
            currentErrorCount += errors.length;
        });

        // 🚨 Check if there are new errors AND the cooldown is inactive
        if (currentErrorCount > previousErrorCount && !isCooldown) {

            isCooldown = true; // Lock the trigger

            // 1. Grab all the user settings
            const soundSelection = config.get<string>('soundSelection') || 'Mistake';
            const customSoundPath = config.get<string>('customSoundPath') || '';
            const messageSelection = config.get<string>('messageSelection') || 'None';
            const customMessageText = config.get<string>('customMessageText') || '';
            const cooldownSeconds = config.get<number>('cooldown') || 3;

            // 2. Figure out WHICH TEXT to show
            let textToShow = "";
            if (messageSelection === "Custom") {
                textToShow = customMessageText;
            } else if (messageSelection !== "None") {
                textToShow = messageSelection;
            }

            // Show the pop-up message (if one is set)
            if (textToShow !== "") {
                vscode.window.showErrorMessage(textToShow);
            }

            // 3. Figure out WHICH SOUND to play
            let soundToPlay = "";
            if (soundSelection === "Custom") {
                if (customSoundPath && fs.existsSync(customSoundPath)) {
                    soundToPlay = customSoundPath;
                } else {
                    console.error('Custom sound not found! Falling back to default.');
                    soundToPlay = path.join(context.extensionPath, 'sounds', 'mistake.mp3');
                }
            } else {
                // Automatically match the dropdown name to the file name (e.g., "Buzzer" -> "buzzer.mp3")
                const fileName = soundSelection.toLowerCase() + '.mp3';
                soundToPlay = path.join(context.extensionPath, 'sounds', fileName);
            }

            // 4. Play the sound!
            if (fs.existsSync(soundToPlay)) {
                const command = `powershell -WindowStyle Hidden -Command "Add-Type -AssemblyName PresentationCore; $player = New-Object System.Windows.Media.MediaPlayer; $player.Open('${soundToPlay}'); $player.Play(); Start-Sleep -Seconds 5"`;

                exec(command, (error: any) => {
                    if (error) console.error("PowerShell Error:", error);
                });
            } else {
                console.error("Audio file completely missing:", soundToPlay);
            }

            // 5. Unlock the trigger after the cooldown
            setTimeout(() => {
                isCooldown = false;
            }, cooldownSeconds * 1000);
        }

        previousErrorCount = currentErrorCount;
    });

    context.subscriptions.push(diagnosticsDisposable);
}

export function deactivate() { }