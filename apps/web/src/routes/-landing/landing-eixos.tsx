import { FileSearchIcon, GavelIcon, LayersIcon, UndoDotIcon } from "lucide-react";

const AXES = [
	{
		icon: FileSearchIcon,
		title: "Provas",
		body: "O que já foi produzido no processo, com o documento de origem a um clique.",
	},
	{
		icon: GavelIcon,
		title: "Decisões",
		body: "O que o juízo decidiu, na ordem em que decidiu, com o teor da publicação que trouxe a decisão.",
	},
	{
		icon: UndoDotIcon,
		title: "Recorrer",
		body: "O que é recorrível agora: cabimento, prazo e a peça de onde a contagem partiu.",
	},
	{
		icon: LayersIcon,
		title: "Agravos",
		body: "Os incidentes que correm ao lado do principal e costumam sumir do radar.",
	},
];

export function LandingEixos() {
	return (
		<section className="border-b border-border bg-sidebar/40">
			<div className="mx-auto grid w-full max-w-6xl gap-12 px-5 py-20 lg:grid-cols-[22rem_minmax(0,1fr)] lg:gap-16">
				<div>
					<span className="font-mono text-2xs uppercase tracking-[0.18em] text-muted-foreground">
						os quatro eixos
					</span>

					<h2 className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.03em]">
						Nenhuma tela que só lista
					</h2>

					<p className="mt-4 text-sm leading-relaxed text-muted-foreground">
						Todo processo abre em quatro eixos de trabalho. Cada um responde a mesma pergunta: e
						agora, o que eu faço? Documento sem link para o original é entrega incompleta.
					</p>
				</div>

				<ul className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
					{AXES.map((axis) => (
						<li key={axis.title} className="flex flex-col gap-3 bg-card p-6">
							<axis.icon className="size-4 text-primary" />
							<h3 className="text-sm font-semibold tracking-[-0.01em]">{axis.title}</h3>
							<p className="text-xs leading-relaxed text-muted-foreground">{axis.body}</p>
						</li>
					))}
				</ul>
			</div>
		</section>
	);
}
