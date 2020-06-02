# Time Tracker

Click the start / stop button on the status bar to track how much time you've spent on VS Code, categorized by workspace and git branch.
    
## Features

#### Time count
  - Counts total time spent
  - Counts total time spent in the workspace
  - Counts total time spent from vscode start
  - Detailed log (by days, weeks, months, years)
  - Editor for editing records (not very fast thought)

#### Log editor
  ![](https://raw.githubusercontent.com/JanBN/vscode-time-tracker-and-reminder/master/assets/editor.jpg)


## Commands

**(Time Tracker) Clear all time data** - Clears all time data

**(Time Tracker) Toggle stop** - Stops/Starts counting time

**(Time Tracker) Open & show data file** - Opens and shows file where data are saved

**(Time Tracker) Show log** - Shows time spent log

**(Time Tracker) Export log** - Export log into html file

**(Time Tracker) Edit log** - Log editor


## Extension Settings

### Status bar

```
"time-tracker.showTotalTime": true
"time-tracker.showTotalWorkspaceTime": true,
"time-tracker.showTodayTime": true,
"time-tracker.showFromStartTime": false,
"time-tracker.trackGitBranch": false, // tracks also git branch names

"time-tracker.onStatusbarBarClick": "stop time tracking" 
// possible values: "show log", "stop time tracking"

"time-tracker.savingOption": "on vscode exit and every 5 minutes" 
// possible values:
// "on vscode exit",
// "on vscode exit and every 5 minutes",
// "on vscode exit and every 10 minutes",
// "on vscode exit and every 15 minutes",
// "on vscode exit and every 30 minutes"
```

The value **on vscode exit** of **time-tracker.savingOption** won't save correctly in case of pc restart or shutdow. In vscode there is a bug that it doesn't call extension deactivate in these cases. Therefore there are other options to save data also on period intervals.


## How it works

*Time Tracker* saves time intervals to custom file. Time interval looks like this:
````
    {
        "start": 1552676228266,
        "workspace": "vscode-time-tracker-and-reminder",
        "end": 1552676579707
    }
````
Then it can calculate how much time you have spent running vscode. It saves data into file on specified intervals in **time-tracker.savingOption**. Until then it keeps intervals in variables so it access hdd only when really needed.

When running multiple instances of vscode it finds intersected time intervals and consolidates them (split by intervals, joins them, merge etc). This means that counts are correct even when running multiple instances of vscode.


<div>Icons made by <a href="https://www.freepik.com/" title="Freepik">Freepik</a> from <a href="https://www.flaticon.com/" 			    title="Flaticon">www.flaticon.com</a> is licensed by <a href="http://creativecommons.org/licenses/by/3.0/" 			    title="Creative Commons BY 3.0" target="_blank">CC 3.0 BY</a></div>