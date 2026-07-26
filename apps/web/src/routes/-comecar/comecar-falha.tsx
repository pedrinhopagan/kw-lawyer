import { useQuery } from "@tanstack/react-query";
import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { syncStatusQueryOptions, useStartSync } from "../-shell/sync";
import { SYNC_UNKNOWN_FAILURE } from "../-shell/sync-view";

export function ComecarFalha() {
	const status = useQuery(syncStatusQueryOptions);
	const startSync = useStartSync();

	const message = status.data?.run?.errorMessage ?? SYNC_UNKNOWN_FAILURE;

	return (
		<div className="rounded-lg border border-border bg-card p-6">
			<span className="tag-tribunal text-destructive">
				<TriangleAlertIcon className="mr-1 size-3" />
				carga interrompida
			</span>

			<h1 className="mt-3 text-[1.375rem] font-semibold leading-tight tracking-[-0.02em]">
				A primeira carga não terminou
			</h1>
			<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
				Nada do que já foi baixado se perdeu. Tentar de novo retoma de onde parou, sem repetir o que
				já está no banco.
			</p>

			<div className="my-5 h-px bg-border" />

			<p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 font-mono text-2xs leading-relaxed text-muted-foreground">
				{message}
			</p>

			<Button
				type="button"
				size="lg"
				className="mt-5 w-full"
				disabled={startSync.isPending}
				onClick={() => startSync.mutate({ force: false })}
			>
				<RefreshCwIcon />
				Tentar de novo
			</Button>
		</div>
	);
}
