'use strict';
import 'moment-duration-format';
import { StatusBarAlignment, StatusBarItem, window, workspace } from 'vscode';
import { TimeInterval } from './interfaces';
import { YearStorage } from './YearStorage';
import * as vscode from 'vscode';
import { LogWebView } from './LogWebView';
import { timeFormat } from './TimeFormat';
import * as Git from './@types/git';
import { LogsEditorWebView } from './LogsEditorWebView';

export const WORKSPACE_NAME_DELIMITER = "; ";

export class TimeTracker {

    private readonly MILISECONDS_IN_MINUTE = 60000;
    _statusBarItem: StatusBarItem;
    _context: vscode.ExtensionContext;
    _invervalId: NodeJS.Timer;
    _currentTimeInterval: TimeInterval = null;
    _storage: YearStorage = null;
    _config = workspace.getConfiguration('time-tracker');
    _startAppIntervals: TimeInterval[] = [];
    _isStopped: boolean = false;
    _stopStartAt: number;
    _simpleGit: any;
    _gitAPI: Git.API;
    _lastBranchName: string;
    _gotOnRepositoryDidChangeSubscribes: vscode.Disposable[] = [];

    constructor(context: vscode.ExtensionContext) {

        this._context = context;
        this._gitAPI = vscode.extensions.getExtension('vscode.git').exports.getAPI(1);

        this._storage = new YearStorage(this._context);
        this.initGit();

        this.startCurrentTimeInterval();
        this.createStatusBars();

        this.createInterval();

        vscode.commands.registerCommand('extension.clearAllData', () => this.clearAllData());
        vscode.commands.registerCommand('extension.toggleStop', () => this.toggleStop());
        vscode.commands.registerCommand('extension.showLog', () => this.showLogWebView());
        vscode.commands.registerCommand('extension.exportLog', () => this.exportLog());
        vscode.commands.registerCommand('extension.editLog', () => this.editLog());
        vscode.commands.registerCommand('extension.showDataFile', () => {
            vscode.workspace.openTextDocument(this._storage._globalStoragePath).then(doc => vscode.window.showTextDocument(doc))
            vscode.window.showInformationMessage(this._storage._globalStoragePath);
        });

        this.recomputeStatusBar();
        this.initEventsHandlers();
    }

    private initEventsHandlers() {
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            this.workspaceChanged();
        })

        vscode.workspace.onDidChangeConfiguration(() => {
            this.configurationChanged();
        })
    }

    private initGit() {
        const onDidOpenRepositorySubs = this._gitAPI.onDidOpenRepository(rep => {
            this._gotOnRepositoryDidChangeSubscribes.forEach(x => x.dispose());
            this._gitAPI.repositories.forEach(rep => {
                const subscribe = rep.state.onDidChange(() => {

                    if (rep.state.HEAD && rep.state.HEAD.name && this._lastBranchName != rep.state.HEAD.name) {
                        this._lastBranchName = rep.state.HEAD.name;

                        if (this._config.trackGitBranch) {
                            console.log("calling workspace changed");
                            console.log(rep.state.HEAD.name);
                            this.gitBranchChanged();
                        }
                    }
                });

                this._gotOnRepositoryDidChangeSubscribes.push(subscribe);
            });

            const currentBranchName = this.getGitBranchName();
            if (this._config.trackGitBranch && currentBranchName != this._lastBranchName) {
                console.log("calling workspace changed");
                this.gitBranchChanged();

                this._lastBranchName = currentBranchName;
            }
        });
    }

    private getWorkspaceName(): string {
        let result = workspace && workspace.name || "--";
        if (this._gitAPI && this._config.trackGitBranch) {
            const branchName = this.getGitBranchName();

            if (branchName) {
                result = `${result} (${branchName})`;
            }
        }

        return result;
    }

    private getGitBranchName(): string {
        if (this._gitAPI) {
            const branchNames = [];
            this._gitAPI.repositories.forEach(rep => {
                if (rep.state.HEAD && rep.state.HEAD.name) {
                    branchNames.push(rep.state.HEAD.name)
                }
            });

            return branchNames.join(", ");
        }

        return null;
    }

    private startCurrentTimeInterval(date?: number) {
        this._currentTimeInterval = {
            start: date ? date : Date.now(),
            workspace: this.getWorkspaceName()
        };

        this._startAppIntervals.push(this._currentTimeInterval);
    }

    private endCurrentTimeInterval(date?: number) {
        this._currentTimeInterval.end = date ? date : Date.now();
        this._storage.addTimeInterval(this._currentTimeInterval);
    }

    private gitBranchChanged() {
        this.endCurrentTimeInterval();
        this._storage.addTimeInterval(this._currentTimeInterval);
        this.startCurrentTimeInterval();
        this.recomputeStatusBar();
    }

    private workspaceChanged() {
        this.endCurrentTimeInterval();
        this._storage.addTimeInterval(this._currentTimeInterval);
        this.startCurrentTimeInterval();
        this.recomputeStatusBar();
    }

    private configurationChanged() {

        const isTrackGitBranchChange = this._config.trackGitBranch != workspace.getConfiguration('time-tracker').trackGitBranch;
        this._config = workspace.getConfiguration('time-tracker');

        this.recomputeStatusBar();
        this.setStatusBarCommand();

        if (isTrackGitBranchChange) {
            this.gitBranchChanged();
        }
    }

    private createStatusBars() {
        this._statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left);
        this.setStatusBarCommand();
        this._statusBarItem.show();
    }

    private setStatusBarCommand() {
        this._statusBarItem.command = this._config.onStatusbarBarClick == "show log" ? 'extension.showLog' : 'extension.toggleStop';
    }

    private recomputeStatusBar(): void {
        const now = Date.now();

        let iconText;
        let totalDurationMilliseconds = this._storage.totalDurationMiliseconds;
        let totalWorkspaceMilliseconds = this._storage.getTotalWorkspaceMiliseconds(vscode.workspace.name);        
        let todayDurationMilliseconds;

        if (!this._isStopped) { // tracking
            iconText = "$(triangle-right) ";

            const currentTimeIntervalDuration = now - this._currentTimeInterval.start;
            totalDurationMilliseconds += currentTimeIntervalDuration;
            totalWorkspaceMilliseconds += currentTimeIntervalDuration;

            todayDurationMilliseconds = this._storage.getTodayDurationMiliseconds(this._currentTimeInterval);
        } else { // stopped
            iconText = "$(primitive-square) ";

            todayDurationMilliseconds = this._storage.getTodayDurationMiliseconds(null);
        }
        

        const totalDurationText = timeFormat.formatTimeFromMiliseconds(totalDurationMilliseconds);
        const totalWorkspaceText = timeFormat.formatTimeFromMiliseconds(totalWorkspaceMilliseconds);
        const todayDurationText = timeFormat.formatTimeFromMiliseconds(todayDurationMilliseconds);
        
        const intervalsFromStart = this._startAppIntervals.map(x => (x.end || Date.now()) - x.start);
        intervalsFromStart.reduce((accumulator, currentValue) => accumulator + currentValue)
        const fromStartDurationMilliseconds = intervalsFromStart.reduce((accumulator, currentValue) => accumulator + currentValue);
        const fromStartDurationText = timeFormat.formatTimeFromMiliseconds(fromStartDurationMilliseconds);


        const texts = [];

        if (totalDurationText.length > 0 && this._config.showTotalTime) texts.push(totalDurationText);
        if (totalWorkspaceText.length > 0 && this._config.showTotalWorkspaceTime) texts.push(totalWorkspaceText);
        if (todayDurationText.length > 0 && this._config.showTodayTime) texts.push(todayDurationText);
        if (fromStartDurationText.length > 0 && this._config.showFromStartTime) texts.push(fromStartDurationText);

        this._statusBarItem.text = iconText + texts.join(" | ");
    }

    private timeElapsed() {
        if (this._isStopped) return;

        const saveInterval = this.getSaveInterval();

        if (saveInterval && Date.now() - this._currentTimeInterval.start > saveInterval) {
            this.saveData();
        }

        this.recomputeStatusBar();
    }

    private getSaveInterval() {
        if (this._config.savingOption == "on vscode exit and every 5 minutes") return 5 * this.MILISECONDS_IN_MINUTE;
        if (this._config.savingOption == "on vscode exit and every 10 minutes") return 10 * this.MILISECONDS_IN_MINUTE;
        if (this._config.savingOption == "on vscode exit and every 15 minutes") return 15 * this.MILISECONDS_IN_MINUTE;
        if (this._config.savingOption == "on vscode exit and every 30 minutes") return 30 * this.MILISECONDS_IN_MINUTE;

        return null;
    }

    private createInterval() {
        this._invervalId = setInterval(() => {
            this.timeElapsed();
        }, this.MILISECONDS_IN_MINUTE);

        this.timeElapsed();
    }

    private toggleStop(): void {
        this._isStopped = !this._isStopped;
        if (this._isStopped) {
            this.saveData();
            vscode.window.showInformationMessage('Time tracker stopped');
            this.recomputeStatusBar();
        }
        else {
            this.startCurrentTimeInterval();
            vscode.window.showInformationMessage('Time tracker started');
            this.timeElapsed();
        }
    }

    private clearAllData() {
        if (!this._isStopped) this.toggleStop(); // stop
        this._storage.clearAllData();
        this.toggleStop(); // start
        vscode.window.showInformationMessage('Data cleared');
    }

    private editLog() {
        new LogsEditorWebView(this._context, this._storage, () => {
            this.saveData();
        }).show();
    }

    private exportLog() {
        new LogWebView(this._context, this._storage, !this._currentTimeInterval.end ? this._currentTimeInterval : null).exportLog();
    }

    private showLogWebView() {
        new LogWebView(this._context, this._storage, !this._currentTimeInterval.end ? this._currentTimeInterval : null).show();
    }

    private saveData() {
        const now = Date.now();
        this.endCurrentTimeInterval(now);
        this._storage.saveAll();
        this._storage.initTimeIntervals();
        this.startCurrentTimeInterval(now);

        this.recomputeStatusBar();
    }

    dispose() {
        clearInterval(this._invervalId);
        this.endCurrentTimeInterval();
        this._storage.saveAll();
        this._statusBarItem.dispose();
    }
}
