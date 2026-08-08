/**
 * Console output, and a tally of what went wrong without stopping the run.
 *
 * Warnings are collected as well as printed. A scheduled job scrolls past, so
 * the count at the end is the only part anyone reliably sees.
 */
export class Log {
  #warnings = [];

  /** A line of narration: what the run is doing now. */
  step(message) {
    console.log(message);
  }

  /** A line about one item, indented under the step it belongs to. */
  detail(message) {
    console.log(`  ${message}`);
  }

  /** Something is wrong but the run can still produce an honest page. */
  warn(message) {
    this.#warnings.push(message);
    console.warn(`  ! ${message}`);
  }

  /** Output that was deleted because nothing describes it any more. */
  removed(message) {
    console.log(`  - ${message}`);
  }

  get warnings() {
    return [...this.#warnings];
  }
}

/** One instance for the process. Passed explicitly into everything that needs
 *  it, so the collaborators stay testable with a silent log of their own. */
export const log = new Log();
