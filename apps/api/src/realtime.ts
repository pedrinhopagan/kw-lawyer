import { EventPublisher } from "@orpc/server";

type RealtimePayload = object;

interface RealtimeEventId {
	id: number;
}

export type RealtimeEvent<TPayload extends RealtimePayload> = TPayload & RealtimeEventId;

export function createRealtimeChannel<TPayload extends RealtimePayload>() {
	const publisher = new EventPublisher<{ event: RealtimeEvent<TPayload> }>();
	let id = 0;

	function publish(payload: TPayload & { id?: never }) {
		id += 1;
		const event = { ...payload, id };
		publisher.publish("event", event);
		return event;
	}

	async function* live<TSnapshot>(options: {
		signal?: AbortSignal;
		getSnapshot: () => Promise<TSnapshot>;
		select: (event: RealtimeEvent<TPayload>) => TSnapshot;
	}) {
		const updates = publisher.subscribe("event", {
			signal: options.signal,
			maxBufferedEvents: 1,
		});

		try {
			yield await options.getSnapshot();

			for await (const event of updates) {
				yield options.select(event);
			}
		} finally {
			await updates.return();
		}
	}

	return {
		publish,
		live,
		events: (signal?: AbortSignal) => publisher.subscribe("event", { signal }),
	};
}
