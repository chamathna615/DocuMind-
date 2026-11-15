// An error whose message is safe to show directly to the student.
export class UserError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "UserError";
    this.userMessage = message;
    this.statusCode = statusCode;
  }
}

// Thrown inside the processing pipeline when the student cancels a job.
export class CancelledError extends Error {
  constructor() {
    super("Processing cancelled");
    this.name = "CancelledError";
  }
}
