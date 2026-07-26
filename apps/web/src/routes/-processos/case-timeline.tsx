import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileSearchIcon, ListFilterIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { orpc } from "@/lib/orpc";
import { EmptyState } from "./feedback";
import { countLabel } from "@/lib/legal-labels";
import type { TimelineItem, TimelinePublication } from "./queries";
import { groupByDay, isPublication } from "./timeline-data";
import { MovementRow, PublicationCard } from "./timeline-items";

const INITIAL_ITEMS = 80;
const CHUNK_ITEMS = 250;

function indexOfPublication(items: TimelineItem[], publicationId?: string) {
	if (!publicationId) {
		return -1;
	}

	return items.findIndex((item) => {
		if (!isPublication(item)) {
			return false;
		}

		return item.publication.id === publicationId;
	});
}

function readItem(item: TimelineItem, publicationId: string, readAt: Date) {
	if (!isPublication(item)) {
		return item;
	}

	if (item.publication.id !== publicationId) {
		return item;
	}

	return { ...item, publication: { ...item.publication, readAt } };
}

export function CaseTimeline({
	cnjNumber,
	timeline,
	anchorId,
}: {
	cnjNumber: string;
	timeline: TimelineItem[];
	anchorId?: string;
}) {
	const queryClient = useQueryClient();
	const [chunks, setChunks] = useState(0);
	const [onlyPublications, setOnlyPublications] = useState(false);
	const [expanded, setExpanded] = useState<ReadonlySet<string>>(
		() => new Set(anchorId ? [anchorId] : []),
	);

	const markRead = useMutation(
		orpc.publications.read.mutationOptions({
			onSuccess: async (_result, variables) => {
				const readAt = new Date();

				queryClient.setQueryData(orpc.cases.get.queryKey({ input: { cnjNumber } }), (current) => {
					if (!current) {
						return current;
					}

					return {
						...current,
						timeline: current.timeline.map((item) => readItem(item, variables.id, readAt)),
					};
				});

				await Promise.all([
					queryClient.invalidateQueries({ queryKey: orpc.publications.key() }),
					queryClient.invalidateQueries({ queryKey: orpc.cases.list.key() }),
				]);
			},
			onError: () => {
				toast.error("Não foi possível marcar a publicação como lida.");
			},
		}),
	);

	const [anchorUnread] = useState(() => {
		const index = indexOfPublication(timeline, anchorId);
		const target = index < 0 ? undefined : timeline[index];

		if (!target || !isPublication(target)) {
			return false;
		}

		return !target.publication.readAt;
	});

	const scrollToAnchor = useCallback(
		(node: HTMLElement | null) => {
			if (!node) {
				return;
			}

			if (anchorId && anchorUnread) {
				markRead.mutate({ id: anchorId });
			}

			const frame = requestAnimationFrame(() => node.scrollIntoView({ block: "start" }));

			return () => cancelAnimationFrame(frame);
		},
		[anchorId, anchorUnread, markRead.mutate],
	);

	function toggle(item: TimelinePublication) {
		const opening = !expanded.has(item.publication.id);

		setExpanded((current) => {
			const next = new Set(current);

			if (opening) {
				next.add(item.publication.id);
			} else {
				next.delete(item.publication.id);
			}

			return next;
		});

		if (opening && !item.publication.readAt) {
			markRead.mutate({ id: item.publication.id });
		}
	}

	const items: TimelineItem[] = onlyPublications ? timeline.filter(isPublication) : timeline;
	const anchorIndex = indexOfPublication(items, anchorId);
	const visible = items.slice(0, Math.max(INITIAL_ITEMS + chunks * CHUNK_ITEMS, anchorIndex + 1));
	const remaining = items.length - visible.length;
	const days = groupByDay(visible);
	const publications = timeline.filter(isPublication).length;

	return (
		<section className="mt-6">
			<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border pb-2">
				<h2 className="text-sm font-semibold">Andamentos</h2>

				<div className="flex items-center gap-2">
					<span className="text-2xs text-muted-foreground tabular-nums">
						{countLabel(items.length, "item", "itens")}
					</span>
					<Button
						variant="ghost"
						size="xs"
						aria-pressed={onlyPublications}
						className={cn("text-muted-foreground", onlyPublications && "bg-accent text-foreground")}
						onClick={() => setOnlyPublications((current) => !current)}
					>
						<ListFilterIcon />
						Só publicações
						<span className="font-mono tabular-nums">{publications}</span>
					</Button>
				</div>
			</div>

			{days.length === 0 && (
				<EmptyState
					icon={FileSearchIcon}
					title="Nenhum andamento para mostrar"
					description={
						onlyPublications
							? "Este processo não tem publicação vinculada à sua OAB. Desligue o filtro para ver os movimentos vindos do DataJud."
							: "O DataJud ainda não devolveu movimentos para este processo e nenhuma publicação foi vinculada a ele. A próxima sincronização tenta de novo."
					}
				/>
			)}

			<ol className="mt-1">
				{days.map((day) => (
					<li key={day.id}>
						<div className="sticky top-[var(--kw-mobile-header)] z-10 flex items-center gap-3 bg-background/92 py-1.5 backdrop-blur-sm md:top-0">
							<span className="text-2xs font-medium tracking-[0.1em] text-muted-foreground uppercase">
								{day.label}
							</span>
							<span aria-hidden className="h-px flex-1 bg-border" />
						</div>

						<ul className="border-l border-border pt-0.5 pb-3 pl-4">
							{day.items.map((item) => {
								if (!isPublication(item)) {
									return <MovementRow key={item.id} item={item} />;
								}

								const anchored = item.publication.id === anchorId;

								return (
									<PublicationCard
										key={item.id}
										item={item}
										expanded={expanded.has(item.publication.id)}
										anchored={anchored}
										cardRef={anchored ? scrollToAnchor : undefined}
										onToggle={() => toggle(item)}
									/>
								);
							})}
						</ul>
					</li>
				))}
			</ol>

			{remaining > 0 && (
				<div className="flex flex-col items-center gap-1.5 border-t border-border pt-4">
					<Button variant="outline" size="sm" onClick={() => setChunks((current) => current + 1)}>
						Carregar mais {Math.min(CHUNK_ITEMS, remaining).toLocaleString("pt-BR")} andamentos
					</Button>
					<span className="text-2xs text-muted-foreground tabular-nums">
						Mostrando {visible.length.toLocaleString("pt-BR")} de{" "}
						{items.length.toLocaleString("pt-BR")}
					</span>
				</div>
			)}
		</section>
	);
}
