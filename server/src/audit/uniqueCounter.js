/** Track unique strings with a hard cap to avoid OOM on very large audiences. */
export class CappedUniqueCounter {
  constructor(maxSize = 250_000) {
    this.maxSize = maxSize;
    this.set = new Set();
    this.capped = false;
  }

  add(value) {
    const key = String(value ?? "").trim();
    if (!key) return;
    if (this.set.has(key)) return;
    if (this.set.size >= this.maxSize) {
      this.capped = true;
      return;
    }
    this.set.add(key);
  }

  get size() {
    return this.set.size;
  }

  toJSON() {
    return {
      count: this.set.size,
      isLowerBound: this.capped,
      note: this.capped ? `At least ${this.set.size.toLocaleString()} (counter stopped at cap)` : undefined,
    };
  }
}
