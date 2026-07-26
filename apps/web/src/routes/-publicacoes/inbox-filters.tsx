import { useQuery } from "@tanstack/react-query";
import { format, startOfYear, subDays } from "date-fns";
import {
	CalendarDaysIcon,
	ChevronDownIcon,
	FilterXIcon,
	LandmarkIcon,
	MailOpenIcon,
	SearchIcon,
	XIcon,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { usePublicationFloor } from "@/hooks/use-history-cutoff";
import { tribunaisQueryOptions } from "@/hooks/use-tribunais";
import { cn } from "@/lib/cn";
import { shortDate } from "./publication-meta";
import { hasFilters, type InboxFilterPatch, type InboxSearch } from "./search";

const ALL_TRIBUNAIS = "todos";
const PRESET_DAYS = [7, 30, 90];
const ISO_DATE = "yyyy-MM-dd";

const ACTIVE_CLASS =
	"border-primary/45 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary dark:bg-primary/15 dark:hover:bg-primary/20";

const PRESET_ITEM_CLASS =
	"rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none";

export function InboxFilters({
	search,
	onChange,
	onClear,
}: {
	search: InboxSearch;
	onChange: (patch: InboxFilterPatch) => void;
	onClear: () => void;
}) {
	return (
		<div className="flex flex-wrap items-center gap-1.5">
			<SearchField key={search.q ?? ""} value={search.q} onChange={onChange} />

			<Button
				variant="outline"
				size="sm"
				aria-pressed={!!search.unread}
				className={cn("gap-1.5", !!search.unread && ACTIVE_CLASS)}
				onClick={() => onChange({ unread: search.unread ? undefined : true })}
			>
				<MailOpenIcon className="size-3.5" />
				Só não lidas
			</Button>

			<TribunalFilter value={search.tribunal} onChange={onChange} />

			<PeriodFilter
				from={search.from}
				to={search.to}
				historico={search.historico}
				onChange={onChange}
			/>

			{hasFilters(search) && (
				<Button
					variant="ghost"
					size="sm"
					className="gap-1.5 text-muted-foreground"
					onClick={onClear}
				>
					<FilterXIcon className="size-3.5" />
					Limpar
				</Button>
			)}
		</div>
	);
}

function SearchField({
	value,
	onChange,
}: {
	value: string | undefined;
	onChange: (patch: InboxFilterPatch) => void;
}) {
	const [draft, setDraft] = useState(value ?? "");

	// O campo é text-base no celular de propósito: abaixo de 16px o Safari do iPhone dá zoom na página
	// inteira quando ela toca para buscar, e a tela sai de lugar.
	return (
		<form
			className="relative flex min-w-0 flex-1 items-center sm:max-w-64"
			onSubmit={(event) => {
				event.preventDefault();
				onChange({ q: draft.trim() || undefined });
			}}
		>
			<SearchIcon className="pointer-events-none absolute left-2 size-3.5 text-muted-foreground" />

			<input
				type="search"
				value={draft}
				maxLength={200}
				placeholder="Buscar teor, vara ou CNJ"
				aria-label="Buscar nas publicações"
				className="h-10 w-full rounded-md border border-border bg-background pr-7 pl-7 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:h-8 sm:text-xs dark:bg-input/30"
				onChange={(event) => setDraft(event.target.value)}
			/>

			{!!draft && (
				<Button
					type="button"
					variant="ghost"
					size="icon-xs"
					aria-label="Limpar busca"
					className="absolute right-0.5 text-muted-foreground"
					onClick={() => {
						setDraft("");
						onChange({ q: undefined });
					}}
				>
					<XIcon />
				</Button>
			)}
		</form>
	);
}

function TribunalFilter({
	value,
	onChange,
}: {
	value: string | undefined;
	onChange: (patch: InboxFilterPatch) => void;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm" className={cn("gap-1.5", !!value && ACTIVE_CLASS)}>
					<LandmarkIcon className="size-3.5" />
					{!value && "Tribunal"}
					{!!value && <span className="font-mono text-xs tracking-tight">{value}</span>}
					<ChevronDownIcon className="size-3 opacity-60" />
				</Button>
			</DropdownMenuTrigger>

			<DropdownMenuContent align="start" className="w-44">
				<TribunalOptions value={value} onChange={onChange} />
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function TribunalOptions({
	value,
	onChange,
}: {
	value: string | undefined;
	onChange: (patch: InboxFilterPatch) => void;
}) {
	const { data, isError } = useQuery(tribunaisQueryOptions);

	if (isError) {
		return (
			<p className="px-2 py-1.5 text-xs leading-relaxed text-muted-foreground">
				Não foi possível carregar os tribunais. Feche e abra este menu para tentar de novo.
			</p>
		);
	}

	if (!data) {
		return (
			<div className="flex flex-col gap-2 p-2">
				<Skeleton className="h-3.5 w-20" />
				<Skeleton className="h-3.5 w-14" />
				<Skeleton className="h-3.5 w-16" />
			</div>
		);
	}

	return (
		<DropdownMenuRadioGroup
			value={value ?? ALL_TRIBUNAIS}
			onValueChange={(next) => onChange({ tribunal: next === ALL_TRIBUNAIS ? undefined : next })}
		>
			<DropdownMenuRadioItem value={ALL_TRIBUNAIS} className="text-xs">
				Todos os tribunais
			</DropdownMenuRadioItem>

			{data.map((sigla) => (
				<DropdownMenuRadioItem key={sigla} value={sigla} className="font-mono text-xs">
					{sigla}
				</DropdownMenuRadioItem>
			))}
		</DropdownMenuRadioGroup>
	);
}

function periodLabel({
	from,
	to,
	historico,
	cutoff,
}: {
	from: string | undefined;
	to: string | undefined;
	historico: true | undefined;
	cutoff: string | undefined;
}) {
	if (historico) {
		return "Todo o histórico";
	}

	if (from && to) {
		return `${shortDate(from)} a ${shortDate(to)}`;
	}

	if (from) {
		return `Desde ${shortDate(from)}`;
	}

	if (to) {
		return `Até ${shortDate(to)}`;
	}

	if (cutoff) {
		return `Desde ${shortDate(cutoff)}`;
	}

	return "Período";
}

function PeriodFilter({
	from,
	to,
	historico,
	onChange,
}: {
	from: string | undefined;
	to: string | undefined;
	historico: true | undefined;
	onChange: (patch: InboxFilterPatch) => void;
}) {
	const cutoff = usePublicationFloor();
	const active = !!from || !!to || !!historico;

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button variant="outline" size="sm" className={cn("gap-1.5", active && ACTIVE_CLASS)}>
					<CalendarDaysIcon className="size-3.5" />
					{periodLabel({ from, to, historico, cutoff })}
					<ChevronDownIcon className="size-3 opacity-60" />
				</Button>
			</PopoverTrigger>

			<PopoverContent align="start" className="w-[21rem] p-2">
				<div className="flex flex-col">
					{PRESET_DAYS.map((days) => (
						<button
							key={days}
							type="button"
							className={PRESET_ITEM_CLASS}
							onClick={() =>
								onChange({
									from: format(subDays(new Date(), days), ISO_DATE),
									to: undefined,
									historico: undefined,
								})
							}
						>
							Últimos {days} dias
						</button>
					))}

					<button
						type="button"
						className={PRESET_ITEM_CLASS}
						onClick={() =>
							onChange({
								from: format(startOfYear(new Date()), ISO_DATE),
								to: undefined,
								historico: undefined,
							})
						}
					>
						Este ano
					</button>

					<button
						type="button"
						className={PRESET_ITEM_CLASS}
						onClick={() => onChange({ from: undefined, to: undefined, historico: true })}
					>
						Todo o histórico
					</button>
				</div>

				<Separator className="my-2" />

				<div className="grid grid-cols-2 gap-2">
					<label className="flex flex-col gap-1 text-2xs tracking-[0.12em] text-muted-foreground uppercase">
						De
						<Input
							type="date"
							value={from ?? ""}
							max={to}
							className="h-8 px-2 text-xs [color-scheme:light] dark:[color-scheme:dark]"
							onChange={(event) =>
								onChange({ from: event.target.value || undefined, historico: undefined })
							}
						/>
					</label>

					<label className="flex flex-col gap-1 text-2xs tracking-[0.12em] text-muted-foreground uppercase">
						Até
						<Input
							type="date"
							value={to ?? ""}
							min={from}
							className="h-8 px-2 text-xs [color-scheme:light] dark:[color-scheme:dark]"
							onChange={(event) =>
								onChange({ to: event.target.value || undefined, historico: undefined })
							}
						/>
					</label>
				</div>

				{active && (
					<Button
						variant="ghost"
						size="xs"
						className="mt-2 w-full text-muted-foreground"
						onClick={() => onChange({ from: undefined, to: undefined, historico: undefined })}
					>
						Limpar período
					</Button>
				)}

				{!active && !!cutoff && (
					<p className="mt-2 text-2xs leading-relaxed text-muted-foreground">
						Sem período escolhido, a lista começa em {shortDate(cutoff)}. O que saiu antes disso
						está em Todo o histórico.
					</p>
				)}
			</PopoverContent>
		</Popover>
	);
}
