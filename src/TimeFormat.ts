'use strict';
import * as moment from 'moment';

class TimeFormat {
  formatTimeFromMilliseconds(milliseconds: number, format: string = null): string {
    return this.formatTime(milliseconds / 1000, format);
  }

  formatTime(seconds: number, format: string = null): string {

    if (!format) {
      format = "y[y] M[M] w[w] d[d] h[h] m[m]";
    }

    const duration = <any>moment.duration(seconds, 'seconds');
    return duration.format(format);
  }
}

export const timeFormat = new TimeFormat();
