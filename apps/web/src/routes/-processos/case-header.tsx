import { Link } from "@tanstack/react-router";
import { CheckIcon, ChevronLeftIcon, CopyIcon, LockIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { MetaList } from "@/components/dossier";
import { Button } from "@/components/ui/button";
import { formatCnj, formatEventDate, formatPersonName } from "@/lib/format";
import { countLabel, grauLabel, poloLabel } from "@/lib/legal-labels";
import type { CaseDetail } from "./queries";
import { dateOfItem, isPublication } from "./timeline-data";

const COPIED_FEEDBACK_MS = 1600;

function Identity({ detail }: { detail: CaseDetail }) {
	const parts = [
		detail.case.orgJudgingName ?? detail.case.orgName,
		grauLabel(detail.case.grau),
		detail.case.systemName,
		detail.case.filedAt
			? `distribuído em ${new Date(detail.case.filedAt).toLocaleDateString("pt-BR")}`
			: null,
	].filter((value): value is string => !!value);

	if (parts.length === 0) {
		return null;
	}

	return (
		<p className="mt-1.5 max-w-[76ch] text-sm leading-snug text-muted-foreground">
			<MetaList items={parts} />
		</p>
	);
}

export function CaseHeader({ detail }: { detail: CaseDetail }) {
	const [copied, setCopied] = useState(false);
	const formatted = formatCnj(detail.case.cnjNumber);
	const publications = detail.timeline.filter(isPublication);
	const unread = publications.filter((item) => !item.publication.readAt).length;
	const latest = detail.timeline.at(0);
	const subjects = (detail.case.subjects ?? [])
		.map((subject) => subject.nome)
		.filter((value) => !!value);

	async function copyNumber() {
		try {
			await navigator.clipboard.writeText(formatted);
			setCopied(true);
			setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
		} catch {
			toast.error("Não foi possível copiar o número do processo.");
		}
	}

	return (
		<header>
			<Link
				to="/processos"
				className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
			>
				<ChevronLeftIcon className="size-3.5" />
				Processos
			</Link>

			<div className="mt-3 flex flex-wrap items-center gap-2">
				<span className="tag-tribunal">{detail.case.tribunal}</span>
				<span className="num-cnj text-[0.9375rem] font-medium">{formatted}</span>
				<Button
					variant="ghost"
					size="icon-xs"
					className="text-muted-foreground"
					aria-label="Copiar número do processo"
					onClick={copyNumber}
				>
					{!copied && <CopyIcon />}
					{copied && <CheckIcon className="text-primary" />}
				</Button>
				{!!detail.case.secrecyLevel && detail.case.secrecyLevel > 0 && (
					<span className="inline-flex items-center gap-1 text-2xs text-muted-foreground">
						<LockIcon className="size-3" />
						sigilo nível {detail.case.secrecyLevel}
					</span>
				)}
			</div>

			<h1 className="mt-2 text-[1.375rem] leading-tight font-semibold tracking-[-0.02em]">
				{formatPersonName(detail.case.className ?? "Classe não informada")}
			</h1>

			<Identity detail={detail} />

			{subjects.length > 0 && (
				<p className="mt-2 max-w-[76ch] text-xs leading-relaxed text-muted-foreground">
					<span className="text-2xs tracking-[0.1em] uppercase">Assunto </span>
					{subjects.join(", ")}
				</p>
			)}

			{detail.parties.length > 0 && (
				<dl className="mt-4 grid gap-x-4 gap-y-1.5 sm:grid-cols-[7.5rem_minmax(0,1fr)]">
					{detail.parties.map((party) => (
						<div key={party.id} className="contents">
							<dt className="text-2xs tracking-[0.1em] text-muted-foreground uppercase sm:pt-[3px]">
								{poloLabel(party.polo)}
							</dt>
							<dd className="text-sm leading-snug break-words">{formatPersonName(party.name)}</dd>
						</div>
					))}
				</dl>
			)}

			<div className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-muted-foreground tabular-nums">
				<span>{countLabel(detail.timeline.length, "andamento", "andamentos")}</span>
				<span aria-hidden className="size-[3px] rounded-full bg-border" />
				<span>{countLabel(publications.length, "publicação", "publicações")}</span>
				{unread > 0 && (
					<>
						<span aria-hidden className="size-[3px] rounded-full bg-border" />
						<span className="font-medium text-foreground">
							{countLabel(unread, "não lida", "não lidas")}
						</span>
					</>
				)}
				{!!latest && (
					<>
						<span aria-hidden className="size-[3px] rounded-full bg-border" />
						<span>Última movimentação {formatEventDate(dateOfItem(latest))}</span>
					</>
				)}
			</div>
		</header>
	);
}
