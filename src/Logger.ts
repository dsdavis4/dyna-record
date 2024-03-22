/* eslint-disable @typescript-eslint/no-extraneous-class */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

type LogLevels = "log" | "warn" | "error" | "info";

/**
 * Facilitates logging throughout the ORM system with support for different log levels: log, warn, error, and info. Logging can be toggled through the `DYNA_RECORD_LOGGING_ENABLED` environment variable. When enabled, logs are output to the console, allowing for easy tracking and debugging of the system's operations.
 *
 * The Logger class abstracts the console's logging methods, providing a unified API for logging across different severity levels. This encapsulation allows for more flexible logging strategies and makes it easier to modify logging behavior centrally.
 *
 * Each logging method accepts parameters matching those of the corresponding console method, ensuring that the Logger can be used in the same way as direct console logging while adding the capability to control logging behavior through environment variables.
 *
 * @method log - Outputs general informational messages to the console. Intended for logging detailed information about the flow of the application.
 * @method warn - Outputs warnings to the console. Used for situations that aren't errors but could potentially lead to errors or undesired behavior.
 * @method error - Outputs error messages to the console. Used for logging errors and exceptions that occur during the application's execution.
 * @method info - Outputs informational messages to the console, similar to `log`. Can be used to log high-level information about the application's state or operations.
 */
class Logger {
  /**
   * If debug logging is enabled, it will log to console at the given log level
   * @param level
   * @param logParams
   */
  private static _log(level: LogLevels, ...logParams: any[]): void {
    if (process.env.DYNA_RECORD_LOGGING_ENABLED === "true") {
      console[level](...logParams);
    }
  }

  /**
   * Logs general informational messages.
   * @param messages
   */
  static log(...messages: Parameters<Console["log"]>): void {
    this._log("log", ...messages);
  }

  /**
   * Logs warning messages.
   * @param messages
   */
  static warn(...messages: Parameters<Console["warn"]>): void {
    this._log("warn", ...messages);
  }

  /**
   * Logs error messages.
   * @param messages
   */
  static error(...messages: Parameters<Console["error"]>): void {
    this._log("error", ...messages);
  }

  /**
   * Logs info messages.
   * @param messages
   */
  static info(...messages: Parameters<Console["info"]>): void {
    this._log("info", ...messages);
  }
}

export default Logger;
