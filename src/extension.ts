import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
const { exec } = require('child_process');

export function activate(context: vscode.ExtensionContext) {
    console.log('Error Sound Extension is now active!');

    let previousErrorCount = 0;
    let isCooldown = false; // 👈 Our new safety lock

    const diagnosticsDisposable = vscode.languages.onDidChangeDiagnostics(e => {
        let currentErrorCount = 0;

        vscode.workspace.textDocuments.forEach(doc => {
            const diagnostics = vscode.languages.getDiagnostics(doc.uri);
            const errors = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error);
            currentErrorCount += errors.length;
        });

        // 🚨 Check if there are new errors AND the cooldown is inactive
        if (currentErrorCount > previousErrorCount && !isCooldown) {

            isCooldown = true; // Lock the trigger

            // 1. Grab the user's custom settings
            const config = vscode.workspace.getConfiguration('errorSound');
            const customSound = config.get<string>('customSoundPath');

            // 2. Default to your built-in sound
            let soundToPlay = path.join(context.extensionPath, 'sounds', 'mistake.mp3');

            // 3. If they provided a custom path, and that file actually exists, use it!
            if (customSound && customSound.trim() !== '') {
                if (fs.existsSync(customSound)) {
                    soundToPlay = customSound;
                    console.log('Playing custom user sound:', soundToPlay);
                } else {
                    console.error('Custom sound file not found! Falling back to default.');
                }
            } else {
                console.log('Playing default sound:', soundToPlay);
            }

            // 4. Play whatever sound we decided on
            const command = `powershell -WindowStyle Hidden -Command "Add-Type -AssemblyName PresentationCore; $player = New-Object System.Windows.Media.MediaPlayer; $player.Open('${soundToPlay}'); $player.Play(); Start-Sleep -Seconds 5"`;

            exec(command, (error: any) => {
                if (error) console.error("PowerShell Error:", error);
            });

            // Unlock the trigger after 3 seconds
            setTimeout(() => {
                isCooldown = false;
            }, 3000);
        }

        previousErrorCount = currentErrorCount;
    });

    context.subscriptions.push(diagnosticsDisposable);
}

export function deactivate() { }