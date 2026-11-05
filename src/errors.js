export class CodeChefError extends Error {
  constructor(message, { code = "ERROR", status, retryable = false } = {}) {
    super(message);
    this.name = "CodeChefError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}
