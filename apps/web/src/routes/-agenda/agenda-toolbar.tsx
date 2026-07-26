import { CalendarDaysIcon, LayersIcon, ListIcon, SearchIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { AgendaFilters } from "./agenda-filters";
import type { DeadlineSummary } from "./queries";
import {
	type AgendaPreset,
	type AgendaSearch,
	type AgendaSearchPatch,
	type AgendaView,
	presetOf,
	tabOf,
	viewOf,
} from "./search";

const PRESETS: { key: AgendaPreset; label: string; badge?: keyof DeadlineSummary }[] = [
	{ key: "acao", label: "Minha ação", badge: "actionable" },
	{ key: "todos", label: "Todos" },
	{ key: "vencidos", label: "Vencidos", badge: "overdue" },
	{ key: "hoje", label: "Hoje", badge: "today" },
	{ key: "semana", label: "7 dias", badge: "next7" },
];

const VIEWS: { key: AgendaView; label: string; icon: typeof ListIcon }[] = [
	{ key: "calendario", label: "Calendário", icon: CalendarDaysIcon },
	{ key: "lista", label: "Lista", icon: ListIcon },
	{ key: "situacao", label: "Situação", icon: LayersIcon },
];

const CHIP_CLASS =
	"shrink-0 cursor-pointer rounded-full border px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:px-2.5 sm:py-1 sm:text-2xs";

const CHIP_ON = "border-primary bg-primary/10 text-foreground";

const CHIP_OFF = "border-border text-muted-foreground hover:text-foreground";

export function AgendaToolbar({
	search,
	summary,
	onChange,
	onClear,
}: {
	search: AgendaSearch;
	summary: DeadlineSummary | undefined;
	onChange: (patch: AgendaSearchPatch) => void;
	onClear: () => void;
}) {
	const tab = tabOf(search);
	const preset = presetOf(search);
	const view = viewOf(search);

	return (
		<>
			{/* No celular os chips correm na horizontal em vez de quebrarem em duas linhas: cada linha de
			    ferramenta come 40px de uma tela de 844px, e o que ela precisa ver é o prazo. */}
			<div className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-2.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-4">
				{PRESETS.map((item) => (
					<button
						key={item.key}
						type="button"
						aria-pressed={tab === "prazos" && preset === item.key}
						className={cn(CHIP_CLASS, tab === "prazos" && preset === item.key ? CHIP_ON : CHIP_OFF)}
						onClick={() =>
							onChange({ aba: undefined, filtro: item.key === "acao" ? undefined : item.key })
						}
					>
						{item.label}
						{!!item.badge && !!summary?.[item.badge] && (
							<span className="ml-1 font-mono tabular-nums">{summary[item.badge]}</span>
						)}
					</button>
				))}

				<button
					type="button"
					aria-pressed={tab === "revisar"}
					className={cn(CHIP_CLASS, "sm:ml-auto", tab === "revisar" ? CHIP_ON : CHIP_OFF)}
					onClick={() => onChange({ aba: "revisar" })}
				>
					A revisar
					{!!summary?.pendingReview && (
						<span className="ml-1 font-mono tabular-nums">{summary.pendingReview}</span>
					)}
				</button>
			</div>

			<div className="flex items-center gap-2 px-4 pb-3">
				<div
					role="group"
					aria-label="Vista da agenda"
					className="flex shrink-0 items-center gap-0.5 rounded-md border border-border p-0.5"
				>
					{VIEWS.map((item) => (
						<button
							key={item.key}
							type="button"
							aria-pressed={view === item.key}
							className={cn(
								"flex h-9 cursor-pointer items-center gap-1.5 rounded-sm px-2.5 text-2xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring sm:h-auto sm:px-2 sm:py-1",
								view === item.key
									? "bg-primary/12 text-primary dark:bg-primary/20"
									: "text-muted-foreground hover:text-foreground",
							)}
							onClick={() =>
								onChange({
									aba: undefined,
									dia: undefined,
									vista: item.key === "calendario" ? undefined : item.key,
								})
							}
						>
							<item.icon className="size-3.5" />
							<span className="hidden sm:inline">{item.label}</span>
						</button>
					))}
				</div>

				<SearchField key={search.q ?? ""} value={search.q} onChange={onChange} />

				<AgendaFilters search={search} onChange={onChange} onClear={onClear} />
			</div>
		</>
	);
}

function SearchField({
	value,
	onChange,
}: {
	value: string | undefined;
	onChange: (patch: AgendaSearchPatch) => void;
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
				placeholder="Buscar ato, trecho ou CNJ"
				aria-label="Buscar na agenda"
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
