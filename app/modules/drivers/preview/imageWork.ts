// Bound the number of Sharp jobs rather than the number of libvips threads.
// Waiting producers have a separate deadline and do not buffer source images.
export class ImagePreviewWork {
  private active = 0;
  private waiting: Array<{start: () => void; timer: ReturnType<typeof setTimeout>}> = [];

  constructor(private readonly concurrency = 2, private readonly maxWaiting = 32, private readonly waitMs = 10000) {}

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.active >= this.concurrency) {
      if (this.waiting.length >= this.maxWaiting) {
        throw Object.assign(new Error('image_preview_busy'), {code: 'image_preview_busy'});
      }
      await new Promise<void>((resolve, reject) => {
        const entry = {start: resolve, timer: null as ReturnType<typeof setTimeout>};
        entry.timer = setTimeout(() => {
          this.waiting.splice(this.waiting.indexOf(entry), 1);
          reject(Object.assign(new Error('image_preview_queue_timeout'), {code: 'image_preview_queue_timeout'}));
        }, this.waitMs);
        this.waiting.push(entry);
      });
    } else {
      this.active++;
    }
    try {
      return await work();
    } finally {
      const next = this.waiting.shift();
      if (next) {
        clearTimeout(next.timer);
        next.start();
      } else {
        this.active--;
      }
    }
  }
}

export const imagePreviewWork = new ImagePreviewWork();
