// safazi 2023

type PromiseFactory<T = unknown> = () => Promise<T>;

export class PromiseQueue {
	private readonly running = new Set();

	private readonly queue = new Array<PromiseFactory>();

	private concurrency = 1;

	constructor(concurrency?: number) {
		if (concurrency !== undefined) this.setConcurrency(concurrency);
	}

	setConcurrency(concurrency: number) {
		assert(concurrency >= 1, `queue concurrency must be >=1, got ${concurrency}`);
		assert(concurrency % 1 === 0, `queue concurrency must be an integer, got ${concurrency}`);

		this.concurrency = concurrency;
		this.update();
	}

	private dispatch() {
		const { running, queue } = this;

		const factory = queue.shift();
		if (!factory) return;

		const [success, promise] = pcall(factory);
		if (!success) {
			warn("promise factory error:", promise);
			return this.update();
		}

		running.add(promise);

		promise.finally(() => {
			running.delete(promise);
			this.update();
		});

		this.update();
	}

	private update() {
		if (this.running.size() >= this.concurrency) return;
		task.spawn(() => this.dispatch());
	}

	push<T>(factory: PromiseFactory<T>, unshift?: boolean): Promise<T> {
		return new Promise((resolve, reject, onCancel) => {
			const fn = () => {
				if (onCancel()) return Promise.resolve();

				const promise = factory().then(resolve).catch(reject);
				onCancel(() => promise.cancel());

				return promise;
			};

			if (unshift) this.queue.unshift(fn);
			else this.queue.push(fn);

			this.update();
		});
	}

	unshift<T>(factory: PromiseFactory<T>): Promise<T> {
		return this.push(factory, true);
	}
}
