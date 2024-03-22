import Logger from "../src/Logger";

const consoleLogSpy = jest.spyOn(console, "log");
const consoleWarnSpy = jest.spyOn(console, "warn");
const consoleErrorSpy = jest.spyOn(console, "error");
const consoleInfoSpy = jest.spyOn(console, "info");

describe("Logger", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("when DYNA_RECORD_LOGGING_ENABLED is true", () => {
    beforeEach(() => {
      process.env.DYNA_RECORD_LOGGING_ENABLED = "true";
    });

    it("should call console.log when Logger.log is called", () => {
      expect.assertions(1);
      Logger.log("test");
      expect(consoleLogSpy).toHaveBeenCalledWith("test");
    });

    it("should call console.warn when Logger.warn is called", () => {
      expect.assertions(1);
      Logger.warn("test");
      expect(consoleWarnSpy).toHaveBeenCalledWith("test");
    });

    it("should call console.error when Logger.error is called", () => {
      expect.assertions(1);
      Logger.error("test");
      expect(consoleErrorSpy).toHaveBeenCalledWith("test");
    });

    it("should call console.info when Logger.info is called", () => {
      expect.assertions(1);
      Logger.info("test");
      expect(consoleInfoSpy).toHaveBeenCalledWith("test");
    });
  });

  describe("when DYNA_RECORD_LOGGING_ENABLED is false", () => {
    beforeEach(() => {
      process.env.DYNA_RECORD_LOGGING_ENABLED = "false";
    });

    it("should not call console.log when Logger.log is called", () => {
      expect.assertions(1);
      Logger.log("test");
      expect(consoleInfoSpy).not.toHaveBeenCalled();
    });

    it("should not call console.warn when Logger.warn is called", () => {
      expect.assertions(1);
      Logger.warn("test");
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it("should not call console.error when Logger.error is called", () => {
      expect.assertions(1);
      Logger.error("test");
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it("should not call console.info when Logger.info is called", () => {
      expect.assertions(1);
      Logger.info("test");
      expect(consoleInfoSpy).not.toHaveBeenCalled();
    });
  });
});
