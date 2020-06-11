import * as vscode from 'vscode';
import * as moment from 'moment';
import * as fs from "fs";
import { TimeInterval } from './interfaces';
import { pathUtils } from './PathUtils';
import { consolidator } from './Consolidator';
import { timeIntervalUtils } from './TimeIntervalUtils';
import { WORKSPACE_NAME_DELIMITER } from './TimeTracker';

export class YearStorage {

  _globalStoragePath: string;
  context: vscode.ExtensionContext;
  _savedTimeIntervals: TimeInterval[];
  _newTimeIntervals: TimeInterval[] = [];
  _totalDurationMilliseconds: number = null;
  _todayDurationMillisecondsWithoutCurrentInterval: number = null;
  _totalWorkspaceMilliseconds: number = null;
  _currentDayStart: number;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    pathUtils.ensureStoragePath((context as any).globalStoragePath);

    this._globalStoragePath = pathUtils.getStorageFilePath(context, new Date().getUTCFullYear());

    this.initTimeIntervals();
  }

  getAllTimeIntervals() {
    return [...this._savedTimeIntervals, ...this._newTimeIntervals];
  }

  initTimeIntervals() {
    // this.consolidateAndSave();
    this._savedTimeIntervals = this.loadTimeIntervals();
    this._newTimeIntervals = [];
    this.clearCounters()
  }

  consolidateAndSave() {
    const timeIntervals = this.loadTimeIntervals();
    const consolidated = consolidator.consolidate([...timeIntervals, ...this._newTimeIntervals]);
    this.saveTimeIntervals(consolidated);
  }


  public get totalDurationMilliseconds(): number {
    if (this._totalDurationMilliseconds) {
      return this._totalDurationMilliseconds;
    }

    const timeIntervals = [...this._savedTimeIntervals, ...this._newTimeIntervals];
    const millisecondsArray: number[] = timeIntervals.map(x => x.end - x.start);
    this._totalDurationMilliseconds = millisecondsArray && millisecondsArray.length > 0 ? millisecondsArray.reduce((accumulator, currentValue) => accumulator + currentValue) : 0;
    return this._totalDurationMilliseconds;
  }

  isDayChange() {
    return moment().startOf('day').valueOf() != this._currentDayStart;
  }

  public getTodayDurationMilliseconds(currentTimeInterval: TimeInterval) {

    let currentTimeIntervalTodayMillisecond = 0;
    if (currentTimeInterval) {
      const currentTimeIntervalCopy = { start: currentTimeInterval.start, end: Date.now(), workspace: currentTimeInterval.workspace };
      const startOfTodayMilliseconds = moment().startOf('day').valueOf();
      const endOfTodayMilliseconds = moment().startOf('day').add(1, 'days').valueOf();

      const croppedInterval = timeIntervalUtils.getTimeIntervalCroppedToTimeRange(currentTimeIntervalCopy, startOfTodayMilliseconds, endOfTodayMilliseconds)
      currentTimeIntervalTodayMillisecond = croppedInterval.end - croppedInterval.start;
    }

    if (this._todayDurationMillisecondsWithoutCurrentInterval && !this.isDayChange()) {
      return this._todayDurationMillisecondsWithoutCurrentInterval + currentTimeIntervalTodayMillisecond;
    }

    const startOfTodayMilliseconds = moment().startOf('day').valueOf();
    const endOfTodayMilliseconds = moment().startOf('day').add(1, 'days').valueOf();

    this._currentDayStart = startOfTodayMilliseconds;

    const timeIntervals = [...this._savedTimeIntervals, ...this._newTimeIntervals].filter(x => !(x.end < startOfTodayMilliseconds));


    const millisecondsArray: number[] = timeIntervalUtils.getTimeIntervalsCroppedToTimeRange(timeIntervals, startOfTodayMilliseconds, endOfTodayMilliseconds).map(x => x.end - x.start);
    this._todayDurationMillisecondsWithoutCurrentInterval = millisecondsArray && millisecondsArray.length > 0 ? millisecondsArray.reduce((accumulator, currentValue) => accumulator + currentValue) : 0;
    return this._todayDurationMillisecondsWithoutCurrentInterval + currentTimeIntervalTodayMillisecond;
  }

  public getTotalWorkspaceMilliseconds(workspace: string): number {
    if (this._totalWorkspaceMilliseconds) {
      return this._totalWorkspaceMilliseconds;
    }

    const timeIntervals = [...this._savedTimeIntervals.filter(x => x.workspace && x.workspace.split(WORKSPACE_NAME_DELIMITER).some(y => y.trim() == workspace)), ...this._newTimeIntervals.filter(x => x.workspace.split(WORKSPACE_NAME_DELIMITER).some(y => y.trim() == workspace))];
    const millisecondsArray: number[] = timeIntervals.map(x => x.end - x.start);
    this._totalWorkspaceMilliseconds = millisecondsArray && millisecondsArray.length > 0 ? millisecondsArray.reduce((accumulator, currentValue) => accumulator + currentValue) : 0;
    return this._totalWorkspaceMilliseconds;
  }

  public addTimeInterval(interval: TimeInterval) {
    this._newTimeIntervals.push(interval)

    this.clearCounters();
  }

  public saveAll() {
    const oldData = this.loadTimeIntervals();
    this.saveTimeIntervals([...oldData, ...this._newTimeIntervals]);
  }

  public saveEditedData(intervals:TimeInterval[]) {
    this.saveTimeIntervals([...intervals, ...this._newTimeIntervals]);
  }

  public clearAllData() {
    this.saveTimeIntervals([]);
    this.initTimeIntervals();
  }

  public clearCounters() {
    this._totalDurationMilliseconds = null;
    this._todayDurationMillisecondsWithoutCurrentInterval = null;
    this._totalWorkspaceMilliseconds = null;
  }

  private loadTimeIntervals(): TimeInterval[] {
    if (fs.existsSync(this._globalStoragePath)) {
      const json = fs.readFileSync(this._globalStoragePath, "utf8");
      try {
        const result = JSON.parse(json) as TimeInterval[];
        return result;
      }
      catch (ex) {
        try {
          fs.unlinkSync(this._globalStoragePath);
        }
        catch (ee) { }
      }
      return [];
    }

    return [];
  }

  private saveTimeIntervals(value: TimeInterval[]) {
    value = value.sort((a, b) => a.start - b.start);
    try {
      fs.unlinkSync(this._globalStoragePath);
    }
    catch (e) { }
    fs.writeFileSync(this._globalStoragePath, JSON.stringify(value), "utf8");
  }
}