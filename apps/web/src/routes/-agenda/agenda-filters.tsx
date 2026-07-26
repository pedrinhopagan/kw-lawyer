import { LEGAL_DEADLINES } from "@api/features/deadlines/catalog";
import { FilterXIcon, SlidersHorizontalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { useHistoryCutoff } from "@/hooks/use-history-cutoff";
import { tribunaisQueryOptions } from "@/hooks/use-tribunais";
import { cn } from "@/lib/cn";
import { AUDIENCE_CHOICES, CONFIDENCE_CHOICES, ORIGIN_CHOICES, pluralOf } from "./agenda-meta";
import { shortDate, STATUS_LABELS } from "@/lib/deadline-meta";
import {
	activeFilterCount,
	ALL_AUDIENCES,
	ALL_CONFIDENCES,
	ALL_ORIGINS,
	ALL_STATUSES,
	type AgendaSearch,
	type AgendaSearchPatch,
	toggled,
} from "./search";

const ACT_OPTIONS = LEGAL_DEADLINES.map((act) => ({ value: act.key, label: act.label })).sort(
	(first, second) => first.label.localeCompare(second.label, "pt-BR"),
);

const GROUP_LABEL_CLASS = "text-2xs font-medium tracking-[0.12em] text-muted-foreground uppercase";

const ROW_CLASS =
	"flex cursor-pointer items-center gap-2 rounded-sm px-1 py-1 text-xs transition-colors focus-within:bg-accent hover:bg-accent";

const DATE_INPUT_CLASS = "h-8 px-2 text-xs [color-scheme:light] dark:[color-scheme:dark]";

function CheckGroup<Value extends string>({
	label,
	options,
	selected,
	onToggle,
}: {
	label: string;
	options: { value: Value; label: string }[];
	selected: Value[] | undefined;
	onToggle: (value: Value) => void;
}) {
	return (
		<fieldset className="flex flex-col gap-1">
			<legend className={cn(GROUP_LABEL_CLASS, "mb-1")}>{label}</legend>

			<div className="flex flex-col">
				{options.map((option) => (
					<label key={option.value} className={ROW_CLASS}>
						<Checkbox
							checked={!!selected?.includes(option.value)}
							onCheckedChange={() => onToggle(option.value)}
						/>
						<span className="leading-snug">{option.label}</span>
					</label>
				))}
			</div>
		</fieldset>
	);
}

function TribunalGroup({
	selected,
	onToggle,
}: {
	selected: string[] | undefined;
	onToggle: (value: string) => void;
}) {
	const { data, isError } = useQuery(tribunaisQueryOptions);

	if (isError) {
		return (
			<p className="text-xs leading-relaxed text-muted-foreground">
				Não foi possível carregar os tribunais. Feche e abra este painel para tentar de novo.
			</p>
		);
	}

	if (!data) {
		return (
			<div className="flex flex-col gap-2">
				<Skeleton className="h-3.5 w-20" />
				<Skeleton className="h-3.5 w-14" />
				<Skeleton className="h-3.5 w-16" />
			</div>
		);
	}

	return (
		<CheckGroup
			label="Tribunal"
			options={data.map((sigla) => ({ value: sigla, label: sigla }))}
			selected={selected}
			onToggle={onToggle}
		/>
	);
}

function HistoryToggle({
	historico,
	onChange,
}: {
	historico: true | undefined;
	onChange: (patch: AgendaSearchPatch) => void;
}) {
	const cutoff = useHistoryCutoff();

	if (!cutoff) {
		return null;
	}

	return (
		<label className={ROW_CLASS}>
			<Checkbox
				checked={!!historico}
				onCheckedChange={() => onChange({ historico: historico ? undefined : true })}
			/>
			<span className="leading-snug">Incluir prazos anteriores a {shortDate(cutoff)}</span>
		</label>
	);
}

export function AgendaFilters({
	search,
	onChange,
	onClear,
}: {
	search: AgendaSearch;
	onChange: (patch: AgendaSearchPatch) => void;
	onClear: () => void;
}) {
	const active = activeFilterCount(search);

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					className={cn(
						"h-10 shrink-0 gap-1.5 px-3 sm:h-8",
						active > 0 &&
							"border-primary/45 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary dark:bg-primary/15 dark:hover:bg-primary/20",
					)}
				>
					<SlidersHorizontalIcon className="size-3.5" />
					{/* No celular a palavra sai da tela mas fica no nome acessível: `aria-label` no botão
					    engoliria o contador de filtros ativos que vem logo depois. */}
					<span className="sr-only sm:not-sr-only">Filtros</span>
					{active > 0 && <span className="font-mono text-2xs tabular-nums">{active}</span>}
				</Button>
			</PopoverTrigger>

			<PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
				<div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto p-3">
					<CheckGroup
						label="Situação"
						options={ALL_STATUSES.map((status) => ({
							value: status,
							label: STATUS_LABELS[status],
						}))}
						selected={search.status}
						onToggle={(value) => onChange({ status: toggled(search.status, value) })}
					/>

					<Separator />

					<CheckGroup
						label="De quem é o prazo"
						options={ALL_AUDIENCES.map((audience) => ({
							value: audience,
							label: AUDIENCE_CHOICES[audience],
						}))}
						selected={search.audiencia}
						onToggle={(value) => onChange({ audiencia: toggled(search.audiencia, value) })}
					/>

					<Separator />

					<CheckGroup
						label="Confiança da leitura"
						options={ALL_CONFIDENCES.map((confidence) => ({
							value: confidence,
							label: CONFIDENCE_CHOICES[confidence],
						}))}
						selected={search.confianca}
						onToggle={(value) => onChange({ confianca: toggled(search.confianca, value) })}
					/>

					<Separator />

					<CheckGroup
						label="Origem"
						options={ALL_ORIGINS.map((origin) => ({
							value: origin,
							label: ORIGIN_CHOICES[origin],
						}))}
						selected={search.origem}
						onToggle={(value) => onChange({ origem: toggled(search.origem, value) })}
					/>

					<Separator />

					<CheckGroup
						label="Ato"
						options={ACT_OPTIONS}
						selected={search.ato}
						onToggle={(value) => onChange({ ato: toggled(search.ato, value) })}
					/>

					<Separator />

					<TribunalGroup
						selected={search.tribunais}
						onToggle={(value) => onChange({ tribunais: toggled(search.tribunais, value) })}
					/>

					<Separator />

					<div className="flex flex-col gap-2">
						<p className={GROUP_LABEL_CLASS}>Vencimento entre</p>

						<div className="grid grid-cols-2 gap-2">
							<label className="flex flex-col gap-1 text-2xs text-muted-foreground">
								De
								<Input
									type="date"
									value={search.de ?? ""}
									max={search.ate}
									className={DATE_INPUT_CLASS}
									onChange={(event) => onChange({ de: event.target.value || undefined })}
								/>
							</label>

							<label className="flex flex-col gap-1 text-2xs text-muted-foreground">
								Até
								<Input
									type="date"
									value={search.ate ?? ""}
									min={search.de}
									className={DATE_INPUT_CLASS}
									onChange={(event) => onChange({ ate: event.target.value || undefined })}
								/>
							</label>
						</div>

						<HistoryToggle historico={search.historico} onChange={onChange} />
					</div>
				</div>

				{active > 0 && (
					<div className="border-t border-border p-2">
						<Button
							variant="ghost"
							size="sm"
							className="w-full gap-1.5 text-muted-foreground"
							onClick={onClear}
						>
							<FilterXIcon className="size-3.5" />
							Limpar {active} filtro{pluralOf(active)}
						</Button>
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}
