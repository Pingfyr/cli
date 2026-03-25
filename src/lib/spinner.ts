import ora, { type Ora } from "ora";

/**
 * Wraps an async operation with an ora spinner.
 * - If isJson is true, the spinner is suppressed (no TTY pollution in JSON mode).
 * - Spinner is stopped before the callback result is returned.
 * - On error, spinner.stop() is called, then the error is re-thrown.
 *
 * @param text - Spinner label shown during the operation
 * @param isJson - If true, skip spinner entirely (automation-friendly)
 * @param fn - Async operation to run
 */
export async function withSpinner<T>(
  text: string,
  isJson: boolean,
  fn: (spinner: Ora | null) => Promise<T>
): Promise<T> {
  if (isJson) {
    // No spinner in JSON mode — would pollute stdout/stderr in automation
    return fn(null);
  }

  const spinner = ora(text).start();
  try {
    const result = await fn(spinner);
    spinner.stop();
    return result;
  } catch (err) {
    spinner.stop();
    throw err;
  }
}
