import { Link } from "@tanstack/react-router";
import { ArrowUpRightIcon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";
import { Chip, Quote, SectionRule, SourceLink } from "@/components/dossier";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { actDate, shortDate, STATUS_LABELS } from "@/lib/deadline-meta";
import { formatCnj } from "@/lib/format";
import {
	countLabel,
	EFFECT_LABELS,
	EVIDENCE_KIND_LABELS,
	EVIDENCE_PRODUCER_LABELS,
	EVIDENCE_STAGE_LABELS,
	OUTCOME_LABELS,
	RELATION_KIND_LABELS,
	RELATION_STATE_LABELS,
	SPECIES_LABELS,
} from "@/lib/legal-labels";
import { CalcTrail } from "./calc-trail";
import type { HubData } from "./queries";

export function HubWarnings({ warnings }: { warnings: string[] }) {
	if (warnings.length === 0) {
		return null;
	}

	return (
		<ul className="mt-4 flex flex-col gap-2 rounded-[3px] border border-border bg-muted/40 p-3">
			{warnings.map((warning) => (
				<li key={warning} className="flex gap-2 text-xs leading-relaxed">
					<TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
					{warning}
				</li>
			))}
		</ul>
	);
}

export function HubMotive({ data }: { data: HubData }) {
	const [full, setFull] = useState(false);

	if (!data.motive) {
		return (
			<section>
				<SectionRule title="Por causa de quê" />
				<p className="mt-3 max-w-[70ch] text-xs leading-relaxed text-muted-foreground">
					Este prazo não veio de uma publicação: foi criado à mão ou a partir de um movimento do
					processo. Sem publicação de origem não há documento para abrir.
				</p>
			</section>
		);
	}

	return (
		<section>
			<SectionRule title="Por causa de quê">
				<SourceLink href={data.motive.link} label="Abrir no diário oficial" />
			</SectionRule>

			<div className="mt-3 flex flex-wrap items-center gap-2">
				<Chip>{data.motive.documentType ?? data.motive.communicationType ?? "Publicação"}</Chip>
				<span className="font-mono text-2xs text-muted-foreground tabular-nums">
					{shortDate(data.motive.availableAt)}
				</span>
				{!!data.motive.orgName && (
					<span className="text-2xs text-muted-foreground">{data.motive.orgName}</span>
				)}
			</div>

			{!full && (
				<>
					<div className="mt-2.5">
						<Quote>{data.deadline.snippet ?? data.motive.excerpt}</Quote>
					</div>
					<Button
						variant="ghost"
						size="xs"
						className="mt-1.5 text-muted-foreground"
						onClick={() => setFull(true)}
					>
						Ler a publicação inteira
					</Button>
				</>
			)}

			{full && (
				<>
					<p className="mt-2.5 max-w-[70ch] text-[0.8125rem] leading-relaxed whitespace-pre-line text-foreground/90">
						{data.motive.textPlain}
					</p>
					<Button
						variant="ghost"
						size="xs"
						className="mt-1.5 text-muted-foreground"
						onClick={() => setFull(false)}
					>
						Recolher
					</Button>
				</>
			)}
		</section>
	);
}

export function HubCalc({ data }: { data: HubData }) {
	if (!data.deadline.calculation) {
		return null;
	}

	return (
		<section>
			<SectionRule title="Como cheguei nessa data" />
			<div className="mt-4">
				<CalcTrail calculation={data.deadline.calculation} />
			</div>
		</section>
	);
}

export function HubEvidenceBlock({ data }: { data: HubData }) {
	if (data.evidence.length === 0) {
		return null;
	}

	return (
		<section>
			<SectionRule
				title="Provas do processo"
				count={countLabel(data.evidence.length, "prova", "provas")}
			/>
			<ul className="mt-3 flex flex-col gap-2">
				{data.evidence.map((item) => (
					<li
						key={item.id}
						className={cn(
							"rounded-[3px] border border-border bg-card px-3 py-2.5",
							item.fromThisAct && "border-l-2 border-l-primary",
						)}
					>
						<div className="flex flex-wrap items-center gap-1.5">
							<span className="text-[0.8125rem] font-medium">
								{EVIDENCE_KIND_LABELS[item.kind]}
							</span>
							<Chip>{EVIDENCE_STAGE_LABELS[item.stage]}</Chip>
							<Chip tone="mute">{EVIDENCE_PRODUCER_LABELS[item.producedBy]}</Chip>
							<span className="font-mono text-2xs text-muted-foreground tabular-nums">
								{actDate(item.availableAt ?? item.occurredAt)}
							</span>
							{item.fromThisAct && <Chip tone="accent">deste ato</Chip>}
						</div>

						<div className="mt-2">
							<Quote>{item.snippet}</Quote>
						</div>

						<div className="mt-2">
							<SourceLink href={item.link} label="Abrir o documento" />
						</div>
					</li>
				))}
			</ul>
		</section>
	);
}

export function HubDecisionsBlock({ data }: { data: HubData }) {
	if (data.decisions.length === 0) {
		return null;
	}

	return (
		<section>
			<SectionRule
				title="Decisões anteriores"
				count={countLabel(data.decisions.length, "decisão", "decisões")}
			/>
			<ul className="mt-3 flex flex-col gap-2">
				{data.decisions.map((item) => (
					<li
						key={item.id}
						className={cn(
							"rounded-[3px] border border-border bg-card px-3 py-2.5",
							item.fromThisAct && "border-l-2 border-l-primary",
						)}
					>
						<div className="flex flex-wrap items-center gap-1.5">
							<span className="text-[0.8125rem] font-medium">{SPECIES_LABELS[item.species]}</span>
							{!!item.outcome && <Chip tone="accent">{OUTCOME_LABELS[item.outcome]}</Chip>}
							{item.effects.map((effect) => (
								<Chip key={effect} tone="mute">
									{EFFECT_LABELS[effect]}
								</Chip>
							))}
							<span className="font-mono text-2xs text-muted-foreground tabular-nums">
								{actDate(item.availableAt ?? item.decidedAt)}
							</span>
							{item.fromThisAct && <Chip tone="accent">deste ato</Chip>}
						</div>

						<div className="mt-2">
							<Quote>{item.snippet}</Quote>
						</div>

						<div className="mt-2">
							<SourceLink href={item.link} label="Abrir a publicação" />
						</div>
					</li>
				))}
			</ul>
		</section>
	);
}

export function HubSatellites({ data }: { data: HubData }) {
	if (data.satellites.length === 0) {
		return null;
	}

	return (
		<section>
			<SectionRule
				title="Satélites do processo"
				count={countLabel(data.satellites.length, "vínculo", "vínculos")}
			/>
			<ul className="mt-3 flex flex-col gap-2">
				{data.satellites.map((item) => (
					<li
						key={item.id}
						className={cn(
							"flex flex-wrap items-center gap-2 rounded-[3px] border border-border bg-card px-3 py-2",
							item.suspensiveEffect === true && "border-l-2 border-l-primary",
						)}
					>
						<Chip tone="accent">{RELATION_KIND_LABELS[item.kind]}</Chip>
						{!!item.state && <Chip>{RELATION_STATE_LABELS[item.state]}</Chip>}
						{item.suspensiveEffect === true && <Chip tone="accent">efeito suspensivo</Chip>}

						{item.counterpart.inScope && (
							<Link
								to="/processos/$cnj"
								params={{ cnj: item.counterpart.cnjNumber }}
								className="group inline-flex items-center gap-1"
							>
								<span className="num-cnj underline decoration-border underline-offset-2 transition-colors group-hover:decoration-foreground">
									{formatCnj(item.counterpart.cnjNumber)}
								</span>
								<ArrowUpRightIcon className="size-3 text-muted-foreground" />
							</Link>
						)}

						{!item.counterpart.inScope && (
							<span className="num-cnj text-muted-foreground">
								{formatCnj(item.counterpart.cnjNumber)}
							</span>
						)}
					</li>
				))}
			</ul>
		</section>
	);
}

export function HubHistory({ data }: { data: HubData }) {
	if (data.history.length === 0) {
		return null;
	}

	return (
		<section>
			<SectionRule
				title="Outros prazos deste processo"
				count={countLabel(data.history.length, "prazo", "prazos")}
			/>
			<ul className="mt-3 flex flex-col gap-1">
				{data.history.map((item) => (
					<li key={item.id}>
						<Link
							to="/prazos/$deadlineId"
							params={{ deadlineId: item.id }}
							className="group flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-[3px] px-2 py-1.5 transition-colors hover:bg-accent/50"
						>
							<span className="font-mono text-2xs text-muted-foreground tabular-nums">
								{shortDate(item.dueAt)}
							</span>
							<span className="text-[0.8125rem]">{item.title}</span>
							<Chip tone="mute">{STATUS_LABELS[item.status]}</Chip>
							{item.audience === "terceiro" && <Chip tone="mute">de terceiro</Chip>}
							{!!item.note && <span className="text-2xs text-muted-foreground">{item.note}</span>}
							<ArrowUpRightIcon className="ml-auto size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
						</Link>
					</li>
				))}
			</ul>
		</section>
	);
}
