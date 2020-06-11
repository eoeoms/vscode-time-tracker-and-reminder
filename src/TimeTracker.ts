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

    private readonly MILLISECONDS_IN_MINUTE = 60000;
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
    _lastRepoNames: string[];
    _gotOnRepositoryDidChangeSubscribes: vscode.Disposable[] = [];
    _iconText: string = "$(primitive-square) ";

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
        // on repository open, run callback
        const onDidOpenRepositorySubs = this._gitAPI.onDidOpenRepository(rep => {
            // dispose previous subscriptions
            this._gotOnRepositoryDidChangeSubscribes.forEach(x => x.dispose());
            // for each repositories currently opened, subcribe to state (HEAD) change
            this._gitAPI.repositories.forEach(rep => {
                // on change, check if prev repo names does not contain the changed name
                const subscribe = rep.state.onDidChange(() => {
                    if (
                        this._config.trackGitBranch &&
                        rep.state.HEAD &&
                        rep.state.HEAD.name &&
                        !this._lastRepoNames.includes(this.parseRepoName(rep))
                    ) {
                        this._lastRepoNames = this.getGitRepoNames();
                        this.gitBranchChanged();
                    }
                });

                this._gotOnRepositoryDidChangeSubscribes.push(subscribe);
            });

            // also compare the current and last repo names, and call gitBranchChanged
            if (this._config.trackGitBranch) {
                const currentRepos = this.getGitRepoNames();
                const a1 = currentRepos.concat().sort();
                const a2 = this._lastRepoNames.concat().sort();
                if (!a1.every((e, i) => e === a2[i])) {
                    this.gitBranchChanged();
                    this._lastRepoNames = currentRepos;
                }
            }
        });
    }

    private getWorkspaceName(): string {
        return workspace && workspace.name || "--";
    }

    private getGitRepoNames(): string[] {
        if (this._gitAPI) {
            const repoNames = [];
            this._gitAPI.repositories.forEach(rep => {
                if (rep.state.HEAD && rep.state.HEAD.name) {
                    repoNames.push(this.parseRepoName(rep));
                }
            });

            return repoNames;
        }

        return null;
    }

    // returns a repository's name in the format of root_directory/branch_name
    private parseRepoName(repo: Git.Repository): string {
        return decodeURI(repo.rootUri.toString()).split("/").slice(-1) + "/" + repo.state.HEAD.name;
    }

    private startCurrentTimeInterval(date?: number) {
        if (this._gitAPI && this._config.trackGitBranch) {
            this._currentTimeInterval = {
                start: date ? date : Date.now(),
                workspace: this.getWorkspaceName(),
                repositories: this.getGitRepoNames()
            }
        } else {
            this._currentTimeInterval = {
                start: date ? date : Date.now(),
                workspace: this.getWorkspaceName()
            };
        }

        this._startAppIntervals.push(this._currentTimeInterval);
    }

    private endCurrentTimeInterval(date?: number) {
        const interval: TimeInterval = {
            start: this._currentTimeInterval.start,
            end: date ? date : Date.now(),
            workspace: this._currentTimeInterval.workspace,
        }
        if (this._currentTimeInterval.repositories) {
            interval.repositories = this._currentTimeInterval.repositories;
        }
        this._storage.addTimeInterval(interval);
    }

    private gitBranchChanged() {
        this.endCurrentTimeInterval();
        this.startCurrentTimeInterval();
        this.recomputeStatusBar();
    }

    private workspaceChanged() {
        this.endCurrentTimeInterval();
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

        let totalDurationMilliseconds = this._storage.totalDurationMilliseconds;
        let totalWorkspaceMilliseconds = this._storage.getTotalWorkspaceMilliseconds(vscode.workspace.name);        
        let todayDurationMilliseconds;

        if (!this._isStopped) { // tracking
            const currentTimeIntervalDuration = now - this._currentTimeInterval.start;
            totalDurationMilliseconds += currentTimeIntervalDuration;
            totalWorkspaceMilliseconds += currentTimeIntervalDuration;
            todayDurationMilliseconds = this._storage.getTodayDurationMilliseconds(this._currentTimeInterval);
        } else { // stopped
            todayDurationMilliseconds = this._storage.getTodayDurationMilliseconds(null);
        }

        const texts = [];

        if (this._config.showTotalTime) {
            const totalDurationText = timeFormat.formatTimeFromMilliseconds(totalDurationMilliseconds);
            if (totalDurationText.length > 0) texts.push(totalDurationText);
        }
        if (this._config.showTotalWorkspaceTime) {
            const totalWorkspaceText = timeFormat.formatTimeFromMilliseconds(totalWorkspaceMilliseconds);
            if (totalWorkspaceText.length > 0) texts.push(totalWorkspaceText);
        };
        if (this._config.showTodayTime) {
            const todayDurationText = timeFormat.formatTimeFromMilliseconds(todayDurationMilliseconds);
            if (todayDurationText.length > 0) texts.push(todayDurationText);
        }
        if (this._config.showFromStartTime) {
            const intervalsFromStart = this._startAppIntervals.map(x => (x.end || Date.now()) - x.start);
            intervalsFromStart.reduce((accumulator, currentValue) => accumulator + currentValue)
            const fromStartDurationMilliseconds = intervalsFromStart.reduce((accumulator, currentValue) => accumulator + currentValue);
            const fromStartDurationText = timeFormat.formatTimeFromMilliseconds(fromStartDurationMilliseconds);
            if (fromStartDurationText.length > 0) texts.push(fromStartDurationText);
        }

        this._statusBarItem.text = this._iconText + texts.join(" | ");
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
        if (this._config.savingOption == "on vscode exit and every 5 minutes") return 5 * this.MILLISECONDS_IN_MINUTE;
        if (this._config.savingOption == "on vscode exit and every 10 minutes") return 10 * this.MILLISECONDS_IN_MINUTE;
        if (this._config.savingOption == "on vscode exit and every 15 minutes") return 15 * this.MILLISECONDS_IN_MINUTE;
        if (this._config.savingOption == "on vscode exit and every 30 minutes") return 30 * this.MILLISECONDS_IN_MINUTE;

        return null;
    }

    private createInterval() {
        this._invervalId = setInterval(() => {
            this.timeElapsed();
        }, this.MILLISECONDS_IN_MINUTE);

        this.timeElapsed();
    }

    private toggleStop(): void {
        this._isStopped = !this._isStopped;
        if (this._isStopped) {
            this._iconText = "$(triangle-right) ";
            this.saveData();
            vscode.window.showInformationMessage('Time tracker stopped');
            this.recomputeStatusBar();
        }
        else {
            this._iconText = "$(primitive-square) ";
            this.startCurrentTimeInterval();
            vscode.window.showInformationMessage('Time tracker started');
            this.timeElapsed();
        }
    }

    private clearAllData() {
        if (!this._isStopped) this.toggleStop(); // stop
        this._storage.clearAllData();
        this.recomputeStatusBar();
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
        this.recomputeStatusBar();
    }

    dispose() {
        clearInterval(this._invervalId);
        this.endCurrentTimeInterval();
        this._storage.saveAll();
        this._statusBarItem.dispose();
    }
}
