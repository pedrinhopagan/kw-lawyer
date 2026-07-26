import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowUpRightIcon, BanIcon, ExternalLinkIcon, TriangleAlertIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { formatCnj } from "@/lib/format";
import { orpc } from "@/lib/orpc";
import { isCanceledPublication } from "@api/features/djen/project";
import { fullDate, publicationTitle } from "./publication-meta";
import type { PublicationItem } from "./queries";

const BODY_SKELETON_WIDTHS = [
	"w-full",
	"w-full",
	"w-11/12",
	"w-full",
	"w-9/12",
	"w-full",
	"w-7/12",
];

export function PublicationSheet({
	publication,
	open,
	onOpenChange,
}: {
	publication: PublicationItem | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-[44rem]">
				{!!publication && <PublicationReader publication={publication} />}
				{!publication && <SheetTitle className="sr-only">Publicação</SheetTitle>}
			</SheetContent>
		</Sheet>
	);
}

function CanceledNotice({ publication }: { publication: PublicationItem }) {
	if (!isCanceledPublication(publication)) {
		return null;
	}

	return (
		<div className="mt-1 flex gap-2.5 rounded-[3px] border border-destructive/35 bg-destructive/8 px-3 py-2.5">
			<BanIcon className="mt-px size-3.5 shrink-0 text-destructive" />

			<div className="flex flex-col gap-1">
				<p className="text-xs leading-snug font-medium text-destructive">
					Publicação cancelada pelo tribunal
					{!!publication.canceledAt && ` em ${fullDate(publication.canceledAt)}`}.
				</p>

				{!!publication.cancelReason && (
					<p className="text-xs leading-relaxed text-foreground/80">
						Motivo do tribunal: {publication.cancelReason}
					</p>
				)}

				{!publication.cancelReason && (
					<p className="text-xs leading-relaxed text-muted-foreground">
						O tribunal não informou o motivo. O texto abaixo é o que foi publicado antes do
						cancelamento.
					</p>
				)}
			</div>
		</div>
	);
}

function PublicationReader({ publication }: { publication: PublicationItem }) {
	const { data, isError, refetch } = useQuery(
		orpc.publications.get.queryOptions({ input: { id: publication.id } }),
	);

	return (
		<>
			<SheetHeader className="gap-2 border-b border-border px-5 py-4 pr-12">
				<div className="flex items-center gap-2">
					{!!publication.tribunal && <span className="tag-tribunal">{publication.tribunal}</span>}
					<time dateTime={publication.availableAt} className="text-2xs text-muted-foreground">
						{fullDate(publication.availableAt)}
					</time>
				</div>

				<SheetTitle className="text-base leading-snug">{publicationTitle(publication)}</SheetTitle>

				{!!publication.orgName && (
					<SheetDescription className="text-xs leading-relaxed">
						{publication.orgName}
					</SheetDescription>
				)}

				<CanceledNotice publication={publication} />

				<div className="flex flex-wrap items-center gap-2 pt-1">
					{!!publication.cnjNumber && (
						<Link
							to="/processos/$cnj"
							params={{ cnj: publication.cnjNumber }}
							search={{ pub: publication.id }}
							className={buttonVariants({ variant: "outline", size: "xs" })}
						>
							<span className="num-cnj">{formatCnj(publication.cnjNumber)}</span>
							<ArrowUpRightIcon />
						</Link>
					)}

					{!!publication.link && (
						<a
							href={publication.link}
							target="_blank"
							rel="noreferrer"
							className={buttonVariants({ variant: "ghost", size: "xs" })}
						>
							Ver no diário
							<ExternalLinkIcon />
						</a>
					)}
				</div>
			</SheetHeader>

			<div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
				{isError && (
					<div className="flex flex-col items-start gap-3">
						<div className="flex items-center gap-2 text-sm text-destructive">
							<TriangleAlertIcon className="size-4" />
							Não foi possível carregar o texto desta publicação.
						</div>
						<Button variant="outline" size="sm" onClick={() => refetch()}>
							Tentar de novo
						</Button>
					</div>
				)}

				{!data && !isError && (
					<div className="flex max-w-[68ch] flex-col gap-2.5">
						{BODY_SKELETON_WIDTHS.map((width, index) => (
							<Skeleton key={index} className={cn("h-3.5", width)} />
						))}
					</div>
				)}

				{!!data && (
					<article className="max-w-[68ch] text-sm leading-relaxed whitespace-pre-line text-foreground/90">
						{data.textPlain}
					</article>
				)}
			</div>
		</>
	);
}
