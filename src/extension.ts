import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec, execSync, ChildProcess } from 'child_process';
export function activate(context: vscode.ExtensionContext) {
    console.log('Error Sound Extension is now active!');

    let previousErrorCount = 0;
    let previousWarningCount = 0;
    let isCooldown = false;
    let totalSessionMistakes = 0;

    // 🦆 Status Bar UI
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

    // Initial count of errors and warnings
    vscode.workspace.textDocuments.forEach(doc => {
        const diagnostics = vscode.languages.getDiagnostics(doc.uri);
        previousErrorCount += diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error).length;
        previousWarningCount += diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Warning).length;
    });

    // Debounce: Wait for the user to stop typing for 2 seconds
    const textDocumentDisposable = vscode.workspace.onDidChangeTextDocument(e => {
        isTyping = true;
        if (typingTimer) clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
            isTyping = false;
            evaluateDiagnostics();
        }, 2000);
    });
    context.subscriptions.push(textDocumentDisposable);

    // Only evaluate diagnostics if the user isn't actively typing
    const diagnosticsDisposable = vscode.languages.onDidChangeDiagnostics(e => {
        if (!isTyping) evaluateDiagnostics();
    });
    context.subscriptions.push(diagnosticsDisposable);

    function evaluateDiagnostics() {
        const config = vscode.workspace.getConfiguration('errorSound');
        const isEnabled = config.get<boolean>('enabled');
        const playForWarnings = config.get<boolean>('playForWarnings') || false;

        // 🚨 GET THE THEME 🚨
        const theme = config.get<string>('theme') || 'Default';
        // If Default, look in the root folder. Otherwise, look in the subfolder.
        const themeFolder = theme === 'Default' ? '' : theme.toLowerCase();
        // Add this line to spy on the extension!
        console.log(`Current Theme: ${theme} | Looking in folder: sounds/${themeFolder}`);

        // 🚨 NIGHTTIME MODE SETTINGS 🚨
        const enableQuietHours = config.get<boolean>('enableQuietHours') || false;
        const quietHourStart = config.get<number>('quietHourStart') || 23;
        const quietHourEnd = config.get<number>('quietHourEnd') || 7;

        if (!isEnabled) return;

        // 🚨 NIGHTTIME MODE LOGIC: Check if we are currently in Quiet Hours
        let isMuted = false;
        if (enableQuietHours) {
            const currentHour = new Date().getHours(); // Gets the hour in 24hr format (0-23)

            if (quietHourStart < quietHourEnd) {
                // Example: 1 AM to 6 AM
                isMuted = currentHour >= quietHourStart && currentHour < quietHourEnd;
            } else {
                // Example: 11 PM to 7 AM (Wraps across midnight)
                isMuted = currentHour >= quietHourStart || currentHour < quietHourEnd;
            }
        }

        let currentErrorCount = 0;
        let currentWarningCount = 0;

        vscode.workspace.textDocuments.forEach(doc => {
            const diagnostics = vscode.languages.getDiagnostics(doc.uri);
            currentErrorCount += diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error).length;
            currentWarningCount += diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Warning).length;
        });

        // 🚨 FIX 2: The Linter Bypass (Regex Counter)
        const cursedTypos = config.get<string[]>('cursedTypos') || [];
        let totalCursedTypos = 0;

        vscode.workspace.textDocuments.forEach(doc => {
            const text = doc.getText();
            cursedTypos.forEach(typo => {
                // Use a global, case-insensitive regex to count exact occurrences
                const regex = new RegExp(typo, 'gi');
                const matches = text.match(regex);

                if (matches) {
                    totalCursedTypos += matches.length;
                }
            });
        });

        // Add the total number of cursed typos directly to our error count!
        currentErrorCount += totalCursedTypos;

        // 🚨 TIER 1: Hard Errors
        if (currentErrorCount > previousErrorCount && !isCooldown) {
            isCooldown = true;
            totalSessionMistakes++;
            mistakeCounterUI.text = `🦆 Mistakes: ${totalSessionMistakes}`;

            // Killstreak tracking
            const now = Date.now();
            if (now - lastMistakeTime <= STREAK_TIME_LIMIT) {
                currentStreak++;
            } else {
                currentStreak = 1;
            }
            lastMistakeTime = now;

            const config = vscode.workspace.getConfiguration('errorSound');
            const soundSelection = config.get<string>('soundSelection') || 'Mistake';
            const customSoundPath = config.get<string>('customSoundPath') || '';
            const messageSelection = config.get<string>('messageSelection') || 'None';
            const cooldownSeconds = config.get<number>('cooldown') || 3;
            const enableGitBlame = config.get<boolean>('enableGitBlame') || false;

            let textToShow = "";
            let soundFileName = soundSelection.toLowerCase() + '.mp3';

            // 🕵️‍♂️ GIT BLAME LOGIC: Find out who wrote this line!
            let culpritName = "";
            if (enableGitBlame) {
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);
                    const errors = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error);

                    if (errors.length > 0) {
                        // Get the exact line number of the first error (Git is 1-indexed, VS Code is 0-indexed)
                        const errorLine = errors[0].range.start.line + 1;
                        const filePath = editor.document.uri.fsPath;

                        try {
                            // Run a silent, instant Git command to check that specific line
                            const blameOutput = execSync(`git blame -p -L ${errorLine},${errorLine} "${filePath}"`, { encoding: 'utf8', stdio: 'pipe' });

                            // Use Regex to extract the author's name from the Git output
                            const authorMatch = blameOutput.match(/^author (.*)$/m);
                            if (authorMatch) {
                                culpritName = authorMatch[1].trim();
                            }
                        } catch (err) {
                            // Silently fail if this file isn't in a Git repository
                        }
                    }
                }
            }

            // 1. Check Git Blame First! (Highest Priority Override)
            if (culpritName && culpritName !== "Not Committed Yet") {
                textToShow = `🚨 Hey! ${culpritName} wrote this broken code! 🚨`;
            }
            // 2. Then check for Killstreaks
            else if (currentStreak === 3) {
                textToShow = "🔥 TRIPLE KILL! 3 mistakes in 30 seconds! 🔥";
                soundFileName = "triplekill.mp3";
            } else if (currentStreak >= 5) {
                textToShow = "💀 RAMPAGE! Someone take their keyboard away! 💀";
                soundFileName = "rampage.mp3";
            }
            // 3. No Killstreak or Blame? Check the Language! (Easter Eggs)
            else {
                const currentLanguage = vscode.window.activeTextEditor?.document.languageId;

                if (currentLanguage === 'python') {
                    soundFileName = 'snake.mp3';
                    if (messageSelection !== "None") textToShow = "🐍 Ssssyntax Error! Did you forget a colon? 🐍";
                }
                else if (currentLanguage === 'cpp' || currentLanguage === 'c') {
                    soundFileName = 'explosion.mp3';
                    if (messageSelection !== "None") textToShow = "💥 Brace for Segmentation Fault! 💥";
                }
                else if (currentLanguage === 'html') {
                    if (messageSelection !== "None") textToShow = "🌐 HTML isn't even a real programming language! 🌐";
                }
                // 4. Normal Fallback
                else {
                    if (messageSelection === "Custom") textToShow = config.get<string>('customMessageText') || '';
                    else if (messageSelection !== "None") textToShow = messageSelection;
                }
            }

            if (textToShow !== "") vscode.window.showErrorMessage(textToShow);

            let soundToPlay = "";
            if (soundSelection === "Custom" && currentStreak < 3) {
                if (customSoundPath && fs.existsSync(customSoundPath)) soundToPlay = customSoundPath;
                else soundToPlay = path.join(context.extensionPath, 'sounds', 'mistake.mp3');
            } else {
                // 1. First, try to find the sound inside the selected Theme folder!
                soundToPlay = path.join(context.extensionPath, 'sounds', themeFolder, soundFileName);

                // 🕵️‍♂️ THE ULTIMATE SPY LOG: See exactly what path it is checking
                console.log(`Attempting to find: ${soundToPlay}`);
                console.log(`File actually exists here: ${fs.existsSync(soundToPlay)}`);

                
                // 2. Failsafe: If the theme folder doesn't have this specific file, fall back to the Default folder
                if (!fs.existsSync(soundToPlay)) {
                    soundToPlay = path.join(context.extensionPath, 'sounds', soundFileName);
                }

                // 3. Double Failsafe: If it's completely missing, use the default mistake sound
                if (!fs.existsSync(soundToPlay)) {
                    soundToPlay = path.join(context.extensionPath, 'sounds', 'mistake.mp3');
                }
            }

            if (!isMuted) {
                playSound(soundToPlay);
            } else {
                mistakeCounterUI.text = `🦆 Mistakes: ${totalSessionMistakes} 🔇`;
            }

            setTimeout(() => { isCooldown = false; }, cooldownSeconds * 1000);
        }
        // 🚨 TIER 2: Gentle Warnings
        else if (playForWarnings && currentWarningCount > previousWarningCount && !isCooldown) {
            isCooldown = true;

            // Check the theme folder for a custom warning sound first
            let warningSound = path.join(context.extensionPath, 'sounds', themeFolder, 'warning.mp3');
            if (!fs.existsSync(warningSound)) {
                warningSound = path.join(context.extensionPath, 'sounds', 'warning.mp3'); // Fallback
            }

            if (!isMuted) {
                playSound(warningSound);
            }
            setTimeout(() => { isCooldown = false; }, 1000);
        }

        previousErrorCount = currentErrorCount;
        previousWarningCount = currentWarningCount;
    }

    // 🚨 FIX 1: The Zombie Killer Variable
    let activeAudioProcess: ChildProcess | null = null;

    function playSound(soundPath: string) {
        if (!fs.existsSync(soundPath)) {
            console.error("Audio file completely missing:", soundPath);
            return;
        }

        let command = '';
        const platform = process.platform;

        if (platform === 'win32') {
            command = `powershell -WindowStyle Hidden -Command "Add-Type -AssemblyName PresentationCore; $player = New-Object System.Windows.Media.MediaPlayer; $player.Open('${soundPath}'); $player.Play(); Start-Sleep -Seconds 5"`;
        } else if (platform === 'darwin') {
            command = `afplay "${soundPath}"`;
        } else if (platform === 'linux') {
            command = `paplay "${soundPath}" || mpg123 "${soundPath}" || ffplay -nodisp -autoexit "${soundPath}"`;
        } else {
            return;
        }

        // If a sound is already playing (or sleeping), KILL IT!
        if (activeAudioProcess) {
            activeAudioProcess.kill();
        }

        // Spawn the new process and save it to our tracker
        activeAudioProcess = exec(command, (error: any) => {
            if (error && platform === 'win32' && !error.killed) {
                console.error("PowerShell Error:", error);
            }
        });
    }
}

export function deactivate() { }