import { ArrowRightIcon, DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStartSync } from "../-shell/sync";

const STEPS = [
	{
		source: "DJEN",
		text: "Todas as publicações já saídas no nome das suas inscrições, do começo ao dia de hoje.",
	},
	{
		source: "DataJud",
		text: "Os andamentos de cada processo encontrado, para o painel saber em que pé cada um está.",
	},
	{
		source: "Prazos",
		text: "A leitura dos atos, que transforma o que é intimação em prazo com data e cabimento.",
	},
];

export function ComecarConvite() {
	const startSync = useStartSync();

	return (
		<div className="rounded-lg border border-border bg-card p-6">
			<span className="tag-tribunal">
				<DownloadIcon className="mr-1 size-3" />
				primeira carga
			</span>

			<h1 className="mt-3 text-[1.375rem] font-semibold leading-tight tracking-[-0.02em]">
				Antes do painel, o histórico
			</h1>
			<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
				Este painel não consulta o tribunal a cada tela que você abre. Ele baixa de uma vez só o
				histórico inteiro das suas inscrições e guarda tudo. É uma carga grande: dependendo de
				quantos processos existem no seu nome, ela leva alguns minutos. Depois dela, agenda,
				processos e prazos abrem na hora, e cada atualização traz só o que chegou de novo.
			</p>

			<div className="my-5 h-px bg-border" />

			<ul className="flex flex-col gap-3">
				{STEPS.map((step) => (
					<li key={step.source} className="flex items-start gap-3">
						<span className="tag-tribunal mt-0.5 shrink-0">{step.source}</span>
						<span className="min-w-0 text-2xs leading-relaxed text-muted-foreground">
							{step.text}
						</span>
					</li>
				))}
			</ul>

			<Button
				type="button"
				size="lg"
				className="mt-6 w-full"
				disabled={startSync.isPending}
				onClick={() => startSync.mutate({ force: false })}
			>
				Começar
				<ArrowRightIcon />
			</Button>

			<p className="mt-3 text-center text-2xs leading-relaxed text-muted-foreground">
				A carga roda no servidor. Se você fechar a aba, ela continua sozinha.
			</p>
		</div>
	);
}
