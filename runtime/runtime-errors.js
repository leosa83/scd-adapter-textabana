

const cancellationDiagnosticCode = "TBA-RUN-CANCELLED-LAB";

function cancellationError() {
  const error = new Error("Körningen avbröts vid en kooperativ runtimegräns.");
  error.name = "AbortError";
  error.code = cancellationDiagnosticCode;
  return error;
}

function planningError(message) {
  const error = new Error(message);
  error.name = "ExecutionPlanError";
  error.code = "TBA-PLAN-DRIFT-LAB";
  error.phase = "planning";
  return error;
}

function cacheContractError(code, message) {
  const error = new Error(message);
  error.name = "StageCacheContractError";
  error.code = code;
  error.phase = "execution";
  return error;
}

export { cacheContractError, cancellationDiagnosticCode, cancellationError, planningError };

