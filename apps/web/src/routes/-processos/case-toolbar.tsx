import { useQuery } from "@tanstack/react-query";
import { SearchIcon, XIcon } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { tribunalOptionsQueryOptions } from "./queries";
import { type CasesSearch, SEARCH_DEBOUNCE_MS } from "./search";

const ALL_TRIBUNALS = "todos";

export function CaseToolbar({
	term,
	setTerm,
	tribunal,
	onChange,
	onClear,
}: {
	term: string;
	setTerm: (value: string) => void;
	tribunal?: string;
	onChange: (next: Partial<CasesSearch>) => void;
	onClear: () => void;
}) {
	const [open, setOpen] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const options = useQuery({ ...tribunalOptionsQueryOptions, enabled: open });

	function cancelPending() {
		if (!timer.current) {
			return;
		}

		clearTimeout(timer.current);
	}

	function commit(value: string) {
		cancelPending();
		onChange({ q: value.trim(), page: undefined });
	}

	function handleChange(value: string) {
		setTerm(value);
		cancelPending();
		timer.current = setTimeout(() => commit(value), SEARCH_DEBOUNCE_MS);
	}

	function clearAll() {
		cancelPending();
		onClear();
	}

	return (
		<div className="flex flex-wrap items-center gap-2">
			<form
				className="relative min-w-[15rem] flex-1"
				onSubmit={(event) => {
					event.preventDefault();
					commit(term);
				}}
			>
				<SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
				<Input
					value={term}
					onChange={(event) => handleChange(event.target.value)}
					placeholder="Buscar por número do processo ou nome da parte"
					aria-label="Buscar processos"
					autoComplete="off"
					className="h-9 pr-9 pl-8"
				/>
				{!!term && (
					<Button
						type="button"
						variant="ghost"
						size="icon-xs"
						aria-label="Limpar busca"
						className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground"
						onClick={() => {
							setTerm("");
							commit("");
						}}
					>
						<XIcon />
					</Button>
				)}
			</form>

			<Select
				value={tribunal ?? ALL_TRIBUNALS}
				onOpenChange={setOpen}
				onValueChange={(value) => {
					onChange({
						tribunal: value === ALL_TRIBUNALS ? undefined : value,
						page: undefined,
					});
				}}
			>
				<SelectTrigger className="h-9 w-[11.5rem]" aria-label="Filtrar por tribunal">
					<SelectValue>
						{!!tribunal && <span className="font-mono text-xs tracking-[0.06em]">{tribunal}</span>}
						{!tribunal && <span className="text-sm">Todos os tribunais</span>}
					</SelectValue>
				</SelectTrigger>
				<SelectContent align="end" className="max-h-72">
					<SelectItem value={ALL_TRIBUNALS}>Todos os tribunais</SelectItem>
					{options.data?.map((option) => (
						<SelectItem key={option.tribunal} value={option.tribunal}>
							<span className="font-mono text-xs tracking-[0.06em]">{option.tribunal}</span>
							<span className="text-2xs text-muted-foreground tabular-nums">{option.total}</span>
						</SelectItem>
					))}
					{options.isLoading && (
						<p className="px-2 py-1.5 text-xs text-muted-foreground">Lendo seus tribunais</p>
					)}
				</SelectContent>
			</Select>

			{(!!term || !!tribunal) && (
				<Button variant="ghost" size="sm" className="text-muted-foreground" onClick={clearAll}>
					Limpar filtros
				</Button>
			)}
		</div>
	);
}
