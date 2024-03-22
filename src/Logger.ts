/* eslint-disable @typescript-eslint/no-unsafe-argument */
type LogLevels = "log" | "warn" | "error" | "info";

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
class Logger {
  private static _log(level: LogLevels, ...logParams: any[]): void {
    if (process.env.NO_ORM_LOGGING_ENABLED === "true") {
      console[level](...logParams);
    }
  }

  static log(...messages: any[]): void {
    this._log("log", ...messages);
  }

  static warn(...messages: any[]): void {
    this._log("warn", ...messages);
  }

  static error(...messages: any[]): void {
    this._log("error", ...messages);
  }

  static info(...messages: any[]): void {
    this._log("info", ...messages);
  }
}

export default Logger;
